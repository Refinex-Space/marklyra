//! How many documents each directory holds, counting everything below it.
use crate::{
    checked_relative, directory_visible, file_visible, ignored_name, join_relative, IndexError,
    Workspace,
};
use cap_std::fs::{Dir, ReadDir};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant},
};

const MAX_ENTRIES: usize = 1_000_000;
const MAX_DIRECTORY_ENTRIES: usize = 200_000;
const MAX_DEPTH: usize = 64;
const MAX_TIME: Duration = Duration::from_secs(10);

/// Documents per directory, keyed by its path relative to the workspace ("" is the root).
/// Directories without documents are absent. The same names, hidden entries and document types
/// that the tree shows are counted, so a number always matches what expanding the folder reveals.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentCounts {
    pub counts: BTreeMap<String, usize>,
    pub scanned_entries: usize,
    /// A limit or cancellation cut the walk short; the numbers are lower bounds.
    pub truncated: bool,
}

struct Frame {
    directory: Dir,
    entries: ReadDir,
    relative: String,
    depth: usize,
    scanned: usize,
    total: usize,
}

impl Workspace {
    pub fn count_documents_with_filters(
        &self,
        include_entry: impl Fn(&std::fs::File) -> bool,
        include_document: impl Fn(&str) -> bool,
        cancel: &AtomicBool,
    ) -> Result<DocumentCounts, IndexError> {
        self.display_root_binding()?;
        let started = Instant::now();
        let mut result = DocumentCounts::default();
        let root = self.root.try_clone()?;
        let entries = root.entries()?;
        let mut stack = vec![Frame {
            directory: root,
            entries,
            relative: String::new(),
            depth: 0,
            scanned: 0,
            total: 0,
        }];
        let include_entry: &dyn Fn(&std::fs::File) -> bool = &include_entry;
        while let Some(frame) = stack.last_mut() {
            let Some(entry) = frame.entries.next() else {
                let done = stack.pop().expect("a frame was just borrowed");
                if done.total > 0 {
                    result.counts.insert(done.relative, done.total);
                    if let Some(parent) = stack.last_mut() {
                        parent.total += done.total;
                    }
                }
                continue;
            };
            if cancel.load(Ordering::Relaxed)
                || started.elapsed() >= MAX_TIME
                || result.scanned_entries >= MAX_ENTRIES
                || frame.scanned >= MAX_DIRECTORY_ENTRIES
            {
                result.truncated = true;
                // Fold what was found so far into the ancestors instead of dropping it.
                while let Some(done) = stack.pop() {
                    if done.total > 0 {
                        result.counts.insert(done.relative, done.total);
                        if let Some(parent) = stack.last_mut() {
                            parent.total += done.total;
                        }
                    }
                }
                break;
            }
            result.scanned_entries += 1;
            frame.scanned += 1;
            let Ok(entry) = entry else { continue };
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            if checked_relative(name, false).is_err() || ignored_name(name) {
                continue;
            }
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.file_type().is_symlink() {
                continue;
            }
            if metadata.is_dir() {
                if frame.depth >= MAX_DEPTH {
                    result.truncated = true;
                    continue;
                }
                let relative = join_relative(&frame.relative, name);
                if checked_relative(&relative, false).is_err() {
                    continue;
                }
                let Ok(Some(directory)) =
                    directory_visible(&frame.directory, name, &metadata, include_entry)
                else {
                    continue;
                };
                let Ok(entries) = directory.entries() else {
                    continue;
                };
                let depth = frame.depth + 1;
                stack.push(Frame {
                    directory,
                    entries,
                    relative,
                    depth,
                    scanned: 0,
                    total: 0,
                });
                continue;
            }
            if metadata.is_file()
                && include_document(name)
                && file_visible(&frame.directory, name, &metadata, include_entry).unwrap_or(false)
            {
                frame.total += 1;
            }
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn workspace(path: &std::path::Path) -> std::sync::Arc<Workspace> {
        let mut registry = crate::WorkspaceRegistry::default();
        let selected = registry.select_authorized(path).unwrap();
        registry.get(&selected.id).unwrap()
    }
    fn count(workspace: &Workspace) -> DocumentCounts {
        workspace
            .count_documents_with_filters(
                |_| true,
                |name| name.ends_with(".md") || name.ends_with(".txt"),
                &AtomicBool::new(false),
            )
            .unwrap()
    }

    #[test]
    fn every_directory_counts_the_documents_below_it() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("a/b/c")).unwrap();
        fs::create_dir_all(root.path().join("empty/deeper")).unwrap();
        fs::create_dir_all(root.path().join("only-others")).unwrap();
        fs::write(root.path().join("top.md"), "x").unwrap();
        fs::write(root.path().join("a/one.md"), "x").unwrap();
        fs::write(root.path().join("a/two.txt"), "x").unwrap();
        fs::write(root.path().join("a/b/three.md"), "x").unwrap();
        fs::write(root.path().join("a/b/c/four.md"), "x").unwrap();
        fs::write(root.path().join("a/b/c/image.png"), "x").unwrap();
        fs::write(root.path().join("only-others/data.bin"), "x").unwrap();
        let report = count(&workspace(root.path()));
        let counts: Vec<_> = report
            .counts
            .iter()
            .map(|(k, v)| (k.as_str(), *v))
            .collect();
        // Folders without documents (or with only other file types) are not listed at all.
        assert_eq!(counts, [("", 5), ("a", 4), ("a/b", 2), ("a/b/c", 1)]);
        assert!(!report.truncated);
    }

