use super::*;
use crate::WorkspaceRegistry;
use std::fs;

fn fixture() -> (tempfile::TempDir, Arc<Workspace>, Arc<Dir>, PathBuf) {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("from")).unwrap();
    fs::create_dir(root.path().join("to")).unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(root.path()).unwrap();
    let destination = fs::canonicalize(root.path().join("to")).unwrap();
    let directory =
        Arc::new(Dir::open_ambient_dir(&destination, cap_std::ambient_authority()).unwrap());
    (
        root,
        registry.get(&selected.id).unwrap(),
        directory,
        destination,
    )
}
fn id() -> String {
    Uuid::new_v4().to_string()
}
fn prepare(
    workspace: &Workspace,
    relative: &str,
    directory: Arc<Dir>,
    display: &Path,
    policy: EntryMoveConflictPolicy,
) -> EntryMovePlan {
    let token = workspace.inspect_entry(relative).unwrap().entry_token;
    let destination = workspace
        .inspect_entry_move_destination(&token, directory, display)
        .unwrap();
    match workspace
        .prepare_entry_move(&id(), &token, destination, policy)
        .unwrap()
    {
        EntryMovePreparation::Ready(plan) => plan,
        _ => panic!("new plan"),
    }
}

#[test]
fn move_across_parents_and_undo_preserve_raw_bytes_inode_and_relative_resources() {
    let (root, workspace, directory, display) = fixture();
    let bytes = b"\xef\xbb\xbf# Note\r\n![image](assets/blue.png)  \n";
    fs::write(root.path().join("from/note.md"), bytes).unwrap();
    fs::create_dir(root.path().join("from/assets")).unwrap();
    fs::write(root.path().join("from/assets/blue.png"), b"image").unwrap();
    let before = same_file::Handle::from_path(root.path().join("from/note.md")).unwrap();
    let plan = prepare(
        &workspace,
        "from/note.md",
        directory,
        &display,
        EntryMoveConflictPolicy::Cancel,
    );
    let token = plan.entry_token().to_owned();
    let operation = plan.operation_id().to_owned();
    let commit = workspace.commit_entry_move(plan).unwrap();
    assert!(!root.path().join("from/note.md").exists());
    assert_eq!(fs::read(root.path().join("to/note.md")).unwrap(), bytes);
    assert_eq!(
        same_file::Handle::from_path(root.path().join("to/note.md")).unwrap(),
        before
    );
    assert_eq!(
        fs::read(root.path().join("from/assets/blue.png")).unwrap(),
        b"image"
    );
    assert!(commit.placement.publication().is_ok());
    assert_eq!(
        workspace.resolve_entry_move(&operation, &token).unwrap(),
        Some(EntryMoveResolution::Committed {
            receipt: commit.receipt.clone()
        })
    );
    let undo = workspace
        .prepare_entry_move_undo(&id(), &commit.undo, None)
        .unwrap();
    let undone = workspace.commit_entry_move_undo(undo).unwrap();
    assert!(undone.placement.publication().is_ok());
    assert_eq!(fs::read(root.path().join("from/note.md")).unwrap(), bytes);
    assert!(!root.path().join("to/note.md").exists());
}

#[test]
fn keep_both_recursively_appends_copy_and_moves_instead_of_duplicating() {
    let (root, workspace, directory, display) = fixture();
    for (path, bytes) in [
        ("from/note.md", b"source".as_slice()),
        ("to/note.md", b"one"),
        ("to/note (copy).md", b"two"),
    ] {
        fs::write(root.path().join(path), bytes).unwrap();
    }
    let plan = prepare(
        &workspace,
        "from/note.md",
        directory,
        &display,
        EntryMoveConflictPolicy::KeepBoth,
    );
    assert_eq!(plan.new_name(), Path::new("note (copy) (copy).md"));
    let commit = workspace.commit_entry_move(plan).unwrap();
    assert!(!root.path().join("from/note.md").exists());
    assert_eq!(
        fs::read(root.path().join("to/note (copy) (copy).md")).unwrap(),
        b"source"
    );
    assert_eq!(fs::read(root.path().join("to/note.md")).unwrap(), b"one");
    workspace
        .commit_entry_move_undo(
            workspace
                .prepare_entry_move_undo(&id(), &commit.undo, None)
                .unwrap(),
        )
        .unwrap();
    assert_eq!(
        fs::read(root.path().join("from/note.md")).unwrap(),
        b"source"
    );
}

