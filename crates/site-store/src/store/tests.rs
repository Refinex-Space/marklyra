use super::*;
use cap_std::ambient_authority;
use serde_json::json;

fn store() -> (tempfile::TempDir, SiteStore) {
    let temp = tempfile::tempdir().unwrap();
    let dir = Dir::open_ambient_dir(temp.path(), ambient_authority()).unwrap();
    (temp, SiteStore::initialize(dir).unwrap())
}

fn set(value: Value) -> Map<String, Value> {
    value.as_object().unwrap().clone()
}

fn add_group(store: &mut SiteStore, name: &str, parent: Option<&str>) -> String {
    store
        .apply(Mutation::AddGroup {
            name: name.into(),
            color: None,
            parent: parent.map(str::to_owned),
        })
        .unwrap()
        .created
        .remove(0)
}

fn add_site(store: &mut SiteStore, url: &str, group: Option<&str>) -> String {
    store
        .apply(Mutation::AddItem {
            url: url.into(),
            group: group.map(str::to_owned),
            title: None,
            description: None,
            pinned: false,
            manual: vec![],
        })
        .unwrap()
        .created
        .remove(0)
}

fn site(store: &SiteStore, id: &str) -> Site {
    store
        .snapshot()
        .items
        .into_iter()
        .find(|s| s.id == id)
        .unwrap()
}

fn group(store: &SiteStore, id: &str) -> Group {
    store
        .snapshot()
        .groups
        .into_iter()
        .find(|g| g.id == id)
        .unwrap()
}

fn ids_in(store: &SiteStore, group: Option<&str>) -> Vec<String> {
    store
        .snapshot()
        .items
        .into_iter()
        .filter(|s| s.group.as_deref() == group)
        .map(|s| s.id)
        .collect()
}

#[test]
fn opening_an_empty_directory_is_empty_and_writes_nothing() {
    let temp = tempfile::tempdir().unwrap();
    let dir = Dir::open_ambient_dir(temp.path(), ambient_authority()).unwrap();
    let store = SiteStore::open(dir).unwrap();
    let snapshot = store.snapshot();
    assert!(snapshot.groups.is_empty() && snapshot.items.is_empty());
    assert_eq!(std::fs::read_dir(temp.path()).unwrap().count(), 0);
}

#[test]
fn initialize_lays_out_directories_once() {
    let (temp, _) = store();
    assert!(temp.path().join("groups").is_dir() && temp.path().join("items").is_dir());
    assert_eq!(
        std::fs::read_to_string(temp.path().join(".gitattributes")).unwrap(),
        "icons/* binary\n"
    );
    std::fs::write(temp.path().join(".gitattributes"), "mine\n").unwrap();
    let dir = Dir::open_ambient_dir(temp.path(), ambient_authority()).unwrap();
    SiteStore::initialize(dir).unwrap();
    assert_eq!(
        std::fs::read_to_string(temp.path().join(".gitattributes")).unwrap(),
        "mine\n"
    );
}

#[test]
fn a_site_round_trips_through_its_file_with_chinese_and_special_text() {
    let (temp, mut store) = store();
    let g = add_group(&mut store, "开发工具", None);
    let id = store
        .apply(Mutation::AddItem {
            url: "HTTPS://Example.com:443/a b?x=1#frag".into(),
            group: Some(g.clone()),
            title: Some("  标题: \"引号\" #井号  ".into()),
            description: Some("true".into()),
            pinned: true,
            manual: vec!["title".into()],
        })
        .unwrap()
        .created
        .remove(0);
    let s = site(&store, &id);
    assert_eq!(s.url, "https://example.com/a%20b?x=1#frag");
    assert_eq!(s.title, "标题: \"引号\" #井号");
    assert_eq!(s.description, "true");
    assert!(s.pinned && s.manual == ["title"]);
    assert_eq!(s.group.as_deref(), Some(g.as_str()));
    // A fresh store over the same files reads exactly the same thing.
    let dir = Dir::open_ambient_dir(temp.path(), ambient_authority()).unwrap();
    assert_eq!(site(&SiteStore::open(dir).unwrap(), &id), s);
}

