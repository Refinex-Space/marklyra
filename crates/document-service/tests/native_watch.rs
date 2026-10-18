use document_service::{DocumentChange, DocumentService, DocumentWatch};
use std::{
    fs,
    sync::{mpsc, Arc},
    time::Duration,
};

#[test]
fn native_watcher_reports_real_writes_replacements_deletes_and_stops_on_close() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    fs::write(&path, "base").unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&path).unwrap();
    let (sender, receiver) = mpsc::channel();
    let status = service
        .start_document_watch(
            &document.id,
            Arc::new(move |hint| {
                sender.send(hint).unwrap();
            }),
        )
        .unwrap();
    let DocumentWatch::Watching { watch_id } = status else {
        panic!("native watcher is unavailable: {status:?}");
    };
    // Backend startup may be asynchronous; repeat the fixture write only until
    // the first real OS event is delivered. This is not a latency benchmark.
    let mut received = None;
    for _ in 0..20 {
        fs::write(&path, "outside").unwrap();
        if let Ok(hint) = receiver.recv_timeout(Duration::from_millis(250)) {
            received = Some(hint);
            break;
        }
    }
    let first = received.expect("no native filesystem event within 5 seconds");
    assert_eq!(first.id, document.id);
    assert_eq!(first.watch_id, watch_id);
    let DocumentChange::Changed {
        version,
        document: candidate,
    } = service.check_document_change(&document.id).unwrap()
    else {
        panic!("expected changed bytes");
    };
    assert_eq!(candidate.text, "outside");
    service
        .accept_document_change(&document.id, &version)
        .unwrap();
    while receiver.try_recv().is_ok() {}
    let staged = dir.path().join("replacement.md");
    fs::write(&staged, "replacement").unwrap();
    fs::rename(&staged, &path).unwrap();
    let hint = receiver
        .recv_timeout(Duration::from_secs(5))
        .expect("no replacement notification");
    assert_eq!(hint.watch_id, watch_id);
    let DocumentChange::Changed {
        document: candidate,
        ..
    } = service.check_document_change(&document.id).unwrap()
    else {
        panic!("expected replacement");
    };
    assert_eq!(candidate.text, "replacement");
    while receiver.try_recv().is_ok() {}
    fs::remove_file(&path).unwrap();
    receiver
        .recv_timeout(Duration::from_secs(5))
        .expect("no deletion notification");
    assert!(matches!(
        service.check_document_change(&document.id).unwrap(),
        DocumentChange::Missing { .. }
    ));
    service.close(&document.id);
    while receiver.try_recv().is_ok() {}
    fs::write(&path, "after close").unwrap();
    assert!(receiver.recv_timeout(Duration::from_millis(700)).is_err());
    assert!(!service.stop_document_watch(&document.id, &watch_id));
}

#[cfg(unix)]
#[test]
fn drifted_parent_falls_back_and_never_starts_watching_replacement_scope() {
    use std::os::unix::fs::symlink;
    let dir = tempfile::tempdir().unwrap();
    let parent = dir.path().join("parent");
    let outside = dir.path().join("outside");
    fs::create_dir(&parent).unwrap();
    fs::create_dir(&outside).unwrap();
    fs::write(parent.join("note.md"), "base").unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&parent.join("note.md")).unwrap();
    fs::rename(&parent, dir.path().join("moved")).unwrap();
    symlink(&outside, &parent).unwrap();
    assert!(matches!(
        service
            .start_document_watch(&document.id, Arc::new(|_| panic!("must not subscribe")))
            .unwrap(),
        DocumentWatch::Fallback {
            reason: document_service::WatchFailure::PathDrift,
            ..
        }
    ));
}
