use super::*;
use crate::WorkspaceRegistry;
use std::{fs, sync::Arc};

fn fixture() -> (tempfile::TempDir, Arc<Workspace>) {
    let temporary = tempfile::tempdir().unwrap();
    let mut registry = WorkspaceRegistry::default();
    let payload = registry.select_authorized(temporary.path()).unwrap();
    (temporary, registry.get(&payload.id).unwrap())
}

fn keys(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

fn read(
    workspace: &Workspace,
    folder: &str,
    layout: DailyLayout,
    values: &[&str],
) -> Vec<DailyNote> {
    workspace
        .read_daily_notes(folder, layout, &keys(values), |_| true, |_| true)
        .unwrap()
}

#[test]
fn paths_follow_nested_and_flat_layouts() {
    let nested = DailyLayout::Nested;
    let flat = DailyLayout::Flat;
    assert_eq!(
        daily_relative_path("日程", nested, "2026-10-21").unwrap(),
        "日程/2026/10/2026-10-21.md"
    );
    assert_eq!(
        daily_relative_path("日程", nested, "2026-W43").unwrap(),
        "日程/2026/2026-W43.md"
    );
    assert_eq!(
        daily_relative_path("日程/Daily", flat, "2026-10-21").unwrap(),
        "日程/Daily/2026-10-21.md"
    );
    assert_eq!(
        daily_relative_path("Daily", flat, "2026-W43").unwrap(),
        "Daily/2026-W43.md"
    );
}

#[test]
fn day_keys_must_be_real_calendar_dates() {
    for valid in [
        "2024-02-29",
        "2000-02-29",
        "1000-01-01",
        "9999-12-31",
        "2026-04-30",
    ] {
        assert!(parse_key(valid).is_ok(), "{valid}");
    }
    for invalid in [
        "2026-02-29",
        "1900-02-29",
        "2026-04-31",
        "2026-13-01",
        "2026-00-10",
        "2026-01-00",
        "0999-12-31",
        "2026-1-01",
        "2026-01-1",
        "2026/01/01",
        "20260101",
        "2026-01-01 ",
        "+202-01-01",
        "２０２６-01-01",
        "",
    ] {
        assert!(
            matches!(parse_key(invalid), Err(IndexError::InvalidDailyKey)),
            "{invalid}"
        );
    }
}

#[test]
fn week_keys_respect_iso_53_week_years() {
    for valid in [
        "2020-W53", "2026-W53", "2015-W53", "2004-W53", "2021-W01", "2021-W52",
    ] {
        assert!(parse_key(valid).is_ok(), "{valid}");
    }
    for invalid in [
        "2021-W53",
        "2025-W53",
        "2026-W54",
        "2026-W00",
        "2026-w43",
        "2026-W4",
        "2026-W043",
    ] {
        assert!(
            matches!(parse_key(invalid), Err(IndexError::InvalidDailyKey)),
            "{invalid}"
        );
    }
}

#[test]
fn folders_must_be_visible_relative_workspace_paths() {
    for valid in ["Daily", "日程/Daily", "notes/2026 计划", "a-b_c"] {
        assert!(
            daily_relative_path(valid, DailyLayout::Flat, "2026-10-21").is_ok(),
            "{valid}"
        );
    }
    for invalid in [
        "",
        "/Daily",
        "Daily/",
        "Daily//2026",
        "./Daily",
        "Daily/..",
        "../Daily",
        ".hidden",
        "notes/.obsidian",
        "node_modules",
        "a/node_modules/b",
        "C:/Daily",
        "Daily\\2026",
        "Daily\0",
        "Daily\n",
        "Daily\u{7f}",
        " Daily",
        "Daily ",
        "Daily.",
        "CON",
        "Daily/a?b",
    ] {
        assert!(
            matches!(
                daily_relative_path(invalid, DailyLayout::Nested, "2026-10-21"),
                Err(IndexError::InvalidDailyFolder)
            ),
            "{invalid:?}"
        );
    }
}

#[test]
fn creation_builds_nested_folders_and_writes_exact_bytes() {
    let (root, workspace) = fixture();
    let text = "# 2026-10-21\r\n\r\n- 计划\n";
    let relative = workspace
        .create_daily_note("日程/Daily", DailyLayout::Nested, "2026-10-21", text)
        .unwrap();
    assert_eq!(relative, "日程/Daily/2026/10/2026-10-21.md");
    assert_eq!(
        fs::read(root.path().join(&relative)).unwrap(),
        text.as_bytes()
    );
    let week = workspace
        .create_daily_note("日程/Daily", DailyLayout::Nested, "2026-W43", "")
        .unwrap();
    assert_eq!(week, "日程/Daily/2026/2026-W43.md");
    assert_eq!(fs::read(root.path().join(&week)).unwrap(), b"");

    let notes = read(
        &workspace,
        "日程/Daily",
        DailyLayout::Nested,
        &["2026-W43", "2026-10-22", "2026-10-21", "2026-W43"],
    );
    assert_eq!(notes.len(), 2);
    assert_eq!(notes[0].key, "2026-W43");
    assert_eq!(notes[0].text.as_deref(), Some(""));
    assert_eq!(notes[1].key, "2026-10-21");
    assert_eq!(notes[1].relative_path, relative);
    assert_eq!(notes[1].size, text.len() as u64);
    assert!(notes[1].modified_at.is_some());
    assert_eq!(notes[1].text.as_deref(), Some(text));
}

#[test]
fn creation_is_exclusive_and_keeps_the_original_bytes() {
    let (root, workspace) = fixture();
    fs::create_dir(root.path().join("Daily")).unwrap();
    fs::write(root.path().join("Daily/2026-10-21.md"), b"original").unwrap();
    let error = workspace
        .create_daily_note("Daily", DailyLayout::Flat, "2026-10-21", "replacement")
        .unwrap_err();
    assert!(matches!(error, IndexError::DailyNoteExists));
    assert_eq!(error.to_string(), "该日期的日程文件已存在");
    assert_eq!(
        fs::read(root.path().join("Daily/2026-10-21.md")).unwrap(),
        b"original"
    );

    workspace
        .create_daily_note("Daily", DailyLayout::Flat, "2026-10-22", "first")
        .unwrap();
    assert!(matches!(
        workspace.create_daily_note("Daily", DailyLayout::Flat, "2026-10-22", "second"),
        Err(IndexError::DailyNoteExists)
    ));
    assert_eq!(
        fs::read(root.path().join("Daily/2026-10-22.md")).unwrap(),
        b"first"
    );

    fs::create_dir(root.path().join("Daily/2026-10-23.md")).unwrap();
    assert!(matches!(
        workspace.create_daily_note("Daily", DailyLayout::Flat, "2026-10-23", "x"),
        Err(IndexError::DailyNoteExists)
    ));
    assert!(root.path().join("Daily/2026-10-23.md").is_dir());
}

#[test]
fn creation_rejects_invalid_input_without_touching_the_workspace() {
    let (root, workspace) = fixture();
    for (folder, key) in [
        (".daily", "2026-10-21"),
        ("../out", "2026-10-21"),
        ("Daily", "2026-02-29"),
    ] {
        assert!(workspace
            .create_daily_note(folder, DailyLayout::Nested, key, "")
            .is_err());
    }
    assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
    fs::write(root.path().join("Daily"), b"file").unwrap();
    assert!(matches!(
        workspace.create_daily_note("Daily", DailyLayout::Flat, "2026-10-21", ""),
        Err(IndexError::InvalidPath)
    ));
    assert_eq!(fs::read(root.path().join("Daily")).unwrap(), b"file");
}

#[test]
fn reading_treats_missing_entries_as_absent_and_bounds_text() {
    let (root, workspace) = fixture();
    assert!(read(&workspace, "Daily", DailyLayout::Nested, &["2026-10-21"]).is_empty());
    fs::create_dir_all(root.path().join("Daily")).unwrap();
    fs::write(
        root.path().join("Daily/2026-10-01.md"),
        b"\xef\xbb\xbf# BOM",
    )
    .unwrap();
    fs::write(
        root.path().join("Daily/2026-10-02.md"),
        b"\xff\xfe# not utf8",
    )
    .unwrap();
    let large = vec![b'a'; MAX_DAILY_TEXT_BYTES as usize + 1];
    fs::write(root.path().join("Daily/2026-10-03.md"), &large).unwrap();
    let limit = vec![b'b'; MAX_DAILY_TEXT_BYTES as usize];
    fs::write(root.path().join("Daily/2026-10-04.md"), &limit).unwrap();
    fs::create_dir(root.path().join("Daily/2026-10-05.md")).unwrap();
    let notes = read(
        &workspace,
        "Daily",
        DailyLayout::Flat,
        &[
            "2026-10-01",
            "2026-10-02",
            "2026-10-03",
            "2026-10-04",
            "2026-10-05",
        ],
    );
    let summary: Vec<_> = notes
        .iter()
        .map(|note| {
            (
                note.key.as_str(),
                note.size,
                note.text.as_ref().map(String::len),
            )
        })
        .collect();
    assert_eq!(
        summary,
        [
            ("2026-10-01", 8, Some(5)),
            ("2026-10-02", 12, None),
            ("2026-10-03", MAX_DAILY_TEXT_BYTES + 1, None),
            (
                "2026-10-04",
                MAX_DAILY_TEXT_BYTES,
                Some(MAX_DAILY_TEXT_BYTES as usize)
            ),
        ]
    );
    assert_eq!(notes[0].text.as_deref(), Some("# BOM"));
}

#[test]
fn reading_applies_host_filters_and_limits() {
    let (root, workspace) = fixture();
    fs::create_dir_all(root.path().join("Daily")).unwrap();
    fs::write(root.path().join("Daily/2026-10-21.md"), b"x").unwrap();
    let requested = keys(&["2026-10-21"]);
    let hidden = workspace
        .read_daily_notes("Daily", DailyLayout::Flat, &requested, |_| true, |_| false)
        .unwrap();
    assert!(hidden.is_empty());
    let too_many: Vec<String> = (1..=65)
        .map(|day| format!("2026-{:02}-{:02}", day / 28 + 1, day % 28 + 1))
        .collect();
    assert!(matches!(
        workspace.read_daily_notes("Daily", DailyLayout::Flat, &too_many, |_| true, |_| true),
        Err(IndexError::TooManyDailyKeys)
    ));
    assert!(matches!(
        workspace.read_daily_notes(
            "Daily",
            DailyLayout::Flat,
            &keys(&["2026-02-30"]),
            |_| true,
            |_| true
        ),
        Err(IndexError::InvalidDailyKey)
    ));
    assert!(matches!(
        workspace.read_daily_notes(".Daily", DailyLayout::Flat, &requested, |_| true, |_| true),
        Err(IndexError::InvalidDailyFolder)
    ));
}

#[cfg(unix)]
#[test]
fn links_are_never_followed() {
    use std::os::unix::fs::symlink;
    let (root, workspace) = fixture();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("2026-10-21.md"), b"outside").unwrap();
    symlink(outside.path(), root.path().join("Daily")).unwrap();
    assert!(read(&workspace, "Daily", DailyLayout::Flat, &["2026-10-21"]).is_empty());
    assert!(matches!(
        workspace.create_daily_note("Daily", DailyLayout::Flat, "2026-10-22", "x"),
        Err(IndexError::InvalidPath)
    ));
    assert!(!outside.path().join("2026-10-22.md").exists());

    fs::create_dir(root.path().join("Plain")).unwrap();
    symlink(
        outside.path().join("2026-10-21.md"),
        root.path().join("Plain/2026-10-21.md"),
    )
    .unwrap();
    assert!(read(&workspace, "Plain", DailyLayout::Flat, &["2026-10-21"]).is_empty());
    assert!(matches!(
        workspace.create_daily_note("Plain", DailyLayout::Flat, "2026-10-21", "x"),
        Err(IndexError::DailyNoteExists)
    ));
    assert_eq!(
        fs::read(outside.path().join("2026-10-21.md")).unwrap(),
        b"outside"
    );
}
