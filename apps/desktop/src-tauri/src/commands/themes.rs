use crate::themes::{PreparedThemeStyles, ThemeCatalog, ThemeHost};
use tauri::{AppHandle, Manager, State, WebviewWindow};
const THEME_GALLERY: &str = "https://theme.typora.io";

fn editor_only(window: &WebviewWindow) -> Result<(), String> {
    if crate::windows::is_editor(window) {
        Ok(())
    } else {
        Err("主题操作仅允许由编辑窗口发起".into())
    }
}
fn catalog_window(window: &WebviewWindow) -> Result<(), String> {
    if can_use_catalog(window.label(), crate::windows::is_editor(window)) {
        Ok(())
    } else {
        Err("主题目录操作仅允许由编辑窗口或偏好设置窗口发起".into())
    }
}
fn can_use_catalog(label: &str, editor: bool) -> bool {
    editor || label == "preferences"
}
#[tauri::command]
pub async fn list_theme_catalog(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ThemeHost>,
) -> Result<ThemeCatalog, String> {
    catalog_window(&window)?;
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| "无法获取应用配置目录")?;
    let host = host.inner().clone();
    let catalog = tauri::async_runtime::spawn_blocking(move || {
        catalog_window(&window)?;
        let catalog = host.catalog(&directory)?;
        catalog_window(&window)?;
        Ok::<_, String>(catalog)
    })
    .await
    .map_err(|_| "读取主题列表任务未能完成".to_owned())??;
    crate::menu::themes::schedule_update(&app, &catalog.themes)?;
    Ok(catalog)
}
#[tauri::command]
pub async fn load_theme_styles(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ThemeHost>,
    theme_id: String,
    request_id: u64,
) -> Result<PreparedThemeStyles, String> {
    editor_only(&window)?;
    let request = host.begin_load(window.label(), request_id)?;
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| "无法获取应用配置目录")?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        editor_only(&window)?;
        let styles = host.prepare_styles(request, &theme_id, &directory)?;
        editor_only(&window)?;
        Ok(styles)
    })
    .await
    .map_err(|_| "准备主题样式任务未能完成".to_owned())?
}
#[tauri::command]
pub fn accept_theme_styles(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ThemeHost>,
    token: String,
) -> Result<(), String> {
    editor_only(&window)?;
    host.accept_styles(window.label(), &token)?;
    if let Err(error) = crate::menu::themes::schedule_sync(&app) {
        eprintln!("Accepted theme menu synchronization failed: {error}");
    }
    Ok(())
}
#[tauri::command]
pub fn sync_theme_menu(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    catalog_window(&window)?;
    crate::menu::themes::schedule_sync(&app)
}
#[tauri::command]
pub async fn open_theme_folder(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ThemeHost>,
) -> Result<(), String> {
    catalog_window(&window)?;
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|_| "无法获取应用配置目录")?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let folder = host.folder_path(&directory)?;
        catalog_window(&window)?;
        open::that(folder).map_err(|_| "无法打开主题目录".into())
    })
    .await
    .map_err(|_| "打开主题目录任务未能完成".to_owned())?
}

#[tauri::command]
pub async fn open_theme_gallery(window: WebviewWindow) -> Result<(), String> {
    catalog_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        catalog_window(&window)?;
        open::that(THEME_GALLERY).map_err(|_| "无法打开主题网站".into())
    })
    .await
    .map_err(|_| "打开主题网站任务未能完成".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_registered_editors_and_the_native_preferences_label_can_use_catalog_actions() {
        assert!(can_use_catalog("main", true));
        assert!(can_use_catalog("editor-123", true));
        assert!(can_use_catalog("preferences", false));
        for label in [
            "main",
            "editor-123",
            "preferences/frame",
            "print-preview-123",
            "unknown",
        ] {
            assert!(!can_use_catalog(label, false), "{label}");
        }
    }
    #[test]
    fn gallery_is_a_fixed_https_destination_without_input_or_credentials() {
        let url = tauri::Url::parse(THEME_GALLERY).unwrap();
        assert_eq!(url.scheme(), "https");
        assert_eq!(url.host_str(), Some("theme.typora.io"));
        assert!(url.username().is_empty());
        assert!(url.password().is_none());
        assert!(url.query().is_none());
        assert!(url.fragment().is_none());
    }
}
