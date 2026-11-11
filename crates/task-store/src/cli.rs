//! The `marklyra` command line. It works on the task files directly with the same store code
//! as the app, so it runs whether or not the app is open; an open window picks changes up
//! through its file watcher. Writes are attributed to `cli` in the activity log.
//!
//! Exit codes: 0 success, 1 I/O, 2 usage, 3 not found, 4 revision conflict, 5 invalid.
use crate::tools;
use crate::{Category, Task, TaskStore};
use cap_std::{ambient_authority, fs::Dir};
use serde_json::{json, Map, Value};
use std::io::Write;
use std::path::{Path, PathBuf};

pub const SCHEMA_VERSION: u32 = 1;
const ACTOR: &str = "cli";

#[derive(Debug)]
pub struct CliError {
    pub code: i32,
    pub message: String,
}
fn fail<T>(code: i32, message: impl Into<String>) -> Result<T, CliError> {
    Err(CliError {
        code,
        message: message.into(),
    })
}
fn usage<T>(message: impl Into<String>) -> Result<T, CliError> {
    fail(2, message)
}
/// Tool errors are plain text; their wording tells conflicts and missing tasks apart.
fn classify(message: String) -> CliError {
    let code = if message.contains("已在别处修改") {
        4
    } else if message.contains("找不到") {
        3
    } else {
        5
    };
    CliError { code, message }
}
impl From<crate::StoreError> for CliError {
    fn from(error: crate::StoreError) -> Self {
        let code = match error {
            crate::StoreError::Conflict => 4,
            crate::StoreError::NotFound(_) => 3,
            crate::StoreError::Invalid(_) => 5,
            _ => 1,
        };
        CliError {
            code,
            message: error.to_string(),
        }
    }
}

const HELP: &str = "marklyra — MarkLyra 任务命令行

用法：marklyra <命令> [参数] [--workspace <目录>] [--json]

  task list [查询…] [--view <视图>] [--limit N] [--fields ref,title,…]
  task show <WEB-12>
  task create <标题> [--project WEB] [--status 待办] [--priority high] [--type 缺陷]
                     [--label 标签]… [--bucket 现在] [--cycle current] [--due 2026-12-01]
                     [--parent WEB-3] [--description 文本] [--subtask 标题]… [--template 模板]
  task update <WEB-12> [--revision R] [同 create 的字段] [--title 标题] [--close-subtasks]
  task comment <WEB-12> <内容>
  task archive|restore <WEB-12> [--revision R]
  task init
  project list | show <KEY> | create <名称> --key KEY | update <KEY> [--name --key --color --state]
  project archive|restore <KEY>
  cycle list | show <N> | complete <N> [--move next|none]
  view list | show <视图>
  import github|csv <文件> [--project WEB] [--create-labels] [--include-closed] [--dry-run]
  import octarine <目录> [同上]   只读取，不修改 Octarine 目录；默认包含已关闭任务
  import notes [文件或文件夹] [同上]   清单项 - [ ] 建为任务，并把该行改为任务链接
  import list | undo <记录ID>   撤销会归档该次导入新建的任务
  mcp [--allow-write]        以 stdio 提供 MCP 任务工具；默认只读

工作区：默认从当前目录向上查找 .marklyra/tasks；--workspace 指定。
退出码：0 成功，1 读写失败，2 用法错误，3 未找到，4 revision 冲突，5 校验失败。
";

/// Parsed arguments: positionals, single-valued flags, repeated flags and switches.
#[derive(Default)]
struct Args {
    positional: Vec<String>,
    flags: Map<String, Value>,
    repeated: std::collections::HashMap<String, Vec<String>>,
    switches: std::collections::HashSet<String>,
}
const SWITCHES: [&str; 8] = [
    "json",
    "close-subtasks",
    "allow-write",
    "help",
    "dry-run",
    "create-labels",
    "include-closed",
    "skip-closed",
];
const REPEATED: [&str; 2] = ["label", "subtask"];
impl Args {
    fn parse(raw: Vec<String>) -> Result<Self, CliError> {
        let mut args = Args::default();
        let mut iter = raw.into_iter();
        while let Some(token) = iter.next() {
            if token == "--" {
                args.positional.extend(iter.by_ref());
                break;
            }
            if let Some(name) = token.strip_prefix("--") {
                let (name, inline) = match name.split_once('=') {
                    Some((n, v)) => (n.to_owned(), Some(v.to_owned())),
                    None => (name.to_owned(), None),
                };
                if SWITCHES.contains(&name.as_str()) {
                    args.switches.insert(name);
                    continue;
                }
                let value = match inline {
                    Some(v) => v,
                    None => iter.next().ok_or_else(|| CliError {
                        code: 2,
                        message: format!("--{name} 需要一个值"),
                    })?,
                };
                if REPEATED.contains(&name.as_str()) {
                    args.repeated.entry(name).or_default().push(value);
                } else {
                    args.flags.insert(name, json!(value));
                }
            } else if token == "-h" {
                args.switches.insert("help".into());
            } else {
                args.positional.push(token);
            }
        }
        Ok(args)
    }
    fn flag(&self, name: &str) -> Option<&str> {
        self.flags.get(name).and_then(Value::as_str)
    }
    fn has(&self, name: &str) -> bool {
        self.switches.contains(name)
    }
    fn arg(&self, index: usize, what: &str) -> Result<&str, CliError> {
        self.positional
            .get(index)
            .map(String::as_str)
            .ok_or_else(|| CliError {
                code: 2,
                message: format!("缺少{what}"),
            })
    }
}

