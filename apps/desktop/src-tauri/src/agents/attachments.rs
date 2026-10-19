//! Message-owned attachment copies. No renderer-supplied filesystem paths.
use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};

const MAX_BYTES: usize = 4 * 1024 * 1024;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Upload {
    pub name: String,
    pub mime_type: String,
    pub data: String,
}
fn validate(upload: &Upload) -> Result<Vec<u8>, String> {
    if upload.name.is_empty()
        || upload.name.len() > 1024
        || upload.name.contains(['/', '\\'])
        || upload.name.chars().any(char::is_control)
        || upload.mime_type.len() > 128
        || !upload.mime_type.contains('/')
        || upload.mime_type.chars().any(char::is_control)
        || upload.data.len() > MAX_BYTES.div_ceil(3) * 4
    {
        return Err("附件名称、类型或大小无效（单次最多 4 MiB）".into());
    }
    let bytes = STANDARD.decode(&upload.data).map_err(|_| "附件编码无效")?;
    if bytes.len() > MAX_BYTES {
        return Err("附件超过 4 MiB 限制".into());
    }
    if upload.mime_type.starts_with("image/") {
        let mime = image_assets::inspect_image(&bytes).map_err(|e| e.to_string())?;
        if mime != upload.mime_type || mime == "image/svg+xml" {
            return Err("附件图片格式无效".into());
        }
    }
    Ok(bytes)
}
pub(super) fn directory(data: &Path, id: &str) -> Result<PathBuf, String> {
    if !safe_id(id) {
        return Err("附件会话标识无效".into());
    }
    let base = data.join("attachments");
    let path = base.join(id);
    for candidate in [&base, &path] {
        if let Ok(metadata) = fs::symlink_metadata(candidate) {
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err("附件目录不可用".into());
            }
        }
    }
    Ok(path)
}
fn owner(root: &Path, profile: &str, provider: &str) -> Value {
    json!({"rootPath":root,"profileId":profile,"providerSessionId":provider})
}
fn matches_owner(value: &Value, expected: &Value) -> bool {
    ["rootPath", "profileId", "providerSessionId"]
        .iter()
        .all(|key| value[key] == expected[key])
}
fn store(
    data: &Path,
    record_id: &str,
    expected: &Value,
    uploads: Vec<Upload>,
) -> Result<Vec<Value>, String> {
    if !safe_id(record_id) || uploads.is_empty() || uploads.len() > 8 {
        return Err("附件会话或数量无效".into());
    }
    let mut total = 0;
    let prepared = uploads.into_iter().map(|upload| {
        let bytes = validate(&upload)?;
        total += bytes.len();
        if total > MAX_BYTES { return Err("单次附件总量不能超过 4 MiB".into()); }
        let id = Uuid::new_v4().to_string();
        let metadata = json!({"id":id,"name":upload.name,"mimeType":upload.mime_type,"size":bytes.len(),"digest":format!("{:x}", Sha256::digest(&bytes))});
        Ok((metadata, upload))
    }).collect::<Result<Vec<_>, String>>()?;
    let record_path = data.join("sessions").join(format!("{record_id}.json"));
    let lock = document_save_lock(&record_path);
    let _guard = lock.lock().map_err(|_| "附件写入锁不可用")?;
    if data
        .join("deleted-sessions")
        .join(format!("{record_id}.json"))
        .exists()
    {
        return Err("会话已删除".into());
    }
    if record_path.exists() {
        let record = read_json(&record_path)?;
        if !matches_owner(&record, expected) || record["archived"] == true {
            return Err("附件会话归属无效或已归档".into());
        }
    }
    let directory = directory(data, record_id)?;
    let manifest = directory.join("owner.json");
    let mut manifest_value = if manifest.exists() {
        read_json(&manifest)?
    } else {
        expected.clone()
    };
    if !matches_owner(&manifest_value, expected) {
        return Err("附件不能跨会话使用".into());
    }
    let mut entries = manifest_value["attachments"]
        .as_object()
        .cloned()
        .unwrap_or_default();
    if entries.len() + prepared.len() > 128 {
        return Err("此会话附件已达 128 个，请新建会话".into());
    }
    let mut written = Vec::new();
    for (metadata, upload) in &prepared {
        let path = directory.join(format!(
            "{}.json",
            metadata["id"].as_str().ok_or("附件标识无效")?
        ));
        let mut stored = metadata.clone();
        stored["data"] = json!(upload.data);
        if let Err(error) = write_json(&path, &stored) {
            for path in written {
                let _ = fs::remove_file(path);
            }
            return Err(error);
        }
        written.push(path);
        entries.insert(
            metadata["id"].as_str().ok_or("附件标识无效")?.into(),
            metadata.clone(),
        );
    }
    manifest_value["attachments"] = json!(entries);
    if let Err(error) = write_json(&manifest, &manifest_value) {
        for path in written {
            let _ = fs::remove_file(path);
        }
        return Err(error);
    }
    Ok(prepared.into_iter().map(|(metadata, _)| metadata).collect())
}
pub(super) fn validate_references(data: &Path, record: &Value) -> Result<(), String> {
    let messages = record["messages"].as_array().ok_or("会话消息无效")?;
    let mut has_attachments = false;
    for message in messages {
        if let Some(raw) = message.get("attachments") {
            let values = raw
                .as_array()
                .filter(|v| v.len() <= 8)
                .ok_or("消息附件无效")?;
            has_attachments |= !values.is_empty();
        }
    }
    if !has_attachments {
        return Ok(());
    }
    let directory = directory(data, record["id"].as_str().ok_or("会话标识无效")?)?;
    let manifest = read_json(&directory.join("owner.json"))?;
    if !matches_owner(&manifest, record) {
        return Err("附件会话归属无效".into());
    }
    for message in messages {
        if let Some(raw) = message.get("attachments") {
            let values = raw
                .as_array()
                .filter(|v| v.len() <= 8)
                .ok_or("消息附件无效")?;
            for value in values {
                let id = value["id"]
                    .as_str()
                    .filter(|id| safe_id(id))
                    .ok_or("附件标识无效")?;
                if value.get("data").is_some() || value != &manifest["attachments"][id] {
                    return Err("消息包含未授权或无效附件引用".into());
                }
            }
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn agent_store_attachments(
    app: AppHandle,
    window: WebviewWindow,
    connection_id: String,
    provider_session_id: String,
    record_id: String,
    uploads: Vec<Upload>,
) -> Result<Vec<Value>, String> {
    let process = connection(&app.state::<AgentHostState>(), &window, &connection_id)?;
    process.valid_session(&json!({"sessionId":provider_session_id}))?;
    let expected = owner(&process.root, &process.profile.id, &provider_session_id);
    tauri::async_runtime::spawn_blocking(move || {
        store(&process.data_root, &record_id, &expected, uploads)
    })
    .await
    .map_err(|_| "附件保存失败".to_string())?
}
#[tauri::command]
pub async fn agent_read_attachment(
    app: AppHandle,
    window: WebviewWindow,
    root_path: String,
    record_id: String,
    attachment_id: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !safe_id(&record_id) || !safe_id(&attachment_id) {
            return Err("附件标识无效".into());
        }
        let root = authorize_root(&window, &root_path)?;
        let data = storage(&app)?;
        let record_path = data.join("sessions").join(format!("{record_id}.json"));
        let lock = document_save_lock(&record_path);
        let _guard = lock.lock().map_err(|_| "附件读取锁不可用")?;
        let record = read_json(&record_path)?;
        if record["rootPath"] != root.to_string_lossy().as_ref() {
            return Err("附件不属于当前工作区".into());
        }
        let reference = record["messages"]
            .as_array()
            .into_iter()
            .flatten()
            .flat_map(|m| m["attachments"].as_array().into_iter().flatten())
            .find(|a| a["id"] == attachment_id)
            .ok_or("会话未引用此附件")?;
        let directory = directory(&data, &record_id)?;
        if !matches_owner(&read_json(&directory.join("owner.json"))?, &record) {
            return Err("附件会话归属无效".into());
        }
        let stored = read_json(&directory.join(format!("{attachment_id}.json")))?;
        let upload = Upload {
            name: stored["name"].as_str().ok_or("附件名称无效")?.into(),
            mime_type: stored["mimeType"].as_str().ok_or("附件类型无效")?.into(),
            data: stored["data"].as_str().ok_or("附件数据无效")?.into(),
        };
        let bytes = validate(&upload)?;
        if ["id", "name", "mimeType", "size", "digest"]
            .iter()
            .any(|key| stored[key] != reference[key])
            || stored["digest"] != format!("{:x}", Sha256::digest(bytes))
        {
            return Err("附件校验失败".into());
        }
        Ok(stored)
    })
    .await
    .map_err(|_| "读取附件失败".to_string())?
}
#[tauri::command]
pub async fn agent_clipboard_attachments(window: WebviewWindow) -> Result<Value, String> {
    use crate::clipboard::native_input::NativeClipboardSnapshot;
    let snapshot = crate::clipboard::read_native_input(window).await?;
    tauri::async_runtime::spawn_blocking(move || match snapshot {
        NativeClipboardSnapshot::Content(content) => Ok(json!({"files":[],"text":content.text})),
        NativeClipboardSnapshot::Empty => Ok(json!({"files":[]})),
        NativeClipboardSnapshot::Image(image) => {
            let image = image.convert()?;
            if image.base64.len() > MAX_BYTES.div_ceil(3) * 4 {
                return Err("图片超过 4 MiB 限制".into());
            }
            Ok(json!({"files":[{"name":image.name,"type":image.mime,"base64":image.base64}]}))
        }
        NativeClipboardSnapshot::Files(files) => {
            if files.len() > 8 {
                return Err("最多添加 8 个附件".into());
            }
            let mut total = 0;
            let files = files
                .into_iter()
                .map(|file| {
                    let (name, bytes) = file.attachment_bytes()?;
                    total += bytes.len();
                    if total > MAX_BYTES {
                        return Err("单次附件总量不能超过 4 MiB".into());
                    }
                    Ok(json!({"name":name,"base64":STANDARD.encode(bytes)}))
                })
                .collect::<Result<Vec<_>, String>>()?;
            Ok(json!({"files":files}))
        }
    })
    .await
    .map_err(|_| "读取粘贴附件失败".to_string())?
}

#[tauri::command]
pub async fn agent_discard_attachments(
    app: AppHandle,
    window: WebviewWindow,
    root_path: String,
    record_id: String,
    ids: Vec<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = authorize_root(&window, &root_path)?;
        if ids.len() > 8 || ids.iter().any(|id| !safe_id(id)) {
            return Err("附件标识无效".into());
        }
        let data = storage(&app)?;
        let directory = directory(&data, &record_id)?;
        let lock = document_save_lock(&data.join("sessions").join(format!("{record_id}.json")));
        let _guard = lock.lock().map_err(|_| "附件清理锁不可用")?;
        let mut manifest = read_json(&directory.join("owner.json"))?;
        if manifest["rootPath"] != root.to_string_lossy().as_ref() {
            return Err("附件不属于当前工作区".into());
        }
        let record_path = data.join("sessions").join(format!("{record_id}.json"));
        let record = if record_path.exists() {
            read_json(&record_path)?
        } else {
            Value::Null
        };
        for id in ids {
            let referenced = record["messages"]
                .as_array()
                .into_iter()
                .flatten()
                .any(|m| {
                    m["attachments"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .any(|a| a["id"] == id)
                });
            if !referenced {
                let path = directory.join(format!("{id}.json"));
                if path.exists() {
                    fs::remove_file(path).map_err(|_| "未发送附件清理失败")?;
                }
                if let Some(entries) = manifest["attachments"].as_object_mut() {
                    entries.remove(&id);
                }
            }
        }
        write_json(&directory.join("owner.json"), &manifest)?;
        Ok(())
    })
    .await
    .map_err(|_| "附件清理失败".to_string())?
}
#[tauri::command]
pub async fn agent_import_dropped_attachments(
    window: WebviewWindow,
    ticket: String,
) -> Result<Value, String> {
    let files = crate::clipboard::native_input::attachment_drop(window, ticket).await?;
    Ok(
        json!({"files": files.into_iter().map(|(name, bytes)| json!({"name":name,"base64":STANDARD.encode(bytes)})).collect::<Vec<_>>()}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn history_stores_only_owned_metadata_and_images_keep_original_bytes() {
        let data = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let root = workspace.path().canonicalize().unwrap();
        let expected = owner(&root, "profile", "provider");
        let png =
            include_bytes!("../../../../../crates/image-assets/test-fixtures/clipboard-rgb.png");
        let refs = store(
            data.path(),
            "history",
            &expected,
            vec![Upload {
                name: "image.png".into(),
                mime_type: "image/png".into(),
                data: STANDARD.encode(png),
            }],
        )
        .unwrap();
        let proof = hash_json(&json!(["profile", root, "provider"]));
        write_json(
            &data.path().join("ownership").join(format!("{proof}.json")),
            &json!({"profileId":"profile","rootPath":root,"sessionId":"provider"}),
        )
        .unwrap();
        let record = json!({"id":"history","profileId":"profile","rootPath":root,"providerSessionId":"provider","updatedAt":1,"messages":[{"text":"image","attachments":refs}]});
        history::save(data.path(), &record).unwrap();
        let saved = read_json(&data.path().join("sessions/history.json")).unwrap();
        assert!(saved["messages"][0]["attachments"][0].get("data").is_none());
        let id = refs[0]["id"].as_str().unwrap();
        let stored = read_json(
            &data
                .path()
                .join("attachments/history")
                .join(format!("{id}.json")),
        )
        .unwrap();
        assert_eq!(
            STANDARD.decode(stored["data"].as_str().unwrap()).unwrap(),
            png
        );
        let mut forged = record.clone();
        forged["updatedAt"] = json!(2);
        forged["messages"][0]["attachments"][0]["id"] = json!("foreign");
        assert!(history::save(data.path(), &forged).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn attachment_storage_rejects_symlink_directories() {
        let data = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(outside.path(), data.path().join("attachments")).unwrap();
        assert!(directory(data.path(), "session").is_err());
    }
    #[test]
    fn attachments_are_bounded_owned_and_separate_from_history() {
        let data = tempfile::tempdir().unwrap();
        let expected = owner(Path::new("/workspace"), "profile", "provider");
        let upload = || Upload {
            name: "notes.txt".into(),
            mime_type: "text/plain".into(),
            data: STANDARD.encode("hello"),
        };
        let refs = store(data.path(), "session", &expected, vec![upload()]).unwrap();
        assert!(refs[0].get("data").is_none());
        assert_eq!(refs[0]["size"], 5);
        let mut record = expected.clone();
        record["id"] = json!("session");
        record["messages"] = json!([{"attachments":refs}]);
        validate_references(data.path(), &record).unwrap();
        record["messages"][0]["attachments"][0]["size"] = json!(99);
        assert!(validate_references(data.path(), &record).is_err());
        assert!(store(data.path(), "../other", &expected, vec![upload()]).is_err());
        assert!(store(
            data.path(),
            "session",
            &owner(Path::new("/other"), "profile", "provider"),
            vec![upload()]
        )
        .is_err());
        let invalid = Upload {
            name: "fake.png".into(),
            mime_type: "image/png".into(),
            data: STANDARD.encode("not png"),
        };
        assert!(store(data.path(), "session", &expected, vec![invalid]).is_err());
        write_json(
            &data.path().join("deleted-sessions/session.json"),
            &json!({}),
        )
        .unwrap();
        assert!(store(data.path(), "session", &expected, vec![upload()]).is_err());
    }
}
