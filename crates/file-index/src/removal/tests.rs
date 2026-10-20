use super::*;
use crate::{
    DocumentService, EntryKind, EntryRenamePreparation, EntryRenameResolution, SearchOptions,
};
use std::{fs, sync::Arc};

fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn fixture() -> (tempfile::TempDir, PathBuf, WorkspaceRegistry) {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir_all(root.join("目录😀/nested")).unwrap();
    fs::create_dir(root.join("目录😀-other")).unwrap();
    fs::create_dir(root.join("holding")).unwrap();
    fs::write(root.join("目录😀/nested/A.md"), b"Alpha\r\nTail  \n").unwrap();
    fs::write(root.join("Other.md"), b"Other").unwrap();
    (temporary, root, WorkspaceRegistry::default())
}

#[test]
fn removal_detaches_exact_and_nested_mounts_and_denies_retained_arcs_after_restore() {
    let (_temporary, root, mut registry) = fixture();
    let outer = registry.select_authorized(&root).unwrap();
    let exact = registry.select_authorized(&root.join("目录😀")).unwrap();
    let nested = registry
        .select_authorized(&root.join("目录😀/nested"))
        .unwrap();
    let sibling = registry
        .select_authorized(&root.join("目录😀-other"))
        .unwrap();
    let exact_arc = registry.get(&exact.id).unwrap();
    let nested_arc = registry.get(&nested.id).unwrap();
    let created = nested_arc
        .create_untitled(&id(), "", EntryKind::File, "md")
        .unwrap();
    let inspected = nested_arc.inspect_entry("A.md").unwrap();
    let operation = id();
    let prepared = match nested_arc
        .prepare_entry_rename(&operation, &inspected.entry_token, "B.md")
        .unwrap()
    {
        EntryRenamePreparation::Ready(plan) => plan,
        _ => panic!(),
    };
    if !crate::directory_test_support::rename_directory(
        &root.join("目录😀"),
        &root.join("holding/目录😀"),
    ) {
        assert!(registry.get(&exact.id).is_ok());
        assert!(registry.get(&nested.id).is_ok());
        assert_eq!(
            fs::read(root.join("目录😀/nested/A.md")).unwrap(),
            b"Alpha\r\nTail  \n"
        );
        return;
    }
    let detached = registry
        .detach_removed_directory(&root.join("目录😀"))
        .unwrap();
    assert_eq!(detached.len(), 2);
    assert!(detached.contains(&exact.id));
    assert!(detached.contains(&nested.id));
    assert!(registry.get(&exact.id).is_err());
    assert!(registry.get(&nested.id).is_err());
    assert!(registry.get(&outer.id).is_ok());
    assert!(registry.get(&sibling.id).is_ok());
    assert!(exact_arc.list_directory("").is_err());
    assert!(nested_arc.list_documents().is_err());
    assert!(nested_arc
        .search(SearchOptions {
            query: "Alpha",
            case_sensitive: true,
            whole_word: false,
            use_regex: false,
            max_results: 10
        })
        .is_err());
    assert!(nested_arc
        .open_document("A.md", &mut DocumentService::new())
        .is_err());
    assert!(nested_arc.bookmark().is_err());
    assert!(nested_arc
        .create_untitled(&id(), "", EntryKind::File, "md")
        .is_err());
    assert!(matches!(
        nested_arc.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::Rejected { .. })
    ));
    fs::rename(root.join("holding/目录😀"), root.join("目录😀")).unwrap();
    assert!(registry.get(&nested.id).is_err());
    assert!(nested_arc.list_directory("").is_err());
    assert!(nested_arc
        .prepare_creation_rename(&created.entry_token, "created.md")
        .is_err());
    assert!(nested_arc.commit_entry_rename(prepared).is_err());
    // Only an explicit fresh native selection grants a new mount ID.
    let fresh = registry
        .select_authorized(&root.join("目录😀/nested"))
        .unwrap();
    assert_ne!(fresh.id, nested.id);
    let fresh_arc = registry.get(&fresh.id).unwrap();
    assert!(fresh_arc.list_directory("").is_ok());
    assert!(nested_arc.list_directory("").is_err());
}

