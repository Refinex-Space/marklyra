//! Native-only state transitions around a separately verified OS Trash/restore.
//! No Trash URL or filesystem move is performed or accepted from a renderer.
use crate::{
    authority::{open_directory_nofollow, same_directory},
    scoped::ScopedDocument,
    DirectoryBookmark, DocumentError, DocumentLocationState, DocumentMetadata, DocumentService,
    RenameKind,
};
use cap_std::fs::Dir;
use image_assets::{PreparedImageRegistryRetarget, PreparedImageScopeRetarget};
use std::{
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

const MAX_METADATA_REVISION: u64 = 9_007_199_254_740_991;

pub(crate) struct TrashedLocation {
    parent: Arc<Dir>,
    name: PathBuf,
    display: PathBuf,
    kind: RenameKind,
    identity: Arc<same_file::Handle>,
}

/// The native OS adapter must prove that source_identity is the current Trash
/// entity, not merely the identity it originally attempted to move. A directory
/// restoration also supplies that entity's actual, retained directory FD.
pub struct TrashRestoreTarget<'a> {
    pub parent: Arc<Dir>,
    pub name: &'a Path,
    pub display: &'a Path,
    pub kind: RenameKind,
    pub operation_key: Uuid,
    pub source_identity: &'a same_file::Handle,
    pub source_directory: Option<&'a Dir>,
    pub source_display: &'a Path,
}

struct Change {
    id: String,
    revision: u64,
    epoch: Uuid,
    watches: Vec<String>,
    path: Option<PathBuf>,
    scoped: Option<ScopedDocument>,
    images: Option<(PreparedImageScopeRetarget, PreparedImageRegistryRetarget)>,
}
struct Changes<'a> {
    service: &'a mut DocumentService,
    entries: Vec<Change>,
    metadata: Vec<DocumentMetadata>,
}
pub struct PreparedTrash<'a> {
    changes: Changes<'a>,
    location: Arc<TrashedLocation>,
    operation_key: Uuid,
}
pub struct PreparedTrashRestore<'a> {
    changes: Changes<'a>,
}

impl Changes<'_> {
    fn commit(self, trashed: Option<(Uuid, Arc<TrashedLocation>)>) -> Vec<DocumentMetadata> {
        for change in self.entries {
            let document = self
                .service
                .documents
                .get_mut(&change.id)
                .expect("prepared transition exclusively owns its document service");
            document.trashed_by = trashed.as_ref().map(|(key, _)| *key);
            document.trashed_location = trashed.as_ref().map(|(_, location)| Arc::clone(location));
            if let Some(path) = change.path {
                document.path = path;
            }
            if let Some(scoped) = change.scoped {
                document.scoped = scoped;
            }
            if let Some((scope, registry)) = change.images {
                document.image_scope = scope.commit();
                registry.commit(&mut self.service.images);
            }
            document.metadata_revision = change.revision;
            document.baseline_epoch = change.epoch;
            self.service.pending_reloads.remove(&change.id);
            self.service.retire_watches(change.watches);
        }
        self.metadata
    }
    fn revoke(self) -> Vec<String> {
        let mut affected = Vec::with_capacity(self.entries.len());
        for change in self.entries {
            let document = self
                .service
                .documents
                .get_mut(&change.id)
                .expect("prepared transition exclusively owns its document service");
            document.relocation_uncertain = true;
            document.authority.revoke();
            document.baseline_epoch = change.epoch;
            self.service.pending_reloads.remove(&change.id);
            self.service.retire_watches(change.watches);
            // Known immutable bytes are still renderable. This is not a path
            // grant: every new resolve/import is blocked by ensure_location.
            affected.push(change.id);
        }
        affected
    }
}
impl PreparedTrash<'_> {
    pub fn affected_count(&self) -> usize {
        self.changes.entries.len()
    }
    /// Only after a verified successful OS Trash of the prepared entity.
    /// Pure in-memory commit; preserves source, saved baseline and image cache.
    pub fn commit(self) -> Vec<DocumentMetadata> {
        self.changes
            .commit(Some((self.operation_key, self.location)))
    }
    pub fn revoke(self) -> Vec<String> {
        self.changes.revoke()
    }
}
impl PreparedTrashRestore<'_> {
    pub fn affected_count(&self) -> usize {
        self.changes.entries.len()
    }
    /// Only after the native adapter confirms a no-replace same-entity restore.
    /// Retained original scopes resume; no IO, reload or watcher start occurs.
    pub fn commit(self) -> Vec<DocumentMetadata> {
        self.changes.commit(None)
    }
    pub fn revoke(self) -> Vec<String> {
        self.changes.revoke()
    }
}

