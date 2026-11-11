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
fn cycles(s: &TaskStore) -> Vec<(u32, String, String, String)> {
    s.snapshot()
        .cycles
        .into_iter()
        .map(|c| (c.number, c.start, c.end, c.state))
        .collect()
}
fn c(n: u32, start: &str, end: &str, state: &str) -> (u32, String, String, String) {
    (n, start.into(), end.into(), state.into())
}

#[test]
fn enabling_cycles_places_the_current_and_next_cycle_from_the_local_date() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    // 2026-12-30 is a Wednesday; Monday starts, two-week cycles cross the year boundary.
    run(
        &mut s,
        json!({ "kind": "updateSettings", "set": { "cyclesEnabled": true, "cycleWeeks": 2, "cycleStartDay": 1, "today": "2026-12-30" } }),
    )
    .unwrap();
    assert_eq!(
        cycles(&s),
        [
            c(1, "2026-12-28", "2027-01-10", "active"),
            c(2, "2027-01-11", "2027-01-24", "upcoming"),
        ]
    );
    let settings = std::fs::read_to_string(dir.path().join("settings.yml")).unwrap();
    assert!(!settings.contains("today"), "the client date is not stored");
    // A new length reshapes only the cycle that has not started.
    run(
        &mut s,
        json!({ "kind": "updateSettings", "set": { "cycleWeeks": 1, "today": "2026-12-31" } }),
    )
    .unwrap();
    assert_eq!(
        cycles(&s),
        [
            c(1, "2026-12-28", "2027-01-10", "active"),
            c(2, "2027-01-11", "2027-01-17", "upcoming"),
        ]
    );
    // Turning cycles off keeps their history; turning them on again does not add cycles.
    run(
        &mut s,
        json!({ "kind": "updateSettings", "set": { "cyclesEnabled": false } }),
    )
    .unwrap();
    run(
        &mut s,
        json!({ "kind": "updateSettings", "set": { "cyclesEnabled": true, "today": "2027-01-02" } }),
    )
    .unwrap();
    assert_eq!(cycles(&s).len(), 2);
}

#[test]
fn completing_a_cycle_freezes_its_summary_and_moves_unfinished_work() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    run(
        &mut s,
        json!({ "kind": "updateSettings", "set": { "cyclesEnabled": true, "cycleWeeks": 1, "cycleStartDay": 1, "today": "2026-11-10" } }),
    )
    .unwrap();
    let done = create(
        &mut s,
        json!({ "title": "done", "cycle": 1, "status": "done" }),
    );
    let dropped = create(
        &mut s,
        json!({ "title": "dropped", "cycle": 1, "status": "cancelled" }),
    );
    let carry = create(&mut s, json!({ "title": "carry", "cycle": 1 }));
    let park = create(
        &mut s,
        json!({ "title": "park", "cycle": 1, "status": "in-progress" }),
    );
    let outside = create(&mut s, json!({ "title": "outside" }));
    assert!(task(&s, &carry).cycle_added.is_some());
    // One task joined after the cycle started: rewrite its timestamp into the future.
    let path = dir.path().join(format!("items/{park}.md"));
    let text = std::fs::read_to_string(&path).unwrap();
    let added = task(&s, &park).cycle_added.unwrap();
    std::fs::write(&path, text.replace(&added, "2999-01-01T00:00:00Z")).unwrap();
    s.refresh().unwrap();

    let r = run(
        &mut s,
        json!({ "kind": "completeCycle", "number": 1, "today": "2026-11-16", "moves": { park.clone(): "none" } }),
    )
    .unwrap();
    assert!(r.applied.contains(&carry) && r.applied.contains(&park));
    let snap = s.snapshot();
    let first = snap.cycles.iter().find(|c| c.number == 1).unwrap();
    let summary = first.summary.clone().unwrap();
    assert_eq!(first.state, "completed");
    assert_eq!((summary.planned, summary.added), (3, 1));
    assert_eq!(summary.completed, std::slice::from_ref(&done));
    assert_eq!(summary.cancelled, [dropped]);
    let mut unfinished = summary.unfinished.clone();
    unfinished.sort();
    let mut expected = vec![carry.clone(), park.clone()];
    expected.sort();
    assert_eq!(unfinished, expected);
    assert_eq!(task(&s, &carry).cycle, Some(2));
    assert_eq!(task(&s, &park).cycle, None);
    assert_eq!(task(&s, &park).cycle_added, None);
    assert_eq!(
        task(&s, &done).cycle,
        Some(1),
        "finished work stays in its cycle"
    );
    assert_eq!(task(&s, &outside).cycle, None);
    assert_eq!(
        cycles(&s),
        [
            c(1, "2026-11-09", "2026-11-15", "completed"),
            c(2, "2026-11-16", "2026-11-22", "active"),
            c(3, "2026-11-23", "2026-11-29", "upcoming"),
        ]
    );
    // Carried-over work counts as planned for the next cycle.
    let next = snap.cycles.iter().find(|c| c.number == 2).unwrap();
    assert!(task(&s, &carry).cycle_added.as_deref() <= next.started.as_deref());
    // The summary does not change when tasks change later, and history is closed.
    let rev = task(&s, &done).revision;
    run(
        &mut s,
        json!({ "kind": "patch", "ids": [done], "revisions": [rev], "set": { "status": "todo" } }),
    )
    .unwrap();
    assert_eq!(
        s.snapshot().cycles[0]
            .summary
            .as_ref()
            .unwrap()
            .completed
            .len(),
        1
    );
    let rev = task(&s, &outside).revision;
    let err = run(
        &mut s,
        json!({ "kind": "patch", "ids": [outside], "revisions": [rev], "set": { "cycle": 1 } }),
    )
    .unwrap_err();
    assert!(err.to_string().contains("已完成"));
    assert!(run(
        &mut s,
        json!({ "kind": "completeCycle", "number": 1, "today": "2026-11-16" })
    )
    .is_err());
    let err = run(
        &mut s,
        json!({ "kind": "createTask", "draft": { "title": "x", "cycle": 9 } }),
    )
    .unwrap_err();
    assert!(err.to_string().contains("迭代"));
}

