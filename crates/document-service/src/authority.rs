//! Persistable host-only directory identity. A stored path alone is never a grant.
use cap_std::fs::Dir;
use serde::{Deserialize, Serialize};
#[cfg(unix)]
use std::time::UNIX_EPOCH;
use std::{
    io,
    path::{Component, Path, PathBuf},
    sync::Arc,
};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "platform", deny_unknown_fields)]
pub(crate) enum Identity {
    #[cfg(unix)]
    Unix {
        device: u64,
        inode: u64,
        birth: Option<(u64, u32)>,
    },
    #[cfg(windows)]
    Windows {
        volume: u32,
        index: u64,
        created: u64,
    },
}
impl Identity {
    fn of(directory: &Dir) -> io::Result<Self> {
        let file = directory.try_clone()?.into_std_file();
        let metadata = file.metadata()?;
        if !metadata.is_dir() {
            return Err(invalid());
        }
        Self::of_file(&file)
    }
    pub(crate) fn of_file(file: &std::fs::File) -> io::Result<Self> {
        #[cfg(unix)]
        let metadata = file.metadata()?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            Ok(Self::Unix {
                device: metadata.dev(),
                inode: metadata.ino(),
                birth: metadata
                    .created()
                    .ok()
                    .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
                    .map(|value| (value.as_secs(), value.subsec_nanos())),
            })
        }
        #[cfg(windows)]
        {
            windows::identity(file)
        }
        #[cfg(not(any(unix, windows)))]
        {
            Err(invalid())
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DirectoryBookmark {
    path: PathBuf,
    identity: Identity,
}
/// A host-only, prevalidated name for the same retained directory identity.
/// The target path need not exist yet; only a verified OS move permits commit.
pub struct PreparedBookmarkRetarget {
    bookmark: DirectoryBookmark,
    _retained: Arc<Dir>,
}
impl PreparedBookmarkRetarget {
    pub fn commit(self) -> DirectoryBookmark {
        self.bookmark
    }
}
impl DirectoryBookmark {
    pub fn prepare_retarget(
        &self,
        source: &Dir,
        old_prefix: &Path,
        new_prefix: &Path,
    ) -> io::Result<Option<PreparedBookmarkRetarget>> {
        self.validate()?;
        let Ok(suffix) = self.path.strip_prefix(old_prefix) else {
            return Ok(None);
        };
        if old_prefix.parent() != new_prefix.parent()
            || old_prefix.file_name().is_none()
            || new_prefix.file_name().is_none()
        {
            return Err(invalid());
        }
        DirectoryBookmark::capture(source, old_prefix)?;
        let retained = self.reopen()?;
        let observed = open_directory_nofollow(source, suffix)?;
        if !same_directory(&retained, &observed)? {
            return Err(invalid());
        }
        let bookmark = DirectoryBookmark {
            path: new_prefix.join(suffix),
            identity: self.identity.clone(),
        };
        bookmark.validate()?;
        Ok(Some(PreparedBookmarkRetarget {
            bookmark,
            _retained: retained,
        }))
    }
    /// Called only with an already-authorized open directory, never renderer data.
    pub fn capture(directory: &Dir, display_path: &Path) -> io::Result<Self> {
        let value = Self {
            path: display_path.to_owned(),
            identity: Identity::of(directory)?,
        };
        value.validate()?;
        // Also prove that the display path still identifies this exact capability.
        value.reopen()?;
        Ok(value)
    }
    pub fn from_native_selection(path: &Path) -> io::Result<Self> {
        let path = std::fs::canonicalize(path)?;
        let directory = Dir::open_ambient_dir(&path, cap_std::ambient_authority())?;
        Self::capture(&directory, &path)
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    pub fn validate(&self) -> io::Result<()> {
        if !self.path.is_absolute()
            || self
                .path
                .to_str()
                .is_none_or(|value| value.len() > 4096 || value.contains('\0'))
            || self
                .path
                .components()
                .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
        {
            return Err(invalid());
        }
        Ok(())
    }
    /// Resolve only this trusted persisted record and reject replaced/aliased roots.
    pub fn reopen(&self) -> io::Result<Arc<Dir>> {
        self.validate()?;
        if std::fs::canonicalize(&self.path)? != self.path
            || std::fs::symlink_metadata(&self.path)?
                .file_type()
                .is_symlink()
        {
            return Err(invalid());
        }
        let directory = Arc::new(Dir::open_ambient_dir(
            &self.path,
            cap_std::ambient_authority(),
        )?);
        if Identity::of(&directory)? != self.identity
            || std::fs::canonicalize(&self.path)? != self.path
        {
            return Err(invalid());
        }
        Ok(directory)
    }
}
pub(crate) fn same_directory(first: &Dir, second: &Dir) -> io::Result<bool> {
    Ok(Identity::of(first)? == Identity::of(second)?)
}
pub(crate) fn open_directory_nofollow(root: &Dir, relative: &Path) -> io::Result<Dir> {
    let mut directory = root.try_clone()?;
    for part in relative.components() {
        let Component::Normal(name) = part else {
            return Err(invalid());
        };
        let name = Path::new(name);
        let metadata = directory.symlink_metadata(name)?;
        #[cfg(windows)]
        {
            use cap_std::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(invalid());
            }
        }
        if metadata.file_type().is_symlink() {
            return Err(invalid());
        }
        directory = Dir::from_std_file(cap_primitives::fs::open_dir_nofollow(
            &directory.try_clone()?.into_std_file(),
            name,
        )?);
    }
    Ok(directory)
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentBookmark {
    pub(crate) parent: DirectoryBookmark,
    pub(crate) name: PathBuf,
}
pub struct PreparedDocumentBookmarkRetarget {
    bookmark: DocumentBookmark,
    _retained: Arc<Dir>,
}

/// Metadata candidate prepared before ordinary Move. Finalization requires the
/// native transaction's owned-handle proof, including copied identity mapping.
pub struct PreparedDirectoryBookmarkMove {
    source_identity: same_file::Handle,
    retained: Arc<Dir>,
    suffix: PathBuf,
    destination_parent: Arc<Dir>,
    destination_name: PathBuf,
    destination_display: PathBuf,
}

pub struct PreparedDocumentBookmarkMove {
    inner: DocumentBookmarkMove,
}

enum DocumentBookmarkMove {
    Directory {
        parent: PreparedDirectoryBookmarkMove,
        name: PathBuf,
    },
    File {
        source_parent: Arc<Dir>,
        source_name: PathBuf,
        destination_parent: Arc<Dir>,
        destination_name: PathBuf,
        destination_display: PathBuf,
    },
}

impl PreparedDirectoryBookmarkMove {
    pub fn finalize(
        self,
        publication: &crate::NativeMovePublication,
    ) -> io::Result<PreparedBookmarkRetarget> {
        if publication.kind != crate::RenameKind::Directory
            || publication.source_identity() != &self.source_identity
            || publication.destination_name != self.destination_name
            || !same_directory(&publication.destination_parent, &self.destination_parent)?
        {
            return Err(invalid());
        }
        let old =
            crate::move_publication::directory_identity(&self.retained).map_err(native_error)?;
        let expected = publication
            .entry_identity(&self.suffix, &old, crate::RenameKind::Directory)
            .map_err(native_error)?;
        let root = publication.destination_directory().map_err(native_error)?;
        let directory = Arc::new(open_directory_nofollow(&root, &self.suffix)?);
        if crate::move_publication::directory_identity(&directory).map_err(native_error)?
            != *expected
        {
            return Err(invalid());
        }
        let path = self.destination_display.join(&self.suffix);
        Ok(PreparedBookmarkRetarget {
            bookmark: DirectoryBookmark::capture(&directory, &path)?,
            _retained: directory,
        })
    }
}

impl PreparedDocumentBookmarkMove {
    pub fn finalize(
        self,
        publication: &crate::NativeMovePublication,
    ) -> io::Result<PreparedDocumentBookmarkRetarget> {
        let (parent, name, retained) = match self.inner {
            DocumentBookmarkMove::Directory { parent, name } => {
                let parent = parent.finalize(publication)?;
                (parent.bookmark, name, parent._retained)
            }
            DocumentBookmarkMove::File {
                source_parent,
                source_name,
                destination_parent,
                destination_name,
                destination_display,
            } => {
                if publication.kind != crate::RenameKind::File
                    || publication.source_name != source_name
                    || publication.destination_name != destination_name
                    || !same_directory(&publication.source_parent, &source_parent)?
                    || !same_directory(&publication.destination_parent, &destination_parent)?
                {
                    return Err(invalid());
                }
                let parent = DirectoryBookmark::capture(
                    &destination_parent,
                    destination_display.parent().ok_or_else(invalid)?,
                )?;
                (parent, destination_name, destination_parent)
            }
        };
        let bookmark = DocumentBookmark { parent, name };
        bookmark.validate()?;
        Ok(PreparedDocumentBookmarkRetarget {
            bookmark,
            _retained: retained,
        })
    }
}

impl DirectoryBookmark {
    pub fn prepare_directory_move(
        &self,
        source: &Dir,
        destination_parent: Arc<Dir>,
        old_prefix: &Path,
        new_prefix: &Path,
    ) -> io::Result<Option<PreparedDirectoryBookmarkMove>> {
        self.validate()?;
        let Ok(suffix) = self.path.strip_prefix(old_prefix) else {
            return Ok(None);
        };
        DirectoryBookmark::capture(source, old_prefix)?;
        let retained = self.reopen()?;
        let observed = open_directory_nofollow(source, suffix)?;
        if !same_directory(&retained, &observed)? {
            return Err(invalid());
        }
        DirectoryBookmark::capture(
            &destination_parent,
            new_prefix.parent().ok_or_else(invalid)?,
        )?;
        let destination_name = new_prefix.file_name().ok_or_else(invalid)?;
        Ok(Some(PreparedDirectoryBookmarkMove {
            source_identity: crate::move_publication::directory_identity(source)
                .map_err(native_error)?,
            retained,
            suffix: suffix.to_owned(),
            destination_parent,
            destination_name: destination_name.into(),
            destination_display: new_prefix.to_owned(),
        }))
    }
}

impl DocumentBookmark {
    pub fn prepare_directory_move(
        &self,
        source: &Dir,
        destination_parent: Arc<Dir>,
        old_prefix: &Path,
        new_prefix: &Path,
    ) -> io::Result<Option<PreparedDocumentBookmarkMove>> {
        self.validate()?;
        Ok(self
            .parent
            .prepare_directory_move(source, destination_parent, old_prefix, new_prefix)?
            .map(|parent| PreparedDocumentBookmarkMove {
                inner: DocumentBookmarkMove::Directory {
                    parent,
                    name: self.name.clone(),
                },
            }))
    }

    #[allow(clippy::too_many_arguments)]
    pub fn prepare_file_move(
        &self,
        source_parent: &Dir,
        destination_parent: Arc<Dir>,
        old_name: &Path,
        new_name: &Path,
        old_display: &Path,
        new_display: &Path,
    ) -> io::Result<Option<PreparedDocumentBookmarkMove>> {
        self.validate()?;
        if self.name != old_name || self.path() != old_display {
            return Ok(None);
        }
        if old_display.file_name() != Some(old_name.as_os_str())
            || new_display.file_name() != Some(new_name.as_os_str())
        {
            return Err(invalid());
        }
        let source_parent = Arc::new(source_parent.try_clone()?);
        let retained = self.parent.reopen()?;
        if !same_directory(&source_parent, &retained)? || !self.probe()? {
            return Err(invalid());
        }
        let target = DirectoryBookmark::capture(
            &destination_parent,
            new_display.parent().ok_or_else(invalid)?,
        )?;
        DocumentBookmark {
            parent: target,
            name: new_name.to_owned(),
        }
        .validate()?;
        Ok(Some(PreparedDocumentBookmarkMove {
            inner: DocumentBookmarkMove::File {
                source_parent,
                source_name: old_name.to_owned(),
                destination_parent,
                destination_name: new_name.to_owned(),
                destination_display: new_display.to_owned(),
            },
        }))
    }
}

fn native_error(error: crate::DocumentError) -> io::Error {
    io::Error::other(error)
}
impl PreparedDocumentBookmarkRetarget {
    pub fn commit(self) -> DocumentBookmark {
        self.bookmark
    }
}
impl DocumentBookmark {
    /// Metadata-only continuation of a directory move already authorized by the
    /// native host. The retained parent identity, never the new path, is the grant.
    pub fn prepare_retarget(
        &self,
        source: &Dir,
        old_prefix: &Path,
        new_prefix: &Path,
    ) -> io::Result<Option<PreparedDocumentBookmarkRetarget>> {
        self.validate()?;
        let Some(parent) = self
            .parent
            .prepare_retarget(source, old_prefix, new_prefix)?
        else {
            return Ok(None);
        };
        let bookmark = Self {
            parent: parent.bookmark,
            name: self.name.clone(),
        };
        bookmark.validate()?;
        Ok(Some(PreparedDocumentBookmarkRetarget {
            bookmark,
            _retained: parent._retained,
        }))
    }
    /// Does not prove a historical file inode: this bookmark only persisted its
    /// parent identity and basename. The native caller must hold a validated file
    /// move receipt through publication, then CAS this metadata before commit.
    pub fn prepare_file_retarget(
        &self,
        parent: &Dir,
        old_name: &Path,
        new_name: &Path,
        old_display: &Path,
        new_display: &Path,
    ) -> io::Result<Option<PreparedDocumentBookmarkRetarget>> {
        self.validate()?;
        if self.name != old_name || self.path() != old_display {
            return Ok(None);
        }
        if old_display.parent() != new_display.parent()
            || old_display.file_name() != Some(old_name.as_os_str())
            || new_display.file_name() != Some(new_name.as_os_str())
        {
            return Err(invalid());
        }
        let retained = self.parent.reopen()?;
        if !same_directory(parent, &retained)? || !self.probe()? {
            return Err(invalid());
        }
        let bookmark = Self {
            parent: self.parent.clone(),
            name: new_name.to_owned(),
        };
        bookmark.validate()?;
        Ok(Some(PreparedDocumentBookmarkRetarget {
            bookmark,
            _retained: retained,
        }))
    }
    pub fn parent(&self) -> &DirectoryBookmark {
        &self.parent
    }
    pub fn path(&self) -> PathBuf {
        self.parent.path.join(&self.name)
    }
    pub fn validate(&self) -> io::Result<()> {
        self.parent.validate()?;
        let mut parts = self.name.components();
        if !matches!(parts.next(), Some(Component::Normal(_)))
            || parts.next().is_some()
            || self
                .name
                .to_str()
                .is_none_or(|value| value.len() > 1024 || value.contains('\0'))
        {
            return Err(invalid());
        }
        Ok(())
    }
    pub fn is_available(&self) -> bool {
        self.probe().unwrap_or(false)
    }
    pub fn probe(&self) -> io::Result<bool> {
        self.validate()?;
        let directory = match self.parent.reopen() {
            Ok(value) => value,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error),
        };
        match directory.symlink_metadata(&self.name) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => Ok(true),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error),
            _ => Err(invalid()),
        }
    }
}
fn invalid() -> io::Error {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        "原授权目录已移动、替换或身份不可验证，请重新选择",
    )
}

