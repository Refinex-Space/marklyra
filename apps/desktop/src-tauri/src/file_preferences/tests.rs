use super::*;

#[test]
fn failed_invalidation_does_not_call_the_history_clear() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    for i in 0..8 {
        fs::write(root.path().join(format!(".pending-{i}")), b"evidence").unwrap();
    }
    let calls = AtomicUsize::new(0);
    let result = FilePreferencesHost::default().clear_history(&store, false, || {
        calls.fetch_add(1, Ordering::SeqCst);
        Ok(())
    });
    assert!(result.is_err());
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}
#[test]
fn a_partial_directory_failure_still_invalidates_an_independent_hosts_old_ticket() {
    let root = tempfile::tempdir().unwrap();
    let preferences = root.path().join("preferences");
    let store = Store::open(&preferences).unwrap();
    let old_host = FilePreferencesHost::default();
    let old_ticket = store
        .transaction(|state| {
            Ok((
                old_host.ticket(state, old_host.history_request()).unwrap(),
                false,
            ))
        })
        .unwrap();
    let path = root.path().join("document.md");
    fs::write(&path, b"source unchanged").unwrap();
    let path = fs::canonicalize(path).unwrap();
    let recent = recent_files::RecentFiles::open(&root.path().join("recent")).unwrap();
    recent.remember_authorized(&path).unwrap();
    let clearing_host = FilePreferencesHost::default();
    let result = clearing_host.clear_history(&store, false, || {
        recent.clear().map_err(|error| error.to_string())?;
        for i in 0..8 {
            fs::write(preferences.join(format!(".pending-{i}")), b"evidence").unwrap();
        }
        Ok(())
    });
    assert!(result.unwrap_err().contains("最近文件记录已清除"));
    let allowed = Store::open(&preferences)
        .unwrap()
        .transaction(|state| Ok((old_host.current_ticket(state, old_ticket), false)))
        .unwrap();
    assert!(!allowed);
    assert!(recent.list().unwrap().entries.is_empty());
    assert_eq!(fs::read(path).unwrap(), b"source unchanged");
}

#[test]
fn a_pre_clear_remember_cannot_reinsert_after_the_clear_barrier() {
    for invalidate_local in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let preferences = root.path().join("preferences");
        let history = root.path().join("history");
        let file = root.path().join("document.md");
        fs::write(&file, b"unchanged document").unwrap();
        let file = fs::canonicalize(file).unwrap();
        let recent = recent_files::RecentFiles::open(&history).unwrap();
        recent.remember_authorized(&file).unwrap();
        let host = FilePreferencesHost::default();
        let request = host.history_request();
        let store = Store::open(&preferences).unwrap();
        let ticket = store
            .transaction(|state| Ok((host.ticket(state, request).unwrap(), false)))
            .unwrap();
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let worker_barrier = barrier.clone();
        let worker_host = host.clone();
        let worker_preferences = preferences.clone();
        let worker_history = history.clone();
        let worker_file = file.clone();
        let worker = std::thread::spawn(move || {
            // Former gap: authorization resolved, but the history mutation has not started.
            worker_barrier.wait();
            worker_barrier.wait();
            Store::open(&worker_preferences)
                .unwrap()
                .transaction(|state| {
                    if !worker_host.current_ticket(state, ticket) {
                        return Ok((false, false));
                    }
                    recent_files::RecentFiles::open(&worker_history)
                        .unwrap()
                        .remember_authorized(&worker_file)
                        .unwrap();
                    Ok((true, false))
                })
                .unwrap()
        });
        barrier.wait();
        Store::open(&preferences)
            .unwrap()
            .transaction(|state| {
                state.advance_history()?;
                if invalidate_local {
                    host.invalidate_history();
                }
                recent.clear().unwrap();
                Ok(((), true))
            })
            .unwrap();
        barrier.wait();
        assert!(!worker.join().unwrap());
        assert!(recent.list().unwrap().entries.is_empty());
        assert_eq!(fs::read(&file).unwrap(), b"unchanged document");
    }
}
#[test]
fn requests_dispatched_before_clear_are_rejected_even_if_prepared_after_it() {
    let host = FilePreferencesHost::default();
    let request = host.history_request();
    let mut state = Stored::default();
    state.advance_history().unwrap();
    host.invalidate_history();
    assert!(host.ticket(&state, request).is_none());
    assert!(host.ticket(&state, host.history_request()).is_some());
}
#[test]
fn disable_then_reenable_does_not_revive_an_old_recording_ticket() {
    let host = FilePreferencesHost::default();
    let mut state = Stored::default();
    let ticket = host.ticket(&state, host.history_request()).unwrap();
    change(&mut state, 0, PreferenceChange::NoRecentFiles(true)).unwrap();
    assert!(host.ticket(&state, host.history_request()).is_none());
    change(&mut state, 1, PreferenceChange::NoRecentFiles(false)).unwrap();
    assert!(!host.current_ticket(&state, ticket));
    assert!(host.ticket(&state, host.history_request()).is_some());
}
use std::{
    fs,
    sync::atomic::{AtomicUsize, Ordering},
};

