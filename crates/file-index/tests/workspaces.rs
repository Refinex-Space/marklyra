use document_service::{DocumentError, DocumentService};
use file_index::{
    EntryKind, IndexError, SearchOptions, Workspace, WorkspaceRegistry, MAX_DIRECTORY_ENTRIES,
};
use std::{fs, path::Path, sync::Arc};

fn setup(path: &Path) -> Arc<Workspace> {
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(path).unwrap();
    registry.get(&selected.id).unwrap()
}
fn search(workspace: &Workspace, query: &str) -> file_index::SearchReport {
    workspace
        .search(SearchOptions {
            query,
            case_sensitive: true,
            whole_word: false,
            use_regex: false,
            max_results: 200,
        })
        .unwrap()
}

#[test]
fn browse_real_directories_markdown_and_chinese_names() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("资料")).unwrap();
    fs::write(root.path().join("README.MD"), "hello").unwrap();
    fs::write(root.path().join("ignored.png"), b"png").unwrap();
    fs::write(root.path().join("资料/学习🙂.markdown"), "中文").unwrap();
    let workspace = setup(root.path());
    let list = workspace.list_directory("").unwrap();
    assert!(!list.truncated);
    assert_eq!(list.entries.len(), 2);
    assert_eq!(list.entries[0].kind, EntryKind::Directory);
    assert_eq!(list.entries[0].name, "资料");
    assert_eq!(list.entries[1].size, Some(5));
    let child = workspace.list_directory("资料").unwrap();
    assert_eq!(child.entries[0].relative_path, "资料/学习🙂.markdown");
    let mut documents = DocumentService::new();
    let doc = workspace
        .open_document(&child.entries[0].relative_path, &mut documents)
        .unwrap();
    assert_eq!(doc.text, "中文");
    documents.save(&doc.id, "编辑\r\n").unwrap();
    assert_eq!(
        fs::read(root.path().join("资料/学习🙂.markdown")).unwrap(),
        "编辑\r\n".as_bytes()
    );
}

#[test]
fn rejects_all_parent_absolute_and_platform_prefix_paths() {
    let root = tempfile::tempdir().unwrap();
    let workspace = setup(root.path());
    let mut documents = DocumentService::new();
    for invalid in [
        "../secret.md",
        "a/../secret.md",
        "a/./secret.md",
        "/tmp/secret.md",
        "C:/secret.md",
        "C:\\secret.md",
        "\\\\server\\share\\x.md",
        "a//x.md",
        "./x.md",
        "x.md/",
        "x\0.md",
    ] {
        assert!(
            matches!(
                workspace.list_directory(invalid),
                Err(IndexError::InvalidPath)
            ),
            "{invalid:?}"
        );
        assert!(
            matches!(
                workspace.open_document(invalid, &mut documents),
                Err(IndexError::InvalidPath)
            ),
            "{invalid:?}"
        );
    }
}

#[test]
fn workspace_ids_are_authorization_and_close_invalidates_only_that_session() {
    let root = tempfile::tempdir().unwrap();
    let mut registry = WorkspaceRegistry::default();
    let first = registry.select_authorized(root.path()).unwrap();
    let second = registry.select_authorized(root.path()).unwrap();
    assert_ne!(first.id, second.id);
    assert!(matches!(
        registry.get(&first.path),
        Err(IndexError::UnknownWorkspace)
    ));
    registry.close(&first.id);
    assert!(matches!(
        registry.get(&first.id),
        Err(IndexError::UnknownWorkspace)
    ));
    assert!(registry.get(&second.id).is_ok());
}

