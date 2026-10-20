use super::*;
use crate::WorkspaceRegistry;
use std::{
    fs,
    time::{Duration, UNIX_EPOCH},
};

fn fixture() -> (tempfile::TempDir, Arc<Workspace>) {
    let root = tempfile::tempdir().unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(root.path()).unwrap();
    (root, registry.get(&selected.id).unwrap())
}
fn token() -> String {
    Uuid::new_v4().to_string()
}
fn plan(
    workspace: &Workspace,
    operation: &str,
    entry: &InspectedWorkspaceEntry,
    name: &str,
) -> EntryRenamePlan {
    match workspace
        .prepare_entry_rename(operation, &entry.entry_token, name)
        .unwrap()
    {
        EntryRenamePreparation::Ready(plan) => plan,
        EntryRenamePreparation::Completed(_) => panic!("expected a new ready plan"),
    }
}

#[test]
fn inspection_only_captures_existing_normal_entities_and_rejects_roots_and_paths() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("existing.md"), b"source").unwrap();
    fs::create_dir(root.path().join("directory")).unwrap();
    let file = workspace.inspect_entry("existing.md").unwrap();
    let directory = workspace.inspect_entry("directory").unwrap();
    assert_eq!(file.kind, EntryKind::File);
    assert_eq!(file.size, Some(6));
    assert_eq!(directory.kind, EntryKind::Directory);
    assert_eq!(directory.size, None);
    for invalid in [
        "",
        ".",
        "..",
        "../existing.md",
        "/tmp/file.md",
        "a\\b",
        "a/../b",
        "a//b",
        "C:/file",
    ] {
        assert!(workspace.inspect_entry(invalid).is_err(), "{invalid}");
    }
    assert!(workspace.inspect_entry("missing.md").is_err());
    assert_eq!(
        fs::read(root.path().join("existing.md")).unwrap(),
        b"source"
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
}

#[test]
fn generic_inspection_and_preparation_cannot_bypass_live_creation_tokens() {
    let (_root, workspace) = fixture();
    for kind in [EntryKind::File, EntryKind::Directory] {
        let created = workspace.create_untitled(&token(), "", kind, "md").unwrap();
        assert!(workspace.inspect_entry(&created.relative_path).is_err());
        assert!(workspace
            .prepare_entry_rename(&token(), &created.entry_token, "bypass.md")
            .is_err());
        workspace.finish_creation(&created.entry_token).unwrap();
        assert!(workspace.inspect_entry(&created.relative_path).is_ok());
    }
}

#[test]
fn operation_parameters_are_bound_and_cancel_resolves_prepared_requests() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("existing.md"), b"source").unwrap();
    let entry = workspace.inspect_entry("existing.md").unwrap();
    let operation = token();
    let ready = plan(&workspace, &operation, &entry, "new.md");
    assert_eq!(
        workspace.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::Prepared)
    );
    assert!(workspace
        .prepare_entry_rename(&operation, &entry.entry_token, "other.md")
        .is_err());
    assert!(workspace
        .prepare_entry_rename(&operation, &token(), "new.md")
        .is_err());
    assert!(workspace
        .prepare_entry_rename("not-uuid", &entry.entry_token, "new.md")
        .is_err());
    for invalid in [
        "..",
        "../new",
        "new/child.md",
        "CON.md",
        "name ",
        "x:y",
        "x?y",
    ] {
        let rejected = token();
        assert!(workspace
            .prepare_entry_rename(&rejected, &entry.entry_token, invalid)
            .is_err());
        assert!(matches!(
            workspace.resolve_entry_rename(&rejected).unwrap(),
            Some(EntryRenameResolution::Rejected { .. })
        ));
    }
    workspace
        .finish_entry_inspection(&entry.entry_token)
        .unwrap();
    assert!(matches!(
        workspace.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::Rejected { .. })
    ));
    assert!(workspace.commit_entry_rename(ready).is_err());
    assert!(root.path().join("existing.md").exists());
    assert!(!root.path().join("new.md").exists());
    assert_eq!(workspace.resolve_entry_rename(&token()).unwrap(), None);
}

