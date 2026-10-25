use knowledge_index::{GraphQuery, IndexService};
use std::{
    fs,
    sync::Arc,
    time::{Duration, Instant},
};
fn wait(service: &IndexService, condition: impl Fn() -> bool) {
    let start = Instant::now();
    while start.elapsed() < Duration::from_secs(12) {
        if !service.status().working && condition() {
            return;
        }
        std::thread::sleep(Duration::from_millis(40));
    }
    panic!("index timeout: {:?}", service.status());
}
fn workspace(root: &std::path::Path) -> Arc<file_index::Workspace> {
    let mut registry = file_index::WorkspaceRegistry::default();
    let selected = registry.select_authorized(root).unwrap();
    registry.get(&selected.id).unwrap()
}
fn start(root: &std::path::Path, data: &std::path::Path) -> IndexService {
    IndexService::start(
        workspace(root),
        data.into(),
        Arc::new(|_| true),
        Arc::new(|p| p.ends_with(".md")),
    )
    .unwrap()
}
#[test]
fn watcher_incremental_pause_resume_and_rebuild_preserve_source_bytes() {
    let notes = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    let bytes = b"\xef\xbb\xbf# A\r\n\r\n[b](b.md)  \r\n";
    fs::write(notes.path().join("a.md"), bytes).unwrap();
    fs::write(notes.path().join("b.md"), "# B").unwrap();
    let service = start(notes.path(), data.path());
    wait(&service, || service.status().complete);
    assert_eq!(
        service
            .snapshot(&GraphQuery::default())
            .unwrap()
            .edges
            .len(),
        1
    );
    let before = service.status().generation;
    fs::write(notes.path().join("a.md"), "[missing](missing.md)").unwrap();
    wait(&service, || {
        service.status().generation > before
            && service
                .snapshot(&GraphQuery::default())
                .is_ok_and(|g| g.unresolved == 1)
    });
    assert_eq!(service.status().parsed, 1);
    service.active(false);
    std::thread::sleep(Duration::from_millis(220));
    let generation = service.status().generation;
    fs::write(notes.path().join("missing.md"), "# Missing").unwrap();
    std::thread::sleep(Duration::from_millis(400));
    assert_eq!(service.status().generation, generation);
    service.active(true);
    wait(&service, || {
        service
            .snapshot(&GraphQuery::default())
            .is_ok_and(|g| g.unresolved == 0 && g.edges.len() == 1)
    });
    service.reconcile(true);
    wait(&service, || service.status().parsed >= 3);
    assert_eq!(fs::read(notes.path().join("b.md")).unwrap(), b"# B");
    assert!(!notes.path().join(".marklyra").exists());
    service.shutdown();
    let service = start(notes.path(), data.path());
    wait(&service, || service.status().complete);
    assert_eq!(service.status().parsed, 0);
    assert_eq!(service.status().unchanged, 3);
    service.shutdown();
}
#[test]
fn invalid_database_is_quarantined_and_links_are_rebuilt() {
    let notes = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    fs::write(notes.path().join("a.md"), "# Original").unwrap();
    fs::write(data.path().join("index.sqlite"), "not a database").unwrap();
    let service = start(notes.path(), data.path());
    wait(&service, || service.status().complete);
    assert_eq!(
        service
            .snapshot(&GraphQuery::default())
            .unwrap()
            .total_notes,
        1
    );
    service.shutdown();
    assert!(fs::read_dir(data.path()).unwrap().any(|p| p
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with("index-corrupt-")));
}
#[cfg(unix)]
#[test]
fn symlinks_do_not_expand_authority_and_utf16_is_read_only() {
    let notes = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("secret.md"), "# Secret").unwrap();
    std::os::unix::fs::symlink(outside.path(), notes.path().join("escape")).unwrap();
    std::os::unix::fs::symlink(
        outside.path().join("secret.md"),
        notes.path().join("link.md"),
    )
    .unwrap();
    let source = document_service::Encoding::Utf16LeBom
        .encode("# 中文\r\n[x](b.md)\r\n")
        .unwrap();
    fs::write(notes.path().join("a.md"), &source).unwrap();
    fs::write(notes.path().join("b.md"), "# B").unwrap();
    let service = start(notes.path(), data.path());
    wait(&service, || service.status().complete);
    let graph = service.snapshot(&GraphQuery::default()).unwrap();
    assert_eq!(graph.total_notes, 2);
    assert_eq!(graph.edges.len(), 1);
    assert_eq!(fs::read(notes.path().join("a.md")).unwrap(), source);
    service.shutdown();
}

#[test]
fn native_path_equivalence_file_urls_and_deleted_subdirectories_update_truthfully() {
    let notes = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    let root = notes.path().canonicalize().unwrap();
    fs::write(root.join("Target.md"), "# Target\n").unwrap();
    fs::create_dir(root.join("folder")).unwrap();
    fs::write(
        root.join("folder/sub.md"),
        format!("[file](file://{}/Target.md#target)", root.display()),
    )
    .unwrap();
    fs::write(root.join("a.md"), "[case](tArGeT.md) [sub](folder/sub.md)").unwrap();
    let case_insensitive = root.join("tArGeT.md").exists();
    let service = start(&root, data.path());
    wait(&service, || service.status().complete);
    let graph = service.snapshot(&GraphQuery::default()).unwrap();
    assert_eq!(graph.total_edges, if case_insensitive { 3 } else { 2 });
    assert!(graph.edges.iter().all(|edge| !edge.anchor_missing));
    fs::remove_dir_all(root.join("folder")).unwrap();
    wait(&service, || {
        service.snapshot(&GraphQuery::default()).is_ok_and(|graph| {
            graph.total_notes == 2
                && graph.total_edges == usize::from(case_insensitive)
                && graph.unresolved == if case_insensitive { 1 } else { 2 }
        })
    });
    assert_eq!(
        fs::read(root.join("a.md")).unwrap(),
        b"[case](tArGeT.md) [sub](folder/sub.md)"
    );
    service.shutdown();
}
