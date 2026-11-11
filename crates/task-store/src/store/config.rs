//! Workspace configuration: dictionaries, custom statuses, settings, saved views, project
//! limits and description search. Every change that touches tasks rewrites only the keys it
//! changes, like any other task edit.
use super::{
    compose, create_sub, fm, invalid, new_id, open_sub, parse_view, read_optional, read_text,
    valid_key, valid_slug, write_atomic, MutationResult, Result, StoreError, TaskStore,
};
use crate::model::{Category, Status, View};
use cap_std::fs::Dir;
use serde_json::{json, Map, Value};

const KINDS: [&str; 4] = ["labels", "types", "buckets", "statuses"];
/// The palette plus the built-in status colours, which new statuses inherit.
const COLORS: [&str; 14] = [
    "red",
    "orange",
    "yellow",
    "green",
    "blue",
    "violet",
    "pink",
    "gray",
    "todo",
    "backlog",
    "started",
    "review",
    "done",
    "cancelled",
];
const CATEGORY_ORDER: [Category; 6] = [
    Category::Backlog,
    Category::Unstarted,
    Category::Started,
    Category::Review,
    Category::Completed,
    Category::Cancelled,
];

/// The four views every workspace starts with; written once, then owned by the user.
pub(super) fn seed_views(dir: &Dir) -> Result<()> {
    if open_sub(dir, "views")?.is_some() {
        return Ok(());
    }
    let views = create_sub(dir, "views")?;
    let seeds = [
        ("all-open", "全部未完成", "list", "is:open"),
        (
            "due-week",
            "本周到期",
            "calendar",
            "is:open due:<7d -due:overdue",
        ),
        ("overdue", "已逾期", "clock", "is:overdue"),
        ("recent", "最近完成", "check", "completed:<7d"),
    ];
    for (i, (id, name, icon, query)) in seeds.iter().enumerate() {
        let text = compose(
            &[
                ("name", json!(name)),
                ("icon", json!(icon)),
                ("query", json!(query)),
                ("order", json!(i + 1)),
            ],
            "",
        );
        write_atomic(&views, &format!("{id}.md"), &text)?;
    }
    Ok(())
}

/// A readable, stable file name: ASCII words from the name, otherwise a short random id.
pub(super) fn slug_for(name: &str, taken: impl Fn(&str) -> bool) -> String {
    let ascii: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let base = if ascii.len() >= 2 && ascii.len() <= 40 {
        ascii
    } else {
        new_id()[..8].to_owned()
    };
    let mut slug = base.clone();
    let mut n = 2;
    while taken(&slug) {
        slug = format!("{base}-{n}");
        n += 1;
    }
    slug
}

fn text_field(set: &Map<String, Value>, key: &str, max: usize) -> Result<Option<String>> {
    match set.get(key) {
        None => Ok(None),
        Some(v) => {
            let t = v.as_str().map(str::trim).unwrap_or("");
            if t.is_empty() || t.chars().count() > max {
                return invalid(format!("{key} 不能为空，且不超过 {max} 个字符"));
            }
            Ok(Some(t.to_owned()))
        }
    }
}

impl TaskStore {
    fn dictionary(&self, kind: &str) -> Vec<(String, String)> {
        match kind {
            "labels" => self
                .labels
                .iter()
                .map(|d| (d.id.clone(), d.name.clone()))
                .collect(),
            "types" => self
                .types
                .iter()
                .map(|d| (d.id.clone(), d.name.clone()))
                .collect(),
            "buckets" => self
                .buckets
                .iter()
                .map(|d| (d.id.clone(), d.name.clone()))
                .collect(),
            _ => self
                .statuses
                .iter()
                .map(|s| (s.id.clone(), s.name.clone()))
                .collect(),
        }
    }

