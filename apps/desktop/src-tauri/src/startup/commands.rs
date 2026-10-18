use super::*;
use crate::{platform::ui_chrome::PreferencesHost, window_services::WindowServices};
use document_service::DocumentPayload;
use file_index::WorkspacePayload;
use tauri::{Emitter, State, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};

fn editor(window: &WebviewWindow) -> Result<(), String> {
    if window.state::<WindowServices>().contains(window.label()) {
        Ok(())
    } else {
        Err("编辑窗口已关闭或未注册".into())
    }
}
fn host_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "preferences" {
        Ok(())
    } else {
        editor(window)
    }
}
fn preferences(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "preferences" {
        Ok(())
    } else {
        Err("请从偏好设置更改启动选项".into())
    }
}

#[tauri::command]
pub async fn get_startup_preferences(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, StartupHost>,
) -> Result<StartupPreferences, String> {
    host_window(&window)?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        host.with(&app, |store| {
            store.transaction(|state| Ok((state.snapshot(), false)))
        })
    })
    .await
    .map_err(|_| "读取启动设置任务未完成")?
}
async fn update(
    app: AppHandle,
    window: WebviewWindow,
    host: StartupHost,
    expected: u64,
    mode: Option<u8>,
    choose: bool,
) -> Result<Option<StartupPreferences>, String> {
    preferences(&window)?;
    let generation = app.state::<PreferencesHost>().generation()?;
    let started = std::time::Instant::now();
    tauri::async_runtime::spawn_blocking(move || {
        let state = host.with(&app, |store| {
            store.transaction(|state| Ok((state.clone(), false)))
        })?;
        if state.revision != expected {
            return Err("启动设置已由其他窗口更改，请重新打开设置".into());
        }
        let mode = mode.unwrap_or(state.restore_when_launch);
        if mode > 3 {
            return Err("启动选项无效".into());
        }
        let selected = if choose || (mode == 3 && state.pin_folder.is_none()) {
            let Some(file) = app
                .dialog()
                .file()
                .set_parent(&window)
                .set_title("选择启动目录")
                .blocking_pick_folder()
            else {
                return Ok(None);
            };
            let path = file.into_path().map_err(|_| "目录路径不受支持")?;
            Some(DirectoryBookmark::from_native_selection(&path).map_err(|e| e.to_string())?)
        } else {
            None
        };
        if started.elapsed() >= std::time::Duration::from_secs(110) {
            return Err("目录选择已超时，启动设置未修改".into());
        }
        let value = app
            .state::<PreferencesHost>()
            .with_generation(generation, || {
                host.with(&app, |store| {
                    store.transaction(|state| {
                        state.change(expected, mode, selected)?;
                        Ok((state.snapshot(), true))
                    })
                })
            })?;
        let _ = app.emit("startup-preferences-changed", &value);
        Ok(Some(value))
    })
    .await
    .map_err(|_| "保存启动设置任务未完成")?
}
#[tauri::command]
pub async fn set_startup_mode(
    app: AppHandle,
    window: WebviewWindow,
    expected_revision: u64,
    mode: u8,
    host: State<'_, StartupHost>,
) -> Result<Option<StartupPreferences>, String> {
    update(
        app,
        window,
        host.inner().clone(),
        expected_revision,
        Some(mode),
        false,
    )
    .await
}
#[tauri::command]
pub async fn choose_startup_folder(
    app: AppHandle,
    window: WebviewWindow,
    expected_revision: u64,
    host: State<'_, StartupHost>,
) -> Result<Option<StartupPreferences>, String> {
    update(
        app,
        window,
        host.inner().clone(),
        expected_revision,
        None,
        true,
    )
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowStartup {
    pub document: Option<DocumentPayload>,
    pub workspace: Option<WorkspacePayload>,
    pub warnings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft: Option<StartupDraft>,
}

#[tauri::command]
pub async fn get_window_startup(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, StartupHost>,
) -> Result<WindowStartup, String> {
    editor(&window)?;
    let host = host.inner().clone();
    let label = window.label().to_owned();
    let claim = claim_startup(&host, &label)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (token, serial, target) = claim;
        let target = initial_folder_prompt(&app, &window, &host, token, serial, target)?;
        let services = app.state::<WindowServices>();
        restore_target(&host, &services, &label, (token, serial, target), || {})
    })
    .await
    .map_err(|_| "启动恢复任务未完成")?
}

