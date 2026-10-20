use super::*;

struct Fixture {
    root: tempfile::TempDir,
    parent: Arc<Dir>,
}
impl Fixture {
    fn new() -> Self {
        let root = tempfile::Builder::new()
            .prefix("marklyra-v29-trash-fixture-")
            .tempdir()
            .unwrap();
        let parent =
            Arc::new(Dir::open_ambient_dir(root.path(), cap_std::ambient_authority()).unwrap());
        Self { root, parent }
    }
    fn source(&self, name: &str, kind: EntryKind) -> AuthorizedTrashSource {
        let source = Arc::new(open_entry(&self.parent, Path::new(name), kind).unwrap());
        let identity = Arc::new(identity_of(&source).unwrap());
        AuthorizedTrashSource::new(
            Arc::clone(&self.parent),
            name.into(),
            source,
            identity,
            kind,
        )
        .unwrap()
    }
}

#[test]
fn constructor_rejects_paths_kind_and_distinct_same_bytes_entity() {
    let fixture = Fixture::new();
    fixture.parent.write("a.md", b"same").unwrap();
    fixture.parent.write("b.md", b"same").unwrap();
    let source = Arc::new(fixture.parent.open("a.md").unwrap());
    let identity = Arc::new(identity_of(&source).unwrap());
    for name in ["", ".", "..", "a/../a.md", "/a.md", "a\\b", "a\0b"] {
        assert!(
            AuthorizedTrashSource::new(
                Arc::clone(&fixture.parent),
                name.into(),
                Arc::clone(&source),
                Arc::clone(&identity),
                EntryKind::File,
            )
            .is_err(),
            "{name:?}"
        );
    }
    for (name, kind) in [("a.md", EntryKind::Directory), ("b.md", EntryKind::File)] {
        assert!(AuthorizedTrashSource::new(
            Arc::clone(&fixture.parent),
            name.into(),
            Arc::clone(&source),
            Arc::clone(&identity),
            kind,
        )
        .is_err());
    }
    assert_eq!(fixture.parent.read("a.md").unwrap(), b"same");
    assert_eq!(fixture.parent.read("b.md").unwrap(), b"same");
}

#[cfg(unix)]
#[test]
fn symlink_and_replaced_source_are_rejected_before_system_trash() {
    let fixture = Fixture::new();
    fixture.parent.write("a.md", b"old").unwrap();
    let source = fixture.source("a.md", EntryKind::File);
    fixture
        .parent
        .rename("a.md", &fixture.parent, "moved.md")
        .unwrap();
    fixture.parent.write("a.md", b"replacement").unwrap();
    assert!(matches!(trash(&source), Err(TrashFailure::NotMoved(_))));
    assert_eq!(fixture.parent.read("a.md").unwrap(), b"replacement");
    assert_eq!(fixture.parent.read("moved.md").unwrap(), b"old");
    fixture.parent.symlink("moved.md", "alias.md").unwrap();
    assert!(AuthorizedTrashSource::new(
        Arc::clone(&fixture.parent),
        "alias.md".into(),
        Arc::clone(&source.source),
        Arc::clone(&source.identity),
        EntryKind::File,
    )
    .is_err());
}

#[test]
fn postcall_missing_or_wrong_endpoint_is_typed_uncertain_without_mutating_other_data() {
    let fixture = Fixture::new();
    fixture.parent.write("a.md", b"original").unwrap();
    fixture.parent.write("other.md", b"original").unwrap();
    let source = fixture.source("a.md", EntryKind::File);
    for path in [
        fixture.root.path().join("missing.md"),
        fixture.root.path().join("other.md"),
    ] {
        assert!(matches!(
            capture_result(&source, path),
            Err(TrashFailure::MutationUncertain { .. })
        ));
    }
    assert_eq!(fixture.parent.read("a.md").unwrap(), b"original");
    assert_eq!(fixture.parent.read("other.md").unwrap(), b"original");
}

