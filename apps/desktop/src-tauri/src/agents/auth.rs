//! PTYs are available only for an auth method advertised by an owned ACP process.
use super::*;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

pub(super) struct Login {
    child: Box<dyn portable_pty::Child + Send + Sync>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    output: Arc<Mutex<Vec<u8>>>,
    offset: u64,
}
impl Drop for Login {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[tauri::command]
pub async fn agent_auth_start(
    state: State<'_, AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
    method_id: String,
) -> Result<(), String> {
    let process = connection(&state, &window, &connection_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let host = window.state::<AgentHostState>();
        let _guard = host
            .operations
            .try_lock()
            .map_err(|_| "智能体安装或配置正在更新，请稍后重试")?;
        if !process.live.load(std::sync::atomic::Ordering::Acquire) {
            return Err("智能体连接已失效，请重新连接".into());
        }
        let mut slot = process.login.lock().map_err(|_| "登录状态不可用")?;
        if slot.is_some() {
            return Err("已有登录正在进行".into());
        }
        let capabilities = process
            .capabilities
            .lock()
            .map_err(|_| "认证方式不可用")?
            .clone();
        let method = capabilities["authMethods"]
            .as_array()
            .and_then(|methods| {
                methods
                    .iter()
                    .find(|m| m["id"] == method_id && m["type"] == "terminal")
            })
            .ok_or("智能体未声明此终端认证方式")?;
        let pair = native_pty_system()
            .openpty(PtySize {
                rows: 22,
                cols: 78,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|_| "无法创建登录终端")?;
        let mut command = CommandBuilder::new(&process.profile.executable);
        command.args(&process.profile.args);
        command.args(catalog::string_args(&method["args"])?);
        command.cwd(&process.root);
        command.env_clear();
        for key in [
            "PATH",
            "HOME",
            "USERPROFILE",
            "APPDATA",
            "LOCALAPPDATA",
            "SystemRoot",
            "WINDIR",
            "TMPDIR",
            "TEMP",
            "TMP",
            "LANG",
            "SHELL",
        ] {
            if let Some(value) = std::env::var_os(key) {
                command.env(key, value);
            }
        }
        command.env("TERM", "xterm-256color");
        for (key, value) in &process.profile.env {
            command.env(key, value);
        }
        if let Some(env) = method["env"].as_object() {
            for (key, value) in env {
                if let Some(value) = value.as_str() {
                    command.env(key, value);
                }
            }
        }
        if let Some(proxy) = network::proxy() {
            command.env("HTTPS_PROXY", &proxy);
            command.env("HTTP_PROXY", &proxy);
        }
        for (name, value) in credentials::environment(&process.profile)? {
            command.env(name, value);
        }
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|_| "登录程序启动失败")?;
        drop(pair.slave);
        let writer = pair
            .master
            .take_writer()
            .map_err(|_| "登录终端输入不可用")?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|_| "登录终端输出不可用")?;
        let output = Arc::new(Mutex::new(Vec::new()));
        let buffer = output.clone();
        std::thread::spawn(move || {
            let mut bytes = [0u8; 8192];
            while let Ok(count) = reader.read(&mut bytes) {
                if count == 0 {
                    break;
                }
                let Ok(mut output) = buffer.lock() else {
                    break;
                };
                if output.len() + count > 2 * 1024 * 1024 {
                    break;
                }
                output.extend_from_slice(&bytes[..count]);
            }
        });
        *slot = Some(Login {
            child,
            writer: Arc::new(Mutex::new(writer)),
            master: pair.master,
            output,
            offset: 0,
        });
        Ok(())
    })
    .await
    .map_err(|_| "登录任务失败".to_string())?
}
#[tauri::command]
pub fn agent_auth_io(
    state: State<AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
    input: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    close: bool,
) -> Result<Value, String> {
    let process = connection(&state, &window, &connection_id)?;
    let mut slot = process.login.lock().map_err(|_| "登录状态不可用")?;
    if close {
        slot.take();
        return Ok(json!({}));
    }
    let consume = input.is_none() && cols.is_none() && rows.is_none();
    if let Some(input) = input {
        if input.len() > 64 * 1024 {
            return Err("终端输入过长".into());
        }
        let writer = slot.as_ref().ok_or("登录终端已关闭")?.writer.clone();
        // A blocked PTY write must not hold the lifecycle lock needed to kill it.
        drop(slot);
        {
            let mut writer = writer.lock().map_err(|_| "登录终端输入不可用")?;
            writer
                .write_all(input.as_bytes())
                .and_then(|_| writer.flush())
                .map_err(|_| "登录终端输入失败")?;
        }
        slot = process.login.lock().map_err(|_| "登录状态不可用")?;
    }
    let login = slot.as_mut().ok_or("登录终端已关闭")?;
    if let (Some(cols), Some(rows)) = (cols, rows) {
        login
            .master
            .resize(PtySize {
                cols: cols.clamp(20, 240),
                rows: rows.clamp(5, 100),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|_| "终端调整失败")?;
    }
    let buffer = login.output.lock().map_err(|_| "登录输出不可用")?;
    let bytes = &buffer[(login.offset as usize).min(buffer.len())..];
    // Base64 preserves partial UTF-8 sequences for xterm's incremental decoder.
    use base64::Engine;
    let data = if consume {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    } else {
        String::new()
    };
    if consume {
        login.offset = buffer.len() as u64;
    }
    let exit = login
        .child
        .try_wait()
        .map_err(|_| "登录状态读取失败")?
        .map(|s| s.exit_code());
    Ok(json!({"data":data,"exitCode":exit}))
}
