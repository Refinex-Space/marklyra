use document_service::{DocumentService, Encoding};
use file_index::{IndexError, SearchOptions, Workspace, WorkspaceRegistry, TEXT_EXTENSIONS};
use std::{collections::BTreeSet, fs, path::Path, sync::Arc};

fn setup(path: &Path) -> Arc<Workspace> {
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(path).unwrap();
    registry.get(&selected.id).unwrap()
}
fn listed(workspace: &Workspace, extra: Option<&str>) -> BTreeSet<String> {
    workspace
        .list_directory_with_extension("", extra)
        .unwrap()
        .entries
        .into_iter()
        .filter(|entry| entry.kind == file_index::EntryKind::File)
        .map(|entry| entry.relative_path)
        .collect()
}
fn articles(workspace: &Workspace, extra: Option<&str>) -> BTreeSet<String> {
    workspace
        .list_documents_with_extension_and_entry_filter(extra, |_| true)
        .unwrap()
        .entries
        .into_iter()
        .map(|entry| entry.relative_path)
        .collect()
}
fn options() -> SearchOptions<'static> {
    SearchOptions {
        query: "needle",
        case_sensitive: true,
        whole_word: false,
        use_regex: false,
        max_results: 500,
    }
}
fn searched(workspace: &Workspace, extra: Option<&str>) -> BTreeSet<String> {
    workspace
        .search_with_extension(options(), extra)
        .unwrap()
        .matches
        .into_iter()
        .map(|entry| entry.relative_path)
        .collect()
}
fn names(values: &[&str]) -> BTreeSet<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

#[test]
fn shared_constant_has_fifteen_suffixes_without_the_extensionless_rule() {
    assert_eq!(TEXT_EXTENSIONS.len(), 15);
    assert_eq!(names(TEXT_EXTENSIONS).len(), 15);
    assert!(TEXT_EXTENSIONS.contains(&"apib"));
    assert!(!TEXT_EXTENSIONS.contains(&""));
    let root = tempfile::tempdir().unwrap();
    for extension in TEXT_EXTENSIONS {
        fs::write(
            root.path()
                .join(format!("doc.{}", extension.to_uppercase())),
            "needle",
        )
        .unwrap();
    }
    fs::write(root.path().join("README"), "needle").unwrap();
    let workspace = setup(root.path());
    assert_eq!(listed(&workspace, None).len(), 16);
    assert_eq!(articles(&workspace, None).len(), 16);
    assert_eq!(searched(&workspace, None).len(), 16);
    let mut documents = DocumentService::new();
    for extension in TEXT_EXTENSIONS {
        assert_eq!(
            workspace
                .open_document(&format!("doc.{}", extension.to_uppercase()), &mut documents)
                .unwrap()
                .text,
            "needle"
        );
    }
    assert_eq!(
        workspace
            .open_document("README", &mut documents)
            .unwrap()
            .text,
        "needle"
    );
}

#[test]
fn custom_extension_is_supported_by_every_operation_without_changing_default_calls() {
    let root = tempfile::tempdir().unwrap();
    for name in [
        "base.md",
        "README",
        "api.apib",
        "draft.CuStOm",
        "other.alt",
        ".hidden.custom",
    ] {
        fs::write(root.path().join(name), "needle").unwrap();
    }
    let workspace = setup(root.path());
    let default = names(&["base.md", "README", "api.apib"]);
    let extended = names(&["base.md", "README", "api.apib", "draft.CuStOm"]);
    for collect in [listed, articles, searched] {
        assert_eq!(collect(&workspace, None), default);
        assert_eq!(collect(&workspace, Some("custom")), extended);
        assert_eq!(collect(&workspace, None), default);
    }
    let mut documents = DocumentService::new();
    assert!(matches!(
        workspace.open_document("draft.CuStOm", &mut documents),
        Err(IndexError::NotMarkdown)
    ));
    let opened = workspace
        .open_document_with_extension("draft.CuStOm", &mut documents, Some("CUSTOM"))
        .unwrap();
    assert_eq!(opened.text, "needle");
    assert!(matches!(
        workspace.open_document_with_extension("draft.CuStOm", &mut documents, Some("alt")),
        Err(IndexError::NotMarkdown)
    ));
    assert!(matches!(
        workspace.open_document_with_extension(".hidden.custom", &mut documents, Some("custom")),
        Err(IndexError::NotMarkdown)
    ));
    assert_eq!(
        workspace.list_directory("").unwrap().entries.len(),
        default.len()
    );
    assert_eq!(
        workspace.list_documents().unwrap().entries.len(),
        default.len()
    );
    assert_eq!(
        workspace.search(options()).unwrap().matches.len(),
        default.len()
    );
}

