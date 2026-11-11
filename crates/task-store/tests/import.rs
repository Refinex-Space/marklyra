use cap_std::{ambient_authority, fs::Dir};
use serde_json::json;
use std::path::Path;
use task_store::import::{self, checklist, csv, github, octarine, Options};
use task_store::{Mutation, TaskStore};

fn store(root: &Path) -> TaskStore {
    std::fs::create_dir_all(root).unwrap();
    TaskStore::initialize(Dir::open_ambient_dir(root, ambient_authority()).unwrap()).unwrap()
}
fn run(s: &mut TaskStore, value: serde_json::Value) {
    s.apply(serde_json::from_value::<Mutation>(value).unwrap())
        .unwrap();
}

const ISSUES: &str = r#"[
  {"number":1,"title":"登录失败","body":"复现步骤","state":"OPEN","url":"https://github.com/acme/web/issues/1",
   "labels":[{"name":"bug"},{"name":"priority: high"},{"name":"新标签"}],
   "comments":[{"author":{"login":"ann"},"body":"确认"}]},
  {"number":2,"title":"子问题","state":"CLOSED","url":"https://github.com/acme/web/issues/2","labels":[]},
  {"number":3,"title":"","state":"OPEN","url":"https://github.com/acme/web/issues/3"}
]"#;

#[test]
fn preview_apply_repeat_and_undo() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    run(
        &mut s,
        json!({"kind":"createProject","name":"官网","key":"WEB"}),
    );
    let source = github::parse(ISSUES.as_bytes(), "issues.json").unwrap();
    let options = Options {
        project: Some("WEB".into()),
        ..Options::default()
    };

    let p = import::preview(&s, &source, &options).unwrap();
    assert_eq!((p.new, p.skip, p.problem), (1, 1, 1));
    assert_eq!(p.unknown_labels, vec!["新标签"]);
    // `bug` matches the seeded label by id, whatever it is called.
    assert_eq!(p.rows[0].labels, vec!["缺陷"]);
    assert_eq!(p.rows[0].project, "官网");
    assert!(p.rows[1].reason.as_deref().unwrap().contains("已关闭"));

    let options = Options {
        create_labels: true,
        include_closed: true,
        ..options
    };
    let p = import::preview(&s, &source, &options).unwrap();
    assert_eq!((p.new, p.skip, p.problem), (2, 0, 1));
    assert_eq!(p.labels_to_create, vec!["新标签"]);

    let applied = import::apply(&mut s, &source, &options).unwrap();
    assert_eq!(applied.created, 2);
    let snap = s.snapshot();
    let a = snap.tasks.iter().find(|t| t.title == "登录失败").unwrap();
    assert_eq!(a.priority, 2);
    assert_eq!(a.labels.len(), 2);
    assert_eq!(a.comments, 1);
    assert_eq!(a.source.as_deref(), Some("github:acme/web#1"));
    assert_eq!(a.previous_ids, vec!["acme/web#1"]);
    let b = snap.tasks.iter().find(|t| t.title == "子问题").unwrap();
    assert_eq!(b.status, "done");
    assert!(b.completed.is_some());
    let detail = s.detail(&a.id).unwrap();
    assert!(detail.body.contains("复现步骤"));
    assert!(detail.activity.iter().any(|e| e["by"] == "import"));

    // The same file again: everything already there.
    let p = import::preview(&s, &source, &options).unwrap();
    assert_eq!((p.new, p.skip), (0, 2));
    assert!(p.rows[0]
        .reason
        .as_deref()
        .unwrap()
        .starts_with("已导入为 WEB-"));

    let receipts = import::receipts(&s).unwrap();
    assert_eq!(receipts.len(), 1);
    let id = receipts[0]["id"].as_str().unwrap().to_owned();
    assert_eq!(receipts[0]["tasks"].as_array().unwrap().len(), 2);
    assert_eq!(import::undo(&mut s, &id).unwrap(), 2);
    assert!(s
        .snapshot()
        .tasks
        .iter()
        .filter(|t| t.source.is_some())
        .all(|t| t.archived));
    assert!(import::undo(&mut s, &id).is_err());
    assert_eq!(import::receipts(&s).unwrap()[0]["undone"], true);
    // After an undo the same file can come in again.
    assert_eq!(import::preview(&s, &source, &options).unwrap().new, 2);
}

#[test]
fn csv_creates_projects_and_children_follow_parents() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let text = "ID,Title,Status,Priority,Project,Parent issue\nOPS-2,子任务,Todo,,运维,OPS-1\nOPS-1,父任务,In Progress,Urgent,运维,\n";
    let source = csv::parse(text.as_bytes(), "linear.csv").unwrap();
    let p = import::preview(&s, &source, &Options::default()).unwrap();
    assert_eq!(p.projects_to_create, vec!["运维（OPS）"]);
    assert_eq!(p.rows[0].parent.as_deref(), Some("父任务"));
    import::apply(&mut s, &source, &Options::default()).unwrap();
    let snap = s.snapshot();
    let project = snap.projects.iter().find(|p| p.key == "OPS").unwrap();
    let parent = snap.tasks.iter().find(|t| t.title == "父任务").unwrap();
    let child = snap.tasks.iter().find(|t| t.title == "子任务").unwrap();
    assert_eq!(parent.project.as_deref(), Some(project.id.as_str()));
    assert_eq!(parent.status, "in-progress");
    assert_eq!(child.parent.as_deref(), Some(parent.id.as_str()));
    assert_eq!(child.project.as_deref(), Some(project.id.as_str()));
}