#[test]
fn title_defaults_to_the_host_and_hostile_urls_never_reach_disk() {
    let (temp, mut store) = store();
    let id = add_site(&mut store, "https://www.vitejs.dev/guide", None);
    assert_eq!(site(&store, &id).title, "vitejs.dev");
    for bad in [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "https://u:p@x.com/",
        "x.com",
    ] {
        let err = store
            .apply(Mutation::AddItem {
                url: bad.into(),
                group: None,
                title: None,
                description: None,
                pinned: false,
                manual: vec![],
            })
            .unwrap_err();
        assert!(matches!(err, StoreError::Invalid(_)), "{bad}");
    }
    assert_eq!(
        std::fs::read_dir(temp.path().join("items"))
            .unwrap()
            .count(),
        1
    );
}

#[test]
fn update_keeps_body_unknown_keys_and_pins_edited_fields() {
    let (temp, mut store) = store();
    let id = add_site(&mut store, "https://a.dev/", None);
    let path = temp.path().join("items").join(format!("{id}.md"));
    let mut text = std::fs::read_to_string(&path).unwrap();
    text.push_str("我的备注\n第二行");
    text = text.replacen("---\n", "---\ncustom_key: 保留\n", 1);
    std::fs::write(&path, text).unwrap();
    let rev = {
        store.refresh().unwrap();
        site(&store, &id).revision
    };
    let result = store
        .apply(Mutation::UpdateItem {
            id: id.clone(),
            revision: rev,
            set: set(json!({"title": "新标题", "description": "描述", "pinned": true})),
        })
        .unwrap();
    assert_eq!(result.applied, std::slice::from_ref(&id));
    let after = std::fs::read_to_string(&path).unwrap();
    assert!(after.contains("custom_key: 保留") && after.ends_with("我的备注\n第二行"));
    let s = site(&store, &id);
    assert_eq!((s.title.as_str(), s.pinned), ("新标题", true));
    let mut manual = s.manual.clone();
    manual.sort();
    assert_eq!(manual, ["description", "title"]);
    // Clearing a field hands it back to the fetch.
    let cleared = store
        .apply(Mutation::UpdateItem {
            id: id.clone(),
            revision: s.revision,
            set: set(json!({"title": "  "})),
        })
        .unwrap();
    assert_eq!(cleared.applied.len(), 1);
    let s = site(&store, &id);
    assert_eq!(s.title, "a.dev");
    assert_eq!(s.manual, ["description"]);
}

#[test]
fn a_patch_that_changes_nothing_leaves_the_file_alone() {
    let (temp, mut store) = store();
    let id = add_site(&mut store, "https://a.dev/", None);
    let path = temp.path().join("items").join(format!("{id}.md"));
    // Same data, different bytes (CRLF, BOM): must not be rewritten by a no-op update.
    let crlf = std::fs::read_to_string(&path)
        .unwrap()
        .replace('\n', "\r\n");
    std::fs::write(&path, format!("\u{feff}{crlf}")).unwrap();
    store.refresh().unwrap();
    let s = site(&store, &id);
    store
        .apply(Mutation::UpdateItem {
            id: id.clone(),
            revision: s.revision,
            set: set(json!({"pinned": false})),
        })
        .unwrap();
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        format!("\u{feff}{crlf}")
    );
}

#[test]
fn stale_revisions_are_reported_not_applied() {
    let (_temp, mut store) = store();
    let id = add_site(&mut store, "https://a.dev/", None);
    let old = site(&store, &id).revision;
    store
        .apply(Mutation::UpdateItem {
            id: id.clone(),
            revision: old.clone(),
            set: set(json!({"pinned": true})),
        })
        .unwrap();
    let result = store
        .apply(Mutation::UpdateItem {
            id: id.clone(),
            revision: old.clone(),
            set: set(json!({"title": "晚到的修改"})),
        })
        .unwrap();
    assert_eq!(result.conflicts, std::slice::from_ref(&id));
    assert!(result.applied.is_empty());
    assert_eq!(site(&store, &id).title, "a.dev");
    let removal = store
        .apply(Mutation::RemoveItems {
            ids: vec![id.clone()],
            revisions: vec![old],
        })
        .unwrap();
    assert_eq!(removal.conflicts, std::slice::from_ref(&id));
    assert_eq!(ids_in(&store, None), [id]);
}

#[test]
fn update_rejects_unknown_keys_and_bad_values() {
    let (_temp, mut store) = store();
    let id = add_site(&mut store, "https://a.dev/", None);
    let rev = site(&store, &id).revision;
    for bad in [
        json!({"icon": "icons/x.png"}),
        json!({"url": "javascript:1"}),
        json!({"pinned": "yes"}),
        json!({"group": "nogroup"}),
    ] {
        let err = store
            .apply(Mutation::UpdateItem {
                id: id.clone(),
                revision: rev.clone(),
                set: set(bad.clone()),
            })
            .unwrap_err();
        assert!(
            matches!(err, StoreError::Invalid(_) | StoreError::NotFound(_)),
            "{bad}"
        );
    }
}

