//! Editor windows and serialized, cancellable application shutdown.
mod native_tabs;
use serde::Serialize;
use std::{
    collections::{HashSet, VecDeque},
    sync::Mutex,
};
use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window,
    WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

const MAX_WINDOWS: usize = 32;

#[derive(Default)]
struct Lifecycle {
    labels: HashSet<String>,
    ready: HashSet<String>,
    quit: Option<Quit>,
}
struct Quit {
    token: String,
    remaining: VecDeque<String>,
    current: Option<String>,
    sent: bool,
}
#[derive(Clone, Serialize, Debug, PartialEq)]
struct QuitRequest {
    token: String,
}
#[derive(Default)]
pub struct EditorWindows(Mutex<Lifecycle>);

impl Lifecycle {
    fn register(&mut self, label: &str) -> Result<(), String> {
        if self.quit.is_some() {
            return Err("正在退出应用，请先完成或取消关闭".into());
        }
        if self.labels.len() >= MAX_WINDOWS {
            return Err("已达到32个编辑窗口上限".into());
        }
        if !self.labels.insert(label.into()) {
            return Err("编辑窗口已存在".into());
        }
        Ok(())
    }
    fn begin_quit(&mut self, token: String, focused: Option<&str>) {
        if self.quit.is_some() {
            return;
        }
        let mut labels: Vec<_> = self.labels.iter().cloned().collect();
        labels.sort();
        if let Some(index) = labels
            .iter()
            .position(|label| Some(label.as_str()) == focused)
        {
            let first = labels.remove(index);
            labels.insert(0, first);
        }
        self.quit = Some(Quit {
            token,
            remaining: labels.into(),
            current: None,
            sent: false,
        });
    }
    fn next(&mut self) -> Option<(String, QuitRequest)> {
        let quit = self.quit.as_mut()?;
        if quit.current.is_none() {
            quit.current = quit.remaining.pop_front();
            quit.sent = false;
        }
        let label = quit.current.as_ref()?;
        if quit.sent || !self.ready.contains(label) {
            return None;
        }
        quit.sent = true;
        Some((
            label.clone(),
            QuitRequest {
                token: quit.token.clone(),
            },
        ))
    }
    fn cancel(&mut self, label: &str, token: &str) -> bool {
        if !self
            .quit
            .as_ref()
            .is_some_and(|quit| quit.token == token && quit.current.as_deref() == Some(label))
        {
            return false;
        }
        self.quit = None;
        true
    }
    fn authorize_close(&self, label: &str, token: Option<&str>) -> bool {
        self.labels.contains(label)
            && token.is_none_or(|token| {
                self.quit.as_ref().is_some_and(|quit| {
                    quit.token == token && quit.current.as_deref() == Some(label)
                })
            })
    }
    fn remove(&mut self, label: &str) {
        self.labels.remove(label);
        self.ready.remove(label);
        if let Some(quit) = &mut self.quit {
            quit.remaining.retain(|entry| entry != label);
            if quit.current.as_deref() == Some(label) {
                quit.current = None;
                quit.sent = false;
            }
        }
    }
}

