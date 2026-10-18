use super::*;
use crate::{DocumentAuthorities, Encoding, TrashFileLocationLease};
use std::fs;

const SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;
fn cap(path: &Path) -> Arc<Dir> {
    Arc::new(Dir::open_ambient_dir(path, cap_std::ambient_authority()).unwrap())
}
fn target<'a>(
    original: &'a Path,
    holding: &'a Path,
    key: Uuid,
    identity: &'a same_file::Handle,
) -> TrashRestoreTarget<'a> {
    TrashRestoreTarget {
        parent: cap(original.parent().unwrap()),
        name: Path::new(original.file_name().unwrap()),
        display: original,
        kind: RenameKind::File,
        operation_key: key,
        source_identity: identity,
        source_directory: None,
        source_display: holding,
    }
}
fn trash(
    first: &mut DocumentService,
    authorities: &DocumentAuthorities,
    original: &Path,
    holding: &Path,
    key: Uuid,
) -> TrashFileLocationLease {
    let identity = same_file::Handle::from_path(original).unwrap();
    let lease = authorities
        .lease_file(
            cap(original.parent().unwrap()),
            Path::new(original.file_name().unwrap()),
            &identity,
        )
        .unwrap()
        .prepare_trash(key)
        .unwrap();
    let plan = first
        .prepare_trash(
            cap(original.parent().unwrap()),
            Path::new(original.file_name().unwrap()),
            original,
            RenameKind::File,
            key,
        )
        .unwrap();
    fs::rename(original, holding).unwrap();
    let lease = lease.commit(holding).unwrap();
    plan.commit();
    lease
}

#[test]
fn file_restore_rebinds_actual_parent_and_preserves_independent_baselines_and_image_denial() {
    for codec in [
        Encoding::Utf8,
        Encoding::Utf8Bom,
        Encoding::Utf16LeBom,
        Encoding::Utf16BeBom,
    ] {
        let temporary = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temporary.path()).unwrap();
        fs::create_dir(root.join("Original")).unwrap();
        fs::create_dir(root.join("Holding")).unwrap();
        let original = root.join("Original/A.md");
        let holding = root.join("Holding/A 2.md");
        let raw = "原稿😀\r\nTail  \n";
        fs::write(&original, codec.encode(raw).unwrap()).unwrap();
        fs::write(root.join("Original/image.svg"), SVG).unwrap();
        fs::write(root.join("Holding/image.svg"), SVG).unwrap();
        let authorities = Arc::new(DocumentAuthorities::default());
        let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
        let mut second = DocumentService::with_authorities(Arc::clone(&authorities));
        let a = first.open_authorized(&original).unwrap();
        let key = Uuid::new_v4();
        let lease = trash(&mut first, &authorities, &original, &holding, key);
        assert!(lease.current_source().unwrap().is_none());
        let b = second.open_authorized(&holding).unwrap();
        assert!(Arc::ptr_eq(
            &first.documents[&a.id].authority,
            &second.documents[&b.id].authority
        ));
        let image = second.resolve_image(&b.id, "image.svg").unwrap();
        let cached = second.image(&image.token).unwrap().bytes;
        second.save(&b.id, "B own\r\n").unwrap();
        let watch = second
            .start_document_watch(&b.id, Arc::new(|_| {}))
            .unwrap();
        let crate::DocumentWatch::Watching { watch_id } = watch else {
            panic!("watch fixture unavailable")
        };
        fs::write(&holding, codec.encode("External draft\r\n").unwrap()).unwrap();
        let crate::DocumentChange::Changed { version, .. } =
            second.check_document_change(&b.id).unwrap()
        else {
            panic!("reload candidate")
        };
        // Restore the fixture's own bytes without changing its identity. The
        // retained candidate must still be retired by location transition.
        fs::write(&holding, codec.encode("B own\r\n").unwrap()).unwrap();
        let source = lease.current_source().unwrap().unwrap();
        let identity = source.identity();
        assert_ne!(identity.as_ref(), source.initial_identity());
        drop(
            second
                .prepare_file_trash_restore(target(&original, &holding, key, &identity), &lease)
                .unwrap(),
        );
        assert_eq!(second.get_metadata(&b.id).unwrap().path, b.path);
        let a_plan = first
            .prepare_file_trash_restore(target(&original, &holding, key, &identity), &lease)
            .unwrap();
        let b_plan = second
            .prepare_file_trash_restore(target(&original, &holding, key, &identity), &lease)
            .unwrap();
        fs::rename(&holding, &original).unwrap();
        lease.finish_restore().unwrap();
        assert_eq!(
            a_plan.commit()[0].location_state,
            DocumentLocationState::Available
        );
        assert_eq!(b_plan.commit()[0].path, original.to_string_lossy());
        assert!(!second.stop_document_watch(&b.id, &watch_id));
        assert!(matches!(
            second.accept_document_change(&b.id, &version),
            Err(DocumentError::StaleReload)
        ));
        assert_eq!(first.documents[&a.id].text, raw);
        assert_eq!(second.documents[&b.id].text, "B own\r\n");
        assert!(same_directory(
            &second.documents[&b.id].scoped.directory,
            &cap(original.parent().unwrap())
        )
        .unwrap());
        assert_eq!(second.documents[&b.id].scoped.name, Path::new("A.md"));
        assert!(Arc::ptr_eq(
            &cached,
            &second.image(&image.token).unwrap().bytes
        ));
        assert!(matches!(
            second.resolve_image(&b.id, "image.svg"),
            Err(DocumentError::Image(image_assets::ImageError::OutsideScope))
        ));
        assert!(second
            .import_image(
                &b.id,
                "clip.svg",
                "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
                ""
            )
            .is_err());
        assert!(!root.join("Original/assets").exists());
        second.save(&b.id, "B next\n").unwrap();
        assert_eq!(
            fs::read(&original).unwrap(),
            codec.encode("B next\n").unwrap()
        );
        assert!(!holding.exists());
        assert!(matches!(
            first.save(&a.id, "A dirty"),
            Err(DocumentError::ExternalChange)
        ));
        assert!(first.resolve_image(&a.id, "image.svg").is_ok());
    }
}

