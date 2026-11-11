//! Imports from other tools. Every source becomes a list of [`Candidate`]s; a preview says,
//! item by item, what would be created, skipped (already imported, or closed and not wanted)
//! or left out (no title); applying writes the new tasks on behalf of `import`, records a
//! receipt, and the receipt can later archive what it created. Sources are read-only.
pub mod checklist;
pub mod csv;
pub mod github;
pub mod octarine;

use crate::{new_id, now_iso, revision, Category, Mutation, Snapshot, TaskStore};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

const ACTOR: &str = "import";
/// One import at most; larger exports are split by the person.
pub const MAX_ITEMS: usize = 5000;

/// A task as the source describes it, before any mapping to this workspace.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    /// Stable identity in the source (`github:owner/repo#12`); repeat imports skip it.
    pub source_ref: String,
    pub title: String,
    pub description: String,
    /// The source's own status name, mapped by name and then by meaning.
    pub status: Option<String>,
    /// Closed in the source (done, resolved, cancelled…).
    pub closed: bool,
    pub cancelled: bool,
    /// 0 none, 1 urgent … 4 low.
    pub priority: u8,
    pub labels: Vec<String>,
    pub kind: Option<String>,
    pub bucket: Option<String>,
    pub due: Option<String>,
    /// A project the source names; matched by key, else by name, else created when it has a key.
    pub project: Option<SourceProject>,
    pub parent_ref: Option<String>,
    pub comments: Vec<String>,
    /// The id it had in the source (`WEB-5`), searchable afterwards.
    pub previous_id: Option<String>,
    /// For checklists: the note line it came from.
    pub note: Option<checklist::NoteItem>,
}
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceProject {
    pub key: Option<String>,
    pub name: String,
}

/// A parsed source: what to show and fingerprint, and its candidates.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    /// `github`, `csv`, `octarine` or `notes`.
    pub kind: String,
    /// The file or folder name shown to the person.
    pub label: String,
    /// Identity of the bytes read, recorded in the receipt.
    pub fingerprint: String,
    pub candidates: Vec<Candidate>,
    /// Things the parser had to leave out or guess, for the preview.
    pub warnings: Vec<String>,
    /// Closed items are wanted by default (a migration), rather than left out.
    pub include_closed_default: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Options {
    /// Project (id or key) for items whose source names none.
    pub project: Option<String>,
    /// Create labels the workspace does not have yet.
    pub create_labels: bool,
    /// Bring closed items in as completed.
    pub include_closed: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub index: usize,
    pub title: String,
    pub source_ref: String,
    /// `new`, `skip` or `problem`.
    pub outcome: String,
    pub reason: Option<String>,
    pub status: String,
    pub project: String,
    pub labels: Vec<String>,
    pub unknown_labels: Vec<String>,
    pub parent: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub kind: String,
    pub label: String,
    pub rows: Vec<Row>,
    pub new: usize,
    pub skip: usize,
    pub problem: usize,
    pub projects_to_create: Vec<String>,
    pub labels_to_create: Vec<String>,
    pub unknown_labels: Vec<String>,
    pub warnings: Vec<String>,
    pub include_closed_default: bool,
}

/// How each candidate lands: its decision plus the ids it maps to.
struct Decision {
    outcome: &'static str,
    reason: Option<String>,
    status: String,
    project: Option<String>,
    new_project: Option<(String, String)>,
    labels: Vec<String>,
    new_labels: Vec<String>,
    unknown: Vec<String>,
    kind: Option<String>,
    bucket: Option<String>,
}

fn lower(s: &str) -> String {
    s.trim().to_lowercase()
}

/// What a status name means, by the words tools use for it.
pub fn category_of(raw: &str) -> Option<Category> {
    let l = lower(raw);
    let has = |words: &[&str]| words.iter().any(|w| l.contains(w));
    if has(&[
        "cancel",
        "won't",
        "wont",
        "duplicate",
        "invalid",
        "not planned",
        "not_planned",
        "取消",
        "废弃",
    ]) {
        Some(Category::Cancelled)
    } else if has(&[
        "done", "complete", "closed", "resolved", "fixed", "finished", "完成", "关闭", "解决",
    ]) {
        Some(Category::Completed)
    } else if has(&["review", "qa", "verify", "testing", "评审", "审核", "测试"]) {
        Some(Category::Review)
    } else if has(&[
        "progress",
        "doing",
        "started",
        "active",
        "develop",
        "进行",
        "处理中",
        "开发",
    ]) {
        Some(Category::Started)
    } else if has(&["backlog", "icebox", "someday", "later", "待规划", "积压"]) {
        Some(Category::Backlog)
    } else if has(&[
        "todo",
        "to do",
        "open",
        "new",
        "unstarted",
        "待办",
        "未开始",
    ]) {
        Some(Category::Unstarted)
    } else {
        None
    }
}

