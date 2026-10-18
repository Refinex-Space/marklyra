use crate::{
    articles::same_metadata, checked_relative, ignored_name, is_markdown, join_relative,
    open_filtered_directory, IndexError, Workspace, MAX_DIRECTORY_ENTRIES,
};
use cap_std::fs::{Dir, Metadata, ReadDir};
use document_service::Encoding;
use regex::RegexBuilder;
use serde::Serialize;
use std::{
    io::Read,
    path::Path,
    time::{Duration, Instant},
};

pub const MAX_SEARCH_FILE_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_SEARCH_FILES: usize = 2000;
const MAX_TOTAL_BYTES: usize = 128 * 1024 * 1024;
const MAX_VISITED_ENTRIES: usize = 20_000;
const MAX_DEPTH: usize = 64;

pub struct SearchOptions<'a> {
    pub query: &'a str,
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub use_regex: bool,
    pub max_results: usize,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub relative_path: String,
    pub line: usize,
    pub column: usize,
    pub match_length: usize,
    /// The source match, bounded to 4096 UTF-16 units; long matches use the fingerprint.
    pub expected_text: Option<String>,
    /// FNV-1a of complete matched UTF-16LE bytes. A stale-location hint, not an authorization token.
    pub match_fingerprint: String,
    /// Complete decoded source fingerprint, preserving line endings and excluding only its BOM.
    pub source_fingerprint: String,
    pub preview: String,
    /// UTF-16 offset/length of the matched text inside `preview`, for result highlighting.
    pub preview_match_start: usize,
    pub preview_match_length: usize,
}
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSkipped {
    /// Compatibility alias of unsupported_encoding; supported UTF-16 is no longer skipped.
    pub non_utf8: usize,
    pub unsupported_encoding: usize,
    pub too_large: usize,
    pub unreadable: usize,
    pub symlinks: usize,
    pub unsupported_names: usize,
    pub ignored: usize,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchTruncation {
    Results,
    Files,
    Entries,
    Directory,
    Depth,
    Bytes,
    Time,
}
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchReport {
    pub matches: Vec<SearchMatch>,
    pub scanned_files: usize,
    pub scanned_entries: usize,
    pub read_bytes: usize,
    pub skipped: SearchSkipped,
    pub truncated: bool,
    pub truncation_reasons: Vec<SearchTruncation>,
}
impl SearchReport {
    fn truncate(&mut self, reason: SearchTruncation) {
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
    scanned_entries: usize,
}
impl Frame {
    fn new(directory: Dir, relative: String, depth: usize) -> std::io::Result<Self> {
        let entries = directory.entries()?;
        Ok(Self {
            directory,
            entries,
            relative,
            depth,
            scanned_entries: 0,
        })
    }
}
struct Limits {
    files: usize,
    entries: usize,
    directory: usize,
    depth: usize,
    bytes: usize,
    duration: Duration,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            files: MAX_SEARCH_FILES,
            entries: MAX_VISITED_ENTRIES,
            directory: MAX_DIRECTORY_ENTRIES,
            depth: MAX_DEPTH,
            bytes: MAX_TOTAL_BYTES,
            duration: Duration::from_secs(3),
        }
    }
}

impl Workspace {
    pub fn search(&self, options: SearchOptions<'_>) -> Result<SearchReport, IndexError> {
        self.search_with_extension(options, None)
    }

    pub fn search_with_extension(
        &self,
        options: SearchOptions<'_>,
        extra: Option<&str>,
    ) -> Result<SearchReport, IndexError> {
        self.search_with_extension_and_entry_filter(options, extra, |_| true)
    }

    /// Metadata filtering happens on actual opened objects before reading or descending.
    pub fn search_with_extension_and_entry_filter(
        &self,
        options: SearchOptions<'_>,
        extra: Option<&str>,
        include_entry: impl Fn(&std::fs::File) -> bool,
    ) -> Result<SearchReport, IndexError> {
        self.search_filtered(options, extra, &include_entry, Limits::default())
    }

