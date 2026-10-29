//! Window-bound access to a shared, local derived index. No renderer path grants access.
use crate::{commands::require_window, window_services::WindowServices};
use file_index::Workspace;
use knowledge_index::{GraphQuery, GraphSnapshot, IndexService, IndexStatus, ReferencePage};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap},
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};

struct Lease {
    workspace: String,
    key: String,
    request: String,
    active: bool,
}
struct Shared {
    service: Arc<IndexService>,
    policy: String,
}
struct Pending {
    workspace: String,
    request: String,
}
#[derive(Default)]
struct Inner {
    services: HashMap<String, Shared>,
    leases: HashMap<String, Lease>,
    pending: HashMap<String, Pending>,
}
impl Inner {
    fn refresh(&mut self, prune: bool) {
        self.services.retain(|key, entry| {
            let mut leased = false;
            let mut active = false;
            for lease in self.leases.values().filter(|lease| lease.key == *key) {
                leased = true;
                active |= lease.active;
            }
            entry.service.active(active);
            !prune || leased
        });
    }
}
#[derive(Default)]
pub(crate) struct KnowledgeHost(Mutex<Inner>);
pub(crate) struct Attachment<'a> {
    pub label: &'a str,
    pub workspace_id: &'a str,
    pub request: &'a str,
    pub workspace: Arc<Workspace>,
    pub directory: PathBuf,
    pub policy: String,
    pub document: knowledge_index::DocumentFilter,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Opened {
    key: String,
    status: IndexStatus,
}

