use recovery_store::{
    CheckpointRequest, DocumentMetadata, DraftContent, Limits, RecoveryError, RecoverySession,
    RecoveryStore, SourceSelection,
};
use std::{
    fs,
    sync::{Arc, Barrier, Mutex},
};

fn request(
    session: &RecoverySession,
    version: u64,
    sequence: u64,
    text: &str,
) -> CheckpointRequest {
    CheckpointRequest {
        id: session.id.clone(),
        lease: session.lease.clone(),
        expected_version: version,
        sequence,
        content: DraftContent {
            text: text.to_owned(),
            saved_text: "saved\r\n".to_owned(),
            document: Some(DocumentMetadata {
                path: "/original/same.md".to_owned(),
                encoding: "UTF-16LE BOM".to_owned(),
            }),
            selection: None,
        },
    }
}
fn slot(root: &std::path::Path, id: &str, version: u64) -> std::path::PathBuf {
    root.join(format!("{id}.{}.json", version % 2))
}

#[test]
fn restart_keeps_raw_baseline_encoding_and_only_valid_source_offsets() {
    let dir = tempfile::tempdir().unwrap();
    let text = "\u{feff}中文😀\r\n| a | b |\n";
    let session;
    {
        let mut store = RecoveryStore::open(dir.path()).unwrap();
        session = store.begin().unwrap();
        let mut value = request(&session, 0, 1, text);
        value.content.selection = Some(SourceSelection { anchor: 5, head: 1 });
        store.checkpoint(value).unwrap();
        assert!(store.list().unwrap().drafts[0].active);
    }
    let store = RecoveryStore::open(dir.path()).unwrap();
    let listing = store.list().unwrap();
    assert!(!listing.drafts[0].active);
    let draft = store.read(&session.id, 1).unwrap();
    assert_eq!(draft.content.text, text);
    assert_eq!(draft.content.saved_text, "saved\r\n");
    assert_eq!(draft.content.document.unwrap().encoding, "UTF-16LE BOM");
    assert_eq!(draft.content.selection.unwrap().anchor, 5);
    assert!(listing.issues.is_empty());
}

#[test]
fn json_ipc_shape_is_flat_and_rejects_unexpected_fields() {
    let value = serde_json::json!({"id":"id","lease":"lease","expectedVersion":0,"sequence":1,"text":"hello","savedText":"","document":null,"selection":null});
    let parsed: CheckpointRequest = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(parsed.content.text, "hello");
    let mut unknown = value;
    unknown["execute"] = true.into();
    assert!(serde_json::from_value::<CheckpointRequest>(unknown).is_err());
}

#[test]
fn same_path_sessions_do_not_merge_or_overwrite() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open(dir.path()).unwrap();
    let first = store.begin().unwrap();
    let second = store.begin().unwrap();
    store.checkpoint(request(&first, 0, 1, "one")).unwrap();
    store.checkpoint(request(&second, 0, 1, "two")).unwrap();
    assert_ne!(first.id, second.id);
    assert_eq!(store.list().unwrap().drafts.len(), 2);
    assert_eq!(store.read(&first.id, 1).unwrap().content.text, "one");
    assert_eq!(store.read(&second.id, 1).unwrap().content.text, "two");
}

#[test]
fn delayed_checkpoint_and_stale_consume_cannot_replace_newer_saved_state() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open(dir.path()).unwrap();
    let session = store.begin().unwrap();
    store.checkpoint(request(&session, 0, 1, "dirty")).unwrap();
    store
        .checkpoint(request(&session, 1, 3, "saved\r\n"))
        .unwrap();
    assert!(store.list().unwrap().drafts.is_empty());
    assert!(matches!(
        store.checkpoint(request(&session, 1, 2, "late dirty")),
        Err(RecoveryError::StaleVersion)
    ));
    assert!(matches!(
        store.checkpoint(request(&session, 2, 2, "late dirty")),
        Err(RecoveryError::StaleVersion)
    ));
    assert!(matches!(
        store.consume(&session.id, 1, Some(&session.lease)),
        Err(RecoveryError::StaleVersion)
    ));
    assert_eq!(
        store.read(&session.id, 2).unwrap().content.text,
        "saved\r\n"
    );
}

