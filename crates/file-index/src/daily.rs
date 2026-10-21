//! Daily and weekly note files. Keys map to fixed workspace-relative paths; reading
//! never follows links and creation is exclusive, so an existing file is never replaced.
use crate::{
    articles::{epoch_millis, same_metadata},
    checked_relative, directory_visible, file_visible,
    fs_mutation::{check_name, is_link},
    ignored_name, IndexError, Workspace,
};
use cap_std::fs::{Dir, OpenOptions};
use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};

/// Keys accepted by one read request.
pub const MAX_DAILY_KEYS: usize = 64;
/// Larger notes are reported without text; the editor opens them as normal documents.
pub const MAX_DAILY_TEXT_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DailyLayout {
    /// `{folder}/YYYY/MM/YYYY-MM-DD.md` and `{folder}/YYYY/YYYY-Www.md`.
    Nested,
    /// `{folder}/YYYY-MM-DD.md` and `{folder}/YYYY-Www.md`.
    Flat,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyNote {
    pub key: String,
    pub relative_path: String,
    pub size: u64,
    pub modified_at: Option<i64>,
    /// Present only for UTF-8 files up to `MAX_DAILY_TEXT_BYTES`, without a leading BOM.
    pub text: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DailyKey {
    Day { year: u16, month: u8, day: u8 },
    Week { year: u16, week: u8 },
}

fn parse_key(key: &str) -> Result<DailyKey, IndexError> {
    let bytes = key.as_bytes();
    let digits = |range: std::ops::Range<usize>| -> Result<u16, IndexError> {
        let part = bytes.get(range).ok_or(IndexError::InvalidDailyKey)?;
        if !part.iter().all(u8::is_ascii_digit) {
            return Err(IndexError::InvalidDailyKey);
        }
        Ok(part
            .iter()
            .fold(0, |value, digit| value * 10 + u16::from(digit - b'0')))
    };
    let year = digits(0..4)?;
    if !(1000..=9999).contains(&year) || bytes.get(4) != Some(&b'-') {
        return Err(IndexError::InvalidDailyKey);
    }
    match bytes.len() {
        10 if bytes[7] == b'-' => {
            let month = digits(5..7)? as u8;
            let day = digits(8..10)? as u8;
            if !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month) {
                return Err(IndexError::InvalidDailyKey);
            }
            Ok(DailyKey::Day { year, month, day })
        }
        8 if bytes[5] == b'W' => {
            let week = digits(6..8)? as u8;
            if week == 0 || week > iso_weeks_in_year(year) {
                return Err(IndexError::InvalidDailyKey);
            }
            Ok(DailyKey::Week { year, week })
        }
        _ => Err(IndexError::InvalidDailyKey),
    }
}

fn leap_year(year: u16) -> bool {
    year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400))
}

