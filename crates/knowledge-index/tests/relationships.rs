use knowledge_index::{references, snapshot, GraphQuery, Store};
use std::collections::BTreeSet;

#[test]
fn occurrences_backlinks_rename_and_missing_targets_stay_truthful() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("index.sqlite");
    let mut store = Store::open(&path).unwrap();
    assert!(store.sqlite_version().unwrap().as_str() >= "3.51.3");
    let mut affected = store
        .upsert("a.md", "1", "[b](b.md) [again](b.md#Section)\n")
        .unwrap();
    affected.extend(store.upsert("b.md", "1", "# Section").unwrap());
    store.resolve_sources(&affected).unwrap();
    let graph = snapshot(&path, &GraphQuery::default()).unwrap();
    assert_eq!(graph.edges.len(), 1);
    assert_eq!(graph.edges[0].count, 2);
    let links = references(&path, "b.md", true, 0).unwrap();
    assert_eq!(links.total, 2);
    assert!(!links.items[1].anchor_missing);
    let mut affected = store.remove("b.md").unwrap();
    affected.extend(store.upsert("c.md", "2", "# Section").unwrap());
    store.resolve_sources(&affected).unwrap();
    let graph = snapshot(
        &path,
        &GraphQuery {
            show_missing: false,
            ..Default::default()
        },
    )
    .unwrap();
    assert!(graph.edges.is_empty());
    assert_eq!(graph.unresolved, 2);
    assert_eq!(
        references(&path, "a.md", false, 0).unwrap().items[0].status,
        "missing"
    );
    let affected = store.upsert("a.md", "2", "[c](c.md)").unwrap();
    store.resolve_sources(&affected).unwrap();
    assert_eq!(
        snapshot(&path, &GraphQuery::default()).unwrap().edges[0].target,
        "c.md"
    );
}
#[test]
fn new_alias_and_same_name_invalidate_previously_resolved_references_only() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("index.sqlite");
    let mut store = Store::open(&path).unwrap();
    let mut affected = BTreeSet::new();
    for (path, text) in [
        ("root.md", "[[Note]] [[Alias]]"),
        ("one/Note.md", "---\naliases: [Alias]\n---\n# Note"),
        ("other.md", "[x](unrelated.md)"),
    ] {
        affected.extend(store.upsert(path, "1", text).unwrap());
    }
    store.resolve_sources(&affected).unwrap();
    let affected = store.upsert("two/Note.md", "1", "# Another").unwrap();
    assert!(affected.contains("root.md"));
    assert!(!affected.contains("other.md"));
    store.resolve_sources(&affected).unwrap();
    let links = references(&path, "root.md", false, 0).unwrap();
    assert_eq!(links.items[0].status, "ambiguous");
    assert_eq!(links.items[1].target.as_deref(), Some("one/Note.md"));
    let affected = store.remove("two/Note.md").unwrap();
    store.resolve_sources(&affected).unwrap();
    assert_eq!(
        references(&path, "root.md", false, 0).unwrap().items[0].status,
        "resolved"
    );
}
#[test]
fn publishing_batches_is_atomic_and_reopening_preserves_index() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("index.sqlite");
    let mut store = Store::open(&path).unwrap();
    store.begin_batch().unwrap();
    let affected = store.upsert("one.md", "1", "# One").unwrap();
    store.resolve_sources(&affected).unwrap();
    assert_eq!(
        snapshot(&path, &GraphQuery::default()).unwrap().total_notes,
        0
    );
    store.commit_batch().unwrap();
    assert_eq!(
        snapshot(&path, &GraphQuery::default()).unwrap().total_notes,
        1
    );
    drop(store);
    let mut store = Store::open(&path).unwrap();
    assert!(store.upsert("one.md", "2", "# One").unwrap().is_empty());
    assert_eq!(store.stamps().unwrap()["one.md"], "2");
}
#[test]
fn local_depth_limits_and_filters_never_invent_edges() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("index.sqlite");
    let mut store = Store::open(&path).unwrap();
    let mut changed = BTreeSet::new();
    for (path, text) in [
        ("a.md", "[b](b.md)"),
        ("b.md", "[c](c.md)"),
        ("c.md", ""),
        ("d.md", ""),
    ] {
        changed.extend(store.upsert(path, "1", text).unwrap());
    }
    store.resolve_sources(&changed).unwrap();
    let q = GraphQuery {
        focus: Some("a.md".into()),
        ..Default::default()
    };
    assert_eq!(snapshot(&path, &q).unwrap().nodes.len(), 2);
    assert_eq!(
        snapshot(
            &path,
            &GraphQuery {
                depth: 2,
                ..q.clone()
            }
        )
        .unwrap()
        .nodes
        .len(),
        3
    );
    assert!(
        snapshot(&path, &GraphQuery { limit: 1, ..q })
            .unwrap()
            .truncated
    );
    assert_eq!(
        snapshot(
            &path,
            &GraphQuery {
                show_orphans: false,
                ..Default::default()
            }
        )
        .unwrap()
        .nodes
        .len(),
        3
    );
}

