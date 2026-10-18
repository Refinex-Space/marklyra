use super::{
    native_hover, native_images::TitlebarImages, DocumentChrome, StatisticsSnapshot, StatisticsUnit,
};
use objc2::{
    define_class, msg_send,
    rc::Retained,
    runtime::{AnyObject, Sel},
    sel, AnyThread, DefinedClass, MainThreadOnly,
};
use objc2_app_kit::{
    NSAccessibility, NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua,
    NSAppearanceNameDarkAqua, NSBezelStyle, NSButton, NSButtonType, NSEvent, NSFont,
    NSLayoutAttribute, NSLayoutConstraint, NSMenu, NSMenuItem, NSTitlebarAccessoryViewController,
    NSTrackingArea, NSTrackingAreaOptions, NSView, NSWindow, NSWindowStyleMask,
    NSWindowTitleVisibility,
};
use objc2_foundation::{
    MainThreadMarker, NSArray, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString, NSURL,
};
use std::{
    cell::{Cell, OnceCell, RefCell},
    collections::HashMap,
};
use tauri::{AppHandle, Manager, WebviewWindow};

struct ChromeIvars {
    app: AppHandle,
    label: String,
    actions: OnceCell<Vec<Retained<NSButton>>>,
    statistics: RefCell<StatisticsSnapshot>,
    statistics_button: OnceCell<Retained<NSButton>>,
    source_button: OnceCell<Retained<NSButton>>,
    source_mode: Cell<bool>,
    always_show_word_count: Cell<bool>,
    hovered: Cell<bool>,
}

define_class!(
    // SAFETY: NSView has no additional subclassing requirements. All instances are main-thread-only.
    #[unsafe(super = NSView)]
    #[thread_kind = MainThreadOnly]
    #[ivars = ChromeIvars]
    struct MarkLyraTitlebarView;

    unsafe impl NSObjectProtocol for MarkLyraTitlebarView {}

    impl MarkLyraTitlebarView {
        #[unsafe(method(mouseEntered:))]
        fn mouse_entered(&self, _event: &NSEvent) { self.show_actions(true); }

        #[unsafe(method(mouseExited:))]
        fn mouse_exited(&self, _event: &NSEvent) { self.show_actions(false); }

        #[unsafe(method(toggleSidebar:))]
        fn toggle_sidebar(&self, _sender: &AnyObject) { self.emit("view:sidebar"); }

        #[unsafe(method(toggleOutline:))]
        fn toggle_outline(&self, _sender: &AnyObject) { self.emit("view:outline-popover"); }

        #[unsafe(method(toggleSource:))]
        fn toggle_source(&self, _sender: &AnyObject) { self.emit("view:source"); }

        #[unsafe(method(showStatistics:))]
        fn show_statistics(&self, sender: &NSButton) { self.statistics_menu(sender); }

        #[unsafe(method(selectWords:))]
        fn select_words(&self, _sender: &AnyObject) { self.emit("statistics-unit:words"); }

        #[unsafe(method(selectCharacters:))]
        fn select_characters(&self, _sender: &AnyObject) { self.emit("statistics-unit:characters"); }

        #[unsafe(method(selectLines:))]
        fn select_lines(&self, _sender: &AnyObject) { self.emit("statistics-unit:lines"); }

        #[unsafe(method(selectReadingMinutes:))]
        fn select_reading_minutes(&self, _sender: &AnyObject) { self.emit("statistics-unit:readingMinutes"); }
    }
);

impl MarkLyraTitlebarView {
    fn new(window: &WebviewWindow, mtm: MainThreadMarker) -> Retained<Self> {
        let object = Self::alloc(mtm).set_ivars(ChromeIvars {
            app: window.app_handle().clone(),
            label: window.label().to_owned(),
            actions: OnceCell::new(),
            statistics: RefCell::new(StatisticsSnapshot::default()),
            statistics_button: OnceCell::new(),
            source_button: OnceCell::new(),
            source_mode: Cell::new(false),
            always_show_word_count: Cell::new(true),
            hovered: Cell::new(false),
        });
        // SAFETY: NSView's designated initializer receives the allocated subclass and an NSRect.
        unsafe { msg_send![super(object), initWithFrame: rect(0.0, 0.0, 120.0, 22.0)] }
    }

