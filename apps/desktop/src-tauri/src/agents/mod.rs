//! Adapted and modified for MarkLyra from Markune (Apache-2.0).
//! License and provenance: licenses/agents/README.md and markune-Apache-2.0.txt.
pub mod attachments;
pub mod auth;
mod catalog;
mod support;
use support::*;
mod client_tools;
mod context;
mod credentials;
mod document_tools;
mod editor_document;
mod history;
pub mod image_preview;
mod install_task;
mod network;
mod profiles;
use install_task::InstallTask;
pub mod mcp;
pub mod process;
pub use mcp::proxy_main;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use uuid::Uuid;

const MAX_FRAME: usize = 8 * 1024 * 1024;
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AgentProfile {
    pub id: String,
    pub agent_id: String,
    pub name: String,
    pub executable: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: BTreeMap<String, String>,
    #[serde(default)]
    pub secret_keys: Vec<String>,
    pub version: Option<String>,
    pub managed_path: Option<String>,
    #[serde(default)]
    pub mcp_enabled: bool,
    #[serde(default = "yes")]
    pub enabled: bool,
}
fn yes() -> bool {
    true
}
#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentSettings {
    profiles: Vec<AgentProfile>,
    default_profile_id: Option<String>,
}
struct ProgramGrant {
    path: PathBuf,
    owner: String,
    created: std::time::Instant,
}
#[derive(Default)]
pub struct AgentHostState {
    operations: Mutex<()>,
    image_previews: Mutex<Vec<image_preview::PreviewCopy>>,
    install_task: Mutex<Option<Arc<InstallTask>>>,
    leases: Arc<Mutex<HashMap<String, String>>>,
    connections: Mutex<HashMap<String, Arc<process::AgentProcess>>>,
    selected_programs: Mutex<HashMap<String, ProgramGrant>>,
    mcp_pending: Mutex<HashMap<String, mcp::PendingTool>>,
}
impl AgentHostState {
    pub fn shutdown_window(&self, label: &str) {
        if let Ok(mut copies) = self.image_previews.lock() {
            copies.retain(|copy| copy.owner != label);
        }
        if let Ok(job) = self.install_task.lock() {
            if let Some(task) = job.as_ref().filter(|task| {
                task.window
                    .as_ref()
                    .is_some_and(|window| window.label() == label)
            }) {
                task.cancel();
            }
        }
        if let Ok(mut all) = self.connections.lock() {
            all.retain(|_, process| {
                if process.owner == label {
                    process.stop();
                    false
                } else {
                    true
                }
            });
        }
    }
    pub fn shutdown(&self) {
        if let Ok(mut copies) = self.image_previews.lock() {
            copies.clear();
        }
        if let Ok(job) = self.install_task.lock() {
            if let Some(task) = job.as_ref() {
                task.cancel();
            }
        }
        if let Ok(mut all) = self.connections.lock() {
            for process in all.values() {
                process.stop();
            }
            all.clear();
        }
    }
}
impl Drop for AgentHostState {
    fn drop(&mut self) {
        self.shutdown();
    }
}
fn storage(app: &AppHandle) -> Result<PathBuf, String> {
    let root = crate::app_paths::data_dir(app)?.join("agents");
    fs::create_dir_all(&root).map_err(|_| "无法创建智能体数据目录")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
            .map_err(|_| "无法保护智能体数据目录")?;
    }
    root.canonicalize()
        .map_err(|_| "智能体数据目录不可用".into())
}
fn read_json(path: &Path) -> Result<Value, String> {
    let mut bytes = Vec::new();
    let metadata = fs::symlink_metadata(path).map_err(|_| "记录不存在")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > 16 * 1024 * 1024
    {
        return Err("记录类型或大小无效".into());
    }
    fs::File::open(path)
        .map_err(|_| "无法读取记录")?
        .take(16 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "无法读取记录")?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("记录过大".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "记录内容损坏".into())
}
fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建记录目录")?;
    }
    let text = serde_json::to_string_pretty(value).map_err(|_| "无法编码记录")?;
    if text.len() > 16 * 1024 * 1024 {
        return Err("记录超过大小限制".into());
    }
    write_text_atomic(path, &text).map_err(|_| "无法保存记录")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|_| "无法保护记录")?;
    }
    Ok(())
}
fn settings(root: &Path) -> Result<AgentSettings, String> {
    let path = root.join("profiles.json");
    if !path.exists() {
        return Ok(AgentSettings::default());
    }
    serde_json::from_value(read_json(&path)?).map_err(|_| "智能体配置损坏，请保留文件并检查".into())
}
fn save_settings(root: &Path, value: &AgentSettings) -> Result<(), String> {
    write_json(
        &root.join("profiles.json"),
        &serde_json::to_value(value).map_err(|_| "无法编码配置")?,
    )
}
fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn hash_json(value: &Value) -> String {
    sha256(serde_json::to_string(value).unwrap_or_default().as_bytes())
}
fn safe_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
fn command(program: &Path, args: &[String]) -> Command {
    #[cfg(windows)]
    let mut process = {
        use std::os::windows::process::CommandExt;
        let mut p = Command::new(program);
        p.creation_flags(0x08000000 | 0x00000200);
        p
    };
    #[cfg(not(windows))]
    let mut process = Command::new(program);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        process.process_group(0);
    }
    let inherited = [
        "PATH",
        "HOME",
        "USERPROFILE",
        "APPDATA",
        "LOCALAPPDATA",
        "SystemRoot",
        "WINDIR",
        "TEMP",
        "TMP",
        "TMPDIR",
        "LANG",
        "LC_ALL",
        "TERM",
        "COMSPEC",
        "SHELL",
        "SSL_CERT_FILE",
        "SSL_CERT_DIR",
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "no_proxy",
        "ALL_PROXY",
        "all_proxy",
        "NODE_EXTRA_CA_CERTS",
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "DBUS_SESSION_BUS_ADDRESS",
        "XDG_RUNTIME_DIR",
        "XDG_CONFIG_HOME",
        "XDG_DATA_HOME",
        "XDG_CACHE_HOME",
    ];
    process.env_clear();
    for key in inherited {
        if let Some(value) = std::env::var_os(key) {
            process.env(key, value);
        }
    }
    network::apply(&mut process);
    process.args(args);
    process
}
fn kill_tree(child: &mut Child) {
    #[cfg(unix)]
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill.exe")
            .creation_flags(0x08000000)
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}
fn profile(root: &Path, id: &str) -> Result<AgentProfile, String> {
    settings(root)?
        .profiles
        .into_iter()
        .find(|p| p.id == id && p.enabled)
        .ok_or("智能体未安装或已停用".into())
}
fn connection(
    state: &AgentHostState,
    window: &WebviewWindow,
    id: &str,
) -> Result<Arc<process::AgentProcess>, String> {
    crate::commands::require_window(window)?;
    state
        .connections
        .lock()
        .map_err(|_| "连接状态不可用")?
        .get(id)
        .filter(|p| p.owner == window.label())
        .cloned()
        .ok_or("智能体连接已关闭".into())
}

