//! Native-only export authorization and scriptless print previews.
mod converter;
pub mod formats;
pub mod image;
mod image_geometry;
#[cfg(target_os = "macos")]
mod image_macos;
#[cfg(target_os = "macos")]
mod macos;
mod print_options;
#[cfg(target_os = "windows")]
mod windows;
use export_service::{
    prepare_html, suggested_filename, ExportDestination, PreviewRegistry, PREVIEW_CSP,
};
use print_options::PrintLayout;
pub use print_options::PrintOptions;
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
};
use tauri::{
    http::{header, Method, Response, StatusCode},
    webview::{NewWindowResponse, PageLoadEvent, PermissionResponse},
    AppHandle, Manager, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
    WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

const PREFIX: &str = "print-preview-";
// WK's fixed host layout probe also obeys the sandbox scripts flag. Document
// scripts remain forbidden by script-src and the validated static HTML.
const RASTER_CSP: &str = "sandbox allow-scripts; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

#[derive(Default)]
pub struct ExportHost {
    registry: Mutex<PreviewRegistry>,
    ready: Mutex<HashSet<String>>,
    owners: Mutex<HashMap<String, String>>,
    renderers: Mutex<HashMap<String, String>>,
    layouts: Mutex<HashMap<String, PrintLayout>>,
}
impl ExportHost {
    fn revoke(&self, token: &str) {
        if let Ok(mut registry) = self.registry.lock() {
            registry.close(token);
        }
        if let Ok(mut owners) = self.owners.lock() {
            owners.remove(token);
        }
        if let Ok(mut renderers) = self.renderers.lock() {
            renderers.remove(token);
        }
        if let Ok(mut layouts) = self.layouts.lock() {
            layouts.remove(token);
        }
        if let Ok(mut ready) = self.ready.lock() {
            ready.remove(token);
        }
    }
}
#[derive(Serialize)]
pub struct SavedExport {
    path: String,
    bytes: usize,
}
#[derive(Serialize)]
pub struct OpenedPreview {
    id: String,
}

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if crate::windows::is_editor(window) {
        Ok(())
    } else {
        Err("此操作仅允许由编辑窗口发起".to_owned())
    }
}
#[tauri::command]
pub async fn save_export_html(
    app: AppHandle,
    window: WebviewWindow,
    html: String,
    suggested_name: String,
    source_id: Option<String>,
) -> Result<SavedExport, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let prepared = prepare_html(&html).map_err(|error| error.to_string())?;
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("导出为 HTML")
            .set_file_name(suggested_filename(&suggested_name))
            .add_filter("HTML", &["html", "htm"])
            .blocking_save_file()
            .ok_or("已取消导出")?;
        let path = selected.into_path().map_err(|_| "无法读取导出路径")?;
        main_only(&window)?;
        formats::source_guard(&window, source_id.as_deref(), &path)?;
        let destination = ExportDestination::authorize(&path).map_err(|error| error.to_string())?;
        let result = SavedExport {
            path: destination.path().to_string_lossy().into_owned(),
            bytes: prepared.len(),
        };
        destination
            .write(&prepared)
            .map_err(|error| error.to_string())?;
        Ok(result)
    })
    .await
    .map_err(|_| "HTML 导出任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn open_print_preview(
    app: AppHandle,
    window: WebviewWindow,
    html: String,
    title: String,
    options: Option<PrintOptions>,
    host: State<'_, ExportHost>,
) -> Result<OpenedPreview, String> {
    main_only(&window)?;
    let layout = options.unwrap_or_default().validate()?;
    #[cfg(target_os = "windows")]
    let html = layout.windows_html(html);
    let prepared = tauri::async_runtime::spawn_blocking(move || prepare_html(&html))
        .await
        .map_err(|_| "打印预览准备任务未能完成")?
        .map_err(|error| error.to_string())?;
    let owner = window.label().to_owned();
    // The owning editor may have closed while HTML was parsed.
    if !crate::windows::is_editor(&window) {
        return Err("主编辑窗口已关闭".to_owned());
    }
    let token = {
        let mut registry = host.registry.lock().map_err(|_| "导出资源状态不可用")?;
        let mut owners = host.owners.lock().map_err(|_| "导出所有权状态不可用")?;
        let mut layouts = host.layouts.lock().map_err(|_| "打印分页状态不可用")?;
        let mut renderers = host.renderers.lock().map_err(|_| "导出渲染器状态不可用")?;
        let token = registry
            .insert(prepared)
            .map_err(|error| error.to_string())?;
        owners.insert(token.clone(), owner);
        renderers.insert(token.clone(), format!("{PREFIX}{token}"));
        layouts.insert(token.clone(), layout);
        token
    };
    let url = preview_url(&token);
    let label = format!("{PREFIX}{token}");
    let title: String = title
        .chars()
        .filter(|ch| !ch.is_control())
        .take(160)
        .collect();
    let title = if title.trim().is_empty() {
        "打印预览".to_owned()
    } else {
        format!("{title} — 打印预览")
    };
    let navigation_token = token.clone();
    let ready_token = token.clone();
    let builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(url))
        .title(title)
        .inner_size(920.0, 760.0)
        .min_inner_size(500.0, 400.0)
        .disable_javascript()
        .disable_drag_drop_handler()
        .incognito(true)
        .devtools(false)
        .on_navigation(move |url| allowed_navigation(url, &navigation_token))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false)
        .on_permission_request(|_, _| PermissionResponse::Deny)
        .on_page_load(move |window, payload| {
            if payload.event() == PageLoadEvent::Finished
                && allowed_navigation(payload.url(), &ready_token)
            {
                if let Ok(mut ready) = window.state::<ExportHost>().ready.lock() {
                    ready.insert(ready_token.clone());
                }
            }
        });
    match builder.build() {
        Ok(preview) => {
            if !crate::windows::is_editor(&window) {
                let _ = preview.destroy();
                if let Ok(mut registry) = host.registry.lock() {
                    registry.close(&token);
                }
                if let Ok(mut owners) = host.owners.lock() {
                    owners.remove(&token);
                }
                if let Ok(mut layouts) = host.layouts.lock() {
                    layouts.remove(&token);
                }
                return Err("编辑窗口已关闭".to_owned());
            }
            if preview.is_focused().unwrap_or(false) {
                if let Err(error) = crate::menu::set_preview_context(&app, true) {
                    eprintln!("Preview menu update failed: {error}");
                }
            }
            Ok(OpenedPreview { id: token })
        }
        Err(error) => {
            host.revoke(&token);
            Err(format!("无法打开打印预览：{error}"))
        }
    }
}

