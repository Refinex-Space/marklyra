use super::*;

#[test]
fn link_hint_suppression_survives_store_reopen_and_rejects_non_boolean_values() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::<Snapshot>::open(root.path()).unwrap();
    store
        .transaction(|state| {
            state.apply(0, change(Key::NoHintForOpenLink, Value::Boolean(true)))?;
            Ok(((), true))
        })
        .unwrap();
    let loaded = Store::<Snapshot>::open(root.path()).unwrap().get().unwrap();
    assert_eq!(
        loaded.values.get(&Key::NoHintForOpenLink),
        Some(&Value::Boolean(true))
    );
    assert!(serde_json::to_string(&loaded)
        .unwrap()
        .contains("noHintForOpenLink"));
    assert!(change(Key::NoHintForOpenLink, Value::Text("true".into()))
        .validate()
        .is_err());
    for _ in 0..2 {
        store
            .transaction(|state| {
                let changed = state.reset_link_hint()?;
                Ok(((), changed))
            })
            .unwrap();
    }
    let reset = Store::<Snapshot>::open(root.path()).unwrap().get().unwrap();
    assert_eq!(
        reset.values.get(&Key::NoHintForOpenLink),
        Some(&Value::Boolean(false))
    );
    assert_eq!(reset.revision, 2);
}

#[test]
fn debug_mode_is_an_opt_in_boolean_and_persists_without_touching_other_preferences() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::<Snapshot>::open(root.path()).unwrap();
    assert!(!store.get().unwrap().values.contains_key(&Key::DebugMode));
    for (expected, enabled) in [(0, true), (1, false)] {
        store
            .transaction(|state| {
                state.apply(
                    expected,
                    Change {
                        key: Key::DebugMode,
                        value: Value::Boolean(enabled),
                    },
                )?;
                Ok(((), true))
            })
            .unwrap();
        assert_eq!(
            Store::<Snapshot>::open(root.path())
                .unwrap()
                .get()
                .unwrap()
                .values
                .get(&Key::DebugMode),
            Some(&Value::Boolean(enabled))
        );
    }
    assert!(Change {
        key: Key::DebugMode,
        value: Value::Text("true".into())
    }
    .validate()
    .is_err());
}
use std::fs;
fn change(key: Key, value: Value) -> Change {
    Change { key, value }
}
#[test]
fn old_local_preferences_are_not_overwritten_by_an_empty_native_profile() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::<Snapshot>::open(root.path()).unwrap();
    assert_eq!(store.get().unwrap(), Snapshot::default());
    assert!(!root.path().join("preferences.json").exists());
}
#[test]
fn cas_roundtrip_reopen_and_stale_patch_preserve_unrelated_values() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::<Snapshot>::open(root.path()).unwrap();
    let first = store
        .transaction(|s| {
            s.apply(0, change(Key::CopyMarkdownByDefault, Value::Boolean(true)))?;
            Ok((s.clone(), true))
        })
        .unwrap();
    let second = Store::<Snapshot>::open(root.path()).unwrap();
    let old = fs::read(root.path().join("preferences.json")).unwrap();
    assert!(second
        .transaction(|s| {
            s.apply(0, change(Key::EnableAutoSave, Value::Boolean(true)))?;
            Ok((s.clone(), true))
        })
        .is_err());
    assert_eq!(fs::read(root.path().join("preferences.json")).unwrap(), old);
    assert_eq!(second.get().unwrap(), first);
    let next = second
        .transaction(|s| {
            s.apply(1, change(Key::EnableAutoSave, Value::Boolean(true)))?;
            Ok((s.clone(), true))
        })
        .unwrap();
    assert_eq!(next.values.len(), 2);
    assert_eq!(next.revision, 2);
}
#[test]
fn invalid_types_extra_authority_and_future_schemas_fail_closed() {
    for body in [
        r#"{"key":"customFontSize","value":true}"#,
        r#"{"key":"codeIndentSize","value":1}"#,
        r#"{"key":"enableAutoSave","value":1}"#,
    ] {
        assert!(serde_json::from_str::<Change>(body)
            .unwrap()
            .validate()
            .is_err());
    }
    for body in [
        r#"{"key":"execCommand","value":true}"#,
        r#"{"key":"enableAutoSave","value":true,"path":"/tmp/x"}"#,
    ] {
        assert!(serde_json::from_str::<Change>(body).is_err());
    }
    let mut s = Snapshot {
        schema_version: 2,
        ..Snapshot::default()
    };
    assert!(s
        .apply(0, change(Key::EnableAutoSave, Value::Boolean(false)))
        .is_err());
}
#[test]
fn corrupt_store_and_failed_writes_never_reset_saved_settings() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::<Snapshot>::open(root.path()).unwrap();
    fs::write(root.path().join("preferences.json"), b"{damaged").unwrap();
    assert!(store.get().is_err());
    assert!(store
        .transaction(|s| {
            s.apply(0, change(Key::EnableAutoSave, Value::Boolean(true)))?;
            Ok(((), true))
        })
        .is_err());
    assert_eq!(
        fs::read(root.path().join("preferences.json")).unwrap(),
        b"{damaged"
    );
}
#[test]
fn all_supported_keys_validate_before_advancing_revision() {
    let mut s = Snapshot::default();
    for key in [
        Key::UseCustomFontSize,
        Key::NoPairingMatch,
        Key::AutoPairExtendSymbol,
        Key::NoEmojiAutoComplete,
        Key::ExpandSimpleBlock,
        Key::ShiftTabAutoIndent,
        Key::ShowLineNumbersForFence,
        Key::NoLineWrapping,
        Key::LineWiseCopyCut,
        Key::NoMidCaret,
        Key::CopyMarkdownByDefault,
        Key::EnableAutoSave,
        Key::NoHintForOpenLink,
    ] {
        s.apply(s.revision, change(key, Value::Boolean(true)))
            .unwrap();
    }
    s.apply(s.revision, change(Key::CustomFontSize, Value::Number(13.5)))
        .unwrap();
    s.apply(s.revision, change(Key::CodeIndentSize, Value::Number(3.0)))
        .unwrap();
    assert_eq!(s.values.len(), 15);
    assert!(s.validate().is_ok());
}