/// Entry point; returns the process exit code.
pub fn main(raw: Vec<String>) -> i32 {
    let stdout = std::io::stdout();
    let stderr = std::io::stderr();
    let json = raw.iter().any(|a| a == "--json");
    match run(raw, &mut stdout.lock()) {
        Ok(()) => 0,
        Err(error) => {
            if json {
                let _ = writeln!(
                    stdout.lock(),
                    "{}",
                    json!({"ok":false,"schemaVersion":SCHEMA_VERSION,"error":{"code":error.code,"message":error.message}})
                );
            } else {
                let _ = writeln!(stderr.lock(), "marklyra: {}", error.message);
            }
            error.code
        }
    }
}

pub fn run(raw: Vec<String>, out: &mut dyn Write) -> Result<(), CliError> {
    let args = Args::parse(raw)?;
    let command: Vec<&str> = args.positional.iter().take(2).map(String::as_str).collect();
    if args.has("help") || command.is_empty() {
        write!(out, "{HELP}").map_err(io)?;
        return Ok(());
    }
    let explicit = args.flag("workspace").map(PathBuf::from);
    match command.as_slice() {
        ["task", "init"] => {
            let root = match &explicit {
                Some(p) => p.clone(),
                None => std::env::current_dir().map_err(io)?,
            };
            init(&root)?;
            return emit(out, &args, json!({"workspace": root}), |o| {
                writeln!(o, "已在 {} 创建任务目录", root.display())
            });
        }
        ["mcp"] => {
            let root = find_root(explicit.as_deref())?;
            return crate::mcp::serve(&root, args.has("allow-write")).map_err(|e| CliError {
                code: 1,
                message: e,
            });
        }
        _ => {}
    }
    let root = find_root(explicit.as_deref())?;
    let mut store = open(&root)?;
    let rest = Args {
        positional: args.positional.iter().skip(2).cloned().collect(),
        flags: args.flags.clone(),
        repeated: args.repeated.clone(),
        switches: args.switches.clone(),
    };
    match command.as_slice() {
        ["task", sub] => task(&mut store, sub, &rest, out),
        ["project", sub] => project(&mut store, sub, &rest, out),
        ["cycle", sub] => cycle(&mut store, sub, &rest, out),
        ["view", sub] => view(&store, sub, &rest, out),
        ["import", sub] => import(&mut store, &root, sub, &rest, out),
        _ => usage(format!("未知命令：{}\n\n{HELP}", command.join(" "))),
    }
}

fn io(error: std::io::Error) -> CliError {
    CliError {
        code: 1,
        message: error.to_string(),
    }
}

/// The folder whose `.marklyra/tasks` holds the store: the explicit one, else the nearest
/// ancestor of the current directory that has one.
fn find_root(explicit: Option<&Path>) -> Result<PathBuf, CliError> {
    if let Some(root) = explicit {
        if !root.join(".marklyra/tasks").is_dir() {
            return fail(
                3,
                format!(
                    "{} 没有任务目录；需要时先运行 marklyra task init",
                    root.display()
                ),
            );
        }
        return Ok(root.to_path_buf());
    }
    let mut dir = std::env::current_dir().map_err(io)?;
    loop {
        if dir.join(".marklyra/tasks").is_dir() {
            return Ok(dir);
        }
        if !dir.pop() {
            return fail(3, "当前目录及其上级没有 .marklyra/tasks；用 --workspace 指定，或运行 marklyra task init");
        }
    }
}
/// Symbolic links are refused for the same reason the app refuses them: the store must be
/// the folder the person sees, not somewhere else.
fn no_links(root: &Path) -> Result<(), CliError> {
    for part in [root.join(".marklyra"), root.join(".marklyra/tasks")] {
        if let Ok(meta) = std::fs::symlink_metadata(&part) {
            if meta.file_type().is_symlink() {
                return fail(5, format!("{} 是符号链接，已拒绝", part.display()));
            }
        }
    }
    Ok(())
}
fn open(root: &Path) -> Result<TaskStore, CliError> {
    no_links(root)?;
    let dir =
        Dir::open_ambient_dir(root.join(".marklyra/tasks"), ambient_authority()).map_err(io)?;
    Ok(TaskStore::open(dir)?)
}
fn init(root: &Path) -> Result<(), CliError> {
    if !root.is_dir() {
        return fail(3, format!("{} 不是文件夹", root.display()));
    }
    no_links(root)?;
    std::fs::create_dir_all(root.join(".marklyra/tasks")).map_err(io)?;
    let dir =
        Dir::open_ambient_dir(root.join(".marklyra/tasks"), ambient_authority()).map_err(io)?;
    TaskStore::initialize(dir)?;
    Ok(())
}

