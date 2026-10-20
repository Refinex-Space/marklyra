//! A retained cap-std directory is movable on Unix, but pins its Windows path
//! against rename/delete to protect sandboxed lookups. Test both contracts.
use crate::{DocumentLocationState, DocumentService};
use std::{fs, path::Path};

pub(crate) fn move_retained_directory(from: &Path, to: &Path) -> bool {
    let result = fs::rename(from, to);
    if cfg!(windows) {
        let error = result.expect_err("Windows must keep retained capability directories pinned");
        assert!(matches!(error.raw_os_error(), Some(5 | 32)), "{error}");
        assert!(from.is_dir(), "a denied move must retain its source");
        assert!(!to.exists(), "a denied move must not publish a destination");
        false
    } else {
        result.unwrap();
        true
    }
}

pub(crate) fn assert_available(service: &DocumentService, id: &str, path: &Path) {
    let metadata = service.get_metadata(id).unwrap();
    assert_eq!(metadata.path, path.to_string_lossy());
    assert_eq!(metadata.location_state, DocumentLocationState::Available);
    let document = &service.documents[id];
    assert_eq!(fs::read(path).unwrap(), document.original_bytes);
}

#[test]
#[cfg(windows)]
fn closing_documents_releases_directory_pin_without_weakening_capability_sharing() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    let old = root.join("Folder");
    let new = root.join("Moved");
    fs::create_dir(&old).unwrap();
    fs::write(old.join("A.md"), b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old.join("A.md")).unwrap();
    assert!(!move_retained_directory(&old, &new));
    assert_available(&service, &opened.id, &old.join("A.md"));
    service.save(&opened.id, "Saved before close").unwrap();
    service.close(&opened.id);
    fs::rename(&old, &new).unwrap();
    assert_eq!(fs::read(new.join("A.md")).unwrap(), b"Saved before close");
}