#[test]
fn stale_placement_refuses_replacement_and_never_overwrites_the_original_location() {
    let fixture = Fixture::new();
    fixture.parent.write("a.md", b"original").unwrap();
    let source = fixture.source("a.md", EntryKind::File);
    fixture.parent.create_dir("simulated").unwrap();
    fixture
        .parent
        .rename("a.md", &fixture.parent, "simulated/a.md")
        .unwrap();
    let placement = capture_result(&source, fixture.root.path().join("simulated/a.md")).unwrap();
    let directory = placement.directory().unwrap();
    directory.rename("a.md", &directory, "retained.md").unwrap();
    directory.write("a.md", b"replacement").unwrap();
    assert!(matches!(
        restore(&placement),
        Err(TrashFailure::NotMoved(_))
    ));
    assert!(!fixture.parent.exists("a.md"));
    assert_eq!(directory.read("a.md").unwrap(), b"replacement");
    assert_eq!(directory.read("retained.md").unwrap(), b"original");
}

#[cfg(target_os = "macos")]
struct RestoreOnDrop(TrashPlacement);
#[cfg(target_os = "macos")]
impl Drop for RestoreOnDrop {
    fn drop(&mut self) {
        // Only this test's system-returned exact entity, never a Trash scan or
        // arbitrary cleanup. Already restored/occupied locations fail closed.
        let _ = restore(&self.0);
    }
}

#[cfg(target_os = "macos")]
#[test]
fn actual_system_trash_file_preserves_identity_bytes_and_restores_exclusively() {
    let fixture = Fixture::new();
    let name = "marklyra-v29-trash-fixture-file.md";
    let bytes = b"\xef\xbb\xbf# Own fixture\r\n\nTail\r";
    fixture.parent.write(name, bytes).unwrap();
    let source = fixture.source(name, EntryKind::File);
    let placement = RestoreOnDrop(trash(&source).unwrap());
    assert!(!fixture.parent.exists(name));
    assert!(placement.0.display_path().is_absolute());
    assert_eq!(
        placement
            .0
            .directory()
            .unwrap()
            .read(placement.0.name())
            .unwrap(),
        bytes
    );
    assert_eq!(*placement.0.source_identity(), *source.identity);
    fixture.parent.write(name, b"new occupant").unwrap();
    assert!(matches!(
        restore(&placement.0),
        Err(TrashFailure::NotMoved(_))
    ));
    assert_eq!(fixture.parent.read(name).unwrap(), b"new occupant");
    fixture.parent.remove_file(name).unwrap();
    restore(&placement.0).unwrap();
    assert_eq!(fixture.parent.read(name).unwrap(), bytes);
    assert_eq!(
        identity_of(&fixture.parent.open(name).unwrap()).unwrap(),
        *source.identity
    );
    assert!(matches!(
        restore(&placement.0),
        Err(TrashFailure::NotMoved(_))
    ));
}

#[cfg(target_os = "macos")]
#[test]
fn actual_system_trash_collision_uses_each_returned_name_without_overwriting() {
    let first = Fixture::new();
    let second = Fixture::new();
    let name = "marklyra-v29-trash-fixture-collision.md";
    first.parent.write(name, b"first").unwrap();
    second.parent.write(name, b"second").unwrap();
    let first_source = first.source(name, EntryKind::File);
    let second_source = second.source(name, EntryKind::File);
    let first_placement = RestoreOnDrop(trash(&first_source).unwrap());
    let second_placement = RestoreOnDrop(trash(&second_source).unwrap());
    assert_ne!(
        first_placement.0.display_path(),
        second_placement.0.display_path()
    );
    assert_eq!(
        first_placement
            .0
            .directory()
            .unwrap()
            .read(first_placement.0.name())
            .unwrap(),
        b"first"
    );
    assert_eq!(
        second_placement
            .0
            .directory()
            .unwrap()
            .read(second_placement.0.name())
            .unwrap(),
        b"second"
    );
    restore(&first_placement.0).unwrap();
    restore(&second_placement.0).unwrap();
    assert_eq!(first.parent.read(name).unwrap(), b"first");
    assert_eq!(second.parent.read(name).unwrap(), b"second");
}