pub fn preview_url(token: &str) -> Url {
    let origin = if cfg!(target_os = "windows") {
        "http://marklyra.localhost"
    } else {
        "marklyra://localhost"
    };
    Url::parse(&format!("{origin}/__exports/{token}/index.html")).expect("UUID preview URL")
}
fn allowed_navigation(url: &Url, token: &str) -> bool {
    let host = url.host_str().unwrap_or_default();
    let origin = (url.scheme() == "marklyra" && host == "localhost")
        || (url.scheme() == "http" && host == "marklyra.localhost");
    origin
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.path() == format!("/__exports/{token}/index.html")
}
pub fn response(
    host: &ExportHost,
    requester: &str,
    token: &str,
    method: &Method,
) -> Response<Vec<u8>> {
    let head = method == Method::HEAD;
    let owner = host
        .owners
        .lock()
        .is_ok_and(|owners| owners.get(token).is_some_and(|owner| owner == requester));
    let renderer = host.renderers.lock().is_ok_and(|renderers| {
        renderers
            .get(token)
            .is_some_and(|renderer| renderer == requester)
    });
    let authorized = owner || renderer;
    if !authorized {
        return preview_response(
            StatusCode::NOT_FOUND,
            b"Print preview unavailable",
            head,
            false,
        );
    }
    if method != Method::GET && !head {
        preview_response(
            StatusCode::METHOD_NOT_ALLOWED,
            b"Read-only print preview",
            false,
            false,
        )
    } else {
        match host.registry.lock() {
            Ok(registry) => match registry.get(token) {
                Some(bytes) => {
                    let mut response = preview_response(StatusCode::OK, &bytes, head, true);
                    if renderer && requester.starts_with("image-export-") {
                        response.headers_mut().insert(
                            "Content-Security-Policy",
                            tauri::http::HeaderValue::from_static(RASTER_CSP),
                        );
                    }
                    response
                }
                None => preview_response(
                    StatusCode::NOT_FOUND,
                    b"Print preview unavailable",
                    head,
                    false,
                ),
            },
            Err(_) => preview_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                b"Print preview state unavailable",
                head,
                false,
            ),
        }
    }
}
fn preview_response(status: StatusCode, body: &[u8], head: bool, html: bool) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(
            header::CONTENT_TYPE,
            if html {
                "text/html; charset=utf-8"
            } else {
                "text/plain; charset=utf-8"
            },
        )
        .header(header::CONTENT_LENGTH, body.len())
        .header(header::ALLOW, "GET, HEAD")
        .header("Content-Security-Policy", PREVIEW_CSP)
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header(header::CACHE_CONTROL, "no-store")
        .body(if head { Vec::new() } else { body.to_vec() })
        .expect("fixed preview response headers")
}