#[test]
fn tokens_and_plans_are_owned_by_one_workspace_even_for_the_same_root() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("existing.md"), b"source").unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(root.path()).unwrap();
    let other = registry.get(&selected.id).unwrap();
    let entry = workspace.inspect_entry("existing.md").unwrap();
    let operation = token();
    assert!(other
        .prepare_entry_rename(&operation, &entry.entry_token, "new.md")
        .is_err());
    assert!(other
        .commit_entry_rename(plan(&workspace, &operation, &entry, "new.md"))
        .is_err());
    assert!(matches!(
        other.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::Rejected { .. })
    ));
    assert!(root.path().join("existing.md").exists());
}

#[test]
fn same_bytes_source_replacement_is_rejected_and_never_renamed() {
    let (root, workspace) = fixture();
    let path = root.path().join("existing.md");
    fs::write(&path, b"same").unwrap();
    let entry = workspace.inspect_entry("existing.md").unwrap();
    let operation = token();
    let ready = plan(&workspace, &operation, &entry, "new.md");
    fs::rename(&path, root.path().join("original.md")).unwrap();
    fs::write(&path, b"same").unwrap();
    assert!(workspace.commit_entry_rename(ready).is_err());
    assert!(matches!(
        workspace.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::Rejected { .. })
    ));
    assert!(workspace
        .prepare_entry_rename(&token(), &entry.entry_token, "next.md")
        .is_err());
    assert_eq!(fs::read(&path).unwrap(), b"same");
    assert!(!root.path().join("new.md").exists());
}

#[test]
fn root_and_parent_replacement_never_redirect_a_ready_operation() {
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("root");
    fs::create_dir(&root).unwrap();
    fs::create_dir(root.join("sub")).unwrap();
    fs::write(root.join("sub/note.md"), b"original").unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(&root).unwrap();
    let workspace = registry.get(&selected.id).unwrap();
    let entry = workspace.inspect_entry("sub/note.md").unwrap();
    let operation = token();
    let ready = plan(&workspace, &operation, &entry, "new.md");
    if !crate::directory_test_support::rename_directory(&root.join("sub"), &root.join("old-sub")) {
        assert!(workspace.commit_entry_rename(ready).is_ok());
        assert_eq!(fs::read(root.join("sub/new.md")).unwrap(), b"original");
        return;
    }
    fs::create_dir(root.join("sub")).unwrap();
    fs::write(root.join("sub/note.md"), b"replacement").unwrap();
    assert!(workspace.commit_entry_rename(ready).is_err());
    assert_eq!(fs::read(root.join("sub/note.md")).unwrap(), b"replacement");
    assert_eq!(fs::read(root.join("old-sub/note.md")).unwrap(), b"original");
    let entry = workspace.inspect_entry("sub/note.md").unwrap();
    let ready = plan(&workspace, &token(), &entry, "new.md");
    fs::rename(&root, temporary.path().join("old-root")).unwrap();
    fs::create_dir(&root).unwrap();
    fs::write(root.join("replacement.md"), b"keep").unwrap();
    assert!(workspace.commit_entry_rename(ready).is_err());
    assert_eq!(fs::read_dir(&root).unwrap().count(), 1);
    assert_eq!(fs::read(root.join("replacement.md")).unwrap(), b"keep");
}

