//! New sidebar entities share the save exclusion and never borrow renderer paths as grants.
use super::WindowServices;
use document_service::{DocumentMetadata, RenameKind};
use file_index::{CreatedWorkspaceEntry, Workspace};

pub(crate) struct CreationRenameResult {
    pub entry: Option<CreatedWorkspaceEntry>,
    pub metadata: Vec<(String, Vec<DocumentMetadata>)>,
    pub uncertain: Vec<(String, Vec<String>)>,
    pub confirmed_paths: Option<(std::path::PathBuf, std::path::PathBuf)>,
}

impl WindowServices {
    pub(crate) fn create_workspace_entry(
        &self,
        label: &str,
        workspace_id: &str,
        operation_id: &str,
        parent: &str,
        kind: file_index::EntryKind,
        extension: &str,
    ) -> Result<CreatedWorkspaceEntry, String> {
        self.mutate_workspace(label, workspace_id, |workspace| {
            let known = workspace
                .creation_operation_known(operation_id)
                .map_err(|error| error.to_string())?;
            let result = workspace.create_untitled(operation_id, parent, kind, extension);
            if !known {
                self.clear_file_undo();
            }
            result.map_err(|error| error.to_string())
        })
    }
    pub(crate) fn open_workspace_document(
        &self,
        label: &str,
        workspace_id: &str,
        relative: &str,
        extension: Option<&str>,
    ) -> Result<document_service::DocumentPayload, String> {
        self.mutate_document(label, |documents| {
            let workspace = self
                .get_workspaces(label)?
                .lock()
                .map_err(|_| "目录状态不可用")?
                .get(workspace_id)
                .map_err(|error| error.to_string())?;
            workspace
                .open_document_with_extension(relative, documents, extension)
                .map_err(|error| error.to_string())
        })
    }

    pub(crate) fn mutate_workspace<T>(
        &self,
        label: &str,
        workspace_id: &str,
        operation: impl FnOnce(&Workspace) -> Result<T, String>,
    ) -> Result<T, String> {
        let _gate = self.write_gate.lock().map_err(|_| "文件服务不可用")?;
        let registry = self.get_workspaces(label)?;
        let retained = registry;
        let registry = retained.lock().map_err(|_| "目录状态不可用")?;
        let workspace = registry.get(workspace_id).map_err(|e| e.to_string())?;
        if !self.is_current_workspaces(label, &retained) {
            return Err("编辑窗口已关闭或未注册".into());
        }
        operation(&workspace)
    }

    pub(crate) fn close_workspace(&self, label: &str, workspace_id: &str) -> Result<(), String> {
        let _gate = self.write_gate.lock().map_err(|_| "文件服务不可用")?;
        self.get_workspaces(label)?
            .lock()
            .map_err(|_| "目录状态不可用")?
            .close(workspace_id);
        Ok(())
    }

    /// Lock order: global write gate, snapshot windows (release map), documents
    /// by label, registries by label. Never wait for document IO with map held.
    pub(crate) fn rename_workspace_creation(
        &self,
        label: &str,
        workspace_id: &str,
        token: &str,
        new_name: &str,
    ) -> Result<CreationRenameResult, String> {
        self.rename_creation_with_snapshot_hook(label, workspace_id, token, new_name, || {})
    }