pub fn is_editor<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    window
        .state::<crate::window_services::WindowServices>()
        .contains(window.label())
}
/// Window::emit also broadcasts in Tauri; use an explicit label for editor actions.
pub fn emit_to_editor<R: Runtime, S: Serialize + Clone>(
    app: &AppHandle<R>,
    label: &str,
    event: &str,
    payload: S,
) -> Result<(), String> {
    if !app
        .state::<crate::window_services::WindowServices>()
        .contains(label)
    {
        return Err("编辑窗口已关闭".into());
    }
    app.emit_to(label, event, payload)
        .map_err(|error| error.to_string())
}
pub fn focused_editor<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    let mut windows = app
        .webview_windows()
        .into_values()
        .filter(|window| window.is_focused().unwrap_or(false));
    let window = windows.next()?;
    if windows.next().is_some() || !is_editor(&window) {
        None
    } else {
        Some(window)
    }
}
pub fn register<R: Runtime>(app: &AppHandle<R>, label: &str) -> Result<(), String> {
    app.state::<EditorWindows>()
        .0
        .lock()
        .map_err(|_| "窗口状态不可用")?
        .register(label)?;
    if let Err(error) = app
        .state::<crate::window_services::WindowServices>()
        .register(label)
        .and_then(|_| {
            app.state::<crate::commands::recovery::RecoveryHost>()
                .register_window(label)
        })
        .and_then(|_| {
            app.state::<crate::themes::ThemeHost>()
                .register_window(label)
        })
    {
        app.state::<crate::themes::ThemeHost>()
            .release_window(label);
        let _ = app
            .state::<crate::commands::recovery::RecoveryHost>()
            .release_window(label);
        let _ = app
            .state::<crate::window_services::WindowServices>()
            .remove(label);
        if let Ok(mut state) = app.state::<EditorWindows>().0.lock() {
            state.remove(label);
        }
        return Err(error);
    }
    Ok(())
}
fn release<R: Runtime>(app: &AppHandle<R>, label: &str) {
    crate::os_open::release_owner(app, label);
    app.state::<crate::startup::StartupHost>().release(label);
    app.state::<crate::themes::ThemeHost>()
        .release_window(label);
    if let Err(error) = app
        .state::<crate::commands::recovery::RecoveryHost>()
        .release_window(label)
    {
        eprintln!("Recovery window cleanup: {error}");
    }
    if let Err(error) = app
        .state::<crate::window_services::WindowServices>()
        .remove(label)
    {
        eprintln!("Window service cleanup: {error}");
    }
    if let Ok(mut state) = app.state::<EditorWindows>().0.lock() {
        state.remove(label);
    }
}

#[tauri::command]
pub async fn create_editor_window(
    app: AppHandle,
    window: WebviewWindow,
    kind: Option<String>,
) -> Result<String, String> {
    if !is_editor(&window) {
        return Err("此操作仅允许由编辑窗口发起".into());
    }
    if kind.as_deref() == Some("tab") && !cfg!(target_os = "macos") {
        return Err("当前平台使用独立编辑窗口，尚不支持原生标签分组".into());
    }
    let host = app.state::<crate::startup::StartupHost>();
    let target = match kind.as_deref().unwrap_or("window") {
        "document" | "tab" | "open" => host.new_document_target(&app, window.label())?,
        "window" => host.new_window_target(&app)?,
        _ => return Err("新建窗口类型无效".into()),
    };
    let target = if kind.as_deref() == Some("open") {
        let picker = window.clone();
        Some(
            tauri::async_runtime::spawn_blocking(move || {
                let filters = picker
                    .state::<crate::file_preferences::FilePreferencesHost>()
                    .document_types(picker.app_handle())?
                    .enabled_extensions();
                let path = picker
                    .app_handle()
                    .dialog()
                    .file()
                    .set_parent(&picker)
                    .set_title("打开 Markdown 文档")
                    .add_filter(
                        "Markdown / Text",
                        &filters.iter().map(String::as_str).collect::<Vec<_>>(),
                    )
                    .add_filter("所有文件", &["*"])
                    .blocking_pick_file()
                    .ok_or("已取消选择文件")?
                    .into_path()
                    .map_err(|_| "无法读取所选文件路径")?;
                if !is_editor(&picker) {
                    return Err("发起窗口已关闭，所选文件未打开".into());
                }
                picker
                    .state::<crate::file_preferences::FilePreferencesHost>()
                    .require_document_type(picker.app_handle(), &path)?;
                let mut documents = document_service::DocumentService::new();
                let opened = documents
                    .open_authorized(&path)
                    .map_err(|e| e.to_string())?;
                let bookmark = documents.bookmark(&opened.id).map_err(|e| e.to_string())?;
                Ok::<_, String>(target.unwrap_or_default().with_opened_document(bookmark))
            })
            .await
            .map_err(|_| "打开文稿任务未完成")??,
        )
    } else {
        target
    };
    let tab = kind.as_deref() == Some("tab")
        || matches!(kind.as_deref(), Some("document" | "open"))
            && native_tabs::prefers_tab(window.clone()).await?;
    let label = build_editor_window(&app, target)?;
    if tab {
        if let Some(created) = app.get_webview_window(&label) {
            native_tabs::attach(created, window.label().into()).await?;
        }
    }
    Ok(label)
}