#[test]
fn search_reports_utf16_columns_and_mixed_newline_line_numbers() {
    let root = tempfile::tempdir().unwrap();
    fs::write(
        root.path().join("中文.md"),
        "\u{feff}🙂中 TARGET\r\n第二行 TARGET\r第三TARGET\n最後 target",
    )
    .unwrap();
    let workspace = setup(root.path());
    let found = search(&workspace, "TARGET");
    assert_eq!(found.scanned_files, 1);
    assert_eq!(
        found
            .matches
            .iter()
            .map(|m| (m.line, m.column, m.match_length))
            .collect::<Vec<_>>(),
        vec![(1, 5, 6), (2, 5, 6), (3, 3, 6)]
    );
    assert!(found.matches[0].preview.starts_with("🙂中 "));
    assert_eq!(found.matches[0].preview_match_start, 4);
    assert_eq!(found.matches[0].preview_match_length, 6);
    // UTF-16 起点对应字符索引 3（🙂 占 2 个单元）。
    assert_eq!(found.matches[0].preview.chars().nth(3), Some('T'));
    let insensitive = workspace
        .search(SearchOptions {
            query: "target",
            case_sensitive: false,
            whole_word: false,
            use_regex: false,
            max_results: 20,
        })
        .unwrap();
    assert_eq!(insensitive.matches.len(), 4);
}

#[test]
fn unicode_case_insensitive_search_uses_original_match_offsets() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("unicode.md"), "🙂 Ä ä Σ σ ς").unwrap();
    let workspace = setup(root.path());
    let found = workspace
        .search(SearchOptions {
            query: "ä",
            case_sensitive: false,
            whole_word: false,
            use_regex: false,
            max_results: 20,
        })
        .unwrap();
    assert_eq!(
        found.matches.iter().map(|m| m.column).collect::<Vec<_>>(),
        vec![4, 6]
    );
    assert!(found.matches.iter().all(|m| m.match_length == 1));
    assert_eq!(search(&workspace, ".*").matches.len(), 0);
}

#[test]
fn whole_word_search_honors_word_boundaries() {
    let root = tempfile::tempdir().unwrap();
    fs::write(
        root.path().join("words.md"),
        "cat category cat\nconcat cat. cat\ncat",
    )
    .unwrap();
    let workspace = setup(root.path());
    let found = workspace
        .search(SearchOptions {
            query: "cat",
            case_sensitive: true,
            whole_word: true,
            use_regex: false,
            max_results: 20,
        })
        .unwrap();
    assert_eq!(
        found
            .matches
            .iter()
            .map(|m| (m.line, m.column))
            .collect::<Vec<_>>(),
        vec![(1, 1), (1, 14), (2, 8), (2, 13), (3, 1)]
    );
    // 非单词字符查询不被边界要求卡死。
    let symbolic = workspace
        .search(SearchOptions {
            query: "###",
            case_sensitive: true,
            whole_word: true,
            use_regex: false,
            max_results: 20,
        })
        .unwrap();
    assert_eq!(symbolic.matches.len(), 0);
}

#[test]
fn regex_search_matches_patterns_and_rejects_invalid_expressions() {
    let root = tempfile::tempdir().unwrap();
    fs::write(
        root.path().join("pattern.md"),
        "hello hallo hxllo\nhello.world",
    )
    .unwrap();
    let workspace = setup(root.path());
    let found = workspace
        .search(SearchOptions {
            query: "h[ae]llo",
            case_sensitive: true,
            whole_word: false,
            use_regex: true,
            max_results: 20,
        })
        .unwrap();
    assert_eq!(
        found
            .matches
            .iter()
            .map(|m| (m.line, m.match_length))
            .collect::<Vec<_>>(),
        vec![(1, 5), (1, 5), (2, 5)]
    );
    let insensitive = workspace
        .search(SearchOptions {
            query: "H[AE]LLO",
            case_sensitive: false,
            whole_word: false,
            use_regex: true,
            max_results: 20,
        })
        .unwrap();
    assert_eq!(insensitive.matches.len(), 3);
    let combined = workspace
        .search(SearchOptions {
            query: r"\bhallo\b|world",
            case_sensitive: true,
            whole_word: true,
            use_regex: true,
            max_results: 20,
        })
        .unwrap();
    assert_eq!(combined.matches.len(), 2);
    let invalid = workspace.search(SearchOptions {
        query: "(",
        case_sensitive: true,
        whole_word: false,
        use_regex: true,
        max_results: 20,
    });
    assert!(matches!(invalid, Err(IndexError::Search(_))));
}

