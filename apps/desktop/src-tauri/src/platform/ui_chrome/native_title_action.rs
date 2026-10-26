//! A non-drawing hit target over the title text, leaving AppKit's title cell and file proxy intact.
use super::native_title;
use objc2::{
    define_class, msg_send,
    rc::Retained,
    runtime::{AnyObject, Sel},
    MainThreadOnly,
};
use objc2_app_kit::{
    NSAccessibility, NSApplication, NSButton, NSEventModifierFlags, NSEventType, NSView, NSWindow,
    NSWindowTitleVisibility,
};
use objc2_foundation::{MainThreadMarker, NSObjectProtocol, NSPoint, NSRect, NSString};

pub(super) fn accepts_click(kind: NSEventType, modifiers: NSEventModifierFlags) -> bool {
    !matches!(
        kind,
        NSEventType::RightMouseDown
            | NSEventType::RightMouseUp
            | NSEventType::OtherMouseDown
            | NSEventType::OtherMouseUp
    ) && !modifiers.intersects(
        NSEventModifierFlags::Command
            | NSEventModifierFlags::Control
            | NSEventModifierFlags::Option
            | NSEventModifierFlags::Shift,
    )
}

define_class!(
    // SAFETY: only hit testing changes; standard NSButton owns left-click tracking and target/action.
    #[unsafe(super = NSButton)]
    #[thread_kind = MainThreadOnly]
    struct MarkLyraDocumentTitleButton;
    unsafe impl NSObjectProtocol for MarkLyraDocumentTitleButton {}
    impl MarkLyraDocumentTitleButton {
        #[unsafe(method(mouseDownCanMoveWindow))]
        fn mouse_down_can_move_window(&self) -> bool { false }

        #[unsafe(method_id(hitTest:))]
        fn hit_test(&self, point: NSPoint) -> Option<Retained<NSView>> {
            // Cmd-click / secondary-click continue through the standard AppKit title controls.
            let passthrough = NSApplication::sharedApplication(self.mtm()).currentEvent()
                .is_some_and(|event| !accepts_click(event.r#type(), event.modifierFlags()));
            if !self.isEnabled() || passthrough { None } else {
                // SAFETY: forward NSView's documented hit-test coordinates unchanged.
                unsafe { msg_send![super(self), hitTest: point] }
            }
        }
    }
);

pub(super) fn button(target: &AnyObject, action: Sel, mtm: MainThreadMarker) -> Retained<NSButton> {
    // SAFETY: designated NSButton initializer on the main thread.
    let button: Retained<MarkLyraDocumentTitleButton> =
        unsafe { msg_send![MarkLyraDocumentTitleButton::alloc(mtm), initWithFrame: NSRect::ZERO] };
    button.setTitle(&NSString::from_str(""));
    button.setTransparent(true);
    button.setBordered(false);
    button.setRefusesFirstResponder(true);
    button.setToolTip(Some(&NSString::from_str("重命名文稿")));
    button.setAccessibilityLabel(Some(&NSString::from_str("重命名文稿")));
    button.setHidden(true);
    button.setEnabled(false);
    // SAFETY: the caller retains target and removes this button before releasing it.
    unsafe {
        button.setTarget(Some(target));
        button.setAction(Some(action));
    }
    button.into_super()
}

pub(super) fn position(button: &NSButton, window: &NSWindow) {
    let Some(field) = native_title::title_field(window) else {
        button.setHidden(true);
        return;
    };
    // SAFETY: the caller retains window and runs on AppKit's main thread.
    let Some(parent) = (unsafe { field.superview() }) else {
        button.setHidden(true);
        return;
    };
    if unsafe { button.superview() }.as_deref() != Some(&parent) {
        button.removeFromSuperview();
        parent.addSubview(button);
    }
    if button.frame() != field.frame() {
        button.setFrame(field.frame());
    }
    button.setHidden(
        !button.isEnabled()
            || field.isHidden()
            || window.titleVisibility() == NSWindowTitleVisibility::Hidden,
    );
}
