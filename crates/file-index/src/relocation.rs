//! Host-only retargeting of retained mounts and outstanding naming capabilities.
//! Preparing proves directory identity before the one filesystem move. Paths
//! are descriptive metadata; the original open directories remain the grants.
use crate::{EntryKind, IndexError, Workspace, WorkspacePayload, WorkspaceRegistry};
use cap_std::fs::Dir;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

const MAX_METADATA_REVISION: u64 = 9_007_199_254_740_991;

struct PendingRetarget {
    token: String,
    directory: Arc<Dir>,
    source: Arc<cap_std::fs::File>,
    identity: Arc<same_file::Handle>,
    old_parent: String,
    old_name: String,
    old_relative: String,
    parent: String,
    name: String,
    relative: String,
}

/// Native host must serialize prepare/validate/move/commit with all workspace
/// mutations. No filesystem access or reauthorization occurs in commit.
pub struct WorkspaceRelocationPlan {
    workspace: Arc<Workspace>,
    old_root: PathBuf,
    new_root: PathBuf,
    revision: u64,
    creations: Vec<PendingRetarget>,
    entries: Vec<PendingRetarget>,
}

impl WorkspaceRegistry {
    pub fn prepare_relocation(
        &self,
        source: &Dir,
        old: &Path,
        new: &Path,
    ) -> Result<Vec<(String, WorkspaceRelocationPlan)>, IndexError> {
        self.workspaces
            .iter()
            .filter_map(
                |(id, workspace)| match workspace.prepare_relocation(source, old, new) {
                    Ok(Some(plan)) => Some(Ok((id.clone(), plan))),
                    Ok(None) => None,
                    Err(error) => Some(Err(error)),
                },
            )
            .collect()
    }
}

impl Workspace {
    fn prepare_relocation(
        self: &Arc<Self>,
        source: &Dir,
        old: &Path,
        new: &Path,
    ) -> Result<Option<WorkspaceRelocationPlan>, IndexError> {
        if !old.is_absolute() || old.parent() != new.parent() || new.file_name().is_none() {
            return Err(IndexError::InvalidPath);
        }
        let (old_root, revision) = self.display_root_binding()?;
        if !old_root.starts_with(old) && !old.starts_with(&old_root) {
            return Ok(None);
        }
        if revision >= MAX_METADATA_REVISION {
            return Err(stale());
        }
        let bookmark = self.bookmark()?;
        let new_root = if let Some(plan) = bookmark.prepare_retarget(source, old, new)? {
            plan.commit().path().to_owned()
        } else {
            // A mount above the moved folder retains its name, but its relative
            // descendant bindings still change. Prove the actual source FD.
            let relative = old
                .strip_prefix(&old_root)
                .map_err(|_| IndexError::InvalidPath)?;
            self.reject_symlinks(relative)?;
            let observed = self.root.open_dir(relative)?;
            if crate::fs_mutation::directory_identity(&observed)?
                != crate::fs_mutation::directory_identity(source)?
            {
                return Err(stale());
            }
            old_root.clone()
        };
        let creations = self.creations.lock().map_err(|_| stale())?;
        let entries = self.entries.lock().map_err(|_| stale())?;
        let mut plan = WorkspaceRelocationPlan {
            workspace: Arc::clone(self),
            old_root,
            new_root,
            revision,
            creations: vec![],
            entries: vec![],
        };
        for (token, pending) in &creations.pending {
            if let Some(change) = plan.pending_retarget(
                token,
                &pending.parent,
                &pending.entry.name,
                &pending.entry.relative_path,
                pending.entry.kind,
                &pending.directory,
                &pending.source,
                &pending.identity,
                source,
                old,
                new,
            )? {
                plan.creations.push(change);
            }
        }
        for (token, pending) in &entries.pending {
            if let Some(change) = plan.pending_retarget(
                token,
                &pending.parent,
                &pending.entry.name,
                &pending.entry.relative_path,
                pending.entry.kind,
                &pending.directory,
                &pending.source,
                &pending.identity,
                source,
                old,
                new,
            )? {
                plan.entries.push(change);
            }
        }
        drop(entries);
        drop(creations);
        Ok(Some(plan))
    }

    /// Quarantine only this retained capability after an uncertain move. It
    /// cannot be revived by a renderer supplying the expected absolute path.
    pub fn revoke_location(&self) {
        let mut location = self
            .location
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        location.uncertain = true;
        drop(location);
        self.creations
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .pending
            .clear();
        self.entries
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .pending
            .clear();
    }
}

impl WorkspaceRelocationPlan {
    #[allow(clippy::too_many_arguments)]
    fn pending_retarget(
        &self,
        token: &str,
        parent: &str,
        name: &str,
        relative: &str,
        kind: EntryKind,
        directory: &Arc<Dir>,
        source_handle: &Arc<cap_std::fs::File>,
        identity: &Arc<same_file::Handle>,
        source: &Dir,
        old: &Path,
        new: &Path,
    ) -> Result<Option<PendingRetarget>, IndexError> {
        let absolute = self.old_root.join(relative);
        let Ok(suffix) = absolute.strip_prefix(old) else {
            return Ok(None);
        };
        let parent_path = self.old_root.join(parent);
        if absolute == old {
            // A still-live creation/inspection token for the renamed directory
            // itself is kept only after proving its exact entity identity.
            if kind != EntryKind::Directory
                || &crate::fs_mutation::directory_identity(source)? != identity.as_ref()
            {
                return Err(stale());
            }
        } else {
            let book = document_service::DirectoryBookmark::capture(directory, &parent_path)?;
            if book.prepare_retarget(source, old, new)?.is_none() {
                return Err(stale());
            }
        }
        let mapped = new.join(suffix);
        let relative = mapped
            .strip_prefix(&self.new_root)
            .map_err(|_| IndexError::InvalidPath)?;
        let new_parent = relative
            .parent()
            .and_then(Path::to_str)
            .ok_or(IndexError::InvalidPath)?
            .replace(std::path::MAIN_SEPARATOR, "/");
        let new_name = relative
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(IndexError::InvalidPath)?
            .to_owned();
        let new_relative = relative
            .to_str()
            .ok_or(IndexError::InvalidPath)?
            .replace(std::path::MAIN_SEPARATOR, "/");
        Ok(Some(PendingRetarget {
            token: token.to_owned(),
            directory: Arc::clone(directory),
            source: Arc::clone(source_handle),
            identity: Arc::clone(identity),
            old_parent: parent.to_owned(),
            old_name: name.to_owned(),
            old_relative: relative_path_string(&absolute, &self.old_root)?,
            parent: new_parent,
            name: new_name,
            relative: new_relative,
        }))
    }

