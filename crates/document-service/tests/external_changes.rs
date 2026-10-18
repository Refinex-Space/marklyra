use document_service::{
    DocumentChange, DocumentError, DocumentPayload, DocumentService, Encoding, UnreadableReason,
};
use std::{fs, path::Path};

fn open(path: &Path, service: &mut DocumentService, text: &str) -> DocumentPayload {
    fs::write(path, text).unwrap();
    service.open_authorized(path).unwrap()
}
fn changed(service: &mut DocumentService, id: &str) -> (String, DocumentPayload) {
    let DocumentChange::Changed { version, document } = service.check_document_change(id).unwrap()
    else {
        panic!("expected changed");
    };
    (version, document)
}
#[test]
fn actual_bytes_detect_same_size_same_mtime_change_without_advancing_baseline() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    let mut service = DocumentService::new();
    let opened = open(&path, &mut service, "first");
    let modified = fs::metadata(&path).unwrap().modified().unwrap();
    assert_eq!(
        service.check_document_change(&opened.id).unwrap(),
        DocumentChange::Unchanged
    );
    fs::write(&path, b"other").unwrap();
    fs::File::options()
        .write(true)
        .open(&path)
        .unwrap()
        .set_modified(modified)
        .unwrap();
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), modified);
    let (version, candidate) = changed(&mut service, &opened.id);
    assert_eq!(candidate.text, "other");
    assert_eq!(candidate.id, opened.id);
    assert_eq!(changed(&mut service, &opened.id).0, version);
    assert!(matches!(
        service.save(&opened.id, "mine"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&path).unwrap(), b"other");
    assert!(service
        .dismiss_document_change(&opened.id, &version)
        .unwrap());
    assert!(matches!(
        service.save(&opened.id, "first"),
        Err(DocumentError::ExternalChange)
    ));
}
#[test]
fn acceptance_is_read_only_and_preserves_each_detected_encoding_exactly() {
    for encoding in [
        Encoding::Utf8,
        Encoding::Utf8Bom,
        Encoding::Utf16LeBom,
        Encoding::Utf16BeBom,
    ] {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let mut service = DocumentService::new();
        let opened = open(&path, &mut service, "old");
        let text = "中文 😀\r\nsoft\nending\r\n";
        let bytes = encoding.encode(text).unwrap();
        fs::write(&path, &bytes).unwrap();
        let modified = fs::metadata(&path).unwrap().modified().unwrap();
        let (version, candidate) = changed(&mut service, &opened.id);
        assert_eq!(candidate.text, text);
        assert_eq!(candidate.encoding, encoding.label());
        let accepted = service
            .accept_document_change(&opened.id, &version)
            .unwrap();
        assert_eq!(accepted, candidate);
        assert_eq!(service.save(&opened.id, text).unwrap(), candidate);
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), modified);
        assert_eq!(fs::read(&path).unwrap(), bytes);
        service.save(&opened.id, "next 🦀").unwrap();
        assert_eq!(
            fs::read(&path).unwrap(),
            encoding.encode("next 🦀").unwrap()
        );
        assert!(matches!(
            service.accept_document_change(&opened.id, &version),
            Err(DocumentError::StaleReload)
        ));
    }
}
#[test]
fn changed_disk_during_reload_rejects_accept_and_keeps_original_baseline() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    let mut service = DocumentService::new();
    let opened = open(&path, &mut service, "base");
    fs::write(&path, b"v1").unwrap();
    let (token, _) = changed(&mut service, &opened.id);
    fs::write(&path, b"v2").unwrap();
    assert!(matches!(
        service.accept_document_change(&opened.id, &token),
        Err(DocumentError::StaleReload)
    ));
    assert!(matches!(
        service.save(&opened.id, "mine"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&path).unwrap(), b"v2");
    let (token, _) = changed(&mut service, &opened.id);
    service.accept_document_change(&opened.id, &token).unwrap();
    fs::write(&path, b"v3").unwrap();
    assert!(matches!(
        service.save(&opened.id, "mine"),
        Err(DocumentError::ExternalChange)
    ));
}
#[test]
fn stale_dismiss_or_accept_cannot_consume_a_newer_candidate() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    let mut service = DocumentService::new();
    let opened = open(&path, &mut service, "base");
    fs::write(&path, b"first").unwrap();
    let (first, _) = changed(&mut service, &opened.id);
    fs::write(&path, b"second").unwrap();
    let (second, _) = changed(&mut service, &opened.id);
    assert_ne!(first, second);
    assert!(!service.dismiss_document_change(&opened.id, &first).unwrap());
    assert!(matches!(
        service.accept_document_change(&opened.id, &first),
        Err(DocumentError::StaleReload)
    ));
    assert_eq!(
        service
            .accept_document_change(&opened.id, &second)
            .unwrap()
            .text,
        "second"
    );
}
#[test]
fn tokens_are_document_specific_and_close_revokes_only_that_session() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    let mut service = DocumentService::new();
    let first = open(&path, &mut service, "base");
    let second = service.open_authorized(&path).unwrap();
    fs::write(&path, b"external").unwrap();
    let (token1, _) = changed(&mut service, &first.id);
    let (token2, _) = changed(&mut service, &second.id);
    assert!(matches!(
        service.accept_document_change(&second.id, &token1),
        Err(DocumentError::StaleReload)
    ));
    service.close(&first.id);
    assert!(matches!(
        service.accept_document_change(&first.id, &token1),
        Err(DocumentError::UnknownDocument)
    ));
    assert_eq!(
        service
            .accept_document_change(&second.id, &token2)
            .unwrap()
            .text,
        "external"
    );
}
#[test]
fn missing_invalid_and_oversized_inputs_report_status_without_replacing_text() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    let mut service = DocumentService::new();
    let opened = open(&path, &mut service, "base");
    fs::remove_file(&path).unwrap();
    assert!(matches!(
        service.check_document_change(&opened.id).unwrap(),
        DocumentChange::Missing { .. }
    ));
    fs::write(&path, [0xff]).unwrap();
    assert!(matches!(
        service.check_document_change(&opened.id).unwrap(),
        DocumentChange::Unreadable {
            reason: UnreadableReason::UnsupportedEncoding,
            ..
        }
    ));
    fs::File::options()
        .write(true)
        .open(&path)
        .unwrap()
        .set_len(document_service::MAX_FILE_BYTES as u64 + 1)
        .unwrap();
    assert!(matches!(
        service.check_document_change(&opened.id).unwrap(),
        DocumentChange::Unreadable {
            reason: UnreadableReason::TooLarge,
            ..
        }
    ));
    fs::remove_file(&path).unwrap();
    fs::create_dir(&path).unwrap();
    assert!(matches!(
        service.check_document_change(&opened.id).unwrap(),
        DocumentChange::Unreadable {
            reason: UnreadableReason::InvalidPath,
            ..
        }
    ));
    assert!(matches!(
        service.save(&opened.id, "mine"),
        Err(DocumentError::ExternalChange)
    ));
}
#[test]
fn reverting_disk_and_saving_invalidates_the_old_candidate() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    let mut service = DocumentService::new();
    let opened = open(&path, &mut service, "base");
    fs::write(&path, b"outside").unwrap();
    let (token, _) = changed(&mut service, &opened.id);
    fs::write(&path, b"base").unwrap();
    service.save(&opened.id, "base").unwrap();
    fs::write(&path, b"outside").unwrap();
    assert!(matches!(
        service.accept_document_change(&opened.id, &token),
        Err(DocumentError::StaleReload)
    ));
    assert!(matches!(
        service.save(&opened.id, "base"),
        Err(DocumentError::ExternalChange)
    ));
}
#[test]
fn atomic_replacement_after_check_invalidates_token_even_if_bytes_match() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    let other = dir.path().join("replacement.md");
    let mut service = DocumentService::new();
    let opened = open(&path, &mut service, "base");
    fs::write(&path, b"outside").unwrap();
    let (token, _) = changed(&mut service, &opened.id);
    fs::write(&other, b"outside").unwrap();
    fs::rename(&other, &path).unwrap();
    assert!(matches!(
        service.accept_document_change(&opened.id, &token),
        Err(DocumentError::StaleReload)
    ));
    let (next, _) = changed(&mut service, &opened.id);
    assert_ne!(next, token);
    assert_eq!(
        service
            .accept_document_change(&opened.id, &next)
            .unwrap()
            .text,
        "outside"
    );
}
#[cfg(unix)]
#[test]
fn symlink_replacement_never_grants_external_read_or_acceptance() {
    use std::os::unix::fs::symlink;
    let dir = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    let secret = outside.path().join("private.md");
    let mut service = DocumentService::new();
    let opened = open(&path, &mut service, "base");
    fs::write(&path, b"candidate").unwrap();
    let (token, _) = changed(&mut service, &opened.id);
    fs::write(&secret, b"do-not-read").unwrap();
    fs::remove_file(&path).unwrap();
    symlink(&secret, &path).unwrap();
    assert!(matches!(
        service.accept_document_change(&opened.id, &token),
        Err(DocumentError::StaleReload)
    ));
    assert!(matches!(
        service.check_document_change(&opened.id).unwrap(),
        DocumentChange::Unreadable {
            reason: UnreadableReason::InvalidPath,
            ..
        }
    ));
    assert_eq!(fs::read(&secret).unwrap(), b"do-not-read");
}
#[cfg(unix)]
#[test]
fn picker_and_workspace_sessions_keep_their_original_directory_authority() {
    use std::{os::unix::fs::symlink, sync::Arc};
    for workspace in [false, true] {
        let dir = tempfile::tempdir().unwrap();
        let parent = dir.path().join("parent");
        let outside = dir.path().join("outside");
        fs::create_dir(&parent).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(parent.join("note.md"), b"base").unwrap();
        fs::write(outside.join("note.md"), b"not-authorized").unwrap();
        let mut service = DocumentService::new();
        let opened = if workspace {
            service
                .open_in_directory(
                    Arc::new(
                        cap_std::fs::Dir::open_ambient_dir(&parent, cap_std::ambient_authority())
                            .unwrap(),
                    ),
                    Path::new("note.md"),
                    parent.join("note.md"),
                )
                .unwrap()
        } else {
            service.open_authorized(&parent.join("note.md")).unwrap()
        };
        let moved = dir.path().join("moved");
        fs::rename(&parent, &moved).unwrap();
        symlink(&outside, &parent).unwrap();
        fs::write(moved.join("note.md"), b"changed-in-granted-folder").unwrap();
        let (token, candidate) = changed(&mut service, &opened.id);
        assert_eq!(candidate.text, "changed-in-granted-folder");
        service.accept_document_change(&opened.id, &token).unwrap();
        service.save(&opened.id, "ours").unwrap();
        assert_eq!(fs::read(moved.join("note.md")).unwrap(), b"ours");
        assert_eq!(
            fs::read(outside.join("note.md")).unwrap(),
            b"not-authorized"
        );
    }
}
