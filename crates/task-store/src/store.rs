//! Task files under one capability directory. Files are the only authority; this cache is
//! rebuilt from file stamps and every write checks the revision the caller read.
use crate::{
    frontmatter as fm,
    model::{self, *},
};
mod config;
mod plan;
use cap_std::fs::{Dir, OpenOptions};
pub(crate) use plan::day_number;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use serde_yaml_ng::Mapping;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    io::{ErrorKind, Read, Write},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("[io] 任务数据读写失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("[conflict] 任务已在其他地方被修改，已载入最新内容，请重试")]
    Conflict,
    #[error("[not-found] 找不到{0}")]
    NotFound(&'static str),
    #[error("[invalid] {0}")]
    Invalid(String),
}
pub type Result<T> = std::result::Result<T, StoreError>;
fn invalid<T>(message: impl Into<String>) -> Result<T> {
    Err(StoreError::Invalid(message.into()))
}

const MAX_FILE: u64 = 1024 * 1024;
const MAX_BODY: usize = 512 * 1024;
const MAX_TASKS: usize = 100_000;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidFile {
    pub path: String,
    pub error: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub generation: u64,
    pub initialized: bool,
    pub tasks: Vec<Task>,
    pub projects: Vec<Project>,
    pub statuses: Vec<Status>,
    pub labels: Vec<Dictionary>,
    pub types: Vec<Dictionary>,
    pub buckets: Vec<Dictionary>,
    pub views: Vec<View>,
    pub cycles: Vec<Cycle>,
    pub templates: Vec<Template>,
    pub settings: Settings,
    pub invalid: Vec<InvalidFile>,
    pub truncated: bool,
}
impl Snapshot {
    pub fn empty() -> Self {
        Self {
            generation: 0,
            initialized: false,
            tasks: Vec::new(),
            projects: Vec::new(),
            statuses: builtin_statuses(),
            labels: Vec::new(),
            types: Vec::new(),
            buckets: Vec::new(),
            views: Vec::new(),
            cycles: Vec::new(),
            templates: Vec::new(),
            settings: Settings::default(),
            invalid: Vec::new(),
            truncated: false,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Draft {
    pub title: String,
    pub project: Option<String>,
    pub status: Option<String>,
    pub priority: Option<u8>,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub labels: Vec<String>,
    pub bucket: Option<String>,
    pub cycle: Option<u32>,
    pub due: Option<String>,
    pub parent: Option<String>,
    pub description: Option<String>,
    pub subtasks: Vec<String>,
    /// Imports: the origin, and ids the task had in the tool it came from.
    pub source: Option<String>,
    pub previous_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Mutation {
    CreateTask {
        draft: Draft,
    },
    Patch {
        ids: Vec<String>,
        revisions: Vec<String>,
        set: Map<String, Value>,
    },
    SetDescription {
        id: String,
        revision: String,
        body: String,
    },
    Delete {
        ids: Vec<String>,
        revisions: Vec<String>,
    },
    Comment {
        id: String,
        body: String,
    },
    CreateProject {
        name: String,
        key: String,
        #[serde(default)]
        icon: Option<String>,
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        description: Option<String>,
    },
    UpdateProject {
        id: String,
        revision: String,
        set: Map<String, Value>,
    },
    /// `dictionary` is labels, types, buckets or statuses; no `id` creates a new entry.
    UpsertDictionary {
        dictionary: String,
        #[serde(default)]
        id: Option<String>,
        set: Map<String, Value>,
    },
    DeleteDictionary {
        dictionary: String,
        id: String,
    },
    UpdateSettings {
        set: Map<String, Value>,
    },
    SaveView {
        #[serde(default)]
        id: Option<String>,
        set: Map<String, Value>,
    },
    DeleteView {
        id: String,
    },
    SaveTemplate {
        #[serde(default)]
        id: Option<String>,
        set: Map<String, Value>,
    },
    DeleteTemplate {
        id: String,
    },
    /// `moves` maps unfinished task ids to `next` (default) or `none`.
    CompleteCycle {
        number: u32,
        today: String,
        #[serde(default)]
        moves: Map<String, Value>,
    },
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    pub generation: u64,
    pub applied: Vec<String>,
    pub conflicts: Vec<String>,
    pub created: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detail {
    pub id: String,
    pub body: String,
    pub revision: String,
    pub comments: Vec<Comment>,
    pub activity: Vec<Value>,
}

/// (id, name, color, type labels, type priority) for the default dictionaries.
type Seed = (
    &'static str,
    &'static str,
    &'static str,
    &'static [&'static str],
    &'static str,
);
/// Tasks sharing one (project, number): (created, id) pairs.
type NumberGroups = BTreeMap<(Option<String>, u32), Vec<(String, String)>>;
/// A validated task write: id, frontmatter changes and activity events.
type PendingWrite = (String, Vec<(String, Value)>, Vec<Value>);

struct Cached {
    stamp: String,
    task: std::result::Result<Task, String>,
    /// Lowercased description, for full-text search.
    body: String,
}

pub struct TaskStore {
    dir: Dir,
    generation: u64,
    items: HashMap<String, Cached>,
    projects: Vec<Project>,
    statuses: Vec<Status>,
    labels: Vec<Dictionary>,
    types: Vec<Dictionary>,
    buckets: Vec<Dictionary>,
    views: Vec<View>,
    cycles: Vec<Cycle>,
    templates: Vec<Template>,
    settings: Settings,
    comments: HashMap<String, u32>,
    invalid: Vec<InvalidFile>,
    truncated: bool,
    fingerprint: u64,
    /// Who the current write is for, recorded on its activity (`ai:<agent>`, `cli`).
    actor: Option<String>,
}

// ───────────────────────── 基础工具 ─────────────────────────

pub fn now_iso() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

pub fn new_id() -> String {
    const ALPHABET: &[u8; 32] = b"0123456789abcdefghjkmnpqrstvwxyz";
    let bytes = uuid::Uuid::new_v4().into_bytes();
    let bits = u128::from_be_bytes(bytes);
    (0..20)
        .map(|i| ALPHABET[((bits >> (i * 5)) & 31) as usize] as char)
        .collect()
}

pub fn revision(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    digest[..12].iter().map(|b| format!("{b:02x}")).collect()
}

fn valid_id(id: &str) -> bool {
    (6..=40).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn valid_due(value: &str) -> bool {
    let b = value.as_bytes();
    value.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && value
            .split('-')
            .all(|p| p.bytes().all(|c| c.is_ascii_digit()))
        && (1..=12).contains(&value[5..7].parse::<u8>().unwrap_or(0))
        && (1..=31).contains(&value[8..10].parse::<u8>().unwrap_or(0))
}
pub fn valid_key(key: &str) -> bool {
    (2..=5).contains(&key.len())
        && key.as_bytes()[0].is_ascii_uppercase()
        && key
            .bytes()
            .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit())
}

fn stamp(metadata: &cap_std::fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|m| m.into_std().duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}:{modified}", metadata.len())
}

fn open_sub(dir: &Dir, name: &str) -> Result<Option<Dir>> {
    match dir.symlink_metadata(name) {
        Ok(m) if m.is_dir() && !m.file_type().is_symlink() => Ok(Some(dir.open_dir(name)?)),
        Ok(_) => invalid(format!("{name} 不是普通目录")),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}
fn create_sub(dir: &Dir, name: &str) -> Result<Dir> {
    if let Some(sub) = open_sub(dir, name)? {
        return Ok(sub);
    }
    dir.create_dir(name)?;
    open_sub(dir, name)?.ok_or(StoreError::NotFound("目录"))
}
fn read_text(dir: &Dir, name: &str) -> Result<String> {
    let metadata = dir.symlink_metadata(name)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return invalid("不是普通文件");
    }
    if metadata.len() > MAX_FILE {
        return invalid("文件超过 1 MiB");
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    dir.open(name)?.take(MAX_FILE + 1).read_to_end(&mut bytes)?;
    String::from_utf8(bytes).or_else(|_| invalid("任务文件必须是 UTF-8"))
}
fn read_optional(dir: &Dir, name: &str) -> Result<Option<String>> {
    match read_text(dir, name) {
        Err(StoreError::Io(e)) if e.kind() == ErrorKind::NotFound => Ok(None),
        other => other.map(Some),
    }
}
/// Same-directory temp file, flush, sync, then rename over the target.
fn write_atomic(dir: &Dir, name: &str, text: &str) -> Result<()> {
    let temp = format!(".{name}.{}.tmp", &new_id()[..8]);
    let result = (|| -> Result<()> {
        let mut file = dir.open_with(&temp, OpenOptions::new().write(true).create_new(true))?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        dir.rename(&temp, dir, name)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = dir.remove_file(&temp);
    }
    result
}
fn mapping(text: &str) -> std::result::Result<Mapping, String> {
    let front = fm::front_text(text);
    if front.trim().is_empty() {
        return Ok(Mapping::new());
    }
    serde_yaml_ng::from_str(front).map_err(|e| format!("frontmatter 无法解析：{e}"))
}
fn file_id(name: &str) -> Option<&str> {
    name.strip_suffix(".md").filter(|id| valid_id(id))
}
fn valid_slug(id: &str) -> bool {
    (1..=64).contains(&id.len())
        && !id.starts_with('-')
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}
fn slug_id(name: &str) -> Option<&str> {
    name.strip_suffix(".md").filter(|id| valid_slug(id))
}

fn parse_task(id: &str, text: &str) -> std::result::Result<Task, String> {
    let map = mapping(text)?;
    let body = fm::body(text);
    Ok(Task {
        id: id.into(),
        title: model::text(&map, "title").unwrap_or_else(|| "未命名任务".into()),
        project: model::text(&map, "project"),
        number: model::number(&map, "number").map_or(0, |n| n.max(0.0) as u32),
        status: model::text(&map, "status").unwrap_or_else(|| "todo".into()),
        priority: priority_from(map.get("priority")),
        kind: model::text(&map, "type"),
        labels: model::list(&map, "labels"),
        bucket: model::text(&map, "bucket"),
        cycle: model::number(&map, "cycle").map(|n| n as u32),
        cycle_added: model::text(&map, "cycle_added"),
        parent: model::text(&map, "parent"),
        due: model::text(&map, "due").filter(|d| valid_due(d)),
        created: model::text(&map, "created").unwrap_or_default(),
        updated: model::text(&map, "updated").unwrap_or_default(),
        completed: model::text(&map, "completed"),
        previous_ids: model::list(&map, "previous_ids"),
        archived: model::flag(&map, "archived"),
        order: model::number(&map, "order").unwrap_or(0.0),
        blocked_by: model::list(&map, "blocked_by"),
        related: model::list(&map, "related"),
        source: model::text(&map, "source"),
        has_description: !body.trim().is_empty(),
        comments: 0,
        revision: revision(text),
    })
}
fn parse_project(id: &str, text: &str) -> std::result::Result<Project, String> {
    let map = mapping(text)?;
    let key = model::text(&map, "key").unwrap_or_default();
    if !valid_key(&key) {
        return Err("项目 key 必须是 2–5 位大写字母或数字，以字母开头".into());
    }
    Ok(Project {
        id: id.into(),
        name: model::text(&map, "name").unwrap_or_else(|| key.clone()),
        key,
        previous_keys: model::list(&map, "previous_keys"),
        icon: model::text(&map, "icon").unwrap_or_else(|| "folder".into()),
        color: model::text(&map, "color").unwrap_or_else(|| "violet".into()),
        state: model::text(&map, "state").unwrap_or_else(|| "active".into()),
        order: model::number(&map, "order").unwrap_or(0.0),
        pinned: model::flag(&map, "pinned"),
        description: fm::body(text).to_owned(),
        created: model::text(&map, "created").unwrap_or_default(),
        statuses: limit(&map, "statuses"),
        labels: limit(&map, "labels"),
        buckets: limit(&map, "buckets"),
        views: model::list(&map, "views"),
        default_template: model::text(&map, "default_template"),
        revision: revision(text),
    })
}
/// A project limit: absent (or `all`) means every workspace value is offered.
fn limit(map: &Mapping, key: &str) -> Option<Vec<String>> {
    match map.get(key) {
        None => None,
        Some(serde_yaml_ng::Value::String(s)) if s == "all" => None,
        Some(_) => Some(model::list(map, key)),
    }
}
fn parse_view(id: &str, text: &str) -> std::result::Result<View, String> {
    let map = mapping(text)?;
    Ok(View {
        id: id.into(),
        name: model::text(&map, "name").unwrap_or_else(|| id.into()),
        icon: model::text(&map, "icon").unwrap_or_else(|| "list".into()),
        query: model::text(&map, "query").unwrap_or_default(),
        project: model::text(&map, "project"),
        layout: model::text(&map, "layout")
            .filter(|l| l == "board")
            .unwrap_or_else(|| "list".into()),
        group_by: model::text(&map, "group_by").unwrap_or_else(|| "status".into()),
        order_by: model::text(&map, "order_by").unwrap_or_else(|| "manual".into()),
        order: model::number(&map, "order").unwrap_or(0.0),
        revision: revision(text),
    })
}
fn parse_dictionary(id: &str, text: &str) -> std::result::Result<Dictionary, String> {
    let map = mapping(text)?;
    Ok(Dictionary {
        id: id.into(),
        name: model::text(&map, "name").unwrap_or_else(|| id.into()),
        color: model::text(&map, "color").unwrap_or_else(|| "gray".into()),
        order: model::number(&map, "order").unwrap_or(0.0),
        add_labels: model::list(&map, "add_labels"),
        set_priority: priority_from(map.get("set_priority")),
    })
}

/// Builds a fresh entity file from ordered fields; `Null` values are skipped.
fn compose(fields: &[(&str, Value)], body: &str) -> String {
    let changes: Vec<(String, Value)> = fields
        .iter()
        .filter(|(_, v)| !v.is_null())
        .map(|(k, v)| ((*k).to_owned(), v.clone()))
        .collect();
    fm::with_body(&fm::patch("---\n---\n", &changes), body)
}

// ───────────────────────── 存储 ─────────────────────────

impl TaskStore {
    pub fn open(dir: Dir) -> Result<Self> {
        let mut store = Self {
            dir,
            generation: 0,
            items: HashMap::new(),
            projects: Vec::new(),
            statuses: builtin_statuses(),
            labels: Vec::new(),
            types: Vec::new(),
            buckets: Vec::new(),
            views: Vec::new(),
            cycles: Vec::new(),
            templates: Vec::new(),
            settings: Settings::default(),
            comments: HashMap::new(),
            invalid: Vec::new(),
            truncated: false,
            fingerprint: 0,
            actor: None,
        };
        store.refresh()?;
        Ok(store)
    }

    /// Seeds default dictionaries the first time the store is created.
    pub fn initialize(dir: Dir) -> Result<Self> {
        if open_sub(&dir, "items")?.is_none() {
            create_sub(&dir, "items")?;
            if read_optional(&dir, ".gitattributes")?.is_none() {
                write_atomic(&dir, ".gitattributes", "activity/*.jsonl merge=union\n")?;
            }
            let seeds: [(&str, &[Seed]); 3] = [
                (
                    "labels",
                    &[
                        ("bug", "缺陷", "red", &[], ""),
                        ("feature", "功能", "violet", &[], ""),
                        ("improvement", "改进", "blue", &[], ""),
                    ],
                ),
                (
                    "types",
                    &[
                        ("bug", "缺陷", "red", &["bug"], "high"),
                        ("feature", "功能", "violet", &["feature"], ""),
                        ("improvement", "改进", "blue", &["improvement"], ""),
                    ],
                ),
                (
                    "buckets",
                    &[
                        ("now", "现在", "orange", &[], ""),
                        ("next", "下一步", "blue", &[], ""),
                        ("later", "以后", "gray", &[], ""),
                    ],
                ),
            ];
            for (folder, entries) in seeds {
                if open_sub(&dir, folder)?.is_some() {
                    continue;
                }
                let sub = create_sub(&dir, folder)?;
                for (i, (id, name, color, labels, priority)) in entries.iter().enumerate() {
                    let text = compose(
                        &[
                            ("name", json!(name)),
                            ("color", json!(color)),
                            ("order", json!(i + 1)),
                            (
                                "add_labels",
                                if labels.is_empty() {
                                    Value::Null
                                } else {
                                    json!(labels)
                                },
                            ),
                            (
                                "set_priority",
                                if priority.is_empty() {
                                    Value::Null
                                } else {
                                    json!(priority)
                                },
                            ),
                        ],
                        "",
                    );
                    write_atomic(&sub, &format!("{id}.md"), &text)?;
                }
            }
        }
        config::seed_views(&dir)?;
        Self::open(dir)
    }

    pub fn generation(&self) -> u64 {
        self.generation
    }

    fn read_dictionaries(
        &self,
        folder: &str,
        invalid: &mut Vec<InvalidFile>,
    ) -> Result<Vec<Dictionary>> {
        let Some(sub) = open_sub(&self.dir, folder)? else {
            return Ok(Vec::new());
        };
        let mut out = Vec::new();
        for entry in sub.entries()? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let Some(id) = slug_id(&name) else { continue };
            match read_text(&sub, &name)
                .map_err(|e| e.to_string())
                .and_then(|t| parse_dictionary(id, &t))
            {
                Ok(d) => out.push(d),
                Err(error) => invalid.push(InvalidFile {
                    path: format!("{folder}/{name}"),
                    error,
                }),
            }
        }
        out.sort_by(|a, b| a.order.total_cmp(&b.order).then_with(|| a.id.cmp(&b.id)));
        Ok(out)
    }

    /// Re-reads changed files only (by size and modification time). Returns whether anything
    /// observable changed, in which case the generation advances.
    pub fn refresh(&mut self) -> Result<bool> {
        let mut invalid = Vec::new();
        let mut seen = HashSet::new();
        let mut truncated = false;
        if let Some(items) = open_sub(&self.dir, "items")? {
            for entry in items.entries()? {
                let entry = entry?;
                let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                    continue;
                };
                let Some(id) = file_id(&name) else { continue };
                if seen.len() >= MAX_TASKS {
                    truncated = true;
                    break;
                }
                let Ok(metadata) = items.symlink_metadata(&name) else {
                    continue;
                };
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    continue;
                }
                seen.insert(id.to_owned());
                let current = stamp(&metadata);
                if self.items.get(id).is_some_and(|c| c.stamp == current) {
                    continue;
                }
                let (task, body) = match read_text(&items, &name) {
                    Ok(text) => (parse_task(id, &text), fm::body(&text).to_lowercase()),
                    Err(e) => (Err(e.to_string()), String::new()),
                };
                self.items.insert(
                    id.to_owned(),
                    Cached {
                        stamp: current,
                        task,
                        body,
                    },
                );
            }
        }
        self.items.retain(|id, _| seen.contains(id));
        for (id, cached) in &self.items {
            if let Err(error) = &cached.task {
                invalid.push(InvalidFile {
                    path: format!("items/{id}.md"),
                    error: error.clone(),
                });
            }
        }
        let mut projects = Vec::new();
        if let Some(sub) = open_sub(&self.dir, "projects")? {
            for entry in sub.entries()? {
                let entry = entry?;
                let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                    continue;
                };
                let Some(id) = slug_id(&name) else { continue };
                match read_text(&sub, &name)
                    .map_err(|e| e.to_string())
                    .and_then(|t| parse_project(id, &t))
                {
                    Ok(p) => projects.push(p),
                    Err(error) => invalid.push(InvalidFile {
                        path: format!("projects/{name}"),
                        error,
                    }),
                }
            }
        }
        projects.sort_by(|a, b| {
            a.order
                .total_cmp(&b.order)
                .then_with(|| a.name.cmp(&b.name))
        });
        let mut statuses = builtin_statuses();
        for custom in self.read_dictionaries("statuses", &mut invalid)? {
            let category = read_optional(
                &open_sub(&self.dir, "statuses")?.expect("listed"),
                &format!("{}.md", custom.id),
            )?
            .and_then(|t| mapping(&t).ok())
            .and_then(|m| model::text(&m, "category"))
            .and_then(|c| Category::parse(&c));
            match category {
                Some(category) if !statuses.iter().any(|s| s.id == custom.id) => {
                    statuses.push(Status {
                        id: custom.id,
                        name: custom.name,
                        category,
                        color: custom.color,
                        builtin: false,
                        order: custom.order,
                    })
                }
                _ => invalid.push(InvalidFile {
                    path: format!("statuses/{}.md", custom.id),
                    error: "状态缺少有效 category 或与内置状态重名".into(),
                }),
            }
        }
        let views = self.read_views(&mut invalid)?;
        let cycles = self.read_cycles(&mut invalid)?;
        let templates = self.read_templates(&mut invalid)?;
        let labels = self.read_dictionaries("labels", &mut invalid)?;
        let types = self.read_dictionaries("types", &mut invalid)?;
        let buckets = self.read_dictionaries("buckets", &mut invalid)?;
        let mut settings = Settings::default();
        if let Some(text) = read_optional(&self.dir, "settings.yml")? {
            match serde_yaml_ng::from_str::<Mapping>(&text) {
                Ok(map) => {
                    if let Some(key) = model::text(&map, "unassigned_key").filter(|k| valid_key(k))
                    {
                        settings.unassigned_key = key;
                    }
                    if matches!(map.get("comments"), Some(serde_yaml_ng::Value::Bool(false))) {
                        settings.comments = false;
                    }
                    settings.cycles_enabled = model::flag(&map, "cycles_enabled");
                    if let Some(w) =
                        model::number(&map, "cycle_weeks").filter(|w| (1.0..=4.0).contains(w))
                    {
                        settings.cycle_weeks = w as u8;
                    }
                    if let Some(d) =
                        model::number(&map, "cycle_start_day").filter(|d| (1.0..=7.0).contains(d))
                    {
                        settings.cycle_start_day = d as u8;
                    }
                }
                Err(e) => invalid.push(InvalidFile {
                    path: "settings.yml".into(),
                    error: e.to_string(),
                }),
            }
        }
        let mut comments = HashMap::new();
        if let Some(sub) = open_sub(&self.dir, "comments")? {
            for entry in sub.entries()? {
                let entry = entry?;
                let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                    continue;
                };
                if !valid_id(&name) {
                    continue;
                }
                if let Some(task_dir) = open_sub(&sub, &name)? {
                    let n = task_dir
                        .entries()?
                        .filter_map(|e| e.ok())
                        .filter(|e| e.file_name().to_str().is_some_and(|n| file_id(n).is_some()))
                        .count();
                    comments.insert(name, n as u32);
                }
            }
        }
        invalid.sort_by(|a, b| a.path.cmp(&b.path));
        // Cheap change detection over everything the snapshot exposes.
        let mut hasher = Sha256::new();
        let mut ids: Vec<_> = self.items.iter().map(|(id, c)| (id, &c.stamp)).collect();
        ids.sort();
        for (id, s) in ids {
            hasher.update(id.as_bytes());
            hasher.update(s.as_bytes());
        }
        for p in &projects {
            hasher.update(p.revision.as_bytes());
        }
        for v in &views {
            hasher.update(v.revision.as_bytes());
        }
        for c in &cycles {
            hasher.update(c.revision.as_bytes());
        }
        for t in &templates {
            hasher.update(t.revision.as_bytes());
        }
        for d in labels.iter().chain(&types).chain(&buckets) {
            hasher.update(format!("{}{}{}{}", d.id, d.name, d.color, d.order).as_bytes());
        }
        for s in &statuses {
            hasher.update(format!("{}{}{}", s.id, s.name, s.order).as_bytes());
        }
        let mut c: Vec<_> = comments.iter().collect();
        c.sort();
        hasher.update(format!("{c:?}{settings:?}").as_bytes());
        let digest = hasher.finalize();
        let fingerprint = u64::from_be_bytes(digest[..8].try_into().expect("8 bytes"));
        let changed = fingerprint != self.fingerprint || self.generation == 0;
        self.projects = projects;
        self.statuses = statuses;
        self.labels = labels;
        self.types = types;
        self.buckets = buckets;
        self.views = views;
        self.cycles = cycles;
        self.templates = templates;
        self.settings = settings;
        self.comments = comments;
        self.invalid = invalid;
        self.truncated = truncated;
        self.fingerprint = fingerprint;
        if changed {
            self.generation += 1;
        }
        if self.repair_numbers()? {
            return self.refresh().map(|_| true);
        }
        Ok(changed)
    }

    fn tasks(&self) -> impl Iterator<Item = &Task> {
        self.items.values().filter_map(|c| c.task.as_ref().ok())
    }
    fn task(&self, id: &str) -> Result<&Task> {
        self.items
            .get(id)
            .and_then(|c| c.task.as_ref().ok())
            .ok_or(StoreError::NotFound("任务"))
    }
    fn project(&self, id: &str) -> Option<&Project> {
        self.projects.iter().find(|p| p.id == id)
    }
    fn key_of(&self, project: Option<&str>) -> String {
        project
            .and_then(|p| self.project(p))
            .map_or_else(|| self.settings.unassigned_key.clone(), |p| p.key.clone())
    }
    pub fn human_id(&self, task: &Task) -> String {
        format!("{}-{}", self.key_of(task.project.as_deref()), task.number)
    }
    fn status(&self, id: &str) -> Option<&Status> {
        self.statuses.iter().find(|s| s.id == id)
    }

    /// Saves an import receipt as `imports/<id>.json`.
    pub(crate) fn write_receipt(&self, id: &str, receipt: &Value) -> Result<()> {
        if !valid_id(id) {
            return invalid("回执编号无效");
        }
        let dir = create_sub(&self.dir, "imports")?;
        let text = serde_json::to_string_pretty(receipt)
            .map_err(|e| StoreError::Invalid(e.to_string()))?;
        write_atomic(&dir, &format!("{id}.json"), &format!("{text}\n"))
    }
    /// Import receipts, newest first; unreadable ones are skipped.
    pub(crate) fn read_receipts(&self) -> Result<Vec<Value>> {
        let Some(dir) = open_sub(&self.dir, "imports")? else {
            return Ok(Vec::new());
        };
        let mut out = Vec::new();
        for entry in dir.entries()? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if !name.ends_with(".json") {
                continue;
            }
            if let Ok(Some(text)) = read_optional(&dir, &name) {
                if let Ok(value) = serde_json::from_str::<Value>(&text) {
                    out.push(value);
                }
            }
        }
        out.sort_by(|a, b| b["at"].as_str().cmp(&a["at"].as_str()));
        Ok(out)
    }

    /// Tasks matching a query (the search box language). `today` is the caller's local date,
    /// `now` the current instant in epoch seconds; descriptions take part in free text.
    pub fn query(&self, source: &str, today: &str, now: i64) -> Result<Vec<Task>> {
        let today = day_number(today).ok_or_else(|| StoreError::Invalid("日期无效".into()))?;
        let snapshot = self.snapshot();
        let bodies: HashMap<String, String> = self
            .items
            .iter()
            .map(|(id, c)| (id.clone(), c.body.clone()))
            .collect();
        let ctx = self.context(&snapshot, Some(&bodies), today, now);
        Ok(ctx
            .select(&crate::query::parse(source))
            .into_iter()
            .cloned()
            .collect())
    }
    /// A task by internal id, current `WEB-12`, or an id it had before moving.
    pub fn resolve(&self, reference: &str) -> Option<Task> {
        let snapshot = self.snapshot();
        let ctx = self.context(&snapshot, None, 0, 0);
        crate::query::resolve(&ctx, reference).cloned()
    }
    fn context<'a>(
        &self,
        snapshot: &'a Snapshot,
        bodies: Option<&'a HashMap<String, String>>,
        today: i64,
        now: i64,
    ) -> crate::query::QueryContext<'a> {
        crate::query::QueryContext {
            tasks: &snapshot.tasks,
            statuses: &snapshot.statuses,
            labels: &snapshot.labels,
            types: &snapshot.types,
            buckets: &snapshot.buckets,
            projects: &snapshot.projects,
            cycles: &snapshot.cycles,
            settings: &snapshot.settings,
            bodies,
            today,
            now,
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        let mut tasks: Vec<Task> = self
            .tasks()
            .cloned()
            .map(|mut t| {
                t.comments = self.comments.get(&t.id).copied().unwrap_or(0);
                t
            })
            .collect();
        tasks.sort_by(|a, b| a.order.total_cmp(&b.order).then_with(|| a.id.cmp(&b.id)));
        Snapshot {
            generation: self.generation,
            initialized: true,
            tasks,
            projects: self.projects.clone(),
            statuses: self.statuses.clone(),
            labels: self.labels.clone(),
            types: self.types.clone(),
            buckets: self.buckets.clone(),
            views: self.views.clone(),
            cycles: self.cycles.clone(),
            templates: self.templates.clone(),
            settings: self.settings.clone(),
            invalid: self.invalid.clone(),
            truncated: self.truncated,
        }
    }

    /// Highest number used in a project, including numbers the project's tasks used before.
    fn max_number(&self, project: Option<&str>) -> u32 {
        let mut keys = vec![self.key_of(project)];
        if let Some(p) = project.and_then(|p| self.project(p)) {
            keys.extend(p.previous_keys.iter().cloned());
        }
        self.tasks()
            .flat_map(|t| {
                let own = (t.project.as_deref() == project).then_some(t.number);
                let old = t.previous_ids.iter().filter_map(|old| {
                    let (k, n) = old.rsplit_once('-')?;
                    keys.iter()
                        .any(|key| key == k)
                        .then(|| n.parse::<u32>().ok())
                        .flatten()
                });
                own.into_iter().chain(old)
            })
            .max()
            .unwrap_or(0)
    }

    /// Two devices can hand out the same number while offline. The earliest-created task keeps
    /// it; the others take fresh numbers and keep the old ID in `previous_ids`. Every device
    /// computes the same result, so concurrent repairs write identical bytes.
    fn repair_numbers(&mut self) -> Result<bool> {
        let mut groups: NumberGroups = BTreeMap::new();
        for t in self.tasks() {
            groups
                .entry((t.project.clone(), t.number))
                .or_default()
                .push((t.created.clone(), t.id.clone()));
        }
        let mut plan: Vec<(String, u32, String)> = Vec::new();
        let mut next: HashMap<Option<String>, u32> = HashMap::new();
        for ((project, number), mut members) in groups {
            if members.len() < 2 && number > 0 {
                continue;
            }
            members.sort();
            let skip = usize::from(number > 0);
            for (_, id) in members.into_iter().skip(skip) {
                let n = next
                    .entry(project.clone())
                    .or_insert_with(|| self.max_number(project.as_deref()));
                *n += 1;
                let old = format!("{}-{number}", self.key_of(project.as_deref()));
                plan.push((id, *n, old));
            }
        }
        let Some(items) = open_sub(&self.dir, "items")? else {
            return Ok(false);
        };
        for (id, number, old) in &plan {
            let name = format!("{id}.md");
            let text = read_text(&items, &name)?;
            let mut previous = self.task(id)?.previous_ids.clone();
            if !old.ends_with("-0") && !previous.contains(old) {
                previous.push(old.clone());
            }
            let patched = fm::patch(
                &text,
                &[
                    ("number".into(), json!(number)),
                    ("previous_ids".into(), json!(previous)),
                ],
            );
            write_atomic(&items, &name, &patched)?;
        }
        Ok(!plan.is_empty())
    }

    pub fn detail(&self, id: &str) -> Result<Detail> {
        if !valid_id(id) {
            return Err(StoreError::NotFound("任务"));
        }
        let items = open_sub(&self.dir, "items")?.ok_or(StoreError::NotFound("任务"))?;
        let text = read_text(&items, &format!("{id}.md"))?;
        let mut comments = Vec::new();
        if let Some(dir) = open_sub(&self.dir, "comments")?
            .map(|c| open_sub(&c, id))
            .transpose()?
            .flatten()
        {
            for entry in dir.entries()? {
                let entry = entry?;
                let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                    continue;
                };
                let Some(cid) = file_id(&name) else { continue };
                if let Ok(t) = read_text(&dir, &name) {
                    let created = mapping(&t)
                        .ok()
                        .and_then(|m| model::text(&m, "created"))
                        .unwrap_or_default();
                    comments.push(Comment {
                        id: cid.into(),
                        created,
                        body: fm::body(&t).to_owned(),
                    });
                }
            }
        }
        comments.sort_by(|a, b| a.created.cmp(&b.created).then_with(|| a.id.cmp(&b.id)));
        let mut activity = Vec::new();
        if let Some(dir) = open_sub(&self.dir, "activity")? {
            if let Some(log) = read_optional(&dir, &format!("{id}.jsonl"))? {
                let mut seen = HashSet::new();
                for line in log.lines() {
                    // Union merges may duplicate lines; event ids keep each one once.
                    if let Ok(event) = serde_json::from_str::<Value>(line) {
                        let key = event
                            .get("id")
                            .and_then(Value::as_str)
                            .unwrap_or(line)
                            .to_owned();
                        if seen.insert(key) {
                            activity.push(event);
                        }
                    }
                }
            }
        }
        activity.sort_by(|a, b| a["at"].as_str().cmp(&b["at"].as_str()));
        Ok(Detail {
            id: id.into(),
            body: fm::body(&text).to_owned(),
            revision: revision(&text),
            comments,
            activity,
        })
    }

    fn log(&self, task: &str, event: Value) -> Result<()> {
        let dir = create_sub(&self.dir, "activity")?;
        let mut event = event;
        event["id"] = json!(new_id());
        event["at"] = json!(now_iso());
        if let Some(actor) = &self.actor {
            event["by"] = json!(actor);
        }
        let mut line =
            serde_json::to_string(&event).map_err(|e| StoreError::Invalid(e.to_string()))?;
        line.push('\n');
        let mut file = dir.open_with(
            format!("{task}.jsonl"),
            OpenOptions::new().append(true).create(true),
        )?;
        file.write_all(line.as_bytes())?;
        Ok(())
    }

    /// `apply` on behalf of someone other than the person at the keyboard; their name goes
    /// into every activity event the mutation writes.
    pub fn apply_as(&mut self, mutation: Mutation, actor: &str) -> Result<MutationResult> {
        if actor.is_empty() || actor.len() > 64 {
            return invalid("来源标识无效");
        }
        self.actor = Some(actor.to_owned());
        let result = self.apply(mutation);
        self.actor = None;
        result
    }

    pub fn apply(&mut self, mutation: Mutation) -> Result<MutationResult> {
        // Stores created before saved views existed get the defaults on their first write.
        config::seed_views(&self.dir)?;
        self.refresh()?;
        let mut result = MutationResult::default();
        match mutation {
            Mutation::CreateTask { draft } => self.create_task(draft, &mut result)?,
            Mutation::Patch {
                ids,
                revisions,
                set,
            } => self.patch(&ids, &revisions, &set, &mut result)?,
            Mutation::SetDescription {
                id,
                revision: expected,
                body,
            } => {
                if body.len() > MAX_BODY {
                    return invalid("描述超过 512 KiB");
                }
                let items = open_sub(&self.dir, "items")?.ok_or(StoreError::NotFound("任务"))?;
                let name = format!("{id}.md");
                let text = read_text(&items, &name)?;
                if revision(&text) != expected {
                    return Err(StoreError::Conflict);
                }
                if fm::body(&text) != body {
                    let patched = fm::patch(&text, &[("updated".into(), json!(now_iso()))]);
                    write_atomic(&items, &name, &fm::with_body(&patched, &body))?;
                }
                result.applied.push(id);
            }
            Mutation::Delete { ids, revisions } => self.delete(&ids, &revisions, &mut result)?,
            Mutation::Comment { id, body } => {
                self.task(&id)?;
                if body.trim().is_empty() || body.len() > 64 * 1024 {
                    return invalid("评论不能为空，且不超过 64 KiB");
                }
                let dir = create_sub(&create_sub(&self.dir, "comments")?, &id)?;
                let cid = new_id();
                write_atomic(
                    &dir,
                    &format!("{cid}.md"),
                    &compose(&[("created", json!(now_iso()))], &body),
                )?;
                result.created.push(cid);
                result.applied.push(id);
            }
            Mutation::CreateProject {
                name,
                key,
                icon,
                color,
                description,
            } => {
                let key = key.trim().to_uppercase();
                let name = name.trim();
                if name.is_empty() || name.chars().count() > 80 {
                    return invalid("项目名称不能为空，且不超过 80 个字符");
                }
                if !valid_key(&key) {
                    return invalid("项目 key 必须是 2–5 位大写字母或数字，以字母开头");
                }
                if self.key_taken(&key, None) {
                    return invalid(format!("项目 key {key} 已被使用"));
                }
                let dir = create_sub(&self.dir, "projects")?;
                let base = key.to_lowercase();
                let mut slug = base.clone();
                let mut n = 2;
                while read_optional(&dir, &format!("{slug}.md"))?.is_some() {
                    slug = format!("{base}-{n}");
                    n += 1;
                }
                let order = self.projects.iter().map(|p| p.order).fold(0.0, f64::max) + 1.0;
                let text = compose(
                    &[
                        ("name", json!(name)),
                        ("key", json!(key)),
                        ("icon", json!(icon.unwrap_or_else(|| "folder".into()))),
                        ("color", json!(color.unwrap_or_else(|| "violet".into()))),
                        ("state", json!("active")),
                        ("order", json!(order)),
                        ("created", json!(now_iso())),
                    ],
                    &description.unwrap_or_default(),
                );
                write_atomic(&dir, &format!("{slug}.md"), &text)?;
                result.created.push(slug);
            }
            Mutation::UpsertDictionary {
                dictionary,
                id,
                set,
            } => self.upsert_dictionary(&dictionary, id.as_deref(), &set, &mut result)?,
            Mutation::DeleteDictionary { dictionary, id } => {
                self.delete_dictionary(&dictionary, &id, &mut result)?
            }
            Mutation::UpdateSettings { mut set } => {
                // The client's local date places a first cycle; it is not stored.
                let today = set
                    .remove("today")
                    .and_then(|v| v.as_str().map(String::from))
                    .unwrap_or_else(|| now_iso()[..10].to_owned());
                self.update_settings(&set, &mut result)?;
                self.refresh()?;
                if self.settings.cycles_enabled {
                    self.ensure_cycles(&today)?;
                }
            }
            Mutation::SaveTemplate { id, set } => {
                self.save_template(id.as_deref(), &set, &mut result)?
            }
            Mutation::DeleteTemplate { id } => self.delete_template(&id, &mut result)?,
            Mutation::CompleteCycle {
                number,
                today,
                moves,
            } => self.complete_cycle(number, &moves, &today, &mut result)?,
            Mutation::SaveView { id, set } => self.save_view(id.as_deref(), &set, &mut result)?,
            Mutation::DeleteView { id } => self.delete_view(&id, &mut result)?,
            Mutation::UpdateProject {
                id,
                revision: expected,
                set,
            } => self.update_project(&id, &expected, &set, &mut result)?,
        }
        self.refresh()?;
        result.generation = self.generation;
        Ok(result)
    }

    fn key_taken(&self, key: &str, except: Option<&str>) -> bool {
        key == self.settings.unassigned_key
            || self
                .projects
                .iter()
                .filter(|p| Some(p.id.as_str()) != except)
                .any(|p| p.key == key || p.previous_keys.iter().any(|k| k == key))
    }

    fn create_task(&mut self, draft: Draft, result: &mut MutationResult) -> Result<()> {
        let title = draft.title.trim().to_owned();
        if title.is_empty() || title.chars().count() > 500 {
            return invalid("任务标题不能为空，且不超过 500 个字符");
        }
        let parent = match draft.parent.as_deref() {
            Some(pid) => {
                let p = self.task(pid)?;
                if p.parent.is_some() || draft.subtasks.iter().any(|s| !s.trim().is_empty()) {
                    return invalid("子任务只支持一层");
                }
                Some(p.clone())
            }
            None => None,
        };
        let project = parent
            .as_ref()
            .map_or(draft.project.clone(), |p| p.project.clone());
        if let Some(p) = project.as_deref() {
            if self.project(p).is_none() {
                return Err(StoreError::NotFound("项目"));
            }
        }
        let status = draft.status.unwrap_or_else(|| "todo".into());
        let category = self
            .status(&status)
            .ok_or_else(|| StoreError::Invalid("未知状态".into()))?
            .category;
        let mut labels = draft.labels.clone();
        let mut priority = draft.priority.unwrap_or(0).min(4);
        if let Some(kind) = draft.kind.as_deref() {
            let rule = self
                .types
                .iter()
                .find(|t| t.id == kind)
                .ok_or_else(|| StoreError::Invalid("未知类型".into()))?;
            for l in &rule.add_labels {
                if !labels.contains(l) {
                    labels.push(l.clone());
                }
            }
            if priority == 0 {
                priority = rule.set_priority;
            }
        }
        self.check_labels(&labels)?;
        if let Some(b) = draft.bucket.as_deref() {
            if !self.buckets.iter().any(|x| x.id == b) {
                return invalid("未知队列");
            }
        }
        if let Some(due) = draft.due.as_deref() {
            if !valid_due(due) {
                return invalid("到期日应为 YYYY-MM-DD");
            }
        }
        self.check_project_values(
            project.as_deref(),
            Some(&status),
            &labels,
            draft.bucket.as_deref(),
        )?;
        let items = create_sub(&self.dir, "items")?;
        let mut number = self.max_number(project.as_deref());
        let mut order = self.tasks().map(|t| t.order).fold(0.0, f64::max);
        let now = now_iso();
        let cycle = draft.cycle.or(parent.as_ref().and_then(|p| p.cycle));
        if let Some(c) = draft.cycle {
            self.check_cycle(c)?;
        }
        let mut make =
            |title: &str, parent_id: Option<&str>, body: &str, primary: bool| -> Result<String> {
                number += 1;
                order += 1.0;
                let id = new_id();
                let fields = [
                    ("title", json!(title)),
                    ("project", json!(project)),
                    ("number", json!(number)),
                    (
                        "status",
                        json!(if primary { status.as_str() } else { "todo" }),
                    ),
                    (
                        "priority",
                        if primary && priority > 0 {
                            json!(PRIORITIES[priority as usize])
                        } else {
                            Value::Null
                        },
                    ),
                    (
                        "type",
                        if primary {
                            json!(draft.kind)
                        } else {
                            Value::Null
                        },
                    ),
                    (
                        "labels",
                        if primary && !labels.is_empty() {
                            json!(labels)
                        } else {
                            Value::Null
                        },
                    ),
                    (
                        "bucket",
                        if primary {
                            json!(draft.bucket)
                        } else {
                            Value::Null
                        },
                    ),
                    ("cycle", json!(cycle)),
                    (
                        "cycle_added",
                        if cycle.is_some() {
                            json!(now)
                        } else {
                            Value::Null
                        },
                    ),
                    ("parent", json!(parent_id)),
                    (
                        "due",
                        if primary {
                            json!(draft.due)
                        } else {
                            Value::Null
                        },
                    ),
                    ("created", json!(now)),
                    ("updated", json!(now)),
                    (
                        "completed",
                        if primary && !category.open() {
                            json!(now)
                        } else {
                            Value::Null
                        },
                    ),
                    ("order", json!(order)),
                    (
                        "source",
                        if primary {
                            json!(draft.source)
                        } else {
                            Value::Null
                        },
                    ),
                    (
                        "previous_ids",
                        if primary && !draft.previous_ids.is_empty() {
                            json!(draft.previous_ids)
                        } else {
                            Value::Null
                        },
                    ),
                ];
                write_atomic(&items, &format!("{id}.md"), &compose(&fields, body))?;
                Ok(id)
            };
        let id = make(
            &title,
            parent.as_ref().map(|p| p.id.as_str()),
            draft.description.as_deref().unwrap_or(""),
            true,
        )?;
        let mut created = vec![id.clone()];
        for sub in draft
            .subtasks
            .iter()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
        {
            created.push(make(sub, Some(&id), "", false)?);
        }
        for c in &created {
            self.log(c, json!({ "type": "created" }))?;
        }
        result.applied.push(id);
        result.created = created;
        Ok(())
    }

    fn check_project_values(
        &self,
        project: Option<&str>,
        status: Option<&str>,
        labels: &[String],
        bucket: Option<&str>,
    ) -> Result<()> {
        let Some(p) = project.and_then(|p| self.project(p)) else {
            return Ok(());
        };
        if let (Some(status), Some(allowed)) = (status, &p.statuses) {
            if !allowed.iter().any(|s| s == status) {
                return invalid(format!("项目「{}」不使用这个状态", p.name));
            }
        }
        if let Some(allowed) = &p.labels {
            if let Some(bad) = labels.iter().find(|l| !allowed.contains(l)) {
                return invalid(format!("项目「{}」不使用标签 {bad}", p.name));
            }
        }
        if let (Some(bucket), Some(allowed)) = (bucket, &p.buckets) {
            if !allowed.iter().any(|b| b == bucket) {
                return invalid(format!("项目「{}」不使用这个队列", p.name));
            }
        }
        Ok(())
    }

    fn check_labels(&self, labels: &[String]) -> Result<()> {
        match labels
            .iter()
            .find(|l| !self.labels.iter().any(|x| &x.id == *l))
        {
            Some(l) => invalid(format!("未知标签 {l}")),
            None => Ok(()),
        }
    }

    /// Whether `from` is already blocked, directly or through others, by `target`.
    fn blocked_through(&self, from: &str, target: &str) -> bool {
        let mut seen = HashSet::new();
        let mut stack = vec![from.to_owned()];
        while let Some(current) = stack.pop() {
            if current == target {
                return true;
            }
            if !seen.insert(current.clone()) {
                continue;
            }
            if let Ok(t) = self.task(&current) {
                stack.extend(t.blocked_by.iter().cloned());
            }
        }
        false
    }
    fn children(&self, id: &str) -> Vec<Task> {
        self.tasks()
            .filter(|t| t.parent.as_deref() == Some(id))
            .cloned()
            .collect()
    }

    fn patch(
        &mut self,
        ids: &[String],
        revisions: &[String],
        set: &Map<String, Value>,
        result: &mut MutationResult,
    ) -> Result<()> {
        if ids.len() != revisions.len() || ids.is_empty() || ids.len() > 5000 {
            return invalid("批量修改参数不完整");
        }
        const ALLOWED: [&str; 14] = [
            "title",
            "status",
            "priority",
            "type",
            "labels",
            "bucket",
            "cycle",
            "parent",
            "due",
            "archived",
            "order",
            "blockedBy",
            "related",
            "project",
        ];
        if let Some(k) = set.keys().find(|k| !ALLOWED.contains(&k.as_str())) {
            return invalid(format!("不支持修改字段 {k}"));
        }
        let items = open_sub(&self.dir, "items")?.ok_or(StoreError::NotFound("任务"))?;
        let mut next_numbers: HashMap<Option<String>, u32> = HashMap::new();
        let now = now_iso();
        // (id, changes, events) gathered first so validation errors write nothing.
        let mut writes: Vec<PendingWrite> = Vec::new();
        let mut moved: Vec<(String, Option<String>)> = Vec::new();
        for (id, expected) in ids.iter().zip(revisions) {
            let task = match self.task(id) {
                Ok(t) => t.clone(),
                Err(_) => {
                    result.conflicts.push(id.clone());
                    continue;
                }
            };
            if &task.revision != expected {
                result.conflicts.push(id.clone());
                continue;
            }
            let mut changes: Vec<(String, Value)> = Vec::new();
            let mut events = Vec::new();
            let mut target_project = task.project.clone();
            for (key, value) in set {
                match key.as_str() {
                    "title" => {
                        let t = value.as_str().map(str::trim).unwrap_or("");
                        if t.is_empty() || t.chars().count() > 500 {
                            return invalid("任务标题不能为空，且不超过 500 个字符");
                        }
                        changes.push(("title".into(), json!(t)));
                    }
                    "status" => {
                        let to = value
                            .as_str()
                            .and_then(|s| self.status(s))
                            .ok_or_else(|| StoreError::Invalid("未知状态".into()))?;
                        let from = self
                            .status(&task.status)
                            .map_or(Category::Unstarted, |s| s.category);
                        if to.id != task.status {
                            events.push(
                                json!({ "type": "status", "from": task.status, "to": to.id }),
                            );
                        }
                        changes.push(("status".into(), json!(to.id)));
                        if !to.category.open() && (from.open() || task.completed.is_none()) {
                            changes.push(("completed".into(), json!(now)));
                        } else if to.category.open() {
                            changes.push(("completed".into(), Value::Null));
                        }
                    }
                    "priority" => {
                        let p = value
                            .as_u64()
                            .filter(|p| *p <= 4)
                            .ok_or_else(|| StoreError::Invalid("优先级应为 0–4".into()))?
                            as u8;
                        if p != task.priority {
                            events.push(json!({ "type": "priority", "to": p }));
                        }
                        changes.push((
                            "priority".into(),
                            if p == 0 {
                                Value::Null
                            } else {
                                json!(PRIORITIES[p as usize])
                            },
                        ));
                    }
                    "type" => match value.as_str() {
                        None => changes.push(("type".into(), Value::Null)),
                        Some(kind) => {
                            let rule = self
                                .types
                                .iter()
                                .find(|t| t.id == kind)
                                .ok_or_else(|| StoreError::Invalid("未知类型".into()))?;
                            changes.push(("type".into(), json!(kind)));
                            let mut labels = match set.get("labels") {
                                Some(Value::Array(v)) => v
                                    .iter()
                                    .filter_map(|x| x.as_str().map(String::from))
                                    .collect(),
                                _ => task.labels.clone(),
                            };
                            let before = labels.len();
                            for l in &rule.add_labels {
                                if !labels.contains(l) {
                                    labels.push(l.clone());
                                }
                            }
                            if labels.len() != before && !set.contains_key("labels") {
                                changes.push(("labels".into(), json!(labels)));
                            }
                            if task.priority == 0
                                && rule.set_priority > 0
                                && !set.contains_key("priority")
                            {
                                changes.push((
                                    "priority".into(),
                                    json!(PRIORITIES[rule.set_priority as usize]),
                                ));
                            }
                        }
                    },
                    "labels" => {
                        let labels: Vec<String> = value
                            .as_array()
                            .ok_or_else(|| StoreError::Invalid("标签应为列表".into()))?
                            .iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .fold(Vec::new(), |mut acc, l| {
                                if !acc.contains(&l) {
                                    acc.push(l);
                                }
                                acc
                            });
                        self.check_labels(&labels)?;
                        changes.push((
                            "labels".into(),
                            if labels.is_empty() {
                                Value::Null
                            } else {
                                json!(labels)
                            },
                        ));
                    }
                    "bucket" => {
                        if let Some(b) = value.as_str() {
                            if !self.buckets.iter().any(|x| x.id == b) {
                                return invalid("未知队列");
                            }
                        }
                        changes.push(("bucket".into(), value.clone()));
                    }
                    "cycle" => {
                        let c = if value.is_null() {
                            Value::Null
                        } else {
                            json!(value
                                .as_u64()
                                .ok_or_else(|| StoreError::Invalid("迭代编号无效".into()))?)
                        };
                        if let Some(n) = c.as_u64() {
                            self.check_cycle(n as u32)?;
                        }
                        if c.as_u64().map(|v| v as u32) != task.cycle {
                            events.push(json!({ "type": "cycle", "to": c }));
                            changes.push((
                                "cycle_added".into(),
                                if c.is_null() {
                                    Value::Null
                                } else {
                                    json!(now_iso())
                                },
                            ));
                        }
                        changes.push(("cycle".into(), c));
                    }
                    "due" => {
                        if let Some(d) = value.as_str() {
                            if !valid_due(d) {
                                return invalid("到期日应为 YYYY-MM-DD");
                            }
                        }
                        changes.push(("due".into(), value.clone()));
                    }
                    "archived" => {
                        let a = value.as_bool().unwrap_or(false);
                        if a != task.archived {
                            events.push(json!({ "type": if a { "archived" } else { "restored" } }));
                        }
                        changes
                            .push(("archived".into(), if a { json!(true) } else { Value::Null }));
                    }
                    "order" => changes.push((
                        "order".into(),
                        json!(value
                            .as_f64()
                            .ok_or_else(|| StoreError::Invalid("排序值无效".into()))?),
                    )),
                    "blockedBy" | "related" => {
                        let list: Vec<String> = value
                            .as_array()
                            .into_iter()
                            .flatten()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect();
                        if list.iter().any(|x| x == id || self.task(x).is_err()) {
                            return invalid("关系中包含无效任务");
                        }
                        if key == "blockedBy" && list.iter().any(|x| self.blocked_through(x, id)) {
                            return invalid("这会形成循环阻塞");
                        }
                        let key = if key == "blockedBy" {
                            "blocked_by"
                        } else {
                            "related"
                        };
                        changes.push((
                            key.into(),
                            if list.is_empty() {
                                Value::Null
                            } else {
                                json!(list)
                            },
                        ));
                    }
                    "parent" => match value.as_str() {
                        None => changes.push(("parent".into(), Value::Null)),
                        Some(pid) => {
                            let p = self.task(pid)?;
                            if pid == id || p.parent.is_some() || !self.children(id).is_empty() {
                                return invalid("子任务只支持一层，且不能把任务设为自己的子任务");
                            }
                            target_project = p.project.clone();
                            changes.push(("parent".into(), json!(pid)));
                            if p.cycle.is_some()
                                && !set.contains_key("cycle")
                                && p.cycle != task.cycle
                            {
                                changes.push(("cycle".into(), json!(p.cycle)));
                                changes.push(("cycle_added".into(), json!(now_iso())));
                            }
                        }
                    },
                    "project" => {
                        if task.parent.is_some() && !set.contains_key("parent") {
                            return invalid("子任务跟随父任务的项目");
                        }
                        let p = value.as_str().map(String::from);
                        if p.as_deref().is_some_and(|p| self.project(p).is_none()) {
                            return Err(StoreError::NotFound("项目"));
                        }
                        target_project = p;
                    }
                    _ => unreachable!(),
                }
            }
            // Explicit values must fit the project; a moved task takes the nearest allowed status.
            let explicit_status = changes
                .iter()
                .find(|(k, _)| k == "status")
                .and_then(|(_, v)| v.as_str().map(String::from));
            let labels: Vec<String> = changes
                .iter()
                .find(|(k, _)| k == "labels")
                .and_then(|(_, v)| {
                    v.as_array().map(|a| {
                        a.iter()
                            .filter_map(|x| x.as_str().map(String::from))
                            .collect()
                    })
                })
                .unwrap_or_default();
            let bucket = changes
                .iter()
                .find(|(k, _)| k == "bucket")
                .and_then(|(_, v)| v.as_str().map(String::from));
            self.check_project_values(
                target_project.as_deref(),
                explicit_status.as_deref(),
                &labels,
                bucket.as_deref(),
            )?;
            if explicit_status.is_none() && target_project != task.project {
                let to = self.nearest_status(target_project.as_deref(), &task.status);
                if to != task.status {
                    events.push(json!({ "type": "status", "from": task.status, "to": to }));
                    changes.push(("status".into(), json!(to)));
                }
            }
            if target_project != task.project {
                self.renumber_changes(
                    &task,
                    target_project.clone(),
                    &mut next_numbers,
                    &mut changes,
                );
                events.push(json!({ "type": "project", "to": target_project }));
                moved.push((id.clone(), target_project));
            }
            changes.push(("updated".into(), json!(now)));
            writes.push((id.clone(), changes, events));
        }
        // Subtasks follow their parent's project.
        for (parent, project) in moved {
            for child in self.children(&parent) {
                if ids.contains(&child.id) {
                    continue;
                }
                let mut changes = Vec::new();
                self.renumber_changes(&child, project.clone(), &mut next_numbers, &mut changes);
                changes.push(("updated".into(), json!(now)));
                writes.push((
                    child.id.clone(),
                    changes,
                    vec![json!({ "type": "project", "to": project })],
                ));
            }
        }
        for (id, changes, events) in writes {
            let name = format!("{id}.md");
            let text = read_text(&items, &name)?;
            write_atomic(&items, &name, &fm::patch(&text, &changes))?;
            for e in events {
                self.log(&id, e)?;
            }
            result.applied.push(id);
        }
        Ok(())
    }

    fn renumber_changes(
        &self,
        task: &Task,
        project: Option<String>,
        next: &mut HashMap<Option<String>, u32>,
        changes: &mut Vec<(String, Value)>,
    ) {
        let n = next
            .entry(project.clone())
            .or_insert_with(|| self.max_number(project.as_deref()));
        *n += 1;
        let mut previous = task.previous_ids.clone();
        let old = self.human_id(task);
        if !previous.contains(&old) {
            previous.push(old);
        }
        changes.push(("project".into(), json!(project)));
        changes.push(("number".into(), json!(*n)));
        changes.push(("previous_ids".into(), json!(previous)));
    }

    fn delete(
        &mut self,
        ids: &[String],
        revisions: &[String],
        result: &mut MutationResult,
    ) -> Result<()> {
        if ids.len() != revisions.len() {
            return invalid("删除参数不完整");
        }
        let items = open_sub(&self.dir, "items")?.ok_or(StoreError::NotFound("任务"))?;
        let mut targets = Vec::new();
        for (id, expected) in ids.iter().zip(revisions) {
            match self.task(id) {
                Ok(t) if &t.revision == expected => {
                    targets.push(id.clone());
                    targets.extend(self.children(id).into_iter().map(|c| c.id));
                }
                _ => result.conflicts.push(id.clone()),
            }
        }
        targets.sort();
        targets.dedup();
        // Relations elsewhere stop pointing at the deleted tasks.
        let gone: HashSet<&String> = targets.iter().collect();
        let mut cleanups: Vec<(String, Vec<(String, Value)>)> = Vec::new();
        for t in self.tasks().filter(|t| !gone.contains(&t.id)) {
            let mut changes = Vec::new();
            for (key, list) in [("blocked_by", &t.blocked_by), ("related", &t.related)] {
                if list.iter().any(|x| gone.contains(x)) {
                    let rest: Vec<&String> = list.iter().filter(|x| !gone.contains(x)).collect();
                    changes.push((
                        key.to_owned(),
                        if rest.is_empty() {
                            Value::Null
                        } else {
                            json!(rest)
                        },
                    ));
                }
            }
            if !changes.is_empty() {
                cleanups.push((t.id.clone(), changes));
            }
        }
        for (id, changes) in &cleanups {
            let name = format!("{id}.md");
            let text = read_text(&items, &name)?;
            write_atomic(&items, &name, &fm::patch(&text, changes))?;
            result.applied.push(id.clone());
        }
        let comments = open_sub(&self.dir, "comments")?;
        let activity = open_sub(&self.dir, "activity")?;
        for id in targets {
            items.remove_file(format!("{id}.md"))?;
            if let Some(c) = &comments {
                if open_sub(c, &id)?.is_some() {
                    c.remove_dir_all(&id)?;
                }
            }
            if let Some(a) = &activity {
                match a.remove_file(format!("{id}.jsonl")) {
                    Err(e) if e.kind() != ErrorKind::NotFound => return Err(e.into()),
                    _ => {}
                }
            }
            result.applied.push(id);
        }
        Ok(())
    }

    fn update_project(
        &mut self,
        id: &str,
        expected: &str,
        set: &Map<String, Value>,
        result: &mut MutationResult,
    ) -> Result<()> {
        let project = self
            .project(id)
            .cloned()
            .ok_or(StoreError::NotFound("项目"))?;
        if project.revision != expected {
            return Err(StoreError::Conflict);
        }
        let dir = open_sub(&self.dir, "projects")?.ok_or(StoreError::NotFound("项目"))?;
        let name = format!("{id}.md");
        let text = read_text(&dir, &name)?;
        let mut changes: Vec<(String, Value)> = Vec::new();
        let mut body = None;
        for (key, value) in set {
            match key.as_str() {
                "name" => {
                    let n = value.as_str().map(str::trim).unwrap_or("");
                    if n.is_empty() || n.chars().count() > 80 {
                        return invalid("项目名称不能为空，且不超过 80 个字符");
                    }
                    changes.push(("name".into(), json!(n)));
                }
                "key" => {
                    let k = value.as_str().unwrap_or("").trim().to_uppercase();
                    if !valid_key(&k) {
                        return invalid("项目 key 必须是 2–5 位大写字母或数字，以字母开头");
                    }
                    if k != project.key {
                        if self.key_taken(&k, Some(id)) {
                            return invalid(format!("项目 key {k} 已被使用"));
                        }
                        let mut previous = project.previous_keys.clone();
                        previous.retain(|p| p != &k);
                        previous.push(project.key.clone());
                        changes.push(("key".into(), json!(k)));
                        changes.push(("previous_keys".into(), json!(previous)));
                    }
                }
                "icon" | "color" => {
                    changes.push((key.clone(), json!(value.as_str().unwrap_or(""))))
                }
                "state" => match value.as_str() {
                    Some(s @ ("active" | "completed" | "archived")) => {
                        changes.push(("state".into(), json!(s)))
                    }
                    _ => return invalid("项目状态无效"),
                },
                "pinned" => changes.push((
                    "pinned".into(),
                    if value.as_bool() == Some(true) {
                        json!(true)
                    } else {
                        Value::Null
                    },
                )),
                "order" => changes.push((
                    "order".into(),
                    json!(value.as_f64().unwrap_or(project.order)),
                )),
                "description" => {
                    let d = value.as_str().unwrap_or("");
                    if d.len() > MAX_BODY {
                        return invalid("描述超过 512 KiB");
                    }
                    body = Some(d.to_owned());
                }
                "statuses" | "labels" | "buckets" => {
                    changes.push((key.clone(), self.validate_limit(key, value)?))
                }
                "defaultTemplate" => {
                    if let Some(t) = value.as_str() {
                        if !self.templates.iter().any(|x| x.id == t) {
                            return Err(StoreError::NotFound("模板"));
                        }
                    }
                    changes.push(("default_template".into(), value.clone()));
                }
                "views" => {
                    let list: Vec<String> = value
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                    if let Some(bad) = list
                        .iter()
                        .find(|v| !self.views.iter().any(|x| &x.id == *v))
                    {
                        return invalid(format!("未知视图 {bad}"));
                    }
                    changes.push((
                        "views".into(),
                        if list.is_empty() {
                            Value::Null
                        } else {
                            json!(list)
                        },
                    ));
                }
                other => return invalid(format!("不支持修改字段 {other}")),
            }
        }
        let mut out = fm::patch(&text, &changes);
        if let Some(b) = body {
            out = fm::with_body(&out, &b);
        }
        if out != text {
            write_atomic(&dir, &name, &out)?;
        }
        result.applied.push(id.into());
        if set.contains_key("statuses") {
            self.migrate_statuses(id, result)?;
        }
        Ok(())
    }
}