#[test]
fn replace_retains_exact_old_target_and_undo_restores_both_entities() {
    // Repeat replacement/undo to catch timestamp tunneling and handle-lifetime races.
    for _ in 0..16 {
        let (root, workspace, directory, display) = fixture();
        fs::write(root.path().join("from/note.md"), b"source").unwrap();
        #[cfg(windows)]
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(root.path().join("to/note.md"), b"target").unwrap();
        #[cfg(windows)]
        let creation = document_service::WindowsCreationTime::capture(
            &fs::File::open(root.path().join("from/note.md")).unwrap(),
        )
        .unwrap();
        let target_identity = same_file::Handle::from_path(root.path().join("to/note.md")).unwrap();
        let commit = workspace
            .commit_entry_move(prepare(
                &workspace,
                "from/note.md",
                directory,
                &display,
                EntryMoveConflictPolicy::Replace,
            ))
            .unwrap();
        let replaced = commit.placement.replacement().unwrap();
        assert_eq!(*replaced.identity(), target_identity);
        assert_eq!(fs::read(replaced.display_path()).unwrap(), b"target");
        assert_eq!(fs::read(root.path().join("to/note.md")).unwrap(), b"source");
        #[cfg(windows)]
        assert_eq!(
            document_service::WindowsCreationTime::capture(
                &fs::File::open(root.path().join("to/note.md")).unwrap(),
            )
            .unwrap(),
            creation
        );
        let undone = workspace
            .commit_entry_move_undo(
                workspace
                    .prepare_entry_move_undo(&id(), &commit.undo, None)
                    .unwrap(),
            )
            .unwrap();
        assert_eq!(
            fs::read(root.path().join("from/note.md")).unwrap(),
            b"source"
        );
        assert_eq!(fs::read(root.path().join("to/note.md")).unwrap(), b"target");
        assert_eq!(
            same_file::Handle::from_path(root.path().join("to/note.md")).unwrap(),
            target_identity
        );
        assert!(undone.placement.publication().is_ok());
        assert!(undone
            .placement
            .replacement_publication()
            .unwrap()
            .is_some());
        assert!(undone.receipt.replaced);
    }
}

#[test]
fn source_and_prompted_target_replacements_are_rejected_before_any_write() {
    let (root, workspace, directory, display) = fixture();
    fs::write(root.path().join("from/note.md"), b"same").unwrap();
    let plan = prepare(
        &workspace,
        "from/note.md",
        Arc::clone(&directory),
        &display,
        EntryMoveConflictPolicy::Cancel,
    );
    fs::rename(
        root.path().join("from/note.md"),
        root.path().join("from/held.md"),
    )
    .unwrap();
    fs::write(root.path().join("from/note.md"), b"same").unwrap();
    assert!(workspace.commit_entry_move(plan).is_err());
    assert!(!root.path().join("to/note.md").exists());
    fs::write(root.path().join("to/note.md"), b"old-target").unwrap();
    let token = workspace.inspect_entry("from/note.md").unwrap().entry_token;
    let destination = workspace
        .inspect_entry_move_destination(&token, Arc::clone(&directory), &display)
        .unwrap();
    fs::rename(
        root.path().join("to/note.md"),
        root.path().join("to/held.md"),
    )
    .unwrap();
    fs::write(root.path().join("to/note.md"), b"new-target").unwrap();
    let op = id();
    assert!(workspace
        .prepare_entry_move(&op, &token, destination, EntryMoveConflictPolicy::Replace)
        .is_err());
    assert!(matches!(
        workspace.resolve_entry_move(&op, &token).unwrap(),
        Some(EntryMoveResolution::Rejected { .. })
    ));
    assert_eq!(
        fs::read(root.path().join("to/note.md")).unwrap(),
        b"new-target"
    );
    assert_eq!(fs::read(root.path().join("from/note.md")).unwrap(), b"same");
}

