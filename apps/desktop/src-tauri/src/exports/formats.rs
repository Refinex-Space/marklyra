//! Finite conversion and import transactions. User-selected sources stay read-only.
use super::{
    arguments,
    converter::{default_paths, summarize, Pandoc, Scratch},
    delivery, main_only, SavedExport,
};
use crate::{
    export_preferences::{
        builtin_writer, ExportPreferencesHost, PandocFormat, PathTarget, Snapshot,
    },
    window_services::WindowServices,
};
use document_service::{DocumentPayload, Encoding};
use export_service::{
    import_reader, suggested_filename, validate_converted, ConversionFormat, ExportDestination,
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
    /// Built-in Pandoc formats this Pandoc can write.
    formats: Vec<String>,
    /// Every output format this Pandoc offers to a custom export.
    writers: Vec<String>,
    import_extensions: Vec<String>,
    image: bool,
    /// `direct` writes a PDF file; `dialog` hands the page to the system print panel.
    pdf: &'static str,
    /// Whether PDF header/footer, bookmarks and background are applied by this host.
    header_footer: bool,
}
fn converter(app: &AppHandle) -> Result<Pandoc, String> {
    let settings = app.state::<ExportPreferencesHost>().snapshot(app)?;
    if !settings.pandoc_path.is_empty() {
        return Pandoc::inspect(Path::new(&settings.pandoc_path));
    }
    // An old or broken copy earlier on the PATH must not hide a good one further down.
    let mut first_failure = None;
    for path in default_paths().into_iter().filter(|path| path.is_file()) {
        match Pandoc::inspect(&path) {
            Ok(tool) => return Ok(tool),
            Err(error) => {
                first_failure.get_or_insert(error);
            }
        }
    }
    Err(first_failure.unwrap_or_else(|| {
        "未检测到Pandoc。请安装Pandoc，或在偏好设置→导出中选择已安装的Pandoc程序；不会自动安装"
            .into()
    }))
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
/// Pandoc writers that cannot yield one standalone file from this pipeline.
const UNSUITABLE_WRITERS: [&str; 3] = ["pdf", "chunkedhtml", "lua"];
#[tauri::command]
pub async fn get_format_capabilities(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<FormatCapabilities, String> {
    // The settings window shows these capabilities next to the options they gate.
    if window.label() != "preferences" {
        main_only(&window)?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let (pandoc, formats, writers, import_extensions) = match converter(&app) {
            Ok(tool) => {
                let formats = KEYS
                    .into_iter()
                    .filter(|k| {
                        ConversionFormat::parse(k)
                            .is_ok_and(|f| tool.writers.iter().any(|w| w == f.writer()))
                    })
                    .map(str::to_owned)
                    .collect();
                let writers = tool
                    .writers
                    .iter()
                    .filter(|writer| !UNSUITABLE_WRITERS.contains(&writer.as_str()))
                    .cloned()
                    .collect();
                let imports = IMPORTS
                    .into_iter()
                    .filter(|e| import_reader(e).is_ok_and(|r| tool.readers.iter().any(|v| v == r)))
                    .map(str::to_owned)
                    .collect();
                (
                    PandocCapability {
                        status: "available",
                        path: Some(delivery::plain(tool.path()).to_string_lossy().into_owned()),
                        version: Some(tool.version),
                        message: "已验证Pandoc实体、版本与沙箱能力；转换结果仍逐次验证".into(),
                    },
                    formats,
                    writers,
                    imports,
                )
            }
            Err(message) => {
                let selected = app
                    .state::<ExportPreferencesHost>()
                    .snapshot(&app)?
                    .pandoc_path;
                let status = if selected.is_empty() && !default_paths().iter().any(|p| p.is_file())
                {
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
                    vec![],
                )
            }
        };
        Ok(FormatCapabilities {
            pandoc,
            formats,
            writers,
            import_extensions,
            image: cfg!(any(target_os = "macos", windows)),
            pdf: if cfg!(windows) {
                "direct"
            } else if cfg!(target_os = "macos") {
                "dialog"
            } else {
                "none"
            },
            header_footer: cfg!(windows),
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
        let canonical = delivery::plain(Path::new(&validate_pandoc_path(&path)?))
            .to_string_lossy()
            .into_owned();
        let snapshot = app.state::<ExportPreferencesHost>().store_pandoc_path(
            &app,
            expected_revision,
            canonical,
            generation,
        )?;
        crate::export_preferences::notify_changed(&app, &snapshot);
        Ok(Some(snapshot))
    })
    .await
    .map_err(|_| "Pandoc选择任务未完成".to_owned())?
}
const MAX_REFERENCE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_TEMPLATE_BYTES: u64 = 1024 * 1024;
fn checked_file(path: &Path, limit: u64, extensions: &[&str]) -> Result<(), String> {
    let metadata = std::fs::metadata(path).map_err(|_| "所选文件不存在或无法读取")?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > limit {
        return Err(format!(
            "所选文件必须是不超过 {} MiB 的普通文件",
            limit / 1024 / 1024
        )
        .replace("0 MiB", "1 MiB"));
    }
    if !extensions.is_empty()
        && !path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| extensions.iter().any(|x| e.eq_ignore_ascii_case(x)))
    {
        return Err(format!("请选择 {} 文件", extensions.join(" / ")));
    }
    Ok(())
}
/// Native dialog for a location the settings store themselves: the default export folder, a
/// style reference document or a template. The typed text field never carries a path.
#[tauri::command]
pub async fn choose_export_path(
    app: AppHandle,
    window: WebviewWindow,
    expected_revision: u64,
    target: PathTarget,
) -> Result<Option<Snapshot>, String> {
    let generation = app
        .state::<crate::platform::ui_chrome::PreferencesHost>()
        .generation_for(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = app.dialog().file().set_parent(&window);
        let path = match &target {
            PathTarget::Folder => {
                let Some(folder) = dialog
                    .set_title("选择默认的导出文件夹")
                    .blocking_pick_folder()
                else {
                    return Ok(None);
                };
                let folder = folder.into_path().map_err(|_| "导出文件夹必须在本机")?;
                if !folder.is_dir() {
                    return Err("所选位置不是文件夹".to_owned());
                }
                folder
            }
            PathTarget::ReferenceDoc { format } => {
                let writer = format_writer(&app, format)?;
                let (name, extension) = if writer == "odt" {
                    ("OpenOffice 文档", "odt")
                } else {
                    ("Word 文档", "docx")
                };
                let Some(file) = dialog
                    .set_title("选择样式参考文档")
                    .add_filter(name, &[extension])
                    .blocking_pick_file()
                else {
                    return Ok(None);
                };
                let file = file.into_path().map_err(|_| "参考文档必须在本机")?;
                checked_file(&file, MAX_REFERENCE_BYTES, &[extension])?;
                file
            }
            PathTarget::Template { format } => {
                format_writer(&app, format)?;
                let Some(file) = dialog.set_title("选择模板文件").blocking_pick_file() else {
                    return Ok(None);
                };
                let file = file.into_path().map_err(|_| "模板必须在本机")?;
                checked_file(&file, MAX_TEMPLATE_BYTES, &[])?;
                file
            }
        };
        let path = delivery::plain(&std::fs::canonicalize(&path).map_err(|_| "无法解析所选路径")?);
        let snapshot = app.state::<ExportPreferencesHost>().store_path(
            &app,
            expected_revision,
            &target,
            &path.to_string_lossy(),
            generation,
        )?;
        crate::export_preferences::notify_changed(&app, &snapshot);
        Ok(Some(snapshot))
    })
    .await
    .map_err(|_| "路径选择任务未完成".to_owned())?
}
/// The Pandoc writer behind a built-in key or a custom export.
fn format_writer(app: &AppHandle, target: &str) -> Result<String, String> {
    if let Some(id) = target.strip_prefix("custom:") {
        let settings = app.state::<ExportPreferencesHost>().snapshot(app)?;
        return settings
            .custom_export(id)
            .map(|item| {
                item.writer
                    .split(['+', '-'])
                    .next()
                    .unwrap_or_default()
                    .to_owned()
            })
            .ok_or_else(|| "自定义导出不存在".to_owned());
    }
    builtin_writer(target)
        .map(str::to_owned)
        .ok_or_else(|| "导出格式未知".to_owned())
}
/// Live check of the free-form "extra arguments" field, with the same rules the export applies.
#[tauri::command]
pub fn check_export_arguments(text: String) -> Result<Vec<String>, String> {
    arguments::parse(&text)
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

/// A line that is only `[TOC]` asks for a table of contents, as in the editor; Pandoc has no
/// such syntax, so it becomes the `--toc` switch. Fenced code is left alone.
fn take_toc_marker(markdown: &str) -> (String, bool) {
    let mut fence: Option<(char, usize)> = None;
    let mut found = false;
    let mut kept = Vec::new();
    for line in markdown.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\r', '\n']);
        let stripped = trimmed.trim_start();
        let indent = trimmed.len() - stripped.len();
        if let Some(character) = stripped.chars().next().filter(|c| matches!(c, '`' | '~')) {
            let run = stripped.chars().take_while(|c| *c == character).count();
            if indent <= 3 && run >= 3 {
                match fence {
                    None => fence = Some((character, run)),
                    Some((open, size))
                        if open == character
                            && run >= size
                            && stripped.trim_start_matches(character).trim().is_empty() =>
                    {
                        fence = None
                    }
                    _ => {}
                }
                kept.push(line);
                continue;
            }
        }
        if fence.is_none() && stripped.trim_end().eq_ignore_ascii_case("[toc]") && indent <= 3 {
            found = true;
            continue;
        }
        kept.push(line);
    }
    (kept.concat(), found)
}

/// Pandoc switches for one format: structured options first, then the validated free-form text.
fn pandoc_arguments(options: &PandocFormat, toc_marker: bool) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    if options.toc == Some(true) || toc_marker {
        args.push("--toc".to_owned());
        if let Some(depth) = options.toc_depth {
            args.push(format!("--toc-depth={depth}"));
        }
    }
    if options.number_sections == Some(true) {
        args.push("--number-sections".into());
    }
    for (flag, path, limit, extensions) in [
        (
            "--reference-doc",
            options.reference_doc.as_deref(),
            MAX_REFERENCE_BYTES,
            &["docx", "odt"][..],
        ),
        (
            "--template",
            options.template.as_deref(),
            MAX_TEMPLATE_BYTES,
            &[][..],
        ),
    ] {
        if let Some(path) = path.filter(|path| !path.is_empty()) {
            checked_file(Path::new(path), limit, extensions)
                .map_err(|message| format!("{flag} 指向的文件不可用：{message}"))?;
            args.push(format!("{flag}={path}"));
        }
    }
    if let Some(text) = options.extra_arguments.as_deref() {
        args.extend(arguments::parse(text)?);
    }
    Ok(args)
}