    fn emit(&self, action: &'static str) {
        if let Err(error) = crate::windows::emit_to_editor(
            &self.ivars().app,
            &self.ivars().label,
            "menu-action",
            action,
        ) {
            eprintln!("Native titlebar action delivery failed: {error}");
        }
    }

    fn show_actions(&self, visible: bool) {
        self.ivars().hovered.set(visible);
        let source_mode = self.ivars().source_mode.get();
        if let Some(button) = self.ivars().statistics_button.get() {
            button
                .setHidden(source_mode || (!visible && !self.ivars().always_show_word_count.get()));
        }
        if let Some(buttons) = self.ivars().actions.get() {
            for button in buttons {
                button.setHidden(source_mode || !visible);
            }
        }
        if let Some(button) = self.ivars().source_button.get() {
            button.setHidden(!source_mode);
            button.setState(1);
        }
    }

    fn statistics_menu(&self, sender: &NSButton) {
        let snapshot = self.ivars().statistics.borrow().clone();
        let menu =
            NSMenu::initWithTitle(NSMenu::alloc(self.mtm()), &NSString::from_str("字数统计"));
        menu.setAutoenablesItems(false);
        for (unit, label) in snapshot.menu_labels() {
            let selector = match unit {
                StatisticsUnit::Words => sel!(selectWords:),
                StatisticsUnit::Characters => sel!(selectCharacters:),
                StatisticsUnit::Lines => sel!(selectLines:),
                StatisticsUnit::ReadingMinutes => sel!(selectReadingMinutes:),
            };
            // SAFETY: each action is declared above; self outlives this synchronous native menu.
            let item = unsafe {
                NSMenuItem::initWithTitle_action_keyEquivalent(
                    NSMenuItem::alloc(self.mtm()),
                    &NSString::from_str(&label),
                    Some(selector),
                    &NSString::from_str(""),
                )
            };
            unsafe {
                item.setTarget(Some(self));
            }
            item.setEnabled(true);
            item.setState(if unit == snapshot.unit { 1 } else { 0 });
            menu.addItem(&item);
        }
        menu.popUpMenuPositioningItem_atLocation_inView(None, NSPoint::new(0.0, 0.0), Some(sender));
    }
}

struct EditorChrome {
    window: Retained<NSWindow>,
    controller: Retained<NSTitlebarAccessoryViewController>,
    view: Retained<MarkLyraTitlebarView>,
    statistics: Retained<NSButton>,
    outline: Retained<NSButton>,
    images: TitlebarImages,
    fullscreen_constraints: Option<Retained<NSArray<NSLayoutConstraint>>>,
    dark: Option<bool>,
}

impl EditorChrome {
    fn place_statistics(&mut self) {
        let on_content = self
            .window
            .styleMask()
            .contains(NSWindowStyleMask::FullScreen)
            && self.view.ivars().always_show_word_count.get()
            && !self.view.ivars().source_mode.get();
        if on_content == self.fullscreen_constraints.is_some() {
            return;
        }
        if on_content {
            let Some(content) = self.window.contentView() else {
                return;
            };
            self.statistics.removeFromSuperview();
            self.statistics
                .setTranslatesAutoresizingMaskIntoConstraints(false);
            content.addSubview(&self.statistics);
            // Original native constraints: right = content.right - 4; top = content.top + 2.
            let constraints = NSArray::from_retained_slice(&[
                self.statistics
                    .rightAnchor()
                    .constraintEqualToAnchor_constant(&content.rightAnchor(), -4.0),
                self.statistics
                    .topAnchor()
                    .constraintEqualToAnchor_constant(&content.topAnchor(), 2.0),
            ]);
            NSLayoutConstraint::activateConstraints(&constraints);
            self.fullscreen_constraints = Some(constraints);
            self.view.show_actions(false);
        } else {
            if let Some(constraints) = self.fullscreen_constraints.take() {
                NSLayoutConstraint::deactivateConstraints(&constraints);
            }
            self.statistics.removeFromSuperview();
            self.statistics
                .setTranslatesAutoresizingMaskIntoConstraints(true);
            self.view.addSubview(&self.statistics);
            self.view.show_actions(false);
        }
    }

