use super::*;
use objc2::rc::autoreleasepool;
use objc2_foundation::{NSFileManager, NSString, NSURL};
use std::{ffi::CString, os::fd::AsRawFd, os::unix::ffi::OsStrExt};

unsafe extern "C" {
    fn fcntl(fd: i32, command: i32, ...) -> i32;
    fn renameatx_np(old_fd: i32, old: *const i8, new_fd: i32, new: *const i8, flags: u32) -> i32;
}

fn current_path(file: &impl AsRawFd) -> io::Result<PathBuf> {
    let mut buffer = [0_u8; 1024];
    // SAFETY: Darwin F_GETPATH (50) writes at most MAXPATHLEN bytes to this
    // writable buffer; the borrowed descriptor is held for the entire call.
    if unsafe { fcntl(file.as_raw_fd(), 50, buffer.as_mut_ptr()) } == -1 {
        return Err(io::Error::last_os_error());
    }
    let end = buffer
        .iter()
        .position(|byte| *byte == 0)
        .ok_or_else(changed)?;
    Ok(PathBuf::from(std::ffi::OsStr::from_bytes(&buffer[..end])))
}

pub(super) fn trash(source: &AuthorizedTrashSource) -> Result<TrashPlacement, TrashFailure> {
    trash_with_opener(source, |parent| {
        Dir::open_ambient_dir(parent, cap_std::ambient_authority())
    })
}

fn trash_with_opener(
    source: &AuthorizedTrashSource,
    open_parent: impl FnOnce(&Path) -> io::Result<Dir>,
) -> Result<TrashPlacement, TrashFailure> {
    let parent = current_path(source.parent.as_ref()).map_err(not_moved)?;
    let path = parent.join(&source.name);
    if current_path(source.source.as_ref()).map_err(not_moved)? != path {
        return Err(not_moved(changed()));
    }
    // Reopen only to validate the FD-derived current parent path. The retained
    // capability and exact entity remain the authority; path is unavoidable for
    // Foundation's API and is not an atomic compare-and-trash primitive.
    let observed =
        Dir::open_ambient_dir(&parent, cap_std::ambient_authority()).map_err(not_moved)?;
    if same_file::Handle::from_file(observed.into_std_file()).map_err(not_moved)?
        != source.parent_identity
    {
        return Err(not_moved(changed()));
    }
    source.verify().map_err(not_moved)?;
    autoreleasepool(|_| {
        let path = path
            .to_str()
            .ok_or_else(|| not_moved("Non-UTF-8 Trash source path"))?;
        let url = NSURL::fileURLWithPath_isDirectory(
            &NSString::from_str(path),
            source.kind == EntryKind::Directory,
        );
        let mut result = None;
        let manager = NSFileManager::new();
        if let Err(error) = manager.trashItemAtURL_resultingItemURL_error(&url, Some(&mut result)) {
            return Err(failed_system_call(source, error));
        }
        let result = result.ok_or_else(|| uncertain("Trash returned no resulting URL", None))?;
        if !result.isFileURL() {
            return Err(uncertain("Trash returned a non-file URL", None));
        }
        let result_path = result
            .path()
            .ok_or_else(|| uncertain("Trash URL has no path", None))?;
        let mut placement = capture_result_with_opener(
            source,
            PathBuf::from(result_path.to_string()),
            open_parent,
        )?;
        // NSURL is declared Send+Sync by objc2-foundation. Retain the actual
        // system result object rather than inventing a new Trash path grant.
        placement.system_url = Some(result);
        Ok(placement)
    })
}

