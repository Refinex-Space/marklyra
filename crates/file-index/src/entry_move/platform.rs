use super::*;

pub(super) fn rename_between(
    source_directory: &Dir,
    source: &File,
    old: &Path,
    destination_directory: &Dir,
    new: &Path,
) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use std::{
            ffi::CString,
            os::{fd::AsRawFd, unix::ffi::OsStrExt},
        };
        unsafe extern "C" {
            fn renameatx_np(
                old_fd: i32,
                old: *const i8,
                new_fd: i32,
                new: *const i8,
                flags: u32,
            ) -> i32;
        }
        let old = CString::new(old.as_os_str().as_bytes()).map_err(io::Error::other)?;
        let new = CString::new(new.as_os_str().as_bytes()).map_err(io::Error::other)?;
        let _ = source;
        // SAFETY: both retained directory FDs and single-component C names
        // outlive this call. Darwin RENAME_EXCL=4 never replaces a target.
        if unsafe {
            renameatx_np(
                source_directory.as_raw_fd(),
                old.as_ptr(),
                destination_directory.as_raw_fd(),
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
    #[cfg(windows)]
    {
        // The existing Windows primitive names the source by retained DELETE
        // handle and accepts the destination's authorized RootDirectory.
        let _ = source_directory;
        crate::fs_mutation::rename_exclusive(destination_directory, source, old, new)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (source_directory, source, old, destination_directory, new);
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "当前系统尚无经过验证的跨父排他移动实现",
        ))
    }
}
#[cfg(target_os = "macos")]
fn preserve_creation_time(source: &File, destination: &File) -> io::Result<()> {
    use std::os::{fd::AsRawFd, macos::fs::MetadataExt};
    #[repr(C)]
    struct AttributeList {
        count: u16,
        reserved: u16,
        common: u32,
        volume: u32,
        directory: u32,
        file: u32,
        fork: u32,
    }
    #[repr(C)]
    struct Timespec {
        seconds: i64,
        nanoseconds: i64,
    }
    unsafe extern "C" {
        fn fsetattrlist(
            fd: i32,
            attributes: *mut AttributeList,
            buffer: *mut Timespec,
            length: usize,
            options: u32,
        ) -> i32;
    }
    let metadata = source.try_clone()?.into_std().metadata()?;
    let mut creation = Timespec {
        seconds: metadata.st_birthtime(),
        nanoseconds: metadata.st_birthtime_nsec(),
    };
    let mut attributes = AttributeList {
        count: 5,
        reserved: 0,
        common: 0x200,
        volume: 0,
        directory: 0,
        file: 0,
        fork: 0,
    };
    // SAFETY: sys/attr.h defines ATTR_CMN_CRTIME=0x200 and a single timespec
    // payload. Both fixed-layout mutable structures and the FD remain live.
    if unsafe {
        fsetattrlist(
            destination.as_raw_fd(),
            &mut attributes,
            &mut creation,
            std::mem::size_of::<Timespec>(),
            0,
        )
    } == 0
    {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

pub(super) fn different_volume(source: &Dir, destination: &Dir) -> io::Result<bool> {
    #[cfg(unix)]
    {
        use cap_std::fs::MetadataExt;
        Ok(source.dir_metadata()?.dev() != destination.dir_metadata()?.dev())
    }
    #[cfg(windows)]
    {
        use std::{ffi::c_void, os::windows::io::AsRawHandle};
        #[repr(C)]
        #[derive(Default)]
        struct FileTime {
            low: u32,
            high: u32,
        }
        #[repr(C)]
        #[derive(Default)]
        struct Information {
            attributes: u32,
            creation: FileTime,
            access: FileTime,
            write: FileTime,
            volume: u32,
            size_high: u32,
            size_low: u32,
            links: u32,
            index_high: u32,
            index_low: u32,
        }
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetFileInformationByHandle(
                handle: *mut c_void,
                information: *mut Information,
            ) -> i32;
        }
        let volume = |directory: &Dir| -> io::Result<u32> {
            let mut information = Information::default();
            // SAFETY: the fixed-layout Win32 structure and retained directory
            // handle remain live throughout this read-only system call.
            if unsafe { GetFileInformationByHandle(directory.as_raw_handle(), &mut information) }
                == 0
            {
                Err(io::Error::last_os_error())
            } else {
                Ok(information.volume)
            }
        };
        Ok(volume(source)? != volume(destination)?)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (source, destination);
        Err(io::ErrorKind::Unsupported.into())
    }
}
pub(super) fn open_for_move(directory: &Dir, name: &Path, kind: EntryKind) -> io::Result<File> {
    #[cfg(windows)]
    {
        use cap_std::fs::{OpenOptions, OpenOptionsExt};
        let mut options = OpenOptions::new();
        options.read(true);
        crate::fs_mutation::configure_source(&mut options);
        // Existing rename inspections need DELETE/attributes only. Move's
        // stable byte verification also needs FILE_READ_DATA/LIST_DIRECTORY.
        options.access_mode(0x0011_0181);
        let _ = kind;
        directory.open_with(name, &options)
    }
    #[cfg(not(windows))]
    {
        open_entity(directory, name, kind)
    }
}
pub(super) fn require_copy_support() -> io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "本平台尚无经过验证的保元数据跨卷移动实现，未改动源或目标",
        ))
    }
}
pub(super) fn copy_all(source: &File, destination: &File, kind: EntryKind) -> io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        use std::io::{Seek, SeekFrom};
        use std::os::fd::AsRawFd;
        unsafe extern "C" {
            fn fcopyfile(
                source: i32,
                destination: i32,
                state: *mut std::ffi::c_void,
                flags: u32,
            ) -> i32;
        }
        // copyfile.h: ACL|STAT|XATTR plus DATA for files. Directory metadata is
        // applied after its children, preserving permissions, times and forks.
        let flags = if kind == EntryKind::File { 15 } else { 7 };
        if kind == EntryKind::File {
            source.try_clone()?.seek(SeekFrom::Start(0))?;
            destination.try_clone()?.seek(SeekFrom::Start(0))?;
        }
        // SAFETY: owned source/destination FDs remain live; a null state asks
        // libSystem to manage its own copy state. No path is reopened here.
        if unsafe {
            fcopyfile(
                source.as_raw_fd(),
                destination.as_raw_fd(),
                std::ptr::null_mut(),
                flags,
            )
        } == 0
        {
            preserve_creation_time(source, destination)
        } else {
            let error = io::Error::last_os_error();
            Err(io::Error::new(
                error.kind(),
                format!("fcopyfile {kind:?}: {error}"),
            ))
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (source, destination, kind);
        require_copy_support()
    }
}
pub(super) fn sync_directory(directory: &Dir) -> io::Result<()> {
    #[cfg(unix)]
    {
        directory.try_clone()?.into_std_file().sync_all()
    }
    #[cfg(not(unix))]
    {
        let _ = directory;
        Ok(())
    }
}

