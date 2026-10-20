use super::*;
use std::fs;

fn rename_fixture(root: &Path, old: &str, new: &str) -> RenameUndo {
    fs::create_dir(root.join(old)).unwrap();
    let parent = Arc::new(Dir::open_ambient_dir(root, cap_std::ambient_authority()).unwrap());
    // The identity witness must share deletion on Windows; no directory
    // capability inside the renamed entity is needed by this history fixture.
    let identity = Arc::new(same_file::Handle::from_path(root.join(old)).unwrap());
    let plan = PreparedRenameUndo::prepare(
        &DocumentAuthorities::default(),
        parent,
        &root.join(old),
        &root.join(new),
        EntryKind::Directory,
        identity,
    )
    .unwrap();
    fs::rename(root.join(old), root.join(new)).unwrap();
    plan.commit().unwrap()
}
fn request(token: String) -> FileUndoRequest {
    FileUndoRequest {
        label: "main".into(),
        workspace_id: Uuid::new_v4().to_string(),
        undo_token: token,
        operation_id: Uuid::new_v4().to_string(),
    }
}
fn root() -> tempfile::TempDir {
    tempfile::tempdir_in(fs::canonicalize(std::env::temp_dir()).unwrap()).unwrap()
}

#[test]
fn slot_is_process_wide_and_consumed_before_any_source_or_target_attempt() {
    let temp = root();
    let mut history = FileUndoStore::default();
    history.record(rename_fixture(temp.path(), "Old", "New"));
    let snapshot = history.snapshot(temp.path()).unwrap();
    assert_eq!(snapshot.description, "重命名“New”");
    let mut request = request(snapshot.token);
    request.label = "editor-other".into();
    let BeginUndo::Perform(FileUndoAction::Rename(rename)) =
        history.begin(request.clone(), temp.path()).unwrap()
    else {
        panic!()
    };
    assert_eq!(rename.source, temp.path().join("New"));
    assert!(history.snapshot(temp.path()).is_none());
    history
        .finish(
            &request,
            FileUndoResolution::Rejected {
                message: "target exists".into(),
            },
        )
        .unwrap();
    assert!(matches!(
        history.begin(request, temp.path()).unwrap(),
        BeginUndo::Resolved(FileUndoResolution::Rejected { .. })
    ));
    assert!(history.snapshot(temp.path()).is_none());
}

#[test]
fn mount_gating_is_strict_and_does_not_treat_a_sibling_prefix_or_root_itself_as_eligible() {
    let temp = root();
    let mut history = FileUndoStore::default();
    history.record(rename_fixture(temp.path(), "Old", "New"));
    assert!(history.snapshot(&temp.path().join("New")).is_none());
    assert!(history.snapshot(&temp.path().join("Newer")).is_none());
    assert!(history.snapshot(&temp.path().join("Other")).is_none());
    let snapshot = history.snapshot(temp.path()).unwrap();
    let rejected = request(snapshot.token.clone());
    assert!(matches!(
        history.begin(rejected, &temp.path().join("New")).unwrap(),
        BeginUndo::Resolved(FileUndoResolution::Rejected { .. })
    ));
    assert_eq!(history.snapshot(temp.path()).unwrap(), snapshot);
    assert!(matches!(
        history.begin(request(snapshot.token), temp.path()).unwrap(),
        BeginUndo::Perform(_)
    ));
}

#[test]
fn stale_menu_and_completed_receipt_cannot_consume_a_newer_slot() {
    let temp = root();
    let mut history = FileUndoStore::default();
    history.record(rename_fixture(temp.path(), "Old", "New"));
    let first = history.snapshot(temp.path()).unwrap();
    let original = request(first.token.clone());
    assert!(matches!(
        history.begin(original.clone(), temp.path()).unwrap(),
        BeginUndo::Perform(_)
    ));
    let receipt = FileUndoReceipt {
        operation_id: original.operation_id.clone(),
        undo_token: original.undo_token.clone(),
        restored_relative_path: Some("Old".into()),
        kind: EntryKind::Directory,
        warnings: vec![],
    };
    history
        .finish(
            &original,
            FileUndoResolution::Committed {
                receipt: receipt.clone(),
            },
        )
        .unwrap();
    history.record(rename_fixture(temp.path(), "Alpha", "Beta"));
    let next = history.snapshot(temp.path()).unwrap();
    assert_ne!(first.token, next.token);
    assert!(matches!(
        history.begin(request(first.token), temp.path()).unwrap(),
        BeginUndo::Resolved(FileUndoResolution::Rejected { .. })
    ));
    assert!(
        matches!(history.begin(original.clone(), temp.path()).unwrap(), BeginUndo::Resolved(FileUndoResolution::Committed { receipt: value }) if value == receipt)
    );
    assert_eq!(history.snapshot(temp.path()).unwrap(), next);
    let mut foreign = original;
    foreign.workspace_id = "another-workspace".into();
    assert!(history.resolve(&foreign).is_err());
}

