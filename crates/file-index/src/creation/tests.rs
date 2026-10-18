use super::*;
use crate::WorkspaceRegistry;
use std::{fs, sync::Barrier, thread};

fn fixture() -> (tempfile::TempDir, Arc<Workspace>) {
    let temporary = tempfile::tempdir().unwrap();
    let mut registry = WorkspaceRegistry::default();
    let payload = registry.select_authorized(temporary.path()).unwrap();
    (temporary, registry.get(&payload.id).unwrap())
}
fn token() -> String {
    Uuid::new_v4().to_string()
}
fn create(workspace: &Workspace, kind: EntryKind) -> CreatedWorkspaceEntry {
    workspace.create_untitled(&token(), "", kind, "md").unwrap()
}

#[test]
fn host_idempotency_lookup_survives_finish_without_granting_or_creating() {
    let (root, workspace) = fixture();
    let operation = token();
    assert!(!workspace.creation_operation_known(&operation).unwrap());
    assert!(workspace.creation_operation_known("invalid").is_err());
    let entry = workspace
        .create_untitled(&operation, "", EntryKind::File, "md")
        .unwrap();
    assert!(workspace.creation_operation_known(&operation).unwrap());
    workspace.finish_creation(&entry.entry_token).unwrap();
    assert!(workspace.creation_operation_known(&operation).unwrap());
    let repeated = workspace
        .create_untitled(&operation, "", EntryKind::File, "md")
        .unwrap();
    assert_eq!(repeated.entry_token, entry.entry_token);
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn creates_real_empty_entities_before_inline_editing() {
    let (root, workspace) = fixture();
    let file = create(&workspace, EntryKind::File);
    let directory = create(&workspace, EntryKind::Directory);
    assert_eq!(file.name, "Untitled.md");
    assert_eq!(file.size, Some(0));
    assert_eq!(fs::read(root.path().join(&file.name)).unwrap(), b"");
    assert_eq!(directory.name, "Untitled Folder");
    assert_eq!(directory.size, None);
    assert!(root.path().join(&directory.name).is_dir());
}

#[test]
fn numbering_uses_maximum_not_gaps_and_matches_supported_suffixes_and_case() {
    let (root, workspace) = fixture();
    for name in ["Untitled.md", "uNtItLeD 001.markdown", "Untitled 3.txt"] {
        fs::write(root.path().join(name), name).unwrap();
    }
    fs::write(root.path().join("Untitled 99.bin"), b"unsupported").unwrap();
    fs::create_dir(root.path().join("Untitled Folder 01")).unwrap();
    fs::create_dir(root.path().join("uNTITLED folder 3")).unwrap();
    assert_eq!(create(&workspace, EntryKind::File).name, "Untitled 4.md");
    assert_eq!(
        create(&workspace, EntryKind::Directory).name,
        "Untitled Folder 4"
    );
    for name in ["Untitled.md", "uNtItLeD 001.markdown", "Untitled 3.txt"] {
        assert_eq!(fs::read(root.path().join(name)).unwrap(), name.as_bytes());
    }
}

#[test]
fn collisions_with_other_kinds_never_overwrite_and_new_directories_are_not_recursive() {
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("Untitled.md")).unwrap();
    fs::write(root.path().join("Untitled Folder"), b"keep").unwrap();
    assert_eq!(create(&workspace, EntryKind::File).name, "Untitled 1.md");
    assert_eq!(
        create(&workspace, EntryKind::Directory).name,
        "Untitled Folder 1"
    );
    assert_eq!(
        fs::read(root.path().join("Untitled Folder")).unwrap(),
        b"keep"
    );
    assert!(workspace
        .create_untitled(&token(), "missing/child", EntryKind::File, "md")
        .is_err());
    assert!(!root.path().join("missing").exists());
}

