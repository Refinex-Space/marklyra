//! ACP integration adapted and modified for MarkLyra from Markune.
use super::*;
use std::time::{Duration, Instant};

pub(super) struct AgentTerminal {
    child: Child,
    output: Arc<Mutex<Vec<u8>>>,
    truncated: Arc<std::sync::atomic::AtomicBool>,
    limit: usize,
}
impl AgentTerminal {
    pub fn stop(&mut self) {
        kill_tree(&mut self.child);
    }
}
pub(super) fn scoped_path(root: &Path, value: &str, create: bool) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err("ACP 文件路径必须为绝对路径".into());
    }
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err("路径不能包含上级目录".into());
    }
    if !path.starts_with(root) {
        return Err("文件不在授权工作区中".into());
    }
    let relative = path.strip_prefix(root).map_err(|_| "路径越界")?;
    if relative
        .components()
        .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
    {
        return Err("智能体不能访问工作区私有路径".into());
    }
    let mut prefix = root.to_path_buf();
    for part in relative.components() {
        prefix.push(part.as_os_str());
        if let Ok(metadata) = fs::symlink_metadata(&prefix) {
            if metadata.file_type().is_symlink() {
                return Err("不能通过符号链接访问文件".into());
            }
        }
    }
    if path.exists() {
        let result = path.canonicalize().map_err(|_| "无法验证文件路径")?;
        if !result.starts_with(root) {
            return Err("文件路径越界".into());
        }
        return Ok(result);
    }
    if !create {
        return Err("文件不存在".into());
    }
    let parent = path
        .parent()
        .ok_or("文件父目录无效")?
        .canonicalize()
        .map_err(|_| "请先创建父目录")?;
    if !parent.starts_with(root) {
        return Err("文件父目录越界".into());
    }
    Ok(parent.join(path.file_name().ok_or("文件名无效")?))
}
pub(super) fn document_path(path: &Path) -> Result<(), String> {
    if !path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| file_index::TEXT_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
    {
        return Err("仅支持 Markdown 和文本文件".into());
    }
    Ok(())
}
pub(super) fn directory(process: &process::AgentProcess) -> Result<Arc<cap_std::fs::Dir>, String> {
    if let Some(workspace) = &process.workspace {
        workspace
            .bookmark()
            .map_err(|e| e.to_string())?
            .reopen()
            .map_err(|e| e.to_string())
    } else {
        #[cfg(test)]
        {
            Ok(Arc::new(
                cap_std::fs::Dir::open_ambient_dir(&process.root, cap_std::ambient_authority())
                    .map_err(|e| e.to_string())?,
            ))
        }
        #[cfg(not(test))]
        {
            Err("工作区能力不可用".into())
        }
    }
}
pub(super) fn execute(
    process: &Arc<process::AgentProcess>,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    if !process.live.load(std::sync::atomic::Ordering::Acquire) {
        return Err("连接已结束".into());
    }
    if process
        .cancelled_turn
        .load(std::sync::atomic::Ordering::Acquire)
        && !matches!(method, "terminal/kill" | "terminal/release")
    {
        return Err("任务已取消".into());
    }
    process.valid_session(&params)?;
    match method {
        "fs/read_text_file" => {
            let path = scoped_path(
                &process.root,
                params["path"].as_str().ok_or("缺少文件路径")?,
                false,
            )?;
            document_path(&path)?;
            let dir = directory(process)?;
            let relative = path.strip_prefix(&process.root).map_err(|_| "路径越界")?;
            let mut documents = process.documents.lock().map_err(|_| "文档服务不可用")?;
            let mut ids = process
                .document_ids
                .lock()
                .map_err(|_| "文件版本状态不可用")?;
            if ids.len() >= 128 && !ids.contains_key(&path) {
                return Err("已读取的文件过多，请新建会话".into());
            }
            if let Some(id) = ids.remove(&path) {
                documents.close(&id);
            }
            let loaded = documents
                .open_in_workspace(dir, relative, path.clone())
                .map_err(|e| e.to_string())?;
            ids.insert(path, loaded.id);
            let start = params["line"].as_u64().unwrap_or(1).saturating_sub(1) as usize;
            let limit = params["limit"].as_u64().unwrap_or(u64::MAX) as usize;
            let content = if params["line"].is_null() && params["limit"].is_null() {
                loaded.text
            } else {
                loaded
                    .text
                    .lines()
                    .skip(start)
                    .take(limit)
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            Ok(json!({"content":content}))
        }
        "fs/write_text_file" => {
            let path = scoped_path(
                &process.root,
                params["path"].as_str().ok_or("缺少文件路径")?,
                true,
            )?;
            document_path(&path)?;
            let content = params["content"].as_str().ok_or("缺少文件内容")?;
            if content.len() > 4 * 1024 * 1024 {
                return Err("写入文本超过 4 MiB".into());
            }
            let write = || {
                process.valid_session(&params)?;
                if process
                    .cancelled_turn
                    .load(std::sync::atomic::Ordering::Acquire)
                {
                    return Err("任务已取消".into());
                }
                let dir = directory(process)?;
                let relative = path.strip_prefix(&process.root).map_err(|_| "路径越界")?;
                let mut documents = process.documents.lock().map_err(|_| "文档服务不可用")?;
                let mut ids = process
                    .document_ids
                    .lock()
                    .map_err(|_| "文件版本状态不可用")?;
                if let Some(id) = ids.get(&path) {
                    documents.save(id, content).map_err(|e| e.to_string())?;
                } else {
                    if dir.symlink_metadata(relative).is_ok() {
                        return Err("修改已有文件前必须先读取最新内容".into());
                    }
                    let mut options = cap_std::fs::OpenOptions::new();
                    options.create_new(true).write(true);
                    let mut file = dir
                        .open_with(relative, &options)
                        .map_err(|_| "目标文件已出现或不可写")?;
                    file.write_all(content.as_bytes())
                        .and_then(|_| file.sync_all())
                        .map_err(|_| "文件写入失败")?;
                    let loaded = documents
                        .open_in_workspace(dir, relative, path.clone())
                        .map_err(|e| e.to_string())?;
                    ids.insert(path.clone(), loaded.id);
                }
                Ok(json!({}))
            };
            if let Some(window) = &process.window {
                window
                    .state::<crate::window_services::WindowServices>()
                    .with_file_lane(write)
            } else {
                write()
            }
        }
        "terminal/create" => {
            let executable = params["command"]
                .as_str()
                .filter(|v| !v.is_empty() && !v.contains('\0'))
                .ok_or("缺少终端命令")?;
            let cwd = if let Some(cwd) = params["cwd"].as_str() {
                scoped_path(&process.root, cwd, false)?
            } else {
                process.root.clone()
            };
            if !cwd.is_dir() {
                return Err("终端目录无效".into());
            }
            let args = catalog::string_args(&params["args"])?;
            let mut builder = command(Path::new(executable), &args);
            builder
                .current_dir(cwd)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            if let Some(env) = params["env"].as_array() {
                if env.len() > 64 {
                    return Err("环境变量过多".into());
                }
                for item in env {
                    let name = item["name"].as_str().ok_or("环境变量无效")?;
                    let value = item["value"].as_str().ok_or("环境变量无效")?;
                    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                        || value.contains('\0')
                    {
                        return Err("环境变量无效".into());
                    }
                    builder.env(name, value);
                }
            }
            let mut terminals = process.terminals.lock().map_err(|_| "终端状态不可用")?;
            if terminals.len() >= 16 {
                return Err("当前会话终端数量已达上限".into());
            }
            let mut child = builder.spawn().map_err(|_| "终端命令启动失败")?;
            let limit = params["outputByteLimit"]
                .as_u64()
                .unwrap_or(1024 * 1024)
                .clamp(1024, 4 * 1024 * 1024) as usize;
            let output = Arc::new(Mutex::new(Vec::new()));
            let truncated = Arc::new(std::sync::atomic::AtomicBool::new(false));
            if let Some(stream) = child.stdout.take() {
                collect(stream, output.clone(), truncated.clone(), limit);
            }
            if let Some(stream) = child.stderr.take() {
                collect(stream, output.clone(), truncated.clone(), limit);
            }
            let id = Uuid::new_v4().to_string();
            terminals.insert(
                id.clone(),
                AgentTerminal {
                    child,
                    output,
                    truncated,
                    limit,
                },
            );
            Ok(json!({"terminalId":id}))
        }
        "terminal/output" | "terminal/wait_for_exit" | "terminal/kill" | "terminal/release" => {
            let id = params["terminalId"].as_str().ok_or("缺少终端身份")?;
            if method == "terminal/wait_for_exit" {
                let started = Instant::now();
                loop {
                    let status = process
                        .terminals
                        .lock()
                        .map_err(|_| "终端状态不可用")?
                        .get_mut(id)
                        .ok_or("终端已释放")?
                        .child
                        .try_wait()
                        .map_err(|_| "无法读取终端状态")?;
                    if let Some(status) = status {
                        return Ok(json!({"exitCode":status.code()}));
                    }
                    if !process.live.load(std::sync::atomic::Ordering::Acquire)
                        || started.elapsed() > Duration::from_secs(3600)
                    {
                        return Err("终端等待已结束".into());
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
            }
            let mut terminals = process.terminals.lock().map_err(|_| "终端状态不可用")?;
            let terminal = terminals.get_mut(id).ok_or("终端不属于此连接或已释放")?;
            if method == "terminal/kill" {
                terminal.stop();
                return Ok(json!({}));
            }
            if method == "terminal/release" {
                terminal.stop();
                terminals.remove(id);
                return Ok(json!({}));
            }
            let status = terminal.child.try_wait().map_err(|_| "无法读取终端状态")?;
            let buffer = terminal.output.lock().map_err(|_| "终端输出状态不可用")?;
            Ok(
                json!({"output":String::from_utf8_lossy(&buffer),"truncated":terminal.truncated.load(std::sync::atomic::Ordering::Acquire)||buffer.len()>=terminal.limit,"exitStatus":status.map(|s|json!({"exitCode":s.code()}))}),
            )
        }
        _ => Err("未实现的 ACP 客户端方法".into()),
    }
}
fn collect(
    mut stream: impl Read + Send + 'static,
    output: Arc<Mutex<Vec<u8>>>,
    truncated: Arc<std::sync::atomic::AtomicBool>,
    limit: usize,
) {
    std::thread::spawn(move || {
        let mut data = [0; 8192];
        while let Ok(count) = stream.read(&mut data) {
            if count == 0 {
                break;
            }
            let Ok(mut buffer) = output.lock() else { break };
            buffer.extend_from_slice(&data[..count]);
            if buffer.len() > limit {
                let trim = buffer.len() - limit;
                buffer.drain(..trim);
                truncated.store(true, std::sync::atomic::Ordering::Release);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_private_parent_and_external_paths() {
        let root = tempfile::tempdir().unwrap();
        let p = root.path().canonicalize().unwrap();
        assert!(scoped_path(&p, "/etc/passwd", false).is_err());
        assert!(scoped_path(&p, &p.join("../escape").to_string_lossy(), true).is_err());
        assert!(scoped_path(&p, &p.join(".marklyra/key").to_string_lossy(), true).is_err());
        assert!(scoped_path(&p, &p.join("note.md").to_string_lossy(), true).is_ok());
    }
    #[cfg(unix)]
    #[test]
    fn rejects_symlink_parents() {
        let root = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(other.path(), root.path().join("linked")).unwrap();
        assert!(scoped_path(
            &root.path().canonicalize().unwrap(),
            &root.path().join("linked/note.md").to_string_lossy(),
            true
        )
        .is_err());
    }
}

#[cfg(test)]
mod write_tests {
    use super::*;
    #[test]
    fn existing_text_requires_read_and_preserves_external_edits() {
        let dir = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let process = process::test_process(dir.path(), data.path());
        let path = process.root.join("note.md");
        fs::write(&path, "original").unwrap();
        let write = json!({"sessionId":"owned-session","path":path,"content":"agent edit"});
        assert!(execute(&process, "fs/write_text_file", write.clone()).is_err());
        execute(
            &process,
            "fs/read_text_file",
            json!({"sessionId":"owned-session","path":path}),
        )
        .unwrap();
        fs::write(&path, "external edit").unwrap();
        assert!(execute(&process, "fs/write_text_file", write.clone()).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "external edit");
        execute(
            &process,
            "fs/read_text_file",
            json!({"sessionId":"owned-session","path":path}),
        )
        .unwrap();
        execute(&process, "fs/write_text_file", write).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "agent edit");
    }
    #[test]
    fn stopped_connections_cannot_write() {
        let dir = tempfile::tempdir().unwrap();
        let process = process::test_process(dir.path(), dir.path());
        process.stop();
        assert!(execute(&process,"fs/write_text_file",json!({"sessionId":"owned-session","path":process.root.join("new.md"),"content":"blocked"})).is_err());
        assert!(!dir.path().join("new.md").exists());
    }
}

#[cfg(test)]
mod cancellation_tests {
    use super::*;
    #[test]
    fn cooperative_cancel_revokes_pending_file_operations() {
        let dir = tempfile::tempdir().unwrap();
        let process = process::test_process(dir.path(), dir.path());
        process
            .cancelled_turn
            .store(true, std::sync::atomic::Ordering::Release);
        assert!(execute(&process,"fs/write_text_file",json!({"sessionId":"owned-session","path":process.root.join("new.md"),"content":"blocked"})).is_err());
        assert!(!dir.path().join("new.md").exists());
    }
}

#[cfg(test)]
mod codec_tests {
    use super::*;
    #[test]
    fn unchanged_and_local_edits_keep_utf16_bom_and_mixed_newlines() {
        let root = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let process = process::test_process(root.path(), data.path());
        let path = process.root.join("note.md");
        let source = "# 中文\r\n\r\nOld  \nTail\r\n";
        let encode = |text: &str| {
            [
                vec![0xff, 0xfe],
                text.encode_utf16()
                    .flat_map(u16::to_le_bytes)
                    .collect::<Vec<_>>(),
            ]
            .concat()
        };
        fs::write(&path, encode(source)).unwrap();
        let read = execute(
            &process,
            "fs/read_text_file",
            json!({"sessionId":"owned-session","path":path}),
        )
        .unwrap();
        assert_eq!(read["content"], source);
        execute(
            &process,
            "fs/write_text_file",
            json!({"sessionId":"owned-session","path":path,"content":source}),
        )
        .unwrap();
        assert_eq!(fs::read(&path).unwrap(), encode(source));
        let changed = source.replace("Old", "New");
        execute(
            &process,
            "fs/write_text_file",
            json!({"sessionId":"owned-session","path":path,"content":changed}),
        )
        .unwrap();
        assert_eq!(fs::read(&path).unwrap(), encode(&changed));
    }
}

pub(super) fn edit(
    process: &Arc<process::AgentProcess>,
    session: &str,
    raw: &str,
    old: &str,
    new: &str,
) -> Result<Value, String> {
    let path = if Path::new(raw).is_absolute() {
        PathBuf::from(raw)
    } else {
        process.root.join(raw)
    };
    let path = scoped_path(&process.root, &path.to_string_lossy(), false)?;
    document_path(&path)?;
    let relative = path.strip_prefix(&process.root).map_err(|_| "路径越界")?;
    let current = document_service::DocumentService::new()
        .open_in_workspace(directory(process)?, relative, path.clone())
        .map_err(|e| e.to_string())?;
    let content = super::editor_document::replace_once(&current.text, old, new)?;
    execute(
        process,
        "fs/write_text_file",
        json!({"sessionId":session,"path":path,"content":content}),
    )
}