/// `(closed, cancelled)` for a source status name.
pub fn closed_state(raw: &str) -> (bool, bool) {
    match category_of(raw) {
        Some(Category::Cancelled) => (true, true),
        Some(Category::Completed) => (true, false),
        _ => (false, false),
    }
}

/// A source status → a workspace status: exact id or name first, then by meaning.
pub fn map_status(snap: &Snapshot, raw: Option<&str>, closed: bool, cancelled: bool) -> String {
    let by_category = |c: Category| {
        snap.statuses
            .iter()
            .find(|s| s.builtin && s.category == c)
            .or_else(|| snap.statuses.iter().find(|s| s.category == c))
            .map(|s| s.id.clone())
    };
    if let Some(raw) = raw.map(str::trim).filter(|r| !r.is_empty()) {
        let l = lower(raw);
        if let Some(s) = snap
            .statuses
            .iter()
            .find(|s| s.id == l || lower(&s.name) == l)
        {
            return s.id.clone();
        }
        if let Some(id) = category_of(raw).and_then(by_category) {
            return id;
        }
    }
    let fallback = if cancelled {
        Category::Cancelled
    } else if closed {
        Category::Completed
    } else {
        Category::Unstarted
    };
    by_category(fallback).unwrap_or_else(|| "todo".into())
}

/// A date as exports write it (`2026-03-05`, `2026/3/5`, an ISO time) → `YYYY-MM-DD`.
pub fn date(raw: &str) -> Option<String> {
    let raw = raw.trim();
    let head: String = raw
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '-' || *c == '/' || *c == '.')
        .collect();
    let parts: Vec<&str> = head
        .split(['-', '/', '.'])
        .filter(|p| !p.is_empty())
        .collect();
    let [y, m, d] = parts[..] else { return None };
    let (y, m, d) = (
        y.parse::<u32>().ok()?,
        m.parse::<u32>().ok()?,
        d.parse::<u32>().ok()?,
    );
    if y < 1000 {
        return None;
    }
    let text = format!("{y:04}-{m:02}-{d:02}");
    crate::store::day_number(&text).map(|_| text)
}

/// Priority words and numbers as tools write them.
pub fn map_priority(raw: &str) -> u8 {
    let l = lower(raw);
    match l.as_str() {
        "" | "none" | "no priority" | "无" | "无优先级" | "0" => 0,
        "1" | "urgent" | "highest" | "critical" | "blocker" | "p0" | "紧急" | "最高" => 1,
        "2" | "high" | "p1" | "高" | "重要" => 2,
        "3" | "medium" | "normal" | "p2" | "中" | "普通" => 3,
        "4" | "low" | "lowest" | "minor" | "trivial" | "p3" | "p4" | "低" | "最低" => 4,
        _ => 0,
    }
}

/// A project that limits its statuses, labels or buckets: the status moves to the nearest one
/// it uses (same category first, so closed stays closed), other values it does not use drop.
fn fit(
    snap: &Snapshot,
    project: Option<&str>,
    status: &str,
    labels: Vec<String>,
    bucket: Option<String>,
) -> (String, Vec<String>, Vec<String>, Option<String>) {
    let Some(p) = project.and_then(|p| snap.projects.iter().find(|x| x.id == p)) else {
        return (status.to_owned(), labels, Vec::new(), bucket);
    };
    let status = match &p.statuses {
        Some(allowed) if !allowed.iter().any(|s| s == status) => {
            const ORDER: [Category; 6] = [
                Category::Backlog,
                Category::Unstarted,
                Category::Started,
                Category::Review,
                Category::Completed,
                Category::Cancelled,
            ];
            let rank = |c: Category| ORDER.iter().position(|x| *x == c).unwrap_or(1) as i32;
            let from = snap
                .statuses
                .iter()
                .find(|s| s.id == status)
                .map_or(1, |s| rank(s.category));
            snap.statuses
                .iter()
                .filter(|s| allowed.contains(&s.id))
                .min_by_key(|s| ((rank(s.category) - from).abs(), s.order as i64))
                .map_or_else(|| status.to_owned(), |s| s.id.clone())
        }
        _ => status.to_owned(),
    };
    let (labels, dropped) = match &p.labels {
        Some(allowed) => labels.into_iter().partition(|l| allowed.contains(l)),
        None => (labels, Vec::new()),
    };
    let bucket = bucket.filter(|b| p.buckets.as_ref().is_none_or(|a| a.contains(b)));
    (status, labels, dropped, bucket)
}

