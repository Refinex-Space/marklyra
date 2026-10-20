use crate::{
    articles::same_metadata, checked_relative, directory_visible, ignored_name, is_markdown,
    join_relative, IndexError, Workspace,
};
use cap_std::fs::{Dir, Metadata, ReadDir};
use document_service::Encoding;
use regex::{Regex, RegexBuilder};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    io::Read,
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant},
};

pub const MAX_SEARCH_FILE_BYTES: usize = 2 * 1024 * 1024;
/// Candidate documents considered by one search. A vault is expected to fit comfortably.
pub const MAX_SEARCH_FILES: usize = 200_000;
/// Matches returned by one search. Results are sorted by path, so this keeps the first ones.
pub const MAX_SEARCH_RESULTS: usize = 20_000;
const MAX_TOTAL_BYTES: usize = 4 * 1024 * 1024 * 1024;
const MAX_VISITED_ENTRIES: usize = 1_000_000;
const MAX_SEARCH_DIRECTORY_ENTRIES: usize = 200_000;
const MAX_DEPTH: usize = 64;
/// A safety net against pathological trees, not a budget a normal search should ever meet.
const MAX_SEARCH_TIME: Duration = Duration::from_secs(30);
const MAX_WORKERS: usize = 8;
const LINE_CHECK_INTERVAL: usize = 1024;

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
    /// The caller withdrew the search (for example because the query changed).
    Cancelled,
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

type EntryFilter<'a> = &'a (dyn Fn(&std::fs::File) -> bool + Sync);

struct Frame {
    directory: Arc<Dir>,
    entries: ReadDir,
    relative: String,
    depth: usize,
    scanned_entries: usize,
}
impl Frame {
    fn new(directory: Arc<Dir>, relative: String, depth: usize) -> std::io::Result<Self> {
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
/// A document found by the walk, to be read and matched by a worker.
struct Candidate {
    directory: Arc<Dir>,
    name: String,
    relative: String,
    metadata: Metadata,
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
            directory: MAX_SEARCH_DIRECTORY_ENTRIES,
            depth: MAX_DEPTH,
            bytes: MAX_TOTAL_BYTES,
            duration: MAX_SEARCH_TIME,
        }
    }
}

/// What a worker found in one file. Outcomes are merged in path order, so the visible result
/// is the same no matter which worker finished first.
#[derive(Default)]
struct FileOutcome {
    matches: Vec<SearchMatch>,
    bytes_read: usize,
    too_large: usize,
    unreadable: usize,
    symlinks: usize,
    ignored: usize,
    unsupported_encoding: usize,
    /// Set when this file made the search stop early.
    stop: Option<SearchTruncation>,
}

