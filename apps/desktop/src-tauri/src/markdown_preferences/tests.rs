use super::*;
use std::{fs, sync::Arc};

fn change(indent: Option<i8>, pretty: Option<bool>) -> MarkdownPreferenceChange {
    MarkdownPreferenceChange {
        indent_size: indent,
        pretty_indent: pretty,
        ..Default::default()
    }
}

#[test]
fn absent_storage_reads_defaults_without_publishing_a_configuration() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    assert_eq!(store.get().unwrap(), MarkdownPreferences::default());
    assert!(!root.path().join("preferences.json").exists());
    assert_eq!(
        Store::open(root.path()).unwrap().get().unwrap().indent_size,
        2
    );
    assert_eq!(
        serde_json::to_value(store.get().unwrap()).unwrap(),
        serde_json::json!({"schemaVersion":1,"revision":0,"indentSize":2,"prettyIndent":false,
            "headingStyle":0,"ulStyle":0,"olStyle":0})
    );
}

#[test]
fn every_original_indent_is_preserved_with_auto_distinct_from_two() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    for (index, indent) in [0, 2, 3, 4, 5, -1].into_iter().enumerate() {
        let snapshot = store
            .put(index as u64, change(Some(indent), Some(index % 2 == 0)))
            .unwrap();
        assert_eq!(snapshot.indent_size, indent);
        assert_eq!(snapshot.revision, index as u64 + 1);
        assert_eq!(Store::open(root.path()).unwrap().get().unwrap(), snapshot);
    }
}

