//! Native confirmation-only preference; not an editable FilePreferences key.
//! Older profiles default false. After this version writes the new field, an
//! older deny_unknown_fields reader cannot reopen that profile; validation
//! candidates must keep their separate profile instead of downgrading it.
use super::{storage::Store, FilePreferencesHost};
use tauri::AppHandle;

impl FilePreferencesHost {
    pub(crate) fn move_warning_suppressed(&self, app: &AppHandle) -> Result<bool, String> {
        self.with(app, |store| {
            store.transaction(|state| Ok((state.move_warning_suppressed, false)))
        })
    }
    pub(crate) fn suppress_move_warning(&self, app: &AppHandle) -> Result<(), String> {
        self.with(app, |store| {
            store.transaction(|state| {
                let changed = !state.move_warning_suppressed;
                state.move_warning_suppressed = true;
                Ok(((), changed))
            })
        })
    }
    pub(crate) fn reset_trash_warning(&self, app: &AppHandle) -> Result<(), String> {
        self.with(app, reset_in_store)
    }
    pub(crate) fn trash_warning_suppressed(&self, app: &AppHandle) -> Result<bool, String> {
        self.with(app, suppressed_in_store)
    }

    /// Called only after the real native confirmation returned confirmed=true
    /// with its checkbox selected. Never infer consent from a Trash result.
    /// Persistence errors are preference warnings; the caller must not reclassify
    /// an already confirmed filesystem mutation as uncommitted or replay it.
    pub(crate) fn suppress_trash_warning(&self, app: &AppHandle) -> Result<(), String> {
        self.with(app, suppress_in_store)
    }
}

fn suppressed_in_store(store: &Store) -> Result<bool, String> {
    store.transaction(|state| Ok((state.trash_warning_suppressed, false)))
}

fn suppress_in_store(store: &Store) -> Result<(), String> {
    // The transaction reloads latest state under both process and file locks;
    // no stale public preference snapshot can erase another mutation.
    store.transaction(|state| {
        let changed = !state.trash_warning_suppressed;
        state.trash_warning_suppressed = true;
        Ok(((), changed))
    })
}

#[cfg(test)]
mod tests;

fn reset_in_store(store: &Store) -> Result<(), String> {
    store.transaction(|state| {
        let changed = state.trash_warning_suppressed || state.move_warning_suppressed;
        state.trash_warning_suppressed = false;
        state.move_warning_suppressed = false;
        Ok(((), changed))
    })
}
