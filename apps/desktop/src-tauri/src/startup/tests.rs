use super::*;

#[test]
fn unshown_reserved_targets_do_not_enter_quit_archive_but_existing_pending_siblings_do() {
    let root = tempfile::tempdir().unwrap();
    let host = StartupHost::default();
    let target = StartupTarget::from_workspace(
        DirectoryBookmark::from_native_selection(root.path()).unwrap(),
    )
    .unwrap();
    host.set_bootstrap_reserved("reserved", target.clone())
        .unwrap();
    host.set_bootstrap("existing-pending", target).unwrap();
    assert_eq!(host.session_snapshot().unwrap().len(), 1);
    host.begin_quit_backup().unwrap();
    host.release("reserved");
    assert_eq!(host.session_snapshot().unwrap().len(), 1);
    assert!(host.slots.lock().unwrap().get("reserved").is_none());
}

#[test]
fn publishing_a_reserved_window_enables_its_normal_closed_window_archive() {
    let root = tempfile::tempdir().unwrap();
    let host = StartupHost::default();
    let target = StartupTarget::from_workspace(
        DirectoryBookmark::from_native_selection(root.path()).unwrap(),
    )
    .unwrap();
    host.set_bootstrap_reserved("reserved", target).unwrap();
    host.begin_quit_backup().unwrap();
    assert!(host.session_snapshot().unwrap().is_empty());
    host.publish_bootstrap("reserved").unwrap();
    assert_eq!(host.session_snapshot().unwrap().len(), 1);
    host.release("reserved");
    assert_eq!(host.session_snapshot().unwrap().len(), 1);
}
use document_service::DocumentService;
use std::{fs, path::Path};

fn folder(path: &Path) -> DirectoryBookmark {
    DirectoryBookmark::from_native_selection(path).unwrap()
}
fn document(path: &Path) -> DocumentBookmark {
    let mut documents = DocumentService::new();
    let opened = documents.open_authorized(path).unwrap();
    documents.bookmark(&opened.id).unwrap()
}
fn state(mode: u8, archive: Vec<Session>) -> Stored {
    Stored {
        restore_when_launch: mode,
        archive,
        ..Default::default()
    }
}
fn fixture() -> (tempfile::TempDir, Session, Session) {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("a.md"), b"Alpha\r\nTail").unwrap();
    let directory = folder(root.path());
    let file = Session {
        document: Some(document(&root.path().join("a.md"))),
        workspace: Some(directory.clone()),
        ..Session::default()
    };
    let empty = Session {
        document: None,
        workspace: Some(directory),
        ..Session::default()
    };
    (root, file, empty)
}

#[test]
fn startup_modes_keep_original_order_sensitive_directory_rules() {
    let (_root, file, empty) = fixture();
    assert_eq!(plan(&state(0, vec![file.clone()])).len(), 1);
    assert!(plan(&state(0, vec![file.clone()]))[0].session.empty());
    assert_eq!(
        plan(&state(1, vec![file.clone(), empty.clone(), file.clone()])).len(),
        1
    );
    let forward = plan(&state(2, vec![empty.clone(), file.clone()]));
    assert_eq!(forward.len(), 2);
    assert!(forward[0].session.document.is_none());
    assert!(forward[1].session.document.is_some());
    let reverse = plan(&state(2, vec![file.clone(), empty]));
    assert_eq!(reverse.len(), 1);
    assert!(reverse[0].session.document.is_some());
    assert_eq!(plan(&state(2, vec![file.clone(), file])).len(), 2);
}