#[test]
fn exact_last_checkpoint_replay_returns_the_original_receipt_after_lost_reply() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open(dir.path()).unwrap();
    let session = store.begin().unwrap();
    let original = store
        .checkpoint(request(&session, 0, 1, "committed"))
        .unwrap();
    let before = fs::read(slot(dir.path(), &session.id, 1)).unwrap();
    let replayed = store
        .checkpoint(request(&session, 0, 1, "committed"))
        .unwrap();
    assert_eq!(original.version, replayed.version);
    assert_eq!(original.updated_at, replayed.updated_at);
    assert_eq!(before, fs::read(slot(dir.path(), &session.id, 1)).unwrap());
    assert!(matches!(
        store.checkpoint(request(&session, 0, 1, "different")),
        Err(RecoveryError::StaleVersion)
    ));
    assert!(matches!(
        store.checkpoint(request(&session, 0, 2, "committed")),
        Err(RecoveryError::StaleVersion)
    ));
    let mut different_baseline = request(&session, 0, 1, "committed");
    different_baseline.content.saved_text = "different saved version".to_owned();
    assert!(matches!(
        store.checkpoint(different_baseline),
        Err(RecoveryError::StaleVersion)
    ));
    store.checkpoint(request(&session, 1, 2, "next")).unwrap();
    assert!(matches!(
        store.checkpoint(request(&session, 0, 1, "committed")),
        Err(RecoveryError::StaleVersion)
    ));
}

#[test]
fn crash_writer_subprocess() {
    let Ok(root) = std::env::var("RECOVERY_STORE_TEST_CRASH_ROOT") else {
        return;
    };
    let mut store = RecoveryStore::open(std::path::Path::new(&root)).unwrap();
    let session = store.begin().unwrap();
    store
        .checkpoint(request(&session, 0, 1, "before abrupt exit\r\n"))
        .unwrap();
    // Deliberately bypass destructors: models process termination after fsync.
    std::process::exit(0);
}

#[test]
fn abruptly_exited_process_releases_lock_and_leaves_a_complete_checkpoint() {
    let dir = tempfile::tempdir().unwrap();
    let status = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "crash_writer_subprocess"])
        .env("RECOVERY_STORE_TEST_CRASH_ROOT", dir.path())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .unwrap();
    assert!(status.success());
    let store = RecoveryStore::open(dir.path()).unwrap();
    let listing = store.list().unwrap();
    assert_eq!(listing.drafts.len(), 1);
    assert!(!listing.drafts[0].active);
    assert_eq!(
        store.read(&listing.drafts[0].id, 1).unwrap().content.text,
        "before abrupt exit\r\n"
    );
}

#[test]
fn competing_checkpoints_are_serialized_with_compare_and_swap() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open(dir.path()).unwrap();
    let session = store.begin().unwrap();
    let store = Arc::new(Mutex::new(store));
    let barrier = Arc::new(Barrier::new(3));
    let handles: Vec<_> = ["new one", "new two"]
        .into_iter()
        .enumerate()
        .map(|(i, text)| {
            let store = Arc::clone(&store);
            let barrier = Arc::clone(&barrier);
            let value = request(&session, 0, i as u64 + 1, text);
            std::thread::spawn(move || {
                barrier.wait();
                store.lock().unwrap().checkpoint(value)
            })
        })
        .collect();
    barrier.wait();
    let results: Vec<_> = handles
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect();
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert_eq!(
        results
            .iter()
            .filter(|result| matches!(result, Err(RecoveryError::StaleVersion)))
            .count(),
        1
    );
    assert_eq!(store.lock().unwrap().list().unwrap().drafts[0].version, 1);
}