#[tauri::command]
pub async fn agent_catalog(
    app: AppHandle,
    window: WebviewWindow,
    refresh: bool,
) -> Result<Value, String> {
    require_manager(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = storage(&app)?;
        let state = app.state::<AgentHostState>();
        let _guard = if refresh {
            Some(
                state
                    .operations
                    .try_lock()
                    .map_err(|_| "已有安装或配置操作进行中")?,
            )
        } else {
            None
        };
        let mut value = catalog::read_catalog(&root, refresh)?;
        let saved = settings(&root)?;
        value["profiles"] =
            serde_json::to_value(saved.profiles).map_err(|_| "无法编码智能体配置")?;
        value["defaultProfileId"] = json!(saved.default_profile_id);
        value["localAgents"] = json!(catalog::discover());
        Ok(value)
    })
    .await
    .map_err(|_| "读取智能体目录失败".to_string())?
}
#[tauri::command]
pub async fn agent_install(
    app: AppHandle,
    window: WebviewWindow,
    agent_id: String,
    catalog_digest: String,
) -> Result<AgentProfile, String> {
    require_manager(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgentHostState>();
        let _guard = state
            .operations
            .try_lock()
            .map_err(|_| "已有安装或配置操作进行中，请稍后重试")?;
        let root = storage(&app)?;
        let task = Arc::new(InstallTask::new(window, agent_id.clone()));
        *state.install_task.lock().map_err(|_| "安装状态不可用")? = Some(task.clone());
        let outcome = catalog::install(&root, &agent_id, &catalog_digest, &task);
        task.finish_child();
        let outcome = outcome.and_then(|installed| {
            let committed = (|| {
                task.check()?;
                let mut saved = settings(&root)?;
                saved.default_profile_id = Some(installed.id.clone());
                saved.profiles.push(installed.clone());
                save_settings(&root, &saved)
            })();
            if let Err(error) = committed {
                if let Some(path) = &installed.managed_path {
                    let path = Path::new(path);
                    if path.starts_with(root.join("installations")) {
                        let _ = fs::remove_dir_all(path);
                    }
                }
                return Err(error);
            }
            let _ = app.emit("marklyra:agents-changed", ());
            Ok(installed)
        });
        task.progress(if outcome.is_ok() {
            "安装完成"
        } else {
            "安装未完成"
        });
        *state.install_task.lock().map_err(|_| "安装状态不可用")? = None;
        outcome
    })
    .await
    .map_err(|_| "智能体安装任务失败".to_string())?
}
#[tauri::command]
pub async fn agent_use_local(
    app: AppHandle,
    window: WebviewWindow,
    agent_id: String,
) -> Result<AgentProfile, String> {
    require_manager(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = storage(&app)?;
        let candidate = catalog::discover()
            .into_iter()
            .find(|item| item["agentId"] == agent_id)
            .ok_or("没有检测到此智能体，请先安装 CLI")?;
        let catalog = catalog::read_catalog(&root, false)?;
        let name = catalog["agents"]
            .as_array()
            .and_then(|items| items.iter().find(|item| item["id"] == agent_id))
            .and_then(|item| item["name"].as_str())
            .unwrap_or(&agent_id);
        let installed = AgentProfile {
            id: Uuid::new_v4().to_string(),
            agent_id: agent_id.clone(),
            name: name.into(),
            executable: candidate["executable"]
                .as_str()
                .ok_or("程序路径无效")?
                .into(),
            args: catalog::string_args(&candidate["args"])?,
            env: BTreeMap::new(),
            secret_keys: vec![],
            version: None,
            managed_path: None,
            mcp_enabled: true,
            enabled: true,
        };
        let state = app.state::<AgentHostState>();
        let _guard = state.operations.lock().map_err(|_| "配置锁不可用")?;
        let mut saved = settings(&root)?;
        saved.default_profile_id = Some(installed.id.clone());
        saved.profiles.push(installed.clone());
        save_settings(&root, &saved)?;
        let _ = app.emit("marklyra:agents-changed", ());
        Ok(installed)
    })
    .await
    .map_err(|_| "添加本机智能体失败".to_string())?
}
#[tauri::command]
pub async fn agent_select_program(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Option<Value>, String> {
    require_manager(&window)?;
    use tauri_plugin_dialog::DialogExt;
    let selected = app
        .dialog()
        .file()
        .set_title("选择 ACP 智能体启动程序")
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "请选择本地程序")?
        .canonicalize()
        .map_err(|_| "程序路径不可用")?;
    if !path.is_file() {
        return Err("请选择普通程序文件".into());
    }
    let token = Uuid::new_v4().to_string();
    app.state::<AgentHostState>()
        .selected_programs
        .lock()
        .map_err(|_| "程序选择状态不可用")?
        .insert(
            token.clone(),
            ProgramGrant {
                path: path.clone(),
                owner: window.label().into(),
                created: std::time::Instant::now(),
            },
        );
    Ok(Some(json!({"grantId":token,"path":path})))
}
#[tauri::command]
pub async fn agent_save_profile(
    app: AppHandle,
    window: WebviewWindow,
    mut value: AgentProfile,
    program_grant: Option<String>,
) -> Result<AgentProfile, String> {
    require_manager(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgentHostState>();
        let _guard = state.operations.lock().map_err(|_| "配置锁不可用")?;
        let root = storage(&app)?;
        let mut saved = settings(&root)?;
        if value.name.trim().is_empty()
            || value.name.len() > 120
            || value.args.len() > 64
            || value.env.len() > 64
            || value.secret_keys.len() > 16
        {
            return Err("智能体配置大小无效".into());
        }
        catalog::string_args(&json!(value.args))?;
        for (key, val) in &value.env {
            if key.is_empty()
                || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
                || val.len() > 8192
                || val.contains('\0')
                || ["KEY", "TOKEN", "SECRET", "PASSWORD", "CREDENTIAL"]
                    .iter()
                    .any(|part| key.to_uppercase().contains(part))
            {
                return Err("敏感环境变量请使用凭据字段".into());
            }
        }
        if let Some(grant) = program_grant {
            value.executable = state
                .selected_programs
                .lock()
                .map_err(|_| "程序选择状态不可用")?
                .remove(&grant)
                .filter(|grant| {
                    grant.owner == window.label()
                        && grant.created.elapsed() < std::time::Duration::from_secs(300)
                })
                .ok_or("程序选择已失效")?
                .path
                .to_string_lossy()
                .into();
            value.managed_path = None;
            value.version = None;
        } else {
            let previous = saved
                .profiles
                .iter()
                .find(|p| p.id == value.id)
                .ok_or("请通过选择器授权启动程序")?;
            if previous.executable != value.executable
                || previous.managed_path != value.managed_path
            {
                return Err("不能通过配置替换受管程序路径".into());
            }
        }
        // Secret references are owned by credential transactions, not stale UI snapshots.
        credentials::preserve_references(&saved, &mut value);
        if !safe_id(&value.id) {
            value.id = Uuid::new_v4().to_string();
        }
        if !safe_id(&value.agent_id) {
            return Err("智能体标识无效".into());
        }
        if !value.enabled {
            if let Ok(all) = state.connections.lock() {
                for process in all.values().filter(|p| p.profile.id == value.id) {
                    process.stop();
                }
            }
        }
        saved.profiles.retain(|p| p.id != value.id);
        saved.profiles.push(value.clone());
        if saved.default_profile_id.is_none() {
            saved.default_profile_id = Some(value.id.clone());
        }
        save_settings(&root, &saved)?;
        let _ = app.emit("marklyra:agents-changed", ());
        Ok(value)
    })
    .await
    .map_err(|_| "保存智能体配置失败".to_string())?
}
#[tauri::command]
pub async fn agent_set_secret(
    app: AppHandle,
    window: WebviewWindow,
    profile_id: String,
    name: String,
    value: Option<String>,
) -> Result<(), String> {
    require_manager(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        credentials::validate(&name, value.as_deref())?;
        let state = app.state::<AgentHostState>();
        let _guard = state
            .operations
            .try_lock()
            .map_err(|_| "已有安装或配置操作进行中，请稍后重试")?;
        let root = storage(&app)?;
        credentials::update(&root, &profile_id, &name, value.as_deref())?;
        credentials::revoke_connections(&state, &profile_id)?;
        let _ = app.emit("marklyra:agents-changed", ());
        Ok(())
    })
    .await
    .map_err(|_| "凭据存储任务失败".to_string())?
}
#[tauri::command]
pub async fn agent_uninstall(
    app: AppHandle,
    window: WebviewWindow,
    profile_id: String,
) -> Result<(), String> {
    require_manager(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AgentHostState>();
        let _guard = state.operations.lock().map_err(|_| "配置锁不可用")?;
        if state
            .connections
            .lock()
            .map_err(|_| "连接状态不可用")?
            .values()
            .any(|p| {
                p.profile.id == profile_id && p.live.load(std::sync::atomic::Ordering::Acquire)
            })
        {
            return Err("请先断开此智能体的活动会话".into());
        }
        let root = storage(&app)?;
        let result = profiles::uninstall(&root, &profile_id);
        let _ = app.emit("marklyra:agents-changed", ());
        result
    })
    .await
    .map_err(|_| "卸载智能体失败".to_string())?
}

