use cap_std::{ambient_authority, fs::Dir};
use serde_json::json;
use std::path::Path;
use task_store::{Mutation, StoreError, TaskStore};

fn store(root: &Path) -> TaskStore {
    std::fs::create_dir_all(root).unwrap();
    TaskStore::initialize(Dir::open_ambient_dir(root, ambient_authority()).unwrap()).unwrap()
}
fn mutation(value: serde_json::Value) -> Mutation {
    serde_json::from_value(value).unwrap()
}
fn project(s: &mut TaskStore, key: &str) -> String {
    s.apply(mutation(
        json!({ "kind": "createProject", "name": format!("项目 {key}"), "key": key }),
    ))
    .unwrap()
    .created[0]
        .clone()
}
fn create(s: &mut TaskStore, title: &str, project: Option<&str>) -> String {
    s.apply(mutation(
        json!({ "kind": "createTask", "draft": { "title": title, "project": project } }),
    ))
    .unwrap()
    .applied[0]
        .clone()
}
fn task(s: &TaskStore, id: &str) -> task_store::Task {
    s.snapshot().tasks.into_iter().find(|t| t.id == id).unwrap()
}
fn patch(s: &mut TaskStore, ids: &[&str], set: serde_json::Value) -> task_store::MutationResult {
    let revisions: Vec<String> = ids.iter().map(|id| task(s, id).revision).collect();
    s.apply(mutation(
        json!({ "kind": "patch", "ids": ids, "revisions": revisions, "set": set }),
    ))
    .unwrap()
}

#[test]
fn seeds_once_and_reading_an_existing_store_never_writes() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("tasks");
    let s = store(&root);
    let snap = s.snapshot();
    assert_eq!(snap.labels.len(), 3);
    assert_eq!(snap.types[0].add_labels, vec!["bug"]);
    assert_eq!(snap.statuses.len(), 6);
    assert_eq!(
        std::fs::read_to_string(root.join(".gitattributes")).unwrap(),
        "activity/*.jsonl merge=union\n"
    );
    std::fs::remove_file(root.join("labels/bug.md")).unwrap();
    let s = store(&root);
    assert_eq!(
        s.snapshot().labels.len(),
        2,
        "existing store is not re-seeded"
    );
}

#[test]
fn numbering_moves_and_old_ids() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let web = project(&mut s, "WEB");
    let app = project(&mut s, "APP");
    let a = create(&mut s, "第一个", Some(&web));
    let b = create(&mut s, "第二个", Some(&web));
    let loose = create(&mut s, "无项目", None);
    assert_eq!(
        (
            task(&s, &a).number,
            task(&s, &b).number,
            task(&s, &loose).number
        ),
        (1, 2, 1)
    );
    assert_eq!(s.human_id(&task(&s, &loose)), "TASK-1");
    let child = s.apply(mutation(json!({ "kind": "createTask", "draft": { "title": "子", "parent": a, "subtasks": ["孙不允许？只是子任务"] } }))).unwrap_err();
    assert!(
        matches!(child, StoreError::Invalid(_)),
        "subtasks only one level, and draft subtasks need a top-level parent"
    );
    let created = s.apply(mutation(json!({ "kind": "createTask", "draft": { "title": "父", "project": web, "subtasks": ["子一", "子二"] } }))).unwrap().created;
    assert_eq!(created.len(), 3);
    assert_eq!(
        task(&s, &created[1]).parent.as_deref(),
        Some(created[0].as_str())
    );
    assert_eq!(task(&s, &created[2]).number, 5);
    // Moving a parent moves its subtasks; both get new numbers and keep their old ids.
    patch(&mut s, &[&created[0]], json!({ "project": app }));
    let moved = task(&s, &created[0]);
    assert_eq!(
        (moved.project.as_deref(), moved.number),
        (Some(app.as_str()), 1)
    );
    assert_eq!(moved.previous_ids, vec!["WEB-3"]);
    assert_eq!(task(&s, &created[1]).project.as_deref(), Some(app.as_str()));
    // Numbers freed by the move are not reused.
    let c = create(&mut s, "之后", Some(&web));
    assert_eq!(task(&s, &c).number, 6);
}

