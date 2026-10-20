use super::*;
use crate::{DocumentAuthorities, DocumentChange, DocumentWatch, Encoding};
use std::fs;

const SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;
const ENCODED: &str = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";

fn cap(path: &Path) -> Arc<Dir> {
    Arc::new(Dir::open_ambient_dir(path, cap_std::ambient_authority()).unwrap())
}
fn fixture() -> (tempfile::TempDir, PathBuf, Arc<Dir>) {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir(root.join("holding")).unwrap();
    let directory = cap(&root);
    (temporary, root, directory)
}
fn file_restore<'a>(
    parent: Arc<Dir>,
    display: &'a Path,
    key: Uuid,
    identity: &'a same_file::Handle,
    source_display: &'a Path,
) -> TrashRestoreTarget<'a> {
    TrashRestoreTarget {
        parent,
        name: Path::new(display.file_name().unwrap()),
        display,
        kind: RenameKind::File,
        operation_key: key,
        source_identity: identity,
        source_directory: None,
        source_display,
    }
}

#[test]
fn trash_and_restore_preserve_ids_all_encodings_source_baseline_and_immutable_images() {
    for codec in [
        Encoding::Utf8,
        Encoding::Utf8Bom,
        Encoding::Utf16LeBom,
        Encoding::Utf16BeBom,
    ] {
        let (_temporary, root, directory) = fixture();
        let old = root.join("文稿😀.md");
        let holding = root.join("holding/文稿😀.md");
        let text = "# 原文😀\r\n\r\n![图](image.svg)  \nTail \r\n";
        let bytes = codec.encode(text).unwrap();
        fs::write(&old, &bytes).unwrap();
        fs::write(root.join("image.svg"), SVG).unwrap();
        let mut service = DocumentService::new();
        let opened = service.open_authorized(&old).unwrap();
        assert_eq!(opened.location_state, DocumentLocationState::Available);
        let image = service.resolve_image(&opened.id, "image.svg").unwrap();
        let cached = service.image(&image.token).unwrap().bytes;
        let original_parent = Arc::clone(&service.documents[&opened.id].scoped.directory);
        let original_authority = Arc::clone(&service.documents[&opened.id].authority);
        let epoch = service.documents[&opened.id].baseline_epoch;
        let key = Uuid::new_v4();
        let plan = service
            .prepare_trash(
                Arc::clone(&directory),
                Path::new("文稿😀.md"),
                &old,
                RenameKind::File,
                key,
            )
            .unwrap();
        assert_eq!(plan.affected_count(), 1);
        // This local move stands in for an already verified OS result. It is
        // deliberately not a claim that NSFileManager Trash was exercised.
        fs::rename(&old, &holding).unwrap();
        let metadata = plan.commit();
        assert_eq!(metadata[0].location_state, DocumentLocationState::Trashed);
        assert_eq!(metadata[0].metadata_revision, 1);
        assert_eq!(metadata[0].path, old.to_string_lossy());
        assert_eq!(service.get_metadata(&opened.id).unwrap(), metadata[0]);
        assert_eq!(service.display_path(&opened.id).unwrap(), old);
        assert_ne!(service.documents[&opened.id].baseline_epoch, epoch);
        assert_eq!(service.documents[&opened.id].text, text);
        assert_eq!(service.documents[&opened.id].original_bytes, bytes);
        assert_eq!(service.documents[&opened.id].encoding, codec);
        assert!(Arc::ptr_eq(
            &service.documents[&opened.id].authority,
            &original_authority
        ));
        assert!(Arc::ptr_eq(
            &service.image(&image.token).unwrap().bytes,
            &cached
        ));
        for candidate in [text, "Dirty draft"] {
            assert!(matches!(
                service.save(&opened.id, candidate),
                Err(DocumentError::Trashed)
            ));
        }
        assert!(matches!(
            service.check_document_change(&opened.id),
            Err(DocumentError::Trashed)
        ));
        assert!(matches!(
            service.bookmark(&opened.id),
            Err(DocumentError::Trashed)
        ));
        assert!(matches!(
            service.authorized_path(&opened.id),
            Err(DocumentError::Trashed)
        ));
        assert!(matches!(
            service.resolve_image(&opened.id, "image.svg"),
            Err(DocumentError::Trashed)
        ));
        assert!(matches!(
            service.import_image(&opened.id, "clip.svg", ENCODED, ""),
            Err(DocumentError::Trashed)
        ));
        assert!(matches!(
            service.start_document_watch(&opened.id, Arc::new(|_| {})),
            Err(DocumentError::Trashed)
        ));
        assert!(!root.join("assets").exists());
        let identity = same_file::Handle::from_path(&holding).unwrap();
        let plan = service
            .prepare_trash_restore(file_restore(directory, &old, key, &identity, &holding))
            .unwrap();
        assert_eq!(plan.affected_count(), 1);
        fs::rename(&holding, &old).unwrap();
        let restored = plan.commit();
        assert_eq!(restored[0].location_state, DocumentLocationState::Available);
        assert_eq!(restored[0].metadata_revision, 2);
        assert!(Arc::ptr_eq(
            &service.documents[&opened.id].scoped.directory,
            &original_parent
        ));
        assert!(service.documents[&opened.id].trashed_by.is_none());
        assert!(service.documents[&opened.id].trashed_location.is_none());
        assert_eq!(
            service
                .resolve_image(&opened.id, "image.svg")
                .unwrap()
                .token,
            image.token
        );
        assert_eq!(fs::read(&old).unwrap(), bytes);
        let saved = service.save(&opened.id, "Dirty draft\r\n").unwrap();
        assert_eq!(saved.id, opened.id);
        assert_eq!(saved.encoding, opened.encoding);
        assert_eq!(
            fs::read(&old).unwrap(),
            codec.encode("Dirty draft\r\n").unwrap()
        );
    }
}

