//! Native receipt handoff. Renderer paths never authorize a document or root.
use super::{images, lock_service, workspaces::Workspaces, Documents};
use crate::{
    clipboard::native_input::{take_selected_path, InputKind},
    file_preferences::FilePreferencesHost,
    window_services::WindowServices,
};
use document_service::{DocumentPayload, DocumentService};
use file_index::{WorkspacePayload, WorkspaceRegistry};
use std::path::Path;
use tauri::{Manager, State, WebviewWindow};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeOpenDocument {
    #[serde(flatten)]
    document: DocumentPayload,
    native_same_document: bool,
}

fn native_document_candidate(
    documents: &DocumentService,
    document: DocumentPayload,
    source_id: &str,
) -> NativeOpenDocument {
    let native_same_document = documents
        .capture_image_document_identity(source_id)
        .and_then(|proof| documents.matches_image_document_identity(&document.id, &proof))
        .unwrap_or(false);
    NativeOpenDocument {
        document,
        native_same_document,
    }
}

fn open_document_entity(
    documents: &mut DocumentService,
    path: &Path,
    identity: &same_file::Handle,
    parent_identity: &same_file::Handle,
    mut verify: impl FnMut() -> Result<(), String>,
) -> Result<DocumentPayload, String> {
    verify()?;
    let opened = documents
        .open_authorized_entity_in_parent(path, identity, parent_identity)
        .map_err(|error| error.to_string())?;
    if let Err(error) = verify() {
        documents.close(&opened.id);
        return Err(error);
    }
    Ok(opened)
}

fn select_workspace_entity(
    workspaces: &mut WorkspaceRegistry,
    path: &Path,
    identity: &same_file::Handle,
    mut verify: impl FnMut() -> Result<(), String>,
) -> Result<WorkspacePayload, String> {
    verify()?;
    let selected = workspaces
        .select_authorized_entity(path, identity)
        .map_err(|error| error.to_string())?;
    if let Err(error) = verify() {
        workspaces.close(&selected.id);
        return Err(error);
    }
    Ok(selected)
}

fn discard_document(window: &WebviewWindow, registry: &Documents, id: &str) {
    let result = window.state::<WindowServices>().with_file_lane(|| {
        lock_service(registry)?.close(id);
        Ok(())
    });
    if let Err(error) = result {
        eprintln!("Rejected native document candidate was not released: {error}");
    }
}

fn discard_workspace(window: &WebviewWindow, registry: &Workspaces, id: &str) {
    let result = window.state::<WindowServices>().with_file_lane(|| {
        registry.lock().map_err(|_| "目录状态不可用")?.close(id);
        Ok(())
    });
    if let Err(error) = result {
        eprintln!("Rejected native workspace candidate was not released: {error}");
    }
}

