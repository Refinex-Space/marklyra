//! Native-only, entity-bound system Trash and no-replace restoration.
//! System result paths never become renderer filesystem capabilities.
use cap_std::fs::{Dir, File};
use file_index::EntryKind;
use std::{
    fmt, io,
    path::{Component, Path, PathBuf},
    sync::Arc,
};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(test)]
mod tests;
#[cfg(windows)]
mod windows;

pub struct AuthorizedTrashSource {
    parent: Arc<Dir>,
    name: PathBuf,
    source: Arc<File>,
    identity: Arc<same_file::Handle>,
    parent_identity: same_file::Handle,
    kind: EntryKind,
}

impl AuthorizedTrashSource {
    /// All arguments come from a native inspection receipt, never renderer paths.
    pub fn new(
        parent: Arc<Dir>,
        name: PathBuf,
        source: Arc<File>,
        identity: Arc<same_file::Handle>,
        kind: EntryKind,
    ) -> io::Result<Self> {
        single_name(&name)?;
        let parent_identity = same_file::Handle::from_file(parent.try_clone()?.into_std_file())?;
        let result = Self {
            parent,
            name,
            source,
            identity,
            parent_identity,
            kind,
        };
        result.verify()?;
        Ok(result)
    }

    fn verify(&self) -> io::Result<()> {
        if identity_of(&self.source)? != *self.identity
            || same_file::Handle::from_file(self.parent.try_clone()?.into_std_file())?
                != self.parent_identity
        {
            return Err(changed());
        }
        verify_entry(&self.parent, &self.name, self.kind, &self.identity)
    }
}

pub struct TrashPlacement {
    original_parent: Arc<Dir>,
    original_name: PathBuf,
    directory: Option<Arc<Dir>>,
    name: PathBuf,
    source: Arc<File>,
    identity: Arc<same_file::Handle>,
    kind: EntryKind,
    display_path: PathBuf,
    #[cfg(target_os = "macos")]
    system_url: Option<objc2::rc::Retained<objc2_foundation::NSURL>>,
}

impl TrashPlacement {
    /// Only a document-service publication pin can replace a retained source
    /// after this application's own atomic save. No renderer path or byte
    /// equality can mint this proof; the original system endpoint stays intact.
    pub fn refresh_file_source(
        &self,
        operation_key: uuid::Uuid,
        proof: &document_service::TrashFileSource,
    ) -> io::Result<Self> {
        if self.kind != EntryKind::File
            || proof.operation_key() != operation_key
            || proof.initial_identity() != self.identity.as_ref()
            || proof.display() != self.display_path
            || proof.original_name() != self.original_name
            || same_file::Handle::from_file(proof.original_parent().try_clone()?.into_std_file())?
                != same_file::Handle::from_file(self.original_parent.try_clone()?.into_std_file())?
        {
            return Err(changed());
        }
        #[cfg(windows)]
        let source = Arc::new(open_entry(
            &proof.source_parent(),
            proof.source_name(),
            EntryKind::File,
        )?);
        #[cfg(not(windows))]
        let source = proof.source();
        let identity = proof.identity();
        if identity_of(&source)? != *identity {
            return Err(changed());
        }
        let refreshed = Self {
            original_parent: Arc::clone(&self.original_parent),
            original_name: self.original_name.clone(),
            directory: self.directory.as_ref().map(Arc::clone),
            name: self.name.clone(),
            source,
            identity,
            kind: self.kind,
            display_path: self.display_path.clone(),
            #[cfg(target_os = "macos")]
            system_url: self.system_url.clone(),
        };
        verify_placement(&refreshed)?;
        Ok(refreshed)
    }
    pub fn original_parent(&self) -> Arc<Dir> {
        Arc::clone(&self.original_parent)
    }
    pub fn original_name(&self) -> &Path {
        &self.original_name
    }
    #[cfg(test)]
    pub fn directory(&self) -> Option<Arc<Dir>> {
        self.directory.as_ref().map(Arc::clone)
    }
    /// A directory's retained entity FD grants that directory and descendants,
    /// never its Trash parent or sibling entries. No ambient reopen occurs.
    pub fn entry_directory(&self) -> io::Result<Option<Arc<Dir>>> {
        if self.kind != EntryKind::Directory {
            return Ok(None);
        }
        if identity_of(&self.source)? != *self.identity || !self.source.metadata()?.is_dir() {
            return Err(changed());
        }
        Ok(Some(Arc::new(Dir::from_std_file(
            self.source.try_clone()?.into_std(),
        ))))
    }
    #[cfg(test)]
    pub fn name(&self) -> &Path {
        &self.name
    }
    pub fn source(&self) -> Arc<File> {
        Arc::clone(&self.source)
    }
    pub fn source_identity(&self) -> Arc<same_file::Handle> {
        Arc::clone(&self.identity)
    }
    pub fn kind(&self) -> EntryKind {
        self.kind
    }
    /// Informational system result only; not an ambient path grant.
    pub fn display_path(&self) -> &Path {
        &self.display_path
    }
}

