//! Bounded directory browsing/search anchored to native-picker capabilities.
//! No frontend-provided absolute path grants access to the filesystem.
mod articles;
mod catalog;
mod counts;
mod creation;
mod duplicate;
mod entry_action;
pub use entry_action::InspectedEntryAction;
mod entry_move;
mod entry_rename;
mod fs_mutation;
mod move_relocation;
mod relocation;
#[cfg(test)]
mod relocation_tests;
mod removal;
mod search;
pub use articles::{
    ArticleSkipped, ArticleTruncation, DocumentSummary, SummaryState, WorkspaceArticlesReport,
    WorkspaceDocument, MAX_SUMMARY_BATCH,
};
pub use catalog::WorkspaceCatalogSnapshot;
pub use counts::DocumentCounts;
pub use creation::{CreatedWorkspaceEntry, CreationRenamePlan};
pub use duplicate::{EntryDuplicateReceipt, EntryDuplicateResolution};
pub use entry_move::{
    EntryMoveCommit, EntryMoveConflictPolicy, EntryMoveDestination, EntryMovePlacement,
    EntryMovePlacementEntry, EntryMovePlan, EntryMovePreparation, EntryMoveReceipt,
    EntryMoveReplacement, EntryMoveResolution, EntryMoveUndo, EntryMoveUndoPlan,
};
pub use entry_rename::{
    EntryRenamePlan, EntryRenamePreparation, EntryRenameReceipt, EntryRenameResolution,
    InspectedWorkspaceEntry,
};
pub use move_relocation::WorkspaceMoveRelocationPlan;
pub use relocation::WorkspaceRelocationPlan;
pub use search::{SearchMatch, SearchOptions, SearchReport, SearchSkipped, SearchTruncation};

use cap_std::{ambient_authority, fs::Dir};
use document_service::{DocumentPayload, DocumentService};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use thiserror::Error;
use uuid::Uuid;

pub const MAX_DIRECTORY_ENTRIES: usize = 10_000;
/// Shared supported suffixes, excluding the separately supported extensionless filenames.
pub const TEXT_EXTENSIONS: &[&str] = &[
    "md",
    "markdown",
    "mkd",
    "mdown",
    "mdtext",
    "mdtxt",
    "mdwn",
    "mdx",
    "mmd",
    "rmd",
    "qmd",
    "rmarkdown",
    "txt",
    "text",
    "apib",
];
const MAX_WORKSPACES: usize = 32;

#[derive(Debug, Error)]
pub enum IndexError {
    #[error("工作区不存在或已关闭，请重新选择目录")]
    UnknownWorkspace,
    #[error("仅允许工作区内的相对路径，不能包含父目录、绝对路径或符号链接")]
    InvalidPath,
    #[error("请选择普通目录")]
    NotDirectory,
    #[error("该文件不是受支持的 Markdown 文档")]
    NotMarkdown,
    #[error("工作区数量已达上限，请先关闭不需要的工作区")]
    TooManyWorkspaces,
    #[error("搜索词必须为 1–256 个字符，且不包含换行或空字符")]
    InvalidQuery,
    #[error("文件操作已执行，但文件或目录身份随后变化；旧写权限必须撤销，请刷新核对或另存当前正文，未自动回滚")]
    MutationUncertain,
    #[error("目录操作失败：{}", document_service::describe_io(.0))]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Document(#[from] document_service::DocumentError),
    #[error("无法编译搜索条件：{0}")]
    Search(#[from] regex::Error),
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspacePayload {
    pub id: String,
    pub name: String,
    pub path: String,
    #[serde(rename = "metadataRevision")]
    pub metadata_revision: u64,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Directory,
    File,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    pub name: String,
    pub relative_path: String,
    pub kind: EntryKind,
    pub size: Option<u64>,
    pub modified_at: Option<i64>,
    pub created_at: Option<i64>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DirectoryTruncation {
    Entries,
}
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListing {
    pub entries: Vec<DirectoryEntry>,
    pub truncated: bool,
    pub skipped: usize,
    pub ignored: usize,
    pub scanned_entries: usize,
    pub truncation_reasons: Vec<DirectoryTruncation>,
}

pub struct Workspace {
    root: Arc<Dir>,
    location: Mutex<WorkspaceLocation>,
    creations: Mutex<creation::CreationStore>,
    duplicates: Mutex<duplicate::DuplicateStore>,
    moves: Mutex<entry_move::MoveStore>,
    entries: Mutex<entry_rename::EntryStore>,
}

struct WorkspaceLocation {
    path: PathBuf,
    revision: u64,
    uncertain: bool,
}
impl WorkspaceLocation {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            revision: 0,
            uncertain: false,
        }
    }
}

#[derive(Default)]
pub struct WorkspaceRegistry {
    workspaces: HashMap<String, Arc<Workspace>>,
}

impl WorkspaceRegistry {
    /// Native snapshot for reporting capability revocations after a file move.
    pub fn ids(&self) -> Vec<String> {
        self.workspaces.keys().cloned().collect()
    }
    /// Restore only a host-owned, identity-verified persisted capability.
    pub fn restore_bookmark(
        &mut self,
        bookmark: &document_service::DirectoryBookmark,
    ) -> Result<WorkspacePayload, IndexError> {
        if self.workspaces.len() >= MAX_WORKSPACES {
            return Err(IndexError::TooManyWorkspaces);
        }
        let root = bookmark.reopen()?;
        let display_root = bookmark.path().to_owned();
        let id = Uuid::new_v4().to_string();
        let payload = WorkspacePayload {
            id: id.clone(),
            name: display_root
                .file_name()
                .unwrap_or(display_root.as_os_str())
                .to_string_lossy()
                .into_owned(),
            path: display_root.to_string_lossy().into_owned(),
            metadata_revision: 0,
        };
        self.workspaces.insert(
            id,
            Arc::new(Workspace {
                root,
                location: Mutex::new(WorkspaceLocation::new(display_root)),
                creations: Mutex::default(),
                duplicates: Mutex::default(),
                moves: Mutex::default(),
                entries: Mutex::default(),
            }),
        );
        Ok(payload)
    }
    /// Caller must obtain this directory through the native picker.
    pub fn select_authorized(&mut self, path: &Path) -> Result<WorkspacePayload, IndexError> {
        self.select_authorized_with_identity(path, None)
    }