    #[test]
    fn hidden_entries_and_dependencies_are_not_counted() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join(".git/objects")).unwrap();
        fs::create_dir_all(root.path().join("node_modules/pkg")).unwrap();
        fs::create_dir_all(root.path().join("docs")).unwrap();
        fs::write(root.path().join(".git/objects/readme.md"), "x").unwrap();
        fs::write(root.path().join("node_modules/pkg/readme.md"), "x").unwrap();
        fs::write(root.path().join(".hidden.md"), "x").unwrap();
        fs::write(root.path().join("docs/visible.md"), "x").unwrap();
        let report = count(&workspace(root.path()));
        assert_eq!(report.counts.get("docs"), Some(&1));
        assert_eq!(report.counts.get(""), Some(&1));
        assert!(!report.counts.contains_key(".git"));
        assert!(!report.counts.contains_key("node_modules"));
    }

    #[test]
    fn only_the_requested_document_types_count() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("d")).unwrap();
        fs::write(root.path().join("d/keep.md"), "x").unwrap();
        fs::write(root.path().join("d/drop.md"), "x").unwrap();
        let workspace = workspace(root.path());
        // The type filter is the one the tree uses; names it rejects are never counted.
        let report = workspace
            .count_documents_with_filters(
                |_| true,
                |name| name == "keep.md",
                &AtomicBool::new(false),
            )
            .unwrap();
        assert_eq!(report.counts.get("d"), Some(&1));
    }

    #[test]
    fn a_cancelled_count_says_so_and_keeps_what_it_found() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("a.md"), "x").unwrap();
        let report = workspace(root.path())
            .count_documents_with_filters(|_| true, |_| true, &AtomicBool::new(true))
            .unwrap();
        assert!(report.truncated);
        assert!(report.counts.is_empty());
    }

    #[cfg(unix)]
    #[test]
    fn symbolic_links_are_not_followed_or_counted() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.md"), "x").unwrap();
        fs::write(root.path().join("real.md"), "x").unwrap();
        std::os::unix::fs::symlink(outside.path(), root.path().join("link")).unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret.md"), root.path().join("l.md"))
            .unwrap();
        let report = count(&workspace(root.path()));
        assert_eq!(report.counts.get(""), Some(&1));
        assert!(!report.counts.contains_key("link"));
    }
}
