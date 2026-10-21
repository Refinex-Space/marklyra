use document_service::{DocumentService, Encoding};
use file_index::{SearchOptions, Workspace, WorkspaceRegistry};
use std::{collections::BTreeSet, fs, path::Path, sync::Arc};

fn workspace(path: &Path) -> Arc<Workspace> {
    let mut registry = WorkspaceRegistry::default();
    let selected = registry.select_authorized(path).unwrap();
    registry.get(&selected.id).unwrap()
}
fn options(query: &str) -> SearchOptions<'_> {
    SearchOptions {
        query,
        case_sensitive: true,
        whole_word: false,
        use_regex: false,
        max_results: 200,
    }
}
fn paths(values: &[&str]) -> BTreeSet<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

#[test]
fn browse_articles_and_search_share_name_and_opened_handle_filters() {
    let root = tempfile::tempdir().unwrap();
    for directory in [
        ".cache",
        "node_modules",
        "case-fixture/Node_Modules",
        "package.fixture",
        "visible",
    ] {
        fs::create_dir_all(root.path().join(directory)).unwrap();
        fs::write(root.path().join(directory).join("note.md"), "needle").unwrap();
    }
    fs::write(root.path().join("visible.md"), "needle").unwrap();
    fs::write(root.path().join(".hidden.md"), "needle").unwrap();
    fs::write(root.path().join("system-hidden.md"), [0xff]).unwrap();
    let package = cap_std::fs::Dir::open_ambient_dir(
        root.path().join("package.fixture"),
        cap_std::ambient_authority(),
    )
    .unwrap();
    let package = same_file::Handle::from_file(package.into_std_file()).unwrap();
    let hidden = same_file::Handle::from_path(root.path().join("system-hidden.md")).unwrap();
    // macOS and Linux ask the host filter about an opened handle; Windows never calls it and
    // classifies entries by their own hidden/system attributes, so mark them for real there.
    #[cfg(windows)]
    for entry in ["package.fixture", "system-hidden.md"] {
        let status = std::process::Command::new("attrib")
            .arg("+h")
            .arg(root.path().join(entry))
            .status()
            .unwrap();
        assert!(status.success(), "attrib +h {entry}");
    }
    let include = |handle: &fs::File| {
        let identity = same_file::Handle::from_file(handle.try_clone().unwrap()).unwrap();
        identity != package && identity != hidden
    };
    let workspace = workspace(root.path());
    let tree = workspace
        .list_directory_with_extension_and_entry_filter("", None, include)
        .unwrap();
    assert_eq!(
        tree.entries
            .into_iter()
            .map(|entry| entry.relative_path)
            .collect::<BTreeSet<_>>(),
        paths(&["case-fixture", "visible", "visible.md"])
    );
    assert_eq!(tree.ignored, 5);
    assert_eq!(tree.skipped, 0);
    assert_eq!(tree.scanned_entries, 8);
    for relative in [".cache", "node_modules", "package.fixture"] {
        let filtered = workspace
            .list_directory_with_extension_and_entry_filter(relative, None, include)
            .unwrap();
        assert!(filtered.entries.is_empty());
        assert_eq!(filtered.ignored, 1);
    }
    let articles = workspace
        .list_documents_with_extension_and_entry_filter(None, include)
        .unwrap();
    let search = workspace
        .search_with_extension_and_entry_filter(options("needle"), None, include)
        .unwrap();
    let expected = paths(&[
        "case-fixture/Node_Modules/note.md",
        "visible/note.md",
        "visible.md",
    ]);
    assert_eq!(
        articles
            .entries
            .into_iter()
            .map(|entry| entry.relative_path)
            .collect::<BTreeSet<_>>(),
        expected
    );
    assert_eq!(
        search
            .matches
            .into_iter()
            .map(|entry| entry.relative_path)
            .collect::<BTreeSet<_>>(),
        expected
    );
    assert_eq!(articles.skipped.ignored, 5);
    assert_eq!(search.skipped.ignored, 5);
    assert_eq!(search.skipped.unsupported_encoding, 0);
    assert_eq!(search.read_bytes, 18);
    assert!(!search.truncated);
}

