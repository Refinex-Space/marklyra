use crate::window_services::WindowServices;
use tauri::WebviewWindow;
pub mod changes;
pub mod images;
pub(crate) mod native_input;
pub mod recent;
pub mod recovery;
pub mod themes;
pub mod untitled_close;
pub mod workspaces;

use std::sync::{Arc, Mutex};

use document_service::{validate_text, DocumentPayload, DocumentService};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub type Documents = Arc<Mutex<DocumentService>>;

fn lock_service(
    documents: &Documents,
) -> Result<std::sync::MutexGuard<'_, DocumentService>, String> {
    documents
        .lock()
        .map_err(|_| "文档状态不可用，请重新启动应用".to_owned())
}

#[tauri::command]
pub fn get_document_metadata(
    id: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<document_service::DocumentMetadata, String> {
    require_window(&window)?;
    let documents = services.get_documents(window.label())?;
    let documents = lock_service(&documents)?;
    documents
        .get_metadata(&id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn open_document(
    app: AppHandle,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<DocumentPayload, String> {
    services.get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        let filters = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(&app)?
            .enabled_extensions();
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("打开 Markdown 文档")
            .add_filter(
                "Markdown / Text",
                &filters.iter().map(String::as_str).collect::<Vec<_>>(),
            )
            .add_filter("所有文件", &["*"])
            .blocking_pick_file()
            .ok_or("已取消选择文件")?;
        let path = selected.into_path().map_err(|_| "无法读取所选文件路径")?;
        require_window(&window)?;
        app.state::<crate::file_preferences::FilePreferencesHost>()
            .require_document_type(&app, &path)?;
        window
            .state::<WindowServices>()
            .write_document(window.label(), |documents| documents.open_authorized(&path))
    })
    .await
    .map_err(|_| "打开文件任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn save_document(
    id: String,
    text: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<images::SavedImageDocument, String> {
    validate_text(&text).map_err(|error| error.to_string())?;
    let registry = services.get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        images::with_documents(&window, &registry, |documents| {
            images::save_document_with_images(window.app_handle(), documents, &id, &text)
        })
    })
    .await
    .map_err(|_| "保存文件任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn save_document_as(
    app: AppHandle,
    text: String,
    source_id: Option<String>,
    encoding: Option<String>,
    suggested_name: Option<String>,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<DocumentPayload, String> {
    validate_text(&text).map_err(|error| error.to_string())?;
    encoding
        .as_deref()
        .map(document_service::Encoding::from_label)
        .transpose()
        .map_err(|error| error.to_string())?;
    services.get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        let previous = source_id
            .as_deref()
            .map(|id| {
                lock_service(
                    &window
                        .state::<WindowServices>()
                        .get_documents(window.label())?,
                )?
                .display_path(id)
                .map_err(|error| error.to_string())
            })
            .transpose()?;
        let extension = if previous.is_some() {
            "md".into()
        } else {
            app.state::<crate::file_preferences::FilePreferencesHost>()
                .default_extension(&app).unwrap_or_else(|error| {
                    eprintln!("File preferences unavailable; using md in the explicit save dialog: {error}");
                    "md".into()
                })
        };
        let suggested_name =
            save_suggestion(previous.as_deref(), &extension, suggested_name.as_deref())?;
        let filters = app.state::<crate::file_preferences::FilePreferencesHost>().document_types(&app)?.enabled_extensions();
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("另存为 Markdown 文档")
            .set_file_name(&suggested_name)
            .add_filter("Markdown / Text", &filters.iter().map(String::as_str).collect::<Vec<_>>())
            .blocking_save_file()
            .ok_or("已取消保存")?;
        let path = selected.into_path().map_err(|_| "无法读取保存路径")?;
        app.state::<crate::file_preferences::FilePreferencesHost>().require_document_type(&app, &path)?;
        let saved = window
            .state::<WindowServices>()
            .write_document(window.label(), |documents| {
                documents.save_as_authorized_with_encoding(
                    &path,
                    &text,
                    source_id.as_deref(),
                    encoding.as_deref(),
                )
            })?;
        // Only a successful explicit SaveAs invalidates catalogs across windows.
        // The signal carries neither source nor paths and grants no file access.
        if let Err(error) = app.emit("workspace-files-changed", ()) {
            eprintln!("Saved file, but could not notify workspace catalogs: {error}");
        }
        Ok(saved)
    })
    .await
    .map_err(|_| "另存为任务未能完成".to_owned())?
}

fn save_suggestion(
    previous: Option<&std::path::Path>,
    extension: &str,
    hint: Option<&str>,
) -> Result<String, String> {
    if let Some(previous) = previous {
        return previous
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_owned)
            .ok_or_else(|| "原文件名称不受支持".into());
    }
    if !crate::file_preferences::valid_extension(extension) {
        return Err("默认扩展名无效".into());
    }
    let name = hint
        .filter(|value| {
            !value.is_empty()
                && value.len() <= 480
                && !value
                    .chars()
                    .any(|c| c.is_control() || matches!(c, '/' | '\\'))
                && !matches!(*value, "." | "..")
        })
        .unwrap_or("Untitled");
    Ok(format!(
        "{name}.{}",
        if extension.is_empty() {
            "md"
        } else {
            extension
        }
    ))
}

#[tauri::command]
pub fn close_document(
    id: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<(), String> {
    lock_service(&services.get_documents(window.label())?)?.close(&id);
    Ok(())
}

pub(crate) fn require_window(window: &WebviewWindow) -> Result<(), String> {
    if window.state::<WindowServices>().contains(window.label()) {
        Ok(())
    } else {
        Err("编辑窗口已关闭或未注册".into())
    }
}

#[cfg(test)]
mod filename_tests {
    use super::save_suggestion;
    use std::path::Path;
    #[test]
    fn existing_authorized_basename_wins_over_changed_default_and_suggested_title() {
        assert_eq!(
            save_suggestion(
                Some(Path::new("/mock/已有文件.md")),
                "text",
                Some("new title")
            )
            .unwrap(),
            "已有文件.md"
        );
    }
    #[test]
    fn new_document_uses_original_suggested_title_and_literal_extension() {
        for extension in ["text", "markdown", "foo.bar", "custom"] {
            assert_eq!(
                save_suggestion(None, extension, Some("First Title")).unwrap(),
                format!("First Title.{extension}")
            );
        }
        assert_eq!(
            save_suggestion(None, "", Some("中文😀")).unwrap(),
            "中文😀.md"
        );
    }
    #[test]
    fn unsafe_name_hints_fall_back_without_becoming_paths() {
        for value in ["../secret", "folder/name", "..", "a\\b", "line\nbreak", ""] {
            assert_eq!(
                save_suggestion(None, "md", Some(value)).unwrap(),
                "Untitled.md"
            );
        }
        assert!(save_suggestion(None, "../../md", None).is_err());
    }
}
