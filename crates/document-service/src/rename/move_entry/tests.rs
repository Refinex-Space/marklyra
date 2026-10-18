use super::*;
use crate::{DocumentAuthorities, DocumentChange, NativeMovePublicationEntry};
use cap_std::fs::File;
use std::fs;

const SVG: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;

fn cap(path: &Path) -> Arc<Dir> {
    Arc::new(Dir::open_ambient_dir(path, cap_std::ambient_authority()).unwrap())
}
fn held(path: &Path, kind: RenameKind) -> Arc<File> {
    Arc::new(if kind == RenameKind::Directory {
        File::from_std(cap(path).try_clone().unwrap().into_std_file())
    } else {
        File::open_ambient(path, cap_std::ambient_authority()).unwrap()
    })
}
fn entry(
    suffix: &str,
    kind: RenameKind,
    source: Arc<File>,
    destination: Arc<File>,
) -> NativeMovePublicationEntry {
    NativeMovePublicationEntry::from_owned_handles(Path::new(suffix), kind, source, destination)
        .unwrap()
}
fn proof(
    old: &Path,
    new: &Path,
    kind: RenameKind,
    entries: Vec<NativeMovePublicationEntry>,
) -> NativeMovePublication {
    NativeMovePublication::verify(
        Uuid::new_v4(),
        cap(old.parent().unwrap()),
        Path::new(old.file_name().unwrap()),
        cap(new.parent().unwrap()),
        Path::new(new.file_name().unwrap()),
        kind,
        entries,
    )
    .unwrap()
}
fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    let source = root.join("left");
    let destination = root.join("right");
    fs::create_dir(&source).unwrap();
    fs::create_dir(&destination).unwrap();
    (temp, source, destination)
}

