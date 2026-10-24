//! Native-only acceptance harness. All documents and executable settings are temporary.
use super::*;
use std::time::Duration;
use tauri::Listener;

pub fn verify(
    app: &AppHandle,
    window: &WebviewWindow,
    other: &WebviewWindow,
) -> Result<(), String> {
    attention::verify_native(app, window, other)?;
    #[cfg(target_os = "macos")]
    verify_titlebar(window)?;
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let data = tempfile::tempdir().map_err(|e| e.to_string())?;
    let fixture = tempfile::tempdir().map_err(|e| e.to_string())?;
    let root_path = root.path().canonicalize().map_err(|e| e.to_string())?;
    fs::write(
        root_path.join("note.md"),
        b"\xef\xbb\xbf# Native\r\n\r\nOriginal  \r\n",
    )
    .map_err(|e| e.to_string())?;
    let script = fixture.path().join("agent.cjs");
    fs::write(&script,r#"
const readline=require('node:readline');
const path=require('node:path');
if(process.argv.includes('--fixture-login')){process.stdout.write('登录终端准备就绪\r\n');readline.createInterface({input:process.stdin}).once('line',()=>{process.stdout.write('PTY_OK ✓\r\n');process.exit(0);});return;}
let cwd='',prompt=0;
const send=m=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...m})+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')send({id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true},authMethods:[{id:"fixture-login",name:"Fixture login",type:"terminal",args:["--fixture-login"]}]}});
 else if(m.method==='session/new'){cwd=m.params.cwd;send({id:m.id,result:{sessionId:'native-session'}});}
 else if(m.method==='session/prompt'){prompt=m.id;send({id:'read',method:'fs/read_text_file',params:{sessionId:'native-session',path:path.join(cwd,'note.md')}});}
 else if(m.id==='read'){
  if(m.error)throw Error(m.error.message);
  send({id:'write',method:'fs/write_text_file',params:{sessionId:'native-session',path:path.join(cwd,'note.md'),content:m.result.content.replace('Original','Edited')}});
 } else if(m.id==='write'){
  if(m.error)throw Error(m.error.message);
  send({method:'session/update',params:{sessionId:'native-session',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'[note.md](note.md) updated'}}}});
  send({id:prompt,result:{stopReason:'end_turn'}});
 }
});
"#).map_err(|e|e.to_string())?;
    let node = std::env::var_os("PATH")
        .and_then(|p| {
            std::env::split_paths(&p)
                .map(|dir| dir.join(if cfg!(windows) { "node.exe" } else { "node" }))
                .find(|p| p.is_file())
        })
        .ok_or("Node.js is required for the native protocol fixture")?;
    let services = app.state::<crate::window_services::WindowServices>();
    let registry = services.get_workspaces(window.label())?;
    let workspace = registry
        .lock()
        .map_err(|_| "registry lock")?
        .select_authorized(&root_path)
        .map_err(|e| e.to_string())?;
    let docs = services.get_documents(window.label())?;
    let loaded = docs
        .lock()
        .map_err(|_| "documents lock")?
        .open_authorized(&root_path.join("note.md"))
        .map_err(|e| e.to_string())?;
    let (changed_tx, changed_rx) = std::sync::mpsc::channel();
    docs.lock()
        .map_err(|_| "documents lock")?
        .start_document_watch(
            &loaded.id,
            Arc::new(move |event| {
                let _ = changed_tx.send(event);
            }),
        )
        .map_err(|e| e.to_string())?;
    let profile = AgentProfile {
        id: "native-fixture".into(),
        agent_id: "fixture".into(),
        name: "Fixture".into(),
        executable: node.to_string_lossy().into(),
        args: vec![script.to_string_lossy().into()],
        env: Default::default(),
        secret_keys: vec![],
        version: None,
        managed_path: None,
        mcp_enabled: true,
        enabled: true,
    };
    let (tx, rx) = std::sync::mpsc::channel();
    let listener = window.listen("marklyra:agent-event", move |event| {
        let _ = tx.send(event.payload().to_owned());
    });
    let connected =
        process::connect_profile(app, window, profile, data.path().to_owned(), &workspace.id)?;
    let id = connected["connectionId"]
        .as_str()
        .ok_or("connection missing")?
        .to_string();
    let state = app.state::<AgentHostState>();
    let send = |message| {
        agent_send(
            app.state::<AgentHostState>(),
            window.clone(),
            id.clone(),
            message,
        )
    };
    let receive = || -> Result<Value, String> {
        loop {
            let raw = rx
                .recv_timeout(Duration::from_secs(15))
                .map_err(|_| "native ACP event timeout")?;
            let value: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
            if value["kind"] == "interaction-ended" {
                continue;
            }
            if value["kind"] != "message" {
                return Err("native ACP closed early".into());
            }
            return Ok(value["message"].clone());
        }
    };
    assert!(
        connection(&state, other, &id).is_err(),
        "connection cannot cross windows"
    );
    assert!(
        authorized_workspace(other, &workspace.id).is_err(),
        "workspace cannot cross windows"
    );
    send(
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{"fs":{"readTextFile":true,"writeTextFile":true}}}}),
    )?;
    assert_eq!(receive()?["result"]["protocolVersion"], 1);
    verify_login(app, window, other, &id)?;
    send(
        json!({"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":root_path,"mcpServers":connected["mcpServers"]}}),
    )?;
    assert_eq!(receive()?["result"]["sessionId"], "native-session");
    send(
        json!({"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"native-session","prompt":[{"type":"text","text":"Update fixture"}]}}),
    )?;
    for expected in ["fs/read_text_file", "fs/write_text_file"] {
        let request = receive()?;
        assert_eq!(request["method"], expected);
        let result = tauri::async_runtime::block_on(agent_client_operation(
            app.state::<AgentHostState>(),
            window.clone(),
            id.clone(),
            request["id"].clone(),
            expected.into(),
            request["params"].clone(),
        ))?;
        send(json!({"jsonrpc":"2.0","id":request["id"],"result":result}))?;
    }
    assert_eq!(receive()?["method"], "session/update");
    assert_eq!(receive()?["result"]["stopReason"], "end_turn");
    assert_eq!(
        fs::read(root_path.join("note.md")).map_err(|e| e.to_string())?,
        b"\xef\xbb\xbf# Native\r\n\r\nEdited  \r\n"
    );
    changed_rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "native document watcher did not report the agent edit")?;
    verify_mcp(app, window, &id)?;
    let external = tempfile::tempdir().map_err(|e| e.to_string())?;
    let external_path = external
        .path()
        .canonicalize()
        .map_err(|e| e.to_string())?
        .join("current.md");
    fs::write(&external_path, "single-file original").map_err(|e| e.to_string())?;
    let external_doc = docs
        .lock()
        .map_err(|_| "documents lock")?
        .open_authorized(&external_path)
        .map_err(|e| e.to_string())?;
    let owned = connection(&state, window, &id)?;
    owned
        .mcp_context
        .lock()
        .map_err(|_| "context lock")?
        .active_document_id = Some(external_doc.id.clone());
    assert!(client_tools::execute(
        &owned,
        "fs/read_text_file",
        json!({"sessionId":"native-session","path":external_path})
    )
    .is_err());
    assert_eq!(
        editor_document::execute(&owned, None)?["content"],
        "single-file original"
    );
    editor_document::execute(&owned, Some("single-file edited"))?;
    assert_eq!(
        fs::read_to_string(&external_path).map_err(|e| e.to_string())?,
        "single-file edited"
    );
    docs.lock()
        .map_err(|_| "documents lock")?
        .close(&external_doc.id);
    assert!(editor_document::execute(&owned, Some("revoked")).is_err());
    println!("Native current-document capability: authorized single file outside workspace, CAS write and revocation passed");
    agent_disconnect(app.state::<AgentHostState>(), window.clone(), id.clone())?;
    assert!(connection(&state, window, &id).is_err());
    window.unlisten(listener);
    println!("Native ACP: stdio initialize/new/prompt, window-scoped IPC, document CAS, UTF-8 BOM/CRLF, watcher notification and shutdown passed");
    if std::env::var_os("MARKLYRA_ACP_CREDENTIAL_PROBE").is_some() {
        verify_credential_environment(app, window, &workspace.id, &node)?;
    }
    if let Ok(agent_id) = std::env::var("MARKLYRA_ACP_NATIVE_MODEL_SMOKE") {
        verify_model(app, window, &workspace.id, data.path(), &agent_id)?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn verify_titlebar(window: &WebviewWindow) -> Result<(), String> {
    use objc2::{rc::Retained, sel};
    use objc2_app_kit::{NSButton, NSWindow};
    let capabilities = tauri::async_runtime::block_on(
        crate::platform::ui_chrome::initialise_editor_chrome(window.clone()),
    )?;
    assert_eq!(serde_json::to_value(capabilities).unwrap()["native"], true);
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
                // SAFETY: the fixture retains this native window and this closure runs on AppKit's main thread.
                let native = unsafe { Retained::retain(pointer.cast::<NSWindow>()) }
                    .ok_or("native window unavailable")?;
                let mut found = false;
                let mut aligned = 0;
                for controller in native.titlebarAccessoryViewControllers() {
                    let view = controller.view();
                    for child in view.subviews() {
                        if let Ok(button) = child.downcast::<NSButton>() {
                            let expected = if button.action() == Some(sel!(toggleOutline:)) {
                                Some(106.0)
                            } else if button.action() == Some(sel!(toggleSidebar:)) {
                                Some(74.0)
                            } else if button.action() == Some(sel!(toggleAi:)) {
                                Some(42.0)
                            } else {
                                None
                            };
                            if let Some(expected) = expected {
                                let frame = view.convertRect_toView(button.frame(), None);
                                let offset = native.frame().size.width - frame.origin.x - frame.size.width / 2.0;
                                assert!((offset - expected).abs() <= 1.0,
                                    "native action center {offset} must match AI toolbar column {expected}");
                                aligned += 1;
                            }
                            if button.action() == Some(sel!(toggleAi:)) {
                                assert!(button.image().is_some(), "native AI symbol is loaded");
                                assert!(!button.isHidden(), "AI control is visible");
                                let bounds = button.frame();
                                assert!(
                                    bounds.origin.x >= 0.0
                                        && bounds.origin.x + bounds.size.width
                                            <= view.bounds().size.width + 0.1,
                                    "AI control fits its hit-test parent"
                                );
                                // SAFETY: only the fixture-owned production titlebar target receives this action.
                                unsafe {
                                    button.performClick(None);
                                }
                                found = true;
                            }
                        }
                    }
                }
                if !found {
                    return Err("native AI control missing".into());
                }
                assert_eq!(aligned, 3, "all three native columns align with the AI toolbar");
                Ok(())
            })();
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(10))
        .map_err(|_| "native titlebar check timed out")??;
    let event = event_rx
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "native AI click not delivered")?;
    assert_eq!(serde_json::from_str::<Value>(&event).unwrap(), "view:ai");
    window.unlisten(listener);
    println!("Native AppKit AI control: three aligned columns, symbol, geometry and click delivery passed");
    Ok(())
}