#[test]
fn lease_is_required_for_active_consume_and_cannot_be_reused_after_end_or_restart() {
    let dir = tempfile::tempdir().unwrap();
    let session;
    {
        let mut store = RecoveryStore::open(dir.path()).unwrap();
        session = store.begin().unwrap();
        store.checkpoint(request(&session, 0, 1, "draft")).unwrap();
        assert!(matches!(
            store.consume(&session.id, 1, None),
            Err(RecoveryError::InvalidSession)
        ));
        assert!(matches!(
            store.end(&session.id, "wrong"),
            Err(RecoveryError::InvalidSession)
        ));
        store.end(&session.id, &session.lease).unwrap();
        assert!(matches!(
            store.checkpoint(request(&session, 1, 2, "late")),
            Err(RecoveryError::InvalidSession)
        ));
    }
    let mut store = RecoveryStore::open(dir.path()).unwrap();
    assert!(matches!(
        store.checkpoint(request(&session, 1, 2, "late")),
        Err(RecoveryError::InvalidSession)
    ));
    store.consume(&session.id, 1, None).unwrap();
    assert!(store.list().unwrap().drafts.is_empty());
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1); // .lock only
}

#[test]
fn corrupted_latest_slot_falls_back_without_destroying_the_evidence() {
    let dir = tempfile::tempdir().unwrap();
    let session;
    {
        let mut store = RecoveryStore::open(dir.path()).unwrap();
        session = store.begin().unwrap();
        store.checkpoint(request(&session, 0, 1, "first")).unwrap();
        store.checkpoint(request(&session, 1, 2, "second")).unwrap();
    }
    let latest = slot(dir.path(), &session.id, 2);
    fs::write(&latest, b"{partial").unwrap();
    let store = RecoveryStore::open(dir.path()).unwrap();
    assert_eq!(store.list().unwrap().issues.len(), 1);
    assert_eq!(store.read(&session.id, 1).unwrap().content.text, "first");
    assert_eq!(fs::read(latest).unwrap(), b"{partial");
}

#[test]
fn checksum_unknown_schema_and_orphaned_crash_temp_are_reported_not_executed() {
    let dir = tempfile::tempdir().unwrap();
    let session;
    {
        let mut store = RecoveryStore::open(dir.path()).unwrap();
        session = store.begin().unwrap();
        store.checkpoint(request(&session, 0, 1, "first")).unwrap();
        store.checkpoint(request(&session, 1, 2, "second")).unwrap();
    }
    let first = slot(dir.path(), &session.id, 1);
    let mut value: serde_json::Value = serde_json::from_slice(&fs::read(&first).unwrap()).unwrap();
    value["record"]["content"]["text"] = "modified without checksum".into();
    fs::write(&first, serde_json::to_vec(&value).unwrap()).unwrap();
    let second = slot(dir.path(), &session.id, 2);
    let mut value: serde_json::Value = serde_json::from_slice(&fs::read(&second).unwrap()).unwrap();
    value["schemaVersion"] = 999.into();
    fs::write(&second, serde_json::to_vec(&value).unwrap()).unwrap();
    fs::write(dir.path().join(".pending-interrupted.json"), b"crash").unwrap();
    let store = RecoveryStore::open(dir.path()).unwrap();
    let listing = store.list().unwrap();
    assert!(listing.drafts.is_empty());
    assert_eq!(listing.issues.len(), 3);
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 4);
}

#[test]
fn capacity_failure_preserves_previous_draft_and_never_evicts_implicitly() {
    let dir = tempfile::tempdir().unwrap();
    let session;
    {
        let mut store = RecoveryStore::open(dir.path()).unwrap();
        session = store.begin().unwrap();
        store
            .checkpoint(request(&session, 0, 1, "original"))
            .unwrap();
    }
    let bytes = fs::metadata(slot(dir.path(), &session.id, 1))
        .unwrap()
        .len();
    let mut store = RecoveryStore::open_with_limits(
        dir.path(),
        Limits {
            max_total_bytes: bytes,
            ..Limits::default()
        },
    )
    .unwrap();
    let second = store.begin().unwrap();
    assert!(matches!(
        store.checkpoint(request(&second, 0, 1, "other")),
        Err(RecoveryError::Capacity)
    ));
    assert_eq!(store.read(&session.id, 1).unwrap().content.text, "original");
}

