use document_service::DocumentService;
use recent_files::{RecentError, RecentFiles, MAX_ENTRIES};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{Arc, Barrier},
};

fn file(root: &Path, name: &str, text: &str) -> PathBuf {
    let path = root.join(name);
    fs::write(&path, text).unwrap();
    fs::canonicalize(path).unwrap()
}
fn store(root: &Path) -> RecentFiles {
    RecentFiles::open(&root.join("recents")).unwrap()
}

#[test]
fn persist_deduplicate_reorder_and_reopen_after_process_state_is_gone() {
    let root = tempfile::tempdir().unwrap();
    let one = file(root.path(), "中文.md", "one");
    let two = file(root.path(), "second.md", "two");
    let id;
    {
        let store = store(root.path());
        id = store.remember_authorized(&one).unwrap().id;
        store.remember_authorized(&two).unwrap();
        let repeated = store.remember_authorized(&one).unwrap();
        assert_eq!(repeated.id, id);
    }
    let store = store(root.path());
    let listing = store.list().unwrap();
    assert_eq!(listing.entries.len(), 2);
    assert_eq!(listing.entries[0].id, id);
    assert_eq!(listing.entries[0].name, "中文.md");
    let target = store.resolve(&id).unwrap();
    let mut text = String::new();
    target
        .directory
        .open(target.name)
        .unwrap()
        .read_to_string(&mut text)
        .unwrap();
    assert_eq!(text, "one");
}
#[test]
fn bounded_list_only_evicts_old_references_not_user_files() {
    let root = tempfile::tempdir().unwrap();
    let store = store(root.path());
    let mut paths = Vec::new();
    for index in 0..MAX_ENTRIES + 4 {
        let path = file(root.path(), &format!("{index}.md"), "preserved");
        store.remember_authorized(&path).unwrap();
        paths.push(path);
    }
    let listing = store.list().unwrap();
    assert_eq!(listing.entries.len(), MAX_ENTRIES);
    assert_eq!(listing.entries[0].name, format!("{}.md", MAX_ENTRIES + 3));
    for path in paths {
        assert_eq!(fs::read_to_string(path).unwrap(), "preserved");
    }
}
#[test]
fn remove_and_clear_only_change_the_metadata_manifest() {
    let root = tempfile::tempdir().unwrap();
    let one = file(root.path(), "one.md", "α\r\n");
    let two = file(root.path(), "two.md", "中😀\n");
    let first_mtime = fs::metadata(&one).unwrap().modified().unwrap();
    let store = store(root.path());
    let entry = store.remember_authorized(&one).unwrap();
    store.remember_authorized(&two).unwrap();
    let after = store.remove(&entry.id).unwrap();
    assert_eq!(after.entries.len(), 1);
    assert_eq!(after.entries[0].path, two.to_string_lossy());
    store.clear().unwrap();
    assert!(store.list().unwrap().entries.is_empty());
    assert_eq!(fs::read_to_string(&one).unwrap(), "α\r\n");
    assert_eq!(fs::read_to_string(&two).unwrap(), "中😀\n");
    assert_eq!(fs::metadata(one).unwrap().modified().unwrap(), first_mtime);
}
#[test]
fn independent_instances_merge_against_current_disk_state() {
    let root = tempfile::tempdir().unwrap();
    let first = store(root.path());
    let second = store(root.path());
    let a = first
        .remember_authorized(&file(root.path(), "a.md", "a"))
        .unwrap();
    let stale = first.list().unwrap();
    second
        .remember_authorized(&file(root.path(), "b.md", "b"))
        .unwrap();
    assert_eq!(stale.entries.len(), 1);
    let current = first.remove(&a.id).unwrap();
    assert_eq!(current.entries.len(), 1);
    assert_eq!(current.entries[0].name, "b.md");
    assert_eq!(second.list().unwrap(), current);
}
#[test]
fn parallel_writers_do_not_lose_successful_updates() {
    let root = tempfile::tempdir().unwrap();
    let barrier = Arc::new(Barrier::new(9));
    let writers = (0..8)
        .map(|index| {
            let path = file(root.path(), &format!("{index}.md"), "file");
            let root_path = root.path().to_owned();
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                let store = store(&root_path);
                barrier.wait();
                store.remember_authorized(&path)
            })
        })
        .collect::<Vec<_>>();
    barrier.wait();
    for writer in writers {
        writer.join().unwrap().unwrap();
    }
    assert_eq!(store(root.path()).list().unwrap().entries.len(), 8);
}
#[test]
fn cross_process_writer_helper() {
    let Ok(root) = std::env::var("RECENT_FILES_TEST_ROOT") else {
        return;
    };
    let root = Path::new(&root);
    let store = store(root);
    for index in 0..8 {
        store
            .remember_authorized(&fs::canonicalize(root.join(format!("child-{index}.md"))).unwrap())
            .unwrap();
    }
}
#[test]
fn cross_process_updates_survive_restart_without_an_in_memory_authority_cache() {
    let root = tempfile::tempdir().unwrap();
    for index in 0..8 {
        file(root.path(), &format!("child-{index}.md"), "child");
    }
    let mut child = std::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "cross_process_writer_helper"])
        .env("RECENT_FILES_TEST_ROOT", root.path())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .unwrap();
    let store = store(root.path());
    for index in 0..8 {
        store
            .remember_authorized(&file(root.path(), &format!("parent-{index}.md"), "parent"))
            .unwrap();
    }
    assert!(child.wait().unwrap().success());
    assert_eq!(store.list().unwrap().entries.len(), 16);
}
#[test]
fn corrupt_manifest_is_reported_and_only_explicit_clear_resets_it() {
    let root = tempfile::tempdir().unwrap();
    let store = store(root.path());
    let path = file(root.path(), "keep.md", "keep");
    store.remember_authorized(&path).unwrap();
    let manifest = root.path().join("recents/history.json");
    fs::write(&manifest, b"{broken").unwrap();
    assert!(matches!(store.list(), Err(RecentError::Corrupt)));
    assert!(matches!(
        store.remember_authorized(&path),
        Err(RecentError::Corrupt)
    ));
    assert_eq!(fs::read(&manifest).unwrap(), b"{broken");
    store.clear().unwrap();
    assert!(store.list().unwrap().entries.is_empty());
    assert_eq!(
        fs::read(root.path().join("recents/last-corrupt.json")).unwrap(),
        b"{broken"
    );
    assert_eq!(fs::read_to_string(path).unwrap(), "keep");
}
#[test]
fn schema_and_checksum_are_validated_without_accepting_forged_paths() {
    let root = tempfile::tempdir().unwrap();
    let store = store(root.path());
    store
        .remember_authorized(&file(root.path(), "one.md", "one"))
        .unwrap();
    let manifest = root.path().join("recents/history.json");
    let original = fs::read(&manifest).unwrap();
    for field in ["schemaVersion", "checksum"] {
        let mut payload: serde_json::Value = serde_json::from_slice(&original).unwrap();
        payload[field] = if field == "schemaVersion" {
            999.into()
        } else {
            "forged".into()
        };
        fs::write(&manifest, serde_json::to_vec(&payload).unwrap()).unwrap();
        assert!(matches!(store.list(), Err(RecentError::Corrupt)));
    }
}
#[test]
fn ids_are_not_paths_and_missing_files_remain_listed() {
    let root = tempfile::tempdir().unwrap();
    let store = store(root.path());
    let path = file(root.path(), "gone.md", "gone");
    let entry = store.remember_authorized(&path).unwrap();
    for id in ["../../gone.md", "/etc/passwd", "C:\\secret", "not-an-id"] {
        assert!(matches!(store.resolve(id), Err(RecentError::UnknownEntry)));
        assert!(matches!(store.remove(id), Err(RecentError::UnknownEntry)));
    }
    fs::remove_file(path).unwrap();
    assert!(matches!(store.resolve(&entry.id), Err(RecentError::Io(_))));
    assert_eq!(store.list().unwrap().entries[0].id, entry.id);
}
#[test]
fn reopen_reads_fresh_bytes_and_preserves_document_service_conflict_checks() {
    let root = tempfile::tempdir().unwrap();
    let path = file(root.path(), "note.md", "before");
    let mut documents = DocumentService::new();
    let first = documents.open_authorized(&path).unwrap();
    let recent = store(root.path());
    let item = recent
        .remember_authorized(&documents.authorized_path(&first.id).unwrap())
        .unwrap();
    documents.close(&first.id);
    assert!(documents.authorized_path(&first.id).is_err());
    fs::write(&path, b"external after close").unwrap();
    let target = recent.resolve(&item.id).unwrap();
    let next = documents
        .open_in_directory(target.directory, &target.name, target.display_path)
        .unwrap();
    assert_eq!(next.text, "external after close");
    assert_ne!(next.id, first.id);
    fs::write(&path, b"changed again").unwrap();
    assert!(documents.save(&next.id, "ours").is_err());
    assert_eq!(fs::read(path).unwrap(), b"changed again");
}
#[cfg(unix)]
#[test]
fn replaced_symlinks_and_store_symlinks_do_not_expand_grants() {
    use std::os::unix::fs::symlink;
    let root = tempfile::tempdir().unwrap();
    let path = file(root.path(), "note.md", "original");
    let outside = file(root.path(), "outside.md", "secret");
    let store = store(root.path());
    let entry = store.remember_authorized(&path).unwrap();
    fs::remove_file(&path).unwrap();
    symlink(&outside, &path).unwrap();
    assert!(matches!(
        store.resolve(&entry.id),
        Err(RecentError::InvalidPath)
    ));
    fs::remove_file(root.path().join("recents/history.json")).unwrap();
    symlink(&outside, root.path().join("recents/history.json")).unwrap();
    assert!(matches!(store.clear(), Err(RecentError::InvalidPath)));
    assert_eq!(fs::read_to_string(outside).unwrap(), "secret");
}

