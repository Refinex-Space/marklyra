//! Real AppKit title/proxy geometry on the main thread, in an unshown window.
#[cfg(target_os = "macos")]
#[path = "../src/platform/ui_chrome/native_title.rs"]
mod native_title;
#[cfg(target_os = "macos")]
#[allow(unused_imports)] // The shared module's #[test] imports are unused by this main-thread harness.
#[path = "../src/platform/ui_chrome/title_layout.rs"]
mod title_layout;

#[cfg(target_os = "macos")]
#[path = "../src/platform/ui_chrome/native_title_action.rs"]
mod native_title_action;

#[cfg(target_os = "macos")]
mod click_probe {
    use objc2::{define_class, runtime::AnyObject, MainThreadOnly};
    use objc2_foundation::{NSObject, NSObjectProtocol};
    pub static CLICKS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    define_class!(
        #[unsafe(super = NSObject)]
        #[thread_kind = MainThreadOnly]
        pub struct RenameProbe;
        unsafe impl NSObjectProtocol for RenameProbe {}
        impl RenameProbe {
            #[unsafe(method(renameDocument:))]
            fn rename_document(&self, _sender: &AnyObject) { CLICKS.fetch_add(1, std::sync::atomic::Ordering::SeqCst); }
        }
    );
}

#[cfg(target_os = "macos")]
fn main() {
    use objc2::{
        msg_send,
        rc::{autoreleasepool, Retained},
        sel, MainThreadMarker, MainThreadOnly,
    };
    use objc2_app_kit::{
        NSApplication, NSBackingStoreType, NSEventModifierFlags, NSEventType, NSWindow,
        NSWindowButton, NSWindowStyleMask, NSWindowTitleVisibility,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString, NSURL};
    use title_layout::TitlebarLayout;

    let mtm = MainThreadMarker::new().unwrap();
    autoreleasepool(|_| {
        let _app = NSApplication::sharedApplication(mtm);
        // SAFETY: the window is created and retained on the main thread and is
        // never ordered onto the user's screen.
        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1280.0, 800.0)),
                NSWindowStyleMask::Titled
                    | NSWindowStyleMask::Closable
                    | NSWindowStyleMask::Resizable
                    | NSWindowStyleMask::FullSizeContentView,
                NSBackingStoreType::Buffered,
                false,
            )
        };
        let url = NSURL::fileURLWithPath(&NSString::from_str("/tmp/MarkLyra-title-layout.md"));
        window.setRepresentedURL(Some(&url));
        window.setDocumentEdited(true);
        let probe: Retained<click_probe::RenameProbe> =
            unsafe { msg_send![click_probe::RenameProbe::alloc(mtm), init] };
        let rename = native_title_action::button(&probe, sel!(renameDocument:), mtm);
        rename.setEnabled(true);
        let mut expected_clicks = 0;

        for name in [
            "README.md".to_owned(),
            "项目使用说明与功能设计.md".to_owned(),
            "超长标题_".repeat(100) + ".md",
        ] {
            window.setTitle(&NSString::from_str(&name));
            let icon = window
                .standardWindowButton(NSWindowButton::DocumentIconButton)
                .unwrap();
            let action = icon.action();
            let image = icon.image();
            for (width, left, right) in [
                (1280.0, 270.0, 1280.0),
                (1280.0, 0.0, 1280.0),
                (1280.0, 270.0, 980.0),
                (960.0, 160.0, 740.0),
                (1600.0, 400.0, 1300.0),
            ] {
                window.setFrame_display(
                    NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(width, 800.0)),
                    false,
                );
                let field = native_title::title_field(&window).expect("AppKit title field");
                // SAFETY: this window retains all its view ancestors throughout the test.
                let parent = unsafe { field.superview() }.unwrap();
                parent.layoutSubtreeIfNeeded();
                native_title::position(
                    &window,
                    TitlebarLayout {
                        content_left: left,
                        content_right: right,
                        viewport_width: width,
                    }
                    .validate()
                    .unwrap(),
                    width - 140.0,
                );
                native_title_action::position(&rename, &window);
                parent.layoutSubtreeIfNeeded();
                assert!(!rename.isHidden());
                assert_eq!(rename.frame(), field.frame());
                assert!(
                    rename.isTransparent(),
                    "AppKit still draws the original title"
                );
                assert!(!rename.mouseDownCanMoveWindow());
                let frame = rename.frame();
                let point = NSPoint::new(
                    frame.origin.x + frame.size.width / 2.0,
                    frame.origin.y + frame.size.height / 2.0,
                );
                let outer = unsafe { parent.superview() };
                let point = parent.convertPoint_toView(point, outer.as_deref());
                let hit = parent.hitTest(point).expect("native title hit target");
                assert_eq!(
                    Retained::as_ptr(&hit).cast::<()>(),
                    Retained::as_ptr(&rename).cast::<()>()
                );
                unsafe {
                    rename.performClick(None);
                }
                expected_clicks += 1;
                assert_eq!(
                    click_probe::CLICKS.load(std::sync::atomic::Ordering::SeqCst),
                    expected_clicks
                );
                let text = parent.convertRect_toView(field.frame(), None);
                // SAFETY: the same retained window owns this standard button.
                let icon_parent = unsafe { icon.superview() }.unwrap();
                let glyph = icon_parent.convertRect_toView(icon.frame(), None);
                let center = (glyph.origin.x + text.origin.x + text.size.width) / 2.0;
                assert!(
                    (center - (left + right) / 2.0).abs() < 0.5,
                    "native title center: {center} for {left}..{right}"
                );
                assert!(!field.isHidden());
                if name.chars().count() < 30 {
                    let required = field.cell().unwrap().cellSize().width.ceil();
                    assert!(
                        field.frame().size.width >= required,
                        "A short native title must not truncate: {}pt allocated, {}pt required for {name}",
                        field.frame().size.width,
                        required,
                    );
                } else {
                    assert!(text.size.width <= 600.0);
                    if width >= 1280.0 {
                        assert_eq!(
                            text.size.width, 600.0,
                            "Long titles use the full maximum width when there is room"
                        );
                    }
                }
                assert!(glyph.origin.x >= left + 8.0);
                assert!(text.origin.x + text.size.width <= (width - 148.0).min(right - 8.0) + 0.5);
                assert_eq!(field.stringValue().to_string(), name);
                assert_eq!(window.representedURL().unwrap(), url);
                assert!(window.isDocumentEdited());
                assert_eq!(icon.action(), action);
                assert_eq!(icon.image(), image);
            }
        }
        for kind in [NSEventType::RightMouseDown, NSEventType::OtherMouseDown] {
            assert!(!native_title_action::accepts_click(
                kind,
                NSEventModifierFlags::empty()
            ));
        }
        for modifier in [
            NSEventModifierFlags::Command,
            NSEventModifierFlags::Control,
            NSEventModifierFlags::Option,
            NSEventModifierFlags::Shift,
        ] {
            assert!(!native_title_action::accepts_click(
                NSEventType::LeftMouseDown,
                modifier
            ));
        }
        assert!(native_title_action::accepts_click(
            NSEventType::LeftMouseDown,
            NSEventModifierFlags::empty()
        ));
        window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
        native_title_action::position(&rename, &window);
        assert!(
            rename.isHidden(),
            "preferences hides the title click target"
        );
        window.setTitleVisibility(NSWindowTitleVisibility::Visible);
        rename.setEnabled(false);
        native_title_action::position(&rename, &window);
        assert!(
            rename.isHidden(),
            "untitled/deleted documents have no rename target"
        );
        window.setRepresentedURL(None);
        window.setTitle(&NSString::from_str("未命名"));
        let field = native_title::title_field(&window).unwrap();
        let width = window.contentView().unwrap().bounds().size.width;
        let layout = TitlebarLayout {
            content_left: 270.0,
            content_right: width,
            viewport_width: width,
        };
        rename.setEnabled(true);
        native_title::position(&window, layout, 500.0);
        native_title_action::position(&rename, &window);
        assert!(
            rename.isHidden(),
            "clipped titles leave no stale clickable rectangle"
        );
        assert!(
            field.isHidden(),
            "A title cannot overlap the right accessory controls"
        );
        native_title::position(&window, layout, width - 140.0);
        assert!(!field.isHidden());
        // SAFETY: this retained window owns the field and its ancestors.
        let parent = unsafe { field.superview() }.unwrap();
        let text = parent.convertRect_toView(field.frame(), None);
        assert!((text.origin.x + text.size.width / 2.0 - (270.0 + width) / 2.0).abs() < 0.5);
        assert!(window.representedURL().is_none());
        rename.removeFromSuperview(); // The action target must outlive its attached button.
    });
    println!("Native title passed: layout, real hit testing, rename target/action, modifier passthrough, visibility and original proxy state");
}

#[cfg(not(target_os = "macos"))]
fn main() {
    println!("Native title layout requires macOS");
}
