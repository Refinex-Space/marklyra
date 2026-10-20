//! Isolated native About fixture; does not initialize the application profile or editor.
#[cfg(target_os = "macos")]
#[allow(dead_code, unused_imports)]
#[path = "../src/menu/about.rs"]
mod about;

#[cfg(target_os = "macos")]
fn main() {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{
        NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua,
        NSApplication, NSBezierPath, NSBitmapImageFileType, NSColor, NSGraphicsContext,
        NSWindowStyleMask,
    };
    use objc2_foundation::NSDictionary;
    use std::{thread, time::Duration};

    let directory = std::env::var_os("MARKLYRA_ABOUT_SNAPSHOTS").map(std::path::PathBuf::from);
    tauri::Builder::default()
        .setup(move |app| {
            about::show(app.handle());
            about::show(app.handle());
            let app = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(500));
                let dispatcher = app.clone();
                dispatcher.run_on_main_thread(move || {
                    let mtm = MainThreadMarker::new().unwrap();
                    let native = NSApplication::sharedApplication(mtm);
                    let visible = native.windows().iter().filter(|w| w.isVisible()).collect::<Vec<_>>();
                    assert_eq!(visible.len(), 1, "one native About window");
                    let window = &visible[0];
                    assert!(!window.styleMask().contains(NSWindowStyleMask::Resizable), "About should be a compact fixed-size window");
                    let view = window.contentView().unwrap();
                    assert!(view.bounds().size.width >= 250.0);
                    if let Some(directory) = directory {
                        std::fs::create_dir_all(&directory).unwrap();
                        for (name, appearance) in [
                            ("light", unsafe { NSAppearanceNameAqua }),
                            ("dark", unsafe { NSAppearanceNameDarkAqua }),
                        ] {
                            window.setAppearance(NSAppearance::appearanceNamed(appearance).as_deref());
                            let bitmap = view.bitmapImageRepForCachingDisplayInRect(view.bounds()).unwrap();
                            let context = NSGraphicsContext::graphicsContextWithBitmapImageRep(&bitmap).unwrap();
                            // Render all subviews, including unchanged images. The window's
                            // material is outside contentView, so use its system backdrop.
                            window.effectiveAppearance().performAsCurrentDrawingAppearance(&block2::RcBlock::new(|| {
                                NSGraphicsContext::saveGraphicsState_class();
                                NSGraphicsContext::setCurrentContext(Some(&context));
                                NSColor::windowBackgroundColor().setFill();
                                NSBezierPath::fillRect(view.bounds());
                                view.displayRectIgnoringOpacity_inContext(view.bounds(), &context);
                                NSGraphicsContext::restoreGraphicsState_class();
                            }));
                            let png = unsafe {
                                bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
                            }.unwrap();
                            std::fs::write(directory.join(format!("about-{name}.png")), png.to_vec()).unwrap();
                        }
                    }
                    window.orderOut(None);
                    println!("Native About window: visibility, fixed size and repeated-open reuse passed");
                    app.exit(0);
                }).unwrap();
            });
            Ok(())
        })
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("About fixture build failed")
        .run(|_, _| {});
}

#[cfg(not(target_os = "macos"))]
fn main() {
    println!("Native About fixture currently runs on macOS only");
}