#[test]
fn ancestor_trash_retains_all_scope_shapes_and_restore_resumes_only_original_fds() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("folder");
    let holding = root.join("holding/folder");
    fs::create_dir_all(old.join("nested")).unwrap();
    fs::write(old.join("nested/A.md"), b"\xef\xbb\xbfAlpha\r\nTail  \n").unwrap();
    fs::write(old.join("nested/image.svg"), SVG).unwrap();
    fs::write(root.join("Other.md"), b"Other").unwrap();
    let mut service = DocumentService::new();
    let direct = service.open_authorized(&old.join("nested/A.md")).unwrap();
    let inner = service
        .open_in_workspace(cap(&old), Path::new("nested/A.md"), old.join("nested/A.md"))
        .unwrap();
    let outer = service
        .open_in_workspace(
            Arc::clone(&directory),
            Path::new("folder/nested/A.md"),
            old.join("nested/A.md"),
        )
        .unwrap();
    let other = service.open_authorized(&root.join("Other.md")).unwrap();
    let mut images = vec![];
    for document in [&direct, &inner, &outer] {
        images.push(service.resolve_image(&document.id, "image.svg").unwrap());
    }
    let key = Uuid::new_v4();
    let plan = service
        .prepare_trash(
            Arc::clone(&directory),
            Path::new("folder"),
            &old,
            RenameKind::Directory,
            key,
        )
        .unwrap();
    assert_eq!(plan.affected_count(), 3);
    if !crate::directory_test_support::move_retained_directory(&old, &holding) {
        drop(plan);
        crate::directory_test_support::assert_available(
            &service,
            &direct.id,
            &old.join("nested/A.md"),
        );
        return;
    }
    assert_eq!(plan.commit().len(), 3);
    for (document, image) in [&direct, &inner, &outer].into_iter().zip(&images) {
        assert_eq!(service.image(&image.token).unwrap().bytes.as_ref(), SVG);
        assert!(matches!(
            service.import_image(&document.id, "clip.svg", ENCODED, ""),
            Err(DocumentError::Trashed)
        ));
        assert!(matches!(
            service.resolve_image(&document.id, "image.svg"),
            Err(DocumentError::Trashed)
        ));
    }
    assert!(!holding.join("nested/assets").exists());
    assert_eq!(
        service
            .save(&other.id, "Other stays available")
            .unwrap()
            .metadata_revision,
        0
    );
    let source = cap(&holding);
    let identity = same_file::Handle::from_path(&holding).unwrap();
    let plan = service
        .prepare_trash_restore(TrashRestoreTarget {
            parent: directory,
            name: Path::new("folder"),
            display: &old,
            kind: RenameKind::Directory,
            operation_key: key,
            source_identity: &identity,
            source_display: &holding,
            source_directory: Some(&source),
        })
        .unwrap();
    assert_eq!(plan.affected_count(), 3);
    fs::rename(&holding, &old).unwrap();
    assert_eq!(plan.commit().len(), 3);
    for (document, image) in [&direct, &inner, &outer].into_iter().zip(images) {
        assert_eq!(
            service.get_metadata(&document.id).unwrap().location_state,
            DocumentLocationState::Available
        );
        assert_eq!(
            service
                .resolve_image(&document.id, "image.svg")
                .unwrap()
                .token,
            image.token
        );
        service.save(&document.id, &document.text).unwrap();
    }
}