fn decide(
    snap: &Snapshot,
    c: &Candidate,
    options: &Options,
    target: Option<&str>,
    seen: &mut HashSet<String>,
    existing: &HashMap<String, String>,
    keys_planned: &mut HashMap<String, String>,
) -> Decision {
    let mut d = Decision {
        outcome: "new",
        reason: None,
        status: map_status(snap, c.status.as_deref(), c.closed, c.cancelled),
        project: target.map(String::from),
        new_project: None,
        labels: Vec::new(),
        new_labels: Vec::new(),
        unknown: Vec::new(),
        kind: None,
        bucket: None,
    };
    if c.title.trim().is_empty() {
        d.outcome = "problem";
        d.reason = Some("没有标题".into());
        return d;
    }
    if c.title.trim().chars().count() > 500 {
        d.outcome = "problem";
        d.reason = Some("标题超过 500 个字符".into());
        return d;
    }
    if let Some(existing) = existing.get(&c.source_ref) {
        d.outcome = "skip";
        d.reason = Some(format!("已导入为 {existing}"));
        return d;
    }
    if !seen.insert(c.source_ref.clone()) {
        d.outcome = "skip";
        d.reason = Some("与本次导入中的另一项重复".into());
        return d;
    }
    if (c.closed || c.cancelled) && !options.include_closed {
        d.outcome = "skip";
        d.reason = Some("已关闭（未选择导入已关闭项）".into());
        return d;
    }
    if let Some(p) = &c.project {
        let by_key = p.key.as_deref().and_then(|k| {
            snap.projects.iter().find(|x| {
                x.key.eq_ignore_ascii_case(k)
                    || x.previous_keys.iter().any(|o| o.eq_ignore_ascii_case(k))
            })
        });
        let by_name = snap
            .projects
            .iter()
            .find(|x| lower(&x.name) == lower(&p.name));
        match by_key.or(by_name) {
            Some(x) => d.project = Some(x.id.clone()),
            None => match p
                .key
                .as_deref()
                .map(str::to_uppercase)
                .filter(|k| crate::valid_key(k))
            {
                Some(key) if key != snap.settings.unassigned_key => {
                    // New projects get a slug from their key, as the app creates them.
                    let id = keys_planned
                        .entry(key.clone())
                        .or_insert_with(|| key.to_lowercase())
                        .clone();
                    d.project = Some(id);
                    d.new_project = Some((key, p.name.clone()));
                }
                _ => {}
            },
        }
    }
    for raw in &c.labels {
        let l = lower(raw);
        if l.is_empty() {
            continue;
        }
        match snap
            .labels
            .iter()
            .find(|x| x.id == l || lower(&x.name) == l)
        {
            Some(x) => d.labels.push(x.id.clone()),
            None if options.create_labels => d.new_labels.push(raw.trim().to_owned()),
            None => d.unknown.push(raw.trim().to_owned()),
        }
    }
    let find = |list: &[crate::Dictionary], raw: &Option<String>| {
        raw.as_deref().and_then(|r| {
            let l = lower(r);
            list.iter()
                .find(|x| x.id == l || lower(&x.name) == l)
                .map(|x| x.id.clone())
        })
    };
    d.kind = find(&snap.types, &c.kind);
    d.bucket = find(&snap.buckets, &c.bucket);
    if d.new_project.is_none() {
        let (status, labels, dropped, bucket) = fit(
            snap,
            d.project.as_deref(),
            &d.status,
            std::mem::take(&mut d.labels),
            d.bucket.take(),
        );
        d.status = status;
        d.labels = labels;
        d.bucket = bucket;
        let name = |id: &String| {
            snap.labels
                .iter()
                .find(|x| &x.id == id)
                .map_or_else(|| id.clone(), |x| x.name.clone())
        };
        d.unknown.extend(dropped.iter().map(name));
    }
    d
}

