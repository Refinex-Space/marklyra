//! Shared capability checks and OS no-replace rename. No display path is used
//! as IO authority; callers retain separate creation/inspection token stores.
use crate::{checked_relative, EntryKind, IndexError, Workspace};
#[cfg(windows)]
use cap_std::fs::OpenOptions;
use cap_std::fs::{Dir, File};
use std::{
    io,
    path::{Path, PathBuf},
};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub(super) use windows::configure_source;

pub(super) fn directory_identity(directory: &Dir) -> io::Result<same_file::Handle> {
    same_file::Handle::from_file(directory.try_clone()?.into_std_file())
}

pub(super) fn check_entity(
    directory: &Dir,
    name: &Path,
    kind: EntryKind,
    expected: &same_file::Handle,
) -> Result<(), IndexError> {
    let metadata = directory.symlink_metadata(name)?;
    if is_link(&metadata)
        || (kind == EntryKind::File && !metadata.is_file())
        || (kind == EntryKind::Directory && !metadata.is_dir())
    {
        return Err(changed());
    }
    let observed = open_entity(directory, name, kind)?;
    let identity = same_file::Handle::from_file(observed.into_std())?;
    if &identity != expected || is_link(&directory.symlink_metadata(name)?) {
        return Err(changed());
    }
    Ok(())
}

pub(super) fn open_entity(directory: &Dir, name: &Path, kind: EntryKind) -> io::Result<File> {
    #[cfg(not(windows))]
    {
        if kind == EntryKind::Directory {
            Ok(File::from_std(directory.open_dir(name)?.into_std_file()))
        } else {
            directory.open(name)
        }
    }
    #[cfg(windows)]
    {
        let mut options = OpenOptions::new();
        options.read(true);
        configure_source(&mut options);
        let _ = kind;
        directory.open_with(name, &options)
    }
}

pub(super) fn is_link(metadata: &cap_std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return true;
        }
    }
    metadata.file_type().is_symlink()
}

pub(super) fn check_token(value: &str) -> Result<(), IndexError> {
    if uuid::Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value) {
        Ok(())
    } else {
        Err(invalid("操作标识必须是标准 UUID"))
    }
}

pub(super) fn check_name(name: &str) -> Result<(), IndexError> {
    let stem = name.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.len() == 4
            && matches!(stem.as_bytes()[3], b'1'..=b'9'));
    if name.is_empty()
        || name.len() > 255
        || name.trim().is_empty()
        || name == "."
        || name == ".."
        || name.ends_with(['.', ' '])
        || reserved
        || name
            .chars()
            .any(|ch| ch.is_control() || "/\\:*?\"<>|".contains(ch))
    {
        return Err(invalid(
            "名称必须是有效的单个文件名，不能包含路径或系统保留字符",
        ));
    }
    checked_relative(name, false)?;
    Ok(())
}

pub(super) fn check_parent(
    workspace: &Workspace,
    relative: &str,
    expected: &Dir,
) -> Result<(), IndexError> {
    let root = workspace.display_root_snapshot()?;
    document_service::DirectoryBookmark::capture(&workspace.root, &root)?;
    let path = checked_relative(relative, true)?;
    workspace.reject_symlinks(&path)?;
    if path != Path::new(".") {
        let mut prefix = PathBuf::new();
        for part in path.components() {
            prefix.push(part);
            if is_link(&workspace.root.symlink_metadata(&prefix)?) {
                return Err(IndexError::InvalidPath);
            }
        }
    }
    let current = workspace.root.open_dir(path)?;
    if directory_identity(&current)? != directory_identity(expected)? {
        return Err(changed());
    }
    Ok(())
}

pub(super) fn rename_exclusive(
    directory: &Dir,
    source: &File,
    old: &Path,
    new: &Path,
) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        macos::rename(directory, source, old, new)
    }
    #[cfg(windows)]
    {
        let _ = old;
        windows::rename(directory, source, new)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (directory, source, old, new);
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "当前系统尚无经过验证的排他重命名实现",
        ))
    }
}

fn invalid(message: &str) -> IndexError {
    io::Error::new(io::ErrorKind::InvalidInput, message).into()
}
fn changed() -> IndexError {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        "待修改的实体或父目录已被替换",
    )
    .into()
}