#[test]
fn tracked_locations_survive_a_process_restart_without_any_close_or_quit_backup() {
    for mode in 0..=3 {
        let (root, expected, _) = fixture();
        let original = fs::read(root.path().join("a.md")).unwrap();
        let metadata = tempfile::tempdir().unwrap();
        {
            let store = Store::open(metadata.path()).unwrap();
            store
                .transaction(|state| {
                    state.change(0, mode, expected.workspace.clone())?;
                    Ok(((), true))
                })
                .unwrap();
            let host = StartupHost::default();
            let services = crate::window_services::WindowServices::default();
            services.register("main").unwrap();
            host.set_bootstrap("main", StartupTarget::default())
                .unwrap();
            let file = services
                .get_documents("main")
                .unwrap()
                .lock()
                .unwrap()
                .open_bookmark(expected.document.as_ref().unwrap())
                .unwrap();
            let workspace = services
                .get_workspaces("main")
                .unwrap()
                .lock()
                .unwrap()
                .restore_bookmark(expected.workspace.as_ref().unwrap())
                .unwrap();
            let claim = {
                let slots = host.slots.lock().unwrap();
                (slots["main"].token, slots["main"].serial)
            };
            commands::track_session(
                &host,
                &services,
                "main",
                claim,
                Some(file.id),
                Some(workspace.id),
                |entries| write_archive(&store, entries),
            )
            .unwrap();
            // Drop every process-owned registry without a close/quit callback.
        }
        let reopened = Store::open(metadata.path()).unwrap();
        let state = reopened
            .transaction(|state| Ok((state.clone(), false)))
            .unwrap();
        assert_eq!(state.restore_when_launch, mode);
        assert_eq!(state.archive.len(), 1);
        let target = plan(&state).remove(0);
        assert_eq!(target.session.document.is_some(), mode == 2);
        assert_eq!(target.session.workspace.is_some(), mode != 0);
        let host = StartupHost::default();
        let services = crate::window_services::WindowServices::default();
        services.register("main").unwrap();
        host.set_bootstrap("main", target).unwrap();
        let claim = commands::claim_startup(&host, "main").unwrap();
        let restored = commands::restore_target(&host, &services, "main", claim, || {}).unwrap();
        assert!(restored.warnings.is_empty());
        assert_eq!(restored.document.is_some(), mode == 2);
        assert_eq!(restored.workspace.is_some(), mode != 0);
        if let Some(file) = restored.document {
            assert_eq!(file.text, "Alpha\r\nTail");
        }
        assert_eq!(fs::read(root.path().join("a.md")).unwrap(), original);
    }
}

#[test]
fn session_checkpoints_keep_the_latest_location_and_reject_foreign_window_ids() {
    let (root, expected, _) = fixture();
    fs::write(root.path().join("b.md"), "Bravo").unwrap();
    let metadata = tempfile::tempdir().unwrap();
    let store = Store::open(metadata.path()).unwrap();
    let host = StartupHost::default();
    let services = crate::window_services::WindowServices::default();
    for label in ["main", "other"] {
        services.register(label).unwrap();
        host.set_bootstrap(label, StartupTarget::default()).unwrap();
    }
    let workspace = services
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .restore_bookmark(expected.workspace.as_ref().unwrap())
        .unwrap();
    let claim = {
        let slots = host.slots.lock().unwrap();
        (slots["main"].token, slots["main"].serial)
    };
    // Opening only a directory must already be durable.
    commands::track_session(
        &host,
        &services,
        "main",
        claim,
        None,
        Some(workspace.id.clone()),
        |entries| write_archive(&store, entries),
    )
    .unwrap();
    assert!(store
        .transaction(|state| Ok((state.archive[0].document.is_none(), false)))
        .unwrap());
    for name in ["a.md", "b.md"] {
        let file = services
            .get_documents("main")
            .unwrap()
            .lock()
            .unwrap()
            .open_authorized(&root.path().join(name))
            .unwrap();
        commands::track_session(
            &host,
            &services,
            "main",
            claim,
            Some(file.id),
            Some(workspace.id.clone()),
            |entries| write_archive(&store, entries),
        )
        .unwrap();
    }
    let stored = fs::read(metadata.path().join("state.json")).unwrap();
    let other = services
        .get_documents("other")
        .unwrap()
        .lock()
        .unwrap()
        .open_authorized(&root.path().join("a.md"))
        .unwrap();
    assert!(commands::track_session(
        &host,
        &services,
        "main",
        claim,
        Some(other.id),
        Some(workspace.id),
        |_| panic!("A rejected session must never reach persistence")
    )
    .is_err());
    assert_eq!(
        fs::read(metadata.path().join("state.json")).unwrap(),
        stored
    );
    let state = Store::open(metadata.path())
        .unwrap()
        .transaction(|state| Ok((state.clone(), false)))
        .unwrap();
    assert_eq!(state.archive.len(), 1);
    assert_eq!(
        state.archive[0].document.as_ref().unwrap().path(),
        root.path().canonicalize().unwrap().join("b.md")
    );
}

