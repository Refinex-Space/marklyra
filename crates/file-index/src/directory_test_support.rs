use crate::IndexError;
use std::{fs, path::Path};

/// A retained Windows capability pins the directory name. Unix permits the
/// move, after which the fixture tests our identity/revision checks.
pub(crate) fn rename_directory(from: &Path, to: &Path) -> bool {
    let moved = directory_move_result(fs::rename(from, to).map_err(IndexError::Io)).is_some();
    if !moved {
        assert!(from.is_dir());
        assert!(!to.exists());
    }
    moved
}

pub(crate) fn directory_move_result<T>(result: Result<T, IndexError>) -> Option<T> {
    if cfg!(windows) {
        match result {
            Err(IndexError::Io(error)) => {
                assert!(matches!(error.raw_os_error(), Some(5 | 32)), "{error}");
                None
            }
            Err(error) => panic!("unexpected directory move failure: {error}"),
            Ok(_) => panic!("retained Windows directory unexpectedly moved"),
        }
    } else {
        Some(result.unwrap())
    }
}