#[derive(Debug, PartialEq)]
enum MenuRoute {
    Main,
    PrintPreview,
    ClosePreview,
    Ignore,
}
fn menu_route(focused_label: Option<&str>, id: &str) -> MenuRoute {
    match focused_label {
        Some(label) if label == "main" || label.starts_with("editor-") => MenuRoute::Main,
        Some(label) if label.starts_with(PREFIX) => match id {
            "print-preview" => MenuRoute::PrintPreview,
            "close" | "quit" => MenuRoute::ClosePreview,
            _ => MenuRoute::Ignore,
        },
        _ => MenuRoute::Ignore,
    }
}
/// Native menu events have no window ID. Query current OS focus instead of
/// trusting the menu object or an earlier Focused notification.
pub fn handle_menu(app: &AppHandle, event: &tauri::menu::MenuEvent) -> bool {
    let mut focused = app
        .webview_windows()
        .into_values()
        .filter(|window| window.is_focused().unwrap_or(false));
    let window = focused.next();
    if focused.next().is_some() {
        return true;
    }
    let route = menu_route(
        window.as_ref().map(|window| window.label()),
        event.id().as_ref(),
    );
    match route {
        MenuRoute::Main => return !window.as_ref().is_some_and(crate::windows::is_editor),
        MenuRoute::Ignore => return true,
        _ => {}
    }
    let Some(window) = window else {
        return true;
    };
    if let Err(error) = crate::menu::set_preview_context(app, true) {
        eprintln!("Preview menu update failed: {error}");
    }
    if route == MenuRoute::ClosePreview {
        if let Err(error) = window.close() {
            show_error(app, &format!("无法关闭打印预览：{error}"));
        }
        return true;
    }
    let token = window.label().strip_prefix(PREFIX).unwrap_or_default();
    let ready = app
        .state::<ExportHost>()
        .ready
        .lock()
        .is_ok_and(|ready| ready.contains(token));
    if !ready {
        show_error(app, "打印预览尚未完成加载，请稍后再试");
        return true;
    }
    let host = app.state::<ExportHost>();
    let owner_exists = host.owners.lock().is_ok_and(|owners| {
        owners.get(token).is_some_and(|owner| {
            app.get_webview_window(owner)
                .as_ref()
                .is_some_and(crate::windows::is_editor)
        })
    });
    if !owner_exists {
        show_error(app, "所属编辑窗口已关闭；此打印预览已失效");
        return true;
    }
    let layout = host
        .layouts
        .lock()
        .ok()
        .and_then(|layouts| layouts.get(token).cloned());
    let Some(layout) = layout else {
        show_error(app, "打印分页状态已失效，请重新打开预览");
        return true;
    };
    #[cfg(target_os = "macos")]
    {
        let target = window.clone();
        if let Err(error) = window.with_webview(move |webview| {
            if let Err(error) = macos::begin(&target, webview.inner(), layout) {
                show_error(
                    target.app_handle(),
                    &format!("无法打开系统打印对话框：{error}"),
                );
            }
        }) {
            show_error(app, &format!("无法初始化系统打印：{error}"));
        }
    }
    #[cfg(target_os = "windows")]
    if let Err(error) = windows::begin(&window) {
        show_error(app, &error);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    show_error(app, "此平台尚未接通原生打印；未执行打印或生成 PDF");
    #[cfg(not(target_os = "macos"))]
    let _ = layout;
    true
}
fn show_error(app: &AppHandle, message: &str) {
    app.dialog().message(message).title("打印预览").show(|_| {});
}
pub fn handle_window(window: &Window, event: &WindowEvent) {
    let app = window.app_handle();
    let host = app.state::<ExportHost>();
    let print_token = window.label().strip_prefix(PREFIX);
    let token = print_token.or_else(|| window.label().strip_prefix("image-export-"));
    match event {
        WindowEvent::Focused(true)
            if window
                .state::<crate::window_services::WindowServices>()
                .contains(window.label())
                || print_token.is_some() =>
        {
            // Cosmetic enablement only. handle_menu rechecks native focus before
            // any document action or printing, even if this event was missed.
            if let Err(error) = crate::menu::set_preview_context(app, print_token.is_some()) {
                eprintln!("Preview menu update failed: {error}");
            }
        }
        WindowEvent::Destroyed => {
            if let Some(token) = token {
                #[cfg(target_os = "macos")]
                {
                    let label = window.label().to_owned();
                    if print_token.is_some() {
                        let _ = window.run_on_main_thread(move || macos::dismiss(&label));
                    }
                }
                if let Ok(mut registry) = host.registry.lock() {
                    registry.close(token);
                }
                if let Ok(mut ready) = host.ready.lock() {
                    ready.remove(token);
                }
                if let Ok(mut owners) = host.owners.lock() {
                    owners.remove(token);
                }
                if let Ok(mut layouts) = host.layouts.lock() {
                    layouts.remove(token);
                }
                if let Ok(mut renderers) = host.renderers.lock() {
                    renderers.remove(token);
                }
            } else if window
                .state::<crate::window_services::WindowServices>()
                .contains(window.label())
            {
                let owned: Vec<String> = host
                    .owners
                    .lock()
                    .map(|owners| {
                        owners
                            .iter()
                            .filter(|(_, owner)| owner.as_str() == window.label())
                            .map(|(token, _)| token.clone())
                            .collect()
                    })
                    .unwrap_or_default();
                for token in owned {
                    let label = host
                        .renderers
                        .lock()
                        .ok()
                        .and_then(|renderers| renderers.get(&token).cloned());
                    host.revoke(&token);
                    if let Some(preview) = label.and_then(|label| app.get_webview_window(&label)) {
                        if let Err(error) = preview.destroy() {
                            eprintln!("Export renderer cleanup failed: {error}");
                        }
                    }
                }
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn menu_route_uses_current_focus_even_when_main_menu_is_still_visible() {
        let preview = Some("print-preview-11111111-1111-1111-1111-111111111111");
        assert_eq!(
            menu_route(preview, "print-preview"),
            MenuRoute::PrintPreview
        );
        for id in ["close", "quit"] {
            assert_eq!(menu_route(preview, id), MenuRoute::ClosePreview);
        }
        for id in [
            "new",
            "open",
            "open-folder",
            "save",
            "save-as",
            "export-html",
            "undo",
            "redo",
            "heading:1",
            "format:strong",
            "find",
            "view:source",
            "theme:marklyra-dark",
        ] {
            assert_eq!(menu_route(preview, id), MenuRoute::Ignore, "{id}");
        }
        assert_eq!(menu_route(Some("main"), "print-preview"), MenuRoute::Main);
        assert_eq!(menu_route(Some("main"), "save"), MenuRoute::Main);
        for focus in [None, Some("unknown"), Some("closed-preview")] {
            for id in ["print-preview", "save", "close"] {
                assert_eq!(menu_route(focus, id), MenuRoute::Ignore);
            }
        }
    }
    #[test]
    fn preview_navigation_never_reaches_shell_network_or_other_resources() {
        let token = "11111111-1111-1111-1111-111111111111";
        for valid in [
            format!("marklyra://localhost/__exports/{token}/index.html"),
            format!("http://marklyra.localhost/__exports/{token}/index.html#section"),
        ] {
            assert!(allowed_navigation(&Url::parse(&valid).unwrap(), token));
        }
        for invalid in [
            "tauri://localhost/index.html",
            "http://tauri.localhost/index.html",
            "http://127.0.0.1:1420",
            "https://example.test",
            "file:///etc/passwd",
            "data:text/html,test",
            "marklyra://localhost/index.html",
            "marklyra://localhost/__images/11111111-1111-1111-1111-111111111111",
            "marklyra://localhost/__exports/11111111-1111-1111-1111-111111111111/index.html?q=x",
            "marklyra://localhost:80/__exports/11111111-1111-1111-1111-111111111111/index.html",
        ] {
            assert!(
                !allowed_navigation(&Url::parse(invalid).unwrap(), token),
                "{invalid}"
            );
        }
    }
    #[test]
    fn preview_protocol_is_scriptless_bounded_by_registry_and_revocable() {
        let host = ExportHost::default();
        let token = host
            .registry
            .lock()
            .unwrap()
            .insert(prepare_html("<h1>中文</h1>").unwrap())
            .unwrap();
        host.owners
            .lock()
            .unwrap()
            .insert(token.clone(), "main".into());
        host.renderers
            .lock()
            .unwrap()
            .insert(token.clone(), format!("{PREFIX}{token}"));
        assert_eq!(
            response(&host, "editor-other", &token, &Method::GET).status(),
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            response(&host, &format!("{PREFIX}{token}"), &token, &Method::GET).status(),
            StatusCode::OK
        );
        let get = response(&host, "main", &token, &Method::GET);
        assert_eq!(get.status(), StatusCode::OK);
        assert_eq!(get.headers()["Content-Security-Policy"], PREVIEW_CSP);
        assert!(!PREVIEW_CSP.contains("unsafe-eval"));
        let head = response(&host, "main", &token, &Method::HEAD);
        assert!(head.body().is_empty());
        assert_eq!(
            get.headers()[header::CONTENT_LENGTH],
            head.headers()[header::CONTENT_LENGTH]
        );
        assert_eq!(
            response(&host, "main", &token, &Method::POST).status(),
            StatusCode::METHOD_NOT_ALLOWED
        );
        host.registry.lock().unwrap().close(&token);
        assert_eq!(
            response(&host, "main", &token, &Method::GET).status(),
            StatusCode::NOT_FOUND
        );
    }
    #[test]
    fn raster_resource_authorization_is_exact_owner_renderer_token_and_revocable() {
        let host = ExportHost::default();
        let token = host
            .registry
            .lock()
            .unwrap()
            .insert(prepare_html("<h1>Owned raster</h1>").unwrap())
            .unwrap();
        host.owners
            .lock()
            .unwrap()
            .insert(token.clone(), "editor-owner".into());
        host.renderers
            .lock()
            .unwrap()
            .insert(token.clone(), format!("image-export-{token}"));
        for requester in ["editor-owner".to_owned(), format!("image-export-{token}")] {
            let result = response(&host, &requester, &token, &Method::GET);
            assert_eq!(result.status(), StatusCode::OK);
            assert_eq!(
                result.headers()["Content-Security-Policy"],
                if requester.starts_with("image-export-") {
                    RASTER_CSP
                } else {
                    PREVIEW_CSP
                }
            );
        }
        for requester in [
            "main".to_owned(),
            "editor-other".to_owned(),
            "image-export-other-token".to_owned(),
            format!("print-preview-{token}"),
        ] {
            assert_eq!(
                response(&host, &requester, &token, &Method::GET).status(),
                StatusCode::NOT_FOUND
            );
        }
        assert_eq!(
            response(
                &host,
                &format!("image-export-{token}"),
                "other-token",
                &Method::GET
            )
            .status(),
            StatusCode::NOT_FOUND
        );
        host.revoke(&token);
        assert_eq!(
            response(
                &host,
                &format!("image-export-{token}"),
                &token,
                &Method::GET
            )
            .status(),
            StatusCode::NOT_FOUND
        );
        assert!(host.owners.lock().unwrap().is_empty());
        assert!(host.renderers.lock().unwrap().is_empty());
    }
}