fn verify_login(
    app: &AppHandle,
    window: &WebviewWindow,
    other: &WebviewWindow,
    id: &str,
) -> Result<(), String> {
    assert!(tauri::async_runtime::block_on(auth::agent_auth_start(
        app.state::<AgentHostState>(),
        window.clone(),
        id.into(),
        "unknown".into()
    ))
    .is_err());
    tauri::async_runtime::block_on(auth::agent_auth_start(
        app.state::<AgentHostState>(),
        window.clone(),
        id.into(),
        "fixture-login".into(),
    ))?;
    assert!(auth::agent_auth_io(
        app.state::<AgentHostState>(),
        other.clone(),
        id.into(),
        None,
        None,
        None,
        false
    )
    .is_err());
    auth::agent_auth_io(
        app.state::<AgentHostState>(),
        window.clone(),
        id.into(),
        None,
        Some(70),
        Some(20),
        false,
    )?;
    auth::agent_auth_io(
        app.state::<AgentHostState>(),
        window.clone(),
        id.into(),
        Some("fixture\n".into()),
        None,
        None,
        false,
    )?;
    let started = std::time::Instant::now();
    let mut output = Vec::new();
    use base64::Engine;
    loop {
        let result = auth::agent_auth_io(
            app.state::<AgentHostState>(),
            window.clone(),
            id.into(),
            None,
            None,
            None,
            false,
        )?;
        output.extend(
            base64::engine::general_purpose::STANDARD
                .decode(result["data"].as_str().unwrap())
                .map_err(|e| e.to_string())?,
        );
        if result["exitCode"].is_number() {
            assert_eq!(result["exitCode"], 0);
            break;
        }
        if started.elapsed() > Duration::from_secs(8) {
            return Err("PTY login timed out".into());
        }
        std::thread::sleep(Duration::from_millis(30));
    }
    let output = String::from_utf8(output).map_err(|e| e.to_string())?;
    assert!(
        output.contains("登录终端准备就绪"),
        "resizing and input cannot consume unread output"
    );
    assert!(output.contains("PTY_OK ✓"));
    auth::agent_auth_io(
        app.state::<AgentHostState>(),
        window.clone(),
        id.into(),
        None,
        None,
        None,
        true,
    )?;
    println!("Native PTY login: advertised method, Unicode output, resize/input, exit and window ownership passed");
    Ok(())
}