#[test]
fn clear_is_single_in_flight_and_released_after_cancel_or_failure() {
    let host = FilePreferencesHost::default();
    let lease = host.begin_clear().unwrap();
    assert!(host.clone().begin_clear().is_err());
    drop(lease);
    assert!(host.begin_clear().is_ok());
}

fn put(store: &Store, revision: u64, value: PreferenceChange) -> Result<FilePreferences, String> {
    store.transaction(|state| {
        change(state, revision, value)?;
        Ok((state.snapshot(true), true))
    })
}
#[test]
fn switch_saving_defaults_on_and_explicit_values_survive_deserialization() {
    let state = Stored::default();
    let value = state.snapshot(false);
    assert_eq!(value.default_extension, "md");
    assert!(value.save_file_on_switch);
    assert!(!value.always_confirms_changes);
    assert!(!value.no_recent_files);
    let mut record = serde_json::to_value(&state).unwrap();
    record["saveFileOnSwitch"] = false.into();
    assert!(
        !serde_json::from_value::<Stored>(record.clone())
            .unwrap()
            .save_file_on_switch
    );
    record.as_object_mut().unwrap().remove("saveFileOnSwitch");
    assert!(
        serde_json::from_value::<Stored>(record)
            .unwrap()
            .save_file_on_switch
    );
}

