//! Owned native transaction evidence. No constructor accepts renderer paths or
//! blesses an arbitrary same-byte replacement as an own publication.
use crate::{authority::open_directory_nofollow, DocumentError, RenameKind};
use cap_std::fs::{Dir, File};
use std::{
    collections::HashMap,
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

pub struct NativeMovePublicationEntry {
    suffix: PathBuf,
    kind: RenameKind,
    source: Arc<File>,
    destination: Arc<File>,
    source_identity: Arc<same_file::Handle>,
    destination_identity: Arc<same_file::Handle>,
}

impl NativeMovePublicationEntry {
    /// Only the native adapter's successful no-replace transaction may supply
    /// these handles. For copies they must be the source and newly created
    /// destination handles retained throughout byte/metadata verification.
    pub fn from_owned_handles(
        suffix: &Path,
        kind: RenameKind,
        source: Arc<File>,
        destination: Arc<File>,
    ) -> Result<Self, DocumentError> {
        check_relative(suffix)?;
        for file in [&source, &destination] {
            let metadata = file.metadata()?;
            if (kind == RenameKind::Directory && !metadata.is_dir())
                || (kind == RenameKind::File && !metadata.is_file())
            {
                return Err(DocumentError::InvalidPath);
            }
        }
        let source_identity = Arc::new(identity(&source)?);
        let destination_identity = Arc::new(identity(&destination)?);
        Ok(Self {
            suffix: suffix.to_owned(),
            kind,
            source,
            destination,
            source_identity,
            destination_identity,
        })
    }
}

/// A nonserializable receipt of one native transfer. Its owned destination
/// handles, operation identity and exact source/target capability names bind a
/// cross-volume identity change to a real publication, not to matching bytes.
pub struct NativeMovePublication {
    operation_id: Uuid,
    pub(crate) source_parent: Arc<Dir>,
    pub(crate) source_name: PathBuf,
    pub(crate) destination_parent: Arc<Dir>,
    pub(crate) destination_name: PathBuf,
    pub(crate) kind: RenameKind,
    entries: HashMap<PathBuf, NativeMovePublicationEntry>,
}

impl NativeMovePublication {
    /// Call only after the adapter confirms successful publication and removal
    /// of the original source name (a retained native backup is permitted).
    /// Every copied descendant needs its own owned-handle entry; same-inode
    /// directory renames may supply just the retained root entry.
    pub fn verify(
        operation_id: Uuid,
        source_parent: Arc<Dir>,
        source_name: &Path,
        destination_parent: Arc<Dir>,
        destination_name: &Path,
        kind: RenameKind,
        entries: Vec<NativeMovePublicationEntry>,
    ) -> Result<Self, DocumentError> {
        Self::verify_with_source_replacement(
            operation_id,
            source_parent,
            source_name,
            destination_parent,
            destination_name,
            kind,
            None,
            entries,
        )
    }

    /// Replace Undo may restore a separately retained old target to the source
    /// name after moving our entry away. Only that exact owned replacement
    /// handle is accepted; the ordinary constructor still requires absence.
    #[allow(clippy::too_many_arguments)]
    pub fn verify_with_source_replacement(
        operation_id: Uuid,
        source_parent: Arc<Dir>,
        source_name: &Path,
        destination_parent: Arc<Dir>,
        destination_name: &Path,
        kind: RenameKind,
        source_replacement: Option<Arc<File>>,
        entries: Vec<NativeMovePublicationEntry>,
    ) -> Result<Self, DocumentError> {
        check_name(source_name)?;
        check_name(destination_name)?;
        if operation_id.is_nil() || entries.is_empty() || entries.len() > 10_001 {
            return Err(DocumentError::InvalidPath);
        }
        if let Some(replacement) = source_replacement {
            let metadata = replacement.metadata()?;
            let replacement_kind = if metadata.is_dir() {
                RenameKind::Directory
            } else if metadata.is_file() {
                RenameKind::File
            } else {
                return Err(DocumentError::InvalidPath);
            };
            let replacement_identity = identity(&replacement)?;
            if identity(&open_entry(&source_parent, source_name, replacement_kind)?)?
                != replacement_identity
                || entries.iter().any(|entry| {
                    entry.suffix.as_os_str().is_empty()
                        && *entry.source_identity == replacement_identity
                })
            {
                return Err(DocumentError::ExternalChange);
            }
        } else if !matches!(source_parent.symlink_metadata(source_name), Err(error) if error.kind() == std::io::ErrorKind::NotFound)
        {
            return Err(DocumentError::ExternalChange);
        }
        let mut checked = HashMap::with_capacity(entries.len());
        for entry in entries {
            let path = if entry.suffix.as_os_str().is_empty() {
                destination_name.to_owned()
            } else {
                if kind != RenameKind::Directory {
                    return Err(DocumentError::InvalidPath);
                }
                destination_name.join(&entry.suffix)
            };
            let observed = open_entry(&destination_parent, &path, entry.kind)?;
            if identity(&observed)? != *entry.destination_identity
                || identity(&entry.source)? != *entry.source_identity
                || identity(&entry.destination)? != *entry.destination_identity
                || checked.insert(entry.suffix.clone(), entry).is_some()
            {
                return Err(DocumentError::ExternalChange);
            }
        }
        if checked
            .get(Path::new(""))
            .is_none_or(|root| root.kind != kind)
        {
            return Err(DocumentError::InvalidPath);
        }
        Ok(Self {
            operation_id,
            source_parent,
            source_name: source_name.to_owned(),
            destination_parent,
            destination_name: destination_name.to_owned(),
            kind,
            entries: checked,
        })
    }

    pub fn operation_id(&self) -> Uuid {
        self.operation_id
    }
    /// Retarget only a native image-binding entity proof actually carried by
    /// this owned publication. Copied files require their own leaf entry; only
    /// a retained same-inode directory may use descendant identity continuity.
    pub fn image_document_identity(
        &self,
        suffix: &Path,
        source: &crate::ImageDocumentIdentity,
    ) -> Result<crate::ImageDocumentIdentity, DocumentError> {
        check_relative(suffix)?;
        if let Some(entry) = self.entries.get(suffix) {
            if entry.kind != RenameKind::File
                || crate::ImageDocumentIdentity::of_owned_file(&entry.source)? != *source
            {
                return Err(DocumentError::ExternalChange);
            }
            self.entry_identity(suffix, &entry.source_identity, RenameKind::File)?;
            return crate::ImageDocumentIdentity::of_owned_file(&entry.destination);
        }
        let root = &self.entries[Path::new("")];
        if self.kind != RenameKind::Directory || root.source_identity != root.destination_identity {
            return Err(DocumentError::ExternalChange);
        }
        let file = open_entry(
            &self.destination_parent,
            &self.destination_name.join(suffix),
            RenameKind::File,
        )?;
        let result = crate::ImageDocumentIdentity::of_owned_file(&file)?;
        if result != *source {
            return Err(DocumentError::ExternalChange);
        }
        Ok(result)
    }

    pub(crate) fn source_identity(&self) -> &same_file::Handle {
        &self.entries[Path::new("")].source_identity
    }

    pub(crate) fn destination_directory(&self) -> Result<Arc<Dir>, DocumentError> {
        if self.kind != RenameKind::Directory {
            return Err(DocumentError::InvalidPath);
        }
        let root = &self.entries[Path::new("")];
        Ok(Arc::new(Dir::from_std_file(
            root.destination.try_clone()?.into_std(),
        )))
    }

    pub(crate) fn entry_identity(
        &self,
        suffix: &Path,
        expected_source: &same_file::Handle,
        kind: RenameKind,
    ) -> Result<Arc<same_file::Handle>, DocumentError> {
        check_relative(suffix)?;
        let root = &self.entries[Path::new("")];
        if let Some(entry) = self.entries.get(suffix) {
            if entry.kind != kind || entry.source_identity.as_ref() != expected_source {
                return Err(DocumentError::ExternalChange);
            }
            let path = self.destination_name.join(suffix);
            if identity(&open_entry(&self.destination_parent, &path, kind)?)?
                != *entry.destination_identity
            {
                return Err(DocumentError::ExternalChange);
            }
            return Ok(Arc::clone(&entry.destination_identity));
        }
        // Only a true retained-directory rename can use identity continuity
        // without a per-descendant copy receipt.
        if self.kind != RenameKind::Directory
            || root.source_identity != root.destination_identity
            || kind == RenameKind::Directory && suffix.as_os_str().is_empty()
        {
            return Err(DocumentError::ExternalChange);
        }
        let source = Dir::from_std_file(root.source.try_clone()?.into_std());
        let destination = Dir::from_std_file(root.destination.try_clone()?.into_std());
        if identity(&open_entry(&source, suffix, kind)?)? != *expected_source
            || identity(&open_entry(&destination, suffix, kind)?)? != *expected_source
        {
            return Err(DocumentError::ExternalChange);
        }
        Ok(Arc::new(identity(&open_entry(
            &destination,
            suffix,
            kind,
        )?)?))
    }
}

pub(crate) fn directory_identity(directory: &Dir) -> Result<same_file::Handle, DocumentError> {
    Ok(same_file::Handle::from_file(
        directory.try_clone()?.into_std_file(),
    )?)
}
fn identity(file: &File) -> Result<same_file::Handle, DocumentError> {
    Ok(same_file::Handle::from_file(file.try_clone()?.into_std())?)
}
fn open_entry(parent: &Dir, relative: &Path, kind: RenameKind) -> Result<File, DocumentError> {
    if kind == RenameKind::Directory {
        return Ok(File::from_std(
            open_directory_nofollow(parent, relative)?.into_std_file(),
        ));
    }
    let name = relative.file_name().ok_or(DocumentError::InvalidPath)?;
    let directory =
        open_directory_nofollow(parent, relative.parent().ok_or(DocumentError::InvalidPath)?)?;
    crate::scoped::ScopedDocument::new(Arc::new(directory), Path::new(name))?.open_regular()
}
fn check_name(name: &Path) -> Result<(), DocumentError> {
    check_relative(name)?;
    if name.components().count() != 1 {
        return Err(DocumentError::InvalidPath);
    }
    Ok(())
}
fn check_relative(path: &Path) -> Result<(), DocumentError> {
    if path
        .to_str()
        .is_none_or(|path| path.len() > 4096 || path.contains('\0'))
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(DocumentError::InvalidPath);
    }
    Ok(())
}
