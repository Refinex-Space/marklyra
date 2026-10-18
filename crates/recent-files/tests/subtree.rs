use recent_files::RecentFiles;
use std::{fs, path::Path};

fn fixture() -> (
    tempfile::TempDir,
    RecentFiles,
    std::path::PathBuf,
    std::path::PathBuf,
) {
    let root = tempfile::tempdir().unwrap();
    let parent = fs::canonicalize(root.path()).unwrap();
    fs::create_dir(parent.join("old")).unwrap();
    fs::create_dir(parent.join("old/sub")).unwrap();
    fs::write(parent.join("old/a.md"), b"A").unwrap();
    fs::write(parent.join("old/sub/b.md"), b"B").unwrap();
    fs::write(parent.join("unrelated.md"), b"other").unwrap();
    let recent = RecentFiles::open(&parent.join("recent")).unwrap();
    (root, recent, parent.join("old"), parent.join("new"))
}

#[test]
fn subtree_cas_preserves_ids_times_mru_and_unrelated_new_records() {
    let (root, recent, old, new) = fixture();
    let a = recent.remember_authorized(&old.join("a.md")).unwrap();
    let b = recent.remember_authorized(&old.join("sub/b.md")).unwrap();
    let plan = recent.prepare_rename_authorized(&old, &new, true).unwrap();
    let other = recent
        .remember_authorized(&fs::canonicalize(root.path().join("unrelated.md")).unwrap())
        .unwrap();
    fs::rename(&old, &new).unwrap();
    let report = recent.commit_rename_authorized(plan).unwrap();
    assert_eq!(report.changed, 2);
    assert_eq!(report.skipped, 0);
    let entries = recent.list().unwrap().entries;
    assert_eq!(entries[0], other);
    for (entry, original) in entries[1..].iter().zip([b, a]) {
        assert_eq!(entry.id, original.id);
        assert_eq!(entry.last_opened_at, original.last_opened_at);
        assert_eq!(
            Path::new(&entry.path),
            new.join(Path::new(&original.path).strip_prefix(&old).unwrap())
        );
    }
    assert_eq!(fs::read(new.join("sub/b.md")).unwrap(), b"B");
}

#[test]
fn clear_remove_or_newer_source_record_cannot_be_recreated_by_a_snapshot() {
    let (_root, recent, old, new) = fixture();
    let entry = recent.remember_authorized(&old.join("a.md")).unwrap();
    let plan = recent.prepare_rename_authorized(&old, &new, true).unwrap();
    recent.remove(&entry.id).unwrap();
    fs::rename(&old, &new).unwrap();
    let report = recent.commit_rename_authorized(plan).unwrap();
    assert_eq!(report.changed, 0);
    assert_eq!(report.skipped, 1);
    assert!(recent.list().unwrap().entries.is_empty());
    recent.remember_authorized(&new.join("a.md")).unwrap();
    let next = new.with_file_name("next");
    let plan = recent.prepare_rename_authorized(&new, &next, true).unwrap();
    recent.clear().unwrap();
    assert_eq!(recent.commit_rename_authorized(plan).unwrap().changed, 0);
    assert!(recent.list().unwrap().entries.is_empty());
}

#[test]
fn fresh_destination_record_is_preserved_and_another_store_cannot_apply_the_plan() {
    let (root, recent, old, new) = fixture();
    recent.remember_authorized(&old.join("a.md")).unwrap();
    let plan = recent.prepare_rename_authorized(&old, &new, true).unwrap();
    fs::rename(&old, &new).unwrap();
    let fresh = recent.remember_authorized(&new.join("a.md")).unwrap();
    let report = recent.commit_rename_authorized(plan).unwrap();
    assert_eq!(report.changed, 0);
    assert_eq!(report.skipped, 1);
    assert_eq!(recent.list().unwrap().entries[0], fresh);
    let plan = recent
        .prepare_rename_authorized(&new, &new.with_file_name("next"), true)
        .unwrap();
    let other = RecentFiles::open(&root.path().join("different-recent")).unwrap();
    assert!(other.commit_rename_authorized(plan).is_err());
}
