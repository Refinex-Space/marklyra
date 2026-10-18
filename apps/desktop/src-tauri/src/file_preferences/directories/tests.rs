use super::*;

fn fixture(paths: &[&str]) -> Stored {
    Stored {
        folders: paths
            .iter()
            .map(|path| Folder {
                id: uuid::Uuid::new_v4().to_string(),
                path: std::env::temp_dir()
                    .join(path.trim_start_matches('/'))
                    .to_str()
                    .unwrap()
                    .into(),
                pinned: false,
                bookmark: None,
            })
            .collect(),
        ..Stored::default()
    }
}

#[test]
fn legacy_orders_are_read_without_rewriting_or_losing_any_members() {
    let mut state = fixture(&["/a", "/b", "/c"]);
    state.folders[1].pinned = true;
    let old = serde_json::to_vec(&state).unwrap();
    let catalog = catalog(&state, None);
    assert_eq!(
        catalog
            .entries
            .iter()
            .map(|entry| Path::new(&entry.path)
                .file_name()
                .unwrap()
                .to_str()
                .unwrap())
            .collect::<Vec<_>>(),
        vec!["b", "a", "c"]
    );
    assert_eq!(serde_json::to_vec(&state).unwrap(), old);
    ensure_order(&mut state);
    state.validate().unwrap();
    assert_eq!(ordering(&state).recent_ids.len(), 3);
}

#[test]
fn pin_order_is_independent_and_unpin_restores_the_original_recent_position() {
    let mut state = fixture(&["/a", "/b", "/c"]);
    let b = state.folders[1].id.clone();
    pin_state(&mut state, 0, &b, true).unwrap();
    assert_eq!(
        catalog(&state, None)
            .entries
            .iter()
            .map(|entry| Path::new(&entry.path)
                .file_name()
                .unwrap()
                .to_str()
                .unwrap())
            .collect::<Vec<_>>(),
        vec!["b", "a", "c"]
    );
    pin_state(&mut state, 1, &b, false).unwrap();
    assert_eq!(
        catalog(&state, None)
            .entries
            .iter()
            .map(|entry| Path::new(&entry.path)
                .file_name()
                .unwrap()
                .to_str()
                .unwrap())
            .collect::<Vec<_>>(),
        vec!["a", "b", "c"]
    );
    state.validate().unwrap();
}

#[test]
fn no_recent_pin_and_unpin_mutate_recent_membership_but_keep_it_hidden() {
    let mut state = fixture(&["/a", "/b"]);
    state.no_recent_files = true;
    let b = state.folders[1].id.clone();
    pin_state(&mut state, 0, &b, true).unwrap();
    assert!(!ordering(&state).recent_ids.contains(&b));
    assert_eq!(catalog(&state, None).entries.len(), 1);
    pin_state(&mut state, 1, &b, false).unwrap();
    assert_eq!(ordering(&state).recent_ids.first(), Some(&b));
    assert!(catalog(&state, None).entries.is_empty());
    state.no_recent_files = false;
    assert!(catalog(&state, None).entries[0].path.ends_with("b"));
}

fn remember(
    store: &super::super::storage::Store,
    host: &super::super::FilePreferencesHost,
    bookmark: &DirectoryBookmark,
) {
    store
        .transaction(|state| {
            let ticket = folder_ticket(host, state, host.history_request()).unwrap();
            let changed = remember_state(host, state, bookmark, ticket)?;
            Ok(((), changed))
        })
        .unwrap();
}
fn book(root: &Path) -> DirectoryBookmark {
    DirectoryBookmark::from_native_selection(root).unwrap()
}

