use cap_std::{ambient_authority, fs::Dir};
use serde_json::json;
use std::path::Path;
use task_store::{Mutation, MutationResult, TaskStore};

fn store(root: &Path) -> TaskStore {
    std::fs::create_dir_all(root).unwrap();
    TaskStore::initialize(Dir::open_ambient_dir(root, ambient_authority()).unwrap()).unwrap()
}
fn run(s: &mut TaskStore, value: serde_json::Value) -> task_store::Result<MutationResult> {
    s.apply(serde_json::from_value::<Mutation>(value).unwrap())
}
fn task(s: &TaskStore, id: &str) -> task_store::Task {
    s.snapshot().tasks.into_iter().find(|t| t.id == id).unwrap()
}
fn create(s: &mut TaskStore, draft: serde_json::Value) -> String {
    run(s, json!({ "kind": "createTask", "draft": draft }))
        .unwrap()
        .applied[0]
        .clone()
}

#[test]
fn default_views_seed_once_and_save_update_delete() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let names: Vec<String> = s.snapshot().views.iter().map(|v| v.name.clone()).collect();
    assert_eq!(names, ["全部未完成", "本周到期", "已逾期", "最近完成"]);
    let id = run(&mut s, json!({ "kind": "saveView", "set": { "name": "Design work", "query": "label:design", "layout": "board", "groupBy": "bucket" } }))
        .unwrap()
        .created[0]
        .clone();
    assert_eq!(id, "design-work");
    let v = s.snapshot().views.into_iter().find(|v| v.id == id).unwrap();
    assert_eq!(
        (v.layout.as_str(), v.group_by.as_str(), v.query.as_str()),
        ("board", "bucket", "label:design")
    );
    let p = run(
        &mut s,
        json!({ "kind": "createProject", "name": "官网", "key": "WEB" }),
    )
    .unwrap()
    .created[0]
        .clone();
    let rev = s.snapshot().projects[0].revision.clone();
    run(&mut s, json!({ "kind": "updateProject", "id": p, "revision": rev, "set": { "views": ["all-open", id] } })).unwrap();
    run(&mut s, json!({ "kind": "deleteView", "id": id })).unwrap();
    assert_eq!(
        s.snapshot().projects[0].views,
        vec!["all-open"],
        "deleting a view removes its tabs"
    );
    // Removing the folder and writing again does not resurrect deleted defaults twice.
    std::fs::remove_file(dir.path().join("views/overdue.md")).unwrap();
    create(&mut s, json!({ "title": "x" }));
    assert!(!dir.path().join("views/overdue.md").exists());
}

#[test]
fn deleting_dictionary_values_cleans_tasks_types_and_projects() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let label = run(&mut s, json!({ "kind": "upsertDictionary", "dictionary": "labels", "set": { "name": "Design", "color": "pink" } })).unwrap().created[0].clone();
    assert_eq!(label, "design");
    assert!(run(&mut s, json!({ "kind": "upsertDictionary", "dictionary": "labels", "set": { "name": "Design" } })).is_err(), "names are unique");
    run(&mut s, json!({ "kind": "upsertDictionary", "dictionary": "types", "id": "feature", "set": { "addLabels": ["feature", "design"], "setPriority": 3 } })).unwrap();
    let id = create(
        &mut s,
        json!({ "title": "t", "labels": ["bug", "design"], "bucket": "now" }),
    );
    run(
        &mut s,
        json!({ "kind": "deleteDictionary", "dictionary": "labels", "id": "design" }),
    )
    .unwrap();
    run(
        &mut s,
        json!({ "kind": "deleteDictionary", "dictionary": "buckets", "id": "now" }),
    )
    .unwrap();
    let t = task(&s, &id);
    assert_eq!(
        (t.labels.clone(), t.bucket.clone()),
        (vec!["bug".to_string()], None)
    );
    let feature = s
        .snapshot()
        .types
        .into_iter()
        .find(|t| t.id == "feature")
        .unwrap();
    assert_eq!(
        (feature.add_labels, feature.set_priority),
        (vec!["feature".to_string()], 3)
    );
    assert!(!dir.path().join("labels/design.md").exists());
}

