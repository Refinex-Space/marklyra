//! Native rename metadata synchronization. Durable invalidation precedes the
//! second store, so pre-rename remember requests cannot put the old name back.
use super::{storage::Store, FilePreferencesHost, HistoryTicket, Stored, MAX_REVISION};
use tauri::AppHandle;

impl FilePreferencesHost {
    pub(crate) fn migrate_recent_rename(
        &self,
        app: &AppHandle,
        ticket: Option<HistoryTicket>,
        operation: impl FnOnce() -> Result<bool, String>,
    ) -> Result<bool, String> {
        let Some(ticket) = ticket else {
            return Ok(false);
        };
        self.with(app, |store| {
            self.migrate_rename_in_store(store, ticket, || {}, operation)
        })
    }

    fn migrate_rename_in_store(
        &self,
        store: &Store,
        ticket: HistoryTicket,
        between_phases: impl FnOnce(),
        operation: impl FnOnce() -> Result<bool, String>,
    ) -> Result<bool, String> {
        // This write must finish before mutating RecentFiles. Even if that
        // mutation fails, another Host/Store cannot revive a pre-rename ticket.
        let renewed = store.transaction(|state| {
            if !self.current_rename_ticket(state, ticket) {
                return Ok((None, false));
            }
            state.remember_epoch = state
                .remember_epoch
                .checked_add(1)
                .filter(|epoch| *epoch <= MAX_REVISION)
                .ok_or("最近文件记忆版本已达上限")?;
            // Do not invalidate dispatch serial: a different rename command may
            // have entered before this one but not prepared its ticket yet.
            // Ordinary remember always prepares before capturing authorized_path;
            // its persisted remember_epoch protects an already captured old path.
            Ok((self.ticket(state, ticket.request), true))
        })?;
        let Some(renewed) = renewed else {
            return Ok(false);
        };
        between_phases();
        // A clear or noRecent change in another host/process can fit between
        // the two transactions. Recheck its persisted epoch under the same
        // profile gate that encloses the entire RecentFiles transaction.
        store.transaction(|state| {
            let changed = self.current_rename_ticket(state, renewed) && operation()?;
            Ok((changed, false))
        })
    }

    fn current_rename_ticket(&self, state: &Stored, ticket: HistoryTicket) -> bool {
        // Other confirmed renames invalidate old remember paths, not this
        // independent migration. Only clear/noRecent reset epochs/serial cancel it.
        state.history_epoch == ticket.epoch && self.ticket(state, ticket.request).is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::file_preferences::{change, PreferenceChange};
    use recent_files::RecentFiles;
    use std::{
        fs,
        path::Path,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc, Barrier,
        },
    };

    fn prepared(host: &FilePreferencesHost, store: &Store) -> HistoryTicket {
        store
            .transaction(|state| Ok((host.ticket(state, host.history_request()).unwrap(), false)))
            .unwrap()
    }
    fn file(root: &Path) -> (std::path::PathBuf, std::path::PathBuf) {
        let old = root.join("Untitled.md");
        fs::write(&old, b"\xef\xbb\xbfsource\r\n ").unwrap();
        let old = fs::canonicalize(old).unwrap();
        let new = old.with_file_name("final.md");
        (old, new)
    }

    #[test]
    fn migration_invalidates_late_old_path_remember_in_same_or_independent_host() {
        for independent_host in [false, true] {
            let root = tempfile::tempdir().unwrap();
            let profile = root.path().join("preferences");
            let history = root.path().join("recent");
            let store = Store::open(&profile).unwrap();
            let recent = RecentFiles::open(&history).unwrap();
            let (old, new) = file(root.path());
            let original = recent.remember_authorized(&old).unwrap();
            let remembering = FilePreferencesHost::default();
            let old_ticket = prepared(&remembering, &store);
            let migrating = if independent_host {
                FilePreferencesHost::default()
            } else {
                remembering.clone()
            };
            let rename_ticket = prepared(&migrating, &store);
            let barrier = Arc::new(Barrier::new(2));
            let worker_barrier = barrier.clone();
            let worker_profile = profile.clone();
            let worker_history = history.clone();
            let captured_old_path = old.clone();
            let worker = std::thread::spawn(move || {
                // The command already captured its authorized old path. Wait
                // until migration actually completes, without timing sleeps.
                worker_barrier.wait();
                worker_barrier.wait();
                Store::open(&worker_profile)
                    .unwrap()
                    .transaction(|state| {
                        if !remembering.current_ticket(state, old_ticket) {
                            return Ok((false, false));
                        }
                        RecentFiles::open(&worker_history)
                            .unwrap()
                            .remember_authorized(&captured_old_path)
                            .unwrap();
                        Ok((true, false))
                    })
                    .unwrap()
            });
            barrier.wait();
            fs::rename(&old, &new).unwrap();
            assert!(migrating
                .migrate_rename_in_store(
                    &store,
                    rename_ticket,
                    || {},
                    || {
                        recent
                            .rename_authorized_if_recorded(&old, &new)
                            .map_err(|e| e.to_string())
                    }
                )
                .unwrap());
            barrier.wait();
            assert!(!worker.join().unwrap());
            let after = recent.list().unwrap();
            assert_eq!(after.entries.len(), 1);
            assert_eq!(after.entries[0].id, original.id);
            assert_eq!(after.entries[0].last_opened_at, original.last_opened_at);
            assert_eq!(after.entries[0].path, new.to_str().unwrap());
            assert_eq!(fs::read(&new).unwrap(), b"\xef\xbb\xbfsource\r\n ");
        }
    }

