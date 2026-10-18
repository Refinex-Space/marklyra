use objc2::{
    define_class, msg_send,
    rc::Retained,
    runtime::{AnyObject, Sel},
    AnyThread, DefinedClass, MainThreadOnly,
};
use objc2_app_kit::{
    NSBezelStyle, NSBezierPath, NSButton, NSButtonCell, NSButtonType, NSColor, NSEvent,
    NSImageScaling, NSTrackingArea, NSTrackingAreaOptions, NSView,
};
use objc2_foundation::{MainThreadMarker, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString};
use std::cell::{Cell, RefCell};

#[derive(Default)]
struct HoverIvars {
    hovered: Cell<bool>,
    tracking: RefCell<Option<Retained<NSTrackingArea>>>,
    content: Cell<Option<(NSSize, NSRect)>>,
}

define_class!(
    // SAFETY: this main-thread button only adds hover tracking to standard NSButton input.
    #[unsafe(super = NSButton)]
    #[thread_kind = MainThreadOnly]
    #[ivars = HoverIvars]
    struct MarkLyraTitlebarHoverButton;
    unsafe impl NSObjectProtocol for MarkLyraTitlebarHoverButton {}
    impl MarkLyraTitlebarHoverButton {
        #[unsafe(method(mouseEntered:))]
        fn mouse_entered(&self, _event: &NSEvent) {
            self.ivars().hovered.set(true);
            NSView::setNeedsDisplay(self, true);
        }
        #[unsafe(method(mouseExited:))]
        fn mouse_exited(&self, _event: &NSEvent) {
            self.ivars().hovered.set(false);
            NSView::setNeedsDisplay(self, true);
        }
        #[unsafe(method(setHidden:))]
        fn set_hidden(&self, hidden: bool) {
            if hidden {
                self.ivars().hovered.set(false);
                NSView::setNeedsDisplay(self, true);
            }
            // SAFETY: forward NSView's documented visibility setter unchanged.
            unsafe { let _: () = msg_send![super(self), setHidden: hidden]; }
        }
        #[unsafe(method(updateTrackingAreas))]
        fn update_tracking_areas(&self) {
            // SAFETY: preserve AppKit's existing button tracking before updating our own area.
            unsafe { let _: () = msg_send![super(self), updateTrackingAreas]; }
            if let Some(previous) = self.ivars().tracking.borrow_mut().take() {
                self.removeTrackingArea(&previous);
            }
            // SAFETY: this button implements both callbacks and owns the area for its lifetime.
            let tracking = unsafe {
                NSTrackingArea::initWithRect_options_owner_userInfo(
                    NSTrackingArea::alloc(), self.bounds(),
                    NSTrackingAreaOptions::MouseEnteredAndExited | NSTrackingAreaOptions::ActiveAlways | NSTrackingAreaOptions::InVisibleRect,
                    Some(self), None,
                )
            };
            self.addTrackingArea(&tracking);
            *self.ivars().tracking.borrow_mut() = Some(tracking);
        }
    }
);

define_class!(
    // SAFETY: only cell drawing is replaced; AppKit still owns content layout and mouse actions.
    #[unsafe(super = NSButtonCell)]
    #[thread_kind = MainThreadOnly]
    struct MarkLyraTitlebarHoverCell;
    unsafe impl NSObjectProtocol for MarkLyraTitlebarHoverCell {}
    impl MarkLyraTitlebarHoverCell {
        #[unsafe(method(drawWithFrame:inView:))]
        fn draw(&self, frame: NSRect, view: &NSView) {
            let button = view.downcast_ref::<MarkLyraTitlebarHoverButton>();
            if button.is_some_and(|button| button.ivars().hovered.get()) {
                let bounds = view.bounds();
                let height = bounds.size.height.min(18.0);
                let background = NSRect::new(
                    NSPoint::new(bounds.origin.x, bounds.origin.y + (bounds.size.height - height) / 2.0),
                    NSSize::new(bounds.size.width, height),
                );
                NSColor::labelColor().colorWithAlphaComponent(if self.isHighlighted() { 0.12 } else { 0.08 }).setFill();
                NSBezierPath::bezierPathWithRoundedRect_xRadius_yRadius(background, 3.0, 3.0).fill();
            }
            // Fullscreen moves statistics into the content view with Auto Layout;
            // retain its normal native content layout outside the compact titlebar frame.
            let content = button.and_then(|button| button.ivars().content.get())
                .filter(|(size, _)| *size == view.bounds().size)
                .map_or(frame, |(_, content)| content);
            self.drawInteriorWithFrame_inView(content, view);
        }
    }
);

pub(super) fn set_frame(button: &NSButton, content: NSRect) {
    let view = button
        .downcast_ref::<MarkLyraTitlebarHoverButton>()
        .expect("owned titlebar hover button");
    let height = 14.0;
    let inset = (height - content.size.height) / 2.0;
    let frame = NSRect::new(
        NSPoint::new(content.origin.x, content.origin.y - inset),
        NSSize::new(content.size.width, height),
    );
    view.ivars().content.set(Some((
        frame.size,
        NSRect::new(NSPoint::new(0.0, inset), content.size),
    )));
    button.setFrame(frame);
}

pub(super) fn button(
    title: &NSString,
    target: &AnyObject,
    action: Sel,
    mtm: MainThreadMarker,
) -> Retained<NSButton> {
    let allocated = MarkLyraTitlebarHoverButton::alloc(mtm).set_ivars(HoverIvars::default());
    // SAFETY: these are the designated NSButton/NSButtonCell initializers, on the main thread.
    let button: Retained<MarkLyraTitlebarHoverButton> = unsafe {
        msg_send![super(allocated), initWithFrame: NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(0.0, 0.0))]
    };
    let cell: Retained<MarkLyraTitlebarHoverCell> =
        unsafe { msg_send![MarkLyraTitlebarHoverCell::alloc(mtm), initTextCell: title] };
    button.setCell(Some(&cell));
    button.setButtonType(NSButtonType::MomentaryPushIn);
    // SAFETY: the retained titlebar view owns this button and implements its action selector.
    unsafe {
        button.setTarget(Some(target));
        button.setAction(Some(action));
    }
    button.setBordered(true);
    button.setBezelStyle(NSBezelStyle::AccessoryBarAction);
    button.setShowsBorderOnlyWhileMouseInside(true);
    button.setImageScaling(NSImageScaling::ScaleNone);
    button.into_super()
}