#[cfg(unix)]
#[test]
fn symlinks_and_non_file_entities_are_not_inspection_capabilities() {
    use std::os::unix::{fs::symlink, net::UnixListener};
    let (root, workspace) = fixture();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("note.md"), b"outside").unwrap();
    symlink(outside.path(), root.path().join("parent-link")).unwrap();
    symlink(outside.path().join("note.md"), root.path().join("note.md")).unwrap();
    let _socket = UnixListener::bind(root.path().join("socket")).unwrap();
    for name in ["parent-link/note.md", "note.md", "socket"] {
        assert!(workspace.inspect_entry(name).is_err());
    }
    assert_eq!(
        fs::read(outside.path().join("note.md")).unwrap(),
        b"outside"
    );
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn rename_preserves_bytes_identity_and_updates_mtime_then_reconciles_without_replay() {
    let (root, workspace) = fixture();
    let path = root.path().join("existing.md");
    let bytes = b"\xef\xbb\xbfsource\r\n tail ";
    fs::write(&path, bytes).unwrap();
    fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_modified(UNIX_EPOCH + Duration::from_secs(1))
        .unwrap();
    let entry = workspace.inspect_entry("existing.md").unwrap();
    let operation = token();
    let ready = plan(&workspace, &operation, &entry, "new.md");
    let duplicate_ready = plan(&workspace, &operation, &entry, "new.md");
    let before = same_file::Handle::from_path(&path).unwrap();
    let receipt = workspace.commit_entry_rename(ready).unwrap();
    assert_eq!(receipt.relative_path, "new.md");
    assert_eq!(receipt.old_relative_path, "existing.md");
    assert!(receipt.warnings.is_empty());
    let new = root.path().join("new.md");
    assert_eq!(before, same_file::Handle::from_path(&new).unwrap());
    assert_eq!(fs::read(&new).unwrap(), bytes);
    let modified = fs::metadata(&new).unwrap().modified().unwrap();
    assert!(modified > UNIX_EPOCH + Duration::from_secs(1));
    assert_eq!(
        workspace.commit_entry_rename(duplicate_ready).unwrap(),
        receipt
    );
    match workspace
        .prepare_entry_rename(&operation, &entry.entry_token, "new.md")
        .unwrap()
    {
        EntryRenamePreparation::Completed(replayed) => assert_eq!(replayed, receipt),
        EntryRenamePreparation::Ready(_) => panic!("must not replay filesystem mutation"),
    }
    assert_eq!(
        workspace.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::Committed { receipt })
    );
    assert_eq!(fs::metadata(&new).unwrap().modified().unwrap(), modified);
    assert!(!path.exists());
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn existing_directory_moves_children_and_unchanged_name_finishes_without_touching_mtime() {
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("directory")).unwrap();
    fs::write(root.path().join("directory/child.md"), b"child").unwrap();
    let entry = workspace.inspect_entry("directory").unwrap();
    workspace
        .commit_entry_rename(plan(&workspace, &token(), &entry, "renamed"))
        .unwrap();
    assert_eq!(
        fs::read(root.path().join("renamed/child.md")).unwrap(),
        b"child"
    );
    let entry = workspace.inspect_entry("renamed").unwrap();
    let modified = fs::metadata(root.path().join("renamed"))
        .unwrap()
        .modified()
        .unwrap();
    workspace
        .commit_entry_rename(plan(&workspace, &token(), &entry, "renamed"))
        .unwrap();
    assert_eq!(
        fs::metadata(root.path().join("renamed"))
            .unwrap()
            .modified()
            .unwrap(),
        modified
    );
}

#[cfg(target_os = "macos")]
#[test]
fn case_only_rename_uses_the_no_replace_primitive_without_an_intermediate_name() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("MixedCase.md"), b"case").unwrap();
    let entry = workspace.inspect_entry("MixedCase.md").unwrap();
    workspace
        .commit_entry_rename(plan(&workspace, &token(), &entry, "mixedcase.md"))
        .unwrap();
    let names: Vec<_> = fs::read_dir(root.path())
        .unwrap()
        .map(|entry| entry.unwrap().file_name())
        .collect();
    assert_eq!(names, ["mixedcase.md"]);
    assert_eq!(fs::read(root.path().join("mixedcase.md")).unwrap(), b"case");
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn collision_is_recorded_as_rejected_and_a_fresh_operation_can_retry() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("existing.md"), b"source").unwrap();
    let entry = workspace.inspect_entry("existing.md").unwrap();
    let operation = token();
    let ready = plan(&workspace, &operation, &entry, "occupied.md");
    fs::write(root.path().join("occupied.md"), b"external").unwrap();
    assert!(
        matches!(workspace.commit_entry_rename(ready), Err(IndexError::Io(error)) if error.kind() == io::ErrorKind::AlreadyExists)
    );
    assert!(matches!(
        workspace.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::Rejected { .. })
    ));
    fs::remove_file(root.path().join("occupied.md")).unwrap();
    assert!(workspace
        .prepare_entry_rename(&operation, &entry.entry_token, "occupied.md")
        .is_err());
    assert!(root.path().join("existing.md").exists());
    workspace
        .commit_entry_rename(plan(&workspace, &token(), &entry, "free.md"))
        .unwrap();
    assert_eq!(fs::read(root.path().join("free.md")).unwrap(), b"source");
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn postcommit_replacement_is_typed_and_reconciliation_never_executes_again() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("existing.md"), b"ours").unwrap();
    let entry = workspace.inspect_entry("existing.md").unwrap();
    let operation = token();
    let ready = plan(&workspace, &operation, &entry, "new.md");
    let other_operation = token();
    let _other = plan(&workspace, &other_operation, &entry, "other.md");
    let result = workspace.commit_entry_rename_inner(ready, || {
        fs::rename(
            root.path().join("new.md"),
            root.path().join("moved-ours.md"),
        )
        .unwrap();
        fs::write(root.path().join("new.md"), b"external").unwrap();
    });
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert_eq!(
        workspace.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::MutationUncertain)
    );
    assert!(matches!(
        workspace.prepare_entry_rename(&operation, &entry.entry_token, "new.md"),
        Err(IndexError::MutationUncertain)
    ));
    assert!(matches!(
        workspace.resolve_entry_rename(&other_operation).unwrap(),
        Some(EntryRenameResolution::Rejected { .. })
    ));
    assert_eq!(fs::read(root.path().join("new.md")).unwrap(), b"external");
    assert_eq!(
        fs::read(root.path().join("moved-ours.md")).unwrap(),
        b"ours"
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn binding_revision_aba_rejects_old_plan_and_can_reprepare_without_a_syscall() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("existing.md"), b"source").unwrap();
    let entry = workspace.inspect_entry("existing.md").unwrap();
    let operation = token();
    let ready = plan(&workspace, &operation, &entry, "new.md");
    // This isolates the binding guard; Root's relocation suite owns actual
    // verified folder moves and the corresponding bulk pending-token rebase.
    workspace.location.lock().unwrap().revision += 2;
    assert!(workspace.commit_entry_rename(ready).is_err());
    assert_eq!(
        workspace.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::Prepared)
    );
    assert!(root.path().join("existing.md").exists());
    workspace
        .commit_entry_rename(plan(&workspace, &operation, &entry, "new.md"))
        .unwrap();
    assert_eq!(fs::read(root.path().join("new.md")).unwrap(), b"source");
}

