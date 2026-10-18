use std::fs::File;

/// Classify the already opened, capability-authorized entry. Content is never
/// read here; macOS resolves its current descriptor location after root renames.
pub fn include_entry(file: &File) -> bool {
    #[cfg(target_os = "macos")]
    {
        macos::include_entry(file)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = file;
        true
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::{msg_send, rc::autoreleasepool, runtime::Bool};
    use objc2_foundation::{
        NSString, NSURLIsHiddenKey, NSURLIsPackageKey, NSURLResourceKey, NSURL,
    };
    use std::{
        fs::File,
        os::{fd::AsRawFd, macos::fs::MetadataExt},
    };

    // Verified against this SDK's sys/fcntl.h and sys/stat.h. No new file is
    // opened by this syscall; it reports a live descriptor's current location.
    const F_GETPATH: std::ffi::c_int = 50;
    const UF_HIDDEN: u32 = 0x0000_8000;
    unsafe extern "C" {
        fn fcntl(fd: std::ffi::c_int, command: std::ffi::c_int, ...) -> std::ffi::c_int;
    }

    fn resource_bool(url: &NSURL, key: &NSURLResourceKey) -> Option<bool> {
        let mut value = None;
        // SAFETY: Only Foundation keys documented to return NSNumber are passed.
        // The output retains that object inside the surrounding autorelease pool.
        unsafe { url.getResourceValue_forKey_error(&mut value, key) }.ok()?;
        let value = value?;
        // SAFETY: A successful boolean resource-key query returns NSNumber.
        let result: Bool = unsafe { msg_send![&*value, boolValue] };
        Some(result.as_bool())
    }

    pub(super) fn include_entry(file: &File) -> bool {
        let Ok(metadata) = file.metadata() else {
            return true;
        };
        if metadata.st_flags() & UF_HIDDEN != 0 {
            return false;
        }
        let mut buffer = [0_u8; 1024];
        // SAFETY: The borrowed descriptor stays open; Darwin F_GETPATH writes at
        // most MAXPATHLEN (1024) bytes including its terminator to this buffer.
        if unsafe { fcntl(file.as_raw_fd(), F_GETPATH, buffer.as_mut_ptr()) } == -1 {
            return true;
        }
        let Some(end) = buffer.iter().position(|byte| *byte == 0) else {
            return true;
        };
        let Ok(path) = std::str::from_utf8(&buffer[..end]) else {
            return true;
        };
        autoreleasepool(|_| {
            let path = NSString::from_str(path);
            let url = NSURL::fileURLWithPath_isDirectory(&path, metadata.is_dir());
            // SAFETY: These linked immutable Foundation constants have the
            // NSNumber result contract used by resource_bool.
            if resource_bool(&url, unsafe { NSURLIsHiddenKey }) == Some(true) {
                return false;
            }
            !metadata.is_dir() || resource_bool(&url, unsafe { NSURLIsPackageKey }) != Some(true)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::include_entry;

    #[cfg(target_os = "macos")]
    #[test]
    fn actual_packages_remain_excluded_after_authorized_root_rename() {
        let parent = tempfile::tempdir().unwrap();
        let root = parent.path().join("old");
        std::fs::create_dir(&root).unwrap();
        for name in ["Demo.app", "Document.rtfd"] {
            let path = root.join(name);
            std::fs::create_dir(&path).unwrap();
            let file = std::fs::File::open(path).unwrap();
            assert!(!include_entry(&file), "{name}");
        }
        let held = std::fs::File::open(root.join("Demo.app")).unwrap();
        std::fs::rename(&root, parent.path().join("renamed")).unwrap();
        assert!(!include_entry(&held));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn finder_hidden_files_and_directories_are_excluded_by_real_metadata() {
        let root = tempfile::tempdir().unwrap();
        for (name, directory) in [("HiddenFolder", true), ("Hidden.md", false)] {
            let path = root.path().join(name);
            if directory {
                std::fs::create_dir(&path).unwrap();
            } else {
                std::fs::write(&path, "own hidden fixture").unwrap();
            }
            let result = std::process::Command::new("/usr/bin/chflags")
                .arg("hidden")
                .arg(&path)
                .status()
                .unwrap();
            assert!(result.success());
            let file = std::fs::File::open(&path).unwrap();
            assert!(!include_entry(&file));
        }
    }

    #[test]
    fn ordinary_opened_entries_are_included() {
        let root = tempfile::tempdir().unwrap();
        for name in ["notes.md", "未知文档", "unknown.extension-v18"] {
            let path = root.path().join(name);
            std::fs::write(&path, "own fixture").unwrap();
            assert!(include_entry(&std::fs::File::open(path).unwrap()), "{name}");
        }
        #[cfg(unix)]
        {
            // tempfile's root is dot-prefixed and correctly hidden on macOS.
            let visible = root.path().join("visible-directory");
            std::fs::create_dir(&visible).unwrap();
            assert!(include_entry(&std::fs::File::open(visible).unwrap()));
        }
    }
}
