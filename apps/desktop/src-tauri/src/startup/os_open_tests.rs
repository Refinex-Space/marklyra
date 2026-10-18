use super::*;
use std::fs;
fn document(path: &std::path::Path) -> DocumentBookmark {
    let mut service = document_service::DocumentService::new();
    let file = service.open_authorized(path).unwrap();
    service.bookmark(&file.id).unwrap()
}
#[test]
fn os_events_dedup_pending_and_consumed_true_entities_without_losing_bootstrap() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("A.md");
    fs::write(&path, b"A").unwrap();
    let entity = same_file::Handle::from_path(&path).unwrap();
    let services = crate::window_services::WindowServices::default();
    let host = StartupHost::default();
    host.set_bootstrap(
        "main",
        StartupTarget::default().with_opened_document(document(&path)),
    )
    .unwrap();
    assert!(!host.os_open_ready("main").unwrap());
    assert_eq!(
        host.matching_os_target(&services, &path, &entity, false)
            .unwrap(),
        Some("main".into())
    );
    services.register("main").unwrap();
    let claim = commands::claim_startup(&host, "main").unwrap();
    assert!(!host.os_open_ready("main").unwrap());
    assert_eq!(
        host.matching_os_target(&services, &path, &entity, false)
            .unwrap(),
        Some("main".into())
    );
    commands::restore_target(&host, &services, "main", claim, || {}).unwrap();
    assert!(host.os_open_ready("main").unwrap());
    assert!(!host.can_reuse_untitled("main").unwrap());
    assert_eq!(
        host.matching_os_target(&services, &path, &entity, false)
            .unwrap(),
        Some("main".into())
    );
    fs::rename(&path, root.path().join("retained.md")).unwrap();
    fs::write(&path, b"foreign").unwrap();
    assert_eq!(
        host.matching_os_target(
            &services,
            &path,
            &same_file::Handle::from_path(&path).unwrap(),
            false
        )
        .unwrap(),
        None
    );
}
#[test]
fn unshown_reservation_and_document_sidebar_do_not_claim_directory_open_events() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("A.md");
    fs::write(&path, b"A").unwrap();
    let entity = same_file::Handle::from_path(root.path()).unwrap();
    let services = crate::window_services::WindowServices::default();
    let host = StartupHost::default();
    let folder = DirectoryBookmark::from_native_selection(root.path()).unwrap();
    host.set_bootstrap_reserved(
        "reserved",
        StartupTarget::from_workspace(folder.clone()).unwrap(),
    )
    .unwrap();
    host.set_bootstrap(
        "doc",
        StartupTarget::from_document(document(&path), folder.clone()).unwrap(),
    )
    .unwrap();
    assert_eq!(
        host.matching_os_target(&services, root.path(), &entity, true)
            .unwrap(),
        None
    );
    host.set_bootstrap("folder", StartupTarget::from_workspace(folder).unwrap())
        .unwrap();
    assert_eq!(
        host.matching_os_target(&services, root.path(), &entity, true)
            .unwrap(),
        Some("folder".into())
    );
}
#[test]
fn os_bootstrap_retains_receipt_until_consumption_and_cannot_open_reoccupied_path() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("A.md");
    fs::write(&path, b"selected original").unwrap();
    let target = crate::os_open::Receipt::capture(path.clone())
        .unwrap()
        .target()
        .unwrap();
    let host = StartupHost::default();
    host.set_bootstrap("main", target).unwrap();
    let services = crate::window_services::WindowServices::default();
    services.register("main").unwrap();
    fs::rename(&path, root.path().join("retained.md")).unwrap();
    fs::write(&path, b"foreign replacement").unwrap();
    let claim = commands::claim_startup(&host, "main").unwrap();
    let opened = commands::restore_target(&host, &services, "main", claim, || {}).unwrap();
    assert!(opened.document.is_none());
    assert!(opened.workspace.is_none());
    assert!(!opened.warnings.is_empty());
    assert!(host.os_open_ready("main").unwrap());
    assert_eq!(fs::read(&path).unwrap(), b"foreign replacement");
}
