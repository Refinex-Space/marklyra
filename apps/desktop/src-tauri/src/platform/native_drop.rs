//! File-only AppKit destination. Non-file drags retain WKWebView's standard
//! handlers, including the runtime editor's internal text drag transactions.
#[cfg(target_os = "macos")]
mod macos;
use tauri::{Manager, WebviewWindow, Window, WindowEvent};

#[tauri::command]
pub async fn initialise_native_drop(window: WebviewWindow) -> Result<bool, String> {
    if !crate::windows::is_editor(&window) {
        return Err("文件拖放仅用于编辑窗口".into());
    }
    #[cfg(target_os = "macos")]
    {
        let (sender, mut receiver) = tauri::async_runtime::channel(1);
        let target = window.clone();
        window
            .with_webview(move |webview| {
                let _ = sender.try_send(macos::install(&target, webview.inner()));
            })
            .map_err(|error| error.to_string())?;
        receiver.recv().await.ok_or("文件拖放初始化未完成")?
    }
    #[cfg(not(target_os = "macos"))]
    Ok(false)
}

pub fn handle_window(window: &Window, event: &WindowEvent) {
    if matches!(event, WindowEvent::Destroyed) {
        crate::clipboard::native_input::forget_window(window.app_handle(), window.label());
    } else if matches!(event, WindowEvent::Focused(false)) {
        crate::clipboard::native_input::invalidate_window(window.app_handle(), window.label());
    }
    #[cfg(target_os = "macos")]
    if matches!(event, WindowEvent::Destroyed) {
        let label = window.label().to_owned();
        let _ = window.run_on_main_thread(move || macos::release(&label));
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (window, event);
}