#[cfg(target_os = "macos")]
#[test]
fn actual_system_trash_directory_uses_current_parent_fd_and_restores_children() {
    let outer = Fixture::new();
    outer.parent.create_dir("before").unwrap();
    let parent = Arc::new(outer.parent.open_dir("before").unwrap());
    let name = "marklyra-v29-trash-fixture-directory";
    parent.create_dir(name).unwrap();
    parent
        .write(format!("{name}/child.md"), b"child\r\n")
        .unwrap();
    let file = Arc::new(open_entry(&parent, Path::new(name), EntryKind::Directory).unwrap());
    let source = AuthorizedTrashSource::new(
        Arc::clone(&parent),
        name.into(),
        Arc::clone(&file),
        Arc::new(identity_of(&file).unwrap()),
        EntryKind::Directory,
    )
    .unwrap();
    outer
        .parent
        .rename("before", &outer.parent, "after")
        .unwrap();
    let placement = RestoreOnDrop(trash(&source).unwrap());
    assert!(!parent.exists(name));
    restore(&placement.0).unwrap();
    assert_eq!(
        parent.read(format!("{name}/child.md")).unwrap(),
        b"child\r\n"
    );
    assert_eq!(
        identity_of(&open_entry(&parent, Path::new(name), EntryKind::Directory).unwrap()).unwrap(),
        *source.identity
    );
    assert!(outer.root.path().join("after").join(name).exists());
}

#[cfg(target_os = "macos")]
#[test]
fn denied_parent_requires_exact_held_endpoint_and_only_permission_denied_can_fallback() {
    let fixture = Fixture::new();
    fixture.parent.write("a.md", b"same").unwrap();
    let source = fixture.source("a.md", EntryKind::File);
    fixture.parent.create_dir("result").unwrap();
    fixture
        .parent
        .rename("a.md", &fixture.parent, "result/a.md")
        .unwrap();
    let actual = std::fs::canonicalize(fixture.root.path().join("result/a.md")).unwrap();
    let placement = capture_result_with_opener(&source, actual.clone(), |_| {
        Err(io::Error::from(io::ErrorKind::PermissionDenied))
    })
    .unwrap();
    assert!(placement.directory().is_none());
    // A path+FD alone is not an OS URL receipt. This direct helper did not get
    // a system-returned NSURL, so it cannot authorize normal URL restoration.
    assert!(matches!(
        restore(&placement),
        Err(TrashFailure::NotMoved(_))
    ));
    assert!(matches!(
        capture_result_with_opener(&source, actual, |_| {
            Err(io::Error::other("not a permission error"))
        }),
        Err(TrashFailure::MutationUncertain { .. })
    ));
    fixture.parent.write("result/same.md", b"same").unwrap();
    let other = std::fs::canonicalize(fixture.root.path().join("result/same.md")).unwrap();
    assert!(matches!(
        capture_result_with_opener(&source, other, |_| {
            Err(io::Error::from(io::ErrorKind::PermissionDenied))
        }),
        Err(TrashFailure::MutationUncertain { .. })
    ));
    assert_eq!(fixture.parent.read("result/a.md").unwrap(), b"same");
}