    pub(super) fn upsert_dictionary(
        &mut self,
        kind: &str,
        id: Option<&str>,
        set: &Map<String, Value>,
        result: &mut MutationResult,
    ) -> Result<()> {
        if !KINDS.contains(&kind) {
            return invalid("未知的配置类型");
        }
        let existing = self.dictionary(kind);
        if let Some(id) = id {
            if !existing.iter().any(|(e, _)| e == id) {
                return Err(StoreError::NotFound("配置项"));
            }
            if kind == "statuses" && self.status(id).is_some_and(|s| s.builtin) {
                return invalid("内置状态不能修改");
            }
        }
        let name = text_field(set, "name", 40)?;
        if id.is_none() && name.is_none() {
            return invalid("名称不能为空");
        }
        if let Some(n) = &name {
            if existing
                .iter()
                .any(|(e, other)| other == n && Some(e.as_str()) != id)
            {
                return invalid(format!("「{n}」已存在"));
            }
        }
        let mut changes: Vec<(String, Value)> = Vec::new();
        if let Some(n) = name {
            changes.push(("name".into(), json!(n)));
        }
        for (key, value) in set {
            match key.as_str() {
                "name" => {}
                "color" => match value.as_str() {
                    Some(c) if COLORS.contains(&c) => changes.push(("color".into(), json!(c))),
                    _ => return invalid("颜色无效"),
                },
                "order" => changes.push((
                    "order".into(),
                    json!(value
                        .as_f64()
                        .ok_or_else(|| StoreError::Invalid("排序值无效".into()))?),
                )),
                "addLabels" if kind == "types" => {
                    let labels: Vec<String> = value
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                    self.check_labels(&labels)?;
                    changes.push((
                        "add_labels".into(),
                        if labels.is_empty() {
                            Value::Null
                        } else {
                            json!(labels)
                        },
                    ));
                }
                "setPriority" if kind == "types" => {
                    let p = value.as_u64().filter(|p| *p <= 4).unwrap_or(0) as usize;
                    changes.push((
                        "set_priority".into(),
                        if p == 0 {
                            Value::Null
                        } else {
                            json!(crate::model::PRIORITIES[p])
                        },
                    ));
                }
                "category" if kind == "statuses" && id.is_none() => {
                    let c = value.as_str().and_then(Category::parse);
                    if c.is_none() {
                        return invalid("状态类别无效");
                    }
                    changes.push(("category".into(), value.clone()));
                }
                other => return invalid(format!("不支持修改字段 {other}")),
            }
        }
        if kind == "statuses" && id.is_none() && !changes.iter().any(|(k, _)| k == "category") {
            return invalid("新状态需要类别");
        }
        let dir = create_sub(&self.dir, kind)?;
        match id {
            Some(id) => {
                let name = format!("{id}.md");
                let text = read_text(&dir, &name)?;
                write_atomic(&dir, &name, &fm::patch(&text, &changes))?;
                result.applied.push(id.into());
            }
            None => {
                let taken: Vec<String> = existing.iter().map(|(e, _)| e.clone()).collect();
                let display = changes
                    .iter()
                    .find(|(k, _)| k == "name")
                    .and_then(|(_, v)| v.as_str())
                    .unwrap_or("");
                let slug = slug_for(display, |s| {
                    taken.iter().any(|t| t == s)
                        || read_optional(&dir, &format!("{s}.md"))
                            .ok()
                            .flatten()
                            .is_some()
                });
                if !changes.iter().any(|(k, _)| k == "order") {
                    changes.push(("order".into(), json!(existing.len() + 1)));
                }
                let text = fm::patch("---\n---\n", &changes);
                write_atomic(&dir, &format!("{slug}.md"), &text)?;
                result.created.push(slug);
            }
        }
        Ok(())
    }

