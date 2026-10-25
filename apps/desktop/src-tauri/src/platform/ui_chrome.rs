//! Native chrome is owned by its editor window; preferences never acquire document capabilities.
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
mod native_title;
#[cfg(target_os = "macos")]
mod native_title_action;
mod title_layout;
#[cfg(windows)]
mod windows;
use title_layout::TitlebarLayout;
pub mod markdown_selection;
#[cfg(target_os = "macos")]
mod native_hover;
#[cfg(target_os = "macos")]
mod native_images;
pub mod theme_selection;

use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow, Window, WindowEvent};

const PREFERENCES_LABEL: &str = "preferences";

#[derive(Default)]
struct PreferencesOrigin {
    opener: Option<String>,
    generation: u64,
    inline: bool,
}

#[derive(Default)]
pub struct PreferencesHost(Mutex<PreferencesOrigin>);

struct FocusReturn {
    opener: String,
    generation: u64,
}

impl PreferencesOrigin {
    fn opened_from(&mut self, label: &str) {
        self.generation = self.generation.wrapping_add(1);
        self.opener = Some(label.to_owned());
        self.inline = false;
    }

    fn surface_label(&self) -> &str {
        if self.inline {
            self.opener.as_deref().unwrap_or(PREFERENCES_LABEL)
        } else {
            PREFERENCES_LABEL
        }
    }

    fn closed(&mut self) -> Option<FocusReturn> {
        let opener = self.opener.take()?;
        self.inline = false;
        self.generation = self.generation.wrapping_add(1);
        Some(FocusReturn {
            opener,
            generation: self.generation,
        })
    }

    fn can_return(&self, ticket: &FocusReturn) -> bool {
        self.opener.is_none() && self.generation == ticket.generation
    }

    fn claim_return(&mut self, ticket: &FocusReturn) -> bool {
        if !self.can_return(ticket) {
            return false;
        }
        self.generation = self.generation.wrapping_add(1);
        true
    }
}

