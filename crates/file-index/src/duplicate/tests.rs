use super::*;
use crate::WorkspaceRegistry;
use std::{fs, sync::Arc};
use uuid::Uuid;

fn fixture() -> (tempfile::TempDir, Arc<Workspace>) {
    let root = tempfile::tempdir().unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(root.path()).unwrap();
    (root, registry.get(&selected.id).unwrap())
}

fn token() -> String {
    Uuid::new_v4().to_string()
}

#[test]
fn disk_bytes_encoding_and_source_identity_survive_independent_copy() {
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("sub")).unwrap();
    for (name, bytes) in [
        ("utf8.md", b"\xef\xbb\xbfA\r\nB\n".as_slice()),
        ("utf16le.md", b"\xff\xfeA\0\r\0\n\0".as_slice()),
        ("utf16be.md", b"\xfe\xff\0A\0\r\0\n".as_slice()),
        ("binary.txt", b"\x00\xff\x80unparsed".as_slice()),
        ("empty", b"".as_slice()),
    ] {
        let relative = format!("sub/{name}");
        let source = root.path().join(&relative);
        fs::write(&source, bytes).unwrap();
        let original_metadata = fs::metadata(&source).unwrap();
        let original_identity = same_file::Handle::from_path(&source).unwrap();
        let entry = workspace.inspect_entry(&relative).unwrap();
        let operation = token();
        let receipt = workspace
            .duplicate_entry(&operation, &entry.entry_token)
            .unwrap();
        assert_eq!(receipt.operation_id, operation);
        assert_eq!(receipt.entry_token, entry.entry_token);
        assert_eq!(receipt.kind, EntryKind::File);
        assert_eq!(receipt.size, Some(bytes.len() as u64));
        assert_eq!(receipt.relative_path, format!("sub/{}", receipt.name));
        let target = root.path().join(&receipt.relative_path);
        assert_eq!(fs::read(&source).unwrap(), bytes);
        assert_eq!(fs::read(&target).unwrap(), bytes);
        assert_eq!(
            same_file::Handle::from_path(&source).unwrap(),
            original_identity
        );
        assert_ne!(
            same_file::Handle::from_path(&target).unwrap(),
            original_identity
        );
        assert_eq!(
            fs::metadata(&source).unwrap().modified().unwrap(),
            original_metadata.modified().unwrap()
        );
        workspace.prepare_entry_action(&entry.entry_token).unwrap();
        fs::write(&target, b"independent").unwrap();
        assert_eq!(fs::read(&source).unwrap(), bytes);
    }
}

#[test]
fn committed_receipt_replays_without_reopening_source_or_creating_again() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"original").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let operation = token();
    let receipt = workspace
        .duplicate_entry(&operation, &entry.entry_token)
        .unwrap();
    workspace
        .finish_entry_inspection(&entry.entry_token)
        .unwrap();
    fs::remove_file(root.path().join("source.md")).unwrap();
    fs::write(root.path().join(&receipt.relative_path), b"newer").unwrap();
    assert_eq!(
        workspace
            .duplicate_entry(&operation, &entry.entry_token)
            .unwrap(),
        receipt
    );
    assert_eq!(
        workspace
            .resolve_entry_duplicate(&operation, &entry.entry_token)
            .unwrap(),
        Some(EntryDuplicateResolution::Committed { receipt })
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    assert!(workspace.duplicate_entry(&operation, &token()).is_err());
    assert!(workspace
        .resolve_entry_duplicate(&operation, &token())
        .is_err());
}

#[test]
fn concurrent_repeated_uuid_creates_exactly_one_independent_file() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"source").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let operation = token();
    let barrier = Arc::new(std::sync::Barrier::new(4));
    let threads = (0..4)
        .map(|_| {
            let workspace = Arc::clone(&workspace);
            let entry_token = entry.entry_token.clone();
            let operation = operation.clone();
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                workspace.duplicate_entry(&operation, &entry_token).unwrap()
            })
        })
        .collect::<Vec<_>>();
    let receipts = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect::<Vec<_>>();
    assert!(receipts.iter().all(|receipt| receipt == &receipts[0]));
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
}