#[test]
fn changed_bytes_parent_and_destination_occupation_do_not_overwrite() {
    let (root, workspace, directory, display) = fixture();
    fs::write(root.path().join("from/note.md"), b"source").unwrap();
    let plan = prepare(
        &workspace,
        "from/note.md",
        Arc::clone(&directory),
        &display,
        EntryMoveConflictPolicy::Cancel,
    );
    fs::write(root.path().join("from/note.md"), b"edited").unwrap();
    assert!(workspace.commit_entry_move(plan).is_err());
    let plan = prepare(
        &workspace,
        "from/note.md",
        Arc::clone(&directory),
        &display,
        EntryMoveConflictPolicy::Cancel,
    );
    fs::write(root.path().join("to/note.md"), b"occupied").unwrap();
    assert!(workspace.commit_entry_move(plan).is_err());
    assert_eq!(
        fs::read(root.path().join("to/note.md")).unwrap(),
        b"occupied"
    );
    fs::remove_file(root.path().join("to/note.md")).unwrap();
    let plan = prepare(
        &workspace,
        "from/note.md",
        directory,
        &display,
        EntryMoveConflictPolicy::Cancel,
    );
    if !crate::directory_test_support::rename_directory(
        &root.path().join("to"),
        &root.path().join("held-dir"),
    ) {
        drop(plan);
        assert_eq!(
            fs::read(root.path().join("from/note.md")).unwrap(),
            b"edited"
        );
        assert!(!root.path().join("to/note.md").exists());
        return;
    }
    fs::create_dir(root.path().join("to")).unwrap();
    assert!(workspace.commit_entry_move(plan).is_err());
    assert!(!root.path().join("held-dir/note.md").exists());
}

#[test]
fn unknown_after_publication_is_retained_and_never_replayed() {
    let (root, workspace, directory, display) = fixture();
    fs::write(root.path().join("from/note.md"), b"source").unwrap();
    let plan = prepare(
        &workspace,
        "from/note.md",
        directory,
        &display,
        EntryMoveConflictPolicy::Cancel,
    );
    let operation = plan.operation_id().to_owned();
    let token = plan.entry_token().to_owned();
    let result = workspace.commit_entry_move_inner(
        plan,
        || {
            fs::rename(
                root.path().join("to/note.md"),
                root.path().join("to/evidence.md"),
            )
            .unwrap();
            fs::write(root.path().join("to/note.md"), b"replacement").unwrap();
        },
        false,
    );
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert_eq!(
        workspace.resolve_entry_move(&operation, &token).unwrap(),
        Some(EntryMoveResolution::MutationUncertain)
    );
    assert_eq!(
        fs::read(root.path().join("to/evidence.md")).unwrap(),
        b"source"
    );
    assert_eq!(
        fs::read(root.path().join("to/note.md")).unwrap(),
        b"replacement"
    );
    assert!(!root.path().join("from/note.md").exists());
}

#[test]
fn undo_refuses_new_occupant_and_external_same_byte_file_replacement() {
    let (root, workspace, directory, display) = fixture();
    fs::write(root.path().join("from/note.md"), b"source").unwrap();
    let commit = workspace
        .commit_entry_move(prepare(
            &workspace,
            "from/note.md",
            directory,
            &display,
            EntryMoveConflictPolicy::Cancel,
        ))
        .unwrap();
    fs::write(root.path().join("from/note.md"), b"occupied").unwrap();
    assert!(workspace
        .prepare_entry_move_undo(&id(), &commit.undo, None)
        .is_err());
    fs::remove_file(root.path().join("from/note.md")).unwrap();
    fs::rename(
        root.path().join("to/note.md"),
        root.path().join("to/original.md"),
    )
    .unwrap();
    fs::write(root.path().join("to/note.md"), b"source").unwrap();
    assert!(workspace
        .prepare_entry_move_undo(&id(), &commit.undo, None)
        .is_err());
    assert!(!root.path().join("from/note.md").exists());
}

