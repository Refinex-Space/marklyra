use super::*;
use std::sync::{mpsc, Arc, Mutex};
use tauri::{test::MockRuntime, Listener, WebviewWindowBuilder};

const CONTEXT: &str = "d213ee68-3f40-49ea-ae19-c6c7abf67536";
const NEXT: &str = "c7b017b7-77f0-43b7-ace1-945b599766dc";

fn app() -> tauri::App<MockRuntime> {
    tauri::test::mock_builder()
        .manage(WindowServices::default())
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .unwrap()
}

fn snapshot(services: &WindowServices, label: &str) -> EditorCommandSnapshot {
    services
        .with_editor_commands(label, |state| state.snapshot(CONTEXT))
        .unwrap()
}

#[test]
fn only_registered_editor_slots_can_register_or_read_their_own_context() {
    let app = app();
    let services = app.state::<WindowServices>();
    let main = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let prefs = WebviewWindowBuilder::new(&app, "preferences", Default::default())
        .build()
        .unwrap();
    let second = WebviewWindowBuilder::new(&app, "editor-second", Default::default())
        .build()
        .unwrap();
    assert!(register(&main, CONTEXT).is_err());
    assert!(register(&prefs, CONTEXT).is_err());
    services.register("main").unwrap();
    services.register("editor-second").unwrap();
    assert_eq!(register(&main, CONTEXT).unwrap().issued, 0);
    assert_eq!(register(&second, NEXT).unwrap().issued, 0);
    emit_menu_action(app.handle(), "main", "undo").unwrap();
    assert_eq!(register(&main, CONTEXT).unwrap().issued, 1);
    assert!(tauri::async_runtime::block_on(fence(second, CONTEXT.into())).is_err());
    assert!(register(&prefs, CONTEXT).is_err());
    assert!(emit_menu_action(app.handle(), "unknown", "save").is_err());
}

#[test]
fn same_context_is_idempotent_new_context_resets_and_old_owner_cannot_fence() {
    let mut state = EditorCommandState::default();
    assert_eq!(state.register(CONTEXT).unwrap().issued, 0);
    let old = state.owner(CONTEXT).unwrap();
    assert_eq!(state.issue("undo").unwrap().unwrap().1.sequence, 1);
    assert_eq!(state.register(CONTEXT).unwrap().issued, 1);
    assert_eq!(state.owner(CONTEXT).unwrap(), old);
    assert!(state.snapshot(NEXT).is_err());
    assert_eq!(state.register(NEXT).unwrap().issued, 0);
    assert!(state.fence(&old).is_err());
    // Even an accidentally reused A context does not revive A's in-flight ticket.
    state.register(CONTEXT).unwrap();
    assert_ne!(state.owner(CONTEXT).unwrap(), old);
    assert!(state.fence(&old).is_err());
}

#[test]
fn invalid_context_never_replaces_the_valid_owner_or_issued_count() {
    let mut state = EditorCommandState::default();
    state.register(CONTEXT).unwrap();
    state.issue("undo").unwrap();
    let owner = state.owner(CONTEXT).unwrap();
    for invalid in [
        "",
        "main",
        "../main",
        "d213ee683f4049eaae19c6c7abf67536",
        "D213EE68-3F40-49EA-AE19-C6C7ABF67536",
        "{d213ee68-3f40-49ea-ae19-c6c7abf67536}",
    ] {
        assert!(state.register(invalid).is_err(), "{invalid}");
        assert!(state.snapshot(invalid).is_err(), "{invalid}");
        assert_eq!(state.fence(&owner).unwrap().issued, 1);
    }
}

#[test]
fn editor_payloads_are_targeted_and_legacy_file_actions_do_not_issue_sequences() {
    let app = app();
    let services = app.state::<WindowServices>();
    services.register("main").unwrap();
    services.register("editor-second").unwrap();
    let main = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    let second = WebviewWindowBuilder::new(&app, "editor-second", Default::default())
        .build()
        .unwrap();
    let first_events = Arc::new(Mutex::new(Vec::new()));
    let other_events = Arc::new(Mutex::new(Vec::new()));
    let events = first_events.clone();
    main.listen("menu-action", move |event| {
        events
            .lock()
            .unwrap()
            .push(serde_json::from_str::<serde_json::Value>(event.payload()).unwrap());
    });
    let events = other_events.clone();
    second.listen("menu-action", move |event| {
        events.lock().unwrap().push(event.payload().to_owned());
    });
    emit_menu_action(app.handle(), "main", "undo").unwrap();
    register(&main, CONTEXT).unwrap();
    emit_menu_action(app.handle(), "main", "redo").unwrap();
    for action in [
        "save",
        "save-as",
        "open",
        "new",
        "new-window",
        "close",
        "quit",
        "view:files",
    ] {
        emit_menu_action(app.handle(), "main", action).unwrap();
    }
    assert_eq!(snapshot(&services, "main").issued, 1);
    let events = first_events.lock().unwrap();
    assert_eq!(events[0], "undo");
    assert_eq!(
        events[1],
        serde_json::json!({"context":CONTEXT,"sequence":1,"action":"redo"})
    );
    assert_eq!(events[2], "save");
    assert_eq!(events[6], "new-window");
    assert!(other_events.lock().unwrap().is_empty());
}