#[test]
fn original_copy_suffix_preserves_last_extension_and_repeats_on_collision() {
    for (source, first, second) in [
        ("note.md", "note (copy).md", "note (copy) (copy).md"),
        (
            "note.extra.md",
            "note.extra (copy).md",
            "note.extra (copy) (copy).md",
        ),
        ("plain", "plain (copy)", "plain (copy) (copy)"),
        (".hidden", ".hidden (copy)", ".hidden (copy) (copy)"),
        ("笔记.md", "笔记 (copy).md", "笔记 (copy) (copy).md"),
        (
            "note (copy).md",
            "note (copy) (copy).md",
            "note (copy) (copy) (copy).md",
        ),
    ] {
        assert_eq!(duplicate_name(source, 0).unwrap(), first);
        assert_eq!(duplicate_name(source, 1).unwrap(), second);
    }
    let (root, workspace) = fixture();
    fs::write(root.path().join("note.extra.md"), b"source").unwrap();
    fs::create_dir(root.path().join("note.extra (copy).md")).unwrap();
    fs::write(root.path().join("note.extra (copy) (copy).md"), b"existing").unwrap();
    let entry = workspace.inspect_entry("note.extra.md").unwrap();
    let receipt = workspace
        .duplicate_entry(&token(), &entry.entry_token)
        .unwrap();
    assert_eq!(receipt.name, "note.extra (copy) (copy) (copy).md");
    assert_eq!(
        fs::read(root.path().join(&receipt.relative_path)).unwrap(),
        b"source"
    );
    assert!(root.path().join("note.extra (copy).md").is_dir());
    assert_eq!(
        fs::read(root.path().join("note.extra (copy) (copy).md")).unwrap(),
        b"existing"
    );
}

#[cfg(unix)]
#[test]
fn existing_symlink_collision_is_never_followed_or_overwritten() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"source").unwrap();
    fs::write(root.path().join("external.md"), b"external").unwrap();
    std::os::unix::fs::symlink("external.md", root.path().join("source (copy).md")).unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let receipt = workspace
        .duplicate_entry(&token(), &entry.entry_token)
        .unwrap();
    assert_eq!(receipt.name, "source (copy) (copy).md");
    assert_eq!(
        fs::read(root.path().join("external.md")).unwrap(),
        b"external"
    );
    assert!(fs::symlink_metadata(root.path().join("source (copy).md"))
        .unwrap()
        .file_type()
        .is_symlink());
}

#[test]
fn excessive_copy_names_fail_without_overwriting_existing_entities() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"source").unwrap();
    let mut count = 1;
    for number in 0..MAX_NAME_ATTEMPTS {
        let Ok(name) = duplicate_name("source.md", number) else {
            break;
        };
        fs::write(root.path().join(name), b"existing").unwrap();
        count += 1;
    }
    let entry = workspace.inspect_entry("source.md").unwrap();
    let operation = token();
    assert!(workspace
        .duplicate_entry(&operation, &entry.entry_token)
        .is_err());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), count);
    for file in fs::read_dir(root.path()).unwrap() {
        let file = file.unwrap();
        assert_eq!(
            fs::read(file.path()).unwrap(),
            if file.file_name() == "source.md" {
                b"source".as_slice()
            } else {
                b"existing".as_slice()
            }
        );
    }
    assert!(matches!(
        workspace
            .resolve_entry_duplicate(&operation, &entry.entry_token)
            .unwrap(),
        Some(EntryDuplicateResolution::Rejected { .. })
    ));
}

