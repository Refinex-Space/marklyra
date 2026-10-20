use super::*;
use cap_std::fs::File;
use document_service::{NativeMovePublicationEntry, NativeMoveTarget, RenameKind};
use std::fs;

const SVG: &str = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";
const IMAGE: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;
struct Fixture {
    _temp: tempfile::TempDir,
    root: Arc<Dir>,
    storage: PathBuf,
    left: PathBuf,
    right: PathBuf,
}
fn cap(path: &Path) -> Arc<Dir> {
    Arc::new(Dir::open_ambient_dir(path, cap_std::ambient_authority()).unwrap())
}
fn file(path: &Path) -> Arc<File> {
    Arc::new(File::open_ambient(path, cap_std::ambient_authority()).unwrap())
}
fn rename_file_preserving_creation(old: &Path, new: &Path) {
    #[cfg(windows)]
    let retained = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(old)
        .unwrap();
    #[cfg(windows)]
    let creation = document_service::WindowsCreationTime::capture(&retained).unwrap();
    fs::rename(old, new).unwrap();
    #[cfg(windows)]
    creation.restore(&retained).unwrap();
}
impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let base = fs::canonicalize(temp.path()).unwrap();
        let storage = base.join("storage");
        let left = base.join("left");
        let right = base.join("right");
        for path in [&storage, &left, &right] {
            fs::create_dir(path).unwrap();
        }
        Self {
            _temp: temp,
            root: cap(&storage),
            storage,
            left,
            right,
        }
    }
    fn bound(&self, service: &mut DocumentService, name: &str) -> (String, String, String) {
        let draft = service
            .create_image_draft(Arc::clone(&self.root), &self.storage)
            .unwrap();
        let image = service.import_draft_image(&draft, "own.svg", SVG).unwrap();
        let uri = tauri::Url::from_file_path(service.image_path(&draft, &image.source).unwrap())
            .unwrap()
            .to_string();
        service
            .add_image_draft_alias(&draft, &image.source, &uri)
            .unwrap();
        let path = self.left.join(name);
        fs::write(&path, format!("\u{feff}![own]({uri})\r\nTail  \n")).unwrap();
        let doc = service.open_authorized(&path).unwrap();
        service
            .attach_image_draft_aliases(&doc.id, &draft, std::slice::from_ref(&uri))
            .unwrap();
        persist_staged_alias_at(&self.root, service, &doc.id, &draft, &uri).unwrap();
        persist_recovery_history_at(
            &self.root,
            service,
            &doc.id,
            vec![service.image_draft_snapshot(&draft).unwrap()],
        )
        .unwrap();
        (doc.id, draft, uri)
    }
    fn rename_input(&self, old: &Path, new: &Path, kind: file_index::EntryKind) -> RenameInput {
        RenameInput::new(
            cap(old.parent().unwrap()),
            Path::new(old.file_name().unwrap()),
            Path::new(new.file_name().unwrap()),
            old,
            new,
            kind,
        )
        .unwrap()
    }
    fn plan(&self, input: &RenameInput) -> ImageBindingLocationPlan {
        ImageBindingLocationPlan::prepare_at(Arc::clone(&self.root), &self.storage, input).unwrap()
    }
    fn assert_cold(&self, path: &Path, uri: &str) {
        let mut restarted = DocumentService::new();
        let doc = restarted.open_authorized(path).unwrap();
        restore_aliases_at(
            Arc::clone(&self.root),
            &self.storage,
            &mut restarted,
            &doc.id,
        )
        .unwrap();
        let alias = restarted
            .resolve_image_alias(&doc.id, uri)
            .unwrap()
            .unwrap();
        assert_eq!(restarted.image(&alias.token).unwrap().bytes.as_ref(), IMAGE);
        let record = current_binding(&self.root, &restarted, &doc.id)
            .unwrap()
            .unwrap();
        assert_eq!(record.recovery_history.len(), 1);
    }
}