#[test]
fn abandoned_staging_does_not_replace_committed_history_or_accumulate() {
    let root = tempfile::tempdir().unwrap();
    let store = store(root.path());
    let entry = store
        .remember_authorized(&file(root.path(), "a.md", "a"))
        .unwrap();
    let pending = root
        .path()
        .join("recents")
        .join(format!(".pending-{}", uuid::Uuid::new_v4()));
    let unknown = root.path().join("recents/unrelated-note.txt");
    fs::write(&pending, b"uncommitted metadata").unwrap();
    fs::write(&unknown, b"leave this alone").unwrap();
    assert_eq!(store.list().unwrap().entries[0].id, entry.id);
    assert!(!pending.exists());
    assert_eq!(fs::read(&unknown).unwrap(), b"leave this alone");
}

#[test]
fn explicit_reset_of_oversized_corruption_keeps_only_a_bounded_backup() {
    let root = tempfile::tempdir().unwrap();
    let store = store(root.path());
    let path = file(root.path(), "a.md", "a");
    store.remember_authorized(&path).unwrap();
    let manifest = root.path().join("recents/history.json");
    fs::write(&manifest, vec![b'x'; recent_files::MAX_STORE_BYTES + 100]).unwrap();
    assert!(matches!(store.list(), Err(RecentError::Corrupt)));
    store.clear().unwrap();
    assert!(store.list().unwrap().entries.is_empty());
    assert_eq!(
        fs::metadata(root.path().join("recents/last-corrupt.json"))
            .unwrap()
            .len(),
        recent_files::MAX_STORE_BYTES as u64
    );
    assert_eq!(fs::read_to_string(path).unwrap(), "a");
}

