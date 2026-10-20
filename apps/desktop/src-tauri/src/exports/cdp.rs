//! Owned, hidden WebView2 renderers driven through the DevTools protocol.
//!
//! A [`Renderer`] shows one prepared export snapshot in a window of its own. Its page cannot
//! run scripts (the document CSP forbids them) and cannot navigate, open windows, download or
//! ask for permissions; only the host talks to it, through `CallDevToolsProtocolMethod`, which
//! WebView2 requires to be issued from its UI thread.
use super::{allowed_navigation, preview_url, ExportHost};
use export_service::PreparedHtml;
use serde_json::{json, Value};
use std::{
    cell::RefCell,
    rc::Rc,
    sync::{
        mpsc::{self, Receiver, Sender},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent, PermissionResponse},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use webview2_com::{
    CallDevToolsProtocolMethodCompletedHandler, Microsoft::Web::WebView2::Win32::ICoreWebView2,
};
use windows::core::HSTRING;

/// One protocol conversation. Clone freely; every call must happen on the WebView2 UI thread,
/// which is where [`Renderer::drive`] runs its start function and every completion callback.
#[derive(Clone)]
pub(super) struct Devtools(ICoreWebView2);

impl Devtools {
    /// Calls `method`; `done` runs on the UI thread with the decoded result object.
    pub fn call(
        &self,
        method: &str,
        parameters: &Value,
        done: impl FnOnce(Result<Value, String>) + 'static,
    ) {
        let name = method.to_owned();
        // The handler is `FnOnce`; keep `done` reachable for the immediate-failure path too.
        // Everything here runs on the one UI thread, so plain reference counting is enough.
        let shared = Rc::new(RefCell::new(Some(Box::new(done) as Box<dyn FnOnce(_)>)));
        let on_complete = shared.clone();
        let handler =
            CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |status, text| {
                if let Some(done) = on_complete.borrow_mut().take() {
                    done(match status {
                        Ok(()) => serde_json::from_str(&text)
                            .map_err(|_| format!("渲染器返回了无法解析的 {name} 结果")),
                        Err(error) => Err(protocol_error(&name, &text, &error.to_string())),
                    });
                }
                Ok(())
            }));
        // SAFETY: called on the UI thread of a live WebView2; both strings outlive the call.
        let started = unsafe {
            self.0.CallDevToolsProtocolMethod(
                &HSTRING::from(method),
                &HSTRING::from(parameters.to_string()),
                &handler,
            )
        };
        if let Err(error) = started {
            if let Some(done) = shared.borrow_mut().take() {
                done(Err(format!("无法调用渲染器的 {method}：{error}")));
            }
        }
    }
}

/// DevTools failures arrive as a failed status plus a JSON error object; show its message.
fn protocol_error(method: &str, text: &str, status: &str) -> String {
    let detail = serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
        .unwrap_or_else(|| status.to_owned());
    format!("渲染器拒绝了 {method}：{detail}")
}

/// Where a running conversation reports its single outcome.
pub(super) struct Finish<T>(Sender<Result<T, String>>);
impl<T> Clone for Finish<T> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}
impl<T> Finish<T> {
    pub fn ok(&self, value: T) {
        let _ = self.0.send(Ok(value));
    }
    pub fn fail(&self, message: impl Into<String>) {
        let _ = self.0.send(Err(message.into()));
    }
    /// Continues with `next` on success and ends the conversation on failure.
    pub fn then<V>(&self, result: Result<V, String>, next: impl FnOnce(V)) {
        match result {
            Ok(value) => next(value),
            Err(message) => self.fail(message),
        }
    }
}

/// A hidden window showing one export snapshot. Dropping it destroys the window and revokes the
/// snapshot, on every success and failure path alike.
pub(super) struct Renderer {
    app: AppHandle,
    window: WebviewWindow,
    token: String,
    loaded: Receiver<()>,
}

impl Renderer {
    /// `prefix` is the window label prefix; the label is also the identity the preview protocol
    /// authorises (`pdf-export-…`, `image-export-…`). `width` and `height` are CSS pixels.
    pub fn open(
        app: &AppHandle,
        owner: &WebviewWindow,
        prepared: PreparedHtml,
        prefix: &str,
        width: f64,
        height: f64,
    ) -> Result<Self, String> {
        let token = {
            let host = app.state::<ExportHost>();
            let mut registry = host.registry.lock().map_err(|_| "导出资源状态不可用")?;
            let mut owners = host.owners.lock().map_err(|_| "导出所有权状态不可用")?;
            let mut renderers = host.renderers.lock().map_err(|_| "导出渲染器状态不可用")?;
            let token = registry
                .insert(prepared)
                .map_err(|error| error.to_string())?;
            owners.insert(token.clone(), owner.label().to_owned());
            renderers.insert(token.clone(), format!("{prefix}{token}"));
            token
        };
        let label = format!("{prefix}{token}");
        let (loaded_tx, loaded) = mpsc::channel();
        let expected = token.clone();
        let ready_token = token.clone();
        let announce = Mutex::new(Some(loaded_tx));
        let builder =
            WebviewWindowBuilder::new(app, &label, WebviewUrl::External(preview_url(&token)))
                .title("导出渲染")
                .visible(false)
                .focused(false)
                .skip_taskbar(true)
                .decorations(false)
                .inner_size(width, height)
                .disable_drag_drop_handler()
                .incognito(true)
                .devtools(false)
                .on_navigation(move |url| allowed_navigation(url, &expected))
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .on_download(|_, _| false)
                .on_permission_request(|_, _| PermissionResponse::Deny)
                .on_page_load(move |_, payload| {
                    if payload.event() == PageLoadEvent::Finished
                        && allowed_navigation(payload.url(), &ready_token)
                    {
                        if let Some(sender) = announce.lock().ok().and_then(|mut slot| slot.take())
                        {
                            let _ = sender.send(());
                        }
                    }
                })
                // One WebView2 environment per app: every window must pass the same arguments.
                .additional_browser_args(crate::windows::WEBVIEW_BROWSER_ARGS);
        match builder.build() {
            Ok(window) => Ok(Self {
                app: app.clone(),
                window,
                token,
                loaded,
            }),
            Err(error) => {
                app.state::<ExportHost>().revoke(&token);
                Err(format!("无法创建隔离的导出渲染器：{error}"))
            }
        }
    }

