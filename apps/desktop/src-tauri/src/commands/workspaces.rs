use super::require_window;
use crate::window_services::WindowServices;
use document_service::DocumentPayload;
use file_index::{
    DirectoryListing, DocumentSummary, SearchOptions, SearchReport, Workspace,
    WorkspaceArticlesReport, WorkspaceCatalogSnapshot, WorkspacePayload, WorkspaceRegistry,
};
use std::{
    collections::HashMap,
    sync::{atomic::AtomicBool, Arc, Mutex, OnceLock},
};
use tauri::WebviewWindow;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
mod duplicate;
pub use duplicate::*;
mod entry_actions;
pub use entry_actions::*;
mod entry_move;
pub use entry_move::*;
mod entry_rename;
pub use entry_rename::*;
mod file_undo;
pub use file_undo::*;
mod trash;
pub use trash::*;

pub type Workspaces = Arc<Mutex<WorkspaceRegistry>>;

/// Matches a search returns unless the caller asks for fewer; results are in path order.
const DEFAULT_SEARCH_RESULTS: usize = 5_000;

/// The newest search of each window. A new query withdraws the previous one, so typing never
/// leaves several full scans of the directory running.
fn running_searches() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static SEARCHES: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    SEARCHES.get_or_init(Mutex::default)
}

