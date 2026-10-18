use crate::window_services::WindowServices;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri::WebviewWindow;
mod download;
pub mod save;
mod storage;
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
pub(crate) use storage::ImageBindingLocationPlan;

#[derive(Default)]
pub struct ImageHost {
    saves: Mutex<HashMap<String, save::SaveOperation>>,
    operations: Mutex<ImageOperations>,
    current_drafts: Mutex<HashMap<String, (crate::commands::Documents, String)>>,
    staged_documents: Mutex<HashMap<(String, String), (crate::commands::Documents, String)>>,
    active_named: Mutex<HashMap<String, (crate::commands::Documents, String)>>,
    input_contexts: Mutex<HashMap<String, (crate::commands::Documents, String, u64)>>,
}

#[derive(Default)]
struct ImageOperations {
    running: HashMap<String, (String, Arc<AtomicBool>)>,
    cancelled: HashMap<String, (String, std::time::Instant)>,
}
fn begin_action(host: &ImageHost, label: &str, id: &str) -> Result<Arc<AtomicBool>, String> {
    let mut state = host.operations.lock().map_err(|_| "图片操作状态不可用")?;
    state
        .cancelled
        .retain(|_, (_, created)| created.elapsed().as_secs() < 60);
    if let Some((owner, _)) = state.cancelled.get(id) {
        if owner != label {
            return Err("图片操作不属于当前窗口".into());
        }
        state.cancelled.remove(id);
        return Err("图片操作已取消".into());
    }
    if state.running.len() >= 16 || state.running.contains_key(id) {
        return Err("图片操作过多或重复".into());
    }
    let cancelled = Arc::new(AtomicBool::new(false));
    state
        .running
        .insert(id.into(), (label.into(), Arc::clone(&cancelled)));
    Ok(cancelled)
}
fn cancel_action(host: &ImageHost, label: &str, id: &str) -> Result<(), String> {
    let mut state = host.operations.lock().map_err(|_| "图片操作状态不可用")?;
    if let Some((owner, cancelled)) = state.running.get(id) {
        if owner != label {
            return Err("图片操作不属于当前窗口".into());
        }
        cancelled.store(true, Ordering::Release);
        return Ok(());
    }
    state
        .cancelled
        .retain(|_, (_, created)| created.elapsed().as_secs() < 60);
    if state
        .cancelled
        .get(id)
        .is_some_and(|(owner, _)| owner != label)
    {
        return Err("图片操作不属于当前窗口".into());
    }
    if !state.cancelled.contains_key(id) && state.cancelled.len() >= 128 {
        return Err("图片取消请求过多，请稍后重试".into());
    }
    state
        .cancelled
        .insert(id.into(), (label.into(), std::time::Instant::now()));
    Ok(())
}
fn known_named_stage(
    host: &ImageHost,
    label: &str,
    registry: &crate::commands::Documents,
    documents: &document_service::DocumentService,
    id: &str,
) -> Result<Option<String>, String> {
    let mut stages = host
        .staged_documents
        .lock()
        .map_err(|_| "图片暂存状态不可用")?;
    stages.retain(|(owner, document), (retained, draft)| {
        owner != label
            || Arc::ptr_eq(retained, registry)
                && documents.get_metadata(document).is_ok()
                && documents.image_draft_snapshot(draft).is_ok()
    });
    Ok(stages
        .get(&(label.into(), id.into()))
        .map(|(_, draft)| draft.clone()))
}
fn remember_named_stage(
    host: &ImageHost,
    label: &str,
    registry: &crate::commands::Documents,
    id: &str,
    draft: &str,
) -> Result<(), String> {
    let mut stages = host
        .staged_documents
        .lock()
        .map_err(|_| "图片暂存状态不可用")?;
    if stages.len() >= 256 && !stages.contains_key(&(label.into(), id.into())) {
        return Err("图片暂存文稿数量超过限制".into());
    }
    stages.insert(
        (label.into(), id.into()),
        (Arc::clone(registry), draft.into()),
    );
    Ok(())
}
fn switch_current_stage(
    host: &ImageHost,
    label: &str,
    registry: &crate::commands::Documents,
    documents: &mut document_service::DocumentService,
    next: Option<String>,
    persist: impl FnOnce(&document_service::DocumentService, &str) -> Result<(), String>,
) -> Result<(), String> {
    let mut current = host
        .current_drafts
        .lock()
        .map_err(|_| "图片暂存状态不可用")?;
    let old = current
        .get(label)
        .filter(|(retained, _)| Arc::ptr_eq(retained, registry))
        .map(|(_, id)| id.clone());
    if let Some(old) = old.filter(|old| Some(old) != next.as_ref()) {
        if documents.image_draft_snapshot(&old).is_ok() {
            persist(documents, &old)?;
            documents.close_image_draft(&old);
        }
        host.staged_documents
            .lock()
            .map_err(|_| "图片暂存状态不可用")?
            .retain(|(owner, _), (retained, draft)| {
                owner != label || !Arc::ptr_eq(retained, registry) || draft != &old
            });
    }
    if let Some(next) = next {
        current.insert(label.into(), (Arc::clone(registry), next));
    } else {
        current.remove(label);
    }
    Ok(())
}
fn staging_policy(folder: &str) -> bool {
    folder.is_empty()
        || ["upload", "ipic", "textbundle"]
            .iter()
            .any(|reserved| reserved.eq_ignore_ascii_case(folder))
}
fn download_source(source: &str, reference: &str) -> Result<String, String> {
    let value = if source.starts_with("//") {
        reference
    } else {
        source
    };
    if value.len() > 8192 || value.chars().any(char::is_control) {
        return Err("图片下载网址无效".into());
    }
    let url = tauri::Url::parse(value).map_err(|_| "图片下载网址无效")?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("图片下载仅接受不含认证信息的 HTTP 或 HTTPS 网址".into());
    }
    Ok(url.to_string())
}
fn import_staged_image(
    documents: &mut document_service::DocumentService,
    id: &str,
    name: &str,
    encoded: &str,
) -> Result<document_service::ImageRegistration, String> {
    let mut image = documents
        .import_draft_image(id, name, encoded)
        .map_err(|error| error.to_string())?;
    let path = documents
        .image_path(id, &image.source)
        .map_err(|error| error.to_string())?;
    let uri = tauri::Url::from_file_path(path)
        .map_err(|_| "图片路径无法转换为本地网址")?
        .to_string();
    documents
        .add_image_draft_alias(id, &image.source, &uri)
        .map_err(|error| error.to_string())?;
    image.source = uri;
    Ok(image)
}

