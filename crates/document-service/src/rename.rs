//! Native-only same-parent metadata handoff. The host holds its shared write
//! gate and all affected service guards through prepare -> OS move -> commit.
use crate::{
    scoped::ScopedDocument, DirectoryBookmark, DocumentError, DocumentMetadata, DocumentService,
};
use cap_std::fs::Dir;
use image_assets::{PreparedImageRegistryRetarget, PreparedImageScopeRetarget};
use std::{
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

mod move_entry;
pub use move_entry::{NativeMoveTarget, PreparedMove, PreparedMoves};

const MAX_METADATA_REVISION: u64 = 9_007_199_254_740_991;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RenameKind {
    File,
    Directory,
}

struct Change {
    id: String,
    scoped: ScopedDocument,
    path: PathBuf,
    revision: u64,
    epoch: Uuid,
    authority_name: Option<PathBuf>,
    images: Option<(PreparedImageScopeRetarget, PreparedImageRegistryRetarget)>,
    watches: Vec<String>,
}

/// Not serializable, cloneable or transferable to another service. Its exclusive
/// borrow prevents a close/save/reload between preflight and metadata commit.
/// Dropping it before an OS move leaves every session unchanged.
pub struct PreparedRename<'a> {
    service: &'a mut DocumentService,
    changes: Vec<Change>,
    metadata: Vec<DocumentMetadata>,
}

impl PreparedRename<'_> {
    pub fn affected_count(&self) -> usize {
        self.changes.len()
    }

    /// Call only after the host verified successful no-replace movement of the
    /// prepared source identity. No filesystem IO or fallible re-opening occurs.
    /// Old watch leases and reload tickets are invalidated; same-parent image
    /// roots/tokens and all source/encoding/saved bytes stay intact.
    pub fn commit(self) -> Vec<DocumentMetadata> {
        for change in self.changes {
            let document = self
                .service
                .documents
                .get_mut(&change.id)
                .expect("prepared rename exclusively owns its document service");
            if let Some(name) = change.authority_name {
                document.authority.retarget(&document.scoped.name, name);
            }
            document.scoped = change.scoped;
            if let Some((scope, registry)) = change.images {
                document.image_scope = scope.commit();
                registry.commit(&mut self.service.images);
            }
            document.path = change.path;
            document.metadata_revision = change.revision;
            document.baseline_epoch = change.epoch;
            self.service.pending_reloads.remove(&change.id);
            self.service.retire_watches(change.watches);
        }
        self.metadata
    }

    /// The OS may already have moved the source, but its final identity/path is
    /// unconfirmed. Keep the draft's session and encoding; revoke its old location
    /// rather than guessing a new path or authorizing retries on the old name.
    pub fn revoke(self) -> Vec<String> {
        let mut affected = Vec::with_capacity(self.changes.len());
        for change in self.changes {
            let document = self
                .service
                .documents
                .get_mut(&change.id)
                .expect("prepared rename exclusively owns its document service");
            document.relocation_uncertain = true;
            document.authority.revoke();
            document.baseline_epoch = change.epoch;
            self.service.pending_reloads.remove(&change.id);
            self.service.retire_watches(change.watches);
            self.service.images.close_document(&change.id);
            affected.push(change.id);
        }
        affected
    }
}

