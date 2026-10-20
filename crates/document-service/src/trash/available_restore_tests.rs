use super::*;
use crate::{DocumentAuthorities, DocumentChange, DocumentWatch, Encoding};
use std::fs;

const SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;
const ENCODED: &str = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";
fn cap(path: &Path) -> Arc<Dir> {
    Arc::new(Dir::open_ambient_dir(path, cap_std::ambient_authority()).unwrap())
}
fn target<'a>(
    parent: &Path,
    original: &'a Path,
    holding: &'a Path,
    source: &'a Dir,
    identity: &'a same_file::Handle,
    key: Uuid,
) -> TrashRestoreTarget<'a> {
    TrashRestoreTarget {
        parent: cap(parent),
        name: Path::new(original.file_name().unwrap()),
        display: original,
        kind: RenameKind::Directory,
        operation_key: key,
        source_identity: identity,
        source_directory: Some(source),
        source_display: holding,
    }
}

#[test]
fn available_trash_open_follows_directory_restore_and_preserves_shared_own_save_lineage() {
    for codec in [
        Encoding::Utf8,
        Encoding::Utf8Bom,
        Encoding::Utf16LeBom,
        Encoding::Utf16BeBom,
    ] {
        let temporary = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temporary.path()).unwrap();
        let original = root.join("Original/Folder");
        let holding = root.join("TrashStandIn/Folder");
        fs::create_dir_all(original.join("nested")).unwrap();
        fs::create_dir(root.join("TrashStandIn")).unwrap();
        fs::write(
            original.join("nested/A.md"),
            codec.encode("原稿😀\r\nTail  \n").unwrap(),
        )
        .unwrap();
        fs::write(original.join("nested/image.svg"), SVG).unwrap();
        let authorities = Arc::new(DocumentAuthorities::default());
        let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
        let mut second = DocumentService::with_authorities(authorities);
        let a = first
            .open_authorized(&original.join("nested/A.md"))
            .unwrap();
        let key = Uuid::new_v4();
        let trash = first
            .prepare_trash(
                cap(original.parent().unwrap()),
                Path::new("Folder"),
                &original,
                RenameKind::Directory,
                key,
            )
            .unwrap();
        if !crate::directory_test_support::move_retained_directory(&original, &holding) {
            drop(trash);
            crate::directory_test_support::assert_available(
                &first,
                &a.id,
                &original.join("nested/A.md"),
            );
            continue;
        }
        trash.commit();
        let b = second
            .open_authorized(&holding.join("nested/A.md"))
            .unwrap();
        let b_parent = Arc::clone(&second.documents[&b.id].scoped.directory);
        assert!(Arc::ptr_eq(
            &first.documents[&a.id].authority,
            &second.documents[&b.id].authority
        ));
        let image = second.resolve_image(&b.id, "image.svg").unwrap();
        second.save(&b.id, "B own save\r\n").unwrap();
        let bytes = fs::read(holding.join("nested/A.md")).unwrap();
        let identity = same_file::Handle::from_path(&holding).unwrap();
        let source = cap(&holding);
        // A cancelled preparation must not move B's display or mutate its saved text.
        drop(
            second
                .prepare_trash_restore(target(
                    original.parent().unwrap(),
                    &original,
                    &holding,
                    &source,
                    &identity,
                    key,
                ))
                .unwrap(),
        );
        assert_eq!(second.get_metadata(&b.id).unwrap().path, b.path);
        let first_plan = first
            .prepare_trash_restore(target(
                original.parent().unwrap(),
                &original,
                &holding,
                &source,
                &identity,
                key,
            ))
            .unwrap();
        let second_plan = second
            .prepare_trash_restore(target(
                original.parent().unwrap(),
                &original,
                &holding,
                &source,
                &identity,
                key,
            ))
            .unwrap();
        assert_eq!(first_plan.affected_count(), 1);
        assert_eq!(second_plan.affected_count(), 1);
        fs::rename(&holding, &original).unwrap();
        assert_eq!(first_plan.commit()[0].metadata_revision, 2);
        let changed = second_plan.commit();
        assert_eq!(changed[0].metadata_revision, 1);
        assert_eq!(
            changed[0].path,
            original.join("nested/A.md").to_string_lossy()
        );
        assert_eq!(changed[0].location_state, DocumentLocationState::Available);
        assert!(Arc::ptr_eq(
            &second.documents[&b.id].scoped.directory,
            &b_parent
        ));
        assert_eq!(second.documents[&b.id].original_bytes, bytes);
        assert_eq!(second.documents[&b.id].text, "B own save\r\n");
        assert_eq!(
            second.resolve_image(&b.id, "image.svg").unwrap().token,
            image.token
        );
        let saved = second.save(&b.id, "B next dirty\r\n").unwrap();
        assert_eq!(saved.id, b.id);
        assert_eq!(saved.path, original.join("nested/A.md").to_string_lossy());
        assert!(!Path::new(&b.path).exists());
        assert_eq!(
            fs::read(original.join("nested/A.md")).unwrap(),
            codec.encode("B next dirty\r\n").unwrap()
        );
        assert!(matches!(
            first.save(&a.id, "A independent dirty"),
            Err(DocumentError::ExternalChange)
        ));
        assert_eq!(first.documents[&a.id].text, a.text);
    }
}