impl PreferencesHost {
    pub(crate) fn generation_for(&self, label: &str) -> Result<u64, String> {
        let origin = self.0.lock().map_err(|_| "偏好设置状态不可用")?;
        if origin.opener.is_none() || origin.surface_label() != label {
            return Err("设置页面已关闭或不属于当前窗口".into());
        }
        Ok(origin.generation)
    }
    #[cfg(test)]
    pub(crate) fn generation(&self) -> Result<u64, String> {
        let origin = self.0.lock().map_err(|_| "偏好设置窗口状态不可用")?;
        if origin.opener.is_none() {
            return Err("偏好设置窗口已关闭".into());
        }
        Ok(origin.generation)
    }
    pub(crate) fn with_generation<T>(
        &self,
        generation: u64,
        operation: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let origin = self.0.lock().map_err(|_| "偏好设置窗口状态不可用")?;
        if origin.opener.is_none() || origin.generation != generation {
            return Err("确认窗口已关闭或更换，历史记录未清除".into());
        }
        operation()
    }
    #[cfg(test)]
    fn opened_from(&self, label: &str) -> Result<(), String> {
        self.0
            .lock()
            .map_err(|_| "偏好设置窗口状态不可用")?
            .opened_from(label);
        Ok(())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChromeCapabilities {
    native: bool,
    /// Who draws the unified titlebar: AppKit accessories, or the WebView itself.
    titlebar: &'static str,
    preferences_window: bool,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChromeUpdate {
    document_id: Option<String>,
    dirty: bool,
    statistics_label: String,
    statistics: StatisticsSnapshot,
    always_show_word_count: bool,
    #[serde(default)]
    dark: bool,
    #[serde(default)]
    outline_panel_open: bool,
    #[serde(default)]
    sidebar_open: bool,
    #[serde(default)]
    ai_panel_open: bool,
    #[serde(default)]
    graph_open: bool,
    #[serde(default)]
    graph_available: bool,
    #[serde(default)]
    source_mode: Option<bool>,
    /// A document is open, so the titlebar offers a way back to the home view.
    #[serde(default)]
    can_close_document: bool,
    #[serde(default)]
    image_preview_open: bool,
    /// Title for a document without a file yet (a day's draft is named after its file).
    #[serde(default)]
    untitled_name: Option<String>,
}

#[derive(Clone, Copy, Deserialize, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) enum StatisticsUnit {
    #[default]
    Words,
    Characters,
    Lines,
    ReadingMinutes,
}

#[derive(Clone, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StatisticsSnapshot {
    words: u64,
    characters: u64,
    lines: u64,
    reading_minutes: u64,
    unit: StatisticsUnit,
}

impl StatisticsSnapshot {
    fn menu_labels(&self) -> [(StatisticsUnit, String); 4] {
        [
            (
                StatisticsUnit::ReadingMinutes,
                format!("{} 分钟", self.reading_minutes),
            ),
            (StatisticsUnit::Lines, format!("{} 行", self.lines)),
            (StatisticsUnit::Words, format!("{} 词", self.words)),
            (
                StatisticsUnit::Characters,
                format!("{} 字符", self.characters),
            ),
        ]
    }
}

pub(super) struct DocumentChrome {
    // Display metadata is never a recent-file, bookmark or IO grant.
    path: Option<PathBuf>,
    file_proxy: bool,
    dirty: bool,
    statistics_label: String,
    statistics: StatisticsSnapshot,
    always_show_word_count: bool,
    dark: bool,
    outline_panel_open: bool,
    sidebar_open: bool,
    ai_panel_open: bool,
    graph_open: bool,
    graph_available: bool,
    source_mode: Option<bool>,
    can_close_document: bool,
    image_preview_open: bool,
    /// Display text only; never a path or an IO grant.
    untitled_name: Option<String>,
}
impl DocumentChrome {
    /// The file name, the draft's own name, or 未命名.
    pub(super) fn title(&self) -> String {
        self.path
            .as_deref()
            .and_then(std::path::Path::file_name)
            .map(|name| name.to_string_lossy().into_owned())
            .or_else(|| self.untitled_name.clone())
            .unwrap_or_else(|| "未命名".into())
    }
}

fn require_editor(window: &WebviewWindow) -> Result<(), String> {
    if crate::windows::is_editor(window) {
        Ok(())
    } else {
        Err("此操作仅允许由编辑窗口发起".into())
    }
}

#[cfg(test)]
fn require_preferences(label: &str) -> Result<(), String> {
    if label == PREFERENCES_LABEL {
        Ok(())
    } else {
        Err("此操作仅允许由偏好设置窗口发起".into())
    }
}

pub(crate) fn require_preferences_session<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<u64, String> {
    window
        .state::<PreferencesHost>()
        .generation_for(window.label())
}

fn document_chrome(
    services: &crate::window_services::WindowServices,
    label: &str,
    update: ChromeUpdate,
) -> Result<DocumentChrome, String> {
    if update.statistics_label.len() > 128 || update.statistics_label.chars().any(char::is_control)
    {
        return Err("字数统计标签无效".into());
    }
    if update.untitled_name.as_deref().is_some_and(|name| {
        name.is_empty()
            || name.chars().count() > 255
            || name
                .chars()
                .any(|c| c.is_control() || matches!(c, '/' | '\\'))
    }) {
        return Err("未命名文稿标题无效".into());
    }
    let documents = services.get_documents(label)?;
    let presentation = update
        .document_id
        .as_deref()
        .map(|id| {
            let store = documents.lock().map_err(|_| "文档状态不可用".to_owned())?;
            let path = store.display_path(id).map_err(|error| error.to_string())?;
            let file_proxy = store.get_metadata(id).is_ok_and(|metadata| {
                metadata.location_state == document_service::DocumentLocationState::Available
            });
            Ok::<_, String>((path, file_proxy))
        })
        .transpose()?;
    Ok(DocumentChrome {
        path: presentation.as_ref().map(|(path, _)| path.clone()),
        file_proxy: presentation.is_some_and(|(_, proxy)| proxy),
        dirty: update.dirty,
        statistics_label: update.statistics_label,
        statistics: update.statistics,
        always_show_word_count: update.always_show_word_count,
        dark: update.dark,
        outline_panel_open: update.outline_panel_open,
        sidebar_open: update.sidebar_open,
        ai_panel_open: update.ai_panel_open,
        graph_open: update.graph_open,
        graph_available: update.graph_available,
        source_mode: if update.graph_open {
            Some(false)
        } else {
            update.source_mode
        },
        can_close_document: update.can_close_document,
        image_preview_open: update.image_preview_open,
        untitled_name: update.untitled_name,
    })
}

#[cfg(target_os = "macos")]
async fn on_main<T: Send + 'static>(
    window: WebviewWindow,
    work: impl FnOnce(&WebviewWindow) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    let dispatcher = window.clone();
    dispatcher
        .run_on_main_thread(move || {
            let result = require_editor(&window).and_then(|_| work(&window));
            let _ = sender.try_send(result);
        })
        .map_err(|error| error.to_string())?;
    receiver
        .recv()
        .await
        .ok_or("原生窗口任务未完成".to_owned())?
}

