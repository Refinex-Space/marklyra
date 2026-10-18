//! Native-only publication pin across a verified file Trash/restore. A suspended
//! original name never authorizes a new open or write at the old parent.
use crate::{
    authorities::{AuthorityState, FileAuthority},
    scoped::ScopedDocument,
    DocumentError, FileLocationLease, RenameKind, TrashRestoreTarget,
};
use cap_std::fs::{Dir, File};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, MutexGuard},
};
use uuid::Uuid;

pub(crate) struct NativeTrashRegistration {
    pub operation_key: Uuid,
    pub source_display: PathBuf,
    initial_identity: Arc<same_file::Handle>,
}

pub struct PreparedTrashFileLease {
    original: ScopedDocument,
    original_parent: same_file::Handle,
    authority: Arc<FileAuthority>,
    identity: Arc<same_file::Handle>,
    key: Uuid,
}

pub struct TrashFileLocationLease {
    original: ScopedDocument,
    original_parent: same_file::Handle,
    authority: Arc<FileAuthority>,
    registration: Arc<NativeTrashRegistration>,
}

/// Fresh handle proven against the same native operation and its own atomic
/// publication lineage. It contains no renderer-grantable path constructor.
pub struct TrashFileSource {
    source: Arc<File>,
    identity: Arc<same_file::Handle>,
    initial_identity: Arc<same_file::Handle>,
    original: ScopedDocument,
    source_scope: ScopedDocument,
    display: PathBuf,
    key: Uuid,
}

impl FileLocationLease {
    pub fn prepare_trash(self, key: Uuid) -> Result<PreparedTrashFileLease, DocumentError> {
        let identity = self.current_identity()?;
        let original_parent =
            same_file::Handle::from_file(self.scope.directory.try_clone()?.into_std_file())?;
        Ok(PreparedTrashFileLease {
            original: self.scope,
            original_parent,
            authority: self.authority,
            identity,
            key,
        })
    }
}

impl PreparedTrashFileLease {
    /// Only after the OS adapter proves a successful Trash of this identity.
    /// Host mutation lane and all affected service guards remain held.
    pub fn commit(self, actual_display: &Path) -> Result<TrashFileLocationLease, DocumentError> {
        validate_display(actual_display)?;
        let registration = Arc::new(NativeTrashRegistration {
            operation_key: self.key,
            source_display: actual_display.to_owned(),
            initial_identity: Arc::clone(&self.identity),
        });
        {
            let mut state = self.authority.current(&self.original)?;
            if state.identity != self.identity {
                return Err(DocumentError::ExternalChange);
            }
            state.scope = None;
            state.suspended = true;
            state.trash = Some(Arc::downgrade(&registration));
        }
        Ok(TrashFileLocationLease {
            original: self.original,
            original_parent: self.original_parent,
            authority: self.authority,
            registration,
        })
    }
}