#[derive(Debug)]
pub enum TrashFailure {
    NotMoved(String),
    MutationUncertain {
        message: String,
        observed_destination: Option<PathBuf>,
    },
}

impl fmt::Display for TrashFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotMoved(message) => write!(formatter, "{message}"),
            Self::MutationUncertain {
                message,
                observed_destination,
            } => {
                write!(formatter, "文件操作结果不能安全确认：{message}")?;
                if observed_destination.is_some() {
                    // Keep the candidate path Native-only; the message conveys
                    // available recovery evidence without exposing a Trash URL.
                    write!(formatter, "（已保留系统返回的候选位置）")?;
                }
                Ok(())
            }
        }
    }
}
impl std::error::Error for TrashFailure {}

pub fn trash(source: &AuthorizedTrashSource) -> Result<TrashPlacement, TrashFailure> {
    source.verify().map_err(not_moved)?;
    #[cfg(target_os = "macos")]
    {
        macos::trash(source)
    }
    #[cfg(windows)]
    {
        windows::trash(source)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        Err(TrashFailure::NotMoved("此平台尚未实现系统回收站".into()))
    }
}

/// Caller consumes its single Undo slot before calling; never overwrites a new
/// occupant or recreates a missing parent. A stale receipt cannot be replayed.
pub fn restore(placement: &TrashPlacement) -> Result<(), TrashFailure> {
    if identity_of(&placement.source()).map_err(not_moved)? != *placement.identity {
        return Err(not_moved(changed()));
    }
    verify_placement(placement).map_err(not_moved)?;
    ensure_absent(&placement.original_parent, &placement.original_name).map_err(not_moved)?;
    #[cfg(target_os = "macos")]
    let result = macos::restore(placement);
    #[cfg(windows)]
    let result = windows::restore(placement);
    #[cfg(not(any(target_os = "macos", windows)))]
    let result = Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "Unsupported Trash restore",
    ));
    if let Err(error) = result {
        return if verify_placement(placement).is_ok() {
            Err(not_moved(error))
        } else {
            Err(uncertain(error, Some(placement.display_path.clone())))
        };
    }
    verify_entry(
        &placement.original_parent,
        &placement.original_name,
        placement.kind,
        &placement.identity,
    )
    .and_then(|()| {
        if let Some(directory) = &placement.directory {
            ensure_absent(directory, &placement.name)
        } else {
            #[cfg(target_os = "macos")]
            {
                macos::verify_restored_location(placement)
            }
            #[cfg(not(target_os = "macos"))]
            Err(changed())
        }
    })
    .map_err(|error| uncertain(error, None))
}

#[cfg(any(windows, test))]
fn capture_result(
    source: &AuthorizedTrashSource,
    path: PathBuf,
) -> Result<TrashPlacement, TrashFailure> {
    capture_result_with_opener(source, path, |parent| {
        Dir::open_ambient_dir(parent, cap_std::ambient_authority())
    })
}