#[test]
fn same_operation_is_idempotent_and_all_different_parameters_are_rejected() {
    let (root, workspace) = fixture();
    let operation = token();
    let first = workspace
        .create_untitled(&operation, "", EntryKind::File, "md")
        .unwrap();
    for _ in 0..3 {
        assert_eq!(
            workspace
                .create_untitled(&operation, "", EntryKind::File, "md")
                .unwrap(),
            first
        );
    }
    for (parent, kind, extension) in [
        ("sub", EntryKind::File, "md"),
        ("", EntryKind::Directory, "md"),
        ("", EntryKind::File, "txt"),
    ] {
        assert!(workspace
            .create_untitled(&operation, parent, kind, extension)
            .is_err());
    }
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn concurrent_duplicate_request_creates_one_entity() {
    let (root, workspace) = fixture();
    let operation = token();
    let barrier = Arc::new(Barrier::new(8));
    let workers: Vec<_> = (0..8)
        .map(|_| {
            let workspace = Arc::clone(&workspace);
            let operation = operation.clone();
            let barrier = Arc::clone(&barrier);
            thread::spawn(move || {
                barrier.wait();
                workspace
                    .create_untitled(&operation, "", EntryKind::File, "md")
                    .unwrap()
            })
        })
        .collect();
    let entries: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert!(entries.iter().all(|entry| entry == &entries[0]));
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn independent_workspace_stores_exclusively_create_different_entities() {
    let root = tempfile::tempdir().unwrap();
    let mut registry = WorkspaceRegistry::default();
    let mut workspaces = vec![];
    for _ in 0..8 {
        let payload = registry.select_authorized(root.path()).unwrap();
        workspaces.push(registry.get(&payload.id).unwrap());
    }
    let barrier = Arc::new(Barrier::new(8));
    let workers: Vec<_> = workspaces
        .into_iter()
        .map(|workspace| {
            let barrier = Arc::clone(&barrier);
            thread::spawn(move || {
                barrier.wait();
                create(&workspace, EntryKind::File)
            })
        })
        .collect();
    let names: std::collections::HashSet<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap().name)
        .collect();
    assert_eq!(names.len(), 8);
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 8);
}

#[test]
fn cancelling_keeps_the_entity_and_does_not_regrant_on_create_retry() {
    let (root, workspace) = fixture();
    let entry = create(&workspace, EntryKind::File);
    workspace.finish_creation(&entry.entry_token).unwrap();
    workspace.finish_creation(&entry.entry_token).unwrap();
    assert!(root.path().join(&entry.name).is_file());
    assert!(workspace
        .prepare_creation_rename(&entry.entry_token, "new.md")
        .is_err());
    assert_eq!(
        workspace
            .create_untitled(&entry.entry_token, "", EntryKind::File, "md")
            .unwrap(),
        entry
    );
    assert!(workspace
        .prepare_creation_rename(&entry.entry_token, "new.md")
        .is_err());
}

#[test]
fn preparing_is_read_only_and_plan_exposes_only_the_authorized_parent_and_names() {
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("sub")).unwrap();
    let entry = workspace
        .create_untitled(&token(), "sub", EntryKind::File, "md")
        .unwrap();
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "中文 final.md")
        .unwrap();
    assert_eq!(plan.old_name(), Path::new("Untitled.md"));
    assert_eq!(plan.new_name(), Path::new("中文 final.md"));
    assert_eq!(
        plan.old_display_path(),
        workspace
            .display_root_snapshot()
            .unwrap()
            .join("sub/Untitled.md")
    );
    assert_eq!(
        plan.new_display_path(),
        workspace
            .display_root_snapshot()
            .unwrap()
            .join("sub/中文 final.md")
    );
    assert_eq!(plan.kind(), EntryKind::File);
    assert_eq!(plan.entry_token(), entry.entry_token);
    assert!(plan
        .directory()
        .metadata(plan.old_name())
        .unwrap()
        .is_file());
    assert!(root.path().join("sub/Untitled.md").exists());
    assert!(!root.path().join("sub/中文 final.md").exists());
}

