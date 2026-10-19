use super::*;

pub(super) fn mutate(
    process: &Arc<process::AgentProcess>,
    name: &str,
    arguments: &Value,
) -> Result<Value, String> {
    let operation = || {
        if !process.live.load(std::sync::atomic::Ordering::Acquire)
            || process
                .cancelled_turn
                .load(std::sync::atomic::Ordering::Acquire)
        {
            return Err("任务已取消".into());
        }
        let dir = client_tools::directory(process)?;
        let trash = PathBuf::from(".marklyra-ai-trash");
        if name == "workspace_restore_entry" {
            let receipt = arguments["receipt"]
                .as_str()
                .filter(|id| safe_id(id))
                .ok_or("恢复凭证无效")?;
            let record = process
                .trash_receipts
                .lock()
                .map_err(|_| "恢复状态不可用")?
                .get(receipt)
                .cloned()
                .ok_or("此会话没有该恢复凭证")?;
            let target = client_tools::scoped_path(
                &process.root,
                &process.root.join(&record).to_string_lossy(),
                true,
            )?;
            let target = target.strip_prefix(&process.root).map_err(|_| "路径越界")?;
            if dir.symlink_metadata(target).is_ok() {
                return Err("目标已存在，未覆盖现有内容".into());
            }
            dir.rename(trash.join(receipt), &dir, target)
                .map_err(|_| "无法恢复文件")?;
            process
                .trash_receipts
                .lock()
                .map_err(|_| "恢复状态不可用")?
                .remove(receipt);
            return Ok(json!({"path":record,"restored":true}));
        }
        let raw = arguments["path"].as_str().ok_or("缺少路径")?;
        let path = if Path::new(raw).is_absolute() {
            PathBuf::from(raw)
        } else {
            process.root.join(raw)
        };
        let path = client_tools::scoped_path(
            &process.root,
            &path.to_string_lossy(),
            name == "workspace_create_directory",
        )?;
        let relative = path.strip_prefix(&process.root).map_err(|_| "路径越界")?;
        if relative.as_os_str().is_empty() {
            return Err("不能修改工作区根目录".into());
        }
        if name == "workspace_create_directory" {
            dir.create_dir(relative)
                .map_err(|_| "目录已存在或无法创建")?;
            return Ok(json!({"path":relative,"created":true}));
        }
        let metadata = dir.symlink_metadata(relative).map_err(|_| "目标不存在")?;
        if metadata.is_file() {
            client_tools::document_path(&path)?;
        }
        if metadata.file_type().is_symlink() {
            return Err("不能删除符号链接".into());
        }
        if dir.symlink_metadata(&trash).is_err() {
            dir.create_dir(&trash).map_err(|_| "无法创建恢复目录")?;
        }
        if dir
            .symlink_metadata(&trash)
            .map_err(|_| "恢复目录不可用")?
            .file_type()
            .is_symlink()
        {
            return Err("恢复目录无效".into());
        }
        let receipt = Uuid::new_v4().to_string();
        dir.rename(relative, &dir, trash.join(&receipt))
            .map_err(|_| "无法移入恢复目录")?;
        process
            .trash_receipts
            .lock()
            .map_err(|_| "恢复状态不可用")?
            .insert(receipt.clone(), relative.to_string_lossy().into());
        Ok(
            json!({"path":relative,"trashed":true,"receipt":receipt,"recoveryDirectory":trash,"message":"内容保存在工作区恢复目录，可在当前会话请求恢复"}),
        )
    };
    if let Some(window) = &process.window {
        window
            .state::<crate::window_services::WindowServices>()
            .with_file_lane(operation)
    } else {
        operation()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn directory_create_trash_restore_never_overwrites_new_content() {
        let root = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let process = process::test_process(root.path(), data.path());
        mutate(
            &process,
            "workspace_create_directory",
            &json!({"path":"notes"}),
        )
        .unwrap();
        fs::write(process.root.join("notes/a.md"), "original").unwrap();
        let receipt = mutate(&process, "workspace_trash_entry", &json!({"path":"notes"})).unwrap();
        assert!(!process.root.join("notes").exists());
        fs::create_dir(process.root.join("notes")).unwrap();
        assert!(mutate(
            &process,
            "workspace_restore_entry",
            &json!({"receipt":receipt["receipt"]})
        )
        .is_err());
        fs::remove_dir(process.root.join("notes")).unwrap();
        mutate(
            &process,
            "workspace_restore_entry",
            &json!({"receipt":receipt["receipt"]}),
        )
        .unwrap();
        assert_eq!(
            fs::read_to_string(process.root.join("notes/a.md")).unwrap(),
            "original"
        );
        assert!(mutate(&process, "workspace_trash_entry", &json!({"path":"."})).is_err());
    }
}