#[test]
fn open_and_closed_no_copy_rename_save_and_undo_keep_cold_image_grants() {
    for opened in [false, true] {
        let fixture = Fixture::new();
        let mut service = DocumentService::new();
        let (id, draft, uri) = fixture.bound(&mut service, "A.md");
        let old = fixture.left.join("A.md");
        let new = fixture.left.join("B.md");
        let original = fs::read(&old).unwrap();
        if !opened {
            service.close(&id);
            service.close_image_draft(&draft);
        }
        let input = fixture.rename_input(&old, &new, file_index::EntryKind::File);
        let location = fixture.plan(&input);
        let docs = service
            .prepare_rename(
                cap(&fixture.left),
                Path::new("A.md"),
                Path::new("B.md"),
                &old,
                &new,
                RenameKind::File,
            )
            .unwrap();
        fs::rename(&old, &new).unwrap();
        docs.commit();
        assert!(location.commit().is_empty());
        fixture.assert_cold(&new, &uri);
        if opened {
            let before = before_save_at(&fixture.root, &service, &id).unwrap();
            let raw = format!("![own]({uri})\r\nchanged\n");
            service.save(&id, &raw).unwrap();
            after_save_at(&fixture.root, &service, &id, before).unwrap();
        }
        let back = fixture.rename_input(&new, &old, file_index::EntryKind::File);
        let location = fixture.plan(&back);
        let docs = service
            .prepare_rename(
                cap(&fixture.left),
                Path::new("B.md"),
                Path::new("A.md"),
                &new,
                &old,
                RenameKind::File,
            )
            .unwrap();
        fs::rename(&new, &old).unwrap();
        docs.commit();
        assert!(location.commit().is_empty());
        drop(service);
        fixture.assert_cold(&old, &uri);
        if !opened {
            assert_eq!(fs::read(&old).unwrap(), original);
        }
    }
}

#[test]
fn directory_rename_handles_closed_descendants_and_ignores_old_tombstone_keys() {
    let fixture = Fixture::new();
    let mut service = DocumentService::new();
    let (id, draft, uri) = fixture.bound(&mut service, "A.md");
    service.close(&id);
    service.close_image_draft(&draft);
    let a = fixture.left.join("A.md");
    let b = fixture.left.join("B.md");
    let first = fixture.plan(&fixture.rename_input(&a, &b, file_index::EntryKind::File));
    fs::rename(&a, &b).unwrap();
    assert!(first.commit().is_empty());
    let moved = fixture.left.with_file_name("renamed-directory");
    let plan = fixture.plan(&fixture.rename_input(
        &fixture.left,
        &moved,
        file_index::EntryKind::Directory,
    ));
    // Closed bindings keep identity metadata, not live directory capabilities.
    fs::rename(&fixture.left, &moved).unwrap();
    assert!(plan.commit().is_empty());
    fixture.assert_cold(&moved.join("B.md"), &uri);
}

#[test]
fn cancelled_replaced_and_mutated_record_plans_never_grant_the_new_path() {
    let fixture = Fixture::new();
    let mut service = DocumentService::new();
    let (_id, _draft, _uri) = fixture.bound(&mut service, "A.md");
    let old = fixture.left.join("A.md");
    let new = fixture.left.join("B.md");
    drop(fixture.plan(&fixture.rename_input(&old, &new, file_index::EntryKind::File)));
    assert!(!fixture.root.exists(binding_name(&new)));
    let plan = fixture.plan(&fixture.rename_input(&old, &new, file_index::EntryKind::File));
    fs::rename(&old, &new).unwrap();
    let contents = fs::read(&new).unwrap();
    fs::write(fixture.left.join("foreign"), &contents).unwrap();
    fs::rename(fixture.left.join("foreign"), &new).unwrap();
    assert!(!plan.commit().is_empty());
    assert!(!fixture.root.exists(binding_name(&new)));
    fs::rename(&new, &old).unwrap();
    let plan = fixture.plan(&fixture.rename_input(&old, &new, file_index::EntryKind::File));
    assert!(plan.changes.is_empty()); // Same-byte new entity is no old authority.
    drop(plan);
}

