use super::{
    native_hover, native_images::TitlebarImages, native_title, native_title_action,
    title_layout::TitlebarLayout, DocumentChrome, StatisticsSnapshot, StatisticsUnit,
};
use objc2::{
    define_class, msg_send,
    rc::Retained,
    runtime::{AnyObject, Sel},
    sel, DefinedClass, MainThreadOnly,
};
use objc2_app_kit::{
    NSAccessibility, NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua,
    NSAppearanceNameDarkAqua, NSBezelStyle, NSButton, NSButtonType, NSFont, NSLayoutAttribute,
    NSLayoutConstraint, NSMenu, NSMenuItem, NSTitlebarAccessoryViewController, NSView, NSWindow,
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
    title_button: OnceCell<Retained<NSButton>>,
    home_button: OnceCell<Retained<NSButton>>,
    /// A document is open, so the way back to the home view is offered.
    can_close: Cell<bool>,
    source_button: OnceCell<Retained<NSButton>>,
    source_mode: Cell<bool>,
    always_show_word_count: Cell<bool>,
    content_layout: Cell<Option<TitlebarLayout>>,
    preferences_page: Cell<bool>,
    image_preview_open: Cell<bool>,
}

define_class!(
    // SAFETY: NSView has no additional subclassing requirements. All instances are main-thread-only.
    #[unsafe(super = NSView)]
    #[thread_kind = MainThreadOnly]
    #[ivars = ChromeIvars]
    struct MarkLyraTitlebarView;

    unsafe impl NSObjectProtocol for MarkLyraTitlebarView {}

    impl MarkLyraTitlebarView {
        #[unsafe(method(layout))]
        fn layout(&self) {
            // SAFETY: this is the NSView layout override, on AppKit's main thread.
            unsafe { let _: () = msg_send![super(self), layout]; }
            self.position_title();
        }
        #[unsafe(method(renameDocument:))]
        fn rename_document(&self, _sender: &AnyObject) { self.emit("rename-document"); }

        #[unsafe(method(closeDocument:))]
        fn close_document(&self, _sender: &AnyObject) { self.emit("close-document"); }

        #[unsafe(method(toggleSidebar:))]
        fn toggle_sidebar(&self, _sender: &AnyObject) { self.emit("view:sidebar"); }

        #[unsafe(method(toggleOutline:))]
        fn toggle_outline(&self, _sender: &AnyObject) { self.emit("view:outline"); }

        #[unsafe(method(toggleAi:))]
        fn toggle_ai(&self, _sender: &AnyObject) { self.emit("view:ai"); }

        #[unsafe(method(toggleGraph:))]
        fn toggle_graph(&self, _sender: &AnyObject) { self.emit("view:graph"); }

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
            title_button: OnceCell::new(),
            home_button: OnceCell::new(),
            can_close: Cell::new(false),
            source_button: OnceCell::new(),
            source_mode: Cell::new(false),
            always_show_word_count: Cell::new(true),
            content_layout: Cell::new(None),
            preferences_page: Cell::new(false),
            image_preview_open: Cell::new(false),
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

    fn position_title(&self) {
        if self.ivars().preferences_page.get() || self.ivars().image_preview_open.get() {
            if let Some(button) = self.ivars().title_button.get() {
                button.setHidden(true);
            }
            if let Some(window) = self.window() {
                window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
                if let Some(field) = native_title::title_field(&window) {
                    field.setHidden(true);
                }
                if let Some(icon) =
                    window.standardWindowButton(objc2_app_kit::NSWindowButton::DocumentIconButton)
                {
                    icon.setHidden(true);
                }
            }
            return;
        }
        if let (Some(window), Some(layout)) = (self.window(), self.ivars().content_layout.get()) {
            let accessory_left = self.convertRect_toView(self.bounds(), None).origin.x;
            native_title::position(&window, layout, accessory_left);
            if let Some(button) = self.ivars().title_button.get() {
                native_title_action::position(button, &window);
            }
        } else if let Some(button) = self.ivars().title_button.get() {
            button.setHidden(true);
        }
    }

    fn update_visibility(&self) {
        // Normal editor controls remain discoverable without hovering the titlebar.
        let source_mode = self.ivars().source_mode.get();
        let settings = self.ivars().preferences_page.get() || self.ivars().image_preview_open.get();
        if let Some(button) = self.ivars().statistics_button.get() {
            // The word count lives in the lower right corner of the document card (web), not here.
            button.setHidden(true);
        }
        if let Some(button) = self.ivars().home_button.get() {
            button.setHidden(!self.home_offered());
        }
        if let Some(buttons) = self.ivars().actions.get() {
            for button in buttons {
                button.setHidden(source_mode || settings);
            }
        }
        if let Some(button) = self.ivars().source_button.get() {
            button.setHidden(!source_mode || settings);
            button.setState(1);
        }
    }

    /// The Home button shows beside the word count, never in source mode or on the settings page.
    fn home_offered(&self) -> bool {
        self.ivars().can_close.get()
            && !self.ivars().source_mode.get()
            && !self.ivars().preferences_page.get()
            && !self.ivars().image_preview_open.get()
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
    ai: Retained<NSButton>,
    graph: Retained<NSButton>,
    images: TitlebarImages,
    fullscreen_constraints: Option<Retained<NSArray<NSLayoutConstraint>>>,
    dark: Option<bool>,
}

impl EditorChrome {
    fn place_statistics(&mut self) {
        // The native word count is retired; it is never pinned to the full-screen content.
        let on_content = false;
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
            // Native layout constraints: right = content.right - 4; top = content.top + 2.
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
            self.view.update_visibility();
        } else {
            if let Some(constraints) = self.fullscreen_constraints.take() {
                NSLayoutConstraint::deactivateConstraints(&constraints);
            }
            self.statistics.removeFromSuperview();
            self.statistics
                .setTranslatesAutoresizingMaskIntoConstraints(true);
            self.view.addSubview(&self.statistics);
            self.view.update_visibility();
        }
    }

    fn layout_controls(&self) {
        // AppKit measures the current label; the four action columns stay fixed
        // relative to the right edge as word counts grow.
        // The titlebar no longer carries a word count, so the icons start at the left edge.
        let width: f64 = 0.0;
        let source_mode = self.view.ivars().source_mode.get();
        let leading = if source_mode {
            (55.0 - width).max(8.0)
        } else {
            8.0
        };
        // Match ai.css: 28px buttons, 4px gaps, 8px padding and a 20px
        // scrollbar gutter put the centers 106 / 74 / 42px from the edge.
        // Source mode keeps its existing label placement; these icons are hidden there.
        let trailing = if source_mode { 70.0 } else { 142.0 };
        // The Home button takes a column to the left of the word count while it is offered.
        let home = home_slot(self.view.home_offered());
        self.view
            .setFrameSize(NSSize::new(width + trailing + leading + home, 22.0));
        if let Some(button) = self.view.ivars().home_button.get() {
            native_hover::set_frame(button, titlebar_icon_rect(leading - 4.0, 13.0));
        }
        if self.fullscreen_constraints.is_none() {
            native_hover::set_frame(
                &self.statistics,
                titlebar_statistics_rect(leading - 8.0 + home, width),
            );
        }
        if let Some(actions) = self.view.ivars().actions.get() {
            native_hover::set_frame(
                &actions[3],
                titlebar_icon_rect(leading + home + width + 60.0, 16.0),
            );
            native_hover::set_frame(
                &actions[2],
                titlebar_icon_rect(leading + home + width + 92.0, 13.0),
            );
            native_hover::set_frame(
                &actions[0],
                titlebar_icon_rect(leading + home + width - 4.0, 14.0),
            );
            native_hover::set_frame(
                &actions[1],
                titlebar_icon_rect(leading + home + width + 28.0, 14.0),
            );
        }
        if let Some(source) = self.view.ivars().source_button.get() {
            source.setFrame(rect(leading + width - 55.0, 4.0, 96.0, 18.0));
        }
        self.view.setNeedsLayout(true);
        self.view.position_title();
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

/// Width the Home button adds to the left of the word count: a 16pt icon and a 16pt gap.
fn home_slot(offered: bool) -> f64 {
    if offered {
        32.0
    } else {
        0.0
    }
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
        let _ = view.ivars().title_button.set(native_title_action::button(
            &view,
            sel!(renameDocument:),
            mtm,
        ));
        let home = button(
            &view,
            "回到首页",
            sel!(closeDocument:),
            titlebar_icon_rect(0.0, 13.0),
            true,
        );
        if let Some(image) =
            objc2_app_kit::NSImage::imageWithSystemSymbolName_accessibilityDescription(
                &NSString::from_str("house"),
                Some(&NSString::from_str("回到首页")),
            )
        {
            image.setSize(NSSize::new(14.0, 14.0));
            home.setImage(Some(&image));
            home.setTitle(&NSString::from_str(""));
        }
        home.setToolTip(Some(&NSString::from_str("回到首页（关闭当前文档）")));
        let _ = view.ivars().home_button.set(home);
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
            titlebar_icon_rect(0.0, 14.0),
            true,
        );
        outline.setImage(Some(&images.outline));
        outline.setTitle(&NSString::from_str(""));
        outline.setButtonType(NSButtonType::Toggle);
        outline.setToolTip(Some(&NSString::from_str("显示/隐藏文档目录")));
        let sidebar = button(
            &view,
            "侧边栏",
            sel!(toggleSidebar:),
            titlebar_icon_rect(0.0, 14.0),
            true,
        );
        sidebar.setImage(Some(&images.sidebar));
        sidebar.setTitle(&NSString::from_str(""));
        let ai = button(
            &view,
            "AI 助手",
            sel!(toggleAi:),
            titlebar_icon_rect(0.0, 13.0),
            true,
        );
        if let Some(image) =
            objc2_app_kit::NSImage::imageWithSystemSymbolName_accessibilityDescription(
                &NSString::from_str("sparkles"),
                Some(&NSString::from_str("AI 助手")),
            )
        {
            image.setSize(NSSize::new(14.0, 14.0));
            ai.setImage(Some(&image));
            ai.setTitle(&NSString::from_str(""));
        }
        ai.setButtonType(NSButtonType::Toggle);
        let graph = button(
            &view,
            "知识图谱",
            sel!(toggleGraph:),
            titlebar_icon_rect(0.0, 16.0),
            true,
        );
        graph.setImage(Some(&images.graph));
        graph.setTitle(&NSString::from_str(""));
        graph.setButtonType(NSButtonType::Toggle);
        graph.setEnabled(false);
        graph.setToolTip(Some(&NSString::from_str("知识图谱（先打开文件夹）")));
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
        let _ = view
            .ivars()
            .actions
            .set(vec![outline.clone(), sidebar, ai.clone(), graph.clone()]);
        view.update_visibility();
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
            ai,
            graph,
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
            chrome.dark = Some(update.dark);
        }
        if let Some(actions) = chrome.view.ivars().actions.get() {
            actions[1].setImage(Some(if update.sidebar_open {
                &chrome.images.sidebar
            } else {
                &chrome.images.sidebar_collapsed
            }));
        }
        chrome
            .view
            .ivars()
            .image_preview_open
            .set(update.image_preview_open);
        chrome.window.setTitleVisibility(
            if update.image_preview_open || chrome.view.ivars().preferences_page.get() {
                NSWindowTitleVisibility::Hidden
            } else {
                NSWindowTitleVisibility::Visible
            },
        );
        let title = update.title();
        let url = update
            .path
            .as_deref()
            .filter(|_| update.file_proxy)
            .map(|path| NSURL::fileURLWithPath(&NSString::from_str(&path.to_string_lossy())));
        chrome.window.setRepresentedURL(url.as_deref());
        chrome.window.setTitle(&NSString::from_str(&title));
        chrome.window.setDocumentEdited(update.dirty);
        if let Some(button) = chrome.view.ivars().title_button.get() {
            button.setEnabled(!update.graph_open && update.file_proxy && update.path.is_some());
        }
        chrome.view.ivars().can_close.set(update.can_close_document);
        chrome.ai.setState(if update.ai_panel_open { 1 } else { 0 });
        chrome.graph.setState(if update.graph_open { 1 } else { 0 });
        chrome.graph.setEnabled(update.graph_available);
        chrome
            .graph
            .setToolTip(Some(&NSString::from_str(if update.graph_available {
                "知识图谱"
            } else {
                "知识图谱（先打开文件夹）"
            })));
        chrome
            .outline
            .setState(if update.outline_panel_open { 1 } else { 0 });
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
        chrome.view.update_visibility();
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
            if let Some(button) = chrome.view.ivars().title_button.get() {
                button.removeFromSuperview();
            }
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
            chrome.view.update_visibility();
        }
    });
}