#[test]
fn cross_parent_aliases_keep_independent_saved_baselines_and_follow_own_publications_both_ways() {
    let (_temp, left, right) = fixture();
    let old = left.join("A.md");
    let new = right.join("B.md");
    fs::write(&old, b"\xef\xbb\xbfAlpha\r\n").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
    let mut second = DocumentService::with_authorities(authorities);
    let a = first.open_authorized(&old).unwrap();
    let b = second.open_authorized(&old).unwrap();
    first.save(&a.id, "AlphaX\r\n").unwrap();
    let source = held(&old, RenameKind::File);
    let mut first_plan = first
        .prepare_move(
            cap(&left),
            Path::new("A.md"),
            cap(&right),
            Path::new("B.md"),
            &old,
            &new,
            RenameKind::File,
        )
        .unwrap();
    let mut second_plan = second
        .prepare_move(
            cap(&left),
            Path::new("A.md"),
            cap(&right),
            Path::new("B.md"),
            &old,
            &new,
            RenameKind::File,
        )
        .unwrap();
    fs::rename(&old, &new).unwrap();
    let publication = proof(
        &old,
        &new,
        RenameKind::File,
        vec![entry(
            "",
            RenameKind::File,
            source,
            held(&new, RenameKind::File),
        )],
    );
    first_plan.validate_commit(&publication).unwrap();
    second_plan.validate_commit(&publication).unwrap();
    assert_eq!(first_plan.commit()[0].id, a.id);
    assert_eq!(second_plan.commit()[0].id, b.id);
    assert_eq!(first.get_metadata(&a.id).unwrap().metadata_revision, 1);
    assert!(matches!(
        second.save(&b.id, "Unrelated dirty draft"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&new).unwrap(), b"\xef\xbb\xbfAlphaX\r\n");
    first.save(&a.id, "Alpha\r\n").unwrap();
    second.save(&b.id, "Second\r\n").unwrap();
    assert_eq!(fs::read(&new).unwrap(), b"\xef\xbb\xbfSecond\r\n");
    let source = held(&new, RenameKind::File);
    let mut a_back = first
        .prepare_move(
            cap(&right),
            Path::new("B.md"),
            cap(&left),
            Path::new("A.md"),
            &new,
            &old,
            RenameKind::File,
        )
        .unwrap();
    let mut b_back = second
        .prepare_move(
            cap(&right),
            Path::new("B.md"),
            cap(&left),
            Path::new("A.md"),
            &new,
            &old,
            RenameKind::File,
        )
        .unwrap();
    fs::rename(&new, &old).unwrap();
    let back = proof(
        &new,
        &old,
        RenameKind::File,
        vec![entry(
            "",
            RenameKind::File,
            source,
            held(&old, RenameKind::File),
        )],
    );
    a_back.validate_commit(&back).unwrap();
    b_back.validate_commit(&back).unwrap();
    a_back.commit();
    b_back.commit();
    second.save(&b.id, "Second again\r\n").unwrap();
    assert_eq!(fs::read(&old).unwrap(), b"\xef\xbb\xbfSecond again\r\n");
    assert!(matches!(
        first.save(&a.id, "stale"),
        Err(DocumentError::ExternalChange)
    ));
}

#[test]
fn copied_file_receipt_rebinds_real_parent_and_keeps_utf16_and_new_image_grant_separate() {
    let (_temp, left, right) = fixture();
    let old = left.join("A.md");
    let new = right.join("A.md");
    let text = "![asset](asset.svg)\r\n中文😀  \n";
    let bytes: Vec<u8> = [
        vec![0xff, 0xfe],
        text.encode_utf16().flat_map(u16::to_le_bytes).collect(),
    ]
    .concat();
    fs::write(&old, &bytes).unwrap();
    fs::write(left.join("asset.svg"), SVG).unwrap();
    fs::write(right.join("asset.svg"), SVG).unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
    let original = service.resolve_image(&opened.id, "asset.svg").unwrap();
    let document_bookmark = service.bookmark(&opened.id).unwrap();
    let bookmark = document_bookmark
        .prepare_file_move(
            &cap(&left),
            cap(&right),
            Path::new("A.md"),
            Path::new("A.md"),
            &old,
            &new,
        )
        .unwrap()
        .unwrap();
    let source = held(&old, RenameKind::File);
    let mut plan = service
        .prepare_move(
            cap(&left),
            Path::new("A.md"),
            cap(&right),
            Path::new("A.md"),
            &old,
            &new,
            RenameKind::File,
        )
        .unwrap();
    fs::copy(&old, &new).unwrap();
    let destination = held(&new, RenameKind::File);
    fs::rename(&old, left.join("retained.md")).unwrap();
    let publication = proof(
        &old,
        &new,
        RenameKind::File,
        vec![entry("", RenameKind::File, source, destination)],
    );
    plan.validate_commit(&publication).unwrap();
    plan.commit();
    let bookmark = bookmark.finalize(&publication).unwrap().commit();
    assert_eq!(bookmark.path(), new);
    assert!(bookmark.probe().unwrap());
    let next = service.resolve_image(&opened.id, "asset.svg").unwrap();
    assert_ne!(original.token, next.token);
    assert_eq!(service.image(&original.token).unwrap().bytes.as_ref(), SVG);
    assert!(left.join("asset.svg").exists());
    service.save(&opened.id, text).unwrap();
    assert_eq!(fs::read(&new).unwrap(), bytes);
    service.save(&opened.id, &format!("{text}Dirty")).unwrap();
    assert_eq!(fs::read(left.join("retained.md")).unwrap(), bytes);
    assert!(matches!(
        service.check_document_change(&opened.id),
        Ok(DocumentChange::Unchanged)
    ));
}

#[test]
fn copied_directory_rebinds_all_descendant_handles_and_preserves_scope_intersection_and_bookmarks()
{
    let (_temp, left, right) = fixture();
    let old = left.join("Folder");
    let new = right.join("Moved");
    fs::create_dir_all(old.join("sub")).unwrap();
    fs::write(old.join("sub/A.md"), b"![asset](../asset.svg)\r\n").unwrap();
    fs::write(old.join("asset.svg"), SVG).unwrap();
    fs::write(left.join("outside.svg"), SVG).unwrap();
    let mut service = DocumentService::new();
    let opened = service
        .open_in_workspace(
            cap(&left),
            Path::new("Folder/sub/A.md"),
            old.join("sub/A.md"),
        )
        .unwrap();
    let in_image = service.resolve_image(&opened.id, "../asset.svg").unwrap();
    let out_image = service
        .resolve_image(&opened.id, "../../outside.svg")
        .unwrap();
    let dir_bookmark =
        DirectoryBookmark::capture(&cap(&old.join("sub")), &old.join("sub")).unwrap();
    let dir_plan = dir_bookmark
        .prepare_directory_move(&cap(&old), cap(&right), &old, &new)
        .unwrap()
        .unwrap();
    let doc_bookmark = service.bookmark(&opened.id).unwrap();
    let doc_plan = doc_bookmark
        .prepare_directory_move(&cap(&old), cap(&right), &old, &new)
        .unwrap()
        .unwrap();
    let paths = [
        ("", RenameKind::Directory),
        ("sub", RenameKind::Directory),
        ("sub/A.md", RenameKind::File),
        ("asset.svg", RenameKind::File),
    ];
    let sources: Vec<_> = paths
        .iter()
        .map(|(suffix, kind)| held(&old.join(suffix), *kind))
        .collect();
    let mut plan = service
        .prepare_move(
            cap(&left),
            Path::new("Folder"),
            cap(&right),
            Path::new("Moved"),
            &old,
            &new,
            RenameKind::Directory,
        )
        .unwrap();
    fs::create_dir_all(new.join("sub")).unwrap();
    fs::copy(old.join("sub/A.md"), new.join("sub/A.md")).unwrap();
    fs::copy(old.join("asset.svg"), new.join("asset.svg")).unwrap();
    let entries = paths
        .iter()
        .zip(sources)
        .map(|((suffix, kind), source)| {
            entry(suffix, *kind, source, held(&new.join(suffix), *kind))
        })
        .collect();
    fs::rename(&old, left.join("retained")).unwrap();
    let publication = proof(&old, &new, RenameKind::Directory, entries);
    plan.validate_commit(&publication).unwrap();
    plan.commit();
    assert_eq!(
        dir_plan.finalize(&publication).unwrap().commit().path(),
        new.join("sub")
    );
    assert_eq!(
        doc_plan.finalize(&publication).unwrap().commit().path(),
        new.join("sub/A.md")
    );
    assert_eq!(
        service
            .resolve_image(&opened.id, "../asset.svg")
            .unwrap()
            .token,
        in_image.token
    );
    assert!(service
        .resolve_image(&opened.id, "../../outside.svg")
        .is_err());
    assert!(service.image(&out_image.token).is_some());
    service.save(&opened.id, "Changed\r\n").unwrap();
    assert_eq!(fs::read(new.join("sub/A.md")).unwrap(), b"Changed\r\n");
    assert_eq!(
        fs::read(left.join("retained/sub/A.md")).unwrap(),
        b"![asset](../asset.svg)\r\n"
    );
}

#[test]
fn unproven_copied_descendant_and_late_destination_replacement_revoke_without_changing_draft() {
    let (_temp, left, right) = fixture();
    let old = left.join("Folder");
    let new = right.join("Moved");
    fs::create_dir(&old).unwrap();
    fs::write(old.join("A.md"), b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old.join("A.md")).unwrap();
    let source = held(&old, RenameKind::Directory);
    let mut plan = service
        .prepare_move(
            cap(&left),
            Path::new("Folder"),
            cap(&right),
            Path::new("Moved"),
            &old,
            &new,
            RenameKind::Directory,
        )
        .unwrap();
    fs::create_dir(&new).unwrap();
    fs::write(new.join("A.md"), b"Alpha").unwrap();
    fs::rename(&old, left.join("retained")).unwrap();
    let publication = proof(
        &old,
        &new,
        RenameKind::Directory,
        vec![entry(
            "",
            RenameKind::Directory,
            source,
            held(&new, RenameKind::Directory),
        )],
    );
    assert!(matches!(
        plan.validate_commit(&publication),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(plan.revoke(), vec![opened.id.clone()]);
    assert!(matches!(
        service.save(&opened.id, "Unsafe"),
        Err(DocumentError::RelocationUncertain)
    ));
    assert_eq!(service.documents[&opened.id].path, old.join("A.md"));
    assert_eq!(service.documents[&opened.id].text, "Alpha");

    let source = right.join("Fresh.md");
    let destination = left.join("Fresh.md");
    fs::write(&source, b"Fresh").unwrap();
    let mut service = DocumentService::new();
    let doc = service.open_authorized(&source).unwrap();
    let source_fd = held(&source, RenameKind::File);
    let mut plan = service
        .prepare_move(
            cap(&right),
            Path::new("Fresh.md"),
            cap(&left),
            Path::new("Fresh.md"),
            &source,
            &destination,
            RenameKind::File,
        )
        .unwrap();
    fs::rename(&source, &destination).unwrap();
    let publication = proof(
        &source,
        &destination,
        RenameKind::File,
        vec![entry(
            "",
            RenameKind::File,
            source_fd,
            held(&destination, RenameKind::File),
        )],
    );
    fs::rename(&destination, left.join("ours.md")).unwrap();
    fs::write(&destination, b"Fresh").unwrap();
    assert!(plan.validate_commit(&publication).is_err());
    plan.revoke();
    assert!(matches!(
        service.save(&doc.id, "Unknown"),
        Err(DocumentError::RelocationUncertain)
    ));
    assert_eq!(fs::read(destination).unwrap(), b"Fresh");
}

#[test]
fn preflight_failure_and_dropped_plan_do_not_change_source_or_authorize_display_strings() {
    let (_temp, left, right) = fixture();
    let old = left.join("A.md");
    let new = right.join("A.md");
    fs::write(&old, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let doc = service.open_authorized(&old).unwrap();
    assert!(service
        .prepare_move(
            cap(&left),
            Path::new("A.md"),
            cap(&left),
            Path::new("A.md"),
            &old,
            &new,
            RenameKind::File
        )
        .is_err());
    let plan = service
        .prepare_move(
            cap(&left),
            Path::new("A.md"),
            cap(&right),
            Path::new("A.md"),
            &old,
            &new,
            RenameKind::File,
        )
        .unwrap();
    assert_eq!(plan.affected_count(), 1);
    drop(plan);
    assert_eq!(service.get_metadata(&doc.id).unwrap().metadata_revision, 0);
    service.save(&doc.id, "AlphaX").unwrap();
    assert_eq!(fs::read(old).unwrap(), b"AlphaX");
    assert!(!new.exists());
}

#[test]
fn move_retires_old_watch_and_reload_without_adopting_changed_disk_bytes() {
    let (_temp, left, right) = fixture();
    let old = left.join("A.md");
    let new = right.join("A.md");
    fs::write(&old, b"Alpha").unwrap();
    let mut service = DocumentService::new();
    let opened = service.open_authorized(&old).unwrap();
    let watch = service
        .start_document_watch(&opened.id, Arc::new(|_| {}))
        .unwrap();
    assert!(matches!(watch, crate::DocumentWatch::Watching { .. }));
    fs::write(&old, b"External").unwrap();
    let DocumentChange::Changed { version, .. } =
        service.check_document_change(&opened.id).unwrap()
    else {
        panic!("expected reload candidate")
    };
    let source = held(&old, RenameKind::File);
    let mut plan = service
        .prepare_move(
            cap(&left),
            Path::new("A.md"),
            cap(&right),
            Path::new("A.md"),
            &old,
            &new,
            RenameKind::File,
        )
        .unwrap();
    fs::rename(&old, &new).unwrap();
    let publication = proof(
        &old,
        &new,
        RenameKind::File,
        vec![entry(
            "",
            RenameKind::File,
            source,
            held(&new, RenameKind::File),
        )],
    );
    plan.validate_commit(&publication).unwrap();
    plan.commit();
    assert!(service.watchers.is_empty());
    assert_eq!(service.retired_watchers.len(), 1);
    assert!(service.pending_reloads.is_empty());
    assert!(matches!(
        service.accept_document_change(&opened.id, &version),
        Err(DocumentError::StaleReload)
    ));
    assert_eq!(service.documents[&opened.id].text, "Alpha");
    assert!(matches!(
        service.save(&opened.id, "Dirty draft"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&new).unwrap(), b"External");
}

#[test]
fn global_undo_pin_tracks_own_saves_after_alias_closes_and_retargets_back() {
    let (_temp, left, right) = fixture();
    let old = left.join("A.md");
    let new = right.join("A.md");
    fs::write(&old, b"Alpha").unwrap();
    let authorities = Arc::new(DocumentAuthorities::default());
    let mut service = DocumentService::with_authorities(Arc::clone(&authorities));
    let opened = service.open_authorized(&old).unwrap();
    let mut lease = authorities
        .lease_file(
            cap(&left),
            Path::new("A.md"),
            &same_file::Handle::from_path(&old).unwrap(),
        )
        .unwrap();
    let source = Arc::new(lease.open_current().unwrap());
    let mut plan = service
        .prepare_move(
            cap(&left),
            Path::new("A.md"),
            cap(&right),
            Path::new("A.md"),
            &old,
            &new,
            RenameKind::File,
        )
        .unwrap();
    fs::rename(&old, &new).unwrap();
    let publication = proof(
        &old,
        &new,
        RenameKind::File,
        vec![entry(
            "",
            RenameKind::File,
            source,
            held(&new, RenameKind::File),
        )],
    );
    plan.validate_commit(&publication).unwrap();
    lease.retarget_move(&publication).unwrap();
    plan.commit();
    service.save(&opened.id, "Own publication").unwrap();
    service.close(&opened.id);
    assert_eq!(
        *lease.current_identity().unwrap(),
        same_file::Handle::from_path(&new).unwrap()
    );
    let source = Arc::new(lease.open_current().unwrap());
    fs::rename(&new, &old).unwrap();
    let back = proof(
        &new,
        &old,
        RenameKind::File,
        vec![entry(
            "",
            RenameKind::File,
            source,
            held(&old, RenameKind::File),
        )],
    );
    lease.retarget_move(&back).unwrap();
    assert_eq!(
        *lease.current_identity().unwrap(),
        same_file::Handle::from_path(&old).unwrap()
    );
    let reopened = service.open_authorized(&old).unwrap();
    service.save(&reopened.id, "New draft").unwrap();
    assert_eq!(
        *lease.current_identity().unwrap(),
        same_file::Handle::from_path(&old).unwrap()
    );
    assert_eq!(fs::read(&old).unwrap(), b"New draft");
}

#[test]
fn replace_undo_accepts_only_the_exact_owned_restored_old_target() {
    let (_temp, left, right) = fixture();
    let old = left.join("A.md");
    let new = right.join("A.md");
    let retained = right.join("retained.md");
    fs::write(&old, b"Source").unwrap();
    fs::write(&new, b"Old target").unwrap();
    let restored = held(&new, RenameKind::File);
    let mut service = DocumentService::new();
    let doc = service.open_authorized(&old).unwrap();
    let source = held(&old, RenameKind::File);
    let mut forward = service
        .prepare_move(
            cap(&left),
            Path::new("A.md"),
            cap(&right),
            Path::new("A.md"),
            &old,
            &new,
            RenameKind::File,
        )
        .unwrap();
    fs::rename(&new, &retained).unwrap();
    fs::rename(&old, &new).unwrap();
    let publication = proof(
        &old,
        &new,
        RenameKind::File,
        vec![entry(
            "",
            RenameKind::File,
            source,
            held(&new, RenameKind::File),
        )],
    );
    forward.validate_commit(&publication).unwrap();
    forward.commit();
    let source = held(&new, RenameKind::File);
    let mut back = service
        .prepare_move(
            cap(&right),
            Path::new("A.md"),
            cap(&left),
            Path::new("A.md"),
            &new,
            &old,
            RenameKind::File,
        )
        .unwrap();
    fs::rename(&new, &old).unwrap();
    fs::rename(&retained, &new).unwrap();
    let ordinary = NativeMovePublication::verify(
        Uuid::new_v4(),
        cap(&right),
        Path::new("A.md"),
        cap(&left),
        Path::new("A.md"),
        RenameKind::File,
        vec![entry(
            "",
            RenameKind::File,
            Arc::clone(&source),
            held(&old, RenameKind::File),
        )],
    );
    assert!(ordinary.is_err());
    let unrelated = held(&old, RenameKind::File);
    assert!(NativeMovePublication::verify_with_source_replacement(
        Uuid::new_v4(),
        cap(&right),
        Path::new("A.md"),
        cap(&left),
        Path::new("A.md"),
        RenameKind::File,
        Some(unrelated),
        vec![entry(
            "",
            RenameKind::File,
            Arc::clone(&source),
            held(&old, RenameKind::File)
        )]
    )
    .is_err());
    let publication = NativeMovePublication::verify_with_source_replacement(
        Uuid::new_v4(),
        cap(&right),
        Path::new("A.md"),
        cap(&left),
        Path::new("A.md"),
        RenameKind::File,
        Some(restored),
        vec![entry(
            "",
            RenameKind::File,
            source,
            held(&old, RenameKind::File),
        )],
    )
    .unwrap();
    back.validate_commit(&publication).unwrap();
    back.commit();
    service.save(&doc.id, "Restored source draft").unwrap();
    assert_eq!(fs::read(&new).unwrap(), b"Old target");
    assert_eq!(fs::read(&old).unwrap(), b"Restored source draft");
}

fn target(old: &Path, new: &Path) -> NativeMoveTarget {
    NativeMoveTarget {
        source_parent: cap(old.parent().unwrap()),
        source_name: old.file_name().unwrap().into(),
        destination_parent: cap(new.parent().unwrap()),
        destination_name: new.file_name().unwrap().into(),
        source_display: old.to_owned(),
        destination_display: new.to_owned(),
        kind: RenameKind::File,
    }
}

#[test]
fn replace_batch_keeps_source_and_old_target_cohorts_independent_and_undo_restores_both() {
    let (_temp, left, right) = fixture();
    let old = left.join("A.md");
    let new = right.join("A.md");
    let backup = right.join("retained.md");
    fs::write(&old, b"Same").unwrap();
    fs::write(&new, b"Same").unwrap();
    let mut service = DocumentService::new();
    let a = service.open_authorized(&old).unwrap();
    let b = service.open_authorized(&new).unwrap();
    let source = held(&old, RenameKind::File);
    let replaced = held(&new, RenameKind::File);
    let mut batch = service
        .prepare_moves(vec![target(&new, &backup), target(&old, &new)])
        .unwrap();
    assert_eq!(batch.affected_count(), 2);
    fs::rename(&new, &backup).unwrap();
    fs::rename(&old, &new).unwrap();
    let replace_publication = NativeMovePublication::verify_with_source_replacement(
        Uuid::new_v4(),
        cap(&right),
        Path::new("A.md"),
        cap(&right),
        Path::new("retained.md"),
        RenameKind::File,
        Some(held(&new, RenameKind::File)),
        vec![entry(
            "",
            RenameKind::File,
            replaced,
            held(&backup, RenameKind::File),
        )],
    )
    .unwrap();
    let main_publication = proof(
        &old,
        &new,
        RenameKind::File,
        vec![entry(
            "",
            RenameKind::File,
            source,
            held(&new, RenameKind::File),
        )],
    );
    batch
        .validate_commit(&[&replace_publication, &main_publication])
        .unwrap();
    batch.commit();
    assert_eq!(
        service.get_metadata(&b.id).unwrap().path,
        backup.to_string_lossy()
    );
    assert_eq!(
        service.get_metadata(&a.id).unwrap().path,
        new.to_string_lossy()
    );
    service.save(&a.id, "Moved source draft").unwrap();
    service.save(&b.id, "Old target draft").unwrap();
    assert_eq!(fs::read(&new).unwrap(), b"Moved source draft");
    assert_eq!(fs::read(&backup).unwrap(), b"Old target draft");
    let source = held(&new, RenameKind::File);
    let replaced = held(&backup, RenameKind::File);
    let mut batch = service
        .prepare_moves(vec![target(&new, &old), target(&backup, &new)])
        .unwrap();
    fs::rename(&new, &old).unwrap();
    fs::rename(&backup, &new).unwrap();
    let main_publication = NativeMovePublication::verify_with_source_replacement(
        Uuid::new_v4(),
        cap(&right),
        Path::new("A.md"),
        cap(&left),
        Path::new("A.md"),
        RenameKind::File,
        Some(held(&new, RenameKind::File)),
        vec![entry(
            "",
            RenameKind::File,
            source,
            held(&old, RenameKind::File),
        )],
    )
    .unwrap();
    let replace_publication = proof(
        &backup,
        &new,
        RenameKind::File,
        vec![entry(
            "",
            RenameKind::File,
            replaced,
            held(&new, RenameKind::File),
        )],
    );
    batch
        .validate_commit(&[&main_publication, &replace_publication])
        .unwrap();
    batch.commit();
    service.save(&a.id, "Source after Undo").unwrap();
    service.save(&b.id, "Target after Undo").unwrap();
    assert_eq!(fs::read(&old).unwrap(), b"Source after Undo");
    assert_eq!(fs::read(&new).unwrap(), b"Target after Undo");
    assert!(!Arc::ptr_eq(
        &service.documents[&a.id].authority,
        &service.documents[&b.id].authority,
    ));
}