/// Maps `existing` source refs to the human id of the task that has them. Archived tasks
/// (an undone import among them) do not count, so the source can be brought in again.
fn imported(snap: &Snapshot) -> HashMap<String, String> {
    let key = |p: Option<&str>| {
        p.and_then(|p| snap.projects.iter().find(|x| x.id == p))
            .map_or_else(|| snap.settings.unassigned_key.clone(), |x| x.key.clone())
    };
    snap.tasks
        .iter()
        .filter(|t| !t.archived)
        .filter_map(|t| {
            t.source
                .clone()
                .map(|s| (s, format!("{}-{}", key(t.project.as_deref()), t.number)))
        })
        .collect()
}

fn target_project(snap: &Snapshot, options: &Options) -> Result<Option<String>, String> {
    let Some(p) = options.project.as_deref().filter(|p| !p.is_empty()) else {
        return Ok(None);
    };
    snap.projects
        .iter()
        .find(|x| x.id == p || x.key.eq_ignore_ascii_case(p))
        .map(|x| Some(x.id.clone()))
        .ok_or_else(|| format!("找不到项目「{p}」"))
}

pub fn preview(store: &TaskStore, source: &Source, options: &Options) -> Result<Preview, String> {
    preview_snapshot(&store.snapshot(), source, options)
}

/// The preview against a snapshot; a workspace without a task folder uses an empty one.
pub fn preview_snapshot(
    snap: &Snapshot,
    source: &Source,
    options: &Options,
) -> Result<Preview, String> {
    if source.candidates.len() > MAX_ITEMS {
        return Err(format!(
            "一次最多导入 {MAX_ITEMS} 项，这份文件有 {} 项，请分批导出",
            source.candidates.len()
        ));
    }
    let target = target_project(snap, options)?;
    let existing = imported(snap);
    let mut seen = HashSet::new();
    let mut keys = HashMap::new();
    let mut rows = Vec::new();
    let mut projects = Vec::new();
    let mut new_labels: Vec<String> = Vec::new();
    let mut unknown: Vec<String> = Vec::new();
    let refs: HashMap<&str, &str> = source
        .candidates
        .iter()
        .map(|c| (c.source_ref.as_str(), c.title.as_str()))
        .collect();
    for (index, c) in source.candidates.iter().enumerate() {
        let d = decide(
            snap,
            c,
            options,
            target.as_deref(),
            &mut seen,
            &existing,
            &mut keys,
        );
        if d.outcome == "new" {
            if let Some((key, name)) = &d.new_project {
                let shown = format!("{name}（{key}）");
                if !projects.contains(&shown) {
                    projects.push(shown);
                }
            }
            for l in &d.new_labels {
                if !new_labels.iter().any(|x| lower(x) == lower(l)) {
                    new_labels.push(l.clone());
                }
            }
            for l in &d.unknown {
                if !unknown.iter().any(|x| lower(x) == lower(l)) {
                    unknown.push(l.clone());
                }
            }
        }
        let status = snap
            .statuses
            .iter()
            .find(|s| s.id == d.status)
            .map_or_else(|| d.status.clone(), |s| s.name.clone());
        let project = match (&d.new_project, &d.project) {
            (Some((key, name)), _) => format!("{name}（新建 {key}）"),
            (None, Some(id)) => snap
                .projects
                .iter()
                .find(|x| &x.id == id)
                .map_or_else(|| id.clone(), |x| x.name.clone()),
            (None, None) => "无项目".into(),
        };
        let labels = d
            .labels
            .iter()
            .map(|id| {
                snap.labels
                    .iter()
                    .find(|x| &x.id == id)
                    .map_or_else(|| id.clone(), |x| x.name.clone())
            })
            .chain(d.new_labels.iter().cloned())
            .collect();
        rows.push(Row {
            index,
            title: c.title.clone(),
            source_ref: c.source_ref.clone(),
            outcome: d.outcome.into(),
            reason: d.reason,
            status,
            project,
            labels,
            unknown_labels: d.unknown,
            parent: c
                .parent_ref
                .as_deref()
                .and_then(|p| refs.get(p))
                .map(|t| (*t).to_owned()),
        });
    }
    let count = |o: &str| rows.iter().filter(|r| r.outcome == o).count();
    Ok(Preview {
        kind: source.kind.clone(),
        label: source.label.clone(),
        new: count("new"),
        skip: count("skip"),
        problem: count("problem"),
        rows,
        projects_to_create: projects,
        labels_to_create: new_labels,
        unknown_labels: unknown,
        warnings: source.warnings.clone(),
        include_closed_default: source.include_closed_default,
    })
}

