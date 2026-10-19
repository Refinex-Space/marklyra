use super::*;
use std::sync::{OnceLock, Weak};

pub(super) fn canonical_workspace_root(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value)
        .canonicalize()
        .map_err(|_| "工作目录不存在")?;
    if !path.is_dir() {
        return Err("工作目录无效".into());
    }
    Ok(path)
}

pub(super) fn document_save_lock(path: &Path) -> Arc<Mutex<()>> {
    static LOCKS: OnceLock<Mutex<HashMap<PathBuf, Weak<Mutex<()>>>>> = OnceLock::new();
    let mut all = LOCKS
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    all.retain(|_, lock| lock.strong_count() > 0);
    if let Some(lock) = all.get(path).and_then(Weak::upgrade) {
        return lock;
    }
    let lock = Arc::new(Mutex::new(()));
    all.insert(path.to_path_buf(), Arc::downgrade(&lock));
    lock
}

pub(super) fn write_text_atomic(path: &Path, text: &str) -> Result<(), std::io::Error> {
    let parent = path
        .parent()
        .ok_or_else(|| std::io::Error::other("missing parent"))?;
    let dir = cap_std::fs::Dir::open_ambient_dir(parent, cap_std::ambient_authority())?;
    let name = path
        .file_name()
        .ok_or_else(|| std::io::Error::other("missing name"))?;
    if let Ok(meta) = dir.symlink_metadata(name) {
        if !meta.is_file() || meta.file_type().is_symlink() {
            return Err(std::io::Error::other("invalid record"));
        }
    }
    let temporary = format!(".pending-{}", Uuid::new_v4());
    let mut options = cap_std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| {
        let mut file = dir.open_with(&temporary, &options)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        dir.rename(&temporary, &dir, name)
    })();
    if result.is_err() {
        let _ = dir.remove_file(&temporary);
    }
    result
}

pub(super) fn authorized_workspace(
    window: &WebviewWindow,
    id: &str,
) -> Result<Arc<file_index::Workspace>, String> {
    crate::commands::require_window(window)?;
    let registry = window
        .state::<crate::window_services::WindowServices>()
        .get_workspaces(window.label())?;
    let result = registry
        .lock()
        .map_err(|_| "工作区不可用")?
        .get(id)
        .map_err(|e| e.to_string())?;
    Ok(result)
}

pub(super) fn authorize_root(window: &WebviewWindow, path: &str) -> Result<PathBuf, String> {
    crate::commands::require_window(window)?;
    let registry = window
        .state::<crate::window_services::WindowServices>()
        .get_workspaces(window.label())?;
    let registry = registry.lock().map_err(|_| "工作区不可用")?;
    for id in registry.ids() {
        let workspace = registry.get(&id).map_err(|e| e.to_string())?;
        let root = workspace
            .display_root_snapshot()
            .map_err(|e| e.to_string())?;
        if root.to_string_lossy() == path {
            workspace
                .bookmark()
                .and_then(|b| b.reopen().map_err(Into::into))
                .map_err(|e| e.to_string())?;
            return Ok(root);
        }
    }
    Err("目录未由当前窗口授权，请重新打开文件夹".into())
}

pub(super) fn require_manager(window: &WebviewWindow) -> Result<(), String> {
    if window
        .state::<crate::window_services::WindowServices>()
        .contains(window.label())
        || (window.label() == "preferences"
            && crate::platform::ui_chrome::require_preferences_session(window).is_ok())
    {
        Ok(())
    } else {
        Err("智能体管理仅允许从有效的应用设置页面发起".into())
    }
}