#[test]
fn own_atomic_save_lineage_can_be_undone_without_accepting_external_replacements() {
    let (root, workspace, directory, display) = fixture();
    fs::write(root.path().join("from/note.md"), b"source").unwrap();
    let commit = workspace
        .commit_entry_move(prepare(
            &workspace,
            "from/note.md",
            Arc::clone(&directory),
            &display,
            EntryMoveConflictPolicy::Cancel,
        ))
        .unwrap();
    let authorities = Arc::new(document_service::DocumentAuthorities::default());
    let lease = authorities
        .lease_file(
            directory,
            Path::new("note.md"),
            &commit.placement.destination_identity(),
        )
        .unwrap();
    let mut documents = document_service::DocumentService::with_authorities(authorities);
    let document = documents.open_authorized(&display.join("note.md")).unwrap();
    documents.save(&document.id, "own saved source").unwrap();
    assert!(workspace
        .prepare_entry_move_undo(&id(), &commit.undo, None)
        .is_err());
    let plan = workspace
        .prepare_entry_move_undo(&id(), &commit.undo, Some(&lease))
        .unwrap();
    workspace.commit_entry_move_undo(plan).unwrap();
    assert_eq!(
        fs::read(root.path().join("from/note.md")).unwrap(),
        b"own saved source"
    );
}

#[test]
fn directory_moves_entire_resources_and_rejects_moving_into_self() {
    let (root, workspace, directory, display) = fixture();
    fs::create_dir_all(root.path().join("from/book/assets")).unwrap();
    fs::write(root.path().join("from/book/note.md"), b"![x](assets/x.png)").unwrap();
    fs::write(root.path().join("from/book/assets/x.png"), b"pixels").unwrap();
    let token = workspace.inspect_entry("from/book").unwrap().entry_token;
    let inside = fs::canonicalize(root.path().join("from/book/assets")).unwrap();
    let inside_directory =
        Arc::new(Dir::open_ambient_dir(&inside, cap_std::ambient_authority()).unwrap());
    assert!(workspace
        .inspect_entry_move_destination(&token, inside_directory, &inside)
        .is_err());
    let result = workspace.commit_entry_move(prepare(
        &workspace,
        "from/book",
        directory,
        &display,
        EntryMoveConflictPolicy::Cancel,
    ));
    let Some(commit) = crate::directory_test_support::directory_move_result(result) else {
        assert_eq!(
            fs::read(root.path().join("from/book/assets/x.png")).unwrap(),
            b"pixels"
        );
        assert!(!root.path().join("to/book").exists());
        return;
    };
    assert_eq!(
        fs::read(root.path().join("to/book/assets/x.png")).unwrap(),
        b"pixels"
    );
    assert!(commit.placement.publication().is_ok());
    workspace
        .commit_entry_move_undo(
            workspace
                .prepare_entry_move_undo(&id(), &commit.undo, None)
                .unwrap(),
        )
        .unwrap();
    assert_eq!(
        fs::read(root.path().join("from/book/note.md")).unwrap(),
        b"![x](assets/x.png)"
    );
}

#[test]
fn same_parent_is_noop_and_cancelled_conflict_has_no_io() {
    let (root, workspace, directory, display) = fixture();
    fs::write(root.path().join("from/note.md"), b"source").unwrap();
    fs::write(root.path().join("to/note.md"), b"target").unwrap();
    let token = workspace.inspect_entry("from/note.md").unwrap().entry_token;
    let destination = workspace
        .inspect_entry_move_destination(&token, directory, &display)
        .unwrap();
    assert!(workspace
        .prepare_entry_move(&id(), &token, destination, EntryMoveConflictPolicy::Cancel)
        .is_err());
    let from = fs::canonicalize(root.path().join("from")).unwrap();
    let from_directory =
        Arc::new(Dir::open_ambient_dir(&from, cap_std::ambient_authority()).unwrap());
    let plan = prepare(
        &workspace,
        "from/note.md",
        from_directory,
        &from,
        EntryMoveConflictPolicy::KeepBoth,
    );
    let commit = workspace.commit_entry_move(plan).unwrap();
    assert!(commit.receipt.no_change);
    assert_eq!(
        fs::read(root.path().join("from/note.md")).unwrap(),
        b"source"
    );
    assert_eq!(fs::read(root.path().join("to/note.md")).unwrap(), b"target");
}

