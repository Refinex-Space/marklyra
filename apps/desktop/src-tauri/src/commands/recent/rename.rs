//! No IPC command: only a confirmed native creation-rename receipt may call this.
use crate::file_preferences::{FilePreferencesHost, HistoryTicket};
use std::path::Path;
use tauri::{AppHandle, Manager};

pub(crate) fn prepare_subtree(
    app: &AppHandle,
    old: &Path,
    new: &Path,
    subtree: bool,
) -> Result<recent_files::RecentRenamePlan, String> {
    app.state::<super::RecentFilesHost>().with(app, |store| {
        store.prepare_rename_authorized(old, new, subtree)
    })
}
pub(crate) fn prepare_moves(
    app: &AppHandle,
    moves: &[(&Path, &Path, bool)],
) -> Result<recent_files::RecentRenamePlan, String> {
    app.state::<super::RecentFilesHost>()
        .with(app, |store| store.prepare_moves_authorized(moves))
}
pub(crate) fn commit_subtree(
    app: &AppHandle,
    plan: recent_files::RecentRenamePlan,
) -> Result<recent_files::RecentRenameReport, String> {
    app.state::<super::RecentFilesHost>()
        .with(app, |store| store.commit_rename_authorized(plan))
}

pub(crate) fn migrate_creation_rename(
    app: &AppHandle,
    old_path: &Path,
    new_path: &Path,
    ticket: Option<HistoryTicket>,
) -> Result<bool, String> {
    if old_path == new_path {
        return Ok(false);
    }
    let result = app
        .state::<FilePreferencesHost>()
        .migrate_recent_rename(app, ticket, || {
            app.state::<super::RecentFilesHost>().with(app, |store| {
                store.rename_authorized_if_recorded(old_path, new_path)
            })
        });
    // All storage/profile gates have been released before UI/menu work.
    super::changed(app);
    result.map_err(|error| {
        format!("文件已完成命名，但最近记录迁移未能确认：{error}。未回滚文件或重复记录路径。")
    })
}
