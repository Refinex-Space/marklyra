use super::{
    file_url_path,
    queue::{OpenQueue, Receipt, MAX_INPUTS},
};
use std::{fs, path::Path, time::Duration};
use tauri::Url;
fn receipt(path: &Path) -> Receipt {
    Receipt::capture(path.to_owned()).unwrap()
}
#[test]
fn urls_decode_unicode_spaces_but_reject_authority_protocol_queries_and_controls() {
    let drive = if cfg!(windows) { "C:/" } else { "" };
    let value = file_url_path(
        &Url::parse(&format!("file:///{drive}tmp/%E4%B8%AD%E6%96%87%20file.md")).unwrap(),
    )
    .unwrap();
    let expected = if cfg!(windows) {
        "C:/tmp/中文 file.md"
    } else {
        "/tmp/中文 file.md"
    };
    assert_eq!(value, Path::new(expected));
    for value in [
        "https://example.invalid/a.md",
        "mailto:user@example.invalid",
        "file://remote/tmp/a.md",
        "file:///tmp/a.md?q=x",
        "file:///tmp/a.md#x",
        "file:///tmp/a%00.md",
        "file:///tmp/a%0a.md",
        "marklyra://localhost/index.html",
        "custom:/tmp/a.md",
    ] {
        assert!(
            file_url_path(&Url::parse(value).unwrap()).is_err(),
            "{value}"
        );
    }
}
#[test]
fn invalid_relative_missing_binary_and_special_entities_do_not_authorize() {
    assert!(Receipt::capture("relative.md".into()).is_err());
    let root = tempfile::tempdir().unwrap();
    assert!(Receipt::capture(root.path().join("missing.md")).is_err());
    fs::write(root.path().join("convert.docx"), b"PK").unwrap();
    assert!(Receipt::capture(root.path().join("convert.docx")).is_err());
    #[cfg(unix)]
    assert!(Receipt::capture("/dev/null".into()).is_err());
}
#[test]
fn os_receipt_actual_io_preserves_bom_mixed_endings_and_document_session() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("中文 空格.md");
    let bytes = b"\xef\xbb\xbf# title\r\n\r\nkeep  \n";
    fs::write(&path, bytes).unwrap();
    let selected = receipt(&path);
    let mut documents = document_service::DocumentService::new();
    let current = selected.open(&mut documents).unwrap();
    let duplicate = selected.open(&mut documents).unwrap();
    documents.close(&duplicate.id);
    documents.save(&current.id, &current.text).unwrap();
    assert_eq!(fs::read(&path).unwrap(), bytes);
    assert!(selected.target().is_ok());
}
#[test]
fn foreign_leaf_replacement_is_rejected_before_open_and_target_creation() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("A.md");
    fs::write(&path, b"original").unwrap();
    let selected = receipt(&path);
    fs::rename(&path, root.path().join("retained.md")).unwrap();
    fs::write(&path, b"foreign").unwrap();
    assert!(selected.verify().is_err());
    assert!(selected
        .open(&mut document_service::DocumentService::new())
        .is_err());
    assert!(selected.target().is_err());
    assert_eq!(fs::read(&path).unwrap(), b"foreign");
}
#[test]
fn foreign_parent_even_same_leaf_hardlink_cannot_borrow_sibling_capability() {
    let root = tempfile::tempdir().unwrap();
    let parent = root.path().join("selected");
    fs::create_dir(&parent).unwrap();
    let path = parent.join("A.md");
    fs::write(&path, b"original").unwrap();
    let selected = receipt(&path);
    if !crate::test_support::rename_retained_directory(&parent, &root.path().join("retained")) {
        selected.verify().unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"original");
        return;
    }
    fs::create_dir(&parent).unwrap();
    fs::hard_link(root.path().join("retained/A.md"), &path).unwrap();
    fs::write(parent.join("foreign.svg"), b"foreign").unwrap();
    assert!(selected.verify().is_err());
    assert!(selected
        .open(&mut document_service::DocumentService::new())
        .is_err());
    assert!(selected.target().is_err());
}
#[test]
fn directory_receipt_target_rejects_same_path_foreign_directory() {
    let root = tempfile::tempdir().unwrap();
    let parent = root.path().join("selected");
    fs::create_dir(&parent).unwrap();
    let selected = receipt(&parent);
    assert!(selected.directory);
    assert!(selected.target().is_ok());
    fs::rename(&parent, root.path().join("retained")).unwrap();
    fs::create_dir(&parent).unwrap();
    assert!(selected.target().is_err());
}
#[test]
fn queue_cold_hot_duplicate_aliases_are_entity_deduped_and_ordered() {
    let root = tempfile::tempdir().unwrap();
    let first = root.path().join("A.md");
    let alias = root.path().join("Alias.md");
    let second = root.path().join("B.md");
    fs::write(&first, b"A").unwrap();
    fs::hard_link(&first, &alias).unwrap();
    fs::write(&second, b"B").unwrap();
    let foreign_parent = root.path().join("other");
    fs::create_dir(&foreign_parent).unwrap();
    let cross_parent_alias = foreign_parent.join("Alias.md");
    fs::hard_link(&first, &cross_parent_alias).unwrap();
    let mut queue = OpenQueue::default();
    queue.push(receipt(&first));
    queue.push(receipt(&alias));
    queue.push(receipt(&cross_parent_alias));
    queue.push(receipt(&second));
    let (token, selected) = queue.claim("main").unwrap();
    assert!(selected.same_entity(&receipt(&first)));
    queue.push(receipt(&first));
    assert!(queue.claim("other").is_none());
    assert!(queue.completion("other", &token).is_err());
    assert!(queue.completion("main", "forged").is_err());
    queue.finish("other", &token);
    assert!(queue.claim("other").is_none());
    queue.finish("main", &token);
    assert!(queue.completion("main", &token).unwrap().is_none());
    let (token, selected) = queue.claim("other").unwrap();
    assert!(selected.same_entity(&receipt(&second)));
    queue.finish("other", &token);
    assert!(queue.claim("main").is_none());
}
#[test]
fn bounded_queue_warns_and_does_not_drop_the_first_sixty_four() {
    let root = tempfile::tempdir().unwrap();
    let mut queue = OpenQueue::default();
    for index in 0..MAX_INPUTS + 1 {
        let path = root.path().join(format!("{index}.md"));
        fs::write(&path, b"A").unwrap();
        queue.push(receipt(&path));
    }
    assert!(queue.next_warning().unwrap().contains("64"));
    for _ in 0..MAX_INPUTS {
        let (token, _) = queue.claim("main").unwrap();
        queue.finish("main", &token);
    }
    assert!(queue.claim("main").is_none());
}
#[test]
fn stale_undelivered_claim_requeues_but_delivered_lost_ack_does_not_replay() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("A.md");
    fs::write(&path, b"A").unwrap();
    let mut queue = OpenQueue::default();
    queue.push(receipt(&path));
    let (old, _) = queue.claim("old").unwrap();
    queue.age_claim(Duration::from_secs(121));
    queue.release_stale();
    let (fresh, _) = queue.claim("main").unwrap();
    assert!(!queue.set_candidate("old", &old, "stale-id".into()));
    assert!(queue.set_candidate("main", &fresh, "fresh-id".into()));
    queue.age_claim(Duration::from_secs(121));
    queue.release_stale();
    assert!(queue.claim("main").is_none());
    assert!(queue.completion("main", &fresh).unwrap().is_none());
    assert!(queue.next_warning().is_some());
}
#[test]
fn closing_a_claim_owner_returns_receipt_without_allowing_late_ack_or_reentrant_finish() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("A.md");
    fs::write(&path, b"A").unwrap();
    let mut queue = OpenQueue::default();
    queue.push(receipt(&path));
    let (old, _) = queue.claim("old").unwrap();
    queue.release_owner("old");
    let (token, _) = queue.claim("new").unwrap();
    assert!(queue.completion("old", &old).is_err());
    assert!(queue.completion("new", &token).unwrap().is_some());
    assert!(queue.completion("new", &token).is_err());
    queue.finish("old", &old);
    assert!(queue.claim("third").is_none());
    queue.finish("new", &token);
}

#[test]
fn completing_native_route_retains_unique_receipt_after_owner_destroy() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("A.md");
    fs::write(&path, b"A").unwrap();
    let mut queue = OpenQueue::default();
    queue.push(receipt(&path));
    let (token, _) = queue.claim("source").unwrap();
    queue.completion("source", &token).unwrap().unwrap();
    // Native preparation may be awaiting IO here. Both owner cleanup and a
    // second ready editor must leave the ongoing publication as sole owner.
    queue.release_owner("source");
    queue.age_claim(Duration::from_secs(121));
    queue.release_stale();
    queue.push(receipt(&path));
    assert!(queue.claim("other").is_none());
    assert!(queue.completion("other", &token).is_err());
    queue.finish("source", &token);
    assert!(queue.claim("other").is_none());
    assert!(queue.completion("source", &token).unwrap().is_none());
}