#[tauri::command]
pub async fn agent_connect(
    app: AppHandle,
    window: WebviewWindow,
    profile_id: String,
    workspace_id: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        process::connect(&app, &window, &profile_id, &workspace_id)
    })
    .await
    .map_err(|_| "连接智能体失败".to_string())?
}
#[tauri::command]
pub fn agent_send(
    state: State<AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
    message: Value,
) -> Result<(), String> {
    connection(&state, &window, &connection_id)?.send(message)
}
#[tauri::command]
pub fn agent_disconnect(
    state: State<AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
) -> Result<(), String> {
    let item = connection(&state, &window, &connection_id)?;
    item.stop();
    state
        .connections
        .lock()
        .map_err(|_| "连接状态不可用")?
        .remove(&connection_id);
    Ok(())
}
#[tauri::command]
pub async fn agent_client_operation(
    state: State<'_, AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
    request_id: Value,
    method: String,
    params: Value,
) -> Result<Value, String> {
    let item = connection(&state, &window, &connection_id)?;
    item.claim_request(&request_id, &method, &params)?;
    tauri::async_runtime::spawn_blocking(move || client_tools::execute(&item, &method, params))
        .await
        .map_err(|_| "智能体客户端操作失败".to_string())?
}

#[tauri::command]
pub async fn agent_history(
    app: AppHandle,
    window: WebviewWindow,
    root_path: String,
) -> Result<Vec<Value>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = authorize_root(&window, &root_path)?;
        history::list(&storage(&app)?, &root)
    })
    .await
    .map_err(|_| "读取会话列表失败".to_string())?
}
#[tauri::command]
pub async fn agent_read_session(
    app: AppHandle,
    window: WebviewWindow,
    root_path: String,
    id: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !safe_id(&id) {
            return Err("会话标识无效".into());
        }
        let record = read_json(&storage(&app)?.join("sessions").join(format!("{id}.json")))?;
        let root = authorize_root(&window, &root_path)?;
        if record["rootPath"] != root.to_string_lossy().as_ref() {
            return Err("会话不属于当前工作区".into());
        }
        Ok(record)
    })
    .await
    .map_err(|_| "读取会话失败".to_string())?
}
#[tauri::command]
pub async fn agent_save_session(
    app: AppHandle,
    window: WebviewWindow,
    record: Value,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        authorize_root(&window, record["rootPath"].as_str().ok_or("缺少工作区")?)?;
        history::save(&storage(&app)?, &record)
    })
    .await
    .map_err(|_| "保存会话失败".to_string())?
}

