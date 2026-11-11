//! The `marklyra` binary end to end: discovery, JSON envelope, exit codes, safety rules and
//! the stdio MCP server.
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Command, Stdio};

fn marklyra(cwd: &Path, args: &[&str]) -> (i32, String, String) {
    let out = Command::new(env!("CARGO_BIN_EXE_marklyra"))
        .args(args)
        .current_dir(cwd)
        .output()
        .unwrap();
    (
        out.status.code().unwrap_or(-1),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).into_owned(),
    )
}
fn data(cwd: &Path, args: &[&str]) -> Value {
    let mut all: Vec<&str> = args.to_vec();
    all.push("--json");
    let (code, out, err) = marklyra(cwd, &all);
    assert_eq!(code, 0, "{args:?}: {out}{err}");
    let envelope: Value = serde_json::from_str(out.trim()).unwrap();
    assert_eq!(envelope["ok"], true);
    assert_eq!(envelope["schemaVersion"], 1);
    envelope
}

#[test]
fn commands_discover_the_workspace_and_keep_the_app_rules() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    // Nothing is created by reading outside a task folder.
    let (code, _, err) = marklyra(root, &["task", "list"]);
    assert_eq!(code, 3, "{err}");
    assert!(!root.join(".marklyra").exists());

    data(root, &["task", "init"]);
    data(root, &["project", "create", "官网", "--key", "web"]);
    let created = data(
        root,
        &[
            "task",
            "create",
            "重做首页",
            "--project",
            "WEB",
            "--priority",
            "high",
            "--label",
            "缺陷",
            "--subtask",
            "出方案",
        ],
    );
    assert_eq!(created["data"]["ref"], "WEB-1");

    // Found from a subfolder, with the search box's query language.
    std::fs::create_dir(root.join("notes")).unwrap();
    let listed = data(
        &root.join("notes"),
        &["task", "list", "priority:high", "is:open"],
    );
    assert_eq!(listed["data"].as_array().unwrap().len(), 1);
    assert_eq!(listed["meta"]["total"], 1);
    let picked = data(root, &["task", "list", "--fields", "ref,title"]);
    assert_eq!(picked["data"][0], json!({"ref":"WEB-1","title":"重做首页"}));
    let (code, table, _) = marklyra(root, &["task", "list"]);
    assert_eq!(code, 0);
    let head = table.lines().next().unwrap();
    assert!(head.starts_with("REF") && head.contains("STATUS") && !head.contains("STATUSNAME"));
    // Priorities read as words for people; JSON keeps the ids.
    assert!(table.lines().nth(1).unwrap().contains("高"));
    assert_eq!(listed["data"][0]["priority"], "high");
    assert!(table.contains("WEB-2") && table.contains("出方案"));

    // Closing a parent with an open subtask needs an explicit flag.
    let (code, _, err) = marklyra(root, &["task", "update", "WEB-1", "--status", "done"]);
    assert_eq!(code, 5, "{err}");
    assert!(err.contains("--close-subtasks"));
    data(
        root,
        &[
            "task",
            "update",
            "WEB-1",
            "--status",
            "done",
            "--close-subtasks",
        ],
    );
    let child = data(root, &["task", "show", "WEB-2"]);
    assert_eq!(child["data"]["status"], "done");

    // A stale revision is a conflict, never an overwrite.
    let (code, _, err) = marklyra(
        root,
        &[
            "task",
            "update",
            "WEB-1",
            "--revision",
            "stale",
            "--title",
            "x",
        ],
    );
    assert_eq!(code, 4, "{err}");
    let shown = data(root, &["task", "show", "WEB-1"]);
    assert_eq!(shown["data"]["title"], "重做首页");
    let revision = shown["data"]["revision"].as_str().unwrap().to_owned();
    data(
        root,
        &[
            "task",
            "update",
            "WEB-1",
            "--revision",
            &revision,
            "--title",
            "重做首页首屏",
        ],
    );
    let (code, out, _) = marklyra(root, &["task", "show", "WEB-9", "--json"]);
    assert_eq!(code, 3);
    assert_eq!(
        serde_json::from_str::<Value>(out.trim()).unwrap()["ok"],
        false
    );

    data(root, &["task", "comment", "WEB-1", "完成", "首屏"]);
    data(root, &["task", "archive", "WEB-1"]);
    assert_eq!(
        data(root, &["task", "list", "is:archived"])["meta"]["total"],
        1
    );
    data(root, &["task", "restore", "WEB-1"]);

    // Every write is attributed to the command line.
    let id = shown["data"]["id"].as_str().unwrap();
    let activity =
        std::fs::read_to_string(root.join(format!(".marklyra/tasks/activity/{id}.jsonl"))).unwrap();
    assert!(
        activity.lines().all(|l| l.contains("\"by\":\"cli\"")),
        "{activity}"
    );

    let (code, _, err) = marklyra(root, &["cycle", "list"]);
    assert_eq!(code, 5, "cycles are off: {err}");
    assert_eq!(
        data(root, &["view", "list"])["data"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    let (code, _, _) = marklyra(root, &["task", "fly"]);
    assert_eq!(code, 2);
}

#[cfg(unix)]
#[test]
fn a_linked_task_folder_is_refused() {
    let real = tempfile::tempdir().unwrap();
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(real.path().join("tasks")).unwrap();
    std::os::unix::fs::symlink(real.path(), dir.path().join(".marklyra")).unwrap();
    let (code, _, err) = marklyra(dir.path(), &["task", "list"]);
    assert_eq!(code, 5, "{err}");
}

struct Server {
    child: std::process::Child,
    lines: std::io::Lines<BufReader<std::process::ChildStdout>>,
    id: u64,
}
impl Server {
    fn start(root: &Path, write: bool) -> Self {
        let mut args = vec!["mcp", "--workspace", root.to_str().unwrap()];
        if write {
            args.push("--allow-write");
        }
        let mut child = Command::new(env!("CARGO_BIN_EXE_marklyra"))
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let lines = BufReader::new(child.stdout.take().unwrap()).lines();
        Self {
            child,
            lines,
            id: 0,
        }
    }
    fn rpc(&mut self, method: &str, params: Value) -> Value {
        self.id += 1;
        let stdin = self.child.stdin.as_mut().unwrap();
        writeln!(
            stdin,
            "{}",
            json!({"jsonrpc":"2.0","id":self.id,"method":method,"params":params})
        )
        .unwrap();
        let reply: Value = serde_json::from_str(&self.lines.next().unwrap().unwrap()).unwrap();
        assert_eq!(reply["id"], self.id);
        reply["result"].clone()
    }
    fn tool(&mut self, name: &str, args: Value) -> (bool, Value) {
        let r = self.rpc("tools/call", json!({"name":name,"arguments":args}));
        let text = r["content"][0]["text"].as_str().unwrap().to_owned();
        (
            r["isError"] == true,
            serde_json::from_str(&text).unwrap_or(json!(text)),
        )
    }
}
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

#[test]
fn the_mcp_server_is_read_only_unless_writes_are_allowed() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    data(root, &["task", "init"]);
    data(root, &["project", "create", "官网", "--key", "WEB"]);
    data(root, &["task", "create", "重做首页", "--project", "WEB"]);

    let mut reader = Server::start(root, false);
    let init = reader.rpc("initialize", json!({"protocolVersion":"2025-06-18"}));
    assert_eq!(init["serverInfo"]["name"], "marklyra-tasks");
    let names: Vec<String> = reader.rpc("tools/list", json!({}))["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(names, ["task_query", "task_get", "task_catalog"]);
    let (error, found) = reader.tool("task_query", json!({"query":"is:open"}));
    assert!(!error);
    assert_eq!(found["total"], 1);
    let (error, _) = reader.tool("task_create", json!({"title":"x"}));
    assert!(error, "read-only server must refuse writes");

    let mut writer = Server::start(root, true);
    writer.rpc("initialize", json!({}));
    let tools = writer.rpc("tools/list", json!({}));
    assert!(tools["tools"]
        .as_array()
        .unwrap()
        .iter()
        .all(|t| !t["name"].as_str().unwrap().contains("delete")));
    let (error, made) = writer.tool("task_create", json!({"title":"补充埋点","project":"WEB"}));
    assert!(!error, "{made}");
    assert_eq!(made["items"][0]["applied"], true);
    let (error, _) = writer.tool(
        "task_update",
        json!({"id":"WEB-1","revision":"stale","set":{"status":"done"}}),
    );
    assert!(error, "stale revisions are refused");
    // The reader sees what the writer and the command line changed.
    data(root, &["task", "create", "第三项", "--project", "WEB"]);
    let (_, found) = reader.tool("task_query", json!({"query":"is:open"}));
    assert_eq!(found["total"], 3);
}

#[test]
fn import_previews_writes_links_notes_and_undoes() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    data(root, &["task", "init"]);
    std::fs::create_dir_all(root.join("notes")).unwrap();
    let note = "# 计划\r\n- [ ] 写公告\r\n- [x] 定日期\r\n";
    std::fs::write(root.join("notes/计划.md"), note).unwrap();
    std::fs::write(root.join("tasks.csv"), "title,status\n整理文档,todo\n").unwrap();

    // A dry run writes nothing.
    let preview = data(root, &["import", "notes", "notes", "--dry-run"]);
    assert_eq!(preview["data"]["preview"]["new"], 1);
    assert_eq!(preview["data"]["preview"]["skip"], 1);
    assert_eq!(
        std::fs::read_to_string(root.join("notes/计划.md")).unwrap(),
        note
    );

    let done = data(root, &["import", "notes", "notes"]);
    assert_eq!(done["data"]["created"], 1);
    assert_eq!(done["data"]["linked"], 1);
    let rewritten = std::fs::read_to_string(root.join("notes/计划.md")).unwrap();
    assert!(rewritten.starts_with("# 计划\r\n- [TASK-1 写公告](task:"));
    assert!(rewritten.ends_with(")\r\n- [x] 定日期\r\n"));

    data(root, &["import", "csv", "tasks.csv"]);
    let again = data(root, &["import", "csv", "tasks.csv"]);
    assert_eq!(again["data"]["preview"]["skip"], 1);

    let receipts = data(root, &["import", "list"]);
    let list = receipts["data"].as_array().unwrap();
    assert_eq!(list.len(), 2);
    let id = list[0]["id"].as_str().unwrap();
    assert_eq!(data(root, &["import", "undo", id])["data"]["archived"], 1);
    let (code, _, _) = marklyra(root, &["import", "undo", "nope"]);
    assert_eq!(code, 3);
}
