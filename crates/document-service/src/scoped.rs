use crate::{DocumentError, MAX_FILE_BYTES};
use cap_std::{
    fs::{Dir, OpenOptions},
    time::SystemTime,
};
use std::{
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct FileVersion {
    length: u64,
    modified: Option<SystemTime>,
    pub(crate) identity: same_file::Handle,
    #[cfg(unix)]
    changed: (i64, i64),
    #[cfg(windows)]
    created: u64,
}
impl FileVersion {
    fn from_file(file: &cap_std::fs::File) -> Result<Self, DocumentError> {
        #[cfg(any(unix, windows))]
        use cap_std::fs::MetadataExt;
        let metadata = file.metadata()?;
        Ok(Self {
            length: metadata.len(),
            modified: metadata.modified().ok(),
            identity: same_file::Handle::from_file(file.try_clone()?.into_std())?,
            #[cfg(unix)]
            changed: (metadata.ctime(), metadata.ctime_nsec()),
            #[cfg(windows)]
            created: metadata.creation_time(),
        })
    }
}

pub(crate) struct DiskSnapshot {
    pub bytes: Vec<u8>,
    pub version: FileVersion,
}
pub(crate) struct FileBaseline {
    pub bytes: Vec<u8>,
    pub identity: Arc<same_file::Handle>,
}
impl DiskSnapshot {
    pub(crate) fn into_baseline(self) -> FileBaseline {
        FileBaseline {
            bytes: self.bytes,
            identity: Arc::new(self.version.identity),
        }
    }
}

/// A directory handle and one file name, never an ambient path. The handle
/// remains anchored when an ancestor is renamed or replaced by a symlink.
#[derive(Clone)]
pub(crate) struct ScopedDocument {
    pub(crate) directory: Arc<Dir>,
    pub(crate) name: PathBuf,
}
impl ScopedDocument {
    pub(crate) fn new(directory: Arc<Dir>, name: &Path) -> Result<Self, DocumentError> {
        let mut parts = name.components();
        if !matches!(parts.next(), Some(Component::Normal(_))) || parts.next().is_some() {
            return Err(DocumentError::InvalidPath);
        }
        Ok(Self {
            directory,
            name: name.to_owned(),
        })
    }
    pub(crate) fn matches_parent_path(&self, parent: &Path) -> std::io::Result<bool> {
        let granted = same_file::Handle::from_file(self.directory.try_clone()?.into_std_file())?;
        let observed = Dir::open_ambient_dir(parent, cap_std::ambient_authority())?;
        let observed = same_file::Handle::from_file(observed.into_std_file())?;
        Ok(granted == observed)
    }
    pub(crate) fn open_regular(&self) -> Result<cap_std::fs::File, DocumentError> {
        let metadata = self.directory.symlink_metadata(&self.name)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(DocumentError::InvalidPath);
        }
        let file = self.directory.open(&self.name)?;
        if !file.metadata()?.is_file() {
            return Err(DocumentError::InvalidPath);
        }
        Ok(file)
    }
    /// Reads actual bytes twice through the capability and verifies opened-file
    /// identity/metadata. This detects instability; it is not an OS snapshot lock.
    pub(crate) fn read_snapshot(&self) -> Result<DiskSnapshot, DocumentError> {
        self.read_snapshot_with_hook(|| {})
    }
    pub(crate) fn read_snapshot_for_entity(
        &self,
        expected: &same_file::Handle,
    ) -> Result<DiskSnapshot, DocumentError> {
        self.read_snapshot_with_identity(Some(expected), || {})
    }
    fn read_snapshot_with_hook(
        &self,
        between_reads: impl FnOnce(),
    ) -> Result<DiskSnapshot, DocumentError> {
        self.read_snapshot_with_identity(None, between_reads)
    }
    fn read_snapshot_with_identity(
        &self,
        expected: Option<&same_file::Handle>,
        between_reads: impl FnOnce(),
    ) -> Result<DiskSnapshot, DocumentError> {
        let mut file = self.open_regular()?;
        let version = FileVersion::from_file(&file)?;
        if expected.is_some_and(|expected| &version.identity != expected) {
            return Err(DocumentError::ExternalChange);
        }
        let bytes = read_bounded(&mut file)?;
        if FileVersion::from_file(&file)? != version {
            return Err(DocumentError::UnstableRead);
        }
        between_reads();
        let mut second = self.open_regular()?;
        if FileVersion::from_file(&second)? != version {
            return Err(DocumentError::UnstableRead);
        }
        let confirmed = read_bounded(&mut second)?;
        if bytes != confirmed || FileVersion::from_file(&second)? != version {
            return Err(DocumentError::UnstableRead);
        }
        // Re-open the current name after the reads, detecting a rename replacement.
        let current = self.open_regular()?;
        if FileVersion::from_file(&current)? != version {
            return Err(DocumentError::UnstableRead);
        }
        Ok(DiskSnapshot { bytes, version })
    }
    pub(crate) fn read(&self) -> Result<Vec<u8>, DocumentError> {
        Ok(self.read_snapshot()?.bytes)
    }
    pub(crate) fn identity(&self) -> Result<same_file::Handle, DocumentError> {
        Ok(FileVersion::from_file(&self.open_regular()?)?.identity)
    }
    pub(crate) fn check_identity(
        &self,
        expected: &[u8],
        identity: &same_file::Handle,
    ) -> Result<(), DocumentError> {
        let current = self
            .read_snapshot()
            .map_err(|_| DocumentError::ExternalChange)?;
        if current.bytes != expected || &current.version.identity != identity {
            return Err(DocumentError::ExternalChange);
        }
        Ok(())
    }
    pub(crate) fn check(&self, expected: &[u8]) -> Result<(), DocumentError> {
        if self.read().as_deref().ok() != Some(expected) {
            return Err(DocumentError::ExternalChange);
        }
        Ok(())
    }
    fn check_expected(&self, expected: Option<&[u8]>) -> Result<(), DocumentError> {
        if let Some(expected) = expected {
            return self.check(expected);
        }
        match self.directory.symlink_metadata(&self.name) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            _ => Err(DocumentError::ExternalChange),
        }
    }
    pub(crate) fn replace(
        &self,
        expected: &[u8],
        identity: &same_file::Handle,
        bytes: &[u8],
    ) -> Result<same_file::Handle, DocumentError> {
        self.write_with_identity(Some(expected), Some(identity), bytes, || {})
    }
    pub(crate) fn write_authorized(
        &self,
        expected: Option<&[u8]>,
        bytes: &[u8],
    ) -> Result<same_file::Handle, DocumentError> {
        self.write_with_precommit(expected, bytes, || {})
    }
    fn write_with_precommit(
        &self,
        expected: Option<&[u8]>,
        bytes: &[u8],
        precommit: impl FnOnce(),
    ) -> Result<same_file::Handle, DocumentError> {
        self.write_with_identity(expected, None, bytes, precommit)
    }
    fn write_with_identity(
        &self,
        expected: Option<&[u8]>,
        identity: Option<&same_file::Handle>,
        bytes: &[u8],
        precommit: impl FnOnce(),
    ) -> Result<same_file::Handle, DocumentError> {
        let check = || match (expected, identity) {
            (Some(bytes), Some(identity)) => self.check_identity(bytes, identity),
            _ => self.check_expected(expected),
        };
        check()?;
        let permissions = expected
            .map(|_| {
                self.directory
                    .metadata(&self.name)
                    .map(|metadata| metadata.permissions())
            })
            .transpose()?;
        if permissions
            .as_ref()
            .is_some_and(cap_std::fs::Permissions::readonly)
        {
            return Err(DocumentError::ReadOnly);
        }
        let temporary = format!(".marklyra-{}", Uuid::new_v4());
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = self.directory.open_with(&temporary, &options)?;
        let result = (|| {
            file.write_all(bytes)?;
            if let Some(permissions) = permissions {
                file.set_permissions(permissions)?;
            }
            file.sync_all()?;
            // Keep the inode we actually staged/published. Reopening the target
            // afterward could accidentally adopt an external same-byte replacement.
            let published_identity = FileVersion::from_file(&file)?.identity;
            drop(file);
            precommit();
            check()?;
            if expected.is_some() {
                // Optimistic conflict detection, not a filesystem compare-and-swap.
                self.directory
                    .rename(&temporary, &self.directory, &self.name)?;
            } else {
                self.directory
                    .hard_link(&temporary, &self.directory, &self.name)
                    .map_err(|error| {
                        if error.kind() == std::io::ErrorKind::AlreadyExists {
                            DocumentError::ExternalChange
                        } else {
                            DocumentError::Io(error)
                        }
                    })?;
            }
            Ok(published_identity)
        })();
        let _ = self.directory.remove_file(&temporary);
        #[cfg(unix)]
        if result.is_ok() {
            let _ = self
                .directory
                .try_clone()
                .map(Dir::into_std_file)
                .and_then(|dir| dir.sync_all());
        }
        result
    }
}
fn read_bounded(file: &mut cap_std::fs::File) -> Result<Vec<u8>, DocumentError> {
    let length = file.metadata()?.len();
    if length > MAX_FILE_BYTES as u64 {
        return Err(DocumentError::TooLarge);
    }
    let mut bytes = Vec::with_capacity(length as usize);
    file.take(MAX_FILE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err(DocumentError::TooLarge);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    fn scoped(path: &Path) -> ScopedDocument {
        ScopedDocument::new(
            Arc::new(
                Dir::open_ambient_dir(path.parent().unwrap(), cap_std::ambient_authority())
                    .unwrap(),
            ),
            Path::new(path.file_name().unwrap()),
        )
        .unwrap()
    }
    #[test]
    fn modification_during_staging_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, b"original").unwrap();
        let result = scoped(&path).write_with_precommit(Some(b"original"), b"ours", || {
            fs::write(&path, b"external").unwrap();
        });
        assert!(matches!(result, Err(DocumentError::ExternalChange)));
        assert_eq!(fs::read(&path).unwrap(), b"external");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn newly_created_destination_is_not_clobbered() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        let result = scoped(&path).write_with_precommit(None, b"ours", || {
            fs::write(&path, b"external").unwrap();
        });
        assert!(matches!(result, Err(DocumentError::ExternalChange)));
        assert_eq!(fs::read(&path).unwrap(), b"external");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn same_byte_identity_replacement_during_staging_is_not_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        fs::write(&path, b"original").unwrap();
        let scope = scoped(&path);
        let identity = scope.identity().unwrap();
        let result = scope.write_with_identity(Some(b"original"), Some(&identity), b"ours", || {
            fs::rename(&path, dir.path().join("old.md")).unwrap();
            fs::write(&path, b"original").unwrap();
        });
        assert!(matches!(result, Err(DocumentError::ExternalChange)));
        assert_eq!(fs::read(&path).unwrap(), b"original");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 2);
    }
    #[test]
    fn changing_content_or_replacing_inode_during_read_is_rejected() {
        for replacement in [false, true] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("note.md");
            fs::write(&path, b"first").unwrap();
            let result = scoped(&path).read_snapshot_with_hook(|| {
                if replacement {
                    let other = dir.path().join("next.md");
                    fs::write(&other, b"first").unwrap();
                    fs::rename(other, &path).unwrap();
                } else {
                    fs::write(&path, b"second").unwrap();
                }
            });
            assert!(matches!(result, Err(DocumentError::UnstableRead)));
        }
    }
}