fn authorized(window: &WebviewWindow, workspace: &str) -> Result<Arc<Workspace>, String> {
    require_window(window)?;
    let registry = window
        .state::<WindowServices>()
        .get_workspaces(window.label())?;
    let selected = registry
        .lock()
        .map_err(|_| "目录状态不可用")?
        .get(workspace)
        .map_err(|e| e.to_string())?;
    selected.display_root_binding().map_err(|e| e.to_string())?;
    Ok(selected)
}
fn identity(workspace: &Workspace) -> Result<String, String> {
    let bookmark = workspace.bookmark().map_err(|e| e.to_string())?;
    let value = serde_json::to_value(bookmark).map_err(|e| e.to_string())?;
    let identity = value.get("identity").ok_or("目录身份不可用")?;
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(identity).map_err(|e| e.to_string())?)
    ))
}
impl KnowledgeHost {
    pub(crate) fn release_workspace(&self, label: &str, workspace: &str) {
        if let Ok(mut inner) = self.0.lock() {
            if inner
                .leases
                .get(label)
                .is_some_and(|lease| lease.workspace == workspace)
            {
                inner.leases.remove(label);
            }
            if inner
                .pending
                .get(label)
                .is_some_and(|pending| pending.workspace == workspace)
            {
                inner.pending.remove(label);
            }
            inner.refresh(true);
        }
    }
    pub(crate) fn begin(&self, label: &str, workspace: &str, request: &str) -> Result<(), String> {
        if request.is_empty() || request.len() > 100 {
            return Err("图谱请求标识无效".into());
        }
        self.0.lock().map_err(|_| "图谱状态不可用")?.pending.insert(
            label.into(),
            Pending {
                workspace: workspace.into(),
                request: request.into(),
            },
        );
        Ok(())
    }
    pub(crate) fn attach(&self, attachment: Attachment<'_>) -> Result<Opened, String> {
        let Attachment {
            label,
            workspace_id,
            request,
            workspace,
            directory,
            policy,
            document,
        } = attachment;
        if request.len() > 100 || request.is_empty() {
            return Err("图谱请求标识无效".into());
        }
        let key = identity(&workspace)?;
        let root = workspace
            .display_root_snapshot()
            .map_err(|e| e.to_string())?;
        let mut inner = self.0.lock().map_err(|_| "图谱状态不可用")?;
        if !inner
            .pending
            .get(label)
            .is_some_and(|pending| pending.request == request && pending.workspace == workspace_id)
        {
            return Err("图谱打开请求已取消或替换".into());
        }
        if inner.services.get(&key).is_some_and(|entry| {
            entry.policy != policy
                || entry.service.root() != root
                || entry.service.status().error.is_some()
        }) {
            if let Some(old) = inner.services.remove(&key) {
                old.service.shutdown();
            }
        }
        if !inner.services.contains_key(&key) {
            // Idle entries carry no user state; the durable index remains available for reopening.
            if inner.services.len() >= 8 {
                let unused = inner
                    .services
                    .keys()
                    .find(|key| {
                        !inner
                            .leases
                            .values()
                            .any(|lease| &lease.key == *key && lease.active)
                    })
                    .cloned();
                if let Some(unused) = unused {
                    inner.services.remove(&unused);
                } else {
                    return Err("同时打开的图谱过多，请先关闭其他图谱".into());
                }
            }
            let service = IndexService::start(
                workspace,
                directory.join(&key),
                Arc::new(crate::platform::file_metadata::include_entry),
                document,
            )?;
            inner.services.insert(
                key.clone(),
                Shared {
                    service: Arc::new(service),
                    policy,
                },
            );
        }
        inner.leases.insert(
            label.into(),
            Lease {
                workspace: workspace_id.into(),
                key: key.clone(),
                request: request.into(),
                active: true,
            },
        );
        inner.refresh(false);
        let service = &inner.services.get(&key).ok_or("图谱索引尚未就绪")?.service;
        Ok(Opened {
            key,
            status: service.status(),
        })
    }
    fn get(
        &self,
        window: &WebviewWindow,
        workspace: &str,
        request: &str,
    ) -> Result<Arc<IndexService>, String> {
        let selected = authorized(window, workspace)?;
        let key = identity(&selected)?;
        let inner = self.0.lock().map_err(|_| "图谱状态不可用")?;
        let lease = inner
            .leases
            .get(window.label())
            .filter(|l| l.workspace == workspace && l.request == request && l.key == key)
            .ok_or("图谱会话已更换或关闭")?;
        let service = inner
            .services
            .get(&lease.key)
            .ok_or("图谱索引已释放")?
            .service
            .clone();
        if service.root()
            != selected
                .display_root_snapshot()
                .map_err(|e| e.to_string())?
        {
            return Err("目录已移动，请重新打开图谱".into());
        }
        Ok(service)
    }
    pub(crate) fn release(&self, label: &str) {
        if let Ok(mut inner) = self.0.lock() {
            inner.leases.remove(label);
            inner.pending.remove(label);
            inner.refresh(true);
        }
    }
}

