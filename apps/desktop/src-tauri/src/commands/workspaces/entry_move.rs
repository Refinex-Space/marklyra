//! Entry Move owns native destination and conflict choices; IPC carries tokens.
use super::*;
use crate::window_services::{
    EntryActionResolution, EntryActionStart, EntryMoveRequest, EntryMoveResult,
};
use document_service::DirectoryBookmark;
use file_index::{EntryKind, EntryMoveConflictPolicy};

#[tauri::command]
pub async fn move_workspace_entry(
    window: WebviewWindow,
    workspace_id: String,
    entry_token: String,
    destination_token: Option<String>,
    operation_id: String,
) -> Result<EntryActionResolution, String> {
    require_window(&window)?;
    let app = window.app_handle().clone();
    let target = window.clone();
    let work = workspace_id.clone();
    let token = entry_token.clone();
    let operation = operation_id.clone();
    let expected_destination = destination_token.clone();
    let start = tauri::async_runtime::spawn_blocking(move || {
        target.state::<WindowServices>().begin_entry_move_action(
            target.label(),
            &work,
            &token,
            &operation,
            expected_destination.as_deref(),
        )
    })
    .await
    .map_err(|_| "准备移动未完成")??;
    let ticket = match start {
        EntryActionStart::Resolved(state) => return Ok(state),
        EntryActionStart::Ready(ticket) => ticket,
    };
    let destination = if let Some(destination) = destination_token {
        let target = window.clone();
        let work = workspace_id.clone();
        tauri::async_runtime::spawn_blocking(move || {
            target
                .state::<WindowServices>()
                .mutate_workspace(target.label(), &work, |workspace| {
                    if destination == work {
                        return workspace.bookmark().map_err(|e| e.to_string());
                    }
                    let plan = workspace
                        .prepare_entry_action(&destination)
                        .map_err(|e| e.to_string())?;
                    if plan.kind() != EntryKind::Directory {
                        return Err("移动目标必须是文件夹".into());
                    }
                    let directory = cap_std::fs::Dir::from_std_file(
                        plan.source()
                            .try_clone()
                            .map_err(|e| e.to_string())?
                            .into_std(),
                    );
                    let bookmark = DirectoryBookmark::capture(&directory, plan.display_path())
                        .map_err(|e| e.to_string())?;
                    workspace
                        .validate_entry_action(&plan)
                        .map_err(|e| e.to_string())?;
                    Ok(bookmark)
                })
        })
        .await
        .map_err(|_| "读取移动目标未完成".to_owned())
        .and_then(|result| result)
    } else {
        choose_destination(&window).await
    };
    let destination = match destination {
        Ok(destination) => destination,
        Err(message) => {
            return Ok(app
                .state::<WindowServices>()
                .reject_entry_action(ticket, message))
        }
    };
    let target = window.clone();
    let work = workspace_id.clone();
    let token = entry_token.clone();
    let operation = operation_id.clone();
    let captured = tauri::async_runtime::spawn_blocking(move || {
        require_window(&target)?;
        let services = target.state::<WindowServices>();
        let name = services.mutate_workspace(target.label(), &work, |workspace| {
            workspace
                .prepare_entry_action(&token)
                .map(|plan| plan.name().to_string_lossy().into_owned())
                .map_err(|e| e.to_string())
        })?;
        let directory = destination.reopen().map_err(|e| e.to_string())?;
        let captured = services.inspect_move_destination(
            &EntryMoveRequest {
                label: target.label(),
                workspace_id: &work,
                token: &token,
                operation_id: &operation,
            },
            directory,
            destination.path(),
        )?;
        Ok::<_, String>((name, captured))
    })
    .await
    .map_err(|_| "移动目标预检未完成".to_owned())
    .and_then(|result| result);
    let (name, destination) = match captured {
        Ok(captured) => captured,
        Err(message) => {
            return Ok(app
                .state::<WindowServices>()
                .reject_entry_action(ticket, message))
        }
    };
    let preference = app.clone();
    let skip = tauri::async_runtime::spawn_blocking(move || {
        preference
            .state::<crate::file_preferences::FilePreferencesHost>()
            .move_warning_suppressed(&preference)
    })
    .await
    .ok()
    .and_then(Result::ok)
    .unwrap_or(false);
    let confirmed =
        crate::platform::trash_confirmation::confirm_move(&app, &window, &name, skip).await;
    let confirmation = match confirmed {
        Ok(confirmation) if confirmation.confirmed => confirmation,
        other => {
            return Ok(app
                .state::<WindowServices>()
                .reject_entry_action(ticket, other.err().unwrap_or_else(|| "已取消移动".into())))
        }
    };
    let policy = if destination.exists() && !destination.same_entity() {
        match crate::platform::trash_confirmation::move_conflict(&app, &window, &name).await {
            Ok(policy) if policy != EntryMoveConflictPolicy::Cancel => policy,
            other => {
                return Ok(app.state::<WindowServices>().reject_entry_action(
                    ticket,
                    other.err().unwrap_or_else(|| "已取消同名移动".into()),
                ))
            }
        }
    } else {
        EntryMoveConflictPolicy::Cancel
    };
    if let Err(message) = app.state::<WindowServices>().validate_entry_owner(&ticket) {
        return Ok(app
            .state::<WindowServices>()
            .reject_entry_action(ticket, message));
    }
    let target = window.clone();
    let owner = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        require_window(&target)?;
        let mut warnings = vec![];
        if confirmation.suppress_future {
            if let Err(error) = owner
                .state::<crate::file_preferences::FilePreferencesHost>()
                .suppress_move_warning(&owner)
            {
                warnings.push(format!("移动确认偏好未能保存：{error}"));
            }
        }
        let mut result = target.state::<WindowServices>().move_workspace_entry(
            EntryMoveRequest {
                label: target.label(),
                workspace_id: &workspace_id,
                token: &entry_token,
                operation_id: &operation_id,
            },
            destination,
            policy,
            |specs| crate::rename_metadata::RenameMetadataPlan::prepare_moves(&owner, specs),
            |plan, publications| plan.commit_moves(&owner, publications),
        )?;
        if let Some(receipt) = &mut result.receipt {
            receipt.warnings.extend(warnings);
        }
        publish_changes(&owner, &result);
        Ok::<_, String>(result)
    })
    .await
    .map_err(|_| "移动工作线程未返回；结果未知，请核对原请求".to_owned());
    match result {
        Ok(Ok(result)) => match result.receipt {
            Some(receipt) => Ok(ticket.finish_move(receipt)),
            None => Ok(ticket.finish(Err(
                "文件移动已尝试，但位置交接未确认；已保留稿件并停用旧权限，未自动重试".into(),
            ))),
        },
        Ok(Err(message)) => Ok(app
            .state::<WindowServices>()
            .reject_entry_action(ticket, message)),
        Err(message) => Ok(ticket.finish(Err(message))),
    }
}
#[tauri::command]
pub async fn resolve_workspace_entry_move(
    window: WebviewWindow,
    workspace_id: String,
    entry_token: String,
    operation_id: String,
    destination_token: Option<String>,
) -> Result<Option<EntryActionResolution>, String> {
    require_window(&window)?;
    window.state::<WindowServices>().resolve_entry_move_action(
        window.label(),
        &workspace_id,
        &entry_token,
        &operation_id,
        destination_token.as_deref(),
    )
}
async fn choose_destination(window: &WebviewWindow) -> Result<DirectoryBookmark, String> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    window
        .app_handle()
        .dialog()
        .file()
        .set_parent(window)
        .set_title("移动到…")
        .pick_folder(move |path| {
            let _ = sender.try_send(path);
        });
    let path = receiver
        .recv()
        .await
        .flatten()
        .ok_or("已取消移动目标选择")?
        .into_path()
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        DirectoryBookmark::from_native_selection(&path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|_| "检查移动目标目录未完成".to_owned())?
}
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Moved {
    old_path: String,
    new_path: String,
    kind: EntryKind,
}
pub(super) fn publish_changes(app: &AppHandle, result: &EntryMoveResult) {
    super::entry_rename::publish_changes(app, &result.changes);
    for (old, new, kind) in &result.paths {
        report_notification(
            app.emit(
                "workspace-entry-renamed",
                Moved {
                    old_path: old.to_string_lossy().into_owned(),
                    new_path: new.to_string_lossy().into_owned(),
                    kind: *kind,
                },
            ),
            "workspace-entry-renamed",
        );
    }
}
