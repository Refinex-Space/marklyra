use super::*;
use crate::WorkspaceRegistry;
use std::fs;

fn fixture() -> (tempfile::TempDir, Arc<Workspace>) {
    let root = tempfile::tempdir().unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(root.path()).unwrap();
    (root, registry.get(&selected.id).unwrap())
}

#[test]
fn preflight_is_read_only_preserves_original_arcs_and_does_not_consume() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("a.md"), b"\xef\xbb\xbfA\r\nTail").unwrap();
    fs::create_dir(root.path().join("folder")).unwrap();
    fs::write(root.path().join("folder/child.md"), b"child").unwrap();
    for (relative, kind) in [("a.md", EntryKind::File), ("folder", EntryKind::Directory)] {
        let entry = workspace.inspect_entry(relative).unwrap();
        let first = workspace.prepare_entry_action(&entry.entry_token).unwrap();
        let second = workspace.prepare_entry_action(&entry.entry_token).unwrap();
        assert_eq!(first.name(), Path::new(relative));
        assert_eq!(
            first.display_path(),
            workspace.display_root_snapshot().unwrap().join(relative)
        );
        assert_eq!(first.kind(), kind);
        assert_eq!(first.entry_token(), entry.entry_token);
        assert!(Arc::ptr_eq(&first.directory(), &second.directory()));
        assert!(Arc::ptr_eq(&first.source(), &second.source()));
        assert!(Arc::ptr_eq(
            &first.source_identity(),
            &second.source_identity()
        ));
        workspace.validate_entry_action(&first).unwrap();
        assert!(workspace
            .resolve_entry_rename(&Uuid::new_v4().to_string())
            .unwrap()
            .is_none());
        workspace
            .finish_entry_inspection(&entry.entry_token)
            .unwrap();
        assert!(workspace.validate_entry_action(&first).is_err());
        assert!(workspace.prepare_entry_action(&entry.entry_token).is_err());
    }
    assert_eq!(
        fs::read(root.path().join("a.md")).unwrap(),
        b"\xef\xbb\xbfA\r\nTail"
    );
    assert_eq!(
        fs::read(root.path().join("folder/child.md")).unwrap(),
        b"child"
    );
}

#[test]
fn foreign_finished_creation_and_unrecognized_tokens_cannot_be_actions() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("a.md"), b"A").unwrap();
    let entry = workspace.inspect_entry("a.md").unwrap();
    let plan = workspace.prepare_entry_action(&entry.entry_token).unwrap();
    let mut registry = WorkspaceRegistry::default();
    let other = registry.select_authorized(root.path()).unwrap();
    let other = registry.get(&other.id).unwrap();
    assert!(other.prepare_entry_action(&entry.entry_token).is_err());
    assert!(other.validate_entry_action(&plan).is_err());
    for token in ["not-uuid".to_owned(), Uuid::new_v4().to_string()] {
        assert!(workspace.prepare_entry_action(&token).is_err());
    }
    let created = workspace
        .create_untitled(&Uuid::new_v4().to_string(), "", EntryKind::File, "md")
        .unwrap();
    assert!(workspace
        .prepare_entry_action(&created.entry_token)
        .is_err());
    workspace.finish_creation(&created.entry_token).unwrap();
    assert!(workspace
        .prepare_entry_action(&created.entry_token)
        .is_err());
}

#[test]
fn source_and_parent_replacement_reject_both_prepared_and_new_preflight() {
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("parent")).unwrap();
    fs::write(root.path().join("parent/a.md"), b"same").unwrap();
    let entry = workspace.inspect_entry("parent/a.md").unwrap();
    let plan = workspace.prepare_entry_action(&entry.entry_token).unwrap();
    fs::rename(
        root.path().join("parent/a.md"),
        root.path().join("parent/retained.md"),
    )
    .unwrap();
    fs::write(root.path().join("parent/a.md"), b"same").unwrap();
    assert!(workspace.validate_entry_action(&plan).is_err());
    assert!(workspace.prepare_entry_action(&entry.entry_token).is_err());
    let fresh = workspace.inspect_entry("parent/a.md").unwrap();
    let plan = workspace.prepare_entry_action(&fresh.entry_token).unwrap();
    if !crate::directory_test_support::rename_directory(
        &root.path().join("parent"),
        &root.path().join("retained"),
    ) {
        workspace.validate_entry_action(&plan).unwrap();
        assert_eq!(fs::read(root.path().join("parent/a.md")).unwrap(), b"same");
        return;
    }
    fs::create_dir(root.path().join("parent")).unwrap();
    fs::write(root.path().join("parent/a.md"), b"replacement").unwrap();
    assert!(workspace.validate_entry_action(&plan).is_err());
    assert!(workspace.prepare_entry_action(&fresh.entry_token).is_err());
    assert_eq!(
        fs::read(root.path().join("parent/a.md")).unwrap(),
        b"replacement"
    );
}

#[test]
fn root_replacement_and_same_text_revision_aba_reject_old_plan() {
    let outer = tempfile::tempdir().unwrap();
    let path = outer.path().join("root");
    fs::create_dir(&path).unwrap();
    fs::write(path.join("a.md"), b"A").unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(&path).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let entry = workspace.inspect_entry("a.md").unwrap();
    let plan = workspace.prepare_entry_action(&entry.entry_token).unwrap();
    {
        let mut location = workspace.location.lock().unwrap();
        location.revision += 2;
    }
    assert!(workspace.validate_entry_action(&plan).is_err());
    let fresh = workspace.prepare_entry_action(&entry.entry_token).unwrap();
    if !crate::directory_test_support::rename_directory(&path, &outer.path().join("retained")) {
        workspace.validate_entry_action(&fresh).unwrap();
        assert_eq!(fs::read(path.join("a.md")).unwrap(), b"A");
        return;
    }
    fs::create_dir(&path).unwrap();
    fs::write(path.join("a.md"), b"new root").unwrap();
    assert!(workspace.validate_entry_action(&fresh).is_err());
    assert!(workspace.prepare_entry_action(&entry.entry_token).is_err());
    assert_eq!(fs::read(path.join("a.md")).unwrap(), b"new root");
}

#[cfg(unix)]
#[test]
fn source_and_ancestor_symlink_substitution_never_gains_a_new_grant() {
    use std::os::unix::fs::symlink;
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("parent")).unwrap();
    fs::write(root.path().join("parent/a.md"), b"A").unwrap();
    let entry = workspace.inspect_entry("parent/a.md").unwrap();
    let plan = workspace.prepare_entry_action(&entry.entry_token).unwrap();
    fs::rename(
        root.path().join("parent/a.md"),
        root.path().join("parent/retained.md"),
    )
    .unwrap();
    symlink("retained.md", root.path().join("parent/a.md")).unwrap();
    assert!(workspace.validate_entry_action(&plan).is_err());
    assert!(workspace.prepare_entry_action(&entry.entry_token).is_err());
    fs::remove_file(root.path().join("parent/a.md")).unwrap();
    fs::rename(
        root.path().join("parent/retained.md"),
        root.path().join("parent/a.md"),
    )
    .unwrap();
    let fresh = workspace.prepare_entry_action(&entry.entry_token).unwrap();
    fs::rename(root.path().join("parent"), root.path().join("retained")).unwrap();
    symlink("retained", root.path().join("parent")).unwrap();
    assert!(workspace.validate_entry_action(&fresh).is_err());
    assert!(workspace.prepare_entry_action(&entry.entry_token).is_err());
}