#[test]
fn the_undo_pin_keeps_a_closed_alias_own_publication_and_does_not_rebind_a_save_as_fork() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir(root.join("Holding")).unwrap();
    let original = root.join("A.md");
    let holding = root.join("Holding/A.md");
    fs::write(&original, b"Alpha\r\n").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut second = DocumentService::with_authorities(Arc::clone(&authorities));
    let a = first.open_authorized(&original).unwrap();
    let key = Uuid::new_v4();
    let lease = trash(&mut first, &authorities, &original, &holding, key);
    let b = second.open_authorized(&holding).unwrap();
    second.save(&b.id, "B own").unwrap();
    second.close(&b.id);
    let fork = first
        .save_as_authorized(&root.join("Fork.md"), "A dirty", Some(&a.id))
        .unwrap();
    first.close(&a.id);
    let source = lease.current_source().unwrap().unwrap();
    let identity = source.identity();
    let plan = first
        .prepare_file_trash_restore(target(&original, &holding, key, &identity), &lease)
        .unwrap();
    assert_eq!(plan.affected_count(), 0);
    fs::rename(&holding, &original).unwrap();
    lease.finish_restore().unwrap();
    plan.commit();
    assert_eq!(first.get_metadata(&fork.id).unwrap().path, fork.path);
    assert_eq!(fs::read(&original).unwrap(), b"B own");
    assert_eq!(fs::read(root.join("Fork.md")).unwrap(), b"A dirty");
}

#[test]
fn suspended_original_names_and_same_inode_other_locations_do_not_join_the_native_trash_group() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir(root.join("Holding")).unwrap();
    let original = root.join("A.md");
    let holding = root.join("Holding/A.md");
    fs::write(&original, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut second = DocumentService::with_authorities(Arc::clone(&authorities));
    let a = first.open_authorized(&original).unwrap();
    let lease = trash(
        &mut first,
        &authorities,
        &original,
        &holding,
        Uuid::new_v4(),
    );
    fs::hard_link(&holding, &original).unwrap();
    fs::hard_link(&holding, root.join("Alias.md")).unwrap();
    for path in [&original, &root.join("Alias.md")] {
        let b = second.open_authorized(path).unwrap();
        assert!(!Arc::ptr_eq(
            &first.documents[&a.id].authority,
            &second.documents[&b.id].authority
        ));
    }
    assert!(lease.current_source().unwrap().is_none());
    assert!(matches!(
        first.save(&a.id, "Dirty"),
        Err(DocumentError::Trashed)
    ));
}

#[test]
fn external_equal_bytes_replacement_and_wrong_restore_operation_are_rejected_without_retargeting() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir(root.join("Holding")).unwrap();
    let original = root.join("A.md");
    let holding = root.join("Holding/A.md");
    fs::write(&original, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut second = DocumentService::with_authorities(Arc::clone(&authorities));
    let a = first.open_authorized(&original).unwrap();
    let key = Uuid::new_v4();
    let lease = trash(&mut first, &authorities, &original, &holding, key);
    let b = second.open_authorized(&holding).unwrap();
    second.save(&b.id, "Own").unwrap();
    let identity = lease.current_source().unwrap().unwrap().identity();
    assert!(first
        .prepare_file_trash_restore(
            target(&original, &holding, Uuid::new_v4(), &identity),
            &lease
        )
        .is_err());
    fs::rename(&holding, root.join("Holding/old.md")).unwrap();
    fs::write(&holding, b"Own").unwrap();
    assert!(lease.current_source().is_err());
    assert_eq!(
        first.get_metadata(&a.id).unwrap().location_state,
        DocumentLocationState::Trashed
    );
    assert_eq!(second.get_metadata(&b.id).unwrap().path, b.path);
    assert_eq!(fs::read(&holding).unwrap(), b"Own");
    assert!(!original.exists());
}