#[test]
fn search_preview_highlight_offsets_are_clipped_to_the_preview_window() {
    let root = tempfile::tempdir().unwrap();
    fs::write(
        root.path().join("long.md"),
        format!("{}{}", "p".repeat(100), "q".repeat(500)),
    )
    .unwrap();
    let workspace = setup(root.path());
    let found = workspace
        .search(SearchOptions {
            query: "q+",
            case_sensitive: true,
            whole_word: false,
            use_regex: true,
            max_results: 20,
        })
        .unwrap();
    let m = &found.matches[0];
    // 预览为 "…" + 320 字符 + "…"；匹配从第 61 个 UTF-16 单元起可见 260 个。
    assert_eq!(m.preview.encode_utf16().count(), 322);
    assert_eq!(m.preview_match_start, 61);
    assert_eq!(m.preview_match_length, 260);
    assert_eq!(m.preview.chars().nth(61), Some('q'));
    assert!(m.preview.starts_with('…') && m.preview.ends_with('…'));
}

#[test]
fn search_skips_unsupported_encoding_and_oversized_files_and_caps_results() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("bad.md"), [0xff, 0xfe, b'x']).unwrap();
    fs::write(root.path().join("binary.md"), [b'x', 0, b'y']).unwrap();
    fs::File::create(root.path().join("huge.md"))
        .unwrap()
        .set_len(2 * 1024 * 1024 + 1)
        .unwrap();
    fs::write(root.path().join("good.md"), "needle needle needle").unwrap();
    let workspace = setup(root.path());
    let full = search(&workspace, "needle");
    assert_eq!(full.matches.len(), 3);
    assert_eq!(full.skipped.non_utf8, 2);
    assert_eq!(full.skipped.too_large, 1);
    let limited = workspace
        .search(SearchOptions {
            query: "needle",
            case_sensitive: true,
            whole_word: false,
            use_regex: false,
            max_results: 2,
        })
        .unwrap();
    assert_eq!(limited.matches.len(), 2);
    assert!(limited.truncated);
}

#[test]
fn search_query_validation_and_unicode_preview_are_bounded() {
    let root = tempfile::tempdir().unwrap();
    let text = format!("{}标记{}", "中🙂".repeat(500), "尾".repeat(500));
    fs::write(root.path().join("long.md"), text).unwrap();
    let workspace = setup(root.path());
    for query in ["", "\n", "\r", "\0", &"中".repeat(257)] {
        assert!(matches!(
            workspace.search(SearchOptions {
                query,
                case_sensitive: true,
                whole_word: false,
                use_regex: false,
                max_results: 20
            }),
            Err(IndexError::InvalidQuery)
        ));
    }
    let found = search(&workspace, "标记");
    assert_eq!(found.matches[0].column, 1501);
    assert!(found.matches[0].preview.chars().count() <= 322);
    assert!(found.matches[0].preview.contains("标记"));
}

#[test]
fn directory_and_file_scan_limits_report_truncation() {
    let root = tempfile::tempdir().unwrap();
    for index in 0..2001 {
        fs::write(root.path().join(format!("{index}.md")), "none").unwrap();
    }
    let workspace = setup(root.path());
    let result = search(&workspace, "missing");
    assert_eq!(result.scanned_files, 2000);
    assert!(result.truncated);
    // Additional unsupported entries also count toward the listing work bound.
    for index in 0..MAX_DIRECTORY_ENTRIES {
        fs::write(root.path().join(format!("{index}.bin")), "").unwrap();
    }
    assert!(workspace.list_directory("").unwrap().truncated);
}