#[tauri::command]
pub fn agent_cancel_install(
    state: State<AgentHostState>,
    window: WebviewWindow,
    agent_id: String,
) -> Result<(), String> {
    let jobs = state.install_task.lock().map_err(|_| "安装状态不可用")?;
    let task = jobs
        .as_ref()
        .filter(|task| {
            task.agent_id == agent_id
                && task
                    .window
                    .as_ref()
                    .is_some_and(|owner| owner.label() == window.label())
        })
        .ok_or("没有此窗口发起的安装任务")?;
    task.cancel();
    Ok(())
}

#[tauri::command]
pub fn agent_install_status(
    state: State<AgentHostState>,
    window: WebviewWindow,
) -> Result<Option<Value>, String> {
    let jobs = state.install_task.lock().map_err(|_| "安装状态不可用")?;
    jobs.as_ref().filter(|task|task.window.as_ref().is_some_and(|owner|owner.label()==window.label())).map(|task|Ok(json!({"agentId":task.agent_id,"phase":*task.phase.lock().map_err(|_|"安装状态不可用")?}))).transpose()
}

#[tauri::command]
pub async fn agent_manage_session(
    app: AppHandle,
    window: WebviewWindow,
    root_path: String,
    id: String,
    action: String,
    title: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = authorize_root(&window, &root_path)?;
        if !safe_id(&id) {
            return Err("会话标识无效".into());
        }
        let data = storage(&app)?;
        let path = data.join("sessions").join(format!("{id}.json"));
        let lock = document_save_lock(&path);
        let _guard = lock.lock().map_err(|_| "会话写入锁不可用")?;
        let mut record = read_json(&path)?;
        if record["rootPath"] != root.to_string_lossy().as_ref() {
            return Err("会话不属于当前工作区".into());
        }
        let index = data
            .join("session-index")
            .join(hash_json(&json!(root)))
            .join(format!("{id}.json"));
        let state = app.state::<AgentHostState>();
        if state
            .connections
            .lock()
            .map_err(|_| "连接状态不可用")?
            .values()
            .any(|process| {
                process.live.load(std::sync::atomic::Ordering::Acquire)
                    && process.profile.id == record["profileId"]
                    && process.root == root
                    && process.sessions.lock().is_ok_and(|sessions| {
                        sessions.iter().any(|id| record["providerSessionId"] == *id)
                    })
            })
        {
            return Err("此会话仍在一个窗口中连接，请先断开再管理历史".into());
        }
        if action == "delete" {
            if record["archived"] != true {
                return Err("只能彻底移除已归档会话".into());
            }
            write_json(
                &data.join("deleted-sessions").join(format!("{id}.json")),
                &json!({"id":id}),
            )?;
            let attachment_directory = attachments::directory(&data, &id)?;
            if attachment_directory.exists() {
                fs::remove_dir_all(&attachment_directory)
                    .map_err(|_| "无法移除会话附件，请重试")?;
            }
            fs::remove_file(&path).map_err(|_| "无法移除会话记录")?;
            let proof = data.join("ownership").join(format!(
                "{}.json",
                hash_json(&json!([
                    record["profileId"],
                    root,
                    record["providerSessionId"]
                ]))
            ));
            if proof.exists() {
                fs::remove_file(proof).map_err(|_| "无法移除会话归属记录")?;
            }
            if index.exists() {
                fs::remove_file(index).map_err(|_| "无法移除会话索引")?;
            }
            return Ok(());
        }
        if action == "rename" {
            let title = title.as_deref().unwrap_or("").trim();
            if title.is_empty() || title.chars().count() > 120 {
                return Err("标题须为 1–120 个字符".into());
            }
            record["title"] = json!(title);
            record["titleEdited"] = json!(true);
        } else if action == "archive" || action == "restore" {
            record["archived"] = json!(action == "archive");
        } else {
            return Err("未知的会话操作".into());
        }
        let previous_time = record["updatedAt"].as_u64().unwrap_or(0);
        record["updatedAt"] = json!(std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "系统时间无效")?
            .as_millis() as u64);
        record["updatedAt"] = json!(record["updatedAt"]
            .as_u64()
            .unwrap_or(0)
            .max(previous_time.saturating_add(1)));
        write_json(&path, &record)?;
        record.as_object_mut().ok_or("会话无效")?.remove("messages");
        write_json(&index, &record)
    })
    .await
    .map_err(|_| "会话管理任务失败".to_string())?
}

