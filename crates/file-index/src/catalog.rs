//! Bounded metadata-only change hints. A fingerprint is never filesystem authority.
use crate::{
    articles::same_metadata, checked_relative, ignored_name, is_markdown, join_relative,
    open_filtered_directory, IndexError, Workspace,
};
use cap_std::fs::{Dir, Metadata, ReadDir};
use serde::Serialize;
use std::{
    collections::hash_map::DefaultHasher,
    hash::{Hash, Hasher},
    path::Path,
    time::{Duration, Instant},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CatalogTruncation {
    Entries,
    Depth,
    Time,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCatalogSnapshot {
    pub fingerprint: String,
    pub scanned_entries: usize,
    pub unreadable: usize,
    pub truncated: bool,
    pub truncation_reasons: Vec<CatalogTruncation>,
}

struct Limits {
    entries: usize,
    depth: usize,
    time: Duration,
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

impl Default for Limits {
    fn default() -> Self {
        Self {
            entries: 20_000,
            depth: 64,
            time: Duration::from_millis(250),
        }
    }
}

fn metadata_hash(metadata: &Metadata) -> u64 {
    let mut digest = DefaultHasher::new();
    metadata.is_file().hash(&mut digest);
    metadata.is_dir().hash(&mut digest);
    metadata.len().hash(&mut digest);
    metadata.modified().ok().hash(&mut digest);
    metadata.created().ok().hash(&mut digest);
    metadata.permissions().readonly().hash(&mut digest);
    #[cfg(unix)]
    {
        use cap_std::fs::MetadataExt;
        metadata.dev().hash(&mut digest);
        metadata.ino().hash(&mut digest);
        metadata.mode().hash(&mut digest);
        metadata.ctime().hash(&mut digest);
        metadata.ctime_nsec().hash(&mut digest);
    }
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        metadata.file_attributes().hash(&mut digest);
    }
    digest.finish()
}

impl Workspace {
    pub fn catalog_snapshot_with_entry_filter(
        &self,
        extra: Option<&str>,
        include_entry: impl Fn(&std::fs::File) -> bool,
    ) -> Result<WorkspaceCatalogSnapshot, IndexError> {
        self.catalog_snapshot(extra, &include_entry, Limits::default())
    }

    pub fn catalog_snapshot_with_filters(
        &self,
        include_entry: impl Fn(&std::fs::File) -> bool,
        include_document: impl Fn(&str) -> bool,
    ) -> Result<WorkspaceCatalogSnapshot, IndexError> {
        self.catalog_snapshot_by_type(&include_document, &include_entry, Limits::default())
    }
    fn catalog_snapshot(
        &self,
        extra: Option<&str>,
        include_entry: &dyn Fn(&std::fs::File) -> bool,
        limits: Limits,
    ) -> Result<WorkspaceCatalogSnapshot, IndexError> {
        self.catalog_snapshot_by_type(
            &|name| is_markdown(Path::new(name), extra),
            include_entry,
            limits,
        )
    }

    fn catalog_snapshot_by_type(
        &self,
        include_document: &dyn Fn(&str) -> bool,
        include_entry: &dyn Fn(&std::fs::File) -> bool,
        limits: Limits,
    ) -> Result<WorkspaceCatalogSnapshot, IndexError> {
        let binding = self.display_root_binding()?;
        let started = Instant::now();
        let mut result = WorkspaceCatalogSnapshot {
            fingerprint: String::new(),
            scanned_entries: 0,
            unreadable: 0,
            truncated: false,
            truncation_reasons: Vec::new(),
        };
        let mut observations = vec![(String::new(), metadata_hash(&self.root.dir_metadata()?))];
        let mut frames = vec![Frame::new(self.root.try_clone()?, String::new(), 0)?];
        // Retain only the ancestor chain, never one open handle per sibling.
        while let Some(frame) = frames.last_mut() {
            let entry = match frame.entries.next() {
                Some(entry) => entry,
                None => {
                    frames.pop();
                    continue;
                }
            };
            let directory = &frame.directory;
            let relative = &frame.relative;
            let depth = frame.depth;
            let reason = if result.scanned_entries >= limits.entries {
                Some(CatalogTruncation::Entries)
            } else if started.elapsed() >= limits.time {
                Some(CatalogTruncation::Time)
            } else {
                None
            };
            if let Some(reason) = reason {
                result.truncation_reasons.push(reason);
                break;
            }
            result.scanned_entries += 1;
            let Ok(entry) = entry else {
                result.unreadable += 1;
                continue;
            };
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            if ignored_name(name) || checked_relative(name, false).is_err() {
                continue;
            }
            let path = join_relative(relative, name);
            if checked_relative(&path, false).is_err() {
                continue;
            }
            let before = match directory.symlink_metadata(name) {
                Ok(metadata) => metadata,
                Err(_) => {
                    result.unreadable += 1;
                    continue;
                }
            };
            if before.file_type().is_symlink() {
                continue;
            }
            if before.is_dir() {
                match open_filtered_directory(directory, name, &before, include_entry) {
                    Ok(Some(child)) => {
                        observations.push((path.clone(), metadata_hash(&before)));
                        if depth >= limits.depth {
                            if !result
                                .truncation_reasons
                                .contains(&CatalogTruncation::Depth)
                            {
                                result.truncation_reasons.push(CatalogTruncation::Depth);
                            }
                        } else {
                            match Frame::new(child, path, depth + 1) {
                                Ok(child) => frames.push(child),
                                Err(_) => result.unreadable += 1,
                            }
                        }
                    }
                    Ok(None) => {}
                    Err(_) => result.unreadable += 1,
                }
            } else if before.is_file() && include_document(name) {
                let inspected = (|| -> std::io::Result<Option<u64>> {
                    let file = directory.open(name)?;
                    let opened = file.metadata()?;
                    let after = directory.symlink_metadata(name)?;
                    if after.file_type().is_symlink()
                        || !opened.is_file()
                        || !same_metadata(&before, &opened)
                        || !same_metadata(&before, &after)
                    {
                        return Err(std::io::Error::other("Entry changed during metadata scan"));
                    }
                    let handle = file.into_std();
                    Ok(include_entry(&handle).then(|| metadata_hash(&opened)))
                })();
                match inspected {
                    Ok(Some(digest)) => observations.push((path, digest)),
                    Ok(None) => {}
                    Err(_) => result.unreadable += 1,
                }
            }
        }
        if binding != self.display_root_binding()? {
            return Err(IndexError::Io(std::io::Error::other(
                "Workspace moved during metadata scan",
            )));
        }
        observations.sort_unstable();
        let mut digest = DefaultHasher::new();
        binding.hash(&mut digest);
        observations.hash(&mut digest);
        result.unreadable.hash(&mut digest);
        result.truncated = !result.truncation_reasons.is_empty();
        result.fingerprint = format!("{:016x}", digest.finish());
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::WorkspaceRegistry;

    #[test]
    fn external_create_write_rename_and_delete_change_metadata_hint() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("nested")).unwrap();
        let mut registry = WorkspaceRegistry::default();
        let grant = registry.select_authorized(root.path()).unwrap();
        let workspace = registry.get(&grant.id).unwrap();
        let read = || {
            workspace
                .catalog_snapshot_with_entry_filter(None, |_| true)
                .unwrap()
                .fingerprint
        };
        let empty = read();
        assert_eq!(read(), empty);
        let note = root.path().join("nested/note.md");
        std::fs::write(&note, "one").unwrap();
        let added = read();
        assert_ne!(added, empty);
        std::fs::write(&note, "updated text").unwrap();
        let written = read();
        assert_ne!(written, added);
        std::fs::rename(&note, root.path().join("nested/renamed.md")).unwrap();
        let renamed = read();
        assert_ne!(renamed, written);
        std::fs::remove_file(root.path().join("nested/renamed.md")).unwrap();
        assert_ne!(read(), renamed);
    }

    #[test]
    #[cfg(unix)]
    fn wide_directory_keeps_open_handles_bounded_by_depth() {
        let root = tempfile::tempdir().unwrap();
        for index in 0..512 {
            std::fs::create_dir(root.path().join(format!("child-{index}"))).unwrap();
        }
        let mut registry = WorkspaceRegistry::default();
        let grant = registry.select_authorized(root.path()).unwrap();
        let workspace = registry.get(&grant.id).unwrap();
        let handles = || std::fs::read_dir("/dev/fd").unwrap().count();
        let baseline = handles();
        let peak = std::cell::Cell::new(baseline);
        let result = workspace
            .catalog_snapshot(
                None,
                &|_| {
                    peak.set(peak.get().max(handles()));
                    true
                },
                Limits {
                    entries: 20_000,
                    depth: 64,
                    time: Duration::from_secs(3),
                },
            )
            .unwrap();
        assert_eq!(result.scanned_entries, 512);
        assert_eq!(result.unreadable, 0);
        assert!(!result.truncated);
        // Leave room for concurrently running unit fixtures, not 512 sibling handles.
        assert!(
            peak.get() < baseline + 96,
            "base {baseline}, peak {}",
            peak.get()
        );
    }

    #[test]
    fn bounded_hints_report_entries_depth_time_and_do_not_read_content() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("child")).unwrap();
        std::fs::write(root.path().join("child/invalid.md"), [0xff, 0, 1]).unwrap();
        let mut registry = WorkspaceRegistry::default();
        let grant = registry.select_authorized(root.path()).unwrap();
        let workspace = registry.get(&grant.id).unwrap();
        let full = workspace
            .catalog_snapshot_with_entry_filter(None, |_| true)
            .unwrap();
        assert_eq!(full.scanned_entries, 2);
        assert!(!full.truncated);
        assert_eq!(full.unreadable, 0);
        for (entries, depth, time, expected) in [
            (0, 64, Duration::from_secs(1), CatalogTruncation::Entries),
            (100, 0, Duration::from_secs(1), CatalogTruncation::Depth),
            (100, 64, Duration::ZERO, CatalogTruncation::Time),
        ] {
            let report = workspace
                .catalog_snapshot(
                    None,
                    &|_| true,
                    Limits {
                        entries,
                        depth,
                        time,
                    },
                )
                .unwrap();
            assert!(report.truncated);
            assert!(report.truncation_reasons.contains(&expected));
        }
    }

    #[test]
    fn excluded_subtrees_and_symlink_targets_are_never_inspected() {
        let root = tempfile::tempdir().unwrap();
        for name in [".hidden", "node_modules", "Package.app"] {
            std::fs::create_dir(root.path().join(name)).unwrap();
            std::fs::write(root.path().join(name).join("secret.md"), "secret").unwrap();
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink("/", root.path().join("escape")).unwrap();
        let mut registry = WorkspaceRegistry::default();
        let grant = registry.select_authorized(root.path()).unwrap();
        let workspace = registry.get(&grant.id).unwrap();
        let calls = std::cell::Cell::new(0);
        let report = workspace
            .catalog_snapshot_with_entry_filter(None, |file| {
                // Only Package.app reaches the metadata callback; its descendants do not.
                assert!(file.metadata().unwrap().is_dir());
                calls.set(calls.get() + 1);
                false
            })
            .unwrap();
        assert_eq!(report.unreadable, 0);
        assert_eq!(calls.get(), 1);
    }
}