#[test]
fn shared_own_save_lineage_is_used_while_each_windows_stale_baseline_remains_intact() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let holding = root.join("holding/A.md");
    fs::write(&old, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut second = DocumentService::with_authorities(authorities);
    let a = first.open_authorized(&old).unwrap();
    let b = second.open_authorized(&old).unwrap();
    first.save(&a.id, "Known own save").unwrap();
    let key = Uuid::new_v4();
    let a_plan = first
        .prepare_trash(
            Arc::clone(&directory),
            Path::new("A.md"),
            &old,
            RenameKind::File,
            key,
        )
        .unwrap();
    let b_plan = second
        .prepare_trash(
            Arc::clone(&directory),
            Path::new("A.md"),
            &old,
            RenameKind::File,
            key,
        )
        .unwrap();
    fs::rename(&old, &holding).unwrap();
    a_plan.commit();
    b_plan.commit();
    let identity = same_file::Handle::from_path(&holding).unwrap();
    let a_plan = first
        .prepare_trash_restore(file_restore(
            Arc::clone(&directory),
            &old,
            key,
            &identity,
            &holding,
        ))
        .unwrap();
    let b_plan = second
        .prepare_trash_restore(file_restore(directory, &old, key, &identity, &holding))
        .unwrap();
    fs::rename(&holding, &old).unwrap();
    a_plan.commit();
    b_plan.commit();
    assert_eq!(second.documents[&b.id].original_bytes, b"Alpha");
    assert_eq!(second.documents[&b.id].text, "Alpha");
    assert!(matches!(
        second.save(&b.id, "Dirty old window"),
        Err(DocumentError::ExternalChange)
    ));
    first.save(&a.id, "Next own save").unwrap();
    assert_eq!(fs::read(&old).unwrap(), b"Next own save");
}

#[test]
fn dropping_either_prepared_transition_changes_no_document_or_disk_state() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let holding = root.join("holding/A.md");
    fs::write(&old, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
    let before = service.get_metadata(&opened.id).unwrap();
    let key = Uuid::new_v4();
    drop(
        service
            .prepare_trash(
                Arc::clone(&directory),
                Path::new("A.md"),
                &old,
                RenameKind::File,
                key,
            )
            .unwrap(),
    );
    assert_eq!(service.get_metadata(&opened.id).unwrap(), before);
    assert!(old.exists());
    assert!(!holding.exists());
    let plan = service
        .prepare_trash(
            Arc::clone(&directory),
            Path::new("A.md"),
            &old,
            RenameKind::File,
            key,
        )
        .unwrap();
    fs::rename(&old, &holding).unwrap();
    plan.commit();
    let before = service.get_metadata(&opened.id).unwrap();
    let identity = same_file::Handle::from_path(&holding).unwrap();
    drop(
        service
            .prepare_trash_restore(file_restore(directory, &old, key, &identity, &holding))
            .unwrap(),
    );
    assert_eq!(service.get_metadata(&opened.id).unwrap(), before);
    assert!(!old.exists());
    assert!(holding.exists());
}