#[test]
fn custom_statuses_are_editable_builtins_are_locked_and_deletion_migrates() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    assert!(run(&mut s, json!({ "kind": "upsertDictionary", "dictionary": "statuses", "id": "todo", "set": { "name": "待做" } })).is_err());
    assert!(run(
        &mut s,
        json!({ "kind": "deleteDictionary", "dictionary": "statuses", "id": "done" })
    )
    .is_err());
    // The UI hands a new status its category's colour, e.g. `review`.
    let qa = run(&mut s, json!({ "kind": "upsertDictionary", "dictionary": "statuses", "set": { "name": "QA", "category": "review", "color": "review" } })).unwrap().created[0].clone();
    assert!(run(&mut s, json!({ "kind": "upsertDictionary", "dictionary": "labels", "set": { "name": "x", "color": "#ff0000" } })).is_err());
    let id = create(&mut s, json!({ "title": "t", "status": qa }));
    run(
        &mut s,
        json!({ "kind": "deleteDictionary", "dictionary": "statuses", "id": qa }),
    )
    .unwrap();
    assert_eq!(
        task(&s, &id).status,
        "in-review",
        "tasks move to the category's built-in status"
    );
}

#[test]
fn project_limits_validate_migrate_and_follow_moves() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let p = run(
        &mut s,
        json!({ "kind": "createProject", "name": "写作", "key": "DOC" }),
    )
    .unwrap()
    .created[0]
        .clone();
    let review = create(
        &mut s,
        json!({ "title": "评审中", "project": p, "status": "in-review" }),
    );
    let backlog = create(
        &mut s,
        json!({ "title": "待规划", "project": p, "status": "backlog" }),
    );
    let rev = s.snapshot().projects[0].revision.clone();
    assert!(
        run(&mut s, json!({ "kind": "updateProject", "id": p, "revision": rev, "set": { "statuses": ["todo", "in-progress"] } })).is_err(),
        "a completed status is required"
    );
    run(&mut s, json!({ "kind": "updateProject", "id": p, "revision": rev, "set": { "statuses": ["todo", "in-progress", "done"], "labels": ["bug"] } })).unwrap();
    assert_eq!(
        task(&s, &review).status,
        "in-progress",
        "review moves to the nearest category"
    );
    assert_eq!(task(&s, &backlog).status, "todo");
    let t = task(&s, &review);
    assert!(run(&mut s, json!({ "kind": "patch", "ids": [review], "revisions": [t.revision], "set": { "status": "backlog" } })).is_err());
    assert!(run(&mut s, json!({ "kind": "createTask", "draft": { "title": "x", "project": p, "labels": ["feature"] } })).is_err());
    // A task moving in takes the nearest allowed status instead of failing.
    let outside = create(&mut s, json!({ "title": "外部", "status": "in-review" }));
    let t = task(&s, &outside);
    run(&mut s, json!({ "kind": "patch", "ids": [outside], "revisions": [t.revision], "set": { "project": p } })).unwrap();
    assert_eq!(task(&s, &outside).status, "in-progress");
    let rev = s.snapshot().projects[0].revision.clone();
    run(
        &mut s,
        json!({ "kind": "updateProject", "id": p, "revision": rev, "set": { "statuses": "all" } }),
    )
    .unwrap();
    assert_eq!(s.snapshot().projects[0].statuses, None);
}

#[test]
fn settings_and_search() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    std::fs::write(
        dir.path().join("settings.yml"),
        "# 我的设置\ncomments: true\n",
    )
    .unwrap();
    run(
        &mut s,
        json!({ "kind": "updateSettings", "set": { "unassignedKey": "inbox", "comments": false } }),
    )
    .unwrap();
    assert!(run(
        &mut s,
        json!({ "kind": "updateSettings", "set": { "unassignedKey": "1X" } })
    )
    .is_err());
    let settings = std::fs::read_to_string(dir.path().join("settings.yml")).unwrap();
    assert_eq!(
        settings,
        "# 我的设置\ncomments: false\nunassigned_key: INBOX\n"
    );
    let snap = s.snapshot();
    assert_eq!(
        (
            snap.settings.unassigned_key.as_str(),
            snap.settings.comments
        ),
        ("INBOX", false)
    );
    let a = create(
        &mut s,
        json!({ "title": "定价页", "description": "年付切换与 **Stripe** 结账" }),
    );
    create(&mut s, json!({ "title": "其他" }));
    assert_eq!(s.search("stripe 年付"), vec![a.clone()]);
    assert_eq!(s.search("定价"), vec![a]);
    assert!(s.search("不存在").is_empty());
}