#[cfg(target_os = "macos")]
#[test]
fn restricted_endpoint_tracks_only_proven_alias_publication_without_opening_trash_parent() {
    let fixture = Fixture::new();
    let name = "marklyra-restricted-alias.md";
    fixture.parent.write(name, b"Alpha\r\n").unwrap();
    let source = fixture.source(name, EntryKind::File);
    let authorities = Arc::new(document_service::DocumentAuthorities::default());
    let key = uuid::Uuid::new_v4();
    let prepared = authorities
        .lease_file(
            Arc::clone(&fixture.parent),
            Path::new(name),
            &source.identity,
        )
        .unwrap()
        .prepare_trash(key)
        .unwrap();
    let placement = RestoreOnDrop(macos::trash_with_denied_parent(&source).unwrap());
    let lease = prepared.commit(placement.0.display_path()).unwrap();
    assert!(placement.0.directory().is_none());
    assert!(lease.current_source().unwrap().is_none());
    let mut alias = document_service::DocumentService::with_authorities(authorities);
    let b = alias.open_authorized(placement.0.display_path()).unwrap();
    alias.save(&b.id, "B own\r\n").unwrap();
    let proof = lease.current_source().unwrap().unwrap();
    assert!(placement
        .0
        .refresh_file_source(uuid::Uuid::new_v4(), &proof)
        .is_err());
    let refreshed = RestoreOnDrop(placement.0.refresh_file_source(key, &proof).unwrap());
    assert!(refreshed.0.directory().is_none());
    assert_ne!(refreshed.0.source_identity(), placement.0.source_identity());
    macos::verify_restricted_endpoint(&refreshed.0).unwrap();
    fixture.parent.write(name, b"occupied").unwrap();
    assert!(matches!(
        restore(&refreshed.0),
        Err(TrashFailure::NotMoved(_))
    ));
    assert_eq!(fixture.parent.read(name).unwrap(), b"occupied");
    fixture.parent.remove_file(name).unwrap();
    restore(&refreshed.0).unwrap();
    lease.finish_restore().unwrap();
    assert_eq!(fixture.parent.read(name).unwrap(), b"B own\r\n");
}

#[cfg(target_os = "macos")]
#[test]
fn actual_denied_parent_file_uses_system_url_and_restores_without_parent_capability() {
    let fixture = Fixture::new();
    let name = "marklyra-v29-trash-fixture-restricted.md";
    let bytes = b"\xef\xbb\xbfRestricted\r\n\nTail\r";
    fixture.parent.write(name, bytes).unwrap();
    let source = fixture.source(name, EntryKind::File);
    // Real system Trash, injected PermissionDenied only for opening its parent.
    // This tests the branch, not this terminal's or the app bundle's TCC policy.
    let placement = RestoreOnDrop(macos::trash_with_denied_parent(&source).unwrap());
    assert!(placement.0.directory().is_none());
    assert!(placement.0.entry_directory().unwrap().is_none());
    macos::verify_restricted_endpoint(&placement.0).unwrap();
    fixture.parent.write(name, b"new occupant").unwrap();
    assert!(matches!(
        restore(&placement.0),
        Err(TrashFailure::NotMoved(_))
    ));
    assert_eq!(fixture.parent.read(name).unwrap(), b"new occupant");
    fixture.parent.remove_file(name).unwrap();
    restore(&placement.0).unwrap();
    assert_eq!(fixture.parent.read(name).unwrap(), bytes);
    assert_eq!(
        identity_of(&fixture.parent.open(name).unwrap()).unwrap(),
        *source.identity
    );
    assert!(matches!(
        restore(&placement.0),
        Err(TrashFailure::NotMoved(_))
    ));
}

#[cfg(target_os = "macos")]
#[test]
fn actual_denied_parent_directory_exposes_only_retained_entity_and_children() {
    let fixture = Fixture::new();
    let name = "marklyra-v29-trash-fixture-restricted-directory";
    fixture.parent.create_dir(name).unwrap();
    fixture
        .parent
        .write(format!("{name}/child.md"), b"child\r\n")
        .unwrap();
    let source = fixture.source(name, EntryKind::Directory);
    let placement = RestoreOnDrop(macos::trash_with_denied_parent(&source).unwrap());
    assert!(placement.0.directory().is_none());
    let directory = placement.0.entry_directory().unwrap().unwrap();
    assert_eq!(directory.read("child.md").unwrap(), b"child\r\n");
    assert!(directory.open("../forbidden-sibling.md").is_err());
    assert_eq!(
        same_file::Handle::from_file(directory.try_clone().unwrap().into_std_file()).unwrap(),
        *source.identity
    );
    restore(&placement.0).unwrap();
    assert_eq!(
        fixture.parent.read(format!("{name}/child.md")).unwrap(),
        b"child\r\n"
    );
}