#[test]
fn explicit_save_as_to_the_old_name_creates_a_new_id_that_restore_cannot_adopt() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let holding = root.join("holding/A.md");
    fs::write(&old, b"\xef\xbb\xbfAlpha\r\n").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
    let key = Uuid::new_v4();
    let plan = service
        .prepare_trash(
            Arc::clone(&directory),
            Path::new("A.md"),
            &old,
            RenameKind::File,
            key,
        )
        .unwrap();
    fs::rename(&old, &holding).unwrap();
    plan.commit();
    let saved = service
        .save_as_authorized(&old, "Dirty\r\n", Some(&opened.id))
        .unwrap();
    assert_ne!(saved.id, opened.id);
    assert_eq!(saved.encoding, opened.encoding);
    assert_eq!(saved.location_state, DocumentLocationState::Available);
    assert_eq!(fs::read(&old).unwrap(), b"\xef\xbb\xbfDirty\r\n");
    // The host must reject this occupied restore destination. Dropping its doc
    // plan cannot replace that new file or reclassify the new session.
    let identity = same_file::Handle::from_path(&holding).unwrap();
    let plan = service
        .prepare_trash_restore(file_restore(
            Arc::clone(&directory),
            &old,
            key,
            &identity,
            &holding,
        ))
        .unwrap();
    assert_eq!(plan.affected_count(), 1);
    drop(plan);
    assert_eq!(
        service.get_metadata(&saved.id).unwrap().metadata_revision,
        0
    );
    assert_eq!(
        service.get_metadata(&opened.id).unwrap().location_state,
        DocumentLocationState::Trashed
    );
    // An explicit test cleanup makes the original destination vacant; restoration
    // then applies only to the original ID, never to the SaveAs session.
    fs::remove_file(&old).unwrap();
    let plan = service
        .prepare_trash_restore(file_restore(directory, &old, key, &identity, &holding))
        .unwrap();
    fs::rename(&holding, &old).unwrap();
    plan.commit();
    assert_eq!(
        service.get_metadata(&opened.id).unwrap().metadata_revision,
        2
    );
    assert_eq!(
        service.get_metadata(&saved.id).unwrap().metadata_revision,
        0
    );
    assert!(matches!(
        service.save(&saved.id, "Cannot write restored original"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&old).unwrap(), b"\xef\xbb\xbfAlpha\r\n");
}

#[test]
fn later_ancestor_trash_and_reused_path_rename_do_not_capture_an_older_trashed_draft() {
    let (_temporary, root, directory) = fixture();
    let folder = root.join("folder");
    fs::create_dir(&folder).unwrap();
    let old = folder.join("A.md");
    fs::write(&old, b"First").unwrap();
    let mut service = DocumentService::new();
    let first = service.open_authorized(&old).unwrap();
    let first_key = Uuid::new_v4();
    let plan = service
        .prepare_trash(
            cap(&folder),
            Path::new("A.md"),
            &old,
            RenameKind::File,
            first_key,
        )
        .unwrap();
    fs::rename(&old, root.join("holding/first.md")).unwrap();
    plan.commit();
    fs::write(&old, b"Second").unwrap();
    let second = service.open_authorized(&old).unwrap();
    let renamed = folder.join("B.md");
    let plan = service
        .prepare_rename(
            cap(&folder),
            Path::new("A.md"),
            Path::new("B.md"),
            &old,
            &renamed,
            RenameKind::File,
        )
        .unwrap();
    assert_eq!(plan.affected_count(), 1);
    fs::rename(&old, &renamed).unwrap();
    plan.commit();
    assert_eq!(
        service.get_metadata(&first.id).unwrap().path,
        old.to_string_lossy()
    );
    let second_key = Uuid::new_v4();
    let plan = service
        .prepare_trash(
            directory,
            Path::new("folder"),
            &folder,
            RenameKind::Directory,
            second_key,
        )
        .unwrap();
    assert_eq!(plan.affected_count(), 1);
    if !crate::directory_test_support::move_retained_directory(
        &folder,
        &root.join("holding/folder"),
    ) {
        drop(plan);
        crate::directory_test_support::assert_available(&service, &second.id, &renamed);
        return;
    }
    plan.commit();
    assert_eq!(service.documents[&first.id].trashed_by, Some(first_key));
    assert_eq!(service.documents[&second.id].trashed_by, Some(second_key));
    assert_eq!(
        service.get_metadata(&first.id).unwrap().metadata_revision,
        1
    );
    assert_eq!(
        service.get_metadata(&second.id).unwrap().metadata_revision,
        2
    );
}

