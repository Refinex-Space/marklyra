//! Entities read leniently from frontmatter. Unknown keys stay in the file and are ignored here.
use serde::{Deserialize, Serialize};
use serde_yaml_ng::{Mapping, Value as Yaml};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    Backlog,
    #[default]
    Unstarted,
    Started,
    Review,
    Completed,
    Cancelled,
}
impl Category {
    pub fn open(self) -> bool {
        !matches!(self, Self::Completed | Self::Cancelled)
    }
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "backlog" => Self::Backlog,
            "unstarted" => Self::Unstarted,
            "started" => Self::Started,
            "review" => Self::Review,
            "completed" => Self::Completed,
            "cancelled" => Self::Cancelled,
            _ => return None,
        })
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Status {
    pub id: String,
    pub name: String,
    pub category: Category,
    pub color: String,
    pub builtin: bool,
    pub order: f64,
}
pub fn builtin_statuses() -> Vec<Status> {
    [
        ("backlog", "待规划", Category::Backlog, "backlog"),
        ("todo", "待办", Category::Unstarted, "todo"),
        ("in-progress", "进行中", Category::Started, "started"),
        ("in-review", "评审中", Category::Review, "review"),
        ("done", "已完成", Category::Completed, "done"),
        ("cancelled", "已取消", Category::Cancelled, "cancelled"),
    ]
    .into_iter()
    .enumerate()
    .map(|(i, (id, name, category, color))| Status {
        id: id.into(),
        name: name.into(),
        category,
        color: color.into(),
        builtin: true,
        order: i as f64,
    })
    .collect()
}

pub const PRIORITIES: [&str; 5] = ["none", "urgent", "high", "medium", "low"];
pub fn priority_from(value: Option<&Yaml>) -> u8 {
    match value {
        Some(Yaml::String(s)) => PRIORITIES.iter().position(|p| p == s).unwrap_or(0) as u8,
        Some(Yaml::Number(n)) => n.as_u64().filter(|n| *n <= 4).unwrap_or(0) as u8,
        _ => 0,
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub project: Option<String>,
    pub number: u32,
    pub status: String,
    pub priority: u8,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub labels: Vec<String>,
    pub bucket: Option<String>,
    pub cycle: Option<u32>,
    /// When the task joined its cycle; at or before the cycle's start it was planned.
    pub cycle_added: Option<String>,
    pub parent: Option<String>,
    pub due: Option<String>,
    pub created: String,
    pub updated: String,
    pub completed: Option<String>,
    pub previous_ids: Vec<String>,
    pub archived: bool,
    pub order: f64,
    pub blocked_by: Vec<String>,
    pub related: Vec<String>,
    pub has_description: bool,
    pub comments: u32,
    /// Where an imported task came from (`github:owner/repo#12`); repeat imports skip it.
    pub source: Option<String>,
    pub revision: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub key: String,
    pub previous_keys: Vec<String>,
    pub icon: String,
    pub color: String,
    pub state: String,
    pub order: f64,
    pub pinned: bool,
    pub description: String,
    pub created: String,
    /// `None` offers every workspace status (labels, buckets likewise).
    pub statuses: Option<Vec<String>>,
    pub labels: Option<Vec<String>>,
    pub buckets: Option<Vec<String>>,
    /// Saved views shown as tabs on the project.
    pub views: Vec<String>,
    /// Template that pre-fills new tasks in this project.
    pub default_template: Option<String>,
    pub revision: String,
}

/// A saved search with its display options.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct View {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub query: String,
    /// A view that belongs to one project; `None` can be added to any project.
    pub project: Option<String>,
    pub layout: String,
    pub group_by: String,
    pub order_by: String,
    pub order: f64,
    pub revision: String,
}

/// Labels, types and buckets share one shape; types also carry rules.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Dictionary {
    pub id: String,
    pub name: String,
    pub color: String,
    pub order: f64,
    pub add_labels: Vec<String>,
    pub set_priority: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub unassigned_key: String,
    pub comments: bool,
    pub cycles_enabled: bool,
    /// Cycle length in weeks, 1–4.
    pub cycle_weeks: u8,
    /// First day of a cycle, ISO weekday: 1 Monday … 7 Sunday.
    pub cycle_start_day: u8,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            unassigned_key: "TASK".into(),
            comments: true,
            cycles_enabled: false,
            cycle_weeks: 2,
            cycle_start_day: 1,
        }
    }
}

/// A numbered time box. Dates are local calendar days chosen by the client, end inclusive.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Cycle {
    pub number: u32,
    pub name: Option<String>,
    pub start: String,
    pub end: String,
    /// `active`, `upcoming` or `completed`.
    pub state: String,
    /// When the cycle became active; tasks added up to this moment were planned.
    pub started: Option<String>,
    pub completed_at: Option<String>,
    /// Frozen at completion, so later edits to tasks do not rewrite history.
    pub summary: Option<CycleSummary>,
    pub revision: String,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CycleSummary {
    pub planned: u32,
    pub added: u32,
    pub completed: Vec<String>,
    pub cancelled: Vec<String>,
    pub unfinished: Vec<String>,
}

/// Pre-filled values for a new task; the description is the file body.
#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Template {
    pub id: String,
    pub name: String,
    pub title: String,
    pub status: Option<String>,
    pub priority: u8,
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub labels: Vec<String>,
    pub bucket: Option<String>,
    pub subtasks: Vec<String>,
    pub description: String,
    pub order: f64,
    pub revision: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Comment {
    pub id: String,
    pub created: String,
    pub body: String,
}

pub(crate) fn text(map: &Mapping, key: &str) -> Option<String> {
    match map.get(key)? {
        Yaml::String(s) => Some(s.clone()).filter(|s| !s.is_empty()),
        Yaml::Number(n) => Some(n.to_string()),
        Yaml::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}
pub(crate) fn list(map: &Mapping, key: &str) -> Vec<String> {
    match map.get(key) {
        Some(Yaml::Sequence(items)) => items
            .iter()
            .filter_map(|v| match v {
                Yaml::String(s) => Some(s.clone()),
                Yaml::Number(n) => Some(n.to_string()),
                _ => None,
            })
            .collect(),
        Some(Yaml::String(s)) if !s.is_empty() => vec![s.clone()],
        _ => Vec::new(),
    }
}
pub(crate) fn number(map: &Mapping, key: &str) -> Option<f64> {
    match map.get(key)? {
        Yaml::Number(n) => n.as_f64(),
        Yaml::String(s) => s.parse().ok(),
        _ => None,
    }
}
pub(crate) fn flag(map: &Mapping, key: &str) -> bool {
    matches!(map.get(key), Some(Yaml::Bool(true)))
}