#[test]
fn checkpoint_failure_is_reported_without_revoking_the_current_document() {
    let (_root, expected, _) = fixture();
    let host = StartupHost::default();
    let services = crate::window_services::WindowServices::default();
    services.register("main").unwrap();
    host.set_bootstrap("main", StartupTarget::default())
        .unwrap();
    let documents = services.get_documents("main").unwrap();
    let file = documents
        .lock()
        .unwrap()
        .open_bookmark(expected.document.as_ref().unwrap())
        .unwrap();
    let claim = {
        let slots = host.slots.lock().unwrap();
        (slots["main"].token, slots["main"].serial)
    };
    let result = commands::track_session(
        &host,
        &services,
        "main",
        claim,
        Some(file.id.clone()),
        None,
        |_| Err("Archive storage unavailable".into()),
    );
    assert_eq!(result.unwrap_err(), "Archive storage unavailable");
    assert_eq!(
        host.slots.lock().unwrap()["main"]
            .current_document_id
            .as_deref(),
        Some(file.id.as_str())
    );
    assert!(documents.lock().unwrap().bookmark(&file.id).is_ok());
}
#[test]
fn missing_file_retains_folder_but_existing_invalid_encoding_does_not() {
    let (root, file, _) = fixture();
    fs::remove_file(root.path().join("a.md")).unwrap();
    let target = plan(&state(2, vec![file.clone()]));
    assert!(target[0].session.document.is_none());
    assert!(target[0].session.workspace.is_some());
    fs::write(root.path().join("a.md"), [0xff, 0xfe, 0xff]).unwrap();
    let target = plan(&state(2, vec![file]));
    assert_eq!(target.len(), 1);
    assert!(target[0].session.empty());
    assert!(!target[0].warnings.is_empty());
}
#[test]
fn missing_workspace_does_not_revoke_an_independently_valid_file_parent() {
    let root = tempfile::tempdir().unwrap();
    let workspace = root.path().join("workspace");
    fs::create_dir(&workspace).unwrap();
    fs::write(root.path().join("a.md"), "Alpha").unwrap();
    let session = Session {
        document: Some(document(&root.path().join("a.md"))),
        workspace: Some(folder(&workspace)),
        ..Session::default()
    };
    fs::remove_dir(&workspace).unwrap();
    let targets = plan(&state(2, vec![session]));
    assert!(targets[0].session.document.is_some());
    assert!(targets[0].session.workspace.is_none());
}
#[test]
fn captured_directory_replacement_never_grants_the_new_same_path() {
    let root = tempfile::tempdir().unwrap();
    let selected = root.path().join("selected");
    fs::create_dir(&selected).unwrap();
    fs::write(selected.join("a.md"), "owned").unwrap();
    let bookmark = folder(&selected);
    let file = document(&selected.join("a.md"));
    fs::rename(&selected, root.path().join("moved")).unwrap();
    fs::create_dir(&selected).unwrap();
    fs::write(selected.join("a.md"), "replacement secret").unwrap();
    assert!(bookmark.reopen().is_err());
    assert!(DocumentService::new().open_bookmark(&file).is_err());
    assert_eq!(
        fs::read_to_string(selected.join("a.md")).unwrap(),
        "replacement secret"
    );
}
#[cfg(unix)]
#[test]
fn bookmark_symlink_replacement_is_not_a_new_grant() {
    let root = tempfile::tempdir().unwrap();
    let selected = root.path().join("selected");
    fs::create_dir(&selected).unwrap();
    let bookmark = folder(&selected);
    fs::rename(&selected, root.path().join("old")).unwrap();
    std::os::unix::fs::symlink(root.path().join("old"), &selected).unwrap();
    assert!(bookmark.reopen().is_err());
}
#[test]
fn restored_documents_keep_encoding_bom_mixed_endings_and_noop_bytes() {
    for bytes in [
        b"\xef\xbb\xbfAlpha\r\nBravo\nTail".to_vec(),
        vec![0xff, 0xfe, b'A', 0, 13, 0, 10, 0, 0x2d, 0x4e],
    ] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("a.md");
        fs::write(&path, &bytes).unwrap();
        let bookmark = document(&path);
        let mut reopened = DocumentService::new();
        let payload = reopened.open_bookmark(&bookmark).unwrap();
        let modified = fs::metadata(&path).unwrap().modified().unwrap();
        reopened.save(&payload.id, &payload.text).unwrap();
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), modified);
    }
}
#[test]
fn preferences_cas_and_archive_are_separate_and_bounded() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    store
        .transaction(|state| {
            state.change(0, 1, None)?;
            Ok(((), true))
        })
        .unwrap();
    assert!(store
        .transaction(|state| {
            state.change(0, 2, None)?;
            Ok(((), true))
        })
        .is_err());
    assert!(store
        .transaction(|state| {
            state.change(1, 4, None)?;
            Ok(((), true))
        })
        .is_err());
    assert_eq!(
        store
            .transaction(|state| Ok((state.snapshot().revision, false)))
            .unwrap(),
        1
    );
    assert!(Stored {
        archive: vec![Session::default(); 33],
        ..Default::default()
    }
    .validate()
    .is_err());
}
#[test]
fn corrupt_or_unknown_metadata_is_preserved_and_never_defaulted() {
    for bytes in [
        b"invalid".to_vec(),
        b"{\"schemaVersion\":99}".to_vec(),
        vec![b' '; 512 * 1024 + 1],
    ] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("state.json");
        fs::write(&path, &bytes).unwrap();
        let store = Store::open(root.path()).unwrap();
        assert!(store
            .transaction(|state| Ok((state.snapshot(), false)))
            .is_err());
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
}
#[cfg(unix)]
#[test]
fn metadata_symlink_and_hardlink_targets_are_preserved() {
    for symbolic in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("state.json");
        let other = root.path().join("evidence");
        fs::write(&other, b"untouched").unwrap();
        if symbolic {
            std::os::unix::fs::symlink(&other, &path).unwrap();
        } else {
            fs::hard_link(&other, &path).unwrap();
        }
        let store = Store::open(root.path()).unwrap();
        assert!(store
            .transaction(|state| {
                state.change(0, 1, None)?;
                Ok(((), true))
            })
            .is_err());
        assert_eq!(fs::read(other).unwrap(), b"untouched");
    }
}
#[test]
fn pending_limit_prevents_ack_and_preserves_evidence() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    for index in 0..8 {
        fs::write(root.path().join(format!(".pending-{index}")), b"evidence").unwrap();
    }
    assert!(store
        .transaction(|state| {
            state.change(0, 1, None)?;
            Ok(((), true))
        })
        .is_err());
    assert!(!root.path().join("state.json").exists());
}
#[test]
fn bootstrap_is_bounded_once_per_registered_slot_and_release_allows_fresh_generation() {
    let host = StartupHost::default();
    host.set_bootstrap("main", StartupTarget::default())
        .unwrap();
    assert!(host
        .set_bootstrap("main", StartupTarget::default())
        .is_err());
    let before = host.slots.lock().unwrap()["main"].token;
    host.release("main");
    host.set_bootstrap("main", StartupTarget::default())
        .unwrap();
    assert_ne!(before, host.slots.lock().unwrap()["main"].token);
    for index in 1..32 {
        host.set_bootstrap(&format!("editor-{index}"), StartupTarget::default())
            .unwrap();
    }
    assert!(host
        .set_bootstrap("too-many", StartupTarget::default())
        .is_err());
}

