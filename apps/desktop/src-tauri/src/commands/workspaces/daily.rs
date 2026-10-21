//! Daily notes are fixed `.md` paths inside a workspace; the renderer only names a folder and keys.
use super::*;
use file_index::{DailyLayout, DailyNote};

fn require_markdown(
    types: &crate::file_preferences::file_types::DocumentTypes,
) -> Result<(), String> {
    if types.allows(std::path::Path::new("daily.md")) {
        Ok(())
    } else {
        Err("Markdown 文件类型已被禁用，日程不可用".into())
    }
}

/// Existing notes for `keys`, in request order; missing notes are simply absent.
#[tauri::command]
pub async fn read_daily_notes(
    workspace_id: String,
    folder: String,
    layout: DailyLayout,
    keys: Vec<String>,
    window: WebviewWindow,
) -> Result<Vec<DailyNote>, String> {
    let registry = window
        .state::<WindowServices>()
        .get_workspaces(window.label())?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let types = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(&app)?;
        require_markdown(&types)?;
        read_workspace(
            &registry,
            &workspace_id,
            || verify_workspace_window(&window, &registry),
            |selected| {
                selected.read_daily_notes(
                    &folder,
                    layout,
                    &keys,
                    crate::platform::file_metadata::include_entry,
                    |name| types.allows(std::path::Path::new(name)),
                )
            },
        )
    })
    .await
    .map_err(|_| "读取日程任务未能完成".to_owned())?
}

/// Creates the note exclusively, then opens it in this window like a sidebar document.
#[tauri::command]
pub async fn create_daily_note(
    workspace_id: String,
    folder: String,
    layout: DailyLayout,
    key: String,
    text: String,
    window: WebviewWindow,
) -> Result<DocumentPayload, String> {
    document_service::validate_text(&text).map_err(|error| error.to_string())?;
    require_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        require_window(&window)?;
        let app = window.app_handle();
        let types = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(app)?;
        require_markdown(&types)?;
        let services = window.state::<WindowServices>();
        let relative = services.mutate_workspace(window.label(), &workspace_id, |workspace| {
            let relative = workspace
                .create_daily_note(&folder, layout, &key, &text)
                .map_err(|error| error.to_string())?;
            services.clear_file_undo();
            Ok(relative)
        })?;
        let opened = services
            .open_workspace_document(window.label(), &workspace_id, &relative, None)
            .map_err(|error| format!("日程文件已创建，但无法打开：{error}"));
        let _ = app.emit("workspace-file-undo-changed", ());
        if let Err(error) = app.emit("workspace-files-changed", ()) {
            eprintln!("Created daily note, but catalog notification failed: {error}");
        }
        opened
    })
    .await
    .map_err(|_| "创建日程任务未能完成".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::file_preferences::file_types::DocumentTypes;

    #[test]
    fn markdown_must_be_enabled_for_daily_notes() {
        assert!(require_markdown(&DocumentTypes::default()).is_ok());
        let disabled = DocumentTypes {
            disabled: vec!["md".into()],
            ..DocumentTypes::default()
        };
        assert_eq!(
            require_markdown(&disabled).unwrap_err(),
            "Markdown 文件类型已被禁用，日程不可用"
        );
    }
}