pub(super) fn restore(placement: &TrashPlacement) -> io::Result<()> {
    let Some(directory) = &placement.directory else {
        return restore_restricted_endpoint(placement);
    };
    let old = CString::new(placement.name.as_os_str().as_bytes()).map_err(io::Error::other)?;
    let new =
        CString::new(placement.original_name.as_os_str().as_bytes()).map_err(io::Error::other)?;
    // SAFETY: both borrowed parent descriptors stay live; names are checked
    // single components. Darwin RENAME_EXCL=4 forbids replacing any occupant.
    if unsafe {
        renameatx_np(
            directory.as_raw_fd(),
            old.as_ptr(),
            placement.original_parent.as_raw_fd(),
            new.as_ptr(),
            4,
        )
    } == -1
    {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

pub(super) fn verify_held_location(
    source: &File,
    identity: &same_file::Handle,
    kind: EntryKind,
    expected: &Path,
) -> io::Result<()> {
    use std::os::unix::fs::MetadataExt;
    let metadata = source.try_clone()?.into_std().metadata()?;
    if identity_of(source)? != *identity
        || metadata.nlink() == 0
        || (kind == EntryKind::File && !metadata.is_file())
        || (kind == EntryKind::Directory && !metadata.is_dir())
        || current_path(source)? != expected
    {
        return Err(changed());
    }
    Ok(())
}

pub(super) fn verify_restricted_endpoint(placement: &TrashPlacement) -> io::Result<()> {
    let url = placement.system_url.as_ref().ok_or_else(changed)?;
    if !url.isFileURL()
        || url
            .path()
            .map(|value| PathBuf::from(value.to_string()))
            .as_deref()
            != Some(placement.display_path.as_path())
    {
        return Err(changed());
    }
    verify_held_location(
        &placement.source,
        &placement.identity,
        placement.kind,
        &placement.display_path,
    )
}

fn restore_restricted_endpoint(placement: &TrashPlacement) -> io::Result<()> {
    use std::os::unix::fs::MetadataExt;
    verify_restricted_endpoint(placement)?;
    ensure_absent(&placement.original_parent, &placement.original_name)?;
    let parent_path = current_path(placement.original_parent.as_ref())?;
    let observed = Dir::open_ambient_dir(&parent_path, cap_std::ambient_authority())?;
    if same_file::Handle::from_file(observed.into_std_file())?
        != same_file::Handle::from_file(placement.original_parent.try_clone()?.into_std_file())?
    {
        return Err(changed());
    }
    // FileManager performs copy+delete across volumes. This narrow receipt only
    // proves the retained entity, so do not attempt an unproved cross-volume restore.
    let parent_metadata = placement
        .original_parent
        .try_clone()?
        .into_std_file()
        .metadata()?;
    if parent_metadata.dev() != placement.source.try_clone()?.into_std().metadata()?.dev() {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "Cross-volume Trash restore is not proven",
        ));
    }
    let destination_path = parent_path.join(&placement.original_name);
    let destination = destination_path.to_str().ok_or_else(changed)?;
    verify_restricted_endpoint(placement)?;
    ensure_absent(&placement.original_parent, &placement.original_name)?;
    autoreleasepool(|_| {
        let destination_url = NSURL::fileURLWithPath_isDirectory(
            &NSString::from_str(destination),
            placement.kind == EntryKind::Directory,
        );
        // Apple documents this normal API as failing if dstURL exists. No
        // Replace/remove fallback, privilege request, event-only FD or Trash
        // parent open occurs. TCC may still deny the source URL; preserve that error.
        NSFileManager::new()
            .moveItemAtURL_toURL_error(
                placement.system_url.as_ref().ok_or_else(changed)?,
                &destination_url,
            )
            .map_err(io::Error::other)
    })
}

pub(super) fn verify_restored_location(placement: &TrashPlacement) -> io::Result<()> {
    let path = current_path(placement.original_parent.as_ref())?.join(&placement.original_name);
    verify_held_location(
        &placement.source,
        &placement.identity,
        placement.kind,
        &path,
    )
}

#[cfg(test)]
pub(super) fn trash_with_denied_parent(
    source: &AuthorizedTrashSource,
) -> Result<TrashPlacement, TrashFailure> {
    trash_with_opener(source, |_| {
        Err(io::Error::from(io::ErrorKind::PermissionDenied))
    })
}