#[test]
fn real_store_migrates_old_metadata_and_cas_mutations_do_not_touch_file_preferences() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("preferences.json");
    let state = fixture(&["/a", "/b"]);
    let a = state.folders[0].id.clone();
    let old = serde_json::to_vec(&state).unwrap();
    std::fs::write(&path, &old).unwrap();
    let store = super::super::storage::Store::open(root.path()).unwrap();
    store
        .transaction(|state| {
            assert!(state.directory_history.is_none());
            assert_eq!(catalog(state, None).entries.len(), 2);
            Ok(((), false))
        })
        .unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), old);
    store
        .transaction(|state| Ok((pin_state(state, 0, &a, true)?, true)))
        .unwrap();
    let after = std::fs::read(&path).unwrap();
    assert!(store
        .transaction(|state| Ok((pin_state(state, 0, &a, false)?, true)))
        .is_err());
    assert_eq!(std::fs::read(&path).unwrap(), after);
    store
        .transaction(|state| {
            assert_eq!(state.revision, 0);
            assert_eq!(state.default_extension, "md");
            assert!(state.directory_history.is_some());
            state.validate()?;
            Ok(((), false))
        })
        .unwrap();
}

#[test]
fn repeat_pin_moves_only_pinned_order_and_a_new_pin_without_recent_membership_disappears_on_unpin()
{
    let mut state = fixture(&["/a", "/b", "/c"]);
    let a = state.folders[0].id.clone();
    let b = state.folders[1].id.clone();
    pin_state(&mut state, 0, &a, true).unwrap();
    pin_state(&mut state, 1, &b, true).unwrap();
    let recent = ordering(&state).recent_ids;
    pin_state(&mut state, 2, &a, true).unwrap();
    assert_eq!(ordering(&state).pinned_ids, vec![a, b]);
    assert_eq!(ordering(&state).recent_ids, recent);
    let selected = tempfile::tempdir().unwrap();
    ensure_order(&mut state);
    let id = upsert(&mut state, &book(selected.path())).unwrap();
    pin_state(&mut state, 3, &id, true).unwrap();
    pin_state(&mut state, 4, &id, false).unwrap();
    assert!(!state.folders.iter().any(|entry| entry.id == id));
    state.validate().unwrap();
}

#[test]
fn pinned_reopen_does_not_move_its_old_recent_position_and_remove_deletes_both_memberships() {
    let store_root = tempfile::tempdir().unwrap();
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let store = super::super::storage::Store::open(store_root.path()).unwrap();
    let host = super::super::FilePreferencesHost::default();
    remember(&store, &host, &book(a.path()));
    remember(&store, &host, &book(b.path()));
    let (id, recent) = store
        .transaction(|state| {
            let id = state
                .folders
                .iter()
                .find(|entry| entry.path == book(a.path()).path().to_str().unwrap())
                .unwrap()
                .id
                .clone();
            let revision = ordering(state).revision;
            pin_state(state, revision, &id, true)?;
            Ok(((id, ordering(state).recent_ids), true))
        })
        .unwrap();
    remember(&store, &host, &book(a.path()));
    store
        .transaction(|state| {
            assert_eq!(ordering(state).recent_ids, recent);
            let revision = ordering(state).revision;
            remove_state(state, revision, Some(&id))?;
            assert!(!ordering(state).recent_ids.contains(&id));
            assert!(!ordering(state).pinned_ids.contains(&id));
            assert!(history_bookmark(state, &id).is_err());
            Ok(((), true))
        })
        .unwrap();
}

#[test]
fn explicit_directory_mutation_invalidates_late_folder_tickets_without_cancelling_file_recents() {
    for pin in [true, false] {
        let directory = tempfile::tempdir().unwrap();
        let mut state = fixture(&["/a"]);
        let host = super::super::FilePreferencesHost::default();
        let request = host.history_request();
        let file_ticket = host.ticket(&state, request).unwrap();
        let ticket = folder_ticket(&host, &state, request).unwrap();
        let id = state.folders[0].id.clone();
        if pin {
            pin_state(&mut state, 0, &id, true).unwrap();
        } else {
            remove_state(&mut state, 0, Some(&id)).unwrap();
        }
        let before = serde_json::to_vec(&state).unwrap();
        assert!(!remember_state(&host, &mut state, &book(directory.path()), ticket).unwrap());
        assert_eq!(serde_json::to_vec(&state).unwrap(), before);
        assert!(host.current_ticket(&state, file_ticket));
    }
}

