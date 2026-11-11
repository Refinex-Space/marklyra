//! Capability for the workspace task store: only `.marklyra/tasks` below the bound root.
use crate::{IndexError, Workspace};
use cap_std::fs::Dir;
use std::io::ErrorKind;

const SEGMENTS: [&str; 2] = [".marklyra", "tasks"];

impl Workspace {
    /// Opens the task directory without following symlinks. `create` makes missing segments;
    /// otherwise a missing store is `None`, so reading never writes to the user's folder.
    pub fn task_directory(&self, create: bool) -> Result<Option<Dir>, IndexError> {
        let binding = self.display_root_binding()?;
        let mut directory = self.root.try_clone()?;
        for name in SEGMENTS {
            match directory.symlink_metadata(name) {
                Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
                Ok(_) => return Err(IndexError::InvalidPath),
                Err(error) if error.kind() == ErrorKind::NotFound => {
                    if !create {
                        return Ok(None);
                    }
                    directory.create_dir(name)?;
                }
                Err(error) => return Err(error.into()),
            }
            let next = directory.open_dir(name)?;
            if directory.symlink_metadata(name)?.file_type().is_symlink() {
                return Err(IndexError::InvalidPath);
            }
            directory = next;
        }
        if binding != self.display_root_binding()? {
            return Err(IndexError::InvalidPath);
        }
        Ok(Some(directory))
    }
}

#[cfg(test)]
mod tests {
    use crate::WorkspaceRegistry;

    #[test]
    fn reading_never_creates_and_symlinks_are_rejected() {
        let notes = tempfile::tempdir().unwrap();
        let root = notes.path().canonicalize().unwrap();
        let mut registry = WorkspaceRegistry::default();
        let selected = registry.select_authorized(&root).unwrap();
        let workspace = registry.get(&selected.id).unwrap();
        assert!(workspace.task_directory(false).unwrap().is_none());
        assert!(!root.join(".marklyra").exists());
        let dir = workspace.task_directory(true).unwrap().unwrap();
        dir.write("probe.md", "x").unwrap();
        assert!(root.join(".marklyra/tasks/probe.md").exists());
        #[cfg(unix)]
        {
            let other = tempfile::tempdir().unwrap();
            std::fs::remove_dir_all(root.join(".marklyra")).unwrap();
            std::os::unix::fs::symlink(other.path(), root.join(".marklyra")).unwrap();
            assert!(workspace.task_directory(true).is_err());
        }
    }
}
