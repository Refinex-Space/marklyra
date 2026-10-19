//! Event-based native popup transport. `popup_at` returning is not cancellation.
mod schema;
pub use schema::Request;

use schema::Item;
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri::{
    menu::{ContextMenu, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu},
    AppHandle, LogicalPosition, Manager, State, WebviewWindow, Window, WindowEvent,
};

const PREFIX: &str = "editor-context:";

#[derive(Clone, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    request_id: String,
    action_id: String,
}
struct Session<T> {
    request_id: String,
    window: String,
    actions: HashMap<String, (String, bool)>,
    // Retain the menu until selection, replacement, explicit release or destroy.
    _menu: T,
}
struct Registry<T> {
    generation: u64,
    pending: Option<(String, String)>,
    active: Option<Session<T>>,
}
impl<T> Default for Registry<T> {
    fn default() -> Self {
        Self {
            generation: 0,
            pending: None,
            active: None,
        }
    }
}
impl<T> Registry<T> {
    fn begin(&mut self, window: &str, request_id: &str) -> Result<u64, String> {
        self.generation = self.generation.checked_add(1).ok_or("菜单请求序号已耗尽")?;
        self.active = None;
        self.pending = Some((window.to_owned(), request_id.to_owned()));
        Ok(self.generation)
    }
    fn install(&mut self, generation: u64, session: Session<T>) -> bool {
        if self.generation != generation
            || self.pending.as_ref() != Some(&(session.window.clone(), session.request_id.clone()))
        {
            return false;
        }
        self.pending = None;
        self.active = Some(session);
        true
    }
    fn release(&mut self, window: &str, request_id: Option<&str>) {
        let mut revoked = false;
        if self.active.as_ref().is_some_and(|active| {
            active.window == window && request_id.is_none_or(|id| id == active.request_id)
        }) {
            self.active = None;
            revoked = true;
        }
        if self.pending.as_ref().is_some_and(|(owner, id)| {
            owner == window && request_id.is_none_or(|expected| expected == id)
        }) {
            self.pending = None;
            revoked = true;
        }
        if revoked {
            self.generation = self.generation.saturating_add(1);
        }
    }
    fn take(&mut self, native_id: &str) -> Option<(String, Selection)> {
        let active = self.active.as_ref()?;
        let (action_id, enabled) = active.actions.get(native_id)?;
        if !enabled {
            return None;
        }
        let result = (
            active.window.clone(),
            Selection {
                request_id: active.request_id.clone(),
                action_id: action_id.clone(),
            },
        );
        self.active = None;
        Some(result)
    }
}

#[derive(Default, Clone)]
pub struct ContextMenuHost {
    registry: Arc<Mutex<Registry<Menu<tauri::Wry>>>>,
}

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if !crate::windows::is_editor(window) {
        return Err("右键菜单仅允许由编辑窗口发起".to_owned());
    }
    Ok(())
}
fn build_items(
    app: &AppHandle,
    values: &[Item],
    generation: u64,
    serial: &mut usize,
    actions: &mut HashMap<String, (String, bool)>,
) -> tauri::Result<Vec<MenuItemKind<tauri::Wry>>> {
    let mut items = Vec::with_capacity(values.len());
    for value in values {
        match value {
            Item::Separator => items.push(MenuItemKind::Predefined(PredefinedMenuItem::separator(
                app,
            )?)),
            Item::Submenu {
                label,
                items: children,
            } => {
                let submenu = Submenu::new(app, label.replace('&', "&&"), true)?;
                for child in build_items(app, children, generation, serial, actions)? {
                    submenu.append(&child)?;
                }
                items.push(MenuItemKind::Submenu(submenu));
            }
            Item::Action {
                action_id,
                label,
                enabled,
            } => {
                let id = format!("{PREFIX}{generation}:{}", *serial);
                *serial += 1;
                actions.insert(id.clone(), (action_id.clone(), *enabled));
                items.push(MenuItemKind::MenuItem(MenuItem::with_id(
                    app,
                    id,
                    label.replace('&', "&&"),
                    *enabled,
                    None::<&str>,
                )?));
            }
        }
    }
    Ok(items)
}

