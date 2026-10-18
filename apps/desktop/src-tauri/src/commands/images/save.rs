use super::{payload, storage, ImageHost};
use crate::{
    commands::{save_suggestion, Documents},
    window_services::WindowServices,
};
use document_service::PreparedImageSaveAs;
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc, time::Instant};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};

pub(super) struct SaveOperation {
    pub registry: Documents,
    pub label: String,
    pub started: Instant,
    plan: PreparedImageSaveAs,
    source_id: Option<String>,
    encoding: Option<String>,
    aliases: Vec<(String, String)>,
    source_binding: Option<storage::Binding>,
    draft_sources: Option<(String, Vec<String>)>,
    recovery_history: Vec<document_service::ImageDraftSnapshot>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PrepareRequest {
    source_owner: String,
    source_id: Option<String>,
    encoding: Option<String>,
    suggested_name: Option<String>,
    references: Vec<String>,
    reference_root: String,
    storage_folder: String,
    close: bool,
    expected_metadata_revision: Option<u64>,
    relative_path: Option<bool>,
    relative_path_with_dot: Option<bool>,
    relocation: Option<Relocation>,
    preserve_references: Option<bool>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Relocation {
    previous_path: String,
    metadata_revision: u64,
}
#[derive(Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum PreparedSave {
    Cancel,
    Discard,
    #[cfg(not(target_os = "macos"))]
    Unsupported,
    Prepared {
        operation_id: String,
        mappings: Vec<Mapping>,
    },
}
#[derive(Serialize)]
pub struct Mapping {
    source: String,
    target: super::DocumentImage,
}

#[tauri::command]
pub async fn prepare_document_image_save(
    request: PrepareRequest,
    app: AppHandle,
    window: WebviewWindow,
) -> Result<PreparedSave, String> {
    super::require_current(&window)?;
    if (request.references.is_empty() && request.preserve_references != Some(true))
        || request.references.len() > 128
    {
        return Err("图片迁移数量无效".into());
    }
    if request
        .source_id
        .as_ref()
        .is_some_and(|id| id != &request.source_owner)
    {
        return Err("图片迁移所属文档不符".into());
    }
    request
        .encoding
        .as_deref()
        .map(document_service::Encoding::from_label)
        .transpose()
        .map_err(|error| error.to_string())?;
    let registry = window
        .state::<WindowServices>()
        .get_documents(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        let previous = request
            .source_id
            .as_deref()
            .map(|id| {
                registry
                    .lock()
                    .map_err(|_| "文档状态不可用".to_owned())?
                    .display_path(id)
                    .map_err(|error| error.to_string())
            })
            .transpose()?;
        let extension = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .default_extension(&app)?;
        let suggested = save_suggestion(
            previous.as_deref(),
            &extension,
            request.suggested_name.as_deref(),
        )?;
        let path = if let Some(relocation) = &request.relocation {
            let id = request
                .source_id
                .as_deref()
                .ok_or("图片位置迁移需要已命名文稿")?;
            super::with_documents(&window, &registry, |documents| {
                super::check_epoch(documents, id, Some(relocation.metadata_revision))?;
                let path = documents
                    .display_path(id)
                    .map_err(|error| error.to_string())?;
                if path.to_string_lossy() == relocation.previous_path {
                    return Err("文稿位置尚未变化".into());
                }
                Ok(path)
            })?
        } else if request.close {
            if previous.is_some() {
                return Err("未命名关闭不能用于已命名文稿".into());
            }
            match tauri::async_runtime::block_on(crate::platform::untitled_close::select(
                &app, &window, &suggested, &extension,
            ))? {
                crate::platform::untitled_close::Choice::Cancel => return Ok(PreparedSave::Cancel),
                crate::platform::untitled_close::Choice::Discard => {
                    return Ok(PreparedSave::Discard)
                }
                #[cfg(not(target_os = "macos"))]
                crate::platform::untitled_close::Choice::Unsupported => {
                    return Ok(PreparedSave::Unsupported)
                }
                crate::platform::untitled_close::Choice::Save(path) => path,
            }
        } else {
            app.dialog()
                .file()
                .set_parent(&window)
                .set_title("另存为 Markdown 文档")
                .set_file_name(&suggested)
                .add_filter(
                    "Markdown / Text",
                    &[&extension, "md", "markdown", "text", "txt"],
                )
                .blocking_save_file()
                .ok_or("已取消保存")?
                .into_path()
                .map_err(|_| "无法读取保存路径")?
        };
        super::require_registry(&window, &registry)?;
        let preserve = request.preserve_references == Some(true)
            || request.storage_folder.is_empty()
            || ["upload", "ipic", "textbundle"]
                .contains(&request.storage_folder.to_ascii_lowercase().as_str());
        let copy = if preserve {
            if !app
                .dialog()
                .message("保留原图片引用并保存。应用暂存图片继续保留；相对引用不会自动迁移。")
                .title("保留图片引用")
                .parent(&window)
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "保存".into(),
                    "取消".into(),
                ))
                .blocking_show()
            {
                return Ok(PreparedSave::Cancel);
            }
            false
        } else {
            match app
                .dialog()
                .message(format!(
                    "复制 {} 张本地图片到目标图片目录并更新引用，或保留原引用。原图片均保留。",
                    request.references.len()
                ))
                .title("保存文稿图片")
                .parent(&window)
                .buttons(MessageDialogButtons::YesNoCancelCustom(
                    "复制并保存".into(),
                    "保留原引用".into(),
                    "取消".into(),
                ))
                .blocking_show_with_result()
            {
                MessageDialogResult::Yes => true,
                MessageDialogResult::No => false,
                MessageDialogResult::Custom(ref label) if label == "复制并保存" => true,
                MessageDialogResult::Custom(ref label) if label == "保留原引用" => false,
                _ => return Ok(PreparedSave::Cancel),
            }
        };
        super::require_registry(&window, &registry)?;
        let (plan, prior, source_binding, draft_sources, recovery_history) =
            super::with_documents(&window, &registry, |documents| {
                super::check_epoch(
                    documents,
                    &request.source_owner,
                    request
                        .relocation
                        .as_ref()
                        .map(|value| value.metadata_revision)
                        .or(request.expected_metadata_revision),
                )?;
                let source_binding = request
                    .source_id
                    .as_deref()
                    .map(|id| storage::before_save(&app, documents, id))
                    .transpose()?
                    .flatten();
                let prior = if source_binding.is_some() {
                    storage::read_aliases(
                        &app,
                        documents,
                        request.source_id.as_deref().expect("binding source"),
                    )?
                } else {
                    Vec::new()
                };
                let mut recovery_history = storage::recovery_history(source_binding.as_ref());
                if request.source_id.is_none() {
                    recovery_history.push(
                        documents
                            .image_draft_snapshot(&request.source_owner)
                            .map_err(|error| error.to_string())?,
                    );
                }
                let draft_sources = preserved_draft_sources(
                    documents,
                    &request.source_owner,
                    request.source_id.as_deref(),
                    copy,
                )?;
                let plan = documents
                    .prepare_image_save_as(
                        &path,
                        &request.source_owner,
                        if copy { &request.references } else { &[] },
                        if copy { &request.reference_root } else { "" },
                        if copy { &request.storage_folder } else { "." },
                    )
                    .map_err(|error| error.to_string())?;
                Ok((
                    plan,
                    prior,
                    retained_staged_binding(source_binding, copy),
                    draft_sources,
                    recovery_history,
                ))
            })?;
        let mappings: Vec<_> = plan
            .mappings()
            .iter()
            .map(|item| {
                let mut target = payload(item.target.clone());
                target.source = super::formatted_source(
                    &target.source,
                    plan.path(),
                    &request.reference_root,
                    request.relative_path,
                    request.relative_path_with_dot,
                )?;
                Ok(Mapping {
                    source: item.source.clone(),
                    target,
                })
            })
            .collect::<Result<_, String>>()?;
        let mut aliases: HashMap<String, String> = prior.into_iter().collect();
        for item in plan.mappings() {
            let actual_source = resolved_reference(&request.reference_root, &item.source);
            let actual_target = resolved_reference(&request.reference_root, &item.target.source);
            for target in aliases.values_mut() {
                if *target == actual_source {
                    *target = actual_target.clone();
                }
            }
            aliases.insert(item.source.clone(), actual_target);
        }
        let id = uuid::Uuid::new_v4().to_string();
        let host = app.state::<ImageHost>();
        let mut operations = host.saves.lock().map_err(|_| "图片保存状态不可用")?;
        operations.retain(|_, value| {
            value.started.elapsed().as_secs() < 600
                && app
                    .state::<WindowServices>()
                    .get_documents(&value.label)
                    .is_ok_and(|current| Arc::ptr_eq(&current, &value.registry))
        });
        if operations.len() >= 16 {
            return Err("图片保存操作过多，请取消旧操作后重试".into());
        }
        operations.insert(
            id.clone(),
            SaveOperation {
                registry,
                label: window.label().into(),
                started: Instant::now(),
                plan,
                source_id: request.source_id,
                encoding: request.encoding,
                aliases: aliases.into_iter().collect(),
                source_binding,
                draft_sources,
                recovery_history,
            },
        );
        Ok(PreparedSave::Prepared {
            operation_id: id,
            mappings,
        })
    })
    .await
    .map_err(|_| "图片保存准备任务未能完成".to_owned())?
}

