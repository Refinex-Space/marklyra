use super::*;
use document_service::DocumentService;
use std::fs;

fn tab(group: u8, order: u8, selected: bool) -> NativeTabRestore {
    NativeTabRestore {
        group,
        order,
        selected,
        focused: false,
    }
}
fn fixture() -> (tempfile::TempDir, Vec<Session>) {
    let root = tempfile::tempdir().unwrap();
    let mut entries = Vec::new();
    for index in 0..3 {
        let directory = root.path().join(index.to_string());
        fs::create_dir(&directory).unwrap();
        let path = directory.join("a.md");
        fs::write(&path, format!("Document {index}\r\nTail")).unwrap();
        let mut documents = DocumentService::new();
        let document = documents.open_authorized(&path).unwrap();
        entries.push(Session {
            document: Some(documents.bookmark(&document.id).unwrap()),
            workspace: Some(DirectoryBookmark::from_native_selection(&directory).unwrap()),
            native_tab: Some(tab(3, index, index == 1)),
        });
    }
    (root, entries)
}

#[test]
fn native_tab_archive_reads_legacy_schema_one_and_roundtrips_new_metadata() {
    let (_root, entries) = fixture();
    let state = Stored {
        restore_when_launch: 2,
        archive: entries,
        ..Default::default()
    };
    let bytes = serde_json::to_vec(&state).unwrap();
    let reopened: Stored = serde_json::from_slice(&bytes).unwrap();
    reopened.validate().unwrap();
    assert_eq!(reopened.archive, state.archive);
    let mut legacy = serde_json::to_value(&state).unwrap();
    for entry in legacy["archive"].as_array_mut().unwrap() {
        entry["nativeTab"]
            .as_object_mut()
            .unwrap()
            .remove("focused");
    }
    let previous_tabs: Stored = serde_json::from_value(legacy.clone()).unwrap();
    previous_tabs.validate().unwrap();
    assert!(previous_tabs
        .archive
        .iter()
        .all(|entry| !entry.native_tab.unwrap().focused));
    for entry in legacy["archive"].as_array_mut().unwrap() {
        entry.as_object_mut().unwrap().remove("nativeTab");
    }
    let legacy: Stored = serde_json::from_value(legacy).unwrap();
    legacy.validate().unwrap();
    assert!(legacy
        .archive
        .iter()
        .all(|entry| entry.native_tab.is_none()));
    assert!(!serde_json::to_string(&legacy)
        .unwrap()
        .contains("nativeTab"));
}