#[derive(Clone, PartialEq, Eq)]
pub(super) struct ExtraMetadata {
    #[cfg(target_os = "macos")]
    attributes: std::collections::BTreeMap<Vec<u8>, Vec<u8>>,
    #[cfg(target_os = "macos")]
    acl: Vec<u8>,
}
pub(super) fn extra_metadata(file: &File) -> io::Result<ExtraMetadata> {
    #[cfg(target_os = "macos")]
    {
        use std::{ffi::CString, os::fd::AsRawFd};
        unsafe extern "C" {
            fn flistxattr(fd: i32, list: *mut i8, size: usize, options: i32) -> isize;
            fn fgetxattr(
                fd: i32,
                name: *const i8,
                value: *mut std::ffi::c_void,
                size: usize,
                position: u32,
                options: i32,
            ) -> isize;
            fn acl_get_fd(fd: i32) -> *mut std::ffi::c_void;
            fn acl_to_text(acl: *mut std::ffi::c_void, length: *mut isize) -> *mut i8;
            fn acl_free(value: *mut std::ffi::c_void) -> i32;
        }
        const MAX_ATTRIBUTES: usize = 2 * 1024 * 1024;
        let fd = file.as_raw_fd();
        // SAFETY: size probes have null buffers; read buffers are allocated to
        // exactly that bounded length and remain live for the synchronous call.
        let length = unsafe { flistxattr(fd, std::ptr::null_mut(), 0, 0) };
        if length < 0 {
            return Err(io::Error::last_os_error());
        }
        if length as usize > MAX_ATTRIBUTES {
            return Err(io::Error::other("扩展属性超过安全迁移上限"));
        }
        let mut names = vec![0u8; length as usize];
        let read = unsafe { flistxattr(fd, names.as_mut_ptr().cast(), names.len(), 0) };
        if read != length {
            return Err(io::Error::other("扩展属性列表在检查时变化"));
        }
        let mut attributes = std::collections::BTreeMap::new();
        let mut total = 0usize;
        for name in names
            .split(|byte| *byte == 0)
            .filter(|name| !name.is_empty())
        {
            let cname = CString::new(name).map_err(io::Error::other)?;
            let length = unsafe { fgetxattr(fd, cname.as_ptr(), std::ptr::null_mut(), 0, 0, 0) };
            if length < 0 {
                return Err(io::Error::last_os_error());
            }
            total = total
                .checked_add(length as usize)
                .ok_or_else(|| io::Error::other("扩展属性大小溢出"))?;
            if total > MAX_ATTRIBUTES {
                return Err(io::Error::other("扩展属性超过安全迁移上限"));
            }
            let mut value = vec![0u8; length as usize];
            let read = unsafe {
                fgetxattr(
                    fd,
                    cname.as_ptr(),
                    value.as_mut_ptr().cast(),
                    value.len(),
                    0,
                    0,
                )
            };
            if read != length {
                return Err(io::Error::other("扩展属性在检查时变化"));
            }
            attributes.insert(name.to_vec(), value);
        }
        // ACL text is copied from retained descriptors and released with the
        // API's matching allocator; verification includes more than mode bits.
        let native_acl = unsafe { acl_get_fd(fd) };
        if native_acl.is_null() {
            let error = io::Error::last_os_error();
            if matches!(error.raw_os_error(), Some(2 | 93)) {
                return Ok(ExtraMetadata {
                    attributes,
                    acl: vec![],
                });
            }
            return Err(error);
        }
        let mut length = 0isize;
        let native_text = unsafe { acl_to_text(native_acl, &mut length) };
        if native_text.is_null() {
            let error = io::Error::last_os_error();
            unsafe {
                acl_free(native_acl);
            }
            return Err(error);
        }
        let acl = if length < 0 || length as usize > MAX_ATTRIBUTES {
            Err(io::Error::other("ACL超过安全迁移上限"))
        } else {
            // SAFETY: acl_to_text allocated the bounded buffer and reported
            // its length. It remains live until the paired frees below.
            Ok(
                unsafe { std::slice::from_raw_parts(native_text.cast::<u8>(), length as usize) }
                    .to_vec(),
            )
        };
        unsafe {
            acl_free(native_text.cast());
            acl_free(native_acl);
        }
        Ok(ExtraMetadata {
            attributes,
            acl: acl?,
        })
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = file;
        Ok(ExtraMetadata {})
    }
}
