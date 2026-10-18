use super::*;
use crate::window_services::{
    TrashReceipt, TrashRequest, TrashResolution, TrashResult, TrashStart,
};

#[tauri::command]
pub async fn resolve_workspace_entry_trash(
    workspace_id: String,
    entry_token: String,
    operation_id: String,
    window: WebviewWindow,
) -> Result<Option<TrashResolution>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        window
            .state::<WindowServices>()
            .resolve_trash(&TrashRequest {
                label: window.label().to_owned(),
                workspace_id,
                entry_token,
                operation_id,
            })
    })
    .await
    .map_err(|_| "核对删除结果未能完成".to_owned())?
}

#[tauri::command]
pub async fn trash_workspace_entry(
    workspace_id: String,
    entry_token: String,
    operation_id: String,
    window: WebviewWindow,
) -> Result<TrashReceipt, String> {
    require_window(&window)?;
    let request = TrashRequest {
        label: window.label().to_owned(),
        workspace_id,
        entry_token,
        operation_id,
    };
    let target = window.clone();
    let start = tauri::async_runtime::spawn_blocking(move || {
        target.state::<WindowServices>().reserve_trash(request)
    })
    .await
    .map_err(|_| "准备删除任务未能完成")??;
    let reservation = match start {
        TrashStart::Resolved(resolution) => return reply(resolution),
        TrashStart::Reserved(reservation) => *reservation,
    };
    let app = window.app_handle().clone();
    let preferences_app = app.clone();
    let skip = tauri::async_runtime::spawn_blocking(move || {
        preferences_app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .trash_warning_suppressed(&preferences_app)
    })
    .await
    .unwrap_or_else(|error| {
        // A failed preference read must still complete this reservation. Show
        // the confirmation instead of leaving a permanent Prepared receipt.
        eprintln!("Trash confirmation preference task failed: {error}");
        Ok(false)
    })
    .unwrap_or_else(|error| {
        eprintln!("Trash confirmation preference unavailable: {error}");
        false
    });
    let confirmation =
        crate::platform::trash_confirmation::confirm(&app, &window, &reservation.name(), skip)
            .await;
    let confirmed = match confirmation {
        Ok(value) if value.confirmed => value,
        other => {
            let error = other.err();
            let target = window.clone();
            let resolution = tauri::async_runtime::spawn_blocking(move || {
                target
                    .state::<WindowServices>()
                    .cancel_trash(reservation, error)
            })
            .await
            .map_err(|_| "取消删除任务未能完成")??;
            return reply(resolution);
        }
    };
    let target = window.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let mut warnings = vec![];
        if confirmed.suppress_future {
            if let Err(error) = app
                .state::<crate::file_preferences::FilePreferencesHost>()
                .suppress_trash_warning(&app)
            {
                warnings.push(format!("删除确认偏好未能保存：{error}"));
            }
        }
        target
            .state::<WindowServices>()
            .perform_trash(reservation, warnings, !skip)
    })
    .await
    .map_err(|_| "删除任务未能完成")??;
    publish_trash(window.app_handle(), &result);
    reply(result.resolution)
}

fn reply(resolution: TrashResolution) -> Result<TrashReceipt, String> {
    match resolution {
        TrashResolution::Committed { receipt } => Ok(receipt),
        TrashResolution::Rejected { message } => Err(message),
        TrashResolution::Prepared => {
            Err("删除请求仍在处理中，请核对结果，未重复显示确认或执行删除".into())
        }
        TrashResolution::MutationUncertain => Err(
            "删除已尝试，但位置交接无法确认。当前稿已保留，请核对系统回收站；未自动重试或永久删除"
                .into(),
        ),
    }
}

#[derive(Clone, serde::Serialize)]
struct EntryPresence {
    path: String,
    kind: file_index::EntryKind,
}

pub(super) fn publish_trash(app: &AppHandle, result: &TrashResult) {
    if let Some(diagnostic) = &result.diagnostic {
        let saved = crate::app_paths::data_dir(app)
            .map_err(std::io::Error::other)
            .and_then(|directory| diagnostic.write(&directory.join("file-operation-evidence")));
        if let Err(error) = saved {
            eprintln!("File operation evidence could not be persisted; native receipt still retains it: {error}");
        }
    }
    publish_state(
        app,
        &result.documents,
        &result.uncertain_documents,
        &result.removed_roots,
        &result.uncertain_roots,
    );
    if let Some((path, kind)) = &result.removed {
        report_notification(
            app.emit(
                "workspace-entry-trashed",
                EntryPresence {
                    path: path.to_string_lossy().into_owned(),
                    kind: *kind,
                },
            ),
            "workspace-entry-trashed",
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
pub(super) fn publish_restored(
    app: &AppHandle,
    result: &crate::window_services::TrashRestoreChanges,
) {
    publish_state(
        app,
        &result.documents,
        &result.uncertain_documents,
        &result.removed_roots,
        &result.uncertain_roots,
    );
    if let Some((path, kind)) = &result.restored {
        report_notification(
            app.emit(
                "workspace-entry-restored",
                EntryPresence {
                    path: path.to_string_lossy().into_owned(),
                    kind: *kind,
                },
            ),
            "workspace-entry-restored",
        );
    }
    report_notification(
        app.emit("workspace-files-changed", ()),
        "workspace-files-changed",
    );
}
fn publish_state(
    app: &AppHandle,
    documents: &[(String, Vec<document_service::DocumentMetadata>)],
    uncertain: &[(String, Vec<String>)],
    removed: &[(String, Vec<String>)],
    revoked: &[(String, Vec<String>)],
) {
    for (label, metadata) in documents {
        report_notification(
            app.emit_to(label, "document-metadata-changed", metadata),
            "document-metadata-changed",
        );
    }
    for (label, ids) in uncertain {
        report_notification(
            app.emit_to(label, "document-file-operation-uncertain", ids),
            "document-file-operation-uncertain",
        );
    }
    for (label, ids) in removed {
        report_notification(
            app.emit_to(label, "workspace-roots-removed", ids),
            "workspace-roots-removed",
        );
    }
    for (label, ids) in revoked {
        report_notification(
            app.emit_to(label, "workspace-file-operation-uncertain", ids),
            "workspace-file-operation-uncertain",
        );
    }
}