#[test]
fn a_changed_record_or_uncertain_publication_is_not_retargeted() {
    let fixture = Fixture::new();
    let mut service = DocumentService::new();
    let (_id, _draft, _uri) = fixture.bound(&mut service, "A.md");
    let old = fixture.left.join("A.md");
    let new = fixture.left.join("B.md");
    let plan = fixture.plan(&fixture.rename_input(&old, &new, file_index::EntryKind::File));
    let mut record: Binding = read_record(&fixture.root, &binding_name(&old))
        .unwrap()
        .unwrap();
    record.recovery_history.clear();
    write_record(&fixture.root, &binding_name(&old), &record).unwrap();
    fs::rename(&old, &new).unwrap();
    assert!(!plan.commit().is_empty());
    assert!(!fixture.root.exists(binding_name(&new)));
    fs::rename(&new, &old).unwrap();
    let plan = fixture.plan(&fixture.rename_input(&old, &new, file_index::EntryKind::File));
    fs::rename(&old, &new).unwrap();
    drop(plan); // Native uncertain/cancel has no success callback.
    assert!(!fixture.root.exists(binding_name(&new)));
}

fn movement_input(old: &Path, new: &Path, kind: RenameKind) -> RenameInput {
    let movement = crate::move_metadata::MoveMetadataInput::new(vec![NativeMoveTarget {
        source_parent: cap(old.parent().unwrap()),
        source_name: old.file_name().unwrap().into(),
        destination_parent: cap(new.parent().unwrap()),
        destination_name: new.file_name().unwrap().into(),
        source_display: old.to_owned(),
        destination_display: new.to_owned(),
        kind,
    }])
    .unwrap();
    RenameInput {
        parent: cap(old.parent().unwrap()),
        source: None,
        old_name: old.file_name().unwrap().into(),
        new_name: new.file_name().unwrap().into(),
        old: old.to_owned(),
        new: new.to_owned(),
        kind: if kind == RenameKind::File {
            file_index::EntryKind::File
        } else {
            file_index::EntryKind::Directory
        },
        movement: Some(movement),
    }
}

