use cap_std::{ambient_authority, fs::Dir};
use document_service::{DocumentError, DocumentService};
use std::{fs, sync::Arc};

const SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>"#;

#[test]
fn document_ids_control_image_registration_and_closing_invalidates_urls() {
    let directory = tempfile::tempdir().unwrap();
    let note = directory.path().join("note.md");
    fs::write(&note, "![test](image.svg)").unwrap();
    fs::write(directory.path().join("image.svg"), SVG).unwrap();
    let mut service = DocumentService::new();
    assert!(matches!(
        service.resolve_image("unknown", "image.svg"),
        Err(DocumentError::UnknownDocument)
    ));
    let first = service.open_authorized(&note).unwrap();
    let second = service.open_authorized(&note).unwrap();
    let first_image = service.resolve_image(&first.id, "image.svg").unwrap();
    let second_image = service.resolve_image(&second.id, "image.svg").unwrap();
    assert_ne!(first_image.token, second_image.token);
    service.close(&first.id);
    assert!(service.image(&first_image.token).is_none());
    assert_eq!(
        service.image(&second_image.token).unwrap().bytes.as_ref(),
        SVG
    );
    assert!(matches!(
        service.resolve_image(&first.id, "image.svg"),
        Err(DocumentError::UnknownDocument)
    ));
    assert!(matches!(
        service.import_image(&first.id, "x.png", "AA==", ""),
        Err(DocumentError::UnknownDocument)
    ));
    assert!(!directory.path().join("assets").exists());
}

#[test]
fn only_explicit_workspace_open_grants_images_in_sibling_directories() {
    let directory = tempfile::tempdir().unwrap();
    fs::create_dir(directory.path().join("notes")).unwrap();
    fs::create_dir(directory.path().join("shared")).unwrap();
    let note = directory.path().join("notes/note.md");
    fs::write(&note, "note").unwrap();
    fs::write(directory.path().join("shared/image.svg"), SVG).unwrap();
    let mut service = DocumentService::new();
    let direct = service.open_authorized(&note).unwrap();
    assert!(service
        .resolve_image(&direct.id, "../shared/image.svg")
        .is_err());
    let display = fs::canonicalize(&note).unwrap();
    let root = Arc::new(Dir::open_ambient_dir(directory.path(), ambient_authority()).unwrap());
    let workspace = service
        .open_in_workspace(root, std::path::Path::new("notes/note.md"), display)
        .unwrap();
    let image = service
        .resolve_image(&workspace.id, "../shared/image.svg")
        .unwrap();
    assert_eq!(service.image(&image.token).unwrap().bytes.as_ref(), SVG);
    assert_eq!(fs::read(&note).unwrap(), b"note");
}

#[test]
fn folder_placeholder_uses_authorized_document_stem_and_default_wrapper_is_unchanged() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("真实文档.md"), "unchanged").unwrap();
    let mut service = DocumentService::new();
    let document = service
        .open_authorized(&temp.path().join("真实文档.md"))
        .unwrap();
    // Static authored SVG, base64 has no source file path authority.
    let encoded = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";
    let imported = service
        .import_image_with_folder(&document.id, "clip.svg", encoded, "", "${filename}.assets")
        .unwrap();
    assert!(temp.path().join("真实文档.assets").is_dir());
    assert!(imported
        .source
        .starts_with("%E7%9C%9F%E5%AE%9E%E6%96%87%E6%A1%A3.assets/"));
    let imported = service
        .import_image(&document.id, "clip.svg", encoded, "")
        .unwrap();
    assert!(imported.source.starts_with("assets/"));
    assert!(service
        .import_image_with_folder(&document.id, "clip.svg", encoded, "", "${unknown}.assets")
        .is_err());
    assert_eq!(
        fs::read_to_string(temp.path().join("真实文档.md")).unwrap(),
        "unchanged"
    );
}
