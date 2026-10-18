//! App-owned file behavior and directory-history metadata. No source text or renderer paths.
pub mod directories;
pub(crate) mod file_types;
mod recent_rename;
pub(crate) mod rename_metadata;
mod storage;
#[cfg(test)]
mod tests;
mod trash_warning;

use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use storage::Store;
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};

const MAX_REVISION: u64 = 9_007_199_254_740_991;
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Folder {
    id: String,
    path: String,
    pinned: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bookmark: Option<document_service::DirectoryBookmark>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stored {
    schema_version: u32,
    revision: u64,
    #[serde(default)]
    history_epoch: u64,
    #[serde(default)]
    remember_epoch: u64,
    default_extension: String,
    #[serde(default)]
    disabled_file_types: Vec<String>,
    #[serde(default)]
    custom_file_extensions: Vec<String>,
    save_file_on_switch: bool,
    no_recent_files: bool,
    #[serde(default)]
    action_when_drop_file: DropAction,
    #[serde(default)]
    action_when_drop_folder: DropAction,
    #[serde(default)]
    action_when_drop_import: DropAction,
    #[serde(default)]
    trash_warning_suppressed: bool,
    #[serde(default)]
    move_warning_suppressed: bool,
    folders: Vec<Folder>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    directory_history: Option<directories::DirectoryOrder>,
}
impl Default for Stored {
    fn default() -> Self {
        Self {
            schema_version: 1,
            revision: 0,
            history_epoch: 0,
            remember_epoch: 0,
            default_extension: "md".into(),
            disabled_file_types: Vec::new(),
            custom_file_extensions: Vec::new(),
            save_file_on_switch: false,
            no_recent_files: false,
            action_when_drop_file: DropAction::Open,
            action_when_drop_folder: DropAction::Open,
            action_when_drop_import: DropAction::Open,
            trash_warning_suppressed: false,
            move_warning_suppressed: false,
            folders: Vec::new(),
            directory_history: None,
        }
    }
}
impl Stored {
    fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1
            || self.revision > MAX_REVISION
            || self.history_epoch > MAX_REVISION
            || self.remember_epoch > MAX_REVISION
            || !valid_extension(&self.default_extension)
            || self.folders.len() > 32
        {
            return Err("文件偏好损坏或版本不受支持，既有数据未修改".into());
        }
        let mut ids = std::collections::HashSet::new();
        let mut paths = std::collections::HashSet::new();
        for folder in &self.folders {
            if uuid::Uuid::parse_str(&folder.id).is_err()
                || !ids.insert(&folder.id)
                || !paths.insert(&folder.path)
                || !Path::new(&folder.path).is_absolute()
                || folder.path.len() > 4096
                || folder.path.contains('\0')
            {
                return Err("目录历史记录无效，既有数据未修改".into());
            }
            if let Some(bookmark) = &folder.bookmark {
                bookmark.validate().map_err(|error| error.to_string())?;
                if bookmark.path() != Path::new(&folder.path) {
                    return Err("目录历史授权与显示路径不一致".into());
                }
            }
        }
        self.validate_file_types()?;
        directories::validate_order(self)?;
        Ok(())
    }
    fn advance_history(&mut self) -> Result<(), String> {
        self.history_epoch = self
            .history_epoch
            .checked_add(1)
            .filter(|value| *value <= MAX_REVISION)
            .ok_or("历史记录版本已达上限")?;
        Ok(())
    }
    fn snapshot(&self, always_confirms_changes: bool) -> FilePreferences {
        FilePreferences {
            revision: self.revision,
            default_extension: self.default_extension.clone(),
            disabled_file_types: self.disabled_file_types.clone(),
            supported_file_types: self.document_types().catalog(),
            save_file_on_switch: self.save_file_on_switch,
            no_recent_files: self.no_recent_files,
            action_when_drop_file: self.action_when_drop_file,
            action_when_drop_folder: self.action_when_drop_folder,
            action_when_drop_import: self.action_when_drop_import,
            always_confirms_changes,
        }
    }
}
pub(crate) fn valid_extension(value: &str) -> bool {
    value.len() <= 128
        && (value.is_empty()
            || value.split('.').all(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            }))
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub enum DropAction {
    #[default]
    #[serde(rename = "")]
    Open,
    #[serde(rename = "link")]
    Link,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreferences {
    pub revision: u64,
    pub default_extension: String,
    pub disabled_file_types: Vec<String>,
    pub supported_file_types: Vec<String>,
    pub save_file_on_switch: bool,
    pub no_recent_files: bool,
    pub action_when_drop_file: DropAction,
    pub action_when_drop_folder: DropAction,
    pub action_when_drop_import: DropAction,
    pub always_confirms_changes: bool,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "key", content = "value", deny_unknown_fields)]
