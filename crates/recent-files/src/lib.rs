//! Durable recent-file grants. Renderer commands use record IDs, never paths.
mod rename;
mod storage;
pub use rename::{RecentRenamePlan, RecentRenameReport};

use cap_std::fs::Dir;
use serde::{Deserialize, Serialize};
use std::{
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
use uuid::Uuid;

pub const MAX_ENTRIES: usize = 32;
pub const MAX_STORE_BYTES: usize = 256 * 1024;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Error)]
pub enum RecentError {
    #[error("最近文件记录正在被另一进程更新，请稍后重试")]
    Busy,
    #[error("最近文件记录损坏或版本不受支持；可在最近文件中明确清空列表以重置，原文件不会删除")]
    Corrupt,
    #[error("最近文件记录已被移除，请重新选择文件")]
    UnknownEntry,
    #[error("最近文件路径已变更、是符号链接或不是普通文件，请通过打开对话框重新选择")]
    InvalidPath,
    #[error("最近文件路径不是有效的 Unicode 或超过大小限制")]
    UnsupportedPath,
    #[error("最近文件元数据超过大小限制；既有列表未改写")]
    TooLarge,
    #[error("最近文件列表操作失败：{0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecentEntry {
    pub id: String,
    pub path: String,
    pub name: String,
    pub last_opened_at: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecentListing {
    pub revision: u64,
    pub entries: Vec<RecentEntry>,
}

pub struct RecentFiles {
    disk: storage::Disk,
    origin: Uuid,
}
/// A fresh directory capability and one filename, granted only after an opaque
/// recent record has resolved and its recorded canonical path has been checked.
pub struct RecentTarget {
    pub directory: Arc<Dir>,
    pub name: PathBuf,
    pub display_path: PathBuf,
}
impl RecentFiles {
    /// `root` is chosen by trusted app-data code, never renderer input.
    pub fn open(root: &Path) -> Result<Self, RecentError> {
        Ok(Self {
            disk: storage::Disk::open(root)?,
            origin: Uuid::new_v4(),
        })
    }
    pub fn list(&self) -> Result<RecentListing, RecentError> {
        self.disk.transaction(|disk| disk.read())
    }
    /// Call only with an existing DocumentService session's authorized path.
    /// No file content or previous document ID is retained in this list.
    pub fn remember_authorized(&self, path: &Path) -> Result<RecentEntry, RecentError> {
        validate_path(path)?;
        let path = path
            .to_str()
            .ok_or(RecentError::UnsupportedPath)?
            .to_owned();
        self.disk.transaction(|disk| {
            let mut listing = disk.read()?;
            let prior = listing
                .entries
                .iter()
                .position(|entry| entry.path == path)
                .map(|index| listing.entries.remove(index));
            let entry = RecentEntry {
                id: prior.map_or_else(|| Uuid::new_v4().to_string(), |entry| entry.id),
                name: Path::new(&path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or(RecentError::UnsupportedPath)?
                    .to_owned(),
                path,
                last_opened_at: now(),
            };
            listing.entries.insert(0, entry.clone());
            listing.entries.truncate(MAX_ENTRIES);
            advance(&mut listing)?;
            disk.write(&listing)?;
            Ok(entry)
        })
    }

    /// Native-only metadata migration after the host has verified a real rename.
    /// Both paths come from that receipt, never renderer input. An absent old
    /// record stays absent (including after clear); this is not another remember.
    /// Preserve its opaque ID, relative order and last-opened time, removing a
    /// stale destination record if both names were already in the manifest.
    pub fn rename_authorized_if_recorded(
        &self,
        old_path: &Path,
        new_path: &Path,
    ) -> Result<bool, RecentError> {
        validate_path(old_path)?;
        validate_path(new_path)?;
        let old_path = old_path.to_str().ok_or(RecentError::UnsupportedPath)?;
        let new_path = new_path.to_str().ok_or(RecentError::UnsupportedPath)?;
        let new_name = Path::new(new_path)
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(RecentError::UnsupportedPath)?;
        self.disk.transaction(|disk| {
            let mut listing = disk.read()?;
            let Some(old) = listing.entries.iter().find(|entry| entry.path == old_path) else {
                return Ok(false);
            };
            if old_path == new_path {
                return Ok(false);
            }
            let id = old.id.clone();
            listing.entries.retain(|entry| entry.path != new_path);
            let entry = listing
                .entries
                .iter_mut()
                .find(|entry| entry.id == id)
                .ok_or(RecentError::Corrupt)?;
            entry.path = new_path.to_owned();
            entry.name = new_name.to_owned();
            advance(&mut listing)?;
            disk.write(&listing)?;
            Ok(true)
        })
    }
    pub fn remove(&self, id: &str) -> Result<RecentListing, RecentError> {
        validate_id(id)?;
        self.disk.transaction(|disk| {
            let mut listing = disk.read()?;
            let length = listing.entries.len();
            listing.entries.retain(|entry| entry.id != id);
            if listing.entries.len() != length {
                advance(&mut listing)?;
                disk.write(&listing)?;
            }
            Ok(listing)
        })
    }
    /// Explicitly clears references only. A corrupt manifest is preserved as the
    /// bounded last corrupt backup, and is never silently overwritten by remember.
    pub fn clear(&self) -> Result<RecentListing, RecentError> {
        self.disk.transaction(|disk| {
            let mut listing = match disk.read() {
                Ok(listing) => listing,
                Err(RecentError::Corrupt) => {
                    disk.quarantine()?;
                    RecentListing::default()
                }
                Err(error) => return Err(error),
            };
            listing.entries.clear();
            advance(&mut listing)?;
            disk.write(&listing)?;
            Ok(listing)
        })
    }
    pub fn resolve(&self, id: &str) -> Result<RecentTarget, RecentError> {
        validate_id(id)?;
        let path = self.disk.transaction(|disk| {
            disk.read()?
                .entries
                .into_iter()
                .find(|entry| entry.id == id)
                .map(|entry| PathBuf::from(entry.path))
                .ok_or(RecentError::UnknownEntry)
        })?;
        target(&path)
    }
}
fn target(path: &Path) -> Result<RecentTarget, RecentError> {
    validate_path(path)?;
    // A moved/replaced symlink is not an implicit new grant. A native picker can
    // explicitly authorize its new destination; a recent ID cannot do so.
    if std::fs::canonicalize(path)? != path {
        return Err(RecentError::InvalidPath);
    }
    let parent = path.parent().ok_or(RecentError::InvalidPath)?;
    let directory = Arc::new(Dir::open_ambient_dir(parent, cap_std::ambient_authority())?);
    if std::fs::canonicalize(parent)? != parent {
        return Err(RecentError::InvalidPath);
    }
    let name = PathBuf::from(path.file_name().ok_or(RecentError::InvalidPath)?);
    let metadata = directory.symlink_metadata(&name)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(RecentError::InvalidPath);
    }
    Ok(RecentTarget {
        directory,
        name,
        display_path: path.to_owned(),
    })
}
pub(crate) fn validate_path(path: &Path) -> Result<(), RecentError> {
    if !path.is_absolute()
        || path.file_name().is_none()
        || path
            .components()
            .any(|part| matches!(part, Component::ParentDir | Component::CurDir))
    {
        return Err(RecentError::InvalidPath);
    }
    let text = path.to_str().ok_or(RecentError::UnsupportedPath)?;
    if text.len() > 4096 || text.contains('\0') {
        return Err(RecentError::UnsupportedPath);
    }
    Ok(())
}
pub(crate) fn validate_id(id: &str) -> Result<(), RecentError> {
    if Uuid::parse_str(id).is_ok_and(|value| value.to_string() == id) {
        Ok(())
    } else {
        Err(RecentError::UnknownEntry)
    }
}
pub(crate) fn validate(listing: &RecentListing) -> Result<(), RecentError> {
    if listing.entries.len() > MAX_ENTRIES || listing.revision > MAX_SAFE_INTEGER {
        return Err(RecentError::Corrupt);
    }
    let mut ids = std::collections::HashSet::new();
    let mut paths = std::collections::HashSet::new();
    for entry in &listing.entries {
        if validate_id(&entry.id).is_err()
            || validate_path(Path::new(&entry.path)).is_err()
            || entry.name
                != Path::new(&entry.path)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("")
            || !ids.insert(&entry.id)
            || !paths.insert(&entry.path)
            || entry.last_opened_at > MAX_SAFE_INTEGER
        {
            return Err(RecentError::Corrupt);
        }
    }
    Ok(())
}
fn advance(listing: &mut RecentListing) -> Result<(), RecentError> {
    listing.revision = listing
        .revision
        .checked_add(1)
        .filter(|revision| *revision <= MAX_SAFE_INTEGER)
        .ok_or(RecentError::Corrupt)?;
    Ok(())
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(MAX_SAFE_INTEGER as u128) as u64
}