#[test]
fn invalid_tokens_paths_extensions_and_cross_platform_names_have_no_side_effects() {
    let (root, workspace) = fixture();
    for parent in ["../outside", "/tmp", "a//b", "a/../b", "a\\b", "a:b", "."] {
        assert!(workspace
            .create_untitled(&token(), parent, EntryKind::File, "md")
            .is_err());
    }
    for extension in [".md", "md/xx", "../md", "md\0", "md.", "m d"] {
        assert!(workspace
            .create_untitled(&token(), "", EntryKind::File, extension)
            .is_err());
    }
    assert!(workspace
        .create_untitled("not-a-uuid", "", EntryKind::File, "md")
        .is_err());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    let entry = create(&workspace, EntryKind::File);
    for name in [
        "",
        ".",
        "..",
        "x/y.md",
        "../new.md",
        "a\\b",
        "x:y",
        "NUL.md",
        "CON",
        "COM1.txt",
        "LPT9",
        "last.",
        "last ",
        "  ",
        "line\nbreak",
        "x?y",
        "a*b",
        "x\0y",
    ] {
        assert!(
            workspace
                .prepare_creation_rename(&entry.entry_token, name)
                .is_err(),
            "{name:?}"
        );
    }
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn failed_post_create_identity_check_does_not_create_again_on_retry() {
    let (root, workspace) = fixture();
    let operation = token();
    let result = workspace.create_untitled_with_hook(&operation, "", EntryKind::File, "md", || {
        fs::rename(
            root.path().join("Untitled.md"),
            root.path().join("our-created.md"),
        )
        .unwrap();
        fs::write(root.path().join("Untitled.md"), b"external").unwrap();
    });
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert!(matches!(
        workspace.create_untitled(&operation, "", EntryKind::File, "md"),
        Err(IndexError::MutationUncertain)
    ));
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
    assert!(!root.path().join("Untitled 1.md").exists());
    assert_eq!(
        fs::read(root.path().join("Untitled.md")).unwrap(),
        b"external"
    );
    assert!(workspace
        .prepare_creation_rename(&operation, "new.md")
        .is_err());
}

#[test]
fn pending_and_receipt_capacity_are_bounded_without_evicting_idempotency() {
    let (root, workspace) = fixture();
    let first = create(&workspace, EntryKind::File);
    for _ in 1..MAX_PENDING {
        create(&workspace, EntryKind::File);
    }
    assert!(workspace
        .create_untitled(&token(), "", EntryKind::File, "md")
        .is_err());
    let tokens: Vec<_> = workspace
        .creations
        .lock()
        .unwrap()
        .pending
        .keys()
        .cloned()
        .collect();
    for token in tokens {
        workspace.finish_creation(&token).unwrap();
    }
    for _ in MAX_PENDING..MAX_RECEIPTS {
        let entry = create(&workspace, EntryKind::File);
        workspace.finish_creation(&entry.entry_token).unwrap();
    }
    assert!(workspace
        .create_untitled(&token(), "", EntryKind::File, "md")
        .is_err());
    assert_eq!(
        workspace
            .create_untitled(&first.entry_token, "", EntryKind::File, "md")
            .unwrap(),
        first
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), MAX_RECEIPTS);
}

#[test]
fn directory_creation_after_create_root_move_reports_uncertain_without_retrying() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("root");
    let moved = temporary.path().join("moved");
    fs::create_dir(&root).unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(&root).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let operation = token();
    let result =
        workspace.create_untitled_with_hook(&operation, "", EntryKind::Directory, "md", || {
            fs::rename(&root, &moved).unwrap();
            fs::create_dir(&root).unwrap();
            fs::write(root.join("external.md"), b"untouched").unwrap();
        });
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert!(moved.join("Untitled Folder").is_dir());
    assert!(!root.join("Untitled Folder").exists());
    assert!(matches!(
        workspace.create_untitled(&operation, "", EntryKind::Directory, "md"),
        Err(IndexError::MutationUncertain)
    ));
    assert!(workspace
        .prepare_creation_rename(&operation, "renamed")
        .is_err());
    workspace.finish_creation(&operation).unwrap();
    assert_eq!(fs::read(root.join("external.md")).unwrap(), b"untouched");
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
}