#[test]
fn wrong_endpoint_parent_and_unproven_alias_do_not_acquire_the_restore_group() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir(root.join("Holding")).unwrap();
    fs::create_dir(root.join("Other")).unwrap();
    let original = root.join("A.md");
    let holding = root.join("Holding/A.md");
    fs::write(&original, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
    let a = first.open_authorized(&original).unwrap();
    let key = Uuid::new_v4();
    let lease = trash(&mut first, &authorities, &original, &holding, key);
    let identity = same_file::Handle::from_path(&holding).unwrap();
    let wrong = root.join("Other/A.md");
    assert!(first
        .prepare_file_trash_restore(target(&wrong, &holding, key, &identity), &lease)
        .is_err());
    let false_source = root.join("Other/False.md");
    assert!(first
        .prepare_file_trash_restore(target(&original, &false_source, key, &identity), &lease)
        .is_err());
    // Opening the same path with a different injected registry supplies no
    // native publication proof, even when its bytes/inode currently match.
    let mut foreign = DocumentService::new();
    let b = foreign.open_authorized(&holding).unwrap();
    assert!(foreign
        .prepare_file_trash_restore(target(&original, &holding, key, &identity), &lease)
        .is_err());
    assert_eq!(foreign.get_metadata(&b.id).unwrap().path, b.path);
    drop(lease); // Consumed/replaced file Undo never leaves a joinable grant.
    let mut fresh = DocumentService::with_authorities(authorities);
    let c = fresh.open_authorized(&holding).unwrap();
    assert!(!Arc::ptr_eq(
        &first.documents[&a.id].authority,
        &fresh.documents[&c.id].authority
    ));
    assert!(matches!(
        first.save(&a.id, "Dirty"),
        Err(DocumentError::Trashed)
    ));
    assert!(!original.exists());
    assert_eq!(fs::read(&holding).unwrap(), b"Alpha");
}

#[test]
fn uncertain_alias_restore_revokes_shared_authority_and_keeps_each_draft_for_save_as() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir(root.join("Holding")).unwrap();
    let original = root.join("A.md");
    let holding = root.join("Holding/A.md");
    fs::write(&original, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut second = DocumentService::with_authorities(Arc::clone(&authorities));
    let a = first.open_authorized(&original).unwrap();
    let key = Uuid::new_v4();
    let lease = trash(&mut first, &authorities, &original, &holding, key);
    let b = second.open_authorized(&holding).unwrap();
    second.save(&b.id, "B own").unwrap();
    let identity = lease.current_source().unwrap().unwrap().identity();
    let pa = first
        .prepare_file_trash_restore(target(&original, &holding, key, &identity), &lease)
        .unwrap();
    let pb = second
        .prepare_file_trash_restore(target(&original, &holding, key, &identity), &lease)
        .unwrap();
    assert_eq!(pa.revoke(), vec![a.id.clone()]);
    assert_eq!(pb.revoke(), vec![b.id.clone()]);
    assert!(lease.current_source().is_err());
    assert!(lease.finish_restore().is_err());
    assert!(second.save(&b.id, "Dirty").is_err());
    let fork = second
        .save_as_authorized(&root.join("Fork.md"), "B dirty", Some(&b.id))
        .unwrap();
    assert_eq!(fs::read(&fork.path).unwrap(), b"B dirty");
    assert_eq!(first.documents[&a.id].text, "Alpha");
    assert_eq!(second.documents[&b.id].text, "B own");
    assert_eq!(fs::read(&holding).unwrap(), b"B own");
}