#[test]
fn creation_clear_does_not_revoke_saved_receipts_or_create_a_redo_slot() {
    let temp = root();
    let mut history = FileUndoStore::default();
    history.record(rename_fixture(temp.path(), "Old", "New"));
    let request = request(history.snapshot(temp.path()).unwrap().token);
    assert!(matches!(
        history.begin(request.clone(), temp.path()).unwrap(),
        BeginUndo::Perform(_)
    ));
    history
        .finish(&request, FileUndoResolution::MutationUncertain)
        .unwrap();
    history.record(rename_fixture(temp.path(), "Alpha", "Beta"));
    history.clear();
    assert!(history.snapshot(temp.path()).is_none());
    assert_eq!(
        history.resolve(&request).unwrap(),
        Some(FileUndoResolution::MutationUncertain)
    );
    assert!(history
        .finish(&request, FileUndoResolution::Prepared)
        .is_err());
}

#[test]
fn uncertain_restore_receipt_retains_native_identity_without_recreating_an_undo_slot() {
    let temp = root();
    fs::write(temp.path().join("source.md"), b"own evidence").unwrap();
    let mut registry = file_index::WorkspaceRegistry::default();
    let selected = registry.select_authorized(temp.path()).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let action = workspace.prepare_entry_action(&entry.entry_token).unwrap();
    let mut history = FileUndoStore::default();
    history.record(rename_fixture(temp.path(), "Old", "New"));
    let request = request(history.snapshot(temp.path()).unwrap().token);
    assert!(matches!(
        history.begin(request.clone(), temp.path()).unwrap(),
        BeginUndo::Perform(_)
    ));
    let diagnostic = Arc::new(super::super::trash_diagnostic::TrashDiagnostic::new(
        &request.operation_id,
        "injected uncertain restore".into(),
        Some(temp.path().join("observed.md")),
        &action,
    ));
    let retained = Arc::downgrade(&diagnostic);
    history
        .finish_with_diagnostic(
            &request,
            FileUndoResolution::MutationUncertain,
            Some(diagnostic),
        )
        .unwrap();
    assert!(retained.upgrade().is_some());
    assert_eq!(
        history.resolve(&request).unwrap(),
        Some(FileUndoResolution::MutationUncertain)
    );
    history.clear();
    assert!(history.snapshot(temp.path()).is_none());
    assert!(matches!(
        history.begin(request.clone(), temp.path()).unwrap(),
        BeginUndo::Resolved(FileUndoResolution::MutationUncertain)
    ));
    assert!(history
        .finish(&request, FileUndoResolution::Prepared)
        .is_err());
    retained
        .upgrade()
        .unwrap()
        .write(&temp.path().join("journal"))
        .unwrap();
    drop(history);
    assert!(retained.upgrade().is_none());
}

#[test]
fn receipt_capacity_fails_before_consuming_the_available_slot() {
    let temp = root();
    let mut history = FileUndoStore::default();
    history.record(rename_fixture(temp.path(), "Old", "New"));
    let snapshot = history.snapshot(temp.path()).unwrap();
    for _ in 0..MAX_RECEIPTS {
        assert!(matches!(
            history
                .begin(request(Uuid::new_v4().to_string()), temp.path())
                .unwrap(),
            BeginUndo::Resolved(FileUndoResolution::Rejected { .. })
        ));
    }
    assert!(history
        .begin(request(snapshot.token.clone()), temp.path())
        .is_err());
    assert_eq!(history.snapshot(temp.path()).unwrap(), snapshot);
}

#[test]
fn file_undo_identity_follows_only_the_application_publication_lineage() {
    let temp = root();
    let old = temp.path().join("Old.md");
    let new = temp.path().join("New.md");
    fs::write(&old, b"initial").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let parent =
        Arc::new(Dir::open_ambient_dir(temp.path(), cap_std::ambient_authority()).unwrap());
    let source = parent.open("Old.md").unwrap();
    let identity = Arc::new(same_file::Handle::from_file(source.into_std()).unwrap());
    let plan =
        PreparedRenameUndo::prepare(&authorities, parent, &old, &new, EntryKind::File, identity)
            .unwrap();
    fs::rename(&old, &new).unwrap();
    let undo = plan.commit().unwrap();
    let mut documents = document_service::DocumentService::with_authorities(authorities);
    let document = documents.open_authorized(&new).unwrap();
    documents.save(&document.id, "first").unwrap();
    documents.save(&document.id, "second").unwrap();
    let observed = same_file::Handle::from_file(fs::File::open(&new).unwrap()).unwrap();
    assert_eq!(undo.expected_identity().unwrap().as_ref(), &observed);
    fs::rename(&new, temp.path().join("external-original.md")).unwrap();
    fs::write(&new, b"second").unwrap();
    assert!(undo.expected_identity().is_err());
}
