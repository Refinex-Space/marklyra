use crate::{ExportError, PreparedHtml, MAX_HTML_BYTES};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions, Permissions},
    time::SystemTime,
};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use uuid::Uuid;

struct Snapshot {
    bytes: Vec<u8>,
    modified: Option<SystemTime>,
    permissions: Permissions,
}

/// Construct only after a native save dialog grants this exact destination.
/// The parent directory handle remains authoritative after path substitutions.
pub struct ExportDestination {
    parent: Dir,
    name: PathBuf,
    display_path: PathBuf,
    snapshot: Option<Snapshot>,
}
impl ExportDestination {
    pub fn authorize(path: &Path) -> Result<Self, ExportError> {
        let name = path
            .file_name()
            .filter(|name| !name.is_empty())
            .ok_or(ExportError::InvalidPath)?
            .to_owned();
        let parent_path = fs::canonicalize(path.parent().ok_or(ExportError::InvalidPath)?)?;
        let parent = Dir::open_ambient_dir(&parent_path, ambient_authority())?;
        let display_path = parent_path.join(&name);
        let snapshot = read_snapshot(&parent, Path::new(&name))?;
        if snapshot
            .as_ref()
            .is_some_and(|snapshot| snapshot.permissions.readonly())
        {
            return Err(ExportError::ReadOnly);
        }
        Ok(Self {
            parent,
            name: name.into(),
            display_path,
            snapshot,
        })
    }
    /// Native import requires a new file. A target created before authorization
    /// must not be promoted into an overwrite grant; publication remains no-clobber.
    pub fn authorize_new(path: &Path) -> Result<Self, ExportError> {
        let destination = Self::authorize(path)?;
        if destination.snapshot.is_some() {
            return Err(ExportError::ExternalChange);
        }
        Ok(destination)
    }
    pub fn path(&self) -> &Path {
        &self.display_path
    }
    pub fn write(self, html: &PreparedHtml) -> Result<(), ExportError> {
        self.write_with_precommit(html, || {})
    }
    /// Only accepts bytes produced and validated by a trusted format consumer.
    /// Native authorization remains identical for HTML, raster and converter output.
    pub fn write_bytes(self, bytes: &[u8]) -> Result<(), ExportError> {
        self.write_bytes_with_precommit(bytes, || {})
    }
    fn check_unchanged(&self) -> Result<(), ExportError> {
        let actual =
            read_snapshot(&self.parent, &self.name).map_err(|_| ExportError::ExternalChange)?;
        let matches = match (&self.snapshot, &actual) {
            (None, None) => true,
            (Some(expected), Some(actual)) => {
                expected.bytes == actual.bytes
                    && expected.modified == actual.modified
                    && !actual.permissions.readonly()
            }
            _ => false,
        };
        if matches {
            Ok(())
        } else {
            Err(ExportError::ExternalChange)
        }
    }
    fn write_with_precommit(
        self,
        html: &PreparedHtml,
        precommit: impl FnOnce(),
    ) -> Result<(), ExportError> {
        self.write_bytes_with_precommit(html.as_bytes(), precommit)
    }
    fn write_bytes_with_precommit(
        self,
        bytes: &[u8],
        precommit: impl FnOnce(),
    ) -> Result<(), ExportError> {
        if bytes.is_empty() {
            return Err(ExportError::InvalidText);
        }
        if bytes.len() > MAX_HTML_BYTES {
            return Err(ExportError::TooLarge);
        }
        self.check_unchanged()?;
        let temporary = format!(".marklyra-export-{}", Uuid::new_v4());
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = self.parent.open_with(&temporary, &options)?;
        let result = (|| {
            file.write_all(bytes)?;
            if let Some(snapshot) = &self.snapshot {
                file.set_permissions(snapshot.permissions.clone())?;
            }
            file.sync_all()?;
            drop(file);
            precommit();
            self.check_unchanged()?;
            if self.snapshot.is_some() {
                // Optimistic conflict check, not a filesystem compare-and-swap.
                self.parent.rename(&temporary, &self.parent, &self.name)?;
            } else {
                // Atomic no-clobber publication. Filesystems without hard links
                // fail without exposing partially written output.
                self.parent
                    .hard_link(&temporary, &self.parent, &self.name)
                    .map_err(|error| {
                        if error.kind() == std::io::ErrorKind::AlreadyExists {
                            ExportError::ExternalChange
                        } else {
                            ExportError::Io(error)
                        }
                    })?;
            }
            Ok(())
        })();
        let _ = self.parent.remove_file(&temporary);
        #[cfg(unix)]
        if result.is_ok() {
            let _ = self
                .parent
                .try_clone()
                .map(Dir::into_std_file)
                .and_then(|parent| parent.sync_all());
        }
        result
    }
}
fn read_snapshot(parent: &Dir, name: &Path) -> Result<Option<Snapshot>, ExportError> {
    let metadata = match parent.symlink_metadata(name) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(ExportError::InvalidPath);
    }
    if metadata.len() > MAX_HTML_BYTES as u64 {
        return Err(ExportError::TooLarge);
    }
    let file = parent.open(name)?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_HTML_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_HTML_BYTES {
        return Err(ExportError::TooLarge);
    }
    Ok(Some(Snapshot {
        bytes,
        modified: metadata.modified().ok(),
        permissions: metadata.permissions(),
    }))
}

