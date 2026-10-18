use super::*;
use crate::rename_metadata::RenameInput;
use cap_std::fs::Dir;
use file_index::EntryKind;
use std::{fs, path::Path};

fn setup() -> (tempfile::TempDir, RenameInput, Session, Stored) {
    let root = tempfile::tempdir().unwrap();
    let parent = fs::canonicalize(root.path()).unwrap();
    fs::create_dir(parent.join("old")).unwrap();
    fs::write(parent.join("old/note.md"), b"\xef\xbb\xbfsource\r\n ").unwrap();
    let book = DirectoryBookmark::from_native_selection(&parent.join("old")).unwrap();
    let mut documents = document_service::DocumentService::new();
    let doc = documents
        .open_authorized(&parent.join("old/note.md"))
        .unwrap();
    let session = Session {
        document: Some(documents.bookmark(&doc.id).unwrap()),
        workspace: Some(book.clone()),
        ..Session::default()
    };
    let state = Stored {
        archive: vec![session.clone()],
        pin_folder: Some(book),
        restore_when_launch: 3,
        ..Default::default()
    };
    let input = RenameInput::new(
        Arc::new(Dir::open_ambient_dir(&parent, cap_std::ambient_authority()).unwrap()),
        Path::new("old"),
        Path::new("new"),
        &parent.join("old"),
        &parent.join("new"),
        EntryKind::Directory,
    )
    .unwrap();
    (root, input, session, state)
}
fn assert_rebound(session: &Session, input: &RenameInput) {
    let doc = session.document.as_ref().unwrap();
    assert!(doc.path().starts_with(&input.new));
    assert!(doc.is_available());
    let directory = session.workspace.as_ref().unwrap();
    assert_eq!(directory.path(), input.new);
    directory.reopen().unwrap();
}

#[test]
fn live_pending_released_quit_batch_archive_and_pin_all_keep_verified_references() {
    let (_root, input, session, state) = setup();
    let host = StartupHost::default();
    host.set_bootstrap("pending", checked_target(session.clone()))
        .unwrap();
    host.set_bootstrap("released", checked_target(session))
        .unwrap();
    host.begin_quit_backup().unwrap();
    let plan = host.prepare_rename_memory(&state, &input).unwrap();
    host.release("released");
    fs::rename(&input.old, &input.new).unwrap();
    host.apply_rename_memory(&plan).unwrap();
    {
        let slots = host.slots.lock().unwrap();
        let slot = slots.get("pending").unwrap();
        assert_rebound(&slot.session, &input);
        assert_rebound(&slot.pending.as_ref().unwrap().session, &input);
        assert!(!slots.contains_key("released"));
    }
    assert_rebound(
        &host.quit_batch.lock().unwrap().as_ref().unwrap()["released"].1,
        &input,
    );
    let metadata = tempfile::tempdir().unwrap();
    let store = Store::open(metadata.path()).unwrap();
    store
        .transaction(|current| {
            *current = state.clone();
            Ok(((), true))
        })
        .unwrap();
    let prefs = StartupHost::apply_rename_store(&store, &plan)
        .unwrap()
        .unwrap();
    assert_eq!(prefs.restore_when_launch, 3);
    assert_eq!(prefs.revision, 1);
    store
        .transaction(|current| {
            assert_rebound(&current.archive[0], &input);
            current.pin_folder.as_ref().unwrap().reopen().unwrap();
            Ok(((), false))
        })
        .unwrap();
    assert_eq!(
        fs::read(input.new.join("note.md")).unwrap(),
        b"\xef\xbb\xbfsource\r\n "
    );
}

