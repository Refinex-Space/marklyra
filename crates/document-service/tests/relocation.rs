use cap_std::{ambient_authority, fs::Dir};
use document_service::{
    DirectoryBookmark, DocumentAuthorities, DocumentChange, DocumentError, DocumentService,
    RenameKind,
};
use std::{fs, path::Path, sync::Arc};

const SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;
const ENCODED_SVG: &str = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";

fn cap(path: &Path) -> Arc<Dir> {
    Arc::new(Dir::open_ambient_dir(path, ambient_authority()).unwrap())
}

#[test]
fn own_atomic_publications_advance_shared_lineage_without_adopting_other_drafts() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    let old = root.join("A.md");
    let new = root.join("B.md");
    fs::write(&old, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut second = DocumentService::with_authorities(authorities);
    let a = first.open_authorized(&old).unwrap();
    let b = second.open_authorized(&old).unwrap();
    first.save(&a.id, "AlphaX").unwrap();
    first.save(&a.id, "AlphaY").unwrap();
    let directory = cap(&root);
    let first_plan = first
        .prepare_rename(
            Arc::clone(&directory),
            Path::new("A.md"),
            Path::new("B.md"),
            &old,
            &new,
            RenameKind::File,
        )
        .unwrap();
    let second_plan = second
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
    assert_eq!(first_plan.commit()[0].id, a.id);
    assert_eq!(second_plan.commit()[0].id, b.id);
    assert!(matches!(
        second.save(&b.id, "Dirty stale draft"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&new).unwrap(), b"AlphaY");
    assert_eq!(
        second.get_metadata(&b.id).unwrap().path,
        new.to_string_lossy()
    );
    // Returning to the other draft's exact baseline is allowed only because the
    // inode transition was our successful publication, not a bytes-only match.
    first.save(&a.id, "Alpha").unwrap();
    second.save(&b.id, "Second draft").unwrap();
    assert_eq!(fs::read(&new).unwrap(), b"Second draft");
    assert!(matches!(
        first.save(&a.id, "First draft"),
        Err(DocumentError::ExternalChange)
    ));
}

#[test]
fn unknown_same_byte_inode_does_not_join_or_advance_existing_lineage() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    let path = root.join("A.md");
    fs::write(&path, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut second = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut fresh = DocumentService::with_authorities(authorities);
    let a = first.open_authorized(&path).unwrap();
    let b = second.open_authorized(&path).unwrap();
    first.save(&a.id, "Changed").unwrap();
    first.save(&a.id, "Alpha").unwrap();
    fs::rename(&path, root.join("retained.md")).unwrap();
    fs::write(&path, b"Alpha").unwrap();
    let c = fresh.open_authorized(&path).unwrap();
    fresh.save(&c.id, "New grant").unwrap();
    fresh.save(&c.id, "Alpha").unwrap();
    for (service, id) in [(&mut first, &a.id), (&mut second, &b.id)] {
        assert!(matches!(
            service.save(id, "must refuse"),
            Err(DocumentError::ExternalChange)
        ));
        assert!(matches!(
            service.prepare_rename(
                cap(&root),
                Path::new("A.md"),
                Path::new("B.md"),
                &path,
                &root.join("B.md"),
                RenameKind::File
            ),
            Err(DocumentError::ExternalChange)
        ));
    }
    let DocumentChange::Changed { version, .. } = second.check_document_change(&b.id).unwrap()
    else {
        panic!("replacement must remain observable")
    };
    second.accept_document_change(&b.id, &version).unwrap();
    second.save(&b.id, "Explicitly accepted").unwrap();
    assert!(matches!(
        first.save(&a.id, "Still stale"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(root.join("retained.md")).unwrap(), b"Alpha");
}

#[test]
fn independent_authorities_do_not_claim_another_services_save_as_their_lineage() {
    let temporary = tempfile::tempdir().unwrap();
    let path = temporary.path().join("A.md");
    fs::write(&path, b"Alpha").unwrap();
    let mut a = DocumentService::new();
    let mut b = DocumentService::new();
    let first = a.open_authorized(&path).unwrap();
    let second = b.open_authorized(&path).unwrap();
    a.save(&first.id, "Next").unwrap();
    a.save(&first.id, "Alpha").unwrap();
    assert!(matches!(
        b.save(&second.id, "Dirty"),
        Err(DocumentError::ExternalChange)
    ));
}

#[test]
fn save_as_advances_only_the_existing_destination_cohort() {
    let temporary = tempfile::tempdir().unwrap();
    let first_path = temporary.path().join("A.md");
    let second_path = temporary.path().join("B.md");
    fs::write(&first_path, b"Alpha").unwrap();
    fs::write(&second_path, b"Beta").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut a = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut b = DocumentService::with_authorities(authorities);
    let source = a.open_authorized(&first_path).unwrap();
    let old_destination = b.open_authorized(&second_path).unwrap();
    let destination = a
        .save_as_authorized(&second_path, "BetaX", Some(&source.id))
        .unwrap();
    a.save(&destination.id, "Beta").unwrap();
    b.save(&old_destination.id, "From second window").unwrap();
    a.save(&source.id, "Source still independent").unwrap();
    assert_eq!(fs::read(&first_path).unwrap(), b"Source still independent");
    assert_eq!(fs::read(&second_path).unwrap(), b"From second window");
}

#[test]
fn ancestor_rename_retains_all_image_scope_shapes_and_never_rewrites_markdown() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    let old = root.join("old");
    let new = root.join("新目录😀");
    fs::create_dir_all(old.join("sub")).unwrap();
    fs::create_dir(root.join("shared")).unwrap();
    let path = old.join("sub/note.md");
    let bytes = b"\xef\xbb\xbf![image](image.svg)\r\n  Tail \n";
    fs::write(&path, bytes).unwrap();
    fs::write(old.join("sub/image.svg"), SVG).unwrap();
    fs::write(root.join("shared/image.svg"), SVG).unwrap();
    let mut service = DocumentService::new();
    let direct = service.open_authorized(&path).unwrap();
    let inner = service
        .open_in_workspace(cap(&old), Path::new("sub/note.md"), path.clone())
        .unwrap();
    let outer = service
        .open_in_workspace(cap(&root), Path::new("old/sub/note.md"), path)
        .unwrap();
    let mut images = Vec::new();
    for document in [&direct, &inner, &outer] {
        images.push(service.resolve_image(&document.id, "image.svg").unwrap());
    }
    let sibling = service
        .resolve_image(&outer.id, "../../shared/image.svg")
        .unwrap();
    let plan = service
        .prepare_rename(
            cap(&root),
            Path::new("old"),
            Path::new("新目录😀"),
            &old,
            &new,
            RenameKind::Directory,
        )
        .unwrap();
    assert_eq!(plan.affected_count(), 3);
    fs::rename(&old, &new).unwrap();
    let metadata = plan.commit();
    assert!(metadata.iter().all(
        |value| value.path == new.join("sub/note.md").to_string_lossy()
            && value.metadata_revision == 1
    ));
    fs::create_dir_all(old.join("sub")).unwrap();
    fs::write(old.join("sub/note.md"), b"Replacement").unwrap();
    fs::write(old.join("sub/image.svg"), b"not an image").unwrap();
    for (document, image) in [&direct, &inner, &outer].into_iter().zip(images) {
        assert_eq!(
            service
                .resolve_image(&document.id, "image.svg")
                .unwrap()
                .token,
            image.token
        );
        assert_eq!(service.image(&image.token).unwrap().bytes.as_ref(), SVG);
        assert_eq!(
            service.save(&document.id, &document.text).unwrap().encoding,
            document.encoding
        );
    }
    assert_eq!(
        service
            .resolve_image(&outer.id, "../../shared/image.svg")
            .unwrap()
            .token,
        sibling.token
    );
    assert!(service
        .resolve_image(&direct.id, "../../shared/image.svg")
        .is_err());
    assert!(service
        .resolve_image(&inner.id, "../../shared/image.svg")
        .is_err());
    let imported = service
        .import_image_with_folder(&outer.id, "clip.svg", ENCODED_SVG, "", "${filename}.assets")
        .unwrap();
    assert!(imported.source.starts_with("note.assets/"));
    assert!(new.join("sub/note.assets").is_dir());
    assert!(!old.join("sub/note.assets").exists());
    assert_eq!(fs::read(new.join("sub/note.md")).unwrap(), bytes);
    assert_eq!(fs::read(old.join("sub/note.md")).unwrap(), b"Replacement");
}

#[test]
fn ancestor_rename_keeps_a_replaced_child_in_conflict_instead_of_adopting_it() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir_all(root.join("old/sub")).unwrap();
    let old = root.join("old");
    let new = root.join("new");
    let path = old.join("sub/A.md");
    fs::write(&path, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&path).unwrap();
    fs::rename(&path, old.join("sub/retained.md")).unwrap();
    fs::write(&path, b"Alpha").unwrap();
    let DocumentChange::Changed { version, .. } =
        service.check_document_change(&document.id).unwrap()
    else {
        panic!("replacement candidate")
    };
    let plan = service
        .prepare_rename(
            cap(&root),
            Path::new("old"),
            Path::new("new"),
            &old,
            &new,
            RenameKind::Directory,
        )
        .unwrap();
    fs::rename(&old, &new).unwrap();
    plan.commit();
    assert!(matches!(
        service.accept_document_change(&document.id, &version),
        Err(DocumentError::StaleReload)
    ));
    assert!(matches!(
        service.save(&document.id, "Dirty draft"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(new.join("sub/A.md")).unwrap(), b"Alpha");
    assert_eq!(fs::read(new.join("sub/retained.md")).unwrap(), b"Alpha");
}

#[test]
fn ancestor_rename_refuses_a_replaced_parent_even_with_identical_descendant_bytes() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir_all(root.join("old/sub")).unwrap();
    fs::write(root.join("old/sub/A.md"), b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&root.join("old/sub/A.md")).unwrap();
    fs::rename(root.join("old/sub"), root.join("old/retained")).unwrap();
    fs::create_dir(root.join("old/sub")).unwrap();
    fs::write(root.join("old/sub/A.md"), b"Alpha").unwrap();
    assert!(matches!(
        service.prepare_rename(
            cap(&root),
            Path::new("old"),
            Path::new("new"),
            &root.join("old"),
            &root.join("new"),
            RenameKind::Directory
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
    assert!(!root.join("new").exists());
}

#[test]
fn successive_ancestor_moves_preserve_each_encoding_and_invalidate_old_reload_tickets() {
    for encoding in ["UTF-8", "UTF-8 BOM", "UTF-16LE BOM", "UTF-16BE BOM"] {
        let temporary = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temporary.path()).unwrap();
        fs::create_dir_all(root.join("old/sub")).unwrap();
        let path = root.join("old/sub/A.md");
        let text = "原文😀\r\n  Tail \n";
        let codec = document_service::Encoding::from_label(encoding).unwrap();
        let bytes = codec.encode(text).unwrap();
        fs::write(&path, &bytes).unwrap();
        let mut service = DocumentService::new();
        let document = service.open_authorized(&path).unwrap();
        let external = codec.encode("External\r\n").unwrap();
        fs::write(&path, &external).unwrap();
        let DocumentChange::Changed { version, .. } =
            service.check_document_change(&document.id).unwrap()
        else {
            panic!("pending candidate")
        };
        // The content change remains a conflict; a trusted ancestor move only
        // transfers location metadata and cannot accept that pending candidate.
        for (index, (old, new)) in [("old", "middle"), ("middle", "new")]
            .into_iter()
            .enumerate()
        {
            let plan = service
                .prepare_rename(
                    cap(&root),
                    Path::new(old),
                    Path::new(new),
                    &root.join(old),
                    &root.join(new),
                    RenameKind::Directory,
                )
                .unwrap();
            fs::rename(root.join(old), root.join(new)).unwrap();
            assert_eq!(plan.commit()[0].metadata_revision, (index + 1) as u64);
        }
        assert!(matches!(
            service.accept_document_change(&document.id, &version),
            Err(DocumentError::StaleReload)
        ));
        assert!(matches!(
            service.save(&document.id, "Dirty"),
            Err(DocumentError::ExternalChange)
        ));
        let runtime = service
            .save_as_authorized(&root.join("Runtime.md"), &document.text, Some(&document.id))
            .unwrap();
        assert_eq!(runtime.encoding, document.encoding);
        assert_eq!(fs::read(root.join("Runtime.md")).unwrap(), bytes);
        assert_eq!(fs::read(root.join("new/sub/A.md")).unwrap(), external);
    }
}

#[test]
fn uncertain_ancestor_move_revokes_all_descendants_but_keeps_explicit_save_as() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir_all(root.join("old/sub")).unwrap();
    fs::write(root.join("old/sub/A.md"), b"Alpha").unwrap();
    fs::write(root.join("old/sub/image.svg"), SVG).unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&root.join("old/sub/A.md")).unwrap();
    let image = service.resolve_image(&document.id, "image.svg").unwrap();
    let plan = service
        .prepare_rename(
            cap(&root),
            Path::new("old"),
            Path::new("new"),
            &root.join("old"),
            &root.join("new"),
            RenameKind::Directory,
        )
        .unwrap();
    fs::rename(root.join("old"), root.join("new")).unwrap();
    assert_eq!(plan.revoke(), vec![document.id.clone()]);
    fs::create_dir_all(root.join("old/sub")).unwrap();
    fs::write(root.join("old/sub/A.md"), b"Alpha").unwrap();
    assert!(matches!(
        service.save(&document.id, "Dirty"),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(matches!(
        service.import_image(&document.id, "clip.svg", ENCODED_SVG, ""),
        Err(DocumentError::RelocationUncertain)
    ));
    assert!(service.image(&image.token).is_none());
    let rescued = service
        .save_as_authorized(&root.join("Runtime.md"), "Dirty", Some(&document.id))
        .unwrap();
    assert_ne!(rescued.id, document.id);
    assert_eq!(fs::read(root.join("Runtime.md")).unwrap(), b"Dirty");
    assert_eq!(fs::read(root.join("old/sub/A.md")).unwrap(), b"Alpha");
    assert_eq!(fs::read(root.join("new/sub/A.md")).unwrap(), b"Alpha");
}

#[test]
fn trusted_directory_and_document_bookmarks_retarget_without_postmove_io() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    let old = root.join("old");
    let new = root.join("new");
    fs::create_dir_all(old.join("sub")).unwrap();
    fs::write(old.join("sub/A.md"), b"Alpha").unwrap();
    let old_bookmark =
        DirectoryBookmark::capture(&cap(&old.join("sub")), &old.join("sub")).unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&old.join("sub/A.md")).unwrap();
    let file = service.bookmark(&document.id).unwrap();
    let directory_plan = old_bookmark
        .prepare_retarget(&cap(&old), &old, &new)
        .unwrap()
        .unwrap();
    let file_plan = file
        .prepare_retarget(&cap(&old), &old, &new)
        .unwrap()
        .unwrap();
    fs::rename(&old, &new).unwrap();
    let rebound = directory_plan.commit();
    let rebound_file = file_plan.commit();
    assert_eq!(rebound.path(), new.join("sub"));
    assert_eq!(rebound_file.path(), new.join("sub/A.md"));
    assert!(old_bookmark.reopen().is_err());
    assert!(file.probe().is_err() || !file.is_available());
    assert!(rebound.reopen().is_ok());
    let renamed = new.join("sub/B.md");
    let plan = rebound_file
        .prepare_file_retarget(
            &cap(&new.join("sub")),
            Path::new("A.md"),
            Path::new("B.md"),
            &rebound_file.path(),
            &renamed,
        )
        .unwrap()
        .unwrap();
    fs::rename(rebound_file.path(), &renamed).unwrap();
    let rebound_file = plan.commit();
    assert_eq!(rebound_file.path(), renamed);
    assert!(rebound_file.is_available());
    assert_eq!(service.open_bookmark(&rebound_file).unwrap().text, "Alpha");
}

#[test]
fn bookmark_retarget_rejects_wrong_capabilities_and_unaffected_records_keep_identity() {
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    for name in ["old", "other"] {
        fs::create_dir(root.join(name)).unwrap();
    }
    fs::write(root.join("old/A.md"), b"Alpha").unwrap();
    let bookmark = DirectoryBookmark::capture(&cap(&root.join("old")), &root.join("old")).unwrap();
    assert!(bookmark
        .prepare_retarget(
            &cap(&root.join("other")),
            &root.join("old"),
            &root.join("new")
        )
        .is_err());
    assert!(bookmark
        .prepare_retarget(
            &cap(&root.join("other")),
            &root.join("other"),
            &root.join("new")
        )
        .unwrap()
        .is_none());
    assert!(bookmark
        .prepare_retarget(
            &cap(&root.join("old")),
            &root.join("old"),
            &root.join("other/new")
        )
        .is_err());
    let mut service = DocumentService::new();
    let document = service.open_authorized(&root.join("old/A.md")).unwrap();
    let file = service.bookmark(&document.id).unwrap();
    assert!(file
        .prepare_file_retarget(
            &cap(&root.join("other")),
            Path::new("A.md"),
            Path::new("B.md"),
            &file.path(),
            &root.join("old/B.md")
        )
        .is_err());
    assert!(file
        .prepare_file_retarget(
            &cap(&root.join("old")),
            Path::new("A.md"),
            Path::new("../B.md"),
            &file.path(),
            &root.join("old/B.md")
        )
        .is_err());
    assert!(file
        .prepare_file_retarget(
            &cap(&root.join("old")),
            Path::new("Other.md"),
            Path::new("B.md"),
            &root.join("old/Other.md"),
            &root.join("old/B.md")
        )
        .unwrap()
        .is_none());
}
