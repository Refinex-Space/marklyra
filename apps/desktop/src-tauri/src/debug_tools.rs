mod native;

use crate::application_preferences::{ApplicationPreferencesHost, Key, Snapshot, Value};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{MenuItem, MenuItemKind},
    AppHandle, Manager, Runtime, WebviewWindow,
};

pub(crate) const MENU_ID: &str = "application-devtools";

#[derive(Default)]
struct Mode {
    revision: Option<u64>,
    enabled: bool,
}
impl Mode {
    fn confirm(&mut self, snapshot: &Snapshot) -> bool {
        if self
            .revision
            .is_some_and(|revision| snapshot.revision <= revision)
        {
            return false;
        }
        let enabled = matches!(
            snapshot.values.get(&Key::DebugMode),
            Some(Value::Boolean(true))
        );
        let changed = self.revision.is_none() || self.enabled != enabled;
        self.revision = Some(snapshot.revision);
        self.enabled = enabled;
        changed
    }
}

#[derive(Clone, Default)]
pub(crate) struct DebugToolsHost(Arc<Mutex<Mode>>);

fn trusted<R: Runtime>(window: &WebviewWindow<R>) -> bool {
    crate::windows::is_editor(window)
        || (window.label() == "preferences"
            && crate::platform::ui_chrome::require_preferences_session(window).is_ok())
}

pub(crate) fn shortcut() -> &'static str {
    if cfg!(target_os = "macos") {
        "Cmd+Alt+I"
    } else {
        "Ctrl+Shift+I"
    }
}

pub(crate) fn menu_item<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, MENU_ID, "开发者工具", false, Some(shortcut()))
}

pub(crate) fn sync_menu<R: Runtime>(app: &AppHandle<R>, preview: bool) -> tauri::Result<()> {
    fn update<R: Runtime>(items: Vec<MenuItemKind<R>>, enabled: bool) -> tauri::Result<()> {
        for item in items {
            match item {
                MenuItemKind::Submenu(menu) => update(menu.items()?, enabled)?,
                MenuItemKind::MenuItem(item) if item.id().as_ref() == MENU_ID => {
                    item.set_enabled(enabled)?
                }
                _ => {}
            }
        }
        Ok(())
    }
    let enabled = app
        .try_state::<DebugToolsHost>()
        .and_then(|state| state.0.lock().ok().map(|mode| mode.enabled))
        .unwrap_or(false);
    if let Some(menu) = app.menu() {
        update(menu.items()?, enabled && !preview)?;
    }
    Ok(())
}

fn configure<R: Runtime>(window: WebviewWindow<R>, open: bool) {
    if !trusted(&window) {
        return;
    }
    let Some(state) = window.try_state::<DebugToolsHost>() else {
        return;
    };
    let state = state.inner().clone();
    let target = window.clone();
    if let Err(error) = window.with_webview(move |webview| {
        let result = (|| {
            let enabled = state
                .0
                .lock()
                .map_err(|_| "调试状态不可用".to_owned())?
                .enabled;
            if !trusted(&target) {
                return Err("调试目标窗口已关闭".into());
            }
            if open && !enabled {
                return Err("调试模式尚未开启".into());
            }
            // Inspector UI may synchronously dispatch focus/menu events. Never
            // hold the preference lock while entering platform UI code.
            native::configure(&webview, enabled, open)
        })();
        if let Err(error) = result {
            eprintln!("Developer tools unavailable: {error}");
        }
    }) {
        eprintln!("Developer tools dispatch failed: {error}");
    }
}

pub(crate) fn open_focused<R: Runtime>(app: &AppHandle<R>) {
    let mut focused = app
        .webview_windows()
        .into_values()
        .filter(|window| crate::windows::is_focused(window).unwrap_or(false));
    if let (Some(window), None) = (focused.next(), focused.next()) {
        configure(window, true);
    }
}

pub(crate) fn preferences_changed<R: Runtime>(app: &AppHandle<R>, snapshot: &Snapshot) {
    let Some(state) = app.try_state::<DebugToolsHost>() else {
        return;
    };
    let changed = state
        .0
        .lock()
        .map(|mut mode| mode.confirm(snapshot))
        .unwrap_or(false);
    if changed {
        for window in app.webview_windows().into_values() {
            configure(window, false);
        }
    }
    if let Err(error) = sync_menu(app, false) {
        eprintln!("Debug menu unavailable: {error}");
    }
}

pub(crate) fn window_ready<R: Runtime>(window: &WebviewWindow<R>) {
    configure(window.clone(), false);
    if let Err(error) = sync_menu(window.app_handle(), false) {
        eprintln!("Debug menu unavailable: {error}");
    }
}

pub(crate) fn initialise(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        match app.state::<ApplicationPreferencesHost>().snapshot(&app) {
            Ok(snapshot) => preferences_changed(&app, &snapshot),
            Err(error) => eprintln!("Debug preference unavailable: {error}"),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn debug_defaults_off_and_stale_confirmations_cannot_reenable_it() {
        let mut mode = Mode::default();
        assert!(!mode.enabled);
        let mut snapshot = Snapshot {
            revision: 1,
            ..Snapshot::default()
        };
        snapshot.values.insert(Key::DebugMode, Value::Boolean(true));
        assert!(mode.confirm(&snapshot));
        assert!(mode.enabled);
        let stale = snapshot.clone();
        snapshot.revision = 2;
        snapshot
            .values
            .insert(Key::DebugMode, Value::Boolean(false));
        assert!(mode.confirm(&snapshot));
        assert!(!mode.confirm(&stale));
        assert!(!mode.enabled);
        snapshot.values.insert(Key::DebugMode, Value::Boolean(true));
        assert!(!mode.confirm(&snapshot));
        assert!(!mode.enabled);
    }
    #[test]
    fn debug_shortcut_matches_the_host_platform() {
        assert_eq!(
            shortcut(),
            if cfg!(target_os = "macos") {
                "Cmd+Alt+I"
            } else {
                "Ctrl+Shift+I"
            }
        );
    }
}