fn resolved_reference(root: &str, source: &str) -> String {
    if root.is_empty() || std::path::Path::new(source).is_absolute() || source.contains(':') {
        source.into()
    } else {
        format!("{}/{}", root.trim_end_matches('/'), source)
    }
}

// A successful copy already aliases each proven old href to its new owned
// resource. Attaching the entire old draft again would clone unused spellings
// and consume the destination's real-image quota a second time.
fn preserved_draft_sources(
    documents: &document_service::DocumentService,
    source_owner: &str,
    source_id: Option<&str>,
    copy: bool,
) -> Result<Option<(String, Vec<String>)>, String> {
    if copy || source_id.is_some() {
        return Ok(None);
    }
    Ok(Some((
        source_owner.to_owned(),
        documents
            .image_draft_sources(source_owner)
            .map_err(|error| error.to_string())?,
    )))
}

// Named no-action sources may already carry a native staged binding. Copying
// the current proved hrefs replaces that grant with new destination resources;
// only a no-copy save keeps the old staged closure (including unused history).
pub(super) fn retained_staged_binding(
    binding: Option<storage::Binding>,
    copy: bool,
) -> Option<storage::Binding> {
    if copy {
        None
    } else {
        binding
    }
}

#[tauri::command]
pub async fn commit_document_image_save(
    operation_id: String,
    text: String,
    app: AppHandle,
    window: WebviewWindow,
) -> Result<super::SavedImageDocument, String> {
    document_service::validate_text(&text).map_err(|error| error.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        super::require_current(&window)?;
        let operation = {
            let host = app.state::<ImageHost>();
            let mut saves = host.saves.lock().map_err(|_| "图片保存状态不可用")?;
            let value = saves
                .get(&operation_id)
                .ok_or("图片保存操作已失效，请重试")?;
            if value.label != window.label() {
                return Err("图片保存不属于当前窗口".into());
            }
            super::require_registry(&window, &value.registry)?;
            saves.remove(&operation_id).expect("checked")
        };
        if operation.started.elapsed().as_secs() >= 600 {
            return Err("图片保存操作已过期，原文与图片均保留".into());
        }
        let saved = super::with_documents(&window, &operation.registry, |documents| {
            let saved = operation
                .plan
                .commit(
                    documents,
                    &text,
                    operation.source_id.as_deref(),
                    operation.encoding.as_deref(),
                )
                .map_err(|error| error.to_string())?;
            // The document write has committed. A record failure is reported separately,
            // never as permission to repeat the write or discard the saved acknowledgement.
            let image_warning = (|| {
                storage::preserve_staged_binding(
                    &app,
                    documents,
                    &saved.id,
                    operation.source_binding,
                )?;
                if let Some((draft, sources)) = operation.draft_sources {
                    documents
                        .attach_image_draft_aliases(&saved.id, &draft, &sources)
                        .map_err(|error| error.to_string())?;
                    for source in sources {
                        storage::persist_staged_alias(&app, documents, &saved.id, &draft, &source)?;
                    }
                }
                storage::persist_aliases(&app, documents, &saved.id, operation.aliases)?;
                storage::persist_recovery_history(
                    &app,
                    documents,
                    &saved.id,
                    operation.recovery_history,
                )
            })()
            .err()
            .map(|error: String| format!("文稿与图片已保存，撤销引用恢复绑定未更新：{error}"));
            Ok(super::SavedImageDocument {
                document: saved,
                image_warning,
            })
        })?;
        if let Err(error) = app.emit("workspace-files-changed", ()) {
            eprintln!("Image save catalog notification failed: {error}");
        }
        Ok(saved)
    })
    .await
    .map_err(|_| "图片保存任务未能完成".to_owned())?
}

