use recent_files::{RecentError, RecentFiles};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

fn fixture() -> (tempfile::TempDir, RecentFiles, PathBuf, PathBuf, PathBuf) {
    let root = tempfile::tempdir().unwrap();
    let base = fs::canonicalize(root.path()).unwrap();
    fs::create_dir(base.join("from")).unwrap();
    fs::create_dir(base.join("to")).unwrap();
    let source = base.join("from/note.md");
    let target = base.join("to/note.md");
    let backup = base.join("to/.own-replaced-note.md");
    fs::write(&source, b"\xef\xbb\xbfsource\r\n").unwrap();
    fs::write(&target, b"old target\n").unwrap();
    let recent = RecentFiles::open(&base.join("recent")).unwrap();
    (root, recent, source, target, backup)
}

#[test]
fn cross_parent_keep_both_preserves_ids_mru_time_and_existing_target() {
    let (_root, recent, source, target, _) = fixture();
    let original = recent.remember_authorized(&source).unwrap();
    let existing = recent.remember_authorized(&target).unwrap();
    let kept = target.with_file_name("note (copy).md");
    assert!(matches!(
        recent.prepare_rename_authorized(&source, &kept, false),
        Err(RecentError::InvalidPath)
    ));
    let before = recent.list().unwrap();
    let plan = recent
        .prepare_move_authorized(&source, &kept, false)
        .unwrap();
    fs::rename(&source, &kept).unwrap();
    let report = recent.commit_rename_authorized(plan).unwrap();
    assert_eq!((report.changed, report.skipped), (1, 0));
    let after = recent.list().unwrap();
    assert_eq!(after.revision, before.revision + 1);
    assert_eq!(after.entries[0], existing);
    assert_eq!(after.entries[1].id, original.id);
    assert_eq!(after.entries[1].last_opened_at, original.last_opened_at);
    assert_eq!(after.entries[1].path, kept.to_str().unwrap());
    assert_eq!(after.entries[1].name, "note (copy).md");
    let target = recent.resolve(&original.id).unwrap();
    assert_eq!(
        target.directory.read(target.name).unwrap(),
        b"\xef\xbb\xbfsource\r\n"
    );
}

#[test]
fn replace_forward_and_undo_map_both_original_records_once_in_either_order() {
    for target_newer in [false, true] {
        for reverse_specs in [false, true] {
            let (_root, recent, source, target, backup) = fixture();
            let older = if target_newer {
                recent.remember_authorized(&source).unwrap()
            } else {
                recent.remember_authorized(&target).unwrap()
            };
            let newer = if target_newer {
                recent.remember_authorized(&target).unwrap()
            } else {
                recent.remember_authorized(&source).unwrap()
            };
            let before = recent.list().unwrap();
            let mut moves = vec![
                (target.as_path(), backup.as_path(), false),
                (source.as_path(), target.as_path(), false),
            ];
            if reverse_specs {
                moves.reverse();
            }
            let forward = recent.prepare_moves_authorized(&moves).unwrap();
            fs::rename(&target, &backup).unwrap();
            fs::rename(&source, &target).unwrap();
            let report = recent.commit_rename_authorized(forward).unwrap();
            assert_eq!((report.changed, report.skipped), (2, 0));
            let moved = recent.list().unwrap();
            assert_eq!(moved.entries.len(), 2);
            for (entry, original) in moved.entries.iter().zip(&before.entries) {
                assert_eq!(entry.id, original.id);
                assert_eq!(entry.last_opened_at, original.last_opened_at);
                let expected = if Path::new(&original.path) == source {
                    &target
                } else {
                    &backup
                };
                assert_eq!(Path::new(&entry.path), expected);
            }
            let mut inverse = vec![
                (backup.as_path(), target.as_path(), false),
                (target.as_path(), source.as_path(), false),
            ];
            if reverse_specs {
                inverse.reverse();
            }
            let undo = recent.prepare_moves_authorized(&inverse).unwrap();
            fs::rename(&target, &source).unwrap();
            fs::rename(&backup, &target).unwrap();
            let report = recent.commit_rename_authorized(undo).unwrap();
            assert_eq!((report.changed, report.skipped), (2, 0));
            let after = recent.list().unwrap();
            assert_eq!(after.entries, before.entries);
            assert_eq!(after.revision, before.revision + 2);
            assert_eq!(
                after
                    .entries
                    .iter()
                    .map(|entry| entry.id.as_str())
                    .collect::<Vec<_>>(),
                vec![newer.id.as_str(), older.id.as_str()]
            );
            assert_eq!(fs::read(&source).unwrap(), b"\xef\xbb\xbfsource\r\n");
            assert_eq!(fs::read(&target).unwrap(), b"old target\n");
        }
    }
}