fn initial_folder_prompt(
    app: &AppHandle,
    window: &WebviewWindow,
    host: &StartupHost,
    token: uuid::Uuid,
    serial: u64,
    mut target: StartupTarget,
) -> Result<StartupTarget, String> {
    if !target.is_initial_custom_folder() || target.session.workspace.is_some() {
        return Ok(target);
    }
    let Some(expected) = target.initial_revision else {
        return Ok(target);
    };
    let current = host.with(app, |store| {
        store.transaction(|state| Ok((state.revision, false)))
    })?;
    if current != expected {
        target
            .warnings
            .push("启动设置已改变，本次保留空文档".into());
        return Ok(target);
    }
    let started = std::time::Instant::now();
    let choice = app
        .dialog()
        .message("无法打开原启动目录。原文档和恢复副本均保留。")
        .title("无法打开启动目录")
        .parent(window)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "忽略".into(),
            "选择默认目录".into(),
        ))
        .blocking_show_with_result();
    let choose = matches!(choice,MessageDialogResult::Custom(ref label) if label=="选择默认目录");
    let selected = if choose {
        app.dialog()
            .file()
            .set_parent(window)
            .set_title("选择启动目录")
            .blocking_pick_folder()
            .map(|path| {
                path.into_path()
                    .map_err(|_| "无法读取目录路径".to_owned())
                    .and_then(|path| {
                        DirectoryBookmark::from_native_selection(&path).map_err(|e| e.to_string())
                    })
            })
            .transpose()?
    } else {
        None
    };
    if started.elapsed() >= std::time::Duration::from_secs(110) {
        target
            .warnings
            .push("目录确认已超时，启动设置未修改".into());
        return Ok(target);
    }
    let slots = host.slots.lock().map_err(|_| "启动窗口状态不可用")?;
    if !app.state::<WindowServices>().contains(window.label())
        || !slots
            .get(window.label())
            .is_some_and(|slot| slot.token == token && slot.serial == serial && slot.loading)
    {
        return Err("启动确认窗口已关闭或更换".into());
    }
    let mode = if selected.is_some() { 3 } else { 0 };
    let value = host.with(app, |store| {
        store.transaction(|state| {
            state.change(expected, mode, selected.clone())?;
            Ok((state.snapshot(), true))
        })
    });
    drop(slots);
    match value {
        Ok(value) => {
            target.session.workspace = selected;
            target.warnings.clear();
            let _ = app.emit("startup-preferences-changed", &value);
        }
        Err(error) => target.warnings.push(format!("启动设置未修改：{error}")),
    }
    Ok(target)
}

#[tauri::command]
pub async fn track_window_session(
    app: AppHandle,
    window: WebviewWindow,
    document_id: Option<String>,
    workspace_id: Option<String>,
    host: State<'_, StartupHost>,
) -> Result<(), String> {
    editor(&window)?;
    let label = window.label().to_owned();
    let host = host.inner().clone();
    let (token, serial) = {
        let mut slots = host.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        let slot = slots.get_mut(&label).ok_or("启动窗口未注册")?;
        slot.serial = slot.serial.checked_add(1).ok_or("窗口版本已达上限")?;
        (slot.token, slot.serial)
    };
    let documents = app.state::<WindowServices>().get_documents(&label)?;
    let workspaces = app.state::<WindowServices>().get_workspaces(&label)?;
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<WindowServices>().with_file_lane(|| {
            let current_document_id = document_id.clone();
            let document = document_id
                .map(|id| {
                    let documents = documents.lock().map_err(|_| "文档状态不可用".to_owned())?;
                    if documents
                        .get_metadata(&id)
                        .map_err(|e| e.to_string())?
                        .location_state
                        == document_service::DocumentLocationState::Trashed
                    {
                        return Ok(None);
                    }
                    documents.bookmark(&id).map(Some).map_err(|e| e.to_string())
                })
                .transpose()?
                .flatten();
            let workspace = workspace_id
                .map(|id| {
                    workspaces
                        .lock()
                        .map_err(|_| "目录状态不可用".to_owned())?
                        .get(&id)
                        .map_err(|e| e.to_string())?
                        .bookmark()
                        .map_err(|e| e.to_string())
                })
                .transpose()?;
            let mut slots = host.slots.lock().map_err(|_| "启动窗口状态不可用")?;
            if !app.state::<WindowServices>().contains(&label) {
                return Err("编辑窗口已关闭".into());
            }
            let slot = slots
                .get_mut(&label)
                .filter(|slot| slot.token == token && slot.serial == serial)
                .ok_or("会话记录已由新操作替代")?;
            slot.pending = None;
            slot.claimed = None;
            slot.loading = false;
            slot.consumed = true;
            slot.current_document_id = current_document_id.filter(|_| document.is_some());
            slot.session = Session {
                document,
                workspace,
                native_tab: slot.session.native_tab,
            };
            Ok(())
        })
    })
    .await
    .map_err(|_| "记录窗口会话任务未完成")?
}