#[cfg(unix)]
#[test]
fn symlink_subtree_is_rejected_without_following_outside_or_partial_move() {
    let (root, workspace, directory, display) = fixture();
    fs::create_dir(root.path().join("from/book")).unwrap();
    std::os::unix::fs::symlink("../../outside", root.path().join("from/book/link")).unwrap();
    let token = workspace.inspect_entry("from/book").unwrap().entry_token;
    let destination = workspace
        .inspect_entry_move_destination(&token, directory, &display)
        .unwrap();
    assert!(workspace
        .prepare_entry_move(&id(), &token, destination, EntryMoveConflictPolicy::Cancel)
        .is_err());
    assert!(root.path().join("from/book").is_dir());
    assert!(!root.path().join("to/book").exists());
}

#[cfg(target_os = "macos")]
#[test]
fn verified_copy_primitive_preserves_directory_bytes_modes_xattrs_and_internal_links() {
    use std::os::unix::fs::PermissionsExt;
    let (root, workspace, directory, display) = fixture();
    fs::create_dir_all(root.path().join("from/book/assets")).unwrap();
    fs::write(
        root.path().join("from/book/note.md"),
        b"\xef\xbb\xbfpixels\r\n",
    )
    .unwrap();
    fs::write(root.path().join("from/book/assets/image.png"), b"resource").unwrap();
    fs::hard_link(
        root.path().join("from/book/assets/image.png"),
        root.path().join("from/book/assets/alias.png"),
    )
    .unwrap();
    fs::set_permissions(
        root.path().join("from/book/note.md"),
        fs::Permissions::from_mode(0o640),
    )
    .unwrap();
    for (name, value) in [
        ("dev.refinex.marklyra.move", "own metadata"),
        ("com.apple.ResourceFork", "resource fork bytes"),
    ] {
        let status = std::process::Command::new("/usr/bin/xattr")
            .args(["-w", name, value])
            .arg(root.path().join("from/book/note.md"))
            .status()
            .unwrap();
        assert!(status.success());
    }
    let plan = prepare(
        &workspace,
        "from/book",
        directory,
        &display,
        EntryMoveConflictPolicy::Cancel,
    );
    let copied = plan
        .data
        .source_tree
        .copy_to(&plan.data.destination, Path::new("copy-test"))
        .unwrap();
    let placement = plan.data.source_tree.placement(&copied).unwrap();
    assert_eq!(placement.len(), 5);
    assert_ne!(
        placement[0].source_identity(),
        placement[0].destination_identity()
    );
    assert_eq!(
        fs::read(root.path().join("to/copy-test/note.md")).unwrap(),
        b"\xef\xbb\xbfpixels\r\n"
    );
    assert_eq!(
        fs::metadata(root.path().join("to/copy-test/note.md"))
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o640
    );
    assert!(same_file::is_same_file(
        root.path().join("to/copy-test/assets/image.png"),
        root.path().join("to/copy-test/assets/alias.png")
    )
    .unwrap());
}