pub(super) fn update_title_layout(label: &str, layout: TitlebarLayout) -> Result<(), String> {
    MainThreadMarker::new().ok_or("原生标题栏需要主线程")?;
    CHROME.with(|registry| {
        let registry = registry.borrow();
        let chrome = registry.get(label).ok_or("原生标题栏尚未初始化")?;
        chrome.view.ivars().content_layout.set(Some(layout));
        chrome.view.setNeedsLayout(true);
        chrome.view.position_title();
        Ok(())
    })
}

pub(super) fn set_preferences_page(label: &str, open: bool) -> Result<(), String> {
    MainThreadMarker::new().ok_or("设置页面需要主线程")?;
    CHROME.with(|registry| {
        let registry = registry.borrow();
        if let Some(chrome) = registry.get(label) {
            chrome.view.ivars().preferences_page.set(open);
            chrome.window.setTitleVisibility(if open {
                NSWindowTitleVisibility::Hidden
            } else {
                NSWindowTitleVisibility::Visible
            });
            // A refresh while settings was open may have removed Home's column.
            // Restore the complete geometry before showing the editor controls.
            chrome.layout_controls();
            chrome.view.update_visibility();
        }
        Ok(())
    })
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
    use super::{home_slot, titlebar_icon_rect, titlebar_statistics_rect};

    #[test]
    fn the_home_column_shifts_the_word_count_and_icons_together() {
        assert_eq!(home_slot(false), 0.0);
        let slot = home_slot(true);
        assert_eq!(slot, 32.0);
        // The Home icon sits left of the word count with a visible gap.
        let home = titlebar_icon_rect(8.0 - 4.0, 13.0);
        let statistics = titlebar_statistics_rect(8.0 - 8.0 + slot, 80.0);
        assert!(home.origin.x + home.size.width < statistics.origin.x);
        assert_eq!(home.origin.y + home.size.height / 2.0, 15.0);
    }

    #[test]
    fn titlebar_statistics_offset_preserves_icon_layout() {
        for label_width in [24.0, 80.0, 140.0] {
            let statistics = titlebar_statistics_rect(0.0, label_width);
            let outline = titlebar_icon_rect(label_width + 4.0, 10.0);
            let sidebar = titlebar_icon_rect(label_width + 36.0, 13.0);
            let ai = titlebar_icon_rect(label_width + 68.0, 13.0);
            let view_width = label_width + 118.0;
            assert_eq!(statistics.origin.y, 8.0);
            assert_eq!(statistics.size.width, label_width);
            assert_eq!(statistics.size.height, 13.0);
            for frame in [statistics, outline, sidebar, ai] {
                assert!(frame.origin.y >= 0.0);
                assert!(frame.origin.y + frame.size.height <= 22.0);
            }
            for (frame, distance_from_right) in [(outline, 106.0), (sidebar, 74.0), (ai, 42.0)] {
                assert_eq!(frame.origin.y + frame.size.height / 2.0, 15.0);
                assert_eq!(frame.size.width, 16.0);
                assert_eq!(
                    view_width - frame.origin.x - frame.size.width / 2.0,
                    distance_from_right
                );
            }
            assert_eq!(outline.origin.x, label_width + 4.0);
            assert_eq!(sidebar.origin.x, label_width + 36.0);
        }
    }
}
