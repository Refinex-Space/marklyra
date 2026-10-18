use super::*;
use crate::file_preferences::{change, PreferenceChange, Stored};
use std::{
    fs,
    sync::{Arc, Barrier},
};

#[test]
fn missing_or_legacy_profile_defaults_to_warning_without_rewriting_it() {
    let temporary = tempfile::tempdir().unwrap();
    let store = Store::open(temporary.path()).unwrap();
    assert!(!suppressed_in_store(&store).unwrap());
    assert!(!temporary.path().join("preferences.json").exists());
    let mut legacy = serde_json::to_value(Stored::default()).unwrap();
    legacy
        .as_object_mut()
        .unwrap()
        .remove("trashWarningSuppressed");
    let bytes = serde_json::to_vec(&legacy).unwrap();
    fs::write(temporary.path().join("preferences.json"), &bytes).unwrap();
    assert!(!suppressed_in_store(&store).unwrap());
    assert_eq!(
        fs::read(temporary.path().join("preferences.json")).unwrap(),
        bytes
    );
}

#[test]
fn suppression_is_idempotent_and_does_not_change_revision_or_history_epochs() {
    let temporary = tempfile::tempdir().unwrap();
    let store = Store::open(temporary.path()).unwrap();
    store
        .transaction(|state| {
            state.revision = 7;
            state.history_epoch = 11;
            state.remember_epoch = 13;
            state.default_extension = "custom".into();
            Ok(((), true))
        })
        .unwrap();
    suppress_in_store(&store).unwrap();
    let path = temporary.path().join("preferences.json");
    let bytes = fs::read(&path).unwrap();
    let modified = fs::metadata(&path).unwrap().modified().unwrap();
    #[cfg(unix)]
    let inode = {
        use std::os::unix::fs::MetadataExt;
        fs::metadata(&path).unwrap().ino()
    };
    suppress_in_store(&Store::open(temporary.path()).unwrap()).unwrap();
    assert!(suppressed_in_store(&store).unwrap());
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), modified);
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        assert_eq!(fs::metadata(&path).unwrap().ino(), inode);
    }
    store
        .transaction(|state| {
            assert_eq!(
                (state.revision, state.history_epoch, state.remember_epoch),
                (7, 11, 13)
            );
            assert_eq!(state.default_extension, "custom");
            assert!(state.save_file_on_switch);
            assert!(!state.no_recent_files);
            Ok(((), false))
        })
        .unwrap();
}

#[test]
fn concurrent_normal_preference_change_preserves_the_latest_suppression_flag() {
    let temporary = tempfile::tempdir().unwrap();
    let barrier = Arc::new(Barrier::new(3));
    let first_path = temporary.path().to_owned();
    let second_path = first_path.clone();
    let first_barrier = Arc::clone(&barrier);
    let first = std::thread::spawn(move || {
        let store = Store::open(&first_path).unwrap();
        first_barrier.wait();
        suppress_in_store(&store).unwrap();
    });
    let second_barrier = Arc::clone(&barrier);
    let second = std::thread::spawn(move || {
        let store = Store::open(&second_path).unwrap();
        second_barrier.wait();
        store
            .transaction(|state| {
                change(
                    state,
                    0,
                    PreferenceChange::DefaultExtension("markdown".into()),
                )?;
                Ok(((), true))
            })
            .unwrap();
    });
    barrier.wait();
    first.join().unwrap();
    second.join().unwrap();
    let store = Store::open(temporary.path()).unwrap();
    assert!(suppressed_in_store(&store).unwrap());
    store
        .transaction(|state| {
            assert_eq!(state.default_extension, "markdown");
            assert_eq!(
                (state.revision, state.history_epoch, state.remember_epoch),
                (1, 0, 0)
            );
            Ok(((), false))
        })
        .unwrap();
}

#[test]
fn public_snapshot_and_edit_protocol_do_not_expose_the_internal_flag() {
    let state = Stored {
        trash_warning_suppressed: true,
        ..Stored::default()
    };
    let public = serde_json::to_value(state.snapshot(true)).unwrap();
    assert!(!public
        .as_object()
        .unwrap()
        .contains_key("trashWarningSuppressed"));
    for json in [
        r#"{"key":"trashWarningSuppressed","value":true}"#,
        r#"{"key":"trash_warning_suppressed","value":true}"#,
    ] {
        assert!(serde_json::from_str::<PreferenceChange>(json).is_err());
    }
    let stored = serde_json::to_value(state).unwrap();
    assert_eq!(stored["trashWarningSuppressed"], true);
}

#[test]
fn corrupted_or_failed_store_never_defaults_to_suppressed_and_preserves_evidence() {
    for invalid in [serde_json::json!({"schemaVersion": 9}), {
        let mut value = serde_json::to_value(Stored::default()).unwrap();
        value["trashWarningSuppressed"] = "true".into();
        value
    }] {
        let temporary = tempfile::tempdir().unwrap();
        let store = Store::open(temporary.path()).unwrap();
        let bytes = serde_json::to_vec(&invalid).unwrap();
        fs::write(temporary.path().join("preferences.json"), &bytes).unwrap();
        assert!(suppressed_in_store(&store).is_err());
        assert!(suppress_in_store(&store).is_err());
        assert_eq!(
            fs::read(temporary.path().join("preferences.json")).unwrap(),
            bytes
        );
    }
    let temporary = tempfile::tempdir().unwrap();
    let store = Store::open(temporary.path()).unwrap();
    for index in 0..8 {
        fs::write(
            temporary.path().join(format!(".pending-{index}")),
            b"retained evidence",
        )
        .unwrap();
    }
    assert!(suppress_in_store(&store).is_err());
    assert!(!suppressed_in_store(&store).unwrap());
    assert!(!temporary.path().join("preferences.json").exists());
}

#[test]
fn reset_reenables_native_warning_without_erasing_unrelated_preferences() {
    let temporary = tempfile::tempdir().unwrap();
    let store = Store::open(temporary.path()).unwrap();
    store
        .transaction(|state| {
            state.default_extension = "text".into();
            state.revision = 7;
            state.no_recent_files = true;
            state.trash_warning_suppressed = true;
            Ok(((), true))
        })
        .unwrap();
    reset_in_store(&store).unwrap();
    assert!(!suppressed_in_store(&store).unwrap());
    store
        .transaction(|state| {
            assert_eq!(state.default_extension, "text");
            assert_eq!(state.revision, 7);
            assert!(state.no_recent_files);
            Ok(((), false))
        })
        .unwrap();
    let bytes = fs::read(temporary.path().join("preferences.json")).unwrap();
    reset_in_store(&store).unwrap();
    assert_eq!(
        fs::read(temporary.path().join("preferences.json")).unwrap(),
        bytes
    );
}
