use super::lock_service;
use crate::window_services::WindowServices;
use document_service::{DocumentChange, DocumentPayload};
use std::sync::Arc;
use tauri::WebviewWindow;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

#[tauri::command]
pub async fn check_document_change(
    id: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<DocumentChange, String> {
    let documents = services.get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        lock_service(&documents)?
            .check_document_change(&id)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|_| "磁盘变化检查未能完成".to_owned())?
}
#[tauri::command]
pub async fn accept_document_change(
    id: String,
    version: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<DocumentPayload, String> {
    services.get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        window
            .state::<WindowServices>()
            .write_document(window.label(), |documents| {
                documents.accept_document_change(&id, &version)
            })
    })
    .await
    .map_err(|_| "接受磁盘版本未能完成".to_owned())?
}
#[tauri::command]
pub async fn dismiss_document_change(
    id: String,
    version: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<bool, String> {
    let documents = services.get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        lock_service(&documents)?
            .dismiss_document_change(&id, &version)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|_| "释放磁盘快照未能完成".to_owned())?
}

#[tauri::command]
pub async fn start_document_watch(
    app: AppHandle,
    id: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<document_service::DocumentWatch, String> {
    let documents = services.get_documents(window.label())?;
    let label = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        lock_service(&documents)?
            .start_document_watch(&id, watch_callback(app, label))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|_| "文件监听启动未能完成".to_owned())?
}
#[tauri::command]
pub async fn stop_document_watch(
    id: String,
    watch_id: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<bool, String> {
    let documents = services.get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        Ok(lock_service(&documents)?.stop_document_watch(&id, &watch_id))
    })
    .await
    .map_err(|_| "文件监听停止未能完成".to_owned())?
}

fn watch_callback<R: Runtime>(
    app: AppHandle<R>,
    label: String,
) -> Arc<dyn Fn(document_service::DocumentDiskChange) + Send + Sync> {
    Arc::new(move |hint| {
        if let Err(error) = app.emit_to(&label, "document-disk-change", hint) {
            eprintln!("Document watch hint delivery failed: {error}");
        }
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tauri::{
        test::{mock_builder, mock_context, noop_assets},
        Listener, WebviewWindowBuilder,
    };
    #[test]
    fn watch_callback_emits_only_to_owning_window() {
        let app = mock_builder().build(mock_context(noop_assets())).unwrap();
        let first = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let second = WebviewWindowBuilder::new(&app, "editor-second", Default::default())
            .build()
            .unwrap();
        let first_count = Arc::new(AtomicUsize::new(0));
        let second_count = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&first_count);
        first.listen("document-disk-change", move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
        });
        let counter = Arc::clone(&second_count);
        second.listen("document-disk-change", move |_| {
            counter.fetch_add(1, Ordering::SeqCst);
        });
        let callback = watch_callback(app.handle().clone(), "editor-second".into());
        callback(document_service::DocumentDiskChange {
            id: "fixture-id".into(),
            watch_id: "fixture-watch".into(),
        });
        assert_eq!(first_count.load(Ordering::SeqCst), 0);
        assert_eq!(second_count.load(Ordering::SeqCst), 1);
    }
}
