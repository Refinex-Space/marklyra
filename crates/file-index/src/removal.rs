//! Denial-only cleanup after a confirmed or uncertain native removal. The host
//! holds its mutation lane and registry guards; no deleted path grants IO.
use crate::{IndexError, Workspace, WorkspaceRegistry};
use std::path::{Component, Path, PathBuf};

impl WorkspaceRegistry {
    /// Revokes retained Arc capabilities before removing affected mount IDs.
    /// Outer mounts remain, but lose all pending capabilities below the prefix.
    /// A later disk Undo never implicitly reinserts these mounts or tokens.
    pub fn detach_removed_directory(&mut self, prefix: &Path) -> Result<Vec<String>, IndexError> {
        validate_prefix(prefix)?;
        let mut detached = Vec::new();
        let mut failed = false;
        for (id, workspace) in &self.workspaces {
            let root = match workspace.root_for_denial() {
                Ok(root) => root,
                Err(_) => {
                    // A poisoned binding cannot prove non-membership. Quarantine
                    // it rather than leave an unclassified writable capability.
                    workspace.revoke_location();
                    detached.push(id.clone());
                    failed = true;
                    continue;
                }
            };
            if workspace.invalidate_removed_entries(prefix).is_err() {
                failed = true;
            }
            if root.starts_with(prefix) {
                workspace.revoke_location();
                detached.push(id.clone());
            }
        }
        for id in &detached {
            self.workspaces.remove(id);
        }
        if failed {
            Err(IndexError::MutationUncertain)
        } else {
            Ok(detached)
        }
    }

    /// File-only removals use the same operation-capability invalidation without
    /// closing an outer mount. Continues denying other mounts after a failure.
    pub fn invalidate_removed_entries(&self, prefix: &Path) -> Result<(), IndexError> {
        validate_prefix(prefix)?;
        let mut failed = false;
        for workspace in self.workspaces.values() {
            if workspace.invalidate_removed_entries(prefix).is_err() {
                failed = true;
            }
        }
        if failed {
            Err(IndexError::MutationUncertain)
        } else {
            Ok(())
        }
    }
}

impl Workspace {
    pub fn invalidate_removed_entries(&self, prefix: &Path) -> Result<(), IndexError> {
        validate_prefix(prefix)?;
        let result = self.invalidate_removed_entries_inner(prefix);
        if result.is_err() {
            // Cleanup is post-filesystem, so an error must not leave live write
            // authority. No caller may interpret Err as "nothing was changed".
            self.revoke_location();
        }
        result
    }

    fn invalidate_removed_entries_inner(&self, prefix: &Path) -> Result<(), IndexError> {
        let root = self.root_for_denial()?;
        let creations = {
            let state = self
                .creations
                .lock()
                .map_err(|_| IndexError::MutationUncertain)?;
            state
                .pending
                .iter()
                .filter(|(_, pending)| root.join(&pending.entry.relative_path).starts_with(prefix))
                .map(|(token, _)| token.clone())
                .collect::<Vec<_>>()
        };
        let inspections = {
            let state = self
                .entries
                .lock()
                .map_err(|_| IndexError::MutationUncertain)?;
            state
                .pending
                .iter()
                .filter(|(_, pending)| root.join(&pending.entry.relative_path).starts_with(prefix))
                .map(|(token, _)| token.clone())
                .collect::<Vec<_>>()
        };
        // finish_* reacquires its own store, so never call it with either guard
        // held. Existing committed receipts remain historical facts only.
        for token in creations {
            self.finish_creation(&token)?;
        }
        for token in inspections {
            self.finish_entry_inspection(&token)?;
        }
        Ok(())
    }

    fn root_for_denial(&self) -> Result<PathBuf, IndexError> {
        // This copy is deliberately allowed for an already quarantined mount;
        // it only selects authority to deny, never one to reopen or authorize.
        let location = self
            .location
            .lock()
            .map_err(|_| IndexError::MutationUncertain)?;
        Ok(location.path.clone())
    }
}

fn validate_prefix(prefix: &Path) -> Result<(), IndexError> {
    if !prefix.is_absolute()
        || prefix
            .to_str()
            .is_none_or(|value| value.len() > 4096 || value.contains('\0'))
        || prefix
            .components()
            .any(|part| matches!(part, Component::CurDir | Component::ParentDir))
    {
        return Err(IndexError::InvalidPath);
    }
    Ok(())
}

#[cfg(test)]
mod tests;
