// Embedded unit-test helpers are not run by this main-thread harness.
#![allow(dead_code, unused_imports)]
// Compile the production host in this harness, with cfg(test) fixture entry points.
include!("../src/lib.rs");

fn main() {
    if std::env::args().nth(1).as_deref() == Some("--agent-mcp-stdio") {
        if agents::proxy_main().is_err() {
            std::process::exit(1);
        }
        return;
    }
    tauri::Builder::default()
        .manage(window_services::WindowServices::default())
        .manage(agents::AgentHostState::default())
        .setup(|app| {
            let services = app.state::<window_services::WindowServices>();
            services.register("main")?;
            services.register("editor-peer")?;
            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .incognito(true)
            .visible(false)
            .build()?;
            let peer = tauri::WebviewWindowBuilder::new(
                app,
                "editor-peer",
                tauri::WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .incognito(true)
            .visible(false)
            .build()?;
            let app = app.handle().clone();
            std::thread::spawn(move || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    agents::native_fixture::verify(&app, &window, &peer)
                }));
                match result {
                    Ok(Ok(())) => app.exit(0),
                    Ok(Err(error)) => {
                        eprintln!("Native ACP fixture failed: {error}");
                        app.exit(1);
                    }
                    Err(_) => app.exit(1),
                }
            });
            Ok(())
        })
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("native ACP fixture build failed")
        .run(|_, _| {});
}