#[tauri::command]
pub async fn show_editor_context_menu(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ContextMenuHost>,
    request: Request,
) -> Result<(), String> {
    main_only(&window)?;
    request.validate()?;
    if !crate::windows::is_focused(&window).map_err(|error| error.to_string())? {
        return Err("编辑窗口当前未聚焦".to_owned());
    }
    let size = window
        .inner_size()
        .map_err(|error| error.to_string())?
        .to_logical::<f64>(window.scale_factor().map_err(|error| error.to_string())?);
    if request.point.x < 0.0
        || request.point.y < 0.0
        || request.point.x > size.width
        || request.point.y > size.height
    {
        return Err("菜单坐标不在编辑窗口内".to_owned());
    }
    let host = host.inner().clone();
    let generation = host
        .registry
        .lock()
        .map_err(|_| "菜单状态不可用")?
        .begin(window.label(), &request.request_id)?;
    let menu = Menu::new(&app).map_err(|error| error.to_string())?;
    let mut actions = HashMap::new();
    for item in build_items(&app, &request.items, generation, &mut 0, &mut actions)
        .map_err(|error| error.to_string())?
    {
        menu.append(&item).map_err(|error| error.to_string())?;
    }
    let installed = host.registry.lock().map_err(|_| "菜单状态不可用")?.install(
        generation,
        Session {
            request_id: request.request_id,
            window: window.label().to_owned(),
            actions,
            _menu: menu.clone(),
        },
    );
    if !installed {
        return Err("菜单请求已被更新请求取代".to_owned());
    }
    let native_window = window.as_ref().window();
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let active = host
            .registry
            .lock()
            .is_ok_and(|registry| registry.generation == generation && registry.active.is_some());
        let result = if active {
            menu.popup_at(
                native_window,
                LogicalPosition::new(request.point.x, request.point.y),
            )
            .map_err(|error| error.to_string())
        } else {
            Err("菜单请求已取消".to_owned())
        };
        // Deliberately retain registration after popup returns: MenuEvent travels
        // through the runtime proxy and may only be dispatched on the next turn.
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

#[tauri::command]
pub fn close_editor_context_menu(
    window: WebviewWindow,
    host: State<'_, ContextMenuHost>,
    request_id: String,
) -> Result<(), String> {
    main_only(&window)?;
    if !schema::valid_request_id(&request_id) {
        return Err("无效菜单请求标识".to_owned());
    }
    host.registry
        .lock()
        .map_err(|_| "菜单状态不可用")?
        .release(window.label(), Some(&request_id));
    // This invalidates actions; Tauri does not expose physical popup dismissal.
    Ok(())
}

/// Invoke before the ordinary app/print-menu router; consume stale popup IDs too.
pub fn handle_menu(app: &AppHandle, event: &tauri::menu::MenuEvent) -> bool {
    let id = event.id().as_ref();
    if !id.starts_with(PREFIX) {
        return false;
    }
    let selected = app
        .state::<ContextMenuHost>()
        .registry
        .lock()
        .ok()
        .and_then(|mut registry| registry.take(id));
    if let Some((label, selection)) = selected {
        if let Some(window) = app
            .get_webview_window(&label)
            .filter(|window| crate::windows::is_focused(window).unwrap_or(false))
        {
            if let Err(error) = crate::windows::emit_to_editor(
                app,
                window.label(),
                "editor-context-menu-action",
                selection,
            ) {
                eprintln!("Context menu action delivery failed: {error}");
            }
        }
    }
    true
}
pub fn handle_window(window: &Window, event: &WindowEvent) {
    if matches!(event, WindowEvent::Destroyed) {
        if let Ok(mut registry) = window
            .app_handle()
            .state::<ContextMenuHost>()
            .registry
            .lock()
        {
            registry.release(window.label(), None);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn session(id: &str, generation: u64) -> Session<()> {
        Session {
            request_id: id.into(),
            window: "main".into(),
            actions: [
                (
                    format!("{PREFIX}{generation}:0"),
                    ("edit.copy".into(), true),
                ),
                (
                    format!("{PREFIX}{generation}:1"),
                    ("edit.cut".into(), false),
                ),
            ]
            .into(),
            _menu: (),
        }
    }
    #[test]
    fn late_native_event_remains_valid_and_is_delivered_at_most_once() {
        let mut registry = Registry::default();
        let generation = registry.begin("main", "one").unwrap();
        registry.install(generation, session("one", generation));
        // Popup return has no state transition. The subsequent proxy event wins.
        let id = format!("{PREFIX}{generation}:0");
        assert_eq!(
            registry.take(&id).unwrap().1,
            Selection {
                request_id: "one".into(),
                action_id: "edit.copy".into()
            }
        );
        assert!(registry.take(&id).is_none());
    }
    #[test]
    fn disabled_unknown_and_replaced_events_cannot_execute() {
        let mut registry = Registry::default();
        let a = registry.begin("main", "same").unwrap();
        registry.install(a, session("same", a));
        assert!(registry.take(&format!("{PREFIX}{a}:1")).is_none());
        assert!(registry.take("editor-context:anything").is_none());
        let b = registry.begin("main", "same").unwrap();
        registry.install(b, session("same", b));
        assert!(registry.take(&format!("{PREFIX}{a}:0")).is_none());
        assert!(registry.take(&format!("{PREFIX}{b}:0")).is_some());
    }
    #[test]
    fn stale_construction_close_and_wrong_window_cannot_remove_new_registration() {
        let mut registry = Registry::default();
        let a = registry.begin("main", "old").unwrap();
        let b = registry.begin("main", "new").unwrap();
        assert!(!registry.install(a, session("old", a)));
        assert!(registry.install(b, session("new", b)));
        registry.release("main", Some("old"));
        registry.release("preview", Some("new"));
        assert!(registry.take(&format!("{PREFIX}{b}:0")).is_some());
        let c = registry.begin("main", "closed").unwrap();
        registry.release("main", None);
        assert!(!registry.install(c, session("closed", c)));
    }
    #[test]
    fn close_during_construction_revokes_only_its_exact_pending_request() {
        let mut registry = Registry::default();
        let old = registry.begin("main", "old").unwrap();
        registry.release("main", Some("old"));
        assert!(!registry.install(old, session("old", old)));
        let new = registry.begin("main", "new").unwrap();
        registry.release("main", Some("old"));
        registry.release("preview", None);
        assert!(registry.install(new, session("new", new)));
    }
    #[test]
    fn explicit_close_revokes_the_current_selection() {
        let mut registry = Registry::default();
        let generation = registry.begin("main", "one").unwrap();
        registry.install(generation, session("one", generation));
        registry.release("main", Some("one"));
        assert!(registry.take(&format!("{PREFIX}{generation}:0")).is_none());
    }
}
