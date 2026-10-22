use super::TabAction;
use crate::startup::NativeTabRestore;
use objc2::{
    define_class, msg_send, rc::Retained, runtime::AnyObject, DefinedClass, MainThreadOnly,
};
use objc2_app_kit::{
    NSResponder, NSWindow, NSWindowStyleMask, NSWindowTabbingMode, NSWindowUserTabbingPreference,
};
use objc2_foundation::{MainThreadMarker, NSObjectProtocol, NSString};
use std::{
    cell::RefCell,
    collections::HashMap,
    sync::{
        mpsc::{self, Sender},
        OnceLock,
    },
};
use tauri::{AppHandle, Manager, WebviewWindow};

const EDITOR_GROUP: &str = "dev.refinex.marklyra.editor";
pub(super) fn setup() {
    if let Some(mtm) = MainThreadMarker::new() {
        // Applies only to this process. Explicit grouping below implements the
        // current system preference without auto-merging restore/preview windows.
        NSWindow::setAllowsAutomaticWindowTabbing(false, mtm);
    }
}
struct TabIvars {
    app: AppHandle,
    label: String,
    // NSResponder.nextResponder does not own its target.
    _next: Option<Retained<NSResponder>>,
}
define_class!(
    // SAFETY: main-thread-only NSResponder subclass; no native delegate is replaced.
    #[unsafe(super = NSResponder)]
    #[thread_kind = MainThreadOnly]
    #[ivars = TabIvars]
    struct RecoveryTabResponder;
    unsafe impl NSObjectProtocol for RecoveryTabResponder {}
    impl RecoveryTabResponder {
        #[unsafe(method(newWindowForTab:))]
        fn new_window_for_tab(&self, _sender: Option<&AnyObject>) {
            let ivars = self.ivars();
            if let Err(error) = crate::windows::emit_to_editor(&ivars.app, &ivars.label, "menu-action", "new-tab") {
                eprintln!("Native new-tab delivery failed: {error}");
            }
        }
        #[unsafe(method(observeValueForKeyPath:ofObject:change:context:))]
        fn observe_tabs(&self, _key: Option<&NSString>, _object: Option<&AnyObject>, _change: Option<&AnyObject>, _context: *mut std::ffi::c_void) {
            refresh_all();
        }
    }
);
thread_local! {
    static RESPONDERS: RefCell<HashMap<String, Registration>> = RefCell::new(HashMap::new());
}
struct Registration {
    responder: Retained<RecoveryTabResponder>,
    window: Retained<NSWindow>,
    overlay: bool,
}
#[derive(Clone, serde::Serialize)]
struct TabLayout {
    overlay: bool,
}

/// `refresh_all` runs inside AppKit/KVO callbacks, which fire synchronously while Tauri is
/// closing a window and still holds its window table mutably borrowed. Emitting from the main
/// thread evaluates the script inline and re-enters that table (a `RefCell` panic that aborts
/// the app, e.g. during the quit before an update). One ordered worker hands the events to the
/// event loop through its proxy instead.
fn emit_layout_later(app: &AppHandle, label: String, overlay: bool) {
    static QUEUE: OnceLock<Sender<(AppHandle, String, bool)>> = OnceLock::new();
    let queue = QUEUE.get_or_init(|| {
        let (sender, receiver) = mpsc::channel::<(AppHandle, String, bool)>();
        let worker = std::thread::Builder::new()
            .name("native-tab-layout".into())
            .spawn(move || {
                for (app, label, overlay) in receiver {
                    // A window closed in the meantime is simply no longer an editor.
                    let _ = crate::windows::emit_to_editor(
                        &app,
                        &label,
                        "native-tab-layout",
                        TabLayout { overlay },
                    );
                }
            });
        if let Err(error) = worker {
            eprintln!("Native tab layout worker unavailable: {error}");
        }
        sender
    });
    let _ = queue.send((app.clone(), label, overlay));
}

