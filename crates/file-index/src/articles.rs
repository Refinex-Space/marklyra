use crate::{
    checked_relative, directory_visible, file_visible, ignored_name, is_markdown, join_relative,
    IndexError, Workspace,
};
use cap_std::fs::{Dir, Metadata, ReadDir};
use document_service::Encoding;
use serde::Serialize;
use std::{io::Read, path::Path};

const MAX_DOCUMENTS: usize = 400;
/// The metadata index reads no content, so it can list far more documents than a full read.
const MAX_INDEX_DOCUMENTS: usize = 5_000;
const MAX_INDEX_ENTRIES: usize = 100_000;
/// Summaries are requested for the rows being shown, never for the whole workspace.
pub const MAX_SUMMARY_BATCH: usize = 64;
const MAX_SCANNED_FILES: usize = 2_000;
const MAX_SCANNED_ENTRIES: usize = 20_000;
const MAX_DEPTH: usize = 64;
const MAX_READ_BYTES: usize = 2 * 1024 * 1024;
/// Mac fetchFileItems reads 0x320 bytes; Node's separate 601-byte path is not used here.
const PREFIX_BYTES: usize = 800;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDocument {
    pub name: String,
    pub relative_path: String,
    pub folder_name: String,
    pub folder_relative_path: String,
    pub size: u64,
    pub modified_at: Option<i64>,
    pub created_at: Option<i64>,
    /// Strictly decoded raw Markdown prefix, never HTML and never a lossy replacement string.
    pub summary: String,
    pub summary_truncated: bool,
}

