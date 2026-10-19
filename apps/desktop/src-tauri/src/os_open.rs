//! OS-owned open receipts. Renderer requests never authorize filesystem paths.
mod queue;
#[cfg(test)]
mod tests;
use document_service::DocumentPayload;
use queue::OpenQueue;
pub(crate) use queue::Receipt;
use serde::Serialize;
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, Url, WebviewWindow};

#[derive(Default)]
pub(crate) struct OsOpenHost(Mutex<OpenQueue>);
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum OsOpenResult {
    Handled,
    Document {
        token: String,
        document: DocumentPayload,
    },
    Warning {
        message: String,
    },
}

/// File URLs are OS event data, never external-opener requests.
pub(crate) fn file_url_path(url: &Url) -> Result<PathBuf, String> {
    if url.as_str().len() > 16_384
        || url.scheme() != "file"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_some_and(|host| host != "localhost")
    {
        return Err("系统打开仅接受本机 file URL，不授予外部协议权限".into());
    }
    let path = url.to_file_path().map_err(|_| "系统文件 URL 无效")?;
    queue::validate_path(&path)?;
    Ok(path)
}

fn receive_paths(app: &AppHandle, paths: impl IntoIterator<Item = Result<PathBuf, String>>) {
    let host = app.state::<OsOpenHost>();
    if let Ok(mut queue) = host.0.lock() {
        for (index, path) in paths.into_iter().take(queue::MAX_INPUTS + 1).enumerate() {
            if index == queue::MAX_INPUTS {
                queue.warn("单次系统打开最多处理64个项目，其余项目未打开，请分批重试".into());
                break;
            }
            match path.and_then(|path| {
                let types = app
                    .state::<crate::file_preferences::FilePreferencesHost>()
                    .document_types(app)?;
                Receipt::capture_with_types(path, &types)
            }) {
                Ok(receipt) => queue.push(receipt),
                Err(error) => queue.warn(error),
            }
        }
    }
    wake(app);
}
#[cfg(target_os = "macos")]
pub(crate) fn receive_urls(app: &AppHandle, urls: Vec<Url>) {
    receive_paths(app, urls.iter().map(file_url_path));
}
/// macOS supplies Apple events; interpreting argv there would duplicate them.
pub(crate) fn capture_process_arguments(app: &AppHandle) {
    #[cfg(not(target_os = "macos"))]
    receive_arguments(app, std::env::args_os().skip(1));
    #[cfg(target_os = "macos")]
    let _ = app;
}

/// Launch arguments of this process, or of a second launch forwarded to it, are OS data:
/// each becomes an OS-owned receipt exactly like a macOS open event.
#[cfg(not(target_os = "macos"))]
pub(crate) fn receive_arguments(
    app: &AppHandle,
    arguments: impl IntoIterator<Item = std::ffi::OsString>,
) {
    receive_paths(
        app,
        arguments.into_iter().map(|value| {
            let path = PathBuf::from(value);
            if path
                .to_str()
                .is_some_and(|value| value.starts_with("file:"))
            {
                return Url::parse(path.to_str().ok_or("系统文件路径不是 Unicode")?)
                    .map_err(|_| "系统文件 URL 无效".to_owned())
                    .and_then(|url| file_url_path(&url));
            }
            queue::validate_path(&path).map(|()| path)
        }),
    );
}
fn wake(app: &AppHandle) {
    let mut editors: Vec<_> = app
        .webview_windows()
        .into_values()
        .filter(crate::windows::is_editor)
        .collect();
    editors.sort_by(|left, right| left.label().cmp(right.label()));
    if let Some(window) = crate::windows::focused_editor(app).or_else(|| editors.into_iter().next())
    {
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit("os-open-pending", ());
    } else {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(error) = crate::windows::build_editor_window(&app, None) {
                eprintln!("OS open window was not created: {error}");
            }
        });
    }
}
#[cfg(target_os = "macos")]
pub(crate) fn reopen(app: &AppHandle, _has_visible_windows: bool) {
    wake(app);
}

