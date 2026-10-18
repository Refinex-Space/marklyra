//! Reposition the existing AppKit controls without replacing the native file
//! proxy, title cell, context menu, accessibility or document-edited state.
use super::title_layout::TitlebarLayout;
use objc2::rc::Retained;
use objc2_app_kit::{NSTextField, NSView, NSWindow, NSWindowButton};
use objc2_foundation::NSPoint;

const MAX_TITLE_WIDTH: f64 = 600.0;

fn parent(view: &NSView) -> Option<Retained<NSView>> {
    // SAFETY: callers retain the owning NSWindow and run on AppKit's main
    // thread, so none of its view ancestors can be destroyed during this read.
    unsafe { view.superview() }
}

pub(super) fn title_field(window: &NSWindow) -> Option<Retained<NSTextField>> {
    let close = window.standardWindowButton(NSWindowButton::CloseButton)?;
    let bar = parent(&close)?;
    bar.subviews().iter().find_map(|view| {
        view.downcast::<NSTextField>()
            .ok()
            .filter(|field| field.stringValue() == window.title())
    })
}

pub(super) fn position(window: &NSWindow, layout: TitlebarLayout, accessory_left: f64) {
    let Some(field) = title_field(window) else {
        return;
    };
    let Some(container) = parent(&field) else {
        return;
    };
    let Some(content) = window.contentView() else {
        return;
    };
    let (left, right) = layout.bounds(content.bounds().size.width);
    let center = (left + right) / 2.0;
    let controls_right = window
        .standardWindowButton(NSWindowButton::ZoomButton)
        .and_then(|button| {
            parent(&button).map(|view| view.convertRect_toView(button.frame(), None))
        })
        .map_or(0.0, |frame| frame.origin.x + frame.size.width + 12.0);
    let safe_left = (left + 8.0).max(controls_right);
    let safe_right = (right - 8.0).min(accessory_left - 8.0);
    let available = (2.0 * (center - safe_left).min(safe_right - center)).max(0.0);
    let proxy = window.standardWindowButton(NSWindowButton::DocumentIconButton);
    let has_icon = window.representedURL().is_some() && proxy.is_some();
    let icon_width = proxy
        .as_ref()
        .filter(|_| has_icon)
        .map_or(0.0, |icon| icon.frame().size.width);
    let prefix = if has_icon { icon_width + 4.0 } else { 0.0 };
    let visible = available >= prefix + 12.0;
    field.setHidden(!visible);
    if let Some(proxy) = &proxy {
        proxy.setHidden(!visible || !has_icon);
    }
    if !visible {
        return;
    }
    // AppKit's title field intrinsic width omits part of its cell padding:
    // even README.md needs 85pt where intrinsicContentSize reports only 81pt.
    // Measure the original native cell and round up to avoid truncating glyphs.
    let natural_width = field
        .cell()
        .map_or_else(
            || field.intrinsicContentSize().width + 4.0,
            |cell| cell.cellSize().width,
        )
        .ceil()
        .max(0.0);
    let width = natural_width.min(MAX_TITLE_WIDTH).min(available - prefix);
    let group_left = center - (prefix + width) / 2.0;
    let mut frame = field.frame();
    frame.origin.x = container
        .convertPoint_fromView(NSPoint::new(group_left + prefix, 0.0), None)
        .x;
    frame.size.width = width;
    if field.frame() != frame {
        field.setFrame(frame);
    }
    if let Some(proxy) = proxy.filter(|_| has_icon) {
        if let Some(parent) = parent(&proxy) {
            let mut frame = proxy.frame();
            frame.origin.x = parent
                .convertPoint_fromView(NSPoint::new(group_left, 0.0), None)
                .x;
            if proxy.frame() != frame {
                proxy.setFrame(frame);
            }
        }
    }
}
