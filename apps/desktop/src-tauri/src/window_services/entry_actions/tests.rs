use super::*;
use std::{fs, path::Path};
fn setup() -> (tempfile::TempDir, WindowServices, String, String) {
    let root = tempfile::tempdir().unwrap();
    fs::write(root.path().join("A.md"), b"Alpha\r\n").unwrap();
    let services = WindowServices::default();
    services.register("main").unwrap();
    let registry = services.get_workspaces("main").unwrap();
    let id = registry
        .lock()
        .unwrap()
        .select_authorized(root.path())
        .unwrap()
        .id;
    let entry = services
        .mutate_workspace("main", &id, |w| {
            w.inspect_entry("A.md").map_err(|e| e.to_string())
        })
        .unwrap();
    (root, services, id, entry.entry_token)
}
#[test]
fn dispatch_is_once_and_resolve_does_not_reuse_a_consumed_token() {
    let (_root, s, id, token) = setup();
    let op = uuid::Uuid::new_v4().to_string();
    let EntryActionStart::Ready(ticket) = s
        .begin_entry_action("main", &id, &token, &op, EntryActionKind::Reveal)
        .unwrap()
    else {
        panic!()
    };
    assert!(matches!(
        s.begin_entry_action("main", &id, &token, &op, EntryActionKind::Reveal)
            .unwrap(),
        EntryActionStart::Resolved(EntryActionResolution::Prepared)
    ));
    s.prepare_entry_dispatch(&ticket, |_, p| {
        assert_eq!(p.unwrap().name(), Path::new("A.md"));
        Ok(())
    })
    .unwrap();
    let expected = ticket.finish(Ok(None));
    assert_eq!(
        s.resolve_entry_action("main", &id, &token, &op, EntryActionKind::Reveal)
            .unwrap(),
        Some(expected.clone())
    );
    assert!(matches!(
        s.begin_entry_action("main", &id, &token, &op, EntryActionKind::Reveal)
            .unwrap(),
        EntryActionStart::Resolved(EntryActionResolution::Committed { .. })
    ));
    assert!(s
        .begin_entry_action("main", &id, &token, &op, EntryActionKind::OpenNew)
        .is_err());
}
#[test]
fn replaced_file_and_closed_generation_never_dispatch() {
    let (root, s, id, token) = setup();
    let op = uuid::Uuid::new_v4().to_string();
    let EntryActionStart::Ready(ticket) = s
        .begin_entry_action("main", &id, &token, &op, EntryActionKind::OpenNew)
        .unwrap()
    else {
        panic!()
    };
    fs::rename(root.path().join("A.md"), root.path().join("held.md")).unwrap();
    fs::write(root.path().join("A.md"), b"Alpha\r\n").unwrap();
    assert!(s
        .prepare_entry_dispatch::<()>(&ticket, |_, _| panic!("stale file dispatched"))
        .is_err());
    s.remove("main").unwrap();
    s.register("main").unwrap();
    assert!(s
        .prepare_entry_dispatch::<()>(&ticket, |_, _| panic!("new generation dispatched"))
        .is_err());
    assert!(s
        .resolve_entry_action("main", &id, &token, &op, EntryActionKind::OpenNew)
        .unwrap()
        .is_none());
}
#[test]
fn unknown_post_dispatch_result_is_retained_without_replay() {
    let (_root, s, id, token) = setup();
    let op = uuid::Uuid::new_v4().to_string();
    let EntryActionStart::Ready(ticket) = s
        .begin_entry_action("main", &id, &token, &op, EntryActionKind::Info)
        .unwrap()
    else {
        panic!()
    };
    s.prepare_entry_dispatch(&ticket, |_, _| Ok(())).unwrap();
    let result = ticket.finish(Err("lost OS result".into()));
    assert!(matches!(
        result,
        EntryActionResolution::MutationUncertain { .. }
    ));
    assert_eq!(
        s.resolve_entry_action("main", &id, &token, &op, EntryActionKind::Info)
            .unwrap(),
        Some(result)
    );
}

#[test]
fn root_copy_uses_only_the_current_authorized_root_and_no_entry_inspection() {
    let (root, s, id, _) = setup();
    let op = uuid::Uuid::new_v4().to_string();
    let EntryActionStart::Ready(ticket) = s
        .begin_entry_action("main", &id, &id, &op, EntryActionKind::CopyPath)
        .unwrap()
    else {
        panic!()
    };
    s.prepare_entry_dispatch(&ticket, |w, entry| {
        assert!(entry.is_none());
        assert_eq!(
            w.bookmark().unwrap().path(),
            root.path().canonicalize().unwrap()
        );
        Ok(())
    })
    .unwrap();
    assert!(s.validate_entry_owner(&ticket).is_ok());
    ticket.finish(Ok(None));
    assert!(matches!(
        s.begin_entry_action(
            "main",
            &id,
            &id,
            &uuid::Uuid::new_v4().to_string(),
            EntryActionKind::Reveal
        )
        .unwrap(),
        EntryActionStart::Resolved(EntryActionResolution::Rejected { .. })
    ));
}

#[test]
fn preflight_failure_is_retained_and_window_receipts_are_bounded() {
    let (_root, s, id, token) = setup();
    let op = uuid::Uuid::new_v4().to_string();
    let EntryActionStart::Ready(ticket) = s
        .begin_entry_action("main", &id, &token, &op, EntryActionKind::Info)
        .unwrap()
    else {
        panic!()
    };
    assert!(s
        .prepare_entry_dispatch::<()>(&ticket, |_, _| Err("capture failed".into()))
        .is_err());
    let rejected = s.reject_entry_action(ticket, "capture failed".into());
    assert_eq!(
        s.resolve_entry_action("main", &id, &token, &op, EntryActionKind::Info)
            .unwrap(),
        Some(rejected)
    );
    let mut store = EntryActions::default();
    let request = Request {
        workspace: id,
        token,
        action: EntryActionKind::Reveal,
        destination: None,
    };
    for _ in 0..256 {
        assert!(store
            .begin(&uuid::Uuid::new_v4().to_string(), request.clone())
            .unwrap()
            .is_none());
    }
    assert!(store
        .begin(&uuid::Uuid::new_v4().to_string(), request)
        .is_err());
}