#[test]
fn templates_save_validate_and_clear_project_defaults_on_delete() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let id = run(
        &mut s,
        json!({ "kind": "saveTemplate", "set": {
            "name": "Bug report", "title": "[Bug] ", "priority": 2, "type": "bug", "bucket": "now",
            "labels": [], "subtasks": ["复现", " ", "修复"], "description": "## 步骤\n\n1. "
        } }),
    )
    .unwrap()
    .created[0]
        .clone();
    assert_eq!(id, "bug-report");
    let t = s.snapshot().templates.into_iter().next().unwrap();
    assert_eq!(t.title, "[Bug]");
    assert_eq!(t.priority, 2);
    assert_eq!(t.kind.as_deref(), Some("bug"));
    assert_eq!(t.subtasks, ["复现", "修复"]);
    assert_eq!(t.description, "## 步骤\n\n1. ");
    let text = std::fs::read_to_string(dir.path().join("templates/bug-report.md")).unwrap();
    assert!(text.contains("priority: high") && !text.contains("labels"));
    assert!(
        text.starts_with("---\nname: Bug report\n"),
        "a new file reads name first"
    );

    assert!(run(
        &mut s,
        json!({ "kind": "saveTemplate", "set": { "name": "Bug report" } })
    )
    .is_err());
    assert!(run(
        &mut s,
        json!({ "kind": "saveTemplate", "set": { "name": "x", "status": "nope" } })
    )
    .is_err());
    assert!(run(
        &mut s,
        json!({ "kind": "saveTemplate", "set": { "name": "x", "labels": ["nope"] } })
    )
    .is_err());

    run(
        &mut s,
        json!({ "kind": "saveTemplate", "id": id, "set": { "name": "缺陷" } }),
    )
    .unwrap();
    let after = std::fs::read_to_string(dir.path().join("templates/bug-report.md")).unwrap();
    assert_eq!(
        after,
        text.replace("name: Bug report", "name: 缺陷"),
        "renames touch one key"
    );

    let p = run(
        &mut s,
        json!({ "kind": "createProject", "name": "官网", "key": "WEB" }),
    )
    .unwrap()
    .created[0]
        .clone();
    let rev = s.snapshot().projects[0].revision.clone();
    run(&mut s, json!({ "kind": "updateProject", "id": p, "revision": rev, "set": { "defaultTemplate": id } })).unwrap();
    assert_eq!(
        s.snapshot().projects[0].default_template.as_deref(),
        Some("bug-report")
    );
    run(
        &mut s,
        json!({ "kind": "deleteTemplate", "id": "bug-report" }),
    )
    .unwrap();
    assert!(s.snapshot().templates.is_empty());
    assert_eq!(s.snapshot().projects[0].default_template, None);
    let rev = s.snapshot().projects[0].revision.clone();
    assert!(run(&mut s, json!({ "kind": "updateProject", "id": p, "revision": rev, "set": { "defaultTemplate": "gone" } })).is_err());
}