#[test]
fn restored_aliases_alternate_own_publications_without_merging_saved_conflict_baselines() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir(root.join("Original")).unwrap();
    fs::create_dir(root.join("Holding")).unwrap();
    let original = root.join("Original/A.md");
    let holding = root.join("Holding/A 2.md");
    let initial = "Alpha\r\nTail  \n";
    let codec = Encoding::Utf8Bom;
    fs::write(&original, codec.encode(initial).unwrap()).unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut a_service = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut b_service = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut c_service = DocumentService::with_authorities(Arc::clone(&authorities));
    let a = a_service.open_authorized(&original).unwrap();
    let key = Uuid::new_v4();
    let lease = trash(&mut a_service, &authorities, &original, &holding, key);
    let b = b_service.open_authorized(&holding).unwrap();
    b_service.save(&b.id, "B first\r\n").unwrap();
    let c = c_service.open_authorized(&holding).unwrap();
    b_service.save(&b.id, "B second\n").unwrap();
    let before_restore = fs::read(&holding).unwrap();
    // Even an attempted save of the current disk bytes does not bless C's
    // stale baseline. Only explicit reload acceptance may advance it.
    assert!(matches!(
        c_service.save(&c.id, "B second\n"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&holding).unwrap(), before_restore);
    let crate::DocumentChange::Changed {
        version: stale_reload,
        ..
    } = c_service.check_document_change(&c.id).unwrap()
    else {
        panic!("expected C reload candidate")
    };
    let source = lease.current_source().unwrap().unwrap();
    let identity = source.identity();
    let a_plan = a_service
        .prepare_file_trash_restore(target(&original, &holding, key, &identity), &lease)
        .unwrap();
    let b_plan = b_service
        .prepare_file_trash_restore(target(&original, &holding, key, &identity), &lease)
        .unwrap();
    let c_plan = c_service
        .prepare_file_trash_restore(target(&original, &holding, key, &identity), &lease)
        .unwrap();
    fs::rename(&holding, &original).unwrap();
    lease.finish_restore().unwrap();
    for metadata in [a_plan.commit(), b_plan.commit(), c_plan.commit()] {
        assert_eq!(metadata.len(), 1);
        assert_eq!(metadata[0].path, original.to_string_lossy());
        assert_eq!(metadata[0].location_state, DocumentLocationState::Available);
    }
    assert_eq!(a_service.documents[&a.id].text, initial);
    assert_eq!(b_service.documents[&b.id].text, "B second\n");
    assert_eq!(c_service.documents[&c.id].text, "B first\r\n");
    assert!(matches!(
        c_service.accept_document_change(&c.id, &stale_reload),
        Err(DocumentError::StaleReload)
    ));
    assert!(matches!(
        a_service.save(&a.id, "A stale"),
        Err(DocumentError::ExternalChange)
    ));
    assert!(matches!(
        c_service.save(&c.id, "C stale"),
        Err(DocumentError::ExternalChange)
    ));
    b_service.save(&b.id, "B third\r\n").unwrap();
    let crate::DocumentChange::Changed { version, .. } =
        a_service.check_document_change(&a.id).unwrap()
    else {
        panic!("expected A reload candidate")
    };
    a_service.accept_document_change(&a.id, &version).unwrap();
    a_service.save(&a.id, "A own after reload\r\n").unwrap();
    assert!(matches!(
        b_service.save(&b.id, "B stale after A"),
        Err(DocumentError::ExternalChange)
    ));
    let crate::DocumentChange::Changed { version, .. } =
        b_service.check_document_change(&b.id).unwrap()
    else {
        panic!("expected B reload candidate")
    };
    b_service.accept_document_change(&b.id, &version).unwrap();
    b_service.save(&b.id, "B own after reload\n").unwrap();
    assert_eq!(
        fs::read(&original).unwrap(),
        codec.encode("B own after reload\n").unwrap()
    );
    assert!(!holding.exists());
    for (service, id) in [
        (&a_service, &a.id),
        (&b_service, &b.id),
        (&c_service, &c.id),
    ] {
        let document = &service.documents[id];
        assert_eq!(document.scoped.name, Path::new("A.md"));
        assert!(
            same_directory(&document.scoped.directory, &cap(original.parent().unwrap())).unwrap()
        );
        assert!(Arc::ptr_eq(
            &document.authority,
            &a_service.documents[&a.id].authority
        ));
    }
    // Reoccupying the old Trash name creates an independent authority, even
    // with identical bytes. Its own atomic write cannot advance the restored group.
    fs::write(&holding, fs::read(&original).unwrap()).unwrap();
    let mut other = DocumentService::with_authorities(authorities);
    let d = other.open_authorized(&holding).unwrap();
    assert!(!Arc::ptr_eq(
        &other.documents[&d.id].authority,
        &a_service.documents[&a.id].authority
    ));
    other.save(&d.id, "Separate old parent\n").unwrap();
    assert_eq!(
        fs::read(&original).unwrap(),
        codec.encode("B own after reload\n").unwrap()
    );
    b_service.save(&b.id, "B still owns original\n").unwrap();
    assert_eq!(
        fs::read(&holding).unwrap(),
        codec.encode("Separate old parent\n").unwrap()
    );
}