#[test]
fn size_and_session_limits_are_checked_before_publication() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open_with_limits(
        dir.path(),
        Limits {
            max_records: 1,
            max_record_bytes: 600,
            max_total_bytes: 4000,
        },
    )
    .unwrap();
    let session = store.begin().unwrap();
    assert!(matches!(store.begin(), Err(RecoveryError::Capacity)));
    assert!(matches!(
        store.checkpoint(request(&session, 0, 1, &"\n".repeat(1000))),
        Err(RecoveryError::Capacity)
    ));
    assert!(store.list().unwrap().drafts.is_empty());
    store.consume(&session.id, 0, Some(&session.lease)).unwrap();
    store.begin().unwrap();
}

#[test]
fn invalid_source_encoding_surrogate_boundary_and_path_ids_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open(dir.path()).unwrap();
    let session = store.begin().unwrap();
    let mut value = request(&session, 0, 1, "😀");
    value.content.selection = Some(SourceSelection { anchor: 1, head: 2 });
    assert!(matches!(
        store.checkpoint(value),
        Err(RecoveryError::InvalidData)
    ));
    assert!(matches!(
        store.checkpoint(request(&session, 0, 1, "a\0b")),
        Err(RecoveryError::InvalidData)
    ));
    let mut value = request(&session, 0, 1, "okay");
    value.content.document.as_mut().unwrap().encoding = "execute".to_owned();
    assert!(matches!(
        store.checkpoint(value),
        Err(RecoveryError::InvalidData)
    ));
    for id in ["../../outside", "/etc/passwd", "C:\\outside", "a.0.json"] {
        assert!(matches!(store.read(id, 1), Err(RecoveryError::InvalidPath)));
        assert!(matches!(
            store.consume(id, 1, None),
            Err(RecoveryError::InvalidPath)
        ));
    }
}

#[test]
fn process_lock_is_exclusive_but_leftover_lock_file_is_not_a_stale_lease() {
    let dir = tempfile::tempdir().unwrap();
    let store = RecoveryStore::open(dir.path()).unwrap();
    assert!(matches!(
        RecoveryStore::open(dir.path()),
        Err(RecoveryError::Busy)
    ));
    drop(store);
    RecoveryStore::open(dir.path()).unwrap();
}

#[cfg(unix)]
#[test]
fn symlink_root_slot_and_lock_never_read_or_write_outside_store() {
    use std::os::unix::fs::symlink;
    let outer = tempfile::tempdir().unwrap();
    let outside = outer.path().join("outside");
    fs::create_dir(&outside).unwrap();
    let linked = outer.path().join("linked");
    symlink(&outside, &linked).unwrap();
    assert!(matches!(
        RecoveryStore::open(&linked),
        Err(RecoveryError::InvalidPath)
    ));
    let root = outer.path().join("store");
    fs::create_dir(&root).unwrap();
    let external = outside.join("value");
    fs::write(&external, b"preserve").unwrap();
    symlink(&external, root.join(".lock")).unwrap();
    assert!(matches!(
        RecoveryStore::open(&root),
        Err(RecoveryError::InvalidPath)
    ));
    fs::remove_file(root.join(".lock")).unwrap();
    let mut store = RecoveryStore::open(&root).unwrap();
    let session = store.begin().unwrap();
    symlink(&external, slot(&root, &session.id, 1)).unwrap();
    assert!(matches!(
        store.checkpoint(request(&session, 0, 1, "replace")),
        Err(RecoveryError::InvalidPath)
    ));
    assert_eq!(store.list().unwrap().issues.len(), 1);
    assert_eq!(fs::read(&external).unwrap(), b"preserve");
}

#[cfg(unix)]
#[test]
fn renamed_root_remains_anchored_to_its_original_directory_handle() {
    use std::os::unix::fs::symlink;
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("store");
    let archived = dir.path().join("original-store");
    let outside = dir.path().join("outside");
    fs::create_dir(&outside).unwrap();
    let mut store = RecoveryStore::open(&root).unwrap();
    let session = store.begin().unwrap();
    fs::rename(&root, &archived).unwrap();
    symlink(&outside, &root).unwrap();
    store.checkpoint(request(&session, 0, 1, "safe")).unwrap();
    assert!(slot(&archived, &session.id, 1).exists());
    assert_eq!(fs::read_dir(&outside).unwrap().count(), 0);
}

