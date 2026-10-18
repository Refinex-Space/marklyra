//! Opaque native capability for a single file-operation undo slot. The lease
//! pins publication provenance without storing source text or granting paths.
use crate::{
    authorities::FileAuthority, scoped::ScopedDocument, DocumentAuthorities, DocumentError,
};
use cap_std::fs::{Dir, File};
use std::{
    path::{Component, Path},
    sync::Arc,
};

pub struct FileLocationLease {
    pub(crate) scope: ScopedDocument,
    pub(crate) authority: Arc<FileAuthority>,
}

impl DocumentAuthorities {
    /// `directory` and `actual_identity` come from native entry inspection, not
    /// renderer input. The host serializes capture/use with its mutation lane.
    pub fn lease_file(
        &self,
        directory: Arc<Dir>,
        name: &Path,
        actual_identity: &same_file::Handle,
    ) -> Result<FileLocationLease, DocumentError> {
        check_name(name)?;
        let scope = ScopedDocument::new(directory, name)?;
        let identity = Arc::new(scope.identity()?);
        if identity.as_ref() != actual_identity {
            return Err(DocumentError::ExternalChange);
        }
        let authority = self.join(&scope, identity)?;
        let lease = FileLocationLease { scope, authority };
        // Joining never blesses a stale read taken before another publication.
        lease.current_identity()?;
        Ok(lease)
    }
}

impl FileLocationLease {
    /// Continue a global native Undo pin after an ordinary proven Move. The
    /// host holds its mutation lane and all document guards; either the pin or
    /// an alias document plan may apply the shared cohort handoff first.
    pub fn retarget_move(
        &mut self,
        publication: &crate::NativeMovePublication,
    ) -> Result<(), DocumentError> {
        if publication.kind != crate::RenameKind::File
            || self.scope.name != publication.source_name
            || crate::move_publication::directory_identity(&self.scope.directory)?
                != crate::move_publication::directory_identity(&publication.source_parent)?
        {
            return Err(DocumentError::ExternalChange);
        }
        let identity = publication.entry_identity(
            Path::new(""),
            publication.source_identity(),
            crate::RenameKind::File,
        )?;
        let scope = ScopedDocument::new(
            Arc::clone(&publication.destination_parent),
            &publication.destination_name,
        )?;
        let old_parent = crate::move_publication::directory_identity(&self.scope.directory)?;
        let new_parent = crate::move_publication::directory_identity(&scope.directory)?;
        {
            let current = self
                .authority
                .state
                .lock()
                .map_err(|_| DocumentError::RelocationUncertain)?;
            let source = current.parent == old_parent
                && current.name == self.scope.name
                && current.identity.as_ref() == publication.source_identity();
            let destination = current.parent == new_parent
                && current.name == scope.name
                && current.identity == identity;
            if current.revoked || current.suspended || (!source && !destination) {
                return Err(DocumentError::RelocationUncertain);
            }
        }
        self.authority.move_to(
            &self.scope,
            &old_parent,
            publication.source_identity(),
            &scope,
            new_parent,
            identity,
        );
        self.scope = scope;
        Ok(())
    }
    /// Returns only a proven own-publication identity after checking the current
    /// directory/name. Equal source bytes are intentionally never sufficient.
    pub fn current_identity(&self) -> Result<Arc<same_file::Handle>, DocumentError> {
        self.open_with_hook(|| {}).map(|(_, identity)| identity)
    }

    /// Read-only native file handle. Windows callers needing DELETE access must
    /// open with their OS flags and compare against `current_identity` themselves.
    /// Keeping this handle does not make later path operations an OS CAS.
    pub fn open_current(&self) -> Result<File, DocumentError> {
        self.open_with_hook(|| {}).map(|(file, _)| file)
    }

    /// Call only after the native host confirms a successful same-parent move.
    /// No filesystem IO occurs; a mismatch/poison returns uncertainty and must
    /// be latched by the host, never treated as an uncommitted filesystem move.
    pub fn retarget(&mut self, old_name: &Path, new_name: &Path) -> Result<(), DocumentError> {
        check_name(old_name)?;
        check_name(new_name)?;
        if self.scope.name != old_name {
            return Err(DocumentError::RelocationUncertain);
        }
        let new_scope = ScopedDocument::new(Arc::clone(&self.scope.directory), new_name)?;
        self.authority
            .try_retarget(old_name, new_scope.name.clone())?;
        self.scope = new_scope;
        Ok(())
    }

    fn open_with_hook(
        &self,
        after_open: impl FnOnce(),
    ) -> Result<(File, Arc<same_file::Handle>), DocumentError> {
        let current = self.authority.current(&self.scope)?;
        let file = self.scope.open_regular()?;
        let opened = same_file::Handle::from_file(file.try_clone()?.into_std())?;
        if &opened != current.identity.as_ref() {
            return Err(DocumentError::ExternalChange);
        }
        after_open();
        let metadata = self.scope.directory.symlink_metadata(&self.scope.name)?;
        #[cfg(windows)]
        {
            use cap_std::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(DocumentError::ExternalChange);
            }
        }
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || self.scope.identity()? != opened
        {
            return Err(DocumentError::ExternalChange);
        }
        Ok((file, Arc::clone(&current.identity)))
    }
}

fn check_name(name: &Path) -> Result<(), DocumentError> {
    let mut parts = name.components();
    if !matches!(parts.next(), Some(Component::Normal(_)))
        || parts.next().is_some()
        || name
            .to_str()
            .is_none_or(|name| name.len() > 1024 || name.contains('\0'))
    {
        return Err(DocumentError::InvalidPath);
    }
    Ok(())
}

#[cfg(test)]
mod tests;
