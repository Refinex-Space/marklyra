pub(crate) mod rename;

use crate::window_services::WindowServices;
use document_service::DocumentPayload;
use recent_files::{RecentEntry, RecentFiles, RecentListing};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::WebviewWindow;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default, Clone)]
pub struct RecentFilesHost {
    store: Arc<Mutex<Option<RecentFiles>>>,
    menu_request: Arc<AtomicU64>,
}
impl RecentFilesHost {
    fn with<T>(
        &self,
        app: &AppHandle,
        operation: impl FnOnce(&RecentFiles) -> Result<T, recent_files::RecentError>,
    ) -> Result<T, String> {
        let mut store = self.store.lock().map_err(|_| "最近文件状态不可用")?;
        if store.is_none() {
            let root = crate::app_paths::data_dir(app)?.join("recent-files");
            *store = Some(RecentFiles::open(&root).map_err(|error| error.to_string())?);
        }
        operation(store.as_ref().ok_or("最近文件存储初始化失败")?)
            .map_err(|error| error.to_string())
    }
}
fn changed(app: &AppHandle) {
    let _ = app.emit("recent-files-changed", ());
    refresh_native_menu(app);
}

/// The disk work finishes before scheduling native UI work. A later request
/// supersedes a slow earlier refresh, including corruption/error responses.
pub(crate) fn refresh_native_menu(app: &AppHandle) {
    let host = app.state::<RecentFilesHost>().inner().clone();
    let ticket = host.menu_request.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let listing = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .recording(&app, |enabled| {
                let mut listing = host.with(&app, RecentFiles::list)?;
                if !enabled {
                    listing.entries.clear();
                }
                Ok(listing)
            });
        if let Err(error) = &listing {
            eprintln!("Recent file menu unavailable: {error}");
        }
        let ui_app = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if ticket != host.menu_request.load(Ordering::SeqCst) {
                return;
            }
            if let Err(error) = crate::menu::recent::update(&ui_app, listing.as_ref().ok()) {
                eprintln!("Recent file menu update failed: {error}");
            }
        }) {
            eprintln!("Recent file menu dispatch failed: {error}");
        }
    });
}

#[tauri::command]
pub async fn list_recent_files(
    app: AppHandle,
    recent_files: State<'_, RecentFilesHost>,
) -> Result<RecentListing, String> {
    let host = recent_files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<crate::file_preferences::FilePreferencesHost>()
            .recording(&app, |enabled| {
                let mut listing = host.with(&app, RecentFiles::list)?;
                if !enabled {
                    listing.entries.clear();
                }
                Ok(listing)
            })
    })
    .await
    .map_err(|_| "读取最近文件任务未完成".to_owned())?
}
#[tauri::command]
pub async fn remember_recent_file(
    app: AppHandle,
    document_id: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
    recent_files: State<'_, RecentFilesHost>,
) -> Result<Option<RecentEntry>, String> {
    let host = recent_files.inner().clone();
    let preferences = app
        .state::<crate::file_preferences::FilePreferencesHost>()
        .inner()
        .clone();
    let request = preferences.history_request();
    services.get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        let ticket = preferences.prepare_history(&app, request)?;
        let path = window
            .state::<WindowServices>()
            .write_document(window.label(), |documents| {
                documents.authorized_path(&document_id)
            })?;
        let entry = match ticket {
            Some(ticket) => preferences.commit_history(&app, ticket, || {
                host.with(&app, |store| store.remember_authorized(&path))
            })?,
            None => None,
        };
        changed(&app);
        Ok(entry)
    })
    .await
    .map_err(|_| "记录最近文件任务未完成".to_owned())?
}
#[tauri::command]
pub async fn open_recent_file(
    app: AppHandle,
    id: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
    recent_files: State<'_, RecentFilesHost>,
) -> Result<DocumentPayload, String> {
    let host = recent_files.inner().clone();
    services.get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        window
            .state::<WindowServices>()
            .mutate_document(window.label(), |documents| {
                let target = app
                    .state::<crate::file_preferences::FilePreferencesHost>()
                    .recording(&app, |enabled| {
                        if !enabled {
                            return Err("最近文件记录已关闭，请通过打开对话框选择文件".into());
                        }
                        host.with(&app, |store| store.resolve(&id))
                    })?;
                documents
                    .open_in_directory(target.directory, &target.name, target.display_path)
                    .map_err(|error| {
                        format!("无法打开最近文件：{error}。当前稿件和最近记录均保留。")
                    })
            })
    })
    .await
    .map_err(|_| "打开最近文件任务未完成".to_owned())?
}
#[tauri::command]
pub async fn remove_recent_file(
    app: AppHandle,
    id: String,
    recent_files: State<'_, RecentFilesHost>,
) -> Result<RecentListing, String> {
    let host = recent_files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let listing = host.with(&app, |store| store.remove(&id))?;
        changed(&app);
        Ok(listing)
    })
    .await
    .map_err(|_| "移除最近记录任务未完成".to_owned())?
}
#[tauri::command]
pub async fn clear_recent_files(
    app: AppHandle,
    recent_files: State<'_, RecentFilesHost>,
) -> Result<RecentListing, String> {
    let host = recent_files.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let listing = host.with(&app, RecentFiles::clear)?;
        changed(&app);
        Ok(listing)
    })
    .await
    .map_err(|_| "清空最近记录任务未完成".to_owned())?
}

pub(crate) fn clear_from_preferences(app: &AppHandle) -> Result<(), String> {
    app.state::<RecentFilesHost>()
        .with(app, RecentFiles::clear)?;
    // Caller owns the file-preference gate. Schedule menu work only after it returns.
    let _ = app.emit("recent-files-changed", ());
    refresh_native_menu(app);
    Ok(())
}