fn capture_result_with_opener(
    source: &AuthorizedTrashSource,
    path: PathBuf,
    open_parent: impl FnOnce(&Path) -> io::Result<Dir>,
) -> Result<TrashPlacement, TrashFailure> {
    let capture = || -> io::Result<TrashPlacement> {
        if !path.is_absolute() {
            return Err(changed());
        }
        let name = path.file_name().map(PathBuf::from).ok_or_else(changed)?;
        single_name(&name)?;
        let parent = path.parent().ok_or_else(changed)?;
        // Only the OS-returned endpoint is opened ambiently. The identity check
        // below is mandatory before this native-only restricted receipt exists.
        let directory = match open_parent(parent) {
            Ok(directory) => {
                verify_entry(&directory, &name, source.kind, &source.identity)?;
                Some(Arc::new(directory))
            }
            Err(error) => {
                #[cfg(target_os = "macos")]
                if error.kind() == io::ErrorKind::PermissionDenied {
                    macos::verify_held_location(
                        &source.source,
                        &source.identity,
                        source.kind,
                        &path,
                    )?;
                    None
                } else {
                    return Err(error);
                }
                #[cfg(not(target_os = "macos"))]
                return Err(error);
            }
        };
        ensure_absent(&source.parent, &source.name)?;
        Ok(TrashPlacement {
            original_parent: Arc::clone(&source.parent),
            original_name: source.name.clone(),
            directory,
            name,
            source: Arc::clone(&source.source),
            identity: Arc::clone(&source.identity),
            kind: source.kind,
            display_path: path.clone(),
            #[cfg(target_os = "macos")]
            system_url: None,
        })
    };
    capture().map_err(|error| uncertain(error, Some(path)))
}

fn verify_placement(placement: &TrashPlacement) -> io::Result<()> {
    if let Some(directory) = &placement.directory {
        verify_entry(
            directory,
            &placement.name,
            placement.kind,
            &placement.identity,
        )
    } else {
        #[cfg(target_os = "macos")]
        {
            macos::verify_restricted_endpoint(placement)
        }
        #[cfg(not(target_os = "macos"))]
        Err(changed())
    }
}

fn failed_system_call(source: &AuthorizedTrashSource, error: impl fmt::Display) -> TrashFailure {
    if source.verify().is_ok() {
        not_moved(error)
    } else {
        uncertain(error, None)
    }
}

fn identity_of(file: &File) -> io::Result<same_file::Handle> {
    same_file::Handle::from_file(file.try_clone()?.into_std())
}

fn verify_entry(
    directory: &Dir,
    name: &Path,
    kind: EntryKind,
    identity: &same_file::Handle,
) -> io::Result<()> {
    single_name(name)?;
    let before = directory.symlink_metadata(name)?;
    if is_link(&before)
        || (kind == EntryKind::File && !before.is_file())
        || (kind == EntryKind::Directory && !before.is_dir())
    {
        return Err(changed());
    }
    let file = open_entry(directory, name, kind)?;
    if identity_of(&file)? != *identity || is_link(&directory.symlink_metadata(name)?) {
        return Err(changed());
    }
    Ok(())
}

fn open_entry(directory: &Dir, name: &Path, kind: EntryKind) -> io::Result<File> {
    #[cfg(windows)]
    {
        let _ = kind;
        windows::open_entry(directory, name)
    }
    #[cfg(not(windows))]
    {
        if kind == EntryKind::Directory {
            Ok(File::from_std(directory.open_dir(name)?.into_std_file()))
        } else {
            directory.open(name)
        }
    }
}

fn is_link(metadata: &cap_std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    metadata.file_type().is_symlink()
}

fn single_name(name: &Path) -> io::Result<()> {
    if !matches!(name.components().next(), Some(Component::Normal(_)))
        || name.components().count() != 1
        || name.as_os_str().is_empty()
        || name.to_string_lossy().contains(['\0', '/', '\\'])
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Expected one entry name",
        ));
    }
    Ok(())
}

fn ensure_absent(directory: &Dir, name: &Path) -> io::Result<()> {
    match directory.symlink_metadata(name) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
        Ok(_) => Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "Entry already exists",
        )),
    }
}

fn changed() -> io::Error {
    io::Error::other("Trash entry identity or location changed")
}
fn not_moved(error: impl fmt::Display) -> TrashFailure {
    TrashFailure::NotMoved(error.to_string())
}
fn uncertain(error: impl fmt::Display, destination: Option<PathBuf>) -> TrashFailure {
    TrashFailure::MutationUncertain {
        message: error.to_string(),
        observed_destination: destination,
    }
}
