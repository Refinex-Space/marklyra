//! WebView2 printing uses the public host API, even with page scripts disabled.
use tauri::{Manager, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM,
};
use windows::core::Interface;

pub(super) fn begin(window: &WebviewWindow) -> Result<(), String> {
    let target = window.clone();
    window
        .with_webview(move |webview| {
            // SAFETY: Tauri supplies this controller on its WebView2/UI thread.
            // ShowPrintUI displays the system dialog; it does not submit a job
            // or write a PDF without the user's action in that dialog.
            let result = unsafe {
                webview
                    .controller()
                    .CoreWebView2()
                    .and_then(|view| view.cast::<ICoreWebView2_16>())
                    .and_then(|view| view.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM))
            };
            if let Err(error) = result {
                super::show_error(
                    target.app_handle(),
                    &format!("无法打开 WebView2 系统打印面板（可能运行时不支持此接口）：{error}"),
                );
            }
        })
        .map_err(|error| format!("无法初始化 WebView2 打印：{error}"))
}
