use super::*;
use crate::{DocumentChange, Encoding};
use std::fs;

fn fixture() -> (tempfile::TempDir, PathBuf, Arc<Dir>) {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    let directory = Arc::new(Dir::open_ambient_dir(&root, cap_std::ambient_authority()).unwrap());
    (temporary, root, directory)
}

#[test]
fn same_byte_external_replacement_cannot_be_saved_even_without_text_changes() {
    let (_temporary, root, _) = fixture();
    let path = root.join("A.md");
    let bytes = b"\xef\xbb\xbfAlpha\r\nTail  \n";
    fs::write(&path, bytes).unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&path).unwrap();
    fs::rename(&path, root.join("moved.md")).unwrap();
    fs::write(&path, bytes).unwrap();
    for source in [opened.text.as_str(), "Changed"] {
        assert!(matches!(
            service.save(&opened.id, source),
            Err(DocumentError::ExternalChange)
        ));
    }
    assert!(matches!(
        service.save_as_authorized(&path, "Changed", Some(&opened.id)),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert_eq!(fs::read(root.join("moved.md")).unwrap(), bytes);
    assert_eq!(
        service.get_metadata(&opened.id).unwrap().metadata_revision,
        0
    );
}

#[test]
fn explicit_disk_acceptance_can_adopt_a_same_byte_new_identity() {
    let (_temporary, root, _) = fixture();
    let path = root.join("A.md");
    fs::write(&path, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&path).unwrap();
    fs::rename(&path, root.join("old.md")).unwrap();
    fs::write(&path, b"Alpha").unwrap();
    let DocumentChange::Changed { version, document } =
        service.check_document_change(&opened.id).unwrap()
    else {
        panic!("same bytes must not conceal replacement identity");
    };
    assert_eq!(document.text, opened.text);
    service
        .accept_document_change(&opened.id, &version)
        .unwrap();
    service.save(&opened.id, "Accepted").unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"Accepted");
}

#[test]
fn successful_saves_update_the_published_identity_and_noop_preserves_it() {
    let (_temporary, root, _) = fixture();
    let path = root.join("A.md");
    fs::write(&path, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&path).unwrap();
    let original = same_file::Handle::from_path(&path).unwrap();
    service.save(&opened.id, "AlphaX").unwrap();
    assert_ne!(*service.documents[&opened.id].identity, original);
    service.save(&opened.id, "AlphaY").unwrap();
    let published = same_file::Handle::from_path(&path).unwrap();
    assert_eq!(*service.documents[&opened.id].identity, published);
    service.save(&opened.id, "AlphaY").unwrap();
    assert_eq!(same_file::Handle::from_path(&path).unwrap(), published);
    assert_eq!(
        service.get_metadata(&opened.id).unwrap().metadata_revision,
        0
    );
    assert_eq!(fs::read(&path).unwrap(), b"AlphaY");
}

#[test]
fn rename_preserves_saved_bytes_encoding_ids_and_dirty_edits_target_only_new_name() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let new = root.join("B.md");
    let text = "Alpha\r\n中文😀  \n";
    let mut bytes = vec![0xff, 0xfe];
    for unit in text.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    fs::write(&old, &bytes).unwrap();
    let mut service = DocumentService::new();
    let first = service.open_authorized(&old).unwrap();
    let second = service.open_authorized(&old).unwrap();
    let epoch = service.documents[&first.id].baseline_epoch;
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
    assert_eq!(plan.affected_count(), 2);
    fs::rename(&old, &new).unwrap();
    let metadata = plan.commit();
    assert_eq!(metadata.len(), 2);
    assert!(metadata
        .iter()
        .all(|metadata| metadata.metadata_revision == 1 && metadata.path == new.to_string_lossy()));
    assert_eq!(service.documents[&first.id].text, first.text);
    assert_eq!(service.documents[&first.id].original_bytes, bytes);
    assert_eq!(service.documents[&first.id].encoding, Encoding::Utf16LeBom);
    assert_ne!(service.documents[&first.id].baseline_epoch, epoch);
    assert_eq!(fs::read(&new).unwrap(), bytes);
    fs::write(&old, &bytes).unwrap();
    let dirty = first.text.replacen("Alpha", "Dirty", 1);
    let saved = service.save(&first.id, &dirty).unwrap();
    assert_eq!(saved.id, first.id);
    assert_eq!(saved.metadata_revision, 1);
    assert_eq!(saved.path, new.to_string_lossy());
    assert_eq!(fs::read(&old).unwrap(), bytes);
    assert_eq!(&fs::read(&new).unwrap()[..2], &[0xff, 0xfe]);
    // A separate stale session never adopts the new bytes/inode behind its back.
    assert!(matches!(
        service.save(&second.id, "Other dirty draft"),
        Err(DocumentError::ExternalChange)
    ));
}