#[cfg(target_os = "macos")]
#[test]
fn actual_restricted_endpoint_moved_again_cannot_be_replayed() {
    use objc2_foundation::{NSFileManager, NSString, NSURL};
    let fixture = Fixture::new();
    let name = "marklyra-v29-trash-fixture-restricted-stale.md";
    fixture.parent.write(name, b"retained").unwrap();
    let source = fixture.source(name, EntryKind::File);
    let placement = RestoreOnDrop(macos::trash_with_denied_parent(&source).unwrap());
    let destination = std::fs::canonicalize(fixture.root.path())
        .unwrap()
        .join("relocated.md");
    let url = NSURL::fileURLWithPath_isDirectory(
        &NSString::from_str(destination.to_str().unwrap()),
        false,
    );
    NSFileManager::new()
        .moveItemAtURL_toURL_error(placement.0.system_url.as_ref().unwrap(), &url)
        .unwrap();
    assert!(matches!(
        restore(&placement.0),
        Err(TrashFailure::NotMoved(_))
    ));
    assert!(!fixture.parent.exists(name));
    assert_eq!(fixture.parent.read("relocated.md").unwrap(), b"retained");
}

#[cfg(target_os = "macos")]
#[test]
fn actual_restricted_system_restore_denial_is_known_not_moved_and_does_not_fallback() {
    use std::os::unix::fs::PermissionsExt;
    struct RestoreMode(PathBuf, u32);
    impl Drop for RestoreMode {
        fn drop(&mut self) {
            let _ = std::fs::set_permissions(&self.0, std::fs::Permissions::from_mode(self.1));
        }
    }
    let fixture = Fixture::new();
    let name = "marklyra-v29-trash-fixture-restricted-denied.md";
    fixture.parent.write(name, b"protected").unwrap();
    let source = fixture.source(name, EntryKind::File);
    let placement = RestoreOnDrop(macos::trash_with_denied_parent(&source).unwrap());
    let _mode = RestoreMode(fixture.root.path().to_owned(), 0o700);
    std::fs::set_permissions(fixture.root.path(), std::fs::Permissions::from_mode(0o500)).unwrap();
    assert!(matches!(
        restore(&placement.0),
        Err(TrashFailure::NotMoved(_))
    ));
    macos::verify_restricted_endpoint(&placement.0).unwrap();
    assert!(!fixture.parent.exists(name));
    std::fs::set_permissions(fixture.root.path(), std::fs::Permissions::from_mode(0o700)).unwrap();
    restore(&placement.0).unwrap();
    assert_eq!(fixture.parent.read(name).unwrap(), b"protected");
}

#[cfg(windows)]
#[test]
fn actual_recycle_bin_directory_with_children_moves_and_restores() {
    let fixture = Fixture::new();
    let name = "marklyra-trash-fixture-directory";
    fixture.parent.create_dir(name).unwrap();
    fixture.parent.create_dir(format!("{name}/inner")).unwrap();
    fixture
        .parent
        .write(format!("{name}/inner/note.md"), b"child")
        .unwrap();
    // A directory the app has listed, plus a retained entity handle: neither may block the Shell.
    let listed = fixture.parent.open_dir(name).unwrap();
    assert_eq!(listed.entries().unwrap().count(), 1);
    drop(listed);
    let source = fixture.source(name, EntryKind::Directory);
    let placement = trash(&source).unwrap();
    assert!(!fixture.parent.exists(name));
    restore(&placement).unwrap();
    assert_eq!(
        fixture
            .parent
            .read(format!("{name}/inner/note.md"))
            .unwrap(),
        b"child"
    );
}

#[cfg(windows)]
#[test]
fn actual_recycle_bin_file_moves_and_restores_exclusively() {
    let fixture = Fixture::new();
    let name = "marklyra-trash-fixture-file.md";
    fixture.parent.write(name, b"bytes").unwrap();
    let source = fixture.source(name, EntryKind::File);
    let placement = trash(&source).unwrap();
    assert!(!fixture.parent.exists(name));
    fixture.parent.write(name, b"new occupant").unwrap();
    assert!(matches!(
        restore(&placement),
        Err(TrashFailure::NotMoved(_))
    ));
    fixture.parent.remove_file(name).unwrap();
    restore(&placement).unwrap();
    assert_eq!(fixture.parent.read(name).unwrap(), b"bytes");
}
