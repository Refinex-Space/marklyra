use super::*;
use crate::window_services::{FileUndoRequest, FileUndoResolution};
use file_index::EntryMoveConflictPolicy;
use std::{fs, path::Path};
fn setup() -> (tempfile::TempDir, WindowServices, String) {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("from")).unwrap();
    fs::create_dir(root.path().join("to")).unwrap();
    fs::write(
        root.path().join("from/A.md"),
        b"\xef\xbb\xbfAlpha\r\nTail  \n",
    )
    .unwrap();
    let s = WindowServices::default();
    s.register("main").unwrap();
    s.register("other").unwrap();
    let id = s
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .select_authorized(root.path())
        .unwrap()
        .id;
    (root, s, id)
}
fn moved(
    s: &WindowServices,
    id: &str,
    root: &Path,
    policy: EntryMoveConflictPolicy,
) -> EntryMoveResult {
    let token = s
        .mutate_workspace("main", id, |w| {
            w.inspect_entry("from/A.md").map_err(|e| e.to_string())
        })
        .unwrap()
        .entry_token;
    let operation = uuid::Uuid::new_v4().to_string();
    let target =
        cap_std::fs::Dir::open_ambient_dir(root.join("to"), cap_std::ambient_authority()).unwrap();
    let request = EntryMoveRequest {
        label: "main",
        workspace_id: id,
        token: &token,
        operation_id: &operation,
    };
    let destination = s
        .inspect_move_destination(
            &request,
            Arc::new(target),
            &fs::canonicalize(root.join("to")).unwrap(),
        )
        .unwrap();
    s.move_workspace_entry(request, destination, policy, |_| Ok(()), |_, _| vec![])
        .unwrap()
}
fn undo(s: &WindowServices, id: &str) -> super::super::perform_file_undo::FileUndoResult {
    let slot = s.get_file_undo("main", id).unwrap().unwrap();
    s.perform_file_undo_with_move(
        FileUndoRequest {
            label: "main".into(),
            workspace_id: id.into(),
            undo_token: slot.token,
            operation_id: uuid::Uuid::new_v4().to_string(),
        },
        |_| Ok(()),
        |_| vec![],
        |_| Ok(()),
        |_, _| vec![],
    )
    .unwrap()
}
#[test]
fn cross_parent_moves_all_aliases_keeps_baselines_and_undo_follows_own_save() {
    let (root, s, id) = setup();
    let a = s
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .open_authorized(&root.path().join("from/A.md"))
        .unwrap();
    let b = s
        .get_documents("other")
        .unwrap()
        .lock()
        .unwrap()
        .open_authorized(&root.path().join("from/A.md"))
        .unwrap();
    let result = moved(&s, &id, root.path(), EntryMoveConflictPolicy::Cancel);
    assert!(result.receipt.is_some());
    assert_eq!(result.changes.documents.len(), 2);
    assert!(!root.path().join("from/A.md").exists());
    s.write_document("main", |d| d.save(&a.id, "latest source\r\n"))
        .unwrap();
    assert!(s
        .write_document("other", |d| d.save(&b.id, "stale alias"))
        .is_err());
    let result = undo(&s, &id);
    assert!(matches!(
        result.resolution,
        FileUndoResolution::Committed { .. }
    ));
    assert!(!root.path().join("to/A.md").exists());
    assert_eq!(
        fs::read(root.path().join("from/A.md")).unwrap(),
        b"\xef\xbb\xbflatest source\r\n"
    );
    for (label, doc) in [("main", a), ("other", b)] {
        let registry = s.get_documents(label).unwrap();
        let service = registry.lock().unwrap();
        assert!(Path::new(&service.get_metadata(&doc.id).unwrap().path).ends_with("from/A.md"));
    }
}
#[test]
fn replace_keeps_two_equal_byte_cohorts_and_undo_restores_both_latest_publications() {
    let (root, s, id) = setup();
    let original = fs::read(root.path().join("from/A.md")).unwrap();
    fs::write(root.path().join("to/A.md"), &original).unwrap();
    let a = s
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .open_authorized(&root.path().join("from/A.md"))
        .unwrap();
    let b = s
        .get_documents("other")
        .unwrap()
        .lock()
        .unwrap()
        .open_authorized(&root.path().join("to/A.md"))
        .unwrap();
    let result = moved(&s, &id, root.path(), EntryMoveConflictPolicy::Replace);
    assert!(result.receipt.as_ref().unwrap().replaced);
    let source_path = s
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .get_metadata(&a.id)
        .unwrap()
        .path;
    let backup_path = s
        .get_documents("other")
        .unwrap()
        .lock()
        .unwrap()
        .get_metadata(&b.id)
        .unwrap()
        .path;
    assert!(Path::new(&source_path).ends_with("to/A.md"));
    assert_ne!(source_path, backup_path);
    assert!(Path::new(&backup_path).is_file());
    s.write_document("main", |d| d.save(&a.id, "source latest"))
        .unwrap();
    s.write_document("other", |d| d.save(&b.id, "target latest"))
        .unwrap();
    assert_eq!(
        fs::read(root.path().join("to/A.md")).unwrap(),
        b"\xef\xbb\xbfsource latest"
    );
    let result = undo(&s, &id);
    assert!(matches!(
        result.resolution,
        FileUndoResolution::Committed { .. }
    ));
    assert_eq!(
        fs::read(root.path().join("from/A.md")).unwrap(),
        b"\xef\xbb\xbfsource latest"
    );
    assert_eq!(
        fs::read(root.path().join("to/A.md")).unwrap(),
        b"\xef\xbb\xbftarget latest"
    );
    assert!(Path::new(
        &s.get_documents("other")
            .unwrap()
            .lock()
            .unwrap()
            .get_metadata(&b.id)
            .unwrap()
            .path
    )
    .ends_with("to/A.md"));
}
#[test]
fn directory_move_retargets_nested_mount_and_live_document_then_undo_rebinds_both() {
    let (root, s, id) = setup();
    fs::create_dir(root.path().join("from/Folder")).unwrap();
    fs::write(
        root.path().join("from/Folder/doc.md"),
        b"![blue](blue.svg)\r\n",
    )
    .unwrap();
    fs::write(
        root.path().join("from/Folder/blue.svg"),
        b"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"/>",
    )
    .unwrap();
    let doc = s
        .get_documents("other")
        .unwrap()
        .lock()
        .unwrap()
        .open_authorized(&root.path().join("from/Folder/doc.md"))
        .unwrap();
    let other = s
        .get_workspaces("other")
        .unwrap()
        .lock()
        .unwrap()
        .select_authorized(&root.path().join("from/Folder"))
        .unwrap();
    let token = s
        .mutate_workspace("main", &id, |w| {
            w.inspect_entry("from/Folder").map_err(|e| e.to_string())
        })
        .unwrap()
        .entry_token;
    let operation = uuid::Uuid::new_v4().to_string();
    let request = EntryMoveRequest {
        label: "main",
        workspace_id: &id,
        token: &token,
        operation_id: &operation,
    };
    let directory = Arc::new(
        cap_std::fs::Dir::open_ambient_dir(root.path().join("to"), cap_std::ambient_authority())
            .unwrap(),
    );
    let destination = s
        .inspect_move_destination(
            &request,
            directory,
            &fs::canonicalize(root.path().join("to")).unwrap(),
        )
        .unwrap();
    let result = s.move_workspace_entry(
        request,
        destination,
        EntryMoveConflictPolicy::Cancel,
        |_| Ok(()),
        |_, _| vec![],
    );
    if cfg!(windows) {
        let error = result
            .err()
            .expect("a mounted directory must remain pinned");
        assert!(error.contains("占用") || error.contains("使用"), "{error}");
        let metadata = s
            .get_documents("other")
            .unwrap()
            .lock()
            .unwrap()
            .get_metadata(&doc.id)
            .unwrap();
        assert!(Path::new(&metadata.path).ends_with("from/Folder/doc.md"));
        assert!(root.path().join("from/Folder/doc.md").is_file());
        assert!(!root.path().join("to/Folder").exists());
        return;
    }
    let result = result.unwrap();
    assert!(result.receipt.is_some());
    assert!(Path::new(
        &s.get_workspaces("other")
            .unwrap()
            .lock()
            .unwrap()
            .get(&other.id)
            .unwrap()
            .display_root_snapshot()
            .unwrap()
            .to_string_lossy()
            .trim_end_matches('/')
    )
    .ends_with("to/Folder"));
    assert!(Path::new(
        &s.get_documents("other")
            .unwrap()
            .lock()
            .unwrap()
            .get_metadata(&doc.id)
            .unwrap()
            .path
    )
    .ends_with("to/Folder/doc.md"));
    let slot = s
        .get_file_undo("other", &other.id)
        .unwrap()
        .expect("captured directory Move Undo is available at the exact moved mount");
    let restored = s
        .perform_file_undo_with_move(
            FileUndoRequest {
                label: "other".into(),
                workspace_id: other.id.clone(),
                undo_token: slot.token,
                operation_id: uuid::Uuid::new_v4().to_string(),
            },
            |_| Ok(()),
            |_| vec![],
            |_| Ok(()),
            |_, _| vec![],
        )
        .unwrap();
    assert!(matches!(
        restored.resolution,
        FileUndoResolution::Committed { .. }
    ));
    assert!(Path::new(
        &s.get_workspaces("other")
            .unwrap()
            .lock()
            .unwrap()
            .get(&other.id)
            .unwrap()
            .display_root_snapshot()
            .unwrap()
            .to_string_lossy()
            .trim_end_matches('/')
    )
    .ends_with("from/Folder"));
    assert_eq!(
        fs::read(root.path().join("from/Folder/doc.md")).unwrap(),
        b"![blue](blue.svg)\r\n"
    );
}
#[test]
fn move_result_binding_rejects_different_destination_without_a_second_dispatch() {
    let (_root, s, id) = setup();
    let token = s
        .mutate_workspace("main", &id, |w| {
            w.inspect_entry("from/A.md").map_err(|e| e.to_string())
        })
        .unwrap()
        .entry_token;
    let op = uuid::Uuid::new_v4().to_string();
    let first = uuid::Uuid::new_v4().to_string();
    let second = uuid::Uuid::new_v4().to_string();
    let start = s
        .begin_entry_move_action("main", &id, &token, &op, Some(&first))
        .unwrap();
    assert!(s
        .begin_entry_move_action("main", &id, &token, &op, Some(&second))
        .is_err());
    assert!(s
        .resolve_entry_move_action("main", &id, &token, &op, Some(&second))
        .is_err());
    let super::super::EntryActionStart::Ready(ticket) = start else {
        panic!()
    };
    let expected = ticket.finish(Ok(None));
    assert_eq!(
        s.resolve_entry_move_action("main", &id, &token, &op, Some(&first))
            .unwrap(),
        Some(expected)
    );
}
#[test]
fn undo_refuses_an_occupied_original_location_and_never_overwrites_it() {
    let (root, s, id) = setup();
    let result = moved(&s, &id, root.path(), EntryMoveConflictPolicy::Cancel);
    assert!(result.receipt.is_some());
    fs::write(root.path().join("from/A.md"), b"external occupant").unwrap();
    assert!(matches!(
        undo(&s, &id).resolution,
        FileUndoResolution::Rejected { .. }
    ));
    assert_eq!(
        fs::read(root.path().join("from/A.md")).unwrap(),
        b"external occupant"
    );
    assert!(root.path().join("to/A.md").is_file());
    assert!(s.get_file_undo("main", &id).unwrap().is_none());
}