#[test]
fn metadata_path_is_only_text_and_never_changes_an_existing_user_file() {
    let dir = tempfile::tempdir().unwrap();
    let user = dir.path().join("actual.md");
    fs::write(&user, b"external saved version").unwrap();
    let mut store = RecoveryStore::open(&dir.path().join("recovery")).unwrap();
    let session = store.begin().unwrap();
    let mut value = request(&session, 0, 1, "our dirty version");
    value.content.document.as_mut().unwrap().path = user.to_string_lossy().into_owned();
    store.checkpoint(value).unwrap();
    store.read(&session.id, 1).unwrap();
    store.consume(&session.id, 1, Some(&session.lease)).unwrap();
    assert_eq!(fs::read(user).unwrap(), b"external saved version");
}

#[test]
fn deletion_reserve_allows_explicit_consume_after_normal_capacity_is_exhausted() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open_with_limits(
        dir.path(),
        Limits {
            max_records: 8,
            max_record_bytes: 2000,
            max_total_bytes: 4000,
        },
    )
    .unwrap();
    let session = store.begin().unwrap();
    let mut version = 0;
    for size in [300, 500, 700, 900] {
        match store.checkpoint(request(&session, version, version + 1, &"x".repeat(size))) {
            Ok(receipt) => version = receipt.version,
            Err(RecoveryError::Capacity) => break,
            Err(error) => panic!("unexpected error: {error}"),
        }
    }
    assert!(version > 0);
    assert!(matches!(
        store.checkpoint(request(&session, version, version + 1, &"x".repeat(1400))),
        Err(RecoveryError::Capacity)
    ));
    store
        .consume(&session.id, version, Some(&session.lease))
        .unwrap();
    assert!(store.list().unwrap().drafts.is_empty());
    assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
}

#[cfg(unix)]
#[test]
fn hardlinked_record_and_lock_are_rejected_without_touching_external_data() {
    let root = tempfile::tempdir().unwrap();
    let store_root = root.path().join("store");
    fs::create_dir(&store_root).unwrap();
    let outside = root.path().join("outside");
    fs::write(&outside, b"not a recovery resource").unwrap();
    fs::hard_link(&outside, store_root.join(".lock")).unwrap();
    assert!(matches!(
        RecoveryStore::open(&store_root),
        Err(RecoveryError::InvalidPath)
    ));
    fs::remove_file(store_root.join(".lock")).unwrap();
    let mut store = RecoveryStore::open(&store_root).unwrap();
    let session = store.begin().unwrap();
    store.checkpoint(request(&session, 0, 1, "draft")).unwrap();
    let inside = slot(&store_root, &session.id, 1);
    fs::hard_link(&inside, root.path().join("linked-record")).unwrap();
    assert!(store.list().unwrap().drafts.is_empty());
    assert_eq!(store.list().unwrap().issues.len(), 1);
    assert_eq!(fs::read(&outside).unwrap(), b"not a recovery resource");
}

#[test]
fn clean_copy_after_restart_remains_visible_and_can_explicitly_free_record_capacity() {
    let root = tempfile::tempdir().unwrap();
    let limits = Limits {
        max_records: 1,
        ..Limits::default()
    };
    let id;
    {
        let mut store = RecoveryStore::open_with_limits(root.path(), limits.clone()).unwrap();
        let session = store.begin().unwrap();
        id = session.id.clone();
        store
            .checkpoint(request(&session, 0, 1, "saved\r\n"))
            .unwrap();
        let listing = store.list().unwrap();
        assert!(listing.drafts.is_empty());
        assert_eq!(listing.saved_copies.len(), 1);
        assert!(listing.saved_copies[0].active);
    }
    let mut store = RecoveryStore::open_with_limits(root.path(), limits).unwrap();
    let listing = store.list().unwrap();
    assert!(listing.drafts.is_empty());
    assert_eq!(listing.saved_copies.len(), 1);
    assert!(!listing.saved_copies[0].active);
    assert_eq!(listing.saved_copies[0].id, id);
    assert!(matches!(store.begin(), Err(RecoveryError::Capacity)));
    assert_eq!(store.read(&id, 1).unwrap().content.text, "saved\r\n");
    store.consume(&id, 1, None).unwrap();
    assert!(store.list().unwrap().saved_copies.is_empty());
    store.begin().unwrap();
}