fn today() -> (String, i64) {
    let now = chrono::Local::now();
    (now.format("%Y-%m-%d").to_string(), now.timestamp())
}

/// JSON envelope or a human rendering.
fn emit(
    out: &mut dyn Write,
    args: &Args,
    data: Value,
    human: impl FnOnce(&mut dyn Write) -> std::io::Result<()>,
) -> Result<(), CliError> {
    if args.has("json") {
        writeln!(
            out,
            "{}",
            json!({"ok":true,"schemaVersion":SCHEMA_VERSION,"data":data})
        )
        .map_err(io)
    } else {
        human(out).map_err(io)
    }
}

/// Display width: CJK and other wide characters take two columns.
fn width(text: &str) -> usize {
    text.chars()
        .map(|c| match c as u32 {
            0x1100..=0x115F
            | 0x2E80..=0xA4CF
            | 0xAC00..=0xD7A3
            | 0xF900..=0xFAFF
            | 0xFE30..=0xFE4F
            | 0xFF00..=0xFF60
            | 0xFFE0..=0xFFE6
            | 0x1F300..=0x1FAFF => 2,
            _ => 1,
        })
        .sum()
}
fn table(out: &mut dyn Write, rows: &[Vec<String>]) -> std::io::Result<()> {
    let columns = rows.iter().map(Vec::len).max().unwrap_or(0);
    let widths: Vec<usize> = (0..columns)
        .map(|i| {
            rows.iter()
                .filter_map(|r| r.get(i))
                .map(|c| width(c))
                .max()
                .unwrap_or(0)
        })
        .collect();
    for row in rows {
        let mut line = String::new();
        for (i, cell) in row.iter().enumerate() {
            line.push_str(cell);
            if i + 1 < row.len() {
                line.push_str(&" ".repeat(widths[i] - width(cell) + 2));
            }
        }
        writeln!(out, "{}", line.trim_end())?;
    }
    Ok(())
}

const DEFAULT_FIELDS: [&str; 5] = ["ref", "statusName", "priority", "due", "title"];
/// What a person reads in tables: priorities in words, `none` left blank. JSON keeps ids.
fn human_text(item: &Value, field: &str) -> String {
    if field == "priority" {
        return match item[field].as_str() {
            Some("urgent") => "紧急",
            Some("high") => "高",
            Some("medium") => "中",
            Some("low") => "低",
            _ => "",
        }
        .into();
    }
    field_text(item, field)
}
fn header(field: &str) -> String {
    match field {
        "statusName" => "STATUS".into(),
        other => other.to_uppercase(),
    }
}
fn field_text(item: &Value, field: &str) -> String {
    match &item[field] {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Array(list) => list
            .iter()
            .map(|v| v.as_str().map_or_else(|| v.to_string(), String::from))
            .collect::<Vec<_>>()
            .join(","),
        other => other.to_string(),
    }
}

/// `--project WEB --label a --label b …` → the fields map the task tools accept.
fn fields(args: &Args) -> Map<String, Value> {
    let mut map = Map::new();
    for (flag, key) in [
        ("title", "title"),
        ("project", "project"),
        ("status", "status"),
        ("priority", "priority"),
        ("type", "type"),
        ("bucket", "bucket"),
        ("cycle", "cycle"),
        ("due", "due"),
        ("parent", "parent"),
    ] {
        if let Some(v) = args.flag(flag) {
            // "none" clears nullable fields.
            let value = if v == "none" && !matches!(key, "title" | "status" | "priority") {
                Value::Null
            } else if key == "cycle" {
                v.parse::<u64>().map_or_else(|_| json!(v), |n| json!(n))
            } else {
                json!(v)
            };
            map.insert(key.into(), value);
        }
    }
    if let Some(labels) = args.repeated.get("label") {
        let list: Vec<&str> = labels
            .iter()
            .filter(|l| *l != "none")
            .map(String::as_str)
            .collect();
        map.insert("labels".into(), json!(list));
    }
    for (flag, key) in [("blocked-by", "blockedBy"), ("related", "related")] {
        if let Some(v) = args.flag(flag) {
            let list: Vec<&str> = v
                .split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty() && *s != "none")
                .collect();
            map.insert(key.into(), json!(list));
        }
    }
    map
}

fn apply_plan(store: &mut TaskStore, name: &str, input: Value) -> Result<Value, CliError> {
    let plan = tools::plan(store, name, &input).map_err(classify)?;
    let all: Vec<usize> = (0..plan.items.len()).collect();
    let (outcome, _, _) = tools::execute(store, &plan, &all, ACTOR).map_err(classify)?;
    // A single item reports its own failure as the command's failure.
    if let Some(first) = outcome["items"].as_array().and_then(|l| l.first()) {
        if first["applied"] != true {
            return Err(classify(
                first["reason"].as_str().unwrap_or("未能应用").to_owned(),
            ));
        }
        return Ok(first["result"].clone());
    }
    Ok(outcome)
}

