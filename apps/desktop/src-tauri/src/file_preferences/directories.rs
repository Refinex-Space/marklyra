//! Ordered directory metadata and identity-backed capabilities. Renderer paths are display only.
use super::{Folder, HistoryRequest, HistoryTicket, Stored, MAX_REVISION};
use document_service::DirectoryBookmark;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, path::Path, sync::Arc};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DirectoryOrder {
    revision: u64,
    epoch: u64,
    recent_ids: Vec<String>,
    pinned_ids: Vec<String>,
}
fn legacy_order(state: &Stored) -> DirectoryOrder {
    DirectoryOrder {
        revision: 0,
        epoch: 0,
        recent_ids: state.folders.iter().map(|entry| entry.id.clone()).collect(),
        pinned_ids: state
            .folders
            .iter()
            .filter(|entry| entry.pinned)
            .map(|entry| entry.id.clone())
            .collect(),
    }
}
fn ensure_order(state: &mut Stored) {
    if state.directory_history.is_none() {
        state.directory_history = Some(legacy_order(state));
    }
}
fn ordering(state: &Stored) -> DirectoryOrder {
    state
        .directory_history
        .clone()
        .unwrap_or_else(|| legacy_order(state))
}
pub(super) fn validate_order(state: &Stored) -> Result<(), String> {
    let Some(order) = &state.directory_history else {
        return Ok(());
    };
    if order.revision > MAX_REVISION
        || order.epoch > MAX_REVISION
        || order.recent_ids.len() > 32
        || order.pinned_ids.len() > 32
    {
        return Err("目录历史顺序或版本无效".into());
    }
    let ids: HashSet<_> = state.folders.iter().map(|entry| &entry.id).collect();
    for list in [&order.recent_ids, &order.pinned_ids] {
        let mut seen = HashSet::new();
        if list.iter().any(|id| !ids.contains(id) || !seen.insert(id)) {
            return Err("目录历史顺序引用无效".into());
        }
    }
    if state.folders.iter().any(|entry| {
        entry.pinned != order.pinned_ids.contains(&entry.id)
            || (!order.pinned_ids.contains(&entry.id) && !order.recent_ids.contains(&entry.id))
    }) {
        return Err("目录历史成员不一致".into());
    }
    Ok(())
}
pub(super) fn advance_revision(state: &mut Stored) -> Result<(), String> {
    ensure_order(state);
    let order = state.directory_history.as_mut().ok_or("目录历史未初始化")?;
    order.revision = order
        .revision
        .checked_add(1)
        .filter(|n| *n <= MAX_REVISION)
        .ok_or("目录历史版本已达上限")?;
    Ok(())
}
fn advance_epoch(state: &mut Stored) -> Result<(), String> {
    ensure_order(state);
    let order = state.directory_history.as_mut().ok_or("目录历史未初始化")?;
    order.epoch = order
        .epoch
        .checked_add(1)
        .filter(|n| *n <= MAX_REVISION)
        .ok_or("目录历史操作代已达上限")?;
    Ok(())
}
fn prune(state: &mut Stored) {
    let order = ordering(state);
    state.folders.retain(|entry| {
        order.recent_ids.contains(&entry.id) || order.pinned_ids.contains(&entry.id)
    });
    for entry in &mut state.folders {
        entry.pinned = order.pinned_ids.contains(&entry.id);
    }
}
pub(super) fn clear_folders(state: &mut Stored, include_pinned: bool) -> Result<(), String> {
    ensure_order(state);
    let order = state.directory_history.as_mut().ok_or("目录历史未初始化")?;
    order.recent_ids.clear();
    if include_pinned {
        order.pinned_ids.clear();
    }
    prune(state);
    advance_revision(state)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum DirectoryHistoryTarget {
    History {
        id: String,
    },
    Workspace {
        #[serde(rename = "workspaceId")]
        workspace_id: String,
    },
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryHistoryEntry {
    target: DirectoryHistoryTarget,
    name: String,
    path: String,
    pinned: bool,
    current: bool,
    reopenable: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryHistoryCatalog {
    revision: u64,
    no_recent_files: bool,
    entries: Vec<DirectoryHistoryEntry>,
}
#[derive(Debug, Serialize)]
pub struct DirectoryHistoryVersion {
    revision: u64,
}
struct Current {
    id: String,
    selected: Arc<file_index::Workspace>,
    registry: crate::commands::workspaces::Workspaces,
    bookmark: DirectoryBookmark,
}
impl Current {
    fn capture(
        registry: crate::commands::workspaces::Workspaces,
        id: &str,
    ) -> Result<Self, String> {
        let selected = registry
            .lock()
            .map_err(|_| "目录状态不可用")?
            .get(id)
            .map_err(|error| error.to_string())?;
        let bookmark = selected.bookmark().map_err(|error| error.to_string())?;
        Ok(Self {
            id: id.into(),
            selected,
            registry,
            bookmark,
        })
    }
    fn verify(&self) -> Result<(), String> {
        let registry = self.registry.lock().map_err(|_| "目录状态不可用")?;
        self.verify_in(&registry)
    }
    fn verify_in(&self, registry: &file_index::WorkspaceRegistry) -> Result<(), String> {
        let selected = registry.get(&self.id).map_err(|error| error.to_string())?;
        if Arc::ptr_eq(&selected, &self.selected) {
            Ok(())
        } else {
            Err("工作目录已关闭或更换".into())
        }
    }
}
fn path(bookmark: &DirectoryBookmark) -> Result<String, String> {
    bookmark.validate().map_err(|error| error.to_string())?;
    bookmark
        .path()
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| "目录名称不受支持".into())
}
fn name(path: &str) -> String {
    let path = Path::new(path);
    path.file_name()
        .unwrap_or(path.as_os_str())
        .to_string_lossy()
        .into_owned()
}
fn expected(state: &Stored, revision: u64) -> Result<(), String> {
    if ordering(state).revision != revision {
        return Err("目录历史已由其他操作更改，请刷新后重试".into());
    }
    Ok(())
}
fn catalog(state: &Stored, current: Option<&Current>) -> DirectoryHistoryCatalog {
    let order = ordering(state);
    let current_path = current.and_then(|value| value.bookmark.path().to_str());
    let ids = order.pinned_ids.iter().chain(
        order
            .recent_ids
            .iter()
            .filter(|id| !state.no_recent_files && !order.pinned_ids.contains(id)),
    );
    let mut entries = Vec::new();
    for id in ids {
        if let Some(entry) = state.folders.iter().find(|entry| &entry.id == id) {
            let selected = Some(entry.path.as_str()) == current_path;
            entries.push(DirectoryHistoryEntry {
                target: if selected {
                    DirectoryHistoryTarget::Workspace {
                        workspace_id: current.map(|value| value.id.clone()).unwrap_or_default(),
                    }
                } else {
                    DirectoryHistoryTarget::History {
                        id: entry.id.clone(),
                    }
                },
                name: name(&entry.path),
                path: entry.path.clone(),
                pinned: entry.pinned,
                current: selected,
                reopenable: selected || entry.bookmark.is_some(),
            });
        }
    }
    if let Some(current) = current {
        if !entries.iter().any(|entry| entry.current) {
            let path = current.bookmark.path().to_string_lossy().into_owned();
            let pinned = state
                .folders
                .iter()
                .any(|entry| entry.path == path && entry.pinned);
            entries.push(DirectoryHistoryEntry {
                target: DirectoryHistoryTarget::Workspace {
                    workspace_id: current.id.clone(),
                },
                name: name(&path),
                path,
                pinned,
                current: true,
                reopenable: true,
            });
        }
    }
    DirectoryHistoryCatalog {
        revision: order.revision,
        no_recent_files: state.no_recent_files,
        entries,
    }
}
fn upsert(state: &mut Stored, bookmark: &DirectoryBookmark) -> Result<String, String> {
    let path = path(bookmark)?;
    if let Some(entry) = state.folders.iter_mut().find(|entry| entry.path == path) {
        entry.bookmark = Some(bookmark.clone());
        return Ok(entry.id.clone());
    }
    let id = uuid::Uuid::new_v4().to_string();
    state.folders.push(Folder {
        id: id.clone(),
        path,
        pinned: false,
        bookmark: Some(bookmark.clone()),
    });
    Ok(id)
}
fn target_id(
    state: &mut Stored,
    target: &DirectoryHistoryTarget,
    current: Option<&Current>,
    create: bool,
) -> Result<Option<String>, String> {
    match target {
        DirectoryHistoryTarget::History { id } => {
            if !state.folders.iter().any(|entry| entry.id == *id) {
                return Err("目录历史已移除，请刷新".into());
            }
            Ok(Some(id.clone()))
        }
        DirectoryHistoryTarget::Workspace { .. } => {
            let current = current.ok_or("目录授权不可用")?;
            current.verify()?;
            if create {
                upsert(state, &current.bookmark).map(Some)
            } else {
                Ok(state
                    .folders
                    .iter()
                    .find(|entry| entry.path == current.bookmark.path().to_string_lossy())
                    .map(|entry| entry.id.clone()))
            }
        }
    }
}
fn pin_state(
    state: &mut Stored,
    revision: u64,
    id: &str,
    pinned: bool,
) -> Result<DirectoryHistoryVersion, String> {
    expected(state, revision)?;
    if !state.folders.iter().any(|entry| entry.id == id) {
        return Err("目录历史已移除，请刷新".into());
    }
    ensure_order(state);
    let order = state.directory_history.as_mut().ok_or("目录历史未初始化")?;
    if state.no_recent_files {
        order.recent_ids.retain(|value| value != id);
        if !pinned {
            order.recent_ids.insert(0, id.into());
        }
    }
    order.pinned_ids.retain(|value| value != id);
    if pinned {
        order.pinned_ids.insert(0, id.into());
    }
    prune(state);
    if state.folders.len() > 32 {
        return Err("固定与最近目录已达32条安全上限，请先移除其他目录".into());
    }
    advance_epoch(state)?;
    advance_revision(state)?;
    Ok(DirectoryHistoryVersion {
        revision: ordering(state).revision,
    })
}
fn remove_state(
    state: &mut Stored,
    revision: u64,
    id: Option<&str>,
) -> Result<DirectoryHistoryVersion, String> {
    expected(state, revision)?;
    ensure_order(state);
    if let Some(id) = id {
        if !state.folders.iter().any(|entry| entry.id == id) {
            return Err("目录历史已移除，请刷新".into());
        }
        let order = state.directory_history.as_mut().ok_or("目录历史未初始化")?;
        order.pinned_ids.retain(|value| value != id);
        order.recent_ids.retain(|value| value != id);
        prune(state);
    }
    advance_epoch(state)?;
    advance_revision(state)?;
    Ok(DirectoryHistoryVersion {
        revision: ordering(state).revision,
    })
}
fn history_bookmark(state: &Stored, id: &str) -> Result<DirectoryBookmark, String> {
    state
        .folders
        .iter()
        .find(|entry| entry.id == id)
        .ok_or("目录历史已移除")?
        .bookmark
        .clone()
        .ok_or_else(|| "旧目录记录缺少身份授权，请重新选择该目录".into())
}

#[derive(Clone, Copy)]
pub(crate) struct FolderHistoryTicket {
    history: HistoryTicket,
    epoch: u64,
}
fn folder_ticket(
    host: &super::FilePreferencesHost,
    state: &Stored,
    request: HistoryRequest,
) -> Option<FolderHistoryTicket> {
    host.ticket(state, request)
        .map(|history| FolderHistoryTicket {
            history,
            epoch: ordering(state).epoch,
        })
}
fn remember_state(
    host: &super::FilePreferencesHost,
    state: &mut Stored,
    bookmark: &DirectoryBookmark,
    ticket: FolderHistoryTicket,
) -> Result<bool, String> {
    if !host.current_ticket(state, ticket.history) || ordering(state).epoch != ticket.epoch {
        return Ok(false);
    }
    ensure_order(state);
    let id = upsert(state, bookmark)?;
    let order = state.directory_history.as_mut().ok_or("目录历史未初始化")?;
    if !order.pinned_ids.contains(&id) {
        order.recent_ids.retain(|value| value != &id);
        order.recent_ids.insert(0, id.clone());
    }
    while state.folders.len() > 32 {
        let order = state.directory_history.as_mut().ok_or("目录历史未初始化")?;
        let expired = order
            .recent_ids
            .iter()
            .rev()
            .find(|value| !order.pinned_ids.contains(value))
            .cloned()
            .ok_or("目录历史已达上限")?;
        if expired == id {
            return Err("目录历史已达上限，现有固定项保留".into());
        }
        order.recent_ids.retain(|value| value != &expired);
        state.folders.retain(|entry| entry.id != expired);
    }
    prune(state);
    advance_revision(state)?;
    Ok(true)
}
impl super::FilePreferencesHost {
    pub(crate) fn prepare_folder_history(
        &self,
        app: &AppHandle,
        request: HistoryRequest,
    ) -> Result<Option<FolderHistoryTicket>, String> {
        self.with(app, |store| {
            store.transaction(|state| Ok((folder_ticket(self, state, request), false)))
        })
    }
    pub(crate) fn remember_workspace(
        &self,
        app: &AppHandle,
        bookmark: &DirectoryBookmark,
        ticket: Option<FolderHistoryTicket>,
    ) -> Result<(), String> {
        let Some(ticket) = ticket else {
            return Ok(());
        };
        bookmark.reopen().map_err(|error| error.to_string())?;
        self.with(app, |store| {
            store.transaction(|state| {
                let changed = remember_state(self, state, bookmark, ticket)?;
                Ok(((), changed))
            })
        })?;
        let _ = app.emit("directory-history-changed", ());
        Ok(())
    }
}

fn editor(window: &WebviewWindow) -> Result<(), String> {
    if crate::windows::is_editor(window) {
        Ok(())
    } else {
        Err("目录历史仅允许受信任编辑窗口访问".into())
    }
}
fn current(window: &WebviewWindow, id: Option<&str>) -> Result<Option<Current>, String> {
    id.map(|id| {
        Current::capture(
            window
                .state::<crate::window_services::WindowServices>()
                .get_workspaces(window.label())?,
            id,
        )
    })
    .transpose()
}
#[tauri::command]
pub async fn list_directory_history(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, super::FilePreferencesHost>,
    current_workspace_id: Option<String>,
) -> Result<DirectoryHistoryCatalog, String> {
    editor(&window)?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let current = current(&window, current_workspace_id.as_deref())?;
        host.with(&app, |store| {
            store.transaction(|state| {
                editor(&window)?;
                if let Some(current) = &current {
                    current.verify()?;
                }
                Ok((catalog(state, current.as_ref()), false))
            })
        })
    })
    .await
    .map_err(|_| "读取目录历史任务未完成")?
}
async fn mutate(
    app: AppHandle,
    window: WebviewWindow,
    host: super::FilePreferencesHost,
    revision: u64,
    target: DirectoryHistoryTarget,
    pin: Option<bool>,
) -> Result<DirectoryHistoryVersion, String> {
    editor(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let workspace = match &target {
            DirectoryHistoryTarget::Workspace { workspace_id } => {
                current(&window, Some(workspace_id))?
            }
            _ => None,
        };
        let result = host.with(&app, |store| {
            store.transaction(|state| {
                editor(&window)?;
                if host.clearing.load(std::sync::atomic::Ordering::Acquire) {
                    return Err("正在确认清除历史，请稍后重试".into());
                }
                expected(state, revision)?;
                ensure_order(state);
                let id = target_id(state, &target, workspace.as_ref(), pin.is_some())?;
                let result = if let Some(pin) = pin {
                    pin_state(state, revision, id.as_deref().ok_or("目录记录不存在")?, pin)?
                } else {
                    remove_state(state, revision, id.as_deref())?
                };
                Ok((result, true))
            })
        });
        let _ = app.emit("directory-history-changed", ());
        result
    })
    .await
    .map_err(|_| "更新目录历史任务未完成")?
}
#[tauri::command]
pub async fn pin_directory_history(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, super::FilePreferencesHost>,
    expected_revision: u64,
    target: DirectoryHistoryTarget,
    pinned: bool,
) -> Result<DirectoryHistoryVersion, String> {
    mutate(
        app,
        window,
        host.inner().clone(),
        expected_revision,
        target,
        Some(pinned),
    )
    .await
}
#[tauri::command]
pub async fn remove_directory_history(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, super::FilePreferencesHost>,
    expected_revision: u64,
    target: DirectoryHistoryTarget,
) -> Result<DirectoryHistoryVersion, String> {
    mutate(
        app,
        window,
        host.inner().clone(),
        expected_revision,
        target,
        None,
    )
    .await
}
fn publish_target<T>(
    state: &Stored,
    revision: u64,
    target: &DirectoryHistoryTarget,
    current: Option<&Current>,
    publish: impl FnOnce(
        DirectoryBookmark,
        Option<&mut file_index::WorkspaceRegistry>,
    ) -> Result<T, String>,
) -> Result<T, String> {
    expected(state, revision)?;
    match target {
        DirectoryHistoryTarget::Workspace { workspace_id } => {
            let current = current.ok_or("目录授权已失效")?;
            if workspace_id != &current.id {
                return Err("目录授权标识不匹配".into());
            }
            let mut registry = current.registry.lock().map_err(|_| "目录状态不可用")?;
            current.verify_in(&registry)?;
            current
                .bookmark
                .reopen()
                .map_err(|error| error.to_string())?;
            publish(current.bookmark.clone(), Some(&mut registry))
        }
        DirectoryHistoryTarget::History { id } => {
            let bookmark = history_bookmark(state, id)?;
            bookmark.reopen().map_err(|error| error.to_string())?;
            publish(bookmark, None)
        }
    }
}
fn resolve_with<T>(
    app: &AppHandle,
    window: &WebviewWindow,
    host: &super::FilePreferencesHost,
    revision: u64,
    target: &DirectoryHistoryTarget,
    publish: impl FnOnce(
        DirectoryBookmark,
        Option<&mut file_index::WorkspaceRegistry>,
    ) -> Result<T, String>,
) -> Result<T, String> {
    editor(window)?;
    let workspace = match target {
        DirectoryHistoryTarget::Workspace { workspace_id } => current(window, Some(workspace_id))?,
        _ => None,
    };
    host.with(app, |store| {
        store.transaction(|state| {
            editor(window)?;
            let result = publish_target(
                state,
                revision,
                target,
                workspace.as_ref(),
                |bookmark, registry| {
                    editor(window)?;
                    publish(bookmark, registry)
                },
            )?;
            editor(window)?;
            Ok((result, false))
        })
    })
}
#[tauri::command]
pub async fn open_directory_history(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, super::FilePreferencesHost>,
    expected_revision: u64,
    target: DirectoryHistoryTarget,
) -> Result<file_index::WorkspacePayload, String> {
    editor(&window)?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let ticket = host.prepare_folder_history(&app, host.history_request())?;
        let registry = window
            .state::<crate::window_services::WindowServices>()
            .get_workspaces(window.label())?;
        let (result, bookmark) = resolve_with(
            &app,
            &window,
            &host,
            expected_revision,
            &target,
            |bookmark, source_registry| {
                let restore = |registry: &mut file_index::WorkspaceRegistry| {
                    let result = registry
                        .restore_bookmark(&bookmark)
                        .map_err(|error| error.to_string())?;
                    if let Err(error) = editor(&window) {
                        registry.close(&result.id);
                        return Err(error);
                    }
                    Ok(result)
                };
                let result = if let Some(registry) = source_registry {
                    restore(registry)?
                } else {
                    let mut registry = registry.lock().map_err(|_| "目录状态不可用")?;
                    restore(&mut registry)?
                };
                Ok((result, bookmark))
            },
        )?;
        if let Err(error) = editor(&window) {
            registry
                .lock()
                .map_err(|_| "目录状态不可用")?
                .close(&result.id);
            return Err(error);
        }
        if let Err(error) = host.remember_workspace(&app, &bookmark, ticket) {
            eprintln!("Directory history was not updated: {error}");
        }
        Ok(result)
    })
    .await
    .map_err(|_| "打开目录历史任务未完成")?
}
#[tauri::command]
pub async fn open_directory_history_window(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, super::FilePreferencesHost>,
    expected_revision: u64,
    target: DirectoryHistoryTarget,
) -> Result<String, String> {
    editor(&window)?;
    let host = host.inner().clone();
    let work_app = app.clone();
    let remember_host = host.clone();
    let label = window.label().to_owned();
    let (reserved, bookmark, ticket) = tauri::async_runtime::spawn_blocking(move || {
        let ticket = host.prepare_folder_history(&work_app, host.history_request())?;
        let (reserved, bookmark) = resolve_with(
            &work_app,
            &window,
            &host,
            expected_revision,
            &target,
            |bookmark, _registry| {
                let startup = crate::startup::StartupTarget::from_workspace(bookmark.clone())?;
                let reserved = crate::windows::reserve_editor_window(&work_app, Some(startup))?;
                Ok((reserved, bookmark))
            },
        )?;
        Ok::<_, String>((reserved, bookmark, ticket))
    })
    .await
    .map_err(|_| "确认目录新窗口任务未完成")??;
    if !app
        .state::<crate::window_services::WindowServices>()
        .contains(&label)
    {
        return Err("原编辑窗口已关闭，未展示的新窗口授权已释放".into());
    }
    let result = crate::windows::build_reserved_editor_window(reserved)?;
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = remember_host.remember_workspace(&app, &bookmark, ticket) {
            eprintln!("Directory history was not updated: {error}");
        }
    })
    .await
    .map_err(|_| "新窗口已打开，目录历史保存结果未确认")?;
    Ok(result)
}

#[tauri::command]
pub async fn reveal_workspace_directory(
    window: WebviewWindow,
    workspace_id: String,
) -> Result<(), String> {
    editor(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let current = current(&window, Some(&workspace_id))?.ok_or("目录授权不可用")?;
        current.verify()?;
        current
            .bookmark
            .reopen()
            .map_err(|error| error.to_string())?;
        editor(&window)?;
        #[cfg(target_os = "macos")]
        let status = std::process::Command::new("/usr/bin/open")
            .arg("-R")
            .arg(current.bookmark.path())
            .status();
        #[cfg(target_os = "windows")]
        return crate::platform::entry_actions::reveal_in_explorer(current.bookmark.path())
            .map_err(|_| "系统未能定位目录".to_owned());
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        return Err("此平台尚未接通目录定位".into());
        #[cfg(target_os = "macos")]
        if status.map_err(|_| "无法定位目录")?.success() {
            Ok(())
        } else {
            Err("系统未能定位目录".into())
        }
    })
    .await
    .map_err(|_| "定位目录任务未完成")?
}

#[cfg(test)]
mod tests;
