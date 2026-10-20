//! Whole-document raster output in an owned, hidden renderer.
use super::{delivery, image_geometry::Geometry, main_only, SavedExport};
use crate::export_preferences::ImageSettings;
use export_service::{prepare_html, suggested_filename};
use tauri::{AppHandle, WebviewWindow};

impl Geometry {
    fn from_settings(settings: &ImageSettings) -> Result<Self, String> {
        settings.validate()?;
        Ok(Self {
            width: settings.image_width.unwrap_or(640),
            scale: match settings.quality.unwrap_or(0) {
                2 => 2,
                3 => 3,
                _ => 1,
            },
        })
    }
}

/// Constant trusted layout only; no source text or user script is evaluated.
fn image_layout(settings: &ImageSettings) -> String {
    let font = if settings.use_theme_font_size.unwrap_or(0) == 0 {
        format!(
            "body,#write{{font-size:{}px!important}}",
            settings.image_font_size.unwrap_or(24)
        )
    } else {
        String::new()
    };
    format!(
        "<style>html,body{{margin:0!important;min-width:0!important;min-height:0!important}}#write{{width:100%!important;max-width:none!important;box-sizing:border-box!important;margin:0!important;padding:20px!important}}{font}</style>"
    )
}

#[tauri::command]
pub async fn save_export_image(
    app: AppHandle,
    window: WebviewWindow,
    html: String,
    suggested_name: String,
    source_id: Option<String>,
    options: Option<ImageSettings>,
) -> Result<SavedExport, String> {
    main_only(&window)?;
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (app, window, html, suggested_name, source_id, options);
        Err("此平台的整篇图片输出尚未实现；未生成替代截图".into())
    }
    #[cfg(any(target_os = "macos", windows))]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let settings = options.unwrap_or_default();
            let geometry = Geometry::from_settings(&settings)?;
            let html = if let Some(index) = html.rfind("</head>") {
                format!(
                    "{}{}{}",
                    &html[..index],
                    image_layout(&settings),
                    &html[index..]
                )
            } else {
                return Err("图片导出缺少完整HTML文档".into());
            };
            let prepared = prepare_html(&html).map_err(|error| error.to_string())?;
            let name = suggested_filename(&suggested_name);
            let name = format!("{}.png", name.strip_suffix(".html").unwrap_or("Untitled"));
            let path = delivery::ask_destination(
                &app,
                &window,
                "导出整篇图片",
                name,
                ("PNG / JPEG", &["png", "jpg", "jpeg"]),
                source_id.as_deref(),
            )?;
            let jpeg = match path
                .extension()
                .and_then(|extension| extension.to_str())
                .map(str::to_ascii_lowercase)
                .as_deref()
            {
                Some("png") => false,
                Some("jpg" | "jpeg") => true,
                _ => return Err("图片输出必须选择png/jpg/jpeg扩展名".into()),
            };
            let bytes = capture(&app, &window, prepared, geometry, jpeg)?;
            delivery::deliver(
                &app,
                &window,
                &path,
                source_id.as_deref(),
                &bytes,
                Vec::new(),
            )
        })
        .await
        .map_err(|_| "图片导出任务未完成".to_owned())?
    }
}

#[cfg(windows)]
fn capture(
    app: &AppHandle,
    window: &WebviewWindow,
    prepared: export_service::PreparedHtml,
    geometry: Geometry,
    jpeg: bool,
) -> Result<Vec<u8>, String> {
    super::image_windows::capture(app, window, prepared, geometry, jpeg)
}

#[cfg(target_os = "macos")]
fn capture(
    app: &AppHandle,
    window: &WebviewWindow,
    prepared: export_service::PreparedHtml,
    geometry: Geometry,
    jpeg: bool,
) -> Result<Vec<u8>, String> {
    use super::{image_geometry::CaptureResult, preview_url, ExportHost};
    use std::{
        sync::{
            atomic::{AtomicBool, Ordering},
            mpsc, Arc, Mutex,
        },
        time::Duration,
    };
    use tauri::{
        webview::{NewWindowResponse, PageLoadEvent, PermissionResponse},
        Manager, WebviewUrl, WebviewWindowBuilder,
    };
    let token = {
        let host = app.state::<ExportHost>();
        let mut registry = host.registry.lock().map_err(|_| "导出资源状态不可用")?;
        let mut owners = host.owners.lock().map_err(|_| "导出所有权状态不可用")?;
        let mut renderers = host.renderers.lock().map_err(|_| "导出渲染器状态不可用")?;
        let token = registry
            .insert(prepared)
            .map_err(|error| error.to_string())?;
        owners.insert(token.clone(), window.label().to_owned());
        renderers.insert(token.clone(), format!("image-export-{token}"));
        token
    };
    let label = format!("image-export-{token}");
    let (tx, rx) = mpsc::channel();
    let sender: CaptureResult = Arc::new(Mutex::new(Some(tx)));
    let done = Arc::new(AtomicBool::new(false));
    let ready = sender.clone();
    let ready_done = done.clone();
    let expected = token.clone();
    let ready_token = token.clone();
    // The document CSP prohibits page scripts. Keep the JavaScript engine
    // available solely for the native host's fixed layout probe.
    let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(preview_url(&token)))
        .title("图片导出")
        .visible(false)
        .focused(false)
        .inner_size(f64::from(geometry.width), 64.0)
        .decorations(false)
        .disable_drag_drop_handler()
        .incognito(true)
        .devtools(false)
        .on_navigation(move |url| super::allowed_navigation(url, &expected))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_download(|_, _| false)
        .on_permission_request(|_, _| PermissionResponse::Deny)
        .on_page_load(move |view, event| {
            if event.event() == PageLoadEvent::Finished
                && super::allowed_navigation(event.url(), &ready_token)
            {
                super::image_macos::capture(
                    view.clone(),
                    geometry,
                    jpeg,
                    ready.clone(),
                    ready_done.clone(),
                );
            }
        });
    let renderer = match builder.build() {
        Ok(view) => view,
        Err(_) => {
            app.state::<ExportHost>().revoke(&token);
            return Err("无法创建隔离图片渲染器".into());
        }
    };
    let result = rx
        .recv_timeout(Duration::from_secs(30))
        .map_err(|_| "图片、字体或布局未在30秒内就绪；未保存".to_owned())
        .and_then(|result| result);
    done.store(true, Ordering::Release);
    let _ = renderer.destroy();
    app.state::<ExportHost>().revoke(&token);
    result
}