fn task(
    store: &mut TaskStore,
    sub: &str,
    args: &Args,
    out: &mut dyn Write,
) -> Result<(), CliError> {
    let (today, now) = today();
    match sub {
        "list" => {
            let mut query = args.positional.join(" ");
            if let Some(view) = args.flag("view") {
                let snap = store.snapshot();
                let v = snap
                    .views
                    .iter()
                    .find(|v| v.id == view || v.name == view)
                    .ok_or_else(|| CliError {
                        code: 3,
                        message: format!("找不到视图「{view}」"),
                    })?;
                query = format!("{} {query}", v.query).trim().to_owned();
            }
            let limit = args
                .flag("limit")
                .and_then(|l| l.parse::<u64>().ok())
                .unwrap_or(200);
            let found = tools::read(
                store,
                "task_query",
                &json!({"query":query,"limit":limit}),
                &today,
                now,
            )
            .map_err(classify)?;
            let fields: Vec<String> = args
                .flag("fields")
                .map(|f| {
                    f.split(',')
                        .map(|s| s.trim().to_owned())
                        .filter(|s| !s.is_empty())
                        .collect()
                })
                .unwrap_or_else(|| DEFAULT_FIELDS.iter().map(|s| (*s).to_owned()).collect());
            let items = found["items"].as_array().cloned().unwrap_or_default();
            if args.has("json") {
                let picked: Vec<Value> = if args.flag("fields").is_some() {
                    items
                        .iter()
                        .map(|i| {
                            Value::Object(
                                fields.iter().map(|f| (f.clone(), i[f].clone())).collect(),
                            )
                        })
                        .collect()
                } else {
                    items.clone()
                };
                return writeln!(
                    out,
                    "{}",
                    json!({"ok":true,"schemaVersion":SCHEMA_VERSION,"data":picked,"meta":{"total":found["total"],"truncated":found["truncated"]}})
                )
                .map_err(io);
            }
            let mut rows = vec![fields.iter().map(|f| header(f)).collect::<Vec<_>>()];
            rows.extend(
                items
                    .iter()
                    .map(|i| fields.iter().map(|f| human_text(i, f)).collect()),
            );
            table(out, &rows).map_err(io)?;
            if found["truncated"] == true {
                writeln!(out, "… 共 {} 项，只列出前 {limit} 项", found["total"]).map_err(io)?;
            }
            Ok(())
        }
        "show" => {
            let reference = args.arg(0, "任务编号")?;
            let task = tools::read(store, "task_get", &json!({"id":reference}), &today, now)
                .map_err(classify)?;
            emit(out, args, task.clone(), |o| {
                writeln!(
                    o,
                    "{}  {}",
                    field_text(&task, "ref"),
                    field_text(&task, "title")
                )?;
                for (label, key) in [
                    ("状态", "statusName"),
                    ("优先级", "priority"),
                    ("项目", "project"),
                    ("类型", "type"),
                    ("标签", "labels"),
                    ("队列", "bucket"),
                    ("迭代", "cycle"),
                    ("到期", "due"),
                    ("父任务", "parent"),
                    ("子任务", "subtasks"),
                    ("被阻塞于", "blockedBy"),
                    ("相关", "related"),
                    ("revision", "revision"),
                ] {
                    let value = human_text(&task, key);
                    if !value.is_empty() {
                        writeln!(o, "  {label}：{value}")?;
                    }
                }
                let body = field_text(&task, "description");
                if !body.trim().is_empty() {
                    writeln!(o, "\n{}", body.trim_end())?;
                }
                Ok(())
            })
        }
        "create" => {
            let title = args.arg(0, "任务标题")?;
            let mut input = fields(args);
            input.insert("title".into(), json!(title));
            if let Some(d) = args.flag("description") {
                input.insert("description".into(), json!(d));
            }
            if let Some(t) = args.flag("template") {
                input.insert("template".into(), json!(t));
            }
            if let Some(s) = args.repeated.get("subtask") {
                input.insert("subtasks".into(), json!(s));
            }
            let result = apply_plan(store, "task_create", Value::Object(input))?;
            emit(out, args, result.clone(), |o| {
                writeln!(o, "已创建 {}", field_text(&result, "ref"))
            })
        }
        "update" => {
            let reference = args.arg(0, "任务编号")?;
            let task = store.resolve(reference).ok_or_else(|| CliError {
                code: 3,
                message: format!("找不到任务「{reference}」"),
            })?;
            let revision = args
                .flag("revision")
                .map_or_else(|| task.revision.clone(), String::from);
            let set = fields(args);
            let mut input = json!({"id":reference,"revision":revision,"set":set});
            if let Some(d) = args.flag("description") {
                input["description"] = json!(d);
            }
            let closing_kids = closing_children(store, &task, &input["set"]["status"])?;
            if !closing_kids.is_empty() && !args.has("close-subtasks") {
                return fail(
                    5,
                    format!(
                        "{reference} 还有 {} 个未完成的子任务；加 --close-subtasks 一并完成",
                        closing_kids.len()
                    ),
                );
            }
            let result = apply_plan(store, "task_update", input)?;
            for kid in &closing_kids {
                apply_plan(
                    store,
                    "task_update",
                    json!({"id":kid.id,"revision":kid.revision,"set":{"status":set["status"]}}),
                )?;
            }
            emit(out, args, result.clone(), |o| {
                writeln!(o, "已更新 {reference}")
            })
        }
        "comment" => {
            let reference = args.arg(0, "任务编号")?;
            let body = args.positional[1..].join(" ");
            let result = apply_plan(store, "task_comment", json!({"id":reference,"body":body}))?;
            emit(out, args, result, |o| writeln!(o, "已评论 {reference}"))
        }
        "archive" | "restore" => {
            let reference = args.arg(0, "任务编号")?;
            let task = store.resolve(reference).ok_or_else(|| CliError {
                code: 3,
                message: format!("找不到任务「{reference}」"),
            })?;
            let revision = args
                .flag("revision")
                .map_or_else(|| task.revision.clone(), String::from);
            let name = if sub == "archive" {
                "task_archive"
            } else {
                "task_restore"
            };
            let result = apply_plan(store, name, json!({"id":reference,"revision":revision}))?;
            emit(out, args, result, |o| {
                writeln!(
                    o,
                    "已{} {reference}",
                    if sub == "archive" { "归档" } else { "恢复" }
                )
            })
        }
        other => usage(format!("未知命令：task {other}")),
    }
}

