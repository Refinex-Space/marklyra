//! Native entry actions accept only an inspection token, never an ambient path.
use super::*;
use crate::window_services::{EntryActionKind, EntryActionResolution, EntryActionStart};
use document_service::{DirectoryBookmark, DocumentService};
use file_index::EntryKind;
use serde::Deserialize;
use std::path::PathBuf;

pub(crate) enum Dispatch {
    Path(PathBuf),
    Window(crate::windows::ReservedEditorWindow),
    ReuseFolder(DirectoryBookmark, Workspaces),
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntryEditorSnapshot {
    document_id: Option<String>,
    text: String,
    saved_text: String,
}
impl EntryEditorSnapshot {
    fn validate(&self) -> Result<(), String> {
        document_service::validate_text(&self.text).map_err(|e| e.to_string())?;
        document_service::validate_text(&self.saved_text).map_err(|e| e.to_string())?;
        Ok(())
    }
    fn empty_untitled(&self) -> bool {
        self.document_id.is_none() && self.text.is_empty() && self.saved_text.is_empty()
    }
    fn draft_for_entry(
        &self,
        documents: &DocumentService,
        entry: &file_index::InspectedEntryAction,
        baseline: &str,
    ) -> Result<Option<(String, String)>, String> {
        self.validate()?;
        let Some(id) = &self.document_id else {
            return Ok(None);
        };
        let metadata = documents.get_metadata(id).map_err(|e| e.to_string())?;
        if metadata.path != entry.display_path().to_string_lossy() {
            return Ok(None);
        }
        documents
            .validate_entry_identity(id, entry.source_identity().as_ref())
            .map_err(|e| e.to_string())?;
        if baseline != self.saved_text {
            return Err("文稿保存基线已变化，当前草稿未替换".into());
        }
        Ok((self.text != self.saved_text).then(|| (self.text.clone(), self.saved_text.clone())))
    }
}
#[tauri::command]
pub async fn perform_workspace_entry_action(
    app: AppHandle,
    window: WebviewWindow,
    workspace_id: String,
    entry_token: String,
    operation_id: String,
    action: EntryActionKind,
    editor_snapshot: Option<EntryEditorSnapshot>,
) -> Result<EntryActionResolution, String> {
    require_window(&window)?;
    let label = window.label().to_owned();
    let worker = app.clone();
    let source_window = window.clone();
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        require_window(&source_window)?;
        let services = worker.state::<WindowServices>();
        let ticket = match services.begin_entry_action(
            &label,
            &workspace_id,
            &entry_token,
            &operation_id,
            action,
        )? {
            EntryActionStart::Resolved(state) => return Ok(Err(state)),
            EntryActionStart::Ready(ticket) => ticket,
        };
        let dispatch = services.prepare_entry_dispatch(&ticket, |workspace, entry| {
            require_window(&source_window)?;
            if let Some(snapshot) = &editor_snapshot {
                snapshot.validate()?;
                if action != EntryActionKind::OpenNew {
                    return Err("此文件动作不接受编辑快照".into());
                }
            }
            match action {
                EntryActionKind::Move => Err("移动必须使用专用文件事务入口".into()),
                EntryActionKind::OpenNew => {
                    let entry = entry.ok_or("目录根不支持此动作")?;
                    let target = if entry.kind() == EntryKind::Directory {
                        let dir = cap_std::fs::Dir::from_std_file(
                            entry
                                .source()
                                .try_clone()
                                .map_err(|e| e.to_string())?
                                .into_std(),
                        );
                        let bookmark = DirectoryBookmark::capture(&dir, entry.display_path())
                            .map_err(|e| e.to_string())?;
                        if editor_snapshot
                            .as_ref()
                            .is_some_and(EntryEditorSnapshot::empty_untitled)
                            && worker
                                .state::<crate::startup::StartupHost>()
                                .can_reuse_untitled(&label)?
                        {
                            return Ok(Dispatch::ReuseFolder(
                                bookmark,
                                services.get_workspaces(&label)?,
                            ));
                        }
                        crate::startup::StartupTarget::from_workspace(bookmark)?
                    } else {
                        let mut documents = DocumentService::new();
                        let opened = documents
                            .open_in_directory(
                                entry.directory(),
                                entry.name(),
                                entry.display_path().to_path_buf(),
                            )
                            .map_err(|e| e.to_string())?;
                        let document = documents.bookmark(&opened.id).map_err(|e| e.to_string())?;
                        let mut target = crate::startup::StartupTarget::from_document(
                            document,
                            workspace.bookmark().map_err(|e| e.to_string())?,
                        )?;
                        if let Some(snapshot) = &editor_snapshot {
                            let source = services.get_documents(&label)?;
                            let source = source.lock().map_err(|_| "文档状态不可用")?;
                            if let Some((text, saved)) =
                                snapshot.draft_for_entry(&source, entry, &opened.text)?
                            {
                                target = target.with_draft(text, saved)?;
                            }
                        }
                        target
                    };
                    Ok(Dispatch::Window(crate::windows::reserve_editor_window(
                        &worker,
                        Some(target),
                    )?))
                }
                #[cfg(not(any(target_os = "macos", windows)))]
                EntryActionKind::Info => Err("此平台尚未接通系统显示简介".into()),
                _ => Ok(Dispatch::Path(match entry {
                    Some(entry) => entry.display_path().to_owned(),
                    None if action == EntryActionKind::CopyPath => workspace
                        .bookmark()
                        .map_err(|e| e.to_string())?
                        .path()
                        .to_owned(),
                    None => return Err("目录根不支持此动作".into()),
                })),
            }
        });
        Ok::<_, String>(match dispatch {
            Ok(dispatch) => Ok((ticket, dispatch)),
            Err(message) => Err(services.reject_entry_action(ticket, message)),
        })
    })
    .await
    .map_err(|_| "文件动作预检任务未完成")??;
    let (ticket, dispatch) = match prepared {
        Ok(ready) => ready,
        Err(state) => return Ok(state),
    };
    // No file lane is held during native dispatch. Closing the opener cannot
    // turn a failed reply into permission to replay or attach a new generation.
    if let Err(message) = require_window(&window)
        .and_then(|()| app.state::<WindowServices>().validate_entry_owner(&ticket))
    {
        return Ok(app
            .state::<WindowServices>()
            .reject_entry_action(ticket, message));
    }
    let result = match dispatch {
        Dispatch::ReuseFolder(bookmark, registry) => {
            let services = app.state::<WindowServices>();
            let history = app.state::<crate::file_preferences::FilePreferencesHost>();
            let history_ticket = history
                .prepare_folder_history(&app, history.history_request())
                .unwrap_or_else(|error| {
                    eprintln!("Reused directory history was not prepared: {error}");
                    None
                });
            let reused = services.with_file_lane(|| {
                if !services.is_current_workspaces(window.label(), &registry) {
                    return Err("目录动作所属窗口已更换".into());
                }
                if !app
                    .state::<crate::startup::StartupHost>()
                    .can_reuse_untitled(window.label())?
                {
                    return Err("当前窗口已有文稿，目录挂载未替换".into());
                }
                let workspace = registry
                    .lock()
                    .map_err(|_| "目录状态不可用")?
                    .restore_bookmark(&bookmark)
                    .map_err(|e| e.to_string())?;
                if !services.is_current_workspaces(window.label(), &registry) {
                    return Err("目录结果所属窗口已关闭或更换".into());
                }
                Ok(workspace)
            });
            return Ok(match reused {
                Ok(workspace) => {
                    let host = app.state::<crate::file_preferences::FilePreferencesHost>();
                    if let Err(error) = host.remember_workspace(&app, &bookmark, history_ticket) {
                        eprintln!("Reused directory history was not recorded: {error}");
                    }
                    ticket
                        .finish_with_workspace(Ok(Some(window.label().to_owned())), Some(workspace))
                }
                Err(error) => ticket.finish(Err(error)),
            });
        }
        Dispatch::Window(reserved) => {
            crate::windows::build_reserved_editor_window(reserved).map(Some)
        }
        Dispatch::Path(path) if action == EntryActionKind::CopyPath => {
            match crate::platform::entry_actions::clipboard_path(&path) {
                Err(error) => Err(error),
                Ok(data) => crate::clipboard::clipboard_write(
                    window.clone(),
                    app.state::<crate::clipboard::ClipboardHost>(),
                    data,
                )
                .await
                .map(|()| None),
            }
        }
        Dispatch::Path(path) if action == EntryActionKind::Info => {
            crate::platform::entry_actions::show_info(window.clone(), path)
                .await
                .map(|()| None)
        }
        Dispatch::Path(path) => tauri::async_runtime::spawn_blocking(move || {
            crate::platform::entry_actions::dispatch(action, &path)
        })
        .await
        .map_err(|_| "系统文件动作任务未完成".to_owned())
        .and_then(|v| v)
        .map(|()| None),
    };
    Ok(ticket.finish(result))
}
#[tauri::command]
pub async fn resolve_workspace_entry_action(
    window: WebviewWindow,
    workspace_id: String,
    entry_token: String,
    operation_id: String,
    action: EntryActionKind,
) -> Result<Option<EntryActionResolution>, String> {
    require_window(&window)?;
    window.state::<WindowServices>().resolve_entry_action(
        window.label(),
        &workspace_id,
        &entry_token,
        &operation_id,
        action,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dirty_snapshot_checks_window_document_identity_and_saved_baseline() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("A.md");
        std::fs::write(&path, b"disk\r\n").unwrap();
        let mut documents = DocumentService::new();
        let document = documents.open_authorized(&path).unwrap();
        let mut registry = file_index::WorkspaceRegistry::default();
        let selected = registry.select_authorized(root.path()).unwrap();
        let workspace = registry.get(&selected.id).unwrap();
        let entry = workspace.inspect_entry("A.md").unwrap();
        let plan = workspace.prepare_entry_action(&entry.entry_token).unwrap();
        let snapshot = EntryEditorSnapshot {
            document_id: Some(document.id.clone()),
            text: "dirty\r\n".into(),
            saved_text: document.text.clone(),
        };
        assert_eq!(
            snapshot
                .draft_for_entry(&documents, &plan, &document.text)
                .unwrap(),
            Some(("dirty\r\n".into(), "disk\r\n".into()))
        );
        assert!(snapshot
            .draft_for_entry(&DocumentService::new(), &plan, &document.text)
            .is_err());
        assert!(snapshot
            .draft_for_entry(&documents, &plan, "external")
            .is_err());
        std::fs::rename(&path, root.path().join("retained.md")).unwrap();
        std::fs::write(&path, b"disk\r\n").unwrap();
        let replacement = workspace.inspect_entry("A.md").unwrap();
        let replacement = workspace
            .prepare_entry_action(&replacement.entry_token)
            .unwrap();
        assert!(snapshot
            .draft_for_entry(&documents, &replacement, &document.text)
            .is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"disk\r\n");
    }
    #[test]
    fn empty_reuse_snapshot_cannot_carry_a_path_or_dirty_claim() {
        let value = serde_json::json!({"documentId":null,"text":"","savedText":""});
        let snapshot: EntryEditorSnapshot = serde_json::from_value(value.clone()).unwrap();
        assert!(snapshot.empty_untitled());
        assert!(!EntryEditorSnapshot {
            text: "dirty".into(),
            ..snapshot
        }
        .empty_untitled());
        let mut invalid = value;
        invalid["path"] = "/ungranted".into();
        assert!(serde_json::from_value::<EntryEditorSnapshot>(invalid).is_err());
    }
}