#[tauri::command]
pub async fn initialise_editor_chrome(window: WebviewWindow) -> Result<ChromeCapabilities, String> {
    require_editor(&window)?;
    crate::debug_tools::window_ready(&window);
    #[cfg(target_os = "macos")]
    let (native, titlebar) = (on_main(window, macos::initialise).await?, "appkit");
    #[cfg(windows)]
    let (native, titlebar) = {
        windows::initialise(window.app_handle(), &window)?;
        (true, "web")
    };
    #[cfg(not(any(target_os = "macos", windows)))]
    let (native, titlebar) = (false, "none");
    Ok(ChromeCapabilities {
        native,
        titlebar,
        preferences_window: true,
    })
}

/// Top-level native menu titles for the WebView-hosted titlebar.
#[tauri::command]
pub async fn list_app_menu(app: AppHandle, window: WebviewWindow) -> Result<Vec<String>, String> {
    require_editor(&window)?;
    #[cfg(windows)]
    return windows::titles(&app);
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("此平台使用系统菜单栏".into())
    }
}

/// Pops up an existing native menu below a titlebar control. `index` selects one
/// top-level menu; no index pops the complete menu tree for compact windows.
#[tauri::command]
pub async fn popup_app_menu(
    app: AppHandle,
    window: WebviewWindow,
    index: Option<usize>,
    x: f64,
    y: f64,
    viewport_width: f64,
) -> Result<(), String> {
    require_editor(&window)?;
    let valid = |value: f64| value.is_finite() && (0.0..=65_536.0).contains(&value);
    if !valid(x)
        || !valid(y)
        || !viewport_width.is_finite()
        || !(1.0..=131_072.0).contains(&viewport_width)
    {
        return Err("菜单坐标无效".into());
    }
    #[cfg(windows)]
    {
        // CSS pixels follow the webview zoom; native popups are positioned in logical pixels.
        let scale = window
            .inner_size()
            .map_err(|error| error.to_string())?
            .to_logical::<f64>(window.scale_factor().map_err(|error| error.to_string())?)
            .width
            / viewport_width;
        let (x, y) = (x * scale, y * scale);
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);
        let dispatcher = app.clone();
        dispatcher
            .run_on_main_thread(move || {
                let result =
                    windows::popup(&app, &window, index, tauri::LogicalPosition::new(x, y));
                let _ = sender.send(result);
            })
            .map_err(|error| error.to_string())?;
        tauri::async_runtime::spawn_blocking(move || {
            receiver
                .recv()
                .map_err(|_| "原生菜单任务未完成".to_owned())?
        })
        .await
        .map_err(|_| "原生菜单任务未完成".to_owned())?
    }
    #[cfg(not(windows))]
    {
        let _ = (app, index);
        Err("此平台使用系统菜单栏".into())
    }
}