/// Open children a status change would leave behind when it closes the parent.
fn closing_children(store: &TaskStore, task: &Task, status: &Value) -> Result<Vec<Task>, CliError> {
    let Some(status) = status.as_str() else {
        return Ok(Vec::new());
    };
    let snap = store.snapshot();
    let lower = status.to_lowercase();
    let category = |id: &str| {
        snap.statuses
            .iter()
            .find(|s| s.id == id)
            .map(|s| s.category)
    };
    let target = snap
        .statuses
        .iter()
        .find(|s| s.id == status || s.name.to_lowercase() == lower)
        .map(|s| s.category);
    if !matches!(target, Some(Category::Completed | Category::Cancelled)) {
        return Ok(Vec::new());
    }
    Ok(snap
        .tasks
        .iter()
        .filter(|t| t.parent.as_deref() == Some(task.id.as_str()) && !t.archived)
        .filter(|t| category(&t.status).is_none_or(Category::open))
        .cloned()
        .collect())
}

fn find_project<'a>(snap: &'a crate::Snapshot, key: &str) -> Result<&'a crate::Project, CliError> {
    let lower = key.to_lowercase();
    snap.projects
        .iter()
        .find(|p| p.id == key || p.key.eq_ignore_ascii_case(key) || p.name.to_lowercase() == lower)
        .ok_or_else(|| CliError {
            code: 3,
            message: format!("找不到项目「{key}」"),
        })
}

fn mutate(store: &mut TaskStore, value: Value) -> Result<crate::MutationResult, CliError> {
    let mutation = serde_json::from_value(value).map_err(|e| CliError {
        code: 5,
        message: e.to_string(),
    })?;
    Ok(store.apply_as(mutation, ACTOR)?)
}