#[test]
fn groups_nest_one_level_only() {
    let (_temp, mut store) = store();
    let a = add_group(&mut store, "甲", None);
    let b = add_group(&mut store, "乙", Some(&a));
    assert_eq!(group(&store, &b).parent.as_deref(), Some(a.as_str()));
    assert!(store
        .apply(Mutation::AddGroup {
            name: "丙".into(),
            color: None,
            parent: Some(b.clone()),
        })
        .is_err());
    // A group with children cannot become a child, and nothing is its own parent.
    let c = add_group(&mut store, "丁", None);
    let rev = group(&store, &a).revision;
    assert!(store
        .apply(Mutation::UpdateGroup {
            id: a.clone(),
            revision: rev,
            set: set(json!({"parent": c})),
        })
        .is_err());
    let rev = group(&store, &c).revision;
    assert!(store
        .apply(Mutation::UpdateGroup {
            id: c.clone(),
            revision: rev,
            set: set(json!({"parent": c})),
        })
        .is_err());
}

#[test]
fn group_updates_validate_name_and_color() {
    let (_temp, mut store) = store();
    let a = add_group(&mut store, "甲", None);
    let mut rev = group(&store, &a).revision;
    for (patch, ok) in [
        (json!({"name": " "}), false),
        (json!({"color": "chartreuse"}), false),
        (
            json!({"color": "#12ab9f", "name": "新名字", "collapsed": true}),
            true,
        ),
    ] {
        let outcome = store.apply(Mutation::UpdateGroup {
            id: a.clone(),
            revision: rev.clone(),
            set: set(patch),
        });
        assert_eq!(outcome.is_ok(), ok);
        rev = group(&store, &a).revision;
    }
    let g = group(&store, &a);
    assert_eq!(
        (g.name.as_str(), g.color.as_str(), g.collapsed),
        ("新名字", "#12ab9f", true)
    );
}

#[test]
fn removing_a_group_ungroups_or_deletes_its_sites_and_children() {
    for policy in [ItemsPolicy::Ungroup, ItemsPolicy::Delete] {
        let (temp, mut store) = store();
        let parent = add_group(&mut store, "父", None);
        let child = add_group(&mut store, "子", Some(&parent));
        let other = add_group(&mut store, "别的", None);
        let in_parent = add_site(&mut store, "https://p.dev/", Some(&parent));
        let in_child = add_site(&mut store, "https://c.dev/", Some(&child));
        let kept = add_site(&mut store, "https://o.dev/", Some(&other));
        let rev = group(&store, &parent).revision;
        let result = store
            .apply(Mutation::RemoveGroup {
                id: parent.clone(),
                revision: rev,
                items: policy,
            })
            .unwrap();
        assert_eq!(result.applied, std::slice::from_ref(&parent));
        let snapshot = store.snapshot();
        assert_eq!(snapshot.groups.len(), 1);
        assert_eq!(site(&store, &kept).group.as_deref(), Some(other.as_str()));
        match policy {
            ItemsPolicy::Ungroup => {
                assert_eq!(snapshot.items.len(), 3);
                assert!(site(&store, &in_parent).group.is_none());
                assert!(site(&store, &in_child).group.is_none());
            }
            ItemsPolicy::Delete => assert_eq!(snapshot.items.len(), 1),
        }
        assert!(!temp
            .path()
            .join("groups")
            .join(format!("{child}.md"))
            .exists());
    }
}

