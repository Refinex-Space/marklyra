//! Configure only the caller's existing platform WebView; no renderer handles or JS.
pub fn configure(
    webview: &tauri::webview::PlatformWebview,
    enabled: bool,
    open: bool,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use objc2::{msg_send, runtime::AnyObject, sel};
        use objc2_foundation::{NSNumber, NSString};
        // SAFETY: with_webview supplies the live WKWebView on the OS main thread.
        // Configuration/preferences remain owned by it for the entire callback.
        unsafe {
            let view = webview.inner().cast::<AnyObject>();
            let configuration: *mut AnyObject = msg_send![view, configuration];
            let preferences: *mut AnyObject = msg_send![configuration, preferences];
            let value = NSNumber::new_bool(enabled);
            let key = NSString::from_str("developerExtrasEnabled");
            let _: () = msg_send![preferences, setValue: &*value, forKey: &*key];
            let inspectable: bool = msg_send![view, respondsToSelector: sel!(setInspectable:)];
            if inspectable {
                let _: () = msg_send![view, setInspectable: enabled];
            }
            let inspector: *mut AnyObject = msg_send![view, _inspector];
            if !enabled {
                let _: () = msg_send![inspector, close];
            } else if open {
                let _: () = msg_send![inspector, show];
            }
        }
    }
    #[cfg(windows)]
    {
        // SAFETY: the WebView2 controller is used only in with_webview's UI callback.
        unsafe {
            let view = webview
                .controller()
                .CoreWebView2()
                .map_err(|e| e.to_string())?;
            let settings = view.Settings().map_err(|e| e.to_string())?;
            settings
                .SetAreDevToolsEnabled(enabled)
                .map_err(|e| e.to_string())?;
            if enabled && open {
                view.OpenDevToolsWindow().map_err(|e| e.to_string())?;
            }
        }
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = webview;
        if enabled || open {
            return Err("调试面板目前仅支持 macOS 和 Windows".into());
        }
    }
    Ok(())
}