/// Registers a search for `label`, cancelling the one it replaces.
fn begin_search(label: &str) -> Arc<AtomicBool> {
    let cancel = Arc::new(AtomicBool::new(false));
    if let Ok(mut searches) = running_searches().lock() {
        if let Some(previous) = searches.insert(label.to_owned(), Arc::clone(&cancel)) {
            previous.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }
    cancel
}

fn finish_search(label: &str, cancel: &Arc<AtomicBool>) {
    if let Ok(mut searches) = running_searches().lock() {
        if searches
            .get(label)
            .is_some_and(|current| Arc::ptr_eq(current, cancel))
        {
            searches.remove(label);
        }
    }
}

fn report_notification(result: tauri::Result<()>, event: &str) {
    if let Err(error) = result {
        eprintln!("File operation notification {event} failed: {error}");
    }
}

fn workspace(registry: &Workspaces, id: &str) -> Result<Arc<Workspace>, String> {
    registry
        .lock()
        .map_err(|_| "目录状态不可用".to_owned())?
        .get(id)
        .map_err(|error| error.to_string())
}

fn verify_workspace_window(window: &WebviewWindow, registry: &Workspaces) -> Result<(), String> {
    require_window(window)?;
    verify_workspace_registry(&window.state::<WindowServices>(), window.label(), registry)
}

fn verify_workspace_registry(
    services: &WindowServices,
    label: &str,
    registry: &Workspaces,
) -> Result<(), String> {
    if !services.is_current_workspaces(label, registry) {
        return Err("编辑窗口已关闭或已更换目录会话".into());
    }
    Ok(())
}

fn read_workspace<T>(
    registry: &Workspaces,
    id: &str,
    verify_window: impl Fn() -> Result<(), String>,
    read: impl FnOnce(&Workspace) -> Result<T, file_index::IndexError>,
) -> Result<T, String> {
    verify_window()?;
    let selected = workspace(registry, id)?;
    let report = read(&selected).map_err(|error| error.to_string())?;
    verify_window()?;
    let current = workspace(registry, id)?;
    if !Arc::ptr_eq(&selected, &current) {
        return Err("工作区已更换或关闭".into());
    }
    Ok(report)
}

/// Every eligible document by metadata only; previews arrive per visible row.
fn collect_document_index(
    registry: &Workspaces,
    id: &str,
    types: &crate::file_preferences::file_types::DocumentTypes,
    verify_window: impl Fn() -> Result<(), String>,
) -> Result<WorkspaceArticlesReport, String> {
    read_workspace(registry, id, verify_window, |selected| {
        selected.list_document_index_with_filters(
            crate::platform::file_metadata::include_entry,
            |name| types.allows(std::path::Path::new(name)),
        )
    })
}

fn collect_document_summaries(
    registry: &Workspaces,
    id: &str,
    paths: &[String],
    types: &crate::file_preferences::file_types::DocumentTypes,
    verify_window: impl Fn() -> Result<(), String>,
) -> Result<Vec<DocumentSummary>, String> {
    read_workspace(registry, id, verify_window, |selected| {
        selected.read_document_summaries_with_filters(
            paths,
            crate::platform::file_metadata::include_entry,
            |name| types.allows(std::path::Path::new(name)),
        )
    })
}

/// Full read of every document's prefix; kept as the reference the lazy path must agree with.
#[cfg(test)]
fn collect_documents(
    registry: &Workspaces,
    id: &str,
    types: &crate::file_preferences::file_types::DocumentTypes,
    verify_window: impl Fn() -> Result<(), String>,
) -> Result<WorkspaceArticlesReport, String> {
    read_workspace(registry, id, verify_window, |selected| {
        selected
            .list_documents_with_filters(crate::platform::file_metadata::include_entry, |name| {
                types.allows(std::path::Path::new(name))
            })
    })
}

#[tauri::command]
pub async fn select_workspace(
    app: AppHandle,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<WorkspacePayload, String> {
    let workspaces = services.get_workspaces(window.label())?;
    let history_request = app
        .state::<crate::file_preferences::FilePreferencesHost>()
        .history_request();
    tauri::async_runtime::spawn_blocking(move || {
        let history_ticket = match app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .prepare_folder_history(&app, history_request)
        {
            Ok(ticket) => ticket,
            Err(error) => {
                eprintln!("Directory history was not prepared: {error}");
                None
            }
        };
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("选择 Markdown 工作目录")
            .blocking_pick_folder()
            .ok_or("已取消选择目录")?;
        let path = selected.into_path().map_err(|_| "无法读取所选目录路径")?;
        let mut workspaces = workspaces.lock().map_err(|_| "目录状态不可用")?;
        require_window(&window)?;
        let result = workspaces
            .select_authorized(&path)
            .map_err(|error| error.to_string())?;
        let bookmark = workspaces
            .get(&result.id)
            .map_err(|error| error.to_string())?
            .bookmark();
        drop(workspaces);
        match bookmark {
            Ok(bookmark) => {
                if let Err(error) = app
                    .state::<crate::file_preferences::FilePreferencesHost>()
                    .remember_workspace(&app, &bookmark, history_ticket)
                {
                    eprintln!("Directory history was not updated: {error}");
                }
            }
            // A metadata failure cannot revoke the user's retained directory FD.
            Err(error) => eprintln!("Directory identity was not recorded: {error}"),
        }
        Ok(result)
    })
    .await
    .map_err(|_| "选择目录任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn list_directory(
    workspace_id: String,
    relative_path: Option<String>,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<DirectoryListing, String> {
    let registry = services.get_workspaces(window.label())?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let types = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(&app)?;
        read_workspace(
            &registry,
            &workspace_id,
            || verify_workspace_window(&window, &registry),
            |selected| {
                selected.list_directory_with_filters(
                    relative_path.as_deref().unwrap_or(""),
                    crate::platform::file_metadata::include_entry,
                    |name| types.allows(std::path::Path::new(name)),
                )
            },
        )
    })
    .await
    .map_err(|_| "读取目录任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn snapshot_workspace(
    workspace_id: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<WorkspaceCatalogSnapshot, String> {
    let registry = services.get_workspaces(window.label())?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let types = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(&app)?;
        read_workspace(
            &registry,
            &workspace_id,
            || verify_workspace_window(&window, &registry),
            |selected| {
                selected.catalog_snapshot_with_filters(
                    crate::platform::file_metadata::include_entry,
                    |name| types.allows(std::path::Path::new(name)),
                )
            },
        )
    })
    .await
    .map_err(|_| "目录变化检查任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn list_workspace_documents(
    workspace_id: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<WorkspaceArticlesReport, String> {
    let registry = services.get_workspaces(window.label())?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let types = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(&app)?;
        collect_document_index(&registry, &workspace_id, &types, || {
            verify_workspace_window(&window, &registry)
        })
    })
    .await
    .map_err(|_| "读取文章列表任务未能完成".to_owned())?
}

/// Previews for the rows being shown: at most `MAX_SUMMARY_BATCH` already-listed paths, each
/// re-resolved through the workspace capability.
#[tauri::command]
pub async fn read_workspace_document_summaries(
    workspace_id: String,
    relative_paths: Vec<String>,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<Vec<DocumentSummary>, String> {
    let registry = services.get_workspaces(window.label())?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let types = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(&app)?;
        collect_document_summaries(&registry, &workspace_id, &relative_paths, &types, || {
            verify_workspace_window(&window, &registry)
        })
    })
    .await
    .map_err(|_| "读取文档预览任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn open_workspace_document(
    workspace_id: String,
    relative_path: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<DocumentPayload, String> {
    services.get_documents(window.label())?;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let types = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(&app)?;
        types.require(std::path::Path::new(&relative_path))?;
        // Membership was checked by the policy; the index still verifies path capabilities.
        let suffix = types
            .catalog()
            .into_iter()
            .filter(|id| {
                !id.is_empty()
                    && relative_path
                        .to_ascii_lowercase()
                        .ends_with(&format!(".{id}"))
            })
            .max_by_key(|id| id.len());
        window.state::<WindowServices>().open_workspace_document(
            window.label(),
            &workspace_id,
            &relative_path,
            suffix.as_deref(),
        )
    })
    .await
    .map_err(|_| "打开目录文档任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn search_workspace(
    workspace_id: String,
    query: String,
    case_sensitive: Option<bool>,
    whole_word: Option<bool>,
    use_regex: Option<bool>,
    max_results: Option<usize>,
    window: WebviewWindow,
) -> Result<SearchReport, String> {
    let registry = window
        .state::<WindowServices>()
        .get_workspaces(window.label())?;
    let app = window.app_handle().clone();
    let label = window.label().to_owned();
    let cancel = begin_search(&label);
    let outcome = tauri::async_runtime::spawn_blocking({
        let cancel = Arc::clone(&cancel);
        move || {
            let types = app
                .state::<crate::file_preferences::FilePreferencesHost>()
                .document_types(&app)?;
            read_workspace(
                &registry,
                &workspace_id,
                || verify_workspace_window(&window, &registry),
                |selected| {
                    selected.search_with_cancel(
                        SearchOptions {
                            query: &query,
                            case_sensitive: case_sensitive.unwrap_or(true),
                            whole_word: whole_word.unwrap_or(false),
                            use_regex: use_regex.unwrap_or(false),
                            max_results: max_results.unwrap_or(DEFAULT_SEARCH_RESULTS),
                        },
                        crate::platform::file_metadata::include_entry,
                        |name| types.allows(std::path::Path::new(name)),
                        &cancel,
                    )
                },
            )
        }
    })
    .await;
    finish_search(&label, &cancel);
    outcome.map_err(|_| "目录搜索任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn create_workspace_entry(
    workspace_id: String,
    parent_relative_path: String,
    kind: file_index::EntryKind,
    operation_id: String,
    window: WebviewWindow,
) -> Result<file_index::CreatedWorkspaceEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app = window.app_handle();
        let extension = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .default_extension(app)?;
        require_window(&window)?;
        let created = window.state::<WindowServices>().create_workspace_entry(
            window.label(),
            &workspace_id,
            &operation_id,
            &parent_relative_path,
            kind,
            &extension,
        )?;
        let _ = app.emit("workspace-file-undo-changed", ());
        if let Err(error) = app.emit("workspace-files-changed", ()) {
            eprintln!("Created entry, but catalog notification failed: {error}");
        }
        Ok(created)
    })
    .await
    .map_err(|_| "创建目录条目任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn rename_workspace_creation(
    workspace_id: String,
    entry_token: String,
    new_name: String,
    window: WebviewWindow,
) -> Result<file_index::CreatedWorkspaceEntry, String> {
    tauri::async_runtime::spawn_blocking(move || {
        require_window(&window)?;
        let app = window.app_handle();
        let preferences = app.state::<crate::file_preferences::FilePreferencesHost>();
        let ticket = match preferences.prepare_history(app, preferences.history_request()) {
            Ok(ticket) => ticket,
            Err(error) => {
                eprintln!("Recent rename migration was not prepared: {error}");
                None
            }
        };
        let result = window.state::<WindowServices>().rename_workspace_creation(
            window.label(),
            &workspace_id,
            &entry_token,
            &new_name,
        )?;
        let app = window.app_handle();
        for (label, ids) in result.uncertain {
            if let Err(error) = app.emit_to(&label, "document-file-operation-uncertain", ids) {
                eprintln!("Uncertain rename warning delivery failed: {error}");
            }
        }
        for (label, documents) in result.metadata {
            if let Err(error) = app.emit_to(&label, "document-metadata-changed", documents) {
                eprintln!("Renamed entry, but document metadata notification failed: {error}");
            }
        }
        if let Err(error) = app.emit("workspace-files-changed", ()) {
            eprintln!("Renamed entry, but catalog notification failed: {error}");
        }
        let _ = app.emit("workspace-file-undo-changed", ());
        if let Some((old, new)) = result.confirmed_paths {
            if let Err(error) =
                crate::commands::recent::rename::migrate_creation_rename(app, &old, &new, ticket)
            {
                eprintln!("File renamed, but recent record migration was not confirmed: {error}");
                let _ = app.emit_to(
                    window.label(),
                    "workspace-operation-warning",
                    "文件已改名，但最近文件记录迁移未确认；未回滚文件",
                );
            }
        }
        result.entry.ok_or_else(|| {
            "命名操作已执行，但文件位置无法确认；原稿已保留，请刷新核对或另存为，未自动重试"
                .to_owned()
        })
    })
    .await
    .map_err(|_| "命名新条目任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn finish_workspace_creation(
    workspace_id: String,
    entry_token: String,
    window: WebviewWindow,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        window.state::<WindowServices>().mutate_workspace(
            window.label(),
            &workspace_id,
            |workspace| {
                workspace
                    .finish_creation(&entry_token)
                    .map_err(|e| e.to_string())
            },
        )
    })
    .await
    .map_err(|_| "结束新条目命名任务未能完成".to_owned())?
}