    /// Blocks until the snapshot finished loading, or `timeout` passes.
    pub fn wait_loaded(&self, timeout: Duration) -> Result<(), String> {
        self.loaded
            .recv_timeout(timeout)
            .map_err(|_| "导出页面未能在限定时间内加载完成；未保存".to_owned())
    }

    /// Runs `start` on the UI thread and waits for the conversation it begins to finish.
    pub fn drive<T: Send + 'static>(
        &self,
        timeout: Duration,
        start: impl FnOnce(Devtools, Finish<T>) + Send + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = mpsc::channel();
        let finish = Finish(tx);
        let failure = finish.clone();
        let started = Instant::now();
        self.window
            .with_webview(move |webview| {
                // SAFETY: Tauri hands this controller over on the WebView2 UI thread.
                match unsafe { webview.controller().CoreWebView2() } {
                    Ok(core) => start(Devtools(core), finish),
                    Err(error) => failure.fail(format!("无法访问渲染器的 WebView2：{error}")),
                }
            })
            .map_err(|error| format!("无法初始化渲染器：{error}"))?;
        rx.recv_timeout(timeout.saturating_sub(started.elapsed()))
            .map_err(|error| match error {
                mpsc::RecvTimeoutError::Timeout => "渲染未在限定时间内完成；未保存".to_owned(),
                mpsc::RecvTimeoutError::Disconnected => "导出渲染器已关闭；未保存".to_owned(),
            })?
    }
}

impl Drop for Renderer {
    fn drop(&mut self) {
        if let Err(error) = self.window.destroy() {
            eprintln!("Export renderer cleanup failed: {error}");
        }
        self.app.state::<ExportHost>().revoke(&self.token);
    }
}

/// A numeric field of a protocol result.
pub(super) fn number(value: &Value, path: &[&str]) -> Option<f64> {
    path.iter()
        .try_fold(value, |value, key| value.get(*key))
        .and_then(Value::as_f64)
}

/// The base64 `data` field of a protocol result, decoded.
pub(super) fn decode(value: &Value) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let text = value
        .get("data")
        .and_then(Value::as_str)
        .ok_or("渲染器没有返回数据")?;
    STANDARD
        .decode(text)
        .map_err(|_| "渲染器返回的数据无效".into())
}

/// Reads a protocol IO stream to its end in chunks and closes it, whatever happens.
pub(super) fn read_stream(
    devtools: Devtools,
    handle: String,
    limit: usize,
    finish: Finish<Vec<u8>>,
) {
    fn step(
        devtools: Devtools,
        handle: String,
        collected: Vec<u8>,
        limit: usize,
        finish: Finish<Vec<u8>>,
    ) {
        let next = devtools.clone();
        let close_handle = handle.clone();
        let parameters = json!({"handle": handle, "size": 1 << 20});
        devtools.call("IO.read", &parameters, move |result| {
            let mut collected = collected;
            let chunk = result.and_then(|value| {
                let eof = value.get("eof").and_then(Value::as_bool).unwrap_or(false);
                let text = value
                    .get("data")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let bytes = if value.get("base64Encoded").and_then(Value::as_bool) == Some(true) {
                    use base64::{engine::general_purpose::STANDARD, Engine};
                    STANDARD
                        .decode(text)
                        .map_err(|_| "渲染器返回的数据块无效".to_owned())?
                } else {
                    text.as_bytes().to_vec()
                };
                Ok((eof, bytes))
            });
            match chunk {
                Ok((eof, bytes)) => {
                    collected.extend_from_slice(&bytes);
                    if collected.len() > limit {
                        close(&next, &close_handle);
                        finish.fail("产出超过 32 MiB 限制；未保存");
                    } else if eof {
                        close(&next, &close_handle);
                        finish.ok(collected);
                    } else {
                        step(next, close_handle, collected, limit, finish);
                    }
                }
                Err(message) => {
                    close(&next, &close_handle);
                    finish.fail(message);
                }
            }
        });
    }
    fn close(devtools: &Devtools, handle: &str) {
        devtools.call("IO.close", &json!({"handle": handle}), |_| {});
    }
    step(devtools, handle, Vec::new(), limit, finish);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_failures_show_the_renderer_message_not_a_bare_status() {
        assert_eq!(
            protocol_error(
                "Page.printToPDF",
                r#"{"code":-32000,"message":"Printing failed"}"#,
                "x"
            ),
            "渲染器拒绝了 Page.printToPDF：Printing failed"
        );
        assert_eq!(
            protocol_error("Page.printToPDF", "", "E_FAIL"),
            "渲染器拒绝了 Page.printToPDF：E_FAIL"
        );
    }

    #[test]
    fn results_are_read_by_path_and_decoded_from_base64() {
        let value = json!({"cssContentSize": {"height": 12.5}, "data": "JVBERg=="});
        assert_eq!(number(&value, &["cssContentSize", "height"]), Some(12.5));
        assert_eq!(number(&value, &["cssContentSize", "width"]), None);
        assert_eq!(decode(&value).unwrap(), b"%PDF");
        assert!(decode(&json!({})).is_err());
        assert!(decode(&json!({"data": "***"})).is_err());
    }
}