#[test]
fn drop_preferences_default_old_records_and_persist_only_original_enums() {
    let mut old = serde_json::to_value(Stored::default()).unwrap();
    for key in [
        "actionWhenDropFile",
        "actionWhenDropFolder",
        "actionWhenDropImport",
    ] {
        old.as_object_mut().unwrap().remove(key);
    }
    let decoded: Stored = serde_json::from_value(old.clone()).unwrap();
    assert_eq!(decoded.action_when_drop_file, DropAction::Open);
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    for (revision, key) in [
        "actionWhenDropFile",
        "actionWhenDropFolder",
        "actionWhenDropImport",
    ]
    .into_iter()
    .enumerate()
    {
        let change = serde_json::from_value(serde_json::json!({"key":key,"value":"link"})).unwrap();
        put(&store, revision as u64, change).unwrap();
        assert!(serde_json::from_value::<PreferenceChange>(
            serde_json::json!({"key":key,"value":"open"})
        )
        .is_err());
        assert!(serde_json::from_value::<PreferenceChange>(
            serde_json::json!({"key":key,"value":"/tmp/target"})
        )
        .is_err());
    }
    let reopened = Store::open(root.path()).unwrap();
    let snapshot = reopened
        .transaction(|state| Ok((state.snapshot(true), false)))
        .unwrap();
    assert_eq!(snapshot.action_when_drop_file, DropAction::Link);
    assert_eq!(snapshot.action_when_drop_folder, DropAction::Link);
    assert_eq!(snapshot.action_when_drop_import, DropAction::Link);
    assert!(put(&store, 0, PreferenceChange::DropFile(DropAction::Open)).is_err());
    old["actionWhenDropFile"] = serde_json::json!("open");
    assert!(serde_json::from_value::<Stored>(old).is_err());
}
#[test]
fn extension_tokens_cannot_supply_paths_or_controls() {
    for value in ["", "md", "markdown", "text", "custom", "Foo.Bar", "-_a"] {
        assert!(valid_extension(value), "{value}");
    }
    for value in [
        ".", "../md", ".md", "md.", "md..foo", "a/b", "a\\b", "a:md", "中文", "x\nmd", " x ",
        "a\0b",
    ] {
        assert!(!valid_extension(value), "{value:?}");
    }
    assert!(!valid_extension(&"x".repeat(129)));
}
#[test]
fn stale_revision_is_rejected_without_overwriting_latest_fields() {
    let root = tempfile::tempdir().unwrap();
    let a = Store::open(root.path()).unwrap();
    let b = Store::open(root.path()).unwrap();
    assert_eq!(
        put(&a, 0, PreferenceChange::DefaultExtension("text".into()))
            .unwrap()
            .revision,
        1
    );
    assert!(put(&b, 0, PreferenceChange::NoRecentFiles(true)).is_err());
    let state = b
        .transaction(|state| Ok((state.snapshot(true), false)))
        .unwrap();
    assert_eq!(state.default_extension, "text");
    assert!(!state.no_recent_files);
    put(&b, 1, PreferenceChange::NoRecentFiles(true)).unwrap();
    assert_eq!(
        a.transaction(|state| Ok((state.snapshot(true), false)))
            .unwrap()
            .default_extension,
        "text"
    );
}
#[test]
fn invalid_changes_do_not_publish_or_advance_revision() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    assert!(put(
        &store,
        0,
        PreferenceChange::DefaultExtension("../../md".into())
    )
    .is_err());
    assert!(!root.path().join("preferences.json").exists());
    assert_eq!(
        put(&store, 0, PreferenceChange::SaveFileOnSwitch(true))
            .unwrap()
            .revision,
        1
    );
    let baseline = fs::read(root.path().join("preferences.json")).unwrap();
    assert!(put(&store, 1, PreferenceChange::DefaultExtension(".bad".into())).is_err());
    assert_eq!(
        fs::read(root.path().join("preferences.json")).unwrap(),
        baseline
    );
}
#[test]
fn corrupt_newer_or_oversized_metadata_is_preserved() {
    for bytes in [
        b"broken".to_vec(),
        b"{\"schemaVersion\":9}".to_vec(),
        vec![b' '; 262_145],
    ] {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("preferences.json");
        fs::write(&file, &bytes).unwrap();
        let store = Store::open(root.path()).unwrap();
        assert!(put(&store, 0, PreferenceChange::NoRecentFiles(true)).is_err());
        assert_eq!(fs::read(file).unwrap(), bytes);
    }
}
#[test]
fn changes_require_exact_typed_keys_and_values() {
    for json in [
        r#"{"key":"noRecentFiles","value":"false"}"#,
        r#"{"key":"save_file_on_switch","value":null}"#,
        r#"{"key":"defaultExtension","value":1}"#,
        r#"{"key":"theme","value":"night"}"#,
        r#"{"key":"noRecentFiles","value":true,"path":"/tmp"}"#,
    ] {
        assert!(
            serde_json::from_str::<PreferenceChange>(json).is_err(),
            "{json}"
        );
    }
}
#[test]
fn a_failed_preference_transaction_never_calls_the_next_store() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("preferences.json");
    fs::write(&file, "broken").unwrap();
    let store = Store::open(root.path()).unwrap();
    let calls = AtomicUsize::new(0);
    assert!(store
        .transaction(|_| {
            calls.fetch_add(1, Ordering::SeqCst);
            Ok(((), true))
        })
        .is_err());
    assert_eq!(calls.load(Ordering::SeqCst), 0);
}
#[test]
fn folder_clear_scope_retains_pins_only_when_requested() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    store
        .transaction(|state| {
            state.folders = vec![
                Folder {
                    id: uuid::Uuid::new_v4().to_string(),
                    path: root.path().to_str().unwrap().into(),
                    pinned: true,
                    bookmark: None,
                },
                Folder {
                    id: uuid::Uuid::new_v4().to_string(),
                    path: root.path().join("other").to_str().unwrap().into(),
                    pinned: false,
                    bookmark: None,
                },
            ];
            Ok(((), true))
        })
        .unwrap();
    store
        .transaction(|state| {
            state.folders.retain(|folder| folder.pinned);
            Ok(((), true))
        })
        .unwrap();
    assert_eq!(
        store
            .transaction(|state| Ok((state.folders.clone(), false)))
            .unwrap()
            .len(),
        1
    );
    store
        .transaction(|state| {
            state.folders.clear();
            Ok(((), true))
        })
        .unwrap();
    assert!(store
        .transaction(|state| Ok((state.folders.clone(), false)))
        .unwrap()
        .is_empty());
}
#[cfg(unix)]
#[test]
fn symlink_or_hardlink_preferences_never_modify_the_target() {
    for symbolic in [true, false] {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("target");
        fs::write(&target, "untouched").unwrap();
        let path = root.path().join("preferences.json");
        if symbolic {
            std::os::unix::fs::symlink(&target, &path).unwrap();
        } else {
            fs::hard_link(&target, &path).unwrap();
        }
        assert!(put(
            &Store::open(root.path()).unwrap(),
            0,
            PreferenceChange::NoRecentFiles(true)
        )
        .is_err());
        assert_eq!(fs::read(&target).unwrap(), b"untouched");
    }
}
