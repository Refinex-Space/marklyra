use super::*;
use std::{
    fs,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
};

fn operation() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn rename(
    services: &WindowServices,
    workspace: &str,
    token: &str,
    name: &str,
    operation: &str,
) -> Result<EntryRenameResult, String> {
    services.rename_workspace_entry(
        EntryRenameRequest {
            label: "main",
            workspace_id: workspace,
            token,
            name,
            operation_id: operation,
        },
        |_| Ok(()),
        |_| vec![],
    )
}

#[test]
fn ancestor_rename_retargets_all_open_descendants_and_mounted_roots() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    fs::create_dir_all(root.join("Old/nested/assets")).unwrap();
    let raw = b"\xef\xbb\xbf# Heading\r\n\r\nTail  \n";
    fs::write(root.join("Old/nested/note.md"), raw).unwrap();
    fs::write(
        root.join("Old/nested/assets/icon.svg"),
        br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#,
    )
    .unwrap();
    let services = WindowServices::default();
    services.register("main").unwrap();
    services.register("editor-other").unwrap();
    let outer_registry = services.get_workspaces("main").unwrap();
    let outer = outer_registry
        .lock()
        .unwrap()
        .select_authorized(&root)
        .unwrap();
    let inner_registry = services.get_workspaces("editor-other").unwrap();
    let inner = inner_registry
        .lock()
        .unwrap()
        .select_authorized(&root.join("Old/nested"))
        .unwrap();
    let outer_scope = outer_registry.lock().unwrap().get(&outer.id).unwrap();
    let inner_scope = inner_registry.lock().unwrap().get(&inner.id).unwrap();
    let a = services
        .mutate_document("main", |documents| {
            outer_scope
                .open_document("Old/nested/note.md", documents)
                .map_err(|e| e.to_string())
        })
        .unwrap();
    let b = services
        .mutate_document("editor-other", |documents| {
            inner_scope
                .open_document("note.md", documents)
                .map_err(|e| e.to_string())
        })
        .unwrap();
    let image = services
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .resolve_image(&a.id, "assets/icon.svg")
        .unwrap();
    let token = services
        .mutate_workspace("main", &outer.id, |workspace| {
            workspace.inspect_entry("Old").map_err(|e| e.to_string())
        })
        .unwrap();
    let result = rename(
        &services,
        &outer.id,
        &token.entry_token,
        "New",
        &operation(),
    )
    .unwrap();
    assert_eq!(result.documents.len(), 2);
    assert_eq!(result.workspaces.len(), 2);
    assert!(result.uncertain_documents.is_empty());
    assert_eq!(result.receipt.unwrap().relative_path, "New");
    assert_eq!(
        inner_scope.metadata(&inner.id).unwrap().path,
        root.join("New/nested").to_string_lossy()
    );
    assert!(Arc::ptr_eq(
        &inner_scope,
        &inner_registry.lock().unwrap().get(&inner.id).unwrap()
    ));
    for (label, doc) in [("main", &a), ("editor-other", &b)] {
        let service = services.get_documents(label).unwrap();
        let mut service = service.lock().unwrap();
        assert_eq!(
            service.get_metadata(&doc.id).unwrap().path,
            root.join("New/nested/note.md").to_string_lossy()
        );
        assert_eq!(service.get_metadata(&doc.id).unwrap().metadata_revision, 1);
        assert_eq!(service.save(&doc.id, &doc.text).unwrap().text, doc.text);
        assert_eq!(
            service
                .resolve_image(&doc.id, "assets/icon.svg")
                .unwrap()
                .source,
            "assets/icon.svg"
        );
    }
    assert!(services
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .image(&image.token)
        .is_some());
    assert_eq!(fs::read(root.join("New/nested/note.md")).unwrap(), raw);
    fs::create_dir_all(root.join("Old/nested")).unwrap();
    fs::write(root.join("Old/nested/note.md"), b"replacement").unwrap();
    services
        .write_document("main", |documents| documents.save(&a.id, "changed"))
        .unwrap();
    assert_eq!(
        fs::read(root.join("Old/nested/note.md")).unwrap(),
        b"replacement"
    );
    assert_eq!(
        fs::read(root.join("New/nested/note.md")).unwrap(),
        b"\xef\xbb\xbfchanged"
    );
    assert!(services
        .write_document("editor-other", |documents| documents
            .save(&b.id, "different dirty"))
        .is_err());
}