    #[test]
    fn a_clear_before_migration_or_between_phases_does_not_resurrect_a_record() {
        for between_phases in [false, true] {
            let root = tempfile::tempdir().unwrap();
            let profile = root.path().join("preferences");
            let store = Store::open(&profile).unwrap();
            let recent = RecentFiles::open(&root.path().join("recent")).unwrap();
            let (old, new) = file(root.path());
            recent.remember_authorized(&old).unwrap();
            let migrating = FilePreferencesHost::default();
            let ticket = prepared(&migrating, &store);
            let clearer = FilePreferencesHost::default();
            let clear = || {
                clearer
                    .clear_history(&Store::open(&profile).unwrap(), false, || {
                        recent.clear().map(|_| ()).map_err(|e| e.to_string())
                    })
                    .unwrap()
            };
            fs::rename(&old, &new).unwrap();
            if !between_phases {
                clear();
            }
            let calls = AtomicUsize::new(0);
            assert!(!migrating
                .migrate_rename_in_store(
                    &store,
                    ticket,
                    || {
                        if between_phases {
                            clear();
                        }
                    },
                    || {
                        calls.fetch_add(1, Ordering::SeqCst);
                        recent
                            .rename_authorized_if_recorded(&old, &new)
                            .map_err(|e| e.to_string())
                    }
                )
                .unwrap());
            assert_eq!(calls.load(Ordering::SeqCst), 0);
            assert!(recent.list().unwrap().entries.is_empty());
            assert!(new.exists());
        }
    }

    #[test]
    fn disabled_and_reenabled_preferences_do_not_migrate_an_old_ticket_or_change_hidden_index() {
        for reenable in [false, true] {
            let root = tempfile::tempdir().unwrap();
            let profile = root.path().join("preferences");
            let history = root.path().join("recent");
            let store = Store::open(&profile).unwrap();
            let recent = RecentFiles::open(&history).unwrap();
            let (old, new) = file(root.path());
            recent.remember_authorized(&old).unwrap();
            let before = fs::read(history.join("history.json")).unwrap();
            let migrating = FilePreferencesHost::default();
            let ticket = prepared(&migrating, &store);
            store
                .transaction(|state| {
                    change(state, 0, PreferenceChange::NoRecentFiles(true))?;
                    if reenable {
                        change(state, 1, PreferenceChange::NoRecentFiles(false))?;
                    }
                    Ok(((), true))
                })
                .unwrap();
            fs::rename(&old, &new).unwrap();
            let calls = AtomicUsize::new(0);
            assert!(!migrating
                .migrate_rename_in_store(
                    &store,
                    ticket,
                    || {},
                    || {
                        calls.fetch_add(1, Ordering::SeqCst);
                        recent
                            .rename_authorized_if_recorded(&old, &new)
                            .map_err(|e| e.to_string())
                    }
                )
                .unwrap());
            assert_eq!(calls.load(Ordering::SeqCst), 0);
            assert_eq!(fs::read(history.join("history.json")).unwrap(), before);
        }
    }

