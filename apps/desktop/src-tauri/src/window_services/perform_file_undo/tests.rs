use super::*;
use crate::window_services::{TrashRequest, TrashResolution, TrashStart};
use std::{fs, sync::Arc};

fn operation() -> String {
    uuid::Uuid::new_v4().to_string()
}
fn setup() -> (tempfile::TempDir, WindowServices, String) {
    let temp = tempfile::Builder::new()
        .prefix("marklyra-v29-trash-fixture-")
        .tempdir()
        .unwrap();
    let services = WindowServices::default();
    services.register("main").unwrap();
    services.register("editor-other").unwrap();
    let workspace = services
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .select_authorized(temp.path())
        .unwrap();
    (temp, services, workspace.id)
}
fn rename(services: &WindowServices, workspace: &str, path: &str, name: &str) {
    let entry = services
        .mutate_workspace("main", workspace, |scope| {
            scope.inspect_entry(path).map_err(|error| error.to_string())
        })
        .unwrap();
    services
        .rename_workspace_entry(
            EntryRenameRequest {
                label: "main",
                workspace_id: workspace,
                token: &entry.entry_token,
                name,
                operation_id: &operation(),
            },
            |_| Ok(()),
            |_| vec![],
        )
        .unwrap();
}
fn undo_request(services: &WindowServices, workspace: &str) -> FileUndoRequest {
    FileUndoRequest {
        label: "main".into(),
        workspace_id: workspace.into(),
        undo_token: services
            .get_file_undo("main", workspace)
            .unwrap()
            .unwrap()
            .token,
        operation_id: operation(),
    }
}
fn undo(services: &WindowServices, request: FileUndoRequest) -> FileUndoResult {
    services
        .perform_file_undo(request, |_| Ok(()), |_| vec![])
        .unwrap()
}
fn reservation(
    services: &WindowServices,
    workspace: &str,
    relative: &str,
) -> super::super::trash_entry::TrashReservation {
    let entry = services
        .mutate_workspace("main", workspace, |scope| {
            scope
                .inspect_entry(relative)
                .map_err(|error| error.to_string())
        })
        .unwrap();
    let start = services
        .reserve_trash(TrashRequest {
            label: "main".into(),
            workspace_id: workspace.into(),
            entry_token: entry.entry_token,
            operation_id: operation(),
        })
        .unwrap();
    match start {
        TrashStart::Reserved(value) => *value,
        _ => panic!(),
    }
}

#[test]
fn rename_undo_tracks_own_atomic_saves_and_all_sessions_without_a_redo() {
    let (temp, services, workspace) = setup();
    let old = temp.path().join("Old.md");
    fs::write(&old, b"\xef\xbb\xbfinitial\r\n").unwrap();
    let a = services
        .write_document("main", |service| service.open_authorized(&old))
        .unwrap();
    let b = services
        .write_document("editor-other", |service| service.open_authorized(&old))
        .unwrap();
    rename(&services, &workspace, "Old.md", "New.md");
    services
        .write_document("main", |service| service.save(&a.id, "first\r\n"))
        .unwrap();
    services
        .write_document("main", |service| service.save(&a.id, "second\r\n"))
        .unwrap();
    let saved_mtime = fs::metadata(temp.path().join("New.md"))
        .unwrap()
        .modified()
        .unwrap();
    let request = undo_request(&services, &workspace);
    let result = undo(&services, request.clone());
    assert!(matches!(
        result.resolution,
        FileUndoResolution::Committed { .. }
    ));
    assert!(services
        .get_file_undo("main", &workspace)
        .unwrap()
        .is_none());
    assert!(!temp.path().join("New.md").exists());
    assert_eq!(fs::read(&old).unwrap(), b"\xef\xbb\xbfsecond\r\n");
    assert_eq!(fs::metadata(&old).unwrap().modified().unwrap(), saved_mtime);
    for (label, document) in [("main", &a), ("editor-other", &b)] {
        let documents = services.get_documents(label).unwrap();
        let metadata = documents
            .lock()
            .unwrap()
            .get_metadata(&document.id)
            .unwrap();
        assert!(metadata.path.ends_with("/Old.md"));
        assert_eq!(metadata.metadata_revision, 2);
    }
    assert!(services
        .write_document("editor-other", |service| service.save(&b.id, "stale dirty"))
        .is_err());
    let replay = undo(&services, request);
    assert!(matches!(
        replay.resolution,
        FileUndoResolution::Committed { .. }
    ));
    assert!(replay.changes.is_none());
    services
        .write_document("main", |service| service.save(&a.id, "last\r\n"))
        .unwrap();
    assert_eq!(fs::read(&old).unwrap(), b"\xef\xbb\xbflast\r\n");
}