    fn layout_controls(&self) {
        // Observed role order/spacing; AppKit measures the current label, so
        // growing counts never depend on the old fixed 104px statistics frame.
        let width = self.statistics.intrinsicContentSize().width.max(0.0);
        // Retain those window-relative positions while keeping every visible
        // button inside its hit-test parent, including the short-count Source label.
        let leading = if self.view.ivars().source_mode.get() {
            (55.0 - width).max(8.0)
        } else {
            8.0
        };
        self.view
            .setFrameSize(NSSize::new(width + 44.0 + leading, 22.0));
        if self.fullscreen_constraints.is_none() {
            native_hover::set_frame(
                &self.statistics,
                titlebar_statistics_rect(leading - 8.0, width),
            );
        }
        if let Some(actions) = self.view.ivars().actions.get() {
            native_hover::set_frame(&actions[0], titlebar_icon_rect(leading + width - 4.0, 10.0));
            native_hover::set_frame(
                &actions[1],
                titlebar_icon_rect(leading + width + 20.0, 13.0),
            );
        }
        if let Some(source) = self.view.ivars().source_button.get() {
            source.setFrame(rect(leading + width - 55.0, 4.0, 96.0, 18.0));
        }
    }
}

thread_local! {
    // Retained AppKit objects must never leave the main thread.
    static CHROME: RefCell<HashMap<String, EditorChrome>> = RefCell::new(HashMap::new());
}

fn rect(x: f64, y: f64, width: f64, height: f64) -> NSRect {
    NSRect::new(NSPoint::new(x, y), NSSize::new(width, height))
}

fn titlebar_icon_rect(x: f64, height: f64) -> NSRect {
    // Keep the two differently sized images on the same visual center.
    rect(x, 15.0 - height / 2.0, 16.0, height)
}

fn titlebar_statistics_rect(x: f64, width: f64) -> NSRect {
    rect(x, 8.0, width, 13.0)
}

fn button(
    view: &MarkLyraTitlebarView,
    title: &str,
    selector: Sel,
    frame: NSRect,
    hover: bool,
) -> Retained<NSButton> {
    let title = NSString::from_str(title);
    // SAFETY: target is the retained view; each selector is declared on this subclass above.
    let button = if hover {
        native_hover::button(&title, view, selector, view.mtm())
    } else {
        unsafe {
            NSButton::buttonWithTitle_target_action(&title, Some(view), Some(selector), view.mtm())
        }
    };
    if !hover {
        button.setBordered(false);
    }
    if hover {
        native_hover::set_frame(&button, frame);
    } else {
        button.setFrame(frame);
    }
    button.setFont(Some(&NSFont::systemFontOfSize(12.0)));
    button.setToolTip(Some(&title));
    button.setAccessibilityLabel(Some(&title));
    view.addSubview(&button);
    button
}