    pub fn validate(&self) -> Result<(), IndexError> {
        if self.workspace.display_root_binding()? != (self.old_root.clone(), self.revision) {
            return Err(stale());
        }
        let creations = self.workspace.creations.lock().map_err(|_| stale())?;
        let entries = self.workspace.entries.lock().map_err(|_| stale())?;
        for change in &self.creations {
            let pending = creations.pending.get(&change.token).ok_or_else(stale)?;
            if !change.matches(
                &pending.parent,
                &pending.entry.name,
                &pending.entry.relative_path,
                &pending.directory,
                &pending.source,
                &pending.identity,
            ) {
                return Err(stale());
            }
        }
        for change in &self.entries {
            let pending = entries.pending.get(&change.token).ok_or_else(stale)?;
            if !change.matches(
                &pending.parent,
                &pending.entry.name,
                &pending.entry.relative_path,
                &pending.directory,
                &pending.source,
                &pending.identity,
            ) {
                return Err(stale());
            }
        }
        Ok(())
    }

    /// A consumed rename token is intentionally absent. Never restore it from
    /// this plan or alter old operation receipts. Unexpected changes quarantine
    /// the mount rather than reporting the disk mutation as uncommitted.
    pub fn commit(self, id: &str) -> Result<WorkspacePayload, IndexError> {
        let result = self.commit_inner(id);
        if result.is_err() {
            self.workspace.revoke_location();
        }
        result
    }

    fn commit_inner(&self, id: &str) -> Result<WorkspacePayload, IndexError> {
        let mut creations = self
            .workspace
            .creations
            .lock()
            .map_err(|_| IndexError::MutationUncertain)?;
        let mut entries = self
            .workspace
            .entries
            .lock()
            .map_err(|_| IndexError::MutationUncertain)?;
        let mut location = self
            .workspace
            .location
            .lock()
            .map_err(|_| IndexError::MutationUncertain)?;
        if location.uncertain
            || location.path != self.old_root
            || location.revision != self.revision
        {
            return Err(IndexError::MutationUncertain);
        }
        for change in &self.creations {
            if let Some(pending) = creations.pending.get(&change.token) {
                if !change.matches(
                    &pending.parent,
                    &pending.entry.name,
                    &pending.entry.relative_path,
                    &pending.directory,
                    &pending.source,
                    &pending.identity,
                ) {
                    return Err(IndexError::MutationUncertain);
                }
            }
        }
        for change in &self.entries {
            if let Some(pending) = entries.pending.get(&change.token) {
                if !change.matches(
                    &pending.parent,
                    &pending.entry.name,
                    &pending.entry.relative_path,
                    &pending.directory,
                    &pending.source,
                    &pending.identity,
                ) {
                    return Err(IndexError::MutationUncertain);
                }
            }
        }
        for change in &self.creations {
            if let Some(pending) = creations.pending.get_mut(&change.token) {
                pending.parent.clone_from(&change.parent);
                pending.entry.name.clone_from(&change.name);
                pending.entry.relative_path.clone_from(&change.relative);
            }
        }
        for change in &self.entries {
            if let Some(pending) = entries.pending.get_mut(&change.token) {
                pending.parent.clone_from(&change.parent);
                pending.entry.name.clone_from(&change.name);
                pending.entry.relative_path.clone_from(&change.relative);
            }
        }
        location.path.clone_from(&self.new_root);
        location.revision += 1;
        Ok(WorkspacePayload {
            id: id.to_owned(),
            name: self
                .new_root
                .file_name()
                .unwrap_or(self.new_root.as_os_str())
                .to_string_lossy()
                .into_owned(),
            path: self.new_root.to_string_lossy().into_owned(),
            metadata_revision: location.revision,
        })
    }

    pub fn revoke(&self) {
        self.workspace.revoke_location();
    }
}

impl PendingRetarget {
    fn matches(
        &self,
        parent: &str,
        name: &str,
        relative: &str,
        directory: &Arc<Dir>,
        source: &Arc<cap_std::fs::File>,
        identity: &Arc<same_file::Handle>,
    ) -> bool {
        self.old_parent == parent
            && self.old_name == name
            && self.old_relative == relative
            && Arc::ptr_eq(&self.directory, directory)
            && Arc::ptr_eq(&self.source, source)
            && Arc::ptr_eq(&self.identity, identity)
    }
}

fn relative_path_string(path: &Path, root: &Path) -> Result<String, IndexError> {
    Ok(path
        .strip_prefix(root)
        .map_err(|_| IndexError::InvalidPath)?
        .to_str()
        .ok_or(IndexError::InvalidPath)?
        .replace(std::path::MAIN_SEPARATOR, "/"))
}

fn stale() -> IndexError {
    std::io::Error::other("目录位置或命名状态已变化，请重试").into()
}