/// A checklist line to turn into a link once its task exists.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteLink {
    pub path: String,
    pub line: usize,
    pub original: String,
    pub replacement: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Applied {
    pub receipt: Value,
    pub created: usize,
    /// For checklist imports: the note lines the caller rewrites.
    pub note_links: Vec<NoteLink>,
}

fn mutation(value: Value) -> Result<Mutation, String> {
    serde_json::from_value(value).map_err(|e| format!("内部请求无效：{e}"))
}

pub fn apply(store: &mut TaskStore, source: &Source, options: &Options) -> Result<Applied, String> {
    preview(store, source, options)?;
    let snap = store.snapshot();
    let target = target_project(&snap, options)?;
    let existing = imported(&snap);
    let mut seen = HashSet::new();
    let mut keys = HashMap::new();
    let decisions: Vec<Decision> = source
        .candidates
        .iter()
        .map(|c| {
            decide(
                &snap,
                c,
                options,
                target.as_deref(),
                &mut seen,
                &existing,
                &mut keys,
            )
        })
        .collect();
    let mut created_projects: HashMap<String, String> = HashMap::new();
    let mut created_labels: HashMap<String, String> = HashMap::new();
    let mut receipt_projects = Vec::new();
    let mut receipt_labels = Vec::new();
    let mut created = Vec::new();
    let mut note_links = Vec::new();
    // Whatever was written before a failure still gets a receipt, so it can be undone.
    let failure = (|| -> Result<(), String> {
        // Projects and labels first, so tasks can point at them.
        for d in decisions.iter().filter(|d| d.outcome == "new") {
            if let Some((key, name)) = &d.new_project {
                if !created_projects.contains_key(key) {
                    let r = store
                        .apply_as(
                            mutation(json!({"kind":"createProject","name":name,"key":key}))?,
                            ACTOR,
                        )
                        .map_err(|e| e.to_string())?;
                    let id = r.created.first().cloned().ok_or("项目创建失败")?;
                    receipt_projects.push(id.clone());
                    created_projects.insert(key.clone(), id);
                }
            }
            for label in &d.new_labels {
                if let std::collections::hash_map::Entry::Vacant(slot) =
                    created_labels.entry(lower(label))
                {
                    let r = store
                        .apply_as(
                            mutation(json!({
                                "kind": "upsertDictionary",
                                "dictionary": "labels",
                                "set": { "name": label },
                            }))?,
                            ACTOR,
                        )
                        .map_err(|e| e.to_string())?;
                    let id = r.created.first().cloned().ok_or("标签创建失败")?;
                    receipt_labels.push(id.clone());
                    slot.insert(id);
                }
            }
        }
        // Source order, so numbers follow it; a child listed before its parent waits for it.
        let index: HashMap<&str, usize> = source
            .candidates
            .iter()
            .enumerate()
            .map(|(i, c)| (c.source_ref.as_str(), i))
            .collect();
        let count = source.candidates.len();
        let mut placed = vec![false; count];
        let mut order = Vec::with_capacity(count);
        while order.len() < count {
            let before = order.len();
            for i in 0..count {
                let ready = source.candidates[i]
                    .parent_ref
                    .as_deref()
                    .and_then(|p| index.get(p))
                    .is_none_or(|&p| placed[p] || p == i);
                if !placed[i] && ready {
                    placed[i] = true;
                    order.push(i);
                }
            }
            if order.len() == before {
                // A cycle in the source: the rest go in as they are.
                order.extend((0..count).filter(|&i| !placed[i]));
                break;
            }
        }
        // A parent that already exists is found by its source ref.
        let mut ids: HashMap<String, String> = snap
            .tasks
            .iter()
            .filter(|t| !t.archived)
            .filter_map(|t| t.source.clone().map(|s| (s, t.id.clone())))
            .collect();
        for i in order {
            let (c, d) = (&source.candidates[i], &decisions[i]);
            if d.outcome != "new" {
                continue;
            }
            let project = match &d.new_project {
                Some((key, _)) => created_projects.get(key).cloned(),
                None => d.project.clone(),
            };
            let mut labels = d.labels.clone();
            labels.extend(
                d.new_labels
                    .iter()
                    .filter_map(|l| created_labels.get(&lower(l)).cloned()),
            );
            let parent = c.parent_ref.as_deref().and_then(|p| ids.get(p)).cloned();
            // A child follows its parent's project, and that project's limits.
            let project = match &parent {
                Some(pid) => store.resolve(pid).and_then(|p| p.project).or(project),
                None => project,
            };
            let (status, labels, _, bucket) = fit(
                &snap,
                project.as_deref(),
                &d.status,
                labels,
                d.bucket.clone(),
            );
            let draft = json!({
                "title": c.title.trim(),
                "project": project,
                "status": status,
                "priority": c.priority.min(4),
                "type": d.kind,
                "labels": labels,
                "bucket": bucket,
                "due": c.due.as_deref().and_then(date),
                "parent": parent,
                "description": c.description,
                "source": c.source_ref,
                "previousIds": c.previous_id.iter().collect::<Vec<_>>(),
            });
            let r = store
                .apply_as(mutation(json!({"kind":"createTask","draft":draft}))?, ACTOR)
                .map_err(|e| format!("「{}」：{e}", c.title))?;
            let id = r.applied.first().cloned().ok_or("创建失败")?;
            created.push(id.clone());
            ids.insert(c.source_ref.clone(), id.clone());
            for body in c.comments.iter().filter(|b| !b.trim().is_empty()) {
                store
                    .apply_as(
                        mutation(json!({"kind":"comment","id":id,"body":body}))?,
                        ACTOR,
                    )
                    .map_err(|e| e.to_string())?;
            }
            if let Some(note) = &c.note {
                let task = store.resolve(&id).ok_or("创建失败")?;
                let now = store.snapshot();
                let key = task
                    .project
                    .as_deref()
                    .and_then(|p| now.projects.iter().find(|x| x.id == p))
                    .map_or_else(|| now.settings.unassigned_key.clone(), |x| x.key.clone());
                if let Some(replacement) =
                    checklist::link_line(&note.line_text, &format!("{key}-{}", task.number), &id)
                {
                    note_links.push(NoteLink {
                        path: note.path.clone(),
                        line: note.line,
                        original: note.line_text.clone(),
                        replacement,
                    });
                }
            }
        }
        Ok(())
    })()
    .err();
    let receipt_id = new_id();
    let receipt = json!({
        "id": receipt_id,
        "at": now_iso(),
        "kind": source.kind,
        "label": source.label,
        "fingerprint": source.fingerprint,
        "tasks": created,
        "projects": receipt_projects,
        "labels": receipt_labels,
        "undone": false,
        "partial": failure.is_some(),
    });
    let wrote = !created.is_empty() || !receipt_projects.is_empty() || !receipt_labels.is_empty();
    if wrote {
        store
            .write_receipt(&receipt_id, &receipt)
            .map_err(|e| e.to_string())?;
    }
    if let Some(error) = failure {
        return Err(if created.is_empty() {
            error
        } else {
            format!(
                "{error}。已导入的 {} 个任务记在导入记录中，可以撤销",
                created.len()
            )
        });
    }
    Ok(Applied {
        created: created.len(),
        receipt,
        note_links,
    })
}