#[test]
fn concurrent_operations_cannot_change_another_calls_extension_policy() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("one.alpha"), "needle").unwrap();
    fs::write(root.path().join("two.beta"), "needle").unwrap();
    let workspace = setup(root.path());
    std::thread::scope(|scope| {
        for (extra, expected) in [("alpha", "one.alpha"), ("beta", "two.beta")] {
            let workspace = &workspace;
            scope.spawn(move || {
                for collect in [listed, articles, searched] {
                    assert_eq!(collect(workspace, Some(extra)), names(&[expected]));
                }
                assert_eq!(
                    workspace
                        .open_document_with_extension(
                            expected,
                            &mut DocumentService::new(),
                            Some(extra)
                        )
                        .unwrap()
                        .text,
                    "needle"
                );
            });
        }
    });
    assert!(listed(&workspace, None).is_empty());
    assert!(articles(&workspace, None).is_empty());
    assert!(searched(&workspace, None).is_empty());
}

#[test]
fn extra_matches_the_complete_suffix_without_enabling_its_individual_parts() {
    let root = tempfile::tempdir().unwrap();
    for name in [
        "note.foo.bar",
        "note.bar",
        "plain.foo",
        "upper.FOO.BAR",
        "note.notfoo.bar",
        ".hidden.foo.bar",
    ] {
        fs::write(root.path().join(name), "needle").unwrap();
    }
    let workspace = setup(root.path());
    for collect in [listed, articles, searched] {
        assert_eq!(
            collect(&workspace, Some("foo.bar")),
            names(&["note.foo.bar", "upper.FOO.BAR"])
        );
        assert_eq!(
            collect(&workspace, Some("BAR")),
            names(&[
                "note.foo.bar",
                "note.bar",
                "upper.FOO.BAR",
                "note.notfoo.bar"
            ])
        );
        assert_eq!(collect(&workspace, Some("foo")), names(&["plain.foo"]));
    }
    assert_eq!(
        workspace
            .open_document_with_extension(
                "note.foo.bar",
                &mut DocumentService::new(),
                Some("foo.bar")
            )
            .unwrap()
            .text,
        "needle"
    );
    for denied in [
        "note.bar",
        "plain.foo",
        "note.notfoo.bar",
        ".hidden.foo.bar",
    ] {
        assert!(matches!(
            workspace.open_document_with_extension(
                denied,
                &mut DocumentService::new(),
                Some("foo.bar")
            ),
            Err(IndexError::NotMarkdown)
        ));
    }
    assert_eq!(
        workspace
            .open_document_with_extension("note.foo.bar", &mut DocumentService::new(), Some("bar"))
            .unwrap()
            .text,
        "needle"
    );
}

#[test]
fn newly_created_multi_suffix_file_can_be_listed_opened_and_saved_only_under_its_policy() {
    let root = tempfile::tempdir().unwrap();
    let workspace = setup(root.path());
    let created = workspace
        .create_untitled(
            &uuid::Uuid::new_v4().to_string(),
            "",
            file_index::EntryKind::File,
            "foo.bar",
        )
        .unwrap();
    assert_eq!(created.name, "Untitled.foo.bar");
    let mut documents = DocumentService::new();
    assert!(matches!(
        workspace.open_document(&created.relative_path, &mut documents),
        Err(IndexError::NotMarkdown)
    ));
    let opened = workspace
        .open_document_with_extension(&created.relative_path, &mut documents, Some("foo.bar"))
        .unwrap();
    assert_eq!(opened.text, "");
    documents.save(&opened.id, "needle\r\n中文 ").unwrap();
    for collect in [listed, articles, searched] {
        assert_eq!(
            collect(&workspace, Some("foo.bar")),
            names(&["Untitled.foo.bar"])
        );
        assert!(collect(&workspace, None).is_empty());
        assert!(collect(&workspace, Some("foo")).is_empty());
    }
    assert_eq!(
        fs::read(root.path().join(&created.relative_path)).unwrap(),
        "needle\r\n中文 ".as_bytes()
    );
    let next = workspace
        .create_untitled(
            &uuid::Uuid::new_v4().to_string(),
            "",
            file_index::EntryKind::File,
            "foo.bar",
        )
        .unwrap();
    assert_eq!(next.name, "Untitled 1.foo.bar");
}