#[test]
fn unknown_closed_foreign_and_creation_tokens_never_grant_duplicate() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"source").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(root.path()).unwrap();
    let other = registry.get(&selected.id).unwrap();
    assert!(other.duplicate_entry(&token(), &entry.entry_token).is_err());
    let operation = token();
    assert_eq!(
        workspace
            .resolve_entry_duplicate(&operation, &entry.entry_token)
            .unwrap(),
        None
    );
    workspace
        .finish_entry_inspection(&entry.entry_token)
        .unwrap();
    assert!(workspace
        .duplicate_entry(&operation, &entry.entry_token)
        .is_err());
    assert!(matches!(
        workspace
            .resolve_entry_duplicate(&operation, &entry.entry_token)
            .unwrap(),
        Some(EntryDuplicateResolution::Rejected { .. })
    ));
    assert!(workspace.duplicate_entry(&token(), &token()).is_err());
    assert!(workspace
        .duplicate_entry("not-uuid", &entry.entry_token)
        .is_err());
    let created = workspace
        .create_untitled(&token(), "", EntryKind::File, "md")
        .unwrap();
    assert!(workspace
        .duplicate_entry(&token(), &created.entry_token)
        .is_err());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
}

#[test]
fn directories_and_links_are_rejected_without_recursive_copy() {
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("folder")).unwrap();
    fs::write(root.path().join("folder/child.md"), b"child").unwrap();
    let entry = workspace.inspect_entry("folder").unwrap();
    assert!(workspace
        .duplicate_entry(&token(), &entry.entry_token)
        .is_err());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink("folder/child.md", root.path().join("link.md")).unwrap();
        assert!(workspace.inspect_entry("link.md").is_err());
    }
}

#[test]
fn same_bytes_replacement_is_not_authorized_by_its_display_name() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"same").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    fs::rename(
        root.path().join("source.md"),
        root.path().join("retained.md"),
    )
    .unwrap();
    fs::write(root.path().join("source.md"), b"same").unwrap();
    let operation = token();
    assert!(workspace
        .duplicate_entry(&operation, &entry.entry_token)
        .is_err());
    assert!(matches!(
        workspace
            .resolve_entry_duplicate(&operation, &entry.entry_token)
            .unwrap(),
        Some(EntryDuplicateResolution::Rejected { .. })
    ));
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
}

#[test]
fn source_changes_between_reads_are_rejected_before_creating_a_target() {
    let (root, workspace) = fixture();
    let path = root.path().join("source.md");
    fs::write(&path, b"before").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let result = workspace.duplicate_entry_with_hooks(
        &token(),
        &entry.entry_token,
        || fs::write(&path, b"after!").unwrap(),
        || {},
        |_, _| Ok(()),
    );
    assert!(result.is_err());
    assert_eq!(fs::read(&path).unwrap(), b"after!");
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn parent_replacement_before_create_never_redirects_the_operation() {
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("parent")).unwrap();
    fs::write(root.path().join("parent/source.md"), b"original").unwrap();
    let entry = workspace.inspect_entry("parent/source.md").unwrap();
    let result = workspace.duplicate_entry_with_hooks(
        &token(),
        &entry.entry_token,
        || {},
        || {
            if !crate::directory_test_support::rename_directory(
                &root.path().join("parent"),
                &root.path().join("retained"),
            ) {
                return;
            }
            fs::create_dir(root.path().join("parent")).unwrap();
            fs::write(root.path().join("parent/source.md"), b"replacement").unwrap();
        },
        |_, _| Ok(()),
    );
    if cfg!(windows) {
        let receipt = result.unwrap();
        assert_eq!(
            fs::read(root.path().join(receipt.relative_path)).unwrap(),
            b"original"
        );
        assert!(!root.path().join("retained").exists());
        return;
    }
    assert!(result.is_err());
    assert_eq!(
        fs::read_dir(root.path().join("retained")).unwrap().count(),
        1
    );
    assert_eq!(fs::read_dir(root.path().join("parent")).unwrap().count(), 1);
}

