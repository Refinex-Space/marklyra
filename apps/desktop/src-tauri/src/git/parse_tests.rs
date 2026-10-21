use super::*;

#[test]
fn status_v2_covers_every_entry_kind() {
    let raw = concat!(
        "# branch.oid 1111111111111111111111111111111111111111\0",
        "# branch.head 主分支\0",
        "# branch.upstream origin/主分支\0",
        "# branch.ab +2 -3\0",
        "1 .M N... 100644 100644 100644 aaa bbb 笔记/第 1 章.md\0",
        "1 A. N... 000000 100644 100644 000 bbb new file.md\0",
        "1 D. N... 100644 000000 000000 aaa 000 gone.md\0",
        "1 .T N... 100644 120000 120000 aaa bbb link.md\0",
        "2 R. N... 100644 100644 100644 aaa bbb R100 新 名.md\0旧 名.md\0",
        "u UU N... 100644 100644 100644 100644 a b c both.md\0",
        "u DU N... 100644 000000 100644 100644 a b c ours-deleted.md\0",
        "u AA N... 000000 100644 100644 100644 a b c added.md\0",
        "? untracked dir/file.md\0",
        "! ignored.log\0",
    );
    let (header, changes, truncated) = status(raw.as_bytes());
    assert!(!truncated);
    assert_eq!(header.head.branch.as_deref(), Some("主分支"));
    assert_eq!(header.upstream.as_deref(), Some("origin/主分支"));
    assert_eq!((header.ahead, header.behind), (2, 3));
    assert!(!header.head.detached && !header.head.unborn);
    let kinds: Vec<_> = changes.iter().map(|c| (c.path.as_str(), c.kind)).collect();
    assert_eq!(
        kinds,
        [
            ("笔记/第 1 章.md", ChangeKind::Modified),
            ("new file.md", ChangeKind::Added),
            ("gone.md", ChangeKind::Deleted),
            ("link.md", ChangeKind::Typechange),
            ("新 名.md", ChangeKind::Renamed),
            ("both.md", ChangeKind::Conflicted),
            ("ours-deleted.md", ChangeKind::Conflicted),
            ("added.md", ChangeKind::Conflicted),
            ("untracked dir/file.md", ChangeKind::Untracked),
        ]
    );
    assert_eq!(changes[0].index, ".");
    assert_eq!(changes[0].worktree, "M");
    assert_eq!(changes[4].orig_path.as_deref(), Some("旧 名.md"));
    assert_eq!(changes[5].conflict, Some(ConflictKind::BothModified));
    assert_eq!(changes[6].conflict, Some(ConflictKind::DeletedByUs));
    assert_eq!(changes[7].conflict, Some(ConflictKind::BothAdded));
    assert_eq!(changes[8].index, "?");

    let (header, changes, _) = status(b"# branch.oid (initial)\0# branch.head main\0");
    assert!(header.head.unborn && header.head.oid.is_none() && changes.is_empty());
    let (header, _, _) = status(b"# branch.oid abc\0# branch.head (detached)\0");
    assert!(header.head.detached && header.head.branch.is_none());

    let many: String = (0..STATUS_LIMIT + 5)
        .map(|i| format!("? f{i}.md\0"))
        .collect();
    let (_, changes, truncated) = status(many.as_bytes());
    assert!(truncated && changes.len() == STATUS_LIMIT);
}

#[test]
fn conflict_kinds_follow_porcelain_letters() {
    for (x, y, kind) in [
        ('D', 'D', ConflictKind::BothDeleted),
        ('A', 'U', ConflictKind::AddedByUs),
        ('U', 'D', ConflictKind::DeletedByThem),
        ('U', 'A', ConflictKind::AddedByThem),
        ('D', 'U', ConflictKind::DeletedByUs),
        ('A', 'A', ConflictKind::BothAdded),
        ('U', 'U', ConflictKind::BothModified),
    ] {
        assert_eq!(conflict_kind(x, y), kind);
    }
}

#[test]
fn for_each_ref_records() {
    let raw = concat!(
        "refs/heads/main\x1f1111\x1forigin/main\x1f[ahead 1, behind 2]\x1f*\x1f\x1f1700000000\x1fsubject one\0",
        "\nrefs/heads/old\x1f2222\x1forigin/old\x1f[gone]\x1f \x1f\x1f1600000000\x1fsubject\x1fwith US\0",
        "\nrefs/heads/功能\x1f3333\x1f\x1f\x1f \x1f\x1f1650000000\x1f中文\0",
        "\nrefs/remotes/origin/HEAD\x1f1111\x1f\x1f\x1f \x1frefs/remotes/origin/main\x1f1700000000\x1fx\0",
        "\nrefs/remotes/up.stream/feature/a\x1f4444\x1f\x1f\x1f \x1f\x1f1700000001\x1fy\0",
        "\nrefs/remotes/origin/main\x1f1111\x1f\x1f\x1f \x1f\x1f1700000000\x1fsubject one\0",
    );
    let result = branches(raw.as_bytes(), &["origin".into(), "up.stream".into()]);
    assert_eq!(result.current.as_deref(), Some("main"));
    let names: Vec<_> = result.local.iter().map(|b| b.name.as_str()).collect();
    assert_eq!(names, ["main", "old", "功能"]);
    assert_eq!((result.local[0].ahead, result.local[0].behind), (1, 2));
    assert!(result.local[1].gone && !result.local[1].current);
    assert_eq!(result.local[1].subject, "subject\x1fwith US");
    assert_eq!(result.local[2].upstream, None);
    let remotes: Vec<_> = result
        .remote
        .iter()
        .map(|b| (b.remote.as_str(), b.name.as_str(), b.full_name.as_str()))
        .collect();
    assert_eq!(
        remotes,
        [
            ("origin", "main", "origin/main"),
            ("up.stream", "feature/a", "up.stream/feature/a")
        ]
    );
    let tag_raw =
        "refs/tags/v1\x1faaaa\x1f\x1f1600000000\0\nrefs/tags/v2\x1fbbbb\x1fcccc\x1f1700000000\0";
    let result = tags(tag_raw.as_bytes());
    assert_eq!(
        result[0],
        GitTag {
            name: "v2".into(),
            oid: "cccc".into(),
            time: 1700000000
        }
    );
    assert_eq!(result[1].oid, "aaaa");
    assert_eq!(track(""), (0, 0, false));
    assert_eq!(track("[behind 4]"), (0, 4, false));
}