#[test]
fn restore_requires_matching_operation_original_parent_kind_and_current_source_identity() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let holding = root.join("holding/A.md");
    fs::write(&old, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
    let key = Uuid::new_v4();
    let plan = service
        .prepare_trash(
            Arc::clone(&directory),
            Path::new("A.md"),
            &old,
            RenameKind::File,
            key,
        )
        .unwrap();
    fs::rename(&old, &holding).unwrap();
    plan.commit();
    let identity = same_file::Handle::from_path(&holding).unwrap();
    let plan = service
        .prepare_trash_restore(file_restore(
            Arc::clone(&directory),
            &old,
            Uuid::new_v4(),
            &identity,
            &holding,
        ))
        .unwrap();
    assert_eq!(plan.affected_count(), 0);
    plan.commit();
    assert_eq!(
        service.get_metadata(&opened.id).unwrap().location_state,
        DocumentLocationState::Trashed
    );
    fs::write(root.join("holding/replacement.md"), b"Alpha").unwrap();
    let replacement = same_file::Handle::from_path(root.join("holding/replacement.md")).unwrap();
    assert!(matches!(
        service.prepare_trash_restore(file_restore(
            Arc::clone(&directory),
            &old,
            key,
            &replacement,
            &holding
        )),
        Err(DocumentError::ExternalChange)
    ));
    assert!(service
        .prepare_trash_restore(file_restore(
            cap(&root.join("holding")),
            &old,
            key,
            &identity,
            &holding
        ))
        .is_err());
    let mut target = file_restore(directory, &old, key, &identity, &holding);
    // Construct the source-directory mismatch separately to avoid borrowing
    // its own parent while moving the target value.
    let parent = Arc::clone(&target.parent);
    target.source_directory = Some(&parent);
    assert!(matches!(
        service.prepare_trash_restore(target),
        Err(DocumentError::InvalidPath)
    ));
    assert_eq!(
        service.get_metadata(&opened.id).unwrap().metadata_revision,
        1
    );
}