#[test]
fn own_atomic_save_lineage_allows_file_rename_but_keeps_other_window_baseline() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    let old = root.join("old.md");
    fs::write(&old, b"original\r\n").unwrap();
    let services = WindowServices::default();
    services.register("main").unwrap();
    services.register("editor-other").unwrap();
    let workspace = services
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .select_authorized(&root)
        .unwrap();
    let a = services
        .write_document("main", |documents| documents.open_authorized(&old))
        .unwrap();
    let b = services
        .write_document("editor-other", |documents| documents.open_authorized(&old))
        .unwrap();
    services
        .write_document("main", |documents| documents.save(&a.id, "first\r\n"))
        .unwrap();
    services
        .write_document("main", |documents| documents.save(&a.id, "second\r\n"))
        .unwrap();
    let token = services
        .mutate_workspace("main", &workspace.id, |workspace| {
            workspace.inspect_entry("old.md").map_err(|e| e.to_string())
        })
        .unwrap();
    let result = rename(
        &services,
        &workspace.id,
        &token.entry_token,
        "new.md",
        &operation(),
    )
    .unwrap();
    assert_eq!(result.documents.len(), 2);
    assert_eq!(fs::read(root.join("new.md")).unwrap(), b"second\r\n");
    assert!(services
        .write_document("editor-other", |documents| documents
            .save(&b.id, "stale dirty"))
        .is_err());
    services
        .write_document("main", |documents| documents.save(&a.id, &a.text))
        .unwrap();
    // This is an application-proven publication back to the old bytes, not an
    // arbitrary external inode with equal content.
    services
        .write_document("editor-other", |documents| {
            documents.save(&b.id, "other accepted")
        })
        .unwrap();
    assert_eq!(fs::read(root.join("new.md")).unwrap(), b"other accepted");
    assert!(!old.exists());
}

#[test]
fn conflict_and_external_equal_byte_replacement_do_not_retarget_open_sessions() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    fs::write(root.join("old.md"), b"unchanged").unwrap();
    fs::write(root.join("taken.md"), b"target").unwrap();
    let services = WindowServices::default();
    services.register("main").unwrap();
    let workspace = services
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .select_authorized(&root)
        .unwrap();
    let doc = services
        .write_document("main", |documents| {
            documents.open_authorized(&root.join("old.md"))
        })
        .unwrap();
    let inspected = services
        .mutate_workspace("main", &workspace.id, |workspace| {
            workspace.inspect_entry("old.md").map_err(|e| e.to_string())
        })
        .unwrap();
    assert!(rename(
        &services,
        &workspace.id,
        &inspected.entry_token,
        "taken.md",
        &operation()
    )
    .is_err());
    assert_eq!(
        services
            .get_documents("main")
            .unwrap()
            .lock()
            .unwrap()
            .get_metadata(&doc.id)
            .unwrap()
            .metadata_revision,
        0
    );
    fs::rename(root.join("old.md"), root.join("external-original.md")).unwrap();
    fs::write(root.join("old.md"), b"unchanged").unwrap();
    let inspected = services
        .mutate_workspace("main", &workspace.id, |workspace| {
            workspace.inspect_entry("old.md").map_err(|e| e.to_string())
        })
        .unwrap();
    assert!(rename(
        &services,
        &workspace.id,
        &inspected.entry_token,
        "new.md",
        &operation()
    )
    .is_err());
    assert!(!root.join("new.md").exists());
    assert_eq!(fs::read(root.join("taken.md")).unwrap(), b"target");
    assert!(services
        .write_document("main", |documents| documents.save(&doc.id, "dirty"))
        .is_err());
}

#[test]
fn lost_ack_reuses_original_receipt_and_does_not_repeat_metadata_hooks() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    fs::write(root.join("old.md"), b"source").unwrap();
    let services = WindowServices::default();
    services.register("main").unwrap();
    let workspace = services
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .select_authorized(&root)
        .unwrap();
    let inspected = services
        .mutate_workspace("main", &workspace.id, |workspace| {
            workspace.inspect_entry("old.md").map_err(|e| e.to_string())
        })
        .unwrap();
    let operation = operation();
    let calls = AtomicUsize::new(0);
    for _ in 0..2 {
        let result = services
            .rename_workspace_entry(
                EntryRenameRequest {
                    label: "main",
                    workspace_id: &workspace.id,
                    token: &inspected.entry_token,
                    name: "new.md",
                    operation_id: &operation,
                },
                |_| {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Ok(())
                },
                |_| {
                    calls.fetch_add(1, Ordering::SeqCst);
                    vec!["metadata warning".into()]
                },
            )
            .unwrap();
        assert_eq!(result.receipt.unwrap().warnings, vec!["metadata warning"]);
    }
    assert_eq!(calls.load(Ordering::SeqCst), 2);
    assert_eq!(fs::read(root.join("new.md")).unwrap(), b"source");
    assert!(!root.join("old.md").exists());
}