#[test]
fn startup_flags_and_extended_values_are_bounded_and_persist_only_overrides() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::<Snapshot>::open(root.path()).unwrap();
    for key in [
        "strict_mode",
        "enable_inline_math",
        "enable_highlight",
        "enable_subscript",
        "enable_superscript",
        "enable_diagram",
        "enableAlert",
        "noAutoLink",
        "ignoreLineBreak",
        "hideBrAndLineBreak",
        "indentFirstLine",
    ] {
        for value in [true, false] {
            let change: Change =
                serde_json::from_value(serde_json::json!({"key":key,"value":value})).unwrap();
            let before = store.get().unwrap();
            let next = store
                .transaction(|s| {
                    s.apply(before.revision, change)?;
                    Ok((s.clone(), true))
                })
                .unwrap();
            assert_eq!(next.revision, before.revision + 1);
        }
    }
    for (key, value) in [
        ("zoomFactor", serde_json::json!(1.25)),
        ("line_ending_crlf", serde_json::json!(true)),
        ("defaultCodeLang", serde_json::json!("javascript")),
        ("defaultCodeLangOption", serde_json::json!(3)),
    ] {
        let change: Change =
            serde_json::from_value(serde_json::json!({"key":key,"value":value})).unwrap();
        let before = store.get().unwrap();
        store
            .transaction(|s| {
                s.apply(before.revision, change)?;
                Ok(((), true))
            })
            .unwrap();
    }
    let saved = store.get().unwrap();
    assert_eq!(
        Store::<Snapshot>::open(root.path()).unwrap().get().unwrap(),
        saved
    );
    assert_eq!(saved.values.len(), 15);
    for (key, value) in [
        ("zoomFactor", serde_json::json!(9)),
        ("defaultCodeLang", serde_json::json!("bad\nmode")),
        ("defaultCodeLangOption", serde_json::json!(8)),
    ] {
        assert!(
            serde_json::from_value::<Change>(serde_json::json!({"key":key,"value":value}))
                .unwrap()
                .validate()
                .is_err()
        );
    }
}

#[test]
fn reading_speed_and_its_custom_flag_commit_as_one_revision() {
    let root = tempfile::tempdir().unwrap();
    let store = Store::<Snapshot>::open(root.path()).unwrap();
    let one = store
        .transaction(|s| {
            s.apply(0, change(Key::WordsPerMinute, Value::Number(120.0)))?;
            Ok((s.clone(), true))
        })
        .unwrap();
    assert_eq!(one.revision, 1);
    assert_eq!(
        one.values.get(&Key::CustomWordsPerMinute),
        Some(&Value::Boolean(true))
    );
    let two = store
        .transaction(|s| {
            s.apply(1, change(Key::CustomWordsPerMinute, Value::Boolean(false)))?;
            Ok((s.clone(), true))
        })
        .unwrap();
    assert_eq!(two.revision, 2);
    assert_eq!(
        two.values.get(&Key::WordsPerMinute),
        Some(&Value::Number(382.0))
    );
    assert!(change(Key::WordsPerMinute, Value::Number(0.0))
        .validate()
        .is_err());
    assert!(change(Key::WordsPerMinute, Value::Number(1000.0))
        .validate()
        .is_err());
    assert!(change(Key::WordsPerMinute, Value::Boolean(true))
        .validate()
        .is_err());
}

#[test]
fn zoom_steps_follow_original_levels_and_keep_a_bounded_end() {
    for (scale, higher, lower) in [
        (0.25, 0.33, 0.25),
        (0.33, 0.5, 0.25),
        (1.0, 1.1, 0.9),
        (2.0, 2.5, 1.75),
        (3.0, 4.0, 2.5),
        (4.0, 5.0, 3.0),
        (5.0, 5.0, 4.0),
    ] {
        assert_eq!(next_zoom(scale, ZoomDirection::In), higher);
        assert_eq!(next_zoom(scale, ZoomDirection::Out), lower);
    }
}
#[test]
fn editor_entry_cannot_write_parser_lifecycle_or_arbitrary_application_fields() {
    assert!(editor_change_allowed(&Key::DarkTheme));
    assert!(editor_change_allowed(&Key::CanCollapseOutlinePanel));
    assert!(editor_change_allowed(&Key::NoHintForOpenLink));
    for key in [
        Key::ZoomFactor,
        Key::EnableAutoSave,
        Key::QuitAfterWindowClose,
        Key::AllowPhysicsConflict,
    ] {
        assert!(!editor_change_allowed(&key));
    }
    for (key, good, bad) in [
        (Key::DarkTheme, "marklyra-dark.css", "../secret.css"),
        (Key::AutoNumberingForMath, "all", "custom"),
        (Key::MathFormatOnCopy, "latex", "png"),
    ] {
        assert!(change(key.clone(), Value::Text(good.into()))
            .validate()
            .is_ok());
        assert!(change(key, Value::Text(bad.into())).validate().is_err());
    }
}