impl DocumentService {
    /// Preflight one host-owned entry, never renderer absolute paths. This does
    /// not rename disk content and does not modify any document on failure.
    pub fn prepare_rename(
        &mut self,
        directory: Arc<Dir>,
        old_name: &Path,
        new_name: &Path,
        old_display: &Path,
        new_display: &Path,
        kind: RenameKind,
    ) -> Result<PreparedRename<'_>, DocumentError> {
        self.retired_watchers.clear();
        let source = ScopedDocument::new(Arc::clone(&directory), old_name)?;
        ScopedDocument::new(Arc::clone(&directory), new_name)?;
        let parent = old_display.parent().ok_or(DocumentError::InvalidPath)?;
        if !valid_display(old_display)
            || !valid_display(new_display)
            || old_display.file_name() != Some(old_name.as_os_str())
            || new_display.file_name() != Some(new_name.as_os_str())
        {
            return Err(DocumentError::InvalidPath);
        }
        if new_display.parent() != Some(parent) {
            return Err(DocumentError::UnsupportedRename);
        }
        DirectoryBookmark::capture(&directory, parent)?;
        let mut changes = Vec::new();
        let mut metadata = Vec::new();
        if kind == RenameKind::Directory {
            let moved = crate::authority::open_directory_nofollow(&directory, old_name)?;
            DirectoryBookmark::capture(&moved, old_display)?;
            for (id, document) in &self.documents {
                if document.trashed_by.is_some() {
                    continue;
                }
                let Ok(suffix) = document.path.strip_prefix(old_display) else {
                    continue;
                };
                document.ensure_location()?;
                if suffix.file_name() != Some(document.scoped.name.as_os_str()) {
                    return Err(DocumentError::UnsupportedRename);
                }
                let observed = crate::authority::open_directory_nofollow(
                    &moved,
                    suffix.parent().ok_or(DocumentError::InvalidPath)?,
                )?;
                if !crate::authority::same_directory(&observed, &document.scoped.directory)? {
                    return Err(DocumentError::ExternalChange);
                }
                let path = new_display.join(suffix);
                if !valid_display(&path) {
                    return Err(DocumentError::InvalidPath);
                }
                let revision = next_revision(document.metadata_revision)?;
                let scope =
                    document
                        .image_scope
                        .prepare_retarget(&moved, old_display, new_display)?;
                let registry = self.images.prepare_retarget(id, &scope);
                metadata.push(DocumentMetadata {
                    id: id.clone(),
                    path: path.to_string_lossy().into_owned(),
                    encoding: document.encoding.label().to_owned(),
                    metadata_revision: revision,
                    location_state: crate::DocumentLocationState::Available,
                });
                changes.push(Change {
                    id: id.clone(),
                    scoped: document.scoped.clone(),
                    path,
                    revision,
                    epoch: Uuid::new_v4(),
                    authority_name: None,
                    images: Some((scope, registry)),
                    watches: self.watches_for(id),
                });
            }
        } else {
            let current_identity = source.identity()?;
            let parent_identity =
                same_file::Handle::from_file(directory.try_clone()?.into_std_file())?;
            for (id, document) in &self.documents {
                if document.trashed_by.is_some() {
                    continue;
                }
                if document.scoped.name != old_name {
                    continue;
                }
                let document_parent = same_file::Handle::from_file(
                    document.scoped.directory.try_clone()?.into_std_file(),
                )?;
                if document_parent != parent_identity {
                    continue;
                }
                document.ensure_location()?;
                if document.path != old_display {
                    return Err(DocumentError::UnsupportedRename);
                }
                if *document.authority.current(&document.scoped)?.identity != current_identity {
                    return Err(DocumentError::ExternalChange);
                }
                let revision = next_revision(document.metadata_revision)?;
                let scoped = ScopedDocument::new(Arc::clone(&document.scoped.directory), new_name)?;
                metadata.push(DocumentMetadata {
                    id: id.clone(),
                    path: new_display.to_string_lossy().into_owned(),
                    encoding: document.encoding.label().to_owned(),
                    metadata_revision: revision,
                    location_state: crate::DocumentLocationState::Available,
                });
                changes.push(Change {
                    id: id.clone(),
                    scoped,
                    path: new_display.to_owned(),
                    revision,
                    epoch: Uuid::new_v4(),
                    authority_name: Some(new_name.to_owned()),
                    images: None,
                    watches: self.watches_for(id),
                });
            }
        }
        self.retired_watchers
            .reserve(changes.iter().map(|change| change.watches.len()).sum());
        Ok(PreparedRename {
            service: self,
            changes,
            metadata,
        })
    }
}

fn next_revision(revision: u64) -> Result<u64, DocumentError> {
    revision
        .checked_add(1)
        .filter(|value| *value <= MAX_METADATA_REVISION)
        .ok_or(DocumentError::MetadataRevisionLimit)
}

fn valid_display(path: &Path) -> bool {
    path.is_absolute()
        && path
            .to_str()
            .is_some_and(|value| value.len() <= 4096 && !value.contains('\0'))
        && !path
            .components()
            .any(|part| matches!(part, Component::CurDir | Component::ParentDir))
}

#[cfg(test)]
mod tests;
