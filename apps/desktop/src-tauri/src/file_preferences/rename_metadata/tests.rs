use super::*;
use file_index::EntryKind;
use std::fs;

fn setup(disabled: bool) -> (tempfile::TempDir, Store, RenameInput, Vec<Folder>) {
    let root = tempfile::tempdir().unwrap();
    let parent = fs::canonicalize(root.path()).unwrap();
    fs::create_dir(parent.join("old")).unwrap();
    fs::create_dir(parent.join("old/child")).unwrap();
    let folders = [parent.join("old"), parent.join("old/child")]
        .into_iter()
        .enumerate()
        .map(|(index, path)| Folder {
            id: uuid::Uuid::new_v4().to_string(),
            path: path.to_str().unwrap().into(),
            pinned: index == 0,
            bookmark: Some(
                document_service::DirectoryBookmark::from_native_selection(&path).unwrap(),
            ),
        })
        .collect::<Vec<_>>();
    let store = Store::open(&parent.join("preferences")).unwrap();
    store
        .transaction(|state| {
            state.folders = folders.clone();
            state.no_recent_files = disabled;
            Ok(((), true))
        })
        .unwrap();
    let directory = Arc::new(
        cap_std::fs::Dir::open_ambient_dir(&parent, cap_std::ambient_authority()).unwrap(),
    );
    let input = RenameInput::new(
        directory,
        Path::new("old"),
        Path::new("new"),
        &parent.join("old"),
        &parent.join("new"),
        EntryKind::Directory,
    )
    .unwrap();
    (root, store, input, folders)
}
#[test]
fn existing_directory_refs_keep_ids_pin_order_and_verified_identity() {
    let (_root, store, input, original) = setup(false);
    let host = FilePreferencesHost::default();
    let old_ticket = store
        .transaction(|state| Ok((host.ticket(state, host.history_request()).unwrap(), false)))
        .unwrap();
    let (ticket, plan) = host
        .prepare_rename_metadata_in_store(&store, &input)
        .unwrap();
    assert!(ticket.is_some());
    assert!(!store
        .transaction(|state| Ok((host.current_ticket(state, old_ticket), false)))
        .unwrap());
    if !crate::test_support::rename_retained_directory(&input.old, &input.new) {
        drop(plan);
        return;
    }
    host.commit_folder_rename_in_store(&store, plan).unwrap();
    store
        .transaction(|state| {
            assert_eq!(state.folders.len(), 2);
            for (current, old) in state.folders.iter().zip(&original) {
                assert_eq!(current.id, old.id);
                assert_eq!(current.pinned, old.pinned);
                assert!(Path::new(&current.path).starts_with(&input.new));
                current.bookmark.as_ref().unwrap().reopen().unwrap();
            }
            assert_eq!(state.revision, 0);
            Ok(((), false))
        })
        .unwrap();
}
#[test]
fn disabled_recording_only_rebinds_pins_and_later_clear_cancels_every_change() {
    for clear in [false, true] {
        let (_root, store, input, original) = setup(true);
        let host = FilePreferencesHost::default();
        let (ticket, plan) = host
            .prepare_rename_metadata_in_store(&store, &input)
            .unwrap();
        assert!(ticket.is_none());
        if clear {
            host.clear_history(&store, true, || Ok(())).unwrap();
        }
        if !crate::test_support::rename_retained_directory(&input.old, &input.new) {
            drop(plan);
            continue;
        }
        host.commit_folder_rename_in_store(&store, plan).unwrap();
        store
            .transaction(|state| {
                if clear {
                    assert!(state.folders.is_empty());
                } else {
                    assert_eq!(state.folders[1], original[1]);
                    assert!(Path::new(&state.folders[0].path).starts_with(&input.new));
                }
                Ok(((), false))
            })
            .unwrap();
    }
}
#[test]
fn newer_record_changes_and_no_recent_toggle_cancel_snapshot_without_restoration() {
    for toggle in [false, true] {
        let (_root, store, input, original) = setup(false);
        let host = FilePreferencesHost::default();
        let (_, plan) = host
            .prepare_rename_metadata_in_store(&store, &input)
            .unwrap();
        store
            .transaction(|state| {
                if toggle {
                    change(state, 0, PreferenceChange::NoRecentFiles(true))?;
                } else {
                    state.folders.remove(0);
                }
                Ok(((), true))
            })
            .unwrap();
        if !crate::test_support::rename_retained_directory(&input.old, &input.new) {
            drop(plan);
            continue;
        }
        host.commit_folder_rename_in_store(&store, plan).unwrap();
        store
            .transaction(|state| {
                if toggle {
                    assert_eq!(state.folders, original);
                } else {
                    assert!(state
                        .folders
                        .iter()
                        .all(|folder| folder.id != original[0].id));
                }
                Ok(((), false))
            })
            .unwrap();
    }
}