#[test]
fn failed_undo_is_consumed_and_never_overwrites_a_recreated_target_or_new_slot() {
    let (temp, services, workspace) = setup();
    fs::write(temp.path().join("Old.md"), b"source").unwrap();
    rename(&services, &workspace, "Old.md", "New.md");
    let request = undo_request(&services, &workspace);
    fs::write(temp.path().join("Old.md"), b"new target").unwrap();
    assert!(matches!(
        undo(&services, request.clone()).resolution,
        FileUndoResolution::Rejected { .. }
    ));
    assert!(services
        .get_file_undo("main", &workspace)
        .unwrap()
        .is_none());
    assert_eq!(fs::read(temp.path().join("Old.md")).unwrap(), b"new target");
    fs::rename(
        temp.path().join("Old.md"),
        temp.path().join("kept-target.md"),
    )
    .unwrap();
    assert!(matches!(
        undo(&services, request).resolution,
        FileUndoResolution::Rejected { .. }
    ));
    assert!(temp.path().join("New.md").exists());
    rename(&services, &workspace, "New.md", "Again.md");
    assert!(services
        .get_file_undo("main", &workspace)
        .unwrap()
        .is_some());
}

#[test]
fn equal_byte_external_replacement_is_not_a_rename_undo_source() {
    let (temp, services, workspace) = setup();
    fs::write(temp.path().join("Old.md"), b"source").unwrap();
    rename(&services, &workspace, "Old.md", "New.md");
    let request = undo_request(&services, &workspace);
    fs::rename(
        temp.path().join("New.md"),
        temp.path().join("external-original.md"),
    )
    .unwrap();
    fs::write(temp.path().join("New.md"), b"source").unwrap();
    assert!(matches!(
        undo(&services, request).resolution,
        FileUndoResolution::Rejected { .. }
    ));
    assert!(!temp.path().join("Old.md").exists());
    assert_eq!(fs::read(temp.path().join("New.md")).unwrap(), b"source");
}

#[test]
fn a_replayed_creation_receipt_does_not_clear_a_later_rename_undo() {
    let (temp, services, workspace) = setup();
    let create = operation();
    let entry = services
        .create_workspace_entry(
            "main",
            &workspace,
            &create,
            "",
            file_index::EntryKind::File,
            "md",
        )
        .unwrap();
    services
        .mutate_workspace("main", &workspace, |scope| {
            scope
                .finish_creation(&entry.entry_token)
                .map_err(|error| error.to_string())
        })
        .unwrap();
    fs::write(temp.path().join("Old.md"), "source").unwrap();
    rename(&services, &workspace, "Old.md", "New.md");
    let before = services.get_file_undo("main", &workspace).unwrap();
    services
        .create_workspace_entry(
            "main",
            &workspace,
            &create,
            "",
            file_index::EntryKind::File,
            "md",
        )
        .unwrap();
    assert_eq!(services.get_file_undo("main", &workspace).unwrap(), before);
    services
        .create_workspace_entry(
            "main",
            &workspace,
            &operation(),
            "",
            file_index::EntryKind::File,
            "md",
        )
        .unwrap();
    assert!(services
        .get_file_undo("main", &workspace)
        .unwrap()
        .is_none());
}