#[test]
fn a_bootstrap_is_claimed_once_and_real_capabilities_belong_only_to_its_window() {
    let (_root, session, _) = fixture();
    let host = StartupHost::default();
    let services = crate::window_services::WindowServices::default();
    services.register("main").unwrap();
    services.register("other").unwrap();
    host.set_bootstrap("main", checked_target(session)).unwrap();
    let claim = commands::claim_startup(&host, "main").unwrap();
    assert!(commands::claim_startup(&host, "main").is_err());
    let result = commands::restore_target(&host, &services, "main", claim, || {}).unwrap();
    let document = result.document.unwrap();
    let workspace = result.workspace.unwrap();
    assert!(services
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .bookmark(&document.id)
        .is_ok());
    assert!(services
        .get_documents("other")
        .unwrap()
        .lock()
        .unwrap()
        .bookmark(&document.id)
        .is_err());
    assert!(services
        .get_workspaces("other")
        .unwrap()
        .lock()
        .unwrap()
        .get(&workspace.id)
        .is_err());
    assert!(commands::claim_startup(&host, "main").is_err());
}
#[test]
fn released_or_replaced_startup_generations_cannot_commit_late_capabilities() {
    for replace in [false, true] {
        let (_root, session, _) = fixture();
        let host = StartupHost::default();
        let services = crate::window_services::WindowServices::default();
        services.register("main").unwrap();
        host.set_bootstrap("main", checked_target(session)).unwrap();
        let claim = commands::claim_startup(&host, "main").unwrap();
        let result = commands::restore_target(&host, &services, "main", claim, || {
            host.release("main");
            if replace {
                host.set_bootstrap("main", StartupTarget::default())
                    .unwrap();
            } else {
                services.remove("main").unwrap();
            }
        });
        assert!(result.is_err());
        if replace {
            let next = commands::claim_startup(&host, "main").unwrap();
            let result = commands::restore_target(&host, &services, "main", next, || {}).unwrap();
            assert!(result.document.is_none() && result.workspace.is_none());
        }
    }
}
#[test]
fn explicit_new_session_serial_cancels_a_prepared_startup_without_overwriting_its_metadata() {
    let (_root, session, _) = fixture();
    let host = StartupHost::default();
    let services = crate::window_services::WindowServices::default();
    services.register("main").unwrap();
    host.set_bootstrap("main", checked_target(session)).unwrap();
    let claim = commands::claim_startup(&host, "main").unwrap();
    assert!(
        commands::restore_target(&host, &services, "main", claim, || {
            let mut slots = host.slots.lock().unwrap();
            let slot = slots.get_mut("main").unwrap();
            slot.serial += 1;
            slot.loading = false;
            slot.consumed = true;
            slot.session = Session::default();
        })
        .is_err()
    );
    assert!(host.slots.lock().unwrap()["main"].session.empty());
}
#[test]
fn an_empty_backup_does_not_erase_the_previous_nonempty_archive() {
    let (_root, session, _) = fixture();
    let metadata = tempfile::tempdir().unwrap();
    let store = Store::open(metadata.path()).unwrap();
    write_archive(&store, vec![session.clone()]).unwrap();
    let bytes = fs::read(metadata.path().join("state.json")).unwrap();
    write_archive(&store, Vec::new()).unwrap();
    assert_eq!(fs::read(metadata.path().join("state.json")).unwrap(), bytes);
    assert_eq!(
        store
            .transaction(|state| Ok((state.archive.len(), false)))
            .unwrap(),
        1
    );
}
#[test]
fn only_initial_custom_mode_has_the_missing_folder_prompt_marker() {
    let root = tempfile::tempdir().unwrap();
    let bookmark = folder(root.path());
    let state = Stored {
        restore_when_launch: 3,
        pin_folder: Some(bookmark.clone()),
        ..Default::default()
    };
    assert!(plan(&state)[0].is_initial_custom_folder());
    assert!(!checked_target(Session {
        document: None,
        workspace: Some(bookmark),
        ..Session::default()
    })
    .is_initial_custom_folder());
}