#[test]
fn outer_mount_keeps_other_authority_but_old_child_tokens_never_revive_after_undo() {
    let (_temporary, root, mut registry) = fixture();
    let selected = registry.select_authorized(&root).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let created_op = id();
    let created = workspace
        .create_untitled(&created_op, "目录😀/nested", EntryKind::File, "md")
        .unwrap();
    let creation_plan = workspace
        .prepare_creation_rename(&created.entry_token, "Created.md")
        .unwrap();
    let inside = workspace.inspect_entry("目录😀/nested/A.md").unwrap();
    let outside = workspace.inspect_entry("Other.md").unwrap();
    let inside_operation = id();
    let inside_plan = match workspace
        .prepare_entry_rename(&inside_operation, &inside.entry_token, "Changed.md")
        .unwrap()
    {
        EntryRenamePreparation::Ready(plan) => plan,
        _ => panic!(),
    };
    let outside_operation = id();
    let outside_plan = match workspace
        .prepare_entry_rename(&outside_operation, &outside.entry_token, "Other renamed.md")
        .unwrap()
    {
        EntryRenamePreparation::Ready(plan) => plan,
        _ => panic!(),
    };
    if !crate::directory_test_support::rename_directory(
        &root.join("目录😀"),
        &root.join("holding/目录😀"),
    ) {
        assert!(workspace.list_directory("").is_ok());
        assert_eq!(
            fs::read(root.join("目录😀/nested/A.md")).unwrap(),
            b"Alpha\r\nTail  \n"
        );
        return;
    }
    assert!(registry
        .detach_removed_directory(&root.join("目录😀"))
        .unwrap()
        .is_empty());
    assert!(Arc::ptr_eq(
        &workspace,
        &registry.get(&selected.id).unwrap()
    ));
    assert!(workspace.list_directory("").is_ok());
    workspace.commit_entry_rename(outside_plan).unwrap();
    assert!(matches!(
        workspace.resolve_entry_rename(&outside_operation).unwrap(),
        Some(EntryRenameResolution::Committed { .. })
    ));
    assert!(matches!(
        workspace.resolve_entry_rename(&inside_operation).unwrap(),
        Some(EntryRenameResolution::Rejected { .. })
    ));
    fs::rename(root.join("holding/目录😀"), root.join("目录😀")).unwrap();
    assert!(workspace.commit_creation_rename(creation_plan).is_err());
    assert!(workspace
        .prepare_creation_rename(&created.entry_token, "Created.md")
        .is_err());
    assert!(workspace.commit_entry_rename(inside_plan).is_err());
    assert!(workspace.prepare_entry_action(&inside.entry_token).is_err());
    let replay = workspace
        .create_untitled(&created_op, "目录😀/nested", EntryKind::File, "md")
        .unwrap();
    assert_eq!(replay, created); // Old receipt is not a recreated capability.
    assert!(workspace
        .prepare_creation_rename(&replay.entry_token, "Revived.md")
        .is_err());
    assert!(root.join(&created.relative_path).is_file());
    assert_eq!(
        fs::read(root.join("目录😀/nested/A.md")).unwrap(),
        b"Alpha\r\nTail  \n"
    );
    assert!(root.join("Other renamed.md").is_file());
}