pub fn receipts(store: &TaskStore) -> Result<Vec<Value>, String> {
    store.read_receipts().map_err(|e| e.to_string())
}

/// Archives what an import created and marks the receipt undone. Projects and labels it
/// created stay (other tasks may use them by now); tasks edited since are archived too, as
/// archiving keeps everything.
pub fn undo(store: &mut TaskStore, receipt_id: &str) -> Result<usize, String> {
    let mut receipt = receipts(store)?
        .into_iter()
        .find(|r| r["id"] == receipt_id)
        .ok_or_else(|| format!("找不到导入记录「{receipt_id}」"))?;
    if receipt["undone"] == true {
        return Err("这次导入已经撤销".into());
    }
    let mut archived = 0;
    for id in receipt["tasks"].as_array().cloned().unwrap_or_default() {
        let Some(id) = id.as_str() else { continue };
        let Some(task) = store.resolve(id) else {
            continue;
        };
        if task.archived {
            continue;
        }
        store
            .apply_as(
                mutation(json!({"kind":"patch","ids":[id],"revisions":[task.revision],"set":{"archived":true}}))?,
                ACTOR,
            )
            .map_err(|e| e.to_string())?;
        archived += 1;
    }
    receipt["undone"] = json!(true);
    receipt["undoneAt"] = json!(now_iso());
    store
        .write_receipt(receipt_id, &receipt)
        .map_err(|e| e.to_string())?;
    Ok(archived)
}

/// Fingerprint for the bytes a source was read from.
pub(crate) fn fingerprint(bytes: &[u8]) -> String {
    revision(&String::from_utf8_lossy(bytes))
}