#[test]
fn a_schema_one_indent_only_file_reads_without_rewriting_until_a_real_cas() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("preferences.json");
    let bytes = b"{\n  \"schemaVersion\": 1, \"revision\": 7, \"indentSize\": -1, \"prettyIndent\": true\n}\n";
    fs::write(&path, bytes).unwrap();
    let store = Store::open(root.path()).unwrap();
    let expected = MarkdownPreferences {
        revision: 7,
        indent_size: -1,
        pretty_indent: true,
        ..Default::default()
    };
    assert_eq!(store.get().unwrap(), expected);
    assert_eq!(Store::open(root.path()).unwrap().get().unwrap(), expected);
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert!(store.put(6, change(None, Some(false))).is_err());
    assert_eq!(fs::read(&path).unwrap(), bytes);
    let saved = store
        .put(
            7,
            MarkdownPreferenceChange {
                heading_style: Some(3),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(
        saved,
        MarkdownPreferences {
            revision: 8,
            heading_style: 3,
            ..expected
        }
    );
    assert_eq!(Store::open(root.path()).unwrap().get().unwrap(), saved);
    assert_eq!(
        serde_json::from_slice::<serde_json::Value>(&fs::read(path).unwrap()).unwrap(),
        serde_json::to_value(saved).unwrap()
    );
}

#[test]
fn every_serializer_style_combination_survives_restart_and_partial_changes() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    let mut revision = 0;
    for heading in 0..=3 {
        for ul in 0..=2 {
            for ol in 0..=1 {
                let snapshot = store
                    .put(
                        revision,
                        MarkdownPreferenceChange {
                            heading_style: Some(heading),
                            ul_style: Some(ul),
                            ol_style: Some(ol),
                            ..Default::default()
                        },
                    )
                    .unwrap();
                revision += 1;
                assert_eq!(snapshot.revision, revision);
                assert_eq!(snapshot.heading_style, heading);
                assert_eq!(snapshot.ul_style, ul);
                assert_eq!(snapshot.ol_style, ol);
                assert_eq!(snapshot.indent_size, 2);
                assert!(!snapshot.pretty_indent);
                assert_eq!(Store::open(root.path()).unwrap().get().unwrap(), snapshot);
            }
        }
    }
    let snapshot = store.put(revision, change(Some(-1), Some(true))).unwrap();
    assert_eq!(
        (snapshot.heading_style, snapshot.ul_style, snapshot.ol_style),
        (3, 2, 1)
    );
    let next = store
        .put(
            snapshot.revision,
            MarkdownPreferenceChange {
                ul_style: Some(0),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(next.heading_style, 3);
    assert_eq!(next.ul_style, 0);
    assert_eq!(next.ol_style, 1);
    assert_eq!(next.indent_size, -1);
    assert!(next.pretty_indent);
}

#[test]
fn malformed_serializer_styles_are_rejected_in_requests_and_stored_snapshots() {
    for (field, limit) in [("headingStyle", 3), ("ulStyle", 2), ("olStyle", 1)] {
        for value in [
            serde_json::Value::Null,
            serde_json::json!(-1),
            serde_json::json!(limit + 1),
            serde_json::json!(0.5),
            serde_json::json!("0"),
            serde_json::json!(false),
            serde_json::json!(256),
        ] {
            let mut request = serde_json::json!({});
            request[field] = value.clone();
            assert!(
                serde_json::from_value::<MarkdownPreferenceChange>(request)
                    .map_err(|error| error.to_string())
                    .and_then(|change| change.validate())
                    .is_err(),
                "{field}: {value}"
            );
            let root = tempfile::tempdir().unwrap();
            let path = root.path().join("preferences.json");
            let mut stored = serde_json::to_value(MarkdownPreferences::default()).unwrap();
            stored[field] = value;
            let bytes = serde_json::to_vec(&stored).unwrap();
            fs::write(&path, &bytes).unwrap();
            let store = Store::open(root.path()).unwrap();
            assert!(store.get().is_err());
            assert!(store.put(0, change(Some(4), None)).is_err());
            assert_eq!(fs::read(path).unwrap(), bytes);
        }
    }
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    let snapshot = store.put(0, change(Some(-1), Some(true))).unwrap();
    let bytes = fs::read(root.path().join("preferences.json")).unwrap();
    for update in [
        MarkdownPreferenceChange {
            heading_style: Some(4),
            ..Default::default()
        },
        MarkdownPreferenceChange {
            ul_style: Some(3),
            ..Default::default()
        },
        MarkdownPreferenceChange {
            ol_style: Some(2),
            ..Default::default()
        },
    ] {
        assert!(store.put(1, update).is_err());
        assert_eq!(store.get().unwrap(), snapshot);
        assert_eq!(
            fs::read(root.path().join("preferences.json")).unwrap(),
            bytes
        );
    }
}

#[test]
fn serializer_only_cas_uses_the_shared_revision_across_instances() {
    let root = tempfile::tempdir().unwrap();
    let first = Store::open(root.path()).unwrap();
    let second = Store::open(root.path()).unwrap();
    let snapshot = first
        .put(
            0,
            MarkdownPreferenceChange {
                heading_style: Some(3),
                ..Default::default()
            },
        )
        .unwrap();
    assert!(second
        .put(
            0,
            MarkdownPreferenceChange {
                ul_style: Some(2),
                ..Default::default()
            }
        )
        .is_err());
    assert_eq!(second.get().unwrap(), snapshot);
    let next = second
        .put(
            1,
            MarkdownPreferenceChange {
                ol_style: Some(1),
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(next.revision, 2);
    assert_eq!(next.heading_style, 3);
    assert_eq!(next.ul_style, 0);
    assert_eq!(next.ol_style, 1);
    assert_eq!(first.get().unwrap(), next);
}

#[test]
fn stale_cas_and_invalid_updates_preserve_disk_and_unrelated_fields() {
    let root = tempfile::tempdir().unwrap();
    let first = Store::open(root.path()).unwrap();
    let second = Store::open(root.path()).unwrap();
    let snapshot = first.put(0, change(Some(0), Some(true))).unwrap();
    let bytes = fs::read(root.path().join("preferences.json")).unwrap();
    for (revision, update) in [
        (0, change(Some(5), None)),
        (1, change(Some(1), None)),
        (1, change(None, None)),
    ] {
        assert!(second.put(revision, update).is_err());
        assert_eq!(
            fs::read(root.path().join("preferences.json")).unwrap(),
            bytes
        );
        assert_eq!(first.get().unwrap(), snapshot);
    }
    let next = second.put(1, change(None, Some(false))).unwrap();
    assert_eq!(next.indent_size, 0);
    assert!(!next.pretty_indent);
    assert_eq!(next.revision, 2);
}

#[test]
fn partial_changes_are_strict_and_never_treat_explicit_null_as_omission() {
    for json in [
        r#"{"indentSize":0}"#,
        r#"{"prettyIndent":false}"#,
        r#"{"indentSize":-1,"prettyIndent":true}"#,
        r#"{"headingStyle":3}"#,
        r#"{"ulStyle":2}"#,
        r#"{"olStyle":1}"#,
        r#"{"headingStyle":0,"ulStyle":0,"olStyle":0}"#,
    ] {
        serde_json::from_str::<MarkdownPreferenceChange>(json)
            .unwrap()
            .validate()
            .unwrap();
    }
    for json in [
        r#"{}"#,
        r#"{"indentSize":null}"#,
        r#"{"prettyIndent":null}"#,
        r#"{"indentSize":"0"}"#,
        r#"{"indentSize":1}"#,
        r#"{"indentSize":2.5}"#,
        r#"{"indentSize":128}"#,
        r#"{"prettyIndent":0}"#,
        r#"{"prettyIndent":"true"}"#,
        r#"{"indentSize":0,"prettyIndent":true,"source":"raw"}"#,
        r#"{"history":[]}"#,
        r#"{"indentSize":0,"indentSize":4}"#,
        r#"{"headingStyle":0,"headingStyle":1}"#,
        r#"{"ulStyle":0,"ulStyle":1}"#,
        r#"{"olStyle":0,"olStyle":1}"#,
    ] {
        assert!(
            serde_json::from_str::<MarkdownPreferenceChange>(json)
                .map_err(|error| error.to_string())
                .and_then(|value| value.validate())
                .is_err(),
            "{json}"
        );
    }
}

#[test]
fn corrupt_unknown_and_oversized_storage_fails_closed_without_repair() {
    let base = serde_json::to_value(MarkdownPreferences::default()).unwrap();
    let mut unknown = base.clone();
    unknown["source"] = "private".into();
    let mut newer = base.clone();
    newer["schemaVersion"] = 2.into();
    let mut invalid = base.clone();
    invalid["indentSize"] = 1.into();
    let mut invalid_revision = base.clone();
    invalid_revision["revision"] = (MAX_REVISION + 1).into();
    let mut wrong_type = base;
    wrong_type["prettyIndent"] = "false".into();
    for bytes in [
        b"broken".to_vec(),
        b"{}".to_vec(),
        serde_json::to_vec(&unknown).unwrap(),
        serde_json::to_vec(&newer).unwrap(),
        serde_json::to_vec(&invalid).unwrap(),
        serde_json::to_vec(&invalid_revision).unwrap(),
        serde_json::to_vec(&wrong_type).unwrap(),
        vec![b' '; 4097],
    ] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("preferences.json");
        fs::write(&path, &bytes).unwrap();
        let store = Store::open(root.path()).unwrap();
        assert!(store.get().is_err());
        assert!(store.put(0, change(Some(4), Some(true))).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
    }
}

#[test]
fn revision_exhaustion_rejects_before_mutating_either_field() {
    let mut snapshot = MarkdownPreferences {
        revision: MAX_REVISION,
        ..Default::default()
    };
    let original = snapshot.clone();
    assert!(snapshot
        .apply(MAX_REVISION, change(Some(-1), Some(true)))
        .is_err());
    assert_eq!(snapshot, original);
    let root = tempfile::tempdir().unwrap();
    let bytes = serde_json::to_vec(&snapshot).unwrap();
    fs::write(root.path().join("preferences.json"), &bytes).unwrap();
    assert!(Store::open(root.path())
        .unwrap()
        .put(MAX_REVISION, change(Some(0), None))
        .is_err());
    assert_eq!(
        fs::read(root.path().join("preferences.json")).unwrap(),
        bytes
    );
}

#[test]
fn simultaneous_instances_have_one_cas_winner_and_no_shared_in_memory_truth() {
    let root = tempfile::tempdir().unwrap();
    let barrier = Arc::new(std::sync::Barrier::new(3));
    let handles: Vec<_> = [change(Some(0), None), change(None, Some(true))]
        .into_iter()
        .map(|update| {
            let barrier = barrier.clone();
            let root = root.path().to_path_buf();
            std::thread::spawn(move || {
                let store = Store::open(&root).unwrap();
                barrier.wait();
                store.put(0, update)
            })
        })
        .collect();
    barrier.wait();
    let results: Vec<_> = handles
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect();
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    let snapshot = Store::open(root.path()).unwrap().get().unwrap();
    assert_eq!(snapshot.revision, 1);
    assert!(
        (snapshot.indent_size == 0 && !snapshot.pretty_indent)
            || (snapshot.indent_size == 2 && snapshot.pretty_indent)
    );
}

#[test]
fn the_os_lock_rejects_competing_access_and_releases_after_its_owner_drops() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    store.get().unwrap();
    let lock = fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(root.path().join("store.lock"))
        .unwrap();
    lock.lock().unwrap();
    assert!(store.get().is_err());
    assert!(store.put(0, change(Some(0), None)).is_err());
    drop(lock);
    assert_eq!(store.put(0, change(Some(0), None)).unwrap().revision, 1);
}

#[test]
fn pending_evidence_limit_never_acknowledges_or_overwrites_the_committed_snapshot() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::open(root.path()).unwrap();
    store.put(0, change(Some(0), None)).unwrap();
    let bytes = fs::read(root.path().join("preferences.json")).unwrap();
    for index in 0..8 {
        fs::write(root.path().join(format!(".pending-{index}")), b"evidence").unwrap();
    }
    assert!(store.put(1, change(Some(5), Some(true))).is_err());
    assert_eq!(
        fs::read(root.path().join("preferences.json")).unwrap(),
        bytes
    );
    for index in 0..8 {
        assert_eq!(
            fs::read(root.path().join(format!(".pending-{index}"))).unwrap(),
            b"evidence"
        );
    }
}

#[cfg(unix)]
#[test]
fn symlink_or_hardlink_metadata_and_locks_never_modify_the_target() {
    for name in ["preferences.json", "store.lock"] {
        for symbolic in [false, true] {
            let root = tempfile::tempdir().unwrap();
            let target = root.path().join("evidence");
            let bytes = serde_json::to_vec(&MarkdownPreferences::default()).unwrap();
            fs::write(&target, &bytes).unwrap();
            if symbolic {
                std::os::unix::fs::symlink(&target, root.path().join(name)).unwrap();
            } else {
                fs::hard_link(&target, root.path().join(name)).unwrap();
            }
            let store = Store::open(root.path()).unwrap();
            assert!(store.get().is_err());
            assert!(store.put(0, change(Some(0), Some(true))).is_err());
            assert_eq!(fs::read(&target).unwrap(), bytes);
        }
    }
}

#[cfg(unix)]
#[test]
fn root_symlinks_are_not_accepted_and_owned_metadata_has_private_modes() {
    use std::os::unix::fs::PermissionsExt;
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("actual")).unwrap();
    std::os::unix::fs::symlink(root.path().join("actual"), root.path().join("alias")).unwrap();
    assert!(Store::open(&root.path().join("alias")).is_err());
    let directory = root.path().join("owned");
    Store::open(&directory)
        .unwrap()
        .put(0, change(Some(-1), Some(true)))
        .unwrap();
    assert_eq!(
        fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
        0o700
    );
    for name in ["preferences.json", "store.lock"] {
        assert_eq!(
            fs::metadata(directory.join(name))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}