#[test]
fn source_replacement_after_prepare_is_not_renamed() {
    let (root, workspace) = fixture();
    let entry = create(&workspace, EntryKind::File);
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "renamed.md")
        .unwrap();
    fs::rename(
        root.path().join(&entry.name),
        root.path().join("original-created.md"),
    )
    .unwrap();
    fs::write(root.path().join(&entry.name), b"external replacement").unwrap();
    assert!(
        matches!(workspace.commit_creation_rename(plan), Err(IndexError::Io(error)) if error.kind() == io::ErrorKind::PermissionDenied)
    );
    assert!(!root.path().join("renamed.md").exists());
    assert_eq!(
        fs::read(root.path().join(&entry.name)).unwrap(),
        b"external replacement"
    );
    assert!(root.path().join("original-created.md").exists());
}

#[test]
fn parent_replacement_and_root_rename_are_rejected_without_touching_replacement() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("root");
    fs::create_dir(&root).unwrap();
    fs::create_dir(root.join("sub")).unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(&root).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let entry = workspace
        .create_untitled(&token(), "sub", EntryKind::File, "md")
        .unwrap();
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "renamed.md")
        .unwrap();
    fs::rename(root.join("sub"), root.join("moved-sub")).unwrap();
    fs::create_dir(root.join("sub")).unwrap();
    fs::write(root.join("sub/Untitled.md"), b"replacement").unwrap();
    assert!(workspace.commit_creation_rename(plan).is_err());
    assert_eq!(
        fs::read(root.join("sub/Untitled.md")).unwrap(),
        b"replacement"
    );
    let plan_entry = create(&workspace, EntryKind::File);
    let plan = workspace
        .prepare_creation_rename(&plan_entry.entry_token, "new.md")
        .unwrap();
    fs::rename(&root, temporary.path().join("moved-root")).unwrap();
    fs::create_dir(&root).unwrap();
    assert!(workspace.commit_creation_rename(plan).is_err());
    assert!(workspace
        .create_untitled(&token(), "", EntryKind::File, "md")
        .is_err());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 0);
    assert!(temporary.path().join("moved-root/Untitled.md").exists());
}

#[test]
fn plan_cannot_cross_workspace_even_when_both_authorize_the_same_directory() {
    let (root, workspace) = fixture();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(root.path()).unwrap();
    let other = registry.get(&selected.id).unwrap();
    let entry = create(&workspace, EntryKind::File);
    assert!(other
        .prepare_creation_rename(&entry.entry_token, "other.md")
        .is_err());
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "other.md")
        .unwrap();
    assert!(other.commit_creation_rename(plan).is_err());
    assert!(root.path().join(&entry.name).exists());
    assert!(!root.path().join("other.md").exists());
}

#[test]
fn finishing_during_host_preflight_invalidates_the_uncommitted_plan() {
    let (root, workspace) = fixture();
    let entry = create(&workspace, EntryKind::File);
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "new.md")
        .unwrap();
    workspace.finish_creation(&entry.entry_token).unwrap();
    assert!(workspace.commit_creation_rename(plan).is_err());
    assert!(root.path().join(&entry.name).exists());
    assert!(!root.path().join("new.md").exists());
}

#[test]
fn mount_preflight_checks_lexical_descendants_and_exact_capability_identity() {
    let temporary = tempfile::tempdir().unwrap();
    fs::create_dir(temporary.path().join("mounted")).unwrap();
    fs::create_dir(temporary.path().join("other")).unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(&root.join("mounted")).unwrap();
    let mounted = registry.get(&selected.id).unwrap();
    assert!(registry.has_root_within(&root));
    assert!(registry.has_root_within(&root.join("mounted")));
    assert!(!registry.has_root_within(&root.join("other")));
    assert!(registry.has_root_within(Path::new("relative-denied")));
    assert!(registry.has_root_directory(&mounted.root).unwrap());
    let other = Dir::open_ambient_dir(root.join("other"), cap_std::ambient_authority()).unwrap();
    assert!(!registry.has_root_directory(&other).unwrap());
}