#[test]
fn failed_issued_delivery_faults_fences_and_same_context_retry_cannot_clear_it() {
    let services = WindowServices::default();
    services.register("main").unwrap();
    services
        .with_editor_commands("main", |state| state.register(CONTEXT))
        .unwrap();
    let failure = emit_with(&services, "main", "undo", |payload| {
        assert_eq!(
            serde_json::to_value(payload).unwrap(),
            serde_json::json!({
                "context":CONTEXT,"sequence":1,"action":"undo"
            })
        );
        Err("controlled emit failure".into())
    })
    .unwrap_err();
    assert_eq!(failure, "controlled emit failure");
    assert!(services
        .with_editor_commands("main", |state| state.snapshot(CONTEXT))
        .is_err());
    assert!(services
        .with_editor_commands("main", |state| state.register(CONTEXT))
        .is_err());
    assert!(emit_with(&services, "main", "redo", |_| panic!(
        "faulted editing must not emit"
    ))
    .is_err());
    // Save must reach the parent so its fence error can be shown; it is not its own prerequisite.
    emit_with(&services, "main", "save", |payload| {
        assert_eq!(payload, MenuPayload::Legacy("save".into()));
        Ok(())
    })
    .unwrap();
    assert_eq!(
        services
            .with_editor_commands("main", |state| state.register(NEXT))
            .unwrap()
            .issued,
        0
    );
}

#[test]
fn failure_from_an_old_owner_does_not_fault_a_replaced_context_or_window() {
    let services = WindowServices::default();
    services.register("main").unwrap();
    services
        .with_editor_commands("main", |state| state.register(CONTEXT))
        .unwrap();
    emit_with(&services, "main", "undo", |_| {
        services
            .with_editor_commands("main", |state| state.register(NEXT))
            .unwrap();
        services
            .with_editor_commands("main", |state| state.register(CONTEXT))
            .unwrap();
        Err("old delivery failure".into())
    })
    .unwrap_err();
    assert_eq!(snapshot(&services, "main").issued, 0);
    let old = services
        .with_editor_commands("main", |state| state.owner(CONTEXT))
        .unwrap();
    services.remove("main").unwrap();
    assert!(services
        .with_editor_commands("main", |state| state.fence(&old))
        .is_err());
    services.register("main").unwrap();
    services
        .with_editor_commands("main", |state| state.register(CONTEXT))
        .unwrap();
    assert!(services
        .with_editor_commands("main", |state| state.fence(&old))
        .is_err());
    assert_eq!(snapshot(&services, "main").issued, 0);
}

#[test]
fn javascript_safe_sequence_limit_is_exact_and_overflow_is_fail_closed() {
    let mut state = EditorCommandState::default();
    state.register(CONTEXT).unwrap();
    state.issued = MAX_SAFE_SEQUENCE - 1;
    let (_, command) = state.issue("undo").unwrap().unwrap();
    assert_eq!(command.sequence, MAX_SAFE_SEQUENCE);
    assert_eq!(state.snapshot(CONTEXT).unwrap().issued, MAX_SAFE_SEQUENCE);
    assert!(state.issue("redo").is_err());
    assert_eq!(state.issued, MAX_SAFE_SEQUENCE);
    assert!(state.snapshot(CONTEXT).is_err());
    assert!(state.register(CONTEXT).is_err());
    assert_eq!(state.register(NEXT).unwrap().issued, 0);
}