#[test]
fn failed_trash_preflight_has_a_terminal_receipt_and_cannot_reopen_a_confirmation() {
    let (temp, services, workspace) = setup();
    let path = temp.path().join("Untouched.md");
    fs::write(&path, b"source\r\n").unwrap();
    let request = TrashRequest {
        label: "main".into(),
        workspace_id: workspace,
        entry_token: operation(),
        operation_id: operation(),
    };
    for _ in 0..2 {
        assert!(matches!(
            services.reserve_trash(request.clone()).unwrap(),
            TrashStart::Resolved(TrashResolution::Rejected { .. })
        ));
        assert!(matches!(
            services.resolve_trash(&request).unwrap(),
            Some(TrashResolution::Rejected { .. })
        ));
    }
    assert_eq!(fs::read(path).unwrap(), b"source\r\n");
}

#[test]
fn cancelled_trash_has_one_receipt_and_preserves_the_previous_file_undo() {
    let (temp, services, workspace) = setup();
    fs::write(temp.path().join("Old.md"), "source").unwrap();
    rename(&services, &workspace, "Old.md", "New.md");
    let previous = services.get_file_undo("main", &workspace).unwrap();
    let reservation = reservation(&services, &workspace, "New.md");
    let request = reservation.request.clone();
    assert!(matches!(
        services.reserve_trash(request.clone()).unwrap(),
        TrashStart::Resolved(TrashResolution::Prepared)
    ));
    assert!(matches!(
        services.cancel_trash(reservation, None).unwrap(),
        TrashResolution::Committed { .. }
    ));
    assert!(temp.path().join("New.md").exists());
    assert_eq!(
        services.get_file_undo("main", &workspace).unwrap(),
        previous
    );
    assert!(matches!(
        services.reserve_trash(request).unwrap(),
        TrashStart::Resolved(TrashResolution::Committed { .. })
    ));
}

#[cfg(target_os = "macos")]
#[test]
fn system_trash_keeps_drafts_and_save_as_then_restore_only_rebinds_remaining_original_sessions() {
    let (temp, services, workspace) = setup();
    let name = "marklyra-v29-trash-fixture-note.md";
    let path = temp.path().join(name);
    let raw = b"\xef\xbb\xbfAlpha\r\n\r\nTail  \n";
    fs::write(&path, raw).unwrap();
    let a = services
        .write_document("main", |service| service.open_authorized(&path))
        .unwrap();
    let b = services
        .write_document("editor-other", |service| service.open_authorized(&path))
        .unwrap();
    let target = reservation(&services, &workspace, name);
    let request = target.request.clone();
    let result = services.perform_trash(target, vec![], false).unwrap();
    assert!(matches!(
        result.resolution,
        TrashResolution::Committed { .. }
    ));
    assert!(!path.exists());
    for (label, document) in [("main", &a), ("editor-other", &b)] {
        let docs = services.get_documents(label).unwrap();
        let mut docs = docs.lock().unwrap();
        assert_eq!(
            docs.get_metadata(&document.id).unwrap().location_state,
            document_service::DocumentLocationState::Trashed
        );
        assert!(docs.save(&document.id, "dirty").is_err());
    }
    let saved_as = services
        .write_document("main", |service| {
            service.save_as_authorized(
                &temp.path().join("separate.md"),
                "own draft\r\n",
                Some(&a.id),
            )
        })
        .unwrap();
    services
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .close(&a.id);
    let result = undo(&services, undo_request(&services, &workspace));
    assert!(matches!(
        result.resolution,
        FileUndoResolution::Committed { .. }
    ));
    assert_eq!(fs::read(&path).unwrap(), raw);
    let other = services.get_documents("editor-other").unwrap();
    assert_eq!(
        other
            .lock()
            .unwrap()
            .get_metadata(&b.id)
            .unwrap()
            .location_state,
        document_service::DocumentLocationState::Available
    );
    assert!(services
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .get_metadata(&saved_as.id)
        .unwrap()
        .path
        .ends_with("/separate.md"));
    assert_eq!(
        fs::read(temp.path().join("separate.md")).unwrap(),
        b"\xef\xbb\xbfown draft\r\n"
    );
    assert!(matches!(
        services.resolve_trash(&request).unwrap(),
        Some(TrashResolution::Committed { .. })
    ));
    assert!(services
        .get_file_undo("main", &workspace)
        .unwrap()
        .is_none());
}