#[test]
fn file_trash_does_not_accept_an_unknown_same_byte_replacement() {
    let (_temporary, root, directory) = fixture();
    let path = root.join("A.md");
    fs::write(&path, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&path).unwrap();
    fs::rename(&path, root.join("holding/original.md")).unwrap();
    fs::write(&path, b"Alpha").unwrap();
    assert!(matches!(
        service.prepare_trash(
            directory,
            Path::new("A.md"),
            &path,
            RenameKind::File,
            Uuid::new_v4()
        ),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(
        service
            .get_metadata(&document.id)
            .unwrap()
            .metadata_revision,
        0
    );
    assert_eq!(fs::read(&path).unwrap(), b"Alpha");
}

#[test]
fn uncertain_old_location_does_not_capture_a_new_entity_trashed_at_that_display() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let moved = root.join("Moved.md");
    fs::write(&old, b"First").unwrap();
    let mut service = DocumentService::new();
    let first = service.open_authorized(&old).unwrap();
    let plan = service
        .prepare_rename(
            Arc::clone(&directory),
            Path::new("A.md"),
            Path::new("Moved.md"),
            &old,
            &moved,
            RenameKind::File,
        )
        .unwrap();
    fs::rename(&old, &moved).unwrap();
    plan.revoke();
    fs::write(&old, b"Second").unwrap();
    let second = service.open_authorized(&old).unwrap();
    let plan = service
        .prepare_trash(
            directory,
            Path::new("A.md"),
            &old,
            RenameKind::File,
            Uuid::new_v4(),
        )
        .unwrap();
    assert_eq!(plan.affected_count(), 1);
    fs::rename(&old, root.join("holding/second.md")).unwrap();
    let metadata = plan.commit();
    assert_eq!(metadata[0].id, second.id);
    assert!(matches!(
        service.get_metadata(&first.id),
        Err(DocumentError::RelocationUncertain)
    ));
    assert_eq!(service.documents[&first.id].text, "First");
    assert_eq!(service.documents[&first.id].trashed_by, None);
}

#[test]
fn directory_restore_rejects_missing_or_foreign_root_proof_before_any_state_change() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("folder");
    let holding = root.join("holding/folder");
    fs::create_dir(&old).unwrap();
    fs::write(old.join("A.md"), b"Alpha").unwrap();
    fs::create_dir(root.join("foreign")).unwrap();
    fs::write(root.join("foreign/A.md"), b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&old.join("A.md")).unwrap();
    let key = Uuid::new_v4();
    let plan = service
        .prepare_trash(
            Arc::clone(&directory),
            Path::new("folder"),
            &old,
            RenameKind::Directory,
            key,
        )
        .unwrap();
    if !crate::directory_test_support::move_retained_directory(&old, &holding) {
        drop(plan);
        crate::directory_test_support::assert_available(&service, &document.id, &old.join("A.md"));
        return;
    }
    plan.commit();
    let identity = same_file::Handle::from_path(&holding).unwrap();
    let source = cap(&holding);
    let foreign = cap(&root.join("foreign"));
    let foreign_identity = same_file::Handle::from_path(root.join("foreign")).unwrap();
    for (proof, source_directory) in [
        (&identity, None),
        (&identity, Some(foreign.as_ref())),
        (&foreign_identity, Some(foreign.as_ref())),
    ] {
        assert!(service
            .prepare_trash_restore(TrashRestoreTarget {
                parent: Arc::clone(&directory),
                name: Path::new("folder"),
                display: &old,
                kind: RenameKind::Directory,
                operation_key: key,
                source_identity: proof,
                source_display: &holding,
                source_directory
            })
            .is_err());
        assert_eq!(
            service
                .get_metadata(&document.id)
                .unwrap()
                .metadata_revision,
            1
        );
        assert_eq!(
            service.get_metadata(&document.id).unwrap().location_state,
            DocumentLocationState::Trashed
        );
    }
    let plan = service
        .prepare_trash_restore(TrashRestoreTarget {
            parent: directory,
            name: Path::new("folder"),
            display: &old,
            kind: RenameKind::Directory,
            operation_key: key,
            source_identity: &identity,
            source_display: &holding,
            source_directory: Some(&source),
        })
        .unwrap();
    assert_eq!(plan.affected_count(), 1);
    drop(plan);
    assert!(!old.exists());
    assert_eq!(fs::read(holding.join("A.md")).unwrap(), b"Alpha");
}

