use super::*;
use crate::{DocumentService, RenameKind};
use std::{
    fs,
    io::{Read, Write},
    path::PathBuf,
};

fn fixture() -> (tempfile::TempDir, PathBuf, Arc<Dir>) {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    let directory = Arc::new(Dir::open_ambient_dir(&root, cap_std::ambient_authority()).unwrap());
    (temporary, root, directory)
}

fn capture(
    authorities: &DocumentAuthorities,
    directory: Arc<Dir>,
    root: &Path,
    name: &str,
) -> FileLocationLease {
    let identity = same_file::Handle::from_path(root.join(name)).unwrap();
    authorities
        .lease_file(directory, Path::new(name), &identity)
        .unwrap()
}

#[test]
fn lease_tracks_latest_own_publication_across_windows_without_source_or_undo_changes() {
    let (_temporary, root, directory) = fixture();
    let path = root.join("A.md");
    fs::write(&path, b"\xef\xbb\xbfAlpha\r\nTail  \n").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut second = DocumentService::with_authorities(Arc::clone(&authorities));
    let a = first.open_authorized(&path).unwrap();
    let b = second.open_authorized(&path).unwrap();
    let lease = capture(&authorities, directory, &root, "A.md");
    let original = lease.current_identity().unwrap();
    for text in ["Next1\r\n", "Next2\r\n", "Next3\r\n"] {
        first.save(&a.id, text).unwrap();
        assert_ne!(lease.current_identity().unwrap(), original);
        assert_eq!(
            lease.current_identity().unwrap().as_ref(),
            &same_file::Handle::from_path(&path).unwrap()
        );
        assert_eq!(first.get_metadata(&a.id).unwrap().metadata_revision, 0);
        assert_eq!(second.documents[&b.id].text, b.text);
    }
    let before_noop = lease.current_identity().unwrap();
    first.save(&a.id, "Next3\r\n").unwrap();
    assert_eq!(lease.current_identity().unwrap(), before_noop);
    let mut file = lease.open_current().unwrap();
    let mut bytes = vec![];
    file.read_to_end(&mut bytes).unwrap();
    assert_eq!(bytes, b"\xef\xbb\xbfNext3\r\n");
    assert!(file.write_all(b"not permitted").is_err());
    assert!(matches!(
        second.save(&b.id, "Other dirty"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(
        second.documents[&b.id].original_bytes,
        b"\xef\xbb\xbfAlpha\r\nTail  \n"
    );
}

#[test]
fn lease_can_pin_an_unopened_file_through_move_then_later_own_save() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let new = root.join("B.md");
    fs::write(&old, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut lease = capture(&authorities, directory, &root, "A.md");
    let weak = Arc::downgrade(&lease.authority);
    fs::rename(&old, &new).unwrap();
    lease
        .retarget(Path::new("A.md"), Path::new("B.md"))
        .unwrap();
    let mut service = DocumentService::with_authorities(authorities);
    let document = service.open_authorized(&new).unwrap();
    assert!(Arc::ptr_eq(
        &service.documents[&document.id].authority,
        &lease.authority
    ));
    service.save(&document.id, "After open").unwrap();
    assert_eq!(
        lease.current_identity().unwrap().as_ref(),
        &same_file::Handle::from_path(&new).unwrap()
    );
    service.close(&document.id);
    assert!(weak.upgrade().is_some());
    drop(lease);
    assert!(weak.upgrade().is_none());
}

#[test]
fn retarget_accepts_a_shared_group_already_updated_by_document_plans() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let new = root.join("B.md");
    fs::write(&old, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut service = DocumentService::with_authorities(Arc::clone(&authorities));
    let document = service.open_authorized(&old).unwrap();
    let mut lease = capture(&authorities, Arc::clone(&directory), &root, "A.md");
    let plan = service
        .prepare_rename(
            directory,
            Path::new("A.md"),
            Path::new("B.md"),
            &old,
            &new,
            RenameKind::File,
        )
        .unwrap();
    fs::rename(&old, &new).unwrap();
    plan.commit();
    lease
        .retarget(Path::new("A.md"), Path::new("B.md"))
        .unwrap();
    service.save(&document.id, "Saved after rename").unwrap();
    assert_eq!(
        lease.current_identity().unwrap().as_ref(),
        &same_file::Handle::from_path(&new).unwrap()
    );
    assert!(matches!(
        lease.retarget(Path::new("A.md"), Path::new("C.md")),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(lease.current_identity().is_ok());
    assert!(!root.join("C.md").exists());
}

#[test]
fn external_same_byte_replacement_and_its_fresh_open_never_advance_the_lease() {
    let (_temporary, root, directory) = fixture();
    let path = root.join("A.md");
    fs::write(&path, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut service = DocumentService::with_authorities(Arc::clone(&authorities));
    let document = service.open_authorized(&path).unwrap();
    let lease = capture(&authorities, directory, &root, "A.md");
    service.save(&document.id, "Next").unwrap();
    service.save(&document.id, "Alpha").unwrap();
    fs::rename(&path, root.join("retained.md")).unwrap();
    fs::write(&path, b"Alpha").unwrap();
    let fresh = service.open_authorized(&path).unwrap();
    assert!(!Arc::ptr_eq(
        &service.documents[&fresh.id].authority,
        &lease.authority
    ));
    service.save(&fresh.id, "New grant").unwrap();
    service.save(&fresh.id, "Alpha").unwrap();
    assert!(matches!(
        lease.current_identity(),
        Err(DocumentError::ExternalChange)
    ));
    assert!(matches!(
        lease.open_current(),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(root.join("retained.md")).unwrap(), b"Alpha");
}

#[test]
fn capture_and_retarget_validate_exact_names_and_cannot_adopt_a_wrong_identity() {
    let (_temporary, root, directory) = fixture();
    fs::write(root.join("A.md"), b"Alpha").unwrap();
    fs::write(root.join("Other.md"), b"Alpha").unwrap();
    fs::create_dir(root.join("dir")).unwrap();
    let authorities = DocumentAuthorities::default();
    let identity = same_file::Handle::from_path(root.join("A.md")).unwrap();
    let other = same_file::Handle::from_path(root.join("Other.md")).unwrap();
    assert!(matches!(
        authorities.lease_file(Arc::clone(&directory), Path::new("A.md"), &other),
        Err(DocumentError::ExternalChange)
    ));
    for invalid in ["", ".", "..", "../A.md", "dir/A.md", "/A.md", "A\0.md"] {
        assert!(
            matches!(
                authorities.lease_file(Arc::clone(&directory), Path::new(invalid), &identity),
                Err(DocumentError::InvalidPath)
            ),
            "{invalid:?}"
        );
    }
    let mut lease = capture(&authorities, directory, &root, "A.md");
    for invalid in ["../B.md", "dir/B.md", "", "B\0.md"] {
        assert!(matches!(
            lease.retarget(Path::new("A.md"), Path::new(invalid)),
            Err(DocumentError::InvalidPath)
        ));
        assert!(lease.current_identity().is_ok());
    }
    assert!(matches!(
        lease.retarget(Path::new("Other.md"), Path::new("B.md")),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(lease.current_identity().is_ok());
}

#[test]
fn a_same_byte_replacement_during_handle_validation_is_rejected() {
    let (_temporary, root, directory) = fixture();
    let path = root.join("A.md");
    fs::write(&path, b"Alpha").unwrap();
    let authorities = DocumentAuthorities::default();
    let lease = capture(&authorities, directory, &root, "A.md");
    let result = lease.open_with_hook(|| {
        fs::rename(&path, root.join("retained.md")).unwrap();
        fs::write(&path, b"Alpha").unwrap();
    });
    assert!(matches!(result, Err(DocumentError::ExternalChange)));
    assert_eq!(fs::read(&path).unwrap(), b"Alpha");
}

#[test]
fn failed_save_does_not_advance_lease_and_revoke_or_poison_is_a_typed_failure() {
    let (_temporary, root, directory) = fixture();
    let path = root.join("A.md");
    fs::write(&path, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut service = DocumentService::with_authorities(Arc::clone(&authorities));
    let document = service.open_authorized(&path).unwrap();
    let mut lease = capture(&authorities, directory, &root, "A.md");
    let identity = lease.current_identity().unwrap();
    fs::write(&path, b"External").unwrap();
    assert!(matches!(
        service.save(&document.id, "Ours"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(lease.current_identity().unwrap(), identity);
    lease.authority.revoke();
    assert!(matches!(
        lease.open_current(),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(matches!(
        lease.retarget(Path::new("A.md"), Path::new("B.md")),
        Err(DocumentError::RelocationUncertain)
    ));

    let fresh = capture(
        &authorities,
        Arc::clone(&lease.scope.directory),
        &root,
        "A.md",
    );
    let authority = Arc::clone(&fresh.authority);
    let scope = fresh.scope.clone();
    assert!(std::thread::spawn(move || {
        let _held = authority.current(&scope).unwrap();
        panic!("controlled authority poison");
    })
    .join()
    .is_err());
    let mut fresh = fresh;
    assert!(matches!(
        fresh.current_identity(),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(matches!(
        fresh.retarget(Path::new("A.md"), Path::new("B.md")),
        Err(DocumentError::RelocationUncertain)
    ));
}

#[cfg(unix)]
#[test]
fn symbolic_link_name_is_not_a_file_location_lease() {
    let (_temporary, root, directory) = fixture();
    fs::write(root.join("A.md"), b"Alpha").unwrap();
    std::os::unix::fs::symlink("A.md", root.join("link.md")).unwrap();
    let identity = same_file::Handle::from_path(root.join("A.md")).unwrap();
    assert!(matches!(
        DocumentAuthorities::default().lease_file(directory, Path::new("link.md"), &identity),
        Err(DocumentError::InvalidPath)
    ));
}
