//! Finite conversion and import transactions. User-selected sources stay read-only.
use super::{
    converter::{default_paths, Pandoc, Scratch},
    main_only, SavedExport,
};
use crate::{export_preferences::ExportPreferencesHost, window_services::WindowServices};
use document_service::{DocumentPayload, Encoding};
use export_service::{
    import_reader, prepare_html, suggested_filename, ConversionFormat, ExportDestination,
    MAX_HTML_BYTES,
};
use serde::Serialize;
use std::{fs::File, io::Read, path::Path};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PandocCapability {
    status: &'static str,
    path: Option<String>,
    version: Option<String>,
    message: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatCapabilities {
    pandoc: PandocCapability,
    formats: Vec<String>,
    import_extensions: Vec<String>,
    image: bool,
}
fn converter(app: &AppHandle) -> Result<Pandoc, String> {
    let settings = app.state::<ExportPreferencesHost>().snapshot(app)?;
    if !settings.pandoc_path.is_empty() {
        return Pandoc::inspect(Path::new(&settings.pandoc_path));
    }
    let found = default_paths().into_iter().find(|path| path.exists());
    match found {
        Some(path) => Pandoc::inspect(&path),
        None => Err("未检测到Pandoc。请在偏好设置→导出选择已安装的Pandoc程序；不会自动安装".into()),
    }
}
pub(crate) fn validate_pandoc_path(path: &Path) -> Result<String, String> {
    Ok(Pandoc::inspect(path)?.path().to_string_lossy().into_owned())
}
const KEYS: [&str; 9] = [
    "docx", "odt", "rtf", "epub", "latex", "wiki", "rst", "textile", "opml",
];
const IMPORTS: [&str; 22] = [
    "docx", "latex", "tex", "ltx", "rst", "rest", "org", "wiki", "dokuwiki", "textile", "opml",
    "epub", "epub2", "epub3", "rtf", "odt", "ipynb", "fodt", "dbk", "fb2", "bfz", "roff",
];
#[tauri::command]
pub async fn get_format_capabilities(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<FormatCapabilities, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let (pandoc, formats, import_extensions) = match converter(&app) {
            Ok(tool) => {
                let formats = KEYS
                    .into_iter()
                    .filter(|k| {
                        ConversionFormat::parse(k)
                            .is_ok_and(|f| tool.writers.iter().any(|w| w == f.writer()))
                    })
                    .map(str::to_owned)
                    .collect();
                let imports = IMPORTS
                    .into_iter()
                    .filter(|e| import_reader(e).is_ok_and(|r| tool.readers.iter().any(|v| v == r)))
                    .map(str::to_owned)
                    .collect();
                (
                    PandocCapability {
                        status: "available",
                        path: Some(tool.path().to_string_lossy().into_owned()),
                        version: Some(tool.version),
                        message: "已验证Pandoc实体、版本与sandbox能力；转换结果仍逐次验证".into(),
                    },
                    formats,
                    imports,
                )
            }
            Err(message) => {
                let selected = app
                    .state::<ExportPreferencesHost>()
                    .snapshot(&app)?
                    .pandoc_path;
                let status = if selected.is_empty() && !default_paths().iter().any(|p| p.exists()) {
                    "missing"
                } else {
                    "invalid"
                };
                (
                    PandocCapability {
                        status,
                        path: (!selected.is_empty()).then_some(selected),
                        version: None,
                        message,
                    },
                    vec![],
                    vec![],
                )
            }
        };
        Ok(FormatCapabilities {
            pandoc,
            formats,
            import_extensions,
            image: cfg!(target_os = "macos"),
        })
    })
    .await
    .map_err(|_| "转换能力检查未完成".to_owned())?
}
#[tauri::command]
pub async fn choose_pandoc_path(
    app: AppHandle,
    window: WebviewWindow,
    expected_revision: u64,
) -> Result<Option<crate::export_preferences::Snapshot>, String> {
    let generation = app
        .state::<crate::platform::ui_chrome::PreferencesHost>()
        .generation_for(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("选择已安装的Pandoc程序")
            .blocking_pick_file();
        let Some(selected) = selected else {
            return Ok(None);
        };
        let path = selected.into_path().map_err(|_| "Pandoc必须为本机文件")?;
        let canonical = validate_pandoc_path(&path)?;
        let snapshot = app.state::<ExportPreferencesHost>().store_pandoc_path(
            &app,
            expected_revision,
            canonical,
            generation,
        )?;
        Ok(Some(snapshot))
    })
    .await
    .map_err(|_| "Pandoc选择任务未完成".to_owned())?
}
fn output_name(name: &str, extension: &str) -> String {
    let html = suggested_filename(name);
    format!(
        "{}.{}",
        html.strip_suffix(".html").unwrap_or("Untitled"),
        extension
    )
}
fn check_extension(path: &Path, extensions: &[&str]) -> Result<(), String> {
    if path
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|e| extensions.iter().any(|x| e.eq_ignore_ascii_case(x)))
    {
        Ok(())
    } else {
        Err("输出扩展名必须与选择的实际格式一致；未保存".into())
    }
}
pub(super) fn source_guard(
    window: &WebviewWindow,
    source_id: Option<&str>,
    path: &Path,
) -> Result<(), String> {
    if let Some(id) = source_id {
        let documents = window
            .state::<WindowServices>()
            .get_documents(window.label())?;
        let source = documents
            .lock()
            .map_err(|_| "文档状态不可用")?
            .authorized_path(id)
            .map_err(|e| e.to_string())?;
        if path == source
            || (path.exists()
                && same_file::is_same_file(&source, path).map_err(|_| "无法核对输出实体")?)
        {
            return Err("导出不能覆盖当前Markdown原稿；请选择其它文件".into());
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn save_export_format(
    app: AppHandle,
    window: WebviewWindow,
    format: String,
    html: String,
    suggested_name: String,
    source_id: Option<String>,
) -> Result<SavedExport, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let format = ConversionFormat::parse(&format)?;
        let prepared = prepare_html(&html).map_err(|e| e.to_string())?;
        let tool = converter(&app)?;
        let scratch = Scratch::new()?;
        let input = scratch.put("snapshot.html", prepared.as_bytes())?;
        let bytes = tool.convert("html", format.writer(), &input, scratch.path())?;
        format.validate(&bytes)?;
        let path = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title(format!("导出为 {}", format.title()))
            .set_file_name(output_name(&suggested_name, format.extension()))
            .add_filter(format.title(), &[format.extension()])
            .blocking_save_file()
            .ok_or("已取消导出")?
            .into_path()
            .map_err(|_| "无法读取导出路径")?;
        main_only(&window)?;
        check_extension(&path, &[format.extension()])?;
        source_guard(&window, source_id.as_deref(), &path)?;
        let destination = ExportDestination::authorize(&path).map_err(|e| e.to_string())?;
        let result = SavedExport {
            path: destination.path().to_string_lossy().into_owned(),
            bytes: bytes.len(),
        };
        destination.write_bytes(&bytes).map_err(|e| e.to_string())?;
        Ok(result)
    })
    .await
    .map_err(|_| "格式导出任务未完成".to_owned())?
}
fn validate_import_ast(value: &serde_json::Value) -> Result<(), String> {
    let mut queue = vec![(value, 0)];
    let mut visited = 0;
    while let Some((value, depth)) = queue.pop() {
        visited += 1;
        if visited > 200_000 || depth > 128 {
            return Err("导入结构超过支持范围；未创建Markdown".into());
        }
        match value {
            serde_json::Value::Object(object) => {
                if object.contains_key("typora-root-url")
                    || object.contains_key("typora-copy-images-to")
                {
                    return Err(
                        "导入元数据包含图片目录权限设置；请先移除后重试，未创建Markdown".into(),
                    );
                }
                if object
                    .get("t")
                    .and_then(|s| s.as_str())
                    .is_some_and(|s| matches!(s, "Image" | "RawBlock" | "RawInline"))
                {
                    return Err(
                        "此导入含图片或原始嵌入内容；资源迁移尚未验证，未创建可能丢图的Markdown"
                            .into(),
                    );
                }
                queue.extend(object.values().map(|v| (v, depth + 1)));
            }
            serde_json::Value::Array(array) => queue.extend(array.iter().map(|v| (v, depth + 1))),
            _ => {}
        }
    }
    Ok(())
}
fn source_snapshot(path: &Path) -> Result<(same_file::Handle, Vec<u8>), String> {
    let file = File::open(path).map_err(|_| "无法读取待导入文件")?;
    let meta = file.metadata().map_err(|_| "无法读取导入元数据")?;
    if !meta.is_file() || meta.len() > MAX_HTML_BYTES as u64 {
        return Err("导入源不是普通文件或超过32 MiB".into());
    }
    let identity = same_file::Handle::from_file(file.try_clone().map_err(|_| "无法绑定导入源")?)
        .map_err(|_| "无法绑定导入实体")?;
    let mut bytes = Vec::with_capacity(meta.len() as usize);
    file.take(MAX_HTML_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "导入读取失败")?;
    if bytes.len() > MAX_HTML_BYTES
        || bytes.len() as u64 != meta.len()
        || identity != same_file::Handle::from_path(path).map_err(|_| "导入源已移动")?
        || std::fs::metadata(path)
            .map_err(|_| "导入源已失效")?
            .modified()
            .ok()
            != meta.modified().ok()
    {
        return Err("读取期间导入源发生变化，未创建Markdown".into());
    }
    Ok((identity, bytes))
}
#[tauri::command]
pub async fn import_document(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<DocumentPayload, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let tool = converter(&app)?;
        let source = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("导入文档（转换为新的Markdown）")
            .add_filter("MarkLyra 支持的导入格式", &IMPORTS)
            .blocking_pick_file()
            .ok_or("已取消导入")?
            .into_path()
            .map_err(|_| "无法读取导入路径")?;
        let extension = source
            .extension()
            .and_then(|s| s.to_str())
            .ok_or("导入源缺少格式扩展")?;
        let reader = import_reader(extension)?;
        let (identity, bytes) = source_snapshot(&source)?;
        let bytes = if matches!(reader, "docx" | "odt" | "epub") {
            bytes
        } else {
            Encoding::decode(&bytes)
                .map_err(|e| e.to_string())?
                .1
                .into_bytes()
        };
        let scratch = Scratch::new()?;
        let input = scratch.put("input", &bytes)?;
        let json = tool.convert(reader, "json", &input, scratch.path())?;
        let ast: serde_json::Value =
            serde_json::from_slice(&json).map_err(|_| "Pandoc未产生有效文档结构")?;
        validate_import_ast(&ast)?;
        let intermediate = scratch.put("document.json", &json)?;
        let markdown = tool.convert(
            "json",
            "markdown+yaml_metadata_block-raw_html-raw_tex",
            &intermediate,
            scratch.path(),
        )?;
        let (_, text) = Encoding::decode(&markdown).map_err(|e| e.to_string())?;
        document_service::validate_text(&text).map_err(|e| e.to_string())?;
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("导入后另存为新的Markdown（原文件保持只读）")
            .set_file_name(output_name(
                source
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Imported"),
                "md",
            ))
            .add_filter("Markdown", &["md", "markdown"])
            .blocking_save_file()
            .ok_or("已取消导入另存")?
            .into_path()
            .map_err(|_| "无法读取Markdown目标")?;
        main_only(&window)?;
        check_extension(&selected, &["md", "markdown"])?;
        app.state::<crate::file_preferences::FilePreferencesHost>()
            .require_document_type(&app, &selected)?;
        if selected == source
            || (selected.exists()
                && identity
                    == same_file::Handle::from_path(&selected).map_err(|_| "无法核对导入目标")?)
        {
            return Err("导入不能覆盖源文件或其硬链接；请选择新的Markdown路径".into());
        }
        // Never replace another file on import: selecting an existing target requires a new name.
        if selected.exists() {
            return Err("导入须另存为新文件，所选目标已存在；原文件未修改".into());
        }
        let destination = ExportDestination::authorize_new(&selected).map_err(|e| e.to_string())?;
        destination
            .write_bytes(text.as_bytes())
            .map_err(|e| e.to_string())?;
        window
            .state::<WindowServices>()
            .write_document(window.label(), |documents| {
                documents.open_authorized(&selected)
            })
    })
    .await
    .map_err(|_| "导入任务未能完成".to_owned())?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn imported_images_raw_content_and_root_permissions_fail_explicitly() {
        for ast in [
            serde_json::json!({"blocks":[{"t":"Image","c":[]}]}),
            serde_json::json!({"meta":{"typora-root-url":{"t":"MetaString","c":"/private"}}}),
            serde_json::json!({"t":"RawBlock","c":["html","<img src=file:///private>"]}),
        ] {
            assert!(validate_import_ast(&ast).is_err());
        }
        assert!(validate_import_ast(&serde_json::json!({"meta":{"title":{"t":"MetaString","c":"中文"}},"blocks":[{"t":"Para","c":[{"t":"Str","c":"正文"}]}]})).is_ok());
    }
    #[test]
    fn format_extension_and_names_cannot_substitute_conversion() {
        assert!(check_extension(Path::new("wrong.md"), &["docx"]).is_err());
        assert_eq!(output_name("../../中文.md", "tex"), "中文.tex");
    }
    #[test]
    fn source_is_read_only_and_encoding_is_explicit() {
        let temp = tempfile::tempdir().unwrap();
        let source = temp.path().join("source.tex");
        let bytes = Encoding::Utf16LeBom.encode("\\section{中文}").unwrap();
        std::fs::write(&source, &bytes).unwrap();
        let (_, read) = source_snapshot(&source).unwrap();
        assert_eq!(Encoding::decode(&read).unwrap().1, "\\section{中文}");
        assert_eq!(std::fs::read(&source).unwrap(), bytes);
    }
}