#[test]
fn source_navigation_anchors_and_filtered_missing_occurrences_are_exact() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("index.sqlite");
    let mut store = Store::open(&db).unwrap();
    let text = "# 标题\r\n\r\n😀 [x](target.md#不存在)\n[missing](absent.md)\n";
    let mut changed = store.upsert("source.md", "1", text).unwrap();
    changed.extend(store.upsert("target.md", "1", "# 存在\n").unwrap());
    store.resolve_sources(&changed).unwrap();
    let location = knowledge_index::anchor(&db, "source.md", "标题")
        .unwrap()
        .unwrap();
    assert_eq!(location.location.line, 1);
    assert_eq!(
        location.source_fingerprint,
        knowledge_index::fingerprint(text)
    );
    let refs = knowledge_index::references_matching(&db, "source.md", false, 0, Some("absent.md"))
        .unwrap();
    assert_eq!(refs.total, 1);
    assert_eq!(refs.items[0].location.line, 4);
    assert!(references(&db, "target.md", true, 0).unwrap().items[0].anchor_missing);
}
#[test]
fn a_manual_rebuild_reextracts_unchanged_content() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("index.sqlite");
    let mut store = Store::open(&db).unwrap();
    let changed = store.upsert("source.md", "1", "[x](target.md)").unwrap();
    store.resolve_sources(&changed).unwrap();
    assert!(store
        .upsert("source.md", "1", "[x](target.md)")
        .unwrap()
        .is_empty());
    store.invalidate().unwrap();
    assert!(store
        .upsert("source.md", "1", "[x](target.md)")
        .unwrap()
        .contains("source.md"));
}

#[test]
fn unresolved_links_are_not_orphans_and_every_display_cut_is_reported() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("index.sqlite");
    let mut store = Store::open(&db).unwrap();
    let text = (0..600)
        .map(|i| format!("[missing](missing-{i}.md)\n"))
        .collect::<String>();
    let changed = store.upsert("source.md", "1", &text).unwrap();
    store.resolve_sources(&changed).unwrap();
    let graph = snapshot(
        &db,
        &GraphQuery {
            show_orphans: false,
            ..Default::default()
        },
    )
    .unwrap();
    assert!(graph
        .nodes
        .iter()
        .any(|node| node.path.as_deref() == Some("source.md")));
    assert!(graph.truncated);
    assert_eq!(graph.edges.len(), 500);
    let changed = store.upsert("alone.md", "1", "# Alone").unwrap();
    store.resolve_sources(&changed).unwrap();
    let graph = snapshot(
        &db,
        &GraphQuery {
            focus: Some("alone.md".into()),
            limit: 1,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(graph.nodes.len(), 1);
    assert!(!graph.truncated);
}
