//! Window-authorized access to the workspace task store. The renderer only names a workspace
//! id; the directory is the host-resolved `.marklyra/tasks` below that authorized root.
use crate::knowledge::{authorized, identity};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};
use task_store::{Detail, Mutation, MutationResult, Snapshot, TaskStore};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

pub(crate) const CHANGED: &str = "marklyra:tasks-changed";

struct Entry {
    store: Mutex<Option<TaskStore>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}
#[derive(Default)]
pub(crate) struct TasksHost(Mutex<HashMap<String, Arc<Entry>>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Changed {
    generation: u64,
}

fn entry(
    window: &WebviewWindow,
    workspace_id: &str,
) -> Result<(Arc<Entry>, Arc<file_index::Workspace>), String> {
    let workspace = authorized(window, workspace_id)?;
    Ok((entry_for(window.app_handle(), &workspace)?, workspace))
}
fn entry_for(
    app: &AppHandle,
    workspace: &Arc<file_index::Workspace>,
) -> Result<Arc<Entry>, String> {
    let key = identity(workspace)?;
    let host = app.state::<TasksHost>();
    let mut map = host.0.lock().map_err(|_| "任务状态不可用")?;
    let entry = map
        .entry(key)
        .or_insert_with(|| {
            Arc::new(Entry {
                store: Mutex::new(None),
                watcher: Mutex::new(None),
            })
        })
        .clone();
    Ok(entry)
}

/// The store for a workspace the caller already holds (AI tools run inside an authorized
/// agent session). `f` returns whether it wrote, so open windows refresh.
pub(crate) fn with_store<T>(
    app: &AppHandle,
    workspace: &Arc<file_index::Workspace>,
    create: bool,
    f: impl FnOnce(&mut TaskStore) -> Result<(T, bool), String>,
) -> Result<T, String> {
    let entry = entry_for(app, workspace)?;
    ensure(app, &entry, workspace, create)?;
    let (value, wrote, generation) = {
        let mut store = entry.store.lock().map_err(|_| "任务状态不可用")?;
        let store = store.as_mut().ok_or("这个文件夹还没有任务")?;
        store.refresh().map_err(|e| e.to_string())?;
        let (value, wrote) = f(store)?;
        (value, wrote, store.generation())
    };
    if wrote {
        let _ = app.emit(CHANGED, Changed { generation });
    }
    Ok(value)
}

/// Whether the workspace already has a task folder; never creates one.
pub(crate) fn has_store(
    app: &AppHandle,
    workspace: &Arc<file_index::Workspace>,
) -> Result<bool, String> {
    let entry = entry_for(app, workspace)?;
    ensure(app, &entry, workspace, false)?;
    let present = entry.store.lock().map_err(|_| "任务状态不可用")?.is_some();
    Ok(present)
}

/// Today's local date and the current instant, as task queries expect them.
pub(crate) fn local_today() -> (String, i64) {
    let now = chrono::Local::now();
    (now.format("%Y-%m-%d").to_string(), now.timestamp())
}

/// Opens (or with `create`, initializes) the store and starts watching it once.
fn ensure(
    app: &AppHandle,
    entry: &Arc<Entry>,
    workspace: &file_index::Workspace,
    create: bool,
) -> Result<(), String> {
    let mut store = entry.store.lock().map_err(|_| "任务状态不可用")?;
    if store.is_some() {
        return Ok(());
    }
    let Some(dir) = workspace
        .task_directory(create)
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    *store = Some(
        if create {
            TaskStore::initialize(dir)
        } else {
            TaskStore::open(dir)
        }
        .map_err(|e| e.to_string())?,
    );
    drop(store);
    let path = workspace
        .display_root_snapshot()
        .map_err(|e| e.to_string())?
        .join(".marklyra")
        .join("tasks");
    let (send, receive) = mpsc::channel::<()>();
    let watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if event.is_ok_and(|e| {
            !e.paths.iter().all(|p| {
                p.file_name()
                    .is_some_and(|n| n.to_string_lossy().ends_with(".tmp"))
            })
        }) {
            let _ = send.send(());
        }
    })
    .and_then(|mut w| w.watch(&path, RecursiveMode::Recursive).map(|_| w));
    // Without a watcher the app still refreshes on focus and after its own writes.
    if let Ok(watcher) = watcher {
        *entry.watcher.lock().map_err(|_| "任务状态不可用")? = Some(watcher);
        let weak = Arc::downgrade(entry);
        let app = app.clone();
        std::thread::Builder::new()
            .name("marklyra-tasks-watch".into())
            .spawn(move || {
                while receive.recv().is_ok() {
                    // Coalesce bursts (atomic renames emit several events).
                    while receive.recv_timeout(Duration::from_millis(180)).is_ok() {}
                    let Some(entry) = weak.upgrade() else { break };
                    let changed = entry.store.lock().ok().and_then(|mut s| {
                        s.as_mut()
                            .and_then(|s| s.refresh().ok().filter(|c| *c).map(|_| s.generation()))
                    });
                    if let Some(generation) = changed {
                        let _ = app.emit(CHANGED, Changed { generation });
                    }
                }
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> impl std::future::Future<Output = Result<T, String>> {
    let handle = tauri::async_runtime::spawn_blocking(task);
    async move { handle.await.map_err(|e| e.to_string())? }
}

#[tauri::command]
pub(crate) async fn tasks_snapshot(
    window: WebviewWindow,
    workspace_id: String,
) -> Result<Snapshot, String> {
    let (entry, workspace) = entry(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || {
        ensure(&app, &entry, &workspace, false)?;
        let mut store = entry.store.lock().map_err(|_| "任务状态不可用")?;
        Ok(match store.as_mut() {
            Some(store) => {
                store.refresh().map_err(|e| e.to_string())?;
                store.snapshot()
            }
            None => Snapshot::empty(),
        })
    })
    .await
}

#[tauri::command]
pub(crate) async fn tasks_mutate(
    window: WebviewWindow,
    workspace_id: String,
    mutation: Mutation,
) -> Result<MutationResult, String> {
    let (entry, workspace) = entry(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || {
        ensure(&app, &entry, &workspace, true)?;
        let result = {
            let mut store = entry.store.lock().map_err(|_| "任务状态不可用")?;
            store
                .as_mut()
                .ok_or("任务目录不可用")?
                .apply(mutation)
                .map_err(|e| e.to_string())?
        };
        let _ = app.emit(
            CHANGED,
            Changed {
                generation: result.generation,
            },
        );
        Ok(result)
    })
    .await
}

#[tauri::command]
pub(crate) async fn tasks_detail(
    window: WebviewWindow,
    workspace_id: String,
    id: String,
) -> Result<Detail, String> {
    let (entry, workspace) = entry(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || {
        ensure(&app, &entry, &workspace, false)?;
        let store = entry.store.lock().map_err(|_| "任务状态不可用")?;
        store
            .as_ref()
            .ok_or("[not-found] 找不到任务")?
            .detail(&id)
            .map_err(|e| e.to_string())
    })
    .await
}

/// Ids of tasks whose title or description contains every term.
#[tauri::command]
pub(crate) async fn tasks_search(
    window: WebviewWindow,
    workspace_id: String,
    text: String,
) -> Result<Vec<String>, String> {
    if text.chars().count() > 256 {
        return Err("[invalid] 搜索词过长".into());
    }
    let (entry, workspace) = entry(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || {
        ensure(&app, &entry, &workspace, false)?;
        let store = entry.store.lock().map_err(|_| "任务状态不可用")?;
        Ok(store.as_ref().map(|s| s.search(&text)).unwrap_or_default())
    })
    .await
}

/// One place in a note that links to a task (`task:<id>`).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Mention {
    relative_path: String,
    line: usize,
    column: usize,
    preview: String,
}

/// Notes in the workspace that link to the task. The workspace search already bounds files,
/// bytes and time; task files themselves live under the hidden `.marklyra` and are not scanned.
#[tauri::command]
pub(crate) async fn tasks_mentions(
    window: WebviewWindow,
    workspace_id: String,
    id: String,
) -> Result<Vec<Mention>, String> {
    if !(6..=40).contains(&id.len())
        || !id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
    {
        return Err("[invalid] 任务编号无效".into());
    }
    let (_, workspace) = entry(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || {
        let types = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(&app)?;
        let query = format!("task:{id}");
        let report = workspace
            .search_with_filters(
                file_index::SearchOptions {
                    query: &query,
                    case_sensitive: true,
                    whole_word: false,
                    use_regex: false,
                    max_results: 200,
                },
                crate::platform::file_metadata::include_entry,
                |name| types.allows(std::path::Path::new(name)),
            )
            .map_err(|e| e.to_string())?;
        Ok(report
            .matches
            .into_iter()
            .map(|m| Mention {
                relative_path: m.relative_path,
                line: m.line,
                column: m.column,
                preview: m.preview,
            })
            .collect())
    })
    .await
}