    fn rename_creation_with_snapshot_hook(
        &self,
        label: &str,
        workspace_id: &str,
        token: &str,
        new_name: &str,
        after_snapshot: impl FnOnce(),
    ) -> Result<CreationRenameResult, String> {
        let _gate = self.write_gate.lock().map_err(|_| "文件服务不可用")?;
        let mut windows: Vec<_> = self
            .windows
            .lock()
            .map_err(|_| "窗口服务不可用")?
            .iter()
            .map(|(label, services)| {
                (
                    label.clone(),
                    services.documents.clone(),
                    services.workspaces.clone(),
                )
            })
            .collect();
        windows.sort_by(|a, b| a.0.cmp(&b.0));
        after_snapshot();
        let own = windows
            .iter()
            .position(|entry| entry.0 == label)
            .ok_or("编辑窗口已关闭或未注册")?;
        let mut documents = windows
            .iter()
            .map(|entry| {
                entry
                    .1
                    .try_lock()
                    .map_err(|_| "文档正在操作，请重试新条目命名".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()?;
        let registries = windows
            .iter()
            .map(|entry| {
                entry
                    .2
                    .try_lock()
                    .map_err(|_| "目录正在操作，请重试新条目命名".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()?;
        let workspace = registries[own]
            .get(workspace_id)
            .map_err(|e| e.to_string())?;
        let rename = workspace
            .prepare_creation_rename(token, new_name)
            .map_err(|e| e.to_string())?;
        let kind = match rename.kind() {
            file_index::EntryKind::File => RenameKind::File,
            file_index::EntryKind::Directory => RenameKind::Directory,
        };
        let undo = if rename.old_display_path() != rename.new_display_path() {
            Some(super::file_undo::PreparedRenameUndo::prepare(
                &self.authorities,
                rename.directory(),
                rename.old_display_path(),
                rename.new_display_path(),
                rename.kind(),
                rename.source_identity(),
            )?)
        } else {
            None
        };
        if kind == RenameKind::Directory {
            let directory = rename
                .directory()
                .open_dir(rename.old_name())
                .map_err(|e| e.to_string())?;
            for registry in &registries {
                if registry.has_root_within(rename.old_display_path())
                    || registry
                        .has_root_directory(&directory)
                        .map_err(|e| e.to_string())?
                {
                    return Err("该新建目录已在另一个窗口中打开，请先关闭该目录再命名".into());
                }
            }
        }
        let plans = documents
            .iter_mut()
            .map(|service| {
                service
                    .prepare_rename(
                        rename.directory(),
                        rename.old_name(),
                        rename.new_name(),
                        rename.old_display_path(),
                        rename.new_display_path(),
                        kind,
                    )
                    .map_err(|e| e.to_string())
            })
            .collect::<Result<Vec<_>, _>>()?;
        // Reservation can register a window while holding a workspace registry.
        // register/remove must therefore never take write_gate. After acquiring
        // all document/registry guards, revalidate the whole snapshot and retain
        // the map only across the syscall + in-memory commit (no IPC/callbacks).
        let live = self.windows.lock().map_err(|_| "窗口服务不可用")?;
        if live.len() != windows.len()
            || windows.iter().any(|(label, docs, registries)| {
                !live.get(label).is_some_and(|current| {
                    std::sync::Arc::ptr_eq(&current.documents, docs)
                        && std::sync::Arc::ptr_eq(&current.workspaces, registries)
                })
            })
        {
            return Err("窗口会话已更换，请重试新条目命名".into());
        }
        let confirmed_paths = (kind == RenameKind::File).then(|| {
            (
                rename.old_display_path().to_owned(),
                rename.new_display_path().to_owned(),
            )
        });
        let entry = match workspace.commit_creation_rename(rename) {
            Ok(entry) => entry,
            Err(file_index::IndexError::MutationUncertain) => {
                self.clear_file_undo();
                let uncertain = windows
                    .iter()
                    .zip(plans)
                    .map(|(window, plan)| (window.0.clone(), plan.revoke()))
                    .filter(|(_, ids)| !ids.is_empty())
                    .collect();
                return Ok(CreationRenameResult {
                    entry: None,
                    metadata: vec![],
                    uncertain,
                    confirmed_paths: None,
                });
            }
            Err(error) => return Err(error.to_string()),
        };
        let metadata = windows
            .iter()
            .zip(plans)
            .map(|(window, plan)| (window.0.clone(), plan.commit()))
            .filter(|(_, changed)| !changed.is_empty())
            .collect();
        drop(live);
        if let Some(undo) = undo {
            if let Err(error) = undo.commit().and_then(|undo| self.record_file_undo(undo)) {
                self.clear_file_undo();
                eprintln!("Created entry renamed, but file Undo was not established: {error}");
            }
        }
        Ok(CreationRenameResult {
            entry: Some(entry),
            metadata,
            uncertain: vec![],
            confirmed_paths,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use file_index::EntryKind;
    use std::{fs, sync::Arc};

    #[test]
    fn closed_window_lost_creation_ack_cannot_mutate_a_new_registration() {
        let root = tempfile::tempdir().unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        let old_registry = services.get_workspaces("main").unwrap();
        let old = old_registry
            .lock()
            .unwrap()
            .select_authorized(root.path())
            .unwrap();
        let operation = uuid::Uuid::new_v4().to_string();
        let receipt = services
            .create_workspace_entry("main", &old.id, &operation, "", EntryKind::File, "md")
            .unwrap();
        let entity = root.path().join(&receipt.relative_path);
        fs::write(&entity, b"own draft").unwrap();
        services.remove("main").unwrap();
        assert!(services
            .create_workspace_entry("main", &old.id, &operation, "", EntryKind::File, "md")
            .is_err());
        services.register("main").unwrap();
        let current = services
            .get_workspaces("main")
            .unwrap()
            .lock()
            .unwrap()
            .select_authorized(root.path())
            .unwrap();
        assert_ne!(current.id, old.id);
        assert!(services
            .create_workspace_entry("main", &old.id, &operation, "", EntryKind::File, "md")
            .is_err());
        assert!(services
            .rename_workspace_creation("main", &current.id, &receipt.entry_token, "Revived.md")
            .is_err());
        assert!(old_registry.lock().unwrap().get(&old.id).is_err());
        assert_eq!(fs::read(entity).unwrap(), b"own draft");
        assert!(!root.path().join("Revived.md").exists());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }

    fn create(
        services: &WindowServices,
        workspace: &str,
        kind: EntryKind,
    ) -> CreatedWorkspaceEntry {
        services
            .mutate_workspace("main", workspace, |scope| {
                scope
                    .create_untitled(&uuid::Uuid::new_v4().to_string(), "", kind, "md")
                    .map_err(|e| e.to_string())
            })
            .unwrap()
    }

    #[test]
    fn creation_rename_rebinds_both_window_sessions_without_reopening_source() {
        let root = tempfile::tempdir().unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-other").unwrap();
        let selected = services
            .get_workspaces("main")
            .unwrap()
            .lock()
            .unwrap()
            .select_authorized(root.path())
            .unwrap();
        let created = create(&services, &selected.id, EntryKind::File);
        let old_path = root.path().join(&created.relative_path);
        let raw = b"\xef\xbb\xbf# Heading\r\n\r\nAlpha  \n";
        // Editing the same new inode externally does not change its creation identity.
        fs::write(&old_path, raw).unwrap();
        let first = services
            .get_documents("main")
            .unwrap()
            .lock()
            .unwrap()
            .open_authorized(&old_path)
            .unwrap();
        let other = services
            .get_documents("editor-other")
            .unwrap()
            .lock()
            .unwrap()
            .open_authorized(&old_path)
            .unwrap();
        let result = services
            .rename_workspace_creation(
                "main",
                &selected.id,
                &created.entry_token,
                "中文 renamed.md",
            )
            .unwrap();
        assert_eq!(result.metadata.len(), 2);
        assert_eq!(result.entry.unwrap().name, "中文 renamed.md");
        assert!(!old_path.exists());
        let new_path = root.path().join("中文 renamed.md");
        assert_eq!(fs::read(&new_path).unwrap(), raw);
        for (label, document) in [("main", &first), ("editor-other", &other)] {
            let service = services.get_documents(label).unwrap();
            let service = service.lock().unwrap();
            let metadata = service.get_metadata(&document.id).unwrap();
            assert_eq!(metadata.id, document.id);
            assert_eq!(
                metadata.path,
                fs::canonicalize(&new_path).unwrap().to_string_lossy()
            );
            assert_eq!(metadata.metadata_revision, 1);
        }
        fs::write(&old_path, raw).unwrap();
        services
            .write_document("main", |service| service.save(&first.id, "first dirty\r\n"))
            .unwrap();
        assert_eq!(fs::read(&old_path).unwrap(), raw);
        assert_eq!(fs::read(&new_path).unwrap(), b"\xef\xbb\xbffirst dirty\r\n");
        assert!(services
            .write_document("editor-other", |service| service
                .save(&other.id, "other dirty"))
            .is_err());
        assert_eq!(fs::read(&new_path).unwrap(), b"\xef\xbb\xbffirst dirty\r\n");
    }

    #[test]
    fn mounted_new_folder_or_foreign_window_token_is_not_renamed() {
        let root = tempfile::tempdir().unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-other").unwrap();
        let selected = services
            .get_workspaces("main")
            .unwrap()
            .lock()
            .unwrap()
            .select_authorized(root.path())
            .unwrap();
        let created = create(&services, &selected.id, EntryKind::Directory);
        let folder = root.path().join(&created.relative_path);
        let other_registry = services.get_workspaces("editor-other").unwrap();
        other_registry
            .lock()
            .unwrap()
            .select_authorized(&folder)
            .unwrap();
        assert!(services
            .rename_workspace_creation("editor-other", &selected.id, &created.entry_token, "Wrong")
            .is_err());
        assert!(services
            .rename_workspace_creation("main", &selected.id, &created.entry_token, "Renamed")
            .is_err());
        assert!(folder.is_dir());
        assert!(!root.path().join("Renamed").exists());
        services.close_workspace("main", &selected.id).unwrap();
        assert!(services
            .rename_workspace_creation("main", &selected.id, &created.entry_token, "Wrong")
            .is_err());
    }

    #[test]
    fn conflict_preserves_pending_name_and_both_source_sessions() {
        let root = tempfile::tempdir().unwrap();
        let services = Arc::new(WindowServices::default());
        services.register("main").unwrap();
        let selected = services
            .get_workspaces("main")
            .unwrap()
            .lock()
            .unwrap()
            .select_authorized(root.path())
            .unwrap();
        let created = create(&services, &selected.id, EntryKind::File);
        let old_path = root.path().join(&created.relative_path);
        let opened = services
            .get_documents("main")
            .unwrap()
            .lock()
            .unwrap()
            .open_authorized(&old_path)
            .unwrap();
        fs::write(root.path().join("existing.md"), b"keep").unwrap();
        assert!(services
            .rename_workspace_creation("main", &selected.id, &created.entry_token, "existing.md")
            .is_err());
        assert_eq!(fs::read(root.path().join("existing.md")).unwrap(), b"keep");
        assert_eq!(
            services
                .get_documents("main")
                .unwrap()
                .lock()
                .unwrap()
                .get_metadata(&opened.id)
                .unwrap()
                .metadata_revision,
            0
        );
        services
            .rename_workspace_creation("main", &selected.id, &created.entry_token, "retry.md")
            .unwrap();
        assert!(root.path().join("retry.md").is_file());
    }

    #[test]
    fn new_or_reincarnated_window_snapshot_is_rejected_before_disk_commit() {
        for reincarnate in [false, true] {
            let root = tempfile::tempdir().unwrap();
            let services = WindowServices::default();
            services.register("main").unwrap();
            let selected = services
                .get_workspaces("main")
                .unwrap()
                .lock()
                .unwrap()
                .select_authorized(root.path())
                .unwrap();
            let created = create(&services, &selected.id, EntryKind::File);
            let result = services.rename_creation_with_snapshot_hook(
                "main",
                &selected.id,
                &created.entry_token,
                "stale.md",
                || {
                    if reincarnate {
                        services.remove("main").unwrap();
                        services.register("main").unwrap();
                    } else {
                        services.register("editor-new").unwrap();
                    }
                },
            );
            assert!(result.is_err());
            assert!(root.path().join(&created.relative_path).is_file());
            assert!(!root.path().join("stale.md").exists());
        }
    }

    #[test]
    fn busy_document_or_registry_releases_the_batch_without_waiting_or_mutating() {
        for documents_busy in [false, true] {
            let root = tempfile::tempdir().unwrap();
            let services = WindowServices::default();
            services.register("main").unwrap();
            services.register("editor-other").unwrap();
            let selected = services
                .get_workspaces("main")
                .unwrap()
                .lock()
                .unwrap()
                .select_authorized(root.path())
                .unwrap();
            let created = create(&services, &selected.id, EntryKind::File);
            let document_service = services.get_documents("editor-other").unwrap();
            let registry = services.get_workspaces("editor-other").unwrap();
            let document_guard = documents_busy.then(|| document_service.lock().unwrap());
            let registry_guard = (!documents_busy).then(|| registry.lock().unwrap());
            assert!(services
                .rename_workspace_creation("main", &selected.id, &created.entry_token, "Busy.md")
                .is_err());
            assert!(root.path().join(&created.relative_path).is_file());
            assert!(!root.path().join("Busy.md").exists());
            drop(document_guard);
            drop(registry_guard);
            services
                .rename_workspace_creation("main", &selected.id, &created.entry_token, "Ready.md")
                .unwrap();
            assert!(root.path().join("Ready.md").is_file());
        }
    }
}