fn days_in_month(year: u16, month: u8) -> u8 {
    match month {
        2 if leap_year(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

/// An ISO week-year has 53 weeks when it starts on a Thursday, or on a Wednesday in a leap year.
fn iso_weeks_in_year(year: u16) -> u8 {
    // Weekday of December 31 (0 = Sunday … 4 = Thursday).
    let december_31 = |year: u32| (year + year / 4 - year / 100 + year / 400) % 7;
    let year = u32::from(year);
    if december_31(year) == 4 || december_31(year - 1) == 3 {
        53
    } else {
        52
    }
}

fn check_folder(folder: &str) -> Result<(), IndexError> {
    if folder.is_empty()
        || folder.starts_with('/')
        || folder.contains(['\\', ':', '\0'])
        || folder.split('/').any(|segment| {
            segment.is_empty()
                || segment == "."
                || segment == ".."
                || segment.trim() != segment
                || ignored_name(segment)
                || check_name(segment).is_err()
        })
    {
        return Err(IndexError::InvalidDailyFolder);
    }
    checked_relative(folder, false).map_err(|_| IndexError::InvalidDailyFolder)?;
    Ok(())
}

/// Workspace-relative path of a note, `/`-separated. Pure: performs no filesystem access.
pub fn daily_relative_path(
    folder: &str,
    layout: DailyLayout,
    key: &str,
) -> Result<String, IndexError> {
    check_folder(folder)?;
    let parsed = parse_key(key)?;
    let path = match (layout, parsed) {
        (DailyLayout::Flat, _) => format!("{folder}/{key}.md"),
        (DailyLayout::Nested, DailyKey::Day { year, month, .. }) => {
            format!("{folder}/{year:04}/{month:02}/{key}.md")
        }
        (DailyLayout::Nested, DailyKey::Week { year, .. }) => {
            format!("{folder}/{year:04}/{key}.md")
        }
    };
    checked_relative(&path, false).map_err(|_| IndexError::InvalidDailyFolder)?;
    Ok(path)
}

/// Opens an existing plain subdirectory; `None` when the name is absent.
fn open_existing_directory(parent: &Dir, name: &str) -> Result<Option<Dir>, IndexError> {
    let before = match parent.symlink_metadata(name) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if is_link(&before) || !before.is_dir() {
        return Err(IndexError::InvalidPath);
    }
    let directory = parent.open_dir(name)?;
    let after = parent.symlink_metadata(name)?;
    if is_link(&after)
        || !same_metadata(&before, &directory.dir_metadata()?)
        || !same_metadata(&before, &after)
    {
        return Err(IndexError::InvalidPath);
    }
    Ok(Some(directory))
}

fn split_parent(relative: &str) -> (&str, &str) {
    relative.rsplit_once('/').unwrap_or(("", relative))
}

impl Workspace {
    /// Existing notes among `keys`, in request order. Missing, hidden or linked
    /// locations are absent rather than errors; links are never followed.
    pub fn read_daily_notes(
        &self,
        folder: &str,
        layout: DailyLayout,
        keys: &[String],
        include_entry: impl Fn(&std::fs::File) -> bool,
        include_document: impl Fn(&str) -> bool,
    ) -> Result<Vec<DailyNote>, IndexError> {
        if keys.len() > MAX_DAILY_KEYS {
            return Err(IndexError::TooManyDailyKeys);
        }
        let mut requested: Vec<(&str, String)> = Vec::with_capacity(keys.len());
        for key in keys {
            let relative = daily_relative_path(folder, layout, key)?;
            if !requested.iter().any(|(known, _)| *known == key.as_str()) {
                requested.push((key, relative));
            }
        }
        let binding = self.display_root_binding()?;
        let mut notes = Vec::new();
        for (key, relative) in requested {
            let (parent, name) = split_parent(&relative);
            if !include_document(name) {
                continue;
            }
            let Some(directory) = self.visible_directory(parent, &include_entry)? else {
                continue;
            };
            if let Some(note) = read_note(&directory, key, &relative, name, &include_entry)? {
                notes.push(note);
            }
        }
        if binding != self.display_root_binding()? {
            return Err(IndexError::Io(io::Error::other(
                "Workspace moved during daily note read",
            )));
        }
        Ok(notes)
    }

    fn visible_directory(
        &self,
        relative: &str,
        include_entry: &dyn Fn(&std::fs::File) -> bool,
    ) -> Result<Option<Dir>, IndexError> {
        let mut directory = self.root.try_clone()?;
        for name in relative.split('/') {
            let metadata = match directory.symlink_metadata(name) {
                Ok(metadata) => metadata,
                Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
                Err(error) => return Err(error.into()),
            };
            if is_link(&metadata) || !metadata.is_dir() {
                return Ok(None);
            }
            match directory_visible(&directory, name, &metadata, include_entry)? {
                Some(next) => directory = next,
                None => return Ok(None),
            }
        }
        Ok(Some(directory))
    }

    /// Creates the note and any missing folders. Never replaces an existing file;
    /// returns the created workspace-relative path.
    pub fn create_daily_note(
        &self,
        folder: &str,
        layout: DailyLayout,
        key: &str,
        text: &str,
    ) -> Result<String, IndexError> {
        let relative = daily_relative_path(folder, layout, key)?;
        // An old display path is not authority for a replacement directory.
        document_service::DirectoryBookmark::capture(&self.root, &self.display_root_snapshot()?)?;
        let (parent, name) = split_parent(&relative);
        let mut directory = self.root.try_clone()?;
        for segment in parent.split('/') {
            directory = match open_existing_directory(&directory, segment)? {
                Some(next) => next,
                None => {
                    match directory.create_dir(segment) {
                        Ok(()) => {}
                        // Created concurrently: the reopen below still rejects links.
                        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                        Err(error) => return Err(error.into()),
                    }
                    open_existing_directory(&directory, segment)?
                        .ok_or(IndexError::MutationUncertain)?
                }
            };
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true).create_new(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = match directory.open_with(name, &options) {
            Ok(file) => file,
            Err(error)
                if error.kind() == io::ErrorKind::AlreadyExists
                    // Windows reports ACCESS_DENIED when CREATE_NEW collides with a directory.
                    || cfg!(windows)
                        && error.kind() == io::ErrorKind::PermissionDenied
                        && directory.symlink_metadata(name).is_ok() =>
            {
                return Err(IndexError::DailyNoteExists);
            }
            Err(error) => return Err(error.into()),
        };
        let identity = file
            .try_clone()
            .and_then(|file| same_file::Handle::from_file(file.into_std()))
            .map_err(|_| IndexError::MutationUncertain)?;
        let written = file
            .write_all(text.as_bytes())
            .and_then(|()| file.sync_all());
        if let Err(error) = written {
            drop(file);
            remove_created(&directory, name, identity);
            return Err(error.into());
        }
        #[cfg(unix)]
        if let Ok(handle) = directory.try_clone() {
            // The note is complete; a failed directory flush does not undo it.
            let _ = handle.into_std_file().sync_all();
        }
        Ok(relative)
    }
}

/// Best effort: removes `name` only while it is still the entity this request created.
fn remove_created(directory: &Dir, name: &str, created: same_file::Handle) {
    let current = directory
        .symlink_metadata(name)
        .ok()
        .filter(|metadata| !is_link(metadata) && metadata.is_file())
        .and_then(|_| directory.open(name).ok())
        .and_then(|file| same_file::Handle::from_file(file.into_std()).ok());
    if current.as_ref() == Some(&created) {
        drop(current);
        drop(created);
        if let Err(error) = directory.remove_file(name) {
            eprintln!("Partially written daily note was not removed: {error}");
        }
    }
}

fn read_note(
    directory: &Dir,
    key: &str,
    relative: &str,
    name: &str,
    include_entry: &dyn Fn(&std::fs::File) -> bool,
) -> Result<Option<DailyNote>, IndexError> {
    let before = match directory.symlink_metadata(name) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if is_link(&before) || !before.is_file() {
        return Ok(None);
    }
    match file_visible(directory, name, &before, include_entry) {
        Ok(true) => {}
        Ok(false) => return Ok(None),
        // Changed while being classified: report it as absent rather than guessing.
        Err(_) => return Ok(None),
    }
    let mut note = DailyNote {
        key: key.to_owned(),
        relative_path: relative.to_owned(),
        size: before.len(),
        modified_at: epoch_millis(before.modified().ok()),
        text: None,
    };
    if before.len() <= MAX_DAILY_TEXT_BYTES {
        // An unreadable or concurrently changed file still exists; it is reported without text.
        note.text = read_text(directory, name, &before);
    }
    Ok(Some(note))
}

fn read_text(directory: &Dir, name: &str, before: &cap_std::fs::Metadata) -> Option<String> {
    let file = directory.open(name).ok()?;
    let opened = file.metadata().ok()?;
    if !opened.is_file() || !same_metadata(before, &opened) {
        return None;
    }
    let mut bytes = Vec::with_capacity(opened.len() as usize);
    (&file)
        .take(MAX_DAILY_TEXT_BYTES + 1)
        .read_to_end(&mut bytes)
        .ok()?;
    let after = directory.symlink_metadata(name).ok()?;
    if bytes.len() as u64 > MAX_DAILY_TEXT_BYTES
        || is_link(&after)
        || !same_metadata(&opened, &after)
        || !same_metadata(&opened, &file.metadata().ok()?)
    {
        return None;
    }
    let body = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&bytes);
    std::str::from_utf8(body).ok().map(str::to_owned)
}

#[cfg(test)]
mod tests;