#[cfg(unix)]
#[test]
fn symlink_parent_before_create_never_mutates_the_retained_directory() {
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("parent")).unwrap();
    fs::write(root.path().join("parent/source.md"), b"original").unwrap();
    let entry = workspace.inspect_entry("parent/source.md").unwrap();
    let result = workspace.duplicate_entry_with_hooks(
        &token(),
        &entry.entry_token,
        || {},
        || {
            fs::rename(root.path().join("parent"), root.path().join("retained")).unwrap();
            std::os::unix::fs::symlink("retained", root.path().join("parent")).unwrap();
        },
        |_, _| Ok(()),
    );
    assert!(result.is_err());
    assert_eq!(
        fs::read_dir(root.path().join("retained")).unwrap().count(),
        1
    );
}

#[test]
fn root_revision_aba_before_create_rejects_even_if_display_text_matches() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"original").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let result = workspace.duplicate_entry_with_hooks(
        &token(),
        &entry.entry_token,
        || {},
        || workspace.location.lock().unwrap().revision += 2,
        |_, _| Ok(()),
    );
    assert!(result.is_err());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn oversized_source_is_bounded_and_never_creates_an_empty_copy() {
    let (root, workspace) = fixture();
    let source = fs::File::create(root.path().join("large.md")).unwrap();
    source.set_len(MAX_FILE_BYTES as u64 + 1).unwrap();
    let entry = workspace.inspect_entry("large.md").unwrap();
    assert!(matches!(
        workspace.duplicate_entry(&token(), &entry.entry_token),
        Err(IndexError::Document(
            document_service::DocumentError::TooLarge
        ))
    ));
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn late_failure_keeps_partial_evidence_and_uuid_never_replays() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"source").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let operation = token();
    let result = workspace.duplicate_entry_with_hooks(
        &operation,
        &entry.entry_token,
        || {},
        || {},
        |_, _| {
            Err(io::Error::new(
                io::ErrorKind::WriteZero,
                "injected write failure",
            ))
        },
    );
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert!(matches!(
        workspace
            .resolve_entry_duplicate(&operation, &entry.entry_token)
            .unwrap(),
        Some(EntryDuplicateResolution::MutationUncertain)
    ));
    assert!(matches!(
        workspace.duplicate_entry(&operation, &entry.entry_token),
        Err(IndexError::MutationUncertain)
    ));
    let files = fs::read_dir(root.path())
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(files.len(), 2);
    let partial = files
        .iter()
        .find(|file| file.file_name() != "source.md")
        .unwrap();
    assert_eq!(fs::read(partial.path()).unwrap(), b"");
}

#[test]
fn replaced_target_keeps_both_external_and_retained_evidence() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"source bytes").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let operation = token();
    let mut replaced_name = None;
    let result = workspace.duplicate_entry_with_hooks(
        &operation,
        &entry.entry_token,
        || {},
        || {},
        |_, name| {
            replaced_name = Some(name.to_owned());
            fs::rename(
                root.path().join(name),
                root.path().join("retained-target.md"),
            )?;
            fs::write(root.path().join(name), b"external")
        },
    );
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert_eq!(
        fs::read(root.path().join(replaced_name.unwrap())).unwrap(),
        b"external"
    );
    assert_eq!(
        fs::read(root.path().join("retained-target.md")).unwrap(),
        b"source bytes"
    );
    assert_eq!(
        fs::read(root.path().join("source.md")).unwrap(),
        b"source bytes"
    );
    assert!(matches!(
        workspace.duplicate_entry(&operation, &entry.entry_token),
        Err(IndexError::MutationUncertain)
    ));
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 3);
}

#[test]
fn source_change_after_create_reports_uncertain_and_keeps_snapshot_evidence() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"snapshot").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let operation = token();
    let mut target_name = None;
    let result = workspace.duplicate_entry_with_hooks(
        &operation,
        &entry.entry_token,
        || {},
        || {},
        |_, name| {
            target_name = Some(name.to_owned());
            fs::write(root.path().join("source.md"), b"external")
        },
    );
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert_eq!(
        fs::read(root.path().join("source.md")).unwrap(),
        b"external"
    );
    assert_eq!(
        fs::read(root.path().join(target_name.unwrap())).unwrap(),
        b"snapshot"
    );
    assert!(matches!(
        workspace.duplicate_entry(&operation, &entry.entry_token),
        Err(IndexError::MutationUncertain)
    ));
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
}