#[cfg(target_os = "macos")]
#[test]
fn system_folder_trash_closes_mounts_but_restores_original_documents_without_reviving_tokens() {
    let (temp, services, workspace) = setup();
    let name = "marklyra-v29-trash-fixture-folder";
    let folder = temp.path().join(name);
    fs::create_dir_all(folder.join("nested")).unwrap();
    fs::write(folder.join("nested/note.md"), b"Alpha\r\nTail  \n").unwrap();
    let inner_registry = services.get_workspaces("editor-other").unwrap();
    let inner = inner_registry
        .lock()
        .unwrap()
        .select_authorized(&folder)
        .unwrap();
    let retained = inner_registry.lock().unwrap().get(&inner.id).unwrap();
    let document = services
        .open_workspace_document("editor-other", &inner.id, "nested/note.md", None)
        .unwrap();
    let creation_operation = operation();
    let pending = services
        .create_workspace_entry(
            "main",
            &workspace,
            &creation_operation,
            &format!("{name}/nested"),
            file_index::EntryKind::File,
            "md",
        )
        .unwrap();
    let result = services
        .perform_trash(reservation(&services, &workspace, name), vec![], false)
        .unwrap();
    assert!(matches!(
        result.resolution,
        TrashResolution::Committed { .. }
    ));
    assert_eq!(result.removed_roots.len(), 1);
    assert!(inner_registry.lock().unwrap().get(&inner.id).is_err());
    assert!(retained.list_directory("").is_err());
    let slot = services.get_file_undo("main", &workspace).unwrap();
    let replay = services
        .create_workspace_entry(
            "main",
            &workspace,
            &creation_operation,
            &format!("{name}/nested"),
            file_index::EntryKind::File,
            "md",
        )
        .unwrap();
    assert_eq!(replay, pending);
    assert_eq!(services.get_file_undo("main", &workspace).unwrap(), slot);
    assert!(matches!(
        undo(&services, undo_request(&services, &workspace)).resolution,
        FileUndoResolution::Committed { .. }
    ));
    assert!(folder.join("nested/note.md").exists());
    assert!(inner_registry.lock().unwrap().get(&inner.id).is_err());
    assert!(retained.list_directory("").is_err());
    let outer = services
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .get(&workspace)
        .unwrap();
    assert!(outer
        .prepare_creation_rename(&pending.entry_token, "late.md")
        .is_err());
    let replay = services
        .create_workspace_entry(
            "main",
            &workspace,
            &creation_operation,
            &format!("{name}/nested"),
            file_index::EntryKind::File,
            "md",
        )
        .unwrap();
    assert_eq!(replay, pending);
    assert!(outer
        .prepare_creation_rename(&replay.entry_token, "revived.md")
        .is_err());
    assert!(folder.join("nested/Untitled.md").exists());
    assert!(!folder.join("nested/revived.md").exists());
    let docs = services.get_documents("editor-other").unwrap();
    assert_eq!(
        docs.lock()
            .unwrap()
            .get_metadata(&document.id)
            .unwrap()
            .location_state,
        document_service::DocumentLocationState::Available
    );
    services
        .write_document("editor-other", |service| {
            service.save(&document.id, &document.text)
        })
        .unwrap();
    assert_eq!(
        fs::read(folder.join("nested/note.md")).unwrap(),
        b"Alpha\r\nTail  \n"
    );
    assert!(Arc::ptr_eq(
        &outer,
        &services
            .get_workspaces("main")
            .unwrap()
            .lock()
            .unwrap()
            .get(&workspace)
            .unwrap()
    ));
}

