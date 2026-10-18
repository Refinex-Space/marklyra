use super::*;
#[tauri::command]
pub async fn duplicate_workspace_entry(
    window: WebviewWindow,
    workspace_id: String,
    entry_token: String,
    operation_id: String,
) -> Result<file_index::EntryDuplicateReceipt, String> {
    require_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        require_window(&window)?;
        let app = window.app_handle();
        let receipt = window.state::<WindowServices>().mutate_workspace(
            window.label(),
            &workspace_id,
            |workspace| {
                let known = workspace
                    .resolve_entry_duplicate(&operation_id, &entry_token)
                    .map_err(|e| e.to_string())?
                    .is_some();
                let receipt = workspace
                    .duplicate_entry(&operation_id, &entry_token)
                    .map_err(|e| e.to_string())?;
                if !known {
                    window.state::<WindowServices>().clear_file_undo();
                }
                Ok(receipt)
            },
        )?;
        let _ = app.emit("workspace-file-undo-changed", ());
        let _ = app.emit("workspace-files-changed", ());
        Ok(receipt)
    })
    .await
    .map_err(|_| "复制副本任务未完成；请核对结果".to_owned())?
}
#[tauri::command]
pub async fn resolve_workspace_entry_duplicate(
    window: WebviewWindow,
    workspace_id: String,
    entry_token: String,
    operation_id: String,
) -> Result<Option<file_index::EntryDuplicateResolution>, String> {
    require_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        window.state::<WindowServices>().mutate_workspace(
            window.label(),
            &workspace_id,
            |workspace| {
                workspace
                    .resolve_entry_duplicate(&operation_id, &entry_token)
                    .map_err(|e| e.to_string())
            },
        )
    })
    .await
    .map_err(|_| "副本结果核对任务未完成".to_owned())?
}