#[test]
fn patch_preserves_unknown_bytes_and_detects_conflicts() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let id = create(&mut s, "原始", None);
    let path = dir.path().join(format!("items/{id}.md"));
    let original = std::fs::read_to_string(&path).unwrap();
    let edited = original
        .replace("---\n", "---\r\n")
        .replacen("title:", "# 我的注释\r\nmine: [1, 2]\r\ntitle:", 1)
        .replace('\n', "\r\n")
        .replace("\r\r\n", "\r\n")
        + "正文\r\n";
    std::fs::write(&path, &edited).unwrap();
    s.refresh().unwrap();
    let stale = task(&s, &id).revision;
    patch(
        &mut s,
        &[&id],
        json!({ "status": "done", "priority": 2, "labels": ["bug"] }),
    );
    let after = std::fs::read_to_string(&path).unwrap();
    assert!(after.contains("# 我的注释\r\nmine: [1, 2]\r\n"), "{after}");
    assert!(after.ends_with("---\r\n正文\r\n"));
    assert!(
        after.contains("status: done\r\n")
            && after.contains("priority: high\r\n")
            && after.contains("completed: ")
    );
    assert!(
        !after.contains("\n\n") && after.matches('\n').count() == after.matches("\r\n").count()
    );
    let result = s.apply(mutation(json!({ "kind": "patch", "ids": [id], "revisions": [stale], "set": { "title": "覆盖" } }))).unwrap();
    assert_eq!(result.conflicts, vec![id.clone()]);
    assert_eq!(task(&s, &id).title, "原始");
    let reopened = patch(&mut s, &[&id], json!({ "status": "todo" }));
    assert!(reopened.applied.contains(&id));
    assert!(!std::fs::read_to_string(&path)
        .unwrap()
        .contains("completed:"));
}

#[test]
fn description_comments_activity_and_delete() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let id = create(&mut s, "描述", None);
    let rev = task(&s, &id).revision;
    s.apply(mutation(json!({ "kind": "setDescription", "id": id, "revision": rev, "body": "第一段\n\n- 列表\n" }))).unwrap();
    let detail = s.detail(&id).unwrap();
    assert_eq!(detail.body, "第一段\n\n- 列表\n");
    let err = s
        .apply(mutation(
            json!({ "kind": "setDescription", "id": id, "revision": rev, "body": "x" }),
        ))
        .unwrap_err();
    assert!(matches!(err, StoreError::Conflict));
    s.apply(mutation(
        json!({ "kind": "comment", "id": id, "body": "评论 **一**" }),
    ))
    .unwrap();
    patch(&mut s, &[&id], json!({ "type": "bug" }));
    let t = task(&s, &id);
    assert_eq!(
        (t.comments, t.labels.clone(), t.priority),
        (1, vec!["bug".to_string()], 2),
        "type rules apply"
    );
    let detail = s.detail(&id).unwrap();
    assert_eq!(detail.comments[0].body, "评论 **一**");
    assert_eq!(detail.activity[0]["type"], "created");
    // Union merges may duplicate a line: the event id keeps it once.
    let log = dir.path().join(format!("activity/{id}.jsonl"));
    let text = std::fs::read_to_string(&log).unwrap();
    std::fs::write(&log, format!("{text}{text}")).unwrap();
    assert_eq!(s.detail(&id).unwrap().activity.len(), text.lines().count());
    let rev = task(&s, &id).revision;
    s.apply(mutation(
        json!({ "kind": "delete", "ids": [id], "revisions": [rev] }),
    ))
    .unwrap();
    assert!(s.snapshot().tasks.is_empty());
    assert!(!dir.path().join(format!("comments/{id}")).exists() && !log.exists());
}

#[test]
fn offline_duplicate_numbers_are_repaired_deterministically() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let web = project(&mut s, "WEB");
    let a = create(&mut s, "甲", Some(&web));
    // Simulate a second device that also created WEB-1 slightly later.
    let other = "zzzzzzzzzzzzzzzzzzzz";
    std::fs::write(
        dir.path().join(format!("items/{other}.md")),
        format!("---\ntitle: 乙\nproject: {web}\nnumber: 1\nstatus: todo\ncreated: 2999-01-01T00:00:00Z\n---\n"),
    )
    .unwrap();
    s.refresh().unwrap();
    assert_eq!(task(&s, &a).number, 1);
    let b = task(&s, other);
    assert_eq!(
        (b.number, b.previous_ids.clone()),
        (2, vec!["WEB-1".to_string()])
    );
}

#[test]
fn invalid_files_are_reported_without_hiding_others() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let ok = create(&mut s, "正常", None);
    std::fs::write(
        dir.path().join("items/broken0001.md"),
        "---\ntitle: [unclosed\n---\n",
    )
    .unwrap();
    s.refresh().unwrap();
    let snap = s.snapshot();
    assert_eq!(snap.tasks.len(), 1);
    assert_eq!(snap.tasks[0].id, ok);
    assert_eq!(snap.invalid[0].path, "items/broken0001.md");
}

#[test]
fn project_key_changes_keep_old_keys_reserved() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let web = project(&mut s, "WEB");
    assert!(s
        .apply(mutation(
            json!({ "kind": "createProject", "name": "x", "key": "web" })
        ))
        .is_err());
    let rev = s.snapshot().projects[0].revision.clone();
    s.apply(mutation(json!({ "kind": "updateProject", "id": web, "revision": rev, "set": { "key": "SITE", "description": "说明" } }))).unwrap();
    let p = s.snapshot().projects[0].clone();
    assert_eq!(
        (
            p.key.as_str(),
            p.previous_keys.clone(),
            p.description.as_str()
        ),
        ("SITE", vec!["WEB".to_string()], "说明")
    );
    assert!(s
        .apply(mutation(
            json!({ "kind": "createProject", "name": "y", "key": "WEB" })
        ))
        .is_err());
}