    /// Deleting a value also removes it from every task, so no task points at nothing.
    pub(super) fn delete_dictionary(
        &mut self,
        kind: &str,
        id: &str,
        result: &mut MutationResult,
    ) -> Result<()> {
        if !KINDS.contains(&kind) || !valid_slug(id) {
            return invalid("未知的配置项");
        }
        let replacement: Option<String> = if kind == "statuses" {
            let status = self.status(id).ok_or(StoreError::NotFound("状态"))?;
            if status.builtin {
                return invalid("内置状态不能删除");
            }
            let category = status.category;
            Some(
                self.statuses
                    .iter()
                    .find(|s| s.builtin && s.category == category)
                    .map(|s| s.id.clone())
                    .unwrap_or_else(|| "todo".into()),
            )
        } else {
            if !self.dictionary(kind).iter().any(|(e, _)| e == id) {
                return Err(StoreError::NotFound("配置项"));
            }
            None
        };
        let affected: Vec<(String, Vec<(String, Value)>)> = self
            .tasks()
            .filter_map(|t| {
                let change = match kind {
                    "labels" if t.labels.iter().any(|l| l == id) => {
                        let rest: Vec<&String> = t.labels.iter().filter(|l| *l != id).collect();
                        (
                            "labels".to_owned(),
                            if rest.is_empty() {
                                Value::Null
                            } else {
                                json!(rest)
                            },
                        )
                    }
                    "types" if t.kind.as_deref() == Some(id) => ("type".into(), Value::Null),
                    "buckets" if t.bucket.as_deref() == Some(id) => ("bucket".into(), Value::Null),
                    "statuses" if t.status == id => ("status".into(), json!(replacement)),
                    _ => return None,
                };
                Some((t.id.clone(), vec![change]))
            })
            .collect();
        if let Some(items) = open_sub(&self.dir, "items")? {
            for (task, changes) in &affected {
                let name = format!("{task}.md");
                let text = read_text(&items, &name)?;
                write_atomic(&items, &name, &fm::patch(&text, changes))?;
                result.applied.push(task.clone());
            }
        }
        // Types may add the deleted label; projects may list the deleted value.
        if kind == "labels" {
            if let Some(dir) = open_sub(&self.dir, "types")? {
                for t in self
                    .types
                    .iter()
                    .filter(|t| t.add_labels.iter().any(|l| l == id))
                {
                    let name = format!("{}.md", t.id);
                    let rest: Vec<&String> = t.add_labels.iter().filter(|l| *l != id).collect();
                    let text = read_text(&dir, &name)?;
                    let value = if rest.is_empty() {
                        Value::Null
                    } else {
                        json!(rest)
                    };
                    write_atomic(
                        &dir,
                        &name,
                        &fm::patch(&text, &[("add_labels".into(), value)]),
                    )?;
                }
            }
        }
        if kind != "types" {
            self.drop_from_project_limits(kind, id)?;
        }
        let dir = open_sub(&self.dir, kind)?.ok_or(StoreError::NotFound("配置项"))?;
        dir.remove_file(format!("{id}.md"))?;
        Ok(())
    }

    fn drop_from_project_limits(&self, kind: &str, id: &str) -> Result<()> {
        let Some(dir) = open_sub(&self.dir, "projects")? else {
            return Ok(());
        };
        for p in &self.projects {
            let list = match kind {
                "labels" => &p.labels,
                "buckets" => &p.buckets,
                _ => &p.statuses,
            };
            if let Some(list) = list.as_ref().filter(|l| l.iter().any(|x| x == id)) {
                let rest: Vec<&String> = list.iter().filter(|x| *x != id).collect();
                let name = format!("{}.md", p.id);
                let text = read_text(&dir, &name)?;
                write_atomic(
                    &dir,
                    &name,
                    &fm::patch(&text, &[(kind.into(), json!(rest))]),
                )?;
            }
        }
        Ok(())
    }

    pub(super) fn update_settings(
        &mut self,
        set: &Map<String, Value>,
        result: &mut MutationResult,
    ) -> Result<()> {
        let mut changes: Vec<(String, Value)> = Vec::new();
        for (key, value) in set {
            match key.as_str() {
                "unassignedKey" => {
                    let k = value.as_str().unwrap_or("").trim().to_uppercase();
                    if !valid_key(&k) {
                        return invalid("key 必须是 2–5 位大写字母或数字，以字母开头");
                    }
                    if k != self.settings.unassigned_key && self.key_taken(&k, None) {
                        return invalid(format!("{k} 已被项目使用"));
                    }
                    changes.push(("unassigned_key".into(), json!(k)));
                }
                "comments" => {
                    changes.push(("comments".into(), json!(value.as_bool().unwrap_or(true))))
                }
                "cyclesEnabled" => changes.push((
                    "cycles_enabled".into(),
                    json!(value.as_bool().unwrap_or(false)),
                )),
                "cycleWeeks" => match value.as_u64().filter(|w| (1..=4).contains(w)) {
                    Some(w) => changes.push(("cycle_weeks".into(), json!(w))),
                    None => return invalid("迭代长度为 1–4 周"),
                },
                "cycleStartDay" => match value.as_u64().filter(|d| (1..=7).contains(d)) {
                    Some(d) => changes.push(("cycle_start_day".into(), json!(d))),
                    None => return invalid("起始日无效"),
                },
                other => return invalid(format!("不支持修改设置 {other}")),
            }
        }
        // settings.yml is plain YAML; reuse the frontmatter patcher on a wrapped copy.
        let current = read_optional(&self.dir, "settings.yml")?.unwrap_or_default();
        let wrapped = format!(
            "---\n{current}{}---\n",
            if current.is_empty() || current.ends_with('\n') {
                ""
            } else {
                "\n"
            }
        );
        let patched = fm::patch(&wrapped, &changes);
        let inner = fm::front_text(&patched);
        write_atomic(&self.dir, "settings.yml", inner)?;
        result.applied.push("settings".into());
        Ok(())
    }