    /// A native directory receipt binds the actual retained root capability,
    /// rather than merely checking the selected path before and after opening.
    pub fn select_authorized_entity(
        &mut self,
        path: &Path,
        expected: &same_file::Handle,
    ) -> Result<WorkspacePayload, IndexError> {
        self.select_authorized_with_identity(path, Some(expected))
    }

    fn select_authorized_with_identity(
        &mut self,
        path: &Path,
        expected: Option<&same_file::Handle>,
    ) -> Result<WorkspacePayload, IndexError> {
        if self.workspaces.len() >= MAX_WORKSPACES {
            return Err(IndexError::TooManyWorkspaces);
        }
        let display_root = std::fs::canonicalize(path)?;
        if !display_root.is_dir() {
            return Err(IndexError::NotDirectory);
        }
        let root = Arc::new(Dir::open_ambient_dir(&display_root, ambient_authority())?);
        if let Some(expected) = expected {
            let actual = same_file::Handle::from_file(root.try_clone()?.into_std_file())?;
            if &actual != expected {
                return Err(IndexError::InvalidPath);
            }
        }
        let id = Uuid::new_v4().to_string();
        let payload = WorkspacePayload {
            id: id.clone(),
            name: display_root
                .file_name()
                .unwrap_or(display_root.as_os_str())
                .to_string_lossy()
                .into_owned(),
            path: display_root.to_string_lossy().into_owned(),
            metadata_revision: 0,
        };
        self.workspaces.insert(
            id,
            Arc::new(Workspace {
                root,
                location: Mutex::new(WorkspaceLocation::new(display_root)),
                creations: Mutex::default(),
                duplicates: Mutex::default(),
                moves: Mutex::default(),
                entries: Mutex::default(),
            }),
        );
        Ok(payload)
    }
    /// A short-lived, UI-invisible mount of a directory the host already holds a capability for
    /// (an open document's parent). It never counts against the mount limit and the caller must
    /// `close` it before the operation returns; nothing is persisted or advertised.
    pub fn attach_directory(&mut self, root: Arc<Dir>, display_root: PathBuf) -> WorkspacePayload {
        let id = Uuid::new_v4().to_string();
        let payload = WorkspacePayload {
            id: id.clone(),
            name: display_root
                .file_name()
                .unwrap_or(display_root.as_os_str())
                .to_string_lossy()
                .into_owned(),
            path: display_root.to_string_lossy().into_owned(),
            metadata_revision: 0,
        };
        self.workspaces.insert(
            id,
            Arc::new(Workspace {
                root,
                location: Mutex::new(WorkspaceLocation::new(display_root)),
                creations: Mutex::default(),
                duplicates: Mutex::default(),
                moves: Mutex::default(),
                entries: Mutex::default(),
            }),
        );
        payload
    }
    pub fn get(&self, id: &str) -> Result<Arc<Workspace>, IndexError> {
        self.workspaces
            .get(id)
            .cloned()
            .ok_or(IndexError::UnknownWorkspace)
    }
    pub fn close(&mut self, id: &str) {
        self.workspaces.remove(id);
    }