pub(super) fn initialise(window: &WebviewWindow) -> Result<bool, String> {
    let mtm = MainThreadMarker::new().ok_or("原生标题栏需要主线程")?;
    CHROME.with(|registry| {
        let mut registry = registry.borrow_mut();
        if registry.contains_key(window.label()) {
            return Ok(true);
        }
        let pointer = window.ns_window().map_err(|error| error.to_string())?;
        // SAFETY: ns_window is a live NSWindow for this retained Tauri window; all access is on main.
        let native =
            unsafe { Retained::retain(pointer.cast::<NSWindow>()) }.ok_or("原生窗口不存在")?;
        let view = MarkLyraTitlebarView::new(window, mtm);
        let images = TitlebarImages::load()?;
        let statistics = button(
            &view,
            "0 词",
            sel!(showStatistics:),
            titlebar_statistics_rect(0.0, 80.0),
            true,
        );
        statistics.setFont(Some(&NSFont::systemFontOfSize(12.0)));
        let _ = view.ivars().statistics_button.set(statistics.clone());
        let outline = button(
            &view,
            "大纲",
            sel!(toggleOutline:),
            titlebar_icon_rect(0.0, 10.0),
            true,
        );
        outline.setImage(Some(&images.outline));
        outline.setTitle(&NSString::from_str(""));
        outline.setButtonType(NSButtonType::Toggle);
        outline.setToolTip(Some(&NSString::from_str("Show Outline Popover")));
        let sidebar = button(
            &view,
            "侧边栏",
            sel!(toggleSidebar:),
            titlebar_icon_rect(0.0, 13.0),
            true,
        );
        sidebar.setImage(Some(&images.sidebar));
        sidebar.setTitle(&NSString::from_str(""));
        let source = button(
            &view,
            "Source Mode ×",
            sel!(toggleSource:),
            rect(0.0, 4.0, 96.0, 18.0),
            false,
        );
        source.setAccessibilityLabel(Some(&NSString::from_str("退出源代码模式")));
        source.setBordered(true);
        source.setButtonType(NSButtonType::PushOnPushOff);
        source.setBezelStyle(NSBezelStyle::AccessoryBar);
        source.setState(1);
        source.setAlphaValue(0.8);
        let _ = view.ivars().source_button.set(source);
        let _ = view.ivars().actions.set(vec![outline.clone(), sidebar]);
        view.show_actions(false);
        // SAFETY: view implements mouseEntered:/mouseExited: and outlives its retained tracking area.
        let tracking = unsafe {
            NSTrackingArea::initWithRect_options_owner_userInfo(
                NSTrackingArea::alloc(),
                view.bounds(),
                NSTrackingAreaOptions::MouseEnteredAndExited
                    | NSTrackingAreaOptions::ActiveAlways
                    | NSTrackingAreaOptions::InVisibleRect,
                Some(&view),
                None,
            )
        };
        view.addTrackingArea(&tracking);
        let controller = NSTitlebarAccessoryViewController::new(mtm);
        controller.setView(&view);
        controller.setLayoutAttribute(NSLayoutAttribute::Right);
        native.setTitleVisibility(NSWindowTitleVisibility::Visible);
        native.addTitlebarAccessoryViewController(&controller);
        let chrome = EditorChrome {
            window: native,
            controller,
            view,
            statistics,
            outline,
            images,
            fullscreen_constraints: None,
            dark: None,
        };
        chrome.layout_controls();
        registry.insert(window.label().to_owned(), chrome);
        Ok(true)
    })
}

