use super::*;

const ID: &str = "0b1f6c1e-6a4e-4f0a-9d53-0f2f7a8f6b11";

fn change(json: &str) -> Change {
    serde_json::from_str(json).unwrap()
}
fn value_change(value: serde_json::Value) -> Change {
    serde_json::from_value(value).unwrap()
}
/// A path that is absolute on the platform under test.
fn abs(name: &str) -> String {
    if cfg!(windows) {
        format!(r"C:\tmp\{name}")
    } else {
        format!("/tmp/{name}")
    }
}

#[test]
fn format_objects_validate_types_and_supported_consumers() {
    for value in [
        r#"{"key":"export.html","value":{"runCommand":true}}"#,
        r#"{"key":"export.html","value":{"sidebar":true}}"#,
        r#"{"key":"export.pdf","value":{"paper.custom":[210,297,1]}}"#,
        r#"{"key":"export.pdf","value":{"splitPages":"true"}}"#,
        r#"{"key":"export.pdf","value":{"paper":null}}"#,
        r#"{"key":"export.pdf","value":{"bookmarks":1}}"#,
        r#"{"key":"export.html","value":{"exportTheme":null}}"#,
        r#"{"key":"export.general","value":{"openLocation":"yes"}}"#,
        r#"{"key":"export.general","value":{"command":"x"}}"#,
        r#"{"key":"export.formats","value":{"docx":{"filter":"x.lua"}}}"#,
    ] {
        assert!(serde_json::from_str::<Change>(value).is_err(), "{value}");
    }
    let long_footer = serde_json::json!({"key":"export.pdf","value":{"footer":"y".repeat(201)}});
    assert!(value_change(long_footer).validate().is_err());
    for value in [
        r#"{"key":"export.html","value":{"exportTheme":"../../night"}}"#,
        r#"{"key":"export.html","value":{"extraCss":"</style><script>x</script>"}}"#,
        r#"{"key":"export.pdf","value":{"paper":"B5"}}"#,
        r#"{"key":"export.pdf","value":{"paper.custom":[0,297]}}"#,
        r#"{"key":"export.pdf","value":{"paper.marginTop":-1}}"#,
        r#"{"key":"export.pdf","value":{"header":"line\nbreak"}}"#,
        r#"{"key":"export.general","value":{"folderMode":"anywhere"}}"#,
        r#"{"key":"export.general","value":{"folder":"relative/path"}}"#,
        r#"{"key":"export.formats","value":{"pdf":{}}}"#,
        r#"{"key":"export.formats","value":{"docx":{"extraArguments":"--lua-filter=a.lua"}}}"#,
        r#"{"key":"export.formats","value":{"docx":{"tocDepth":7}}}"#,
        r#"{"key":"export.formats","value":{"latex":{"referenceDoc":"/a.docx"}}}"#,
        r#"{"key":"export.formats","value":{"docx":{"template":"/a.tex"}}}"#,
    ] {
        assert!(change(value).validate().is_err(), "{value}");
    }
    for value in [
        r#"{"key":"export.pdf","value":{"header":"${title}","footerLeft":"${author}","footerRight":"第 ${pageNo} / ${totalPages} 页","landscape":true,"bookmarks":false,"background":true}}"#,
        r##"{"key":"export.html","value":{"extraCss":"#write{max-width:900px}"}}"##,
        r#"{"key":"export.formats","value":{"docx":{"extraArguments":"--toc --toc-depth=3","toc":true,"tocDepth":3,"numberSections":true},"wiki":{}}}"#,
    ] {
        change(value).validate().unwrap();
    }
}