    /// Denial-only host preflight; a display path never grants IO capability.
    pub fn has_root_within(&self, path: &Path) -> bool {
        !path.is_absolute()
            || self.workspaces.values().any(|workspace| {
                workspace
                    .display_root_snapshot()
                    .map_or(true, |root| root.starts_with(path))
            })
    }

    /// Detect another mount of the exact directory even if its display name is
    /// different. Ancestor aliases still require separate host path preflight.
    pub fn has_root_directory(&self, directory: &Dir) -> Result<bool, IndexError> {
        let expected = same_file::Handle::from_file(directory.try_clone()?.into_std_file())?;
        for workspace in self.workspaces.values() {
            let observed =
                same_file::Handle::from_file(workspace.root.try_clone()?.into_std_file())?;
            if expected == observed {
                return Ok(true);
            }
        }
        Ok(false)
    }
}

impl Workspace {
    /// Display metadata stays attached to the retained directory capability.
    /// Callers must release this short lock before taking any operation store.
    pub fn display_root_binding(&self) -> Result<(PathBuf, u64), IndexError> {
        let location = self
            .location
            .lock()
            .map_err(|_| std::io::Error::other("目录位置状态不可用"))?;
        if location.uncertain {
            return Err(IndexError::MutationUncertain);
        }
        Ok((location.path.clone(), location.revision))
    }

    pub fn display_root_snapshot(&self) -> Result<PathBuf, IndexError> {
        self.display_root_binding().map(|(path, _)| path)
    }

    pub fn display_root_revision(&self) -> Result<u64, IndexError> {
        self.display_root_binding().map(|(_, revision)| revision)
    }

    pub fn metadata(&self, id: &str) -> Result<WorkspacePayload, IndexError> {
        let (path, metadata_revision) = self.display_root_binding()?;
        Ok(WorkspacePayload {
            id: id.to_owned(),
            name: path
                .file_name()
                .unwrap_or(path.as_os_str())
                .to_string_lossy()
                .into_owned(),
            path: path.to_string_lossy().into_owned(),
            metadata_revision,
        })
    }

    pub fn bookmark(&self) -> Result<document_service::DirectoryBookmark, IndexError> {
        Ok(document_service::DirectoryBookmark::capture(
            &self.root,
            &self.display_root_snapshot()?,
        )?)
    }
    pub fn list_directory(&self, relative: &str) -> Result<DirectoryListing, IndexError> {
        self.list_directory_with_extension(relative, None)
    }

    /// Adds one suffix for this operation only; it does not grant filesystem access.
    pub fn list_directory_with_extension(
        &self,
        relative: &str,
        extra: Option<&str>,
    ) -> Result<DirectoryListing, IndexError> {
        self.list_directory_with_extension_and_entry_filter(relative, extra, |_| true)
    }

    /// The host filter receives the opened capability object, never a display path.
    pub fn list_directory_with_extension_and_entry_filter(
        &self,
        relative: &str,
        extra: Option<&str>,
        include_entry: impl Fn(&std::fs::File) -> bool,
    ) -> Result<DirectoryListing, IndexError> {
        self.list_directory_with_filters(relative, include_entry, |name| {
            is_markdown(Path::new(name), extra)
        })
    }

