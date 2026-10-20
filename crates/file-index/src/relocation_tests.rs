use crate::*;
use std::{fs, sync::Arc};

fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[test]
fn directory_move_retargets_nested_mounts_and_live_tokens_without_reauthorizing() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    fs::create_dir_all(root.join("Old/nested")).unwrap();
    fs::write(
        root.join("Old/nested/note.md"),
        b"\xef\xbb\xbf# Note\r\nTail  \n",
    )
    .unwrap();
    let mut registry = WorkspaceRegistry::default();
    let outer = registry.select_authorized(&root).unwrap();
    let inner = registry
        .select_authorized(&root.join("Old/nested"))
        .unwrap();
    let outer_ws = registry.get(&outer.id).unwrap();
    let inner_ws = registry.get(&inner.id).unwrap();
    let created = outer_ws
        .create_untitled(&id(), "Old/nested", EntryKind::File, "md")
        .unwrap();
    let stale_create = outer_ws
        .prepare_creation_rename(&created.entry_token, "created.md")
        .unwrap();
    let inspected = inner_ws.inspect_entry("note.md").unwrap();
    let inspected_outer = outer_ws.inspect_entry("Old/nested/note.md").unwrap();
    let target = outer_ws.inspect_entry("Old").unwrap();
    let rename = match outer_ws
        .prepare_entry_rename(&id(), &target.entry_token, "New")
        .unwrap()
    {
        EntryRenamePreparation::Ready(plan) => plan,
        _ => panic!(),
    };
    let source = rename.directory().open_dir(rename.old_name()).unwrap();
    let plans = registry
        .prepare_relocation(&source, &root.join("Old"), &root.join("New"))
        .unwrap();
    assert_eq!(plans.len(), 2);
    for (_, plan) in &plans {
        plan.validate().unwrap();
    }
    if crate::directory_test_support::directory_move_result(outer_ws.commit_entry_rename(rename))
        .is_none()
    {
        assert!(inner_ws.inspect_entry("note.md").is_ok());
        assert!(root.join("Old/nested/note.md").is_file());
        assert!(!root.join("New").exists());
        return;
    }
    for (id, plan) in plans {
        assert_eq!(plan.commit(&id).unwrap().metadata_revision, 1);
    }
    assert!(Arc::ptr_eq(&registry.get(&outer.id).unwrap(), &outer_ws));
    assert!(Arc::ptr_eq(&registry.get(&inner.id).unwrap(), &inner_ws));
    assert_eq!(
        inner_ws.display_root_snapshot().unwrap(),
        root.join("New/nested")
    );
    assert_eq!(outer_ws.display_root_snapshot().unwrap(), root);
    assert!(outer_ws.commit_creation_rename(stale_create).is_err());
    let fresh = outer_ws
        .prepare_creation_rename(&created.entry_token, "created.md")
        .unwrap();
    assert_eq!(
        fresh.old_display_path(),
        root.join("New/nested/Untitled.md")
    );
    outer_ws.commit_creation_rename(fresh).unwrap();
    let rename = match inner_ws
        .prepare_entry_rename(&id(), &inspected.entry_token, "renamed.md")
        .unwrap()
    {
        EntryRenamePreparation::Ready(plan) => plan,
        _ => panic!(),
    };
    assert_eq!(rename.old_display_path(), root.join("New/nested/note.md"));
    // Another window's retained token points at the same inode and has also
    // moved; a fresh plan can describe it, but will not survive a later rename.
    let other = match outer_ws
        .prepare_entry_rename(&id(), &inspected_outer.entry_token, "later.md")
        .unwrap()
    {
        EntryRenamePreparation::Ready(plan) => plan,
        _ => panic!(),
    };
    assert_eq!(other.old_display_path(), rename.old_display_path());
    inner_ws.commit_entry_rename(rename).unwrap();
    assert!(outer_ws.commit_entry_rename(other).is_err());
    assert_eq!(
        fs::read(root.join("New/nested/renamed.md")).unwrap(),
        b"\xef\xbb\xbf# Note\r\nTail  \n"
    );
    assert!(root.join("New/nested/created.md").is_file());
}

#[test]
fn prepare_drop_is_read_only_and_wrong_directory_identity_is_rejected() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    fs::create_dir_all(root.join("Old")).unwrap();
    fs::create_dir_all(root.join("Other")).unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(&root).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let source = workspace.root.open_dir("Old").unwrap();
    drop(
        registry
            .prepare_relocation(&source, &root.join("Old"), &root.join("New"))
            .unwrap(),
    );
    assert_eq!(workspace.display_root_revision().unwrap(), 0);
    assert!(root.join("Old").is_dir());
    assert!(!root.join("New").exists());
    let wrong = workspace.root.open_dir("Other").unwrap();
    assert!(registry
        .prepare_relocation(&wrong, &root.join("Old"), &root.join("New"))
        .is_err());
}