struct Shared<'a> {
    candidates: &'a [Candidate],
    matcher: &'a Regex,
    literal: bool,
    include_entry: EntryFilter<'a>,
    started: Instant,
    duration: Duration,
    byte_budget: usize,
    max_matches: usize,
    next: AtomicUsize,
    used: AtomicUsize,
    stop: AtomicBool,
    cancel: &'a AtomicBool,
}
impl Shared<'_> {
    fn halted(&self) -> bool {
        self.stop.load(Ordering::Relaxed) || self.cancel.load(Ordering::Relaxed)
    }
    fn expired(&self) -> bool {
        self.started.elapsed() >= self.duration
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
        include_entry: impl Fn(&std::fs::File) -> bool + Sync,
    ) -> Result<SearchReport, IndexError> {
        self.search_filtered(options, extra, &include_entry, Limits::default())
    }

    pub fn search_with_filters(
        &self,
        options: SearchOptions<'_>,
        include_entry: impl Fn(&std::fs::File) -> bool + Sync,
        include_document: impl Fn(&str) -> bool,
    ) -> Result<SearchReport, IndexError> {
        self.search_with_cancel(
            options,
            include_entry,
            include_document,
            &AtomicBool::new(false),
        )
    }

    /// Like `search_with_filters`, but stops promptly once `cancel` is set. A cancelled search
    /// returns what it had merged so far, marked `Cancelled`.
    pub fn search_with_cancel(
        &self,
        options: SearchOptions<'_>,
        include_entry: impl Fn(&std::fs::File) -> bool + Sync,
        include_document: impl Fn(&str) -> bool,
        cancel: &AtomicBool,
    ) -> Result<SearchReport, IndexError> {
        self.search_filtered_by_type(
            options,
            &include_document,
            &include_entry,
            Limits::default(),
            cancel,
        )
    }
    fn search_filtered(
        &self,
        options: SearchOptions<'_>,
        extra: Option<&str>,
        include_entry: EntryFilter<'_>,
        limits: Limits,
    ) -> Result<SearchReport, IndexError> {
        self.search_filtered_by_type(
            options,
            &|name| is_markdown(Path::new(name), extra),
            include_entry,
            limits,
            &AtomicBool::new(false),
        )
    }

    fn search_filtered_by_type(
        &self,
        options: SearchOptions<'_>,
        include_document: &dyn Fn(&str) -> bool,
        include_entry: EntryFilter<'_>,
        limits: Limits,
        cancel: &AtomicBool,
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
        let max_results = options.max_results.clamp(1, MAX_SEARCH_RESULTS);
        let started = Instant::now();
        let mut result = SearchReport::default();
        let mut candidates = self.collect_candidates(
            include_document,
            include_entry,
            &limits,
            started,
            cancel,
            &mut result,
        )?;
        // Path order makes the merged result (and any cut at the result limit) deterministic.
        candidates.sort_by(|a, b| a.relative.cmp(&b.relative));
        let shared = Shared {
            candidates: &candidates,
            matcher: &matcher,
            // A query without line breaks cannot span lines, so the whole text can be scanned at
            // once. Regular expressions keep their per-line meaning (`\s`, `[^x]`, anchors).
            literal: !options.use_regex,
            include_entry,
            started,
            duration: limits.duration,
            byte_budget: limits.bytes,
            max_matches: max_results.saturating_add(1),
            next: AtomicUsize::new(0),
            used: AtomicUsize::new(0),
            stop: AtomicBool::new(false),
            cancel,
        };
        run_workers(&shared, max_results, &mut result);
        Ok(result)
    }

    /// Walks the tree once, on the calling thread, and returns the documents to search. Entry
    /// classification uses the metadata the enumeration already carries.
    fn collect_candidates(
        &self,
        include_document: &dyn Fn(&str) -> bool,
        include_entry: EntryFilter<'_>,
        limits: &Limits,
        started: Instant,
        cancel: &AtomicBool,
        result: &mut SearchReport,
    ) -> Result<Vec<Candidate>, IndexError> {
        let mut candidates = Vec::new();
        let mut stack = vec![Frame::new(
            Arc::new(self.root.try_clone()?),
            String::new(),
            0,
        )?];
        while let Some(frame) = stack.last_mut() {
            let Some(entry) = frame.entries.next() else {
                stack.pop();
                continue;
            };
            let reason = if cancel.load(Ordering::Relaxed) {
                Some(SearchTruncation::Cancelled)
            } else if started.elapsed() >= limits.duration {
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
            let before = match entry.metadata() {
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
                    match directory_visible(&frame.directory, name, &before, include_entry) {
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
                match Frame::new(Arc::new(directory), relative, frame.depth + 1) {
                    Ok(child) => stack.push(child),
                    Err(_) => result.skipped.unreadable += 1,
                }
                continue;
            }
            if !before.is_file() || !include_document(name) {
                continue;
            }
            if candidates.len() >= limits.files {
                result.truncate(SearchTruncation::Files);
                break;
            }
            candidates.push(Candidate {
                directory: Arc::clone(&frame.directory),
                name: name.to_owned(),
                relative,
                metadata: before,
            });
        }
        Ok(candidates)
    }
}

/// Reads and matches the candidates on a small pool and merges the outcomes in path order.
fn run_workers(shared: &Shared<'_>, max_results: usize, result: &mut SearchReport) {
    let total = shared.candidates.len();
    if total == 0 {
        return;
    }
    let workers = std::thread::available_parallelism()
        .map_or(4, usize::from)
        .clamp(1, MAX_WORKERS)
        .min(total);
    let (sender, receiver) = mpsc::channel::<(usize, FileOutcome)>();
    std::thread::scope(|scope| {
        for _ in 0..workers {
            let sender = sender.clone();
            scope.spawn(move || {
                while !shared.halted() {
                    let index = shared.next.fetch_add(1, Ordering::Relaxed);
                    let Some(candidate) = shared.candidates.get(index) else {
                        break;
                    };
                    if sender
                        .send((index, search_file(shared, candidate)))
                        .is_err()
                    {
                        break;
                    }
                }
            });
        }
        drop(sender);
        let mut pending = BTreeMap::new();
        let mut expected = 0;
        'merge: while expected < total {
            let Ok((index, outcome)) = receiver.recv() else {
                break;
            };
            pending.insert(index, outcome);
            while let Some(outcome) = pending.remove(&expected) {
                expected += 1;
                result.scanned_files += 1;
                result.read_bytes += outcome.bytes_read;
                result.skipped.too_large += outcome.too_large;
                result.skipped.unreadable += outcome.unreadable;
                result.skipped.symlinks += outcome.symlinks;
                result.skipped.ignored += outcome.ignored;
                result.skipped.unsupported_encoding += outcome.unsupported_encoding;
                result.skipped.non_utf8 += outcome.unsupported_encoding;
                for matched in outcome.matches {
                    // Exactly N results are complete unless an additional match is observed.
                    if result.matches.len() >= max_results {
                        result.truncate(SearchTruncation::Results);
                        break 'merge;
                    }
                    result.matches.push(matched);
                }
                if let Some(reason) = outcome.stop {
                    result.truncate(reason);
                    break 'merge;
                }
            }
        }
        if expected < total && !result.truncated {
            // The workers ran out before every file was merged: the caller withdrew the search.
            result.truncate(SearchTruncation::Cancelled);
        }
        shared.stop.store(true, Ordering::Relaxed);
        // Dropping the receiver lets any worker blocked on a late send finish.
        drop(receiver);
    });
}

