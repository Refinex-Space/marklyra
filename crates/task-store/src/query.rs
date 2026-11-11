//! The task query language, evaluated on the host for AI tools, the command line and MCP.
//! It mirrors `apps/desktop/src/features/tasks/model/query.ts`; both run the same vectors in
//! `tests/fixtures/query-vectors.json`, so a query means the same thing everywhere.
use crate::model::{Category, Cycle, Dictionary, Project, Settings, Status, Task};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Key {
    Status,
    Priority,
    Label,
    Type,
    Bucket,
    Cycle,
    Project,
    Is,
    Has,
    Due,
    Created,
    Completed,
}
const KEYS: [(Key, &[&str]); 12] = [
    (Key::Status, &["status", "state", "状态"]),
    (Key::Priority, &["priority", "p", "优先级"]),
    (Key::Label, &["label", "tag", "标签"]),
    (Key::Type, &["type", "类型"]),
    (Key::Bucket, &["bucket", "队列"]),
    (Key::Cycle, &["cycle", "迭代"]),
    (Key::Project, &["project", "项目"]),
    (Key::Is, &["is", "是"]),
    (Key::Has, &["has", "有"]),
    (Key::Due, &["due", "到期"]),
    (Key::Created, &["created", "创建"]),
    (Key::Completed, &["completed", "完成"]),
];
const PRIORITIES: [(u8, &str, &str); 5] = [
    (1, "urgent", "紧急"),
    (2, "high", "高"),
    (3, "medium", "中"),
    (4, "low", "低"),
    (0, "none", "无优先级"),
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Chip {
    pub key: Key,
    pub negated: bool,
    pub values: Vec<String>,
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Query {
    pub chips: Vec<Chip>,
    pub text: String,
}

pub fn canonical_key(raw: &str) -> Option<Key> {
    let lower = raw.to_lowercase();
    KEYS.iter()
        .find(|(_, aliases)| aliases.contains(&lower.as_str()))
        .map(|(k, _)| *k)
}

/// Same tokens as the TypeScript `TOKEN` expression:
/// `-key:value`, `key:"quoted value"`, `"quoted text"` and plain words.
pub fn parse(source: &str) -> Query {
    let chars: Vec<char> = source.chars().collect();
    let mut chips = Vec::new();
    let mut text: Vec<String> = Vec::new();
    let mut i = 0;
    let run_end = |from: usize| {
        let mut j = from;
        while j < chars.len() && !chars[j].is_whitespace() {
            j += 1;
        }
        j
    };
    let closing = |from: usize| (from..chars.len()).find(|&j| chars[j] == '"');
    while i < chars.len() {
        if chars[i].is_whitespace() {
            i += 1;
            continue;
        }
        let start = i;
        // key:value — the key stops at whitespace, ':' or '"'.
        let key_start = if chars[i] == '-' { i + 1 } else { i };
        let mut k = key_start;
        while k < chars.len() && !chars[k].is_whitespace() && chars[k] != ':' && chars[k] != '"' {
            k += 1;
        }
        if k > key_start && k < chars.len() && chars[k] == ':' {
            let value_start = k + 1;
            let (raw, end) = match (chars.get(value_start), closing(value_start + 1)) {
                (Some('"'), Some(close)) => (
                    chars[value_start + 1..close].iter().collect::<String>(),
                    close + 1,
                ),
                _ => {
                    let end = run_end(value_start);
                    (chars[value_start..end].iter().collect(), end)
                }
            };
            let raw_key: String = chars[key_start..k].iter().collect();
            match canonical_key(&raw_key).filter(|_| !raw.is_empty()) {
                Some(key) => chips.push(Chip {
                    key,
                    negated: key_start > start,
                    values: raw
                        .split(',')
                        .filter(|v| !v.is_empty())
                        .map(String::from)
                        .collect(),
                }),
                None => text.push(chars[start..end].iter().collect()),
            }
            i = end;
            continue;
        }
        if chars[i] == '"' {
            if let Some(close) = closing(i + 1) {
                text.push(chars[i + 1..close].iter().collect());
                i = close + 1;
                continue;
            }
        }
        let end = run_end(i);
        text.push(chars[i..end].iter().collect());
        i = end;
    }
    Query {
        chips,
        text: text.join(" "),
    }
}

/// Seconds since the epoch for `YYYY-MM-DDTHH:MM:SS[.fff](Z|±HH:MM)`.
pub fn parse_instant(iso: &str) -> Option<i64> {
    let day = crate::store::day_number(iso.get(..10)?)?;
    let rest = iso.get(10..)?;
    let rest = rest.strip_prefix('T').or_else(|| rest.strip_prefix(' '))?;
    let num = |s: Option<&str>| s.and_then(|s| s.parse::<i64>().ok());
    let (h, m, s) = (
        num(rest.get(0..2))?,
        num(rest.get(3..5))?,
        num(rest.get(6..8))?,
    );
    let mut tail = rest.get(8..)?;
    if let Some(frac) = tail.strip_prefix('.') {
        tail = frac.trim_start_matches(|c: char| c.is_ascii_digit());
    }
    let offset = match tail {
        "Z" | "" => 0,
        t if t.len() == 6 && (t.starts_with('+') || t.starts_with('-')) => {
            let sign = if t.starts_with('-') { -1 } else { 1 };
            sign * (num(t.get(1..3))? * 3600 + num(t.get(4..6))? * 60)
        }
        _ => return None,
    };
    Some(day * 86_400 + h * 3600 + m * 60 + s - offset)
}

/// Everything a query may look at, borrowed from one snapshot.
pub struct QueryContext<'a> {
    pub tasks: &'a [Task],
    pub statuses: &'a [Status],
    pub labels: &'a [Dictionary],
    pub types: &'a [Dictionary],
    pub buckets: &'a [Dictionary],
    pub projects: &'a [Project],
    pub cycles: &'a [Cycle],
    pub settings: &'a Settings,
    /// Lowercased descriptions by task id; free text also searches them.
    pub bodies: Option<&'a HashMap<String, String>>,
    /// The caller's local date as a day number (see `day_number`).
    pub today: i64,
    /// The current instant in seconds since the epoch.
    pub now: i64,
}

impl<'a> QueryContext<'a> {
    fn status(&self, id: &str) -> Option<&'a Status> {
        self.statuses
            .iter()
            .find(|s| s.id == id)
            .or_else(|| self.statuses.iter().find(|s| s.id == "todo"))
    }
    fn category(&self, task: &Task) -> Category {
        self.status(&task.status)
            .map_or(Category::Unstarted, |s| s.category)
    }
    fn is_open(&self, task: &Task) -> bool {
        self.category(task).open()
    }
    fn key(&self, project: Option<&str>) -> String {
        project
            .and_then(|p| self.projects.iter().find(|x| x.id == p))
            .map_or_else(|| self.settings.unassigned_key.clone(), |p| p.key.clone())
    }
    pub fn human_id(&self, task: &Task) -> String {
        format!("{}-{}", self.key(task.project.as_deref()), task.number)
    }
    fn active_cycle(&self) -> Option<u32> {
        self.cycles
            .iter()
            .find(|c| c.state == "active")
            .map(|c| c.number)
    }
    fn upcoming_cycle(&self) -> Option<u32> {
        self.cycles
            .iter()
            .find(|c| c.state == "upcoming")
            .map(|c| c.number)
    }
    fn previous_cycle(&self) -> Option<u32> {
        self.cycles
            .iter()
            .rfind(|c| c.state == "completed")
            .map(|c| c.number)
    }
    fn days_until(&self, due: &str) -> Option<i64> {
        crate::store::day_number(due).map(|d| d - self.today)
    }
    fn within(&self, iso: Option<&str>, value: &str) -> bool {
        let Some(at) = iso.and_then(parse_instant) else {
            return false;
        };
        let (op, rest) = match value.chars().next() {
            Some(c @ ('<' | '>')) => (c, &value[1..]),
            _ => return false,
        };
        let Some(unit_char) = rest.chars().last() else {
            return false;
        };
        let unit = match unit_char {
            'h' => 3600,
            'd' => 86_400,
            'w' => 7 * 86_400,
            'm' => 30 * 86_400,
            _ => return false,
        };
        let digits = &rest[..rest.len() - 1];
        let Ok(n) = digits.parse::<i64>() else {
            return false;
        };
        if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
            return false;
        }
        let age = self.now - at;
        if op == '<' {
            age <= unit * n
        } else {
            age > unit * n
        }
    }

    fn match_value(&self, task: &Task, key: Key, raw: &str, kids: &Kids) -> bool {
        let v = raw.to_lowercase();
        let name_of = |list: &[Dictionary], id: &str| {
            list.iter()
                .find(|d| d.id == id)
                .map(|d| d.name.to_lowercase())
        };
        match key {
            Key::Status => {
                let Some(s) = self.status(&task.status) else {
                    return false;
                };
                let category = category_name(s.category);
                let alias = match v.as_str() {
                    "review" => Some("review"),
                    "started" => Some("started"),
                    "completed" => Some("completed"),
                    "canceled" => Some("cancelled"),
                    _ => None,
                };
                v == s.id || v == category || v == s.name.to_lowercase() || alias == Some(category)
            }
            Key::Priority => PRIORITIES
                .iter()
                .find(|(n, id, name)| *id == v || n.to_string() == v || *name == v)
                .is_some_and(|(n, _, _)| task.priority == *n),
            Key::Label => task
                .labels
                .iter()
                .any(|id| *id == v || name_of(self.labels, id).as_deref() == Some(&v)),
            Key::Type => match &task.kind {
                _ if v == "none" => task.kind.is_none(),
                Some(t) => *t == v || name_of(self.types, t).as_deref() == Some(&v),
                None => false,
            },
            Key::Bucket => match &task.bucket {
                _ if v == "none" => task.bucket.is_none(),
                Some(b) => *b == v || name_of(self.buckets, b).as_deref() == Some(&v),
                None => false,
            },
            Key::Project => {
                if v == "none" {
                    return task.project.is_none();
                }
                task.project.as_deref() == Some(v.as_str())
                    || self.key(task.project.as_deref()).to_lowercase() == v
                    || task
                        .project
                        .as_deref()
                        .and_then(|p| self.projects.iter().find(|x| x.id == p))
                        .is_some_and(|p| p.name.to_lowercase() == v)
            }
            Key::Cycle => {
                if v == "none" || v == "无" {
                    return task.cycle.is_none();
                }
                let Some(cycle) = task.cycle else {
                    return false;
                };
                let target = match v.as_str() {
                    "current" | "当前" => self.active_cycle(),
                    "upcoming" | "next" | "下一个" => self.upcoming_cycle(),
                    "previous" | "上一个" => self.previous_cycle(),
                    other => other.trim_start_matches('#').parse::<u32>().ok(),
                };
                target == Some(cycle)
            }
            Key::Is => match v.as_str() {
                "open" => self.is_open(task),
                "closed" => !self.is_open(task),
                "overdue" => {
                    self.is_open(task)
                        && task
                            .due
                            .as_deref()
                            .and_then(|d| self.days_until(d))
                            .is_some_and(|d| d < 0)
                }
                "archived" => task.archived,
                "parent" => kids.count(&task.id) > 0,
                "subtask" => task.parent.is_some(),
                "blocked" | "阻塞" => self.is_blocked(task),
                _ => false,
            },
            Key::Has => match v.as_str() {
                "due" => task.due.is_some(),
                "labels" => !task.labels.is_empty(),
                "description" => task.has_description,
                "comments" => task.comments > 0,
                "subtasks" => kids.count(&task.id) > 0,
                "parent" => task.parent.is_some(),
                "priority" => task.priority > 0,
                "type" => task.kind.is_some(),
                "bucket" => task.bucket.is_some(),
                "cycle" => task.cycle.is_some(),
                "relations" => !task.blocked_by.is_empty() || !task.related.is_empty(),
                _ => false,
            },
            Key::Due => {
                if v == "none" {
                    return task.due.is_none();
                }
                let Some(d) = task.due.as_deref().and_then(|d| self.days_until(d)) else {
                    return false;
                };
                match v.as_str() {
                    "overdue" => d < 0 && self.is_open(task),
                    "today" => d == 0,
                    "week" => d <= 7,
                    other => {
                        let (op, rest) = match other.chars().next() {
                            Some(c @ ('<' | '>')) => (c, &other[1..]),
                            _ => return false,
                        };
                        let factor = match rest.chars().last() {
                            Some('d') => 1,
                            Some('w') => 7,
                            _ => return false,
                        };
                        let digits = &rest[..rest.len() - 1];
                        if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
                            return false;
                        }
                        let n = digits.parse::<i64>().unwrap_or(0) * factor;
                        if op == '<' {
                            d <= n
                        } else {
                            d > n
                        }
                    }
                }
            }
            Key::Created => self.within(Some(&task.created), &v),
            Key::Completed => {
                self.category(task) == Category::Completed
                    && self.within(task.completed.as_deref(), &v)
            }
        }
    }

    /// Open, unarchived tasks still blocking this one.
    pub fn is_blocked(&self, task: &Task) -> bool {
        self.is_open(task)
            && task.blocked_by.iter().any(|id| {
                self.tasks
                    .iter()
                    .find(|t| &t.id == id)
                    .is_some_and(|b| !b.archived && self.is_open(b))
            })
    }

    /// Tasks matching the query, in the snapshot's order. Archived tasks need `is:archived`.
    pub fn select(&self, query: &Query) -> Vec<&'a Task> {
        let kids = Kids::new(self.tasks);
        let want_archived = query
            .chips
            .iter()
            .any(|c| c.key == Key::Is && !c.negated && c.values.iter().any(|v| v == "archived"));
        let words: Vec<String> = query
            .text
            .to_lowercase()
            .split_whitespace()
            .map(String::from)
            .collect();
        let numbered = query
            .text
            .as_bytes()
            .windows(2)
            .any(|w| w[0] == b'#' && w[1].is_ascii_digit());
        // The host's description search: every term in the title or the description.
        let search_terms: Vec<&String> = words.iter().take(16).collect();
        let text_hit = |task: &Task| {
            let Some(bodies) = self.bodies else {
                return false;
            };
            if search_terms.is_empty() {
                return false;
            }
            let title = task.title.to_lowercase();
            let body = bodies.get(&task.id).map_or("", String::as_str);
            search_terms
                .iter()
                .all(|t| title.contains(t.as_str()) || body.contains(t.as_str()))
        };
        self.tasks
            .iter()
            .filter(|task| {
                if task.archived != want_archived {
                    return false;
                }
                for chip in &query.chips {
                    let hit = chip
                        .values
                        .iter()
                        .any(|v| self.match_value(task, chip.key, v, &kids));
                    if chip.negated == hit {
                        return false;
                    }
                }
                if !numbered && text_hit(task) {
                    return true;
                }
                let title = task.title.to_lowercase();
                let id = self.human_id(task).to_lowercase();
                words.iter().all(|word| {
                    if let Some(n) = word
                        .strip_prefix('#')
                        .filter(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
                    {
                        return n.parse::<u32>().ok() == Some(task.number);
                    }
                    title.contains(word.as_str())
                        || id == *word
                        || task.previous_ids.iter().any(|p| p.to_lowercase() == *word)
                })
            })
            .collect()
    }
}