#[test]
fn dropping_a_plan_and_rejecting_a_stale_identity_never_change_session_metadata() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let new = root.join("B.md");
    fs::write(&old, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
    let metadata = service.get_metadata(&opened.id).unwrap();
    drop(
        service
            .prepare_rename(
                directory.clone(),
                Path::new("A.md"),
                Path::new("B.md"),
                &old,
                &new,
                RenameKind::File,
            )
            .unwrap(),
    );
    assert_eq!(service.get_metadata(&opened.id).unwrap(), metadata);
    fs::rename(&old, root.join("original.md")).unwrap();
    fs::write(&old, b"Alpha").unwrap();
    assert!(matches!(
        service.prepare_rename(
            directory,
            Path::new("A.md"),
            Path::new("B.md"),
            &old,
            &new,
            RenameKind::File
        ),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(service.get_metadata(&opened.id).unwrap(), metadata);
    assert!(!new.exists());
}

#[test]
fn matching_requires_the_actual_parent_and_basename_not_just_file_identity() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let new = root.join("B.md");
    fs::write(&old, b"Alpha").unwrap();
    fs::hard_link(&old, root.join("alias.md")).unwrap();
    fs::create_dir(root.join("other")).unwrap();
    fs::write(root.join("other/A.md"), b"Other").unwrap();
    let mut service = DocumentService::new();
    let target = service.open_authorized(&old).unwrap();
    let alias = service.open_authorized(&root.join("alias.md")).unwrap();
    let other = service.open_authorized(&root.join("other/A.md")).unwrap();
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
    assert_eq!(plan.affected_count(), 1);
    fs::rename(&old, &new).unwrap();
    assert_eq!(plan.commit()[0].id, target.id);
    assert_eq!(
        service.get_metadata(&alias.id).unwrap().metadata_revision,
        0
    );
    assert_eq!(
        service.get_metadata(&other.id).unwrap().metadata_revision,
        0
    );
}

#[test]
fn same_parent_rename_keeps_registered_images_and_uses_new_stem_for_future_imports() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let new = root.join("B.md");
    fs::write(&old, b"![image](image.svg)").unwrap();
    fs::write(
        root.join("image.svg"),
        br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#,
    )
    .unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
    let image = service.resolve_image(&opened.id, "image.svg").unwrap();
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
    assert_eq!(
        service
            .resolve_image(&opened.id, "image.svg")
            .unwrap()
            .token,
        image.token
    );
    assert!(service.image(&image.token).is_some());
    let imported = service
        .import_image_with_folder(
            &opened.id,
            "clip.svg",
            "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
            "",
            "${filename}.assets",
        )
        .unwrap();
    assert!(imported.source.starts_with("B.assets/"));
    assert!(root.join("B.assets").is_dir());
    assert!(!root.join("A.assets").exists());
    assert_eq!(fs::read(&new).unwrap(), b"![image](image.svg)");
}

#[test]
fn directory_rename_rebinds_only_proven_descendants_and_preserves_their_source() {
    let (_temporary, root, directory) = fixture();
    fs::create_dir(root.join("dir")).unwrap();
    fs::create_dir(root.join("directory")).unwrap();
    fs::write(root.join("dir/A.md"), b"Alpha").unwrap();
    fs::write(root.join("directory/A.md"), b"Other").unwrap();
    let mut service = DocumentService::new();
    let target = service.open_authorized(&root.join("dir/A.md")).unwrap();
    service
        .open_authorized(&root.join("directory/A.md"))
        .unwrap();
    let plan = service
        .prepare_rename(
            directory,
            Path::new("dir"),
            Path::new("renamed"),
            &root.join("dir"),
            &root.join("renamed"),
            RenameKind::Directory,
        )
        .unwrap();
    assert_eq!(plan.affected_count(), 1);
    if !crate::directory_test_support::move_retained_directory(
        &root.join("dir"),
        &root.join("renamed"),
    ) {
        drop(plan);
        crate::directory_test_support::assert_available(
            &service,
            &target.id,
            &root.join("dir/A.md"),
        );
        return;
    }
    assert_eq!(plan.commit()[0].id, target.id);
    assert_eq!(service.documents[&target.id].text, "Alpha");
    assert_eq!(service.documents[&target.id].original_bytes, b"Alpha");
    assert_eq!(
        service.documents[&target.id].path,
        root.join("renamed/A.md")
    );
    service.save(&target.id, "Dirty after rename").unwrap();
    assert_eq!(
        fs::read(root.join("renamed/A.md")).unwrap(),
        b"Dirty after rename"
    );
    assert_eq!(fs::read(root.join("directory/A.md")).unwrap(), b"Other");
}