#[test]
fn supported_encodings_search_the_opened_source_with_utf16_coordinates_and_preserve_bytes() {
    let root = tempfile::tempdir().unwrap();
    let text = "🙂中 TARGET\r\n第二🙂TARGET\r第三TARGET\n最後 TARGET";
    let encodings = [
        Encoding::Utf8,
        Encoding::Utf8Bom,
        Encoding::Utf16LeBom,
        Encoding::Utf16BeBom,
    ];
    let workspace = workspace(root.path());
    let mut expected_bytes = 0;
    for (index, encoding) in encodings.into_iter().enumerate() {
        let name = format!("{index}.md");
        let bytes = encoding.encode(text).unwrap();
        expected_bytes += bytes.len();
        fs::write(root.path().join(&name), &bytes).unwrap();
        let modified = fs::metadata(root.path().join(&name))
            .unwrap()
            .modified()
            .unwrap();
        let report = workspace.search(options("TARGET")).unwrap();
        let matches: Vec<_> = report
            .matches
            .iter()
            .filter(|found| found.relative_path == name)
            .collect();
        assert_eq!(
            matches
                .iter()
                .map(|found| (found.line, found.column, found.match_length))
                .collect::<Vec<_>>(),
            [(1, 5, 6), (2, 5, 6), (3, 3, 6), (4, 4, 6)]
        );
        let opened = workspace
            .open_document(&name, &mut DocumentService::new())
            .unwrap();
        assert_eq!(opened.text, text);
        let lines: Vec<_> = text
            .split(['\r', '\n'])
            .filter(|line| !line.is_empty())
            .collect();
        for found in matches {
            let units: Vec<_> = lines[found.line - 1].encode_utf16().collect();
            assert_eq!(
                String::from_utf16(&units[found.column - 1..found.column - 1 + found.match_length])
                    .unwrap(),
                "TARGET"
            );
            let preview: Vec<_> = found.preview.encode_utf16().collect();
            assert_eq!(
                String::from_utf16(
                    &preview[found.preview_match_start
                        ..found.preview_match_start + found.preview_match_length]
                )
                .unwrap(),
                "TARGET"
            );
        }
        assert_eq!(fs::read(root.path().join(&name)).unwrap(), bytes);
        assert_eq!(
            fs::metadata(root.path().join(&name))
                .unwrap()
                .modified()
                .unwrap(),
            modified
        );
    }
    let report = workspace.search(options("TARGET")).unwrap();
    assert_eq!(report.matches.len(), 16);
    assert_eq!(report.read_bytes, expected_bytes);
    assert_eq!(report.skipped.unsupported_encoding, 0);
    assert_eq!(report.skipped.non_utf8, 0);
}

#[test]
fn unsupported_encodings_are_counted_without_lossy_results() {
    let root = tempfile::tempdir().unwrap();
    for (index, bytes) in [
        vec![0xff, 0xfe, 1],
        vec![0xfe, 0xff, 0xd8, 0],
        vec![0xff, 0xfe, 0, 0, 65, 0, 0, 0],
        vec![0xff, 0x80],
        vec![b'a', 0],
    ]
    .into_iter()
    .enumerate()
    {
        fs::write(root.path().join(format!("{index}.md")), bytes).unwrap();
    }
    let report = workspace(root.path()).search(options("a")).unwrap();
    assert!(report.matches.is_empty());
    assert_eq!(report.scanned_files, 5);
    assert_eq!(report.skipped.unsupported_encoding, 5);
    assert_eq!(report.skipped.non_utf8, 5);
    assert!(!report.truncated);
}

#[test]
fn unicode_regex_and_empty_matches_keep_original_source_coordinates() {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("unicode.md"), "🙂e\u{301}\r\n🙂\r🙂\n").unwrap();
    let workspace = workspace(root.path());
    let report = workspace
        .search(SearchOptions {
            use_regex: true,
            ..options(r"🙂|e\p{M}|$")
        })
        .unwrap();
    assert_eq!(
        report
            .matches
            .iter()
            .map(|found| (found.line, found.column, found.match_length))
            .collect::<Vec<_>>(),
        [(1, 1, 2), (1, 3, 2), (2, 1, 2), (3, 1, 2), (4, 1, 0)]
    );
    let empty = workspace
        .search(SearchOptions {
            use_regex: true,
            ..options("$")
        })
        .unwrap();
    assert_eq!(
        empty
            .matches
            .iter()
            .map(|found| (found.line, found.column, found.match_length))
            .collect::<Vec<_>>(),
        [(1, 5, 0), (2, 3, 0), (3, 3, 0), (4, 1, 0)]
    );
    assert!(matches!(
        workspace.search(SearchOptions {
            use_regex: true,
            ..options(r"(?<=a)b")
        }),
        Err(file_index::IndexError::Search(_))
    ));
}