fn require_current(window: &WebviewWindow) -> Result<(), String> {
    crate::commands::require_window(window)
}
fn require_registry(
    window: &WebviewWindow,
    registry: &crate::commands::Documents,
) -> Result<(), String> {
    require_current(window)?;
    if !Arc::ptr_eq(
        &window
            .state::<WindowServices>()
            .get_documents(window.label())?,
        registry,
    ) {
        return Err("图片操作所属窗口会话已改变".into());
    }
    Ok(())
}
pub(super) fn with_documents<T>(
    window: &WebviewWindow,
    registry: &crate::commands::Documents,
    operation: impl FnOnce(&mut document_service::DocumentService) -> Result<T, String>,
) -> Result<T, String> {
    require_current(window)?;
    mutate_registry(
        &window.state::<WindowServices>(),
        window.label(),
        registry,
        operation,
    )
}

fn mutate_registry<T>(
    services: &WindowServices,
    label: &str,
    expected: &crate::commands::Documents,
    operation: impl FnOnce(&mut document_service::DocumentService) -> Result<T, String>,
) -> Result<T, String> {
    services.mutate_document(label, |documents| {
        if !Arc::ptr_eq(&services.get_documents(label)?, expected) {
            return Err("图片操作所属窗口会话已改变".into());
        }
        operation(documents)
    })
}