/// Only called with a path returned by the actual system Save panel. Never IPC input.
fn create_picker_file(path: &std::path::Path) -> Result<(), String> {
    let parent = path.parent().ok_or("所选文件没有父目录")?;
    let name = path.file_name().ok_or("所选文件名无效")?;
    let directory = cap_std::fs::Dir::open_ambient_dir(parent, cap_std::ambient_authority())
        .map_err(|e| e.to_string())?;
    let mut options = cap_std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    directory
        .open_with(std::path::Path::new(name), &options)
        .and_then(|file| file.sync_all())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_workspace_file_with_dialog(
    workspace_id: String,
    window: WebviewWindow,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app = window.app_handle();
        let selected_workspace = workspace(
            &window
                .state::<WindowServices>()
                .get_workspaces(window.label())?,
            &workspace_id,
        )?;
        let bookmark = selected_workspace.bookmark().map_err(|e| e.to_string())?;
        require_window(&window)?;
        let extension = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .default_extension(app)?;
        let filters = app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .document_types(app)?
            .enabled_extensions();
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("新建文档")
            .set_file_name(format!("Untitled.{extension}"))
            .set_directory(bookmark.path())
            .add_filter(
                "Markdown / Text",
                &filters.iter().map(String::as_str).collect::<Vec<_>>(),
            )
            .add_filter("所有文件", &["*"])
            .blocking_save_file();
        let Some(selected) = selected else {
            return Ok(false);
        };
        let path = selected.into_path().map_err(|_| "无法读取新建文件路径")?;
        app.state::<crate::file_preferences::FilePreferencesHost>()
            .require_document_type(app, &path)?;
        window.state::<WindowServices>().mutate_workspace(
            window.label(),
            &workspace_id,
            |current| {
                require_window(&window)?;
                if !std::ptr::eq(current, selected_workspace.as_ref()) {
                    return Err("工作区已更换或关闭".into());
                }
                create_picker_file(&path)?;
                window.state::<WindowServices>().clear_file_undo();
                Ok(())
            },
        )?;
        if let Err(error) = app.emit("workspace-files-changed", ()) {
            eprintln!("Created file, but catalog notification failed: {error}");
        }
        Ok(true)
    })
    .await
    .map_err(|_| "新建文件面板任务未能完成".to_owned())?
}