#[test]
fn claimed_before_or_after_prepare_is_rearmed_and_old_publish_is_rejected() {
    for claim_before in [false, true] {
        let (_root, input, session, state) = setup();
        let host = StartupHost::default();
        let services = crate::window_services::WindowServices::default();
        services.register("main").unwrap();
        host.set_bootstrap("main", checked_target(session)).unwrap();
        let early = claim_before.then(|| commands::claim_startup(&host, "main").unwrap());
        let plan = host.prepare_rename_memory(&state, &input).unwrap();
        let old_claim = early.unwrap_or_else(|| commands::claim_startup(&host, "main").unwrap());
        // Exercise old restore after it has created its actual native sessions,
        // then perform the filesystem move and metadata handoff before publish.
        assert!(
            commands::restore_target(&host, &services, "main", old_claim, || {
                fs::rename(&input.old, &input.new).unwrap();
                host.apply_rename_memory(&plan).unwrap();
            })
            .is_err()
        );
        let next = commands::claim_startup(&host, "main").unwrap();
        assert_rebound(&next.2.session, &input);
        let restored = commands::restore_target(&host, &services, "main", next, || {}).unwrap();
        assert!(Path::new(&restored.document.unwrap().path).starts_with(&input.new));
        assert!(Path::new(&restored.workspace.unwrap().path).starts_with(&input.new));
    }
}

#[test]
fn a_new_user_session_or_cancelled_quit_batch_is_never_restored_from_old_plan() {
    let (_root, input, session, state) = setup();
    let host = StartupHost::default();
    host.set_bootstrap("main", checked_target(session)).unwrap();
    host.begin_quit_backup().unwrap();
    let plan = host.prepare_rename_memory(&state, &input).unwrap();
    {
        let mut slots = host.slots.lock().unwrap();
        let slot = slots.get_mut("main").unwrap();
        slot.serial += 1;
        slot.session = Session::default();
        slot.pending = None;
        slot.claimed = None;
        slot.loading = false;
        slot.consumed = true;
    }
    host.end_quit_backup();
    fs::rename(&input.old, &input.new).unwrap();
    host.apply_rename_memory(&plan).unwrap();
    assert!(host.slots.lock().unwrap()["main"].session.empty());
    assert!(host.quit_batch.lock().unwrap().is_none());
}

#[test]
fn store_cas_preserves_new_pin_choice_and_cleared_archive() {
    let (root, input, session, state) = setup();
    let host = StartupHost::default();
    host.set_bootstrap("main", checked_target(session)).unwrap();
    let plan = host.prepare_rename_memory(&state, &input).unwrap();
    let other = root.path().join("other");
    fs::create_dir(&other).unwrap();
    let selected = DirectoryBookmark::from_native_selection(&other).unwrap();
    let metadata = tempfile::tempdir().unwrap();
    let store = Store::open(metadata.path()).unwrap();
    store
        .transaction(|current| {
            *current = state.clone();
            current.pin_folder = Some(selected.clone());
            current.archive.clear();
            current.revision = 7;
            Ok(((), true))
        })
        .unwrap();
    fs::rename(&input.old, &input.new).unwrap();
    assert!(StartupHost::apply_rename_store(&store, &plan)
        .unwrap()
        .is_none());
    store
        .transaction(|current| {
            assert!(current.archive.is_empty());
            assert_eq!(current.pin_folder.as_ref(), Some(&selected));
            assert_eq!(current.revision, 7);
            Ok(((), false))
        })
        .unwrap();
}

#[test]
fn file_rename_updates_only_matching_document_basename_and_preserves_workspace() {
    let (_root, folder_input, session, mut state) = setup();
    state.pin_folder = None;
    let parent = Arc::new(folder_input.parent.open_dir("old").unwrap());
    let input = RenameInput::new(
        parent,
        Path::new("note.md"),
        Path::new("renamed.md"),
        &folder_input.old.join("note.md"),
        &folder_input.old.join("renamed.md"),
        EntryKind::File,
    )
    .unwrap();
    let host = StartupHost::default();
    host.set_bootstrap("main", checked_target(session.clone()))
        .unwrap();
    let plan = host.prepare_rename_memory(&state, &input).unwrap();
    fs::rename(&input.old, &input.new).unwrap();
    host.apply_rename_memory(&plan).unwrap();
    let slots = host.slots.lock().unwrap();
    let mapped = &slots["main"].session;
    assert_eq!(mapped.workspace, session.workspace);
    assert_eq!(mapped.document.as_ref().unwrap().path(), input.new);
    assert!(mapped.document.as_ref().unwrap().is_available());
}