#[tauri::command]
pub(crate) async fn native_tab_action(
    window: WebviewWindow,
    action: native_tabs::TabAction,
) -> Result<(), String> {
    allow_tab_operation(&window)?;
    native_tabs::action(window, action).await
}
fn allow_tab_operation(window: &WebviewWindow) -> Result<(), String> {
    if !is_editor(window) {
        return Err("此操作仅允许由编辑窗口发起".into());
    }
    if window
        .state::<EditorWindows>()
        .0
        .lock()
        .map_err(|_| "窗口状态不可用")?
        .quit
        .is_some()
    {
        return Err("正在退出应用，请先完成或取消关闭".into());
    }
    Ok(())
}

/// Reuses the existing native window/tab policy for an already authorized OS
/// target. The source document is never loaded, cleared or closed here.
pub(crate) async fn open_os_target(
    app: &AppHandle,
    parent: &str,
    target: crate::startup::StartupTarget,
) -> Result<String, String> {
    let source = app.get_webview_window(parent).filter(is_editor);
    if let Some(source) = &source {
        allow_os_open(source)?;
    }
    let tab = if let Some(source) = source {
        native_tabs::prefers_tab(source).await?
    } else {
        false
    };
    let label = build_editor_window(app, Some(target))?;
    if tab {
        if let Some(created) = app.get_webview_window(&label) {
            // A tab attach error cannot discard the newly opened editor.
            if let Err(error) = native_tabs::attach(created, parent.into()).await {
                eprintln!("OS open remained in a separate window: {error}");
            }
        }
    }
    Ok(label)
}
pub(crate) fn allow_os_open(window: &WebviewWindow) -> Result<(), String> {
    allow_tab_operation(window)
}

pub(crate) fn build_editor_window(
    app: &AppHandle,
    target: Option<crate::startup::StartupTarget>,
) -> Result<String, String> {
    build_reserved_editor_window(reserve_editor_window(app, target)?)
}

/// Native-only authorization lease. An unshown/cancelled reservation never
/// leaves a bootstrap, recovery registration or workspace service behind.
pub(crate) struct ReservedEditorWindow<R: Runtime = tauri::Wry> {
    app: AppHandle<R>,
    label: Option<String>,
}
impl<R: Runtime> Drop for ReservedEditorWindow<R> {
    fn drop(&mut self) {
        if let Some(label) = self.label.take() {
            release(&self.app, &label);
            // An unshown, not-ready reservation may be the final item in Quit's
            // queue. Cleanup has no Destroyed event to advance that queue.
            let app = self.app.clone();
            tauri::async_runtime::spawn(async move {
                advance_quit(&app);
            });
        }
    }
}
pub(crate) fn reserve_editor_window<R: Runtime>(
    app: &AppHandle<R>,
    target: Option<crate::startup::StartupTarget>,
) -> Result<ReservedEditorWindow<R>, String> {
    let label = format!("editor-{}", uuid::Uuid::new_v4());
    register(app, &label)?;
    if let Err(error) = app
        .state::<crate::startup::StartupHost>()
        .set_bootstrap_reserved(&label, target.unwrap_or_default())
    {
        release(app, &label);
        return Err(error);
    }
    Ok(ReservedEditorWindow {
        app: app.clone(),
        label: Some(label),
    })
}
pub(crate) fn build_reserved_editor_window(
    mut reserved: ReservedEditorWindow,
) -> Result<String, String> {
    let app = &reserved.app;
    let label = reserved.label.as_ref().ok_or("新窗口授权已释放")?.clone();
    // Async command: creating a WebView on the synchronous IPC thread can deadlock WebView2.
    let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("未命名 — MarkLyra")
        .inner_size(1180.0, 800.0)
        .min_inner_size(700.0, 480.0)
        .disable_drag_drop_handler()
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny);
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(false);
    let result = builder.build();
    match result {
        Ok(_) => {
            let published = app
                .state::<crate::startup::StartupHost>()
                .publish_bootstrap(&label);
            // An actual window now owns these registrations. Do not let a later
            // archive bookkeeping error destroy a potentially ready editor.
            reserved.label = None;
            published.map_err(|error| format!("新窗口已打开，但会话归档未能确认：{error}"))?;
            Ok(label)
        }
        Err(error) => Err(error.to_string()),
    }
}