#[cfg(target_os = "macos")]
#[test]
fn copy_backed_transaction_retains_originals_and_undo_preserves_current_bytes() {
    let (root, workspace, directory, display) = fixture();
    fs::create_dir_all(root.path().join("from/book/assets")).unwrap();
    fs::write(
        root.path().join("from/book/note.md"),
        b"![image](assets/a.png)\r\n",
    )
    .unwrap();
    fs::write(root.path().join("from/book/assets/a.png"), b"resource").unwrap();
    let plan = prepare(
        &workspace,
        "from/book",
        directory,
        &display,
        EntryMoveConflictPolicy::Cancel,
    );
    let operation = plan.operation_id().to_owned();
    // The strategy is forced on a single test volume to execute every copy,
    // verification, retained-source and inverse-copy step. This is not a claim
    // that a distinct physical volume was mounted by this unit test.
    let commit = workspace
        .commit_entry_move_inner(plan, || {}, true)
        .unwrap();
    assert!(commit.receipt.cross_volume);
    assert!(!root.path().join("from/book").exists());
    assert!(root
        .path()
        .join("from")
        .join(hidden(&operation, "source"))
        .is_dir());
    assert_eq!(
        fs::read(root.path().join("to/book/assets/a.png")).unwrap(),
        b"resource"
    );
    assert!(commit.placement.publication().is_ok());
    fs::write(
        root.path().join("to/book/note.md"),
        b"current source with own resources",
    )
    .unwrap();
    let plan = workspace
        .prepare_entry_move_undo(&id(), &commit.undo, None)
        .unwrap();
    let undone = workspace.commit_entry_move_undo(plan).unwrap();
    assert!(undone.placement.publication().is_ok());
    assert_eq!(
        fs::read(root.path().join("from/book/note.md")).unwrap(),
        b"current source with own resources"
    );
    assert_eq!(
        fs::read(root.path().join("from/book/assets/a.png")).unwrap(),
        b"resource"
    );
    assert!(!root.path().join("to/book").exists());
}

#[test]
fn replace_backup_own_save_is_preserved_on_undo_and_external_replacement_is_not_adopted() {
    let (root, workspace, directory, display) = fixture();
    fs::write(root.path().join("from/note.md"), b"source").unwrap();
    fs::write(root.path().join("to/note.md"), b"target").unwrap();
    let commit = workspace
        .commit_entry_move(prepare(
            &workspace,
            "from/note.md",
            directory,
            &display,
            EntryMoveConflictPolicy::Replace,
        ))
        .unwrap();
    assert!(commit
        .placement
        .replacement_publication()
        .unwrap()
        .is_some());
    let replacement = commit.placement.replacement().unwrap();
    let authorities = Arc::new(document_service::DocumentAuthorities::default());
    let lease = authorities
        .lease_file(
            replacement.directory(),
            replacement.name(),
            &replacement.identity(),
        )
        .unwrap();
    let mut documents = document_service::DocumentService::with_authorities(authorities);
    let document = documents
        .open_authorized(&replacement.display_path())
        .unwrap();
    documents
        .save(&document.id, "old target changed by own save")
        .unwrap();
    assert!(workspace
        .prepare_entry_move_undo(&id(), &commit.undo, None)
        .is_err());
    let plan = workspace
        .prepare_entry_move_undo_with_replacement(&id(), &commit.undo, None, Some(&lease))
        .unwrap();
    let undone = workspace.commit_entry_move_undo(plan).unwrap();
    assert!(undone.placement.publication().is_ok());
    assert!(undone
        .placement
        .replacement_publication()
        .unwrap()
        .is_some());
    assert_eq!(
        fs::read(root.path().join("to/note.md")).unwrap(),
        b"old target changed by own save"
    );
    assert_eq!(
        fs::read(root.path().join("from/note.md")).unwrap(),
        b"source"
    );
}

#[test]
fn canonical_receipts_bind_token_and_destination_and_host_rejection_cannot_reexecute() {
    let (root, workspace, directory, display) = fixture();
    fs::write(root.path().join("from/note.md"), b"source").unwrap();
    let plan = prepare(
        &workspace,
        "from/note.md",
        Arc::clone(&directory),
        &display,
        EntryMoveConflictPolicy::Cancel,
    );
    let operation = plan.operation_id().to_owned();
    let token = plan.entry_token().to_owned();
    workspace
        .reject_prepared_entry_move(&operation, &token, "document cohort changed")
        .unwrap();
    assert!(workspace.commit_entry_move(plan).is_err());
    assert!(matches!(
        workspace.resolve_entry_move(&operation, &token).unwrap(),
        Some(EntryMoveResolution::Rejected { .. })
    ));
    assert!(workspace.resolve_entry_move(&operation, &id()).is_err());
    assert_eq!(workspace.resolve_entry_move(&id(), &token).unwrap(), None);
    assert!(workspace.resolve_entry_move("malformed", &token).is_err());
    let destination = workspace
        .inspect_entry_move_destination(&token, directory, &display)
        .unwrap();
    assert!(workspace
        .prepare_entry_move(
            &operation,
            &token,
            destination,
            EntryMoveConflictPolicy::KeepBoth
        )
        .is_err());
    assert_eq!(
        fs::read(root.path().join("from/note.md")).unwrap(),
        b"source"
    );
    assert!(!root.path().join("to/note.md").exists());
}