#[test]
fn changed_content_on_same_identity_is_not_silently_accepted_as_a_new_baseline() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let new = root.join("B.md");
    fs::write(&old, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
    fs::write(&old, b"External").unwrap();
    let DocumentChange::Changed { version, .. } =
        service.check_document_change(&opened.id).unwrap()
    else {
        panic!("expected disk candidate")
    };
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
    assert!(matches!(
        service.accept_document_change(&opened.id, &version),
        Err(DocumentError::StaleReload)
    ));
    assert_eq!(service.documents[&opened.id].text, "Alpha");
    assert!(matches!(
        service.save(&opened.id, "Dirty"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&new).unwrap(), b"External");
}

#[test]
fn invalid_path_and_revision_limit_fail_before_any_rename_publication() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let new = root.join("B.md");
    fs::write(&old, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
    assert!(matches!(
        service.prepare_rename(
            directory.clone(),
            Path::new("A.md"),
            Path::new("../B.md"),
            &old,
            &new,
            RenameKind::File
        ),
        Err(DocumentError::InvalidPath)
    ));
    assert!(matches!(
        service.prepare_rename(
            directory.clone(),
            Path::new("A.md"),
            Path::new("B.md"),
            &old,
            &root.join("other/B.md"),
            RenameKind::File
        ),
        Err(DocumentError::UnsupportedRename)
    ));
    service
        .documents
        .get_mut(&opened.id)
        .unwrap()
        .metadata_revision = MAX_METADATA_REVISION;
    assert!(matches!(
        service.prepare_rename(
            directory,
            Path::new("A.md"),
            Path::new("B.md"),
            &old,
            &new,
            RenameKind::File
        ),
        Err(DocumentError::MetadataRevisionLimit)
    ));
    assert!(old.exists());
    assert!(!new.exists());
}

#[test]
fn uncertain_move_revokes_old_location_but_keeps_encoding_and_draft_for_explicit_save_as() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let new = root.join("B.md");
    let original = b"\xef\xbb\xbfAlpha\r\nTail  \n";
    fs::write(&old, original).unwrap();
    fs::write(
        root.join("image.svg"),
        br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#,
    )
    .unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
    let image = service.resolve_image(&opened.id, "image.svg").unwrap();
    fs::write(&old, b"\xef\xbb\xbfExternal\r\n").unwrap();
    let DocumentChange::Changed { version, .. } =
        service.check_document_change(&opened.id).unwrap()
    else {
        panic!("expected candidate")
    };
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
    assert_eq!(plan.revoke(), vec![opened.id.clone()]);
    fs::write(&old, original).unwrap();
    for source in [opened.text.as_str(), "Dirty draft"] {
        assert!(matches!(
            service.save(&opened.id, source),
            Err(DocumentError::RelocationUncertain)
        ));
    }
    assert!(matches!(
        service.authorized_path(&opened.id),
        Err(DocumentError::RelocationUncertain)
    ));
    assert_eq!(service.display_path(&opened.id).unwrap(), old);
    assert!(matches!(
        service.get_metadata(&opened.id),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(matches!(
        service.bookmark(&opened.id),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(matches!(
        service.check_document_change(&opened.id),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(matches!(
        service.accept_document_change(&opened.id, &version),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(!service.pending_reloads.contains_key(&opened.id));
    assert!(matches!(
        service.start_document_watch(&opened.id, Arc::new(|_| {})),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(service.image(&image.token).is_none());
    assert!(matches!(
        service.resolve_image(&opened.id, "image.svg"),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(matches!(
        service.import_image(
            &opened.id,
            "clip.svg",
            "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
            ""
        ),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(!root.join("assets").exists());
    assert_eq!(service.documents[&opened.id].text, opened.text);
    assert_eq!(service.documents[&opened.id].original_bytes, original);
    assert_eq!(service.documents[&opened.id].metadata_revision, 0);
    assert_eq!(fs::read(&old).unwrap(), original);
    assert_eq!(fs::read(&new).unwrap(), b"\xef\xbb\xbfExternal\r\n");
    let saved = service
        .save_as_authorized(&root.join("Runtime.md"), "Dirty\r\n", Some(&opened.id))
        .unwrap();
    assert_ne!(saved.id, opened.id);
    assert_eq!(saved.encoding, opened.encoding);
    assert_eq!(
        fs::read(root.join("Runtime.md")).unwrap(),
        b"\xef\xbb\xbfDirty\r\n"
    );
    service.save(&saved.id, "Dirty next\r\n").unwrap();
    assert!(matches!(
        service.save(&opened.id, "cannot revive"),
        Err(DocumentError::RelocationUncertain)
    ));
}

#[test]
fn explicit_save_as_to_old_display_path_uses_a_new_grant_after_revocation() {
    let (_temporary, root, directory) = fixture();
    let old = root.join("A.md");
    let new = root.join("B.md");
    fs::write(&old, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
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
    plan.revoke();
    fs::write(&old, b"Alpha").unwrap();
    // Only a host-confirmed system SaveAs path may create this new authorization.
    let saved = service
        .save_as_authorized(&old, "Explicit", Some(&opened.id))
        .unwrap();
    assert_ne!(saved.id, opened.id);
    assert_eq!(fs::read(&old).unwrap(), b"Explicit");
    assert_eq!(fs::read(&new).unwrap(), b"Alpha");
    service.close(&opened.id);
    service.save(&saved.id, "Still authorized").unwrap();
}