#[test]
fn log_records_and_decorations() {
    let raw = concat!(
        "aaaa\x1fbbbb cccc\x1fAuthor\x1fa@e\x1f1700000000\x1fCommitter\x1f1700000100\x1f",
        "HEAD -> refs/heads/main, tag: refs/tags/v1, refs/remotes/origin/main, refs/remotes/origin/HEAD, refs/stash\x1f",
        "Merge branch 'x'\x1e\n",
        "bbbb\x1f\x1fA\x1fa@e\x1f1\x1fC\x1f2\x1f\x1froot\x1e\n",
    );
    let commits = log(raw.as_bytes());
    assert_eq!(commits.len(), 2);
    assert_eq!(commits[0].parents, ["bbbb", "cccc"]);
    assert_eq!(commits[0].subject, "Merge branch 'x'");
    assert_eq!(
        commits[0].refs,
        [
            GitRef {
                kind: RefKind::Head,
                name: "HEAD".into()
            },
            GitRef {
                kind: RefKind::Local,
                name: "main".into()
            },
            GitRef {
                kind: RefKind::Tag,
                name: "v1".into()
            },
            GitRef {
                kind: RefKind::Remote,
                name: "origin/main".into()
            },
        ]
    );
    assert!(commits[1].parents.is_empty() && commits[1].refs.is_empty());
    assert_eq!(commits[1].body, "");
    assert_eq!(
        decorations("HEAD"),
        [GitRef {
            kind: RefKind::Head,
            name: "HEAD".into()
        }]
    );
    let details = log(
        "a\x1f\x1fA\x1fe\x1f1\x1fC\x1f2\x1f\x1fsubject\x1fbody line 1\n\nline 2\n\x1e\n".as_bytes(),
    );
    assert_eq!(details[0].body, "body line 1\n\nline 2");
}

#[test]
fn numstat_and_name_status_merge() {
    let numstat_raw =
        "3\t1\ta.md\0-\t-\timage.png\0".to_string() + "2\t2\t\0old name.md\0新 名.md\0";
    let names = "M\0a.md\0A\0image.png\0R087\0old name.md\0新 名.md\0D\0gone.md\0U\0u.md\0";
    let files = file_changes(numstat_raw.as_bytes(), names.as_bytes());
    assert_eq!(files.len(), 5);
    assert_eq!(
        files[0],
        GitFileChange {
            path: "a.md".into(),
            orig_path: None,
            status: "M".into(),
            additions: 3,
            deletions: 1,
            binary: false,
        }
    );
    assert!(files[1].binary && files[1].status == "A");
    assert_eq!(files[2].path, "新 名.md");
    assert_eq!(files[2].orig_path.as_deref(), Some("old name.md"));
    assert_eq!((files[2].status.as_str(), files[2].additions), ("R", 2));
    assert_eq!((files[3].status.as_str(), files[3].additions), ("D", 0));
    assert_eq!(files[4].status, "M");
}

#[test]
fn ls_remote_stash_remotes_and_merge_labels() {
    let raw = "ref: refs/heads/main\tHEAD\naaaa\tHEAD\naaaa\trefs/heads/main\nbbbb\trefs/heads/dev\ncccc\trefs/tags/v1\n";
    assert_eq!(ls_remote(raw), (2, Some("main".into())));
    assert_eq!(ls_remote(""), (0, None));
    let stash_raw = "stash@{0}\x1faaaa\x1f1700000000\x1fOn main: 草稿\nstash@{12}\x1fbbbb\x1f1\x1fWIP on x: c subject\n";
    let list = stashes(stash_raw);
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].message, "On main: 草稿");
    assert_eq!(list[1].index, 12);
    let config = "remote.origin.url\nhttps://h/r.git\0remote.origin.pushurl\nssh://git@h/r.git\0remote.my.fork.url\ngit@h:o/r.git\0remote.origin.url\nhttps://second\0";
    assert_eq!(
        remote_config(config.as_bytes()),
        [
            (
                "origin".into(),
                "https://h/r.git".into(),
                "ssh://git@h/r.git".into()
            ),
            (
                "my.fork".into(),
                "git@h:o/r.git".into(),
                "git@h:o/r.git".into()
            ),
        ]
    );
    assert_eq!(
        merge_label("Merge branch 'feature/x' into main\n\n# Conflicts:"),
        Some("feature/x".into())
    );
    assert_eq!(
        merge_label("Merge remote-tracking branch 'origin/main'"),
        Some("origin/main".into())
    );
    assert_eq!(merge_label("Something else"), None);
}
