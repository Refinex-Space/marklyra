use document_service::{DocumentError, DocumentService};
use std::fs;

#[test]
fn native_receipt_is_compared_to_the_actual_read_file_and_does_not_create_failed_session() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("selected.md");
    fs::write(&path, b"\xef\xbb\xbfkeep\r\n\n").unwrap();
    let selected = same_file::Handle::from_path(&path).unwrap();
    fs::rename(&path, root.path().join("original.md")).unwrap();
    fs::write(&path, b"\xef\xbb\xbfkeep\r\n\n").unwrap();
    let mut documents = DocumentService::new();
    for _ in 0..130 {
        assert!(matches!(
            documents.open_authorized_entity(&path, &selected),
            Err(DocumentError::ExternalChange)
        ));
    }
    fs::remove_file(&path).unwrap();
    fs::rename(root.path().join("original.md"), &path).unwrap();
    let opened = documents.open_authorized_entity(&path, &selected).unwrap();
    documents.save(&opened.id, &opened.text).unwrap();
    assert_eq!(fs::read(path).unwrap(), b"\xef\xbb\xbfkeep\r\n\n");
}

#[test]
fn receipt_from_another_file_cannot_authorize_the_selected_spelling() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("selected.md");
    let other = root.path().join("other.md");
    fs::write(&path, b"same").unwrap();
    fs::write(&other, b"same").unwrap();
    let selected = same_file::Handle::from_path(other).unwrap();
    assert!(matches!(
        DocumentService::new().open_authorized_entity(&path, &selected),
        Err(DocumentError::ExternalChange)
    ));
}

#[test]
fn in_place_edit_keeps_the_entity_and_receipt_reads_current_bytes() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("selected.md");
    fs::write(&path, b"before").unwrap();
    let selected = same_file::Handle::from_path(&path).unwrap();
    fs::write(&path, b"after\r\n").unwrap();
    let opened = DocumentService::new()
        .open_authorized_entity(&path, &selected)
        .unwrap();
    assert_eq!(opened.text, "after\r\n");
}

#[test]
fn native_parent_receipt_rejects_same_leaf_hard_link_under_a_replaced_parent() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("selected");
    fs::create_dir(&path).unwrap();
    let document_path = path.join("A.md");
    fs::write(&document_path, b"current source\r\n").unwrap();
    fs::write(
        path.join("own.svg"),
        br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#,
    )
    .unwrap();
    let leaf = same_file::Handle::from_path(&document_path).unwrap();
    let parent = same_file::Handle::from_path(&path).unwrap();
    let mut documents = DocumentService::new();
    let current = documents.open_authorized(&document_path).unwrap();

    let retained = root.path().join("retained");
    fs::rename(&path, &retained).unwrap();
    fs::create_dir(&path).unwrap();
    fs::hard_link(retained.join("A.md"), &document_path).unwrap();
    fs::write(
        path.join("foreign.svg"),
        br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#,
    )
    .unwrap();
    assert_eq!(same_file::Handle::from_path(&document_path).unwrap(), leaf);
    assert_ne!(same_file::Handle::from_path(&path).unwrap(), parent);
    for _ in 0..130 {
        assert!(matches!(
            documents.open_authorized_entity_in_parent(&document_path, &leaf, &parent),
            Err(DocumentError::ExternalChange)
        ));
    }
    assert!(documents.resolve_image(&current.id, "foreign.svg").is_err());
    assert!(documents.resolve_image(&current.id, "own.svg").is_ok());
    assert_eq!(fs::read(&document_path).unwrap(), b"current source\r\n");
    assert_eq!(documents.get_metadata(&current.id).unwrap().id, current.id);

    fs::remove_file(&document_path).unwrap();
    fs::remove_file(path.join("foreign.svg")).unwrap();
    fs::remove_dir(&path).unwrap();
    fs::rename(&retained, &path).unwrap();
    let candidate = documents
        .open_authorized_entity_in_parent(&document_path, &leaf, &parent)
        .unwrap();
    assert!(documents
        .resolve_image(&candidate.id, "foreign.svg")
        .is_err());
    assert!(documents.resolve_image(&candidate.id, "own.svg").is_ok());
    documents.close(&candidate.id);
    documents
        .save(&current.id, "retained dirty draft\r\n")
        .unwrap();
    assert_eq!(
        fs::read(document_path).unwrap(),
        b"retained dirty draft\r\n"
    );
}

#[test]
fn wrong_parent_is_rejected_before_invalid_source_can_be_decoded_or_registered() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("original")).unwrap();
    fs::create_dir(root.path().join("foreign")).unwrap();
    let original = root.path().join("original/A.md");
    let foreign = root.path().join("foreign/A.md");
    fs::write(&original, [0xff]).unwrap();
    fs::hard_link(&original, &foreign).unwrap();
    let leaf = same_file::Handle::from_path(&original).unwrap();
    let parent = same_file::Handle::from_path(root.path().join("original")).unwrap();
    assert!(matches!(
        DocumentService::new().open_authorized_entity_in_parent(&foreign, &leaf, &parent),
        Err(DocumentError::ExternalChange)
    ));
    // The legacy leaf-only API keeps its documented semantics and actually
    // reaches decoding, while the stronger receipt rejects the parent first.
    assert!(matches!(
        DocumentService::new().open_authorized_entity(&foreign, &leaf),
        Err(DocumentError::UnsupportedEncoding)
    ));
}
