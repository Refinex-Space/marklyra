use super::*;

pub(super) fn rename(directory: &Dir, _source: &File, old: &Path, new: &Path) -> io::Result<()> {
    use std::{ffi::CString, os::fd::AsRawFd, os::unix::ffi::OsStrExt};
    extern "C" {
        fn renameatx_np(
            old_fd: i32,
            old: *const i8,
            new_fd: i32,
            new: *const i8,
            flags: u32,
        ) -> i32;
    }
    // Darwin SDK sys/stdio.h: RENAME_EXCL=4, renameatx_np available since 10.12.
    let old = CString::new(old.as_os_str().as_bytes()).map_err(io::Error::other)?;
    let new = CString::new(new.as_os_str().as_bytes()).map_err(io::Error::other)?;
    // SAFETY: the borrowed directory FD stays live and both validated single
    // names are NUL-terminated; RENAME_EXCL never replaces an existing target.
    if unsafe {
        renameatx_np(
            directory.as_raw_fd(),
            old.as_ptr(),
            directory.as_raw_fd(),
            new.as_ptr(),
            4,
        )
    } == 0
    {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}
