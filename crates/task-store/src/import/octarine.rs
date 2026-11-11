//! An Octarine vault's `.octarine/tasks`, read once and never written. Projects come across
//! by key, labels/types/buckets by name, comments from the activity logs; the old number is
//! kept as a previous id (`WEB-3`), so references to it still resolve.
use super::{fingerprint, Candidate, Source, SourceProject};
use crate::frontmatter as fm;
use serde_yaml_ng::{Mapping, Value as Yaml};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_FILE: u64 = 2 * 1024 * 1024;
const MAX_FILES: usize = 20_000;

/// The tasks folder for a vault root, its `.octarine`, or the folder itself.
pub fn locate(path: &Path) -> Option<PathBuf> {
    [
        path.join(".octarine/tasks"),
        path.join("tasks"),
        path.to_path_buf(),
    ]
    .into_iter()
    .find(|p| {
        fs::symlink_metadata(p).is_ok_and(|m| m.is_dir())
            && (p.ends_with("tasks") && p.parent().is_some_and(|q| q.ends_with(".octarine")))
    })
}

/// `name → text` for the plain files of one folder; links and large files are skipped.
fn read_dir(dir: &Path, ext: &str, budget: &mut usize) -> HashMap<String, String> {
    let mut out = HashMap::new();
    let Ok(entries) = fs::read_dir(dir) else {
        return out;
    };
    for entry in entries.flatten() {
        let Ok(meta) = fs::symlink_metadata(entry.path()) else {
            continue;
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        if !meta.is_file() || meta.len() > MAX_FILE || !name.ends_with(ext) || *budget == 0 {
            continue;
        }
        *budget -= 1;
        if let Ok(text) = fs::read_to_string(entry.path()) {
            out.insert(name.trim_end_matches(ext).to_owned(), text);
        }
    }
    out
}

fn front(text: &str) -> Mapping {
    serde_yaml_ng::from_str(fm::front_text(text)).unwrap_or_default()
}
fn get(map: &Mapping, key: &str) -> Option<String> {
    match map.get(key)? {
        Yaml::String(s) => Some(s.trim().to_owned()).filter(|s| !s.is_empty()),
        Yaml::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
fn names(map: &Mapping, key: &str) -> Vec<String> {
    match map.get(key) {
        Some(Yaml::Sequence(items)) => items
            .iter()
            .filter_map(|v| v.as_str().map(|s| s.trim().to_owned()))
            .filter(|s| !s.is_empty())
            .collect(),
        Some(Yaml::String(s)) if !s.trim().is_empty() => vec![s.trim().to_owned()],
        _ => Vec::new(),
    }
}

/// Everything read from the folder, kept apart from parsing so tests need no disk.
#[derive(Default)]
pub struct Files {
    pub tasks: HashMap<String, String>,
    pub archived: usize,
    pub projects: HashMap<String, String>,
    /// Dictionaries by folder (`labels`, `types`, `buckets`): id → file text.
    pub dictionaries: HashMap<&'static str, HashMap<String, String>>,
    pub activity: HashMap<String, String>,
    pub cycles: usize,
    pub templates: usize,
}

pub fn read(tasks: &Path) -> Files {
    let mut budget = MAX_FILES;
    let mut files = Files {
        tasks: read_dir(tasks, ".md", &mut budget),
        archived: read_dir(&tasks.join(".archive"), ".md", &mut budget).len(),
        projects: read_dir(&tasks.join("projects"), ".md", &mut budget),
        activity: read_dir(&tasks.join("activity"), ".json", &mut budget),
        cycles: read_dir(&tasks.join("cycles"), ".md", &mut budget).len(),
        templates: read_dir(&tasks.join("templates"), ".md", &mut budget).len(),
        ..Files::default()
    };
    // Projects archived in Octarine still name their tasks' project.
    for (id, text) in read_dir(&tasks.join("projects/.archive"), ".md", &mut budget) {
        files.projects.entry(id).or_insert(text);
    }
    for kind in ["labels", "types", "buckets"] {
        files
            .dictionaries
            .insert(kind, read_dir(&tasks.join(kind), ".md", &mut budget));
    }
    files
}

pub fn parse(files: &Files, label: &str) -> Source {
    let mut hash = Sha256::new();
    let mut ids: Vec<&String> = files.tasks.keys().collect();
    ids.sort();
    for id in &ids {
        hash.update(id.as_bytes());
        hash.update(files.tasks[*id].as_bytes());
    }
    let mut source = Source {
        kind: "octarine".into(),
        label: label.into(),
        fingerprint: fingerprint(format!("{:x}", hash.finalize()).as_bytes()),
        include_closed_default: true,
        ..Source::default()
    };
    let projects: HashMap<&str, (Option<String>, String)> = files
        .projects
        .iter()
        .map(|(id, text)| {
            let m = front(text);
            let key = get(&m, "key");
            let name = get(&m, "name")
                .or_else(|| key.clone())
                .unwrap_or_else(|| id.clone());
            (id.as_str(), (key, name))
        })
        .collect();
    // A dictionary value may be stored by id; it is matched here by name.
    let named = |kind: &str, raw: String| -> String {
        files
            .dictionaries
            .get(kind)
            .and_then(|d| d.get(&raw))
            .and_then(|t| get(&front(t), "name"))
            .unwrap_or(raw)
    };
    let mut parsed: Vec<(u32, Candidate)> = Vec::new();
    for id in ids {
        let text = &files.tasks[id];
        let m = front(text);
        let state = get(&m, "state").unwrap_or_else(|| "todo".into());
        let (closed, cancelled) = super::closed_state(&state);
        let number = get(&m, "number")
            .and_then(|n| n.parse::<u32>().ok())
            .unwrap_or(0);
        let project = get(&m, "project")
            .and_then(|p| projects.get(p.as_str()))
            .cloned();
        let previous_id = project
            .as_ref()
            .and_then(|(k, _)| k.clone())
            .filter(|_| number > 0)
            .map(|k| format!("{k}-{number}"));
        let comments = files
            .activity
            .get(id)
            .and_then(|t| serde_json::from_str::<serde_json::Value>(t).ok())
            .and_then(|v| v.get("events").and_then(|e| e.as_array()).cloned())
            .unwrap_or_default()
            .iter()
            .filter(|e| e["type"] == "comment")
            .filter_map(|e| e["body"].as_str().map(String::from))
            .collect();
        parsed.push((
            number,
            Candidate {
                source_ref: format!("octarine:{id}"),
                title: get(&m, "title").unwrap_or_default(),
                description: fm::body(text).trim().to_owned(),
                status: Some(state),
                closed,
                cancelled,
                priority: get(&m, "priority")
                    .and_then(|p| p.parse::<u8>().ok())
                    .filter(|p| *p <= 4)
                    .unwrap_or(0),
                labels: names(&m, "labels")
                    .into_iter()
                    .map(|l| named("labels", l))
                    .collect(),
                kind: get(&m, "type").map(|t| named("types", t)),
                bucket: get(&m, "bucket").map(|b| named("buckets", b)),
                due: get(&m, "due")
                    .or_else(|| get(&m, "dueDate"))
                    .or_else(|| get(&m, "due_date"))
                    .and_then(|d| super::date(&d)),
                project: project.map(|(key, name)| SourceProject { key, name }),
                parent_ref: get(&m, "parent_id")
                    .or_else(|| get(&m, "parent"))
                    .map(|p| format!("octarine:{p}")),
                comments,
                previous_id,
                note: None,
            },
        ));
    }
    // Numbers in the source order, so new numbers follow the old ones.
    parsed.sort_by_key(|(n, _)| *n);
    source.candidates = parsed.into_iter().map(|(_, c)| c).collect();
    if files.archived > 0 {
        source.warnings.push(format!(
            "Octarine 中已归档的 {} 个任务未导入",
            files.archived
        ));
    }
    if files.cycles > 0 || files.templates > 0 {
        source
            .warnings
            .push("迭代与模板未导入；任务的迭代归属不保留".into());
    }
    source
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files() -> Files {
        let mut f = Files::default();
        f.projects
            .insert("p1".into(), "---\nkey: WEB\nname: 官网改版\n---\n".into());
        f.tasks.insert(
            "aaa".into(),
            "---\nnumber: 1\npriority: 1\nproject: p1\nstate: todo\ntitle: 重做首屏\nlabels:\n- Feature\n---\n参考 [[发布计划]]".into(),
        );
        f.tasks.insert(
            "bbb".into(),
            "---\nnumber: 2\nparent_id: aaa\nproject: p1\nstate: done\ntitle: 输出方案\ntype: tb\n---\n".into(),
        );
        f.dictionaries.insert(
            "types",
            HashMap::from([("tb".to_owned(), "---\nname: Bug\n---\n".to_owned())]),
        );
        f.activity.insert(
            "aaa".into(),
            r#"{"version":1,"events":[{"type":"created"},{"type":"comment","body":"先做移动端"}]}"#
                .into(),
        );
        f.archived = 1;
        f
    }

    #[test]
    fn maps_projects_parents_comments() {
        let s = parse(&files(), "Task Lab");
        assert!(s.include_closed_default);
        let [a, b] = &s.candidates[..] else { panic!() };
        assert_eq!(a.previous_id.as_deref(), Some("WEB-1"));
        assert_eq!(a.project.as_ref().unwrap().key.as_deref(), Some("WEB"));
        assert_eq!(a.description, "参考 [[发布计划]]");
        assert_eq!(a.labels, vec!["Feature"]);
        assert_eq!(a.comments, vec!["先做移动端"]);
        assert_eq!(b.parent_ref.as_deref(), Some("octarine:aaa"));
        assert_eq!(b.kind.as_deref(), Some("Bug"));
        assert!(b.closed);
        assert_eq!(s.warnings.len(), 1);
    }
}