fn project(
    store: &mut TaskStore,
    sub: &str,
    args: &Args,
    out: &mut dyn Write,
) -> Result<(), CliError> {
    let snap = store.snapshot();
    let open_count = |id: &str| {
        snap.tasks
            .iter()
            .filter(|t| t.project.as_deref() == Some(id) && !t.archived)
            .filter(|t| {
                snap.statuses
                    .iter()
                    .find(|s| s.id == t.status)
                    .is_none_or(|s| s.category.open())
            })
            .count()
    };
    match sub {
        "list" => {
            let data: Vec<Value> = snap
                .projects
                .iter()
                .map(|p| json!({"id":p.id,"key":p.key,"name":p.name,"state":p.state,"open":open_count(&p.id),"revision":p.revision}))
                .collect();
            emit(out, args, json!(data), |o| {
                let mut rows = vec![vec![
                    "KEY".into(),
                    "NAME".into(),
                    "STATE".into(),
                    "OPEN".into(),
                ]];
                rows.extend(snap.projects.iter().map(|p| {
                    vec![
                        p.key.clone(),
                        p.name.clone(),
                        p.state.clone(),
                        open_count(&p.id).to_string(),
                    ]
                }));
                table(o, &rows)
            })
        }
        "show" => {
            let p = find_project(&snap, args.arg(0, "项目")?)?;
            let data = json!({"id":p.id,"key":p.key,"name":p.name,"state":p.state,"color":p.color,"open":open_count(&p.id),"description":p.description,"revision":p.revision});
            emit(out, args, data, |o| {
                writeln!(
                    o,
                    "{}  {}  （{}，{} 个未关闭任务）",
                    p.key,
                    p.name,
                    p.state,
                    open_count(&p.id)
                )?;
                if !p.description.trim().is_empty() {
                    writeln!(o, "\n{}", p.description.trim_end())?;
                }
                Ok(())
            })
        }
        "create" => {
            let name = args.arg(0, "项目名称")?;
            let key = args.flag("key").ok_or_else(|| CliError {
                code: 2,
                message: "需要 --key".into(),
            })?;
            let r = mutate(
                store,
                json!({"kind":"createProject","name":name,"key":key,"color":args.flag("color"),"description":args.flag("description")}),
            )?;
            let id = r.created.first().cloned().unwrap_or_default();
            emit(out, args, json!({"id":id,"key":key.to_uppercase()}), |o| {
                writeln!(o, "已创建项目 {}", key.to_uppercase())
            })
        }
        "update" | "archive" | "restore" => {
            let p = find_project(&snap, args.arg(0, "项目")?)?.clone();
            let mut set = Map::new();
            match sub {
                "archive" => {
                    set.insert("state".into(), json!("archived"));
                }
                "restore" => {
                    set.insert("state".into(), json!("active"));
                }
                _ => {
                    for key in ["name", "key", "color", "state", "description"] {
                        if let Some(v) = args.flag(key) {
                            set.insert(key.into(), json!(v));
                        }
                    }
                    if set.is_empty() {
                        return usage("没有要修改的字段");
                    }
                }
            }
            let revision = args
                .flag("revision")
                .map_or_else(|| p.revision.clone(), String::from);
            mutate(
                store,
                json!({"kind":"updateProject","id":p.id,"revision":revision,"set":set}),
            )?;
            emit(out, args, json!({"id":p.id}), |o| {
                writeln!(o, "已更新项目 {}", p.key)
            })
        }
        other => usage(format!("未知命令：project {other}")),
    }
}

fn cycle(
    store: &mut TaskStore,
    sub: &str,
    args: &Args,
    out: &mut dyn Write,
) -> Result<(), CliError> {
    let snap = store.snapshot();
    if !snap.settings.cycles_enabled {
        return fail(5, "迭代未开启；在 MarkLyra 的任务设置 → 迭代中开启");
    }
    let count = |n: u32| {
        snap.tasks
            .iter()
            .filter(|t| t.cycle == Some(n) && !t.archived)
            .count()
    };
    match sub {
        "list" => {
            let data: Vec<Value> = snap
                .cycles
                .iter()
                .map(|c| json!({"number":c.number,"state":c.state,"start":c.start,"end":c.end,"tasks":count(c.number)}))
                .collect();
            emit(out, args, json!(data), |o| {
                let mut rows = vec![vec![
                    "N".into(),
                    "STATE".into(),
                    "START".into(),
                    "END".into(),
                    "TASKS".into(),
                ]];
                rows.extend(snap.cycles.iter().map(|c| {
                    vec![
                        c.number.to_string(),
                        c.state.clone(),
                        c.start.clone(),
                        c.end.clone(),
                        count(c.number).to_string(),
                    ]
                }));
                table(o, &rows)
            })
        }
        "show" => {
            let n: u32 = args
                .arg(0, "迭代编号")?
                .trim_start_matches('#')
                .parse()
                .map_err(|_| CliError {
                    code: 2,
                    message: "迭代编号应为数字".into(),
                })?;
            let c = snap
                .cycles
                .iter()
                .find(|c| c.number == n)
                .ok_or_else(|| CliError {
                    code: 3,
                    message: format!("找不到迭代 {n}"),
                })?;
            emit(
                out,
                args,
                serde_json::to_value(c).unwrap_or_default(),
                |o| {
                    writeln!(
                        o,
                        "迭代 {}  {} → {}  {}  {} 个任务",
                        c.number,
                        c.start,
                        c.end,
                        c.state,
                        count(c.number)
                    )
                },
            )
        }
        "complete" => {
            let n: u32 = args
                .arg(0, "迭代编号")?
                .trim_start_matches('#')
                .parse()
                .map_err(|_| CliError {
                    code: 2,
                    message: "迭代编号应为数字".into(),
                })?;
            let to = args.flag("move").unwrap_or("next");
            if !matches!(to, "next" | "none") {
                return usage("--move 只能是 next 或 none");
            }
            let moves: Map<String, Value> = snap
                .tasks
                .iter()
                .filter(|t| t.cycle == Some(n) && !t.archived)
                .map(|t| (t.id.clone(), json!(to)))
                .collect();
            let (today, _) = today();
            // Only unfinished tasks may be moved; the store rejects others, so keep those.
            let unfinished: Map<String, Value> = moves
                .into_iter()
                .filter(|(id, _)| {
                    snap.tasks
                        .iter()
                        .find(|t| &t.id == id)
                        .and_then(|t| snap.statuses.iter().find(|s| s.id == t.status))
                        .is_none_or(|s| s.category.open())
                })
                .collect();
            mutate(
                store,
                json!({"kind":"completeCycle","number":n,"today":today,"moves":unfinished}),
            )?;
            emit(out, args, json!({"number":n}), |o| {
                writeln!(o, "迭代 {n} 已完成")
            })
        }
        other => usage(format!("未知命令：cycle {other}")),
    }
}

