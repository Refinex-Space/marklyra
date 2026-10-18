use super::*;
use crate::window_services::{
    FileUndoReceipt, FileUndoRequest, FileUndoResolution, FileUndoSnapshot,
};

#[tauri::command]
pub async fn get_workspace_file_undo(
    workspace_id: String,
    window: WebviewWindow,
) -> Result<Option<FileUndoSnapshot>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        window
            .state::<WindowServices>()
            .get_file_undo(window.label(), &workspace_id)
    })
    .await
    .map_err(|_| "读取文件撤销状态未能完成".to_owned())?
}

#[tauri::command]
pub async fn resolve_workspace_file_undo(
    workspace_id: String,
    undo_token: String,
    operation_id: String,
    window: WebviewWindow,
) -> Result<Option<FileUndoResolution>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        window
            .state::<WindowServices>()
            .resolve_file_undo(&FileUndoRequest {
                label: window.label().to_owned(),
                workspace_id,
                undo_token,
                operation_id,
            })
    })
    .await
    .map_err(|_| "核对文件撤销结果未能完成".to_owned())?
}

#[tauri::command]
pub async fn perform_workspace_file_undo(
    workspace_id: String,
    undo_token: String,
    operation_id: String,
    window: WebviewWindow,
) -> Result<FileUndoReceipt, String> {
    tauri::async_runtime::spawn_blocking(move || {
        require_window(&window)?;
        let app = window.app_handle();
        let request = FileUndoRequest {
            label: window.label().to_owned(),
            workspace_id: workspace_id.clone(),
            undo_token,
            operation_id,
        };
        let result = window.state::<WindowServices>().perform_file_undo_with_move(
            request,
            |plan| {
                crate::rename_metadata::RenameMetadataPlan::prepare(
                    app,
                    plan.directory(),
                    plan.old_name(),
                    plan.new_name(),
                    plan.old_display_path(),
                    plan.new_display_path(),
                    plan.kind(),
                )
            },
            |plan| plan.commit(app),
            |targets|crate::rename_metadata::RenameMetadataPlan::prepare_moves(app,targets),
            |plan,publications|plan.commit_moves(app,publications),
        )?;
        if let Some(diagnostic) = &result.diagnostic {
            let saved = app.path().app_data_dir().map_err(std::io::Error::other)
                .and_then(|directory| diagnostic.write(&directory.join("file-operation-evidence-v1")));
            if let Err(error) = saved {
                eprintln!("File Undo evidence could not be persisted; native receipt still retains it: {error}");
            }
        }
        match result.changes {
            Some(crate::window_services::UndoChanges::Moved(changes)) => { super::entry_move::publish_changes(app,&changes) }
            Some(crate::window_services::UndoChanges::Rename(changes)) => {
                super::entry_rename::publish_changes(app, &changes)
            }
            Some(crate::window_services::UndoChanges::Restored(changes)) => {
                super::trash::publish_restored(app, &changes)
            }
            None => {}
        }
        let _ = app.emit("workspace-file-undo-changed", ());
        match result.resolution {
            FileUndoResolution::Committed { receipt } => {
                if let Some(path) = &receipt.restored_relative_path {
                    let _ = app.emit_to(
                        window.label(),
                        "workspace-file-highlight",
                        FileHighlight {
                            workspace_id,
                            relative_path: path.clone(),
                        },
                    );
                }
                Ok(receipt)
            }
            FileUndoResolution::Rejected { message } => Err(message),
            FileUndoResolution::Prepared => {
                Err("文件撤销仍在处理中，请核对结果，未重复执行".into())
            }
            FileUndoResolution::MutationUncertain => Err(
                "文件撤销已尝试，但位置交接无法确认；请核对磁盘或另存当前正文，未自动重试".into(),
            ),
        }
    })
    .await
    .map_err(|_| "文件操作撤销任务未能完成".to_owned())?
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct FileHighlight {
    workspace_id: String,
    relative_path: String,
}