    fn search_filtered(
        &self,
        options: SearchOptions<'_>,
        extra: Option<&str>,
        include_entry: &dyn Fn(&std::fs::File) -> bool,
        limits: Limits,
    ) -> Result<SearchReport, IndexError> {
        self.display_root_binding()?;
        if options.query.is_empty()
            || options.query.chars().count() > 256
            || options.query.contains(['\r', '\n', '\0'])
        {
            return Err(IndexError::InvalidQuery);
        }
        let matcher = RegexBuilder::new(&search_pattern(
            options.query,
            options.whole_word,
            options.use_regex,
        ))
        .case_insensitive(!options.case_sensitive)
        .build()?;
        let max_results = options.max_results.clamp(1, 500);
        let started = Instant::now();
        let mut result = SearchReport::default();
        let mut stack = vec![Frame::new(self.root.try_clone()?, String::new(), 0)?];
        'walk: while let Some(frame) = stack.last_mut() {
            let Some(entry) = frame.entries.next() else {
                stack.pop();
                continue;
            };
            let reason = if started.elapsed() >= limits.duration {
                Some(SearchTruncation::Time)
            } else if result.scanned_entries >= limits.entries {
                Some(SearchTruncation::Entries)
            } else if frame.scanned_entries >= limits.directory {
                Some(SearchTruncation::Directory)
            } else {
                None
            };
            if let Some(reason) = reason {
                result.truncate(reason);
                break;
            }
            result.scanned_entries += 1;
            frame.scanned_entries += 1;
            let entry = match entry {
                Ok(entry) => entry,
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
            let before = match frame.directory.symlink_metadata(name) {
                Ok(metadata) => metadata,
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
                let directory =
                    match open_filtered_directory(&frame.directory, name, &before, include_entry) {
                        Ok(Some(directory)) => directory,
                        Ok(None) => {
                            result.skipped.ignored += 1;
                            continue;
                        }
                        Err(_) => {
                            result.skipped.unreadable += 1;
                            continue;
                        }
                    };
                if frame.depth >= limits.depth {
                    result.truncate(SearchTruncation::Depth);
                    continue;
                }
                match Frame::new(directory, relative, frame.depth + 1) {
                    Ok(child) => stack.push(child),
                    Err(_) => result.skipped.unreadable += 1,
                }
                continue;
            }
            if !before.is_file() || !is_markdown(Path::new(name), extra) {
                continue;
            }
            if result.scanned_files >= limits.files {
                result.truncate(SearchTruncation::Files);
                break;
            }
            result.scanned_files += 1;
            let read = read_search_file(
                &frame.directory,
                name,
                &before,
                limits.bytes.saturating_sub(result.read_bytes),
                include_entry,
            );
            result.read_bytes += read.bytes_read;
            let bytes = match read.result {
                Ok(bytes) => bytes,
                Err(ReadFailure::TooLarge) => {
                    result.skipped.too_large += 1;
                    continue;
                }
                Err(ReadFailure::Budget) => {
                    result.truncate(SearchTruncation::Bytes);
                    break;
                }
                Err(ReadFailure::Symlink) => {
                    result.skipped.symlinks += 1;
                    continue;
                }
                Err(ReadFailure::Io) => {
                    result.skipped.unreadable += 1;
                    continue;
                }
                Err(ReadFailure::Ignored) => {
                    result.skipped.ignored += 1;
                    continue;
                }
            };
            let text = match Encoding::decode(&bytes) {
                Ok((_, text)) => text,
                Err(_) => {
                    result.skipped.unsupported_encoding += 1;
                    result.skipped.non_utf8 += 1;
                    continue;
                }
            };
            let mut rest = text.as_str();
            let mut number = 1;
            let mut source_fingerprint = None;
            loop {
                if started.elapsed() >= limits.duration {
                    result.truncate(SearchTruncation::Time);
                    break 'walk;
                }
                let end = rest.find(['\r', '\n']).unwrap_or(rest.len());
                let line = &rest[..end];
                for matched in matcher.find_iter(line) {
                    if started.elapsed() >= limits.duration {
                        result.truncate(SearchTruncation::Time);
                        break 'walk;
                    }
                    // Exactly N results are complete unless an additional match is observed.
                    if result.matches.len() >= max_results {
                        result.truncate(SearchTruncation::Results);
                        break 'walk;
                    }
                    let (preview, preview_match_start, preview_match_length) =
                        preview_with_match(line, matched.start(), matched.as_str());
                    let match_length = matched.as_str().encode_utf16().count();
                    result.matches.push(SearchMatch {
                        relative_path: relative.clone(),
                        line: number,
                        column: line[..matched.start()].encode_utf16().count() + 1,
                        match_length,
                        expected_text: (match_length <= 4096).then(|| matched.as_str().to_owned()),
                        match_fingerprint: match_fingerprint(matched.as_str()),
                        source_fingerprint: source_fingerprint
                            .get_or_insert_with(|| match_fingerprint(&text))
                            .clone(),
                        preview,
                        preview_match_start,
                        preview_match_length,
                    });
                }
                if end == rest.len() {
                    break;
                }
                let newline = if rest[end..].starts_with("\r\n") {
                    2
                } else {
                    1
                };
                rest = &rest[end + newline..];
                number += 1;
            }
        }
        result.matches.sort_by(|a, b| {
            a.relative_path
                .cmp(&b.relative_path)
                .then(a.line.cmp(&b.line))
                .then(a.column.cmp(&b.column))
        });
        Ok(result)
    }
}