#[tauri::command]
pub(crate) async fn knowledge_open(
    app: AppHandle,
    window: WebviewWindow,
    workspace_id: String,
    request_id: String,
) -> Result<Opened, String> {
    let selected = authorized(&window, &workspace_id)?;
    app.state::<KnowledgeHost>()
        .begin(window.label(), &workspace_id, &request_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let types = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(&app)?;
        let policy = format!("{:?}:{:?}", types.enabled_extensions(), types.disabled);
        let directory = crate::app_paths::local_data_dir(&app)?.join("knowledge/workspaces");
        let current = authorized(&window, &workspace_id)?;
        if !Arc::ptr_eq(&selected, &current) {
            return Err("目录会话已更换".into());
        }
        app.state::<KnowledgeHost>().attach(Attachment {
            label: window.label(),
            workspace_id: &workspace_id,
            request: &request_id,
            workspace: selected,
            directory,
            policy,
            document: Arc::new(move |name| types.allows(std::path::Path::new(name))),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) fn knowledge_status(
    window: WebviewWindow,
    host: State<'_, KnowledgeHost>,
    workspace_id: String,
    request_id: String,
) -> Result<IndexStatus, String> {
    Ok(host.get(&window, &workspace_id, &request_id)?.status())
}
#[tauri::command]
pub(crate) async fn knowledge_snapshot(
    window: WebviewWindow,
    workspace_id: String,
    request_id: String,
    query: GraphQuery,
) -> Result<GraphSnapshot, String> {
    let service = window
        .state::<KnowledgeHost>()
        .get(&window, &workspace_id, &request_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = service.snapshot(&query)?;
        window
            .state::<KnowledgeHost>()
            .get(&window, &workspace_id, &request_id)?;
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn knowledge_references(
    window: WebviewWindow,
    workspace_id: String,
    request_id: String,
    note: String,
    incoming: bool,
    offset: usize,
    destination: Option<String>,
) -> Result<ReferencePage, String> {
    let service = window
        .state::<KnowledgeHost>()
        .get(&window, &workspace_id, &request_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = knowledge_index::references_matching(
            &service.database,
            &note,
            incoming,
            offset,
            destination.as_deref(),
        )?;
        window
            .state::<KnowledgeHost>()
            .get(&window, &workspace_id, &request_id)?;
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) fn knowledge_active(
    window: WebviewWindow,
    host: State<'_, KnowledgeHost>,
    request_id: String,
    active: bool,
) -> Result<(), String> {
    require_window(&window)?;
    let mut inner = host.0.lock().map_err(|_| "图谱状态不可用")?;
    if !active
        && inner
            .pending
            .get(window.label())
            .is_some_and(|pending| pending.request == request_id)
    {
        inner.pending.remove(window.label());
    }
    if let Some(lease) = inner
        .leases
        .get_mut(window.label())
        .filter(|lease| lease.request == request_id)
    {
        lease.active = active;
    }
    inner.refresh(false);
    Ok(())
}
#[tauri::command]
pub(crate) fn knowledge_rebuild(
    window: WebviewWindow,
    host: State<'_, KnowledgeHost>,
    workspace_id: String,
    request_id: String,
) -> Result<(), String> {
    host.get(&window, &workspace_id, &request_id)?
        .reconcile(true);
    Ok(())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Position {
    x: f64,
    y: f64,
    /// Present only for positions produced by the 3D layout.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    z: Option<f64>,
    pinned: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Camera {
    x: f64,
    y: f64,
    ratio: f64,
}
/// Orbit camera of the 3D view: angles in radians, `x`/`y`/`z` is the point it looks at.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Camera3d {
    yaw: f64,
    pitch: f64,
    ratio: f64,
    x: f64,
    y: f64,
    z: f64,
}
/// Version 1 predates the 3D view; its missing fields read as the defaults of the frontend.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct View {
    version: u8,
    query: GraphQuery,
    positions: BTreeMap<String, Position>,
    camera: Option<Camera>,
    particles: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    camera3d: Option<Camera3d>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    auto_rotate: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    folder_colors: Option<bool>,
}
/// Largest orbit pitch the frontend produces, plus rounding slack.
const MAX_PITCH: f64 = 1.5 + 1e-6;
fn validate_view(view: &View) -> Result<(), String> {
    let finite = |v: f64| v.is_finite() && v.abs() <= 1e8;
    let ratio = |v: f64| v.is_finite() && (0.035..=20.0).contains(&v);
    if !(1..=2).contains(&view.version)
        || view.positions.len() > 5000
        || view.query.filter.len() > 256
        || view.query.folder.len() > 4096
        || view.query.tag.len() > 512
        || !(1..=2).contains(&view.query.depth)
        || !(1..=5000).contains(&view.query.limit)
        || view.query.focus.as_ref().is_some_and(|s| s.len() > 4096)
        || view.positions.iter().any(|(key, p)| {
            key.len() > 4096 || !finite(p.x) || !finite(p.y) || p.z.is_some_and(|z| !finite(z))
        })
        || view
            .camera
            .as_ref()
            .is_some_and(|c| !finite(c.x) || !finite(c.y) || !ratio(c.ratio))
        || view.camera3d.as_ref().is_some_and(|c| {
            !finite(c.yaw)
                || !finite(c.pitch)
                || c.pitch.abs() > MAX_PITCH
                || !finite(c.x)
                || !finite(c.y)
                || !finite(c.z)
                || !ratio(c.ratio)
        })
        || view
            .mode
            .as_ref()
            .is_some_and(|mode| mode != "2d" && mode != "3d")
    {
        return Err("图谱视图设置无效或超过预算".into());
    }
    Ok(())
}
const VIEW_BYTES: usize = 1024 * 1024;
fn encode_view(view: &View) -> Result<Vec<u8>, String> {
    validate_view(view)?;
    // Stop serialization at the same bound as imports/reads, including long UTF-8 paths.
    struct Buffer(Vec<u8>);
    impl std::io::Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if self.0.len().saturating_add(bytes.len()) > VIEW_BYTES {
                return Err(std::io::Error::other("图谱视图设置超过 1 MiB 预算"));
            }
            self.0.extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut buffer = Buffer(Vec::new());
    serde_json::to_writer(&mut buffer, view).map_err(|e| e.to_string())?;
    Ok(buffer.0)
}
#[tauri::command]
pub(crate) async fn knowledge_view(
    window: WebviewWindow,
    workspace_id: String,
    request_id: String,
) -> Result<Option<View>, String> {
    let service = window
        .state::<KnowledgeHost>()
        .get(&window, &workspace_id, &request_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let path = service.database.with_file_name("views.json");
        use std::io::Read;
        let file = match std::fs::File::open(&path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.to_string()),
        };
        if file.metadata().map_err(|e| e.to_string())?.len() > 1024 * 1024 {
            return Err("图谱视图设置超过读取预算".into());
        }
        let mut bytes = Vec::new();
        file.take(1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 1024 * 1024 {
            return Err("图谱视图设置超过读取预算".into());
        }
        let view: View = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        validate_view(&view)?;
        window
            .state::<KnowledgeHost>()
            .get(&window, &workspace_id, &request_id)?;
        Ok(Some(view))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn knowledge_save_view(
    window: WebviewWindow,
    workspace_id: String,
    request_id: String,
    view: View,
) -> Result<(), String> {
    let bytes = encode_view(&view)?;
    let service = window
        .state::<KnowledgeHost>()
        .get(&window, &workspace_id, &request_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;
        let path = service.database.with_file_name("views.json");
        let parent = path.parent().ok_or("图谱目录不可用")?;
        let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
        temp.write_all(&bytes).map_err(|e| e.to_string())?;
        temp.flush().map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        window
            .state::<KnowledgeHost>()
            .get(&window, &workspace_id, &request_id)?;
        temp.persist(path).map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn knowledge_anchor(
    window: WebviewWindow,
    workspace_id: String,
    request_id: String,
    note: String,
    fragment: String,
) -> Result<Option<knowledge_index::AnchorMatch>, String> {
    let service = window
        .state::<KnowledgeHost>()
        .get(&window, &workspace_id, &request_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = knowledge_index::anchor(&service.database, &note, &fragment)?;
        window
            .state::<KnowledgeHost>()
            .get(&window, &workspace_id, &request_id)?;
        Ok(result)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn knowledge_export_view(
    app: AppHandle,
    window: WebviewWindow,
    workspace_id: String,
    request_id: String,
    view: View,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let bytes = encode_view(&view)?;
    window
        .state::<KnowledgeHost>()
        .get(&window, &workspace_id, &request_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;
        let Some(path) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("导出图谱视图设置")
            .set_file_name("marklyra-graph-view.json")
            .add_filter("图谱视图", &["json"])
            .blocking_save_file()
        else {
            return Ok(false);
        };
        let path = path.into_path().map_err(|_| "无法读取导出位置")?;
        window
            .state::<KnowledgeHost>()
            .get(&window, &workspace_id, &request_id)?;
        let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("导出目录无效")?)
            .map_err(|e| e.to_string())?;
        temp.write_all(&bytes).map_err(|e| e.to_string())?;
        temp.flush().map_err(|e| e.to_string())?;
        temp.as_file().sync_all().map_err(|e| e.to_string())?;
        temp.persist(path).map_err(|e| e.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn knowledge_import_view(
    app: AppHandle,
    window: WebviewWindow,
    workspace_id: String,
    request_id: String,
) -> Result<Option<View>, String> {
    use tauri_plugin_dialog::DialogExt;
    window
        .state::<KnowledgeHost>()
        .get(&window, &workspace_id, &request_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let Some(path) = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("导入图谱视图设置")
            .add_filter("图谱视图", &["json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = path.into_path().map_err(|_| "无法读取导入位置")?;
        let mut bytes = Vec::new();
        std::fs::File::open(path)
            .map_err(|e| e.to_string())?
            .take(1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 1024 * 1024 {
            return Err("图谱视图设置超过 1 MiB 预算".into());
        }
        let view: View =
            serde_json::from_slice(&bytes).map_err(|_| "这不是有效的 MarkLyra 图谱视图设置")?;
        validate_view(&view)?;
        window
            .state::<KnowledgeHost>()
            .get(&window, &workspace_id, &request_id)?;
        Ok(Some(view))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn closing_old_workspace_preserves_new_pending_request_and_rejects_late_attach() {
        let notes = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let mut registry = file_index::WorkspaceRegistry::default();
        let selected = registry.select_authorized(notes.path()).unwrap();
        let workspace = registry.get(&selected.id).unwrap();
        let host = KnowledgeHost::default();
        let attach = |request| {
            host.attach(Attachment {
                label: "main",
                workspace_id: &selected.id,
                request,
                workspace: workspace.clone(),
                directory: data.path().into(),
                policy: "test".into(),
                document: Arc::new(|name| name.ends_with(".md")),
            })
        };
        host.begin("main", &selected.id, "old").unwrap();
        let opened = attach("old").unwrap();
        host.begin("main", "new-workspace", "new").unwrap();
        host.release_workspace("main", &selected.id);
        assert!(attach("old").is_err());
        {
            let inner = host.0.lock().unwrap();
            assert_eq!(inner.pending["main"].request, "new");
            assert!(!inner.leases.contains_key("main"));
            assert!(!inner.services.contains_key(&opened.key));
        }
        host.release_workspace("main", "new-workspace");
        assert!(host.0.lock().unwrap().pending.is_empty());
    }

    #[test]
    fn shared_workspace_retains_peer_lease_after_one_window_closes() {
        let notes = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let mut registry = file_index::WorkspaceRegistry::default();
        let selected = registry.select_authorized(notes.path()).unwrap();
        let workspace = registry.get(&selected.id).unwrap();
        let host = KnowledgeHost::default();
        for label in ["main", "editor-peer"] {
            host.begin(label, &selected.id, label).unwrap();
            host.attach(Attachment {
                label,
                workspace_id: &selected.id,
                request: label,
                workspace: workspace.clone(),
                directory: data.path().into(),
                policy: "test".into(),
                document: Arc::new(|name| name.ends_with(".md")),
            })
            .unwrap();
        }
        assert_eq!(host.0.lock().unwrap().services.len(), 1);
        host.release("main");
        assert_eq!(host.0.lock().unwrap().services.len(), 1);
        assert!(host.0.lock().unwrap().leases.contains_key("editor-peer"));
        host.release("editor-peer");
        assert!(host.0.lock().unwrap().services.is_empty());
    }

    #[test]
    fn saved_and_exported_views_fit_the_import_budget() {
        let mut view = View {
            version: 1,
            query: GraphQuery::default(),
            positions: BTreeMap::new(),
            camera: None,
            particles: false,
            mode: None,
            camera3d: None,
            auto_rotate: None,
            folder_colors: None,
        };
        let bytes = encode_view(&view).unwrap();
        validate_view(&serde_json::from_slice(&bytes).unwrap()).unwrap();
        for i in 0..400 {
            view.positions.insert(
                format!("{i}{}", "文".repeat(1000)),
                Position {
                    x: 1.0,
                    y: 2.0,
                    z: None,
                    pinned: true,
                },
            );
        }
        assert!(validate_view(&view).is_ok());
        assert!(encode_view(&view).unwrap_err().contains("1 MiB"));
        view.positions.clear();
        view.camera = Some(Camera {
            x: f64::NAN,
            y: 0.0,
            ratio: 1.0,
        });
        assert!(encode_view(&view).is_err());
        view.camera = Some(Camera {
            x: 0.0,
            y: 0.0,
            ratio: 1e-300,
        });
        assert!(encode_view(&view).is_err());
    }

    #[test]
    fn views_round_trip_with_and_without_the_3d_fields() {
        // A version 1 file written before the 3D view still loads and keeps its shape.
        let legacy = r#"{"version":1,"query":{"focus":null,"depth":1,"filter":"","folder":"","tag":"","showMissing":true,"showOrphans":true,"limit":2000},"positions":{"a.md":{"x":1,"y":2,"pinned":false}},"camera":{"x":0.5,"y":0.5,"ratio":1},"particles":false}"#;
        let view: View = serde_json::from_str(legacy).unwrap();
        validate_view(&view).unwrap();
        assert!(view.mode.is_none() && view.camera3d.is_none());
        let bytes = encode_view(&view).unwrap();
        let text = String::from_utf8(bytes).unwrap();
        assert!(!text.contains("camera3d") && !text.contains("\"z\""));

        let modern = legacy
            .replace("\"version\":1", "\"version\":2")
            .replace(
                "\"x\":1,\"y\":2,",
                "\"x\":1,\"y\":2,\"z\":3,",
            )
            .replace(
                "\"particles\":false}",
                "\"particles\":false,\"mode\":\"3d\",\"autoRotate\":true,\"folderColors\":false,\"camera3d\":{\"yaw\":0.5,\"pitch\":0.3,\"ratio\":1,\"x\":0,\"y\":0,\"z\":0}}",
            );
        let view: View = serde_json::from_str(&modern).unwrap();
        validate_view(&view).unwrap();
        let round: View = serde_json::from_slice(&encode_view(&view).unwrap()).unwrap();
        assert_eq!(round.mode.as_deref(), Some("3d"));
        assert_eq!(round.positions["a.md"].z, Some(3.0));
        assert_eq!(round.auto_rotate, Some(true));
        assert_eq!(round.folder_colors, Some(false));
    }

    #[test]
    fn invalid_3d_view_fields_are_rejected() {
        let base = r#"{"version":2,"query":{"focus":null,"depth":1,"filter":"","folder":"","tag":"","showMissing":true,"showOrphans":true,"limit":2000},"positions":{},"camera":null,"particles":false,"mode":"3d","camera3d":{"yaw":0,"pitch":0,"ratio":1,"x":0,"y":0,"z":0}}"#;
        validate_view(&serde_json::from_str::<View>(base).unwrap()).unwrap();
        for bad in [
            base.replace("\"version\":2", "\"version\":3"),
            base.replace("\"mode\":\"3d\"", "\"mode\":\"4d\""),
            base.replace("\"pitch\":0", "\"pitch\":3"),
            base.replace("\"ratio\":1,\"x\"", "\"ratio\":1e-300,\"x\""),
            base.replace("\"yaw\":0", "\"yaw\":1e300"),
            base.replace(
                "\"positions\":{}",
                "\"positions\":{\"a.md\":{\"x\":0,\"y\":0,\"z\":1e300,\"pinned\":false}}",
            ),
        ] {
            let parsed = serde_json::from_str::<View>(&bad);
            assert!(
                parsed.map_or(true, |view| validate_view(&view).is_err()),
                "accepted {bad}"
            );
        }
        // Unknown fields stay rejected so a damaged file never loads half-understood.
        assert!(serde_json::from_str::<View>(
            &base.replace("\"particles\"", "\"extra\":1,\"particles\"")
        )
        .is_err());
    }
}