#[test]
fn pending_windows_are_kept_in_creation_order_when_another_window_is_closed() {
    let (_root, file, empty) = fixture();
    let host = StartupHost::default();
    host.set_bootstrap("z-created-first", checked_target(file.clone()))
        .unwrap();
    host.set_bootstrap("a-created-later", checked_target(empty.clone()))
        .unwrap();
    let sessions = host.session_snapshot().unwrap();
    assert_eq!(sessions.len(), 2);
    assert_eq!(sessions[0].document, file.document);
    assert_eq!(sessions[1].workspace, empty.workspace);
    let claim = commands::claim_startup(&host, "z-created-first").unwrap();
    assert_eq!(host.session_snapshot().unwrap().len(), 2);
    drop(claim);
}

#[test]
fn quit_backup_retains_released_windows_and_merges_survivors_latest_save_as_and_folder() {
    let (root, a, empty) = fixture();
    fs::write(root.path().join("new.md"), "New Saved").unwrap();
    let new_file = document(&root.path().join("new.md"));
    let host = StartupHost::default();
    host.set_bootstrap("first", checked_target(a.clone()))
        .unwrap();
    host.set_bootstrap("second", checked_target(empty.clone()))
        .unwrap();
    host.begin_quit_backup().unwrap();
    assert!(host.begin_quit_backup().is_err());
    let metadata = tempfile::tempdir().unwrap();
    let store = Store::open(metadata.path()).unwrap();
    host.checkpoint(|entries| write_archive(&store, entries))
        .unwrap();
    host.release("first");
    host.slots
        .lock()
        .unwrap()
        .get_mut("second")
        .unwrap()
        .session = Session {
        document: Some(new_file.clone()),
        workspace: None,
        ..Session::default()
    };
    host.checkpoint(|entries| write_archive(&store, entries))
        .unwrap();
    let archive = store
        .transaction(|state| Ok((state.archive.clone(), false)))
        .unwrap();
    assert_eq!(archive.len(), 2);
    assert_eq!(archive[0].document, a.document);
    assert_eq!(archive[1].document, Some(new_file));
    assert!(archive[1].workspace.is_none());
    host.slots
        .lock()
        .unwrap()
        .get_mut("second")
        .unwrap()
        .session = Session::default();
    host.checkpoint(|entries| write_archive(&store, entries))
        .unwrap();
    assert_eq!(
        store
            .transaction(|state| Ok((state.archive.len(), false)))
            .unwrap(),
        1
    );
    host.end_quit_backup();
    host.slots
        .lock()
        .unwrap()
        .get_mut("second")
        .unwrap()
        .session = empty;
    host.checkpoint(|entries| write_archive(&store, entries))
        .unwrap();
    let archive = store
        .transaction(|state| Ok((state.archive.clone(), false)))
        .unwrap();
    assert_eq!(archive.len(), 1);
    assert!(archive[0].document.is_none());
}