/// This creates a separate candidate and never closes the current one. The
/// Shell checks Native identity before its dirty gate and releases candidates
/// that must not replace the current draft.
#[tauri::command]
pub(crate) async fn open_native_input_document(
    ticket: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<NativeOpenDocument, String> {
    let registry = services.get_documents(window.label())?;
    let selected = take_selected_path(&window, &ticket, 0)?;
    if selected.kind != InputKind::File {
        return Err("这项原生输入不是可打开的文稿".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        selected.verify_owner(&window)?;
        let opened = images::with_documents(&window, &registry, |documents| {
            let document = open_document_entity(
                documents,
                &selected.path,
                selected.identity(),
                selected.parent_identity(),
                || selected.verify(),
            )?;
            Ok(native_document_candidate(
                documents,
                document,
                selected.source_document_id(),
            ))
        })?;
        if let Err(error) = selected.verify_owner(&window) {
            discard_document(&window, &registry, &opened.document.id);
            return Err(error);
        }
        Ok(opened)
    })
    .await
    .map_err(|_| "打开原生拖入文稿任务未能完成".to_owned())?
}

#[tauri::command]
pub(crate) async fn open_native_input_workspace(
    ticket: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<WorkspacePayload, String> {
    let registry = services.get_workspaces(window.label())?;
    let selected = take_selected_path(&window, &ticket, 0)?;
    if selected.kind != InputKind::Directory {
        return Err("这项原生输入不是可挂载的目录".into());
    }
    let app = window.app_handle().clone();
    let history_request = app.state::<FilePreferencesHost>().history_request();
    tauri::async_runtime::spawn_blocking(move || {
        selected.verify_owner(&window)?;
        let opened = window.state::<WindowServices>().with_file_lane(|| {
            let services = window.state::<WindowServices>();
            if !services.is_current_workspaces(window.label(), &registry) {
                return Err("原生输入所属目录会话已改变".into());
            }
            let mut workspaces = registry.lock().map_err(|_| "目录状态不可用")?;
            if !services.is_current_workspaces(window.label(), &registry) {
                return Err("原生输入所属目录会话已改变".into());
            }
            select_workspace_entity(&mut workspaces, &selected.path, selected.identity(), || {
                selected.verify()
            })
        })?;
        if let Err(error) = selected.verify_owner(&window) {
            discard_workspace(&window, &registry, &opened.id);
            return Err(error);
        }
        let history_ticket = match app
            .state::<FilePreferencesHost>()
            .prepare_folder_history(&app, history_request)
        {
            Ok(ticket) => ticket,
            Err(error) => {
                eprintln!("Native input directory history was not prepared: {error}");
                None
            }
        };
        let bookmark = registry
            .lock()
            .map_err(|_| "目录状态不可用".to_owned())
            .and_then(|workspaces| {
                workspaces
                    .get(&opened.id)
                    .and_then(|workspace| workspace.bookmark())
                    .map_err(|error| error.to_string())
            });
        match bookmark {
            Ok(bookmark) => {
                if let Err(error) = app.state::<FilePreferencesHost>().remember_workspace(
                    &app,
                    &bookmark,
                    history_ticket,
                ) {
                    eprintln!("Native input directory history was not updated: {error}");
                }
            }
            Err(error) => eprintln!("Native input directory identity was not recorded: {error}"),
        }
        if let Err(error) = selected.verify_owner(&window) {
            discard_workspace(&window, &registry, &opened.id);
            return Err(error);
        }
        Ok(opened)
    })
    .await
    .map_err(|_| "挂载原生拖入目录任务未能完成".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, fs};

    fn identity(path: &Path) -> same_file::Handle {
        same_file::Handle::from_path(path).unwrap()
    }

    #[test]
    fn native_document_receipt_opens_bom_mixed_newlines_and_noop_is_exact() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("中文 空格.md");
        let bytes = b"\xef\xbb\xbf# title\r\n\r\nkeep  \n";
        fs::write(&path, bytes).unwrap();
        let mut documents = DocumentService::new();
        let opened = open_document_entity(
            &mut documents,
            &path,
            &identity(&path),
            &identity(path.parent().unwrap()),
            || Ok(()),
        )
        .unwrap();
        documents.save(&opened.id, &opened.text).unwrap();
        assert_eq!(fs::read(path).unwrap(), bytes);
    }

    #[test]
    fn native_document_rejects_foreign_opened_entity_even_if_path_was_valid() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("selected.md");
        fs::write(&path, b"same text").unwrap();
        let receipt = identity(&path);
        fs::rename(&path, root.path().join("retained.md")).unwrap();
        fs::write(&path, b"same text").unwrap();
        let mut documents = DocumentService::new();
        assert!(open_document_entity(
            &mut documents,
            &path,
            &receipt,
            &identity(path.parent().unwrap()),
            || Ok(())
        )
        .is_err());
        fs::remove_file(&path).unwrap();
        fs::rename(root.path().join("retained.md"), &path).unwrap();
        assert_eq!(identity(&path), receipt);
        assert!(open_document_entity(
            &mut documents,
            &path,
            &receipt,
            &identity(path.parent().unwrap()),
            || Ok(())
        )
        .is_ok());
    }

    #[test]
    fn native_document_post_verification_failure_preserves_the_existing_session() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("selected.md");
        fs::write(&path, b"existing").unwrap();
        let mut documents = DocumentService::new();
        let existing = documents.open_authorized(&path).unwrap();
        let calls = Cell::new(0);
        let result = open_document_entity(
            &mut documents,
            &path,
            &identity(&path),
            &identity(path.parent().unwrap()),
            || {
                calls.set(calls.get() + 1);
                if calls.get() == 2 {
                    Err("stale owner".into())
                } else {
                    Ok(())
                }
            },
        );
        assert!(result.is_err());
        assert_eq!(
            documents.get_metadata(&existing.id).unwrap().id,
            existing.id
        );
        documents.save(&existing.id, "retained edit").unwrap();
        assert_eq!(fs::read(path).unwrap(), b"retained edit");
    }

    #[test]
    fn same_entity_candidate_is_marked_before_dirty_save_and_does_not_replace_current_source() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("A.md");
        fs::write(&path, b"old disk\r\n").unwrap();
        let mut documents = DocumentService::new();
        let current = documents.open_authorized(&path).unwrap();
        let candidate = open_document_entity(
            &mut documents,
            &path,
            &identity(&path),
            &identity(path.parent().unwrap()),
            || Ok(()),
        )
        .unwrap();
        let candidate = native_document_candidate(&documents, candidate, &current.id);
        assert!(candidate.native_same_document);
        assert_eq!(candidate.document.text, "old disk\r\n");
        let serialized = serde_json::to_value(&candidate).unwrap();
        assert_eq!(serialized["nativeSameDocument"], true);
        assert_eq!(serialized["id"], candidate.document.id);
        assert!(serialized.get("document").is_none());
        documents.close(&candidate.document.id);
        documents
            .save(&current.id, "current dirty source\r\n")
            .unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"current dirty source\r\n");
    }

    #[test]
    fn same_text_and_basename_in_another_directory_is_not_the_current_entity() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("foreign")).unwrap();
        let current_path = root.path().join("A.md");
        let other_path = root.path().join("foreign/A.md");
        fs::write(&current_path, b"same text").unwrap();
        fs::write(&other_path, b"same text").unwrap();
        let mut documents = DocumentService::new();
        let current = documents.open_authorized(&current_path).unwrap();
        let candidate = open_document_entity(
            &mut documents,
            &other_path,
            &identity(&other_path),
            &identity(other_path.parent().unwrap()),
            || Ok(()),
        )
        .unwrap();
        let candidate = native_document_candidate(&documents, candidate, &current.id);
        assert!(!candidate.native_same_document);
        assert_eq!(fs::read(current_path).unwrap(), b"same text");
        assert_eq!(fs::read(other_path).unwrap(), b"same text");
    }

    #[test]
    fn same_path_foreign_replacement_and_unknown_source_never_prove_same_document() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("A.md");
        fs::write(&path, b"same text").unwrap();
        let mut documents = DocumentService::new();
        let current = documents.open_authorized(&path).unwrap();
        fs::rename(&path, root.path().join("retained.md")).unwrap();
        fs::write(&path, b"same text").unwrap();
        let candidate = open_document_entity(
            &mut documents,
            &path,
            &identity(&path),
            &identity(path.parent().unwrap()),
            || Ok(()),
        )
        .unwrap();
        assert!(
            !native_document_candidate(&documents, candidate.clone(), &current.id)
                .native_same_document
        );
        assert!(
            !native_document_candidate(&documents, candidate, "untitled-draft-id")
                .native_same_document
        );
    }

    #[test]
    fn parent_swap_after_precheck_cannot_open_a_same_leaf_hard_link_or_borrow_sibling_scope() {
        let root = tempfile::tempdir().unwrap();
        let parent_path = root.path().join("selected");
        let retained = root.path().join("retained");
        fs::create_dir(&parent_path).unwrap();
        let path = parent_path.join("A.md");
        fs::write(&path, b"keep current\r\n").unwrap();
        let leaf = identity(&path);
        let parent = identity(&parent_path);
        let mut documents = DocumentService::new();
        let current = documents.open_authorized(&path).unwrap();
        let checks = Cell::new(0);
        let result = open_document_entity(&mut documents, &path, &leaf, &parent, || {
            checks.set(checks.get() + 1);
            if checks.get() == 1 {
                assert_eq!(identity(&parent_path), parent);
                assert_eq!(identity(&path), leaf);
                fs::rename(&parent_path, &retained).unwrap();
                fs::create_dir(&parent_path).unwrap();
                fs::hard_link(retained.join("A.md"), &path).unwrap();
                fs::write(
                    parent_path.join("foreign.svg"),
                    br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#,
                )
                .unwrap();
            }
            Ok(())
        });
        assert!(result.is_err());
        assert_eq!(
            checks.get(),
            1,
            "parent rejection precedes post-open path verification"
        );
        assert!(documents.resolve_image(&current.id, "foreign.svg").is_err());
        fs::remove_file(&path).unwrap();
        fs::remove_file(parent_path.join("foreign.svg")).unwrap();
        fs::remove_dir(&parent_path).unwrap();
        fs::rename(&retained, &parent_path).unwrap();
        assert_eq!(identity(&parent_path), parent);
        assert_eq!(identity(&path), leaf);
        documents
            .save(&current.id, "still current dirty source\r\n")
            .unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"still current dirty source\r\n");
    }

    #[test]
    fn native_workspace_keeps_the_actual_directory_capability() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("selected");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("own.md"), b"own").unwrap();
        let mut workspaces = WorkspaceRegistry::default();
        let selected =
            select_workspace_entity(&mut workspaces, &path, &identity(&path), || Ok(())).unwrap();
        assert_eq!(
            workspaces
                .get(&selected.id)
                .unwrap()
                .list_directory("")
                .unwrap()
                .entries[0]
                .name,
            "own.md"
        );
    }

    #[test]
    fn native_workspace_replacement_cannot_become_a_receipt_grant() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("selected");
        fs::create_dir(&path).unwrap();
        let receipt = identity(&path);
        fs::rename(&path, root.path().join("retained")).unwrap();
        fs::create_dir(&path).unwrap();
        fs::write(path.join("foreign.md"), b"foreign").unwrap();
        let mut workspaces = WorkspaceRegistry::default();
        assert!(select_workspace_entity(&mut workspaces, &path, &receipt, || Ok(())).is_err());
        assert!(workspaces.ids().is_empty());
        fs::remove_file(path.join("foreign.md")).unwrap();
        fs::remove_dir(&path).unwrap();
        fs::rename(root.path().join("retained"), &path).unwrap();
        assert_eq!(identity(&path), receipt);
    }

    #[test]
    fn native_workspace_post_verification_failure_removes_only_new_candidate() {
        let root = tempfile::tempdir().unwrap();
        let mut workspaces = WorkspaceRegistry::default();
        let existing = workspaces.select_authorized(root.path()).unwrap();
        let calls = Cell::new(0);
        assert!(select_workspace_entity(
            &mut workspaces,
            root.path(),
            &identity(root.path()),
            || {
                calls.set(calls.get() + 1);
                if calls.get() == 2 {
                    Err("stale path".into())
                } else {
                    Ok(())
                }
            }
        )
        .is_err());
        assert_eq!(workspaces.ids(), vec![existing.id]);
    }
}