#[test]
fn busy_other_window_fails_before_filesystem_move_without_waiting_on_inverse_lock() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("old.md"), "source").unwrap();
    let services = WindowServices::default();
    services.register("main").unwrap();
    services.register("editor-other").unwrap();
    let workspace = services
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .select_authorized(temp.path())
        .unwrap();
    let inspected = services
        .mutate_workspace("main", &workspace.id, |workspace| {
            workspace.inspect_entry("old.md").map_err(|e| e.to_string())
        })
        .unwrap();
    let other = services.get_workspaces("editor-other").unwrap();
    let _held = other.lock().unwrap();
    assert!(rename(
        &services,
        &workspace.id,
        &inspected.entry_token,
        "new.md",
        &operation()
    )
    .is_err());
    assert!(temp.path().join("old.md").exists());
    assert!(!temp.path().join("new.md").exists());
}

#[test]
fn metadata_store_waits_never_retain_a_workspace_registry_guard() {
    use std::sync::{mpsc, Barrier, Mutex};
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("old.md"), "source").unwrap();
    let services = WindowServices::default();
    services.register("main").unwrap();
    let registry = services.get_workspaces("main").unwrap();
    let selected = registry
        .lock()
        .unwrap()
        .select_authorized(temp.path())
        .unwrap();
    let inspected = services
        .mutate_workspace("main", &selected.id, |workspace| {
            workspace.inspect_entry("old.md").map_err(|e| e.to_string())
        })
        .unwrap();
    let metadata = Arc::new(Mutex::new(()));
    let barrier = Arc::new(Barrier::new(2));
    let (ready, wait) = mpsc::channel();
    let history = {
        let metadata = Arc::clone(&metadata);
        let barrier = Arc::clone(&barrier);
        let registry = Arc::clone(&registry);
        std::thread::spawn(move || {
            let _store = metadata.lock().unwrap();
            ready.send(()).unwrap();
            barrier.wait();
            // Directory history owns its metadata store before publishing a
            // restored mount. A rename must not retain the inverse edge.
            registry.try_lock().is_ok()
        })
    };
    wait.recv_timeout(std::time::Duration::from_secs(2))
        .unwrap();
    services
        .rename_workspace_entry(
            EntryRenameRequest {
                label: "main",
                workspace_id: &selected.id,
                token: &inspected.entry_token,
                name: "new.md",
                operation_id: &operation(),
            },
            |_| {
                barrier.wait();
                let _store = metadata.lock().unwrap();
                Ok(())
            },
            |_| {
                assert!(registry.try_lock().is_ok());
                vec![]
            },
        )
        .unwrap();
    assert!(history.join().unwrap());
    assert!(temp.path().join("new.md").is_file());
}

#[test]
fn queued_workspace_open_resolves_the_current_mount_inside_the_mutation_lane() {
    use std::sync::mpsc;
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("note.md"), "protected").unwrap();
    let services = Arc::new(WindowServices::default());
    services.register("main").unwrap();
    let selected = services
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .select_authorized(temp.path())
        .unwrap();
    let gate = services.write_gate.lock().unwrap();
    let (ready, wait) = mpsc::channel();
    let task = {
        let services = Arc::clone(&services);
        let id = selected.id.clone();
        std::thread::spawn(move || {
            ready.send(()).unwrap();
            services.open_workspace_document("main", &id, "note.md", None)
        })
    };
    wait.recv_timeout(std::time::Duration::from_secs(2))
        .unwrap();
    // Complete the preceding close while owning its normal native lane.
    services
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .close(&selected.id);
    drop(gate);
    assert!(task.join().unwrap().is_err());
    assert_eq!(fs::read(temp.path().join("note.md")).unwrap(), b"protected");
}
