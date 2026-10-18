//! Window-local capabilities. Lookup never implicitly creates a new session.
mod entry_actions;
pub(crate) use entry_actions::{EntryActionKind, EntryActionResolution, EntryActionStart};
mod entry_move;
mod entry_rename;
pub(crate) use entry_move::{EntryMoveRequest, EntryMoveResult};
pub(crate) use entry_rename::{EntryRenameRequest, EntryRenameResult};
mod file_undo;
mod mutations;
mod perform_file_undo;
pub(crate) use perform_file_undo::UndoChanges;
mod trash_diagnostic;
mod trash_entry;
mod trash_operations;
use crate::commands::{workspaces::Workspaces, Documents};
pub(crate) use file_undo::{
    FileUndoReceipt, FileUndoRequest, FileUndoResolution, FileUndoSnapshot,
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
pub(crate) use trash_entry::{TrashRestoreChanges, TrashResult, TrashStart};
pub(crate) use trash_operations::{TrashReceipt, TrashRequest, TrashResolution};

#[derive(Default)]
pub struct WindowServices {
    windows: Mutex<HashMap<String, Services>>,
    write_gate: Arc<Mutex<()>>,
    authorities: Arc<document_service::DocumentAuthorities>,
    file_undo: Mutex<file_undo::FileUndoStore>,
    trash_operations: Mutex<trash_operations::TrashOperations>,
}
struct Services {
    documents: Documents,
    workspaces: Workspaces,
    editor_commands: crate::editor_commands::EditorCommandState,
    entry_actions: Arc<Mutex<entry_actions::EntryActions>>,
}
impl WindowServices {
    pub(crate) fn with_file_lane<T>(
        &self,
        operation: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let _gate = self.write_gate.lock().map_err(|_| "文件服务不可用")?;
        operation()
    }
    pub fn register(&self, label: &str) -> Result<(), String> {
        let mut windows = self.windows.lock().map_err(|_| "窗口服务不可用")?;
        if windows.contains_key(label) {
            return Err("窗口服务已注册".into());
        }
        windows.insert(
            label.to_owned(),
            Services {
                documents: Arc::new(Mutex::new(
                    document_service::DocumentService::with_authorities(Arc::clone(
                        &self.authorities,
                    )),
                )),
                workspaces: Arc::new(Mutex::new(file_index::WorkspaceRegistry::default())),
                editor_commands: Default::default(),
                entry_actions: Default::default(),
            },
        );
        Ok(())
    }
    pub fn contains(&self, label: &str) -> bool {
        self.windows
            .lock()
            .is_ok_and(|windows| windows.contains_key(label))
    }
    pub(crate) fn is_current_workspaces(&self, label: &str, registry: &Workspaces) -> bool {
        self.windows.lock().is_ok_and(|windows| {
            windows
                .get(label)
                .is_some_and(|current| Arc::ptr_eq(&current.workspaces, registry))
        })
    }
    pub fn get_documents(&self, label: &str) -> Result<Documents, String> {
        self.windows
            .lock()
            .map_err(|_| "窗口服务不可用")?
            .get(label)
            .map(|services| Arc::clone(&services.documents))
            .ok_or_else(|| "编辑窗口已关闭或未注册".into())
    }
    pub fn get_workspaces(&self, label: &str) -> Result<Workspaces, String> {
        self.windows
            .lock()
            .map_err(|_| "窗口服务不可用")?
            .get(label)
            .map(|services| Arc::clone(&services.workspaces))
            .ok_or_else(|| "编辑窗口已关闭或未注册".into())
    }
    pub(crate) fn with_editor_commands<T>(
        &self,
        label: &str,
        operation: impl FnOnce(&mut crate::editor_commands::EditorCommandState) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut windows = self.windows.lock().map_err(|_| "窗口服务不可用")?;
        let services = windows.get_mut(label).ok_or("编辑窗口已关闭或未注册")?;
        operation(&mut services.editor_commands)
    }
    /// Serialize native document writes across windows, preserving the former
    /// application-wide compare-before-replace exclusion without sharing IDs.
    /// Never hold this gate while displaying a dialog or waiting on frontend IO.
    pub fn write_document<T>(
        &self,
        label: &str,
        operation: impl FnOnce(
            &mut document_service::DocumentService,
        ) -> Result<T, document_service::DocumentError>,
    ) -> Result<T, String> {
        self.mutate_document(label, |documents| {
            operation(documents).map_err(|error| error.to_string())
        })
    }

    /// Opening/accepting a native identity and publishing an atomic save share
    /// the same lane as rename. Dialogs and frontend waits remain outside it.
    pub(crate) fn mutate_document<T>(
        &self,
        label: &str,
        operation: impl FnOnce(&mut document_service::DocumentService) -> Result<T, String>,
    ) -> Result<T, String> {
        let _gate = self.write_gate.lock().map_err(|_| "保存服务不可用")?;
        let retained = self.get_documents(label)?;
        let mut documents = retained.lock().map_err(|_| "文档状态不可用")?;
        if !self.windows.lock().is_ok_and(|windows| {
            windows
                .get(label)
                .is_some_and(|current| Arc::ptr_eq(&current.documents, &retained))
        }) {
            return Err("编辑窗口已关闭或未注册".into());
        }
        operation(&mut documents)
    }
    pub fn remove(&self, label: &str) -> Result<(), String> {
        let removed = self
            .windows
            .lock()
            .map_err(|_| "窗口服务不可用")?
            .remove(label);
        if let Some(services) = removed {
            // Clear retained Arc capabilities as well: registered image tokens,
            // document handles and watchers must not survive their window.
            *services.documents.lock().map_err(|_| "文档状态不可用")? = Default::default();
            *services.workspaces.lock().map_err(|_| "目录状态不可用")? = Default::default();
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use document_service::{DocumentError, DocumentWatch};
    use std::{fs, sync::mpsc, time::Duration};

    #[test]
    fn window_capabilities_cannot_cross_and_removal_revokes_retained_handles() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("note.md"), "original").unwrap();
        fs::write(
            temp.path().join("image.svg"),
            r#"<svg xmlns="http://www.w3.org/2000/svg"/>"#,
        )
        .unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-second").unwrap();
        assert!(services.register("main").is_err());
        let first = services.get_documents("main").unwrap();
        let second = services.get_documents("editor-second").unwrap();
        let a = first
            .lock()
            .unwrap()
            .open_authorized(&temp.path().join("note.md"))
            .unwrap();
        let b = second
            .lock()
            .unwrap()
            .open_authorized(&temp.path().join("note.md"))
            .unwrap();
        assert!(matches!(
            second.lock().unwrap().save(&a.id, "bad"),
            Err(DocumentError::UnknownDocument)
        ));
        let image = first
            .lock()
            .unwrap()
            .resolve_image(&a.id, "image.svg")
            .unwrap();
        assert!(second.lock().unwrap().image(&image.token).is_none());
        let ws = services.get_workspaces("main").unwrap();
        let workspace = ws.lock().unwrap().select_authorized(temp.path()).unwrap();
        assert!(services
            .get_workspaces("editor-second")
            .unwrap()
            .lock()
            .unwrap()
            .get(&workspace.id)
            .is_err());
        services.remove("main").unwrap();
        assert!(!services.contains("main"));
        assert!(services.get_documents("main").is_err());
        assert!(first.lock().unwrap().image(&image.token).is_none());
        assert!(first.lock().unwrap().authorized_path(&a.id).is_err());
        assert!(ws.lock().unwrap().get(&workspace.id).is_err());
        second
            .lock()
            .unwrap()
            .save(&b.id, "second remains")
            .unwrap();
        assert_eq!(
            fs::read_to_string(temp.path().join("note.md")).unwrap(),
            "second remains"
        );
    }
    #[test]
    fn same_file_sessions_still_compare_disk_before_save() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("note.md");
        fs::write(&path, "original").unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-second").unwrap();
        let a = services.get_documents("main").unwrap();
        let b = services.get_documents("editor-second").unwrap();
        let first = a.lock().unwrap().open_authorized(&path).unwrap();
        let second = b.lock().unwrap().open_authorized(&path).unwrap();
        a.lock().unwrap().save(&first.id, "first change").unwrap();
        assert!(matches!(
            b.lock().unwrap().save(&second.id, "second change"),
            Err(DocumentError::ExternalChange)
        ));
        assert_eq!(fs::read_to_string(&path).unwrap(), "first change");
    }
    #[test]
    fn concurrent_window_saves_share_compare_and_replace_gate() {
        use std::{sync::Barrier, thread};
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("note.md");
        fs::write(&path, "original").unwrap();
        let services = Arc::new(WindowServices::default());
        services.register("main").unwrap();
        services.register("editor-second").unwrap();
        let first = services
            .get_documents("main")
            .unwrap()
            .lock()
            .unwrap()
            .open_authorized(&path)
            .unwrap();
        let second = services
            .get_documents("editor-second")
            .unwrap()
            .lock()
            .unwrap()
            .open_authorized(&path)
            .unwrap();
        let barrier = Arc::new(Barrier::new(3));
        let tasks: Vec<_> = [
            ("main", first.id, "first change"),
            ("editor-second", second.id, "second change"),
        ]
        .into_iter()
        .map(|(label, id, text)| {
            let services = Arc::clone(&services);
            let barrier = Arc::clone(&barrier);
            thread::spawn(move || {
                barrier.wait();
                services.write_document(label, |documents| documents.save(&id, text))
            })
        })
        .collect();
        barrier.wait();
        let results: Vec<_> = tasks.into_iter().map(|task| task.join().unwrap()).collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        let error = results
            .iter()
            .find_map(|result| result.as_ref().err())
            .unwrap();
        assert_eq!(error, &DocumentError::ExternalChange.to_string());
        let saved = results
            .iter()
            .find_map(|result| result.as_ref().ok())
            .unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), saved.text);
    }
    #[test]
    fn closing_one_window_stops_only_its_native_watcher() {
        let temp = tempfile::tempdir().unwrap();
        let a_path = temp.path().join("a.md");
        let b_path = temp.path().join("b.md");
        fs::write(&a_path, "a").unwrap();
        fs::write(&b_path, "b").unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-second").unwrap();
        let a = services.get_documents("main").unwrap();
        let b = services.get_documents("editor-second").unwrap();
        let first = a.lock().unwrap().open_authorized(&a_path).unwrap();
        let second = b.lock().unwrap().open_authorized(&b_path).unwrap();
        let (tx, rx) = mpsc::channel();
        for (label, docs, id) in [("main", &a, &first.id), ("editor-second", &b, &second.id)] {
            let tx = tx.clone();
            let status = docs
                .lock()
                .unwrap()
                .start_document_watch(
                    id,
                    Arc::new(move |hint| {
                        let _ = tx.send((label, hint));
                    }),
                )
                .unwrap();
            assert!(matches!(status, DocumentWatch::Watching { .. }));
        }
        services.remove("main").unwrap();
        fs::write(&a_path, "a changed").unwrap();
        fs::write(&b_path, "b changed").unwrap();
        let (label, hint) = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert_eq!(label, "editor-second");
        assert_eq!(hint.id, second.id);
        while let Ok((label, _)) = rx.recv_timeout(Duration::from_millis(400)) {
            assert_eq!(label, "editor-second");
        }
    }
}