#[test]
fn stale_bookmark_is_not_upgraded_by_a_path_string_and_other_references_still_move() {
    let (_root, input, session, mut state) = setup();
    // Retain an identity for a formerly different descendant, then replace it.
    fs::create_dir(input.old.join("stale")).unwrap();
    let stale = DirectoryBookmark::from_native_selection(&input.old.join("stale")).unwrap();
    fs::rename(input.old.join("stale"), input.old.join("moved-stale")).unwrap();
    fs::create_dir(input.old.join("stale")).unwrap();
    state.archive.push(Session {
        document: None,
        workspace: Some(stale.clone()),
        ..Session::default()
    });
    let host = StartupHost::default();
    host.set_bootstrap("main", checked_target(session)).unwrap();
    let plan = host.prepare_rename_memory(&state, &input).unwrap();
    assert!(!plan.warnings.is_empty());
    assert_eq!(plan.archive[1].new.workspace.as_ref(), Some(&stale));
    fs::rename(&input.old, &input.new).unwrap();
    host.apply_rename_memory(&plan).unwrap();
    assert_rebound(&host.slots.lock().unwrap()["main"].session, &input);
    assert!(stale.reopen().is_err());
}

#[test]
fn move_replace_batch_maps_both_fields_of_one_session_before_the_existing_whole_session_cas() {
    use cap_std::fs::File;
    use document_service::{
        NativeMovePublication, NativeMovePublicationEntry, NativeMoveTarget, RenameKind,
    };
    let temporary = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temporary.path()).unwrap();
    fs::create_dir(root.join("right")).unwrap();
    let old = root.join("source");
    let target = root.join("right/target");
    let backup = root.join("right/retained-target");
    for path in [&old, &target] {
        fs::create_dir_all(path.join("child")).unwrap();
        fs::write(path.join("child/note.md"), b"\xef\xbb\xbfsource\r\n ").unwrap();
    }
    let cap =
        |path: &Path| Arc::new(Dir::open_ambient_dir(path, cap_std::ambient_authority()).unwrap());
    let spec = |old: &Path, new: &Path| NativeMoveTarget {
        source_parent: cap(old.parent().unwrap()),
        source_name: old.file_name().unwrap().into(),
        destination_parent: cap(new.parent().unwrap()),
        destination_name: new.file_name().unwrap().into(),
        source_display: old.to_owned(),
        destination_display: new.to_owned(),
        kind: RenameKind::Directory,
    };
    let mut documents = document_service::DocumentService::new();
    let document = documents
        .open_authorized(&old.join("child/note.md"))
        .unwrap();
    let workspace = DirectoryBookmark::from_native_selection(&target.join("child")).unwrap();
    let session = Session {
        document: Some(documents.bookmark(&document.id).unwrap()),
        workspace: Some(workspace.clone()),
        ..Session::default()
    };
    let state = Stored {
        archive: vec![session.clone()],
        pin_folder: Some(workspace),
        ..Default::default()
    };
    let movement = crate::move_metadata::MoveMetadataInput::new(vec![
        spec(&target, &backup),
        spec(&old, &target),
    ])
    .unwrap();
    let input = RenameInput {
        parent: cap(&root),
        source: None,
        old_name: "source".into(),
        new_name: "target".into(),
        old: old.clone(),
        new: target.clone(),
        kind: EntryKind::Directory,
        movement: Some(Arc::clone(&movement)),
    };
    let host = StartupHost::default();
    host.set_bootstrap("main", checked_target(session.clone()))
        .unwrap();
    host.begin_quit_backup().unwrap();
    let mut plan = host.prepare_rename_memory(&state, &input).unwrap();
    assert!(plan.warnings.is_empty());
    assert_eq!(plan.slots[0].session.new, session);
    assert_eq!(plan.archive[0].new, session);
    let original_source = Arc::new(File::from_std(
        cap(&old).try_clone().unwrap().into_std_file(),
    ));
    let original_target = Arc::new(File::from_std(
        cap(&target).try_clone().unwrap().into_std_file(),
    ));
    fs::rename(&target, &backup).unwrap();
    fs::rename(&old, &target).unwrap();
    let current_source = Arc::new(File::from_std(
        cap(&target).try_clone().unwrap().into_std_file(),
    ));
    let current_backup = Arc::new(File::from_std(
        cap(&backup).try_clone().unwrap().into_std_file(),
    ));
    let replaced = NativeMovePublication::verify_with_source_replacement(
        uuid::Uuid::new_v4(),
        cap(target.parent().unwrap()),
        Path::new("target"),
        cap(backup.parent().unwrap()),
        Path::new("retained-target"),
        RenameKind::Directory,
        Some(Arc::clone(&current_source)),
        vec![NativeMovePublicationEntry::from_owned_handles(
            Path::new(""),
            RenameKind::Directory,
            original_target,
            current_backup,
        )
        .unwrap()],
    )
    .unwrap();
    let moved = NativeMovePublication::verify(
        uuid::Uuid::new_v4(),
        cap(&root),
        Path::new("source"),
        cap(target.parent().unwrap()),
        Path::new("target"),
        RenameKind::Directory,
        vec![NativeMovePublicationEntry::from_owned_handles(
            Path::new(""),
            RenameKind::Directory,
            original_source,
            current_source,
        )
        .unwrap()],
    )
    .unwrap();
    let mapping = movement.finalize(&[&replaced, &moved]).unwrap();
    plan.map_move_books(&mapping);
    host.apply_rename_memory(&plan).unwrap();
    let check = |value: &Session| {
        assert_eq!(
            value.document.as_ref().unwrap().path(),
            target.join("child/note.md")
        );
        assert_eq!(
            value.workspace.as_ref().unwrap().path(),
            backup.join("child")
        );
        assert!(value.document.as_ref().unwrap().probe().unwrap());
        value.workspace.as_ref().unwrap().reopen().unwrap();
    };
    {
        let slots = host.slots.lock().unwrap();
        check(&slots["main"].session);
        check(&slots["main"].pending.as_ref().unwrap().session);
    }
    check(&host.quit_batch.lock().unwrap().as_ref().unwrap()["main"].1);
    let metadata = tempfile::tempdir().unwrap();
    let store = Store::open(metadata.path()).unwrap();
    store
        .transaction(|current| {
            *current = state.clone();
            Ok(((), true))
        })
        .unwrap();
    StartupHost::apply_rename_store(&store, &plan).unwrap();
    store
        .transaction(|current| {
            check(&current.archive[0]);
            assert_eq!(
                current.pin_folder.as_ref().unwrap().path(),
                backup.join("child")
            );
            Ok(((), false))
        })
        .unwrap();
    assert_eq!(
        fs::read(target.join("child/note.md")).unwrap(),
        b"\xef\xbb\xbfsource\r\n "
    );
    assert_eq!(
        fs::read(backup.join("child/note.md")).unwrap(),
        b"\xef\xbb\xbfsource\r\n "
    );
}