#[cfg(windows)]
mod windows {
    use super::{io, Identity};
    use std::os::windows::io::AsRawHandle;
    #[repr(C)]
    struct Time {
        low: u32,
        high: u32,
    }
    #[repr(C)]
    struct Information {
        attributes: u32,
        created: Time,
        accessed: Time,
        written: Time,
        volume: u32,
        size_high: u32,
        size_low: u32,
        links: u32,
        index_high: u32,
        index_low: u32,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetFileInformationByHandle(
            handle: *mut std::ffi::c_void,
            information: *mut Information,
        ) -> i32;
    }
    pub(super) fn identity(file: &std::fs::File) -> io::Result<Identity> {
        let mut result = std::mem::MaybeUninit::<Information>::uninit();
        // SAFETY: the borrowed owned handle stays alive; the OS fills this exact
        // documented fixed-size BY_HANDLE_FILE_INFORMATION on a successful call.
        if unsafe { GetFileInformationByHandle(file.as_raw_handle(), result.as_mut_ptr()) } == 0 {
            return Err(io::Error::last_os_error());
        }
        let result = unsafe { result.assume_init() };
        Ok(Identity::Windows {
            volume: result.volume,
            index: (u64::from(result.index_high) << 32) | u64::from(result.index_low),
            created: (u64::from(result.created.high) << 32) | u64::from(result.created.low),
        })
    }
}