    pub(super) fn save_view(
        &mut self,
        id: Option<&str>,
        set: &Map<String, Value>,
        result: &mut MutationResult,
    ) -> Result<()> {
        let mut changes: Vec<(String, Value)> = Vec::new();
        if let Some(n) = text_field(set, "name", 40)? {
            changes.push(("name".into(), json!(n)));
        } else if id.is_none() {
            return invalid("视图名称不能为空");
        }
        for (key, value) in set {
            match key.as_str() {
                "name" => {}
                "query" => {
                    let q = value.as_str().unwrap_or("");
                    if q.len() > 2000 {
                        return invalid("查询过长");
                    }
                    changes.push(("query".into(), json!(q)));
                }
                "icon" => changes.push(("icon".into(), json!(value.as_str().unwrap_or("list")))),
                "project" => {
                    if let Some(p) = value.as_str() {
                        if self.project(p).is_none() {
                            return Err(StoreError::NotFound("项目"));
                        }
                    }
                    changes.push(("project".into(), value.clone()));
                }
                "layout" => match value.as_str() {
                    Some(l @ ("list" | "board")) => changes.push(("layout".into(), json!(l))),
                    _ => return invalid("布局无效"),
                },
                "groupBy" => match value.as_str() {
                    Some(g @ ("status" | "priority" | "type" | "bucket" | "project" | "none")) => {
                        changes.push(("group_by".into(), json!(g)))
                    }
                    _ => return invalid("分组无效"),
                },
                "orderBy" => match value.as_str() {
                    Some(o @ ("manual" | "priority" | "due" | "created" | "updated")) => {
                        changes.push(("order_by".into(), json!(o)))
                    }
                    _ => return invalid("排序无效"),
                },
                other => return invalid(format!("不支持修改字段 {other}")),
            }
        }
        let dir = create_sub(&self.dir, "views")?;
        match id {
            Some(id) => {
                if !self.views.iter().any(|v| v.id == id) {
                    return Err(StoreError::NotFound("视图"));
                }
                let name = format!("{id}.md");
                let text = read_text(&dir, &name)?;
                write_atomic(&dir, &name, &fm::patch(&text, &changes))?;
                result.applied.push(id.into());
            }
            None => {
                let display = changes
                    .iter()
                    .find(|(k, _)| k == "name")
                    .and_then(|(_, v)| v.as_str())
                    .unwrap_or("");
                let slug = slug_for(display, |s| self.views.iter().any(|v| v.id == s));
                changes.push(("order".into(), json!(self.views.len() + 1)));
                write_atomic(
                    &dir,
                    &format!("{slug}.md"),
                    &fm::patch("---\n---\n", &changes),
                )?;
                result.created.push(slug);
            }
        }
        Ok(())
    }

    pub(super) fn delete_view(&mut self, id: &str, result: &mut MutationResult) -> Result<()> {
        if !self.views.iter().any(|v| v.id == id) {
            return Err(StoreError::NotFound("视图"));
        }
        if let Some(dir) = open_sub(&self.dir, "projects")? {
            for p in self
                .projects
                .iter()
                .filter(|p| p.views.iter().any(|v| v == id))
            {
                let rest: Vec<&String> = p.views.iter().filter(|v| *v != id).collect();
                let name = format!("{}.md", p.id);
                let text = read_text(&dir, &name)?;
                let value = if rest.is_empty() {
                    Value::Null
                } else {
                    json!(rest)
                };
                write_atomic(&dir, &name, &fm::patch(&text, &[("views".into(), value)]))?;
            }
        }
        open_sub(&self.dir, "views")?
            .ok_or(StoreError::NotFound("视图"))?
            .remove_file(format!("{id}.md"))?;
        result.applied.push(id.into());
        Ok(())
    }