    #[test]
    fn disabling_between_durable_barrier_and_migration_skips_the_index() {
        let root = tempfile::tempdir().unwrap();
        let profile = root.path().join("preferences");
        let history = root.path().join("recent");
        let store = Store::open(&profile).unwrap();
        let recent = RecentFiles::open(&history).unwrap();
        let (old, new) = file(root.path());
        recent.remember_authorized(&old).unwrap();
        let before = fs::read(history.join("history.json")).unwrap();
        let host = FilePreferencesHost::default();
        let ticket = prepared(&host, &store);
        fs::rename(&old, &new).unwrap();
        let calls = AtomicUsize::new(0);
        assert!(!host
            .migrate_rename_in_store(
                &store,
                ticket,
                || {
                    Store::open(&profile)
                        .unwrap()
                        .transaction(|state| {
                            change(state, state.revision, PreferenceChange::NoRecentFiles(true))?;
                            Ok(((), true))
                        })
                        .unwrap();
                },
                || {
                    calls.fetch_add(1, Ordering::SeqCst);
                    recent
                        .rename_authorized_if_recorded(&old, &new)
                        .map_err(|e| e.to_string())
                }
            )
            .unwrap());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        assert_eq!(fs::read(history.join("history.json")).unwrap(), before);
    }

    #[test]
    fn actual_recent_store_failure_keeps_durable_invalidation_for_an_independent_host() {
        let root = tempfile::tempdir().unwrap();
        let profile = root.path().join("preferences");
        let history = root.path().join("recent");
        let store = Store::open(&profile).unwrap();
        let recent = RecentFiles::open(&history).unwrap();
        let (old, new) = file(root.path());
        recent.remember_authorized(&old).unwrap();
        let old_host = FilePreferencesHost::default();
        let old_ticket = prepared(&old_host, &store);
        let host = FilePreferencesHost::default();
        let rename_ticket = prepared(&host, &store);
        fs::rename(&old, &new).unwrap();
        fs::write(history.join("history.json"), b"{bad evidence").unwrap();
        assert!(host
            .migrate_rename_in_store(
                &store,
                rename_ticket,
                || {},
                || {
                    recent
                        .rename_authorized_if_recorded(&old, &new)
                        .map_err(|e| e.to_string())
                }
            )
            .is_err());
        let still_allowed = Store::open(&profile)
            .unwrap()
            .transaction(|state| Ok((old_host.current_ticket(state, old_ticket), false)))
            .unwrap();
        assert!(!still_allowed);
        assert_eq!(
            fs::read(history.join("history.json")).unwrap(),
            b"{bad evidence"
        );
        assert_eq!(fs::read(&new).unwrap(), b"\xef\xbb\xbfsource\r\n ");
    }

    #[test]
    fn failed_epoch_publication_never_calls_the_second_store() {
        let root = tempfile::tempdir().unwrap();
        let store = Store::open(root.path()).unwrap();
        let host = FilePreferencesHost::default();
        let ticket = prepared(&host, &store);
        for index in 0..8 {
            fs::write(root.path().join(format!(".pending-{index}")), b"evidence").unwrap();
        }
        let calls = AtomicUsize::new(0);
        assert!(host
            .migrate_rename_in_store(
                &store,
                ticket,
                || {},
                || {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Ok(true)
                }
            )
            .is_err());
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        for index in 0..8 {
            assert_eq!(
                fs::read(root.path().join(format!(".pending-{index}"))).unwrap(),
                b"evidence"
            );
        }
    }

    #[test]
    fn independent_confirmed_renames_do_not_cancel_each_others_migration() {
        let root = tempfile::tempdir().unwrap();
        let profile = root.path().join("preferences");
        let store = Store::open(&profile).unwrap();
        let recent = RecentFiles::open(&root.path().join("recent")).unwrap();
        let (old_a, new_a) = file(root.path());
        let old_b = old_a.with_file_name("Untitled 1.md");
        let new_b = old_a.with_file_name("second-final.md");
        fs::write(&old_b, b"second source").unwrap();
        let a = recent.remember_authorized(&old_a).unwrap();
        let b = recent.remember_authorized(&old_b).unwrap();
        let first = FilePreferencesHost::default();
        let second = FilePreferencesHost::default();
        let a_ticket = prepared(&first, &store);
        let b_ticket = prepared(&second, &store);
        fs::rename(&old_a, &new_a).unwrap();
        fs::rename(&old_b, &new_b).unwrap();
        assert!(first
            .migrate_rename_in_store(
                &store,
                a_ticket,
                || {
                    assert!(second
                        .migrate_rename_in_store(
                            &Store::open(&profile).unwrap(),
                            b_ticket,
                            || {},
                            || {
                                recent
                                    .rename_authorized_if_recorded(&old_b, &new_b)
                                    .map_err(|e| e.to_string())
                            }
                        )
                        .unwrap());
                },
                || {
                    recent
                        .rename_authorized_if_recorded(&old_a, &new_a)
                        .map_err(|e| e.to_string())
                }
            )
            .unwrap());
        let after = recent.list().unwrap();
        assert_eq!(after.entries.len(), 2);
        assert_eq!(
            after
                .entries
                .iter()
                .find(|entry| entry.id == a.id)
                .unwrap()
                .path,
            new_a.to_str().unwrap()
        );
        assert_eq!(
            after
                .entries
                .iter()
                .find(|entry| entry.id == b.id)
                .unwrap()
                .path,
            new_b.to_str().unwrap()
        );
        assert_eq!(fs::read(new_b).unwrap(), b"second source");
        assert_eq!(fs::read(new_a).unwrap(), b"\xef\xbb\xbfsource\r\n ");
    }

