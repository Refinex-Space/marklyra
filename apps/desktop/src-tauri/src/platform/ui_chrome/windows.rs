//! Windows hosts the unified titlebar in the WebView. The native menu model stays
//! authoritative: the WebView only chooses which existing menu to pop up.
use tauri::{
    menu::{ContextMenu, MenuItemKind},
    AppHandle, LogicalPosition, WebviewWindow,
};

/// The undecorated window owns its client area, so the system menu bar is never shown.
pub(super) fn initialise(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    window.hide_menu().map_err(|error| error.to_string())?;
    window.set_shadow(true).map_err(|error| error.to_string())?;
    // WebView2 keeps keyboard focus, so menu accelerators are matched before the page.
    install_accelerators(app, window)
}

/// Top-level menu titles in their native order, so the titlebar never keeps its own copy.
pub(super) fn titles(app: &AppHandle) -> Result<Vec<String>, String> {
    let menu = app.menu().ok_or("应用菜单尚未创建")?;
    menu.items()
        .map_err(|error| error.to_string())?
        .into_iter()
        .map(|item| match item {
            MenuItemKind::Submenu(submenu) => submenu.text().map_err(|error| error.to_string()),
            _ => Err("应用菜单顶层只允许子菜单".to_owned()),
        })
        .collect()
}

/// Pops up one top-level menu, or the whole menu tree when `index` is absent.
pub(super) fn popup(
    app: &AppHandle,
    window: &WebviewWindow,
    index: Option<usize>,
    position: LogicalPosition<f64>,
) -> Result<(), String> {
    let menu = app.menu().ok_or("应用菜单尚未创建")?;
    let native_window = window.as_ref().window();
    match index {
        None => menu.popup_at(native_window, position),
        Some(index) => {
            let items = menu.items().map_err(|error| error.to_string())?;
            let Some(MenuItemKind::Submenu(submenu)) = items.get(index) else {
                return Err("应用菜单不存在".to_owned());
            };
            submenu.popup_at(native_window, position)
        }
    }
    .map_err(|error| error.to_string())
}

/// Mirrors the macOS native window state: the OS-owned taskbar title and frame theme.
pub(super) fn update(window: &WebviewWindow, update: &super::DocumentChrome) -> Result<(), String> {
    let name = update
        .path
        .as_deref()
        .and_then(std::path::Path::file_name)
        .map_or_else(
            || "未命名".into(),
            |name| name.to_string_lossy().into_owned(),
        );
    let marker = if update.dirty { "● " } else { "" };
    window
        .set_title(&format!("{marker}{name} — MarkLyra"))
        .map_err(|error| error.to_string())?;
    window
        .set_theme(Some(if update.dark {
            tauri::Theme::Dark
        } else {
            tauri::Theme::Light
        }))
        .map_err(|error| error.to_string())
}

mod accelerators {
    use std::{collections::HashSet, sync::Mutex};
    use tauri::{menu::MenuEvent, AppHandle, WebviewWindow};
    use webview2_com::{
        AcceleratorKeyPressedEventHandler,
        Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_KEY_EVENT_KIND, COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
            COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN, COREWEBVIEW2_PHYSICAL_KEY_STATUS,
        },
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CONTROL, VK_MENU, VK_SHIFT};

    /// Windows whose controller already routes accelerators; the hook is installed once each.
    static INSTALLED: Mutex<Option<HashSet<String>>> = Mutex::new(None);

    fn down(key: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY) -> bool {
        // SAFETY: GetKeyState only reads the calling thread's keyboard state.
        unsafe { GetKeyState(i32::from(key.0)) < 0 }
    }

    pub(super) fn install(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
        {
            let mut installed = INSTALLED.lock().map_err(|_| "快捷键状态不可用")?;
            if !installed
                .get_or_insert_with(HashSet::new)
                .insert(window.label().to_owned())
            {
                return Ok(());
            }
        }
        let app = app.clone();
        let chords = crate::menu::chords();
        window
            .with_webview(move |webview| {
                let handler =
                    AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
                        let Some(args) = args else {
                            return Ok(());
                        };
                        // SAFETY: the event arguments are valid for the duration of this callback.
                        unsafe {
                            let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
                            args.KeyEventKind(&mut kind)?;
                            if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN
                                && kind != COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN
                            {
                                return Ok(());
                            }
                            let mut key = 0u32;
                            args.VirtualKey(&mut key)?;
                            let mut status = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
                            args.PhysicalKeyStatus(&mut status)?;
                            let (ctrl, shift, alt) =
                                (down(VK_CONTROL), down(VK_SHIFT), down(VK_MENU));
                            let Some((_, id)) = chords.iter().find(|(chord, _)| {
                                chord.key == key
                                    && chord.ctrl == ctrl
                                    && chord.shift == shift
                                    && chord.alt == alt
                            }) else {
                                return Ok(());
                            };
                            // A disabled native item leaves the key to the page, as AppKit does.
                            if !crate::menu::item_enabled(&app, id) {
                                return Ok(());
                            }
                            args.SetHandled(true)?;
                            if !status.WasKeyDown.as_bool() {
                                crate::route_menu_event(&app, MenuEvent { id: (*id).into() });
                            }
                        }
                        Ok(())
                    }));
                let mut token = 0i64;
                // SAFETY: with_webview supplies the live controller on its UI thread; the
                // handler is released together with the controller.
                if let Err(error) = unsafe {
                    webview
                        .controller()
                        .add_AcceleratorKeyPressed(&handler, &mut token)
                } {
                    eprintln!("Windows accelerators unavailable: {error}");
                }
            })
            .map_err(|error| error.to_string())
    }
}

use accelerators::install as install_accelerators;