#[test]
fn clear_and_disable_reenable_barriers_prevent_an_independent_hosts_late_folder_refill() {
    for disable in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let store = super::super::storage::Store::open(root.path()).unwrap();
        let old = super::super::FilePreferencesHost::default();
        let next = super::super::FilePreferencesHost::default();
        remember(&store, &old, &book(directory.path()));
        let ticket = store
            .transaction(|state| {
                Ok((
                    folder_ticket(&old, state, old.history_request()).unwrap(),
                    false,
                ))
            })
            .unwrap();
        if disable {
            store
                .transaction(|state| {
                    super::super::change(
                        state,
                        0,
                        super::super::PreferenceChange::NoRecentFiles(true),
                    )?;
                    super::super::change(
                        state,
                        1,
                        super::super::PreferenceChange::NoRecentFiles(false),
                    )?;
                    Ok(((), true))
                })
                .unwrap();
        } else {
            next.clear_history(&store, true, || Ok(())).unwrap();
        }
        let bytes = std::fs::read(root.path().join("preferences.json")).unwrap();
        store
            .transaction(|state| {
                Ok((
                    (),
                    remember_state(&old, state, &book(directory.path()), ticket)?,
                ))
            })
            .unwrap();
        assert_eq!(
            std::fs::read(root.path().join("preferences.json")).unwrap(),
            bytes
        );
    }
}

#[test]
fn current_workspace_is_projected_without_persisting_and_cross_window_or_closed_ids_fail() {
    let root = tempfile::tempdir().unwrap();
    let registry = Arc::new(std::sync::Mutex::new(
        file_index::WorkspaceRegistry::default(),
    ));
    let selected = registry
        .lock()
        .unwrap()
        .select_authorized(root.path())
        .unwrap();
    let current = Current::capture(registry.clone(), &selected.id).unwrap();
    let state = Stored::default();
    let before = serde_json::to_vec(&state).unwrap();
    let list = catalog(&state, Some(&current));
    assert_eq!(list.entries.len(), 1);
    assert!(list.entries[0].current && list.entries[0].reopenable);
    assert!(
        matches!(&list.entries[0].target, DirectoryHistoryTarget::Workspace { workspace_id } if workspace_id == &selected.id)
    );
    assert_eq!(serde_json::to_vec(&state).unwrap(), before);
    assert!(Current::capture(
        Arc::new(std::sync::Mutex::new(
            file_index::WorkspaceRegistry::default()
        )),
        &selected.id
    )
    .is_err());
    registry.lock().unwrap().close(&selected.id);
    assert!(current.verify().is_err());
}

#[test]
fn opaque_reopen_never_upgrades_legacy_paths_or_a_replaced_directory() {
    let root = tempfile::tempdir().unwrap();
    let selected = root.path().join("selected");
    std::fs::create_dir(&selected).unwrap();
    let mut state = fixture(&[selected.to_str().unwrap()]);
    // A real existing path is still not a capability when the old row has no identity.
    state.folders[0].path = selected.to_str().unwrap().into();
    let id = state.folders[0].id.clone();
    assert!(history_bookmark(&state, &id).is_err());
    state.folders[0].bookmark = Some(book(&selected));
    let mut registry = file_index::WorkspaceRegistry::default();
    assert!(registry
        .restore_bookmark(&history_bookmark(&state, &id).unwrap())
        .is_ok());
    assert!(
        crate::startup::StartupTarget::from_workspace(history_bookmark(&state, &id).unwrap())
            .is_ok()
    );
    std::fs::rename(&selected, root.path().join("old")).unwrap();
    std::fs::create_dir(&selected).unwrap();
    assert!(registry
        .restore_bookmark(&history_bookmark(&state, &id).unwrap())
        .is_err());
    assert!(
        crate::startup::StartupTarget::from_workspace(history_bookmark(&state, &id).unwrap())
            .is_err()
    );
    assert!(history_bookmark(&state, "../../outside").is_err());
}