    /// Filter document names before reading content; directory capabilities remain unchanged.
    pub fn list_directory_with_filters(
        &self,
        relative: &str,
        include_entry: impl Fn(&std::fs::File) -> bool,
        include_document: impl Fn(&str) -> bool,
    ) -> Result<DirectoryListing, IndexError> {
        let path = checked_relative(relative, true)?;
        self.display_root_binding()?;
        let mut directory = self.root.try_clone()?;
        for part in path.components() {
            let std::path::Component::Normal(part) = part else {
                continue;
            };
            let name = part.to_str().ok_or(IndexError::InvalidPath)?;
            if ignored_name(name) {
                return Ok(DirectoryListing {
                    ignored: 1,
                    ..DirectoryListing::default()
                });
            }
            let before = directory.symlink_metadata(name)?;
            if before.file_type().is_symlink() {
                return Err(IndexError::InvalidPath);
            }
            let Some(opened) = open_filtered_directory(&directory, name, &before, &include_entry)?
            else {
                return Ok(DirectoryListing {
                    ignored: 1,
                    ..DirectoryListing::default()
                });
            };
            directory = opened;
        }
        let mut result = DirectoryListing::default();
        for (index, entry) in directory.entries()?.enumerate() {
            if index >= MAX_DIRECTORY_ENTRIES {
                result.truncated = true;
                result.truncation_reasons.push(DirectoryTruncation::Entries);
                break;
            }
            result.scanned_entries += 1;
            let Ok(entry) = entry else {
                result.skipped += 1;
                continue;
            };
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                result.skipped += 1;
                continue;
            };
            if checked_relative(name, false).is_err() {
                result.skipped += 1;
                continue;
            }
            if ignored_name(name) {
                result.ignored += 1;
                continue;
            }
            // The enumeration's own metadata: classification costs no extra call per entry.
            let Ok(metadata) = entry.metadata() else {
                result.skipped += 1;
                continue;
            };
            if metadata.file_type().is_symlink() {
                result.skipped += 1;
                continue;
            }
            let relative_path = join_relative(relative, name);
            if checked_relative(&relative_path, false).is_err() {
                result.skipped += 1;
                continue;
            }
            let kind = if metadata.is_dir() {
                EntryKind::Directory
            } else if metadata.is_file() && include_document(name) {
                EntryKind::File
            } else {
                continue;
            };
            let included = if kind == EntryKind::Directory {
                directory_shown(&directory, name, &metadata, &include_entry)
            } else {
                file_visible(&directory, name, &metadata, &include_entry)
            };
            match included {
                Ok(true) => {}
                Ok(false) => {
                    result.ignored += 1;
                    continue;
                }
                Err(_) => {
                    result.skipped += 1;
                    continue;
                }
            }
            let size = if kind == EntryKind::File {
                Some(metadata.len())
            } else {
                None
            };
            result.entries.push(DirectoryEntry {
                name: name.to_owned(),
                relative_path,
                kind,
                size,
                modified_at: articles::epoch_millis(metadata.modified().ok()),
                created_at: articles::epoch_millis(metadata.created().ok()),
            });
        }
        result.entries.sort_by(|a, b| {
            (a.kind != EntryKind::Directory)
                .cmp(&(b.kind != EntryKind::Directory))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(result)
    }

    pub fn open_document(
        &self,
        relative: &str,
        documents: &mut DocumentService,
    ) -> Result<DocumentPayload, IndexError> {
        self.open_document_with_extension(relative, documents, None)
    }

    pub fn open_document_with_extension(
        &self,
        relative: &str,
        documents: &mut DocumentService,
        extra: Option<&str>,
    ) -> Result<DocumentPayload, IndexError> {
        let path = checked_relative(relative, false)?;
        if !is_markdown(&path, extra) {
            return Err(IndexError::NotMarkdown);
        }
        self.reject_symlinks(&path)?;
        Ok(documents.open_in_workspace(
            Arc::clone(&self.root),
            &path,
            self.display_root_snapshot()?.join(&path),
        )?)
    }

    fn reject_symlinks(&self, path: &Path) -> Result<(), IndexError> {
        self.display_root_binding()?;
        if path == Path::new(".") {
            return Ok(());
        }
        let mut prefix = PathBuf::new();
        for part in path.components() {
            prefix.push(part);
            if self
                .root
                .symlink_metadata(&prefix)?
                .file_type()
                .is_symlink()
            {
                return Err(IndexError::InvalidPath);
            }
        }
        Ok(())
    }
}

pub(crate) fn ignored_name(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

/// Windows hides entries by file attributes, which the enumeration already carries.
#[cfg(windows)]
fn hidden_by_attributes(metadata: &cap_std::fs::Metadata) -> bool {
    use cap_std::fs::MetadataExt;
    // FILE_ATTRIBUTE_HIDDEN (0x2) | FILE_ATTRIBUTE_SYSTEM (0x4), as Explorer treats them.
    metadata.file_attributes() & 0x6 != 0
}

/// Whether a file found by enumeration is shown. Windows decides from the attributes of the
/// directory entry itself, so classifying a name costs no system call per file. Other hosts
/// open the entry through its retained parent and ask the host filter, which needs a handle.
pub(crate) fn file_visible(
    directory: &Dir,
    name: &str,
    metadata: &cap_std::fs::Metadata,
    include_entry: &dyn Fn(&std::fs::File) -> bool,
) -> std::io::Result<bool> {
    #[cfg(windows)]
    {
        let _ = (directory, name, include_entry);
        Ok(!hidden_by_attributes(metadata))
    }
    #[cfg(not(windows))]
    {
        let file = directory.open(name)?;
        let opened = file.metadata()?;
        let after = directory.symlink_metadata(name)?;
        if after.file_type().is_symlink()
            || !articles::same_metadata(metadata, &opened)
            || !articles::same_metadata(metadata, &after)
        {
            return Err(std::io::Error::other("File changed during enumeration"));
        }
        Ok(include_entry(&file.into_std()))
    }
}

/// Whether a listed subdirectory is shown, without keeping a handle to it.
pub(crate) fn directory_shown(
    parent: &Dir,
    name: &str,
    metadata: &cap_std::fs::Metadata,
    include_entry: &dyn Fn(&std::fs::File) -> bool,
) -> std::io::Result<bool> {
    #[cfg(windows)]
    {
        let _ = (parent, name, include_entry);
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(std::io::Error::other("Expected a non-symlink directory"));
        }
        Ok(!hidden_by_attributes(metadata))
    }
    #[cfg(not(windows))]
    {
        open_filtered_directory(parent, name, metadata, include_entry)
            .map(|opened| opened.is_some())
    }
}

/// Opens a subdirectory for descent, or reports that the host hides it.
pub(crate) fn directory_visible(
    parent: &Dir,
    name: &str,
    metadata: &cap_std::fs::Metadata,
    include_entry: &dyn Fn(&std::fs::File) -> bool,
) -> std::io::Result<Option<Dir>> {
    #[cfg(windows)]
    {
        let _ = include_entry;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(std::io::Error::other("Expected a non-symlink directory"));
        }
        if hidden_by_attributes(metadata) {
            return Ok(None);
        }
        parent.open_dir(name).map(Some)
    }
    #[cfg(not(windows))]
    {
        open_filtered_directory(parent, name, metadata, include_entry)
    }
}

/// Open relative to the retained parent, verify the same object, then consult host metadata.
pub(crate) fn open_filtered_directory(
    parent: &Dir,
    name: &str,
    before: &cap_std::fs::Metadata,
    include_entry: &dyn Fn(&std::fs::File) -> bool,
) -> std::io::Result<Option<Dir>> {
    if before.file_type().is_symlink() || !before.is_dir() {
        return Err(std::io::Error::other("Expected a non-symlink directory"));
    }
    let directory = parent.open_dir(name)?;
    let after = parent.symlink_metadata(name)?;
    if after.file_type().is_symlink()
        || !articles::same_metadata(before, &directory.dir_metadata()?)
        || !articles::same_metadata(before, &after)
    {
        return Err(std::io::Error::other(
            "Directory changed during enumeration",
        ));
    }
    let handle = directory.try_clone()?.into_std_file();
    Ok(include_entry(&handle).then_some(directory))
}

fn checked_relative(value: &str, allow_root: bool) -> Result<PathBuf, IndexError> {
    if value.is_empty() && allow_root {
        return Ok(PathBuf::from("."));
    }
    if value.is_empty()
        || value.len() > 4096
        || value.contains(['\\', ':', '\0'])
        || value
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err(IndexError::InvalidPath);
    }
    let path = PathBuf::from(value);
    if path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, std::path::Component::Normal(_)))
    {
        return Err(IndexError::InvalidPath);
    }
    Ok(path)
}
fn join_relative(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_owned()
    } else {
        format!("{parent}/{name}")
    }
}
fn is_markdown(path: &Path, extra: Option<&str>) -> bool {
    let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };
    if name.starts_with('.') {
        return false;
    }
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or("");
    extension.is_empty()
        || TEXT_EXTENSIONS
            .iter()
            .any(|supported| extension.eq_ignore_ascii_case(supported))
        || extra.is_some_and(|supported| {
            !supported.is_empty()
                && name.len() > supported.len()
                && name
                    .get(name.len() - supported.len() - 1..)
                    .is_some_and(|suffix| {
                        suffix.starts_with('.') && suffix[1..].eq_ignore_ascii_case(supported)
                    })
        })
}
