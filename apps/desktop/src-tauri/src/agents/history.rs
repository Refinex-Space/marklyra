//! ACP integration adapted and modified for MarkLyra from Markune.
use super::*;

pub(super) fn list(data: &Path, root: &Path) -> Result<Vec<Value>, String> {
    let index = data.join("session-index").join(hash_json(&json!(root)));
    let directory = if index.exists() {
        index
    } else {
        data.join("sessions")
    };
    if !directory.exists() {
        return Ok(vec![]);
    }
    let mut records = Vec::new();
    for (count, entry) in fs::read_dir(directory)
        .map_err(|_| "无法读取会话列表")?
        .enumerate()
    {
        if count >= 10_000 {
            return Err("会话目录超过 10000 项，无法完整读取；未执行清理".into());
        }
        let path = entry.map_err(|_| "无法读取会话")?.path();
        if path.extension().is_some_and(|s| s == "json") {
            if let Ok(mut record) = read_json(&path) {
                if record["rootPath"] == root.to_string_lossy().as_ref() {
                    if let Some(object) = record.as_object_mut() {
                        object.remove("messages");
                        records.push(record);
                    }
                }
            }
        }
    }
    records.sort_by(|a, b| b["updatedAt"].as_u64().cmp(&a["updatedAt"].as_u64()));
    Ok(records)
}
pub(super) fn save(data: &Path, record: &Value) -> Result<(), String> {
    let id = record["id"]
        .as_str()
        .filter(|id| safe_id(id))
        .ok_or("会话标识无效")?;
    let root = canonical_workspace_root(record["rootPath"].as_str().ok_or("缺少工作区")?)?;
    if record["rootPath"] != root.to_string_lossy().as_ref()
        || !record["messages"].is_array()
        || record["messages"]
            .as_array()
            .is_some_and(|v| v.len() > 5000)
    {
        return Err("会话内容无效".into());
    }
    let profile_id = record["profileId"].as_str().ok_or("缺少智能体身份")?;
    let provider_id = record["providerSessionId"].as_str().ok_or("会话尚未创建")?;
    let ownership = hash_json(&json!([profile_id, root, provider_id]));
    let proof = read_json(&data.join("ownership").join(format!("{ownership}.json")))
        .map_err(|_| "会话并非由 MarkLyra 创建")?;
    if proof["profileId"] != profile_id
        || proof["rootPath"] != record["rootPath"]
        || proof["sessionId"] != provider_id
    {
        return Err("会话归属无效".into());
    }
    let path = data.join("sessions").join(format!("{id}.json"));
    let lock = document_save_lock(&path);
    let _guard = lock.lock().map_err(|_| "会话写入锁不可用")?;
    if data
        .join("deleted-sessions")
        .join(format!("{id}.json"))
        .exists()
    {
        return Err("会话已彻底移除，不能由延迟写入恢复".into());
    }
    let mut previous_metadata = None;
    if path.exists() {
        let previous = read_json(&path)?;
        if previous["archived"] == true {
            return Err("已归档会话只读，请先恢复".into());
        }
        if previous["profileId"] != profile_id
            || previous["rootPath"] != record["rootPath"]
            || previous["providerSessionId"] != provider_id
        {
            return Err("不能替换另一会话的历史".into());
        }
        if previous["updatedAt"].as_u64() >= record["updatedAt"].as_u64() {
            return Ok(());
        }
        if previous["titleEdited"] == true {
            previous_metadata = Some(previous["title"].clone());
        }
    }
    let mut saved = record.clone();
    if let Some(title) = previous_metadata {
        saved["title"] = title;
        saved["titleEdited"] = json!(true);
    }
    attachments::validate_references(data, &saved)?;
    write_json(&path, &saved)?;
    let mut summary = saved;
    summary
        .as_object_mut()
        .ok_or("会话格式无效")?
        .remove("messages");
    write_json(
        &data
            .join("session-index")
            .join(hash_json(&json!(root)))
            .join(format!("{id}.json")),
        &summary,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn complete_listing_includes_older_archives_past_one_thousand_records() {
        let data = tempfile::tempdir().unwrap();
        let root = tempfile::tempdir().unwrap();
        let directory = data.path().join("sessions");
        fs::create_dir_all(&directory).unwrap();
        for n in 0..1001 {
            fs::write(
                directory.join(format!("{n}.json")),
                serde_json::to_vec(&json!({
                    "id":format!("{n}"), "rootPath":root.path(), "updatedAt":n,
                    "archived":n==0, "messages":["not-in-summary"]
                }))
                .unwrap(),
            )
            .unwrap();
        }
        let records = list(data.path(), root.path()).unwrap();
        assert_eq!(records.len(), 1001);
        assert_eq!(records.last().unwrap()["archived"], true);
        assert!(records
            .iter()
            .all(|record| record.get("messages").is_none()));
    }
    #[test]
    fn history_requires_native_ownership_and_ignores_late_snapshots() {
        let data = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let root = workspace.path().canonicalize().unwrap();
        let mut record = json!({"id":"local","profileId":"profile","providerSessionId":"session","rootPath":root,"updatedAt":20,"messages":[{"text":"new"}]});
        assert!(save(data.path(), &record).is_err());
        let ownership = hash_json(&json!(["profile", root, "session"]));
        write_json(
            &data
                .path()
                .join("ownership")
                .join(format!("{ownership}.json")),
            &json!({"profileId":"profile","rootPath":root,"sessionId":"session"}),
        )
        .unwrap();
        save(data.path(), &record).unwrap();
        record["updatedAt"] = json!(10);
        record["messages"] = json!([]);
        save(data.path(), &record).unwrap();
        assert_eq!(
            read_json(&data.path().join("sessions/local.json")).unwrap()["messages"][0]["text"],
            "new"
        );
        let list = list(data.path(), &root).unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].get("messages").is_none());
        assert_eq!(list[0]["updatedAt"], 20);
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;
    #[test]
    fn manual_title_survives_late_stream_and_deleted_history_cannot_resurrect() {
        let data = tempfile::tempdir().unwrap();
        let workspace = tempfile::tempdir().unwrap();
        let root = workspace.path().canonicalize().unwrap();
        let mut record = json!({"id":"local","profileId":"profile","providerSessionId":"session","rootPath":root,"updatedAt":20,"title":"First","messages":[]});
        write_json(
            &data.path().join("ownership").join(format!(
                "{}.json",
                hash_json(&json!(["profile", root, "session"]))
            )),
            &json!({"profileId":"profile","rootPath":root,"sessionId":"session"}),
        )
        .unwrap();
        save(data.path(), &record).unwrap();
        let path = data.path().join("sessions/local.json");
        let mut manual = record.clone();
        manual["title"] = json!("Manual");
        manual["titleEdited"] = json!(true);
        write_json(&path, &manual).unwrap();
        record["updatedAt"] = json!(30);
        save(data.path(), &record).unwrap();
        assert_eq!(read_json(&path).unwrap()["title"], "Manual");
        write_json(
            &data.path().join("deleted-sessions/local.json"),
            &json!({"id":"local"}),
        )
        .unwrap();
        fs::remove_file(&path).unwrap();
        assert!(save(data.path(), &record).is_err());
        assert!(!path.exists());
    }
}