#[cfg(unix)]
#[test]
fn persisted_directory_bookmarks_reject_a_symlink_replacement() {
    let root = tempfile::tempdir().unwrap();
    let selected = root.path().join("selected");
    std::fs::create_dir(&selected).unwrap();
    let bookmark = book(&selected);
    std::fs::rename(&selected, root.path().join("old")).unwrap();
    std::os::unix::fs::symlink(root.path().join("old"), &selected).unwrap();
    assert!(file_index::WorkspaceRegistry::default()
        .restore_bookmark(&bookmark)
        .is_err());
}

#[test]
fn clear_recent_removes_recent_membership_even_for_pins_and_path_matching_is_exact() {
    let mut state = fixture(&["/a", "/A", "/é", "/é"]);
    let id = state.folders[0].id.clone();
    pin_state(&mut state, 0, &id, true).unwrap();
    clear_folders(&mut state, false).unwrap();
    assert_eq!(state.folders.len(), 1);
    assert!(ordering(&state).recent_ids.is_empty());
    let revision = ordering(&state).revision;
    pin_state(&mut state, revision, &id, false).unwrap();
    assert!(state.folders.is_empty());
    let state = fixture(&["/a", "/A", "/é", "/é"]);
    assert_eq!(catalog(&state, None).entries.len(), 4);
    state.validate().unwrap();
}

#[test]
fn malformed_order_or_authority_never_publishes_and_json_targets_cannot_include_paths() {
    for value in [
        r#"{"kind":"history","id":"x","path":"/tmp"}"#,
        r#"{"kind":"workspace","workspaceId":"x","bookmark":{}}"#,
        r#"{"kind":"path","path":"/tmp"}"#,
    ] {
        assert!(serde_json::from_str::<DirectoryHistoryTarget>(value).is_err());
    }
    let root = tempfile::tempdir().unwrap();
    let store = super::super::storage::Store::open(root.path()).unwrap();
    let directory = tempfile::tempdir().unwrap();
    remember(
        &store,
        &super::super::FilePreferencesHost::default(),
        &book(directory.path()),
    );
    let bytes = std::fs::read(root.path().join("preferences.json")).unwrap();
    assert!(store
        .transaction(|state| {
            state
                .directory_history
                .as_mut()
                .unwrap()
                .pinned_ids
                .push("unknown".into());
            Ok(((), true))
        })
        .is_err());
    assert!(store
        .transaction(|state| {
            state.folders[0].path = root.path().to_str().unwrap().into();
            Ok(((), true))
        })
        .is_err());
    assert_eq!(
        std::fs::read(root.path().join("preferences.json")).unwrap(),
        bytes
    );
}

#[test]
fn capacity_failure_never_evicts_existing_pins_or_publishes_the_partial_new_record() {
    let root = tempfile::tempdir().unwrap();
    let directory = tempfile::tempdir().unwrap();
    let store = super::super::storage::Store::open(root.path()).unwrap();
    store
        .transaction(|state| {
            for index in 0..32 {
                state.folders.push(Folder {
                    id: uuid::Uuid::new_v4().to_string(),
                    path: root
                        .path()
                        .join(format!("folder-{index}"))
                        .to_str()
                        .unwrap()
                        .into(),
                    pinned: true,
                    bookmark: None,
                });
            }
            Ok(((), true))
        })
        .unwrap();
    let before = std::fs::read(root.path().join("preferences.json")).unwrap();
    assert!(store
        .transaction(|state| {
            ensure_order(state);
            let id = upsert(state, &book(directory.path()))?;
            Ok((pin_state(state, 0, &id, true)?, true))
        })
        .is_err());
    assert_eq!(
        std::fs::read(root.path().join("preferences.json")).unwrap(),
        before
    );
}

#[test]
fn closing_a_resolved_workspace_prevents_publication_under_the_same_registry_lock() {
    let root = tempfile::tempdir().unwrap();
    let registry = Arc::new(std::sync::Mutex::new(
        file_index::WorkspaceRegistry::default(),
    ));
    let selected = registry
        .lock()
        .unwrap()
        .select_authorized(root.path())
        .unwrap();
    let current = Current::capture(registry.clone(), &selected.id).unwrap();
    registry.lock().unwrap().close(&selected.id);
    let called = std::cell::Cell::new(false);
    let target = DirectoryHistoryTarget::Workspace {
        workspace_id: selected.id,
    };
    assert!(
        publish_target(&Stored::default(), 0, &target, Some(&current), |_, _| {
            called.set(true);
            Ok(())
        })
        .is_err()
    );
    assert!(!called.get());
}

