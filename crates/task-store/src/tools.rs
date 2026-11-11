//! Task tools shared by the in-app AI, the `marklyra` command line and its MCP server:
//! agent-facing names, keys and references become store ids, writes are validated into a plan
//! (with a readable preview) before anything is applied, and applied writes return undo receipts.
use crate::{Mutation, Snapshot, Task, TaskStore, PRIORITIES};
use serde_json::{json, Map, Value};
use std::collections::HashMap;

const WRITES: [&str; 6] = [
    "task_create",
    "task_propose",
    "task_update",
    "task_comment",
    "task_archive",
    "task_restore",
];
pub fn is_task_tool(name: &str) -> bool {
    name.starts_with("task_")
}
pub fn is_write(name: &str) -> bool {
    WRITES.contains(&name)
}

fn fields_schema() -> Value {
    let refs = json!({"type":"array","items":{"type":"string"}});
    json!({
        "title":{"type":"string"},
        "project":{"type":["string","null"],"description":"Project id, key (WEB) or name; null for none."},
        "status":{"type":"string","description":"Status id or name."},
        "priority":{"type":["string","integer"],"description":"urgent|high|medium|low|none or 0–4."},
        "type":{"type":["string","null"]},
        "labels":{"type":"array","items":{"type":"string"},"description":"Label ids or names; replaces the list."},
        "bucket":{"type":["string","null"]},
        "cycle":{"type":["string","integer","null"],"description":"current, next, a cycle number, or null."},
        "due":{"type":["string","null"],"description":"YYYY-MM-DD or null."},
        "parent":{"type":["string","null"],"description":"Task reference (WEB-12) or null."},
        "blockedBy":refs,
        "related":refs
    })
}
/// Tool definitions; `include_writes` false lists only the read tools.
pub fn schemas(include_writes: bool) -> Vec<Value> {
    all_schemas()
        .into_iter()
        .filter(|t| include_writes || !is_write(t["name"].as_str().unwrap_or("")))
        .collect()
}
fn all_schemas() -> Vec<Value> {
    let tool = |name: &str, description: &str, properties: Value, required: Vec<&str>| json!({"name":name,"description":description,"inputSchema":{"type":"object","properties":properties,"required":required,"additionalProperties":false}});
    let mut create = fields_schema();
    create["description"] = json!({"type":"string","description":"Markdown description."});
    create["subtasks"] = json!({"type":"array","items":{"type":"string"}});
    create["template"] =
        json!({"type":"string","description":"Template id or name; explicit fields win."});
    let update = json!({
        "id":{"type":"string","description":"WEB-12, an old id, or the internal id."},
        "revision":{"type":"string","description":"From task_get or task_query; stale revisions are rejected."},
        "set":{"type":"object","properties":fields_schema(),"additionalProperties":false},
        "description":{"type":"string","description":"Replaces the whole Markdown description."}
    });
    vec![
        tool("task_query", "Find tasks with the MarkLyra query language, e.g. `is:open project:WEB priority:urgent,high due:<7d label:Bug text`. Keys: status, priority, label, type, bucket, cycle (current|next|previous|N|none), project, is (open|closed|overdue|blocked|parent|subtask|archived), has, due (today|week|overdue|<7d|none), created, completed; prefix - to exclude. Returns revisions for later updates.", json!({"query":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":200},"offset":{"type":"integer","minimum":0}}), vec![]),
        tool("task_get", "Read one task with its description, recent comments and activity.", json!({"id":{"type":"string"}}), vec!["id"]),
        tool("task_catalog", "Projects, statuses (with categories), labels, types, buckets, cycles and templates: the values task fields accept.", json!({}), vec![]),
        tool("task_create", "Create one task after the person approves it.", create.clone(), vec!["title"]),
        tool("task_propose", "Propose several creations and updates at once (at most 50). The person ticks which ones to apply; the result lists each item's outcome.", json!({"items":{"type":"array","maxItems":50,"items":{"type":"object","properties":{"create":{"type":"object","properties":create,"required":["title"],"additionalProperties":false},"update":{"type":"object","properties":update.clone(),"required":["id","revision"],"additionalProperties":false}},"additionalProperties":false}}}), vec!["items"]),
        tool("task_update", "Change fields or the description of one task after approval. Requires the revision you read.", update, vec!["id","revision"]),
        tool("task_comment", "Add a comment to a task after approval.", json!({"id":{"type":"string"},"body":{"type":"string"}}), vec!["id","body"]),
        tool("task_archive", "Archive a task after approval (tasks are never deleted).", json!({"id":{"type":"string"},"revision":{"type":"string"}}), vec!["id","revision"]),
        tool("task_restore", "Restore an archived task after approval.", json!({"id":{"type":"string"},"revision":{"type":"string"}}), vec!["id","revision"]),
    ]
}

/// Names for ids in one snapshot.
struct Names<'a> {
    snap: &'a Snapshot,
}
impl<'a> Names<'a> {
    fn key(&self, project: Option<&str>) -> String {
        project
            .and_then(|p| self.snap.projects.iter().find(|x| x.id == p))
            .map_or_else(
                || self.snap.settings.unassigned_key.clone(),
                |p| p.key.clone(),
            )
    }
    fn reference(&self, task: &Task) -> String {
        format!("{}-{}", self.key(task.project.as_deref()), task.number)
    }
    fn task_ref(&self, id: &str) -> Option<String> {
        self.snap
            .tasks
            .iter()
            .find(|t| t.id == id)
            .map(|t| self.reference(t))
    }
    fn status(&self, id: &str) -> String {
        self.snap
            .statuses
            .iter()
            .find(|s| s.id == id)
            .map_or_else(|| id.to_owned(), |s| s.name.clone())
    }
    fn dict(list: &[crate::Dictionary], id: &str) -> String {
        list.iter()
            .find(|d| d.id == id)
            .map_or_else(|| id.to_owned(), |d| d.name.clone())
    }
    fn label(&self, id: &str) -> String {
        Self::dict(&self.snap.labels, id)
    }
    fn kind(&self, id: &str) -> String {
        Self::dict(&self.snap.types, id)
    }
    fn bucket(&self, id: &str) -> String {
        Self::dict(&self.snap.buckets, id)
    }
    fn project(&self, id: Option<&str>) -> String {
        id.and_then(|p| self.snap.projects.iter().find(|x| x.id == p))
            .map_or_else(|| "无项目".into(), |p| p.name.clone())
    }
    /// The compact view an agent reads.
    fn task(&self, t: &Task) -> Value {
        let status = self.snap.statuses.iter().find(|s| s.id == t.status);
        json!({
            "id": t.id,
            "ref": self.reference(t),
            "title": t.title,
            "project": t.project.as_deref().map(|p| self.key(Some(p))),
            "status": t.status,
            "statusName": self.status(&t.status),
            "category": status.map(|s| s.category),
            "priority": PRIORITIES[t.priority.min(4) as usize],
            "type": t.kind.as_deref().map(|k| self.kind(k)),
            "labels": t.labels.iter().map(|l| self.label(l)).collect::<Vec<_>>(),
            "bucket": t.bucket.as_deref().map(|b| self.bucket(b)),
            "cycle": t.cycle,
            "due": t.due,
            "parent": t.parent.as_deref().and_then(|p| self.task_ref(p)),
            "blockedBy": t.blocked_by.iter().filter_map(|b| self.task_ref(b)).collect::<Vec<_>>(),
            "related": t.related.iter().filter_map(|b| self.task_ref(b)).collect::<Vec<_>>(),
            "archived": t.archived,
            "hasDescription": t.has_description,
            "comments": t.comments,
            "updated": t.updated,
            "revision": t.revision,
        })
    }
}

/// Read tools: no writes, no approval. `today` is the caller's local date, `now` epoch seconds.
pub fn read(
    store: &TaskStore,
    name: &str,
    args: &Value,
    today: &str,
    now: i64,
) -> Result<Value, String> {
    {
        let snap = store.snapshot();
        let names = Names { snap: &snap };
        let value = match name {
            "task_query" => {
                let query = args["query"].as_str().unwrap_or("");
                if query.chars().count() > 2000 {
                    return Err("查询过长".into());
                }
                let found = store.query(query, today, now).map_err(|e| e.to_string())?;
                let offset = args["offset"].as_u64().unwrap_or(0) as usize;
                let limit = args["limit"].as_u64().unwrap_or(50).clamp(1, 200) as usize;
                json!({
                    "total": found.len(),
                    "truncated": found.len() > offset + limit,
                    "items": found.iter().skip(offset).take(limit).map(|t| names.task(t)).collect::<Vec<_>>(),
                })
            }
            "task_get" => {
                let task = store
                    .resolve(args["id"].as_str().unwrap_or(""))
                    .ok_or("找不到这个任务")?;
                let detail = store.detail(&task.id).map_err(|e| e.to_string())?;
                let mut value = names.task(&task);
                value["description"] = json!(detail.body.chars().take(20_000).collect::<String>());
                let tail = |list: &[Value]| list[list.len().saturating_sub(50)..].to_vec();
                value["comments"] = json!(tail(
                    &detail
                        .comments
                        .iter()
                        .map(|c| json!({"at": c.created, "body": c.body}))
                        .collect::<Vec<_>>()
                ));
                value["activity"] = json!(tail(&detail.activity));
                value["subtasks"] = json!(snap
                    .tasks
                    .iter()
                    .filter(|t| t.parent.as_deref() == Some(task.id.as_str()) && !t.archived)
                    .map(|t| names.reference(t))
                    .collect::<Vec<_>>());
                value
            }
            "task_catalog" => json!({
                "projects": snap.projects.iter().map(|p| json!({"id":p.id,"key":p.key,"name":p.name,"state":p.state})).collect::<Vec<_>>(),
                "statuses": snap.statuses.iter().map(|s| json!({"id":s.id,"name":s.name,"category":s.category})).collect::<Vec<_>>(),
                "labels": snap.labels.iter().map(|d| json!({"id":d.id,"name":d.name})).collect::<Vec<_>>(),
                "types": snap.types.iter().map(|d| json!({"id":d.id,"name":d.name})).collect::<Vec<_>>(),
                "buckets": snap.buckets.iter().map(|d| json!({"id":d.id,"name":d.name})).collect::<Vec<_>>(),
                "cycles": if snap.settings.cycles_enabled { json!(snap.cycles.iter().filter(|c| c.state != "completed").map(|c| json!({"number":c.number,"state":c.state,"start":c.start,"end":c.end})).collect::<Vec<_>>()) } else { json!([]) },
                "templates": snap.templates.iter().map(|t| json!({"id":t.id,"name":t.name})).collect::<Vec<_>>(),
            }),
            _ => return Err("不支持的任务工具".into()),
        };
        Ok(value)
    }
}

/// One approved-or-not unit of a proposal.
#[derive(Clone, Debug)]
pub struct Item {
    /// What the approval card shows.
    preview: Value,
    action: Action,
}
#[derive(Clone, Debug)]
enum Action {
    Create(Map<String, Value>),
    Update {
        id: String,
        revision: String,
        set: Map<String, Value>,
        description: Option<String>,
    },
    Comment {
        id: String,
        body: String,
    },
}
pub struct Plan {
    pub items: Vec<Item>,
}
impl Plan {
    pub fn preview(&self) -> Value {
        json!(self
            .items
            .iter()
            .map(|i| i.preview.clone())
            .collect::<Vec<_>>())
    }
}

fn lookup<'a>(list: &'a [crate::Dictionary], value: &str, what: &str) -> Result<&'a str, String> {
    let lower = value.trim().to_lowercase();
    list.iter()
        .find(|d| d.id == value || d.name.to_lowercase() == lower)
        .map(|d| d.id.as_str())
        .ok_or_else(|| format!("未知{what}「{value}」，可用值见 task_catalog"))
}