#[cfg(target_os = "macos")]
#[test]
fn a_document_opened_inside_the_trashed_folder_follows_restore_and_keeps_own_save_provenance() {
    let (temp, services, workspace) = setup();
    let name = "marklyra-v29-trash-fixture-opened-folder";
    let folder = temp.path().join(name);
    fs::create_dir_all(folder.join("nested/images")).unwrap();
    fs::write(folder.join("nested/note.md"), b"Alpha\r\nTail  \n").unwrap();
    fs::write(
        folder.join("nested/images/pixel.svg"),
        br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#,
    )
    .unwrap();
    let original = services
        .write_document("editor-other", |service| {
            service.open_authorized(&folder.join("nested/note.md"))
        })
        .unwrap();
    assert!(matches!(
        services
            .perform_trash(reservation(&services, &workspace, name), vec![], false)
            .unwrap()
            .resolution,
        TrashResolution::Committed { .. }
    ));
    let trash_root = services
        .file_undo
        .lock()
        .unwrap()
        .trash_source_for_test()
        .unwrap();
    // This represents a second explicit native open of our own actual Trash
    // endpoint; no renderer receives that path or filesystem capability.
    let opened = services
        .write_document("main", |service| {
            service.open_authorized(&trash_root.join("nested/note.md"))
        })
        .unwrap();
    let image = services
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .resolve_image(&opened.id, "images/pixel.svg")
        .unwrap();
    services
        .write_document("main", |service| {
            service.save(&opened.id, "Changed in Trash\r\n")
        })
        .unwrap();
    assert!(matches!(
        undo(&services, undo_request(&services, &workspace)).resolution,
        FileUndoResolution::Committed { .. }
    ));
    let main = services.get_documents("main").unwrap();
    let metadata = main.lock().unwrap().get_metadata(&opened.id).unwrap();
    assert_eq!(
        metadata.path,
        fs::canonicalize(folder.join("nested/note.md"))
            .unwrap()
            .to_string_lossy()
    );
    assert_eq!(
        metadata.location_state,
        document_service::DocumentLocationState::Available
    );
    assert!(main.lock().unwrap().image(&image.token).is_some());
    main.lock()
        .unwrap()
        .resolve_image(&opened.id, "images/pixel.svg")
        .unwrap();
    assert!(services
        .write_document("editor-other", |service| service
            .save(&original.id, "stale original draft"))
        .is_err());
    let saved = services
        .write_document("main", |service| {
            service.save(&opened.id, "After Restore\r\n")
        })
        .unwrap();
    assert_eq!(saved.path, metadata.path);
    assert_eq!(
        fs::read(folder.join("nested/note.md")).unwrap(),
        b"After Restore\r\n"
    );
    assert!(!trash_root.exists());
}

#[cfg(target_os = "macos")]
#[test]
fn single_trash_file_without_publication_proof_stays_rejected_before_moving() {
    let (temp, services, workspace) = setup();
    let name = "marklyra-v29-trash-fixture-file-alias.md";
    let path = temp.path().join(name);
    fs::write(&path, b"own test source\r\n").unwrap();
    assert!(matches!(
        services
            .perform_trash(reservation(&services, &workspace, name), vec![], false)
            .unwrap()
            .resolution,
        TrashResolution::Committed { .. }
    ));
    let placement = services
        .file_undo
        .lock()
        .unwrap()
        .trash_placement_for_test()
        .unwrap();
    services
        .file_undo
        .lock()
        .unwrap()
        .discard_trash_file_lease_for_test();
    let opened = services
        .write_document("main", |service| {
            service.open_authorized(placement.display_path())
        })
        .unwrap();
    let result = undo(&services, undo_request(&services, &workspace));
    assert!(matches!(
        result.resolution,
        FileUndoResolution::Rejected { .. }
    ));
    assert!(!path.exists());
    assert!(placement.display_path().is_file());
    assert!(services
        .get_file_undo("main", &workspace)
        .unwrap()
        .is_none());
    let saved = services
        .write_document("main", |service| service.save(&opened.id, &opened.text))
        .unwrap();
    assert_eq!(saved.path, placement.display_path().to_string_lossy());
    services
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .close(&opened.id);
    // Clean only this test-owned item using its retained native receipt. This
    // is not another application Undo and does not revive the consumed slot.
    crate::platform::trash::restore(&placement).unwrap();
    assert_eq!(fs::read(&path).unwrap(), b"own test source\r\n");
}

