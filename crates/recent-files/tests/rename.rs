use recent_files::{RecentError, RecentFiles};
use std::{
    fs,
    path::Path,
    sync::{Arc, Barrier},
};

fn file(root: &Path, name: &str) -> std::path::PathBuf {
    let path = root.join(name);
    fs::write(&path, format!("source {name}\r\n ")).unwrap();
    fs::canonicalize(path).unwrap()
}

#[test]
fn native_rename_preserves_id_order_time_and_reopens_the_new_name() {
    let root = tempfile::tempdir().unwrap();
    let store = RecentFiles::open(&root.path().join("recents")).unwrap();
    let older = file(root.path(), "older.md");
    let old = file(root.path(), "Untitled.md");
    let newer = file(root.path(), "newer.md");
    store.remember_authorized(&older).unwrap();
    let original = store.remember_authorized(&old).unwrap();
    store.remember_authorized(&newer).unwrap();
    let before = store.list().unwrap();
    let new = old.with_file_name("中文 final.md");
    let bytes = fs::read(&old).unwrap();
    fs::rename(&old, &new).unwrap();
    assert!(store.rename_authorized_if_recorded(&old, &new).unwrap());
    let after = store.list().unwrap();
    assert_eq!(after.revision, before.revision + 1);
    assert_eq!(after.entries[0], before.entries[0]);
    assert_eq!(after.entries[2], before.entries[2]);
    assert_eq!(after.entries[1].id, original.id);
    assert_eq!(after.entries[1].last_opened_at, original.last_opened_at);
    assert_eq!(after.entries[1].name, "中文 final.md");
    assert_eq!(after.entries[1].path, new.to_str().unwrap());
    let target = store.resolve(&original.id).unwrap();
    assert_eq!(target.display_path, new);
    assert_eq!(target.directory.read(target.name).unwrap(), bytes);
    assert!(!old.exists());
}

#[test]
fn existing_destination_record_is_deduplicated_without_mru_promotion() {
    for destination_newer in [false, true] {
        let root = tempfile::tempdir().unwrap();
        let store = RecentFiles::open(&root.path().join("recents")).unwrap();
        let old = file(root.path(), "Untitled.md");
        let new = file(root.path(), "final.md");
        let other = file(root.path(), "other.md");
        let destination = if !destination_newer {
            Some(store.remember_authorized(&new).unwrap())
        } else {
            None
        };
        let original = store.remember_authorized(&old).unwrap();
        let destination = destination.unwrap_or_else(|| store.remember_authorized(&new).unwrap());
        store.remember_authorized(&other).unwrap();
        let before = store.list().unwrap();
        fs::remove_file(&new).unwrap();
        fs::rename(&old, &new).unwrap();
        assert!(store.rename_authorized_if_recorded(&old, &new).unwrap());
        let after = store.list().unwrap();
        let expected_ids: Vec<_> = before
            .entries
            .iter()
            .filter(|entry| entry.id != destination.id)
            .map(|entry| entry.id.clone())
            .collect();
        assert_eq!(
            after
                .entries
                .iter()
                .map(|entry| entry.id.clone())
                .collect::<Vec<_>>(),
            expected_ids
        );
        let renamed = after
            .entries
            .iter()
            .find(|entry| entry.id == original.id)
            .unwrap();
        assert_eq!(renamed.path, new.to_str().unwrap());
        assert_eq!(renamed.last_opened_at, original.last_opened_at);
        assert!(matches!(
            store.resolve(&destination.id),
            Err(RecentError::UnknownEntry)
        ));
        assert_eq!(fs::read(&new).unwrap(), b"source Untitled.md\r\n ");
    }
}