fn search_file(shared: &Shared<'_>, candidate: &Candidate) -> FileOutcome {
    let mut outcome = FileOutcome::default();
    if shared.expired() {
        outcome.stop = Some(SearchTruncation::Time);
        return outcome;
    }
    let remaining = shared
        .byte_budget
        .saturating_sub(shared.used.load(Ordering::Relaxed));
    let read = read_search_file(
        &candidate.directory,
        &candidate.name,
        &candidate.metadata,
        remaining,
        shared.include_entry,
    );
    shared.used.fetch_add(read.bytes_read, Ordering::Relaxed);
    outcome.bytes_read = read.bytes_read;
    let bytes = match read.result {
        Ok(bytes) => bytes,
        Err(ReadFailure::TooLarge) => {
            outcome.too_large += 1;
            return outcome;
        }
        Err(ReadFailure::Budget) => {
            outcome.stop = Some(SearchTruncation::Bytes);
            return outcome;
        }
        Err(ReadFailure::Symlink) => {
            outcome.symlinks += 1;
            return outcome;
        }
        Err(ReadFailure::Io) => {
            outcome.unreadable += 1;
            return outcome;
        }
        Err(ReadFailure::Ignored) => {
            outcome.ignored += 1;
            return outcome;
        }
    };
    let text = match Encoding::decode(&bytes) {
        Ok((_, text)) => text,
        Err(_) => {
            outcome.unsupported_encoding += 1;
            return outcome;
        }
    };
    drop(bytes);
    let found = if shared.literal {
        match_text(shared, candidate, &text, &mut outcome)
    } else {
        match_lines(shared, candidate, &text, &mut outcome)
    };
    if !found {
        outcome.stop = Some(if shared.cancel.load(Ordering::Relaxed) {
            SearchTruncation::Cancelled
        } else {
            SearchTruncation::Time
        });
    }
    outcome
}