#[cfg(unix)]
#[test]
fn symlink_parents_and_replaced_source_links_cannot_gain_access() {
    use std::os::unix::fs::symlink;
    let (root, workspace) = fixture();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("outside.md"), b"outside").unwrap();
    symlink(outside.path(), root.path().join("link")).unwrap();
    assert!(workspace
        .create_untitled(&token(), "link", EntryKind::File, "md")
        .is_err());
    let entry = create(&workspace, EntryKind::File);
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "new.md")
        .unwrap();
    fs::remove_file(root.path().join(&entry.name)).unwrap();
    symlink(
        outside.path().join("outside.md"),
        root.path().join(&entry.name),
    )
    .unwrap();
    assert!(workspace.commit_creation_rename(plan).is_err());
    assert_eq!(
        fs::read(outside.path().join("outside.md")).unwrap(),
        b"outside"
    );
    assert!(!root.path().join("new.md").exists());
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn successful_rename_preserves_entity_bytes_and_consumes_all_prepared_plans() {
    let (root, workspace) = fixture();
    let entry = create(&workspace, EntryKind::File);
    fs::write(root.path().join(&entry.name), b"\xef\xbb\xbfraw\r\n tail ").unwrap();
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "renamed.md")
        .unwrap();
    let stale = workspace
        .prepare_creation_rename(&entry.entry_token, "again.md")
        .unwrap();
    let renamed = workspace.commit_creation_rename(plan).unwrap();
    assert_eq!(renamed.name, "renamed.md");
    assert_eq!(renamed.relative_path, "renamed.md");
    assert_eq!(renamed.size, Some(14));
    assert!(!root.path().join(&entry.name).exists());
    assert_eq!(
        fs::read(root.path().join(&renamed.name)).unwrap(),
        b"\xef\xbb\xbfraw\r\n tail "
    );
    assert!(workspace.commit_creation_rename(stale).is_err());
    assert!(workspace
        .prepare_creation_rename(&entry.entry_token, "again.md")
        .is_err());
    workspace.finish_creation(&entry.entry_token).unwrap();
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn a_destination_created_after_preparation_is_never_replaced_and_can_retry() {
    let (root, workspace) = fixture();
    let entry = create(&workspace, EntryKind::File);
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "occupied.md")
        .unwrap();
    fs::write(root.path().join("occupied.md"), b"must survive").unwrap();
    assert!(
        matches!(workspace.commit_creation_rename(plan), Err(IndexError::Io(error)) if error.kind() == io::ErrorKind::AlreadyExists)
    );
    assert_eq!(
        fs::read(root.path().join("occupied.md")).unwrap(),
        b"must survive"
    );
    assert!(root.path().join(&entry.name).exists());
    let retry = workspace
        .prepare_creation_rename(&entry.entry_token, "free.md")
        .unwrap();
    workspace.commit_creation_rename(retry).unwrap();
    assert!(root.path().join("free.md").exists());
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn directories_keep_their_children_and_same_name_finishes_without_a_move() {
    let (root, workspace) = fixture();
    let entry = create(&workspace, EntryKind::Directory);
    fs::write(root.path().join(&entry.name).join("child.md"), b"child").unwrap();
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "Folder final")
        .unwrap();
    workspace.commit_creation_rename(plan).unwrap();
    assert_eq!(
        fs::read(root.path().join("Folder final/child.md")).unwrap(),
        b"child"
    );
    let entry = create(&workspace, EntryKind::File);
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, &entry.name)
        .unwrap();
    assert_eq!(workspace.commit_creation_rename(plan).unwrap(), entry);
    assert!(workspace
        .prepare_creation_rename(&entry.entry_token, "next.md")
        .is_err());
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn two_independent_renames_cannot_replace_the_same_destination() {
    let (root, first) = fixture();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(root.path()).unwrap();
    let second = registry.get(&selected.id).unwrap();
    let a = create(&first, EntryKind::File);
    let b = create(&second, EntryKind::File);
    fs::write(root.path().join(&a.name), b"A").unwrap();
    fs::write(root.path().join(&b.name), b"B").unwrap();
    let a_plan = first
        .prepare_creation_rename(&a.entry_token, "winner.md")
        .unwrap();
    let b_plan = second
        .prepare_creation_rename(&b.entry_token, "winner.md")
        .unwrap();
    let barrier = Arc::new(Barrier::new(2));
    let a_barrier = Arc::clone(&barrier);
    let one = thread::spawn(move || {
        a_barrier.wait();
        first.commit_creation_rename(a_plan).is_ok()
    });
    let two = thread::spawn(move || {
        barrier.wait();
        second.commit_creation_rename(b_plan).is_ok()
    });
    assert_ne!(one.join().unwrap(), two.join().unwrap());
    let result = fs::read(root.path().join("winner.md")).unwrap();
    assert!(result == b"A" || result == b"B");
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn real_rename_then_source_replacement_reports_uncertain_and_consumes_token() {
    let (root, workspace) = fixture();
    let entry = create(&workspace, EntryKind::File);
    fs::write(root.path().join(&entry.name), b"ours").unwrap();
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "renamed.md")
        .unwrap();
    let result = workspace.commit_with_postcommit_hook(plan, || {
        // Only exists after the actual successful no-replace syscall.
        assert!(!root.path().join(&entry.name).exists());
        assert_eq!(fs::read(root.path().join("renamed.md")).unwrap(), b"ours");
        fs::rename(
            root.path().join("renamed.md"),
            root.path().join("moved-ours.md"),
        )
        .unwrap();
        fs::write(root.path().join("renamed.md"), b"external replacement").unwrap();
    });
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert_eq!(
        fs::read(root.path().join("renamed.md")).unwrap(),
        b"external replacement"
    );
    assert_eq!(
        fs::read(root.path().join("moved-ours.md")).unwrap(),
        b"ours"
    );
    assert!(!root.path().join(&entry.name).exists());
    assert!(!workspace
        .creations
        .lock()
        .unwrap()
        .pending
        .contains_key(&entry.entry_token));
    assert!(workspace
        .prepare_creation_rename(&entry.entry_token, "retry.md")
        .is_err());
    workspace.finish_creation(&entry.entry_token).unwrap();
    assert_eq!(
        workspace
            .create_untitled(&entry.entry_token, "", EntryKind::File, "md")
            .unwrap(),
        entry
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn real_rename_then_root_move_reports_uncertain_without_touching_replacement_root() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("root");
    let moved = temporary.path().join("moved");
    fs::create_dir(&root).unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(&root).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let entry = create(&workspace, EntryKind::File);
    fs::write(root.join(&entry.name), b"ours").unwrap();
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "renamed.md")
        .unwrap();
    let result = workspace.commit_with_postcommit_hook(plan, || {
        assert_eq!(fs::read(root.join("renamed.md")).unwrap(), b"ours");
        fs::rename(&root, &moved).unwrap();
        fs::create_dir(&root).unwrap();
        fs::write(root.join("renamed.md"), b"replacement root").unwrap();
    });
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert_eq!(
        fs::read(root.join("renamed.md")).unwrap(),
        b"replacement root"
    );
    assert_eq!(fs::read(moved.join("renamed.md")).unwrap(), b"ours");
    assert!(!moved.join(&entry.name).exists());
    assert!(!root.join(&entry.name).exists());
    assert!(!workspace
        .creations
        .lock()
        .unwrap()
        .pending
        .contains_key(&entry.entry_token));
    assert!(workspace
        .prepare_creation_rename(&entry.entry_token, "retry.md")
        .is_err());
    workspace.finish_creation(&entry.entry_token).unwrap();
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    assert_eq!(fs::read_dir(&moved).unwrap().count(), 1);
}

#[cfg(not(any(target_os = "macos", windows)))]
#[test]
fn unsupported_platform_never_falls_back_to_replacing_rename() {
    let (root, workspace) = fixture();
    let entry = create(&workspace, EntryKind::File);
    let plan = workspace
        .prepare_creation_rename(&entry.entry_token, "new.md")
        .unwrap();
    assert!(
        matches!(workspace.commit_creation_rename(plan), Err(IndexError::Io(error)) if error.kind() == io::ErrorKind::Unsupported)
    );
    assert!(root.path().join(&entry.name).exists());
    assert!(!root.path().join("new.md").exists());
}