#[test]
fn move_places_sites_in_front_of_an_anchor_or_at_the_end() {
    let (_temp, mut store) = store();
    let g = add_group(&mut store, "组", None);
    let a = add_site(&mut store, "https://a.dev/", Some(&g));
    let b = add_site(&mut store, "https://b.dev/", Some(&g));
    let c = add_site(&mut store, "https://c.dev/", Some(&g));
    let loose = add_site(&mut store, "https://d.dev/", None);
    assert_eq!(ids_in(&store, Some(&g)), [a.clone(), b.clone(), c.clone()]);
    let rev = site(&store, &c).revision;
    store
        .apply(Mutation::MoveItems {
            ids: vec![c.clone()],
            revisions: vec![rev],
            group: Some(g.clone()),
            before: Some(a.clone()),
        })
        .unwrap();
    assert_eq!(ids_in(&store, Some(&g)), [c.clone(), a.clone(), b.clone()]);
    let rev = site(&store, &loose).revision;
    store
        .apply(Mutation::MoveItems {
            ids: vec![loose.clone()],
            revisions: vec![rev],
            group: Some(g.clone()),
            before: Some(b.clone()),
        })
        .unwrap();
    assert_eq!(
        ids_in(&store, Some(&g)),
        [c.clone(), a.clone(), loose.clone(), b.clone()]
    );
    let rev = site(&store, &c).revision;
    store
        .apply(Mutation::MoveItems {
            ids: vec![c.clone()],
            revisions: vec![rev],
            group: None,
            before: None,
        })
        .unwrap();
    assert_eq!(ids_in(&store, None), [c]);
    assert!(store
        .apply(Mutation::MoveItems {
            ids: vec![a],
            revisions: vec![],
            group: None,
            before: None,
        })
        .is_err());
}

#[test]
fn reorder_groups_sets_sibling_order() {
    let (_temp, mut store) = store();
    let a = add_group(&mut store, "甲", None);
    let b = add_group(&mut store, "乙", None);
    let c = add_group(&mut store, "丙", None);
    store
        .apply(Mutation::ReorderGroups {
            ids: vec![c.clone(), a.clone(), b.clone()],
            parent: None,
        })
        .unwrap();
    let order: Vec<String> = store.snapshot().groups.into_iter().map(|g| g.id).collect();
    assert_eq!(order, [c.clone(), a.clone(), b]);
    let child = add_group(&mut store, "子", Some(&a));
    assert!(store
        .apply(Mutation::ReorderGroups {
            ids: vec![child, c],
            parent: None,
        })
        .is_err());
}

#[test]
fn files_the_app_cannot_read_are_listed_and_never_touched() {
    let (temp, mut store) = store();
    let good = add_site(&mut store, "https://a.dev/", None);
    let items = temp.path().join("items");
    std::fs::write(items.join("brokenid1.md"), "---\nurl: [oops\n---\n").unwrap();
    std::fs::write(items.join("nourlfile.md"), "---\ntitle: 没有网址\n---\n").unwrap();
    std::fs::write(
        items.join("badscheme.md"),
        "---\nurl: javascript:alert(1)\n---\n",
    )
    .unwrap();
    std::fs::write(items.join("toobig123.md"), "x".repeat(70 * 1024)).unwrap();
    std::fs::write(items.join("notes.txt"), "ignored").unwrap();
    store.refresh().unwrap();
    let snapshot = store.snapshot();
    assert_eq!(snapshot.items.len(), 1);
    let paths: Vec<&str> = snapshot.invalid.iter().map(|i| i.path.as_str()).collect();
    assert_eq!(
        paths,
        [
            "items/badscheme.md",
            "items/brokenid1.md",
            "items/nourlfile.md",
            "items/toobig123.md"
        ]
    );
    assert_eq!(
        std::fs::read_to_string(items.join("brokenid1.md")).unwrap(),
        "---\nurl: [oops\n---\n"
    );
    // An invalid file cannot be edited through the store.
    assert!(store
        .apply(Mutation::UpdateItem {
            id: "brokenid1".into(),
            revision: String::new(),
            set: set(json!({"pinned": true})),
        })
        .is_err());
    assert_eq!(ids_in(&store, None), [good]);
}

#[test]
fn orphaned_group_and_parent_references_read_as_top_level() {
    let (temp, mut store) = store();
    let g = add_group(&mut store, "组", None);
    let s = add_site(&mut store, "https://a.dev/", Some(&g));
    let child = add_group(&mut store, "孩子", Some(&g));
    std::fs::remove_file(temp.path().join("groups").join(format!("{g}.md"))).unwrap();
    store.refresh().unwrap();
    assert!(site(&store, &s).group.is_none());
    assert!(group(&store, &child).parent.is_none());
}

#[cfg(unix)]
#[test]
fn symlinked_files_are_ignored() {
    let (temp, mut store) = store();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(
        outside.path().join("x.md"),
        "---\nurl: https://evil.dev/\n---\n",
    )
    .unwrap();
    std::os::unix::fs::symlink(
        outside.path().join("x.md"),
        temp.path().join("items").join("linkedfile.md"),
    )
    .unwrap();
    store.refresh().unwrap();
    assert!(store.snapshot().items.is_empty() && store.snapshot().invalid.is_empty());
}

