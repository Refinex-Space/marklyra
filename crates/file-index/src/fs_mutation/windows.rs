use super::*;
use cap_std::fs::OpenOptionsExt;
use std::{
    ffi::c_void,
    os::windows::{
        ffi::{OsStrExt, OsStringExt},
        fs::OpenOptionsExt as StdOpenOptionsExt,
        io::AsRawHandle,
    },
};

/// FILE_READ_DATA/LIST_DIRECTORY + FILE_READ_ATTRIBUTES + FILE_WRITE_ATTRIBUTES + SYNCHRONIZE. The attribute right permits the
/// original extra mtime update. DELETE is deliberately absent: a retained handle that holds
/// DELETE makes every later cap-std directory open (it shares only READ|WRITE) fail with
/// ERROR_SHARING_VIOLATION, so the entry could no longer be listed, opened or renamed. DELETE is
/// requested only by the short-lived handle in `rename`.
const RETAINED_ACCESS: u32 = 0x0010_0181;
const RENAME_ACCESS: u32 = 0x0011_0180;
const SHARE_ALL: u32 = 0x7;
// FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT.
const ENTRY_FLAGS: u32 = 0x0200_0000 | 0x0020_0000;

pub(crate) fn configure_source(options: &mut OpenOptions) {
    options
        .access_mode(RETAINED_ACCESS)
        .share_mode(SHARE_ALL)
        .custom_flags(ENTRY_FLAGS);
}

#[repr(C)]
struct RenameInfo {
    flags: u32,
    root_directory: *mut c_void,
    name_bytes: u32,
    name: [u16; 1],
}
#[link(name = "kernel32")]
extern "system" {
    fn SetFileInformationByHandle(
        handle: *mut c_void,
        class: i32,
        info: *const c_void,
        length: u32,
    ) -> i32;
    fn GetFinalPathNameByHandleW(
        handle: *mut c_void,
        buffer: *mut u16,
        length: u32,
        flags: u32,
    ) -> u32;
}

/// The current location of an open object, so an operation follows the handle even if its path
/// was renamed since it was opened.
pub(crate) fn final_path(handle: &impl AsRawHandle) -> io::Result<PathBuf> {
    let mut buffer = vec![0u16; 1024];
    loop {
        // SAFETY: the borrowed handle is valid and the buffer length is passed exactly.
        let length = unsafe {
            GetFinalPathNameByHandleW(
                handle.as_raw_handle(),
                buffer.as_mut_ptr(),
                buffer.len() as u32,
                0,
            )
        } as usize;
        if length == 0 {
            return Err(io::Error::last_os_error());
        }
        if length < buffer.len() {
            return Ok(PathBuf::from(std::ffi::OsString::from_wide(
                &buffer[..length],
            )));
        }
        buffer.resize(length + 1, 0);
    }
}

fn single_component(name: &Path) -> io::Result<()> {
    if name.components().count() != 0
        && name
            .components()
            .all(|part| matches!(part, std::path::Component::Normal(_)))
    {
        Ok(())
    } else {
        Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "名称必须是目录内的相对路径",
        ))
    }
}

fn open_by_path(path: &Path, access: u32) -> io::Result<std::fs::File> {
    std::fs::OpenOptions::new()
        .access_mode(access)
        .share_mode(SHARE_ALL)
        .custom_flags(ENTRY_FLAGS)
        .open(path)
}

/// Opens `name` inside `directory` as a retained identity handle that never blocks anyone else:
/// no DELETE access, all share modes.
pub(crate) fn open_retained(directory: &Dir, name: &Path, access: u32) -> io::Result<File> {
    single_component(name)?;
    let path = final_path(directory)?.join(name);
    Ok(File::from_std(open_by_path(&path, access)?))
}

pub(crate) fn retained_access() -> u32 {
    RETAINED_ACCESS
}

/// Renames the object behind `source` to `new` inside `directory`, never replacing a target.
///
/// `SetFileInformationByHandle` rejects a RootDirectory handle (ERROR_INVALID_PARAMETER), so the
/// destination is the directory's own full path plus the new name. The retained handle holds no
/// DELETE right, so a short-lived handle to the same object, verified against it, performs the
/// rename.
pub(super) fn rename(directory: &Dir, source: &File, new: &Path) -> io::Result<()> {
    single_component(new)?;
    let target = final_path(directory)?.join(new);
    let handle = open_by_path(&final_path(source)?, RENAME_ACCESS)?;
    let retained = same_file::Handle::from_file(source.try_clone()?.into_std())?;
    if same_file::Handle::from_file(handle.try_clone()?)? != retained {
        return Err(io::Error::other("条目已被替换，未重命名"));
    }
    set_rename(&handle, &target)
}

pub(crate) fn set_rename(handle: &std::fs::File, target: &Path) -> io::Result<()> {
    let creation = document_service::WindowsCreationTime::capture(handle)?;
    // FILE_RENAME_INFO's leading union is zero (ReplaceIfExists=false) and RootDirectory is null;
    // FileName is the complete destination path.
    // https://learn.microsoft.com/windows/win32/api/winbase/ns-winbase-file_rename_info
    let name: Vec<u16> = target.as_os_str().encode_wide().collect();
    let offset = std::mem::offset_of!(RenameInfo, name);
    let length = offset + (name.len() + 1) * 2;
    let mut buffer = vec![0usize; length.div_ceil(std::mem::size_of::<usize>())];
    let pointer = buffer.as_mut_ptr().cast::<RenameInfo>();
    // SAFETY: usize storage provides native pointer alignment and enough zeroed bytes for the
    // header, UTF-16 name and trailing NUL. FileNameLength excludes NUL. The handle outlives this
    // synchronous call.
    unsafe {
        (*pointer).name_bytes = (name.len() * 2) as u32;
        std::ptr::copy_nonoverlapping(
            name.as_ptr(),
            std::ptr::addr_of_mut!((*pointer).name).cast::<u16>(),
            name.len(),
        );
        if SetFileInformationByHandle(handle.as_raw_handle(), 3, pointer.cast(), length as u32) == 0
        {
            return Err(io::Error::last_os_error());
        }
    }
    creation
        .restore(handle)
        .map_err(|error| io::Error::other(super::CommittedRenameError(error)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creation_restore_failure_after_a_real_rename_is_marked_committed() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.md");
        let target = temp.path().join("target.md");
        let backup = temp.path().join("backup.md");
        std::fs::write(&source, b"source").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&target, b"target").unwrap();
        std::fs::rename(&target, &backup).unwrap();
        // DELETE + READ_ATTRIBUTES + SYNCHRONIZE permits rename, but deliberately
        // omits WRITE_ATTRIBUTES so timestamp repair cannot silently succeed.
        let handle = open_by_path(&source, 0x0011_0080).unwrap();
        let before = document_service::WindowsCreationTime::capture(&handle).unwrap();
        let result = set_rename(&handle, &target);
        assert!(!source.exists());
        assert_eq!(std::fs::read(&target).unwrap(), b"source");
        assert_eq!(std::fs::read(&backup).unwrap(), b"target");
        let after = document_service::WindowsCreationTime::capture(&handle).unwrap();
        match result {
            Err(error) => {
                assert!(super::super::rename_was_committed(&error));
                assert_ne!(before, after);
            }
            // Filesystems without creation-time tunneling need no repair.
            Ok(()) => assert_eq!(before, after),
        }
        assert!(!super::super::rename_was_committed(
            &io::Error::from_raw_os_error(32)
        ));
    }
}