fn view(store: &TaskStore, sub: &str, args: &Args, out: &mut dyn Write) -> Result<(), CliError> {
    let snap = store.snapshot();
    match sub {
        "list" => {
            let data: Vec<Value> = snap
                .views
                .iter()
                .map(|v| json!({"id":v.id,"name":v.name,"query":v.query}))
                .collect();
            emit(out, args, json!(data), |o| {
                let mut rows = vec![vec!["ID".into(), "NAME".into(), "QUERY".into()]];
                rows.extend(
                    snap.views
                        .iter()
                        .map(|v| vec![v.id.clone(), v.name.clone(), v.query.clone()]),
                );
                table(o, &rows)
            })
        }
        "show" => {
            let key = args.arg(0, "视图")?;
            let v = snap
                .views
                .iter()
                .find(|v| v.id == key || v.name == key)
                .ok_or_else(|| CliError {
                    code: 3,
                    message: format!("找不到视图「{key}」"),
                })?;
            emit(
                out,
                args,
                serde_json::to_value(v).unwrap_or_default(),
                |o| writeln!(o, "{}  {}", v.name, v.query),
            )
        }
        other => usage(format!("未知命令：view {other}")),
    }
}

fn read_file(path: &str) -> Result<(Vec<u8>, String), CliError> {
    let path = Path::new(path);
    let meta = std::fs::symlink_metadata(path).map_err(|e| CliError {
        code: 3,
        message: format!("无法读取 {}：{e}", path.display()),
    })?;
    if !meta.is_file() || meta.len() > 64 * 1024 * 1024 {
        return fail(5, format!("{} 不是 64 MiB 以内的文件", path.display()));
    }
    let bytes = std::fs::read(path).map_err(io)?;
    let label = path
        .file_name()
        .map_or_else(String::new, |n| n.to_string_lossy().into_owned());
    Ok((bytes, label))
}

/// Writes next to the note and renames over it, so a failed write leaves the note intact.
fn replace_note(path: &Path, text: &str) -> std::io::Result<()> {
    let tmp = path.with_extension(format!("marklyra-{}.tmp", crate::new_id()));
    std::fs::write(&tmp, text)?;
    if let Ok(meta) = std::fs::metadata(path) {
        let _ = std::fs::set_permissions(&tmp, meta.permissions());
    }
    std::fs::rename(&tmp, path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })
}

