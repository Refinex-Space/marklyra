//! NTFS can tunnel the removed target's creation time into a renamed file.
//! Retain and restore the source timestamp through its already-owned handle,
//! so a confirmed rename does not invalidate persisted entity proofs.
use std::{
    ffi::c_void,
    fs::File,
    io,
    os::windows::{fs::MetadataExt, io::AsRawHandle},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WindowsCreationTime(u64);

#[repr(C)]
struct FileTime {
    low: u32,
    high: u32,
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn SetFileTime(
        file: *mut c_void,
        creation: *const FileTime,
        access: *const FileTime,
        write: *const FileTime,
    ) -> i32;
}

impl WindowsCreationTime {
    pub fn capture(file: &File) -> io::Result<Self> {
        Ok(Self(file.metadata()?.creation_time()))
    }

    /// Requires FILE_WRITE_ATTRIBUTES on the retained source handle. A caller
    /// must classify any failure after physical movement as uncertain.
    pub fn restore(self, file: &File) -> io::Result<()> {
        if Self::capture(file)? == self {
            return Ok(());
        }
        let creation = FileTime {
            low: self.0 as u32,
            high: (self.0 >> 32) as u32,
        };
        // SAFETY: only the supplied, live handle is touched; the fixed-layout
        // value outlives the call. Access/write timestamps are not changed.
        if unsafe {
            SetFileTime(
                file.as_raw_handle(),
                &creation,
                std::ptr::null(),
                std::ptr::null(),
            )
        } == 0
        {
            return Err(io::Error::last_os_error());
        }
        if Self::capture(file)? != self {
            return Err(io::Error::other("文件创建时间未能恢复"));
        }
        Ok(())
    }
}