#[tauri::command]
pub async fn update_editor_title_layout(
    window: WebviewWindow,
    payload: TitlebarLayout,
) -> Result<(), String> {
    require_editor(&window)?;
    let layout = payload.validate()?;
    #[cfg(target_os = "macos")]
    return on_main(window, move |window| {
        macos::update_title_layout(window.label(), layout)
    })
    .await;
    #[cfg(not(target_os = "macos"))]
    {
        let _ = layout;
        Ok(())
    }
}

#[tauri::command]
pub async fn update_editor_chrome(
    window: WebviewWindow,
    payload: ChromeUpdate,
) -> Result<(), String> {
    require_editor(&window)?;
    #[cfg(target_os = "macos")]
    return on_main(window, move |window| {
        let update = document_chrome(
            &window.state::<crate::window_services::WindowServices>(),
            window.label(),
            payload,
        )?;
        macos::update(window.label(), update)
    })
    .await;
    #[cfg(not(target_os = "macos"))]
    {
        let update = document_chrome(
            &window.state::<crate::window_services::WindowServices>(),
            window.label(),
            payload,
        )?;
        #[cfg(windows)]
        windows::update(&window, &update)?;
        // Keep validation and ownership identical even where native chrome is unavailable.
        let _ = (
            update.path,
            update.file_proxy,
            update.dirty,
            update.statistics_label,
            update.statistics.menu_labels(),
            update.always_show_word_count,
            update.dark,
            update.outline_panel_open,
            update.ai_panel_open,
            update.graph_open,
            update.graph_available,
            update.source_mode,
            update.can_close_document,
        );
        Ok(())
    }
}

