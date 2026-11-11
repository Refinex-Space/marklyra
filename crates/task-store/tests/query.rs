//! Shared query vectors: the same file drives `apps/desktop/test/tasks-query-vectors.test.ts`.
use std::collections::HashMap;
use task_store::query::{parse, QueryContext};
use task_store::{Cycle, Dictionary, Project, Settings, Status, Task};

#[test]
fn query_vectors_match_the_typescript_evaluator() {
    let text = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/query-vectors.json"),
    )
    .unwrap();
    let data: serde_json::Value = serde_json::from_str(&text).unwrap();
    let take = |key: &str| data[key].clone();
    let tasks: Vec<Task> = serde_json::from_value(take("tasks")).unwrap();
    let statuses: Vec<Status> = serde_json::from_value(take("statuses")).unwrap();
    let labels: Vec<Dictionary> = serde_json::from_value(take("labels")).unwrap();
    let types: Vec<Dictionary> = serde_json::from_value(take("types")).unwrap();
    let buckets: Vec<Dictionary> = serde_json::from_value(take("buckets")).unwrap();
    let projects: Vec<Project> = serde_json::from_value(take("projects")).unwrap();
    let cycles: Vec<Cycle> = serde_json::from_value(take("cycles")).unwrap();
    let settings: Settings = serde_json::from_value(take("settings")).unwrap();
    let bodies: HashMap<String, String> = serde_json::from_value(take("bodies")).unwrap();
    let today = data["today"].as_str().unwrap();
    // Noon on `today`, read the same way as the TypeScript test's local noon.
    let day = task_store::query::parse_instant(&format!("{today}T12:00:00Z")).unwrap();
    let ctx = QueryContext {
        tasks: &tasks,
        statuses: &statuses,
        labels: &labels,
        types: &types,
        buckets: &buckets,
        projects: &projects,
        cycles: &cycles,
        settings: &settings,
        bodies: Some(&bodies),
        today: day.div_euclid(86_400),
        now: day,
    };
    let mut failures = Vec::new();
    for case in data["cases"].as_array().unwrap() {
        let query = case[0].as_str().unwrap();
        let expected: Vec<&str> = case[1]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap())
            .collect();
        let actual: Vec<&str> = ctx
            .select(&parse(query))
            .iter()
            .map(|t| t.id.as_str())
            .collect();
        if actual != expected {
            failures.push(format!("{query}: expected {expected:?}, got {actual:?}"));
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