#[test]
fn only_exact_supported_editor_actions_are_sequenced() {
    for action in [
        "undo",
        "redo",
        "heading:0",
        "heading:1",
        "heading:2",
        "heading:3",
        "heading:4",
        "heading:5",
        "heading:6",
        "format:strong",
        "format:em",
        "format:del",
        "format:code",
        "format:underline",
        "format:highlight",
        "format:subscript",
        "format:superscript",
        "format:inline_math",
        "format:link",
        "format:image",
        "list:ul",
        "list:ol",
        "list:tasklist",
        "list:blockquote",
        "code-block",
        "math-block",
        "insert-table",
        "hr",
        "indent",
        "outdent",
        "find",
        "replace",
        "view:source",
        "view:focus",
        "view:typewriter",
    ] {
        assert!(is_editor_action(action), "{action}");
    }
    for action in [
        "",
        "save",
        "save-as",
        "open",
        "open-folder",
        "new",
        "new-window",
        "preferences",
        "copy",
        "paste",
        "view:sidebar",
        "view:files",
        "view:articles",
        "view:outline",
        "heading:01",
        "heading:7",
        "format:anything",
        "list:unknown",
        "theme:marklyra-dark",
    ] {
        assert!(!is_editor_action(action), "{action}");
    }
}

#[test]
fn running_mock_proxy_fence_waits_for_queued_actions_and_rejects_closed_lifetime() {
    // run_iteration is a no-op in the pinned MockRuntime. Use its actual running
    // event loop; before Ready its dispatcher also runs tasks inline.
    let app = app();
    let main = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .unwrap();
    app.state::<WindowServices>().register("main").unwrap();
    register(&main, CONTEXT).unwrap();
    let owner = app
        .state::<WindowServices>()
        .with_editor_commands("main", |state| state.owner(CONTEXT))
        .unwrap();
    let event_thread = std::thread::current().id();
    let (result_tx, result_rx) = mpsc::channel();
    let worker = Arc::new(Mutex::new(None));
    let worker_out = worker.clone();
    app.run(move |app, event| {
        if !matches!(event, tauri::RunEvent::Ready) {
            return;
        }
        let dispatcher = app.clone();
        tauri::async_runtime::block_on(tauri::async_runtime::spawn_blocking(move || {
            let current = dispatcher.clone();
            dispatcher
                .run_on_main_thread(move || {
                    assert_eq!(std::thread::current().id(), event_thread);
                    emit_menu_action(&current, "main", "undo").unwrap();
                })
                .unwrap();
        }))
        .unwrap();
        // Explicit negative control: the naïve main-thread dispatcher is
        // synchronous and misses the Undo already waiting in the proxy queue.
        let inline_result = Arc::new(Mutex::new(None));
        let output = inline_result.clone();
        let current = app.clone();
        let inline_owner = owner.clone();
        app.run_on_main_thread(move || {
            *output.lock().unwrap() = Some(
                current
                    .state::<WindowServices>()
                    .with_editor_commands("main", |state| state.fence(&inline_owner))
                    .unwrap(),
            );
        })
        .unwrap();
        assert_eq!(inline_result.lock().unwrap().as_ref().unwrap().issued, 0);
        // Invoked on the event-loop thread: without the production worker hop,
        // this would run inline before the already queued Undo and return 0.
        let mut first = tauri::async_runtime::block_on(enqueue_fence(
            app.clone(),
            "main".into(),
            owner.clone(),
        ))
        .unwrap();
        assert!(first.try_recv().is_err());
        let dispatcher = app.clone();
        tauri::async_runtime::block_on(tauri::async_runtime::spawn_blocking(move || {
            let current = dispatcher.clone();
            dispatcher
                .run_on_main_thread(move || {
                    emit_menu_action(&current, "main", "redo").unwrap();
                    let services = current.state::<WindowServices>();
                    assert_eq!(snapshot(&services, "main").issued, 2);
                    services.remove("main").unwrap();
                    services.register("main").unwrap();
                    services
                        .with_editor_commands("main", |state| state.register(CONTEXT))
                        .unwrap();
                })
                .unwrap();
        }))
        .unwrap();
        let mut stale = tauri::async_runtime::block_on(enqueue_fence(
            app.clone(),
            "main".into(),
            owner.clone(),
        ))
        .unwrap();
        assert_eq!(snapshot(&app.state::<WindowServices>(), "main").issued, 0);
        let main = main.clone();
        let result_tx = result_tx.clone();
        *worker_out.lock().unwrap() = Some(std::thread::spawn(move || {
            let first = tauri::async_runtime::block_on(first.recv()).unwrap();
            let stale = tauri::async_runtime::block_on(stale.recv()).unwrap();
            result_tx.send((first, stale)).unwrap();
            main.close().unwrap();
        }));
    });
    worker.lock().unwrap().take().unwrap().join().unwrap();
    let (first, stale) = result_rx.recv().unwrap();
    assert_eq!(first.unwrap().issued, 1);
    assert!(stale.unwrap_err().contains("窗口已更换"));
}