#[test]
fn inspections_are_bounded_and_finish_releases_only_the_requested_token() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("existing.md"), b"source").unwrap();
    let mut entries = vec![];
    for _ in 0..MAX_INSPECTIONS {
        entries.push(workspace.inspect_entry("existing.md").unwrap());
    }
    assert!(workspace.inspect_entry("existing.md").is_err());
    workspace
        .finish_entry_inspection(&entries[0].entry_token)
        .unwrap();
    assert!(workspace.inspect_entry("existing.md").is_ok());
    assert!(workspace
        .prepare_entry_rename(&token(), &entries[0].entry_token, "new.md")
        .is_err());
    assert!(workspace
        .prepare_entry_rename(&token(), &entries[1].entry_token, "new.md")
        .is_ok());
}

#[cfg(any(target_os = "macos", windows))]
#[test]
fn host_warnings_and_uncertain_handoff_are_latched_in_the_lost_ack_receipt() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("existing.md"), b"source").unwrap();
    let entry = workspace.inspect_entry("existing.md").unwrap();
    let operation = token();
    let ready = plan(&workspace, &operation, &entry, "new.md");
    assert!(workspace.mark_entry_rename_uncertain(&operation).is_err());
    workspace.commit_entry_rename(ready).unwrap();
    workspace
        .record_entry_rename_warnings(
            &operation,
            &["native warning".into(), "native warning".into()],
        )
        .unwrap();
    match workspace.resolve_entry_rename(&operation).unwrap().unwrap() {
        EntryRenameResolution::Committed { receipt } => {
            assert_eq!(receipt.warnings, ["native warning"])
        }
        _ => panic!("confirmed receipt expected"),
    }
    workspace.mark_entry_rename_uncertain(&operation).unwrap();
    workspace.mark_entry_rename_uncertain(&operation).unwrap();
    assert_eq!(
        workspace.resolve_entry_rename(&operation).unwrap(),
        Some(EntryRenameResolution::MutationUncertain)
    );
    assert!(matches!(
        workspace.prepare_entry_rename(&operation, &entry.entry_token, "new.md"),
        Err(IndexError::MutationUncertain)
    ));
    assert!(workspace
        .record_entry_rename_warnings(&operation, &["late".into()])
        .is_err());
    assert_eq!(fs::read(root.path().join("new.md")).unwrap(), b"source");
    assert!(!root.path().join("existing.md").exists());
}
