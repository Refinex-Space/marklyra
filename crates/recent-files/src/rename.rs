//! Snapshot/CAS path migration after a host-verified file or directory rename.
use super::*;
use std::collections::{HashMap, HashSet};

pub struct RecentRenamePlan {
    origin: Uuid,
    changes: Vec<(RecentEntry, String, String)>,
    snapshot: Vec<RecentEntry>,
    revision: u64,
}
#[derive(Debug, Default)]
pub struct RecentRenameReport {
    pub changed: usize,
    pub skipped: usize,
}
impl RecentFiles {
    pub fn prepare_rename_authorized(
        &self,
        old: &Path,
        new: &Path,
        subtree: bool,
    ) -> Result<RecentRenamePlan, RecentError> {
        if old.parent() != new.parent() {
            return Err(RecentError::InvalidPath);
        }
        self.prepare_move_authorized(old, new, subtree)
    }

    /// Native metadata continuation of a verified cross-parent move. This does
    /// not open, copy, delete or grant either path; the host verifies publication.
    pub fn prepare_move_authorized(
        &self,
        old: &Path,
        new: &Path,
        subtree: bool,
    ) -> Result<RecentRenamePlan, RecentError> {
        self.prepare_moves_authorized(&[(old, new, subtree)])
    }

    /// Capture every cohort from one listing. Each original record is mapped
    /// at most once, so a Replace backup never becomes input to the main move.
    pub fn prepare_moves_authorized(
        &self,
        moves: &[(&Path, &Path, bool)],
    ) -> Result<RecentRenamePlan, RecentError> {
        if moves.len() > MAX_ENTRIES * 2 {
            return Err(RecentError::TooLarge);
        }
        for (old, new, _) in moves {
            validate_path(old)?;
            validate_path(new)?;
        }
        let listing = self.list()?;
        let snapshot = listing.entries;
        let mut changes = vec![];
        let mut destinations = HashSet::new();
        for entry in &snapshot {
            let path = Path::new(&entry.path);
            let mut mapped = None;
            for &(old, new, subtree) in moves {
                if old == new {
                    continue;
                }
                let next = if subtree {
                    path.strip_prefix(old).ok().map(|suffix| new.join(suffix))
                } else if path == old {
                    Some(new.to_owned())
                } else {
                    None
                };
                if let Some(next) = next {
                    if mapped.as_ref().is_some_and(|mapped| mapped != &next) {
                        return Err(RecentError::InvalidPath);
                    }
                    mapped = Some(next);
                }
            }
            if let Some(mapped) = mapped {
                validate_path(&mapped)?;
                if !destinations.insert(mapped.clone()) {
                    return Err(RecentError::InvalidPath);
                }
                let name = mapped
                    .file_name()
                    .and_then(|name| name.to_str())
                    .ok_or(RecentError::UnsupportedPath)?
                    .to_owned();
                let path = mapped
                    .to_str()
                    .ok_or(RecentError::UnsupportedPath)?
                    .to_owned();
                changes.push((entry.clone(), path, name));
            }
        }
        Ok(RecentRenamePlan {
            origin: self.origin,
            changes,
            snapshot,
            revision: listing.revision,
        })
    }

    /// Only still-identical existing records are changed. No clear/remove or
    /// newer open is undone, and unrelated MRU changes retain their order.
    pub fn commit_rename_authorized(
        &self,
        plan: RecentRenamePlan,
    ) -> Result<RecentRenameReport, RecentError> {
        if plan.origin != self.origin {
            return Err(RecentError::InvalidPath);
        }
        self.disk.transaction(|disk| {
            let mut listing = disk.read()?;
            let mut report = RecentRenameReport::default();
            if listing.revision != plan.revision && listing.entries == plan.snapshot {
                // A same-millisecond reopen can preserve all entry fields.
                // A changed revision still proves the snapshot was superseded.
                report.skipped = plan.changes.len();
                return Ok(report);
            }
            let planned = plan
                .changes
                .iter()
                .map(|(expected, _, _)| expected.id.as_str())
                .collect::<HashSet<_>>();
            let mut active = plan
                .changes
                .iter()
                .filter(|(expected, _, _)| listing.entries.contains(expected))
                .map(|(expected, _, _)| expected.id.as_str())
                .collect::<HashSet<_>>();
            // Decide against the unmodified listing. If one cohort is skipped,
            // dependent moves must not delete its still-occupied source record.
            loop {
                let blocked = plan
                    .changes
                    .iter()
                    .filter(|(expected, path, _)| {
                        active.contains(expected.id.as_str())
                            && listing.entries.iter().any(|destination| {
                                destination.path == *path
                                    && destination.id != expected.id
                                    && !active.contains(destination.id.as_str())
                                    && (planned.contains(destination.id.as_str())
                                        || !plan.snapshot.contains(destination))
                            })
                    })
                    .map(|(expected, _, _)| expected.id.as_str())
                    .collect::<Vec<_>>();
                if blocked.is_empty() {
                    break;
                }
                for id in blocked {
                    active.remove(id);
                }
            }
            let mut changes = HashMap::new();
            for (expected, path, name) in &plan.changes {
                if active.contains(expected.id.as_str()) {
                    changes.insert(expected.id.as_str(), (path.as_str(), name.as_str()));
                }
            }
            let destination_paths = changes
                .values()
                .map(|(path, _)| *path)
                .collect::<HashSet<_>>();
            for entry in &mut listing.entries {
                if let Some((path, name)) = changes.get(entry.id.as_str()) {
                    entry.path = (*path).to_owned();
                    entry.name = (*name).to_owned();
                }
            }
            // Publish all retained input identities first. Only then remove
            // unchanged destination references that were not another cohort.
            listing.entries.retain(|entry| {
                active.contains(entry.id.as_str())
                    || !destination_paths.contains(entry.path.as_str())
            });
            report.changed = changes.len();
            report.skipped = plan.changes.len() - report.changed;
            if report.changed != 0 {
                advance(&mut listing)?;
                disk.write(&listing)?;
            }
            Ok(report)
        })
    }
}
