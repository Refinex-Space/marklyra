use crate::{ImageError, MAX_IMAGE_BYTES};
use cap_std::fs::{Dir, OpenOptions};
use std::{
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

#[derive(Clone)]
pub struct ImageScope {
    root: Arc<Dir>,
    parent: Arc<Dir>,
    base: PathBuf,
    logical_root: Option<PathBuf>,
    detached: bool,
}
pub struct PreparedImageScopeRetarget {
    scope: ImageScope,
    prefix: Option<(PathBuf, PathBuf)>,
    restrict_to: Option<PathBuf>,
    detach_all: bool,
}
pub(crate) enum CachePathChange {
    Unchanged,
    Mapped(PathBuf),
    Detached,
}
impl PreparedImageScopeRetarget {
    pub fn commit(self) -> ImageScope {
        self.scope
    }
    /// Rebind a preflighted directory intersection to the destination of a
    /// proven native transfer. The caller supplies an owned destination root
    /// from its successful transaction, never a display-path-derived grant.
    pub fn rebind_directory_transfer(
        mut self,
        destination: Arc<Dir>,
        destination_display: &Path,
    ) -> Result<Self, ImageError> {
        validate_display(destination_display)?;
        if self.scope.detached {
            return Ok(self);
        }
        let suffix = self
            .scope
            .logical_root
            .as_ref()
            .ok_or(ImageError::InvalidReference)?
            .strip_prefix(destination_display)
            .map_err(|_| ImageError::OutsideScope)?;
        let root = Arc::new(open_directory(&destination, suffix)?);
        self.scope.parent = Arc::new(open_directory(&root, &self.scope.base)?);
        self.scope.root = root;
        Ok(self)
    }
    pub(crate) fn retarget_path(&self, path: &Path) -> CachePathChange {
        if self.detach_all {
            return CachePathChange::Detached;
        }
        if let Some(prefix) = &self.restrict_to {
            return match path.strip_prefix(prefix) {
                Ok(suffix) => CachePathChange::Mapped(suffix.to_owned()),
                Err(_) => CachePathChange::Detached,
            };
        }
        match self
            .prefix
            .as_ref()
            .and_then(|(old, new)| path.strip_prefix(old).ok().map(|suffix| new.join(suffix)))
        {
            Some(path) => CachePathChange::Mapped(path),
            None => CachePathChange::Unchanged,
        }
    }
}
impl ImageScope {
    /// Proves a same-parent directory rename against the current capabilities.
    /// The returned scope retains the exact same root/parent FDs; only lexical
    /// paths change. Never treats new_prefix as a source of filesystem access.
    pub fn prepare_retarget(
        &self,
        source: &Dir,
        old_prefix: &Path,
        new_prefix: &Path,
    ) -> Result<PreparedImageScopeRetarget, ImageError> {
        validate_display(old_prefix)?;
        validate_display(new_prefix)?;
        if old_prefix.parent() != new_prefix.parent() {
            return Err(ImageError::InvalidReference);
        }
        if self.detached {
            return Ok(self.detached_plan(old_prefix, new_prefix));
        }
        verify_display(source, old_prefix)?;
        let logical = self
            .logical_root
            .as_ref()
            .ok_or(ImageError::InvalidReference)?;
        verify_display(&self.root, logical)?;
        if !same_directory(&open_directory(&self.root, &self.base)?, &self.parent)? {
            return Err(ImageError::OutsideScope);
        }
        let mut scope = self.clone();
        let mut prefix = None;
        if let Ok(suffix) = logical.strip_prefix(old_prefix) {
            if !same_directory(&open_directory(source, suffix)?, &self.root)? {
                return Err(ImageError::OutsideScope);
            }
            scope.logical_root = Some(new_prefix.join(suffix));
        } else if let Ok(relative) = old_prefix.strip_prefix(logical) {
            if !same_directory(&open_directory(&self.root, relative)?, source)? {
                return Err(ImageError::OutsideScope);
            }
            let new_relative = new_prefix
                .strip_prefix(logical)
                .map_err(|_| ImageError::OutsideScope)?
                .to_owned();
            if let Ok(suffix) = self.base.strip_prefix(relative) {
                scope.base = new_relative.join(suffix);
            }
            prefix = Some((relative.to_owned(), new_relative));
        }
        if let Some(logical) = &scope.logical_root {
            validate_display(logical)?;
            validate_display(&logical.join(&scope.base))?;
        }
        Ok(PreparedImageScopeRetarget {
            scope,
            prefix,
            restrict_to: None,
            detach_all: false,
        })
    }
    /// Native-only cross-parent movement of a whole directory. Source-relative
    /// parent FDs stay the same; the destination is descriptive, never opened as
    /// a new grant. A broader old root is intersected with the moved subtree.
    pub fn prepare_directory_move(
        &self,
        source: Arc<Dir>,
        source_display: &Path,
        destination_display: &Path,
    ) -> Result<PreparedImageScopeRetarget, ImageError> {
        validate_display(source_display)?;
        validate_display(destination_display)?;
        if self.detached {
            return Ok(self.detached_plan(source_display, destination_display));
        }
        verify_display(&source, source_display)?;
        let logical = self
            .logical_root
            .as_ref()
            .ok_or(ImageError::InvalidReference)?;
        verify_display(&self.root, logical)?;
        if !same_directory(&open_directory(&self.root, &self.base)?, &self.parent)? {
            return Err(ImageError::OutsideScope);
        }
        let mut scope = self.clone();
        let restrict_to = if let Ok(suffix) = logical.strip_prefix(source_display) {
            if !same_directory(&open_directory(&source, suffix)?, &self.root)? {
                return Err(ImageError::OutsideScope);
            }
            scope.logical_root = Some(destination_display.join(suffix));
            None
        } else if let Ok(prefix) = source_display.strip_prefix(logical) {
            if !same_directory(&open_directory(&self.root, prefix)?, &source)? {
                return Err(ImageError::OutsideScope);
            }
            scope.base = self
                .base
                .strip_prefix(prefix)
                .map_err(|_| ImageError::OutsideScope)?
                .to_owned();
            if !same_directory(&open_directory(&source, &scope.base)?, &self.parent)? {
                return Err(ImageError::OutsideScope);
            }
            scope.root = source;
            scope.logical_root = Some(destination_display.to_owned());
            Some(prefix.to_owned())
        } else {
            return Err(ImageError::OutsideScope);
        };
        let logical = scope
            .logical_root
            .as_ref()
            .ok_or(ImageError::InvalidReference)?;
        validate_display(logical)?;
        validate_display(&logical.join(&scope.base))?;
        Ok(PreparedImageScopeRetarget {
            scope,
            prefix: None,
            restrict_to,
            detach_all: false,
        })
    }

    /// A single Markdown file carries no sibling-image directory with it.
    /// Preserve immutable cache bytes, but detach every old path and grant no
    /// access to the destination's siblings or image-import folders.
    pub fn prepare_file_move(
        &self,
        source_parent: &Dir,
        source_display: &Path,
        destination_display: &Path,
    ) -> Result<PreparedImageScopeRetarget, ImageError> {
        validate_display(source_display)?;
        validate_display(destination_display)?;
        let source = source_display
            .parent()
            .ok_or(ImageError::InvalidReference)?;
        let destination = destination_display
            .parent()
            .ok_or(ImageError::InvalidReference)?;
        if !self.detached {
            verify_display(source_parent, source)?;
            if !same_directory(source_parent, &self.parent)? {
                return Err(ImageError::OutsideScope);
            }
        }
        let mut result = self.detached_plan(source, destination);
        result.scope.logical_root = Some(destination.to_owned());
        Ok(result)
    }
    /// Explicit native folder selection grants the new document directory.
    /// Immutable old resources stay renderable, but their cache paths are
    /// detached so a same-spelled destination reference cannot reuse old bytes.
    pub fn prepare_authorized_file_move(
        &self,
        source_parent: &Dir,
        source_display: &Path,
        destination_parent: Arc<Dir>,
        destination_display: &Path,
    ) -> Result<PreparedImageScopeRetarget, ImageError> {
        let mut result =
            self.prepare_file_move(source_parent, source_display, destination_display)?;
        let parent = destination_display
            .parent()
            .ok_or(ImageError::InvalidReference)?;
        verify_display(&destination_parent, parent)?;
        result.scope = if let Some(root) = self.logical_root.as_ref().filter(|_| !self.detached) {
            verify_display(&self.root, root)?;
            if let Ok(base) = parent.strip_prefix(root) {
                if !same_directory(&open_directory(&self.root, base)?, &destination_parent)? {
                    return Err(ImageError::OutsideScope);
                }
                Self::workspace(Arc::clone(&self.root), destination_parent, base)?
                    .with_logical_root(root)?
            } else {
                Self::document_directory(destination_parent).with_logical_root(parent)?
            }
        } else {
            Self::document_directory(destination_parent).with_logical_root(parent)?
        };
        Ok(result)
    }
    fn detached_plan(&self, old: &Path, new: &Path) -> PreparedImageScopeRetarget {
        let mut scope = self.clone();
        scope.detached = true;
        if let Some(logical) = &scope.logical_root {
            if let Ok(suffix) = logical.strip_prefix(old) {
                scope.logical_root = Some(new.join(suffix));
            }
        }
        PreparedImageScopeRetarget {
            scope,
            prefix: None,
            restrict_to: None,
            detach_all: true,
        }
    }
    pub fn document_directory(parent: Arc<Dir>) -> Self {
        Self {
            root: Arc::clone(&parent),
            parent,
            base: PathBuf::new(),
            logical_root: None,
            detached: false,
        }
    }
    pub fn workspace(root: Arc<Dir>, parent: Arc<Dir>, base: &Path) -> Result<Self, ImageError> {
        if base
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
        {
            return Err(ImageError::InvalidReference);
        }
        Ok(Self {
            root,
            parent,
            base: base.to_owned(),
            logical_root: None,
            detached: false,
        })
    }
    /// This display path is only used for lexical boundary math. All actual IO
    /// continues through the supplied capability, including leave-and-return URLs.
    pub fn with_logical_root(mut self, root: &Path) -> Result<Self, ImageError> {
        if !root.is_absolute()
            || root
                .components()
                .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
        {
            return Err(ImageError::InvalidReference);
        }
        self.logical_root = Some(root.to_owned());
        Ok(self)
    }
    pub(crate) fn reference_path(&self, reference: &str) -> Result<PathBuf, ImageError> {
        self.normalized_path(reference, false)
    }
    /// Pure preflight of a proposed copy policy against this existing scope.
    /// It neither creates directories nor opens any ambient path.
    pub fn validate_import_target(
        &self,
        reference_root: &str,
        storage_folder: &str,
    ) -> Result<(), ImageError> {
        self.normalized_path(reference_root, true)?;
        validate_storage_path(storage_folder)?;
        self.normalized_path_with_encoding(storage_folder, true, false)?;
        Ok(())
    }
    /// Pure comparison within this existing capability boundary. In particular,
    /// an absolute/file spelling cannot grant a sibling of the scoped root.
    pub fn references_same_path(&self, first: &str, second: &str) -> Result<bool, ImageError> {
        Ok(self.normalized_path(first, false)? == self.normalized_path(second, false)?)
    }
    /// Native Reveal hint after current capability/display and byte proof. The
    /// result is descriptive, never a reusable file-read or write grant.
    pub fn verified_image_path(&self, path: &Path, expected: &[u8]) -> Result<PathBuf, ImageError> {
        if self.detached {
            return Err(ImageError::OutsideScope);
        }
        if path.as_os_str().is_empty()
            || path
                .components()
                .any(|part| !matches!(part, Component::Normal(_)))
        {
            return Err(ImageError::InvalidReference);
        }
        let logical = self.logical_root.as_ref().ok_or(ImageError::OutsideScope)?;
        verify_display(&self.root, logical)?;
        if !same_directory(&open_directory(&self.root, &self.base)?, &self.parent)? {
            return Err(ImageError::OutsideScope);
        }
        if self.read(path)? != expected {
            return Err(ImageError::OutsideScope);
        }
        Ok(logical.join(path))
    }
    fn normalized_path(&self, reference: &str, directory: bool) -> Result<PathBuf, ImageError> {
        self.normalized_path_with_encoding(reference, directory, true)
    }
    fn normalized_path_with_encoding(
        &self,
        reference: &str,
        directory: bool,
        url_encoded: bool,
    ) -> Result<PathBuf, ImageError> {
        if self.detached {
            return Err(ImageError::OutsideScope);
        }
        if (!directory && reference.is_empty())
            || reference.len() > 4096
            || reference.contains(['?', '#', '\\', '\0'])
        {
            return Err(ImageError::InvalidReference);
        }
        let file_url = reference.starts_with("file://");
        let raw = local_url_path(reference)?;
        let decoded = if url_encoded || file_url {
            decode(raw)?
        } else {
            raw.to_owned()
        };
        #[cfg(windows)]
        let decoded =
            if file_url && decoded.starts_with('/') && decoded.as_bytes().get(2) == Some(&b':') {
                decoded[1..].to_owned()
            } else {
                decoded
            };
        if decoded.contains(['\\', '\0'])
            || decoded.chars().any(char::is_control)
            || decoded.contains("//")
        {
            return Err(ImageError::InvalidReference);
        }
        let absolute = Path::new(&decoded).is_absolute();
        if file_url && !absolute || decoded.contains(':') && !native_drive_path(&decoded) {
            return Err(ImageError::InvalidReference);
        }
        let mut path = if absolute {
            if self.logical_root.is_none() {
                return Err(ImageError::OutsideScope);
            }
            PathBuf::new()
        } else {
            self.logical_root
                .as_ref()
                .map_or_else(|| self.base.clone(), |root| root.join(&self.base))
        };
        if !decoded.is_empty() {
            for component in Path::new(&decoded).components() {
                match component {
                    Component::CurDir => {}
                    Component::ParentDir => {
                        if !path.pop() {
                            return Err(ImageError::OutsideScope);
                        }
                    }
                    Component::Normal(value) => {
                        let value = value.to_str().ok_or(ImageError::InvalidReference)?;
                        if value.ends_with(['.', ' ']) || reserved(value) {
                            return Err(ImageError::InvalidReference);
                        }
                        path.push(value);
                    }
                    Component::Prefix(_) | Component::RootDir if absolute => {
                        path.push(component.as_os_str())
                    }
                    _ => return Err(ImageError::InvalidReference),
                }
            }
        }
        if let Some(root) = &self.logical_root {
            let reference_root = logical_reference_root(root);
            path = path
                .strip_prefix(if absolute { &reference_root } else { root })
                .map_err(|_| ImageError::OutsideScope)?
                .to_owned();
        }
        if !directory && path.as_os_str().is_empty() {
            return Err(ImageError::InvalidReference);
        }
        Ok(path)
    }
    pub(crate) fn read(&self, path: &Path) -> Result<Vec<u8>, ImageError> {
        if self.detached {
            return Err(ImageError::OutsideScope);
        }
        let (directory, relative) = match path.strip_prefix(&self.base) {
            Ok(relative) if !relative.as_os_str().is_empty() => (&self.parent, relative),
            _ => (&self.root, path),
        };
        let parent = open_directory(
            directory,
            relative.parent().ok_or(ImageError::InvalidReference)?,
        )?;
        let name = Path::new(relative.file_name().ok_or(ImageError::InvalidReference)?);
        let metadata = parent.symlink_metadata(name)?;
        #[cfg(windows)]
        {
            use cap_std::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(ImageError::Symlink);
            }
        }
        if metadata.file_type().is_symlink() {
            return Err(ImageError::Symlink);
        }
        let mut options = OpenOptions::new();
        options.read(true);
        // cap-std reexports these pinned cap-primitives options; the public
        // bridge behind cap-fs-ext adds no new ambient-path authority.
        options._cap_fs_ext_follow(cap_primitives::fs::FollowSymlinks::No);
        let file = parent.open_with(name, &options)?;
        let metadata = file.metadata()?;
        if !metadata.is_file() {
            return Err(ImageError::InvalidImage);
        }
        if metadata.len() > MAX_IMAGE_BYTES as u64 {
            return Err(ImageError::TooLarge);
        }
        let mut bytes = Vec::with_capacity(metadata.len() as usize);
        file.take(MAX_IMAGE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err(ImageError::TooLarge);
        }
        Ok(bytes)
    }
    pub(crate) fn import(
        &self,
        name: &str,
        extension: &str,
        bytes: &[u8],
        reference_root: &str,
        storage_folder: &str,
    ) -> Result<ImportedAsset, ImageError> {
        let effective_root = self.normalized_path(reference_root, true)?;
        let stem = safe_stem(name)?;
        validate_storage_path(storage_folder)?;
        let folder = self.normalized_path_with_encoding(storage_folder, true, false)?;
        let (anchor, relative) = match folder.strip_prefix(&self.base) {
            Ok(relative) => (&self.parent, relative),
            Err(_) => (&self.root, folder.as_path()),
        };
        let mut directory = anchor.try_clone()?;
        for component in relative.components() {
            let part = Path::new(component.as_os_str());
            match directory.create_dir(part) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
            let metadata = directory.symlink_metadata(part)?;
            #[cfg(windows)]
            {
                use cap_std::fs::MetadataExt;
                if metadata.file_attributes() & 0x400 != 0 {
                    return Err(ImageError::Symlink);
                }
            }
            if metadata.file_type().is_symlink() {
                return Err(ImageError::Symlink);
            }
            // One component per no-follow open, anchored to the previous FD.
            // A replacement symlink between metadata and open is also refused.
            let handle = directory.try_clone()?.into_std_file();
            directory = Dir::from_std_file(cap_primitives::fs::open_dir_nofollow(&handle, part)?);
        }
        #[cfg(unix)]
        if directory.dir_metadata()?.permissions().readonly() {
            return Err(ImageError::PublishFailed);
        }
        let stage = format!(".import-{}", Uuid::new_v4());
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = directory.open_with(&stage, &options)?;
        let result = (|| {
            file.write_all(bytes)?;
            file.sync_all()?;
            drop(file);
            for _ in 0..8 {
                let destination = format!("{stem}-{}.{}", Uuid::new_v4(), extension);
                let path = folder.join(&destination);
                let source = relative_url(&effective_root, &path)?;
                match publish(&directory, &stage, &destination) {
                    Ok(()) => return Ok(ImportedAsset { path, source }),
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(_) => return Err(ImageError::PublishFailed),
                }
            }
            Err(ImageError::PublishFailed)
        })();
        let _ = directory.remove_file(&stage);
        #[cfg(unix)]
        if result.is_ok() {
            let _ = directory
                .try_clone()
                .map(Dir::into_std_file)
                .and_then(|dir| dir.sync_all());
        }
        result
    }
}
fn validate_display(path: &Path) -> Result<(), ImageError> {
    if !path.is_absolute()
        || path
            .to_str()
            .is_none_or(|path| path.len() > 4096 || path.contains('\0'))
        || path
            .components()
            .any(|part| matches!(part, Component::CurDir | Component::ParentDir))
    {
        return Err(ImageError::InvalidReference);
    }
    Ok(())
}
fn same_directory(first: &Dir, second: &Dir) -> std::io::Result<bool> {
    Ok(
        same_file::Handle::from_file(first.try_clone()?.into_std_file())?
            == same_file::Handle::from_file(second.try_clone()?.into_std_file())?,
    )
}
fn verify_display(directory: &Dir, path: &Path) -> Result<(), ImageError> {
    validate_display(path)?;
    if std::fs::canonicalize(path)? != path || is_link(&std::fs::symlink_metadata(path)?) {
        return Err(ImageError::OutsideScope);
    }
    let observed = Dir::open_ambient_dir(path, cap_std::ambient_authority())?;
    if !same_directory(directory, &observed)? || std::fs::canonicalize(path)? != path {
        return Err(ImageError::OutsideScope);
    }
    Ok(())
}
fn is_link(metadata: &std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    metadata.file_type().is_symlink()
}
fn open_directory(root: &Dir, relative: &Path) -> Result<Dir, ImageError> {
    let mut directory = root.try_clone()?;
    for part in relative.components() {
        let Component::Normal(name) = part else {
            return Err(ImageError::InvalidReference);
        };
        let name = Path::new(name);
        let metadata = directory.symlink_metadata(name)?;
        #[cfg(windows)]
        {
            use cap_std::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(ImageError::Symlink);
            }
        }
        if metadata.file_type().is_symlink() {
            return Err(ImageError::Symlink);
        }
        directory = Dir::from_std_file(cap_primitives::fs::open_dir_nofollow(
            &directory.try_clone()?.into_std_file(),
            name,
        )?);
    }
    Ok(directory)
}
fn validate_storage_path(folder: &str) -> Result<(), ImageError> {
    if folder.is_empty()
        || folder.len() > 1024
        || folder.chars().any(char::is_control)
        || folder.contains(['\\', '<', '>', '"', '|', '?', '*'])
    {
        return Err(ImageError::InvalidReference);
    }
    if Path::new(folder).components().count() > 64
        || Path::new(folder)
            .components()
            .any(|part| matches!(part, Component::Normal(value) if value.len() > 255))
    {
        return Err(ImageError::InvalidReference);
    }
    Ok(())
}
/// Canonical Windows roots have a verbatim drive prefix; Markdown URLs do not.
/// This is lexical comparison only: all IO still uses the original capability.
fn logical_reference_root(root: &Path) -> PathBuf {
    #[cfg(windows)]
    if let Some(Component::Prefix(prefix)) = root.components().next() {
        if let std::path::Prefix::VerbatimDisk(drive) = prefix.kind() {
            let mut result = PathBuf::from(format!("{}:\\", char::from(drive)));
            result.extend(root.components().skip(2).map(|part| part.as_os_str()));
            return result;
        }
    }
    root.to_owned()
}
fn local_url_path(reference: &str) -> Result<&str, ImageError> {
    let Some(url) = reference.strip_prefix("file://") else {
        return Ok(reference);
    };
    if url.starts_with('/') {
        return Ok(url);
    }
    let (host, _) = url.split_once('/').ok_or(ImageError::InvalidReference)?;
    if !host.eq_ignore_ascii_case("localhost") {
        return Err(ImageError::InvalidReference);
    }
    Ok(&url[host.len()..])
}
fn native_drive_path(value: &str) -> bool {
    #[cfg(windows)]
    {
        return value.as_bytes().get(1) == Some(&b':')
            && value
                .as_bytes()
                .first()
                .is_some_and(u8::is_ascii_alphabetic)
            && Path::new(value).is_absolute();
    }
    #[cfg(not(windows))]
    {
        let _ = value;
        false
    }
}
pub(crate) struct ImportedAsset {
    pub path: PathBuf,
    pub source: String,
}
fn relative_url(from: &Path, target: &Path) -> Result<String, ImageError> {
    let from: Vec<_> = from.components().collect();
    let target: Vec<_> = target.components().collect();
    let common = from.iter().zip(&target).take_while(|(a, b)| a == b).count();
    let mut result = vec!["..".to_owned(); from.len() - common];
    for part in &target[common..] {
        result.push(encode(
            part.as_os_str()
                .to_str()
                .ok_or(ImageError::InvalidReference)?,
        ));
    }
    let result = result.join("/");
    if result.len() > 4096 || result.is_empty() {
        return Err(ImageError::InvalidReference);
    }
    Ok(result)
}
fn publish(directory: &Dir, staged: &str, destination: &str) -> std::io::Result<()> {
    // Atomic publication of the fully written inode. Existing names are never replaced.
    // Filesystems without hard links fail explicitly instead of doing a partial copy.
    directory.hard_link(staged, directory, destination)
}
fn decode(reference: &str) -> Result<String, ImageError> {
    let mut result = Vec::with_capacity(reference.len());
    let mut bytes = reference.bytes();
    while let Some(byte) = bytes.next() {
        if byte == b'%' {
            let hi = bytes
                .next()
                .and_then(hex)
                .ok_or(ImageError::InvalidReference)?;
            let lo = bytes
                .next()
                .and_then(hex)
                .ok_or(ImageError::InvalidReference)?;
            result.push(hi * 16 + lo);
        } else {
            result.push(byte);
        }
    }
    String::from_utf8(result).map_err(|_| ImageError::InvalidReference)
}
fn hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'A'..=b'F' => Some(value - b'A' + 10),
        b'a'..=b'f' => Some(value - b'a' + 10),
        _ => None,
    }
}
fn encode(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) {
            encoded.push(char::from(byte));
        } else {
            use std::fmt::Write;
            write!(&mut encoded, "%{byte:02X}").expect("writing to String");
        }
    }
    encoded
}
fn reserved(value: &str) -> bool {
    let stem = value
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9')
}
fn safe_stem(name: &str) -> Result<String, ImageError> {
    if name.is_empty() || name.len() > 512 || name.chars().any(char::is_control) {
        return Err(ImageError::InvalidName);
    }
    let basename = name
        .rsplit(['/', '\\'])
        .next()
        .ok_or(ImageError::InvalidName)?;
    let stem = basename.rsplit_once('.').map_or(basename, |(stem, _)| stem);
    let safe: String = stem
        .chars()
        .filter(|character| character.is_alphanumeric() || *character == '-' || *character == '_')
        .take(64)
        .collect();
    Ok(if safe.is_empty() || reserved(&safe) {
        "image".to_owned()
    } else {
        safe
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn atomic_publish_never_replaces_existing_assets() {
        let temp = tempfile::tempdir().unwrap();
        let directory = Dir::open_ambient_dir(temp.path(), cap_std::ambient_authority()).unwrap();
        directory.write("stage", b"new").unwrap();
        directory.write("existing.png", b"original").unwrap();
        assert_eq!(
            publish(&directory, "stage", "existing.png")
                .unwrap_err()
                .kind(),
            std::io::ErrorKind::AlreadyExists
        );
        assert_eq!(directory.read("existing.png").unwrap(), b"original");
    }
}
