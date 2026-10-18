//! Cross-parent mount continuation. Existing same-parent relocation stays strict.
//! A copied root requires the destination FD owned by the actual move receipt.
use crate::{
    EntryKind, EntryMovePlacement, IndexError, Workspace, WorkspaceLocation, WorkspacePayload,
    WorkspaceRegistry,
};
use cap_std::fs::Dir;
use document_service::DirectoryBookmark;
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

pub struct WorkspaceMoveRelocationPlan {
    workspace: Arc<Workspace>,
    old_root: PathBuf,
    new_root: PathBuf,
    revision: u64,
    old: PathBuf,
    new: PathBuf,
    source_identity: Arc<same_file::Handle>,
    root_identity: same_file::Handle,
    moved_root: bool,
    creations: Vec<Pending>,
    entries: Vec<Pending>,
}
struct Pending {
    token: String,
    relative: String,
    source: Arc<cap_std::fs::File>,
    identity: Arc<same_file::Handle>,
}

impl WorkspaceRegistry {
    pub fn prepare_move_relocation(
        &self,
        source_parent: Arc<Dir>,
        source_name: &Path,
        old: &Path,
        new: &Path,
        kind: EntryKind,
    ) -> Result<Vec<(String, WorkspaceMoveRelocationPlan)>, IndexError> {
        if !old.is_absolute()
            || !new.is_absolute()
            || old.file_name() != Some(source_name.as_os_str())
            || new.file_name().is_none()
        {
            return Err(IndexError::InvalidPath);
        }
        DirectoryBookmark::capture(&source_parent, old.parent().ok_or(IndexError::InvalidPath)?)?;
        let source = crate::fs_mutation::open_entity(&source_parent, source_name, kind)?;
        let source_identity = Arc::new(same_file::Handle::from_file(
            source.try_clone()?.into_std(),
        )?);
        let source_directory = if kind == EntryKind::Directory {
            Some(Dir::from_std_file(source.into_std()))
        } else {
            None
        };
        crate::fs_mutation::check_entity(&source_parent, source_name, kind, &source_identity)?;
        self.workspaces
            .iter()
            .filter_map(|(id, workspace)| {
                match prepare(
                    workspace,
                    old,
                    new,
                    kind,
                    Arc::clone(&source_identity),
                    source_directory.as_ref(),
                ) {
                    Ok(Some(plan)) => Some(Ok((id.clone(), plan))),
                    Ok(None) => None,
                    Err(error) => Some(Err(error)),
                }
            })
            .collect()
    }