#[test]
fn relations_reject_self_unknown_and_cycles_and_vanish_with_deleted_tasks() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let a = create(&mut s, json!({ "title": "a" }));
    let b = create(&mut s, json!({ "title": "b" }));
    let c = create(&mut s, json!({ "title": "c" }));
    let patch = |s: &mut TaskStore, id: &str, set: serde_json::Value| {
        let rev = task(s, id).revision;
        run(
            s,
            json!({ "kind": "patch", "ids": [id], "revisions": [rev], "set": set }),
        )
    };
    // b is blocked by a, c by b.
    patch(&mut s, &b, json!({ "blockedBy": [a] })).unwrap();
    patch(&mut s, &c, json!({ "blockedBy": [b], "related": [a] })).unwrap();
    assert_eq!(task(&s, &c).blocked_by, std::slice::from_ref(&b));
    let text = std::fs::read_to_string(dir.path().join(format!("items/{c}.md"))).unwrap();
    assert!(text.contains(&format!("blocked_by: [{b}]")));
    // a blocked by c would close the loop a → b → c → a.
    let err = patch(&mut s, &a, json!({ "blockedBy": [c] })).unwrap_err();
    assert!(err.to_string().contains("循环"));
    assert!(patch(&mut s, &a, json!({ "blockedBy": [a] })).is_err());
    assert!(patch(&mut s, &a, json!({ "related": ["nope000000"] })).is_err());
    // Deleting b drops it from c's relations; a stays related.
    let rev = task(&s, &b).revision;
    run(
        &mut s,
        json!({ "kind": "delete", "ids": [b], "revisions": [rev] }),
    )
    .unwrap();
    assert!(task(&s, &c).blocked_by.is_empty());
    assert_eq!(task(&s, &c).related, std::slice::from_ref(&a));
    let text = std::fs::read_to_string(dir.path().join(format!("items/{c}.md"))).unwrap();
    assert!(!text.contains("blocked_by"));
}

#[test]
fn writes_on_behalf_of_an_agent_record_it_in_the_activity() {
    let dir = tempfile::tempdir().unwrap();
    let mut s = store(dir.path());
    let id = s
        .apply_as(
            serde_json::from_value::<Mutation>(
                json!({ "kind": "createTask", "draft": { "title": "x" } }),
            )
            .unwrap(),
            "ai:claude-acp",
        )
        .unwrap()
        .applied[0]
        .clone();
    let rev = task(&s, &id).revision;
    run(
        &mut s,
        json!({ "kind": "patch", "ids": [id], "revisions": [rev], "set": { "status": "done" } }),
    )
    .unwrap();
    let activity =
        std::fs::read_to_string(dir.path().join(format!("activity/{id}.jsonl"))).unwrap();
    let lines: Vec<serde_json::Value> = activity
        .lines()
        .map(|l| serde_json::from_str(l).unwrap())
        .collect();
    assert_eq!(lines[0]["by"], "ai:claude-acp");
    assert!(
        lines[1].get("by").is_none(),
        "the person's own edit carries no actor"
    );
    assert_eq!(s.detail(&id).unwrap().activity[0]["by"], "ai:claude-acp");
    assert!(s
        .apply_as(
            serde_json::from_value::<Mutation>(
                json!({ "kind": "createTask", "draft": { "title": "y" } })
            )
            .unwrap(),
            ""
        )
        .is_err());
}
