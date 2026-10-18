//! Native-only read-only action preflight for an existing inspection capability.
//! This is independent of rename receipts and performs no mutation or grant.
use crate::{
    fs_mutation::{check_entity, check_name, check_parent, check_token},
    EntryKind, IndexError, Workspace,
};
use cap_std::fs::{Dir, File};
use std::{
    io,
    path::{Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

pub struct InspectedEntryAction {
    owner: Uuid,
    token: String,
    parent: String,
    relative: String,
    root_revision: u64,
    directory: Arc<Dir>,
    name: PathBuf,
    display_path: PathBuf,
    kind: EntryKind,
    source: Arc<File>,
    identity: Arc<same_file::Handle>,
}

impl InspectedEntryAction {
    pub fn directory(&self) -> Arc<Dir> {
        Arc::clone(&self.directory)
    }
    pub fn name(&self) -> &Path {
        &self.name
    }
    pub fn display_path(&self) -> &Path {
        &self.display_path
    }
    pub fn kind(&self) -> EntryKind {
        self.kind
    }
    pub fn source(&self) -> Arc<File> {
        Arc::clone(&self.source)
    }
    pub fn source_identity(&self) -> Arc<same_file::Handle> {
        Arc::clone(&self.identity)
    }
    pub fn entry_token(&self) -> &str {
        &self.token
    }
}

impl Workspace {
    /// Captures the original inspection's Arcs without consuming it. The host
    /// must serialize this and final validation/consumption with mutations.
    pub fn prepare_entry_action(&self, token: &str) -> Result<InspectedEntryAction, IndexError> {
        check_token(token)?;
        let (root, root_revision) = self.display_root_binding()?;
        let state = self.entries.lock().map_err(|_| unavailable())?;
        let pending = state.pending.get(token).ok_or_else(stale)?;
        let plan = InspectedEntryAction {
            owner: state.owner,
            token: token.to_owned(),
            parent: pending.parent.clone(),
            relative: pending.entry.relative_path.clone(),
            root_revision,
            directory: Arc::clone(&pending.directory),
            name: pending.entry.name.clone().into(),
            display_path: root.join(&pending.entry.relative_path),
            kind: pending.entry.kind,
            source: Arc::clone(&pending.source),
            identity: Arc::clone(&pending.identity),
        };
        drop(state);
        self.validate_entry_action(&plan)?;
        Ok(plan)
    }

    /// A native caller must revalidate while holding its mutation lane, then
    /// consume the inspection immediately before the real OS action. Validation
    /// is not a reservation, authorization by display path or an OS atomic CAS.
    pub fn validate_entry_action(&self, plan: &InspectedEntryAction) -> Result<(), IndexError> {
        check_token(&plan.token)?;
        let name = plan.name.to_str().ok_or(IndexError::InvalidPath)?;
        check_name(name)?;
        self.validate_action_memory(plan)?;
        let check_root = || -> Result<(), IndexError> {
            let (root, revision) = self.display_root_binding()?;
            if revision != plan.root_revision || root.join(&plan.relative) != plan.display_path {
                return Err(stale());
            }
            Ok(())
        };
        check_root()?;
        check_parent(self, &plan.parent, &plan.directory)?;
        if same_file::Handle::from_file(plan.source.try_clone()?.into_std())? != *plan.identity {
            return Err(stale());
        }
        check_entity(&plan.directory, &plan.name, plan.kind, &plan.identity)?;
        check_parent(self, &plan.parent, &plan.directory)?;
        check_root()?;
        self.validate_action_memory(plan)
    }

    fn validate_action_memory(&self, plan: &InspectedEntryAction) -> Result<(), IndexError> {
        let state = self.entries.lock().map_err(|_| unavailable())?;
        let pending = state.pending.get(&plan.token).ok_or_else(stale)?;
        if state.owner != plan.owner
            || pending.parent != plan.parent
            || pending.entry.relative_path != plan.relative
            || Path::new(&pending.entry.name) != plan.name
            || pending.entry.kind != plan.kind
            || !Arc::ptr_eq(&pending.directory, &plan.directory)
            || !Arc::ptr_eq(&pending.source, &plan.source)
            || !Arc::ptr_eq(&pending.identity, &plan.identity)
        {
            return Err(stale());
        }
        Ok(())
    }
}

fn stale() -> IndexError {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        "条目检查已失效，请重新检查目标",
    )
    .into()
}
fn unavailable() -> IndexError {
    io::Error::other("条目检查状态不可用").into()
}

#[cfg(test)]
mod tests;
