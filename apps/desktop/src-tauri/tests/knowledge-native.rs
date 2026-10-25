//! Isolated real WebView performance/authority fixture. No application profile or user notes.
#![allow(dead_code, unused_imports)]
include!("../src/lib.rs");
use std::{
    borrow::Cow,
    collections::BTreeMap,
    time::{Duration, Instant},
};

struct FixtureAssets(BTreeMap<String, Vec<u8>>);
impl<R: tauri::Runtime> tauri::Assets<R> for FixtureAssets {
    fn get(&self, key: &tauri::utils::assets::AssetKey) -> Option<Cow<'_, [u8]>> {
        self.0
            .get(key.as_ref())
            .map(|v| Cow::Borrowed(v.as_slice()))
    }
    fn iter(&self) -> Box<tauri::utils::assets::AssetsIter<'_>> {
        Box::new(
            self.0
                .iter()
                .map(|(key, value)| (Cow::Borrowed(key.as_str()), Cow::Borrowed(value.as_slice()))),
        )
    }
    fn csp_hashes(
        &self,
        _: &tauri::utils::assets::AssetKey,
    ) -> Box<dyn Iterator<Item = tauri::utils::assets::CspHash<'_>> + '_> {
        Box::new(std::iter::empty())
    }
}
fn assets(path: &std::path::Path) -> FixtureAssets {
    fn walk(root: &std::path::Path, path: &std::path::Path, files: &mut BTreeMap<String, Vec<u8>>) {
        for entry in std::fs::read_dir(path).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(root, &path, files);
            } else {
                files.insert(
                    format!(
                        "/{}",
                        path.strip_prefix(root)
                            .unwrap()
                            .to_string_lossy()
                            .replace('\\', "/")
                    ),
                    std::fs::read(path).unwrap(),
                );
            }
        }
    }
    let mut files = BTreeMap::new();
    walk(path, path, &mut files);
    FixtureAssets(files)
}
struct Fixture {
    notes: tempfile::TempDir,
    data: tempfile::TempDir,
    workspace: String,
    request: String,
    report: std::sync::Mutex<serde_json::Value>,
}
fn process_metrics(pid: u32) -> (u64, f64) {
    let output = std::process::Command::new("ps")
        .args(["-o", "rss=,time=", "-p", &pid.to_string()])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .unwrap_or_default();
    let mut fields = output.split_whitespace();
    let rss = fields.next().and_then(|v| v.parse().ok()).unwrap_or(0);
    let seconds = fields
        .next()
        .unwrap_or("0")
        .split(':')
        .fold(0.0, |total, part| {
            total * 60.0 + part.parse::<f64>().unwrap_or(0.0)
        });
    (rss, seconds * 1000.0)
}
#[tauri::command]
async fn fixture_memory(window: tauri::WebviewWindow) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let (tx, rx) = std::sync::mpsc::channel();
        window
            .with_webview(move |webview| {
                use objc2::{msg_send, runtime::AnyObject, sel};
                // Test-only process attribution of this fixture's own WKWebView.
                let pid = unsafe {
                    let view = webview.inner().cast::<AnyObject>();
                    let supported: bool =
                        msg_send![view,respondsToSelector:sel!(_webProcessIdentifier)];
                    if supported {
                        let pid: i32 = msg_send![view, _webProcessIdentifier];
                        pid.max(0) as u32
                    } else {
                        0
                    }
                };
                let _ = tx.send(pid);
            })
            .map_err(|e| e.to_string())?;
        let pid = rx
            .recv_timeout(Duration::from_secs(2))
            .map_err(|e| e.to_string())?;
        let (host_rss, host_cpu) = process_metrics(std::process::id());
        let (web_rss, web_cpu) = process_metrics(pid);
        Ok(
            serde_json::json!({"hostPid":std::process::id(),"hostRssKiB":host_rss,"hostCpuMs":host_cpu,"webPid":pid,"webRssKiB":web_rss,"webCpuMs":web_cpu}),
        )
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Ok(serde_json::json!({"hostPid":std::process::id()}))
    }
}
#[tauri::command]
fn fixture_index_status(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Option<knowledge_index::IndexStatus> {
    let fixture = app.state::<Fixture>();
    knowledge::knowledge_status(
        window,
        app.state(),
        fixture.workspace.clone(),
        fixture.request.clone(),
    )
    .ok()
}
#[tauri::command]
async fn fixture_prepare(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || prepare_fixture(&app, &window))
        .await
        .map_err(|error| error.to_string())?
}
fn prepare_fixture(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    verify_graph_control(window)?;
    let fixture = app.state::<Fixture>();
    let registry = app
        .state::<window_services::WindowServices>()
        .get_workspaces(window.label())?;
    let workspace = registry
        .lock()
        .unwrap()
        .get(&fixture.workspace)
        .map_err(|error| error.to_string())?;
    let started = Instant::now();
    let cpu_before = process_metrics(std::process::id()).1;
    let host = app.state::<knowledge::KnowledgeHost>();
    host.begin(window.label(), &fixture.workspace, &fixture.request)?;
    let opened = host.attach(knowledge::Attachment {
        label: window.label(),
        workspace_id: &fixture.workspace,
        request: &fixture.request,
        workspace,
        directory: fixture.data.path().into(),
        policy: "fixture".into(),
        document: std::sync::Arc::new(|name| name.ends_with(".md")),
    })?;
    let logged = std::cell::Cell::new(Instant::now());
    let wait = || -> Result<knowledge_index::IndexStatus, String> {
        loop {
            let status = knowledge::knowledge_status(
                window.clone(),
                app.state(),
                fixture.workspace.clone(),
                fixture.request.clone(),
            )?;
            if logged.get().elapsed() > Duration::from_secs(5) {
                eprintln!("index progress: {status:?}");
                logged.set(Instant::now());
            }
            if !status.working && status.complete {
                return Ok(status);
            }
            if let Some(error) = &status.error {
                return Err(error.clone());
            }
            if started.elapsed() > Duration::from_secs(180) {
                return Err(format!("Native index timeout: {status:?}"));
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    };
    let cold = wait()?;
    let cold_wall = started.elapsed().as_millis();
    let cpu_after = process_metrics(std::process::id()).1;
    eprintln!("initial index: {cold:?}");
    let query = |query| {
        tauri::async_runtime::block_on(knowledge::knowledge_snapshot(
            window.clone(),
            fixture.workspace.clone(),
            fixture.request.clone(),
            query,
        ))
    };
    let graph = query(knowledge_index::GraphQuery {
        limit: 500,
        ..Default::default()
    })?;
    assert_eq!(graph.total_notes, 10_000);
    assert_eq!(graph.total_edges, 50_000);
    let peer = app.get_webview_window("editor-peer").unwrap();
    assert!(
        knowledge::knowledge_status(
            peer,
            app.state(),
            fixture.workspace.clone(),
            fixture.request.clone()
        )
        .is_err(),
        "workspace must not cross windows"
    );
    let mut query_ms = Vec::new();
    for _ in 0..30 {
        let tick = Instant::now();
        query(knowledge_index::GraphQuery {
            focus: Some("note-00000.md".into()),
            depth: 2,
            ..Default::default()
        })?;
        query_ms.push(tick.elapsed().as_secs_f64() * 1000.0);
    }
    let mut ordered = query_ms.clone();
    ordered.sort_by(f64::total_cmp);
    assert!(
        ordered[28] <= 25.0,
        "native two-hop query P95 exceeds 25 ms: {}",
        ordered[28]
    );
    let before = cold.generation;
    std::fs::write(
        fixture.notes.path().join("note-00000.md"),
        "# changed\n\n[one](note-00001.md)\n",
    )
    .map_err(|error| error.to_string())?;
    let update_started = Instant::now();
    let incremental = loop {
        let status = wait()?;
        if status.generation > before {
            break status;
        }
        std::thread::sleep(Duration::from_millis(40));
    };
    assert_eq!(incremental.parsed, 1);
    assert!(
        incremental.resolved < 100,
        "single edit must not re-resolve the full graph"
    );
    assert!(
        incremental.elapsed_ms <= 100,
        "incremental work exceeds 100 ms budget"
    );
    let report = serde_json::json!({"cold":cold, "coldWallMs":cold_wall,
        "coldHostCpuPercent":(cpu_after-cpu_before)/(cold_wall.max(1) as f64)*100.0,
        "localQueryMs":query_ms, "incremental":incremental,
        "incrementalWallMs":update_started.elapsed().as_millis()});
    *fixture.report.lock().unwrap() = report;
    Ok(
        serde_json::json!({"workspaceId":fixture.workspace,"requestId":fixture.request,"opened":opened}),
    )
}

#[tauri::command]
fn fixture_result(app: tauri::AppHandle, result: serde_json::Value) {
    let fixture = app.state::<Fixture>();
    let passed = result["passed"] == true;
    let report = serde_json::json!({"backend":*fixture.report.lock().unwrap(),"renderer":result,"platform":std::env::consts::OS,"architecture":std::env::consts::ARCH});
    if let Some(path) = std::env::var_os("MARKLYRA_KNOWLEDGE_REPORT") {
        std::fs::write(path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    }
    println!("{}", serde_json::to_string(&report).unwrap());
    app.state::<knowledge::KnowledgeHost>().release("main");
    app.exit(if passed { 0 } else { 1 });
}
#[tauri::command]
fn fixture_log(message: String) {
    eprintln!("fixture: {message}");
}
fn main() {
    let directory =
        std::env::var_os("MARKLYRA_KNOWLEDGE_ASSETS").expect("Set isolated built fixture assets");
    let notes = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    let controls_only = std::env::var_os("MARKLYRA_KNOWLEDGE_CONTROLS_ONLY").is_some();
    for i in 0..if controls_only { 0 } else { 10_000 } {
        let mut text = format!("# 知识节点 {i}\n\n");
        for offset in [1, 3, 7, 17, 37] {
            text.push_str(&format!("[引用](note-{:05}.md)\n", (i + offset) % 10_000));
        }
        text.push_str(&"仅供性能夹具，不包含用户资料。".repeat(40));
        std::fs::write(notes.path().join(format!("note-{i:05}.md")), text).unwrap();
    }
    let services = window_services::WindowServices::default();
    services.register("main").unwrap();
    services.register("editor-peer").unwrap();
    let workspace = services
        .get_workspaces("main")
        .unwrap()
        .lock()
        .unwrap()
        .select_authorized(notes.path())
        .unwrap();
    let fixture = Fixture {
        notes,
        data,
        workspace: workspace.id,
        request: "native-fixture".into(),
        report: std::sync::Mutex::new(serde_json::Value::Null),
    };
    let mut context = tauri::test::mock_context(assets(std::path::Path::new(&directory)));
    context.config_mut().app.security.csp=Some(tauri::utils::config::Csp::Policy("default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; frame-src marklyra: http://marklyra.localhost; object-src 'none'".into()));
    tauri::Builder::default()
        .invoke_system(runtime_assets::ipc_initialization_script())
        .manage(services)
        .manage(runtime_assets::RuntimeAssets::fixture(&std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../packages/editor-runtime/dist/page")).expect("prepared runtime"))
        .manage(themes::ThemeHost::default())
        .register_uri_scheme_protocol("marklyra", |context,request|runtime_assets::handle(context.app_handle(),context.webview_label(),&request))
        .manage(knowledge::KnowledgeHost::default())
        .manage(fixture)
        .invoke_handler(tauri::generate_handler![
            fixture_prepare,
            fixture_index_status,
            fixture_log,
            fixture_memory,
            fixture_result,
            knowledge::knowledge_snapshot,
            knowledge::knowledge_status,
            knowledge::knowledge_active,
            knowledge::knowledge_references
        ])
        .setup(move |app| {
            tauri::WebviewWindowBuilder::new(
                app,
                "editor-peer",
                tauri::WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .visible(false)
            .incognito(true)
            .build()?;
            let owned=tauri::WebviewWindowBuilder::new(
                app,
                "main",
                if controls_only{tauri::WebviewUrl::External("about:blank".parse().unwrap())}else{tauri::WebviewUrl::App("src/features/knowledge-graph/test/native.html".into())},
            )
            .initialization_script("if(window===window.top&&location.protocol==='tauri:'){window.addEventListener('error',e=>window.__TAURI_INTERNALS__.invoke('fixture_log',{message:String(e.message)}));window.addEventListener('unhandledrejection',e=>window.__TAURI_INTERNALS__.invoke('fixture_log',{message:String(e.reason)}));}")
            .title("MarkLyra 图谱原生验证夹具")
            .inner_size(1440.0, 900.0)
            .incognito(true)
            .build()?;
            if controls_only {let handle=app.handle().clone();std::thread::spawn(move||{let result=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||verify_graph_control(&owned)));handle.exit(if matches!(result,Ok(Ok(()))){0}else{1});});return Ok(());}
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(240));
                eprintln!("Native fixture deadline exceeded");
                handle.exit(1);
            });
            Ok(())
        })

        .build(context)
        .expect("native knowledge fixture")
        .run(|_, _| {});
}

#[cfg(target_os = "macos")]
fn verify_graph_control(window: &tauri::WebviewWindow) -> Result<(), String> {
    use objc2::{rc::Retained, sel};
    use objc2_app_kit::{NSButton, NSWindow};
    use tauri::Listener;
    let capability = tauri::async_runtime::block_on(
        platform::ui_chrome::initialise_editor_chrome(window.clone()),
    )?;
    assert_eq!(serde_json::to_value(capability).unwrap()["native"], true);
    let payload:platform::ui_chrome::ChromeUpdate=serde_json::from_value(serde_json::json!({"documentId":null,"dirty":false,"statisticsLabel":"","statistics":{"words":0,"characters":0,"lines":0,"readingMinutes":0,"unit":"words"},"alwaysShowWordCount":false,"dark":false,"outlinePanelOpen":false,"aiPanelOpen":false,"graphOpen":false,"graphAvailable":true,"sourceMode":false,"canCloseDocument":false,"imagePreviewOpen":false})).map_err(|e|e.to_string())?;
    tauri::async_runtime::block_on(platform::ui_chrome::update_editor_chrome(
        window.clone(),
        payload,
    ))?;
    let (event_tx, event_rx) = std::sync::mpsc::channel();
    let listener = window.listen("menu-action", move |event| {
        let _ = event_tx.send(event.payload().to_owned());
    });
    let (tx, rx) = std::sync::mpsc::channel();
    let owned = window.clone();
    window
        .run_on_main_thread(move || {
            let result = (|| -> Result<(), String> {
                let pointer = owned.ns_window().map_err(|e| e.to_string())?;
                // SAFETY: this fixture owns and retains the native window on AppKit's main thread.
                let native = unsafe { Retained::retain(pointer.cast::<NSWindow>()) }
                    .ok_or("native window absent")?;
                let mut found = false;
                for controller in native.titlebarAccessoryViewControllers() {
                    let view = controller.view();
                    for child in view.subviews() {
                        if let Ok(button) = child.downcast::<NSButton>() {
                            if button.action() == Some(sel!(toggleGraph:)) {
                                assert!(button.isEnabled());
                                assert!(!button.isHidden());
                                assert!(button.image().is_some_and(|image| image.isTemplate()));
                                let frame = view.convertRect_toView(button.frame(), None);
                                let offset = native.frame().size.width
                                    - frame.origin.x
                                    - frame.size.width / 2.0;
                                assert!(
                                    (offset - 74.0).abs() <= 1.0,
                                    "graph occupies the column next to AI"
                                );
                                // SAFETY: only the fixture's own production toolbar target receives this action.
                                unsafe {
                                    button.performClick(None);
                                }
                                found = true;
                            }
                        }
                    }
                }
                assert!(found, "native SVG graph control must exist");
                Ok(())
            })();
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())??;
    assert_eq!(
        event_rx
            .recv_timeout(Duration::from_secs(5))
            .map_err(|e| e.to_string())?,
        "\"view:graph\""
    );
    window.unlisten(listener);
    println!("Native graph SVG, enabled state, toolbar geometry and action route passed");
    Ok(())
}
#[cfg(not(target_os = "macos"))]
fn verify_graph_control(_: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}