pub fn suggested_filename(name: &str) -> String {
    let leaf = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let stem = leaf.rsplit_once('.').map_or(leaf, |(stem, _)| stem);
    let stem: String = stem
        .chars()
        .filter(|ch| !ch.is_control() && !"<>:\"|?*".contains(*ch))
        .take(80)
        .collect();
    let stem = stem.trim_matches(['.', ' ']);
    let reserved = matches!(
        stem.to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    );
    format!(
        "{}.html",
        if stem.is_empty() || reserved {
            "Untitled"
        } else {
            stem
        }
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::prepare_html;
    #[test]
    fn new_export_is_utf8_and_existing_target_can_be_replaced() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("中文.html");
        let html = prepare_html("<p>中文 😀</p>").unwrap();
        ExportDestination::authorize(&path)
            .unwrap()
            .write(&html)
            .unwrap();
        assert_eq!(fs::read(&path).unwrap(), html.as_bytes());
        let replacement = prepare_html("<h1>replacement</h1>").unwrap();
        ExportDestination::authorize(&path)
            .unwrap()
            .write(&replacement)
            .unwrap();
        assert_eq!(fs::read(&path).unwrap(), replacement.as_bytes());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn concurrent_new_file_and_existing_changes_are_not_overwritten() {
        for existing in [false, true] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("out.html");
            if existing {
                fs::write(&path, b"old").unwrap();
            }
            let destination = ExportDestination::authorize(&path).unwrap();
            let result =
                destination.write_with_precommit(&prepare_html("<p>ours</p>").unwrap(), || {
                    fs::write(&path, b"external").unwrap();
                });
            assert!(matches!(result, Err(ExportError::ExternalChange)));
            assert_eq!(fs::read(&path).unwrap(), b"external");
            assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
        }
    }
    #[test]
    fn deleted_or_directory_target_is_not_silently_recreated() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(
            ExportDestination::authorize(dir.path()),
            Err(ExportError::InvalidPath)
        ));
        let path = dir.path().join("out.html");
        fs::write(&path, b"old").unwrap();
        let destination = ExportDestination::authorize(&path).unwrap();
        fs::remove_file(&path).unwrap();
        assert!(matches!(
            destination.write(&prepare_html("<p>new</p>").unwrap()),
            Err(ExportError::ExternalChange)
        ));
        assert!(!path.exists());
    }
    #[test]
    fn suggestions_are_leaf_names_and_platform_safe() {
        assert_eq!(suggested_filename("../../中文.md"), "中文.html");
        assert_eq!(suggested_filename("C:\\dir\\CON.txt"), "Untitled.html");
        assert_eq!(suggested_filename("../../"), "Untitled.html");
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_and_read_only_targets_fail_without_touching_destination() {
        use std::os::unix::fs::{symlink, PermissionsExt};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("real.html");
        fs::write(&path, b"old").unwrap();
        symlink(&path, dir.path().join("link.html")).unwrap();
        assert!(matches!(
            ExportDestination::authorize(&dir.path().join("link.html")),
            Err(ExportError::InvalidPath)
        ));
        fs::set_permissions(&path, fs::Permissions::from_mode(0o444)).unwrap();
        assert!(matches!(
            ExportDestination::authorize(&path),
            Err(ExportError::ReadOnly)
        ));
        assert_eq!(fs::read(&path).unwrap(), b"old");
    }
    #[cfg(unix)]
    #[test]
    fn parent_replacement_cannot_redirect_authorized_export() {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let parent = dir.path().join("parent");
        let outside = dir.path().join("outside");
        fs::create_dir(&parent).unwrap();
        fs::create_dir(&outside).unwrap();
        let destination = ExportDestination::authorize(&parent.join("out.html")).unwrap();
        fs::rename(&parent, dir.path().join("moved")).unwrap();
        symlink(&outside, &parent).unwrap();
        destination
            .write(&prepare_html("<p>x</p>").unwrap())
            .unwrap();
        assert!(dir.path().join("moved/out.html").is_file());
        assert!(!outside.join("out.html").exists());
    }
    #[test]
    fn binary_output_uses_the_same_atomic_destination_and_conflict_guard() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("raster.png");
        let png = b"\x89PNG\r\n\x1a\n\0binary";
        ExportDestination::authorize(&path)
            .unwrap()
            .write_bytes(png)
            .unwrap();
        assert_eq!(fs::read(&path).unwrap(), png);
        let destination = ExportDestination::authorize(&path).unwrap();
        let result = destination
            .write_bytes_with_precommit(b"new bytes", || fs::write(&path, b"external").unwrap());
        assert!(matches!(result, Err(ExportError::ExternalChange)));
        assert_eq!(fs::read(&path).unwrap(), b"external");
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn import_new_target_is_no_clobber_before_and_after_authorization() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("import.md");
        assert!(!path.exists());
        fs::write(&path, b"concurrent existing").unwrap();
        assert!(matches!(
            ExportDestination::authorize_new(&path),
            Err(ExportError::ExternalChange)
        ));
        assert_eq!(fs::read(&path).unwrap(), b"concurrent existing");
        let second = dir.path().join("second.md");
        let destination = ExportDestination::authorize_new(&second).unwrap();
        fs::write(&second, b"new after authorization").unwrap();
        assert!(matches!(
            destination.write_bytes(b"imported"),
            Err(ExportError::ExternalChange)
        ));
        assert_eq!(fs::read(&second).unwrap(), b"new after authorization");
    }
}