#[test]
fn available_workspace_images_are_intersected_with_source_not_destination_siblings() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    let original = root.join("Original/Folder");
    let holding = root.join("TrashStandIn/Folder");
    fs::create_dir_all(&original).unwrap();
    fs::create_dir(root.join("TrashStandIn")).unwrap();
    fs::write(
        original.join("A.md"),
        b"![inside](image.svg)\n![outside](../image.svg)\n",
    )
    .unwrap();
    for path in [
        original.join("image.svg"),
        root.join("Original/image.svg"),
        root.join("TrashStandIn/image.svg"),
    ] {
        fs::write(path, SVG).unwrap();
    }
    let mut service = DocumentService::new();
    let a = service.open_authorized(&original.join("A.md")).unwrap();
    let key = Uuid::new_v4();
    let plan = service
        .prepare_trash(
            cap(original.parent().unwrap()),
            Path::new("Folder"),
            &original,
            RenameKind::Directory,
            key,
        )
        .unwrap();
    if !crate::directory_test_support::move_retained_directory(&original, &holding) {
        drop(plan);
        crate::directory_test_support::assert_available(&service, &a.id, &original.join("A.md"));
        return;
    }
    plan.commit();
    let b = service
        .open_in_workspace(
            cap(&root.join("TrashStandIn")),
            Path::new("Folder/A.md"),
            holding.join("A.md"),
        )
        .unwrap();
    let inside = service.resolve_image(&b.id, "image.svg").unwrap();
    let outside = service.resolve_image(&b.id, "../image.svg").unwrap();
    assert_ne!(inside.token, outside.token);
    let outside_bytes = service.image(&outside.token).unwrap().bytes;
    let source = cap(&holding);
    let identity = same_file::Handle::from_path(&holding).unwrap();
    let plan = service
        .prepare_trash_restore(target(
            original.parent().unwrap(),
            &original,
            &holding,
            &source,
            &identity,
            key,
        ))
        .unwrap();
    assert_eq!(plan.affected_count(), 2);
    fs::rename(&holding, &original).unwrap();
    plan.commit();
    assert_eq!(
        service.get_metadata(&a.id).unwrap().path,
        original.join("A.md").to_string_lossy()
    );
    assert_eq!(
        service.get_metadata(&b.id).unwrap().path,
        original.join("A.md").to_string_lossy()
    );
    assert_eq!(
        service.resolve_image(&b.id, "image.svg").unwrap().token,
        inside.token
    );
    assert!(Arc::ptr_eq(
        &outside_bytes,
        &service.image(&outside.token).unwrap().bytes
    ));
    assert!(matches!(
        service.resolve_image(&b.id, "../image.svg"),
        Err(DocumentError::Image(image_assets::ImageError::OutsideScope))
    ));
    assert!(service
        .import_image(&b.id, "clip.svg", ENCODED, "../")
        .is_err());
    let imported = service
        .import_image(&b.id, "clip.svg", ENCODED, "")
        .unwrap();
    assert!(imported.source.starts_with("assets/"));
    assert!(original.join("assets").is_dir());
    assert!(!root.join("Original/assets").exists());
    assert!(!root.join("TrashStandIn/assets").exists());
    assert_eq!(
        fs::read(original.join("A.md")).unwrap(),
        b"![inside](image.svg)\n![outside](../image.svg)\n"
    );
}