#[test]
fn octarine_folder_is_read_without_changes() {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join("vault");
    let tasks = vault.join(".octarine/tasks");
    std::fs::create_dir_all(tasks.join("projects")).unwrap();
    std::fs::write(
        tasks.join("projects/p1.md"),
        "---\nkey: WEB\nname: 官网改版\n---\n",
    )
    .unwrap();
    std::fs::write(
        tasks.join("aaa.md"),
        "---\nnumber: 3\nproject: p1\nstate: done\ntitle: 修复导航\n---\n",
    )
    .unwrap();
    let before = std::fs::read(tasks.join("aaa.md")).unwrap();
    assert_eq!(octarine::locate(&vault).as_deref(), Some(tasks.as_path()));
    assert!(octarine::locate(dir.path()).is_none());

    let mut s = store(&dir.path().join("work"));
    let source = octarine::parse(&octarine::read(&tasks), "vault");
    let options = Options {
        include_closed: source.include_closed_default,
        ..Options::default()
    };
    import::apply(&mut s, &source, &options).unwrap();
    let t = s.snapshot().tasks.into_iter().next().unwrap();
    assert_eq!(t.previous_ids, vec!["WEB-3"]);
    assert_eq!(s.resolve("WEB-3").unwrap().id, t.id);
    assert_eq!(std::fs::read(tasks.join("aaa.md")).unwrap(), before);
}

#[test]
fn checklist_returns_note_links() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let note = "# 计划\n- [ ] 写公告\n  - [ ] 配图\n- [ ] 定稿\n";
    let source = checklist::parse(&[("计划.md".into(), note.into())], "计划.md");
    let applied = import::apply(&mut s, &source, &Options::default()).unwrap();
    assert_eq!(applied.note_links.len(), 3);
    let out = checklist::rewrite(note, &applied.note_links).unwrap();
    let snap = s.snapshot();
    let parent = snap.tasks.iter().find(|t| t.title == "写公告").unwrap();
    let child = snap.tasks.iter().find(|t| t.title == "配图").unwrap();
    assert_eq!(child.parent.as_deref(), Some(parent.id.as_str()));
    // Numbers follow the note's order, children included.
    let last = snap.tasks.iter().find(|t| t.title == "定稿").unwrap();
    assert_eq!((parent.number, child.number, last.number), (1, 2, 3));
    assert!(out.contains(&format!(
        "- [{}-{} 写公告](task:{})",
        snap.settings.unassigned_key, parent.number, parent.id
    )));
    // The rewritten note has nothing left to import.
    assert!(checklist::parse(&[("计划.md".into(), out)], "计划.md")
        .candidates
        .is_empty());
}

#[test]
fn too_many_items_are_refused() {
    let dir = tempfile::tempdir().unwrap();
    let s = store(dir.path());
    let mut text = String::from("title\n");
    for i in 0..=import::MAX_ITEMS {
        text.push_str(&format!("t{i}\n"));
    }
    let source = csv::parse(text.as_bytes(), "big.csv").unwrap();
    assert!(import::preview(&s, &source, &Options::default())
        .unwrap_err()
        .contains("5000"));
}

#[test]
fn project_limits_move_status_to_the_nearest_allowed_and_drop_unused_labels() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    run(
        &mut s,
        json!({"kind":"createProject","name":"官网改版","key":"GWGB"}),
    );
    let p = s.snapshot().projects.into_iter().next().unwrap();
    run(
        &mut s,
        json!({"kind":"updateProject","id":p.id,"revision":p.revision,
               "set":{"statuses":["todo","done"],"labels":["bug"]}}),
    );
    // The source names the project by name with another key (as Octarine does).
    let text = "ID,Title,Status,Labels,Project\nWEB-1,年付切换,In Progress,\"bug, feature\",官网改版\nWEB-2,已上线,Done,,官网改版\n";
    let source = csv::parse(text.as_bytes(), "web.csv").unwrap();
    let options = Options {
        include_closed: true,
        ..Options::default()
    };
    let preview = import::preview(&s, &source, &options).unwrap();
    assert_eq!(preview.rows[0].status, "待办");
    assert_eq!(preview.rows[0].unknown_labels, vec!["功能"]);
    import::apply(&mut s, &source, &options).unwrap();
    let snap = s.snapshot();
    let a = snap.tasks.iter().find(|t| t.title == "年付切换").unwrap();
    assert_eq!(
        (a.status.as_str(), a.labels.clone()),
        ("todo", vec!["bug".to_owned()])
    );
    let b = snap.tasks.iter().find(|t| t.title == "已上线").unwrap();
    assert_eq!(b.status, "done");
}