#[cfg(unix)]
#[test]
fn parent_symlink_after_create_reports_uncertain_without_cleanup() {
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("parent")).unwrap();
    fs::write(root.path().join("parent/source.md"), b"snapshot").unwrap();
    let entry = workspace.inspect_entry("parent/source.md").unwrap();
    let operation = token();
    let result = workspace.duplicate_entry_with_hooks(
        &operation,
        &entry.entry_token,
        || {},
        || {},
        |_, _| {
            fs::rename(root.path().join("parent"), root.path().join("retained"))?;
            std::os::unix::fs::symlink("retained", root.path().join("parent"))
        },
    );
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert_eq!(
        fs::read_dir(root.path().join("retained")).unwrap().count(),
        2
    );
    assert!(fs::symlink_metadata(root.path().join("parent"))
        .unwrap()
        .file_type()
        .is_symlink());
    assert!(matches!(
        workspace.duplicate_entry(&operation, &entry.entry_token),
        Err(IndexError::MutationUncertain)
    ));
}

#[cfg(unix)]
#[test]
fn read_only_parent_fails_without_mutation_and_cannot_later_replay() {
    use std::os::unix::fs::PermissionsExt;
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"source").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let operation = token();
    fs::set_permissions(root.path(), fs::Permissions::from_mode(0o500)).unwrap();
    let result = workspace.duplicate_entry(&operation, &entry.entry_token);
    fs::set_permissions(root.path(), fs::Permissions::from_mode(0o700)).unwrap();
    assert!(
        matches!(result, Err(IndexError::Io(error)) if error.kind() == io::ErrorKind::PermissionDenied)
    );
    assert!(workspace
        .duplicate_entry(&operation, &entry.entry_token)
        .is_err());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[test]
fn receipt_horizon_is_bounded_without_evicting_old_failures() {
    let (root, workspace) = fixture();
    fs::write(root.path().join("source.md"), b"source").unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let first = token();
    assert!(workspace.duplicate_entry(&first, &token()).is_err());
    for _ in 1..MAX_OPERATIONS {
        assert!(workspace.duplicate_entry(&token(), &token()).is_err());
    }
    assert_eq!(
        workspace.duplicates.lock().unwrap().operations.len(),
        MAX_OPERATIONS
    );
    assert!(workspace
        .duplicate_entry(&token(), &entry.entry_token)
        .is_err());
    assert!(workspace
        .duplicate_entry(&first, &entry.entry_token)
        .is_err());
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
}

#[cfg(target_os = "macos")]
fn set_attribute(file: &fs::File, name: &std::ffi::CStr, bytes: &[u8]) {
    use std::os::fd::AsRawFd;
    unsafe extern "C" {
        fn fsetxattr(
            fd: std::ffi::c_int,
            name: *const std::ffi::c_char,
            value: *const std::ffi::c_void,
            size: usize,
            position: u32,
            options: std::ffi::c_int,
        ) -> std::ffi::c_int;
    }
    // SAFETY: Both byte buffers are live for the call; the owned file retains
    // the descriptor. Position/options zero select the complete named value.
    let result = unsafe {
        fsetxattr(
            file.as_raw_fd(),
            name.as_ptr(),
            bytes.as_ptr().cast(),
            bytes.len(),
            0,
            0,
        )
    };
    assert_eq!(result, 0, "{}", io::Error::last_os_error());
}