pub(super) fn claim_startup(
    host: &StartupHost,
    label: &str,
) -> Result<(uuid::Uuid, u64, StartupTarget), String> {
    let claim = {
        let mut slots = host.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        let slot = slots.get_mut(label).ok_or("启动目标尚未准备")?;
        if slot.loading || slot.consumed {
            return Err("启动目标正在处理或已经消费".into());
        }
        let target = slot.pending.take().ok_or("启动目标已经消费")?;
        slot.claimed = Some(target.clone());
        slot.loading = true;
        (slot.token, slot.serial, target)
    };

    Ok(claim)
}
pub(super) fn restore_target(
    host: &StartupHost,
    services: &WindowServices,
    label: &str,
    claim: (uuid::Uuid, u64, StartupTarget),
    before_commit: impl FnOnce(),
) -> Result<WindowStartup, String> {
    let (token, serial, mut target) = claim;
    if let Some(receipt) = &target.os_open_receipt {
        if let Err(error) = receipt.verify() {
            target
                .warnings
                .push(format!("系统打开目标已改变，原窗口与文件均保留：{error}"));
            target.session.document = None;
            target.session.workspace = None;
        }
    }
    let documents = services.get_documents(label)?;
    let workspaces = services.get_workspaces(label)?;
    let mut warnings = target.warnings;
    let mut accepted = Session::default();
    let mut workspace = if let Some(bookmark) = target.session.workspace {
        match workspaces
            .lock()
            .map_err(|_| "目录状态不可用")?
            .restore_bookmark(&bookmark)
        {
            Ok(payload) => {
                accepted.workspace = Some(bookmark);
                Some(payload)
            }
            Err(error) => {
                warnings.push(format!("启动目录未恢复：{error}"));
                None
            }
        }
    } else {
        None
    };
    let expected_document = target.session.document.is_some();
    let document = if let Some(bookmark) = target.session.document {
        match services.with_file_lane(|| {
            let registry = services.get_documents(label)?;
            let mut documents = registry.lock().map_err(|_| "文稿状态不可用")?;
            if let Some(receipt) = &target.os_open_receipt {
                receipt.open(&mut documents)
            } else {
                documents
                    .open_bookmark(&bookmark)
                    .map_err(|error| error.to_string())
            }
        }) {
            Ok(payload) => {
                accepted.document = Some(bookmark);
                Some(payload)
            }
            Err(error) => {
                warnings.push(format!("启动文件未恢复：{error}"));
                None
            }
        }
    } else {
        None
    };
    let draft = target.draft.filter(|draft| {
        let matches = document
            .as_ref()
            .is_some_and(|file| file.text == draft.saved_text);
        if !matches {
            warnings.push("新窗口草稿的保存基线已变化，未将草稿套用到磁盘版本".into());
        }
        matches
    });
    if expected_document && document.is_none() {
        if let Some(value) = workspace.take() {
            workspaces
                .lock()
                .map_err(|_| "目录状态不可用")?
                .close(&value.id);
        }
        accepted.workspace = None;
    }
    before_commit();
    let mut slots = host.slots.lock().map_err(|_| "启动窗口状态不可用")?;
    let current = slots
        .get_mut(label)
        .filter(|slot| slot.token == token && slot.serial == serial && slot.loading);
    if !services.contains(label) || current.is_none() {
        drop(slots);
        if let Some(document) = document {
            documents
                .lock()
                .map_err(|_| "文档状态不可用")?
                .close(&document.id);
        }
        if let Some(workspace) = workspace {
            workspaces
                .lock()
                .map_err(|_| "目录状态不可用")?
                .close(&workspace.id);
        }
        return Err("启动结果已被关闭或新操作取消".into());
    }
    let slot = current.ok_or("启动窗口已关闭")?;
    slot.loading = false;
    slot.claimed = None;
    slot.consumed = true;
    slot.current_document_id = document.as_ref().map(|document| document.id.clone());
    accepted.native_tab = slot.session.native_tab;
    slot.session = accepted;
    Ok(WindowStartup {
        document,
        workspace,
        warnings,
        draft,
    })
}
