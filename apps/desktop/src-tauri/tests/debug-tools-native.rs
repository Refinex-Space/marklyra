//! Real Inspector test in an incognito fixture; never reads the user's app profile.
#[cfg(target_os = "macos")]
#[path = "../src/debug_tools/native.rs"]
mod native;

#[cfg(target_os = "macos")]
fn main() {
    use std::{
        thread,
        time::{Duration, Instant},
    };
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    tauri::Builder::default()
        .setup(|app| {
            let window = WebviewWindowBuilder::new(
                app,
                "debug-fixture",
                WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .title("MarkLyra DevTools Fixture")
            .incognito(true)
            .devtools(false)
            .inner_size(640.0, 480.0)
            .build()?;
            let app = app.handle().clone();
            thread::spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    let configure = |enabled, open| {
                        let (sender, receiver) = std::sync::mpsc::channel();
                        window
                            .with_webview(move |webview| {
                                sender
                                    .send(native::configure(&webview, enabled, open))
                                    .unwrap();
                            })
                            .unwrap();
                        receiver
                            .recv_timeout(Duration::from_secs(10))
                            .unwrap()
                            .unwrap();
                    };
                    thread::sleep(Duration::from_millis(700));
                    configure(false, true);
                    assert!(
                        !window.is_devtools_open(),
                        "disabled mode must not open Inspector"
                    );
                    configure(true, true);
                    let started = Instant::now();
                    while !window.is_devtools_open() && started.elapsed() < Duration::from_secs(15)
                    {
                        thread::sleep(Duration::from_millis(100));
                    }
                    assert!(
                        window.is_devtools_open(),
                        "enabled Inspector must actually open"
                    );
                    configure(false, false);
                    let started = Instant::now();
                    while window.is_devtools_open() && started.elapsed() < Duration::from_secs(5) {
                        thread::sleep(Duration::from_millis(100));
                    }
                    assert!(!window.is_devtools_open(), "disabling must close Inspector");
                }));
                match result {
                    Ok(()) => {
                        println!("Native Inspector: disabled/open/close passed");
                        app.exit(0);
                    }
                    Err(_) => app.exit(1),
                }
            });
            Ok(())
        })
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("debug fixture build failed")
        .run(|_, _| {});
}

#[cfg(not(target_os = "macos"))]
fn main() {
    println!("Native Inspector fixture currently runs on macOS only");
}