#[test]
fn native_layout_refresh_does_not_cancel_verified_rename_or_restore_stale_tab_positions() {
    let (_root, input, session, state) = setup();
    let host = StartupHost::default();
    host.set_bootstrap("main", checked_target(session)).unwrap();
    let plan = host.prepare_rename_memory(&state, &input).unwrap();
    let native_tab = NativeTabRestore {
        group: 1,
        order: 0,
        selected: true,
        focused: false,
    };
    host.set_native_tab_layout(vec![("main".into(), native_tab)])
        .unwrap();
    fs::rename(&input.old, &input.new).unwrap();
    host.apply_rename_memory(&plan).unwrap();
    let slots = host.slots.lock().unwrap();
    assert_rebound(&slots["main"].session, &input);
    assert_eq!(slots["main"].session.native_tab, Some(native_tab));
    drop(slots);
    let metadata = tempfile::tempdir().unwrap();
    let store = Store::open(metadata.path()).unwrap();
    store
        .transaction(|current| {
            *current = state.clone();
            current.archive[0].native_tab = Some(native_tab);
            Ok(((), true))
        })
        .unwrap();
    StartupHost::apply_rename_store(&store, &plan).unwrap();
    store
        .transaction(|current| {
            assert_rebound(&current.archive[0], &input);
            assert_eq!(current.archive[0].native_tab, Some(native_tab));
            Ok(((), false))
        })
        .unwrap();
}