pub enum PreferenceChange {
    #[serde(rename = "defaultExtension")]
    DefaultExtension(String),
    #[serde(rename = "disabledFileTypes")]
    DisabledFileTypes(Vec<String>),
    #[serde(rename = "save_file_on_switch")]
    SaveFileOnSwitch(bool),
    #[serde(rename = "noRecentFiles")]
    NoRecentFiles(bool),
    #[serde(rename = "actionWhenDropFile")]
    DropFile(DropAction),
    #[serde(rename = "actionWhenDropFolder")]
    DropFolder(DropAction),
    #[serde(rename = "actionWhenDropImport")]
    DropImport(DropAction),
}
fn change(state: &mut Stored, expected: u64, change: PreferenceChange) -> Result<(), String> {
    if state.revision != expected {
        return Err("文件偏好已由其他窗口修改，请关闭后重新打开设置".into());
    }
    match change {
        PreferenceChange::DropFile(action) => state.action_when_drop_file = action,
        PreferenceChange::DropFolder(action) => state.action_when_drop_folder = action,
        PreferenceChange::DropImport(action) => state.action_when_drop_import = action,
        PreferenceChange::DefaultExtension(extension) if valid_extension(&extension) => {
            state.default_extension = extension;
            state.remember_custom_type()?;
            let catalog = state.document_types().catalog();
            state.disabled_file_types.retain(|id| catalog.contains(id));
            state.document_types().require(Path::new(&format!(
                "Untitled.{}",
                state.document_types().custom_extension
            )))?;
        }
        PreferenceChange::DisabledFileTypes(disabled) => state.set_disabled_file_types(disabled)?,
        PreferenceChange::DefaultExtension(_) => return Err("默认扩展名无效".into()),
        PreferenceChange::SaveFileOnSwitch(enabled) => state.save_file_on_switch = enabled,
        PreferenceChange::NoRecentFiles(disabled) => {
            if state.no_recent_files != disabled {
                state.advance_history()?;
                directories::advance_revision(state)?;
            }
            state.no_recent_files = disabled;
        }
    }
    state.revision = state
        .revision
        .checked_add(1)
        .filter(|revision| *revision <= MAX_REVISION)
        .ok_or("文件偏好版本已达上限")?;
    Ok(())
}
#[derive(Default, Clone)]
pub struct FilePreferencesHost {
    store: Arc<Mutex<Option<Store>>>,
    clearing: Arc<std::sync::atomic::AtomicBool>,
    history_serial: Arc<std::sync::atomic::AtomicU64>,
}
#[derive(Clone, Copy)]
pub(crate) struct HistoryRequest(u64);
#[derive(Clone, Copy)]
pub(crate) struct HistoryTicket {
    request: HistoryRequest,
    epoch: u64,
    remember_epoch: u64,
}
impl FilePreferencesHost {
    pub(crate) fn history_request(&self) -> HistoryRequest {
        HistoryRequest(
            self.history_serial
                .load(std::sync::atomic::Ordering::Acquire),
        )
    }
    fn invalidate_history(&self) {
        self.history_serial
            .fetch_add(1, std::sync::atomic::Ordering::AcqRel);
    }
    fn ticket(&self, state: &Stored, request: HistoryRequest) -> Option<HistoryTicket> {
        (!state.no_recent_files && request.0 == self.history_request().0).then_some(HistoryTicket {
            request,
            epoch: state.history_epoch,
            remember_epoch: state.remember_epoch,
        })
    }
    fn current_ticket(&self, state: &Stored, ticket: HistoryTicket) -> bool {
        state.history_epoch == ticket.epoch
            && state.remember_epoch == ticket.remember_epoch
            && self.ticket(state, ticket.request).is_some()
    }
    pub(crate) fn prepare_history(
        &self,
        app: &AppHandle,
        request: HistoryRequest,
    ) -> Result<Option<HistoryTicket>, String> {
        self.with(app, |store| {
            store.transaction(|state| Ok((self.ticket(state, request), false)))
        })
    }
    pub(crate) fn commit_history<T>(
        &self,
        app: &AppHandle,
        ticket: HistoryTicket,
        operation: impl FnOnce() -> Result<T, String>,
    ) -> Result<Option<T>, String> {
        self.with(app, |store| {
            store.transaction(|state| {
                Ok((
                    if self.current_ticket(state, ticket) {
                        Some(operation()?)
                    } else {
                        None
                    },
                    false,
                ))
            })
        })
    }
}
struct ClearLease(Arc<std::sync::atomic::AtomicBool>);
impl Drop for ClearLease {
    fn drop(&mut self) {
        self.0.store(false, std::sync::atomic::Ordering::Release);
    }
}
impl FilePreferencesHost {
    fn clear_history(
        &self,
        store: &Store,
        include_pinned: bool,
        clear_files: impl FnOnce() -> Result<(), String>,
    ) -> Result<(), String> {
        // Invalidation is durable before touching another store. Later failure
        // cannot revive old tickets held by a different host or process.
        store.transaction(|state| {
            state.advance_history()?;
            directories::advance_revision(state)?;
            self.invalidate_history();
            Ok(((), true))
        })?;
        let mut files_cleared = false;
        let result = store.transaction(|state| {
            clear_files()?;
            files_cleared = true;
            directories::clear_folders(state, include_pinned)?;
            Ok(((), true))
        });
        result.map_err(|error| {
            if files_cleared {
                format!(
                    "最近文件记录已清除，但目录记录清除未能确认：{error}。原文档和恢复副本未删除。"
                )
            } else {
                error
            }
        })
    }
    fn begin_clear(&self) -> Result<ClearLease, String> {
        self.clearing
            .compare_exchange(
                false,
                true,
                std::sync::atomic::Ordering::AcqRel,
                std::sync::atomic::Ordering::Acquire,
            )
            .map_err(|_| "已有清除确认等待处理")?;
        Ok(ClearLease(self.clearing.clone()))
    }
    fn with<T>(
        &self,
        app: &AppHandle,
        operation: impl FnOnce(&Store) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut store = self.store.lock().map_err(|_| "文件偏好状态不可用")?;
        if store.is_none() {
            let root = crate::app_paths::data_dir(app)?.join("file-preferences");
            *store = Some(Store::open(&root)?);
        }
        operation(store.as_ref().ok_or("文件偏好尚未初始化")?)
    }
    pub(crate) fn recording<T>(
        &self,
        app: &AppHandle,
        operation: impl FnOnce(bool) -> Result<T, String>,
    ) -> Result<T, String> {
        self.with(app, |store| {
            store.transaction(|state| Ok((operation(!state.no_recent_files)?, false)))
        })
    }
    pub(crate) fn document_types(
        &self,
        app: &AppHandle,
    ) -> Result<file_types::DocumentTypes, String> {
        self.with(app, |store| {
            store.transaction(|state| Ok((state.document_types(), false)))
        })
    }
    pub(crate) fn require_document_type(&self, app: &AppHandle, path: &Path) -> Result<(), String> {
        self.document_types(app)?.require(path)
    }
    pub(crate) fn default_extension(&self, app: &AppHandle) -> Result<String, String> {
        self.with(app, |store| {
            store.transaction(|state| {
                Ok((
                    if state.default_extension.is_empty() {
                        "md".into()
                    } else {
                        state.default_extension.clone()
                    },
                    false,
                ))
            })
        })
    }
}
#[cfg(target_os = "macos")]
fn always_confirms_changes() -> bool {
    objc2_foundation::NSUserDefaults::standardUserDefaults().boolForKey(
        &objc2_foundation::NSString::from_str("NSCloseAlwaysConfirmsChanges"),
    )
}
#[cfg(not(target_os = "macos"))]
fn always_confirms_changes() -> bool {
    true
}
fn require_host(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "preferences"
        || window
            .state::<crate::window_services::WindowServices>()
            .contains(window.label())
    {
        Ok(())
    } else {
        Err("文件偏好仅供受信任的应用窗口使用".into())
    }
}
#[tauri::command]
pub async fn get_file_preferences(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, FilePreferencesHost>,
) -> Result<FilePreferences, String> {
    require_host(&window)?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        host.with(&app, |store| {
            store.transaction(|state| Ok((state.snapshot(always_confirms_changes()), false)))
        })
    })
    .await
    .map_err(|_| "读取文件偏好任务未完成")?
}
#[tauri::command]
pub async fn put_file_preference(
    app: AppHandle,
    window: WebviewWindow,
    expected_revision: u64,
    change: PreferenceChange,
    host: State<'_, FilePreferencesHost>,
) -> Result<FilePreferences, String> {
    require_host(&window)?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = host.with(&app, |store| {
            store.transaction(|state| {
                let epoch = state.history_epoch;
                self::change(state, expected_revision, change)?;
                if epoch != state.history_epoch {
                    host.invalidate_history();
                }
                Ok((state.snapshot(always_confirms_changes()), true))
            })
        })?;
        let _ = app.emit("file-preferences-changed", &result);
        let _ = app.emit("workspace-files-changed", ());
        let _ = app.emit("recent-files-changed", ());
        let _ = app.emit("directory-history-changed", ());
        crate::commands::recent::refresh_native_menu(&app);
        Ok(result)
    })
    .await
    .map_err(|_| "保存文件偏好任务未完成")?
}
#[tauri::command]
pub async fn ask_clear_recent_history(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, FilePreferencesHost>,
) -> Result<bool, String> {
    require_host(&window)?;
    let generation = app
        .state::<crate::platform::ui_chrome::PreferencesHost>()
        .generation_for(window.label())?;
    let started = std::time::Instant::now();
    let host = host.inner().clone();
    let lease = host.begin_clear()?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        let choice = app
            .dialog()
            .message("清除最近使用的文件和目录？原文档、图片和恢复副本均保留。")
            .title("清除历史文件记录")
            .parent(&window)
            .buttons(MessageDialogButtons::YesNoCancelCustom(
                "最近记录".into(),
                "最近记录及固定目录".into(),
                "取消".into(),
            ))
            .blocking_show_with_result();
        let include_pinned = match choice {
            MessageDialogResult::Yes => false,
            MessageDialogResult::No => true,
            MessageDialogResult::Custom(ref label) if label == "最近记录" => false,
            MessageDialogResult::Custom(ref label) if label == "最近记录及固定目录" => {
                true
            }
            _ => return Ok(false),
        };
        if started.elapsed() >= std::time::Duration::from_secs(110) {
            return Err("清除确认已超时，历史记录未修改".into());
        }
        let result = app
            .state::<crate::platform::ui_chrome::PreferencesHost>()
            .with_generation(generation, || {
                host.with(&app, |store| {
                    host.clear_history(store, include_pinned, || {
                        crate::commands::recent::clear_from_preferences(&app)
                    })
                })
            });
        let _ = app.emit("directory-history-changed", ());
        result?;
        Ok(true)
    })
    .await
    .map_err(|_| "清除历史任务未完成")?
}
