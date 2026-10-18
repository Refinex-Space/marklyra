use super::*;

#[tauri::command]
pub async fn inspect_workspace_entry(
    workspace_id: String,
    relative_path: String,
    window: WebviewWindow,
) -> Result<file_index::InspectedWorkspaceEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        window.state::<WindowServices>().mutate_workspace(
            window.label(),
            &workspace_id,
            |workspace| {
                require_window(&window)?;
                workspace
                    .inspect_entry(&relative_path)
                    .map_err(|error| error.to_string())
            },
        )
    })
    .await
    .map_err(|_| "检查目录条目任务未能完成".to_owned())?
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct EntryMoved {
    old_path: String,
    new_path: String,
    kind: file_index::EntryKind,
}

#[tauri::command]
pub async fn rename_workspace_entry(
    workspace_id: String,
    entry_token: String,
    new_name: String,
    operation_id: String,
    window: WebviewWindow,
) -> Result<file_index::EntryRenameReceipt, String> {
    tauri::async_runtime::spawn_blocking(move || {
        require_window(&window)?;
        let app = window.app_handle();
        let result = window.state::<WindowServices>().rename_workspace_entry(crate::window_services::EntryRenameRequest { label: window.label(), workspace_id: &workspace_id, token: &entry_token, name: &new_name, operation_id: &operation_id },
            |plan| crate::rename_metadata::RenameMetadataPlan::prepare(app, plan.directory(), plan.old_name(), plan.new_name(), plan.old_display_path(), plan.new_display_path(), plan.kind()),
            |plan| plan.commit(app),
        )?;
        publish_changes(app, &result);
        result.receipt.ok_or_else(|| "重命名操作已执行，但位置交接无法确认；旧权限已停用，请刷新核对或另存当前正文，未自动重试".into())
    }).await.map_err(|_| "重命名条目任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn resolve_workspace_entry_rename(
    workspace_id: String,
    operation_id: String,
    window: WebviewWindow,
) -> Result<Option<file_index::EntryRenameResolution>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        window.state::<WindowServices>().mutate_workspace(
            window.label(),
            &workspace_id,
            |workspace| {
                workspace
                    .resolve_entry_rename(&operation_id)
                    .map_err(|e| e.to_string())
            },
        )
    })
    .await
    .map_err(|_| "核对重命名任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn finish_workspace_entry(
    workspace_id: String,
    entry_token: String,
    window: WebviewWindow,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        window.state::<WindowServices>().mutate_workspace(
            window.label(),
            &workspace_id,
            |workspace| {
                workspace
                    .finish_entry_inspection(&entry_token)
                    .map_err(|e| e.to_string())
            },
        )
    })
    .await
    .map_err(|_| "结束条目命名任务未能完成".to_owned())?
}

pub(super) fn publish_changes(app: &AppHandle, result: &crate::window_services::EntryRenameResult) {
    for (label, ids) in &result.uncertain_documents {
        report_notification(
            app.emit_to(label, "document-file-operation-uncertain", ids),
            "document-file-operation-uncertain",
        );
    }
    for (label, ids) in &result.uncertain_workspaces {
        report_notification(
            app.emit_to(label, "workspace-file-operation-uncertain", ids),
            "workspace-file-operation-uncertain",
        );
    }
    for (label, documents) in &result.documents {
        report_notification(
            app.emit_to(label, "document-metadata-changed", documents),
            "document-metadata-changed",
        );
    }
    if let Some((old, new, kind)) = &result.moved {
        report_notification(
            app.emit(
                "workspace-entry-renamed",
                EntryMoved {
                    old_path: old.to_string_lossy().into_owned(),
                    new_path: new.to_string_lossy().into_owned(),
                    kind: *kind,
                },
            ),
            "workspace-entry-renamed",
        );
    }
    for (label, workspaces) in &result.workspaces {
        report_notification(
            app.emit_to(label, "workspace-metadata-changed", workspaces),
            "workspace-metadata-changed",
        );
    }
    report_notification(
        app.emit("workspace-files-changed", ()),
        "workspace-files-changed",
    );
    report_notification(
        app.emit("workspace-file-undo-changed", ()),
        "workspace-file-undo-changed",
    );
}