#[test]
fn cross_parent_directory_resources_use_one_original_snapshot() {
    let (_root, recent, source, target, backup) = fixture();
    let old = source.parent().unwrap();
    let new = target.parent().unwrap().join("book");
    fs::create_dir(old.join("assets")).unwrap();
    fs::write(old.join("assets/readme.md"), b"resource note").unwrap();
    let a = recent.remember_authorized(&source).unwrap();
    let b = recent
        .remember_authorized(&old.join("assets/readme.md"))
        .unwrap();
    let extra = recent.remember_authorized(&target).unwrap();
    let before = recent.list().unwrap();
    let plan = recent
        .prepare_moves_authorized(&[
            (target.as_path(), backup.as_path(), false),
            (old, new.as_path(), true),
        ])
        .unwrap();
    let report = recent.commit_rename_authorized(plan).unwrap();
    assert_eq!((report.changed, report.skipped), (3, 0));
    let after = recent.list().unwrap();
    assert_eq!(after.revision, before.revision + 1);
    for original in [a, b] {
        let entry = after
            .entries
            .iter()
            .find(|entry| entry.id == original.id)
            .unwrap();
        assert_eq!(entry.last_opened_at, original.last_opened_at);
        assert_eq!(
            Path::new(&entry.path),
            new.join(Path::new(&original.path).strip_prefix(old).unwrap())
        );
    }
    assert_eq!(
        after
            .entries
            .iter()
            .find(|entry| entry.id == extra.id)
            .unwrap()
            .path,
        backup.to_str().unwrap()
    );
    // Metadata migration has no filesystem mutation or new file authority.
    assert!(source.exists());
    assert!(!new.exists());
    assert!(!backup.exists());
}

#[test]
fn later_destination_open_blocks_both_dependent_replace_undo_records() {
    let (_root, recent, source, target, backup) = fixture();
    fs::rename(&target, &backup).unwrap();
    fs::rename(&source, &target).unwrap();
    let source_record = recent.remember_authorized(&target).unwrap();
    recent.remember_authorized(&backup).unwrap();
    let plan = recent
        .prepare_moves_authorized(&[
            (backup.as_path(), target.as_path(), false),
            (target.as_path(), source.as_path(), false),
        ])
        .unwrap();
    fs::rename(&target, &source).unwrap();
    fs::rename(&backup, &target).unwrap();
    // A later open at the main destination creates a fresh reference. Main
    // source cannot migrate there; the other cohort must not delete that main
    // source record merely because its old pathname is our target.
    let fresh = recent.remember_authorized(&source).unwrap();
    let before = recent.list().unwrap();
    let report = recent.commit_rename_authorized(plan).unwrap();
    assert_eq!((report.changed, report.skipped), (0, 2));
    assert_eq!(recent.list().unwrap(), before);
    assert!(before.entries.contains(&fresh));
    assert!(before.entries.contains(&source_record));
}

#[test]
fn later_open_remove_and_clear_are_not_reverted_by_a_move_batch() {
    for action in ["open", "remove", "clear"] {
        let (_root, recent, source, target, backup) = fixture();
        let original = recent.remember_authorized(&source).unwrap();
        let plan = recent
            .prepare_move_authorized(&source, &target, false)
            .unwrap();
        match action {
            "open" => {
                recent.remember_authorized(&source).unwrap();
            }
            "remove" => {
                recent.remove(&original.id).unwrap();
            }
            "clear" => {
                recent.clear().unwrap();
            }
            _ => unreachable!(),
        }
        let before = recent.list().unwrap();
        let report = recent.commit_rename_authorized(plan).unwrap();
        assert_eq!((report.changed, report.skipped), (0, 1), "{action}");
        assert_eq!(recent.list().unwrap(), before);
        assert!(!backup.exists());
    }
}

#[test]
fn reopened_existing_target_cohort_is_not_deleted_or_overwritten() {
    let (_root, recent, source, target, backup) = fixture();
    recent.remember_authorized(&source).unwrap();
    let expected = recent.remember_authorized(&target).unwrap();
    let plan = recent
        .prepare_moves_authorized(&[
            (target.as_path(), backup.as_path(), false),
            (source.as_path(), target.as_path(), false),
        ])
        .unwrap();
    std::thread::sleep(Duration::from_millis(2));
    let refreshed = recent.remember_authorized(&target).unwrap();
    assert_ne!(refreshed.last_opened_at, expected.last_opened_at);
    let before = recent.list().unwrap();
    let report = recent.commit_rename_authorized(plan).unwrap();
    assert_eq!((report.changed, report.skipped), (0, 2));
    assert_eq!(recent.list().unwrap(), before);
}

#[test]
fn duplicate_destinations_and_ambiguous_prefixes_are_rejected_without_a_write() {
    let (_root, recent, source, target, backup) = fixture();
    recent.remember_authorized(&source).unwrap();
    recent.remember_authorized(&target).unwrap();
    let before = recent.list().unwrap();
    assert!(recent
        .prepare_moves_authorized(&[
            (source.as_path(), backup.as_path(), false),
            (target.as_path(), backup.as_path(), false)
        ])
        .is_err());
    assert!(recent
        .prepare_moves_authorized(&[
            (source.parent().unwrap(), target.parent().unwrap(), true),
            (source.as_path(), backup.as_path(), false)
        ])
        .is_err());
    assert!(recent
        .prepare_moves_authorized(&[(Path::new("relative.md"), backup.as_path(), false)])
        .is_err());
    assert_eq!(recent.list().unwrap(), before);
}
