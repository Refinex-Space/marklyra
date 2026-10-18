use super::*;

#[test]
fn format_objects_validate_types_and_supported_consumers() {
    for value in [
        r#"{"key":"export.html","value":{"runCommand":true}}"#,
        r#"{"key":"export.html","value":{"sidebar":true}}"#,
        r#"{"key":"export.pdf","value":{"paper.custom":[210,297,1]}}"#,
        r#"{"key":"export.pdf","value":{"splitPages":"true"}}"#,
        r#"{"key":"export.pdf","value":{"author":"x"}}"#,
        r#"{"key":"export.pdf","value":{"paper":null}}"#,
        r#"{"key":"export.html","value":{"exportTheme":null}}"#,
    ] {
        assert!(serde_json::from_str::<Change>(value).is_err());
    }
    for value in [
        r#"{"key":"export.html","value":{"exportTheme":"../../night"}}"#,
        r#"{"key":"export.pdf","value":{"paper":"B5"}}"#,
        r#"{"key":"export.pdf","value":{"paper.custom":[0,297]}}"#,
        r#"{"key":"export.pdf","value":{"paper.marginTop":-1}}"#,
        r#"{"key":"export.pdf","value":{"header":"${pageNo}"}}"#,
    ] {
        assert!(serde_json::from_str::<Change>(value)
            .unwrap()
            .validate()
            .is_err());
    }
}

#[test]
fn cas_persists_only_confirmed_objects_and_preserves_other_format() {
    let mut state = Snapshot::default();
    assert_eq!(
        serde_json::to_value(&state).unwrap(),
        serde_json::json!({"schemaVersion":1,"revision":0,"html":{},"pdf":{},"image":{},"pandocPath":""})
    );
    state
        .apply(
            0,
            Change::Html(HtmlSettings {
                export_theme: Some("night".into()),
            }),
        )
        .unwrap();
    let committed = state.clone();
    assert!(state
        .apply(0, Change::Html(HtmlSettings::default()))
        .is_err());
    assert_eq!(state, committed);
    state
        .apply(
            1,
            Change::Pdf(PdfSettings {
                paper: Some("A5".into()),
                paper_margin: Some("custom".into()),
                paper_margin_top: Some(12.0),
                split_pages: Some(true),
                ..Default::default()
            }),
        )
        .unwrap();
    assert_eq!(state.html, committed.html);
    assert_eq!(state.revision, 2);
    let path = std::env::temp_dir().join(format!("marklyra-export-prefs-{}", uuid::Uuid::new_v4()));
    let store = Store::<Snapshot>::open(&path).unwrap();
    store
        .transaction(|current| {
            *current = state.clone();
            Ok(((), true))
        })
        .unwrap();
    assert_eq!(store.get().unwrap(), state);
    std::fs::remove_dir_all(path).unwrap();
}

#[test]
fn corrupt_snapshot_is_rejected_without_reset() {
    for value in [
        serde_json::json!({"schemaVersion":2,"revision":0,"html":{},"pdf":{},"image":{},"pandocPath":""}),
        serde_json::json!({"schemaVersion":1,"revision":9_007_199_254_740_992_u64,"html":{},"pdf":{}}),
        serde_json::json!({"schemaVersion":1,"revision":0,"html":{},"pdf":{},"image":{},"pandocPath":"","command":"x"}),
    ] {
        let invalid = serde_json::from_value::<Snapshot>(value);
        assert!(invalid.is_err() || invalid.unwrap().validate().is_err());
    }
}

#[test]
fn old_schema_records_preserve_existing_values_and_add_only_absent_image_defaults() {
    let old =
        r#"{"schemaVersion":1,"revision":7,"html":{"exportTheme":"night"},"pdf":{"paper":"A5"}}"#;
    let mut snapshot: Snapshot = serde_json::from_str(old).unwrap();
    snapshot.validate().unwrap();
    assert_eq!(snapshot.image, ImageSettings::default());
    assert!(snapshot.pandoc_path.is_empty());
    let before = snapshot.clone();
    snapshot
        .apply(
            7,
            Change::Image(ImageSettings {
                image_width: Some(640),
                quality: Some(2),
                use_theme_font_size: Some(0),
                image_font_size: Some(24),
                export_theme: None,
            }),
        )
        .unwrap();
    assert_eq!(snapshot.html, before.html);
    assert_eq!(snapshot.pdf, before.pdf);
    assert_eq!(snapshot.revision, 8);
    assert!(
        serde_json::from_str::<Change>(r#"{"key":"export.image","value":{"quality":"2"}}"#)
            .is_err()
    );
    assert!(
        serde_json::from_str::<Change>(r#"{"key":"export.image","value":{"imageWidth":0}}"#)
            .unwrap()
            .validate()
            .is_err()
    );
    assert!(serde_json::from_str::<Change>(
        r#"{"key":"export.image","value":{"runCommand":true}}"#
    )
    .is_err());
}