    pub(super) fn read_views(&self, invalid: &mut Vec<super::InvalidFile>) -> Result<Vec<View>> {
        let Some(sub) = open_sub(&self.dir, "views")? else {
            return Ok(Vec::new());
        };
        let mut out = Vec::new();
        for entry in sub.entries()? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let Some(id) = name.strip_suffix(".md").filter(|id| valid_slug(id)) else {
                continue;
            };
            match read_text(&sub, &name)
                .map_err(|e| e.to_string())
                .and_then(|t| parse_view(id, &t))
            {
                Ok(v) => out.push(v),
                Err(error) => invalid.push(super::InvalidFile {
                    path: format!("views/{name}"),
                    error,
                }),
            }
        }
        out.sort_by(|a, b| a.order.total_cmp(&b.order).then_with(|| a.id.cmp(&b.id)));
        Ok(out)
    }

    /// The project's statuses in display order (all when unlimited).
    pub(super) fn allowed_statuses(&self, project: Option<&str>) -> Vec<&Status> {
        let limit = project
            .and_then(|p| self.project(p))
            .and_then(|p| p.statuses.as_ref());
        self.statuses
            .iter()
            .filter(|s| limit.is_none_or(|l| l.iter().any(|x| x == &s.id)))
            .collect()
    }

    /// Same category first, otherwise the closest category, so "done" stays closed.
    pub(super) fn nearest_status(&self, project: Option<&str>, current: &str) -> String {
        let allowed = self.allowed_statuses(project);
        if allowed.iter().any(|s| s.id == current) {
            return current.into();
        }
        let rank = |c: Category| CATEGORY_ORDER.iter().position(|x| *x == c).unwrap_or(1) as i32;
        let from = self.status(current).map_or(1, |s| rank(s.category));
        allowed
            .iter()
            .min_by_key(|s| ((rank(s.category) - from).abs(), s.order as i64))
            .map_or_else(|| current.into(), |s| s.id.clone())
    }

    /// A project must keep one open and one completed status.
    pub(super) fn validate_limit(&self, kind: &str, value: &Value) -> Result<Value> {
        if value.is_null() || value.as_str() == Some("all") {
            return Ok(Value::Null);
        }
        let list: Vec<String> = value
            .as_array()
            .ok_or_else(|| StoreError::Invalid("限定值应为列表".into()))?
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect();
        let known = self.dictionary(kind);
        if let Some(bad) = list.iter().find(|x| !known.iter().any(|(id, _)| id == *x)) {
            return invalid(format!("未知的值 {bad}"));
        }
        if kind == "statuses" {
            let categories: Vec<Category> = list
                .iter()
                .filter_map(|x| self.status(x))
                .map(|s| s.category)
                .collect();
            if !categories.iter().any(|c| c.open()) || !categories.contains(&Category::Completed) {
                return invalid("项目至少要保留一个未关闭状态和一个已完成状态");
            }
        }
        Ok(json!(list))
    }

    /// After a project narrows its statuses, tasks on a removed status move to the nearest one.
    pub(super) fn migrate_statuses(
        &mut self,
        project: &str,
        result: &mut MutationResult,
    ) -> Result<usize> {
        self.refresh()?;
        let Some(items) = open_sub(&self.dir, "items")? else {
            return Ok(0);
        };
        let moves: Vec<(String, String)> = self
            .tasks()
            .filter(|t| t.project.as_deref() == Some(project))
            .filter_map(|t| {
                let to = self.nearest_status(Some(project), &t.status);
                (to != t.status).then(|| (t.id.clone(), to))
            })
            .collect();
        for (id, to) in &moves {
            let name = format!("{id}.md");
            let text = read_text(&items, &name)?;
            write_atomic(
                &items,
                &name,
                &fm::patch(&text, &[("status".into(), json!(to))]),
            )?;
            result.applied.push(id.clone());
        }
        Ok(moves.len())
    }

    /// Ids of tasks whose title or description contains every term (case-insensitive).
    pub fn search(&self, text: &str) -> Vec<String> {
        let terms: Vec<String> = text
            .split_whitespace()
            .take(16)
            .map(str::to_lowercase)
            .collect();
        if terms.is_empty() {
            return Vec::new();
        }
        self.items
            .iter()
            .filter_map(|(id, c)| {
                let task = c.task.as_ref().ok()?;
                let title = task.title.to_lowercase();
                terms
                    .iter()
                    .all(|t| title.contains(t) || c.body.contains(t))
                    .then(|| id.clone())
            })
            .collect()
    }
}