impl DocumentService {
    /// Conservative native preflight only. A display-path match denies a move;
    /// it never authorizes filesystem access or adopts another session's inode.
    pub fn has_available_document_at(&self, path: &Path) -> bool {
        self.documents.values().any(|document| {
            document.trashed_by.is_none() && !document.relocation_uncertain && document.path == path
        })
    }
}

impl DocumentService {
    pub fn prepare_trash(
        &mut self,
        parent: Arc<Dir>,
        name: &Path,
        display: &Path,
        kind: RenameKind,
        operation_key: Uuid,
    ) -> Result<PreparedTrash<'_>, DocumentError> {
        self.retired_watchers.clear();
        validate_target(&parent, name, display)?;
        let source = ScopedDocument::new(Arc::clone(&parent), name)?;
        let directory = if kind == RenameKind::Directory {
            let directory = open_directory_nofollow(&parent, name)?;
            DirectoryBookmark::capture(&directory, display)?;
            Some(directory)
        } else {
            None
        };
        let identity = Arc::new(match &directory {
            Some(directory) => {
                same_file::Handle::from_file(directory.try_clone()?.into_std_file())?
            }
            None => source.identity()?,
        });
        let location = Arc::new(TrashedLocation {
            parent,
            name: name.to_owned(),
            display: display.to_owned(),
            kind,
            identity,
        });
        let mut entries = vec![];
        let mut metadata = vec![];
        for (id, document) in &self.documents {
            // Original display strings are not proof that an earlier detached
            // draft belongs to a newly created/replaced entity at that name.
            if document.trashed_by.is_some() || document.relocation_uncertain {
                continue;
            }
            if let Some(directory) = &directory {
                let Ok(suffix) = document.path.strip_prefix(display) else {
                    continue;
                };
                document.ensure_location()?;
                verify_descendant(directory, suffix, &document.scoped)?;
            } else {
                if document.scoped.name != name
                    || !same_directory(&document.scoped.directory, &location.parent)?
                {
                    continue;
                }
                document.ensure_location()?;
                if document.path != display {
                    return Err(DocumentError::UnsupportedRename);
                }
                if document.authority.current(&document.scoped)?.identity != location.identity {
                    return Err(DocumentError::ExternalChange);
                }
            }
            let revision = next_revision(document.metadata_revision)?;
            entries.push(Change {
                id: id.clone(),
                revision,
                epoch: Uuid::new_v4(),
                watches: self.watches_for(id),
                path: None,
                scoped: None,
                images: None,
            });
            metadata.push(DocumentMetadata {
                id: id.clone(),
                path: document.path.to_string_lossy().into_owned(),
                encoding: document.encoding.label().to_owned(),
                metadata_revision: revision,
                location_state: DocumentLocationState::Trashed,
            });
        }
        self.retired_watchers
            .reserve(entries.iter().map(|change| change.watches.len()).sum());
        Ok(PreparedTrash {
            changes: Changes {
                service: self,
                entries,
                metadata,
            },
            location,
            operation_key,
        })
    }

    pub fn prepare_trash_restore(
        &mut self,
        target: TrashRestoreTarget<'_>,
    ) -> Result<PreparedTrashRestore<'_>, DocumentError> {
        self.prepare_trash_restore_inner(target, None)
    }

    pub fn prepare_file_trash_restore(
        &mut self,
        target: TrashRestoreTarget<'_>,
        file: &crate::TrashFileLocationLease,
    ) -> Result<PreparedTrashRestore<'_>, DocumentError> {
        file.validate_target(&target)?;
        self.prepare_trash_restore_inner(target, Some(file))
    }

    fn prepare_trash_restore_inner(
        &mut self,
        target: TrashRestoreTarget<'_>,
        file: Option<&crate::TrashFileLocationLease>,
    ) -> Result<PreparedTrashRestore<'_>, DocumentError> {
        self.retired_watchers.clear();
        validate_target(&target.parent, target.name, target.display)?;
        validate_display(target.source_display)?;
        let directory = match target.kind {
            RenameKind::Directory => {
                let source = target.source_directory.ok_or(DocumentError::InvalidPath)?;
                if !source.dir_metadata()?.is_dir()
                    || same_file::Handle::from_file(source.try_clone()?.into_std_file())?
                        != *target.source_identity
                {
                    return Err(DocumentError::ExternalChange);
                }
                DirectoryBookmark::capture(source, target.source_display)?;
                Some(source)
            }
            RenameKind::File => {
                if target.source_directory.is_some() {
                    return Err(DocumentError::InvalidPath);
                }
                None
            }
        };
        let mut entries = vec![];
        let mut metadata = vec![];
        let image_source = directory
            .map(|source| source.try_clone().map(Arc::new))
            .transpose()?;
        for (id, document) in &self.documents {
            if document.relocation_uncertain {
                continue;
            }
            if document.trashed_by.is_none() {
                if let Some(file) = file {
                    let shared = Arc::ptr_eq(&document.authority, file.authority());
                    let named = document.path == target.source_display;
                    if shared != named {
                        return Err(DocumentError::ExternalChange);
                    }
                    if !shared {
                        continue;
                    }
                    document.ensure_location()?;
                    if document.scoped.identity()? != *target.source_identity {
                        return Err(DocumentError::ExternalChange);
                    }
                    let scope = document.image_scope.prepare_file_move(
                        &document.scoped.directory,
                        target.source_display,
                        target.display,
                    )?;
                    let registry = self.images.prepare_retarget(id, &scope);
                    let revision = next_revision(document.metadata_revision)?;
                    entries.push(Change {
                        id: id.clone(),
                        revision,
                        epoch: Uuid::new_v4(),
                        watches: self.watches_for(id),
                        path: Some(target.display.to_owned()),
                        scoped: Some(file.original_scope()),
                        images: Some((scope, registry)),
                    });
                    metadata.push(DocumentMetadata {
                        id: id.clone(),
                        path: target.display.to_string_lossy().into_owned(),
                        encoding: document.encoding.label().to_owned(),
                        metadata_revision: revision,
                        location_state: DocumentLocationState::Available,
                    });
                    continue;
                }
                let Some(source) = directory else {
                    continue;
                };
                let Ok(suffix) = document.path.strip_prefix(target.source_display) else {
                    continue;
                };
                document.ensure_location()?;
                verify_descendant(source, suffix, &document.scoped)?;
                let path = target.display.join(suffix);
                validate_display(&path)?;
                let scope = document.image_scope.prepare_directory_move(
                    Arc::clone(image_source.as_ref().ok_or(DocumentError::InvalidPath)?),
                    target.source_display,
                    target.display,
                )?;
                let registry = self.images.prepare_retarget(id, &scope);
                let revision = next_revision(document.metadata_revision)?;
                entries.push(Change {
                    id: id.clone(),
                    revision,
                    epoch: Uuid::new_v4(),
                    watches: self.watches_for(id),
                    path: Some(path.clone()),
                    scoped: None,
                    images: Some((scope, registry)),
                });
                metadata.push(DocumentMetadata {
                    id: id.clone(),
                    path: path.to_string_lossy().into_owned(),
                    encoding: document.encoding.label().to_owned(),
                    metadata_revision: revision,
                    location_state: DocumentLocationState::Available,
                });
                continue;
            }
            if document.trashed_by != Some(target.operation_key) {
                continue;
            }
            let location = document
                .trashed_location
                .as_ref()
                .ok_or(DocumentError::RelocationUncertain)?;
            if location.display != target.display
                || location.name != target.name
                || location.kind != target.kind
                || !same_directory(&location.parent, &target.parent)?
                || location.identity.as_ref()
                    != file.map_or(target.source_identity, |file| file.initial_identity())
            {
                return Err(DocumentError::ExternalChange);
            }
            if let Some(file) = file {
                if !Arc::ptr_eq(&document.authority, file.authority()) {
                    return Err(DocumentError::ExternalChange);
                }
            }
            if let Some(directory) = directory {
                let suffix = document
                    .path
                    .strip_prefix(target.display)
                    .map_err(|_| DocumentError::InvalidPath)?;
                verify_descendant(directory, suffix, &document.scoped)?;
            } else if document.path != target.display
                || document.scoped.name != target.name
                || !same_directory(&document.scoped.directory, &target.parent)?
                || (file.is_none()
                    && document
                        .authority
                        .current(&document.scoped)?
                        .identity
                        .as_ref()
                        != target.source_identity)
            {
                return Err(DocumentError::ExternalChange);
            }
            let revision = next_revision(document.metadata_revision)?;
            entries.push(Change {
                id: id.clone(),
                revision,
                epoch: Uuid::new_v4(),
                watches: self.watches_for(id),
                path: None,
                scoped: None,
                images: None,
            });
            metadata.push(DocumentMetadata {
                id: id.clone(),
                path: document.path.to_string_lossy().into_owned(),
                encoding: document.encoding.label().to_owned(),
                metadata_revision: revision,
                location_state: DocumentLocationState::Available,
            });
        }
        self.retired_watchers
            .reserve(entries.iter().map(|change| change.watches.len()).sum());
        Ok(PreparedTrashRestore {
            changes: Changes {
                service: self,
                entries,
                metadata,
            },
        })
    }
}