#[cfg(target_os = "macos")]
#[test]
#[ignore = "requires an explicitly supplied self-owned distinct-volume fixture"]
fn actual_distinct_volume_file_directory_replace_and_undo() {
    use std::os::unix::fs::PermissionsExt;
    let selected = std::env::var_os("MARKLYRA_MOVE_VOLUME_DIRECTORY")
        .expect("supply own native-selected test volume directory");
    let selected = fs::canonicalize(selected).unwrap();
    assert!(selected.is_dir());
    let destination_fixture = tempfile::Builder::new()
        .prefix("core-owned-")
        .tempdir_in(&selected)
        .unwrap();
    let destination_path = fs::canonicalize(destination_fixture.path()).unwrap();
    let destination =
        Arc::new(Dir::open_ambient_dir(&destination_path, cap_std::ambient_authority()).unwrap());
    let (source_fixture, workspace, _, _) = fixture();
    assert!(
        platform::different_volume(&workspace.root, &destination).unwrap(),
        "the supplied directory must be on a distinct device"
    );
    for (name, directory, replace) in [
        ("normal.md", false, false),
        ("replaced.md", false, true),
        ("book", true, false),
        ("replaced-book", true, true),
    ] {
        let relative = format!("from/{name}");
        let original = source_fixture.path().join(&relative);
        if directory {
            fs::create_dir_all(original.join("assets")).unwrap();
            fs::write(
                original.join("note.md"),
                b"\xef\xbb\xbf![blue](assets/blue.png)  \r\n",
            )
            .unwrap();
            fs::write(original.join("assets/blue.png"), b"image resource bytes").unwrap();
        } else {
            fs::write(&original, b"\xef\xbb\xbfAlpha\r\nBeta  \n").unwrap();
            fs::set_permissions(&original, fs::Permissions::from_mode(0o640)).unwrap();
            for (attribute, value) in [
                ("dev.refinex.marklyra.cross-volume", "own attribute"),
                ("com.apple.ResourceFork", "own resource fork"),
            ] {
                assert!(std::process::Command::new("/usr/bin/xattr")
                    .args(["-w", attribute, value])
                    .arg(&original)
                    .status()
                    .unwrap()
                    .success());
            }
        }
        let target = destination_path.join(name);
        if replace {
            if directory {
                fs::create_dir(&target).unwrap();
                fs::write(target.join("old.md"), b"old target resource").unwrap();
            } else {
                fs::write(&target, b"old target bytes").unwrap();
            }
        }
        let policy = if replace {
            EntryMoveConflictPolicy::Replace
        } else {
            EntryMoveConflictPolicy::Cancel
        };
        let plan = prepare(
            &workspace,
            &relative,
            Arc::clone(&destination),
            &destination_path,
            policy,
        );
        assert!(plan.cross_volume());
        let committed = workspace.commit_entry_move(plan).unwrap();
        assert!(committed.receipt.cross_volume);
        assert!(!original.exists());
        assert_ne!(
            committed.placement.source_identity(),
            committed.placement.destination_identity()
        );
        committed.placement.publication().unwrap();
        if replace {
            committed
                .placement
                .replacement_publication()
                .unwrap()
                .unwrap();
        }
        if directory {
            assert_eq!(
                fs::read(target.join("assets/blue.png")).unwrap(),
                b"image resource bytes"
            );
            assert_eq!(
                fs::read(target.join("note.md")).unwrap(),
                b"\xef\xbb\xbf![blue](assets/blue.png)  \r\n"
            );
        } else {
            assert_eq!(fs::read(&target).unwrap(), b"\xef\xbb\xbfAlpha\r\nBeta  \n");
            assert_eq!(
                fs::metadata(&target).unwrap().permissions().mode() & 0o777,
                0o640
            );
        }
        let undo_plan = workspace
            .prepare_entry_move_undo(&id(), &committed.undo, None)
            .unwrap();
        let undone = workspace.commit_entry_move_undo(undo_plan).unwrap();
        undone.placement.publication().unwrap();
        if replace {
            undone.placement.replacement_publication().unwrap().unwrap();
        }
        assert!(original.exists());
        if replace {
            if directory {
                assert_eq!(
                    fs::read(target.join("old.md")).unwrap(),
                    b"old target resource"
                );
            } else {
                assert_eq!(fs::read(&target).unwrap(), b"old target bytes");
            }
        } else {
            assert!(!target.exists());
        }
        println!("actual different-device {:?} replace={replace}: bytes/resources/metadata/owned identity/Undo confirmed", committed.receipt.kind);
    }
    let source_fixture = source_fixture.keep();
    let destination_fixture = destination_fixture.keep();
    println!(
        "retained owned source fixture: {}",
        source_fixture.display()
    );
    println!(
        "retained owned destination fixture: {}",
        destination_fixture.display()
    );
}