fn file_target(old: &Path, new: &Path) -> NativeMoveTarget {
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
fn replacement_and_undo_validate_all_old_record_keys_before_the_first_publication() {
    let fixture = Fixture::new();
    let mut service = DocumentService::new();
    let (_a, _da, uri_a) = fixture.bound(&mut service, "A.md");
    let (_b, _db, uri_b) = fixture.bound(&mut service, "B.md");
    let a = fixture.left.join("A.md");
    let b = fixture.left.join("B.md");
    let backup = fixture.right.join("retained.md");
    for (first_old, first_new, second_old, second_new) in
        [(&b, &backup, &a, &b), (&b, &a, &backup, &b)]
    {
        let specs = vec![
            file_target(first_old, first_new),
            file_target(second_old, second_new),
        ];
        let mut input = movement_input(second_old, second_new, RenameKind::File);
        input.movement = Some(crate::move_metadata::MoveMetadataInput::new(specs.clone()).unwrap());
        let mut plan = fixture.plan(&input);
        // Force the source-to-occupied-name record first, proving that another
        // candidate's captured old key is not re-read after our own overwrite.
        plan.changes
            .sort_by_key(|change| change.record.document.path() != *second_old);
        let first_handle = file(first_old);
        let second_handle = file(second_old);
        let mut documents = service.prepare_moves(specs).unwrap();
        rename_file_preserving_creation(first_old, first_new);
        rename_file_preserving_creation(second_old, second_new);
        let replacement = if first_old.exists() {
            Some(file(first_old))
        } else {
            None
        };
        let first = NativeMovePublication::verify_with_source_replacement(
            uuid::Uuid::new_v4(),
            cap(first_old.parent().unwrap()),
            Path::new(first_old.file_name().unwrap()),
            cap(first_new.parent().unwrap()),
            Path::new(first_new.file_name().unwrap()),
            RenameKind::File,
            replacement,
            vec![NativeMovePublicationEntry::from_owned_handles(
                Path::new(""),
                RenameKind::File,
                first_handle,
                file(first_new),
            )
            .unwrap()],
        )
        .unwrap();
        let second = publication(
            second_old,
            second_new,
            RenameKind::File,
            vec![NativeMovePublicationEntry::from_owned_handles(
                Path::new(""),
                RenameKind::File,
                second_handle,
                file(second_new),
            )
            .unwrap()],
        );
        documents.validate_commit(&[&first, &second]).unwrap();
        documents.commit();
        let maps = input
            .movement
            .as_ref()
            .unwrap()
            .finalize(&[&first, &second])
            .unwrap();
        let failures = plan.commit_moves(&maps, &[&first, &second]);
        assert!(failures.is_empty(), "{failures:?}");
        if first_new == &backup {
            fixture.assert_cold(&b, &uri_a);
            fixture.assert_cold(&backup, &uri_b);
        } else {
            fixture.assert_cold(&a, &uri_a);
            fixture.assert_cold(&b, &uri_b);
        }
    }
}
fn publication(
    old: &Path,
    new: &Path,
    kind: RenameKind,
    entries: Vec<NativeMovePublicationEntry>,
) -> NativeMovePublication {
    NativeMovePublication::verify(
        uuid::Uuid::new_v4(),
        cap(old.parent().unwrap()),
        Path::new(old.file_name().unwrap()),
        cap(new.parent().unwrap()),
        Path::new(new.file_name().unwrap()),
        kind,
        entries,
    )
    .unwrap()
}

#[test]
fn owned_cross_parent_move_and_undo_keep_staged_grants_but_never_foreign_relative_aliases() {
    let fixture = Fixture::new();
    let mut service = DocumentService::new();
    let (id, _draft, uri) = fixture.bound(&mut service, "A.md");
    fs::write(fixture.left.join("local.svg"), IMAGE).unwrap();
    persist_aliases_at(
        &fixture.root,
        &service,
        &id,
        vec![("old-relative.svg".into(), "local.svg".into())],
    )
    .unwrap();
    let foreign = br#"<svg xmlns="http://www.w3.org/2000/svg" width="99"/>"#;
    fs::write(fixture.right.join("local.svg"), foreign).unwrap();
    let old = fixture.left.join("A.md");
    let new = fixture.right.join("B.md");
    for (source, destination) in [(&old, &new), (&new, &old)] {
        let input = movement_input(source, destination, RenameKind::File);
        let image_plan = fixture.plan(&input);
        let held = file(source);
        let mut docs = service
            .prepare_move(
                cap(source.parent().unwrap()),
                Path::new(source.file_name().unwrap()),
                cap(destination.parent().unwrap()),
                Path::new(destination.file_name().unwrap()),
                source,
                destination,
                RenameKind::File,
            )
            .unwrap();
        fs::rename(source, destination).unwrap();
        let receipt = publication(
            source,
            destination,
            RenameKind::File,
            vec![NativeMovePublicationEntry::from_owned_handles(
                Path::new(""),
                RenameKind::File,
                held,
                file(destination),
            )
            .unwrap()],
        );
        docs.validate_commit(&receipt).unwrap();
        docs.commit();
        let maps = input
            .movement
            .as_ref()
            .unwrap()
            .finalize(&[&receipt])
            .unwrap();
        let warnings = image_plan.commit_moves(&maps, &[&receipt]);
        if source == &old {
            assert_eq!(warnings.len(), 1);
        } else {
            assert!(warnings.is_empty());
        }
        fixture.assert_cold(destination, &uri);
        let record = current_binding(&fixture.root, &service, &id)
            .unwrap()
            .unwrap();
        assert!(record.aliases.is_empty());
    }
    assert_eq!(fs::read(fixture.right.join("local.svg")).unwrap(), foreign);
}

#[test]
fn closed_copied_file_move_needs_its_owned_entity_receipt() {
    let fixture = Fixture::new();
    let mut service = DocumentService::new();
    let (id, draft, uri) = fixture.bound(&mut service, "A.md");
    service.close(&id);
    service.close_image_draft(&draft);
    let old = fixture.left.join("A.md");
    let new = fixture.right.join("B.md");
    let input = movement_input(&old, &new, RenameKind::File);
    let plan = fixture.plan(&input);
    let held = file(&old);
    fs::copy(&old, &new).unwrap();
    fs::remove_file(&old).unwrap();
    let receipt = publication(
        &old,
        &new,
        RenameKind::File,
        vec![NativeMovePublicationEntry::from_owned_handles(
            Path::new(""),
            RenameKind::File,
            held,
            file(&new),
        )
        .unwrap()],
    );
    let maps = input
        .movement
        .as_ref()
        .unwrap()
        .finalize(&[&receipt])
        .unwrap();
    assert!(plan.commit_moves(&maps, &[&receipt]).is_empty());
    fixture.assert_cold(&new, &uri);
}

#[test]
fn retained_directory_move_carries_closed_descendants_without_copying_sibling_grants() {
    let fixture = Fixture::new();
    let mut service = DocumentService::new();
    let (id, draft, uri) = fixture.bound(&mut service, "A.md");
    service.close(&id);
    service.close_image_draft(&draft);
    let old = fixture.left.clone();
    let new = fixture.right.join("moved");
    let input = movement_input(&old, &new, RenameKind::Directory);
    let plan = fixture.plan(&input);
    let held = Arc::new(File::from_std(
        cap(&old).try_clone().unwrap().into_std_file(),
    ));
    if !crate::test_support::rename_retained_directory(&old, &new) {
        drop(plan);
        fixture.assert_cold(&old.join("A.md"), &uri);
        return;
    }
    let receipt = publication(
        &old,
        &new,
        RenameKind::Directory,
        vec![NativeMovePublicationEntry::from_owned_handles(
            Path::new(""),
            RenameKind::Directory,
            held,
            Arc::new(File::from_std(
                cap(&new).try_clone().unwrap().into_std_file(),
            )),
        )
        .unwrap()],
    );
    let maps = input
        .movement
        .as_ref()
        .unwrap()
        .finalize(&[&receipt])
        .unwrap();
    assert!(plan.commit_moves(&maps, &[&receipt]).is_empty());
    fixture.assert_cold(&new.join("A.md"), &uri);
}

#[test]
fn copied_directory_without_a_leaf_entity_receipt_and_wrong_source_receipts_are_rejected() {
    let fixture = Fixture::new();
    let mut service = DocumentService::new();
    let (id, draft, _uri) = fixture.bound(&mut service, "A.md");
    service.close(&id);
    service.close_image_draft(&draft);
    let old = fixture.left.clone();
    let new = fixture.right.join("copied");
    let input = movement_input(&old, &new, RenameKind::Directory);
    let plan = fixture.plan(&input);
    let held = Arc::new(File::from_std(
        cap(&old).try_clone().unwrap().into_std_file(),
    ));
    fs::create_dir(&new).unwrap();
    fs::copy(old.join("A.md"), new.join("A.md")).unwrap();
    fs::remove_file(old.join("A.md")).unwrap();
    if cfg!(windows) {
        let error =
            fs::remove_dir(&old).expect_err("retained Windows directory must remain pinned");
        assert!(matches!(error.raw_os_error(), Some(5 | 32)), "{error}");
        assert!(old.is_dir());
        drop(plan);
        assert!(!fixture.root.exists(binding_name(&new.join("A.md"))));
    } else {
        fs::remove_dir(&old).unwrap();
        let receipt = publication(
            &old,
            &new,
            RenameKind::Directory,
            vec![NativeMovePublicationEntry::from_owned_handles(
                Path::new(""),
                RenameKind::Directory,
                held,
                Arc::new(File::from_std(
                    cap(&new).try_clone().unwrap().into_std_file(),
                )),
            )
            .unwrap()],
        );
        let maps = input
            .movement
            .as_ref()
            .unwrap()
            .finalize(&[&receipt])
            .unwrap();
        assert!(!plan.commit_moves(&maps, &[&receipt]).is_empty());
        assert!(!fixture.root.exists(binding_name(&new.join("A.md"))));
    }

    let other = Fixture::new();
    let mut service = DocumentService::new();
    let (id, draft, _uri) = other.bound(&mut service, "A.md");
    service.close(&id);
    service.close_image_draft(&draft);
    let old = other.left.join("A.md");
    let new = other.right.join("B.md");
    let input = movement_input(&old, &new, RenameKind::File);
    let plan = other.plan(&input);
    fs::copy(&old, other.left.join("unrelated.md")).unwrap();
    let wrong_source = file(&other.left.join("unrelated.md"));
    fs::rename(&old, &new).unwrap();
    let receipt = publication(
        &old,
        &new,
        RenameKind::File,
        vec![NativeMovePublicationEntry::from_owned_handles(
            Path::new(""),
            RenameKind::File,
            wrong_source,
            file(&new),
        )
        .unwrap()],
    );
    let maps = input
        .movement
        .as_ref()
        .unwrap()
        .finalize(&[&receipt])
        .unwrap();
    assert!(!plan.commit_moves(&maps, &[&receipt]).is_empty());
    assert!(!other.root.exists(binding_name(&new)));
}

#[cfg(unix)]
#[test]
fn symlinked_source_destination_or_record_never_migrates_a_binding() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let mut service = DocumentService::new();
    let (_id, _draft, _uri) = fixture.bound(&mut service, "A.md");
    let old = fixture.left.join("A.md");
    let new = fixture.left.join("B.md");
    let plan = fixture.plan(&fixture.rename_input(&old, &new, file_index::EntryKind::File));
    fs::rename(&old, &new).unwrap();
    fs::rename(&new, fixture.left.join("retained.md")).unwrap();
    symlink("retained.md", &new).unwrap();
    assert!(!plan.commit().is_empty());
    assert!(!fixture.root.exists(binding_name(&new)));
    fs::remove_file(&new).unwrap();
    fs::rename(fixture.left.join("retained.md"), &old).unwrap();
    fs::rename(&old, fixture.left.join("source-retained.md")).unwrap();
    symlink("source-retained.md", &old).unwrap();
    assert!(fixture
        .plan(&fixture.rename_input(&old, &new, file_index::EntryKind::File))
        .changes
        .is_empty());
    fs::remove_file(&old).unwrap();
    fs::rename(fixture.left.join("source-retained.md"), &old).unwrap();
    let original_record = fixture.root.read(binding_name(&old)).unwrap();
    fs::write(fixture.storage.join("external-record"), &original_record).unwrap();
    fixture.root.remove_file(binding_name(&old)).unwrap();
    symlink("external-record", fixture.storage.join(binding_name(&old))).unwrap();
    assert!(ImageBindingLocationPlan::prepare_at(
        Arc::clone(&fixture.root),
        &fixture.storage,
        &fixture.rename_input(&old, &new, file_index::EntryKind::File)
    )
    .is_err());
    assert_eq!(
        fs::read(fixture.storage.join("external-record")).unwrap(),
        original_record
    );
}