#[test]
fn a_replaced_descendant_file_stays_in_conflict_but_a_replaced_parent_blocks_restore() {
    for replace_parent in [false, true] {
        let (_temporary, root, directory) = fixture();
        let old = root.join("folder");
        let holding = root.join("holding/folder");
        fs::create_dir_all(old.join("nested")).unwrap();
        fs::write(old.join("nested/A.md"), b"Alpha").unwrap();
        let mut service = DocumentService::new();
        let document = service.open_authorized(&old.join("nested/A.md")).unwrap();
        let key = Uuid::new_v4();
        let plan = service
            .prepare_trash(
                Arc::clone(&directory),
                Path::new("folder"),
                &old,
                RenameKind::Directory,
                key,
            )
            .unwrap();
        if !crate::directory_test_support::move_retained_directory(&old, &holding) {
            drop(plan);
            crate::directory_test_support::assert_available(
                &service,
                &document.id,
                &old.join("nested/A.md"),
            );
            continue;
        }
        plan.commit();
        if replace_parent {
            fs::rename(holding.join("nested"), holding.join("retained")).unwrap();
            fs::create_dir(holding.join("nested")).unwrap();
        } else {
            fs::rename(
                holding.join("nested/A.md"),
                holding.join("nested/retained.md"),
            )
            .unwrap();
        }
        fs::write(holding.join("nested/A.md"), b"Alpha").unwrap();
        let source = cap(&holding);
        let identity = same_file::Handle::from_path(&holding).unwrap();
        let result = service.prepare_trash_restore(TrashRestoreTarget {
            parent: directory,
            name: Path::new("folder"),
            display: &old,
            kind: RenameKind::Directory,
            operation_key: key,
            source_identity: &identity,
            source_display: &holding,
            source_directory: Some(&source),
        });
        if replace_parent {
            assert!(matches!(result, Err(DocumentError::ExternalChange)));
        } else {
            let plan = result.unwrap();
            fs::rename(&holding, &old).unwrap();
            plan.commit();
            assert!(matches!(
                service.save(&document.id, "Dirty"),
                Err(DocumentError::ExternalChange)
            ));
        }
    }
}

#[test]
fn pending_reload_and_watch_leases_are_revoked_without_discarding_cached_bytes() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let holding = root.join("holding/A.md");
    fs::write(&old, b"Alpha").unwrap();
    fs::write(root.join("image.svg"), SVG).unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&old).unwrap();
    let image = service.resolve_image(&document.id, "image.svg").unwrap();
    let watch = service
        .start_document_watch(&document.id, Arc::new(|_| {}))
        .unwrap();
    let DocumentWatch::Watching { watch_id } = watch else {
        panic!("watch fixture unavailable")
    };
    fs::write(&old, b"External").unwrap();
    let DocumentChange::Changed { version, .. } =
        service.check_document_change(&document.id).unwrap()
    else {
        panic!("reload candidate")
    };
    let key = Uuid::new_v4();
    let plan = service
        .prepare_trash(
            Arc::clone(&directory),
            Path::new("A.md"),
            &old,
            RenameKind::File,
            key,
        )
        .unwrap();
    fs::rename(&old, &holding).unwrap();
    plan.commit();
    assert!(!service.pending_reloads.contains_key(&document.id));
    assert!(!service.stop_document_watch(&document.id, &watch_id));
    assert!(matches!(
        service.accept_document_change(&document.id, &version),
        Err(DocumentError::Trashed)
    ));
    assert!(service.image(&image.token).is_some());
    let identity = same_file::Handle::from_path(&holding).unwrap();
    let plan = service
        .prepare_trash_restore(file_restore(directory, &old, key, &identity, &holding))
        .unwrap();
    fs::rename(&holding, &old).unwrap();
    plan.commit();
    assert!(matches!(
        service.accept_document_change(&document.id, &version),
        Err(DocumentError::StaleReload)
    ));
    assert!(matches!(
        service.save(&document.id, "Dirty"),
        Err(DocumentError::ExternalChange)
    ));
    let restarted = service
        .start_document_watch(&document.id, Arc::new(|_| {}))
        .unwrap();
    let DocumentWatch::Watching {
        watch_id: new_watch,
    } = restarted
    else {
        panic!("new watch fixture unavailable")
    };
    assert_ne!(watch_id, new_watch);
    assert!(service.stop_document_watch(&document.id, &new_watch));
}

