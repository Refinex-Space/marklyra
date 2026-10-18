//! Whole-document raster output in an owned, hidden renderer.
use super::{
    formats::source_guard,
    image_geometry::{CaptureResult, Geometry},
    main_only, preview_url, ExportHost, SavedExport,
};
use crate::export_preferences::ImageSettings;
use export_service::{prepare_html, suggested_filename, ExportDestination};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent, PermissionResponse},
    AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_dialog::DialogExt;

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
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, window, html, suggested_name, source_id, options);
        Err("此平台的整篇图片输出尚未实现；未生成替代截图".into())
    }
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let settings = options.unwrap_or_default();
            let geometry = Geometry::from_settings(&settings)?;
            let font = if settings.use_theme_font_size.unwrap_or(0) == 0 {
                format!(
                    "body,#write{{font-size:{}px!important}}",
                    settings.image_font_size.unwrap_or(24)
                )
            } else {
                String::new()
            };
            // Constant trusted layout only; no source text or user script is evaluated.
            let css = format!(
                "<style>html,body{{margin:0!important;min-width:0!important;min-height:0!important}}#write{{width:100%!important;max-width:none!important;box-sizing:border-box!important;margin:0!important;padding:20px!important}}{font}</style>"
            );
            let html = if let Some(index) = html.rfind("</head>") {
                format!("{}{}{}", &html[..index], css, &html[index..])
            } else {
                return Err("图片导出缺少完整HTML文档".into());
            };
            let prepared = prepare_html(&html).map_err(|error| error.to_string())?;
            let name = suggested_filename(&suggested_name);
            let name = format!("{}.png", name.strip_suffix(".html").unwrap_or("Untitled"));
            let path = app
                .dialog()
                .file()
                .set_parent(&window)
                .set_title("导出整篇图片")
                .set_file_name(name)
                .add_filter("PNG / JPEG", &["png", "jpg", "jpeg"])
                .blocking_save_file()
                .ok_or("已取消导出")?
                .into_path()
                .map_err(|_| "无法读取图片输出路径")?;
            main_only(&window)?;
            source_guard(&window, source_id.as_deref(), &path)?;
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
            let destination =
                ExportDestination::authorize(&path).map_err(|error| error.to_string())?;
            let token = {
                let host = app.state::<ExportHost>();
                let mut registry = host.registry.lock().map_err(|_| "导出资源状态不可用")?;
                let mut owners = host.owners.lock().map_err(|_| "导出所有权状态不可用")?;
                let mut renderers = host.renderers.lock().map_err(|_| "导出渲染器状态不可用")?;
                let token = registry.insert(prepared).map_err(|error| error.to_string())?;
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
            let builder = WebviewWindowBuilder::new(
                &app,
                &label,
                WebviewUrl::External(preview_url(&token)),
            )
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
            let bytes = result?;
            source_guard(&window, source_id.as_deref(), &path)?;
            let result = SavedExport {
                path: destination.path().to_string_lossy().into_owned(),
                bytes: bytes.len(),
            };
            destination
                .write_bytes(&bytes)
                .map_err(|error| error.to_string())?;
            Ok(result)
        })
        .await
        .map_err(|_| "图片导出任务未完成".to_owned())?
    }
}