fn match_fingerprint(text: &str) -> String {
    let mut hash = 14_695_981_039_346_656_037u64;
    for byte in text.encode_utf16().flat_map(u16::to_le_bytes) {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(1_099_511_628_211);
    }
    format!("{hash:016x}")
}

enum ReadFailure {
    Budget,
    TooLarge,
    Io,
    Symlink,
    Ignored,
}
struct SearchRead {
    bytes_read: usize,
    result: Result<Vec<u8>, ReadFailure>,
}
/// Builds the regex source for one search. Regex mode uses the query verbatim;
/// otherwise the query is escaped to a literal. Whole-word mode (literal only)
/// adds `\b` at the edges whose query character is a word character, so queries
/// like "###" keep matching instead of being made impossible.
fn search_pattern(query: &str, whole_word: bool, use_regex: bool) -> String {
    if use_regex || !whole_word {
        return if use_regex {
            query.to_string()
        } else {
            regex::escape(query)
        };
    }
    let is_word = |character: char| character.is_alphanumeric() || character == '_';
    let mut pattern = String::new();
    if query.chars().next().is_some_and(is_word) {
        pattern.push_str("\\b");
    }
    pattern.push_str(&regex::escape(query));
    if query.chars().last().is_some_and(is_word) {
        pattern.push_str("\\b");
    }
    pattern
}
fn read_search_file(
    directory: &Dir,
    name: &str,
    before: &Metadata,
    remaining: usize,
    include_entry: &dyn Fn(&std::fs::File) -> bool,
) -> SearchRead {
    read_search_file_with_hook(directory, name, before, remaining, include_entry, || {})
}
fn read_search_file_with_hook(
    directory: &Dir,
    name: &str,
    before: &Metadata,
    remaining: usize,
    include_entry: &dyn Fn(&std::fs::File) -> bool,
    before_open: impl FnOnce(),
) -> SearchRead {
    let mut bytes = Vec::new();
    let result = (|| {
        let current = directory
            .symlink_metadata(name)
            .map_err(|_| ReadFailure::Io)?;
        if current.file_type().is_symlink() {
            return Err(ReadFailure::Symlink);
        }
        if !current.is_file() || !same_metadata(before, &current) {
            return Err(ReadFailure::Io);
        }
        before_open();
        let file = directory.open(name).map_err(|_| ReadFailure::Io)?;
        let opened = file.metadata().map_err(|_| ReadFailure::Io)?;
        if !opened.is_file() || !same_metadata(before, &opened) {
            return Err(ReadFailure::Io);
        }
        let handle = file.try_clone().map_err(|_| ReadFailure::Io)?.into_std();
        if !include_entry(&handle) {
            return Err(ReadFailure::Ignored);
        }
        if opened.len() > MAX_SEARCH_FILE_BYTES as u64 {
            return Err(ReadFailure::TooLarge);
        }
        if opened.len() > remaining as u64 {
            return Err(ReadFailure::Budget);
        }
        // A sentinel can detect growth; it still fits the global actual-read budget.
        (&file)
            .take((MAX_SEARCH_FILE_BYTES + 1).min(remaining) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| ReadFailure::Io)?;
        if bytes.len() > MAX_SEARCH_FILE_BYTES {
            return Err(ReadFailure::TooLarge);
        }
        if bytes.len() > remaining {
            return Err(ReadFailure::Budget);
        }
        let after = directory
            .symlink_metadata(name)
            .map_err(|_| ReadFailure::Io)?;
        if after.file_type().is_symlink() {
            return Err(ReadFailure::Symlink);
        }
        if !same_metadata(&opened, &after)
            || !same_metadata(&opened, &file.metadata().map_err(|_| ReadFailure::Io)?)
        {
            return Err(ReadFailure::Io);
        }
        Ok(())
    })();
    SearchRead {
        bytes_read: bytes.len(),
        result: result.map(|()| bytes),
    }
}
/// Builds the line preview plus the UTF-16 offset/length of the matched text
/// inside it. Offsets count the leading "…" so they index the returned string.
fn preview_with_match(line: &str, byte_offset: usize, matched: &str) -> (String, usize, usize) {
    let match_char = line[..byte_offset].chars().count();
    let start_char = match_char.saturating_sub(60);
    // The preview text holds at most 320 chars, so a longer match is clipped.
    let visible = matched.chars().count().min(320 - (match_char - start_char));
    let lead_units: usize = line
        .chars()
        .skip(start_char)
        .take(match_char - start_char)
        .map(|c| c.len_utf16())
        .sum();
    let match_units: usize = matched.chars().take(visible).map(|c| c.len_utf16()).sum();
    let mut chars = line.chars().skip(start_char);
    let text: String = chars.by_ref().take(320).collect();
    let prefix = if start_char > 0 { "…" } else { "" };
    let suffix = if chars.next().is_some() { "…" } else { "" };
    (
        format!("{prefix}{text}{suffix}"),
        usize::from(start_char > 0) + lead_units,
        match_units,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn workspace(path: &Path) -> std::sync::Arc<Workspace> {
        let mut registry = crate::WorkspaceRegistry::default();
        let selected = registry.select_authorized(path).unwrap();
        registry.get(&selected.id).unwrap()
    }

    fn options() -> SearchOptions<'static> {
        SearchOptions {
            query: "needle",
            case_sensitive: true,
            whole_word: false,
            use_regex: false,
            max_results: 20,
        }
    }

    #[test]
    fn search_pattern_modes() {
        assert!(ignored_name("node_modules"));
        assert!(!ignored_name("Node_Modules"));
        assert!(ignored_name(".hidden"));
        assert_eq!(search_pattern("hello world", false, false), "hello world");
        assert_eq!(search_pattern("hello", true, false), r"\bhello\b");
        // 非单词字符边缘不加边界，避免 whole-word 使 "###" 永远无法匹配。
        assert_eq!(search_pattern("###", true, false), r"\#\#\#");
        assert_eq!(search_pattern("a#", true, false), r"\ba\#");
        assert_eq!(search_pattern(r"h\.llo", false, true), r"h\.llo");
        // 正则模式使用原文，不叠加 whole-word 边界。
        assert_eq!(search_pattern("hello", true, true), "hello");
    }

    #[test]
    fn fingerprints_use_complete_utf16le_matches_and_bound_expected_text() {
        assert_eq!(match_fingerprint(""), "cbf29ce484222325");
        assert_eq!(match_fingerprint("a"), "089be207b544f1e4");
        assert_eq!(match_fingerprint("🙂"), "f47a500fb71281b8");
        let root = tempfile::tempdir().unwrap();
        let long = "🙂".repeat(2049);
        std::fs::write(root.path().join("long.md"), &long).unwrap();
        let workspace = workspace(root.path());
        let report = workspace
            .search(SearchOptions {
                query: "🙂+",
                use_regex: true,
                ..options()
            })
            .unwrap();
        let matched = &report.matches[0];
        assert_eq!(matched.match_length, 4098);
        assert_eq!(matched.expected_text, None);
        assert_eq!(matched.match_fingerprint, match_fingerprint(&long));
        let short = workspace
            .search(SearchOptions {
                query: "🙂",
                max_results: 1,
                ..options()
            })
            .unwrap();
        assert_eq!(short.matches[0].expected_text.as_deref(), Some("🙂"));
        assert_eq!(short.matches[0].match_fingerprint, "f47a500fb71281b8");
        assert_eq!(
            short.matches[0].source_fingerprint,
            match_fingerprint(&long)
        );
    }

    #[test]
    fn source_fingerprints_preserve_newlines_and_are_shared_by_all_matches_of_one_source() {
        let root = tempfile::tempdir().unwrap();
        let source = "🙂\r\nneedle needle";
        std::fs::write(root.path().join("source.md"), source).unwrap();
        let report = workspace(root.path()).search(options()).unwrap();
        assert_eq!(report.matches.len(), 2);
        let expected = match_fingerprint(source);
        assert_eq!(expected, "aa5ebc06bb2bab7f");
        assert_eq!(report.matches[0].source_fingerprint, expected);
        assert_eq!(report.matches[1].source_fingerprint, expected);
        assert_ne!(expected, match_fingerprint("🙂\nneedle needle"));
        assert_ne!(expected, report.matches[0].match_fingerprint);
    }

    #[test]
    fn remaining_read_budget_is_enforced_before_loading_file() {
        let temporary = tempfile::tempdir().unwrap();
        std::fs::write(temporary.path().join("note.md"), b"12345").unwrap();
        let directory =
            Dir::open_ambient_dir(temporary.path(), cap_std::ambient_authority()).unwrap();
        let before = directory.symlink_metadata("note.md").unwrap();
        assert!(matches!(
            read_search_file(&directory, "note.md", &before, 4, &|_| true).result,
            Err(ReadFailure::Budget)
        ));
        assert!(
            matches!(read_search_file(&directory, "note.md", &before, 5, &|_| true).result, Ok(bytes) if bytes == b"12345")
        );
    }

    #[test]
    fn exact_result_and_scan_limits_do_not_report_nonexistent_extra_work() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("note.md"), "needle needle").unwrap();
        let workspace = workspace(root.path());
        let exact = workspace
            .search_filtered(
                SearchOptions {
                    max_results: 2,
                    ..options()
                },
                None,
                &|_| true,
                Limits {
                    files: 1,
                    entries: 1,
                    directory: 1,
                    bytes: 13,
                    ..Limits::default()
                },
            )
            .unwrap();
        assert_eq!(exact.matches.len(), 2);
        assert_eq!(exact.read_bytes, 13);
        assert!(!exact.truncated);
        let limited = workspace
            .search(SearchOptions {
                max_results: 1,
                ..options()
            })
            .unwrap();
        assert_eq!(limited.matches.len(), 1);
        assert_eq!(limited.truncation_reasons, [SearchTruncation::Results]);
    }

    #[test]
    fn every_search_budget_has_a_specific_reason() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("note.md"), "needle").unwrap();
        let workspace = workspace(root.path());
        for (limits, reason) in [
            (
                Limits {
                    files: 0,
                    ..Limits::default()
                },
                SearchTruncation::Files,
            ),
            (
                Limits {
                    entries: 0,
                    ..Limits::default()
                },
                SearchTruncation::Entries,
            ),
            (
                Limits {
                    directory: 0,
                    ..Limits::default()
                },
                SearchTruncation::Directory,
            ),
            (
                Limits {
                    bytes: 5,
                    ..Limits::default()
                },
                SearchTruncation::Bytes,
            ),
            (
                Limits {
                    duration: Duration::ZERO,
                    ..Limits::default()
                },
                SearchTruncation::Time,
            ),
        ] {
            let report = workspace
                .search_filtered(options(), None, &|_| true, limits)
                .unwrap();
            assert_eq!(report.truncation_reasons, [reason]);
            assert!(report.matches.is_empty());
            assert_eq!(report.read_bytes, 0);
        }
        std::fs::create_dir(root.path().join("child")).unwrap();
        std::fs::write(root.path().join("child/deep.md"), "needle").unwrap();
        let report = workspace
            .search_filtered(
                options(),
                None,
                &|_| true,
                Limits {
                    depth: 0,
                    ..Limits::default()
                },
            )
            .unwrap();
        assert_eq!(report.truncation_reasons, [SearchTruncation::Depth]);
        assert_eq!(report.matches.len(), 1);
    }

    #[test]
    fn host_rejected_files_do_not_spend_search_read_budget_or_claim_encoding_errors() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("invalid.md"), [0xff]).unwrap();
        let report = workspace(root.path())
            .search_filtered(
                options(),
                None,
                &|_| false,
                Limits {
                    bytes: 0,
                    ..Limits::default()
                },
            )
            .unwrap();
        assert_eq!(report.skipped.ignored, 1);
        assert_eq!(report.skipped.unsupported_encoding, 0);
        assert_eq!(report.read_bytes, 0);
        assert!(!report.truncated);
    }

    #[cfg(unix)]
    #[test]
    fn swapping_a_search_file_to_a_symlink_does_not_read_outside_bytes() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("safe.md"), "inside").unwrap();
        std::fs::write(outside.path().join("secret.md"), "outside secret").unwrap();
        let directory = Dir::open_ambient_dir(root.path(), cap_std::ambient_authority()).unwrap();
        let before = directory.symlink_metadata("safe.md").unwrap();
        let read =
            read_search_file_with_hook(&directory, "safe.md", &before, 100, &|_| true, || {
                std::fs::rename(root.path().join("safe.md"), root.path().join("old.md")).unwrap();
                std::os::unix::fs::symlink(
                    outside.path().join("secret.md"),
                    root.path().join("safe.md"),
                )
                .unwrap();
            });
        assert!(matches!(
            read.result,
            Err(ReadFailure::Io | ReadFailure::Symlink)
        ));
        assert_eq!(read.bytes_read, 0);
    }
}