#[cfg(target_os = "macos")]
#[test]
fn actual_single_trash_alias_restores_own_publications_even_after_its_window_closes() {
    for close_alias in [false, true] {
        let (temp, services, workspace) = setup();
        let name = "marklyra-file-alias.md";
        let path = temp.path().join(name);
        fs::write(&path, b"\xef\xbb\xbfAlpha\r\nTail  \n").unwrap();
        let a = services
            .write_document("main", |store| store.open_authorized(&path))
            .unwrap();
        let trash_request = reservation(&services, &workspace, name);
        assert!(matches!(
            services
                .perform_trash(trash_request, vec![], true)
                .unwrap()
                .resolution,
            TrashResolution::Committed { .. }
        ));
        let source = services
            .file_undo
            .lock()
            .unwrap()
            .trash_source_for_test()
            .unwrap();
        let b = services
            .write_document("editor-other", |store| store.open_authorized(&source))
            .unwrap();
        services
            .write_document("editor-other", |store| store.save(&b.id, "B own\r\n"))
            .unwrap();
        if close_alias {
            services.remove("editor-other").unwrap();
            assert!(services.get_documents("editor-other").is_err());
        }
        let request = undo_request(&services, &workspace);
        let result = undo(&services, request.clone());
        assert!(
            matches!(result.resolution, FileUndoResolution::Committed { .. }),
            "{:?}",
            result.resolution
        );
        assert!(!source.exists());
        assert_eq!(fs::read(&path).unwrap(), b"\xef\xbb\xbfB own\r\n");
        let actual = fs::canonicalize(&path).unwrap();
        assert_eq!(
            services
                .get_documents("main")
                .unwrap()
                .lock()
                .unwrap()
                .get_metadata(&a.id)
                .unwrap()
                .path,
            actual.to_string_lossy()
        );
        assert!(services
            .write_document("main", |store| store.save(&a.id, "A stale dirty"))
            .is_err());
        if !close_alias {
            let saved = services
                .write_document("editor-other", |store| store.save(&b.id, "B after\n"))
                .unwrap();
            assert_eq!(saved.path, actual.to_string_lossy());
            assert_eq!(fs::read(&path).unwrap(), b"\xef\xbb\xbfB after\n");
        }
        let replay = undo(&services, request);
        assert!(matches!(
            replay.resolution,
            FileUndoResolution::Committed { .. }
        ));
        assert!(services
            .get_file_undo("main", &workspace)
            .unwrap()
            .is_none());
    }
}

#[cfg(target_os = "macos")]
#[test]
fn proven_single_file_alias_cannot_restore_over_an_equal_byte_new_occupant() {
    let (temp, services, workspace) = setup();
    let name = "marklyra-occupied-alias.md";
    let path = temp.path().join(name);
    let bytes = b"\xef\xbb\xbfOwn\r\nTail  \n";
    fs::write(&path, bytes).unwrap();
    let a = services
        .write_document("main", |store| store.open_authorized(&path))
        .unwrap();
    assert!(matches!(
        services
            .perform_trash(reservation(&services, &workspace, name), vec![], true)
            .unwrap()
            .resolution,
        TrashResolution::Committed { .. }
    ));
    let placement = services
        .file_undo
        .lock()
        .unwrap()
        .trash_placement_for_test()
        .unwrap();
    let source = placement.display_path().to_owned();
    let b = services
        .write_document("editor-other", |store| store.open_authorized(&source))
        .unwrap();
    // Byte equality is not target identity or permission to replace a newly
    // created entry. Retain the source handle so inode reuse cannot confuse it.
    let occupant = fs::File::create_new(&path).unwrap();
    use std::io::Write;
    (&occupant).write_all(bytes).unwrap();
    let occupant_identity = same_file::Handle::from_file(occupant.try_clone().unwrap()).unwrap();
    let request = undo_request(&services, &workspace);
    let result = undo(&services, request.clone());
    assert!(matches!(
        result.resolution,
        FileUndoResolution::Rejected { .. }
    ));
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert_eq!(
        same_file::Handle::from_path(&path).unwrap(),
        occupant_identity
    );
    assert_eq!(fs::read(&source).unwrap(), bytes);
    assert_eq!(
        services
            .get_documents("main")
            .unwrap()
            .lock()
            .unwrap()
            .get_metadata(&a.id)
            .unwrap()
            .location_state,
        document_service::DocumentLocationState::Trashed
    );
    assert_eq!(
        services
            .get_documents("editor-other")
            .unwrap()
            .lock()
            .unwrap()
            .get_metadata(&b.id)
            .unwrap()
            .path,
        source.to_string_lossy()
    );
    assert!(services
        .write_document("main", |store| store.save(&a.id, "A dirty"))
        .is_err());
    let replay = undo(&services, request);
    assert_eq!(replay.resolution, result.resolution);
    assert!(services
        .get_file_undo("main", &workspace)
        .unwrap()
        .is_none());
    assert_eq!(
        same_file::Handle::from_path(&path).unwrap(),
        occupant_identity
    );
    services
        .get_documents("editor-other")
        .unwrap()
        .lock()
        .unwrap()
        .close(&b.id);
    // Cleanup only this disposable counterexample via its retained native
    // placement; this is not a product Undo or a resurrected file-Undo token.
    drop(occupant);
    fs::remove_file(&path).unwrap();
    crate::platform::trash::restore(&placement).unwrap();
    assert_eq!(fs::read(&path).unwrap(), bytes);
}