pub fn restore_initial(app: &AppHandle) {
    native_tabs::setup();
    let host = app.state::<crate::startup::StartupHost>();
    let result = (|| {
        let mut targets = host.plan_initial(app)?.into_iter();
        let first = targets.next().unwrap_or_default();
        let mut tabs = Vec::new();
        if let Some(tab) = first.native_tab() {
            tabs.push(("main".into(), tab));
        }
        host.set_bootstrap("main", first)?;
        for target in targets {
            let tab = target.native_tab();
            match build_editor_window(app, Some(target)) {
                Ok(label) => {
                    if let Some(tab) = tab {
                        tabs.push((label, tab));
                    }
                }
                Err(error) => {
                    let _ = host.add_warning("main", format!("部分窗口未能恢复：{error}"));
                }
            }
        }
        native_tabs::restore(app, tabs);
        Ok::<(), String>(())
    })();
    if let Err(error) = result {
        let _ = host.add_warning("main", format!("启动会话未能恢复：{error}"));
    }
}

fn backup_session(app: &AppHandle, label: &str, token: Option<&str>) -> Result<(), String> {
    {
        let host = app.state::<EditorWindows>();
        let state = host.0.lock().map_err(|_| "窗口状态不可用")?;
        if !state.authorize_close(label, token) {
            return Err("关闭会话请求已失效".into());
        }
    }
    native_tabs::capture(app)?;
    app.state::<crate::startup::StartupHost>().backup(app)?;
    Ok(())
}

#[tauri::command]
pub async fn backup_editor_session(
    window: WebviewWindow,
    quit_token: Option<String>,
) -> Result<(), String> {
    if !is_editor(&window) {
        return Err("编辑窗口已关闭".into());
    }
    backup_session(window.app_handle(), window.label(), quit_token.as_deref())
}

