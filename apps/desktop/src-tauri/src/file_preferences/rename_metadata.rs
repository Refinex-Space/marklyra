use super::*;
use crate::rename_metadata::RenameInput;

pub(crate) struct FolderRenamePlan {
    epoch: u64,
    request: HistoryRequest,
    disabled: bool,
    changes: Vec<(Folder, Folder)>,
    pub(crate) warnings: Vec<String>,
}

impl FolderRenamePlan {
    pub(crate) fn map_move_books(&mut self, mapping: &crate::move_metadata::MoveBookmarkMappings) {
        for (_, next) in &mut self.changes {
            if let Some(book) = &mut next.bookmark {
                *book = mapping.directory(book);
                next.path = book.path().to_string_lossy().into_owned();
            }
        }
    }
}

impl FilePreferencesHost {
    pub(crate) fn prepare_rename_metadata(
        &self,
        app: &AppHandle,
        input: &RenameInput,
    ) -> Result<(Option<HistoryTicket>, FolderRenamePlan), String> {
        self.with(app, |store| {
            self.prepare_rename_metadata_in_store(store, input)
        })
    }
    fn prepare_rename_metadata_in_store(
        &self,
        store: &Store,
        input: &RenameInput,
    ) -> Result<(Option<HistoryTicket>, FolderRenamePlan), String> {
        let (snapshot, ticket, request) = store.transaction(|state| {
            let request = self.history_request();
            let recording = self.ticket(state, request).is_some();
            if recording {
                state.remember_epoch = state
                    .remember_epoch
                    .checked_add(1)
                    .filter(|epoch| *epoch <= MAX_REVISION)
                    .ok_or("最近文件记忆版本已达上限")?;
            }
            Ok((
                (state.clone(), self.ticket(state, request), request),
                recording,
            ))
        })?;
        let mut changes = vec![];
        let mut warnings = vec![];
        for folder in &snapshot.folders {
            if snapshot.no_recent_files && !folder.pinned {
                continue;
            }
            let Some(book) = &folder.bookmark else {
                continue;
            };
            match input.directory(book) {
                Ok(Some(mapped)) => {
                    let mut next = folder.clone();
                    next.path = mapped.path().to_str().ok_or("目录名称不受支持")?.to_owned();
                    next.bookmark = Some(mapped);
                    changes.push((folder.clone(), next));
                }
                Ok(None) => {}
                Err(error) => warnings.push(format!("一个旧目录记录无法验证，保持原授权：{error}")),
            }
        }
        let plan = FolderRenamePlan {
            epoch: snapshot.history_epoch,
            request,
            disabled: snapshot.no_recent_files,
            changes,
            warnings,
        };
        Ok((ticket, plan))
    }
    pub(crate) fn commit_rename_history<T>(
        &self,
        app: &AppHandle,
        ticket: HistoryTicket,
        operation: impl FnOnce() -> Result<T, String>,
    ) -> Result<Option<T>, String> {
        self.with(app, |store| {
            store.transaction(|state| {
                let allowed = state.history_epoch == ticket.epoch
                    && self.ticket(state, ticket.request).is_some();
                Ok((if allowed { Some(operation()?) } else { None }, false))
            })
        })
    }
    pub(crate) fn commit_folder_rename(
        &self,
        app: &AppHandle,
        plan: FolderRenamePlan,
    ) -> Result<(), String> {
        self.with(app, |store| self.commit_folder_rename_in_store(store, plan))
    }
    fn commit_folder_rename_in_store(
        &self,
        store: &Store,
        plan: FolderRenamePlan,
    ) -> Result<(), String> {
        store.transaction(|state| {
            if state.history_epoch != plan.epoch
                || state.no_recent_files != plan.disabled
                || self.history_request().0 != plan.request.0
            {
                return Ok(((), false));
            }
            let mut changed = false;
            for (expected, replacement) in plan.changes {
                if let Some(current) = state.folders.iter_mut().find(|folder| **folder == expected)
                {
                    *current = replacement;
                    changed = true;
                }
            }
            if changed {
                directories::advance_revision(state)?;
            }
            Ok(((), changed))
        })
    }
}

#[cfg(test)]
mod tests;