pub(super) fn update(label: &str, update: DocumentChrome) -> Result<(), String> {
    MainThreadMarker::new().ok_or("原生标题栏需要主线程")?;
    CHROME.with(|registry| {
        let mut registry = registry.borrow_mut();
        let chrome = registry.get_mut(label).ok_or("原生标题栏尚未初始化")?;
        if chrome.dark != Some(update.dark) {
            // SAFETY: AppKit's immutable appearance names are read on the OS main thread.
            let appearance = NSAppearance::appearanceNamed(unsafe {
                if update.dark {
                    NSAppearanceNameDarkAqua
                } else {
                    NSAppearanceNameAqua
                }
            });
            chrome.window.setAppearance(appearance.as_deref());
            chrome.outline.setImage(Some(if update.dark {
                &chrome.images.outline_dark
            } else {
                &chrome.images.outline
            }));
            if let Some(actions) = chrome.view.ivars().actions.get() {
                actions[1].setImage(Some(if update.dark {
                    &chrome.images.sidebar_dark
                } else {
                    &chrome.images.sidebar
                }));
            }
            chrome.dark = Some(update.dark);
        }
        let title = update
            .path
            .as_deref()
            .and_then(std::path::Path::file_name)
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| "未命名".into());
        let url = update
            .path
            .as_deref()
            .filter(|_| update.file_proxy)
            .map(|path| NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy())));
        chrome.window.setRepresentedURL(url.as_deref());
        chrome.window.setTitle(&NSString::from_str(&title));
        chrome.window.setDocumentEdited(update.dirty);
        chrome
            .outline
            .setState(if update.outline_popover_open { 1 } else { 0 });
        chrome
            .statistics
            .setTitle(&NSString::from_str(&update.statistics_label));
        chrome
            .statistics
            .setAlphaValue(if update.dark { 0.7 } else { 1.0 });
        chrome
            .statistics
            .setToolTip(Some(&NSString::from_str(&update.statistics_label)));
        *chrome.view.ivars().statistics.borrow_mut() = update.statistics;
        chrome
            .view
            .ivars()
            .always_show_word_count
            .set(update.always_show_word_count);
        if let Some(source_mode) = update.source_mode {
            chrome.view.ivars().source_mode.set(source_mode);
        }
        chrome.view.show_actions(chrome.view.ivars().hovered.get());
        chrome
            .statistics
            .setAccessibilityLabel(Some(&NSString::from_str(&format!(
                "字数统计：{}",
                update.statistics_label
            ))));
        chrome.place_statistics();
        chrome.layout_controls();
        Ok(())
    })
}

pub(super) fn release(label: &str) {
    let Some(_) = MainThreadMarker::new() else {
        return;
    };
    CHROME.with(|registry| {
        if let Some(chrome) = registry.borrow_mut().remove(label) {
            if let Some(constraints) = chrome.fullscreen_constraints {
                NSLayoutConstraint::deactivateConstraints(&constraints);
                chrome.statistics.removeFromSuperview();
            }
            let controllers = chrome.window.titlebarAccessoryViewControllers();
            if let Some(index) = controllers
                .iter()
                .position(|entry| *entry == *chrome.controller)
            {
                if let Ok(index) = isize::try_from(index) {
                    chrome
                        .window
                        .removeTitlebarAccessoryViewControllerAtIndex(index);
                }
            }
            chrome.view.show_actions(false);
        }
    });
}

pub(super) fn window_changed(label: &str) {
    if MainThreadMarker::new().is_none() {
        return;
    }
    CHROME.with(|registry| {
        if let Some(chrome) = registry.borrow_mut().get_mut(label) {
            chrome.place_statistics();
            chrome.layout_controls();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{titlebar_icon_rect, titlebar_statistics_rect};

    #[test]
    fn titlebar_statistics_offset_preserves_icon_layout() {
        for label_width in [24.0, 80.0, 140.0] {
            let statistics = titlebar_statistics_rect(0.0, label_width);
            let outline = titlebar_icon_rect(label_width + 4.0, 10.0);
            let sidebar = titlebar_icon_rect(label_width + 28.0, 13.0);
            assert_eq!(statistics.origin.y, 8.0);
            assert_eq!(statistics.size.width, label_width);
            assert_eq!(statistics.size.height, 13.0);
            for frame in [statistics, outline, sidebar] {
                assert!(frame.origin.y >= 0.0);
                assert!(frame.origin.y + frame.size.height <= 22.0);
            }
            for frame in [outline, sidebar] {
                assert_eq!(frame.origin.y + frame.size.height / 2.0, 15.0);
                assert_eq!(frame.size.width, 16.0);
            }
            assert_eq!(outline.origin.x, label_width + 4.0);
            assert_eq!(sidebar.origin.x, label_width + 28.0);
        }
    }
}