// AppKit drag, detach and close can change both the old and the new group.
// Clone native owners before changing style masks: resize notifications may reenter.
fn refresh_all() {
    let entries: Vec<_> = RESPONDERS.with_borrow(|entries| {
        entries
            .iter()
            .map(|(label, entry)| {
                (
                    label.clone(),
                    entry.window.clone(),
                    entry.responder.clone(),
                    entry.overlay,
                )
            })
            .collect()
    });
    for (label, ns, responder, original_overlay) in entries {
        let mut style = ns.styleMask();
        let tabs = ns.tabbedWindows();
        let overlay =
            original_overlay && !style.contains(NSWindowStyleMask::FullScreen) && tabs.is_none();
        if style.contains(NSWindowStyleMask::FullSizeContentView) != overlay {
            style.set(NSWindowStyleMask::FullSizeContentView, overlay);
            ns.setStyleMask(style);
        }
        emit_layout_later(&responder.ivars().app, label, overlay);
        if ns.isKeyWindow() {
            if let Some(menu) = responder.ivars().app.menu() {
                for action in ["tab:next", "tab:previous", "tab:detach"] {
                    if let Some(item) = menu.get(action) {
                        if let Some(item) = item.as_menuitem() {
                            let _ =
                                item.set_enabled(tabs.as_ref().is_some_and(|tabs| tabs.len() > 1));
                        }
                    }
                }
                if let Some(item) = menu.get("tab:toggle") {
                    if let Some(item) = item.as_menuitem() {
                        let _ = item.set_text(if tabs.is_some() {
                            "隐藏标签栏"
                        } else {
                            "显示标签栏"
                        });
                    }
                }
            }
        }
    }
}
fn native(window: &WebviewWindow) -> Result<Retained<NSWindow>, String> {
    MainThreadMarker::new().ok_or("原生标签只能在主线程操作")?;
    let pointer = window.ns_window().map_err(|error| error.to_string())?;
    // SAFETY: Tauri owns the live NSWindow; retain only on the main thread.
    unsafe { Retained::retain(pointer.cast::<NSWindow>()) }.ok_or("原生窗口不可用".into())
}
pub(super) fn prefers_tab(window: &WebviewWindow) -> Result<bool, String> {
    let mtm = MainThreadMarker::new().ok_or("原生标签只能在主线程操作")?;
    let preference = NSWindow::userTabbingPreference(mtm);
    Ok(preference == NSWindowUserTabbingPreference::Always
        || preference == NSWindowUserTabbingPreference::InFullScreen
            && native(window)?
                .styleMask()
                .contains(NSWindowStyleMask::FullScreen))
}
pub(super) fn initialise(window: &WebviewWindow) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("原生标签只能在主线程操作")?;
    let ns = native(window)?;
    ns.setTabbingIdentifier(&NSString::from_str(EDITOR_GROUP));
    ns.setTabbingMode(NSWindowTabbingMode::Preferred);
    RESPONDERS.with_borrow_mut(|responders| {
        if !responders.contains_key(window.label()) {
            // SAFETY: the previous responder is retained and restored by AppKit
            // with the window lifetime; the inserted responder is owned below.
            let next = unsafe { ns.nextResponder() };
            let object = RecoveryTabResponder::alloc(mtm).set_ivars(TabIvars {
                app: window.app_handle().clone(),
                label: window.label().into(),
                _next: next.clone(),
            });
            // SAFETY: NSResponder designated initializer on an allocated subclass.
            let responder: Retained<RecoveryTabResponder> =
                unsafe { msg_send![super(object), init] };
            // SAFETY: preserves the existing acyclic chain, with strong owners
            // for both the inserted responder and its former successor.
            unsafe {
                responder.setNextResponder(next.as_deref());
                ns.setNextResponder(Some(&responder));
            }
            // SAFETY: public KVO; responder and observed window are retained
            // together and explicitly unregistered before their owners release.
            unsafe {
                let _: () = msg_send![&ns, addObserver: &*responder,
                    forKeyPath: &*NSString::from_str("tabbedWindows"), options: 3usize,
                    context: std::ptr::null_mut::<std::ffi::c_void>()];
            }
            let overlay = ns
                .styleMask()
                .contains(NSWindowStyleMask::FullSizeContentView);
            responders.insert(
                window.label().into(),
                Registration {
                    responder,
                    window: ns.clone(),
                    overlay,
                },
            );
        }
    });
    refresh_all();
    Ok(())
}
pub(super) fn attach(window: &WebviewWindow, owner: &str) -> Result<(), String> {
    let owner = window
        .app_handle()
        .get_webview_window(owner)
        .filter(crate::windows::is_editor)
        .ok_or("原标签窗口已关闭，新文稿保留在独立窗口")?;
    initialise(&owner)?;
    initialise(window)?;
    let source = native(&owner)?;
    let target = native(window)?;
    let target_pointer = Retained::as_ptr(&target);
    if source.tabbedWindows().is_some_and(|tabs| {
        tabs.iter()
            .any(|member| Retained::as_ptr(&member) == target_pointer)
    }) {
        return Ok(());
    }
    if source.attachedSheet().is_some() || target.attachedSheet().is_some() {
        return Err("请先关闭系统面板，新文稿保留在独立窗口".into());
    }
    // SAFETY: public AppKit API, ordered=NSWindowAbove (1); both are live editor NSWindows.
    unsafe {
        let _: () = msg_send![&source, addTabbedWindow: &*target, ordered: 1isize];
    }
    target.makeKeyAndOrderFront(None);
    refresh_all();
    Ok(())
}
pub(super) fn action(window: &WebviewWindow, action: TabAction) -> Result<(), String> {
    initialise(window)?;
    let ns = native(window)?;
    if !ns.isKeyWindow() {
        return Err("原标签窗口已失去焦点，请在当前窗口重试".into());
    }
    if ns.attachedSheet().is_some() {
        return Err("请先关闭系统面板".into());
    }
    match action {
        TabAction::Next => ns.selectNextTab(None),
        TabAction::Previous => ns.selectPreviousTab(None),
        TabAction::Detach => ns.moveTabToNewWindow(None),
        TabAction::Toggle => ns.toggleTabBar(None),
        TabAction::Merge => {
            // Explicit owner-filtered merge: preferences and export previews are
            // never eligible even if an SDK changes their default tab identifier.
            let mut editors: Vec<_> = window
                .app_handle()
                .webview_windows()
                .into_values()
                .filter(crate::windows::is_editor)
                .filter(|w| w.label() != window.label())
                .collect();
            let layout: HashMap<_, _> = snapshot(window.app_handle())?.into_iter().collect();
            editors.sort_by_key(|editor| {
                let position = layout
                    .get(editor.label())
                    .map(|tab| (0, tab.group, tab.order))
                    .unwrap_or((1, 0, 0));
                (position, editor.label().to_owned())
            });
            if editors
                .iter()
                .any(|w| native(w).is_ok_and(|ns| ns.attachedSheet().is_some()))
            {
                return Err("其他窗口有系统面板，请先关闭面板".into());
            }
            let last = ns
                .tabbedWindows()
                .and_then(|tabs| tabs.iter().last().map(|window| Retained::as_ptr(&window)));
            let mut tail = editors
                .iter()
                .find(|editor| native(editor).is_ok_and(|ns| Some(Retained::as_ptr(&ns)) == last))
                .map_or_else(
                    || window.label().to_owned(),
                    |editor| editor.label().to_owned(),
                );
            for other in editors {
                let pointer = Retained::as_ptr(&native(&other)?);
                if ns.tabbedWindows().is_some_and(|tabs| {
                    tabs.iter()
                        .any(|member| Retained::as_ptr(&member) == pointer)
                }) {
                    continue;
                }
                attach(&other, &tail)?;
                tail = other.label().to_owned();
            }
            ns.makeKeyAndOrderFront(None);
        }
    }
    refresh_all();
    Ok(())
}
fn snapshot(app: &AppHandle) -> Result<Vec<(String, NativeTabRestore)>, String> {
    let mut editors: Vec<_> = app
        .webview_windows()
        .into_values()
        .filter(crate::windows::is_editor)
        .collect();
    editors.sort_by(|a, b| a.label().cmp(b.label()));
    let windows: Vec<_> = editors
        .iter()
        .map(|w| native(w).map(|ns| (w.label().to_owned(), ns)))
        .collect::<Result<_, _>>()?;
    let mut result = Vec::new();
    let mut visited = Vec::new();
    let mut group = 0;
    for (_, ns) in &windows {
        let tabs: Vec<_> = ns
            .tabbedWindows()
            .map(|tabs| tabs.iter().collect())
            .unwrap_or_else(|| vec![ns.clone()]);
        if tabs.len() < 2 && !ns.isKeyWindow() {
            continue;
        }
        if visited.contains(&Retained::as_ptr(ns)) {
            continue;
        }
        // SAFETY: tabGroup and selectedWindow are public AppKit properties; the
        // returned objects remain retained through this synchronous snapshot.
        let selected: Option<Retained<NSWindow>> = unsafe {
            let tab_group: Option<Retained<AnyObject>> = msg_send![&**ns, tabGroup];
            tab_group.and_then(|group| msg_send![&group, selectedWindow])
        };
        for (order, member) in tabs.iter().enumerate() {
            let pointer = Retained::as_ptr(member);
            let Some((label, _)) = windows
                .iter()
                .find(|(_, candidate)| Retained::as_ptr(candidate) == pointer)
            else {
                return Err("标签组含非编辑窗口，会话分组未归档".into());
            };
            visited.push(pointer);
            result.push((
                label.clone(),
                NativeTabRestore {
                    group,
                    order: u8::try_from(order).map_err(|_| "标签超过上限")?,
                    selected: member.isKeyWindow()
                        || selected
                            .as_ref()
                            .is_some_and(|selected| Retained::as_ptr(selected) == pointer),
                    focused: member.isKeyWindow(),
                },
            ));
        }
        group += 1;
    }
    Ok(result)
}
pub(super) fn capture(app: &AppHandle) -> Result<Vec<(String, NativeTabRestore)>, String> {
    if MainThreadMarker::new().is_some() {
        return snapshot(app);
    }
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = sender.send(snapshot(&handle));
    })
    .map_err(|e| e.to_string())?;
    receiver
        .recv()
        .map_err(|_| "原生标签快照未完成".to_owned())?
}
pub(super) fn restore(app: &AppHandle, mut entries: Vec<(String, NativeTabRestore)>) {
    entries.sort_by_key(|(_, tab)| (tab.group, tab.order));
    let handle = app.clone();
    let result = app.run_on_main_thread(move || {
        let mut owners: HashMap<u8, String> = HashMap::new();
        for (label, tab) in &entries {
            if let Some(owner) = owners.get(&tab.group) {
                if let Some(window) = handle.get_webview_window(label) {
                    if let Err(error) = attach(&window, owner) {
                        let _ = handle
                            .state::<crate::startup::StartupHost>()
                            .add_warning(label, error);
                    } else {
                        owners.insert(tab.group, label.clone());
                    }
                }
            } else {
                owners.insert(tab.group, label.clone());
            }
        }
        for (label, tab) in &entries {
            if tab.selected {
                if let Some(window) = handle.get_webview_window(label) {
                    if let Ok(ns) = native(&window) {
                        ns.makeKeyAndOrderFront(None);
                    }
                }
            }
        }
        if let Some((label, _)) = entries.iter().find(|(_, tab)| tab.focused) {
            if let Some(window) = handle.get_webview_window(label) {
                if let Ok(ns) = native(&window) {
                    ns.makeKeyAndOrderFront(None);
                }
            }
        }
    });
    if let Err(error) = result {
        eprintln!("Native tab restore unavailable: {error}");
    }
}
pub(super) fn release(label: &str) {
    let entry = RESPONDERS.with_borrow_mut(|responders| responders.remove(label));
    if let Some(entry) = entry {
        // SAFETY: exact observer/key registered above, both native objects alive.
        unsafe {
            let _: () = msg_send![&entry.window, removeObserver: &*entry.responder,
            forKeyPath: &*NSString::from_str("tabbedWindows")];
            entry
                .window
                .setNextResponder(entry.responder.ivars()._next.as_deref());
        }
    }
    refresh_all();
}

pub(super) fn refresh() {
    refresh_all();
}
