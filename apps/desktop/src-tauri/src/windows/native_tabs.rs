//! AppKit groups real editor windows. No document, history or authority moves
//! between renderers when the selected tab changes.
#[cfg(target_os = "macos")]
mod macos;

use serde::Deserialize;
use tauri::{AppHandle, WebviewWindow};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum TabAction {
    Next,
    Previous,
    Detach,
    Merge,
    Toggle,
}

#[cfg(target_os = "macos")]
pub(super) async fn on_main<T: Send + 'static>(
    window: WebviewWindow,
    work: impl FnOnce(&WebviewWindow) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    let dispatcher = window.clone();
    dispatcher
        .run_on_main_thread(move || {
            let result = if super::is_editor(&window) {
                work(&window)
            } else {
                Err("编辑窗口已关闭".into())
            };
            let _ = sender.try_send(result);
        })
        .map_err(|error| error.to_string())?;
    receiver.recv().await.ok_or("原生标签任务未完成")?
}

pub(super) async fn initialise(window: WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return on_main(window, macos::initialise).await;
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(())
    }
}

pub(super) async fn attach(window: WebviewWindow, owner: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return on_main(window, move |window| {
        super::allow_tab_operation(window)?;
        macos::attach(window, &owner)
    })
    .await;
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, owner);
        Err("当前平台使用独立编辑窗口".into())
    }
}
pub(super) async fn prefers_tab(window: WebviewWindow) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    return on_main(window, macos::prefers_tab).await;
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(false)
    }
}

pub(super) async fn action(window: WebviewWindow, action: TabAction) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return on_main(window, move |window| {
        // The command may have waited behind Quit in the main-thread queue.
        super::allow_tab_operation(window)?;
        macos::action(window, action)
    })
    .await;
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, action);
        Err("当前平台使用独立编辑窗口，尚不支持原生标签分组".into())
    }
}

pub(super) fn capture(app: &AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let layout = macos::capture(app)?;
        use tauri::Manager;
        app.state::<crate::startup::StartupHost>()
            .set_native_tab_layout(layout)?;
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
    Ok(())
}
pub(super) fn setup() {
    #[cfg(target_os = "macos")]
    macos::setup();
}

pub(super) fn restore(app: &AppHandle, entries: Vec<(String, crate::startup::NativeTabRestore)>) {
    #[cfg(target_os = "macos")]
    macos::restore(app, entries);
    #[cfg(not(target_os = "macos"))]
    let _ = (app, entries);
}

pub(super) fn release(label: &str) {
    #[cfg(target_os = "macos")]
    macos::release(label);
    #[cfg(not(target_os = "macos"))]
    let _ = label;
}
pub(super) fn refresh() {
    #[cfg(target_os = "macos")]
    macos::refresh();
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_known_tab_actions_deserialize() {
        for value in ["next", "previous", "detach", "merge", "toggle"] {
            assert!(serde_json::from_value::<TabAction>(value.into()).is_ok());
        }
        for value in ["close", "quit", "new", "Next", "../main", ""] {
            assert!(serde_json::from_value::<TabAction>(value.into()).is_err());
        }
    }
}