#[test]
fn custom_read_keeps_entry_filter_encoding_byte_preservation_and_scan_limits() {
    let root = tempfile::tempdir().unwrap();
    let original = Encoding::Utf16BeBom.encode("needle\r\n原文\n").unwrap();
    fs::write(root.path().join("编码.custom"), &original).unwrap();
    fs::write(root.path().join("blocked.custom"), b"x").unwrap();
    fs::create_dir(root.path().join(".hidden")).unwrap();
    fs::write(root.path().join(".hidden/secret.custom"), "needle").unwrap();
    let workspace = setup(root.path());
    let report = workspace
        .list_documents_with_extension_and_entry_filter(Some("custom"), |handle| {
            handle.metadata().unwrap().is_dir() || handle.metadata().unwrap().len() != 1
        })
        .unwrap();
    assert_eq!(report.entries.len(), 1);
    assert_eq!(report.entries[0].summary, "needle\r\n原文\n");
    assert_eq!(report.skipped.ignored, 2);
    assert_eq!(report.read_bytes, original.len());
    let path = root.path().join("编码.custom");
    let modified = fs::metadata(&path).unwrap().modified().unwrap();
    let mut documents = DocumentService::new();
    let opened = workspace
        .open_document_with_extension("编码.custom", &mut documents, Some("custom"))
        .unwrap();
    assert_eq!(opened.encoding, "UTF-16BE BOM");
    documents.save(&opened.id, &opened.text).unwrap();
    assert_eq!(fs::read(&path).unwrap(), original);
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), modified);
    let limit_root = tempfile::tempdir().unwrap();
    for index in 0..401 {
        fs::write(limit_root.path().join(format!("{index}.custom")), "needle").unwrap();
    }
    let report = setup(limit_root.path())
        .list_documents_with_extension_and_entry_filter(Some("custom"), |_| true)
        .unwrap();
    assert_eq!(report.entries.len(), 400);
    assert!(report.truncated);
    fs::File::create(root.path().join("huge.custom"))
        .unwrap()
        .set_len(2 * 1024 * 1024 + 1)
        .unwrap();
    assert_eq!(
        workspace
            .search_with_extension(options(), Some("custom"))
            .unwrap()
            .skipped
            .too_large,
        1
    );
}

#[test]
fn custom_extension_never_relaxes_relative_path_validation() {
    let root = tempfile::tempdir().unwrap();
    let workspace = setup(root.path());
    for path in [
        "../a.custom",
        "a/../b.custom",
        "/tmp/a.custom",
        "C:/a.custom",
        "a\\b.custom",
        "a\0.custom",
        "a//b.custom",
    ] {
        assert!(matches!(
            workspace.list_directory_with_extension(path, Some("custom")),
            Err(IndexError::InvalidPath)
        ));
        assert!(matches!(
            workspace.open_document_with_extension(
                path,
                &mut DocumentService::new(),
                Some("custom")
            ),
            Err(IndexError::InvalidPath)
        ));
    }
}

#[cfg(unix)]
#[test]
fn extra_suffix_does_not_follow_file_or_parent_symlinks() {
    use std::os::unix::fs::symlink;
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.custom"), "needle outside").unwrap();
    symlink(outside.path(), root.path().join("escape")).unwrap();
    symlink(
        outside.path().join("secret.custom"),
        root.path().join("escape.custom"),
    )
    .unwrap();
    let workspace = setup(root.path());
    assert!(matches!(
        workspace.list_directory_with_extension("escape", Some("custom")),
        Err(IndexError::InvalidPath)
    ));
    for path in ["escape/secret.custom", "escape.custom"] {
        assert!(matches!(
            workspace.open_document_with_extension(
                path,
                &mut DocumentService::new(),
                Some("custom")
            ),
            Err(IndexError::InvalidPath)
        ));
    }
    assert!(listed(&workspace, Some("custom")).is_empty());
    let search = workspace
        .search_with_extension(options(), Some("custom"))
        .unwrap();
    assert!(search.matches.is_empty());
    assert_eq!(search.skipped.symlinks, 2);
    let report = workspace
        .list_documents_with_extension_and_entry_filter(Some("custom"), |_| true)
        .unwrap();
    assert!(report.entries.is_empty());
    assert_eq!(report.skipped.symlinks, 2);
    assert_eq!(
        fs::read(outside.path().join("secret.custom")).unwrap(),
        b"needle outside"
    );
}