fn verify_model(
    app: &AppHandle,
    window: &WebviewWindow,
    workspace_id: &str,
    data: &Path,
    agent_id: &str,
) -> Result<(), String> {
    let local = catalog::discover()
        .into_iter()
        .find(|entry| entry["agentId"] == agent_id)
        .ok_or("requested local ACP agent not found")?;
    let profile = AgentProfile {
        id: "native-model-fixture".into(),
        agent_id: agent_id.into(),
        name: "Model fixture".into(),
        executable: local["executable"]
            .as_str()
            .ok_or("missing executable")?
            .into(),
        args: catalog::string_args(&local["args"])?,
        env: Default::default(),
        secret_keys: vec![],
        version: None,
        managed_path: None,
        mcp_enabled: true,
        enabled: true,
    };
    let (tx, rx) = std::sync::mpsc::channel();
    let listener = window.listen("marklyra:agent-event", move |event| {
        let _ = tx.send(event.payload().to_owned());
    });
    let connected = process::connect_profile(app, window, profile, data.to_owned(), workspace_id)?;
    let id = connected["connectionId"]
        .as_str()
        .ok_or("connection missing")?
        .to_string();
    let process = connection(&app.state::<AgentHostState>(), window, &id)?;
    let request = |id: u64, method: &str, params: Value| {
        process.send(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
    };
    let allow_edit = std::cell::Cell::new(false);
    let approved_edits = std::cell::Cell::new(0usize);
    let edit_turn = Uuid::new_v4().to_string();
    let edit_path = process.root.join("model-edit.md");
    let original = "\u{feff}# Model fixture\r\n\r\nOriginal sentence.  \r\n";
    let expected = original.replace("Original", "Verified");
    let receive = || -> Result<Value, String> {
        loop {
            let raw = rx
                .recv_timeout(Duration::from_secs(90))
                .map_err(|_| "real model ACP timeout")?;
            let value: Value = serde_json::from_str(&raw).map_err(|_| "invalid native event")?;
            if value["connectionId"] != id {
                continue;
            }
            if value["kind"] == "tool" {
                let args = &value["arguments"];
                let right_path = args["path"] == "model-edit.md"
                    || args["path"] == edit_path.to_string_lossy().as_ref();
                let right_edit = (value["name"] == "workspace_edit_document"
                    && args["oldText"] == "Original"
                    && args["newText"] == "Verified")
                    || (value["name"] == "workspace_write_document"
                        && args["content"] == expected.trim_start_matches('\u{feff}'));
                let approved = allow_edit.get()
                    && value["context"]["turnId"] == edit_turn
                    && right_path
                    && right_edit;
                mcp::agent_tool_respond(
                    app.state::<AgentHostState>(),
                    window.clone(),
                    id.clone(),
                    value["requestId"]
                        .as_str()
                        .ok_or("MCP request identity")?
                        .into(),
                    json!({"approved":approved}),
                )?;
                if !approved {
                    return Err("unexpected document operation in native model fixture".into());
                }
                approved_edits.set(approved_edits.get() + 1);
                continue;
            }
            if value["kind"] != "message" {
                return Err(format!(
                    "real model ACP disconnected: {}",
                    value["error"].as_str().unwrap_or("closed")
                ));
            }
            return Ok(value["message"].clone());
        }
    };
    let result: Result<(), String> = (|| {
        request(
            1,
            "initialize",
            json!({"protocolVersion":1,"clientInfo":{"name":"marklyra-native-check","version":"1"},"clientCapabilities":{}}),
        )?;
        loop {
            let message = receive()?;
            if message["id"] == 1 {
                if message["result"]["protocolVersion"] != 1 {
                    return Err("real agent initialize failed".into());
                }
                break;
            }
        }
        request(
            2,
            "session/new",
            json!({"cwd":process.root,"mcpServers":connected["mcpServers"]}),
        )?;
        let session = loop {
            let message = receive()?;
            if message["id"] == 2 {
                break message["result"]["sessionId"]
                    .as_str()
                    .ok_or("real agent requires authentication or could not create session")?
                    .to_string();
            }
        };
        request(
            3,
            "session/prompt",
            json!({"sessionId":session,"prompt":[{"type":"text","text":"Protocol smoke test only. Do not use any tools, read or write files, run commands or browse. Reply with exactly MARKLYRA_ACP_OK."}]}),
        )?;
        let mut text = String::new();
        let started = std::time::Instant::now();
        loop {
            if started.elapsed() > Duration::from_secs(120) {
                return Err("real model turn exceeded deadline".into());
            }
            let message = receive()?;
            if message["method"] == "session/update" {
                let update = &message["params"]["update"];
                if update["sessionUpdate"] == "tool_call" {
                    return Err("unexpected tool use in text-only smoke test".into());
                }
                if update["sessionUpdate"] == "agent_message_chunk" {
                    text.push_str(update["content"]["text"].as_str().unwrap_or(""));
                }
            } else if message["method"].is_string() && !message["id"].is_null() {
                let reply = if message["method"] == "session/request_permission" {
                    json!({"jsonrpc":"2.0","id":message["id"],"result":{"outcome":{"outcome":"cancelled"}}})
                } else {
                    json!({"jsonrpc":"2.0","id":message["id"],"error":{"code":-32601,"message":"No tools available in smoke test"}})
                };
                process.send(reply)?;
            } else if message["id"] == 3 {
                if message["result"]["stopReason"] != "end_turn" || text.trim() != "MARKLYRA_ACP_OK"
                {
                    return Err("real model response did not match smoke contract".into());
                }
                break;
            }
        }
        fs::write(&edit_path, original).map_err(|_| "cannot prepare model document fixture")?;
        allow_edit.set(true);
        let context = process::agent_context(
            app.state::<AgentHostState>(),
            window.clone(),
            id.clone(),
            json!({"turnId":edit_turn,"active":"model-edit.md","references":["model-edit.md"]}),
        )?;
        request(
            4,
            "session/prompt",
            json!({"sessionId":session,"prompt":[{"type":"text","text":format!("MarkLyra context: {context}")},{"type":"text","text":"In the isolated fixture, use only the marklyra_documents MCP workspace_read_document and workspace_edit_document tools directly (no delegation, shell, browser, or built-in file tools). Read model-edit.md, replace the single exact fragment Original with Verified, and preserve every other character and newline. The host will approve that exact fixture operation. Then reply with a Markdown link to model-edit.md."}]}),
        )?;
        let started = std::time::Instant::now();
        loop {
            if started.elapsed() > Duration::from_secs(150) {
                return Err("real model document turn timed out".into());
            }
            let message = receive()?;
            if message["method"] == "session/request_permission" {
                let tool = &message["params"]["toolCall"];
                let description = tool["title"].as_str().unwrap_or("");
                let allowed = description.contains("marklyra")
                    && (description.contains("workspace_read_document")
                        || description.contains("workspace_edit_document")
                        || description.contains("workspace_write_document"));
                let option = message["params"]["options"]
                    .as_array()
                    .and_then(|options| {
                        options.iter().find(|option| option["kind"] == "allow_once")
                    })
                    .and_then(|option| option["optionId"].as_str());
                let outcome = if allowed {
                    option
                        .map(|option| json!({"outcome":"selected","optionId":option}))
                        .unwrap_or(json!({"outcome":"cancelled"}))
                } else {
                    json!({"outcome":"cancelled"})
                };
                process.send(
                    json!({"jsonrpc":"2.0","id":message["id"],"result":{"outcome":outcome}}),
                )?;
            } else if message["method"] == "session/update"
                && message["params"]["update"]["sessionUpdate"] == "tool_call"
            {
                let title = message["params"]["update"]["title"].as_str().unwrap_or("");
                if !title.contains("marklyra") && !title.contains("workspace_") {
                    return Err("unexpected non-MCP tool in real model document fixture".into());
                }
            } else if message["method"].is_string() && !message["id"].is_null() {
                process.send(json!({"jsonrpc":"2.0","id":message["id"],"error":{"code":-32601,"message":"Only the supplied document MCP tools are enabled"}}))?;
            } else if message["id"] == 4 {
                if message["result"]["stopReason"] != "end_turn" {
                    return Err("real model document turn did not finish".into());
                }
                break;
            }
        }
        if approved_edits.get() == 0
            || fs::read(&edit_path).map_err(|_| "cannot verify model fixture")?
                != expected.as_bytes()
        {
            return Err("real model did not complete the exact document edit".into());
        }
        println!("Native real-model document edit passed: approved MarkLyra MCP operation, exact UTF-8 BOM/CRLF bytes, no repository material sent");
        Ok(())
    })();
    process.stop();
    window.unlisten(listener);
    result?;
    println!("Native real-model ACP smoke passed: {agent_id}, isolated fixture cwd, fixed text only, no tool calls observed");
    Ok(())
}

fn verify_mcp(app: &AppHandle, window: &WebviewWindow, id: &str) -> Result<(), String> {
    use std::io::{BufRead, BufReader};
    let process = connection(&app.state::<AgentHostState>(), window, id)?;
    let turn = Uuid::new_v4().to_string();
    process::agent_context(
        app.state::<AgentHostState>(),
        window.clone(),
        id.into(),
        json!({"turnId":turn,"active":null,"references":[]}),
    )?;
    let app_owned = app.clone();
    let window_owned = window.clone();
    let expected = id.to_string();
    let listener = window.listen("marklyra:agent-event", move |event| {
        let Ok(event) = serde_json::from_str::<Value>(event.payload()) else {
            return;
        };
        if event["connectionId"] != expected || event["kind"] != "tool" {
            return;
        }
        let approved = event["context"]["turnId"] == turn
            && matches!(
                event["name"].as_str(),
                Some(
                    "workspace_write_document"
                        | "workspace_edit_document"
                        | "workspace_create_directory"
                        | "workspace_trash_entry"
                        | "workspace_restore_entry"
                )
            );
        let _ = mcp::agent_tool_respond(
            app_owned.state::<AgentHostState>(),
            window_owned.clone(),
            expected.clone(),
            event["requestId"].as_str().unwrap_or("").into(),
            json!({"approved":approved}),
        );
    });
    let config = process.mcp_config.lock().map_err(|_| "MCP config lock")?[0].clone();
    let mut builder = command(
        Path::new(config["command"].as_str().ok_or("MCP program missing")?),
        &catalog::string_args(&config["args"])?,
    );
    for variable in config["env"].as_array().ok_or("MCP environment missing")? {
        builder.env(
            variable["name"].as_str().ok_or("MCP env name")?,
            variable["value"].as_str().ok_or("MCP env value")?,
        );
    }
    let mut child = builder
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "MCP proxy launch failed")?;
    let mut input = child.stdin.take().ok_or("MCP stdin")?;
    let output = child.stdout.take().ok_or("MCP stdout")?;
    struct Guard(Child);
    impl Drop for Guard {
        fn drop(&mut self) {
            kill_tree(&mut self.0);
        }
    }
    let _child = Guard(child);
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(output).lines() {
            match line {
                Ok(line) => {
                    if tx.send(line).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });
    let mut sequence = 0;
    let mut rpc = |method: &str, params: Value| -> Result<Value, String> {
        sequence += 1;
        writeln!(
            input,
            "{}",
            json!({"jsonrpc":"2.0","id":sequence,"method":method,"params":params})
        )
        .map_err(|_| "MCP write failed")?;
        let line = rx
            .recv_timeout(Duration::from_secs(15))
            .map_err(|_| "MCP reply timeout")?;
        let reply: Value = serde_json::from_str(&line).map_err(|_| "MCP invalid response")?;
        if reply["id"] != sequence || !reply["error"].is_null() {
            return Err("MCP response rejected".into());
        }
        Ok(reply["result"].clone())
    };
    let result: Result<(), String> = (|| {
        let initialize = rpc(
            "initialize",
            json!({"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"native-fixture","version":"1"}}),
        )?;
        assert_eq!(initialize["serverInfo"]["name"], "marklyra");
        let tools = rpc("tools/list", json!({}))?;
        assert!(tools["tools"]
            .as_array()
            .unwrap()
            .iter()
            .any(|tool| tool["name"] == "workspace_edit_document"));
        for (name, args) in [
            ("workspace_create_directory", json!({"path":"generated"})),
            (
                "workspace_write_document",
                json!({"path":"generated/new.md","content":"# Generated\r\n\r\nOriginal  \r\n"}),
            ),
            (
                "workspace_read_document",
                json!({"path":"generated/new.md"}),
            ),
            (
                "workspace_edit_document",
                json!({"path":"generated/new.md","oldText":"Original","newText":"Revised"}),
            ),
        ] {
            assert_ne!(
                rpc("tools/call", json!({"name":name,"arguments":args}))?["isError"],
                true,
                "{name} failed"
            );
        }
        assert_eq!(
            fs::read_to_string(process.root.join("generated/new.md")).map_err(|e| e.to_string())?,
            "# Generated\r\n\r\nRevised  \r\n"
        );
        let trashed = rpc(
            "tools/call",
            json!({"name":"workspace_trash_entry","arguments":{"path":"generated"}}),
        )?;
        assert_ne!(trashed["isError"], true);
        let receipt: Value = serde_json::from_str(
            trashed["content"][0]["text"]
                .as_str()
                .ok_or("trash receipt missing")?,
        )
        .map_err(|_| "trash receipt invalid")?;
        assert!(!process.root.join("generated").exists());
        assert_ne!(
            rpc(
                "tools/call",
                json!({"name":"workspace_restore_entry","arguments":{"receipt":receipt["receipt"]}})
            )?["isError"],
            true
        );
        assert!(process.root.join("generated/new.md").is_file());
        process
            .cancelled_turn
            .store(true, std::sync::atomic::Ordering::Release);
        assert_eq!(
            rpc(
                "tools/call",
                json!({"name":"workspace_write_document","arguments":{"path":"after-cancel.md","content":"blocked"}})
            )?["isError"],
            true
        );
        assert!(!process.root.join("after-cancel.md").exists());
        Ok(())
    })();
    process
        .cancelled_turn
        .store(false, std::sync::atomic::Ordering::Release);
    window.unlisten(listener);
    result?;
    println!("Native MCP stdio bridge: initialization, tool discovery, approval, create/read/exact edit/trash/restore and cancellation passed");
    Ok(())
}

fn verify_credential_environment(
    app: &AppHandle,
    window: &WebviewWindow,
    workspace_id: &str,
    node: &Path,
) -> Result<(), String> {
    let data = tempfile::tempdir().map_err(|_| "credential fixture data")?;
    let fixture = tempfile::tempdir().map_err(|_| "credential fixture script")?;
    let script = fixture.path().join("credential.cjs");
    // This is a synthetic, public fixture value, never a provider/user credential.
    const VALUE: &str = "synthetic token ; 中文 ✓";
    const NAME: &str = "marklyra_probe_token";
    fs::write(&script, r#"
const readline=require('node:readline');
const present=Object.hasOwn(process.env,'marklyra_probe_token');
const matches=process.env.marklyra_probe_token==='synthetic token ; 中文 ✓';
if(process.argv.includes('--credential-login')) { process.stdout.write(matches?'ENV_OK':'ENV_MISSING'); setInterval(()=>{},1000); }
else readline.createInterface({input:process.stdin}).on('line',line=>{const m=JSON.parse(line); if(m.method==='initialize')process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,agentCapabilities:{},authMethods:[{id:'env',name:'Fixture',type:'terminal',args:['--credential-login']}],credentialPresent:present,credentialMatches:matches}})+'\n');});
"#).map_err(|_| "credential fixture write")?;
    let id = format!("credential-fixture-{}", Uuid::new_v4());
    let entry = keyring::Entry::new("dev.refinex.marklyra.agents", &format!("{id}:{NAME}"))
        .map_err(|_| "fixture keyring")?;
    assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
    struct Cleanup(keyring::Entry);
    impl Drop for Cleanup {
        fn drop(&mut self) {
            let _ = self.0.delete_credential();
        }
    }
    let cleanup = Cleanup(entry);
    let original = AgentProfile {
        id: id.clone(),
        agent_id: "fixture".into(),
        name: "Credential fixture".into(),
        executable: node.to_string_lossy().into(),
        args: vec![script.to_string_lossy().into()],
        env: Default::default(),
        secret_keys: vec![],
        version: None,
        managed_path: None,
        mcp_enabled: false,
        enabled: true,
    };
    save_settings(
        data.path(),
        &AgentSettings {
            attention_enabled: true,
            profiles: vec![original],
            default_profile_id: Some(id.clone()),
        },
    )?;
    credentials::update(data.path(), &id, NAME, Some(VALUE))?;
    let (tx, rx) = std::sync::mpsc::channel();
    let listener = window.listen("marklyra:agent-event", move |event| {
        let _ = tx.send(event.payload().to_owned());
    });
    let launch = || -> Result<(String, Value), String> {
        let profile = profile(data.path(), &id)?;
        let connection =
            process::connect_profile(app, window, profile, data.path().into(), workspace_id)?;
        let connection_id = connection["connectionId"]
            .as_str()
            .ok_or("fixture connection")?
            .to_owned();
        agent_send(
            app.state::<AgentHostState>(),
            window.clone(),
            connection_id.clone(),
            json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{}}}),
        )?;
        loop {
            let raw = rx
                .recv_timeout(Duration::from_secs(10))
                .map_err(|_| "credential fixture response timeout")?;
            let event: Value =
                serde_json::from_str(&raw).map_err(|_| "credential fixture response")?;
            if event["connectionId"] == connection_id && event["kind"] == "message" {
                return Ok((connection_id, event["message"]["result"].clone()));
            }
        }
    };
    let (first, result) = launch()?;
    assert_eq!(result["credentialPresent"], true);
    assert_eq!(result["credentialMatches"], true);
    tauri::async_runtime::block_on(auth::agent_auth_start(
        app.state::<AgentHostState>(),
        window.clone(),
        first.clone(),
        "env".into(),
    ))?;
    let mut output = String::new();
    for _ in 0..100 {
        let read = auth::agent_auth_io(
            app.state::<AgentHostState>(),
            window.clone(),
            first.clone(),
            None,
            None,
            None,
            false,
        )?;
        use base64::Engine;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(read["data"].as_str().unwrap_or_default())
            .map_err(|_| "fixture PTY encoding")?;
        output.push_str(&String::from_utf8_lossy(&bytes));
        if output.contains("ENV_OK") {
            break;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
    assert!(
        output.contains("ENV_OK"),
        "PTY receives the stored variable without case changes"
    );
    credentials::update(data.path(), &id, NAME, None)?;
    credentials::revoke_connections(&app.state::<AgentHostState>(), &id)?;
    assert!(connection(&app.state::<AgentHostState>(), window, &first).is_err());
    assert!(matches!(
        cleanup.0.get_password(),
        Err(keyring::Error::NoEntry)
    ));
    let saved = settings(data.path())?;
    assert!(saved.profiles[0].secret_keys.is_empty());
    assert!(!fs::read_to_string(data.path().join("profiles.json"))
        .map_err(|_| "fixture metadata")?
        .contains(VALUE));
    let (second, result) = launch()?;
    assert_eq!(result["credentialPresent"], false);
    agent_disconnect(app.state::<AgentHostState>(), window.clone(), second)?;
    window.unlisten(listener);
    println!("Native credentials: keychain to ACP/PTY environment, exact case/value, live revocation, deletion and clean reconnect passed; no user credentials accessed");
    Ok(())
}