#[cfg(target_os = "macos")]
#[test]
fn copy_does_not_adopt_a_same_byte_metadata_equal_external_replacement() {
    let (root, workspace, directory, display) = fixture();
    fs::write(root.path().join("from/note.md"), b"same exact bytes").unwrap();
    let plan = prepare(
        &workspace,
        "from/note.md",
        Arc::clone(&directory),
        &display,
        EntryMoveConflictPolicy::Cancel,
    );
    let result =
        plan.data
            .source_tree
            .copy_to_with_hook(&directory, Path::new("copy-stage.md"), || {
                directory
                    .rename("copy-stage.md", &directory, "owned-evidence.md")
                    .unwrap();
                let mut options = cap_std::fs::OpenOptions::new();
                options.read(true).write(true).create_new(true);
                let replacement = directory.open_with("copy-stage.md", &options).unwrap();
                platform::copy_all(
                    &plan.data.source_tree.source(),
                    &replacement,
                    EntryKind::File,
                )
                .unwrap();
            });
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert_eq!(
        fs::read(root.path().join("from/note.md")).unwrap(),
        b"same exact bytes"
    );
    assert_eq!(
        fs::read(root.path().join("to/copy-stage.md")).unwrap(),
        b"same exact bytes"
    );
    assert_eq!(
        fs::read(root.path().join("to/owned-evidence.md")).unwrap(),
        b"same exact bytes"
    );
    assert!(!same_file::is_same_file(
        root.path().join("to/copy-stage.md"),
        root.path().join("to/owned-evidence.md")
    )
    .unwrap());
}

#[test]
fn replace_does_not_displace_a_source_ancestor_and_case_alias_cannot_bypass_self_guard() {
    let (root, workspace, _, _) = fixture();
    fs::create_dir(root.path().join("from/from")).unwrap();
    fs::write(root.path().join("from/from/note.md"), b"source child").unwrap();
    let token = workspace.inspect_entry("from/from").unwrap().entry_token;
    let display = fs::canonicalize(root.path()).unwrap();
    let directory =
        Arc::new(Dir::open_ambient_dir(&display, cap_std::ambient_authority()).unwrap());
    let destination = workspace
        .inspect_entry_move_destination(&token, directory, &display)
        .unwrap();
    assert!(workspace
        .prepare_entry_move(&id(), &token, destination, EntryMoveConflictPolicy::Replace)
        .is_err());
    assert_eq!(
        fs::read(root.path().join("from/from/note.md")).unwrap(),
        b"source child"
    );
    #[cfg(target_os = "macos")]
    {
        // APFS can be case-sensitive or insensitive. On an insensitive test
        // filesystem, an alternative spelling is rejected before traversal.
        if root.path().join("FROM/from").exists() {
            let alias = workspace.inspect_entry("FROM").unwrap();
            let target = fs::canonicalize(root.path().join("from/from")).unwrap();
            let directory =
                Arc::new(Dir::open_ambient_dir(&target, cap_std::ambient_authority()).unwrap());
            assert!(workspace
                .inspect_entry_move_destination(&alias.entry_token, directory, &target)
                .is_err());
        }
    }
}
