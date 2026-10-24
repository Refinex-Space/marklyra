use super::WindowServices;
use document_service::DirectoryBookmark;
use file_index::WorkspacePayload;

impl WindowServices {
    /// The recent-file UI explicitly opens the accepted document's parent. Neither a renderer
    /// path nor an agent's single-document grant can choose a different directory here.
    pub(crate) fn open_document_workspace(
        &self,
        label: &str,
        document_id: &str,
    ) -> Result<(WorkspacePayload, DirectoryBookmark), String> {
        let retained = self.get_workspaces(label)?;
        self.mutate_document(label, |documents| {
            let (directory, _, path) = documents
                .entry_location(document_id)
                .map_err(|error| error.to_string())?;
            let parent = path.parent().ok_or("文档没有有效的所在目录")?;
            // Capture/reopen verifies the retained directory identity, including replacements
            // at the old pathname. Never widen a single-file ID by trusting its display path.
            let bookmark = DirectoryBookmark::capture(&directory, parent)
                .map_err(|error| error.to_string())?;
            let mut registry = retained.lock().map_err(|_| "目录状态不可用")?;
            if !self.is_current_workspaces(label, &retained) {
                return Err("编辑窗口已关闭或已更换目录会话".into());
            }
            let selected = registry
                .restore_bookmark(&bookmark)
                .map_err(|error| error.to_string())?;
            if !self.is_current_workspaces(label, &retained) {
                registry.close(&selected.id);
                return Err("编辑窗口已关闭或已更换目录会话".into());
            }
            Ok((selected, bookmark))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn opens_only_the_accepted_documents_parent_and_preserves_file_bytes() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("中文笔记");
        fs::create_dir(&root).unwrap();
        let source = b"\xef\xbb\xbf# Plan\r\n\r\nTail  \n";
        fs::write(root.join("Plan.md"), source).unwrap();
        fs::write(root.join("Sibling.md"), "sibling").unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        let file = services
            .write_document("main", |documents| {
                documents.open_authorized(&root.join("Plan.md"))
            })
            .unwrap();
        let (folder, bookmark) = services.open_document_workspace("main", &file.id).unwrap();
        assert_eq!(folder.name, "中文笔记");
        assert_eq!(bookmark.path(), fs::canonicalize(&root).unwrap());
        assert_eq!(fs::read(root.join("Plan.md")).unwrap(), source);
        let sibling = services
            .open_workspace_document("main", &folder.id, "Sibling.md", None)
            .unwrap();
        assert_eq!(sibling.text, "sibling");
        assert!(services
            .open_workspace_document("main", &folder.id, "../outside.md", None)
            .is_err());
        services.close_workspace("main", &folder.id).unwrap();
        assert!(services
            .write_document("main", |documents| documents.authorized_path(&file.id))
            .is_ok());
    }

    #[test]
    fn closed_unknown_and_other_window_document_ids_cannot_open_a_directory() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("note.md"), "unchanged").unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-second").unwrap();
        let file = services
            .write_document("main", |documents| {
                documents.open_authorized(&temp.path().join("note.md"))
            })
            .unwrap();
        assert!(services
            .open_document_workspace("editor-second", &file.id)
            .is_err());
        assert!(services
            .open_document_workspace("main", "/tmp/untrusted.md")
            .is_err());
        services
            .write_document("main", |documents| {
                documents.close(&file.id);
                Ok(())
            })
            .unwrap();
        assert!(services.open_document_workspace("main", &file.id).is_err());
        assert!(services
            .get_workspaces("main")
            .unwrap()
            .lock()
            .unwrap()
            .ids()
            .is_empty());
        services.remove("main").unwrap();
        services.register("main").unwrap();
        assert!(services.open_document_workspace("main", &file.id).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn a_replaced_parent_path_never_authorizes_the_replacement_directory() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("Notes");
        fs::create_dir(&root).unwrap();
        fs::write(root.join("note.md"), "original").unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        let file = services
            .write_document("main", |documents| {
                documents.open_authorized(&root.join("note.md"))
            })
            .unwrap();
        fs::rename(&root, temp.path().join("Moved")).unwrap();
        fs::create_dir(&root).unwrap();
        fs::write(root.join("note.md"), "replacement").unwrap();
        assert!(services.open_document_workspace("main", &file.id).is_err());
        assert!(services
            .get_workspaces("main")
            .unwrap()
            .lock()
            .unwrap()
            .ids()
            .is_empty());
        assert_eq!(fs::read(root.join("note.md")).unwrap(), b"replacement");
    }
}
