//! Adapted and modified for MarkLyra from Markune (Apache-2.0).
//! License and provenance: licenses/agents/README.md and markune-Apache-2.0.txt.
use super::*;
use std::io::{BufRead, BufReader};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{channel, Sender};
use std::time::Duration;

pub(super) struct PendingTool {
    pub owner: String,
    pub connection_id: String,
    pub sender: Sender<Value>,
}
fn schemas() -> Vec<Value> {
    let schema = |name: &str, description: &str, properties: Value, required: Vec<&str>| json!({"name":name,"description":description,"inputSchema":{"type":"object","properties":properties,"required":required,"additionalProperties":false}});
    vec![
        schema("editor_edit_document", "Prefer this for local edits to the attached current document. Replace one exact unique fragment; unrelated bytes and line endings remain unchanged. Read first, then obtain approval.", json!({"oldText":{"type":"string"},"newText":{"type":"string"}}), vec!["oldText","newText"]),
        schema("workspace_edit_document", "Prefer this for local edits. Replace one exact unique fragment in a previously read document; rejects ambiguity and disk changes.", json!({"path":{"type":"string"},"oldText":{"type":"string"},"newText":{"type":"string"}}), vec!["path","oldText","newText"]),
        schema("editor_read_document", "Read the current named document explicitly attached to this turn. This single-file grant does not grant access to adjacent files.", json!({}), vec![]),
        schema("editor_write_document", "Update the explicitly attached current document after reading it and obtaining user approval. Preserves encoding and rejects conflicts.", json!({"content":{"type":"string"}}), vec!["content"]),
        schema("workspace_list_documents", "List workspace documents by relative path; private paths excluded.", json!({"query":{"type":"string"},"offset":{"type":"integer","minimum":0},"limit":{"type":"integer","minimum":1,"maximum":200}}), vec![]),
        schema("workspace_read_document", "Read a document before editing; preserves encoding through the host.", json!({"path":{"type":"string"}}), vec!["path"]),
        schema("workspace_write_document", "Create or update a document after user approval and version checks. Read existing files first.", json!({"path":{"type":"string"},"content":{"type":"string"}}), vec!["path","content"]),
        schema("workspace_create_directory", "Create a directory after user approval; parent must exist.", json!({"path":{"type":"string"}}), vec!["path"]),
        schema("workspace_trash_entry", "Move a document or directory into a recoverable local trash after user approval. Never permanently deletes documents.", json!({"path":{"type":"string"}}), vec!["path"]),
        schema("workspace_restore_entry", "Restore an entry moved to trash by this session; fails if destination exists.", json!({"receipt":{"type":"string"}}), vec!["receipt"]),
    ]
}
fn tool_result(value: Result<Value, String>) -> Value {
    match value {
        Ok(value) => {
            json!({"content":[{"type":"text","text":serde_json::to_string(&value).unwrap_or_default()}],"isError":false})
        }
        Err(error) => json!({"content":[{"type":"text","text":error}],"isError":true}),
    }
}
fn frontend_tool(
    app: &AppHandle,
    window: &WebviewWindow,
    process: &Arc<process::AgentProcess>,
    name: &str,
    arguments: Value,
    session: &str,
    turn_id: &str,
) -> Result<Value, String> {
    let request_id = Uuid::new_v4().to_string();
    let (sender, receiver) = channel();
    let state = app.state::<AgentHostState>();
    let mut pending = state.mcp_pending.lock().map_err(|_| "工具请求状态不可用")?;
    if pending.len() >= 32 {
        return Err("待处理工具请求过多".into());
    }
    pending.insert(
        request_id.clone(),
        PendingTool {
            owner: window.label().into(),
            connection_id: process.id.clone(),
            sender,
        },
    );
    drop(pending);
    let sent=window.emit_to(window.label(),"marklyra:agent-event",json!({"connectionId":process.id,"kind":"tool","requestId":request_id,"name":name,"arguments":arguments,"sessionId":session,"context":{"turnId":turn_id}}));
    let result = if sent.is_err() {
        Err("工具窗口已关闭".to_string())
    } else {
        receiver
            .recv_timeout(Duration::from_secs(300))
            .map_err(|_| "MarkLyra 工具处理超时".to_string())
    };
    state
        .mcp_pending
        .lock()
        .map_err(|_| "工具请求状态不可用")?
        .remove(&request_id);
    result
}