#[test]
fn current_publication_holds_the_verified_source_registry_through_restore() {
    let root = tempfile::tempdir().unwrap();
    let registry = Arc::new(std::sync::Mutex::new(
        file_index::WorkspaceRegistry::default(),
    ));
    let selected = registry
        .lock()
        .unwrap()
        .select_authorized(root.path())
        .unwrap();
    let current = Current::capture(registry.clone(), &selected.id).unwrap();
    let target = DirectoryHistoryTarget::Workspace {
        workspace_id: selected.id,
    };
    let opened = publish_target(
        &Stored::default(),
        0,
        &target,
        Some(&current),
        |bookmark, source| {
            assert!(matches!(
                registry.try_lock(),
                Err(std::sync::TryLockError::WouldBlock)
            ));
            source
                .unwrap()
                .restore_bookmark(&bookmark)
                .map_err(|error| error.to_string())
        },
    )
    .unwrap();
    assert!(registry.lock().unwrap().get(&opened.id).is_ok());
}

#[test]
fn a_remove_or_clear_during_resolution_cannot_reserve_from_a_stale_catalog() {
    for clear in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let directory = tempfile::tempdir().unwrap();
        let store = super::super::storage::Store::open(root.path()).unwrap();
        let host = super::super::FilePreferencesHost::default();
        remember(&store, &host, &book(directory.path()));
        let (id, revision) = store
            .transaction(|state| {
                Ok((
                    (state.folders[0].id.clone(), ordering(state).revision),
                    false,
                ))
            })
            .unwrap();
        let (ready_send, ready) = std::sync::mpsc::channel();
        let (resume, resume_recv) = std::sync::mpsc::channel();
        let path = root.path().to_owned();
        let worker_id = id.clone();
        let worker = std::thread::spawn(move || {
            let store = super::super::storage::Store::open(&path).unwrap();
            // The former gap: lookup/IO completed, but no Native grant was reserved.
            store
                .transaction(|state| Ok((history_bookmark(state, &worker_id)?, false)))
                .unwrap();
            ready_send.send(()).unwrap();
            resume_recv.recv().unwrap();
            store.transaction(|state| {
                Ok((
                    publish_target(
                        state,
                        revision,
                        &DirectoryHistoryTarget::History { id: worker_id },
                        None,
                        |_, _| panic!("stale capability published"),
                    )?,
                    false,
                ))
            })
        });
        ready.recv().unwrap();
        if clear {
            host.clear_history(&store, true, || Ok(())).unwrap();
        } else {
            store
                .transaction(|state| Ok((remove_state(state, revision, Some(&id))?, true)))
                .unwrap();
        }
        resume.send(()).unwrap();
        assert!(worker.join().unwrap().is_err());
    }
}

#[test]
fn accepted_native_bootstrap_is_not_retroactively_revoked_by_metadata_removal() {
    let root = tempfile::tempdir().unwrap();
    let mut state = Stored::default();
    ensure_order(&mut state);
    let id = upsert(&mut state, &book(root.path())).unwrap();
    pin_state(&mut state, 0, &id, true).unwrap();
    let startup = crate::startup::StartupHost::default();
    publish_target(
        &state,
        1,
        &DirectoryHistoryTarget::History { id: id.clone() },
        None,
        |bookmark, _| {
            startup.set_bootstrap_reserved(
                "reserved",
                crate::startup::StartupTarget::from_workspace(bookmark)?,
            )
        },
    )
    .unwrap();
    remove_state(&mut state, 1, Some(&id)).unwrap();
    assert!(history_bookmark(&state, &id).is_err());
    startup.publish_bootstrap("reserved").unwrap();
    startup.release("reserved");
}
