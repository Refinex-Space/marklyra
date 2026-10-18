use super::*;
use cap_std::fs::OpenOptionsExt;
use std::{
    ffi::c_void,
    os::windows::{ffi::OsStrExt, io::AsRawHandle},
};

pub(crate) fn configure_source(options: &mut OpenOptions) {
    // DELETE + FILE_READ_ATTRIBUTES + FILE_WRITE_ATTRIBUTES + SYNCHRONIZE.
    // The attribute right permits the original extra mtime update. The retained handle,
    // not a later path reopen, is the source of SetFileInformationByHandle.
    options
        .access_mode(0x0011_0180)
        .share_mode(0x7)
        .custom_flags(0x0200_0000 | 0x0020_0000);
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
}
pub(super) fn rename(directory: &Dir, source: &File, new: &Path) -> io::Result<()> {
    // FILE_RENAME_INFO's leading union is zero (ReplaceIfExists=false).
    // RootDirectory is an authorized directory handle; FileName is one name.
    // https://learn.microsoft.com/windows/win32/api/winbase/ns-winbase-file_rename_info
    let name: Vec<u16> = new.as_os_str().encode_wide().collect();
    let offset = std::mem::offset_of!(RenameInfo, name);
    let length = offset + (name.len() + 1) * 2;
    let mut buffer = vec![0usize; length.div_ceil(std::mem::size_of::<usize>())];
    let pointer = buffer.as_mut_ptr().cast::<RenameInfo>();
    // SAFETY: usize storage provides native pointer alignment and enough
    // zeroed bytes for the header, UTF-16 name and trailing NUL. FileNameLength
    // excludes NUL. Both owned capability handles outlive this synchronous call.
    unsafe {
        (*pointer).root_directory = directory.as_raw_handle();
        (*pointer).name_bytes = (name.len() * 2) as u32;
        std::ptr::copy_nonoverlapping(
            name.as_ptr(),
            std::ptr::addr_of_mut!((*pointer).name).cast::<u16>(),
            name.len(),
        );
        if SetFileInformationByHandle(source.as_raw_handle(), 3, pointer.cast(), length as u32) == 0
        {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}