/// Outcome of reading one document's summary for a row that became visible.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SummaryState {
    Ready,
    /// The host hides this entry or it is not an eligible document.
    Ignored,
    /// Missing, replaced, a symlink or unreadable now.
    Unavailable,
    Unsupported,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentSummary {
    pub relative_path: String,
    pub state: SummaryState,
    pub size: u64,
    pub modified_at: Option<i64>,
    pub created_at: Option<i64>,
    pub summary: String,
    pub summary_truncated: bool,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArticleSkipped {
    pub symlinks: usize,
    pub unsupported_names: usize,
    pub unreadable: usize,
    pub unsupported_encoding: usize,
    pub ignored: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ArticleTruncation {
    Documents,
    Scan,
    Depth,
    Bytes,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceArticlesReport {
    pub entries: Vec<WorkspaceDocument>,
    pub truncated: bool,
    pub scanned_files: usize,
    pub scanned_entries: usize,
    pub read_bytes: usize,
    pub skipped: ArticleSkipped,
    pub truncation_reasons: Vec<ArticleTruncation>,
}
impl WorkspaceArticlesReport {
    fn truncate(&mut self, reason: ArticleTruncation) {
        self.truncated = true;
        if !self.truncation_reasons.contains(&reason) {
            self.truncation_reasons.push(reason);
        }
    }
}

struct Frame {
    directory: Dir,
    entries: ReadDir,
    relative: String,
    depth: usize,
}
impl Frame {
    fn new(directory: Dir, relative: String, depth: usize) -> std::io::Result<Self> {
        let entries = directory.entries()?;
        Ok(Self {
            directory,
            entries,
            relative,
            depth,
        })
    }
}

impl Workspace {
    /// Enumerates without opening document sessions, obtaining ambient paths, or reading whole files.
    pub fn list_documents(&self) -> Result<WorkspaceArticlesReport, IndexError> {
        self.list_documents_with_entry_filter(|_| true)
    }

    /// A native host may exclude hidden files or package descendants using the actual authorized
    /// entry handle. The callback only queries metadata; it must not read or change its file offset.
    pub fn list_documents_with_entry_filter(
        &self,
        include_entry: impl Fn(&std::fs::File) -> bool,
    ) -> Result<WorkspaceArticlesReport, IndexError> {
        self.list_documents_with_extension_and_entry_filter(None, include_entry)
    }

    pub fn list_documents_with_extension_and_entry_filter(
        &self,
        extra: Option<&str>,
        include_entry: impl Fn(&std::fs::File) -> bool,
    ) -> Result<WorkspaceArticlesReport, IndexError> {
        self.list_documents_filtered(Limits::default(), extra, &include_entry)
    }

    #[cfg(test)]
    fn list_documents_with_limits(
        &self,
        limits: Limits,
    ) -> Result<WorkspaceArticlesReport, IndexError> {
        self.list_documents_filtered(limits, None, &|_| true)
    }

    /// Reads the strictly decoded prefix of at most `MAX_SUMMARY_BATCH` named documents. Every
    /// path is re-resolved through the workspace capability and read exactly like a listing read:
    /// the renderer only chooses which already-listed documents it wants previews for.
    pub fn read_document_summaries_with_filters(
        &self,
        paths: &[String],
        include_entry: impl Fn(&std::fs::File) -> bool,
        include_document: impl Fn(&str) -> bool,
    ) -> Result<Vec<DocumentSummary>, IndexError> {
        if paths.len() > MAX_SUMMARY_BATCH {
            return Err(IndexError::InvalidPath);
        }
        let binding = self.display_root_binding()?;
        let mut budget = MAX_SUMMARY_BATCH * (PREFIX_BYTES + 1);
        let mut folder: Option<(String, Dir)> = None;
        let mut result = Vec::with_capacity(paths.len());
        for path in paths {
            let unavailable = |state| DocumentSummary {
                relative_path: path.clone(),
                state,
                size: 0,
                modified_at: None,
                created_at: None,
                summary: String::new(),
                summary_truncated: false,
            };
            let Ok(checked) = checked_relative(path, false) else {
                result.push(unavailable(SummaryState::Unavailable));
                continue;
            };
            let name = path.rsplit('/').next().unwrap_or("");
            let parent = path.rsplit_once('/').map_or("", |(parent, _)| parent);
            if !include_document(name) {
                result.push(unavailable(SummaryState::Unsupported));
                continue;
            }
            if folder.as_ref().is_none_or(|(known, _)| known != parent) {
                folder = None;
                let mut directory = self.root.try_clone()?;
                let mut hidden = false;
                let mut broken = false;
                for part in checked.parent().into_iter().flat_map(Path::components) {
                    let std::path::Component::Normal(part) = part else {
                        continue;
                    };
                    let Some(part) = part.to_str() else {
                        broken = true;
                        break;
                    };
                    if ignored_name(part) {
                        hidden = true;
                        break;
                    }
                    let opened = directory.symlink_metadata(part).and_then(|metadata| {
                        directory_visible(&directory, part, &metadata, &include_entry)
                    });
                    match opened {
                        Ok(Some(next)) => directory = next,
                        Ok(None) => {
                            hidden = true;
                            break;
                        }
                        Err(_) => {
                            broken = true;
                            break;
                        }
                    }
                }
                if hidden || broken {
                    result.push(unavailable(if hidden {
                        SummaryState::Ignored
                    } else {
                        SummaryState::Unavailable
                    }));
                    continue;
                }
                folder = Some((parent.to_owned(), directory));
            }
            let Some((_, directory)) = folder.as_ref() else {
                continue;
            };
            let Ok(before) = directory.symlink_metadata(name) else {
                result.push(unavailable(SummaryState::Unavailable));
                continue;
            };
            if !before.is_file() || before.file_type().is_symlink() || ignored_name(name) {
                result.push(unavailable(SummaryState::Unavailable));
                continue;
            }
            let read = read_prefix(directory, name, &before, budget, &include_entry);
            budget = budget.saturating_sub(read.bytes_read);
            result.push(match read.result {
                Ok(sample) => DocumentSummary {
                    relative_path: path.clone(),
                    state: SummaryState::Ready,
                    size: sample.metadata.len(),
                    modified_at: epoch_millis(sample.metadata.modified().ok()),
                    created_at: epoch_millis(sample.metadata.created().ok()),
                    summary: sample.text,
                    summary_truncated: sample.truncated,
                },
                Err(ReadError::Ignored) => unavailable(SummaryState::Ignored),
                Err(ReadError::Encoding) => unavailable(SummaryState::Unsupported),
                Err(_) => unavailable(SummaryState::Unavailable),
            });
        }
        if binding != self.display_root_binding()? {
            return Err(IndexError::Io(std::io::Error::other(
                "Workspace moved during summary read",
            )));
        }
        Ok(result)
    }

    pub fn list_documents_with_filters(
        &self,
        include_entry: impl Fn(&std::fs::File) -> bool,
        include_document: impl Fn(&str) -> bool,
    ) -> Result<WorkspaceArticlesReport, IndexError> {
        self.list_documents_filtered_by_type(
            Limits::default(),
            Mode::Full,
            &include_document,
            &include_entry,
        )
    }

    /// Names, sizes and times of every eligible document without reading any content. The
    /// enumeration's own metadata classifies entries (no per-file call on Windows), and
    /// `summary` stays empty until `read_document_summaries_with_filters` fills it for
    /// the rows actually shown.
    pub fn list_document_index_with_filters(
        &self,
        include_entry: impl Fn(&std::fs::File) -> bool,
        include_document: impl Fn(&str) -> bool,
    ) -> Result<WorkspaceArticlesReport, IndexError> {
        self.list_documents_filtered_by_type(
            Limits::index(),
            Mode::Index,
            &include_document,
            &include_entry,
        )
    }
    fn list_documents_filtered(
        &self,
        limits: Limits,
        extra: Option<&str>,
        include_entry: &dyn Fn(&std::fs::File) -> bool,
    ) -> Result<WorkspaceArticlesReport, IndexError> {
        self.list_documents_filtered_by_type(
            limits,
            Mode::Full,
            &|name| is_markdown(Path::new(name), extra),
            include_entry,
        )
    }

    fn list_documents_filtered_by_type(
        &self,
        limits: Limits,
        mode: Mode,
        include_document: &dyn Fn(&str) -> bool,
        include_entry: &dyn Fn(&std::fs::File) -> bool,
    ) -> Result<WorkspaceArticlesReport, IndexError> {
        let display_root = self.display_root_snapshot()?;
        let mut stack = vec![Frame::new(self.root.try_clone()?, String::new(), 0)?];
        let mut result = WorkspaceArticlesReport::default();
        while let Some(frame) = stack.last_mut() {
            let Some(entry) = frame.entries.next() else {
                stack.pop();
                continue;
            };
            if result.scanned_entries >= limits.entries {
                result.truncate(ArticleTruncation::Scan);
                break;
            }
            result.scanned_entries += 1;
            let entry = match entry {
                Ok(value) => value,
                Err(_) => {
                    result.skipped.unreadable += 1;
                    continue;
                }
            };
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                result.skipped.unsupported_names += 1;
                continue;
            };
            if checked_relative(name, false).is_err() {
                result.skipped.unsupported_names += 1;
                continue;
            }
            if ignored_name(name) {
                result.skipped.ignored += 1;
                continue;
            }
            // The enumeration's own metadata: classification costs no extra call per entry on
            // Windows. Every later open re-verifies the entry through its retained parent.
            let before = match entry.metadata() {
                Ok(value) => value,
                Err(_) => {
                    result.skipped.unreadable += 1;
                    continue;
                }
            };
            if before.file_type().is_symlink() {
                result.skipped.symlinks += 1;
                continue;
            }
            let relative = join_relative(&frame.relative, name);
            if checked_relative(&relative, false).is_err() {
                result.skipped.unsupported_names += 1;
                continue;
            }
            if before.is_dir() {
                let opened = directory_visible(&frame.directory, name, &before, include_entry);
                let directory = match opened {
                    Ok(None) => {
                        result.skipped.ignored += 1;
                        continue;
                    }
                    Ok(Some(directory)) => directory,
                    Err(_) => {
                        result.skipped.unreadable += 1;
                        continue;
                    }
                };
                if frame.depth >= limits.depth {
                    result.truncate(ArticleTruncation::Depth);
                    continue;
                }
                match Frame::new(directory, relative, frame.depth + 1) {
                    Ok(child) => stack.push(child),
                    Err(_) => result.skipped.unreadable += 1,
                }
                continue;
            }
            if !before.is_file() || !include_document(name) {
                continue;
            }
            if result.scanned_files >= limits.files {
                result.truncate(ArticleTruncation::Scan);
                break;
            }
            result.scanned_files += 1;
            if mode == Mode::Index {
                match file_visible(&frame.directory, name, &before, include_entry) {
                    Ok(true) => {}
                    Ok(false) => {
                        result.skipped.ignored += 1;
                        continue;
                    }
                    Err(_) => {
                        result.skipped.unreadable += 1;
                        continue;
                    }
                }
                if result.entries.len() >= limits.documents {
                    result.truncate(ArticleTruncation::Documents);
                    break;
                }
                result.entries.push(WorkspaceDocument {
                    name: name.to_owned(),
                    relative_path: relative,
                    folder_name: folder_label(&frame.relative, &display_root),
                    folder_relative_path: frame.relative.clone(),
                    size: before.len(),
                    modified_at: epoch_millis(before.modified().ok()),
                    created_at: epoch_millis(before.created().ok()),
                    summary: String::new(),
                    summary_truncated: false,
                });
                continue;
            }
            let read = read_prefix(
                &frame.directory,
                name,
                &before,
                limits.bytes.saturating_sub(result.read_bytes),
                include_entry,
            );
            result.read_bytes += read.bytes_read;
            let sample = match read.result {
                Ok(sample) => sample,
                Err(ReadError::Budget) => {
                    result.truncate(ArticleTruncation::Bytes);
                    break;
                }
                Err(ReadError::Symlink) => {
                    result.skipped.symlinks += 1;
                    continue;
                }
                Err(ReadError::Io) => {
                    result.skipped.unreadable += 1;
                    continue;
                }
                Err(ReadError::Encoding) => {
                    result.skipped.unsupported_encoding += 1;
                    continue;
                }
                Err(ReadError::Ignored) => {
                    result.skipped.ignored += 1;
                    continue;
                }
            };
            // Only a proven additional eligible result means the document limit cut off results.
            if result.entries.len() >= limits.documents {
                result.truncate(ArticleTruncation::Documents);
                break;
            }
            result.entries.push(WorkspaceDocument {
                name: name.to_owned(),
                relative_path: relative,
                folder_name: folder_label(&frame.relative, &display_root),
                folder_relative_path: frame.relative.clone(),
                size: sample.metadata.len(),
                modified_at: epoch_millis(sample.metadata.modified().ok()),
                created_at: epoch_millis(sample.metadata.created().ok()),
                summary: sample.text,
                summary_truncated: sample.truncated,
            });
        }
        result
            .entries
            .sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
        Ok(result)
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    /// Reads a bounded prefix of every document while enumerating.
    Full,
    /// Enumerates metadata only.
    Index,
}

fn folder_label(relative: &str, display_root: &Path) -> String {
    if relative.is_empty() {
        display_root
            .file_name()
            .unwrap_or(display_root.as_os_str())
            .to_string_lossy()
            .into_owned()
    } else {
        relative.rsplit('/').next().unwrap_or("").to_owned()
    }
}

struct Limits {
    documents: usize,
    files: usize,
    entries: usize,
    depth: usize,
    bytes: usize,
}
impl Limits {
    fn index() -> Self {
        Self {
            documents: MAX_INDEX_DOCUMENTS,
            files: MAX_INDEX_ENTRIES,
            entries: MAX_INDEX_ENTRIES,
            depth: MAX_DEPTH,
            bytes: MAX_READ_BYTES,
        }
    }
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            documents: MAX_DOCUMENTS,
            files: MAX_SCANNED_FILES,
            entries: MAX_SCANNED_ENTRIES,
            depth: MAX_DEPTH,
            bytes: MAX_READ_BYTES,
        }
    }
}
struct Sample {
    metadata: Metadata,
    text: String,
    truncated: bool,
}
enum ReadError {
    Io,
    Symlink,
    Budget,
    Encoding,
    Ignored,
}
struct ReadResult {
    bytes_read: usize,
    result: Result<Sample, ReadError>,
}

fn read_prefix(
    directory: &Dir,
    name: &str,
    before: &Metadata,
    remaining: usize,
    include_entry: &dyn Fn(&std::fs::File) -> bool,
) -> ReadResult {
    read_prefix_with_hook(directory, name, before, remaining, include_entry, || {})
}
fn read_prefix_with_hook(
    directory: &Dir,
    name: &str,
    before: &Metadata,
    remaining: usize,
    include_entry: &dyn Fn(&std::fs::File) -> bool,
    before_open: impl FnOnce(),
) -> ReadResult {
    let mut bytes = Vec::with_capacity(PREFIX_BYTES + 1);
    let result = (|| {
        // Unlike DirEntry::open, this never reopens a Windows parent by an ambient path.
        let current = directory
            .symlink_metadata(name)
            .map_err(|_| ReadError::Io)?;
        if current.file_type().is_symlink() {
            return Err(ReadError::Symlink);
        }
        if !same_metadata(before, &current) {
            return Err(ReadError::Io);
        }
        before_open();
        let file = directory.open(name).map_err(|_| ReadError::Io)?;
        let opened = file.metadata().map_err(|_| ReadError::Io)?;
        if !opened.is_file() || !same_metadata(before, &opened) {
            return Err(ReadError::Io);
        }
        let handle = file.try_clone().map_err(|_| ReadError::Io)?.into_std();
        if !include_entry(&handle) {
            return Err(ReadError::Ignored);
        }
        let wanted = opened.len().min((PREFIX_BYTES + 1) as u64) as usize;
        if wanted > remaining {
            return Err(ReadError::Budget);
        }
        (&file)
            .take(remaining.min(PREFIX_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| ReadError::Io)?;
        let after = directory
            .symlink_metadata(name)
            .map_err(|_| ReadError::Io)?;
        if after.file_type().is_symlink() {
            return Err(ReadError::Symlink);
        }
        if !same_metadata(&opened, &file.metadata().map_err(|_| ReadError::Io)?)
            || !same_metadata(&opened, &after)
        {
            return Err(ReadError::Io);
        }
        let truncated = bytes.len() > PREFIX_BYTES;
        let text = decode_prefix(&bytes[..bytes.len().min(PREFIX_BYTES)], truncated)
            .map_err(|_| ReadError::Encoding)?;
        Ok(Sample {
            metadata: opened,
            text,
            truncated,
        })
    })();
    ReadResult {
        bytes_read: bytes.len(),
        result,
    }
}

fn decode_prefix(bytes: &[u8], truncated: bool) -> Result<String, document_service::DocumentError> {
    let mut end = bytes.len();
    let utf32 = bytes.starts_with(&[0xff, 0xfe, 0, 0]) || bytes.starts_with(&[0, 0, 0xfe, 0xff]);
    let little = bytes.starts_with(&[0xff, 0xfe]);
    if truncated && !utf32 && (little || bytes.starts_with(&[0xfe, 0xff])) {
        end -= (end - 2) % 2;
        if end >= 4 {
            let last = if little {
                u16::from_le_bytes([bytes[end - 2], bytes[end - 1]])
            } else {
                u16::from_be_bytes([bytes[end - 2], bytes[end - 1]])
            };
            if (0xd800..=0xdbff).contains(&last) {
                end -= 2;
            }
        }
    } else if truncated && !utf32 {
        let start = if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
            3
        } else {
            0
        };
        if let Err(error) = std::str::from_utf8(&bytes[start..]) {
            if error.error_len().is_none() {
                end = start + error.valid_up_to();
            }
        }
    }
    Encoding::decode(&bytes[..end]).map(|(_, text)| text)
}

pub(crate) fn same_metadata(a: &Metadata, b: &Metadata) -> bool {
    if a.is_file() != b.is_file()
        || a.is_dir() != b.is_dir()
        || a.len() != b.len()
        || a.modified().ok() != b.modified().ok()
    {
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
        // cap-std exposes by-handle IDs only behind a nightly cfg. Keep Stable builds portable;
        // sandboxed relative opens remain the authority boundary, not these stability hints.
        if a.creation_time() != b.creation_time() || a.file_attributes() != b.file_attributes() {
            return false;
        }
    }
    true
}

pub(super) fn epoch_millis(value: Option<cap_std::time::SystemTime>) -> Option<i64> {
    let value = value?.into_std();
    let millis = match value.duration_since(std::time::UNIX_EPOCH) {
        Ok(duration) => i64::try_from(duration.as_millis()).ok()?,
        Err(error) => -i64::try_from(error.duration().as_nanos().div_ceil(1_000_000)).ok()?,
    };
    (millis.unsigned_abs() <= 9_007_199_254_740_991).then_some(millis)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, sync::Arc};

    fn setup(path: &Path) -> Arc<Workspace> {
        let mut registry = crate::WorkspaceRegistry::default();
        let selected = registry.select_authorized(path).unwrap();
        registry.get(&selected.id).unwrap()
    }

    #[test]
    fn articles_read_real_recursive_prefixes_metadata_and_ignore_hidden_dependencies() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("中文/子目录")).unwrap();
        fs::create_dir_all(root.path().join(".cache")).unwrap();
        fs::create_dir_all(root.path().join("node_modules/pkg")).unwrap();
        fs::write(root.path().join("Root.MD"), "# Title\r\nBody").unwrap();
        fs::write(root.path().join("中文/子目录/学习🙂.markdown"), "中文").unwrap();
        fs::write(root.path().join(".cache/hidden.md"), "hidden").unwrap();
        fs::write(
            root.path().join("node_modules/pkg/dependency.md"),
            "dependency",
        )
        .unwrap();
        fs::write(root.path().join("ignored.bin"), "not markdown").unwrap();
        let report = setup(root.path()).list_documents().unwrap();
        assert!(!report.truncated);
        assert_eq!(report.scanned_files, 2);
        assert_eq!(report.entries.len(), 2);
        assert_eq!(report.skipped.ignored, 2);
        let nested = &report.entries[1];
        assert_eq!(nested.relative_path, "中文/子目录/学习🙂.markdown");
        assert_eq!(nested.folder_relative_path, "中文/子目录");
        assert_eq!(nested.folder_name, "子目录");
        assert_eq!(nested.summary, "中文");
        assert_eq!(nested.size, 6);
        assert!(nested.modified_at.is_some());
        assert!(!nested.summary_truncated);
        assert_eq!(report.entries[0].summary, "# Title\r\nBody");
        assert_eq!(
            fs::read_to_string(root.path().join("Root.MD")).unwrap(),
            "# Title\r\nBody"
        );
    }

    // Windows classifies directories and files by attributes without a handle (see `file_visible`),
    // so the handle callback is a non-Windows host contract.
    #[cfg(not(windows))]
    #[test]
    fn host_directory_filter_prevents_reading_package_descendants() {
        use std::cell::RefCell;
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("package.fixture")).unwrap();
        fs::write(root.path().join("package.fixture/skip.md"), [0xff]).unwrap();
        fs::write(root.path().join("read.md"), "ordinary").unwrap();
        let seen = RefCell::new(Vec::new());
        let result = setup(root.path())
            .list_documents_with_entry_filter(|handle| {
                let metadata = handle.metadata().unwrap();
                seen.borrow_mut().push(metadata.is_dir());
                !metadata.is_dir()
            })
            .unwrap();
        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].relative_path, "read.md");
        assert_eq!(result.scanned_files, 1);
        assert_eq!(result.read_bytes, 8);
        assert_eq!(result.skipped.unsupported_encoding, 0);
        assert_eq!(result.skipped.ignored, 1);
        assert_eq!(seen.borrow().len(), 2);
    }

    #[test]
    fn rejected_open_file_is_ignored_without_reading_or_spending_content_budget() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("flagged.md"), [0xff]).unwrap();
        fs::write(root.path().join("visible.md"), "ordinary").unwrap();
        let workspace = setup(root.path());
        let report = workspace
            .list_documents_with_entry_filter(|handle| handle.metadata().unwrap().len() != 1)
            .unwrap();
        assert_eq!(report.entries.len(), 1);
        assert_eq!(report.entries[0].name, "visible.md");
        assert_eq!(report.scanned_files, 2);
        assert_eq!(report.read_bytes, 8);
        assert_eq!(report.skipped.ignored, 1);
        assert_eq!(report.skipped.unsupported_encoding, 0);
        assert_eq!(report.skipped.unreadable, 0);
        let excluded = workspace
            .list_documents_filtered(
                Limits {
                    bytes: 0,
                    ..Limits::default()
                },
                None,
                &|_| false,
            )
            .unwrap();
        assert_eq!(excluded.skipped.ignored, 2);
        assert_eq!(excluded.read_bytes, 0);
        assert!(!excluded.truncated);
    }

    #[cfg(unix)]
    #[test]
    fn entry_filter_receives_authorized_handles_after_root_rename_and_path_replacement() {
        use std::{
            collections::HashSet,
            os::unix::fs::{symlink, MetadataExt},
        };
        let parent = tempfile::tempdir().unwrap();
        let root = parent.path().join("root");
        let moved = parent.path().join("moved");
        fs::create_dir_all(root.join("nested")).unwrap();
        fs::write(root.join("note.md"), "authorized root").unwrap();
        fs::write(root.join("nested/child.md"), "authorized child").unwrap();
        let expected: HashSet<_> = [
            root.join("note.md"),
            root.join("nested"),
            root.join("nested/child.md"),
        ]
        .into_iter()
        .map(|path| {
            let metadata = fs::metadata(path).unwrap();
            (metadata.dev(), metadata.ino())
        })
        .collect();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("foreign.md"), "outside secret").unwrap();
        let workspace = setup(&root);
        fs::rename(&root, &moved).unwrap();
        symlink(outside.path(), &root).unwrap();
        let seen = std::cell::Cell::new(0);
        let report = workspace
            .list_documents_with_entry_filter(|handle| {
                let metadata = handle.metadata().unwrap();
                assert!(expected.contains(&(metadata.dev(), metadata.ino())));
                seen.set(seen.get() + 1);
                true
            })
            .unwrap();
        assert_eq!(seen.get(), 3);
        assert_eq!(report.entries.len(), 2);
        assert!(report
            .entries
            .iter()
            .all(|entry| entry.summary.starts_with("authorized")));
        assert_eq!(report.skipped.unreadable, 0);
    }

    #[test]
    fn source_byte_limit_keeps_complete_utf8_utf16_and_bom_without_lossy_decoding() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("ascii.md"), "a".repeat(900)).unwrap();
        fs::write(
            root.path().join("utf8.md"),
            format!("{}中tail", "x".repeat(799)),
        )
        .unwrap();
        fs::write(
            root.path().join("bom.md"),
            Encoding::Utf8Bom
                .encode(&format!("{}中tail", "b".repeat(796)))
                .unwrap(),
        )
        .unwrap();
        for (name, encoding) in [
            ("le.md", Encoding::Utf16LeBom),
            ("be.md", Encoding::Utf16BeBom),
        ] {
            fs::write(
                root.path().join(name),
                encoding
                    .encode(&format!("{}😀tail", "y".repeat(398)))
                    .unwrap(),
            )
            .unwrap();
        }
        fs::write(root.path().join("exact.md"), "e".repeat(800)).unwrap();
        for (name, bytes) in [
            ("invalid.md", vec![0xff, 0x80]),
            ("odd.md", vec![0xff, 0xfe, 1]),
            ("surrogate.md", vec![0xfe, 0xff, 0xd8, 0]),
            ("contains-nul.md", vec![b'a', 0]),
            ("utf32.md", vec![0xff, 0xfe, 0, 0, 65, 0, 0, 0]),
        ] {
            fs::write(root.path().join(name), bytes).unwrap();
        }
        let report = setup(root.path()).list_documents().unwrap();
        assert_eq!(report.skipped.unsupported_encoding, 5);
        let entry = |name| {
            report
                .entries
                .iter()
                .find(|entry| entry.name == name)
                .unwrap()
        };
        assert_eq!(entry("ascii.md").summary, "a".repeat(800));
        assert_eq!(entry("utf8.md").summary, "x".repeat(799));
        assert_eq!(entry("bom.md").summary, "b".repeat(796));
        assert_eq!(entry("le.md").summary, "y".repeat(398));
        assert_eq!(entry("be.md").summary, "y".repeat(398));
        assert!(!entry("exact.md").summary_truncated);
        for name in ["ascii.md", "utf8.md", "bom.md", "le.md", "be.md"] {
            assert!(entry(name).summary_truncated);
        }
        assert!(report.read_bytes <= report.scanned_files * (PREFIX_BYTES + 1));
    }

    #[test]
    fn exact_document_limit_does_not_claim_truncation_without_an_additional_valid_result() {
        let root = tempfile::tempdir().unwrap();
        for index in 0..MAX_DOCUMENTS {
            fs::write(root.path().join(format!("{index}.md")), "ok").unwrap();
        }
        fs::write(root.path().join("unsupported.md"), [0xff]).unwrap();
        let workspace = setup(root.path());
        let exact = workspace.list_documents().unwrap();
        assert_eq!(exact.entries.len(), MAX_DOCUMENTS);
        assert_eq!(exact.skipped.unsupported_encoding, 1);
        assert!(!exact.truncated);
        fs::write(root.path().join("extra.md"), "valid extra").unwrap();
        let overflow = workspace.list_documents().unwrap();
        assert_eq!(overflow.entries.len(), MAX_DOCUMENTS);
        assert_eq!(overflow.truncation_reasons, [ArticleTruncation::Documents]);
    }

    #[test]
    fn byte_entry_file_and_depth_limits_report_actual_unvisited_work() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("file.md"), "12345678901").unwrap();
        let workspace = setup(root.path());
        let complete = workspace
            .list_documents_with_limits(Limits {
                entries: 1,
                files: 1,
                ..Limits::default()
            })
            .unwrap();
        assert!(!complete.truncated);
        let bytes = workspace
            .list_documents_with_limits(Limits {
                bytes: 10,
                ..Limits::default()
            })
            .unwrap();
        assert_eq!(bytes.truncation_reasons, [ArticleTruncation::Bytes]);
        assert_eq!(bytes.read_bytes, 0);
        fs::write(root.path().join("second.md"), "second").unwrap();
        for limits in [
            Limits {
                entries: 1,
                ..Limits::default()
            },
            Limits {
                files: 1,
                ..Limits::default()
            },
        ] {
            let result = workspace.list_documents_with_limits(limits).unwrap();
            assert_eq!(result.truncation_reasons, [ArticleTruncation::Scan]);
        }
        fs::create_dir(root.path().join("nested")).unwrap();
        fs::write(root.path().join("nested/deep.md"), "deep").unwrap();
        let deep = workspace
            .list_documents_with_limits(Limits {
                depth: 0,
                ..Limits::default()
            })
            .unwrap();
        assert_eq!(deep.entries.len(), 2);
        assert_eq!(deep.truncation_reasons, [ArticleTruncation::Depth]);
    }

    #[cfg(unix)]
    #[test]
    fn symlink_swaps_and_parent_renames_cannot_read_an_outside_target() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.md"), "outside secret").unwrap();
        fs::write(root.path().join("safe.md"), "inside").unwrap();
        symlink(outside.path(), root.path().join("link")).unwrap();
        symlink(
            outside.path().join("secret.md"),
            root.path().join("linked.md"),
        )
        .unwrap();
        let workspace = setup(root.path());
        let report = workspace.list_documents().unwrap();
        assert_eq!(report.entries.len(), 1);
        assert_eq!(report.skipped.symlinks, 2);
        let before = workspace.root.symlink_metadata("safe.md").unwrap();
        let raced =
            read_prefix_with_hook(&workspace.root, "safe.md", &before, 1000, &|_| true, || {
                fs::rename(root.path().join("safe.md"), root.path().join("old.md")).unwrap();
                symlink(
                    outside.path().join("secret.md"),
                    root.path().join("safe.md"),
                )
                .unwrap();
            });
        assert!(matches!(
            raced.result,
            Err(ReadError::Io | ReadError::Symlink)
        ));
        assert_eq!(raced.bytes_read, 0);
        fs::create_dir(root.path().join("nested")).unwrap();
        fs::write(root.path().join("nested/note.md"), "anchored inside").unwrap();
        let nested = workspace.root.open_dir("nested").unwrap();
        fs::rename(root.path().join("nested"), root.path().join("moved")).unwrap();
        symlink(outside.path(), root.path().join("nested")).unwrap();
        let metadata = nested.symlink_metadata("note.md").unwrap();
        let anchored = read_prefix(&nested, "note.md", &metadata, 1000, &|_| true).result;
        assert_eq!(anchored.ok().unwrap().text, "anchored inside");
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    #[test]
    fn invalid_names_are_counted_without_lossy_aliases() {
        use std::{ffi::OsString, os::unix::ffi::OsStringExt};
        let root = tempfile::tempdir().unwrap();
        fs::write(
            root.path().join(OsString::from_vec(b"bad\xff.md".to_vec())),
            "bad name",
        )
        .unwrap();
        fs::write(root.path().join("good.md"), "good").unwrap();
        let report = setup(root.path()).list_documents().unwrap();
        assert_eq!(report.entries.len(), 1);
        assert_eq!(report.skipped.unsupported_names, 1);
    }

    #[test]
    fn unsupported_relative_names_are_skipped_instead_of_reinterpreted() {
        let root = tempfile::tempdir().unwrap();
        #[cfg(not(windows))]
        fs::write(root.path().join("bad:alias.md"), "invalid IPC name").unwrap();
        fs::write(root.path().join("good.md"), "good").unwrap();
        let report = setup(root.path()).list_documents().unwrap();
        assert_eq!(report.entries.len(), 1);
        #[cfg(not(windows))]
        assert_eq!(report.skipped.unsupported_names, 1);
    }

    #[test]
    fn text_extension_set_is_shared_by_browse_articles_search_and_open() {
        let root = tempfile::tempdir().unwrap();
        let names = [
            "README",
            "a.MD",
            "b.MarkDown",
            "c.mdown",
            "d.mmd",
            "e.text",
            "f.txt",
            "g.rmarkdown",
            "h.mkd",
            "i.mdwn",
            "j.mdtxt",
            "k.rmd",
            "l.qmd",
            "m.mdtext",
            "n.mdx",
            "o.APIB",
        ];
        for name in names {
            fs::write(root.path().join(name), "native extension needle").unwrap();
        }
        for name in ["unsupported.mkdown", ".hidden.md"] {
            fs::write(root.path().join(name), "native extension needle").unwrap();
        }
        let workspace = setup(root.path());
        assert_eq!(
            workspace.list_directory("").unwrap().entries.len(),
            names.len()
        );
        assert_eq!(
            workspace.list_documents().unwrap().entries.len(),
            names.len()
        );
        let report = workspace
            .search(crate::SearchOptions {
                query: "needle",
                case_sensitive: true,
                whole_word: false,
                use_regex: false,
                max_results: 100,
            })
            .unwrap();
        assert_eq!(report.matches.len(), names.len());
        let mut documents = document_service::DocumentService::new();
        for name in names {
            assert_eq!(
                workspace.open_document(name, &mut documents).unwrap().text,
                "native extension needle"
            );
        }
        for name in ["unsupported.mkdown", ".hidden.md"] {
            assert!(matches!(
                workspace.open_document(name, &mut documents),
                Err(IndexError::NotMarkdown)
            ));
        }
    }

    #[test]
    fn absent_creation_time_is_not_replaced_with_modification_time() {
        use cap_std::time::SystemTime;
        assert_eq!(epoch_millis(None), None);
        assert_eq!(
            epoch_millis(Some(SystemTime::from_std(std::time::UNIX_EPOCH))),
            Some(0)
        );
        assert_eq!(
            epoch_millis(Some(SystemTime::from_std(
                std::time::UNIX_EPOCH - std::time::Duration::from_millis(1500)
            ))),
            Some(-1500)
        );
    }

    fn markdown(name: &str) -> bool {
        is_markdown(Path::new(name), None)
    }

    #[test]
    fn index_lists_the_same_documents_without_content_and_summaries_fill_on_demand() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("中文/子目录")).unwrap();
        fs::create_dir_all(root.path().join(".cache")).unwrap();
        fs::create_dir_all(root.path().join("node_modules/pkg")).unwrap();
        fs::write(root.path().join("Root.MD"), "# Title\r\nBody").unwrap();
        fs::write(root.path().join("中文/子目录/学习🙂.markdown"), "中文").unwrap();
        fs::write(root.path().join(".cache/hidden.md"), "hidden").unwrap();
        fs::write(root.path().join("node_modules/pkg/dependency.md"), "x").unwrap();
        fs::write(root.path().join("ignored.bin"), "not markdown").unwrap();
        let workspace = setup(root.path());
        let full = workspace.list_documents().unwrap();
        let index = workspace
            .list_document_index_with_filters(|_| true, markdown)
            .unwrap();
        assert!(!index.truncated);
        assert_eq!(index.read_bytes, 0);
        assert_eq!(index.entries.len(), full.entries.len());
        for (listed, read) in index.entries.iter().zip(&full.entries) {
            assert_eq!(listed.relative_path, read.relative_path);
            assert_eq!(listed.folder_relative_path, read.folder_relative_path);
            assert_eq!(listed.folder_name, read.folder_name);
            assert_eq!(listed.size, read.size);
            assert!(listed.summary.is_empty() && !listed.summary_truncated);
        }
        let paths: Vec<String> = index
            .entries
            .iter()
            .map(|e| e.relative_path.clone())
            .collect();
        let summaries = workspace
            .read_document_summaries_with_filters(&paths, |_| true, markdown)
            .unwrap();
        assert_eq!(summaries.len(), full.entries.len());
        for (summary, read) in summaries.iter().zip(&full.entries) {
            assert_eq!(summary.state, SummaryState::Ready);
            assert_eq!(summary.relative_path, read.relative_path);
            assert_eq!(summary.summary, read.summary);
            assert_eq!(summary.size, read.size);
            assert_eq!(summary.modified_at, read.modified_at);
        }
    }

    #[test]
    fn summaries_resolve_each_path_through_the_capability_and_never_trust_the_renderer() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("a/.private")).unwrap();
        fs::create_dir(root.path().join("a/b")).unwrap();
        fs::write(root.path().join("a/b/ok.md"), "ok").unwrap();
        fs::write(root.path().join("a/.private/secret.md"), "secret").unwrap();
        fs::write(root.path().join("a/.dot.md"), "dot").unwrap();
        fs::write(root.path().join("a/data.bin"), "bin").unwrap();
        fs::write(root.path().join("a/binary.md"), [0xff, 0xfe, 0xfd]).unwrap();
        let workspace = setup(root.path());
        let ask = |paths: &[&str]| {
            let paths: Vec<String> = paths.iter().map(|path| (*path).to_owned()).collect();
            workspace
                .read_document_summaries_with_filters(&paths, |_| true, markdown)
                .unwrap()
                .into_iter()
                .map(|item| (item.state, item.summary))
                .collect::<Vec<_>>()
        };
        assert_eq!(
            ask(&[
                "a/b/ok.md",
                "a/b/ok.md",
                "../outside.md",
                "a//b/ok.md",
                "a\\b\\ok.md",
                "a/missing.md",
                "a/.private/secret.md",
                "a/.dot.md",
                "a/data.bin",
                "a/binary.md",
                "a/b",
            ]),
            vec![
                (SummaryState::Ready, "ok".to_owned()),
                (SummaryState::Ready, "ok".to_owned()),
                (SummaryState::Unavailable, String::new()),
                (SummaryState::Unavailable, String::new()),
                (SummaryState::Unavailable, String::new()),
                (SummaryState::Unavailable, String::new()),
                (SummaryState::Ignored, String::new()),
                (SummaryState::Unsupported, String::new()),
                (SummaryState::Unsupported, String::new()),
                (SummaryState::Unsupported, String::new()),
                (SummaryState::Unavailable, String::new()),
            ]
        );
        let too_many = vec!["a/b/ok.md".to_owned(); MAX_SUMMARY_BATCH + 1];
        assert!(workspace
            .read_document_summaries_with_filters(&too_many, |_| true, markdown)
            .is_err());
    }

    #[test]
    fn index_keeps_far_more_documents_than_a_full_read_and_reports_its_own_limit() {
        let root = tempfile::tempdir().unwrap();
        for index in 0..(MAX_DOCUMENTS + 50) {
            fs::write(root.path().join(format!("n{index:04}.md")), "x").unwrap();
        }
        let workspace = setup(root.path());
        let full = workspace.list_documents().unwrap();
        assert_eq!(full.entries.len(), MAX_DOCUMENTS);
        assert!(full.truncated);
        let index = workspace
            .list_document_index_with_filters(|_| true, markdown)
            .unwrap();
        assert_eq!(index.entries.len(), MAX_DOCUMENTS + 50);
        assert!(!index.truncated);
    }

    #[cfg(windows)]
    #[test]
    fn windows_hidden_and_system_attributes_hide_entries_in_every_listing_without_a_handle() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("shown")).unwrap();
        fs::create_dir(root.path().join("hidden-folder")).unwrap();
        fs::write(root.path().join("shown/ok.md"), "ok").unwrap();
        fs::write(root.path().join("hidden.md"), "hidden").unwrap();
        fs::write(root.path().join("visible.md"), "visible").unwrap();
        fs::write(root.path().join("hidden-folder/inner.md"), "inner").unwrap();
        for name in ["hidden.md", "hidden-folder"] {
            assert!(std::process::Command::new("attrib")
                .arg("+h")
                .arg(root.path().join(name))
                .status()
                .unwrap()
                .success());
        }
        let workspace = setup(root.path());
        let listing = workspace.list_directory("").unwrap();
        let names: Vec<_> = listing.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["shown", "visible.md"]);
        let index = workspace
            .list_document_index_with_filters(|_| panic!("Windows needs no handle"), markdown)
            .unwrap();
        let paths: Vec<_> = index
            .entries
            .iter()
            .map(|e| e.relative_path.as_str())
            .collect();
        assert_eq!(paths, ["shown/ok.md", "visible.md"]);
    }
}