#[test]
fn uncertain_transitions_never_resume_old_authority_and_explicit_save_as_still_works() {
    for uncertain_restore in [false, true] {
        let (_temporary, root, directory) = fixture();
        let old = root.join("A.md");
        let holding = root.join("holding/A.md");
        fs::write(&old, b"\xef\xbb\xbfAlpha\r\n").unwrap();
        let mut service = DocumentService::new();
        let document = service.open_authorized(&old).unwrap();
        let key = Uuid::new_v4();
        let plan = service
            .prepare_trash(
                Arc::clone(&directory),
                Path::new("A.md"),
                &old,
                RenameKind::File,
                key,
            )
            .unwrap();
        fs::rename(&old, &holding).unwrap();
        if uncertain_restore {
            plan.commit();
            let identity = same_file::Handle::from_path(&holding).unwrap();
            let plan = service
                .prepare_trash_restore(file_restore(
                    Arc::clone(&directory),
                    &old,
                    key,
                    &identity,
                    &holding,
                ))
                .unwrap();
            fs::rename(&holding, &old).unwrap();
            assert_eq!(plan.revoke(), vec![document.id.clone()]);
            let plan = service
                .prepare_trash_restore(file_restore(directory, &old, key, &identity, &holding))
                .unwrap();
            assert_eq!(plan.affected_count(), 0);
            plan.commit();
        } else {
            assert_eq!(plan.revoke(), vec![document.id.clone()]);
            fs::write(&old, b"\xef\xbb\xbfAlpha\r\n").unwrap();
        }
        assert!(matches!(
            service.save(&document.id, "Dirty"),
            Err(DocumentError::RelocationUncertain)
        ));
        assert!(matches!(
            service.get_metadata(&document.id),
            Err(DocumentError::RelocationUncertain)
        ));
        assert_eq!(service.documents[&document.id].text, "Alpha\r\n");
        let rescued = service
            .save_as_authorized(&root.join("Runtime.md"), "Dirty\r\n", Some(&document.id))
            .unwrap();
        assert_ne!(rescued.id, document.id);
        assert_eq!(
            fs::read(root.join("Runtime.md")).unwrap(),
            b"\xef\xbb\xbfDirty\r\n"
        );
    }
}

#[test]
fn revision_limit_rejects_before_transition_and_wire_metadata_is_explicit() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let holding = root.join("holding/A.md");
    fs::write(&old, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&old).unwrap();
    service
        .documents
        .get_mut(&document.id)
        .unwrap()
        .metadata_revision = MAX_METADATA_REVISION;
    assert!(matches!(
        service.prepare_trash(
            Arc::clone(&directory),
            Path::new("A.md"),
            &old,
            RenameKind::File,
            Uuid::new_v4()
        ),
        Err(DocumentError::MetadataRevisionLimit)
    ));
    service
        .documents
        .get_mut(&document.id)
        .unwrap()
        .metadata_revision -= 1;
    let key = Uuid::new_v4();
    let plan = service
        .prepare_trash(
            Arc::clone(&directory),
            Path::new("A.md"),
            &old,
            RenameKind::File,
            key,
        )
        .unwrap();
    fs::rename(&old, &holding).unwrap();
    plan.commit();
    let identity = same_file::Handle::from_path(&holding).unwrap();
    assert!(matches!(
        service.prepare_trash_restore(file_restore(directory, &old, key, &identity, &holding)),
        Err(DocumentError::MetadataRevisionLimit)
    ));
    let value = serde_json::to_value(service.get_metadata(&document.id).unwrap()).unwrap();
    assert_eq!(value["locationState"], "trashed");
    assert_eq!(value["metadataRevision"], MAX_METADATA_REVISION);
    assert!(!value.as_object().unwrap().contains_key("text"));
    assert!(value.as_object().unwrap().keys().all(|key| [
        "id",
        "path",
        "encoding",
        "metadataRevision",
        "locationState"
    ]
    .contains(&key.as_str())));
}
