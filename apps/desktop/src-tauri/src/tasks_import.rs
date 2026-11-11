//! Imports into the workspace task store. The host picks and reads the source (a native
//! dialog, or the workspace's own notes) and keeps the parsed result; the renderer only sees
//! the preview and names it by token. Sources are never written; checklist notes are
//! rewritten through the document service, only on lines that still read as previewed.
use crate::knowledge::{authorized, identity};
use crate::tasks::with_store;
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    io::Read,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use task_store::import::{self as im, checklist, csv, github, octarine, Options, Preview, Source};
use tauri::{AppHandle, Manager, WebviewWindow};

const MAX_FILE: u64 = 64 * 1024 * 1024;
const SESSIONS: usize = 4;

/// Parsed sources by token, with the workspace they were read for.
#[derive(Default)]
pub(crate) struct ImportHost(Mutex<Vec<(String, String, Arc<Source>)>>);

impl ImportHost {
    fn keep(&self, workspace: String, source: Source) -> Result<String, String> {
        let token = task_store::new_id();
        let mut list = self.0.lock().map_err(|_| "导入状态不可用")?;
        list.push((token.clone(), workspace, Arc::new(source)));
        let excess = list.len().saturating_sub(SESSIONS);
        list.drain(..excess);
        Ok(token)
    }
    fn get(&self, workspace: &str, token: &str) -> Result<Arc<Source>, String> {
        let list = self.0.lock().map_err(|_| "导入状态不可用")?;
        list.iter()
            .find(|(t, w, _)| t == token && w == workspace)
            .map(|(_, _, s)| s.clone())
            .ok_or_else(|| "导入已过期，请重新选择文件".into())
    }
    fn forget(&self, token: &str) {
        if let Ok(mut list) = self.0.lock() {
            list.retain(|(t, _, _)| t != token);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Opened {
    token: String,
    preview: Preview,
}

fn read_limited(path: &Path) -> Result<Vec<u8>, String> {
    let meta = std::fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("请选择一个文件".into());
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(MAX_FILE + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_FILE {
        return Err("文件超过 64 MiB，请分批导出".into());
    }
    Ok(bytes)
}

fn name_of(path: &Path) -> String {
    path.file_name()
        .map_or_else(String::new, |n| n.to_string_lossy().into_owned())
}

fn preview_for(
    app: &AppHandle,
    workspace: &Arc<file_index::Workspace>,
    source: &Source,
    options: &Options,
) -> Result<Preview, String> {
    // A workspace without tasks yet previews against an empty store; it is created on import.
    if !crate::tasks::has_store(app, workspace)? {
        return im::preview_snapshot(&task_store::Snapshot::empty(), source, options);
    }
    with_store(app, workspace, false, |store| {
        im::preview(store, source, options).map(|p| (p, false))
    })
}

fn open_with(
    app: &AppHandle,
    workspace: &Arc<file_index::Workspace>,
    source: Source,
) -> Result<Opened, String> {
    let options = Options {
        include_closed: source.include_closed_default,
        ..Options::default()
    };
    let preview = preview_for(app, workspace, &source, &options)?;
    let key = identity(workspace)?;
    let token = app.state::<ImportHost>().keep(key, source)?;
    Ok(Opened { token, preview })
}

/// Asks for an export file (or an Octarine folder) and previews it with default options.
#[tauri::command]
pub(crate) async fn tasks_import_pick(
    window: WebviewWindow,
    workspace_id: String,
    kind: String,
) -> Result<Option<Opened>, String> {
    use tauri_plugin_dialog::DialogExt;
    let workspace = authorized(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = app.dialog().file().set_parent(&window);
        let source = match kind.as_str() {
            "github" | "csv" => {
                let dialog = if kind == "github" {
                    dialog
                        .set_title("选择 gh issue list --json 导出的文件")
                        .add_filter("JSON", &["json"])
                } else {
                    dialog
                        .set_title("选择 CSV 导出文件")
                        .add_filter("CSV", &["csv", "tsv", "txt"])
                };
                let Some(path) = dialog.blocking_pick_file() else {
                    return Ok(None);
                };
                let path = path.into_path().map_err(|_| "无法读取所选文件")?;
                let bytes = read_limited(&path)?;
                if kind == "github" {
                    github::parse(&bytes, &name_of(&path))?
                } else {
                    csv::parse(&bytes, &name_of(&path))?
                }
            }
            "octarine" => {
                let Some(path) = dialog
                    .set_title("选择包含 .octarine 的文件夹")
                    .blocking_pick_folder()
                else {
                    return Ok(None);
                };
                let path = path.into_path().map_err(|_| "无法读取所选文件夹")?;
                let tasks = octarine::locate(&path).ok_or("这个文件夹里没有 .octarine/tasks")?;
                octarine::parse(&octarine::read(&tasks), &name_of(&path))
            }
            _ => return Err("[invalid] 未知的导入来源".into()),
        };
        open_with(&app, &workspace, source).map(Some)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Checklist items in the workspace notes, or in one note or folder below it.
#[tauri::command]
pub(crate) async fn tasks_import_notes(
    window: WebviewWindow,
    workspace_id: String,
    relative: Option<String>,
) -> Result<Opened, String> {
    let workspace = authorized(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let root = workspace
            .display_root_snapshot()
            .map_err(|e| e.to_string())?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        let target = match relative.as_deref().filter(|r| !r.is_empty()) {
            Some(r) => {
                let rel = Path::new(r);
                if rel
                    .components()
                    .any(|c| !matches!(c, std::path::Component::Normal(_)))
                {
                    return Err("[invalid] 路径无效".into());
                }
                root.join(rel)
            }
            None => root.clone(),
        };
        let notes = checklist::collect(&root, &target)?;
        let label = relative
            .filter(|r| !r.is_empty())
            .unwrap_or_else(|| "整个工作区".into());
        open_with(&app, &workspace, checklist::parse(&notes, &label))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn tasks_import_preview(
    window: WebviewWindow,
    workspace_id: String,
    token: String,
    options: Options,
) -> Result<Preview, String> {
    let workspace = authorized(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let source = app
            .state::<ImportHost>()
            .get(&identity(&workspace)?, &token)?;
        preview_for(&app, &workspace, &source, &options)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Rewrites checklist lines into links; returns how many lines changed and the notes left as
/// they were (edited since the preview, or open with unsaved changes).
fn link_notes(
    window: &WebviewWindow,
    workspace: &file_index::Workspace,
    links: &[im::NoteLink],
    skip: &[String],
) -> (usize, Vec<String>) {
    let mut by_note: BTreeMap<&str, Vec<im::NoteLink>> = BTreeMap::new();
    for link in links {
        by_note
            .entry(link.path.as_str())
            .or_default()
            .push(link.clone());
    }
    let mut linked = 0;
    let mut left = Vec::new();
    let Ok(dir) = workspace
        .bookmark()
        .map_err(|e| e.to_string())
        .and_then(|b| b.reopen().map_err(|e| e.to_string()))
    else {
        return (0, by_note.keys().map(|p| (*p).to_owned()).collect());
    };
    let root = workspace.display_root_snapshot().unwrap_or_default();
    let mut documents = document_service::DocumentService::new();
    for (path, links) in by_note {
        if skip.iter().any(|s| s == path) {
            left.push(path.to_owned());
            continue;
        }
        let write = || -> Result<(), String> {
            let relative = PathBuf::from(path);
            let loaded = documents
                .open_in_workspace(dir.clone(), &relative, root.join(&relative))
                .map_err(|e| e.to_string())?;
            let result = checklist::rewrite(&loaded.text, &links)
                .ok_or_else(|| "笔记已改动".to_owned())
                .and_then(|text| {
                    documents
                        .save(&loaded.id, &text)
                        .map(|_| ())
                        .map_err(|e| e.to_string())
                });
            documents.close(&loaded.id);
            result
        };
        match window
            .state::<crate::window_services::WindowServices>()
            .with_file_lane(write)
        {
            Ok(()) => linked += links.len(),
            Err(_) => left.push(path.to_owned()),
        }
    }
    (linked, left)
}

#[tauri::command]
pub(crate) async fn tasks_import_apply(
    window: WebviewWindow,
    workspace_id: String,
    token: String,
    options: Options,
    skip_notes: Vec<String>,
) -> Result<Value, String> {
    let workspace = authorized(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let host = app.state::<ImportHost>();
        let source = host.get(&identity(&workspace)?, &token)?;
        let applied = with_store(&app, &workspace, true, |store| {
            im::apply(store, &source, &options).map(|a| {
                let wrote = a.created > 0;
                (a, wrote)
            })
        })?;
        host.forget(&token);
        let (linked, unlinked) = link_notes(&window, &workspace, &applied.note_links, &skip_notes);
        Ok(json!({
            "created": applied.created,
            "receipt": applied.receipt,
            "linked": linked,
            "unlinkedNotes": unlinked,
        }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn tasks_import_receipts(
    window: WebviewWindow,
    workspace_id: String,
) -> Result<Vec<Value>, String> {
    let workspace = authorized(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if !crate::tasks::has_store(&app, &workspace)? {
            return Ok(Vec::new());
        }
        with_store(&app, &workspace, false, |store| {
            im::receipts(store).map(|r| (r, false))
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn tasks_import_undo(
    window: WebviewWindow,
    workspace_id: String,
    id: String,
) -> Result<usize, String> {
    let workspace = authorized(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        with_store(&app, &workspace, false, |store| {
            im::undo(store, &id).map(|n| (n, true))
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sessions_are_bounded_and_scoped_to_their_workspace() {
        let host = ImportHost::default();
        let tokens: Vec<String> = (0..6)
            .map(|_| host.keep("w1".into(), Source::default()).unwrap())
            .collect();
        assert!(host.get("w1", &tokens[0]).is_err());
        assert!(host.get("w1", &tokens[5]).is_ok());
        assert!(host.get("w2", &tokens[5]).is_err());
        host.forget(&tokens[5]);
        assert!(host.get("w1", &tokens[5]).is_err());
    }
}