#[tauri::command]
pub(crate) async fn take_os_open(
    window: WebviewWindow,
    reuse_current: bool,
) -> Result<Option<OsOpenResult>, String> {
    crate::windows::allow_os_open(&window)?;
    if !window
        .state::<crate::startup::StartupHost>()
        .os_open_ready(window.label())?
    {
        return Ok(None);
    }
    if !crate::windows::is_focused(&window).map_err(|error| error.to_string())? {
        return Ok(None);
    }
    let receipt = {
        let host = window.state::<OsOpenHost>();
        let mut queue = host.0.lock().map_err(|_| "系统打开队列不可用")?;
        queue.release_stale();
        if let Some(message) = queue.next_warning() {
            return Ok(Some(OsOpenResult::Warning { message }));
        }
        queue.claim(window.label())
    };
    let Some((token, receipt)) = receipt else {
        return Ok(None);
    };
    let app = window.app_handle().clone();
    let owner = window.label().to_owned();
    let result = async {
        receipt.verify()?;
        if !receipt.directory {
            app.state::<crate::file_preferences::FilePreferencesHost>()
                .require_document_type(&app, &receipt.path)?;
        }
        if let Some(label) = app
            .state::<crate::startup::StartupHost>()
            .matching_os_target(
                &app.state::<crate::window_services::WindowServices>(),
                &receipt.path,
                &receipt.entity,
                receipt.directory,
            )?
        {
            if let Some(existing) = app.get_webview_window(&label) {
                existing.show().map_err(|error| error.to_string())?;
                existing.set_focus().map_err(|error| error.to_string())?;
                return Ok(OsOpenResult::Handled);
            }
        }
        let can_reuse = !receipt.directory
            && reuse_current
            && app
                .state::<crate::startup::StartupHost>()
                .can_reuse_untitled(&owner)?;
        if can_reuse {
            let candidate_window = window.clone();
            let selected = receipt.clone();
            let document = tauri::async_runtime::spawn_blocking(move || {
                open_candidate(&candidate_window, &selected)
            })
            .await
            .map_err(|_| "打开系统文稿任务未完成")??;
            let host = app.state::<OsOpenHost>();
            let mut queue = host.0.lock().map_err(|_| "系统打开队列不可用")?;
            if !queue.set_candidate(&owner, &token, document.id.clone()) {
                drop(queue);
                close_candidate(&window, &document.id)?;
                return Err("系统打开回执已失效".into());
            }
            Ok(OsOpenResult::Document {
                token: token.clone(),
                document,
            })
        } else {
            // Native routing now owns the receipt through window publication.
            // Destroying its source editor must not replay the same event.
            app.state::<OsOpenHost>()
                .0
                .lock()
                .map_err(|_| "系统打开队列不可用")?
                .completion(&owner, &token)?;
            open_window(&app, &owner, &receipt).await?;
            Ok(OsOpenResult::Handled)
        }
    }
    .await;
    if !matches!(result, Ok(OsOpenResult::Document { .. })) {
        app.state::<OsOpenHost>()
            .0
            .lock()
            .map_err(|_| "系统打开队列不可用")?
            .finish(&owner, &token);
    }
    result.map(Some)
}

fn open_candidate(window: &WebviewWindow, receipt: &Receipt) -> Result<DocumentPayload, String> {
    crate::windows::allow_os_open(window)?;
    window
        .state::<crate::window_services::WindowServices>()
        .with_file_lane(|| {
            receipt.verify()?;
            let registry = window
                .state::<crate::window_services::WindowServices>()
                .get_documents(window.label())?;
            let mut documents = registry.lock().map_err(|_| "文稿状态不可用")?;
            let opened = receipt.open(&mut documents)?;
            if let Err(error) = receipt.verify() {
                documents.close(&opened.id);
                return Err(error);
            }
            Ok(opened)
        })
}
fn close_candidate(window: &WebviewWindow, id: &str) -> Result<(), String> {
    let services = window.state::<crate::window_services::WindowServices>();
    services.with_file_lane(|| {
        services
            .get_documents(window.label())?
            .lock()
            .map_err(|_| "文稿状态不可用")?
            .close(id);
        Ok(())
    })
}
async fn open_window(app: &AppHandle, owner: &str, receipt: &Receipt) -> Result<(), String> {
    let selected = receipt.clone();
    let target = tauri::async_runtime::spawn_blocking(move || selected.target())
        .await
        .map_err(|_| "准备系统打开窗口任务未完成")??;
    let target = if !receipt.directory
        && app
            .get_webview_window(owner)
            .is_some_and(|window| crate::windows::is_editor(&window))
    {
        target.inherit_os_workspace(
            app.state::<crate::startup::StartupHost>()
                .new_document_target(app, owner)?,
        )
    } else {
        target
    };
    crate::windows::open_os_target(app, owner, target)
        .await
        .map(|_| ())
}

#[tauri::command]
pub(crate) async fn complete_os_open(
    window: WebviewWindow,
    token: String,
    accepted: bool,
) -> Result<(), String> {
    if token.len() > 128 || uuid::Uuid::parse_str(&token).is_err() {
        return Err("系统打开回执格式无效".into());
    }
    crate::windows::allow_os_open(&window)?;
    let claim = window
        .state::<OsOpenHost>()
        .0
        .lock()
        .map_err(|_| "系统打开队列不可用")?
        .completion(window.label(), &token)?;
    let Some((receipt, candidate)) = claim else {
        return Ok(());
    };
    let result = async {
        if !accepted {
            if let Some(id) = candidate {
                close_candidate(&window, &id)?;
            }
            open_window(window.app_handle(), window.label(), &receipt).await?;
        }
        Ok(())
    }
    .await;
    window
        .state::<OsOpenHost>()
        .0
        .lock()
        .map_err(|_| "系统打开队列不可用")?
        .finish(window.label(), &token);
    result
}
/// Destroyed editors return undelivered events to the queue. A receipt already
/// owned by Native window publication keeps its unique claim until completion;
/// source text lives only in the editor's existing recovery protection.
pub(crate) fn release_owner<R: tauri::Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(host) = app.try_state::<OsOpenHost>() {
        if let Ok(mut queue) = host.0.lock() {
            queue.release_owner(label);
        }
    }
}