#[test]
fn available_handoff_invalidates_old_reload_watch_and_unknown_restore_cannot_reauthorize() {
    for uncertain in [false, true] {
        let temporary = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temporary.path()).unwrap();
        let original = root.join("Original/Folder");
        let holding = root.join("TrashStandIn/Folder");
        fs::create_dir_all(&holding).unwrap();
        fs::create_dir(root.join("Original")).unwrap();
        fs::write(holding.join("A.md"), b"Alpha").unwrap();
        let mut service = DocumentService::new();
        let b = service.open_authorized(&holding.join("A.md")).unwrap();
        let watch = service
            .start_document_watch(&b.id, Arc::new(|_| {}))
            .unwrap();
        let DocumentWatch::Watching { watch_id } = watch else {
            panic!("watch fixture unavailable")
        };
        fs::write(holding.join("A.md"), b"External").unwrap();
        let DocumentChange::Changed { version, .. } = service.check_document_change(&b.id).unwrap()
        else {
            panic!("reload fixture")
        };
        let source = cap(&holding);
        let identity = same_file::Handle::from_path(&holding).unwrap();
        let plan = service
            .prepare_trash_restore(target(
                original.parent().unwrap(),
                &original,
                &holding,
                &source,
                &identity,
                Uuid::new_v4(),
            ))
            .unwrap();
        if !crate::directory_test_support::move_retained_directory(&holding, &original) {
            drop(plan);
            assert_eq!(service.get_metadata(&b.id).unwrap().path, b.path);
            assert_eq!(fs::read(holding.join("A.md")).unwrap(), b"External");
            assert_eq!(service.documents[&b.id].text, b.text);
            continue;
        }
        if uncertain {
            assert_eq!(plan.revoke(), vec![b.id.clone()]);
            assert!(matches!(
                service.save(&b.id, "Dirty"),
                Err(DocumentError::RelocationUncertain)
            ));
            assert!(matches!(
                service.get_metadata(&b.id),
                Err(DocumentError::RelocationUncertain)
            ));
        } else {
            plan.commit();
            assert_eq!(
                service.get_metadata(&b.id).unwrap().path,
                original.join("A.md").to_string_lossy()
            );
            assert!(matches!(
                service.accept_document_change(&b.id, &version),
                Err(DocumentError::StaleReload)
            ));
            assert!(matches!(
                service.save(&b.id, "Dirty"),
                Err(DocumentError::ExternalChange)
            ));
        }
        assert!(!service.stop_document_watch(&b.id, &watch_id));
        assert_eq!(service.documents[&b.id].text, "Alpha");
    }
}

#[test]
fn source_display_and_descendant_parent_must_both_match_the_actual_source() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    let original = root.join("Original/Folder");
    let holding = root.join("TrashStandIn/Folder");
    fs::create_dir_all(holding.join("nested")).unwrap();
    fs::create_dir(root.join("Original")).unwrap();
    fs::write(holding.join("nested/A.md"), b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let b = service
        .open_authorized(&holding.join("nested/A.md"))
        .unwrap();
    let source = cap(&holding);
    let identity = same_file::Handle::from_path(&holding).unwrap();
    let wrong_display = root.join("Wrong");
    assert!(service
        .prepare_trash_restore(target(
            original.parent().unwrap(),
            &original,
            &wrong_display,
            &source,
            &identity,
            Uuid::new_v4()
        ))
        .is_err());
    if !crate::directory_test_support::move_retained_directory(
        &holding.join("nested"),
        &holding.join("retained"),
    ) {
        crate::directory_test_support::assert_available(
            &service,
            &b.id,
            &holding.join("nested/A.md"),
        );
        return;
    }
    fs::create_dir(holding.join("nested")).unwrap();
    fs::write(holding.join("nested/A.md"), b"Alpha").unwrap();
    assert!(matches!(
        service.prepare_trash_restore(target(
            original.parent().unwrap(),
            &original,
            &holding,
            &source,
            &identity,
            Uuid::new_v4()
        )),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(service.get_metadata(&b.id).unwrap().path, b.path);
    assert_eq!(service.get_metadata(&b.id).unwrap().metadata_revision, 0);
    assert!(!original.exists());
}