/// Unarchived children per parent, as the list counts them.
struct Kids(HashMap<String, usize>);
impl Kids {
    fn new(tasks: &[Task]) -> Self {
        let mut map = HashMap::new();
        for t in tasks.iter().filter(|t| !t.archived) {
            if let Some(p) = &t.parent {
                *map.entry(p.clone()).or_insert(0) += 1;
            }
        }
        Self(map)
    }
    fn count(&self, id: &str) -> usize {
        self.0.get(id).copied().unwrap_or(0)
    }
}

fn category_name(c: Category) -> &'static str {
    match c {
        Category::Backlog => "backlog",
        Category::Unstarted => "unstarted",
        Category::Started => "started",
        Category::Review => "review",
        Category::Completed => "completed",
        Category::Cancelled => "cancelled",
    }
}

/// Resolves `WEB-12`, a previous id such as `SITE-3`, or an internal id.
pub fn resolve<'a>(ctx: &QueryContext<'a>, reference: &str) -> Option<&'a Task> {
    let r = reference.trim();
    if let Some(t) = ctx.tasks.iter().find(|t| t.id == r) {
        return Some(t);
    }
    let upper = r.to_uppercase();
    let (key, number) = upper.rsplit_once('-')?;
    let number: u32 = number.parse().ok()?;
    let renamed: HashSet<&str> = ctx
        .projects
        .iter()
        .filter(|p| p.previous_keys.iter().any(|k| k == key))
        .map(|p| p.id.as_str())
        .collect();
    ctx.tasks
        .iter()
        .find(|t| ctx.key(t.project.as_deref()) == key && t.number == number)
        .or_else(|| {
            ctx.tasks.iter().find(|t| {
                t.number == number && t.project.as_deref().is_some_and(|p| renamed.contains(p))
            })
        })
        .or_else(|| {
            ctx.tasks
                .iter()
                .find(|t| t.previous_ids.iter().any(|p| p.to_uppercase() == upper))
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_chips_negation_quotes_aliases_and_plain_text() {
        let q = parse(r#"is:open -状态:done priority:urgent,high label:"Needs review" 首页 #3"#);
        assert_eq!(q.chips.len(), 4);
        assert_eq!(q.chips[1].key, Key::Status);
        assert!(q.chips[1].negated);
        assert_eq!(q.chips[2].values, ["urgent", "high"]);
        assert_eq!(q.chips[3].values, ["Needs review"]);
        assert_eq!(q.text, "首页 #3");
        assert_eq!(parse("unknown:x").text, "unknown:x");
        assert_eq!(parse(r#""two words" x"#).text, "two words x");
    }
    #[test]
    fn instants_parse_with_offsets_and_fractions() {
        assert_eq!(parse_instant("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_instant("1970-01-01T08:00:00+08:00"), Some(0));
        assert_eq!(parse_instant("1970-01-02T00:00:00.250Z"), Some(86_400));
        assert_eq!(parse_instant("nope"), None);
    }
}