    /// Must follow validation of every document and mount plan. A copied mount
    /// installs a new root capability; the old Arc is explicitly quarantined.
    pub fn commit_move_relocation(
        &mut self,
        id: &str,
        plan: WorkspaceMoveRelocationPlan,
        placement: &EntryMovePlacement,
    ) -> Result<WorkspacePayload, IndexError> {
        if !self
            .workspaces
            .get(id)
            .is_some_and(|workspace| Arc::ptr_eq(workspace, &plan.workspace))
        {
            return Err(stale());
        }
        let root = plan.validate_commit_root(placement, true)?;
        if plan.moved_root {
            let workspace = Arc::new(Workspace {
                root: root.ok_or(IndexError::MutationUncertain)?,
                location: Mutex::new(WorkspaceLocation {
                    path: plan.new_root.clone(),
                    revision: plan.revision + 1,
                    uncertain: false,
                }),
                creations: Mutex::default(),
                duplicates: Mutex::default(),
                moves: Mutex::default(),
                entries: Mutex::default(),
            });
            let payload = workspace.metadata(id)?;
            plan.workspace.revoke_location();
            self.workspaces.insert(id.to_owned(), workspace);
            Ok(payload)
        } else {
            for pending in &plan.creations {
                plan.workspace.finish_creation(&pending.token)?;
            }
            for pending in &plan.entries {
                plan.workspace.finish_entry_inspection(&pending.token)?;
            }
            let mut location = plan
                .workspace
                .location
                .lock()
                .map_err(|_| IndexError::MutationUncertain)?;
            if location.uncertain
                || location.path != plan.old_root
                || location.revision < plan.revision
                || location.revision > plan.revision + 1
            {
                return Err(IndexError::MutationUncertain);
            }
            location.revision += 1;
            drop(location);
            plan.workspace.metadata(id)
        }
    }
}
fn prepare(
    workspace: &Arc<Workspace>,
    old: &Path,
    new: &Path,
    kind: EntryKind,
    source_identity: Arc<same_file::Handle>,
    source_directory: Option<&Dir>,
) -> Result<Option<WorkspaceMoveRelocationPlan>, IndexError> {
    let (old_root, revision) = workspace.display_root_binding()?;
    let moved_root = kind == EntryKind::Directory && old_root.starts_with(old);
    if !moved_root && !old.starts_with(&old_root) {
        return Ok(None);
    }
    if revision >= 9_007_199_254_740_991 {
        return Err(stale());
    }
    workspace.bookmark()?;
    let root_identity = crate::fs_mutation::directory_identity(&workspace.root)?;
    if moved_root {
        let suffix = old_root
            .strip_prefix(old)
            .map_err(|_| IndexError::InvalidPath)?;
        // Prove that this retained mount is actually inside the moved root;
        // matching display prefixes alone never create a capability.
        let observed = source_directory.ok_or(IndexError::InvalidPath)?.open_dir(
            if suffix.as_os_str().is_empty() {
                Path::new(".")
            } else {
                suffix
            },
        )?;
        if crate::fs_mutation::directory_identity(&observed)? != root_identity {
            return Err(stale());
        }
    }
    let new_root = if moved_root {
        new.join(
            old_root
                .strip_prefix(old)
                .map_err(|_| IndexError::InvalidPath)?,
        )
    } else {
        old_root.clone()
    };
    let mut plan = WorkspaceMoveRelocationPlan {
        workspace: Arc::clone(workspace),
        old_root,
        new_root,
        revision,
        old: old.to_owned(),
        new: new.to_owned(),
        source_identity,
        root_identity,
        moved_root,
        creations: vec![],
        entries: vec![],
    };
    let creations = workspace.creations.lock().map_err(|_| stale())?;
    for (token, pending) in &creations.pending {
        if moved_root
            || plan
                .old_root
                .join(&pending.entry.relative_path)
                .starts_with(old)
        {
            plan.creations.push(Pending {
                token: token.clone(),
                relative: pending.entry.relative_path.clone(),
                source: Arc::clone(&pending.source),
                identity: Arc::clone(&pending.identity),
            });
        }
    }
    let entries = workspace.entries.lock().map_err(|_| stale())?;
    for (token, pending) in &entries.pending {
        if moved_root
            || plan
                .old_root
                .join(&pending.entry.relative_path)
                .starts_with(old)
        {
            plan.entries.push(Pending {
                token: token.clone(),
                relative: pending.entry.relative_path.clone(),
                source: Arc::clone(&pending.source),
                identity: Arc::clone(&pending.identity),
            });
        }
    }
    Ok(Some(plan))
}
impl WorkspaceMoveRelocationPlan {
    /// Validate the complete host batch before filesystem IO. Replace can
    /// contribute two plans to one ancestor; reserve both revision increments.
    pub fn validate_batch(plans: &[&Self]) -> Result<(), IndexError> {
        let mut counts = std::collections::HashMap::<usize, (u64, u64)>::new();
        for plan in plans {
            plan.validate()?;
            let key = Arc::as_ptr(&plan.workspace) as usize;
            let entry = counts.entry(key).or_insert((plan.revision, 0));
            if entry.0 != plan.revision {
                return Err(stale());
            }
            entry.1 += 1;
            if entry
                .0
                .checked_add(entry.1)
                .is_none_or(|revision| revision > 9_007_199_254_740_991)
            {
                return Err(stale());
            }
        }
        Ok(())
    }
    pub fn validate(&self) -> Result<(), IndexError> {
        self.validate_memory(false, false)
    }
    fn validate_memory(
        &self,
        allow_consumed: bool,
        coordinated_commit: bool,
    ) -> Result<(), IndexError> {
        let (root, revision) = self.workspace.display_root_binding()?;
        let valid_revision = revision == self.revision
            || coordinated_commit && !self.moved_root && revision == self.revision + 1;
        if root != self.old_root
            || !valid_revision
            || crate::fs_mutation::directory_identity(&self.workspace.root)? != self.root_identity
        {
            return Err(stale());
        }
        // A Replace transaction may commit two plans for the same unchanged
        // ancestor. The second increment must still stay exactly representable
        // in renderer metadata instead of passing the preflight at MAX-1.
        if coordinated_commit && revision >= 9_007_199_254_740_991 {
            return Err(stale());
        }
        let creations = self.workspace.creations.lock().map_err(|_| stale())?;
        for expected in &self.creations {
            if let Some(current) = creations.pending.get(&expected.token) {
                if current.entry.relative_path != expected.relative
                    || !Arc::ptr_eq(&current.source, &expected.source)
                    || !Arc::ptr_eq(&current.identity, &expected.identity)
                {
                    return Err(stale());
                }
            } else if !allow_consumed {
                return Err(stale());
            }
        }
        let entries = self.workspace.entries.lock().map_err(|_| stale())?;
        for expected in &self.entries {
            if let Some(current) = entries.pending.get(&expected.token) {
                if current.entry.relative_path != expected.relative
                    || !Arc::ptr_eq(&current.source, &expected.source)
                    || !Arc::ptr_eq(&current.identity, &expected.identity)
                {
                    return Err(stale());
                }
            } else if !allow_consumed {
                return Err(stale());
            }
        }
        Ok(())
    }
    pub fn validate_commit(&self, placement: &EntryMovePlacement) -> Result<(), IndexError> {
        self.validate_commit_root(placement, false).map(|_| ())
    }
    fn validate_commit_root(
        &self,
        placement: &EntryMovePlacement,
        coordinated_commit: bool,
    ) -> Result<Option<Arc<Dir>>, IndexError> {
        self.validate_memory(true, coordinated_commit)?;
        if placement.source_display_path() != self.old
            || placement.destination_display_path() != self.new
            || placement.source_identity() != self.source_identity
        {
            return Err(IndexError::MutationUncertain);
        }
        if !self.moved_root {
            self.workspace.bookmark()?;
            return Ok(None);
        }
        let suffix = self
            .old_root
            .strip_prefix(&self.old)
            .map_err(|_| IndexError::MutationUncertain)?;
        let directory = if let Some(entry) = placement.entries().iter().find(|entry| {
            entry.suffix() == suffix
                && entry.kind() == EntryKind::Directory
                && entry.source_identity().as_ref() == &self.root_identity
        }) {
            Arc::new(Dir::from_std_file(
                entry.destination().try_clone()?.into_std(),
            ))
        } else if placement.source_identity() == placement.destination_identity() {
            // A true same-inode directory move may publish only its root.
            // Child mounts retain their own root FD after proving its new
            // path below that exact moved directory.
            let root =
                Dir::from_std_file(placement.entries()[0].destination().try_clone()?.into_std());
            let observed = root.open_dir(if suffix.as_os_str().is_empty() {
                Path::new(".")
            } else {
                suffix
            })?;
            if crate::fs_mutation::directory_identity(&observed)? != self.root_identity {
                return Err(IndexError::MutationUncertain);
            }
            Arc::clone(&self.workspace.root)
        } else {
            return Err(IndexError::MutationUncertain);
        };
        DirectoryBookmark::capture(&directory, &self.new_root)?;
        Ok(Some(directory))
    }
    pub fn revoke(&self) {
        self.workspace.revoke_location();
    }
}
fn stale() -> IndexError {
    std::io::Error::other("移动前目录挂载或命名状态已变化").into()
}

#[cfg(test)]
mod tests;