#[cfg(target_os = "macos")]
fn attribute(file: &fs::File, name: &std::ffi::CStr) -> Vec<u8> {
    use std::os::fd::AsRawFd;
    unsafe extern "C" {
        fn fgetxattr(
            fd: std::ffi::c_int,
            name: *const std::ffi::c_char,
            value: *mut std::ffi::c_void,
            size: usize,
            position: u32,
            options: std::ffi::c_int,
        ) -> isize;
    }
    // SAFETY: A null buffer with size zero queries the size of a named value
    // on the owned descriptor; the C string remains live.
    let length = unsafe {
        fgetxattr(
            file.as_raw_fd(),
            name.as_ptr(),
            std::ptr::null_mut(),
            0,
            0,
            0,
        )
    };
    assert!(length >= 0, "{}", io::Error::last_os_error());
    let mut bytes = vec![0u8; length as usize];
    // SAFETY: The writable buffer has the queried size and the descriptor and
    // name remain live. Test fixtures have no concurrent attribute writer.
    let read = unsafe {
        fgetxattr(
            file.as_raw_fd(),
            name.as_ptr(),
            bytes.as_mut_ptr().cast(),
            bytes.len(),
            0,
            0,
        )
    };
    assert_eq!(read, length, "{}", io::Error::last_os_error());
    bytes
}

#[cfg(target_os = "macos")]
#[test]
fn macos_duplicate_preserves_permissions_mtime_xattr_and_resource_fork() {
    use std::{
        os::unix::fs::{MetadataExt, PermissionsExt},
        time::Duration,
    };
    let (root, workspace) = fixture();
    let source_path = root.path().join("source.md");
    fs::write(&source_path, b"\xef\xbb\xbfraw\r\nbytes\n").unwrap();
    let source = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&source_path)
        .unwrap();
    set_attribute(&source, c"com.refinex.duplicate-test", b"custom\0value");
    set_attribute(&source, c"com.apple.ResourceFork", b"resource-fork\0bytes");
    set_attribute(&source, c"com.apple.FinderInfo", &[0x42; 32]);
    source
        .set_permissions(fs::Permissions::from_mode(0o440))
        .unwrap();
    let modified = std::time::UNIX_EPOCH + Duration::new(1_720_000_000, 123_456_789);
    source
        .set_times(fs::FileTimes::new().set_modified(modified))
        .unwrap();
    let before = source.metadata().unwrap();
    let source_identity = same_file::Handle::from_file(source.try_clone().unwrap()).unwrap();
    let entry = workspace.inspect_entry("source.md").unwrap();
    let operation = token();
    let receipt = workspace
        .duplicate_entry(&operation, &entry.entry_token)
        .unwrap();
    let target = fs::File::open(root.path().join(&receipt.relative_path)).unwrap();
    assert_eq!(
        target.metadata().unwrap().permissions().mode() & 0o7777,
        0o440
    );
    assert_eq!(
        target.metadata().unwrap().modified().unwrap(),
        before.modified().unwrap()
    );
    for name in [
        c"com.refinex.duplicate-test",
        c"com.apple.ResourceFork",
        c"com.apple.FinderInfo",
    ] {
        assert_eq!(attribute(&target, name), attribute(&source, name));
    }
    assert_eq!(
        fs::read(root.path().join(&receipt.relative_path)).unwrap(),
        fs::read(&source_path).unwrap()
    );
    assert_eq!(
        source.metadata().unwrap().permissions().mode(),
        before.permissions().mode()
    );
    assert_eq!(
        source.metadata().unwrap().modified().unwrap(),
        before.modified().unwrap()
    );
    let after = source.metadata().unwrap();
    assert_eq!(
        (after.ctime(), after.ctime_nsec()),
        (before.ctime(), before.ctime_nsec())
    );
    assert_eq!(
        same_file::Handle::from_path(&source_path).unwrap(),
        source_identity
    );
    assert_ne!(
        same_file::Handle::from_file(target.try_clone().unwrap()).unwrap(),
        source_identity
    );
    assert_eq!(
        workspace
            .duplicate_entry(&operation, &entry.entry_token)
            .unwrap(),
        receipt
    );
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 2);
}