#[test]
fn file_only_removal_invalidates_exact_creation_and_inspection_without_closing_mount() {
    let (_temporary, root, mut registry) = fixture();
    let selected = registry.select_authorized(&root).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let created = workspace
        .create_untitled(&id(), "", EntryKind::File, "md")
        .unwrap();
    let created_plan = workspace
        .prepare_creation_rename(&created.entry_token, "Created.md")
        .unwrap();
    let inspected = workspace.inspect_entry("Other.md").unwrap();
    let operation = id();
    let plan = match workspace
        .prepare_entry_rename(&operation, &inspected.entry_token, "Renamed.md")
        .unwrap()
    {
        EntryRenamePreparation::Ready(plan) => plan,
        _ => panic!(),
    };
    fs::rename(
        root.join(&created.relative_path),
        root.join("holding/created.md"),
    )
    .unwrap();
    fs::rename(root.join("Other.md"), root.join("holding/Other.md")).unwrap();
    registry
        .invalidate_removed_entries(&root.join(&created.relative_path))
        .unwrap();
    registry
        .invalidate_removed_entries(&root.join("Other.md"))
        .unwrap();
    assert!(registry.get(&selected.id).is_ok());
    assert!(matches!(
        workspace.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::Rejected { .. })
    ));
    fs::rename(
        root.join("holding/created.md"),
        root.join(&created.relative_path),
    )
    .unwrap();
    fs::rename(root.join("holding/Other.md"), root.join("Other.md")).unwrap();
    assert!(workspace.commit_creation_rename(created_plan).is_err());
    assert!(workspace.commit_entry_rename(plan).is_err());
    assert!(workspace.inspect_entry("Other.md").is_ok());
    assert!(workspace.list_directory("").is_ok());
}

#[test]
fn denial_does_not_read_deleted_paths_or_treat_string_prefix_siblings_as_descendants() {
    let (_temporary, root, mut registry) = fixture();
    let selected = registry.select_authorized(&root).unwrap();
    let nested = registry
        .select_authorized(&root.join("目录😀/nested"))
        .unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let sibling_created = workspace
        .create_untitled(&id(), "目录😀-other", EntryKind::File, "md")
        .unwrap();
    if !crate::directory_test_support::rename_directory(
        &root.join("目录😀"),
        &root.join("holding/目录😀"),
    ) {
        assert!(registry.get(&nested.id).is_ok());
        assert!(workspace
            .prepare_creation_rename(&sibling_created.entry_token, "Sibling.md")
            .is_ok());
        return;
    }
    // The removed prefix is absent; no metadata/canonicalize/reopen is needed.
    let detached = registry
        .detach_removed_directory(&root.join("目录😀"))
        .unwrap();
    assert_eq!(detached, vec![nested.id]);
    assert!(workspace
        .prepare_creation_rename(&sibling_created.entry_token, "Sibling.md")
        .is_ok());
    assert!(registry
        .detach_removed_directory(&root.join("nonexistent"))
        .unwrap()
        .is_empty());
}

#[test]
fn malformed_prefix_is_rejected_before_invalidating_other_tokens_or_mounts() {
    let (_temporary, root, mut registry) = fixture();
    let selected = registry.select_authorized(&root).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let entry = workspace.inspect_entry("Other.md").unwrap();
    for prefix in [
        PathBuf::from(""),
        PathBuf::from("relative"),
        // PathBuf::join normalizes ".." for verbatim Windows paths; preserve
        // the malformed input rather than accidentally testing a valid sibling.
        PathBuf::from(format!(
            "{}{sep}..{sep}outside",
            root.display(),
            sep = std::path::MAIN_SEPARATOR
        )),
        root.join("nul\0name"),
    ] {
        assert!(matches!(
            registry.detach_removed_directory(&prefix),
            Err(IndexError::InvalidPath)
        ));
        assert!(matches!(
            registry.invalidate_removed_entries(&prefix),
            Err(IndexError::InvalidPath)
        ));
        assert!(registry.get(&selected.id).is_ok());
        assert!(workspace.prepare_entry_action(&entry.entry_token).is_ok());
    }
}

#[test]
fn store_failure_quarantines_authority_instead_of_leaving_old_pending_writes_live() {
    let (_temporary, root, mut registry) = fixture();
    let selected = registry.select_authorized(&root).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let entry = workspace.inspect_entry("Other.md").unwrap();
    let poisoned = Arc::clone(&workspace);
    assert!(std::thread::spawn(move || {
        let _held = poisoned.entries.lock().unwrap();
        panic!("controlled pending store poison");
    })
    .join()
    .is_err());
    assert!(matches!(
        registry.invalidate_removed_entries(&root.join("Other.md")),
        Err(IndexError::MutationUncertain)
    ));
    assert!(workspace.list_directory("").is_err());
    assert!(workspace.prepare_entry_action(&entry.entry_token).is_err());
    assert!(workspace
        .create_untitled(&id(), "", EntryKind::File, "md")
        .is_err());
}