#[test]
fn clear_missing_old_same_path_and_replay_do_not_write_or_reinsert() {
    let root = tempfile::tempdir().unwrap();
    let history = root.path().join("recents");
    let store = RecentFiles::open(&history).unwrap();
    let old = file(root.path(), "Untitled.md");
    let new = old.with_file_name("final.md");
    store.remember_authorized(&old).unwrap();
    let before = fs::read(history.join("history.json")).unwrap();
    assert!(!store.rename_authorized_if_recorded(&old, &old).unwrap());
    assert_eq!(fs::read(history.join("history.json")).unwrap(), before);
    fs::rename(&old, &new).unwrap();
    assert!(store.rename_authorized_if_recorded(&old, &new).unwrap());
    let migrated = fs::read(history.join("history.json")).unwrap();
    assert!(!store.rename_authorized_if_recorded(&old, &new).unwrap());
    assert_eq!(fs::read(history.join("history.json")).unwrap(), migrated);
    store.clear().unwrap();
    let cleared = fs::read(history.join("history.json")).unwrap();
    assert!(!store.rename_authorized_if_recorded(&old, &new).unwrap());
    assert!(store.list().unwrap().entries.is_empty());
    assert_eq!(fs::read(history.join("history.json")).unwrap(), cleared);
    assert!(new.exists());
}

#[test]
fn missing_source_does_not_remove_an_existing_destination_reference() {
    let root = tempfile::tempdir().unwrap();
    let store = RecentFiles::open(&root.path().join("recents")).unwrap();
    let old = file(root.path(), "old.md");
    let new = file(root.path(), "new.md");
    store.remember_authorized(&new).unwrap();
    let before = store.list().unwrap();
    assert!(!store.rename_authorized_if_recorded(&old, &new).unwrap());
    assert_eq!(store.list().unwrap(), before);
}

#[test]
fn invalid_paths_and_corrupt_history_are_never_rewritten() {
    let root = tempfile::tempdir().unwrap();
    let history = root.path().join("recents");
    let store = RecentFiles::open(&history).unwrap();
    let old = file(root.path(), "Untitled.md");
    let new = old.with_file_name("final.md");
    store.remember_authorized(&old).unwrap();
    let before = fs::read(history.join("history.json")).unwrap();
    for invalid in [Path::new("relative.md"), Path::new("/tmp/../escape.md")] {
        assert!(store.rename_authorized_if_recorded(invalid, &new).is_err());
        assert!(store.rename_authorized_if_recorded(&old, invalid).is_err());
    }
    assert_eq!(fs::read(history.join("history.json")).unwrap(), before);
    fs::write(history.join("history.json"), b"{broken").unwrap();
    assert!(matches!(
        store.rename_authorized_if_recorded(&old, &new),
        Err(RecentError::Corrupt)
    ));
    assert_eq!(fs::read(history.join("history.json")).unwrap(), b"{broken");
    assert_eq!(fs::read(&old).unwrap(), b"source Untitled.md\r\n ");
}

#[test]
fn independent_writers_merge_migration_and_new_record_without_losing_either() {
    let root = tempfile::tempdir().unwrap();
    let history = root.path().join("recents");
    let store = RecentFiles::open(&history).unwrap();
    let old = file(root.path(), "Untitled.md");
    let new = old.with_file_name("final.md");
    let other = file(root.path(), "other.md");
    let original = store.remember_authorized(&old).unwrap();
    fs::rename(&old, &new).unwrap();
    let barrier = Arc::new(Barrier::new(2));
    let worker_barrier = barrier.clone();
    let worker_history = history.clone();
    let worker_old = old.clone();
    let worker_new = new.clone();
    let worker = std::thread::spawn(move || {
        let independent = RecentFiles::open(&worker_history).unwrap();
        worker_barrier.wait();
        independent
            .rename_authorized_if_recorded(&worker_old, &worker_new)
            .unwrap()
    });
    barrier.wait();
    store.remember_authorized(&other).unwrap();
    assert!(worker.join().unwrap());
    let after = store.list().unwrap();
    assert_eq!(after.entries.len(), 2);
    assert_eq!(
        after
            .entries
            .iter()
            .find(|entry| entry.id == original.id)
            .unwrap()
            .path,
        new.to_str().unwrap()
    );
    assert!(after
        .entries
        .iter()
        .all(|entry| entry.path != old.to_str().unwrap()));
    assert!(after
        .entries
        .iter()
        .any(|entry| entry.path == other.to_str().unwrap()));
}