/// Agent-facing values (names, keys, references) → store ids, plus the card's change rows.
fn normalize(
    store: &TaskStore,
    snap: &Snapshot,
    input: &Map<String, Value>,
    before: Option<&Task>,
) -> Result<(Map<String, Value>, Vec<Value>), String> {
    let names = Names { snap };
    let mut set = Map::new();
    let mut rows = Vec::new();
    let mut row = |label: &str, from: Option<String>, to: String| {
        rows.push(json!({"field": label, "from": from, "to": to}));
    };
    for (key, value) in input {
        match key.as_str() {
            "title" => {
                let t = value
                    .as_str()
                    .map(str::trim)
                    .filter(|t| !t.is_empty())
                    .ok_or("标题不能为空")?;
                row("标题", before.map(|b| b.title.clone()), t.to_owned());
                set.insert("title".into(), json!(t));
            }
            "project" => {
                let id = match value.as_str() {
                    None => None,
                    Some(v) => {
                        let lower = v.to_lowercase();
                        Some(
                            snap.projects
                                .iter()
                                .find(|p| {
                                    p.id == v
                                        || p.key.eq_ignore_ascii_case(v)
                                        || p.name.to_lowercase() == lower
                                })
                                .map(|p| p.id.clone())
                                .ok_or_else(|| format!("未知项目「{v}」"))?,
                        )
                    }
                };
                row(
                    "项目",
                    before.map(|b| names.project(b.project.as_deref())),
                    names.project(id.as_deref()),
                );
                set.insert("project".into(), json!(id));
            }
            "status" => {
                let v = value.as_str().ok_or("状态无效")?;
                let lower = v.to_lowercase();
                let s = snap
                    .statuses
                    .iter()
                    .find(|s| s.id == v || s.name.to_lowercase() == lower)
                    .ok_or_else(|| format!("未知状态「{v}」"))?;
                row(
                    "状态",
                    before.map(|b| names.status(&b.status)),
                    s.name.clone(),
                );
                set.insert("status".into(), json!(s.id));
            }
            "priority" => {
                let p = match value {
                    Value::Number(n) => {
                        n.as_u64().filter(|n| *n <= 4).ok_or("优先级为 0–4")? as usize
                    }
                    Value::String(s) => {
                        let zh = ["无优先级", "紧急", "高", "中", "低"];
                        PRIORITIES
                            .iter()
                            .position(|p| p.eq_ignore_ascii_case(s))
                            .or_else(|| zh.iter().position(|z| z == s))
                            .ok_or_else(|| format!("未知优先级「{s}」"))?
                    }
                    _ => return Err("优先级无效".into()),
                };
                let zh = ["无优先级", "紧急", "高", "中", "低"];
                row(
                    "优先级",
                    before.map(|b| zh[b.priority.min(4) as usize].to_owned()),
                    zh[p].to_owned(),
                );
                set.insert("priority".into(), json!(p));
            }
            "type" | "bucket" => {
                let (list, what) = if key == "type" {
                    (&snap.types, "类型")
                } else {
                    (&snap.buckets, "队列")
                };
                let id = value.as_str().map(|v| lookup(list, v, what)).transpose()?;
                let shown = |id: Option<&str>| {
                    id.map_or_else(|| format!("无{what}"), |i| Names::dict(list, i))
                };
                let old = before.map(|b| {
                    shown(if key == "type" {
                        b.kind.as_deref()
                    } else {
                        b.bucket.as_deref()
                    })
                });
                row(what, old, shown(id));
                set.insert(key.clone(), json!(id));
            }
            "labels" => {
                let ids = value
                    .as_array()
                    .ok_or("标签应为列表")?
                    .iter()
                    .map(|v| {
                        lookup(&snap.labels, v.as_str().unwrap_or(""), "标签").map(String::from)
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                let show = |l: &[String]| {
                    if l.is_empty() {
                        "无".into()
                    } else {
                        l.iter()
                            .map(|x| names.label(x))
                            .collect::<Vec<_>>()
                            .join("、")
                    }
                };
                row("标签", before.map(|b| show(&b.labels)), show(&ids));
                set.insert("labels".into(), json!(ids));
            }
            "cycle" => {
                let number = match value {
                    Value::Null => None,
                    Value::Number(n) => Some(n.as_u64().ok_or("迭代编号无效")? as u32),
                    Value::String(s) => {
                        let state = match s.as_str() {
                            "current" | "当前" => Some("active"),
                            "next" | "upcoming" | "下一个" => Some("upcoming"),
                            _ => None,
                        };
                        Some(match state {
                            Some(state) => snap
                                .cycles
                                .iter()
                                .find(|c| c.state == state)
                                .map(|c| c.number)
                                .ok_or("迭代未开启或不存在")?,
                            None => s
                                .trim_start_matches('#')
                                .parse::<u32>()
                                .map_err(|_| format!("未知迭代「{s}」"))?,
                        })
                    }
                    _ => return Err("迭代无效".into()),
                };
                let show =
                    |n: Option<u32>| n.map_or_else(|| "无迭代".into(), |n| format!("迭代 {n}"));
                row("迭代", before.map(|b| show(b.cycle)), show(number));
                set.insert("cycle".into(), json!(number));
            }
            "due" => {
                let d = value.as_str();
                row(
                    "到期",
                    before.map(|b| b.due.clone().unwrap_or_else(|| "无".into())),
                    d.unwrap_or("无").to_owned(),
                );
                set.insert("due".into(), json!(d));
            }
            "parent" => {
                let id = match value.as_str() {
                    None => None,
                    Some(r) => Some(
                        store
                            .resolve(r)
                            .ok_or_else(|| format!("找不到父任务「{r}」"))?
                            .id,
                    ),
                };
                let show = |p: Option<&str>| {
                    p.and_then(|p| names.task_ref(p))
                        .unwrap_or_else(|| "无".into())
                };
                row(
                    "父任务",
                    before.map(|b| show(b.parent.as_deref())),
                    show(id.as_deref()),
                );
                set.insert("parent".into(), json!(id));
            }
            "blockedBy" | "related" => {
                let ids = value
                    .as_array()
                    .ok_or("关系应为任务列表")?
                    .iter()
                    .map(|v| {
                        let r = v.as_str().unwrap_or("");
                        store
                            .resolve(r)
                            .map(|t| t.id)
                            .ok_or_else(|| format!("找不到任务「{r}」"))
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                let show = |l: &[String]| {
                    if l.is_empty() {
                        "无".into()
                    } else {
                        l.iter()
                            .filter_map(|x| names.task_ref(x))
                            .collect::<Vec<_>>()
                            .join("、")
                    }
                };
                let label = if key == "blockedBy" {
                    "被阻塞于"
                } else {
                    "相关"
                };
                let old = before.map(|b| {
                    show(if key == "blockedBy" {
                        &b.blocked_by
                    } else {
                        &b.related
                    })
                });
                row(label, old, show(&ids));
                set.insert(key.clone(), json!(ids));
            }
            other => return Err(format!("不支持的字段 {other}")),
        }
    }
    Ok((set, rows))
}

fn template_defaults(snap: &Snapshot, input: &mut Map<String, Value>) -> Result<(), String> {
    let Some(name) = input.remove("template") else {
        return Ok(());
    };
    let name = name.as_str().unwrap_or("");
    let t = snap
        .templates
        .iter()
        .find(|t| t.id == name || t.name == name)
        .ok_or_else(|| format!("未知模板「{name}」"))?;
    if !t.title.is_empty() {
        // A template title is a prefix for the agent's title.
        if let Some(Value::String(title)) = input.get("title").cloned() {
            if !title.starts_with(&t.title) {
                input.insert("title".into(), json!(format!("{} {}", t.title, title)));
            }
        }
    }
    let mut fill = |key: &str, value: Value| {
        if !input.contains_key(key) && !value.is_null() {
            input.insert(key.into(), value);
        }
    };
    fill("status", json!(t.status));
    if t.priority > 0 {
        fill("priority", json!(t.priority));
    }
    fill("type", json!(t.kind));
    if !t.labels.is_empty() {
        fill("labels", json!(t.labels));
    }
    fill("bucket", json!(t.bucket));
    if !t.description.is_empty() {
        fill("description", json!(t.description));
    }
    if !t.subtasks.is_empty() {
        fill("subtasks", json!(t.subtasks));
    }
    Ok(())
}

fn create_item(store: &TaskStore, snap: &Snapshot, input: &Value) -> Result<Item, String> {
    let mut input = input.as_object().cloned().ok_or("创建项应为对象")?;
    template_defaults(snap, &mut input)?;
    let description = input.remove("description");
    let subtasks = input.remove("subtasks");
    let (mut draft, rows) = normalize(store, snap, &input, None)?;
    let title = draft
        .get("title")
        .and_then(Value::as_str)
        .ok_or("标题不能为空")?
        .to_owned();
    let names = Names { snap };
    let project = draft
        .get("project")
        .and_then(Value::as_str)
        .map(String::from);
    // Same title in the same project: shown unticked so it is not created twice by accident.
    let duplicate = snap
        .tasks
        .iter()
        .find(|t| !t.archived && t.title == title && t.project == project)
        .map(|t| names.reference(t));
    if let Some(d) = description
        .clone()
        .filter(|d| d.as_str().is_some_and(|d| !d.is_empty()))
    {
        draft.insert("description".into(), d);
    }
    let subtasks: Vec<String> = subtasks
        .and_then(|s| s.as_array().cloned())
        .unwrap_or_default()
        .iter()
        .filter_map(|s| {
            s.as_str()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
        })
        .collect();
    if subtasks.len() > 50 {
        return Err("子任务最多 50 个".into());
    }
    if !subtasks.is_empty() {
        draft.insert("subtasks".into(), json!(subtasks));
    }
    Ok(Item {
        preview: json!({
            "op": "create",
            "title": title,
            "project": names.project(project.as_deref()),
            "changes": rows.into_iter().filter(|r| r["field"] != "标题").collect::<Vec<_>>(),
            "description": description.and_then(|d| d.as_str().map(|d| d.chars().take(600).collect::<String>())),
            "subtasks": subtasks,
            "duplicate": duplicate,
        }),
        action: Action::Create(draft),
    })
}

fn update_item(store: &TaskStore, snap: &Snapshot, input: &Value) -> Result<Item, String> {
    let reference = input["id"].as_str().ok_or("缺少任务")?;
    let task = store
        .resolve(reference)
        .ok_or_else(|| format!("找不到任务「{reference}」"))?;
    let revision = input["revision"]
        .as_str()
        .ok_or("缺少 revision，请先 task_get")?
        .to_owned();
    if revision != task.revision {
        return Err(format!(
            "{reference} 已在别处修改，请重新 task_get 后再提出修改"
        ));
    }
    let empty = Map::new();
    let set_input = input
        .get("set")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    let (set, mut rows) = normalize(store, snap, set_input, Some(&task))?;
    let description = input["description"].as_str().map(String::from);
    if let Some(d) = &description {
        rows.push(json!({"field":"描述","from":null,"to":d.chars().take(600).collect::<String>()}));
    }
    if rows.is_empty() {
        return Err(format!("{reference} 没有要修改的内容"));
    }
    let names = Names { snap };
    Ok(Item {
        preview: json!({"op":"update","ref":names.reference(&task),"title":task.title,"changes":rows}),
        action: Action::Update {
            id: task.id,
            revision,
            set,
            description,
        },
    })
}

/// Validates a write and builds its preview. Nothing is written.
pub fn plan(store: &TaskStore, name: &str, args: &Value) -> Result<Plan, String> {
    {
        let snap = store.snapshot();
        let names = Names { snap: &snap };
        let items = match name {
            "task_create" => vec![create_item(store, &snap, args)?],
            "task_update" => vec![update_item(store, &snap, args)?],
            "task_propose" => {
                let list = args["items"].as_array().ok_or("缺少提案列表")?;
                if list.is_empty() || list.len() > 50 {
                    return Err("一次提案 1–50 项".into());
                }
                list.iter()
                    .enumerate()
                    .map(|(i, item)| {
                        if let Some(c) = item.get("create") {
                            create_item(store, &snap, c)
                        } else if let Some(u) = item.get("update") {
                            update_item(store, &snap, u)
                        } else {
                            Err("每项应为 create 或 update".into())
                        }
                        .map_err(|e| format!("第 {} 项：{e}", i + 1))
                    })
                    .collect::<Result<Vec<_>, _>>()?
            }
            "task_comment" => {
                let r = args["id"].as_str().unwrap_or("");
                let task = store
                    .resolve(r)
                    .ok_or_else(|| format!("找不到任务「{r}」"))?;
                let body = args["body"]
                    .as_str()
                    .map(str::trim)
                    .filter(|b| !b.is_empty())
                    .ok_or("评论不能为空")?;
                vec![Item {
                    preview: json!({"op":"comment","ref":names.reference(&task),"title":task.title,"changes":[{"field":"评论","from":null,"to":body.chars().take(600).collect::<String>()}]}),
                    action: Action::Comment {
                        id: task.id,
                        body: body.to_owned(),
                    },
                }]
            }
            "task_archive" | "task_restore" => {
                let archive = name == "task_archive";
                let r = args["id"].as_str().unwrap_or("");
                let task = store
                    .resolve(r)
                    .ok_or_else(|| format!("找不到任务「{r}」"))?;
                if args["revision"].as_str() != Some(task.revision.as_str()) {
                    return Err(format!("{r} 已在别处修改，请重新 task_get"));
                }
                let mut set = Map::new();
                set.insert("archived".into(), json!(archive));
                vec![Item {
                    preview: json!({"op": if archive {"archive"} else {"restore"},"ref":names.reference(&task),"title":task.title,"changes":[]}),
                    action: Action::Update {
                        id: task.id,
                        revision: task.revision,
                        set,
                        description: None,
                    },
                }]
            }
            _ => return Err("不支持的任务工具".into()),
        };
        Ok(Plan { items })
    }
}

fn mutation(value: Value) -> Result<Mutation, String> {
    serde_json::from_value(value).map_err(|e| format!("内部请求无效：{e}"))
}

/// Applies the ticked items. Each returns its outcome; an undo receipt records what to put back.
/// Applies the selected items on behalf of `actor`. Returns the per-item outcome, undo
/// receipts, and whether anything was written.
pub fn execute(
    store: &mut TaskStore,
    plan: &Plan,
    selected: &[usize],
    actor: &str,
) -> Result<(Value, Vec<Value>, bool), String> {
    {
        let mut outcomes = Vec::new();
        let mut receipts = Vec::new();
        let mut wrote = false;
        for (index, item) in plan.items.iter().enumerate() {
            if !selected.contains(&index) {
                outcomes.push(json!({"index":index,"applied":false,"reason":"未被选中"}));
                continue;
            }
            let result: Result<Value, String> = (|| match &item.action {
                Action::Create(draft) => {
                    let r = store
                        .apply_as(mutation(json!({"kind":"createTask","draft":draft}))?, actor)
                        .map_err(|e| e.to_string())?;
                    let id = r.applied.first().cloned().ok_or("创建失败")?;
                    receipts.push(json!({"kind":"created","ids":r.created}));
                    let task = store.resolve(&id).ok_or("创建失败")?;
                    let snap = store.snapshot();
                    Ok(json!({"id":id,"ref":Names { snap: &snap }.reference(&task)}))
                }
                Action::Update {
                    id,
                    revision,
                    set,
                    description,
                } => {
                    let task = store.resolve(id).ok_or("任务已不存在")?;
                    if &task.revision != revision {
                        return Err("任务已在别处修改，请重新 task_get".into());
                    }
                    // Field values before the change, as the workbench's undo writes them back.
                    let before = serde_json::to_value(&task).map_err(|e| e.to_string())?;
                    let mut previous = Map::new();
                    for key in set.keys() {
                        let source = if key == "type" { "type" } else { key.as_str() };
                        previous.insert(
                            key.clone(),
                            before.get(source).cloned().unwrap_or(Value::Null),
                        );
                    }
                    let old_body = if description.is_some() {
                        Some(store.detail(id).map_err(|e| e.to_string())?.body)
                    } else {
                        None
                    };
                    let mut current = task.revision.clone();
                    if let Some(body) = description {
                        store
                            .apply_as(mutation(json!({"kind":"setDescription","id":id,"revision":current,"body":body}))?, actor)
                            .map_err(|e| e.to_string())?;
                        current = store.resolve(id).ok_or("任务已不存在")?.revision;
                    }
                    if !set.is_empty() {
                        let r = store
                            .apply_as(mutation(json!({"kind":"patch","ids":[id],"revisions":[current],"set":set}))?, actor)
                            .map_err(|e| e.to_string())?;
                        if !r.conflicts.is_empty() {
                            return Err("任务已在别处修改".into());
                        }
                    }
                    let after = store.resolve(id).ok_or("任务已不存在")?;
                    receipts.push(json!({"kind":"updated","id":id,"before":previous,"description":old_body,"revision":after.revision}));
                    Ok(json!({"id":id,"revision":after.revision}))
                }
                Action::Comment { id, body } => {
                    store
                        .apply_as(
                            mutation(json!({"kind":"comment","id":id,"body":body}))?,
                            actor,
                        )
                        .map_err(|e| e.to_string())?;
                    Ok(json!({"id":id}))
                }
            })();
            match result {
                Ok(value) => {
                    wrote = true;
                    outcomes.push(json!({"index":index,"applied":true,"result":value}));
                }
                Err(error) => outcomes.push(json!({"index":index,"applied":false,"reason":error})),
            }
        }
        Ok((json!({"items":outcomes}), receipts, wrote))
    }
}

/// Indices the person ticked; a plain approval of a single item counts as ticking it.
pub fn selection(decision: &Value, count: usize) -> Vec<usize> {
    match decision["selected"].as_array() {
        Some(list) => {
            let mut seen = HashMap::new();
            list.iter()
                .filter_map(Value::as_u64)
                .map(|i| i as usize)
                .filter(|i| *i < count && seen.insert(*i, ()).is_none())
                .collect()
        }
        None => (0..count).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cap_std::{ambient_authority, fs::Dir};

    fn store() -> (tempfile::TempDir, TaskStore) {
        let dir = tempfile::tempdir().unwrap();
        let store =
            TaskStore::initialize(Dir::open_ambient_dir(dir.path(), ambient_authority()).unwrap())
                .unwrap();
        (dir, store)
    }
    fn run(s: &mut TaskStore, value: Value) -> crate::MutationResult {
        s.apply(serde_json::from_value(value).unwrap()).unwrap()
    }

    #[test]
    fn names_keys_and_references_become_store_ids_with_readable_change_rows() {
        let (_dir, mut s) = store();
        let p = run(
            &mut s,
            json!({"kind":"createProject","name":"官网","key":"WEB"}),
        )
        .created[0]
            .clone();
        run(
            &mut s,
            json!({"kind":"updateSettings","set":{"cyclesEnabled":true,"today":"2026-11-10"}}),
        );
        let a = run(
            &mut s,
            json!({"kind":"createTask","draft":{"title":"a","project":p}}),
        )
        .applied[0]
            .clone();
        let snap = s.snapshot();
        let input = json!({"project":"web","status":"进行中","priority":"高","type":"缺陷","labels":["bug"],"cycle":"current","blockedBy":["WEB-1"],"due":"2026-12-01"});
        let (set, rows) = normalize(&s, &snap, input.as_object().unwrap(), None).unwrap();
        assert_eq!(set["project"], json!(p));
        assert_eq!(set["status"], "in-progress");
        assert_eq!(set["priority"], 2);
        assert_eq!(set["type"], "bug");
        assert_eq!(set["cycle"], 1);
        assert_eq!(set["blockedBy"], json!([a]));
        assert!(rows
            .iter()
            .any(|r| r["field"] == "状态" && r["to"] == "进行中"));
        // "#2" style cycle numbers do not drop other fields.
        let (set, _) = normalize(
            &s,
            &snap,
            json!({"cycle":"#2","title":"t"}).as_object().unwrap(),
            None,
        )
        .unwrap();
        assert_eq!(
            (set["cycle"].clone(), set["title"].clone()),
            (json!(2), json!("t"))
        );
        for bad in [
            json!({"status":"nope"}),
            json!({"labels":["nope"]}),
            json!({"project":"NOPE"}),
            json!({"priority":9}),
            json!({"color":"x"}),
        ] {
            assert!(
                normalize(&s, &snap, bad.as_object().unwrap(), None).is_err(),
                "{bad}"
            );
        }
    }

    #[test]
    fn creations_flag_duplicates_and_updates_need_the_current_revision() {
        let (_dir, mut s) = store();
        let p = run(
            &mut s,
            json!({"kind":"createProject","name":"官网","key":"WEB"}),
        )
        .created[0]
            .clone();
        let a = run(
            &mut s,
            json!({"kind":"createTask","draft":{"title":"重做首页","project":p}}),
        )
        .applied[0]
            .clone();
        let snap = s.snapshot();
        let dup = create_item(&s, &snap, &json!({"title":"重做首页","project":"WEB"})).unwrap();
        assert_eq!(dup.preview["duplicate"], "WEB-1");
        let fresh = create_item(
            &s,
            &snap,
            &json!({"title":"新任务","project":"WEB","subtasks":["一"," ","二"]}),
        )
        .unwrap();
        assert!(fresh.preview["duplicate"].is_null());
        assert_eq!(fresh.preview["subtasks"], json!(["一", "二"]));
        let task = s.resolve(&a).unwrap();
        let ok = update_item(
            &s,
            &snap,
            &json!({"id":"WEB-1","revision":task.revision,"set":{"status":"done"}}),
        )
        .unwrap();
        assert_eq!(ok.preview["changes"][0]["from"], "待办");
        assert!(update_item(
            &s,
            &snap,
            &json!({"id":"WEB-1","revision":"stale","set":{"status":"done"}})
        )
        .unwrap_err()
        .contains("已在别处修改"));
        assert!(
            update_item(&s, &snap, &json!({"id":"WEB-1","revision":task.revision})).is_err(),
            "nothing to change"
        );
    }

    #[test]
    fn templates_fill_gaps_and_prefix_the_title() {
        let (_dir, mut s) = store();
        run(
            &mut s,
            json!({"kind":"saveTemplate","set":{"name":"缺陷报告","title":"[缺陷]","priority":2,"subtasks":["复现"]}}),
        );
        let snap = s.snapshot();
        let mut input = json!({"title":"登录白屏","template":"缺陷报告","priority":1})
            .as_object()
            .unwrap()
            .clone();
        template_defaults(&snap, &mut input).unwrap();
        assert_eq!(input["title"], "[缺陷] 登录白屏");
        assert_eq!(input["priority"], 1, "explicit fields win");
        assert_eq!(input["subtasks"], json!(["复现"]));
        let mut unknown = json!({"title":"x","template":"nope"})
            .as_object()
            .unwrap()
            .clone();
        assert!(template_defaults(&snap, &mut unknown).is_err());
    }

    #[test]
    fn selection_defaults_to_everything_and_ignores_bad_indices() {
        assert_eq!(selection(&json!({"approved":true}), 3), [0, 1, 2]);
        assert_eq!(
            selection(&json!({"approved":true,"selected":[2,0,2,9]}), 3),
            [2, 0]
        );
        assert!(selection(&json!({"approved":true,"selected":[]}), 3).is_empty());
    }
}