/// Where a match sits: its line number, the line itself and the match inside it.
struct Hit<'a> {
    number: usize,
    line: &'a str,
    start: usize,
    matched: &'a str,
}

fn push_match(
    outcome: &mut FileOutcome,
    candidate: &Candidate,
    text: &str,
    source_fingerprint: &mut Option<String>,
    hit: Hit<'_>,
) {
    let (preview, preview_match_start, preview_match_length) =
        preview_with_match(hit.line, hit.start, hit.matched);
    let match_length = hit.matched.encode_utf16().count();
    outcome.matches.push(SearchMatch {
        relative_path: candidate.relative.clone(),
        line: hit.number,
        column: hit.line[..hit.start].encode_utf16().count() + 1,
        match_length,
        expected_text: (match_length <= 4096).then(|| hit.matched.to_owned()),
        match_fingerprint: match_fingerprint(hit.matched),
        source_fingerprint: source_fingerprint
            .get_or_insert_with(|| match_fingerprint(text))
            .clone(),
        preview,
        preview_match_start,
        preview_match_length,
    });
}

/// Scans the whole text in one pass (literal queries cannot cross a line break) and resolves
/// line numbers only for the matches. Returns false when the time limit stopped it.
fn match_text(
    shared: &Shared<'_>,
    candidate: &Candidate,
    text: &str,
    outcome: &mut FileOutcome,
) -> bool {
    let bytes = text.as_bytes();
    let mut source_fingerprint = None;
    // `line_start` is the offset of the line holding `scanned`; counting resumes from there.
    let (mut number, mut line_start, mut scanned) = (1usize, 0usize, 0usize);
    let (mut line_end_of, mut line_end) = (usize::MAX, 0usize);
    for (count, matched) in shared.matcher.find_iter(text).enumerate() {
        if count % 256 == 255 && (shared.expired() || shared.halted()) {
            return false;
        }
        if outcome.matches.len() >= shared.max_matches {
            return true;
        }
        let mut index = scanned;
        while index < matched.start() {
            match bytes[index] {
                b'\n' => {
                    number += 1;
                    line_start = index + 1;
                }
                b'\r' => {
                    if bytes.get(index + 1) == Some(&b'\n') && index + 1 < matched.start() {
                        index += 1;
                    }
                    number += 1;
                    line_start = index + 1;
                }
                _ => {}
            }
            index += 1;
        }
        scanned = matched.start();
        if line_end_of != line_start {
            line_end_of = line_start;
            line_end = bytes[matched.start()..]
                .iter()
                .position(|byte| matches!(byte, b'\r' | b'\n'))
                .map_or(bytes.len(), |offset| matched.start() + offset);
        }
        push_match(
            outcome,
            candidate,
            text,
            &mut source_fingerprint,
            Hit {
                number,
                line: &text[line_start..line_end],
                start: matched.start() - line_start,
                matched: matched.as_str(),
            },
        );
    }
    true
}

