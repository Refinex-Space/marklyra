//! Where an export goes and what happens once it is written: the configured default folder, the
//! save dialog, the overwrite-safe write, and the "after export" actions of the settings.
use super::{formats::source_guard, main_only, ExportHost, SavedExport};
use crate::{export_preferences::ExportPreferencesHost, window_services::WindowServices};
use export_service::ExportDestination;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

/// Recently exported files this app may reveal or open again; nothing else is reachable.
const REMEMBERED: usize = 16;

/// The `\\?\` verbatim form is what the host keeps internally; people and shell APIs want the
/// plain path.
pub(super) fn plain(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\UNC\") {
        Some(share) => PathBuf::from(format!(r"\\{share}")),
        None => PathBuf::from(text.strip_prefix(r"\\?\").unwrap_or(&text)),
    }
}

/// The directory of the Markdown file this window edits, when it has been saved.
pub(super) fn document_directory(
    window: &WebviewWindow,
    source_id: Option<&str>,
) -> Option<PathBuf> {
    let id = source_id?;
    let documents = window
        .state::<WindowServices>()
        .get_documents(window.label())
        .ok()?;
    let source = documents.lock().ok()?.authorized_path(id).ok()?;
    source.parent().map(plain)
}

fn default_directory(
    app: &AppHandle,
    window: &WebviewWindow,
    source_id: Option<&str>,
) -> Option<PathBuf> {
    let settings = app.state::<ExportPreferencesHost>().snapshot(app).ok()?;
    if settings.general.folder_mode.as_deref() == Some("custom") {
        if let Some(folder) = settings
            .general
            .folder
            .as_deref()
            .filter(|folder| !folder.is_empty())
            .map(PathBuf::from)
            .filter(|folder| folder.is_dir())
        {
            return Some(folder);
        }
    }
    document_directory(window, source_id)
}

/// Blocks on the native save dialog, starting in the configured default folder.
pub(super) fn ask_destination(
    app: &AppHandle,
    window: &WebviewWindow,
    title: &str,
    file_name: String,
    filter: (&str, &[&str]),
    source_id: Option<&str>,
) -> Result<PathBuf, String> {
    let mut dialog = app
        .dialog()
        .file()
        .set_parent(window)
        .set_title(title)
        .set_file_name(file_name)
        .add_filter(filter.0, filter.1);
    if let Some(directory) = default_directory(app, window, source_id) {
        dialog = dialog.set_directory(directory);
    }
    dialog
        .blocking_save_file()
        .ok_or("已取消导出")?
        .into_path()
        .map_err(|_| "无法读取导出路径".to_owned())
}

/// Checks the chosen path, writes the bytes without clobbering unseen changes, remembers the
/// file for later reveal/open, and runs the configured after-export actions.
pub(super) fn deliver(
    app: &AppHandle,
    window: &WebviewWindow,
    path: &Path,
    source_id: Option<&str>,
    bytes: &[u8],
    mut warnings: Vec<String>,
) -> Result<SavedExport, String> {
    main_only(window)?;
    source_guard(window, source_id, path)?;
    let destination = ExportDestination::authorize(path).map_err(|error| error.to_string())?;
    let written = plain(destination.path());
    destination
        .write_bytes(bytes)
        .map_err(|error| error.to_string())?;
    remember(app, &written);
    after_export(app, &written, &mut warnings);
    Ok(SavedExport {
        path: written.to_string_lossy().into_owned(),
        bytes: bytes.len(),
        warnings,
    })
}

fn remember(app: &AppHandle, path: &Path) {
    if let Ok(mut exported) = app.state::<ExportHost>().exported.lock() {
        exported.retain(|known| known != path);
        exported.push_back(path.to_owned());
        while exported.len() > REMEMBERED {
            exported.pop_front();
        }
    }
}

fn after_export(app: &AppHandle, path: &Path, warnings: &mut Vec<String>) {
    let Ok(settings) = app.state::<ExportPreferencesHost>().snapshot(app) else {
        return;
    };
    if settings.general.open_location == Some(true) {
        if let Err(error) = reveal(path) {
            warnings.push(format!("未能显示导出文件的位置：{error}"));
        }
    }
    if settings.general.open_file == Some(true) {
        if let Err(error) = open_file(path) {
            warnings.push(format!("未能打开导出文件：{error}"));
        }
    }
}

fn reveal(path: &Path) -> Result<(), String> {
    crate::platform::entry_actions::dispatch(crate::window_services::EntryActionKind::Reveal, path)
}
fn open_file(path: &Path) -> Result<(), String> {
    open::that(path).map_err(|error| error.to_string())
}

fn remembered(host: &ExportHost, path: &str) -> Result<PathBuf, String> {
    let wanted = plain(Path::new(path));
    host.exported
        .lock()
        .map_err(|_| "导出记录不可用".to_owned())?
        .iter()
        .find(|known| **known == wanted)
        .cloned()
        .filter(|known| known.is_file())
        .ok_or_else(|| "该文件不是本次运行导出的，或已被移走".to_owned())
}

/// Shows an exported file in the system file manager. Only files this app just wrote qualify.
#[tauri::command]
pub async fn reveal_export_file(
    window: WebviewWindow,
    host: State<'_, ExportHost>,
    path: String,
) -> Result<(), String> {
    main_only(&window)?;
    reveal(&remembered(&host, &path)?)
}

/// Opens an exported file with its default application. Only files this app just wrote qualify.
#[tauri::command]
pub async fn open_export_file(
    window: WebviewWindow,
    host: State<'_, ExportHost>,
    path: String,
) -> Result<(), String> {
    main_only(&window)?;
    open_file(&remembered(&host, &path)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verbatim_prefixes_are_removed_for_people_and_shell_apis() {
        assert_eq!(
            plain(Path::new(r"\\?\D:\笔记\a.pdf")),
            Path::new(r"D:\笔记\a.pdf")
        );
        assert_eq!(
            plain(Path::new(r"\\?\UNC\server\share\a.pdf")),
            Path::new(r"\\server\share\a.pdf")
        );
        assert_eq!(plain(Path::new("/tmp/a.pdf")), Path::new("/tmp/a.pdf"));
    }

    #[test]
    fn only_remembered_files_can_be_revealed_or_opened() {
        let host = ExportHost::default();
        let directory = tempfile::tempdir().unwrap();
        let file = directory.path().join("done.pdf");
        std::fs::write(&file, b"%PDF").unwrap();
        let other = directory.path().join("other.pdf");
        std::fs::write(&other, b"%PDF").unwrap();
        host.exported.lock().unwrap().push_back(file.clone());
        assert_eq!(remembered(&host, &file.to_string_lossy()).unwrap(), file);
        assert!(remembered(&host, &other.to_string_lossy()).is_err());
        std::fs::remove_file(&file).unwrap();
        assert!(remembered(&host, &file.to_string_lossy()).is_err());
    }
}