#[test]
#[ignore = "Requires the explicitly owned mounted APFS test volume"]
fn actual_volume_host_coordinates_directory_alias_mount_resources_save_and_undo() {
    let volume = std::env::var_os("MARKLYRA_MOVE_VOLUME_DIRECTORY").expect("owned volume path");
    let destination = tempfile::Builder::new()
        .prefix("host-owned-")
        .tempdir_in(volume)
        .unwrap()
        .keep();
    let (root, s, id) = setup();
    fs::create_dir(root.path().join("from/Folder")).unwrap();
    let raw = b"\xef\xbb\xbfAlpha\r\n\r\n![blue](blue.svg)\nTail  \r\n";
    fs::write(root.path().join("from/Folder/doc.md"), raw).unwrap();
    fs::write(
        root.path().join("from/Folder/blue.svg"),
        b"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1\" height=\"1\"/>",
    )
    .unwrap();
    let a = s
        .get_documents("main")
        .unwrap()
        .lock()
        .unwrap()
        .open_authorized(&root.path().join("from/Folder/doc.md"))
        .unwrap();
    let b = s
        .get_documents("other")
        .unwrap()
        .lock()
        .unwrap()
        .open_authorized(&root.path().join("from/Folder/doc.md"))
        .unwrap();
    let mounted = s
        .get_workspaces("other")
        .unwrap()
        .lock()
        .unwrap()
        .select_authorized(&root.path().join("from/Folder"))
        .unwrap();
    let token = s
        .mutate_workspace("main", &id, |w| {
            w.inspect_entry("from/Folder").map_err(|e| e.to_string())
        })
        .unwrap()
        .entry_token;
    let op = uuid::Uuid::new_v4().to_string();
    let request = EntryMoveRequest {
        label: "main",
        workspace_id: &id,
        token: &token,
        operation_id: &op,
    };
    let book = document_service::DirectoryBookmark::from_native_selection(&destination).unwrap();
    let captured = s
        .inspect_move_destination(&request, book.reopen().unwrap(), book.path())
        .unwrap();
    let result = s
        .move_workspace_entry(
            request,
            captured,
            EntryMoveConflictPolicy::Cancel,
            |_| Ok(()),
            |_, _| vec![],
        )
        .unwrap();
    assert!(result.receipt.as_ref().unwrap().cross_volume);
    assert_eq!(fs::read(destination.join("Folder/doc.md")).unwrap(), raw);
    assert!(!root.path().join("from/Folder").exists());
    s.write_document("main", |d| d.save(&a.id, "own cross-volume draft\r\n"))
        .unwrap();
    assert!(s
        .write_document("other", |d| d.save(&b.id, "stale alias"))
        .is_err());
    assert_eq!(
        s.get_workspaces("other")
            .unwrap()
            .lock()
            .unwrap()
            .get(&mounted.id)
            .unwrap()
            .display_root_snapshot()
            .unwrap(),
        destination.join("Folder")
    );
    let result = undo(&s, &id);
    assert!(matches!(
        result.resolution,
        FileUndoResolution::Committed { .. }
    ));
    assert_eq!(
        fs::read(root.path().join("from/Folder/doc.md")).unwrap(),
        b"\xef\xbb\xbfown cross-volume draft\r\n"
    );
    assert!(root.path().join("from/Folder/blue.svg").is_file());
    assert!(!destination.join("Folder").exists());
    assert!(Path::new(
        &s.get_documents("other")
            .unwrap()
            .lock()
            .unwrap()
            .get_metadata(&b.id)
            .unwrap()
            .path
    )
    .ends_with("from/Folder/doc.md"));
    println!(
        "owned host cross-volume destination retained: {}",
        destination.display()
    );
}
