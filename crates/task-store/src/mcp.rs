//! `marklyra mcp`: the task tools over stdio for MCP clients outside the app (desktop
//! assistants, editors). There is no approval screen here, so it is read-only unless started
//! with `--allow-write`; even then updates need the revision that was read, nothing is ever
//! deleted, and every write is attributed to `mcp`.
use crate::tools;
use crate::TaskStore;
use cap_std::{ambient_authority, fs::Dir};
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::path::Path;

const ACTOR: &str = "mcp";

pub fn serve(root: &Path, allow_write: bool) -> Result<(), String> {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    serve_with(root, allow_write, stdin.lock(), &mut stdout.lock())
}

/// The same loop over any reader and writer, so tests can drive it.
pub fn serve_with(
    root: &Path,
    allow_write: bool,
    input: impl BufRead,
    output: &mut dyn Write,
) -> Result<(), String> {
    let open = || -> Result<TaskStore, String> {
        let dir = Dir::open_ambient_dir(root.join(".marklyra/tasks"), ambient_authority())
            .map_err(|e| e.to_string())?;
        TaskStore::open(dir).map_err(|e| e.to_string())
    };
    // One store for the session; each call re-reads changed files first, so edits made in
    // the app meanwhile are seen.
    let mut store = open()?;
    for line in input.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        let Ok(request) = serde_json::from_str::<Value>(&line) else {
            writeln!(
                output,
                "{}",
                json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}})
            )
            .map_err(|e| e.to_string())?;
            continue;
        };
        // Notifications carry no id and get no reply.
        let Some(id) = request.get("id").cloned() else {
            continue;
        };
        let result = handle(&mut store, allow_write, &request);
        let reply = match result {
            Ok(result) => json!({"jsonrpc":"2.0","id":id,"result":result}),
            Err((code, message)) => {
                json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
            }
        };
        writeln!(output, "{reply}").map_err(|e| e.to_string())?;
        output.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn handle(
    store: &mut TaskStore,
    allow_write: bool,
    request: &Value,
) -> Result<Value, (i32, String)> {
    match request["method"].as_str().unwrap_or("") {
        "initialize" => {
            let version = request["params"]["protocolVersion"]
                .as_str()
                .filter(|v| matches!(*v, "2024-11-05" | "2025-03-26"))
                .unwrap_or("2025-06-18");
            Ok(json!({
                "protocolVersion": version,
                "capabilities": {"tools": {"listChanged": false}},
                "serverInfo": {"name": "marklyra-tasks", "version": env!("CARGO_PKG_VERSION")},
                "instructions": if allow_write {
                    "MarkLyra tasks. Read with task_query/task_get/task_catalog. Writes apply immediately: read first, pass the revision, never guess ids."
                } else {
                    "MarkLyra tasks, read-only. Use task_query/task_get/task_catalog."
                },
            }))
        }
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({"tools": tools::schemas(allow_write)})),
        "tools/call" => {
            let name = request["params"]["name"].as_str().unwrap_or("");
            let args = &request["params"]["arguments"];
            Ok(tool_result(call(store, allow_write, name, args)))
        }
        _ => Err((-32601, "Method not found".into())),
    }
}

fn call(
    store: &mut TaskStore,
    allow_write: bool,
    name: &str,
    args: &Value,
) -> Result<Value, String> {
    if !tools::is_task_tool(name) {
        return Err(format!("未知工具 {name}"));
    }
    store.refresh().map_err(|e| e.to_string())?;
    if !tools::is_write(name) {
        let now = chrono::Local::now();
        return tools::read(
            store,
            name,
            args,
            &now.format("%Y-%m-%d").to_string(),
            now.timestamp(),
        );
    }
    if !allow_write {
        return Err("只读模式：以 marklyra mcp --allow-write 启动才可写入".into());
    }
    let plan = tools::plan(store, name, args)?;
    let all: Vec<usize> = (0..plan.items.len()).collect();
    let (outcome, _, _) = tools::execute(store, &plan, &all, ACTOR)?;
    Ok(outcome)
}

fn tool_result(value: Result<Value, String>) -> Value {
    match value {
        Ok(value) => json!({"content":[{"type":"text","text":value.to_string()}],"isError":false}),
        Err(error) => json!({"content":[{"type":"text","text":error}],"isError":true}),
    }
}
