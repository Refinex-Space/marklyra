use cap_std::fs::{Dir, File, Metadata};
use std::io::{self, Read};

pub(super) fn reserved_name(name: &str) -> bool {
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    ["con", "prn", "aux", "nul"].contains(&stem.as_str())
        || stem.len() == 4
            && (stem.starts_with("com") || stem.starts_with("lpt"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9')
}
pub(super) fn checked_path(path: &str) -> Result<(), ()> {
    if path.is_empty()
        || path.len() > 4096
        || path.contains(['\\', ':', '%'])
        || path.chars().any(char::is_control)
    {
        return Err(());
    }
    let mut count = 0;
    for part in path.split('/') {
        count += 1;
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.starts_with('.')
            || part.ends_with(['.', ' '])
            || reserved_name(part)
            || part.contains(['<', '>', '"', '|', '?', '*'])
        {
            return Err(());
        }
    }
    if count > 16 {
        return Err(());
    }
    Ok(())
}
pub(super) fn mime(path: &str) -> Option<&'static str> {
    match path.rsplit('.').next()?.to_ascii_lowercase().as_str() {
        "css" => Some("text/css; charset=utf-8"),
        "woff" => Some("font/woff"),
        "woff2" => Some("font/woff2"),
        "ttf" => Some("font/ttf"),
        "otf" => Some("font/otf"),
        "eot" => Some("application/vnd.ms-fontobject"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}
fn denied() -> io::Error {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        "Theme entry changed or is a symbolic link",
    )
}
pub(super) fn same_object(a: &Metadata, b: &Metadata) -> bool {
    if a.is_dir() != b.is_dir() || a.is_file() != b.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use cap_std::fs::MetadataExt;
        if a.dev() != b.dev() || a.ino() != b.ino() {
            return false;
        }
    }
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        // Stable cap-std does not expose by-handle IDs. Relative capability opens remain
        // the authority boundary; these are additional conservative replacement checks.
        if a.creation_time() != b.creation_time() || a.file_attributes() != b.file_attributes() {
            return false;
        }
    }
    true
}
pub(super) fn open_checked(root: &Dir, path: &str) -> io::Result<File> {
    checked_path(path).map_err(|_| denied())?;
    let mut current = root.try_clone()?;
    let mut parts = path.split('/').peekable();
    while let Some(part) = parts.next() {
        let before = current.symlink_metadata(part)?;
        if before.file_type().is_symlink() {
            return Err(denied());
        }
        if parts.peek().is_some() {
            if !before.is_dir() {
                return Err(denied());
            }
            let next = current.open_dir(part)?;
            let after = current.symlink_metadata(part)?;
            if after.file_type().is_symlink()
                || !same_object(&before, &next.dir_metadata()?)
                || !same_object(&before, &after)
            {
                return Err(denied());
            }
            // Retain the validated parent capability even if its ambient path is renamed.
            current = next;
        } else {
            if !before.is_file() {
                return Err(denied());
            }
            let file = current.open(part)?;
            let opened = file.metadata()?;
            let after = current.symlink_metadata(part)?;
            if after.file_type().is_symlink()
                || !same_object(&before, &opened)
                || !same_object(&before, &after)
            {
                return Err(denied());
            }
            return Ok(file);
        }
    }
    Err(denied())
}
pub(super) fn read_asset(root: &Dir, path: &str, limit: usize) -> io::Result<Vec<u8>> {
    let file = open_checked(root, path)?;
    let before = file.metadata()?;
    if before.len() > limit as u64 {
        return Err(io::Error::new(
            io::ErrorKind::FileTooLarge,
            "Theme resource exceeds byte limit",
        ));
    }
    let mut bytes = Vec::with_capacity(before.len() as usize);
    (&file).take(limit as u64 + 1).read_to_end(&mut bytes)?;
    let after = file.metadata()?;
    if bytes.len() > limit
        || bytes.len() as u64 != before.len()
        || before.len() != after.len()
        || before.modified().ok() != after.modified().ok()
        || !same_object(&before, &after)
    {
        return Err(denied());
    }
    Ok(bytes)
}