#[tauri::command]
pub fn agent_prepare_scope(
    app: AppHandle,
    window: WebviewWindow,
    workspace_id: Option<String>,
) -> Result<file_index::WorkspacePayload, String> {
    crate::commands::require_window(&window)?;
    if let Some(id) = workspace_id {
        return authorized_workspace(&window, &id)?
            .metadata(&id)
            .map_err(|e| e.to_string());
    }
    let registry = window
        .state::<crate::window_services::WindowServices>()
        .get_workspaces(window.label())?;
    let root = crate::app_paths::data_dir(&app)?.join("ai-drafts");
    fs::create_dir_all(&root).map_err(|_| "无法创建 AI 草稿目录")?;
    let mut registry = registry.lock().map_err(|_| "工作区不可用")?;
    for id in registry.ids() {
        let workspace = registry.get(&id).map_err(|e| e.to_string())?;
        if workspace
            .display_root_snapshot()
            .map_err(|e| e.to_string())?
            == root
        {
            let mut value = workspace.metadata(&id).map_err(|e| e.to_string())?;
            value.name = "AI 草稿".into();
            return Ok(value);
        }
    }
    let mut value = registry
        .select_authorized(&root)
        .map_err(|e| e.to_string())?;
    value.name = "AI 草稿".into();
    Ok(value)
}

#[cfg(test)]
pub mod native_fixture;
