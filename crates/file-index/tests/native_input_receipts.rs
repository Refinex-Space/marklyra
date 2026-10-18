use file_index::WorkspaceRegistry;
use std::fs;

#[test]
fn native_receipt_is_compared_to_retained_root_and_rejected_mounts_consume_no_capacity() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("selected");
    fs::create_dir(&path).unwrap();
    let selected = same_file::Handle::from_path(&path).unwrap();
    fs::rename(&path, root.path().join("original")).unwrap();
    fs::create_dir(&path).unwrap();
    let mut workspaces = WorkspaceRegistry::default();
    for _ in 0..34 {
        assert!(workspaces
            .select_authorized_entity(&path, &selected)
            .is_err());
    }
    assert!(workspaces.ids().is_empty());
    fs::remove_dir(&path).unwrap();
    fs::rename(root.path().join("original"), &path).unwrap();
    fs::write(path.join("own.md"), b"own").unwrap();
    let opened = workspaces
        .select_authorized_entity(&path, &selected)
        .unwrap();
    assert_eq!(
        workspaces
            .get(&opened.id)
            .unwrap()
            .list_directory("")
            .unwrap()
            .entries[0]
            .name,
        "own.md"
    );
}

#[test]
fn file_receipt_cannot_authorize_a_directory_even_if_both_are_native_selected() {
    let root = tempfile::tempdir().unwrap();
    let file = root.path().join("file.md");
    fs::write(&file, b"source").unwrap();
    let selected = same_file::Handle::from_path(file).unwrap();
    let mut workspaces = WorkspaceRegistry::default();
    assert!(workspaces
        .select_authorized_entity(root.path(), &selected)
        .is_err());
    assert!(workspaces.ids().is_empty());
}