#[tauri::command]
pub fn cancel_document_image_save(
    operation_id: String,
    app: AppHandle,
    window: WebviewWindow,
) -> Result<(), String> {
    super::require_current(&window)?;
    let host = app.state::<ImageHost>();
    let mut saves = host.saves.lock().map_err(|_| "图片保存状态不可用")?;
    if saves
        .get(&operation_id)
        .is_some_and(|value| value.label != window.label())
    {
        return Err("图片保存不属于当前窗口".into());
    }
    saves.remove(&operation_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use cap_std::fs::Dir;
    const SVG: &str = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";
    #[test]
    fn copied_first_save_does_not_attach_the_old_dual_spelling_closure_at_64_or_128_images() {
        for count in [64, 128] {
            let temporary = tempfile::tempdir().unwrap();
            let base = std::fs::canonicalize(temporary.path()).unwrap();
            let staging = base.join("staging");
            std::fs::create_dir(&staging).unwrap();
            let target = base.join("target");
            std::fs::create_dir(&target).unwrap();
            let mut documents = document_service::DocumentService::new();
            let draft = documents
                .create_image_draft(
                    Arc::new(
                        Dir::open_ambient_dir(&staging, cap_std::ambient_authority()).unwrap(),
                    ),
                    &staging,
                )
                .unwrap();
            let mut references = Vec::new();
            for _ in 0..count {
                let image = documents
                    .import_draft_image(&draft, "same.svg", SVG)
                    .unwrap();
                let uri = tauri::Url::from_file_path(
                    documents.image_path(&draft, &image.source).unwrap(),
                )
                .unwrap()
                .to_string();
                documents
                    .add_image_draft_alias(&draft, &image.source, &uri)
                    .unwrap();
                references.push(uri);
            }
            assert_eq!(
                documents.image_draft_sources(&draft).unwrap().len(),
                count * 2
            );
            assert!(preserved_draft_sources(&documents, &draft, None, true)
                .unwrap()
                .is_none());
            assert_eq!(
                preserved_draft_sources(&documents, &draft, None, false)
                    .unwrap()
                    .unwrap()
                    .1
                    .len(),
                count * 2
            );
            let path = target.join("saved.md");
            let plan = documents
                .prepare_image_save_as(&path, &draft, &references, "", "assets")
                .unwrap();
            let mappings = plan.mappings().to_vec();
            let source = mappings
                .iter()
                .map(|mapping| format!("![image]({})\r\n", mapping.target.source))
                .collect::<String>();
            let saved = plan.commit(&mut documents, &source, None, None).unwrap();
            // This is the exact helper controlling the Native commit branch.
            // No old closure is reattached once proven hrefs were copied.
            assert!(preserved_draft_sources(&documents, &draft, None, true)
                .unwrap()
                .is_none());
            documents.close_image_draft(&draft);
            for mapping in &mappings {
                let alias = documents
                    .resolve_image_alias(&saved.id, &mapping.source)
                    .unwrap()
                    .unwrap();
                assert_eq!(alias.token, mapping.target.token);
                assert_eq!(
                    std::fs::read(target.join(&mapping.target.source)).unwrap(),
                    br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#
                );
            }
            if count == 64 {
                // Reattaching all old portable keys would incorrectly fill the
                // 128-resource destination quota before this 65th real image.
                documents
                    .import_image(&saved.id, "next.svg", SVG, "")
                    .unwrap();
            } else {
                assert!(documents
                    .import_image(&saved.id, "over.svg", SVG, "")
                    .is_err());
            }
            assert_eq!(std::fs::read_to_string(path).unwrap(), source);
        }
    }
}