#[tauri::command]
pub async fn open_preferences_window(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<bool, String> {
    require_editor(&window)?;
    let other = {
        let host = app.state::<PreferencesHost>();
        let mut origin = host.0.lock().map_err(|_| "偏好设置状态不可用")?;
        if origin.inline && origin.opener.as_deref() != Some(window.label()) {
            origin.opener.clone()
        } else {
            if !origin.inline || origin.opener.is_none() {
                origin.opened_from(window.label());
                origin.inline = true;
            }
            None
        }
    };
    if let Some(label) = other {
        app.get_webview_window(&label)
            .ok_or("设置所属窗口已关闭")?
            .set_focus()
            .map_err(|error| error.to_string())?;
        return Ok(false);
    }
    theme_selection::origin_changed(&app);
    markdown_selection::origin_changed(&app);
    #[cfg(target_os = "macos")]
    on_main(window, |window| {
        macos::set_preferences_page(window.label(), true)
    })
    .await?;
    Ok(true)
}

#[tauri::command]
pub async fn close_preferences_window(window: WebviewWindow) -> Result<(), String> {
    if window.label() == PREFERENCES_LABEL {
        return window.destroy().map_err(|error| error.to_string());
    }
    {
        let host = window.state::<PreferencesHost>();
        let mut origin = host.0.lock().map_err(|_| "偏好设置状态不可用")?;
        if !origin.inline || origin.opener.as_deref() != Some(window.label()) {
            return Err("设置页面已关闭或不属于当前窗口".into());
        }
        origin.closed();
    }
    theme_selection::origin_changed(window.app_handle());
    markdown_selection::origin_changed(window.app_handle());
    #[cfg(target_os = "macos")]
    on_main(window, |window| {
        macos::set_preferences_page(window.label(), false)
    })
    .await?;
    Ok(())
}

#[tauri::command]
pub fn preferences_changed(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    require_preferences_session(&window)?;
    for (label, editor) in app.webview_windows() {
        if crate::windows::is_editor(&editor) {
            crate::windows::emit_to_editor(&app, &label, "preferences-changed", ())?;
        }
    }
    Ok(())
}

pub fn handle_window(window: &Window, event: &WindowEvent) {
    theme_selection::handle_window(window, event);
    markdown_selection::handle_window(window, event);
    if matches!(event, WindowEvent::Destroyed) {
        let host = window.state::<PreferencesHost>();
        if let Ok(mut origin) = host.0.lock() {
            if origin.inline && origin.opener.as_deref() == Some(window.label()) {
                origin.closed();
            }
        };
    }
    if window.label() == PREFERENCES_LABEL && matches!(event, WindowEvent::Focused(true)) {
        if let Err(error) = crate::menu::themes::schedule_sync(window.app_handle()) {
            eprintln!("Preferences theme menu synchronization failed: {error}");
        }
    }
    if window.label() == PREFERENCES_LABEL && matches!(event, WindowEvent::Destroyed) {
        return_to_opener(window);
    }
    #[cfg(target_os = "macos")]
    match event {
        WindowEvent::Destroyed => {
            let label = window.label().to_owned();
            let _ = window.run_on_main_thread(move || macos::release(&label));
        }
        WindowEvent::Resized(_) | WindowEvent::Focused(_) => {
            let label = window.label().to_owned();
            let _ = window.run_on_main_thread(move || macos::window_changed(&label));
        }
        _ => {}
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (window, event);
}

fn return_to_opener(window: &Window) {
    let app = window.app_handle().clone();
    let Some(ticket) = app
        .state::<PreferencesHost>()
        .0
        .lock()
        .ok()
        .and_then(|mut state| state.closed())
    else {
        return;
    };
    let dispatcher = app.clone();
    if let Err(error) = dispatcher.run_on_main_thread(move || {
        // A new preferences instance or request supersedes this delayed close handoff.
        if app.get_webview_window(PREFERENCES_LABEL).is_some() {
            return;
        }
        if let Err(error) = restore_opener(&app, &ticket) {
            eprintln!("Preferences focus return failed: {error}");
        }
    }) {
        eprintln!("Preferences focus return could not be scheduled: {error}");
    }
}

fn restore_opener<R: Runtime>(app: &AppHandle<R>, ticket: &FocusReturn) -> Result<(), String> {
    let current = app
        .state::<PreferencesHost>()
        .0
        .lock()
        .is_ok_and(|mut state| state.claim_return(ticket));
    if !current {
        return Ok(());
    }
    let Some(editor) = app
        .get_webview_window(&ticket.opener)
        .filter(crate::windows::is_editor)
    else {
        return Ok(());
    };
    editor.set_focus().map_err(|error| error.to_string())?;
    crate::windows::emit_to_editor(app, &ticket.opener, "preferences-closed", ())
}

/// Preferences owns no document session. Global document menu actions stop here.
pub fn handle_menu<R: Runtime>(app: &AppHandle<R>, event: &tauri::menu::MenuEvent) -> bool {
    let Some(preferences) = app.get_webview_window(PREFERENCES_LABEL) else {
        return false;
    };
    if !crate::windows::is_focused(&preferences).unwrap_or(false) {
        return false;
    }
    let result = match event.id().as_ref() {
        "close" => preferences.destroy(),
        "preferences" => preferences.set_focus(),
        _ => return true,
    };
    if let Err(error) = result {
        eprintln!("Preferences menu action failed: {error}");
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::WebviewWindowBuilder;

    #[test]
    fn embedded_settings_authority_belongs_only_to_the_active_page_generation() {
        let host = PreferencesHost::default();
        assert!(host.generation_for("main").is_err());
        {
            let mut origin = host.0.lock().unwrap();
            origin.opened_from("main");
            origin.inline = true;
        }
        let generation = host.generation_for("main").unwrap();
        assert!(host.generation_for("editor-other").is_err());
        assert!(host.generation_for("preferences").is_err());
        assert!(host.generation_for("preview-1").is_err());
        host.0.lock().unwrap().closed();
        assert!(host.generation_for("main").is_err());
        assert!(host.with_generation(generation, || Ok(())).is_err());
        {
            let mut origin = host.0.lock().unwrap();
            origin.opened_from("main");
            origin.inline = true;
        }
        assert_ne!(host.generation_for("main").unwrap(), generation);
        assert!(host.with_generation(generation, || Ok(())).is_err());
    }

    #[test]
    fn a_closed_or_reopened_preferences_generation_cannot_clear_history() {
        let host = PreferencesHost::default();
        host.opened_from("main").unwrap();
        let generation = host.generation().unwrap();
        host.with_generation(generation, || Ok(())).unwrap();
        host.0.lock().unwrap().closed();
        assert!(host
            .with_generation::<()>(generation, || panic!("closed operation executed"))
            .is_err());
        host.opened_from("editor-second").unwrap();
        assert!(host
            .with_generation::<()>(generation, || panic!("stale operation executed"))
            .is_err());
        let latest = host.generation().unwrap();
        assert!(host
            .with_generation(latest, || Err::<(), _>("expected failure".into()))
            .is_err());
        host.with_generation(latest, || Ok(())).unwrap();
    }

    #[test]
    fn preferences_close_returns_only_to_latest_opener_once() {
        let mut state = PreferencesOrigin::default();
        assert!(state.closed().is_none());
        state.opened_from("main");
        state.opened_from("editor-second");
        let ticket = state.closed().unwrap();
        assert_eq!(ticket.opener, "editor-second");
        assert!(state.can_return(&ticket));
        assert!(state.closed().is_none());
        state.opened_from("main");
        assert!(!state.can_return(&ticket));
        let next = state.closed().unwrap();
        assert!(state.can_return(&next));
        assert!(!state.can_return(&ticket));
    }

    #[test]
    fn preferences_focus_event_never_retargets_another_editor_or_a_new_generation() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
        use tauri::Listener;
        let app = tauri::test::mock_builder()
            .manage(PreferencesHost::default())
            .manage(crate::window_services::WindowServices::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let first = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let second = WebviewWindowBuilder::new(&app, "editor-second", Default::default())
            .build()
            .unwrap();
        let services = app.state::<crate::window_services::WindowServices>();
        services.register("main").unwrap();
        services.register("editor-second").unwrap();
        let a = Arc::new(AtomicUsize::new(0));
        let b = Arc::new(AtomicUsize::new(0));
        let a_count = a.clone();
        let b_count = b.clone();
        first.listen("preferences-closed", move |_| {
            a_count.fetch_add(1, Ordering::SeqCst);
        });
        second.listen("preferences-closed", move |_| {
            b_count.fetch_add(1, Ordering::SeqCst);
        });
        let host = app.state::<PreferencesHost>();
        host.opened_from("main").unwrap();
        host.opened_from("editor-second").unwrap();
        let ticket = host.0.lock().unwrap().closed().unwrap();
        restore_opener(app.handle(), &ticket).unwrap();
        assert_eq!(a.load(Ordering::SeqCst), 0);
        assert_eq!(b.load(Ordering::SeqCst), 1);
        restore_opener(app.handle(), &ticket).unwrap();
        assert_eq!(b.load(Ordering::SeqCst), 1);
        host.opened_from("editor-second").unwrap();
        let vanished = host.0.lock().unwrap().closed().unwrap();
        services.remove("editor-second").unwrap();
        restore_opener(app.handle(), &vanished).unwrap();
        assert_eq!(a.load(Ordering::SeqCst), 0);
        assert_eq!(b.load(Ordering::SeqCst), 1);
        services.register("editor-second").unwrap();
        host.opened_from("editor-second").unwrap();
        let superseded = host.0.lock().unwrap().closed().unwrap();
        host.opened_from("main").unwrap();
        restore_opener(app.handle(), &superseded).unwrap();
        assert_eq!(a.load(Ordering::SeqCst), 0);
        assert_eq!(b.load(Ordering::SeqCst), 1);
        let next = host.0.lock().unwrap().closed().unwrap();
        restore_opener(app.handle(), &next).unwrap();
        assert_eq!(a.load(Ordering::SeqCst), 1);
        assert_eq!(b.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn chrome_document_path_requires_owning_editor_and_live_document() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("中文 note.md");
        std::fs::write(&path, "content").unwrap();
        let services = crate::window_services::WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-other").unwrap();
        let documents = services.get_documents("main").unwrap();
        let document = documents.lock().unwrap().open_authorized(&path).unwrap();
        let payload = || ChromeUpdate {
            document_id: Some(document.id.clone()),
            dirty: true,
            statistics_label: "2 词".into(),
            statistics: StatisticsSnapshot::default(),
            always_show_word_count: true,
            dark: false,
            outline_panel_open: false,
            sidebar_open: true,
            ai_panel_open: false,
            graph_open: false,
            graph_available: false,
            source_mode: None,
            can_close_document: false,
            image_preview_open: false,
            untitled_name: Some("2026-10-21.md".into()),
        };
        let value = document_chrome(&services, "main", payload()).unwrap();
        // A real file always names the window; the draft name is only a fallback.
        assert_eq!(value.title(), "中文 note.md");
        assert_eq!(value.path, Some(path.canonicalize().unwrap()));
        assert!(value.dirty);
        assert!(value.sidebar_open);
        assert!(document_chrome(&services, "editor-other", payload()).is_err());
        assert!(document_chrome(&services, "preferences", payload()).is_err());
        documents.lock().unwrap().close(&document.id);
        assert!(document_chrome(&services, "main", payload()).is_err());
    }

    #[test]
    fn chrome_payload_cannot_supply_a_path_or_multiline_statistics() {
        let mut payload = serde_json::json!({
            "documentId": null, "dirty": false, "statisticsLabel": "0 词", "alwaysShowWordCount": true,
            "statistics": { "words": 0, "characters": 0, "lines": 0, "readingMinutes": 0, "unit": "words" }
        });
        for open in [false, true, false] {
            payload["sidebarOpen"] = open.into();
            assert_eq!(
                serde_json::from_value::<ChromeUpdate>(payload.clone())
                    .unwrap()
                    .sidebar_open,
                open
            );
        }
        assert!(
            !serde_json::from_value::<ChromeUpdate>(payload.clone())
                .unwrap()
                .outline_panel_open
        );
        payload["outlinePanelOpen"] = true.into();
        assert!(
            serde_json::from_value::<ChromeUpdate>(payload.clone())
                .unwrap()
                .outline_panel_open
        );
        assert!(serde_json::from_value::<ChromeUpdate>(payload.clone())
            .unwrap()
            .source_mode
            .is_none());
        payload["sourceMode"] = true.into();
        assert_eq!(
            serde_json::from_value::<ChromeUpdate>(payload.clone())
                .unwrap()
                .source_mode,
            Some(true)
        );
        let mut invalid_mode = payload.clone();
        invalid_mode["sourceMode"] = "source".into();
        assert!(serde_json::from_value::<ChromeUpdate>(invalid_mode).is_err());
        payload["path"] = "/tmp/other.md".into();
        assert!(serde_json::from_value::<ChromeUpdate>(payload).is_err());
        let services = crate::window_services::WindowServices::default();
        services.register("main").unwrap();
        for label in ["line\nline".into(), "x".repeat(129)] {
            assert!(document_chrome(
                &services,
                "main",
                ChromeUpdate {
                    document_id: None,
                    dirty: false,
                    statistics_label: label,
                    statistics: StatisticsSnapshot::default(),
                    always_show_word_count: true,
                    dark: false,
                    outline_panel_open: false,
                    sidebar_open: false,
                    ai_panel_open: false,
                    graph_open: false,
                    graph_available: false,
                    source_mode: None,
                    can_close_document: false,
                    image_preview_open: false,
                    untitled_name: None,
                }
            )
            .is_err());
        }
        let untitled = |name: Option<&str>| ChromeUpdate {
            document_id: None,
            dirty: false,
            statistics_label: "0 词".into(),
            statistics: StatisticsSnapshot::default(),
            always_show_word_count: true,
            dark: false,
            outline_panel_open: false,
            sidebar_open: false,
            ai_panel_open: false,
            graph_open: false,
            graph_available: false,
            source_mode: None,
            can_close_document: false,
            image_preview_open: false,
            untitled_name: name.map(str::to_owned),
        };
        assert_eq!(
            document_chrome(&services, "main", untitled(None))
                .unwrap()
                .title(),
            "未命名"
        );
        assert_eq!(
            document_chrome(&services, "main", untitled(Some("2026-10-21.md")))
                .unwrap()
                .title(),
            "2026-10-21.md"
        );
        for name in ["", "a/b.md", "a\\b.md", "line\nline"] {
            assert!(document_chrome(&services, "main", untitled(Some(name))).is_err());
        }
        let long = "日".repeat(256);
        assert!(document_chrome(&services, "main", untitled(Some(&long))).is_err());
        assert!(require_preferences("main").is_err());
        assert!(require_preferences("preview-1").is_err());
        assert!(require_preferences("preferences").is_ok());
    }

    #[test]
    fn trashed_title_uses_own_metadata_without_restoring_file_authority() {
        use document_service::RenameKind;
        use std::sync::Arc;
        let temporary = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(temporary.path()).unwrap();
        let original = root.join("Note.md");
        let holding = root.join("holding.md");
        std::fs::write(&original, b"Alpha\r\n").unwrap();
        let services = crate::window_services::WindowServices::default();
        services.register("main").unwrap();
        services.register("editor-other").unwrap();
        let documents = services.get_documents("main").unwrap();
        let document = {
            let mut store = documents.lock().unwrap();
            let document = store.open_authorized(&original).unwrap();
            let parent = Arc::new(
                cap_std::fs::Dir::open_ambient_dir(&root, cap_std::ambient_authority()).unwrap(),
            );
            let plan = store
                .prepare_trash(
                    parent,
                    std::path::Path::new("Note.md"),
                    &original,
                    RenameKind::File,
                    uuid::Uuid::new_v4(),
                )
                .unwrap();
            std::fs::rename(&original, &holding).unwrap();
            plan.commit();
            assert!(store.authorized_path(&document.id).is_err());
            assert!(store.save(&document.id, "Dirty").is_err());
            document
        };
        let payload = || ChromeUpdate {
            document_id: Some(document.id.clone()),
            dirty: true,
            statistics_label: "1 词".into(),
            statistics: StatisticsSnapshot::default(),
            always_show_word_count: true,
            dark: false,
            outline_panel_open: false,
            sidebar_open: false,
            ai_panel_open: false,
            graph_open: false,
            graph_available: false,
            source_mode: Some(false),
            can_close_document: false,
            image_preview_open: false,
            untitled_name: None,
        };
        let chrome = document_chrome(&services, "main", payload())
            .expect("Trashed is an expected display state, not a titlebar failure");
        assert_eq!(chrome.path, Some(original.clone()));
        assert!(!chrome.file_proxy);
        assert!(document_chrome(&services, "editor-other", payload()).is_err());
        assert_eq!(std::fs::read(&holding).unwrap(), b"Alpha\r\n");
        assert!(!original.exists());
        assert!(documents
            .lock()
            .unwrap()
            .authorized_path(&document.id)
            .is_err());
    }

    #[test]
    fn native_statistics_menu_preserves_original_order_labels_and_zero_minutes() {
        let statistics = StatisticsSnapshot {
            words: 30,
            characters: 330,
            lines: 20,
            reading_minutes: 0,
            unit: StatisticsUnit::Words,
        };
        assert_eq!(
            statistics.menu_labels(),
            [
                (StatisticsUnit::ReadingMinutes, "0 分钟".into()),
                (StatisticsUnit::Lines, "20 行".into()),
                (StatisticsUnit::Words, "30 词".into()),
                (StatisticsUnit::Characters, "330 字符".into()),
            ]
        );
        assert_eq!(statistics.unit, StatisticsUnit::Words);
        assert!(serde_json::from_value::<ChromeUpdate>(serde_json::json!({
            "documentId": null, "dirty": false, "statisticsLabel": "0 词", "alwaysShowWordCount": true,
            "statistics": { "words": -1, "characters": 0, "lines": 0, "readingMinutes": 0, "unit": "words" }
        })).is_err());
    }
}