#[derive(Serialize)]
pub struct DocumentImage {
    source: String,
    url: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedImageDocument {
    #[serde(flatten)]
    document: document_service::DocumentPayload,
    image_warning: Option<String>,
}
pub(super) fn save_document_with_images(
    app: &tauri::AppHandle,
    documents: &mut document_service::DocumentService,
    id: &str,
    text: &str,
) -> Result<SavedImageDocument, String> {
    let binding = storage::before_save(app, documents, id);
    let document = documents
        .save(id, text)
        .map_err(|error| error.to_string())?;
    let image_warning = binding
        .and_then(|binding| storage::after_save(app, documents, id, binding))
        .err()
        .map(|error| format!("正文已保存，图片恢复绑定未更新：{error}"));
    Ok(SavedImageDocument {
        document,
        image_warning,
    })
}
fn payload(image: document_service::ImageRegistration) -> DocumentImage {
    DocumentImage {
        source: image.source,
        url: crate::runtime_assets::image_url(&image.token),
    }
}
fn formatted_source(
    source: &str,
    path: &std::path::Path,
    root: &str,
    relative: Option<bool>,
    dot: Option<bool>,
) -> Result<String, String> {
    if source.starts_with("staged/") {
        return Ok(source.into());
    }
    if root.is_empty() && relative == Some(false) {
        return tauri::Url::from_file_path(path)
            .map_err(|_| "文稿路径无法转换为图片引用".to_owned())?
            .join(source)
            .map(|url| url.to_string())
            .map_err(|_| "图片引用无法转换为本地URL".into());
    }
    if dot == Some(true) && !source.starts_with(['.', '/']) && !source.contains(':') {
        return Ok(format!("./{source}"));
    }
    Ok(source.into())
}
fn formatted_payload(
    documents: &document_service::DocumentService,
    id: &str,
    image: document_service::ImageRegistration,
    root: &str,
    relative: Option<bool>,
    dot: Option<bool>,
) -> Result<DocumentImage, String> {
    let mut result = payload(image);
    if !result.source.starts_with("staged/") && documents.image_draft_snapshot(id).is_err() {
        result.source = formatted_source(
            &result.source,
            &documents
                .display_path(id)
                .map_err(|error| error.to_string())?,
            root,
            relative,
            dot,
        )?;
    }
    Ok(result)
}
#[allow(clippy::too_many_arguments)]
fn import_owned_image(
    window: &WebviewWindow,
    registry: &crate::commands::Documents,
    documents: &mut document_service::DocumentService,
    id: &str,
    name: &str,
    encoded: &str,
    root: &str,
    folder: &str,
) -> Result<document_service::ImageRegistration, String> {
    let app = window.app_handle();
    if documents.image_draft_snapshot(id).is_ok() {
        let image = import_staged_image(documents, id, name, encoded)?;
        storage::persist_draft(app, documents, id)?;
        return Ok(image);
    }
    if staging_policy(folder) {
        documents
            .get_metadata(id)
            .map_err(|error| error.to_string())?;
        let host = window.state::<ImageHost>();
        let known = known_named_stage(&host, window.label(), registry, documents, id)?;
        let draft = match known {
            Some(draft) => draft,
            None => match storage::existing_staged_owner(app, documents, id)? {
                Some(draft) => draft,
                None => {
                    let (root, path) = storage::root(app)?;
                    documents
                        .create_image_draft(root, &path)
                        .map_err(|error| error.to_string())?
                }
            },
        };
        let image = import_staged_image(documents, &draft, name, encoded)?;
        storage::persist_draft(app, documents, &draft)?;
        documents
            .attach_image_draft_aliases(id, &draft, std::slice::from_ref(&image.source))
            .map_err(|error| error.to_string())?;
        storage::persist_staged_alias(app, documents, id, &draft, &image.source)?;
        switch_current_stage(
            &host,
            window.label(),
            registry,
            documents,
            Some(draft.clone()),
            |documents, id| storage::persist_draft(app, documents, id),
        )?;
        remember_named_stage(&host, window.label(), registry, id, &draft)?;
        return Ok(image);
    }
    documents
        .import_image_with_folder(id, name, encoded, root, folder)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_document_image_context(id: String, window: WebviewWindow) -> Result<(), String> {
    let registry = window
        .state::<WindowServices>()
        .get_documents(window.label())?;
    with_documents(&window, &registry, |documents| {
        let host = window.state::<ImageHost>();
        let input_epoch = host.begin_native_input_context(window.label(), &registry)?;
        let named = documents.image_draft_snapshot(&id).is_err();
        let selected = if named {
            documents
                .get_metadata(&id)
                .map_err(|error| error.to_string())?;
            match known_named_stage(&host, window.label(), &registry, documents, &id)? {
                Some(draft) => Some(draft),
                None => storage::existing_staged_owner(window.app_handle(), documents, &id)?,
            }
        } else {
            Some(id.clone())
        };
        switch_current_stage(
            &host,
            window.label(),
            &registry,
            documents,
            selected.clone(),
            |documents, old| storage::persist_draft(window.app_handle(), documents, old),
        )?;
        if named {
            if let Some(draft) = selected {
                remember_named_stage(&host, window.label(), &registry, &id, &draft)?;
            }
        }
        let mut active = host
            .active_named
            .lock()
            .map_err(|_| "图片活动文稿状态不可用")?;
        if named {
            active.insert(window.label().into(), (Arc::clone(&registry), id.clone()));
        } else {
            active.remove(window.label());
        }
        host.publish_native_input_context(window.label(), &registry, id, input_epoch)?;
        Ok(())
    })
}

#[tauri::command]
pub async fn resolve_document_image(
    id: String,
    reference: String,
    expected_metadata_revision: Option<u64>,
    source: Option<String>,
    window: WebviewWindow,
) -> Result<DocumentImage, String> {
    let registry = window
        .state::<WindowServices>()
        .get_documents(window.label())?;
    let target = window.clone();
    tauri::async_runtime::spawn_blocking(move || {
        with_documents(&target, &registry, |documents| {
            check_epoch(documents, &id, expected_metadata_revision)?;
            if documents.image_draft_snapshot(&id).is_ok() {
                return documents
                    .resolve_draft_image(&id, source.as_deref().unwrap_or(&reference))
                    .map(payload)
                    .map_err(|error| error.to_string());
            }
            if let Some(source) = source.as_deref() {
                if let Some(image) = documents
                    .resolve_image_alias(&id, source)
                    .map_err(|error| error.to_string())?
                {
                    return Ok(payload(image));
                }
            }
            let resolved = documents.resolve_image(&id, &reference);
            match resolved {
                Ok(image) => Ok(payload(image)),
                Err(original) => {
                    storage::restore_aliases(target.app_handle(), documents, &id)?;
                    if let Some(source) = source.as_deref() {
                        if let Some(image) = documents
                            .resolve_image_alias(&id, source)
                            .map_err(|error| error.to_string())?
                        {
                            return Ok(payload(image));
                        }
                    }
                    Err(original.to_string())
                }
            }
        })
    })
    .await
    .map_err(|_| "图片读取任务未能完成".to_owned())?
}

#[tauri::command]
// Keep existing named IPC arguments; path options are additive for older clients.
#[allow(clippy::too_many_arguments)]
pub async fn import_document_image(
    id: String,
    name: String,
    base64: String,
    reference_root: Option<String>,
    storage_folder: Option<String>,
    expected_metadata_revision: Option<u64>,
    relative_path: Option<bool>,
    relative_path_with_dot: Option<bool>,
    window: WebviewWindow,
) -> Result<DocumentImage, String> {
    let registry = window
        .state::<WindowServices>()
        .get_documents(window.label())?;
    let target = window.clone();
    tauri::async_runtime::spawn_blocking(move || {
        with_documents(&target, &registry, |documents| {
            check_epoch(documents, &id, expected_metadata_revision)?;
            let image = import_owned_image(
                &target,
                &registry,
                documents,
                &id,
                &name,
                &base64,
                reference_root.as_deref().unwrap_or(""),
                storage_folder.as_deref().unwrap_or("assets"),
            )?;
            formatted_payload(
                documents,
                &id,
                image,
                reference_root.as_deref().unwrap_or(""),
                relative_path,
                relative_path_with_dot,
            )
        })
    })
    .await
    .map_err(|_| "图片导入任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn create_image_draft(window: WebviewWindow) -> Result<String, String> {
    let registry = window
        .state::<WindowServices>()
        .get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        let (root, path) = storage::root(window.app_handle())?;
        with_documents(&window, &registry, |documents| {
            let id = documents
                .create_image_draft(root, &path)
                .map_err(|error| error.to_string())?;
            storage::persist_draft(window.app_handle(), documents, &id)?;
            // Preparation grants no active-editor ownership. A failed SDK load
            // may close this candidate while the previous context remains live.
            Ok(id)
        })
    })
    .await
    .map_err(|_| "图片暂存初始化未能完成".to_owned())?
}

#[tauri::command]
pub fn close_image_draft(id: String, window: WebviewWindow) -> Result<(), String> {
    let registry = window
        .state::<WindowServices>()
        .get_documents(window.label())?;
    with_documents(&window, &registry, |documents| {
        let host = window.state::<ImageHost>();
        let active = host
            .current_drafts
            .lock()
            .map_err(|_| "图片暂存状态不可用")?
            .get(window.label())
            .is_some_and(|(retained, current)| Arc::ptr_eq(retained, &registry) && current == &id);
        let named_claim = host
            .staged_documents
            .lock()
            .map_err(|_| "图片暂存状态不可用")?
            .iter()
            .any(|((label, document), (retained, draft))| {
                label == window.label()
                    && Arc::ptr_eq(retained, &registry)
                    && draft == &id
                    && documents.get_metadata(document).is_ok()
            });
        storage::persist_draft(window.app_handle(), documents, &id)?;
        if active && named_claim {
            return Ok(());
        }
        documents.close_image_draft(&id);
        host.staged_documents
            .lock()
            .map_err(|_| "图片暂存状态不可用")?
            .retain(|(label, _), (retained, draft)| {
                label != window.label() || !Arc::ptr_eq(retained, &registry) || draft != &id
            });
        let mut current = host
            .current_drafts
            .lock()
            .map_err(|_| "图片暂存状态不可用")?;
        if current
            .get(window.label())
            .is_some_and(|(retained, draft)| Arc::ptr_eq(retained, &registry) && draft == &id)
        {
            current.remove(window.label());
        }
        Ok(())
    })
}

pub(super) fn capture_checkpoint_images(
    window: &WebviewWindow,
    text: &str,
) -> Result<Option<document_service::ImageDraftSnapshot>, String> {
    let host = window.state::<ImageHost>();
    let named = host
        .active_named
        .lock()
        .map_err(|_| "图片活动文稿状态不可用")?
        .get(window.label())
        .cloned();
    if let Some((registry, id)) = named {
        let historical = with_documents(window, &registry, |documents| {
            storage::bound_checkpoint_snapshot(window.app_handle(), documents, &id, text)
        })?;
        if historical.is_some() {
            return Ok(historical);
        }
    }
    let captured = host
        .current_drafts
        .lock()
        .map_err(|_| "图片暂存状态不可用")?
        .get(window.label())
        .cloned();
    let Some((registry, draft)) = captured else {
        return Ok(None);
    };
    with_documents(window, &registry, |documents| {
        documents
            .image_draft_snapshot(&draft)
            .map(Some)
            .map_err(|error| error.to_string())
    })
}

pub(super) fn checkpoint_images(
    app: &tauri::AppHandle,
    recovery_id: &str,
    version: u64,
    snapshot: Option<document_service::ImageDraftSnapshot>,
) -> Result<(), String> {
    let Some(snapshot) = snapshot else {
        return Ok(());
    };
    // Serialize association writes, preserving the first association for an
    // idempotent checkpoint acknowledgement even when IPC replies are reordered.
    app.state::<WindowServices>()
        .with_file_lane(|| storage::persist_recovery(app, recovery_id, version, snapshot))
}

pub(super) fn select_checkpoint_images(
    app: &tauri::AppHandle,
    id: &str,
    expected_version: u64,
    text: &str,
    current: Option<document_service::ImageDraftSnapshot>,
) -> Result<Option<document_service::ImageDraftSnapshot>, String> {
    storage::select_checkpoint_snapshot(app, id, expected_version, text, current)
}

pub(super) fn restore_recovery_images(
    app: &tauri::AppHandle,
    window: &WebviewWindow,
    recovery_id: &str,
    version: u64,
) -> Result<Option<String>, String> {
    let registry = window
        .state::<WindowServices>()
        .get_documents(window.label())?;
    with_documents(window, &registry, |documents| {
        storage::restore_draft(app, documents, recovery_id, version)
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionRequest {
    operation_id: String,
    id: String,
    action: String,
    source: String,
    reference: String,
    reference_root: String,
    storage_folder: String,
    expected_metadata_revision: Option<u64>,
    relative_path: Option<bool>,
    relative_path_with_dot: Option<bool>,
}

#[tauri::command]
pub async fn perform_document_image_action(
    request: ActionRequest,
    window: WebviewWindow,
) -> Result<Option<DocumentImage>, String> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    require_current(&window)?;
    uuid::Uuid::parse_str(&request.operation_id).map_err(|_| "图片操作标识无效")?;
    let registry = window
        .state::<WindowServices>()
        .get_documents(window.label())?;
    let cancelled = begin_action(
        &window.state::<ImageHost>(),
        window.label(),
        &request.operation_id,
    )?;
    let target = window.clone();
    let result=tauri::async_runtime::spawn_blocking(move|| {
        let execute=(|| {
            require_registry(&target,&registry)?;
            if cancelled.load(Ordering::Acquire) {return Err("图片操作已取消".into());}
            match request.action.as_str() {
                "reveal"=>{
                    let path=with_documents(&target,&registry,|documents| {
                        check_epoch(documents,&request.id,request.expected_metadata_revision)?;
                        documents.image_path(&request.id,if request.source.starts_with("staged/") {&request.source} else {&request.reference}).map_err(|error|error.to_string())
                    })?;
                    if cancelled.load(Ordering::Acquire) {return Err("图片操作已取消".into());}
                    crate::platform::entry_actions::dispatch(crate::window_services::EntryActionKind::Reveal,&path)?;
                    Ok(None)
                },
                "copyToStorage"=>with_documents(&target,&registry,|documents| {
                    if cancelled.load(Ordering::Acquire) {return Err("图片复制已取消".into());}
                    check_epoch(documents,&request.id,request.expected_metadata_revision)?;
                    if staging_policy(&request.storage_folder) || documents.image_draft_snapshot(&request.id).is_ok() {return Ok(None);}
                    let mut copied=documents.copy_current_images(&request.id,&request.id,std::slice::from_ref(&request.source),&request.reference_root,&request.storage_folder).map_err(|error|error.to_string())?;
                    copied.pop().map(|item|formatted_payload(documents,&request.id,item.target,&request.reference_root,request.relative_path,request.relative_path_with_dot)).transpose()
                }),
                "downloadToStorage"=>{
                    let source=download_source(&request.source,&request.reference)?;
                    with_documents(&target,&registry,|documents|check_epoch(documents,&request.id,request.expected_metadata_revision))?;
                    let approved=target.app_handle().dialog().message(format!("从此地址下载图片并复制到当前图片目录？\n{}\n最多8 MiB；不发送文稿或上传图片。",source)).title("下载图片").parent(&target).buttons(MessageDialogButtons::OkCancelCustom("下载".into(),"取消".into())).blocking_show();
                    if !approved || cancelled.load(Ordering::Acquire) {return Err("图片下载已取消".into());}
                    require_registry(&target,&registry)?;
                    // Refuse stale context before any network request, then again before disk IO.
                    with_documents(&target,&registry,|documents|check_epoch(documents,&request.id,request.expected_metadata_revision))?;
                    let bytes=download::download_image(&source,Arc::clone(&cancelled))?;
                    require_registry(&target,&registry)?;
                    if cancelled.load(Ordering::Acquire) {return Err("图片下载已取消".into());}
                    use base64::Engine;
                    let encoded=base64::engine::general_purpose::STANDARD.encode(bytes);
                    with_documents(&target,&registry,|documents| {
                        check_epoch(documents,&request.id,request.expected_metadata_revision)?;
                        if cancelled.load(Ordering::Acquire) {return Err("图片下载已取消".into());}
                        let image=import_owned_image(&target,&registry,documents,&request.id,"downloaded-image",&encoded,&request.reference_root,&request.storage_folder)?;
                        formatted_payload(documents,&request.id,image,&request.reference_root,request.relative_path,request.relative_path_with_dot).map(Some)
                    })
                },
                _=>Err("不支持的图片操作".into()),
            }
        })();
        if let Ok(mut operations)=target.state::<ImageHost>().operations.lock() {operations.running.remove(&request.operation_id);}
        execute
    }).await.map_err(|_|"图片操作任务未能完成".to_owned())?;
    result
}

#[tauri::command]
pub fn cancel_document_image_action(
    operation_id: String,
    window: WebviewWindow,
) -> Result<(), String> {
    require_current(&window)?;
    uuid::Uuid::parse_str(&operation_id).map_err(|_| "图片操作标识无效")?;
    cancel_action(&window.state::<ImageHost>(), window.label(), &operation_id)
}

fn check_epoch(
    documents: &document_service::DocumentService,
    id: &str,
    expected: Option<u64>,
) -> Result<(), String> {
    if documents.image_draft_snapshot(id).is_ok() {
        return if expected.is_none() {
            Ok(())
        } else {
            Err("图片暂存会话不接受文件位置版本".into())
        };
    }
    let actual = documents
        .get_metadata(id)
        .map_err(|error| error.to_string())?
        .metadata_revision;
    if let Some(expected) = expected {
        if expected > 9_007_199_254_740_991 || actual != expected {
            return Err("图片操作已取消：文档位置已更新，请重试".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use cap_std::fs::{Dir, File};
    use document_service::{NativeMovePublication, NativeMovePublicationEntry, RenameKind};
    use std::{fs, path::Path, sync::Arc};
    #[test]
    fn a_pre_move_import_waiting_for_the_lane_cannot_create_files_in_the_new_parent() {
        let temporary = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(temporary.path()).unwrap();
        fs::create_dir(root.join("left")).unwrap();
        fs::create_dir(root.join("right")).unwrap();
        let old = root.join("left/A.md");
        let new = root.join("right/A.md");
        fs::write(&old, b"\xef\xbb\xbfsource\r\n").unwrap();
        let cap = |path: &Path| {
            Arc::new(Dir::open_ambient_dir(path, cap_std::ambient_authority()).unwrap())
        };
        let services = WindowServices::default();
        services.register("main").unwrap();
        let document = services
            .mutate_document("main", |documents| {
                documents
                    .open_authorized(&old)
                    .map_err(|error| error.to_string())
            })
            .unwrap();
        services
            .mutate_document("main", |documents| {
                let source =
                    Arc::new(File::open_ambient(&old, cap_std::ambient_authority()).unwrap());
                let mut plan = documents
                    .prepare_move(
                        cap(&root.join("left")),
                        Path::new("A.md"),
                        cap(&root.join("right")),
                        Path::new("A.md"),
                        &old,
                        &new,
                        RenameKind::File,
                    )
                    .unwrap();
                fs::rename(&old, &new).unwrap();
                let destination =
                    Arc::new(File::open_ambient(&new, cap_std::ambient_authority()).unwrap());
                let proof = NativeMovePublication::verify(
                    uuid::Uuid::new_v4(),
                    cap(&root.join("left")),
                    Path::new("A.md"),
                    cap(&root.join("right")),
                    Path::new("A.md"),
                    RenameKind::File,
                    vec![NativeMovePublicationEntry::from_owned_handles(
                        Path::new(""),
                        RenameKind::File,
                        source,
                        destination,
                    )
                    .unwrap()],
                )
                .unwrap();
                plan.validate_commit(&proof).unwrap();
                plan.commit();
                Ok(())
            })
            .unwrap();
        let import = |expected| {
            services.mutate_document("main", |documents| {
                check_epoch(documents, &document.id, expected)?;
                documents
                    .import_image_with_folder(
                        &document.id,
                        "image.svg",
                        "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
                        "",
                        "assets",
                    )
                    .map_err(|error| error.to_string())
            })
        };
        assert!(import(Some(0)).is_err());
        assert!(!root.join("left/assets").exists());
        assert!(!root.join("right/assets").exists());
        assert!(import(Some(1)).is_ok());
        assert!(root.join("right/assets").exists());
        assert!(!root.join("left/assets").exists());
        services
            .mutate_document("main", |documents| {
                check_epoch(documents, &document.id, None)?;
                assert_eq!(
                    documents
                        .get_metadata(&document.id)
                        .unwrap()
                        .metadata_revision,
                    1
                );
                Ok(())
            })
            .unwrap();
        assert_eq!(fs::read(new).unwrap(), b"\xef\xbb\xbfsource\r\n");
    }

    #[test]
    fn staged_import_returns_the_real_owned_file_uri_and_independent_named_alias() {
        let temporary = tempfile::tempdir().unwrap();
        let path = fs::canonicalize(temporary.path()).unwrap();
        let directory =
            Arc::new(Dir::open_ambient_dir(&path, cap_std::ambient_authority()).unwrap());
        let mut documents = document_service::DocumentService::default();
        let draft = documents.create_image_draft(directory, &path).unwrap();
        let image = import_staged_image(
            &mut documents,
            &draft,
            "自有图片.svg",
            "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        )
        .unwrap();
        assert!(image.source.starts_with("file://"));
        let actual = tauri::Url::parse(&image.source)
            .unwrap()
            .to_file_path()
            .unwrap();
        assert!(actual.starts_with(path.join("staged").join(&draft)));
        assert_eq!(
            fs::read(actual).unwrap(),
            b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>"
        );
        let formatted = formatted_payload(
            &documents,
            &draft,
            image.clone(),
            "",
            Some(false),
            Some(true),
        )
        .unwrap();
        assert_eq!(formatted.source, image.source);
        assert_ne!(formatted.source, formatted.url);
        let named_path = path.join("saved.md");
        fs::write(&named_path, "own").unwrap();
        let named = documents.open_authorized(&named_path).unwrap();
        documents
            .attach_image_draft_aliases(&named.id, &draft, std::slice::from_ref(&image.source))
            .unwrap();
        documents.close_image_draft(&draft);
        let attached = documents
            .resolve_image_alias(&named.id, &image.source)
            .unwrap()
            .unwrap();
        assert!(documents.image(&attached.token).is_some());
    }

    #[test]
    fn context_switch_retires_only_the_previous_scope_and_preparation_does_not_activate() {
        let temporary = tempfile::tempdir().unwrap();
        let path = fs::canonicalize(temporary.path()).unwrap();
        let directory =
            Arc::new(Dir::open_ambient_dir(&path, cap_std::ambient_authority()).unwrap());
        let services = WindowServices::default();
        services.register("main").unwrap();
        let registry = services.get_documents("main").unwrap();
        let host = ImageHost::default();
        let mut documents = registry.lock().unwrap();
        let original = documents
            .create_image_draft(Arc::clone(&directory), &path)
            .unwrap();
        let image = import_staged_image(
            &mut documents,
            &original,
            "own.svg",
            "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
        )
        .unwrap();
        switch_current_stage(
            &host,
            "main",
            &registry,
            &mut documents,
            Some(original.clone()),
            |_, _| Ok(()),
        )
        .unwrap();
        let candidate = documents.create_image_draft(directory, &path).unwrap();
        // Approximate a failed SDK load: preparation and candidate disposal leave
        // the old context, URL and actual registered bytes untouched.
        documents.close_image_draft(&candidate);
        assert_eq!(
            host.current_drafts.lock().unwrap().get("main").unwrap().1,
            original
        );
        assert!(documents
            .resolve_draft_image(&original, &image.source)
            .is_ok());
        let named_path = path.join("named.md");
        fs::write(&named_path, "own").unwrap();
        let named = documents.open_authorized(&named_path).unwrap();
        documents
            .attach_image_draft_aliases(&named.id, &original, std::slice::from_ref(&image.source))
            .unwrap();
        remember_named_stage(&host, "main", &registry, &named.id, &original).unwrap();
        assert_eq!(
            known_named_stage(&host, "main", &registry, &documents, &named.id).unwrap(),
            Some(original.clone())
        );
        // Successful activation of an unrelated named document without images
        // releases the old scope; cloned named aliases retain their own URL.
        let mut persisted = false;
        switch_current_stage(&host, "main", &registry, &mut documents, None, |_, id| {
            persisted = id == original;
            Ok(())
        })
        .unwrap();
        assert!(persisted);
        assert!(documents.image_draft_snapshot(&original).is_err());
        assert!(host.staged_documents.lock().unwrap().is_empty());
        assert!(documents
            .resolve_image_alias(&named.id, &image.source)
            .unwrap()
            .is_some());
    }

    #[test]
    fn reserved_storage_values_are_exact_and_protocol_relative_downloads_use_the_sdk_reference() {
        for folder in ["", "upload", "UPLOAD", "iPiC", "TextBundle"] {
            assert!(staging_policy(folder));
        }
        for folder in ["./upload", "images/upload", "textbundle-assets", " upload"] {
            assert!(!staging_policy(folder));
        }
        assert_eq!(
            download_source(
                "//example.invalid/image.svg",
                "http://127.0.0.1:1234/image.svg"
            )
            .unwrap(),
            "http://127.0.0.1:1234/image.svg"
        );
        assert!(download_source("//example.invalid/image.svg", "file:///private.svg").is_err());
        assert!(
            download_source("//example.invalid/image.svg", "//example.invalid/image.svg").is_err()
        );
        assert!(download_source("https://user:password@example.invalid/image.svg", "").is_err());
    }

    #[test]
    fn cancellation_admission_is_atomic_and_foreign_owners_cannot_consume_tombstones() {
        let host = ImageHost::default();
        cancel_action(&host, "first", "early").unwrap();
        assert!(begin_action(&host, "second", "early").is_err());
        assert!(begin_action(&host, "first", "early").is_err());
        let running = begin_action(&host, "first", "active").unwrap();
        assert!(cancel_action(&host, "second", "active").is_err());
        assert!(!running.load(Ordering::Acquire));
        cancel_action(&host, "first", "active").unwrap();
        assert!(running.load(Ordering::Acquire));
        for _ in 0..64 {
            let host = Arc::new(ImageHost::default());
            let barrier = Arc::new(std::sync::Barrier::new(3));
            let start = {
                let host = Arc::clone(&host);
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    begin_action(&host, "main", "racing")
                })
            };
            let cancel = {
                let host = Arc::clone(&host);
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    barrier.wait();
                    cancel_action(&host, "main", "racing")
                })
            };
            barrier.wait();
            cancel.join().unwrap().unwrap();
            match start.join().unwrap() {
                Ok(flag) => assert!(flag.load(Ordering::Acquire)),
                Err(error) => assert!(error.contains("取消")),
            }
        }
    }
}

/// Private capability owner; neither this registry nor its epoch is renderer input.
#[derive(Clone)]
pub(crate) struct NativeInputOwner {
    pub(crate) registry: crate::commands::Documents,
    pub(crate) id: String,
    pub(crate) metadata_revision: Option<u64>,
    pub(crate) generation: u64,
}
pub(crate) fn capture_native_input_owner(
    window: &WebviewWindow,
) -> Result<NativeInputOwner, String> {
    require_current(window)?;
    let host = window.state::<ImageHost>();
    let (registry, id, generation) = host.native_input_context(window.label())?;
    require_registry(window, &registry)?;
    // This capture also runs synchronously in AppKit's drop callback. Never
    // wait for the file lane from the main thread while an IO worker may be
    // dispatching a window operation back to it.
    let metadata_revision = {
        let documents = registry
            .try_lock()
            .map_err(|_| "文稿正在处理文件操作，请稍后重试原生输入")?;
        if documents.image_draft_snapshot(&id).is_ok() {
            None
        } else {
            Some(
                documents
                    .get_metadata(&id)
                    .map_err(|error| error.to_string())?
                    .metadata_revision,
            )
        }
    };
    require_registry(window, &registry)?;
    Ok(NativeInputOwner {
        registry,
        id,
        metadata_revision,
        generation,
    })
}
pub(crate) fn require_native_input_owner(
    window: &WebviewWindow,
    expected: &NativeInputOwner,
) -> Result<(), String> {
    let actual = capture_native_input_owner(window)?;
    if !same_native_input_owner(&actual, expected) {
        return Err("原生输入所属文稿或位置已改变，请重试".into());
    }
    Ok(())
}
fn same_native_input_owner(actual: &NativeInputOwner, expected: &NativeInputOwner) -> bool {
    Arc::ptr_eq(&actual.registry, &expected.registry)
        && actual.id == expected.id
        && actual.metadata_revision == expected.metadata_revision
        && actual.generation == expected.generation
}
#[derive(Serialize)]
pub(crate) struct NativeImportedImage {
    pub(crate) name: String,
    pub(crate) source: String,
    pub(crate) url: String,
}
#[allow(clippy::too_many_arguments)]
pub(crate) fn import_native_images(
    window: &WebviewWindow,
    owner: &NativeInputOwner,
    images: Vec<(String, Vec<u8>)>,
    root: &str,
    folder: &str,
    relative: Option<bool>,
    dot: Option<bool>,
    cancelled: &AtomicBool,
) -> Result<Vec<NativeImportedImage>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    require_native_input_owner(window, owner)?;
    with_documents(window, &owner.registry, |documents| {
        let context = window
            .state::<ImageHost>()
            .input_contexts
            .lock()
            .map_err(|_| "原生输入上下文不可用")?
            .get(window.label())
            .cloned()
            .ok_or("原生输入上下文已关闭")?;
        if !Arc::ptr_eq(&context.0, &owner.registry)
            || context.1 != owner.id
            || context.2 != owner.generation
        {
            return Err("原生输入所属文稿已改变".into());
        }
        check_epoch(documents, &owner.id, owner.metadata_revision)?;
        images
            .into_iter()
            .map(|(name, bytes)| {
                if !window.is_focused().map_err(|error| error.to_string())? {
                    return Err("原生输入窗口已失去焦点".into());
                }
                if cancelled.load(Ordering::Acquire) {
                    return Err("原生输入已取消".into());
                }
                let image = import_owned_image(
                    window,
                    &owner.registry,
                    documents,
                    &owner.id,
                    &name,
                    &STANDARD.encode(bytes),
                    root,
                    folder,
                )?;
                let image = formatted_payload(documents, &owner.id, image, root, relative, dot)?;
                Ok(NativeImportedImage {
                    name,
                    source: image.source,
                    url: image.url,
                })
            })
            .collect()
    })
}

pub(crate) fn native_input_document_path(
    window: &WebviewWindow,
    owner: &NativeInputOwner,
) -> Result<Option<std::path::PathBuf>, String> {
    require_native_input_owner(window, owner)?;
    with_documents(window, &owner.registry, |documents| {
        if owner.metadata_revision.is_none() {
            Ok(None)
        } else {
            documents
                .display_path(&owner.id)
                .map(Some)
                .map_err(|error| error.to_string())
        }
    })
}

impl ImageHost {
    fn native_input_context(
        &self,
        label: &str,
    ) -> Result<(crate::commands::Documents, String, u64), String> {
        let context = self
            .input_contexts
            .lock()
            .map_err(|_| "原生输入上下文不可用")?
            .get(label)
            .cloned()
            .ok_or("编辑器尚未就绪，无法接收原生文件")?;
        if context.1.is_empty() {
            return Err("原生输入上下文激活未确认，请重试保存或重新打开文稿".into());
        }
        Ok(context)
    }
    fn begin_native_input_context(
        &self,
        label: &str,
        registry: &crate::commands::Documents,
    ) -> Result<u64, String> {
        let mut contexts = self
            .input_contexts
            .lock()
            .map_err(|_| "原生输入上下文不可用")?;
        let epoch = contexts.get(label).map_or(0, |(_, _, epoch)| *epoch);
        let next = epoch.checked_add(1);
        // Revoke before any storage IO. Keep the epoch on failure; deleting it
        // would let a later activation of the same ID revive an old receipt.
        contexts.insert(
            label.into(),
            (Arc::clone(registry), String::new(), next.unwrap_or(epoch)),
        );
        next.ok_or_else(|| "原生输入上下文版本已耗尽".into())
    }
    fn publish_native_input_context(
        &self,
        label: &str,
        registry: &crate::commands::Documents,
        id: String,
        epoch: u64,
    ) -> Result<(), String> {
        let mut contexts = self
            .input_contexts
            .lock()
            .map_err(|_| "原生输入上下文不可用")?;
        let current = contexts.get(label).ok_or("原生输入所属窗口已关闭")?;
        if !Arc::ptr_eq(&current.0, registry) || !current.1.is_empty() || current.2 != epoch {
            return Err("原生输入激活期间窗口或上下文已改变".into());
        }
        contexts.insert(label.into(), (Arc::clone(registry), id, epoch));
        Ok(())
    }
    pub(crate) fn forget_native_input(&self, label: &str) {
        if let Ok(mut contexts) = self.input_contexts.lock() {
            contexts.remove(label);
        }
    }
    pub(crate) fn invalidate_native_input(&self, label: &str) {
        if let Ok(mut contexts) = self.input_contexts.lock() {
            if let Some((_, id, epoch)) = contexts.get_mut(label) {
                if let Some(next) = epoch.checked_add(1) {
                    *epoch = next;
                } else {
                    id.clear();
                }
            }
        }
    }
}

#[cfg(test)]
mod native_input_owner_tests {
    use super::*;
    #[test]
    fn failed_activation_revokes_old_owner_and_same_id_retry_cannot_revive_a_receipt() {
        let host = ImageHost::default();
        let registry = Arc::new(Mutex::new(document_service::DocumentService::new()));
        let first = host.begin_native_input_context("main", &registry).unwrap();
        host.publish_native_input_context("main", &registry, "a".into(), first)
            .unwrap();
        let old = host.native_input_context("main").unwrap();
        let failed = host.begin_native_input_context("main", &registry).unwrap();
        // Simulate the real production return before publication (storage error).
        assert!(host.native_input_context("main").is_err());
        assert!(failed > old.2);
        let retry = host.begin_native_input_context("main", &registry).unwrap();
        host.publish_native_input_context("main", &registry, "a".into(), retry)
            .unwrap();
        assert!(host.native_input_context("main").unwrap().2 > old.2);
        assert!(host
            .publish_native_input_context("main", &registry, "b".into(), failed)
            .is_err());
    }
    #[test]
    fn activation_epoch_overflow_stays_revoked_instead_of_resetting_to_an_old_nonce() {
        let host = ImageHost::default();
        let registry = Arc::new(Mutex::new(document_service::DocumentService::new()));
        host.input_contexts
            .lock()
            .unwrap()
            .insert("main".into(), (Arc::clone(&registry), "a".into(), u64::MAX));
        assert!(host.begin_native_input_context("main", &registry).is_err());
        assert!(host.native_input_context("main").is_err());
        assert!(host.begin_native_input_context("main", &registry).is_err());
    }
    #[test]
    fn registry_document_metadata_and_generation_are_independent_owner_fences() {
        let registry = Arc::new(Mutex::new(document_service::DocumentService::new()));
        let owner = NativeInputOwner {
            registry: Arc::clone(&registry),
            id: "a".into(),
            metadata_revision: Some(1),
            generation: 1,
        };
        let mut next = owner.clone();
        assert!(same_native_input_owner(&next, &owner));
        next.generation = 2;
        assert!(!same_native_input_owner(&next, &owner));
        next = owner.clone();
        next.id = "b".into();
        assert!(!same_native_input_owner(&next, &owner));
        next = owner.clone();
        next.metadata_revision = Some(2);
        assert!(!same_native_input_owner(&next, &owner));
        next = owner.clone();
        next.registry = Arc::new(Mutex::new(document_service::DocumentService::new()));
        assert!(!same_native_input_owner(&next, &owner));
    }
    #[test]
    fn destroyed_window_forgets_only_its_native_context_and_registry() {
        let host = ImageHost::default();
        let a = Arc::new(Mutex::new(document_service::DocumentService::new()));
        let weak = Arc::downgrade(&a);
        let b = Arc::new(Mutex::new(document_service::DocumentService::new()));
        host.input_contexts
            .lock()
            .unwrap()
            .insert("a".into(), (a, "draft-a".into(), 1));
        host.input_contexts
            .lock()
            .unwrap()
            .insert("b".into(), (b, "draft-b".into(), 1));
        host.forget_native_input("a");
        assert!(weak.upgrade().is_none());
        assert!(host.input_contexts.lock().unwrap().contains_key("b"));
    }
    #[test]
    fn blur_invalidates_pending_owner_even_when_the_same_document_returns() {
        let host = ImageHost::default();
        let registry = Arc::new(Mutex::new(document_service::DocumentService::new()));
        host.input_contexts
            .lock()
            .unwrap()
            .insert("main".into(), (Arc::clone(&registry), "a".into(), 1));
        host.invalidate_native_input("main");
        assert_eq!(
            host.input_contexts.lock().unwrap().get("main").unwrap().2,
            2
        );
        host.invalidate_native_input("missing");
        assert!(!host.input_contexts.lock().unwrap().contains_key("missing"));
        host.input_contexts
            .lock()
            .unwrap()
            .get_mut("main")
            .unwrap()
            .2 = u64::MAX;
        host.invalidate_native_input("main");
        assert!(host.native_input_context("main").is_err());
        assert_eq!(
            host.input_contexts.lock().unwrap().get("main").unwrap().2,
            u64::MAX
        );
    }
}