struct Plan {
    writer: String,
    extension: String,
    title: String,
    builtin: Option<ConversionFormat>,
    options: PandocFormat,
}
fn plan(settings: &Snapshot, target: &str) -> Result<Plan, String> {
    if let Some(id) = target.strip_prefix("custom:") {
        let custom = settings.custom_export(id).ok_or("自定义导出不存在")?;
        return Ok(Plan {
            writer: custom.writer.clone(),
            extension: custom.extension.clone(),
            title: custom.name.clone(),
            builtin: None,
            options: custom.options.clone(),
        });
    }
    let format = ConversionFormat::parse(target)?;
    Ok(Plan {
        writer: format.writer().to_owned(),
        extension: format.extension().to_owned(),
        title: format.title().to_owned(),
        builtin: Some(format),
        options: settings.pandoc_options(target).unwrap_or_default(),
    })
}

/// Converts the editor's Markdown (images already embedded) with Pandoc and saves the result.
/// `target` is a built-in key such as `docx` or `custom:<id>`; options come from the settings.
#[tauri::command]
pub async fn save_export_format(
    app: AppHandle,
    window: WebviewWindow,
    target: String,
    markdown: String,
    suggested_name: String,
    source_id: Option<String>,
) -> Result<SavedExport, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let settings = app.state::<ExportPreferencesHost>().snapshot(&app)?;
        let plan = plan(&settings, &target)?;
        if markdown.trim().is_empty() || markdown.len() > MAX_HTML_BYTES || markdown.contains('\0')
        {
            return Err("文稿为空、含 NUL 或超过 32 MiB；未导出".to_owned());
        }
        let (markdown, toc_marker) = take_toc_marker(&markdown);
        let extra = pandoc_arguments(&plan.options, toc_marker)?;
        let tool = converter(&app)?;
        let scratch = Scratch::new()?;
        let input = scratch.put("snapshot.md", markdown.as_bytes())?;
        let converted = tool
            .export(
                &tool.markdown_reader(),
                &plan.writer,
                &input,
                scratch.path(),
                &extra,
            )
            .map_err(|failure| {
                let detail = summarize(&failure.stderr, scratch.path(), 3).join("；");
                if detail.is_empty() {
                    failure.message
                } else {
                    format!("{}：{detail}", failure.message)
                }
            })?;
        match plan.builtin {
            Some(format) => format.validate(&converted.bytes)?,
            None => validate_converted(&converted.bytes)?,
        }
        let path = delivery::ask_destination(
            &app,
            &window,
            &format!("导出为 {}", plan.title),
            output_name(&suggested_name, &plan.extension),
            (&plan.title, &[plan.extension.as_str()]),
            source_id.as_deref(),
        )?;
        check_extension(&path, &[plan.extension.as_str()])?;
        delivery::deliver(
            &app,
            &window,
            &path,
            source_id.as_deref(),
            &converted.bytes,
            converted.warnings,
        )
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
                if object
                    .keys()
                    .any(|key| key.ends_with("-root-url") || key.ends_with("-copy-images-to"))
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
    use super::super::converter::{Converted, Scratch};
    use super::*;
    #[test]
    fn imported_images_raw_content_and_root_permissions_fail_explicitly() {
        for ast in [
            serde_json::json!({"blocks":[{"t":"Image","c":[]}]}),
            serde_json::json!({"meta":{"marklyra-root-url":{"t":"MetaString","c":"/private"}}}),
            serde_json::json!({"meta":{"marklyra-copy-images-to":{"t":"MetaString","c":"/private"}}}),
            serde_json::json!({"meta":{"legacy-editor-root-url":{"t":"MetaString","c":"/private"}}}),
            serde_json::json!({"meta":{"legacy-editor-copy-images-to":{"t":"MetaString","c":"/private"}}}),
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

    #[test]
    fn a_toc_marker_line_becomes_a_switch_and_code_fences_are_left_alone() {
        let (text, found) = take_toc_marker("# T\n\n[TOC]\n\n正文\n");
        assert!(found);
        assert_eq!(text, "# T\n\n\n正文\n");
        let (text, found) = take_toc_marker("  [toc]  \r\n正文\r\n");
        assert!(found);
        assert_eq!(text, "正文\r\n");
        let fenced = "```\n[TOC]\n```\n~~~md\n[TOC]\n~~~\n    [TOC]\ntext [TOC] inline\n";
        let (text, found) = take_toc_marker(fenced);
        assert!(!found);
        assert_eq!(text, fenced);
    }

    #[test]
    fn structured_options_come_first_and_free_text_is_validated() {
        let args = pandoc_arguments(
            &PandocFormat {
                toc: Some(true),
                toc_depth: Some(2),
                number_sections: Some(true),
                extra_arguments: Some("-V mainfont:SimSun --wrap=none".into()),
                ..Default::default()
            },
            false,
        )
        .unwrap();
        assert_eq!(
            args,
            [
                "--toc",
                "--toc-depth=2",
                "--number-sections",
                "--variable=mainfont:SimSun",
                "--wrap=none"
            ]
        );
        // A marker alone is enough for a table of contents.
        assert_eq!(
            pandoc_arguments(&PandocFormat::default(), true).unwrap(),
            ["--toc"]
        );
        assert!(pandoc_arguments(&PandocFormat::default(), false)
            .unwrap()
            .is_empty());
        for bad in [
            PandocFormat {
                extra_arguments: Some("--lua-filter=x.lua".into()),
                ..Default::default()
            },
            PandocFormat {
                reference_doc: Some(
                    std::env::temp_dir()
                        .join("marklyra-missing.docx")
                        .to_string_lossy()
                        .into_owned(),
                ),
                ..Default::default()
            },
        ] {
            assert!(pandoc_arguments(&bad, false).is_err());
        }
    }

    fn installed_pandoc() -> Option<Pandoc> {
        let path = default_paths().into_iter().find(|path| path.is_file())?;
        Pandoc::inspect(&path).ok()
    }

    const SAMPLE: &str = "---\ntitle: 测试文档\nauthor: liyao\n---\n\n# 标题一\n\n段落含 **粗体**、~~删除线~~、==高亮==、H~2~O、x^2^ 与行内公式 $E=mc^2$。\n\n$$\n\\int_0^1 x^2 dx = \\frac13\n$$\n\n- [x] 完成\n- [ ] 待办\n\n| 列A | 列B |\n|-----|-----|\n| 1   | 2   |\n\n脚注[^1] 与表情 :smile:。\n\n[^1]: 脚注内容\n\n```python\nprint(\"hi\")\n```\n\n![图](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR4nGP8z/CfgRTARJJqhlENxAEmItXBwagGYgDJoQQASk4CHq8YfaYAAAAASUVORK5CYII=)\n";

    fn convert(tool: &Pandoc, writer: &str, markdown: &str, extra: &[String]) -> Converted {
        let scratch = Scratch::new().unwrap();
        let input = scratch.put("snapshot.md", markdown.as_bytes()).unwrap();
        tool.export(
            &tool.markdown_reader(),
            writer,
            &input,
            scratch.path(),
            extra,
        )
        .map_err(|failure| failure.message)
        .unwrap()
    }

    fn zip_text(bytes: &[u8], name: &str) -> String {
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let mut text = String::new();
        archive
            .by_name(name)
            .unwrap()
            .read_to_string(&mut text)
            .unwrap();
        text
    }

    #[test]
    fn real_pandoc_keeps_math_notes_tables_and_images_in_word() {
        let Some(tool) = installed_pandoc() else {
            eprintln!("Pandoc is not installed; real conversion test skipped");
            return;
        };
        let converted = convert(&tool, "docx", SAMPLE, &["--toc".to_owned()]);
        ConversionFormat::Docx.validate(&converted.bytes).unwrap();
        let document = zip_text(&converted.bytes, "word/document.xml");
        // Formulas stay native Word formulas instead of becoming pictures or dollar text.
        assert!(document.contains("<m:oMath"), "formulas became text");
        assert!(!document.contains("E=mc^2"));
        assert!(document.contains("<w:tbl>"));
        assert!(document.contains("w:footnoteReference"));
        assert!(document.contains("<w:strike"));
        assert!(document.contains("<w:highlight"));
        assert!(
            document.contains("a:blip"),
            "the embedded image was dropped"
        );
        assert!(document.contains("测试文档"));
        assert!(document.contains("TOC \\o"), "no table of contents field");
        assert!(
            converted.warnings.is_empty(),
            "unexpected warnings: {:?}",
            converted.warnings
        );
    }

    #[test]
    fn real_pandoc_writes_every_builtin_format_with_a_valid_container() {
        let Some(tool) = installed_pandoc() else {
            eprintln!("Pandoc is not installed; real conversion test skipped");
            return;
        };
        for key in KEYS {
            let format = ConversionFormat::parse(key).unwrap();
            let converted = convert(&tool, format.writer(), SAMPLE, &[]);
            format
                .validate(&converted.bytes)
                .unwrap_or_else(|error| panic!("{key}: {error}"));
        }
        let latex = String::from_utf8(convert(&tool, "latex", SAMPLE, &[]).bytes).unwrap();
        assert!(latex.contains("E=mc^2") && latex.contains("\\footnote{"));
    }

    #[test]
    fn real_pandoc_reports_warnings_without_blocking_the_file() {
        let Some(tool) = installed_pandoc() else {
            eprintln!("Pandoc is not installed; real conversion test skipped");
            return;
        };
        // A remote picture cannot be fetched inside the sandbox: the file is still produced.
        let converted = convert(
            &tool,
            "docx",
            "# 标题\n\n![远程](https://example.invalid/a.png)\n\n正文\n",
            &[],
        );
        ConversionFormat::Docx.validate(&converted.bytes).unwrap();
        assert!(
            !converted.warnings.is_empty(),
            "the missing picture should be reported"
        );
        assert!(converted.warnings.iter().all(|line| line.len() <= 240));
    }

    #[test]
    fn real_pandoc_chinese_lines_join_without_a_space_and_custom_writers_work() {
        let Some(tool) = installed_pandoc() else {
            eprintln!("Pandoc is not installed; real conversion test skipped");
            return;
        };
        if !tool
            .markdown_extensions
            .iter()
            .any(|name| name == "east_asian_line_breaks")
        {
            return;
        }
        let converted = convert(&tool, "plain", "你好\n世界\n", &[]);
        let text = String::from_utf8(converted.bytes).unwrap();
        assert!(text.contains("你好世界"), "{text:?}");
        let asciidoc = convert(&tool, "asciidoc", "# 标题\n\n正文\n", &[]);
        validate_converted(&asciidoc.bytes).unwrap();
        // An unknown writer is refused before anything runs.
        let scratch = Scratch::new().unwrap();
        let input = scratch.put("snapshot.md", b"x").unwrap();
        assert!(tool
            .export(
                &tool.markdown_reader(),
                "nonexistent",
                &input,
                scratch.path(),
                &[]
            )
            .is_err());
    }

    #[test]
    fn a_failed_conversion_says_why_without_paths() {
        let Some(tool) = installed_pandoc() else {
            eprintln!("Pandoc is not installed; real conversion test skipped");
            return;
        };
        let scratch = Scratch::new().unwrap();
        let input = scratch.put("snapshot.md", b"# x\n").unwrap();
        let failure = tool
            .export(
                &tool.markdown_reader(),
                "docx",
                &input,
                scratch.path(),
                &["--toc-depth=99".to_owned()],
            )
            .err()
            .expect("an out-of-range option must fail");
        let detail = summarize(&failure.stderr, scratch.path(), 3).join("；");
        assert!(!detail.contains(&scratch.path().display().to_string()));
        assert!(!failure.message.is_empty());
    }
}
