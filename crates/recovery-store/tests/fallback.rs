use recovery_store::{DocumentMetadata, DraftContent, RecoveryError, RecoveryStore};
const ID: &str = "00000000-0000-4000-8000-000000000001";
fn draft() -> DraftContent {
    DraftContent {
        text: "\u{feff}# 标题\r\n\rAlpha\n修改🙂\r".into(),
        saved_text: "\u{feff}# 标题\r\n\rAlpha\n".into(),
        document: Some(DocumentMetadata {
            path: "/metadata/文档.md".into(),
            encoding: "UTF-16BE BOM".into(),
        }),
        selection: None,
    }
}
#[test]
fn lost_reply_retry_after_restart_returns_exact_durable_import() {
    let dir = tempfile::tempdir().unwrap();
    let receipt = {
        let mut store = RecoveryStore::open(dir.path()).unwrap();
        store.import_fallback(ID, 17, draft()).unwrap()
    };
    let mut store = RecoveryStore::open(dir.path()).unwrap();
    let retry = store.import_fallback(ID, 17, draft()).unwrap();
    assert_eq!(retry.id, receipt.id);
    assert_eq!(retry.version, receipt.version);
    assert_eq!(store.list().unwrap().drafts.len(), 1);
    assert_eq!(
        store.read(&retry.id, retry.version).unwrap().content,
        draft()
    );
}
#[test]
fn an_identity_cannot_be_reused_to_replace_different_text_or_metadata() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open(dir.path()).unwrap();
    let receipt = store.import_fallback(ID, 1, draft()).unwrap();
    let mut changed = draft();
    changed.text.push('X');
    assert!(matches!(
        store.import_fallback(ID, 1, changed),
        Err(RecoveryError::StaleVersion)
    ));
    let mut changed = draft();
    changed.document.as_mut().unwrap().encoding = "UTF-8".into();
    assert!(matches!(
        store.import_fallback(ID, 1, changed),
        Err(RecoveryError::StaleVersion)
    ));
    assert_eq!(store.read(&receipt.id, 1).unwrap().content, draft());
}
#[test]
fn consumed_import_is_not_resurrected_by_old_local_copy_after_restart() {
    let dir = tempfile::tempdir().unwrap();
    {
        let mut store = RecoveryStore::open(dir.path()).unwrap();
        let imported = store.import_fallback(ID, 7, draft()).unwrap();
        store.consume(&imported.id, imported.version, None).unwrap();
    }
    let mut store = RecoveryStore::open(dir.path()).unwrap();
    let retry = store.import_fallback(ID, 7, draft()).unwrap();
    assert!(!retry.available);
    assert!(store.list().unwrap().drafts.is_empty());
    assert!(store.list().unwrap().issues.is_empty());
    assert!(store.import_fallback(ID, 8, draft()).unwrap().available);
}
#[test]
fn damaged_import_receipt_is_preserved_and_not_overwritten() {
    let dir = tempfile::tempdir().unwrap();
    let mut store = RecoveryStore::open(dir.path()).unwrap();
    let imported = store.import_fallback(ID, 1, draft()).unwrap();
    store.consume(&imported.id, 1, None).unwrap();
    let path = dir.path().join(format!("{}.0.json", imported.id));
    std::fs::write(&path, "broken marker").unwrap();
    assert!(matches!(
        store.import_fallback(ID, 1, draft()),
        Err(RecoveryError::InvalidData)
    ));
    assert_eq!(std::fs::read_to_string(path).unwrap(), "broken marker");
}
#[test]
fn another_instance_cannot_open_or_import_while_store_owner_is_alive() {
    let dir = tempfile::tempdir().unwrap();
    let first = RecoveryStore::open(dir.path()).unwrap();
    assert!(matches!(
        RecoveryStore::open(dir.path()),
        Err(RecoveryError::Busy)
    ));
    drop(first);
    assert!(RecoveryStore::open(dir.path())
        .unwrap()
        .import_fallback(ID, 1, draft())
        .is_ok());
}