#[cfg(unix)]
#[test]
fn search_and_tree_keep_capability_identity_after_root_path_replacement() {
    use std::os::unix::fs::{symlink, MetadataExt};
    let parent = tempfile::tempdir().unwrap();
    let original = parent.path().join("root");
    let moved = parent.path().join("moved");
    let outside = tempfile::tempdir().unwrap();
    fs::create_dir_all(original.join("nested")).unwrap();
    fs::write(original.join("note.md"), "inside needle").unwrap();
    fs::write(original.join("nested/child.md"), "inside needle").unwrap();
    fs::write(outside.path().join("foreign.md"), "outside needle").unwrap();
    let expected: BTreeSet<_> = [
        original.join("note.md"),
        original.join("nested"),
        original.join("nested/child.md"),
    ]
    .into_iter()
    .map(|path| {
        let value = fs::metadata(path).unwrap();
        (value.dev(), value.ino())
    })
    .collect();
    let workspace = workspace(&original);
    fs::rename(&original, &moved).unwrap();
    symlink(outside.path(), &original).unwrap();
    let include = |handle: &fs::File| {
        let value = handle.metadata().unwrap();
        assert!(expected.contains(&(value.dev(), value.ino())));
        true
    };
    let tree = workspace
        .list_directory_with_extension_and_entry_filter("", None, include)
        .unwrap();
    assert_eq!(tree.entries.len(), 2);
    let report = workspace
        .search_with_extension_and_entry_filter(options("needle"), None, include)
        .unwrap();
    assert_eq!(report.matches.len(), 2);
    assert!(report
        .matches
        .iter()
        .all(|found| found.preview == "inside needle"));
    assert_eq!(report.skipped.unreadable, 0);
}

#[test]
fn long_unicode_paths_round_trip_from_search_to_opened_source() {
    let root = tempfile::tempdir().unwrap();
    let components: Vec<_> = (0..7)
        .map(|index| format!("长路径-012345678901234567890123456789-{index}"))
        .collect();
    let directory = components.join("/");
    let relative = format!("{directory}/文稿 🙂.md");
    assert!(relative.len() > 260);
    fs::create_dir_all(root.path().join(&directory)).unwrap();
    let bytes = Encoding::Utf16LeBom
        .encode("前🙂 needle\r\nTail  \n")
        .unwrap();
    fs::write(root.path().join(&relative), &bytes).unwrap();
    let workspace = workspace(root.path());
    let listing = workspace.list_directory(&directory).unwrap();
    assert_eq!(listing.entries[0].relative_path, relative);
    let report = workspace.search(options("needle")).unwrap();
    assert!(!report.truncated);
    assert_eq!(report.matches.len(), 1);
    let found = &report.matches[0];
    assert_eq!(found.relative_path, relative);
    assert_eq!((found.line, found.column, found.match_length), (1, 5, 6));
    let opened = workspace
        .open_document(&found.relative_path, &mut DocumentService::new())
        .unwrap();
    assert_eq!(opened.text, "前🙂 needle\r\nTail  \n");
    assert_eq!(fs::read(root.path().join(relative)).unwrap(), bytes);
}

#[cfg(unix)]
#[test]
fn denied_entries_remain_visible_as_incomplete_checks_and_search_counts() {
    use std::os::unix::fs::PermissionsExt;
    let root = tempfile::tempdir().unwrap();
    let denied = root.path().join("denied.md");
    fs::write(&denied, "needle private").unwrap();
    fs::write(root.path().join("readable.md"), "needle visible").unwrap();
    let workspace = workspace(root.path());
    let original = fs::metadata(&denied).unwrap().permissions();
    fs::set_permissions(&denied, fs::Permissions::from_mode(0o0)).unwrap();
    let denied_by_os = fs::File::open(&denied).is_err();
    let search = workspace.search(options("needle"));
    let snapshot = workspace.catalog_snapshot_with_entry_filter(None, |_| true);
    fs::set_permissions(&denied, original).unwrap();
    // Privileged runners can read mode 000; do not fabricate an OS denial there.
    if !denied_by_os {
        eprintln!("OS permits mode-000 reads; permission-denial assertions not applicable");
        return;
    }
    let search = search.unwrap();
    assert_eq!(search.matches.len(), 1);
    assert_eq!(search.matches[0].relative_path, "readable.md");
    assert_eq!(search.skipped.unreadable, 1);
    assert_eq!(snapshot.unwrap().unreadable, 1);
    assert!(workspace.search(options("needle")).unwrap().matches.len() == 2);
}