fn verify_descendant(
    directory: &Dir,
    suffix: &Path,
    scoped: &ScopedDocument,
) -> Result<(), DocumentError> {
    if suffix.file_name() != Some(scoped.name.as_os_str()) {
        return Err(DocumentError::UnsupportedRename);
    }
    let parent = open_directory_nofollow(
        directory,
        suffix.parent().ok_or(DocumentError::InvalidPath)?,
    )?;
    if !same_directory(&parent, &scoped.directory)? {
        return Err(DocumentError::ExternalChange);
    }
    Ok(())
}
fn validate_target(parent: &Dir, name: &Path, display: &Path) -> Result<(), DocumentError> {
    let mut parts = name.components();
    if !matches!(parts.next(), Some(Component::Normal(_)))
        || parts.next().is_some()
        || !display.is_absolute()
        || display.file_name() != Some(name.as_os_str())
        || display
            .to_str()
            .is_none_or(|path| path.len() > 4096 || path.contains('\0'))
        || display
            .components()
            .any(|part| matches!(part, Component::CurDir | Component::ParentDir))
    {
        return Err(DocumentError::InvalidPath);
    }
    DirectoryBookmark::capture(parent, display.parent().ok_or(DocumentError::InvalidPath)?)?;
    Ok(())
}
fn validate_display(display: &Path) -> Result<(), DocumentError> {
    if !display.is_absolute()
        || display
            .to_str()
            .is_none_or(|path| path.len() > 4096 || path.contains('\0'))
        || display
            .components()
            .any(|part| matches!(part, Component::CurDir | Component::ParentDir))
    {
        return Err(DocumentError::InvalidPath);
    }
    Ok(())
}
fn next_revision(revision: u64) -> Result<u64, DocumentError> {
    revision
        .checked_add(1)
        .filter(|value| *value <= MAX_METADATA_REVISION)
        .ok_or(DocumentError::MetadataRevisionLimit)
}

#[cfg(test)]
mod available_restore_tests;
#[cfg(test)]
mod file_restore_tests;
#[cfg(test)]
mod tests;
