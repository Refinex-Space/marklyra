//! Exercise the real AppKit cell on the OS main thread, without opening a user window.
#[cfg(target_os = "macos")]
#[path = "../src/platform/ui_chrome/native_hover.rs"]
mod native_hover;

#[cfg(target_os = "macos")]
fn main() {
    use objc2::{
        rc::{autoreleasepool, Retained},
        sel, AnyThread, MainThreadMarker,
    };
    use objc2_app_kit::{
        NSBitmapImageRep, NSButton, NSButtonCell, NSColor, NSCompositingOperation,
        NSDeviceRGBColorSpace, NSEvent, NSEventModifierFlags, NSEventType, NSFont,
        NSGraphicsContext, NSImage, NSImageScaling, NSRectFillUsingOperation,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};

    let mtm = MainThreadMarker::new().expect("native hover test runs on main thread");
    autoreleasepool(|_| {
        let target = unsafe {
            NSButton::buttonWithTitle_target_action(
                &NSString::from_str("944 词"),
                None,
                Some(sel!(performClick:)),
                mtm,
            )
        };
        let button = native_hover::button(
            &NSString::from_str("944 词"),
            &target,
            sel!(performClick:),
            mtm,
        );
        let frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(32.0, 22.0));
        button.setFrame(frame);
        button.setFont(Some(&NSFont::systemFontOfSize(12.0)));
        let image = NSImage::initWithSize(NSImage::alloc(), NSSize::new(13.0, 10.0));
        button.setImage(Some(&image));
        let title = button.title();
        let position = button.imagePosition();
        assert_eq!(button.title(), title);
        assert_eq!(button.frame(), frame);
        assert_eq!(button.font().unwrap().pointSize(), 12.0);
        assert_eq!(button.image().unwrap(), image);
        assert_eq!(button.imagePosition(), position);
        assert_eq!(button.action(), Some(sel!(performClick:)));
        assert_eq!(button.imageScaling(), NSImageScaling::ScaleNone);
        assert_eq!(
            Retained::as_ptr(&button.target().unwrap()).cast::<()>(),
            Retained::as_ptr(&target).cast::<()>()
        );

        let cell = button.cell().unwrap().downcast::<NSButtonCell>().unwrap();
        button.setTitle(&NSString::from_str(""));
        button.setImage(None);
        // SAFETY: synthetic enter/exit events have no user-data pointer or external context.
        let event = unsafe {
            NSEvent::enterExitEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_trackingNumber_userData(
                NSEventType::MouseEntered, NSPoint::new(1.0, 1.0), NSEventModifierFlags::empty(),
                0.0, 0, None, 0, 0, std::ptr::null_mut(),
            )
        }.unwrap();
        button.updateTrackingAreas();
        let count = button.trackingAreas().len();
        button.updateTrackingAreas();
        assert_eq!(
            button.trackingAreas().len(),
            count,
            "tracking areas must not accumulate"
        );
        for (hovered, highlighted, expected_alpha) in [
            (false, false, 0.0),
            (true, false, 0.08),
            (true, true, 0.12),
            (false, false, 0.0),
            (true, false, 0.0),
        ] {
            if hovered {
                button.mouseEntered(&event);
            } else {
                button.mouseExited(&event);
            }
            if hovered && expected_alpha == 0.0 {
                button.setHidden(true);
                button.setHidden(false);
            }
            cell.setHighlighted(highlighted);
            // SAFETY: null planes asks AppKit to own the new RGBA bitmap storage.
            let bitmap = unsafe {
                NSBitmapImageRep::initWithBitmapDataPlanes_pixelsWide_pixelsHigh_bitsPerSample_samplesPerPixel_hasAlpha_isPlanar_colorSpaceName_bytesPerRow_bitsPerPixel(
                    NSBitmapImageRep::alloc(),
                    std::ptr::null_mut(), 32, 22, 8, 4, true, false,
                    NSDeviceRGBColorSpace, 0, 0,
                )
            }.unwrap();
            let context = NSGraphicsContext::graphicsContextWithBitmapImageRep(&bitmap).unwrap();
            NSGraphicsContext::saveGraphicsState_class();
            NSGraphicsContext::setCurrentContext(Some(&context));
            // Dispatch the full production drawing path, including its hover state.
            NSColor::clearColor().setFill();
            NSRectFillUsingOperation(frame, NSCompositingOperation::Copy);
            cell.drawWithFrame_inView(frame, &button);
            NSGraphicsContext::restoreGraphicsState_class();

            let alpha = |x, y| bitmap.colorAtX_y(x, y).unwrap().alphaComponent();
            let middle = alpha(16, 11);
            assert!(
                (middle - expected_alpha).abs() < 0.01,
                "the interior must be filled"
            );
            assert!(
                alpha(16, 0) < 0.01,
                "leave space around the rounded background"
            );
            if expected_alpha > 0.0 {
                assert!(alpha(0, 2) < middle, "the corner must be rounded");
            }
            assert!(
                (alpha(16, 3) - middle).abs() < 0.01,
                "no darker outline along the edge"
            );
        }
        for height in [10.0, 13.0] {
            native_hover::set_frame(
                &button,
                NSRect::new(
                    NSPoint::new(4.0, 15.0 - height / 2.0),
                    NSSize::new(16.0, height),
                ),
            );
            let frame = button.frame();
            assert_eq!(frame.origin.x, 4.0);
            assert_eq!(frame.size, NSSize::new(16.0, 14.0));
            assert_eq!(frame.origin.y + frame.size.height / 2.0, 15.0);
            assert!(frame.origin.y + frame.size.height <= 22.0);
        }
    });
    println!(
        "Native titlebar hover: filled corners/edges, press feedback and control properties passed"
    );
}

#[cfg(not(target_os = "macos"))]
fn main() {
    println!("Native titlebar hover tests require macOS");
}
