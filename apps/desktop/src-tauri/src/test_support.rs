use std::{fs, path::Path};

/// Exercise the actual OS contract: Windows pins live capability directories;
/// Unix permits movement and the caller then verifies identity-based rejection.
pub(crate) fn rename_retained_directory(from: &Path, to: &Path) -> bool {
    let result = fs::rename(from, to);
    if cfg!(windows) {
        let error = result.expect_err("Windows must reject moving a pinned directory");
        assert!(matches!(error.raw_os_error(), Some(5 | 32)), "{error}");
        assert!(from.is_dir());
        assert!(!to.exists());
        false
    } else {
        result.unwrap();
        true
    }
}