fn import(
    store: &mut TaskStore,
    root: &Path,
    sub: &str,
    args: &Args,
    out: &mut dyn Write,
) -> Result<(), CliError> {
    use crate::import::{self as im, checklist, csv, github, octarine};
    let invalid = |message: String| CliError { code: 5, message };
    let mut notes = Vec::new();
    let source = match sub {
        "list" => {
            let receipts = im::receipts(store).map_err(invalid)?;
            return emit(out, args, json!(receipts), |o| {
                let mut rows = vec![vec![
                    "ID".into(),
                    "TIME".into(),
                    "SOURCE".into(),
                    "TASKS".into(),
                    "STATE".into(),
                ]];
                rows.extend(receipts.iter().map(|r| {
                    vec![
                        r["id"].as_str().unwrap_or("").to_owned(),
                        r["at"].as_str().unwrap_or("").chars().take(16).collect(),
                        format!(
                            "{} {}",
                            r["kind"].as_str().unwrap_or(""),
                            r["label"].as_str().unwrap_or("")
                        ),
                        r["tasks"].as_array().map_or(0, Vec::len).to_string(),
                        if r["undone"] == true { "已撤销" } else { "" }.to_owned(),
                    ]
                }));
                table(o, &rows)
            });
        }
        "undo" => {
            let id = args.arg(0, "导入记录 ID")?;
            let archived = im::undo(store, id).map_err(|m| CliError {
                code: if m.contains("找不到") { 3 } else { 5 },
                message: m,
            })?;
            return emit(out, args, json!({"archived": archived}), |o| {
                writeln!(o, "已撤销导入，归档 {archived} 个任务")
            });
        }
        "github" | "csv" => {
            let (bytes, label) = read_file(args.arg(0, "导出文件")?)?;
            let parsed = if sub == "github" {
                github::parse(&bytes, &label)
            } else {
                csv::parse(&bytes, &label)
            };
            parsed.map_err(invalid)?
        }
        "octarine" => {
            let path = PathBuf::from(args.arg(0, "Octarine 目录")?);
            let tasks = octarine::locate(&path).ok_or_else(|| CliError {
                code: 3,
                message: format!("{} 下没有 .octarine/tasks", path.display()),
            })?;
            let label = path
                .canonicalize()
                .ok()
                .and_then(|p| p.file_name().map(|n| n.to_string_lossy().into_owned()))
                .unwrap_or_default();
            octarine::parse(&octarine::read(&tasks), &label)
        }
        "notes" => {
            let root = root.canonicalize().map_err(io)?;
            let target = match args.positional.first() {
                Some(p) => PathBuf::from(p).canonicalize().map_err(|e| CliError {
                    code: 3,
                    message: format!("无法读取 {p}：{e}"),
                })?,
                None => root.clone(),
            };
            notes = checklist::collect(&root, &target).map_err(invalid)?;
            let label = target
                .strip_prefix(&root)
                .ok()
                .map(|p| p.to_string_lossy().into_owned())
                .filter(|p| !p.is_empty())
                .unwrap_or_else(|| "整个工作区".into());
            checklist::parse(&notes, &label)
        }
        other => return usage(format!("未知命令：import {other}")),
    };
    let options = im::Options {
        project: args.flag("project").map(String::from),
        create_labels: args.has("create-labels"),
        include_closed: if args.has("skip-closed") {
            false
        } else {
            args.has("include-closed") || source.include_closed_default
        },
    };
    let preview = im::preview(store, &source, &options).map_err(invalid)?;
    if args.has("dry-run") || preview.new == 0 {
        let data = serde_json::to_value(&preview).unwrap_or_default();
        return emit(out, args, json!({"preview": data}), |o| {
            for w in &preview.warnings {
                writeln!(o, "注意：{w}")?;
            }
            let mut rows = vec![vec![
                "".into(),
                "TITLE".into(),
                "STATUS".into(),
                "PROJECT".into(),
                "NOTE".into(),
            ]];
            rows.extend(preview.rows.iter().map(|r| {
                vec![
                    match r.outcome.as_str() {
                        "new" => "+",
                        "skip" => "=",
                        _ => "!",
                    }
                    .into(),
                    r.title.clone(),
                    r.status.clone(),
                    r.project.clone(),
                    r.reason.clone().unwrap_or_else(|| {
                        if r.unknown_labels.is_empty() {
                            String::new()
                        } else {
                            format!("未知标签：{}", r.unknown_labels.join("、"))
                        }
                    }),
                ]
            }));
            table(o, &rows)?;
            writeln!(
                o,
                "新建 {}，跳过 {}，需要处理 {}{}",
                preview.new,
                preview.skip,
                preview.problem,
                if preview.unknown_labels.is_empty() {
                    String::new()
                } else {
                    "；未知标签不会添加，加 --create-labels 新建".into()
                }
            )
        });
    }
    let applied = im::apply(store, &source, &options).map_err(invalid)?;
    // Checklist lines become links only where the note still reads as it was previewed.
    let mut linked = 0;
    let mut changed_notes = Vec::new();
    let mut by_note: std::collections::BTreeMap<&str, Vec<im::NoteLink>> = Default::default();
    for link in &applied.note_links {
        by_note
            .entry(link.path.as_str())
            .or_default()
            .push(link.clone());
    }
    for (path, links) in by_note {
        let Some((_, read)) = notes.iter().find(|(p, _)| p == path) else {
            continue;
        };
        let file = root.join(path);
        let current = std::fs::read_to_string(&file).unwrap_or_default();
        match checklist::rewrite(&current, &links).filter(|_| &current == read) {
            Some(text) if replace_note(&file, &text).is_ok() => linked += links.len(),
            _ => changed_notes.push(path.to_owned()),
        }
    }
    let receipt = applied.receipt.clone();
    emit(
        out,
        args,
        json!({"created": applied.created, "receipt": receipt, "linked": linked, "unlinkedNotes": changed_notes}),
        |o| {
            writeln!(
                o,
                "已导入 {} 个任务（跳过 {}）。撤销：marklyra import undo {}",
                applied.created,
                preview.skip,
                receipt["id"].as_str().unwrap_or("")
            )?;
            if !changed_notes.is_empty() {
                writeln!(
                    o,
                    "这些笔记在导入期间有改动，清单项未改为链接：{}",
                    changed_notes.join("、")
                )?;
            }
            Ok(())
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_flags_switches_repeats_and_inline_values() {
        let a = Args::parse(
            [
                "task",
                "create",
                "写周报",
                "--label",
                "a",
                "--label=b",
                "--priority=high",
                "--json",
                "--",
                "--literal",
            ]
            .into_iter()
            .map(String::from)
            .collect(),
        )
        .unwrap();
        assert_eq!(a.positional, ["task", "create", "写周报", "--literal"]);
        assert_eq!(a.repeated["label"], ["a", "b"]);
        assert_eq!(a.flag("priority"), Some("high"));
        assert!(a.has("json"));
        assert_eq!(
            Args::parse(vec!["--project".into()]).err().map(|e| e.code),
            Some(2)
        );
    }
    #[test]
    fn wide_characters_take_two_columns() {
        assert_eq!(width("WEB-1"), 5);
        assert_eq!(width("写周报"), 6);
    }
}