    #[test]
    fn a_second_rename_dispatched_before_the_first_can_prepare_after_its_migration() {
        let root = tempfile::tempdir().unwrap();
        let store = Store::open(&root.path().join("preferences")).unwrap();
        let recent = RecentFiles::open(&root.path().join("recent")).unwrap();
        let (old_a, new_a) = file(root.path());
        let old_b = old_a.with_file_name("Untitled 1.md");
        let new_b = old_a.with_file_name("second.md");
        fs::write(&old_b, b"B").unwrap();
        recent.remember_authorized(&old_a).unwrap();
        recent.remember_authorized(&old_b).unwrap();
        let host = FilePreferencesHost::default();
        let first_ticket = prepared(&host, &store);
        let early_request = host.history_request();
        fs::rename(&old_a, &new_a).unwrap();
        assert!(host
            .migrate_rename_in_store(
                &store,
                first_ticket,
                || {},
                || {
                    recent
                        .rename_authorized_if_recorded(&old_a, &new_a)
                        .map_err(|e| e.to_string())
                }
            )
            .unwrap());
        let second_ticket = store
            .transaction(|state| Ok((host.ticket(state, early_request), false)))
            .unwrap()
            .expect("another rename did not invalidate this dispatch");
        fs::rename(&old_b, &new_b).unwrap();
        assert!(host
            .migrate_rename_in_store(
                &store,
                second_ticket,
                || {},
                || {
                    recent
                        .rename_authorized_if_recorded(&old_b, &new_b)
                        .map_err(|e| e.to_string())
                }
            )
            .unwrap());
        assert!(recent
            .list()
            .unwrap()
            .entries
            .iter()
            .all(|entry| entry.path == new_a.to_str().unwrap()
                || entry.path == new_b.to_str().unwrap()));
    }

    #[test]
    fn a_legacy_manifest_defaults_the_new_epoch_without_changing_public_revision_or_reset_epoch() {
        let root = tempfile::tempdir().unwrap();
        let profile = root.path().join("preferences");
        let store = Store::open(&profile).unwrap();
        let mut legacy = serde_json::to_value(Stored::default()).unwrap();
        assert!(legacy
            .as_object_mut()
            .unwrap()
            .remove("rememberEpoch")
            .is_some());
        fs::write(
            profile.join("preferences.json"),
            serde_json::to_vec(&legacy).unwrap(),
        )
        .unwrap();
        let recent = RecentFiles::open(&root.path().join("recent")).unwrap();
        let (old, new) = file(root.path());
        recent.remember_authorized(&old).unwrap();
        let host = FilePreferencesHost::default();
        let ticket = prepared(&host, &store);
        fs::rename(&old, &new).unwrap();
        assert!(host
            .migrate_rename_in_store(
                &store,
                ticket,
                || {},
                || {
                    recent
                        .rename_authorized_if_recorded(&old, &new)
                        .map_err(|e| e.to_string())
                }
            )
            .unwrap());
        store
            .transaction(|state| {
                assert_eq!(state.revision, 0);
                assert_eq!(state.history_epoch, 0);
                assert_eq!(state.remember_epoch, 1);
                let dto = serde_json::to_value(state.snapshot(true)).unwrap();
                assert!(dto.get("rememberEpoch").is_none());
                assert!(dto.get("historyEpoch").is_none());
                Ok(((), false))
            })
            .unwrap();
    }
}