#[test]
fn cas_persists_only_confirmed_objects_and_preserves_other_format() {
    let mut state = Snapshot::default();
    assert_eq!(
        serde_json::to_value(&state).unwrap(),
        serde_json::json!({"schemaVersion":1,"revision":0,"general":{},"html":{},"pdf":{},"image":{},"formats":{},"custom":[],"pandocPath":""})
    );
    state
        .apply(
            0,
            Change::Html(HtmlSettings {
                export_theme: Some("marklyra-dark".into()),
                ..Default::default()
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
    // Windows cannot delete a directory while the store still holds its handle.
    drop(store);
    std::fs::remove_dir_all(path).unwrap();
}

#[test]
fn corrupt_snapshot_is_rejected_without_reset() {
    for value in [
        serde_json::json!({"schemaVersion":2,"revision":0,"html":{},"pdf":{},"image":{},"pandocPath":""}),
        serde_json::json!({"schemaVersion":1,"revision":9_007_199_254_740_992_u64,"html":{},"pdf":{}}),
        serde_json::json!({"schemaVersion":1,"revision":0,"html":{},"pdf":{},"image":{},"pandocPath":"","command":"x"}),
        serde_json::json!({"schemaVersion":1,"revision":0,"html":{},"pdf":{},"formats":{"pdf":{}}}),
        serde_json::json!({"schemaVersion":1,"revision":0,"html":{},"pdf":{},"pandocPath":"pandoc"}),
    ] {
        let invalid = serde_json::from_value::<Snapshot>(value);
        assert!(invalid.is_err() || invalid.unwrap().validate().is_err());
    }
}

#[test]
fn old_schema_records_preserve_existing_values_and_add_only_absent_defaults() {
    let old = r#"{"schemaVersion":1,"revision":7,"html":{"exportTheme":"marklyra-dark"},"pdf":{"paper":"A5","header":"","footer":""}}"#;
    let mut snapshot: Snapshot = serde_json::from_str(old).unwrap();
    snapshot.validate().unwrap();
    assert_eq!(snapshot.image, ImageSettings::default());
    assert_eq!(snapshot.general, GeneralSettings::default());
    assert!(snapshot.formats.is_empty() && snapshot.custom.is_empty());
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
                ..Default::default()
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

#[test]
fn retired_export_themes_resolve_to_the_branded_pair_on_read() {
    for (old, current) in [
        ("github", "marklyra-light"),
        ("gothic", "marklyra-light"),
        ("night", "marklyra-dark"),
    ] {
        let value: HtmlSettings =
            serde_json::from_value(serde_json::json!({"exportTheme": old})).unwrap();
        assert_eq!(value.export_theme.as_deref(), Some(current));
        value.validate().unwrap();
    }
}

#[test]
fn typed_paths_are_refused_and_only_dialog_results_are_stored() {
    let mut state = Snapshot::default();
    // A path can never be written through the generic change channel.
    for value in [
        serde_json::json!({"key":"export.general","value":{"folderMode":"custom","folder":abs("out")}}),
        serde_json::json!({"key":"export.formats","value":{"docx":{"referenceDoc":abs("ref.docx")}}}),
        serde_json::json!({"key":"pandocPath","value":abs("pandoc")}),
    ] {
        assert!(
            state.apply(0, value_change(value.clone())).is_err(),
            "{value}"
        );
    }
    assert_eq!(state, Snapshot::default());
    state
        .apply_path(0, &PathTarget::Folder, &abs("out"))
        .unwrap();
    assert_eq!(state.general.folder.as_deref(), Some(abs("out").as_str()));
    assert_eq!(state.general.folder_mode.as_deref(), Some("custom"));
    state
        .apply_path(
            1,
            &PathTarget::ReferenceDoc {
                format: "docx".into(),
            },
            &abs("ref.docx"),
        )
        .unwrap();
    assert_eq!(state.revision, 2);
    // Re-sending the stored path (an unrelated edit of the same object) is accepted; a different
    // one is not, and clearing is always allowed.
    let keep = serde_json::json!({"key":"export.formats","value":{"docx":{"referenceDoc":abs("ref.docx"),"toc":true}}});
    state.apply(2, value_change(keep)).unwrap();
    let other = serde_json::json!({"key":"export.formats","value":{"docx":{"referenceDoc":abs("other.docx")}}});
    assert!(state.apply(3, value_change(other)).is_err());
    state
        .apply(
            3,
            change(r#"{"key":"export.formats","value":{"docx":{"referenceDoc":""}}}"#),
        )
        .unwrap();
    assert_eq!(
        state
            .pandoc_options("docx")
            .unwrap()
            .reference_doc
            .as_deref(),
        Some("")
    );
    // Wrong kind of document, unknown format and stale revision never change anything.
    let before = state.clone();
    let any = abs("x");
    for (revision, target) in [
        (
            4,
            PathTarget::Template {
                format: "docx".into(),
            },
        ),
        (
            4,
            PathTarget::ReferenceDoc {
                format: "latex".into(),
            },
        ),
        (
            4,
            PathTarget::ReferenceDoc {
                format: "pdf".into(),
            },
        ),
        (
            4,
            PathTarget::ReferenceDoc {
                format: "custom:missing".into(),
            },
        ),
        (
            0,
            PathTarget::Template {
                format: "latex".into(),
            },
        ),
    ] {
        assert!(state.apply_path(revision, &target, &any).is_err());
    }
    assert!(state
        .apply_path(4, &PathTarget::Folder, "relative")
        .is_err());
    assert_eq!(state, before);
}

#[test]
fn custom_exports_are_bounded_unique_and_never_executable_outputs() {
    let valid = |id: &str, writer: &str, extension: &str| {
        format!(
            r#"{{"id":"{id}","name":"AsciiDoc","writer":"{writer}","extension":"{extension}","options":{{"extraArguments":"--toc"}}}}"#
        )
    };
    let key = |item: String| format!(r#"{{"key":"export.custom","value":[{item}]}}"#);
    change(&key(valid(ID, "asciidoc", "adoc")))
        .validate()
        .unwrap();
    change(&key(valid(ID, "markdown+pipe_tables-smart", "md")))
        .validate()
        .unwrap();
    for item in [
        valid("not-a-uuid", "asciidoc", "adoc"),
        valid(ID, "pdf", "pdf"),
        valid(ID, "chunkedhtml", "zip"),
        valid(ID, "../x", "adoc"),
        valid(ID, "my.lua", "adoc"),
        valid(ID, "asciidoc", "exe"),
        valid(ID, "asciidoc", "ps1"),
        valid(ID, "asciidoc", ""),
        valid(ID, "asciidoc", "a.b"),
        valid(ID, "asciidoc", "TOOLONGEXTENSION"),
        valid(ID, "Asciidoc", "adoc"),
        valid(ID, "", "adoc"),
        valid(ID, "docx", "docx").replace(
            r#""options":{"extraArguments":"--toc"}"#,
            r#""options":{"template":"/a.tex"}"#,
        ),
    ] {
        assert!(change(&key(item.clone())).validate().is_err(), "{item}");
    }
    let duplicate = format!(
        r#"{{"key":"export.custom","value":[{0},{0}]}}"#,
        valid(ID, "asciidoc", "adoc")
    );
    assert!(change(&duplicate).validate().is_err());
    let many: Vec<String> = (0..13)
        .map(|_| valid(&uuid::Uuid::new_v4().to_string(), "asciidoc", "adoc"))
        .collect();
    assert!(change(&format!(
        r#"{{"key":"export.custom","value":[{}]}}"#,
        many.join(",")
    ))
    .validate()
    .is_err());
    // A custom export resolves through the same lookup as a built-in format.
    let mut state = Snapshot::default();
    state
        .apply(0, change(&key(valid(ID, "asciidoc", "adoc"))))
        .unwrap();
    assert_eq!(state.custom_export(ID).unwrap().writer, "asciidoc");
    assert!(state.pandoc_options(&format!("custom:{ID}")).is_some());
    assert!(state.pandoc_options("custom:missing").is_none());
    assert!(state.pandoc_options("pdf").is_none());
    assert_eq!(builtin_writer("wiki"), Some("mediawiki"));
    assert_eq!(builtin_writer("docx"), Some("docx"));
    assert_eq!(builtin_writer("html"), None);
    state
        .apply_path(
            1,
            &PathTarget::Template {
                format: format!("custom:{ID}"),
            },
            &abs("t.tex"),
        )
        .unwrap();
    assert_eq!(
        state.custom_export(ID).unwrap().options.template.as_deref(),
        Some(abs("t.tex").as_str())
    );
}

#[test]
fn a_full_record_fits_the_store_limit() {
    let mut state = Snapshot::default();
    let text = "x".repeat(200);
    state.pdf = PdfSettings {
        header_left: Some(text.clone()),
        header: Some(text.clone()),
        header_right: Some(text.clone()),
        footer_left: Some(text.clone()),
        footer: Some(text.clone()),
        footer_right: Some(text),
        extra_css: Some("a{}".repeat(5000)),
        ..Default::default()
    };
    state.html.extra_css = Some("a{}".repeat(5000));
    state.image.extra_css = Some("a{}".repeat(5000));
    for key in FORMAT_KEYS {
        state.formats.insert(
            key.into(),
            PandocFormat {
                extra_arguments: Some(format!("-V k:{} ", "x".repeat(190)).repeat(4)),
                ..Default::default()
            },
        );
    }
    state.validate().unwrap();
    assert!(serde_json::to_vec(&state).unwrap().len() < Snapshot::MAX_BYTES);
}