#[tauri::command]
pub fn close_workspace(
    workspace_id: String,
    window: WebviewWindow,
    services: State<'_, WindowServices>,
) -> Result<(), String> {
    services.close_workspace(window.label(), &workspace_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn catalog_read_rejects_reused_window_label_while_old_cleanup_is_blocked() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("own.md"), "own fixture").unwrap();
        let services = Arc::new(WindowServices::default());
        services.register("catalog-race").unwrap();
        let retained = services.get_workspaces("catalog-race").unwrap();
        let grant = retained
            .lock()
            .unwrap()
            .select_authorized(root.path())
            .unwrap();
        let documents = services.get_documents("catalog-race").unwrap();
        let blocked = documents.lock().unwrap();
        let mut cleanup = None;
        let result = read_workspace(
            &retained,
            &grant.id,
            || verify_workspace_registry(&services, "catalog-race", &retained),
            |selected| {
                let removing = Arc::clone(&services);
                cleanup = Some(std::thread::spawn(move || removing.remove("catalog-race")));
                let started = std::time::Instant::now();
                while services.contains("catalog-race") {
                    assert!(started.elapsed() < std::time::Duration::from_secs(2));
                    std::thread::yield_now();
                }
                services.register("catalog-race").unwrap();
                assert!(retained.lock().unwrap().get(&grant.id).is_ok());
                selected.catalog_snapshot_with_entry_filter(None, |_| true)
            },
        );
        assert!(result.unwrap_err().contains("已更换目录会话"));
        drop(blocked);
        cleanup.unwrap().join().unwrap().unwrap();
        services.remove("catalog-race").unwrap();
    }

    #[test]
    fn system_selected_new_file_is_empty_and_existing_entities_are_never_overwritten() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("中文.md");
        create_picker_file(&path).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"");
        std::fs::write(&path, b"\xef\xbb\xbfexisting\r\n").unwrap();
        assert!(create_picker_file(&path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"\xef\xbb\xbfexisting\r\n");
        assert!(create_picker_file(root.path()).is_err());
        #[cfg(unix)]
        {
            let link = root.path().join("link.md");
            std::os::unix::fs::symlink(&path, &link).unwrap();
            assert!(create_picker_file(&link).is_err());
            assert_eq!(std::fs::read(&path).unwrap(), b"\xef\xbb\xbfexisting\r\n");
        }
    }

    #[test]
    fn custom_extension_is_an_operation_snapshot_with_the_same_window_grant() {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(root.path().join("custom.vault"), "custom source").unwrap();
        let registry = Arc::new(Mutex::new(WorkspaceRegistry::default()));
        let selected = registry
            .lock()
            .unwrap()
            .select_authorized(root.path())
            .unwrap();
        assert!(collect_documents(
            &registry,
            &selected.id,
            &crate::file_preferences::file_types::DocumentTypes::default(),
            || Ok(())
        )
        .unwrap()
        .entries
        .is_empty());
        assert_eq!(
            collect_documents(
                &registry,
                &selected.id,
                &crate::file_preferences::file_types::DocumentTypes {
                    custom_extension: "vault".into(),
                    ..Default::default()
                },
                || Ok(())
            )
            .unwrap()
            .entries[0]
                .summary,
            "custom source"
        );
        assert!(collect_documents(
            &registry,
            &selected.id,
            &crate::file_preferences::file_types::DocumentTypes::default(),
            || Ok(())
        )
        .unwrap()
        .entries
        .is_empty());
        assert!(collect_documents(
            &Arc::new(Mutex::new(WorkspaceRegistry::default())),
            &selected.id,
            &crate::file_preferences::file_types::DocumentTypes {
                custom_extension: "vault".into(),
                ..Default::default()
            },
            || Ok(())
        )
        .is_err());
    }

    #[test]
    fn article_command_uses_window_registry_and_rejects_a_close_during_collection() {
        let temporary = tempfile::tempdir().unwrap();
        std::fs::write(temporary.path().join("article.md"), "read-only article").unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-other").unwrap();
        let own = services.get_workspaces("main").unwrap();
        let foreign = services.get_workspaces("editor-other").unwrap();
        let selected = own
            .lock()
            .unwrap()
            .select_authorized(temporary.path())
            .unwrap();
        assert!(collect_documents(
            &foreign,
            &selected.id,
            &crate::file_preferences::file_types::DocumentTypes::default(),
            || Ok(())
        )
        .is_err());
        assert_eq!(
            collect_documents(
                &own,
                &selected.id,
                &crate::file_preferences::file_types::DocumentTypes::default(),
                || Ok(())
            )
            .unwrap()
            .entries[0]
                .summary,
            "read-only article"
        );
        let calls = Cell::new(0);
        let result = collect_documents(
            &own,
            &selected.id,
            &crate::file_preferences::file_types::DocumentTypes::default(),
            || {
                calls.set(calls.get() + 1);
                if calls.get() == 2 {
                    own.lock().unwrap().close(&selected.id);
                }
                Ok(())
            },
        );
        assert!(result.is_err());
        assert_eq!(calls.get(), 2);
        assert_eq!(
            std::fs::read_to_string(temporary.path().join("article.md")).unwrap(),
            "read-only article"
        );
    }

    #[test]
    fn index_and_summaries_use_the_same_window_registry_and_type_policy() {
        let temporary = tempfile::tempdir().unwrap();
        std::fs::write(temporary.path().join("article.md"), "lazy article").unwrap();
        std::fs::write(temporary.path().join("custom.vault"), "custom source").unwrap();
        let services = WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-other").unwrap();
        let own = services.get_workspaces("main").unwrap();
        let foreign = services.get_workspaces("editor-other").unwrap();
        let selected = own
            .lock()
            .unwrap()
            .select_authorized(temporary.path())
            .unwrap();
        let types = crate::file_preferences::file_types::DocumentTypes::default();
        let custom = crate::file_preferences::file_types::DocumentTypes {
            custom_extension: "vault".into(),
            ..Default::default()
        };
        assert!(collect_document_index(&foreign, &selected.id, &types, || Ok(())).is_err());
        let index = collect_document_index(&own, &selected.id, &types, || Ok(())).unwrap();
        assert_eq!(index.entries.len(), 1);
        assert!(index.entries[0].summary.is_empty());
        assert_eq!(index.read_bytes, 0);
        let paths = vec!["article.md".to_owned(), "custom.vault".to_owned()];
        assert!(
            collect_document_summaries(&foreign, &selected.id, &paths, &types, || Ok(())).is_err()
        );
        let read =
            collect_document_summaries(&own, &selected.id, &paths, &types, || Ok(())).unwrap();
        assert_eq!(read[0].summary, "lazy article");
        assert_eq!(read[1].summary, "");
        let with_custom =
            collect_document_summaries(&own, &selected.id, &paths, &custom, || Ok(())).unwrap();
        assert_eq!(with_custom[1].summary, "custom source");
        assert_eq!(
            collect_document_index(&own, &selected.id, &custom, || Ok(()))
                .unwrap()
                .entries
                .len(),
            2
        );
        let calls = Cell::new(0);
        let late = collect_document_summaries(&own, &selected.id, &paths, &types, || {
            calls.set(calls.get() + 1);
            if calls.get() == 2 {
                own.lock().unwrap().close(&selected.id);
            }
            Ok(())
        });
        assert!(late.is_err());
    }

    #[test]
    fn closed_editor_verification_prevents_late_article_result() {
        let temporary = tempfile::tempdir().unwrap();
        std::fs::write(temporary.path().join("article.md"), "article").unwrap();
        let registry = Arc::new(Mutex::new(WorkspaceRegistry::default()));
        let selected = registry
            .lock()
            .unwrap()
            .select_authorized(temporary.path())
            .unwrap();
        let calls = Cell::new(0);
        let result = collect_documents(
            &registry,
            &selected.id,
            &crate::file_preferences::file_types::DocumentTypes::default(),
            || {
                calls.set(calls.get() + 1);
                if calls.get() == 2 {
                    return Err("editor closed".into());
                }
                Ok(())
            },
        );
        assert_eq!(result.err().as_deref(), Some("editor closed"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_article_command_filters_real_hidden_and_package_entries_after_root_rename() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path().join("selected");
        std::fs::create_dir_all(root.join("Demo.app")).unwrap();
        std::fs::create_dir_all(root.join("FinderHidden")).unwrap();
        std::fs::write(root.join("Demo.app/inside.md"), "package content").unwrap();
        std::fs::write(
            root.join("FinderHidden/inside.md"),
            "hidden directory content",
        )
        .unwrap();
        std::fs::write(root.join("hidden.md"), "hidden file content").unwrap();
        std::fs::write(root.join("visible.md"), "original authorized content").unwrap();
        for path in [root.join("FinderHidden"), root.join("hidden.md")] {
            assert!(std::process::Command::new("/usr/bin/chflags")
                .arg("hidden")
                .arg(path)
                .status()
                .unwrap()
                .success());
        }
        let registry = Arc::new(Mutex::new(WorkspaceRegistry::default()));
        let selected = registry.lock().unwrap().select_authorized(&root).unwrap();
        let check = || {
            let report = collect_documents(
                &registry,
                &selected.id,
                &crate::file_preferences::file_types::DocumentTypes::default(),
                || Ok(()),
            )
            .unwrap();
            assert_eq!(report.entries.len(), 1);
            assert_eq!(report.entries[0].relative_path, "visible.md");
            assert_eq!(report.entries[0].summary, "original authorized content");
            assert_eq!(report.skipped.ignored, 3);
        };
        check();
        std::fs::rename(&root, temporary.path().join("renamed")).unwrap();
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("foreign.md"), "replacement must not be scanned").unwrap();
        check();
    }
}