#[cfg(target_os = "macos")]
#[test]
fn macos_source_attribute_change_before_create_is_rejected_without_copy() {
    let (root, workspace) = fixture();
    let source_path = root.path().join("source.md");
    fs::write(&source_path, b"unchanged bytes").unwrap();
    let source = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&source_path)
        .unwrap();
    set_attribute(&source, c"com.refinex.duplicate-test", b"before");
    let entry = workspace.inspect_entry("source.md").unwrap();
    let operation = token();
    assert!(workspace
        .duplicate_entry_with_hooks(
            &operation,
            &entry.entry_token,
            || set_attribute(&source, c"com.refinex.duplicate-test", b"after"),
            || {},
            |_, _| Ok(())
        )
        .is_err());
    assert!(matches!(
        workspace
            .resolve_entry_duplicate(&operation, &entry.entry_token)
            .unwrap(),
        Some(EntryDuplicateResolution::Rejected { .. })
    ));
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    assert_eq!(fs::read(&source_path).unwrap(), b"unchanged bytes");
}

#[cfg(target_os = "macos")]
#[test]
fn macos_target_replacement_does_not_redirect_metadata_copy() {
    let (root, workspace) = fixture();
    let source_path = root.path().join("source.md");
    fs::write(&source_path, b"source").unwrap();
    let source = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(&source_path)
        .unwrap();
    set_attribute(&source, c"com.refinex.duplicate-test", b"source metadata");
    let entry = workspace.inspect_entry("source.md").unwrap();
    let operation = token();
    let mut target_path = None;
    let result = workspace.duplicate_entry_with_hooks(
        &operation,
        &entry.entry_token,
        || {},
        || {},
        |_, name| {
            let target = root.path().join(name);
            fs::rename(&target, root.path().join("retained.md"))?;
            fs::write(&target, b"external")?;
            let external = fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(&target)?;
            set_attribute(
                &external,
                c"com.refinex.duplicate-test",
                b"external metadata",
            );
            target_path = Some(target);
            Ok(())
        },
    );
    assert!(matches!(result, Err(IndexError::MutationUncertain)));
    assert_eq!(
        attribute(
            &fs::File::open(root.path().join("retained.md")).unwrap(),
            c"com.refinex.duplicate-test"
        ),
        b"source metadata"
    );
    assert_eq!(
        attribute(
            &fs::File::open(target_path.unwrap()).unwrap(),
            c"com.refinex.duplicate-test"
        ),
        b"external metadata"
    );
    assert_eq!(
        attribute(&source, c"com.refinex.duplicate-test"),
        b"source metadata"
    );
    assert!(matches!(
        workspace.duplicate_entry(&operation, &entry.entry_token),
        Err(IndexError::MutationUncertain)
    ));
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 3);
}

#[cfg(target_os = "macos")]
#[test]
fn macos_duplicate_preserves_explicit_acl_without_changing_source() {
    let (root, workspace) = fixture();
    let source = root.path().join("source.md");
    fs::write(&source, b"source").unwrap();
    let output = std::process::Command::new("/bin/chmod")
        .args([
            "+a",
            "everyone allow read,readattr,readextattr,readsecurity",
        ])
        .arg(&source)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let entries = |path: &Path| {
        let output = std::process::Command::new("/bin/ls")
            .arg("-lde")
            .arg(path)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout)
            .unwrap()
            .lines()
            .skip(1)
            .map(str::to_owned)
            .collect::<Vec<_>>()
    };
    let before = entries(&source);
    assert_eq!(before.len(), 1);
    assert!(before[0].contains("everyone allow"));
    let entry = workspace.inspect_entry("source.md").unwrap();
    let receipt = workspace
        .duplicate_entry(&token(), &entry.entry_token)
        .unwrap();
    assert_eq!(entries(&root.path().join(receipt.relative_path)), before);
    assert_eq!(entries(&source), before);
}
