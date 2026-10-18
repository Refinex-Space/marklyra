use super::{require_window, save_suggestion, WindowServices};
use crate::platform::untitled_close::{self, Choice};
use document_service::{validate_text, DocumentPayload, Encoding};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request {
    text: String,
    encoding: Option<String>,
    suggested_name: Option<String>,
}
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum PreparedClose {
    #[cfg(not(target_os = "macos"))]
    Unsupported,
    Cancel,
    Discard,
    Saved {
        document: DocumentPayload,
    },
}

#[tauri::command]
pub async fn prepare_untitled_close(
    request: Request,
    app: AppHandle,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<PreparedClose, String> {
    validate_text(&request.text).map_err(|error| error.to_string())?;
    request
        .encoding
        .as_deref()
        .map(Encoding::from_label)
        .transpose()
        .map_err(|error| error.to_string())?;
    require_window(&window)?;
    services.get_documents(window.label())?;
    let extension = app
        .state::<crate::file_preferences::FilePreferencesHost>()
        .default_extension(&app)?;
    let suggestion = save_suggestion(None, &extension, request.suggested_name.as_deref())?;
    match untitled_close::select(&app, &window, &suggestion, &extension).await? {
        #[cfg(not(target_os = "macos"))]
        Choice::Unsupported => Ok(PreparedClose::Unsupported),
        Choice::Cancel => Ok(PreparedClose::Cancel),
        Choice::Discard => Ok(PreparedClose::Discard),
        Choice::Save(path) => {
            // The OS selected this path. The renderer never supplies a path or
            // invokes an NSDocument writer. Native success precedes close consent.
            require_window(&window)?;
            tauri::async_runtime::spawn_blocking(move || {
                require_window(&window)?;
                app.state::<crate::file_preferences::FilePreferencesHost>()
                    .require_document_type(&app, &path)?;
                let document = window.state::<WindowServices>().write_document(
                    window.label(),
                    |documents| {
                        documents.save_as_authorized_with_encoding(
                            &path,
                            &request.text,
                            None,
                            request.encoding.as_deref(),
                        )
                    },
                )?;
                if let Err(error) = app.emit("workspace-files-changed", ()) {
                    eprintln!("Saved file, but could not notify workspace catalogs: {error}");
                }
                Ok(PreparedClose::Saved { document })
            })
            .await
            .map_err(|_| "关闭前保存任务未能完成".to_owned())?
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn close_request_never_accepts_a_renderer_path_or_extra_authority() {
        let valid =
            serde_json::json!({"text":"own", "encoding":"UTF-8 BOM", "suggestedName":"Own.md"});
        assert!(serde_json::from_value::<Request>(valid.clone()).is_ok());
        let mut path = valid;
        path["path"] = "/not-authorized".into();
        assert!(serde_json::from_value::<Request>(path).is_err());
        assert_eq!(
            serde_json::to_value(PreparedClose::Cancel).unwrap(),
            serde_json::json!({"kind":"cancel"})
        );
        assert_eq!(
            serde_json::to_value(PreparedClose::Discard).unwrap(),
            serde_json::json!({"kind":"discard"})
        );
    }
}
