//! A current document is a single-file capability, never an implicit parent-directory grant.
use super::*;

pub(super) fn current_path(process: &process::AgentProcess) -> Result<PathBuf, String> {
    let window = process.window.as_ref().ok_or("编辑窗口不可用")?;
    let id = process
        .mcp_context
        .lock()
        .map_err(|_| "上下文不可用")?
        .active_document_id
        .clone()
        .ok_or("本轮未附加已保存的当前文档")?;
    let documents = window
        .state::<crate::window_services::WindowServices>()
        .get_documents(window.label())?;
    let path = documents
        .lock()
        .map_err(|_| "文档服务不可用")?
        .authorized_path(&id)
        .map_err(|e| e.to_string())?;
    Ok(path)
}

pub(super) fn execute(
    process: &Arc<process::AgentProcess>,
    content: Option<&str>,
) -> Result<Value, String> {
    let window = process.window.as_ref().ok_or("编辑窗口不可用")?;
    let services = window.state::<crate::window_services::WindowServices>();
    let operation = || {
        if !process.live.load(std::sync::atomic::Ordering::Acquire)
            || process
                .cancelled_turn
                .load(std::sync::atomic::Ordering::Acquire)
        {
            return Err("任务已取消".into());
        }
        let id = process
            .mcp_context
            .lock()
            .map_err(|_| "上下文不可用")?
            .active_document_id
            .clone()
            .ok_or("本轮未附加已保存的当前文档")?;
        let main = services.get_documents(window.label())?;
        let bookmark = main
            .lock()
            .map_err(|_| "文档服务不可用")?
            .bookmark(&id)
            .map_err(|e| e.to_string())?;
        let path = bookmark.path();
        let mut documents = process.documents.lock().map_err(|_| "文档服务不可用")?;
        let mut ids = process
            .document_ids
            .lock()
            .map_err(|_| "文件版本状态不可用")?;
        if let Some(content) = content {
            if content.len() > 4 * 1024 * 1024 {
                return Err("写入文本超过 4 MiB".into());
            }
            let owned = ids
                .get(&path)
                .ok_or("修改当前文档前必须先调用 editor_read_document")?;
            documents.save(owned, content).map_err(|e| e.to_string())?;
            Ok(json!({"path":path,"written":true}))
        } else {
            if let Some(previous) = ids.remove(&path) {
                documents.close(&previous);
            }
            let loaded = documents
                .open_bookmark(&bookmark)
                .map_err(|e| e.to_string())?;
            ids.insert(path.clone(), loaded.id);
            Ok(json!({"path":path,"content":loaded.text,"encoding":loaded.encoding}))
        }
    };
    services.with_file_lane(operation)
}

pub(super) fn replace_once(source: &str, old: &str, new: &str) -> Result<String, String> {
    if old.is_empty() || source.match_indices(old).take(2).count() != 1 {
        return Err("待替换文本不存在或不唯一，请重新读取并提供唯一的原文片段".into());
    }
    let result = source.replacen(old, new, 1);
    if result.len() > 4 * 1024 * 1024 {
        return Err("修改后的文档超过 4 MiB".into());
    }
    Ok(result)
}
pub(super) fn edit(
    process: &Arc<process::AgentProcess>,
    old: &str,
    new: &str,
) -> Result<Value, String> {
    let window = process.window.as_ref().ok_or("编辑窗口不可用")?;
    let id = process
        .mcp_context
        .lock()
        .map_err(|_| "上下文不可用")?
        .active_document_id
        .clone()
        .ok_or("没有附加当前文档")?;
    let main = window
        .state::<crate::window_services::WindowServices>()
        .get_documents(window.label())?;
    let bookmark = main
        .lock()
        .map_err(|_| "文档服务不可用")?
        .bookmark(&id)
        .map_err(|e| e.to_string())?;
    let current = document_service::DocumentService::new()
        .open_bookmark(&bookmark)
        .map_err(|e| e.to_string())?;
    // The temporary read does not advance the process's earlier read/CAS baseline.
    execute(process, Some(&replace_once(&current.text, old, new)?))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exact_edit_preserves_every_unrelated_character_and_rejects_ambiguous_ranges() {
        let source = "# 中文\r\n\r\nOne 😀\n\nTail  \r\n";
        assert_eq!(
            replace_once(source, "One 😀", "Two 😀").unwrap(),
            "# 中文\r\n\r\nTwo 😀\n\nTail  \r\n"
        );
        assert!(replace_once("same same", "same", "new").is_err());
        assert!(replace_once(source, "missing", "new").is_err());
        assert!(replace_once(source, "", "new").is_err());
    }
}