impl TrashFileLocationLease {
    fn state(&self) -> Result<MutexGuard<'_, AuthorityState>, DocumentError> {
        let state = self
            .authority
            .state
            .lock()
            .map_err(|_| DocumentError::RelocationUncertain)?;
        if state.revoked
            || !state
                .trash
                .as_ref()
                .and_then(std::sync::Weak::upgrade)
                .is_some_and(|registration| Arc::ptr_eq(&registration, &self.registration))
        {
            return Err(DocumentError::RelocationUncertain);
        }
        Ok(state)
    }

    /// None preserves the OS adapter's existing exact-URL/held-FD TCC branch.
    /// No Trash parent is opened unless an explicit native open already supplied it.
    pub fn current_source(&self) -> Result<Option<TrashFileSource>, DocumentError> {
        let state = self.state()?;
        if state.suspended {
            if state.scope.is_some() || state.identity != self.registration.initial_identity {
                return Err(DocumentError::RelocationUncertain);
            }
            return Ok(None);
        }
        let scope = state
            .scope
            .as_ref()
            .ok_or(DocumentError::RelocationUncertain)?;
        let display = &self.registration.source_display;
        if display.file_name() != Some(scope.name.as_os_str())
            || !scope.matches_parent_path(display.parent().ok_or(DocumentError::InvalidPath)?)?
        {
            return Err(DocumentError::ExternalChange);
        }
        let source = scope.open_regular()?;
        let observed = same_file::Handle::from_file(source.try_clone()?.into_std())?;
        let metadata = scope.directory.symlink_metadata(&scope.name)?;
        #[cfg(windows)]
        {
            use cap_std::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(DocumentError::ExternalChange);
            }
        }
        if &observed != state.identity.as_ref()
            || scope.identity()? != observed
            || !metadata.is_file()
            || metadata.file_type().is_symlink()
        {
            return Err(DocumentError::ExternalChange);
        }
        Ok(Some(TrashFileSource {
            source: Arc::new(source),
            identity: Arc::clone(&state.identity),
            initial_identity: Arc::clone(&self.registration.initial_identity),
            original: self.original.clone(),
            source_scope: scope.clone(),
            display: display.clone(),
            key: self.registration.operation_key,
        }))
    }

    pub(crate) fn validate_target(
        &self,
        target: &TrashRestoreTarget<'_>,
    ) -> Result<(), DocumentError> {
        let state = self.state()?;
        if target.kind != RenameKind::File
            || target.operation_key != self.registration.operation_key
            || target.source_display != self.registration.source_display
            || target.name != self.original.name
            || same_file::Handle::from_file(target.parent.try_clone()?.into_std_file())?
                != self.original_parent
            || target.source_identity != state.identity.as_ref()
        {
            return Err(DocumentError::ExternalChange);
        }
        Ok(())
    }
    pub(crate) fn authority(&self) -> &Arc<FileAuthority> {
        &self.authority
    }
    pub(crate) fn initial_identity(&self) -> &same_file::Handle {
        &self.registration.initial_identity
    }
    pub(crate) fn original_scope(&self) -> ScopedDocument {
        self.original.clone()
    }

    /// Call after the native adapter's verified restore and before document
    /// plans commit. This never reopens a path or restores a consumed Undo slot.
    pub fn finish_restore(self) -> Result<(), DocumentError> {
        let mut state = self
            .authority
            .state
            .lock()
            .map_err(|_| DocumentError::RelocationUncertain)?;
        if state.revoked
            || !state
                .trash
                .as_ref()
                .and_then(std::sync::Weak::upgrade)
                .is_some_and(|registration| Arc::ptr_eq(&registration, &self.registration))
        {
            return Err(DocumentError::RelocationUncertain);
        }
        state.parent = self.original_parent;
        state.name.clone_from(&self.original.name);
        state.scope = Some(self.original);
        state.suspended = false;
        state.trash = None;
        Ok(())
    }
}

impl TrashFileSource {
    pub fn source_parent(&self) -> Arc<Dir> {
        Arc::clone(&self.source_scope.directory)
    }
    pub fn source_name(&self) -> &Path {
        &self.source_scope.name
    }
    pub fn source(&self) -> Arc<File> {
        Arc::clone(&self.source)
    }
    pub fn identity(&self) -> Arc<same_file::Handle> {
        Arc::clone(&self.identity)
    }
    pub fn initial_identity(&self) -> &same_file::Handle {
        &self.initial_identity
    }
    pub fn original_parent(&self) -> Arc<Dir> {
        Arc::clone(&self.original.directory)
    }
    pub fn original_name(&self) -> &Path {
        &self.original.name
    }
    pub fn display(&self) -> &Path {
        &self.display
    }
    pub fn operation_key(&self) -> Uuid {
        self.key
    }
}

fn validate_display(path: &Path) -> Result<(), DocumentError> {
    if !path.is_absolute()
        || path.file_name().is_none()
        || path
            .to_str()
            .is_none_or(|value| value.len() > 4096 || value.contains('\0'))
        || path.components().any(|part| {
            matches!(
                part,
                std::path::Component::CurDir | std::path::Component::ParentDir
            )
        })
    {
        return Err(DocumentError::InvalidPath);
    }
    Ok(())
}