/// Matches a regular expression line by line, as the user wrote it. Returns false when the
/// time limit stopped it.
fn match_lines(
    shared: &Shared<'_>,
    candidate: &Candidate,
    text: &str,
    outcome: &mut FileOutcome,
) -> bool {
    let mut rest = text;
    let mut number = 1;
    let mut source_fingerprint = None;
    loop {
        if number % LINE_CHECK_INTERVAL == 0 && (shared.expired() || shared.halted()) {
            return false;
        }
        let end = rest.find(['\r', '\n']).unwrap_or(rest.len());
        let line = &rest[..end];
        for matched in shared.matcher.find_iter(line) {
            if outcome.matches.len() >= shared.max_matches {
                return true;
            }
            push_match(
                outcome,
                candidate,
                text,
                &mut source_fingerprint,
                Hit {
                    number,
                    line,
                    start: matched.start(),
                    matched: matched.as_str(),
                },
            );
        }
        if end == rest.len() {
            return true;
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
    fn places(report: &SearchReport) -> Vec<(String, usize, usize)> {
        report
            .matches
            .iter()
            .map(|m| (m.relative_path.clone(), m.line, m.column))
            .collect()
    }

    #[test]
    fn literal_scan_reports_the_same_lines_for_every_line_ending() {
        let root = tempfile::tempdir().unwrap();
        // LF, CRLF and a lone CR each end a line; two matches share the last line.
        std::fs::write(
            root.path().join("mixed.md"),
            "needle\nxx needle\r\n中文 needle\rneedle needle\n",
        )
        .unwrap();
        let report = workspace(root.path())
            .search(SearchOptions {
                max_results: 50,
                ..options()
            })
            .unwrap();
        assert_eq!(
            places(&report),
            [
                ("mixed.md".to_owned(), 1, 1),
                ("mixed.md".to_owned(), 2, 4),
                ("mixed.md".to_owned(), 3, 4),
                ("mixed.md".to_owned(), 4, 1),
                ("mixed.md".to_owned(), 4, 8),
            ]
        );
        assert_eq!(report.matches[2].preview, "中文 needle");
        assert!(!report.truncated);
    }

    #[test]
    fn regular_expressions_keep_their_per_line_meaning() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("a.md"), "alpha\nbeta\nalpha  beta\n").unwrap();
        let report = workspace(root.path())
            .search(SearchOptions {
                query: r"alpha\s+beta",
                use_regex: true,
                ..options()
            })
            .unwrap();
        // Only the line that holds both words matches; \s never reaches across a line break.
        assert_eq!(places(&report), [("a.md".to_owned(), 3, 1)]);
    }

    #[test]
    fn results_are_merged_in_path_order_and_the_cut_is_stable() {
        let root = tempfile::tempdir().unwrap();
        for index in 0..60 {
            std::fs::create_dir_all(root.path().join(format!("d{:02}", index % 7))).unwrap();
            std::fs::write(
                root.path()
                    .join(format!("d{:02}/n{index:02}.md", index % 7)),
                "needle",
            )
            .unwrap();
        }
        let workspace = workspace(root.path());
        let all = workspace
            .search(SearchOptions {
                max_results: 100,
                ..options()
            })
            .unwrap();
        let paths: Vec<_> = all
            .matches
            .iter()
            .map(|m| m.relative_path.clone())
            .collect();
        let mut sorted = paths.clone();
        sorted.sort();
        assert_eq!(paths.len(), 60);
        assert_eq!(paths, sorted);
        let cut = workspace
            .search(SearchOptions {
                max_results: 7,
                ..options()
            })
            .unwrap();
        assert_eq!(
            cut.matches
                .iter()
                .map(|m| m.relative_path.clone())
                .collect::<Vec<_>>(),
            sorted[..7]
        );
        assert_eq!(cut.truncation_reasons, [SearchTruncation::Results]);
    }

    #[test]
    fn a_large_directory_is_searched_completely() {
        let root = tempfile::tempdir().unwrap();
        for index in 0..2_100 {
            std::fs::write(root.path().join(format!("n{index:04}.md")), "needle").unwrap();
        }
        let report = workspace(root.path())
            .search(SearchOptions {
                max_results: 5_000,
                ..options()
            })
            .unwrap();
        assert_eq!(report.scanned_files, 2_100);
        assert_eq!(report.matches.len(), 2_100);
        assert!(!report.truncated);
    }

    #[test]
    fn a_cancelled_search_stops_and_says_so() {
        let root = tempfile::tempdir().unwrap();
        for index in 0..50 {
            std::fs::write(root.path().join(format!("n{index:02}.md")), "needle").unwrap();
        }
        let cancel = AtomicBool::new(true);
        let report = workspace(root.path())
            .search_with_cancel(options(), |_| true, |name| name.ends_with(".md"), &cancel)
            .unwrap();
        assert!(report.matches.is_empty());
        assert_eq!(report.truncation_reasons, [SearchTruncation::Cancelled]);
    }
}
