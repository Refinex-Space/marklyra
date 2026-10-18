use crate::DocumentError;
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(crate) fn normalize_selected_path(path: &Path) -> Result<PathBuf, DocumentError> {
    if path.exists() {
        return Ok(fs::canonicalize(path)?);
    }
    let name = path.file_name().ok_or(DocumentError::InvalidPath)?;
    let parent = path.parent().ok_or(DocumentError::InvalidPath)?;
    Ok(fs::canonicalize(parent)?.join(name))
}