fn handle(
    app: &AppHandle,
    window: &WebviewWindow,
    process: &Arc<process::AgentProcess>,
    body: &Value,
) -> Value {
    let id = body["id"].clone();
    let result = match body["method"].as_str().unwrap_or("") {
        "initialize" => Ok(
            json!({"protocolVersion":match body["params"]["protocolVersion"].as_str(){Some("2024-11-05")=>"2024-11-05",Some("2025-03-26")=>"2025-03-26",_=>"2025-06-18"},"capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"marklyra","version":env!("CARGO_PKG_VERSION")}}),
        ),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({"tools":schemas()})),
        "tools/call" => {
            let name = body["params"]["name"].as_str().unwrap_or("");
            let arguments = body["params"]["arguments"].clone();
            let result = (|| -> Result<Value, String> {
                let turn = process
                    .mcp_context
                    .lock()
                    .map_err(|_| "上下文不可用")?
                    .clone();
                if turn.turn_id.is_empty() {
                    return Err("MarkLyra 工具仅在用户发起的任务中可用".into());
                }
                let session = process
                    .sessions
                    .lock()
                    .map_err(|_| "会话状态不可用")?
                    .last()
                    .cloned()
                    .ok_or("MCP 工具尚未绑定会话")?;
                if !process.live.load(std::sync::atomic::Ordering::Acquire)
                    || process
                        .cancelled_turn
                        .load(std::sync::atomic::Ordering::Acquire)
                {
                    return Err("任务已取消".into());
                }
                process.valid_session(&json!({"sessionId":session}))?;
                match name {
                    "editor_edit_document" | "workspace_edit_document" => {
                        let old = arguments["oldText"].as_str().ok_or("缺少原文片段")?;
                        let new = arguments["newText"].as_str().ok_or("缺少替换片段")?;
                        let path = if name == "editor_edit_document" {
                            super::editor_document::current_path(process)?
                                .to_string_lossy()
                                .into_owned()
                        } else {
                            arguments["path"].as_str().ok_or("缺少路径")?.to_string()
                        };
                        let decision = frontend_tool(
                            app,
                            window,
                            process,
                            name,
                            json!({"path":path,"oldText":old,"newText":new}),
                            &session,
                            &turn.turn_id,
                        )?;
                        if decision["approved"] != true
                            || process
                                .mcp_context
                                .lock()
                                .map_err(|_| "上下文不可用")?
                                .turn_id
                                != turn.turn_id
                        {
                            return Err("精确修改未获批准或授权已过期".into());
                        }
                        if name == "editor_edit_document" {
                            super::editor_document::edit(process, old, new)
                        } else {
                            client_tools::edit(process, &session, &path, old, new)
                        }
                    }
                    "editor_read_document" | "editor_write_document" => {
                        let content = if name == "editor_write_document" {
                            Some(arguments["content"].as_str().ok_or("缺少文档内容")?)
                        } else {
                            None
                        };
                        if let Some(content) = content {
                            let path = super::editor_document::current_path(process)?;
                            let decision = frontend_tool(
                                app,
                                window,
                                process,
                                name,
                                json!({"path":path,"content":content}),
                                &session,
                                &turn.turn_id,
                            )?;
                            if decision["approved"] != true
                                || process
                                    .mcp_context
                                    .lock()
                                    .map_err(|_| "上下文不可用")?
                                    .turn_id
                                    != turn.turn_id
                            {
                                return Err("当前文档修改未获批准或授权已过期".into());
                            }
                        }
                        super::editor_document::execute(process, content)
                    }
                    "workspace_list_documents" => {
                        let workspace = process.workspace.as_ref().ok_or("工作区不可用")?;
                        let report = workspace.list_documents().map_err(|e| e.to_string())?;
                        let query = arguments["query"].as_str().unwrap_or("").to_lowercase();
                        let items: Vec<_> = report
                            .entries
                            .into_iter()
                            .filter(|e| e.relative_path.to_lowercase().contains(&query))
                            .collect();
                        let offset = arguments["offset"].as_u64().unwrap_or(0) as usize;
                        let limit =
                            arguments["limit"].as_u64().unwrap_or(100).clamp(1, 200) as usize;
                        Ok(
                            json!({"total":items.len(),"truncated":report.truncated,"items":items.into_iter().skip(offset).take(limit).map(|e|json!({"path":e.relative_path,"name":e.name})).collect::<Vec<_>>()}),
                        )
                    }
                    "workspace_read_document"
                    | "workspace_write_document"
                    | "workspace_create_directory"
                    | "workspace_trash_entry"
                    | "workspace_restore_entry" => {
                        if name != "workspace_read_document" {
                            let decision = frontend_tool(
                                app,
                                window,
                                process,
                                name,
                                arguments.clone(),
                                &session,
                                &turn.turn_id,
                            )?;
                            if decision["approved"] != true {
                                return Err("用户未批准本次操作".into());
                            }
                            if process
                                .mcp_context
                                .lock()
                                .map_err(|_| "上下文不可用")?
                                .turn_id
                                != turn.turn_id
                                || process
                                    .cancelled_turn
                                    .load(std::sync::atomic::Ordering::Acquire)
                            {
                                return Err("工具授权已过期".into());
                            }
                        }
                        let operation = || {
                            process.valid_session(&json!({"sessionId":session}))?;
                            if matches!(
                                name,
                                "workspace_create_directory"
                                    | "workspace_trash_entry"
                                    | "workspace_restore_entry"
                            ) {
                                return super::document_tools::mutate(process, name, &arguments);
                            }
                            let raw = arguments["path"].as_str().ok_or("缺少文档路径")?;
                            let path = if Path::new(raw).is_absolute() {
                                PathBuf::from(raw)
                            } else {
                                process.root.join(raw)
                            };
                            client_tools::execute(
                                process,
                                if name == "workspace_read_document" {
                                    "fs/read_text_file"
                                } else {
                                    "fs/write_text_file"
                                },
                                json!({"sessionId":session,"path":path,"content":arguments["content"]}),
                            )
                        };
                        operation()
                    }
                    _ => Err("不支持的 MarkLyra 文档工具".into()),
                }
            })();
            Ok(tool_result(result))
        }
        _ => Err("Method not found".to_string()),
    };
    match result {
        Ok(result) => json!({"jsonrpc":"2.0","id":id,"result":result}),
        Err(error) => json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":error}}),
    }
}
pub(super) fn start(
    app: &AppHandle,
    window: &WebviewWindow,
    process: &Arc<process::AgentProcess>,
) -> Result<Value, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|_| "无法创建 MarkLyra MCP 桥")?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "无法配置 MCP 桥")?;
    let port = listener
        .local_addr()
        .map_err(|_| "无法读取 MCP 地址")?
        .port();
    let token = Uuid::new_v4().to_string();
    let expected = token.clone();
    let owner = Arc::downgrade(process);
    let app = app.clone();
    let window = window.clone();
    std::thread::spawn(move || loop {
        let Some(process) = owner.upgrade() else {
            break;
        };
        if !process.live.load(std::sync::atomic::Ordering::Acquire) {
            break;
        }
        match listener.accept() {
            Ok((mut socket, _)) => {
                let _ = socket.set_read_timeout(Some(Duration::from_secs(5)));
                let _ = socket.set_write_timeout(Some(Duration::from_secs(5)));
                let mut line = Vec::new();
                let read = BufReader::new(&mut socket)
                    .take(MAX_FRAME as u64 + 1)
                    .read_until(b'\n', &mut line);
                if read.is_err() || line.len() > MAX_FRAME {
                    continue;
                }
                let Ok(request) = serde_json::from_slice::<Value>(&line) else {
                    continue;
                };
                if request["token"].as_str() != Some(&expected) {
                    continue;
                }
                if request["body"]["id"].is_null() {
                    let _ = socket.write_all(b"{}\n");
                    continue;
                }
                let response = handle(&app, &window, &process, &request["body"]);
                if let Ok(mut bytes) = serde_json::to_vec(&response) {
                    bytes.push(b'\n');
                    let _ = socket.write_all(&bytes);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(20))
            }
            Err(_) => break,
        }
    });
    let program = std::env::current_exe().map_err(|_| "无法定位 MarkLyra MCP 程序")?;
    Ok(
        json!({"name":"marklyra_documents","command":program,"args":["--agent-mcp-stdio"],"env":[{"name":"MARKLYRA_AGENT_MCP_PORT","value":port.to_string()},{"name":"MARKLYRA_AGENT_MCP_TOKEN","value":token}]}),
    )
}
pub fn proxy_main() -> Result<(), String> {
    let port = std::env::var("MARKLYRA_AGENT_MCP_PORT")
        .ok()
        .and_then(|v| v.parse::<u16>().ok())
        .ok_or("MCP port missing")?;
    let token = std::env::var("MARKLYRA_AGENT_MCP_TOKEN").map_err(|_| "MCP token missing")?;
    let input = std::io::stdin();
    let mut input = input.lock();
    let mut output = std::io::stdout().lock();
    loop {
        let mut line = Vec::new();
        let count = (&mut input)
            .take(MAX_FRAME as u64 + 1)
            .read_until(b'\n', &mut line)
            .map_err(|_| "MCP read failed")?;
        if count == 0 {
            break;
        }
        if line.len() > MAX_FRAME {
            return Err("MCP frame too large".into());
        }
        let body: Value = serde_json::from_slice(&line).map_err(|_| "Invalid MCP JSON")?;
        let mut socket =
            TcpStream::connect(("127.0.0.1", port)).map_err(|_| "MarkLyra MCP bridge closed")?;
        socket
            .set_read_timeout(Some(Duration::from_secs(310)))
            .map_err(|_| "MCP socket unavailable")?;
        let mut request = serde_json::to_vec(&json!({"token":token,"body":body}))
            .map_err(|_| "Invalid MCP message")?;
        request.push(b'\n');
        socket.write_all(&request).map_err(|_| "MCP write failed")?;
        let mut response = Vec::new();
        BufReader::new(socket)
            .take(MAX_FRAME as u64 + 1)
            .read_until(b'\n', &mut response)
            .map_err(|_| "MCP response failed")?;
        if response.len() > MAX_FRAME {
            return Err("MCP response too large".into());
        }
        if !body["id"].is_null() {
            output
                .write_all(&response)
                .and_then(|_| output.flush())
                .map_err(|_| "MCP output failed")?;
        }
    }
    Ok(())
}
#[tauri::command]
pub fn agent_tool_respond(
    state: State<AgentHostState>,
    window: WebviewWindow,
    connection_id: String,
    request_id: String,
    result: Value,
) -> Result<(), String> {
    connection(&state, &window, &connection_id)?;
    if serde_json::to_vec(&result)
        .map_err(|_| "工具结果无效")?
        .len()
        > MAX_FRAME
    {
        return Err("工具结果过大".into());
    }
    let mut pending = state.mcp_pending.lock().map_err(|_| "工具状态不可用")?;
    let request = pending
        .get(&request_id)
        .filter(|item| item.owner == window.label() && item.connection_id == connection_id)
        .ok_or("工具请求已失效")?;
    request.sender.send(result).map_err(|_| "工具请求已结束")?;
    pending.remove(&request_id);
    Ok(())
}