#[test]
fn a_real_open_failure_after_the_plan_does_not_silently_fall_back_to_a_folder() {
    let (root, session, _) = fixture();
    let target = plan(&state(2, vec![session])).remove(0);
    fs::remove_file(root.path().join("a.md")).unwrap();
    let host = StartupHost::default();
    host.set_bootstrap("main", target).unwrap();
    let services = crate::window_services::WindowServices::default();
    services.register("main").unwrap();
    let claim = commands::claim_startup(&host, "main").unwrap();
    let result = commands::restore_target(&host, &services, "main", claim, || {}).unwrap();
    assert!(result.document.is_none() && result.workspace.is_none());
    assert!(!result.warnings.is_empty());
    assert!(host.session_snapshot().unwrap().is_empty());
}

#[test]
fn dirty_window_handoff_is_transient_and_checks_the_saved_baseline() {
    let (_root, session, _) = fixture();
    let host = StartupHost::default();
    let target = StartupTarget::from_document(
        session.document.clone().unwrap(),
        session.workspace.clone().unwrap(),
    )
    .unwrap()
    .with_draft("Unsaved\r\nTail".into(), "Alpha\r\nTail".into())
    .unwrap();
    host.set_bootstrap("child", target).unwrap();
    let services = crate::window_services::WindowServices::default();
    services.register("child").unwrap();
    let claim = commands::claim_startup(&host, "child").unwrap();
    let restored = commands::restore_target(&host, &services, "child", claim, || {}).unwrap();
    assert_eq!(restored.document.as_ref().unwrap().text, "Alpha\r\nTail");
    assert_eq!(restored.draft.as_ref().unwrap().text, "Unsaved\r\nTail");
    assert!(!host.can_reuse_untitled("child").unwrap());
    let archived = serde_json::to_value(host.session_snapshot().unwrap()).unwrap();
    assert!(!archived.to_string().contains("Unsaved"));
    assert!(!archived.to_string().contains("savedText"));
}

#[test]
fn blank_window_reuse_requires_completed_native_session_without_document() {
    let host = StartupHost::default();
    host.set_bootstrap("blank", StartupTarget::default())
        .unwrap();
    assert!(!host.can_reuse_untitled("blank").unwrap());
    let services = crate::window_services::WindowServices::default();
    services.register("blank").unwrap();
    let claim = commands::claim_startup(&host, "blank").unwrap();
    commands::restore_target(&host, &services, "blank", claim, || {}).unwrap();
    assert!(host.can_reuse_untitled("blank").unwrap());
    host.release("blank");
    assert!(!host.can_reuse_untitled("blank").unwrap());
}