#[test]
fn corrupt_native_tab_metadata_is_rejected_without_modifying_the_archive() {
    let (_root, entries) = fixture();
    let valid = serde_json::to_value(Stored {
        archive: entries,
        ..Default::default()
    })
    .unwrap();
    let mut invalid = Vec::new();
    for property in ["group", "order"] {
        for value in [
            serde_json::json!(32),
            serde_json::json!(-1),
            serde_json::json!(256),
        ] {
            let mut state = valid.clone();
            state["archive"][0]["nativeTab"][property] = value;
            invalid.push(state);
        }
    }
    let mut unknown = valid.clone();
    unknown["archive"][0]["nativeTab"]["path"] = serde_json::json!("/untrusted.md");
    invalid.push(unknown);
    let mut repeated_position = valid.clone();
    repeated_position["archive"][1]["nativeTab"]["order"] = serde_json::json!(0);
    invalid.push(repeated_position);
    let mut repeated_selection = valid.clone();
    repeated_selection["archive"][0]["nativeTab"]["selected"] = serde_json::json!(true);
    invalid.push(repeated_selection);
    let mut unfocused_selection = valid.clone();
    unfocused_selection["archive"][0]["nativeTab"]["focused"] = serde_json::json!(true);
    invalid.push(unfocused_selection);
    let mut repeated_focus = valid;
    repeated_focus["archive"][0]["nativeTab"] =
        serde_json::json!({ "group": 1, "order": 0, "selected": true, "focused": true });
    repeated_focus["archive"][1]["nativeTab"]["focused"] = serde_json::json!(true);
    invalid.push(repeated_focus);
    for state in invalid {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("state.json");
        let bytes = serde_json::to_vec(&state).unwrap();
        fs::write(&path, &bytes).unwrap();
        let store = Store::open(directory.path()).unwrap();
        assert!(store.transaction(|_| Ok(((), true))).is_err());
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
}

#[test]
fn failed_native_snapshot_does_not_clear_or_reassign_existing_window_groups() {
    let (_root, entries) = fixture();
    let host = StartupHost::default();
    for (index, entry) in entries.into_iter().enumerate() {
        host.set_bootstrap(&format!("editor-{index}"), checked_target(entry))
            .unwrap();
    }
    host.set_bootstrap_reserved("reserved", StartupTarget::default())
        .unwrap();
    let before = host.session_snapshot().unwrap();
    let invalid = [
        vec![("unknown".into(), tab(0, 0, true))],
        vec![("reserved".into(), tab(0, 0, true))],
        vec![
            ("editor-0".into(), tab(0, 0, true)),
            ("editor-0".into(), tab(1, 0, true)),
        ],
        vec![
            ("editor-0".into(), tab(0, 0, true)),
            ("editor-1".into(), tab(0, 0, false)),
        ],
        vec![
            ("editor-0".into(), tab(0, 0, true)),
            ("editor-1".into(), tab(0, 1, true)),
        ],
        vec![("editor-0".into(), tab(32, 0, true))],
        vec![("editor-0".into(), tab(0, 32, true))],
        (0..33)
            .map(|index| (format!("editor-{index}"), tab(0, 0, false)))
            .collect(),
    ];
    for snapshot in invalid {
        assert!(host.set_native_tab_layout(snapshot).is_err());
        assert_eq!(host.session_snapshot().unwrap(), before);
    }
    host.set_native_tab_layout(Vec::new()).unwrap();
    assert!(host
        .session_snapshot()
        .unwrap()
        .iter()
        .all(|entry| entry.native_tab.is_none()));
}

#[test]
fn startup_plan_keeps_distinct_workspaces_and_restores_only_surviving_tab_members() {
    let (root, mut entries) = fixture();
    // Remove the focused/selected tab's independent file and directory grant.
    entries[1].native_tab.as_mut().unwrap().focused = true;
    fs::remove_file(root.path().join("1/a.md")).unwrap();
    fs::remove_dir(root.path().join("1")).unwrap();
    entries[0].native_tab = Some(tab(3, 9, false));
    entries[2].native_tab = Some(tab(3, 2, false));
    let state = Stored {
        restore_when_launch: 2,
        archive: entries.clone(),
        ..Default::default()
    };
    state.validate().unwrap();
    let targets = plan(&state);
    assert_eq!(targets.len(), 2);
    assert_eq!(targets[0].session.workspace, entries[0].workspace);
    assert_eq!(targets[1].session.workspace, entries[2].workspace);
    assert_eq!(targets[0].native_tab(), Some(tab(3, 1, false)));
    assert_eq!(targets[1].native_tab(), Some(tab(3, 0, true)));
    assert!(targets
        .iter()
        .all(|target| !target.native_tab().unwrap().focused));
    fs::remove_file(root.path().join("2/a.md")).unwrap();
    fs::remove_dir(root.path().join("2")).unwrap();
    let targets = plan(&state);
    assert_eq!(targets.len(), 1);
    assert!(targets[0].native_tab().is_none());
}

#[test]
fn directory_mode_deduplication_does_not_revive_filtered_tab_members() {
    let (_root, mut entries) = fixture();
    entries[1].workspace = entries[0].workspace.clone();
    let state = Stored {
        restore_when_launch: 1,
        archive: entries,
        ..Default::default()
    };
    let targets = plan(&state);
    assert_eq!(targets.len(), 2);
    assert!(targets
        .iter()
        .all(|target| target.session.document.is_none()));
    assert_eq!(targets[0].native_tab(), Some(tab(3, 0, true)));
    assert_eq!(targets[1].native_tab(), Some(tab(3, 1, false)));
}

#[test]
fn empty_untitled_tab_has_no_session_authority_and_does_not_occupy_the_selected_slot() {
    let (_root, mut entries) = fixture();
    let host = StartupHost::default();
    host.set_bootstrap("first", checked_target(entries.remove(0)))
        .unwrap();
    host.set_bootstrap("second", checked_target(entries.remove(0)))
        .unwrap();
    host.set_bootstrap("empty", StartupTarget::default())
        .unwrap();
    host.set_native_tab_layout(vec![
        ("first".into(), tab(0, 2, false)),
        ("second".into(), tab(0, 0, false)),
        ("empty".into(), tab(0, 1, true)),
    ])
    .unwrap();
    let archive = host.session_snapshot().unwrap();
    assert_eq!(archive.len(), 2);
    assert_eq!(archive[0].native_tab, Some(tab(0, 1, false)));
    assert_eq!(archive[1].native_tab, Some(tab(0, 0, true)));
}

#[test]
fn quit_archive_keeps_original_tabs_after_one_native_sibling_closes_then_cancel_refreshes() {
    let (_root, mut entries) = fixture();
    entries[1].native_tab.as_mut().unwrap().focused = true;
    let host = StartupHost::default();
    for (index, entry) in entries.into_iter().enumerate() {
        host.set_bootstrap(&format!("editor-{index}"), checked_target(entry))
            .unwrap();
    }
    let before = host.session_snapshot().unwrap();
    host.begin_quit_backup().unwrap();
    host.release("editor-1");
    host.set_native_tab_layout(vec![
        ("editor-0".into(), tab(0, 0, true)),
        ("editor-2".into(), tab(0, 1, false)),
    ])
    .unwrap();
    assert_eq!(host.session_snapshot().unwrap(), before);
    // Cancellation ends the batch: only live windows and their current native
    // layout participate in the following close checkpoint.
    host.end_quit_backup();
    let after = host.session_snapshot().unwrap();
    assert_eq!(after.len(), 2);
    assert_eq!(after[0].native_tab, Some(tab(0, 0, true)));
    assert_eq!(after[1].native_tab, Some(tab(0, 1, false)));
}

#[test]
fn restored_tab_members_keep_owner_capabilities_and_metadata_stays_out_of_ipc() {
    let (_root, mut entries) = fixture();
    let host = StartupHost::default();
    let services = crate::window_services::WindowServices::default();
    for label in ["first", "second"] {
        services.register(label).unwrap();
        host.set_bootstrap(label, checked_target(entries.remove(0)))
            .unwrap();
    }
    let claim = commands::claim_startup(&host, "first").unwrap();
    // Capture actual native grouping while startup I/O is in flight.
    host.set_native_tab_layout(vec![
        ("first".into(), tab(0, 0, false)),
        ("second".into(), tab(0, 1, true)),
    ])
    .unwrap();
    let result = commands::restore_target(&host, &services, "first", claim, || {}).unwrap();
    let serialized = serde_json::to_string(&result).unwrap();
    assert!(!serialized.contains("nativeTab"));
    let payload = result.document.unwrap();
    assert!(services
        .get_documents("second")
        .unwrap()
        .lock()
        .unwrap()
        .bookmark(&payload.id)
        .is_err());
    assert_eq!(
        host.slots.lock().unwrap()["first"].session.native_tab,
        Some(tab(0, 0, false))
    );
}

#[test]
fn two_native_groups_have_independent_selections_and_one_global_focus() {
    let first = tab(0, 0, true);
    let second = NativeTabRestore {
        focused: true,
        ..tab(1, 0, true)
    };
    validate_native_tabs([first, second]).unwrap();
    assert!(validate_native_tabs([
        NativeTabRestore {
            focused: true,
            ..first
        },
        second
    ])
    .is_err());
    assert!(validate_native_tabs([NativeTabRestore {
        focused: true,
        ..tab(0, 1, false)
    }])
    .is_err());
    let (_root, entries) = fixture();
    let host = StartupHost::default();
    for (index, entry) in entries.into_iter().enumerate() {
        host.set_bootstrap(&format!("editor-{index}"), checked_target(entry))
            .unwrap();
    }
    host.set_native_tab_layout(vec![
        ("editor-0".into(), first),
        ("editor-1".into(), second),
    ])
    .unwrap();
    let before = host.session_snapshot().unwrap();
    assert!(host
        .set_native_tab_layout(vec![
            (
                "editor-0".into(),
                NativeTabRestore {
                    focused: true,
                    ..first
                }
            ),
            ("editor-1".into(), second),
        ])
        .is_err());
    assert_eq!(host.session_snapshot().unwrap(), before);
}

#[test]
fn focused_singleton_keeps_global_focus_until_its_own_authority_is_filtered_out() {
    let (root, mut entries) = fixture();
    let focused = NativeTabRestore {
        focused: true,
        ..tab(5, 7, true)
    };
    entries[0].native_tab = Some(focused);
    let state = Stored {
        restore_when_launch: 2,
        archive: entries,
        ..Default::default()
    };
    state.validate().unwrap();
    let targets = plan(&state);
    assert_eq!(targets.len(), 3);
    assert_eq!(
        targets[0].native_tab(),
        Some(NativeTabRestore {
            order: 0,
            ..focused
        })
    );
    assert_eq!(
        targets
            .iter()
            .filter(|target| target.native_tab().is_some_and(|tab| tab.focused))
            .count(),
        1
    );
    fs::remove_file(root.path().join("0/a.md")).unwrap();
    fs::remove_dir(root.path().join("0")).unwrap();
    let targets = plan(&state);
    assert_eq!(targets.len(), 2);
    assert!(targets
        .iter()
        .all(|target| !target.native_tab().unwrap().focused));
    assert_eq!(targets[0].native_tab(), Some(tab(3, 0, true)));
}