#[cfg(unix)]
#[test]
fn symlinks_cannot_escape_during_browse_open_or_search() {
    use std::os::unix::fs::symlink;
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.md"), "secret needle").unwrap();
    symlink(outside.path(), root.path().join("escape")).unwrap();
    symlink(
        outside.path().join("secret.md"),
        root.path().join("escape.md"),
    )
    .unwrap();
    let workspace = setup(root.path());
    assert!(matches!(
        workspace.list_directory("escape"),
        Err(IndexError::InvalidPath)
    ));
    assert!(workspace
        .open_document("escape/secret.md", &mut DocumentService::new())
        .is_err());
    assert!(workspace
        .open_document("escape.md", &mut DocumentService::new())
        .is_err());
    let listing = workspace.list_directory("").unwrap();
    assert!(listing.entries.is_empty());
    assert_eq!(listing.skipped, 2);
    let found = search(&workspace, "needle");
    assert!(found.matches.is_empty());
    assert_eq!(found.skipped.symlinks, 2);
}

#[cfg(unix)]
#[test]
fn parent_replacement_does_not_redirect_scoped_document_save() {
    use std::os::unix::fs::symlink;
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("notes")).unwrap();
    fs::write(root.path().join("notes/doc.md"), "original").unwrap();
    fs::write(outside.path().join("doc.md"), "original").unwrap();
    let workspace = setup(root.path());
    let mut documents = DocumentService::new();
    let opened = workspace
        .open_document("notes/doc.md", &mut documents)
        .unwrap();
    fs::rename(root.path().join("notes"), root.path().join("moved")).unwrap();
    symlink(outside.path(), root.path().join("notes")).unwrap();
    documents.save(&opened.id, "ours").unwrap();
    assert_eq!(fs::read(root.path().join("moved/doc.md")).unwrap(), b"ours");
    assert_eq!(
        fs::read(outside.path().join("doc.md")).unwrap(),
        b"original"
    );
    assert!(workspace
        .open_document("notes/doc.md", &mut documents)
        .is_err());
}

#[cfg(unix)]
#[test]
fn replaced_file_symlink_is_rejected_by_scoped_save() {
    use std::os::unix::fs::symlink;
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(root.path().join("doc.md"), "original").unwrap();
    fs::write(outside.path().join("doc.md"), "original").unwrap();
    let workspace = setup(root.path());
    let mut documents = DocumentService::new();
    let opened = workspace.open_document("doc.md", &mut documents).unwrap();
    fs::remove_file(root.path().join("doc.md")).unwrap();
    symlink(outside.path().join("doc.md"), root.path().join("doc.md")).unwrap();
    assert!(matches!(
        documents.save(&opened.id, "ours"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(
        fs::read(outside.path().join("doc.md")).unwrap(),
        b"original"
    );
}

#[cfg(all(unix, not(target_os = "macos")))]
#[test]
fn non_unicode_names_are_skipped_with_a_report() {
    use std::os::unix::ffi::OsStringExt;
    let root = tempfile::tempdir().unwrap();
    fs::write(
        root.path()
            .join(std::ffi::OsString::from_vec(vec![0xff, b'.', b'm', b'd'])),
        b"needle",
    )
    .unwrap();
    let workspace = setup(root.path());
    assert_eq!(workspace.list_directory("").unwrap().skipped, 1);
    let result = search(&workspace, "needle");
    assert_eq!(result.skipped.unsupported_names, 1);
    assert!(result.matches.is_empty());
}

#[test]
fn scoped_open_and_save_preserve_encoding_and_noop_file_identity() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("utf16.md");
    let original = document_service::Encoding::Utf16BeBom
        .encode("原文\r\n\n尾")
        .unwrap();
    fs::write(&path, &original).unwrap();
    let modified = fs::metadata(&path).unwrap().modified().unwrap();
    let workspace = setup(root.path());
    let mut documents = DocumentService::new();
    let opened = workspace.open_document("utf16.md", &mut documents).unwrap();
    documents.save(&opened.id, &opened.text).unwrap();
    assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), modified);
    assert_eq!(fs::read(&path).unwrap(), original);
    documents.save(&opened.id, "改文\r\n\n尾").unwrap();
    assert_eq!(
        fs::read(&path).unwrap(),
        document_service::Encoding::Utf16BeBom
            .encode("改文\r\n\n尾")
            .unwrap()
    );
    fs::write(&path, b"external").unwrap();
    assert!(matches!(
        documents.save(&opened.id, "ours"),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&path).unwrap(), b"external");
}