#[test]
fn generation_moves_only_when_files_change() {
    let (_temp, mut store) = store();
    let before = store.generation();
    assert!(!store.refresh().unwrap());
    assert_eq!(store.generation(), before);
    add_site(&mut store, "https://a.dev/", None);
    assert!(store.generation() > before);
}

#[test]
fn limits_are_enforced() {
    let (_temp, mut store) = store();
    assert!(store
        .apply(Mutation::AddGroup {
            name: " ".into(),
            color: None,
            parent: None
        })
        .is_err());
    assert!(store
        .apply(Mutation::AddItem {
            url: "https://a.dev/".into(),
            group: None,
            title: None,
            description: None,
            pinned: false,
            manual: vec!["url".into()],
        })
        .is_err());
    let long = store
        .apply(Mutation::AddItem {
            url: "https://a.dev/".into(),
            group: None,
            title: Some("长".repeat(500)),
            description: Some("述".repeat(900)),
            pinned: false,
            manual: vec![],
        })
        .unwrap();
    let s = site(&store, &long.created[0]);
    assert_eq!(
        (s.title.chars().count(), s.description.chars().count()),
        (120, 300)
    );
}

#[test]
fn mutations_deserialize_from_the_shell_wire_format() {
    let add: Mutation = serde_json::from_value(json!({
        "kind": "addItem", "url": "https://a.dev/", "group": null, "pinned": true
    }))
    .unwrap();
    assert!(matches!(add, Mutation::AddItem { pinned: true, .. }));
    let remove: Mutation = serde_json::from_value(json!({
        "kind": "removeGroup", "id": "abcdefgh", "revision": "r", "items": "ungroup"
    }))
    .unwrap();
    assert!(matches!(
        remove,
        Mutation::RemoveGroup {
            items: ItemsPolicy::Ungroup,
            ..
        }
    ));
    assert!(
        serde_json::from_value::<Mutation>(json!({"kind": "addItem", "url": "x", "bogus": 1}))
            .is_err()
    );
}

#[test]
fn a_fetch_skips_manual_fields_and_unreferenced_icons_are_removed() {
    let (temp, mut store) = store();
    let id = add_site(&mut store, "https://vitejs.dev/", None);
    let rev = site(&store, &id).revision;
    store
        .apply(Mutation::UpdateItem {
            id: id.clone(),
            revision: rev,
            set: set(json!({"title": "手写"})),
        })
        .unwrap();
    let icon = store
        .write_icon("aaaaaaaaaaaaaaaa.png", b"\x89PNG-real")
        .unwrap();
    assert!(store
        .apply_fetch(
            &id,
            FetchPatch {
                title: Some("抓取标题".into()),
                description: Some("抓取描述".into()),
                icon: Some(Some(icon.clone())),
            },
        )
        .unwrap());
    let saved = site(&store, &id);
    assert_eq!(saved.title, "手写");
    assert_eq!(saved.description, "抓取描述");
    assert_eq!(saved.icon.as_deref(), Some(icon.as_str()));
    assert!(saved.manual.iter().any(|field| field == "title"));
    assert!(!saved.manual.iter().any(|field| field == "description"));
    assert!(saved.fetched.is_some());
    assert!(!store
        .apply_fetch(
            &id,
            FetchPatch {
                title: Some("再次抓取".into()),
                description: None,
                icon: None,
            },
        )
        .unwrap());
    store
        .write_icon("bbbbbbbbbbbbbbbb.png", b"\x89PNG-orphan")
        .unwrap();
    let letter = store
        .assign_icon(&id, &site(&store, &id).revision, None, true)
        .unwrap();
    assert_eq!(letter.applied, vec![id.clone()]);
    assert!(site(&store, &id).icon.is_none());
    assert!(site(&store, &id).manual.iter().any(|field| field == "icon"));
    assert!(!store
        .apply_fetch(
            &id,
            FetchPatch {
                title: None,
                description: None,
                icon: Some(Some(icon)),
            },
        )
        .unwrap());
    store
        .apply(Mutation::RemoveItems {
            ids: vec![id.clone()],
            revisions: vec![site(&store, &id).revision],
        })
        .unwrap();
    assert!(!temp.path().join("icons/aaaaaaaaaaaaaaaa.png").exists());
    assert!(!temp.path().join("icons/bbbbbbbbbbbbbbbb.png").exists());
    assert!(store.read_icon("aaaaaaaaaaaaaaaa.png").is_err());
}