#[tauri::command]
pub fn editor_window_focused(window: WebviewWindow) -> Result<bool, String> {
    if !is_editor(&window) {
        return Err("编辑窗口已关闭".into());
    }
    window.is_focused().map_err(|error| error.to_string())
}
#[tauri::command]
pub async fn editor_window_ready(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    if !is_editor(&window) {
        return Err("编辑窗口已关闭".into());
    }
    if let Err(error) = native_tabs::initialise(window.clone()).await {
        eprintln!("Native tabs unavailable: {error}");
    }
    app.state::<EditorWindows>()
        .0
        .lock()
        .map_err(|_| "窗口状态不可用")?
        .ready
        .insert(window.label().into());
    advance_quit(&app);
    Ok(())
}
#[tauri::command]
pub async fn close_editor_window(
    window: WebviewWindow,
    quit_token: Option<String>,
) -> Result<(), String> {
    let allowed = window
        .state::<EditorWindows>()
        .0
        .lock()
        .map_err(|_| "窗口状态不可用")?
        .authorize_close(window.label(), quit_token.as_deref());
    if !allowed {
        return Err("关闭请求已失效，文档保持打开".into());
    }
    if let Err(error) = backup_session(window.app_handle(), window.label(), quit_token.as_deref()) {
        // File/recovery safety has its own confirmed close protocol. Optional
        // session metadata failure must not permanently trap a saved window.
        eprintln!("Closing window without a new session archive: {error}");
    }
    window.destroy().map_err(|error| error.to_string())
}
#[tauri::command]
pub fn cancel_application_quit(window: WebviewWindow, token: String) -> Result<(), String> {
    let host = window.state::<EditorWindows>();
    let mut state = host.0.lock().map_err(|_| "窗口状态不可用")?;
    if state.cancel(window.label(), &token) {
        window
            .state::<crate::startup::StartupHost>()
            .end_quit_backup();
        Ok(())
    } else {
        Err("退出请求已失效".into())
    }
}
pub fn request_quit(app: &AppHandle) {
    if let Err(error) = native_tabs::capture(app) {
        eprintln!("Native tab archive unavailable: {error}");
    }
    let focused = focused_editor(app).map(|window| window.label().to_owned());
    let waiting_for_startup = {
        let host = app.state::<EditorWindows>();
        let Ok(mut state) = host.0.lock() else {
            return;
        };
        if state
            .labels
            .iter()
            .any(|label| !state.ready.contains(label))
        {
            true
        } else {
            if state.quit.is_none() {
                // Hold the lifecycle gate across the in-memory batch transition:
                // an old cancellation cannot clear a newly started archive.
                if let Err(error) = app
                    .state::<crate::startup::StartupHost>()
                    .begin_quit_backup()
                {
                    eprintln!("Could not start quit session archive: {error}");
                }
                state.begin_quit(uuid::Uuid::new_v4().to_string(), focused.as_deref());
            }
            false
        }
    };
    if waiting_for_startup {
        app.dialog()
            .message("有编辑窗口尚未完成初始化，退出已取消。请等待窗口就绪后重试。")
            .title("无法退出")
            .show(|_| {});
        return;
    }
    advance_quit(app);
}
fn advance_quit<R: Runtime>(app: &AppHandle<R>) {
    let (next, finished) = {
        let host = app.state::<EditorWindows>();
        let Ok(mut state) = host.0.lock() else {
            return;
        };
        let next = state.next();
        (next, state.quit.is_some() && state.labels.is_empty())
    };
    if finished {
        app.exit(0);
        return;
    }
    if let Some((label, request)) = next {
        let result = app
            .get_webview_window(&label)
            .ok_or_else(|| "编辑窗口不存在".to_owned())
            .and_then(|window| {
                if !window.is_focused().map_err(|e| e.to_string())? {
                    window.set_focus().map_err(|e| e.to_string())?;
                }
                emit_to_editor(app, &label, "application-quit-request", request.clone())
            });
        if let Err(error) = result {
            if let Ok(mut state) = app.state::<EditorWindows>().0.lock() {
                if state.cancel(&label, &request.token) {
                    app.state::<crate::startup::StartupHost>().end_quit_backup();
                }
            }
            eprintln!("Application shutdown cancelled: {error}");
        }
    }
}
pub fn has_editors(app: &AppHandle) -> bool {
    app.state::<EditorWindows>()
        .0
        .lock()
        .map_or(true, |state| !state.labels.is_empty())
}
pub fn handle_window(window: &Window, event: &WindowEvent) {
    crate::platform::ui_chrome::handle_window(window, event);
    if matches!(event, WindowEvent::Focused(_) | WindowEvent::Resized(_)) {
        native_tabs::refresh();
    }
    if matches!(event, WindowEvent::Destroyed)
        && window
            .state::<crate::window_services::WindowServices>()
            .contains(window.label())
    {
        native_tabs::release(window.label());
        release(window.app_handle(), window.label());
        advance_quit(window.app_handle());
        crate::application_preferences::after_editor_destroyed(window.app_handle());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn reservation_app() -> tauri::App<tauri::test::MockRuntime> {
        tauri::test::mock_builder()
            .manage(EditorWindows::default())
            .manage(crate::window_services::WindowServices::default())
            .manage(crate::startup::StartupHost::default())
            .manage(crate::commands::recovery::RecoveryHost::default())
            .manage(crate::themes::ThemeHost::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
    }
    #[test]
    fn dropping_an_unshown_native_reservation_releases_every_window_registration() {
        let app = reservation_app();
        let reserved = reserve_editor_window(app.handle(), None).unwrap();
        let label = reserved.label.as_ref().unwrap().clone();
        assert!(app
            .state::<crate::window_services::WindowServices>()
            .contains(&label));
        assert!(app
            .state::<EditorWindows>()
            .0
            .lock()
            .unwrap()
            .labels
            .contains(&label));
        drop(reserved);
        assert!(!app
            .state::<crate::window_services::WindowServices>()
            .contains(&label));
        assert!(!app
            .state::<EditorWindows>()
            .0
            .lock()
            .unwrap()
            .labels
            .contains(&label));
        assert!(app
            .state::<crate::startup::StartupHost>()
            .publish_bootstrap(&label)
            .is_err());
        assert!(app
            .state::<crate::commands::recovery::RecoveryHost>()
            .register_window(&label)
            .is_ok());
        assert!(app
            .state::<crate::themes::ThemeHost>()
            .register_window(&label)
            .is_ok());
    }
    #[test]
    fn failed_bootstrap_reservation_rolls_back_the_native_label_and_window_services() {
        let app = reservation_app();
        let startup = app.state::<crate::startup::StartupHost>();
        for index in 0..32 {
            startup
                .set_bootstrap(&format!("existing-{index}"), Default::default())
                .unwrap();
        }
        assert!(reserve_editor_window(app.handle(), None).is_err());
        assert!(app
            .state::<EditorWindows>()
            .0
            .lock()
            .unwrap()
            .labels
            .is_empty());
        startup.release("existing-0");
        let reserved = reserve_editor_window(app.handle(), None).unwrap();
        let label = reserved.label.as_ref().unwrap().clone();
        drop(reserved);
        assert!(!app
            .state::<crate::window_services::WindowServices>()
            .contains(&label));
    }
    fn state() -> Lifecycle {
        let mut state = Lifecycle::default();
        for label in ["main", "editor-a", "editor-b"] {
            state.register(label).unwrap();
            state.ready.insert(label.into());
        }
        state
    }
    #[test]
    fn editor_events_are_delivered_only_to_their_own_window() {
        use std::sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        };
        use tauri::Listener;
        let app = tauri::test::mock_builder()
            .manage(crate::window_services::WindowServices::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let first = WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let second = WebviewWindowBuilder::new(&app, "editor-second", Default::default())
            .build()
            .unwrap();
        app.state::<crate::window_services::WindowServices>()
            .register("main")
            .unwrap();
        app.state::<crate::window_services::WindowServices>()
            .register("editor-second")
            .unwrap();
        for event in [
            "menu-action",
            "application-quit-request",
            "editor-context-menu-action",
        ] {
            let a = Arc::new(AtomicUsize::new(0));
            let b = Arc::new(AtomicUsize::new(0));
            let a_count = a.clone();
            first.listen(event, move |_| {
                a_count.fetch_add(1, Ordering::SeqCst);
            });
            let b_count = b.clone();
            second.listen(event, move |_| {
                b_count.fetch_add(1, Ordering::SeqCst);
            });
            emit_to_editor(app.handle(), "editor-second", event, "payload").unwrap();
            assert_eq!(a.load(Ordering::SeqCst), 0, "{event}");
            assert_eq!(b.load(Ordering::SeqCst), 1, "{event}");
            assert!(emit_to_editor(app.handle(), "unknown", event, "payload").is_err());
        }
    }
    #[test]
    fn quit_visits_focused_first_and_waits_for_each_destroy() {
        let mut s = state();
        s.begin_quit("one".into(), Some("editor-b"));
        assert_eq!(s.next().unwrap().0, "editor-b");
        assert!(s.next().is_none());
        s.remove("editor-b");
        assert_eq!(s.next().unwrap().0, "editor-a");
        s.remove("editor-a");
        assert_eq!(s.next().unwrap().0, "main");
        s.remove("main");
        assert!(s.next().is_none());
        assert!(s.labels.is_empty());
    }
    #[test]
    fn cancellation_requires_current_owner_and_current_generation() {
        let mut s = state();
        s.begin_quit("one".into(), Some("main"));
        s.next();
        assert!(!s.cancel("editor-a", "one"));
        assert!(!s.cancel("main", "old"));
        assert!(s.cancel("main", "one"));
        assert_eq!(s.labels.len(), 3);
        s.begin_quit("two".into(), Some("main"));
        s.next();
        assert!(!s.authorize_close("main", Some("one")));
        assert!(s.authorize_close("main", Some("two")));
    }
    #[test]
    fn loading_windows_receive_quit_only_after_listener_registration() {
        let mut s = state();
        s.ready.remove("main");
        s.begin_quit("one".into(), Some("main"));
        assert!(s.next().is_none());
        s.ready.insert("main".into());
        assert_eq!(s.next().unwrap().0, "main");
        assert!(s.next().is_none());
    }
    #[test]
    fn duplicate_quit_and_closing_other_window_cannot_advance_active_prompt() {
        let mut s = state();
        s.begin_quit("one".into(), Some("main"));
        s.next();
        s.begin_quit("two".into(), Some("editor-a"));
        s.remove("editor-a");
        assert!(s.next().is_none());
        assert!(s.authorize_close("main", Some("one")));
        assert!(!s.authorize_close("main", Some("two")));
        assert!(s.register("new").is_err());
        s.cancel("main", "one");
        assert!(s.register("new").is_ok());
    }
    #[test]
    fn window_capacity_and_duplicate_registration_are_bounded() {
        let mut s = Lifecycle::default();
        for n in 0..MAX_WINDOWS {
            s.register(&format!("editor-{n}")).unwrap();
        }
        assert!(s.register("overflow").is_err());
        assert!(s.register("editor-0").is_err());
        s.remove("editor-0");
        assert!(s.register("replacement").is_ok());
    }
}