#[test]
fn listing_serializes_saved_copies_separately_without_changing_dirty_draft_semantics() {
    let root = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open(root.path()).unwrap();
    let dirty = store.begin().unwrap();
    let clean = store.begin().unwrap();
    store.checkpoint(request(&dirty, 0, 1, "dirty")).unwrap();
    store
        .checkpoint(request(&clean, 0, 1, "saved\r\n"))
        .unwrap();
    let json = serde_json::to_value(store.list().unwrap()).unwrap();
    assert_eq!(json["drafts"].as_array().unwrap().len(), 1);
    assert_eq!(json["drafts"][0]["id"], dirty.id);
    assert_eq!(json["savedCopies"].as_array().unwrap().len(), 1);
    assert_eq!(json["savedCopies"][0]["id"], clean.id);
    assert_eq!(json["savedCopies"][0]["active"], true);
    assert!(json.get("saved_copies").is_none());
}

#[test]
fn inactive_fallback_recovery_does_not_consume_or_overwrite_a_damaged_newer_slot() {
    let root = tempfile::tempdir().unwrap();
    let id;
    {
        let mut store = RecoveryStore::open(root.path()).unwrap();
        let session = store.begin().unwrap();
        id = session.id.clone();
        store
            .checkpoint(request(&session, 0, 1, "intact old\r\n"))
            .unwrap();
        store
            .checkpoint(request(&session, 1, 2, "newer evidence\r\n"))
            .unwrap();
        store.end(&session.id, &session.lease).unwrap();
    }
    let old = slot(root.path(), &id, 1);
    let damaged = slot(root.path(), &id, 2);
    let old_bytes = fs::read(&old).unwrap();
    fs::write(&damaged, b"{MarkLyra owned truncated newest slot").unwrap();
    let damaged_bytes = fs::read(&damaged).unwrap();
    let mut store = RecoveryStore::open(root.path()).unwrap();
    let listing = store.list().unwrap();
    assert_eq!(listing.drafts[0].version, 1);
    assert_eq!(listing.issues.len(), 1);
    assert_eq!(store.read(&id, 1).unwrap().content.text, "intact old\r\n");
    assert!(store.consume(&id, 1, None).is_err());
    assert_eq!(fs::read(&old).unwrap(), old_bytes);
    assert_eq!(fs::read(&damaged).unwrap(), damaged_bytes);
}

#[test]
fn case_variant_of_a_damaged_slot_is_not_replaced_during_fallback_cleanup() {
    let root = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open(root.path()).unwrap();
    let session = store.begin().unwrap();
    store.checkpoint(request(&session, 0, 1, "intact")).unwrap();
    store.checkpoint(request(&session, 1, 2, "newer")).unwrap();
    store.end(&session.id, &session.lease).unwrap();
    let older = slot(root.path(), &session.id, 1);
    let latest = slot(root.path(), &session.id, 2);
    let variant = latest.with_extension("JSON");
    fs::rename(&latest, &variant).unwrap();
    fs::write(&variant, b"{owned damaged case-variant slot").unwrap();
    let old_bytes = fs::read(&older).unwrap();
    let bad_bytes = fs::read(&variant).unwrap();
    assert_eq!(store.list().unwrap().drafts[0].version, 1);
    assert!(store.consume(&session.id, 1, None).is_err());
    assert_eq!(fs::read(&older).unwrap(), old_bytes);
    assert_eq!(fs::read(&variant).unwrap(), bad_bytes);
}