#[cfg(unix)]
#[test]
fn a_resolved_recent_target_keeps_its_directory_capability_when_the_path_moves() {
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join("parent");
    fs::create_dir(&directory).unwrap();
    let path = file(&directory, "a.md", "original authorized directory");
    let store = store(root.path());
    let entry = store.remember_authorized(&path).unwrap();
    let target = store.resolve(&entry.id).unwrap();
    fs::rename(&directory, root.path().join("moved")).unwrap();
    fs::create_dir(&directory).unwrap();
    file(&directory, "a.md", "replacement directory");
    let mut documents = DocumentService::new();
    let opened = documents
        .open_in_directory(target.directory, &target.name, target.display_path)
        .unwrap();
    assert_eq!(opened.text, "original authorized directory");
}

#[test]
fn revalidating_target_uses_document_service_encoding_and_size_rules() {
    let root = tempfile::tempdir().unwrap();
    let path = file(root.path(), "a.md", "valid first");
    let store = store(root.path());
    let entry = store.remember_authorized(&path).unwrap();
    fs::write(&path, [0xff]).unwrap();
    let target = store.resolve(&entry.id).unwrap();
    let mut documents = DocumentService::new();
    assert!(documents
        .open_in_directory(target.directory, &target.name, target.display_path)
        .is_err());
    assert_eq!(store.list().unwrap().entries[0].id, entry.id);
    fs::write(
        &path,
        document_service::Encoding::Utf16BeBom
            .encode("恢复\r\n")
            .unwrap(),
    )
    .unwrap();
    let target = store.resolve(&entry.id).unwrap();
    let opened = documents
        .open_in_directory(target.directory, &target.name, target.display_path)
        .unwrap();
    assert_eq!(opened.text, "恢复\r\n");
    assert_eq!(opened.encoding, "UTF-16BE BOM");
    fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .unwrap()
        .set_len(document_service::MAX_FILE_BYTES as u64 + 1)
        .unwrap();
    let target = store.resolve(&entry.id).unwrap();
    assert!(matches!(
        documents.open_in_directory(target.directory, &target.name, target.display_path),
        Err(document_service::DocumentError::TooLarge)
    ));
    assert_eq!(store.list().unwrap().entries[0].id, entry.id);
}