#[cfg(windows)]
#[test]
fn windows_folder_trash_with_listed_children_moves_to_the_recycle_bin() {
    let (temp, services, workspace) = setup();
    let name = "marklyra-trash-fixture-folder";
    let folder = temp.path().join(name);
    fs::create_dir_all(folder.join("nested")).unwrap();
    fs::write(folder.join("nested/note.md"), b"Alpha\r\n").unwrap();
    // The sidebar lists the folder and its child before the user deletes it.
    services
        .mutate_workspace("main", &workspace, |scope| {
            scope.list_directory(name).map_err(|e| e.to_string())?;
            scope
                .list_directory(&format!("{name}/nested"))
                .map_err(|e| e.to_string())
        })
        .unwrap();
    let result = services
        .perform_trash(reservation(&services, &workspace, name), vec![], false)
        .unwrap();
    assert!(
        matches!(result.resolution, TrashResolution::Committed { .. }),
        "{:?}",
        result.resolution
    );
    assert!(!folder.exists());
}

#[cfg(windows)]
#[test]
fn windows_file_trash_then_undo_restores_the_file() {
    let (temp, services, workspace) = setup();
    let name = "marklyra-trash-fixture-note.md";
    let path = temp.path().join(name);
    fs::write(&path, b"Alpha\r\n").unwrap();
    let result = services
        .perform_trash(reservation(&services, &workspace, name), vec![], false)
        .unwrap();
    assert!(
        matches!(result.resolution, TrashResolution::Committed { .. }),
        "{:?}",
        result.resolution
    );
    assert!(!path.exists());
    let request = undo_request(&services, &workspace);
    let restored = undo(&services, request);
    assert!(
        matches!(restored.resolution, FileUndoResolution::Committed { .. }),
        "{}",
        match &restored.resolution {
            FileUndoResolution::Rejected { message } => message.clone(),
            FileUndoResolution::MutationUncertain => "MutationUncertain".into(),
            _ => "unexpected".into(),
        }
    );
    assert_eq!(fs::read(&path).unwrap(), b"Alpha\r\n");
}

#[cfg(windows)]
#[test]
fn windows_rename_of_a_listed_folder_and_a_file_then_undo() {
    let (temp, services, workspace) = setup();
    fs::create_dir_all(temp.path().join("Old/nested")).unwrap();
    fs::write(temp.path().join("Old/nested/note.md"), b"child").unwrap();
    fs::write(temp.path().join("a.md"), b"file").unwrap();
    services
        .mutate_workspace("main", &workspace, |scope| {
            scope.list_directory("Old").map_err(|e| e.to_string())?;
            scope
                .list_directory("Old/nested")
                .map_err(|e| e.to_string())
        })
        .unwrap();
    rename(&services, &workspace, "Old", "New");
    assert_eq!(
        fs::read(temp.path().join("New/nested/note.md")).unwrap(),
        b"child"
    );
    rename(&services, &workspace, "a.md", "b.md");
    assert_eq!(fs::read(temp.path().join("b.md")).unwrap(), b"file");
    let request = undo_request(&services, &workspace);
    undo(&services, request);
    assert_eq!(fs::read(temp.path().join("a.md")).unwrap(), b"file");
}