#[test]
fn lost_creation_ack_after_ancestor_move_replays_only_receipt_and_finishes_retargeted_token_once() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    fs::create_dir_all(root.join("Old/nested")).unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(&root).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let operation = id();
    let receipt = workspace
        .create_untitled(&operation, "Old/nested", EntryKind::File, "md")
        .unwrap();
    let stale = workspace
        .prepare_creation_rename(&receipt.entry_token, "late.md")
        .unwrap();
    let source = workspace.root.open_dir("Old").unwrap();
    let plans = registry
        .prepare_relocation(&source, &root.join("Old"), &root.join("New"))
        .unwrap();
    if !crate::directory_test_support::rename_directory(&root.join("Old"), &root.join("New")) {
        assert_eq!(
            workspace
                .create_untitled(&operation, "Old/nested", EntryKind::File, "md")
                .unwrap(),
            receipt
        );
        assert!(root.join("Old/nested/Untitled.md").is_file());
        return;
    }
    for (id, plan) in plans {
        plan.commit(&id).unwrap();
    }
    let replay = workspace
        .create_untitled(&operation, "Old/nested", EntryKind::File, "md")
        .unwrap();
    assert_eq!(replay, receipt);
    assert!(!root.join("Old").exists());
    assert!(workspace.commit_creation_rename(stale).is_err());
    let current = workspace
        .prepare_creation_rename(&replay.entry_token, "late.md")
        .unwrap();
    assert_eq!(
        current.old_display_path(),
        root.join("New/nested/Untitled.md")
    );
    workspace.finish_creation(&replay.entry_token).unwrap();
    workspace.finish_creation(&replay.entry_token).unwrap();
    assert!(workspace.commit_creation_rename(current).is_err());
    assert!(workspace
        .prepare_creation_rename(&replay.entry_token, "revived.md")
        .is_err());
    assert_eq!(
        workspace
            .create_untitled(&operation, "Old/nested", EntryKind::File, "md")
            .unwrap(),
        receipt
    );
    assert!(root.join("New/nested/Untitled.md").is_file());
    assert!(!root.join("New/nested/late.md").exists());
}

#[test]
fn stale_plan_cannot_overwrite_a_later_binding_and_uncertain_mount_is_revoked() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    fs::create_dir_all(root.join("Old")).unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(&root.join("Old")).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let source = workspace.root.try_clone().unwrap();
    let mut plans = registry
        .prepare_relocation(&source, &root.join("Old"), &root.join("New"))
        .unwrap();
    let mut stale = registry
        .prepare_relocation(&source, &root.join("Old"), &root.join("Else"))
        .unwrap();
    if !crate::directory_test_support::rename_directory(&root.join("Old"), &root.join("New")) {
        assert!(workspace.bookmark().is_ok());
        assert!(workspace.list_directory("").is_ok());
        return;
    }
    plans.pop().unwrap().1.commit(&selected.id).unwrap();
    assert!(stale[0].1.validate().is_err());
    assert!(stale.pop().unwrap().1.commit(&selected.id).is_err());
    assert!(workspace.display_root_snapshot().is_err());
    assert!(workspace.bookmark().is_err());
    assert!(workspace.list_directory("").is_err());
    assert!(workspace
        .create_untitled(&id(), "", EntryKind::File, "md")
        .is_err());
    assert!(workspace.inspect_entry("a.md").is_err());
    assert!(workspace
        .search(SearchOptions {
            query: "a",
            case_sensitive: true,
            whole_word: false,
            use_regex: false,
            max_results: 1
        })
        .is_err());
    assert!(workspace
        .open_document("a.md", &mut DocumentService::new())
        .is_err());
    assert!(root.join("New").is_dir());
    assert!(!root.join("Else").exists());
}

#[test]
fn directory_symlink_never_proves_source_membership() {
    #[cfg(unix)]
    {
        let temp = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temp.path()).unwrap();
        fs::create_dir(root.join("Real")).unwrap();
        std::os::unix::fs::symlink("Real", root.join("Alias")).unwrap();
        let mut registry = WorkspaceRegistry::default();
        registry.select_authorized(&root).unwrap();
        let source = Dir::open_ambient_dir(root.join("Real"), ambient_authority()).unwrap();
        assert!(registry
            .prepare_relocation(&source, &root.join("Alias"), &root.join("New"))
            .is_err());
    }
}
