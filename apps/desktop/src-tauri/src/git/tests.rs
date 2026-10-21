//! Integration tests against the real `git` in temporary directories. They return early
//! (and pass) when no usable git is installed.
use super::{
    mutate,
    ops::{self, Repo},
    remote,
    runner::{self, Cmd, GitExe},
    types::*,
};
use std::{path::Path, sync::atomic::AtomicBool};
use tempfile::TempDir;

fn exe() -> Option<GitExe> {
    match runner::discover() {
        Ok(exe) => Some(exe),
        Err(error) => {
            eprintln!("git tests skipped: {error}");
            None
        }
    }
}

fn init_at(exe: &GitExe, path: &Path) -> Repo {
    std::fs::create_dir_all(path).unwrap();
    mutate::init(exe, path, "main", false).unwrap();
    let repo = Repo::open(exe.clone(), path).unwrap();
    mutate::set_identity(
        exe,
        path,
        Some(&repo),
        "Test User",
        "test@example.com",
        IdentityScope::Repository,
    )
    .unwrap();
    repo
}

/// A fresh repository on `main` with an identity and no commits.
pub(crate) fn scratch_repo() -> Option<(TempDir, Repo)> {
    let exe = exe()?;
    let dir = tempfile::tempdir().unwrap();
    let repo = init_at(&exe, &dir.path().join("work"));
    Some((dir, repo))
}

fn write(repo: &Repo, path: &str, text: &str) {
    let full = repo.root.join(path);
    std::fs::create_dir_all(full.parent().unwrap()).unwrap();
    std::fs::write(full, text).unwrap();
}

fn read(repo: &Repo, path: &str) -> String {
    std::fs::read_to_string(repo.root.join(path)).unwrap()
}

fn commit(repo: &Repo, message: &str, paths: &[&str]) -> String {
    let paths: Vec<String> = paths.iter().map(|p| p.to_string()).collect();
    mutate::commit(repo, message, &paths, false).unwrap()
}

fn direct() -> GitNetwork {
    GitNetwork {
        proxy_mode: ProxyMode::Direct,
        proxy_url: String::new(),
        proxy_ssh: false,
        fallback_direct: false,
        timeout_seconds: 60.0,
    }
}

fn query(limit: f64, skip: f64) -> GitLogQuery {
    GitLogQuery {
        revisions: Vec::new(),
        skip,
        limit,
        text: None,
        author: None,
        since: None,
        until: None,
        path: None,
        first_parent: None,
    }
}

fn file_url(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    if text.starts_with('/') {
        format!("file://{text}")
    } else {
        format!("file:///{text}")
    }
}

#[test]
fn init_probe_commit_selected_paths_and_branches() {
    let Some(exe) = exe() else { return };
    let dir = tempfile::tempdir().unwrap();
    let work = dir.path().join("笔记 库");
    std::fs::create_dir_all(work.join("sub")).unwrap();
    let probe = ops::probe(Ok(exe.clone()), &work);
    assert!(probe.git.is_some() && probe.repository.is_none() && probe.problem.is_none());
    mutate::init(&exe, &work, "main", true).unwrap();
    assert!(read_text(&work.join(".gitignore")).contains(".obsidian/workspace*"));
    assert_eq!(
        mutate::init(&exe, &work, "main", true).unwrap_err().code,
        "invalid"
    );
    assert_eq!(
        mutate::init(&exe, &work.join("sub"), "x", false)
            .unwrap_err()
            .code,
        "invalid"
    );
    let probe = ops::probe(Ok(exe.clone()), &work.join("sub"));
    let repository = probe.repository.unwrap();
    assert!(repository.head.unborn);
    assert_eq!(repository.head.branch.as_deref(), Some("main"));
    assert_eq!(repository.workspace_prefix, "sub");
    assert_eq!(repository.identity.scope, "none");

    let repo = Repo::open(exe.clone(), &work).unwrap();
    mutate::set_identity(
        &exe,
        &work,
        Some(&repo),
        "李 四",
        "li@example.com",
        IdentityScope::Repository,
    )
    .unwrap();
    assert_eq!(ops::identity(&repo).name, "李 四");
    assert_eq!(ops::identity(&repo).scope, "repository");
    write(&repo, "a.md", "a\n");
    write(&repo, "第 二.md", "b\n");
    let status = ops::status(&repo).unwrap();
    assert_eq!(status.changes.len(), 3);
    assert!(status
        .changes
        .iter()
        .all(|c| c.kind == ChangeKind::Untracked));
    assert!(mutate::commit(&repo, "  ", &["a.md".into()], false).is_err());
    assert!(mutate::commit(&repo, "x", &[], false).is_err());
    assert!(mutate::commit(&repo, "x", &["../escape".into()], false).is_err());
    let first = commit(&repo, "first", &["a.md"]);
    let status = ops::status(&repo).unwrap();
    let paths: Vec<_> = status.changes.iter().map(|c| c.path.as_str()).collect();
    assert_eq!(paths, [".gitignore", "第 二.md"]);
    assert_eq!(status.head.oid.as_deref(), Some(first.as_str()));
    let second = commit(&repo, "second\n\nbody", &["第 二.md"]);
    assert_eq!(
        mutate::commit(&repo, "nothing", &["a.md".into()], false)
            .unwrap_err()
            .code,
        "invalid"
    );
    // Amend the message only, leaving other staged work alone.
    let amended = mutate::commit(&repo, "second (amended)", &[], true).unwrap();
    assert_ne!(amended, second);
    let details = ops::commit_details(&repo, &amended).unwrap();
    assert_eq!(details.commit.subject, "second (amended)");
    assert_eq!(details.files.len(), 1);
    assert_eq!(details.files[0].path, "第 二.md");
    assert_eq!(details.files[0].status, "A");
    let root = ops::commit_details(&repo, &first).unwrap();
    assert!(root.commit.parents.is_empty() && root.files[0].path == "a.md");

    mutate::create_branch(&repo, "功能/一", "main", true).unwrap();
    assert!(mutate::create_branch(&repo, "bad name", "main", false).is_err());
    assert!(mutate::create_branch(&repo, "-x", "main", false).is_err());
    mutate::create_tag(&repo, "v1", "HEAD", "").unwrap();
    mutate::create_tag(&repo, "v2", &first, "注释标签").unwrap();
    let branches = ops::branches(&repo).unwrap();
    assert_eq!(branches.current.as_deref(), Some("功能/一"));
    assert_eq!(branches.local.len(), 2);
    assert_eq!(branches.tags.len(), 2);
    let v2 = branches.tags.iter().find(|t| t.name == "v2").unwrap();
    assert_eq!(v2.oid, first, "annotated tags report the commit");
    assert_eq!(
        mutate::delete_branch(&repo, "功能/一", false)
            .unwrap_err()
            .code,
        "invalid"
    );
    mutate::checkout(&repo, "main", CheckoutKind::Local).unwrap();
    mutate::rename_branch(&repo, "功能/一", "feature").unwrap();
    mutate::delete_branch(&repo, "feature", false).unwrap();
    mutate::delete_tag(&repo, "v1").unwrap();
    mutate::checkout(&repo, &first, CheckoutKind::Revision).unwrap();
    let status = ops::status(&repo).unwrap();
    assert!(status.head.detached && status.head.branch.is_none());
    mutate::checkout(&repo, "main", CheckoutKind::Local).unwrap();
}

fn read_text(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap()
}

#[test]
fn log_paging_filters_and_compare() {
    let Some((_dir, repo)) = scratch_repo() else {
        return;
    };
    let mut oids = Vec::new();
    for (index, name) in ["one", "two", "third Change", "four", "five"]
        .iter()
        .enumerate()
    {
        write(&repo, "notes.md", &format!("{index}\n"));
        oids.push(commit(&repo, name, &["notes.md"]));
    }
    let page = ops::log(&repo, &query(2.0, 0.0)).unwrap();
    assert_eq!(page.commits.len(), 2);
    assert!(page.has_more);
    assert_eq!(page.commits[0].subject, "five");
    assert!(page.commits[0].refs.iter().any(|r| r.kind == RefKind::Head));
    assert!(page.commits[0]
        .refs
        .iter()
        .any(|r| r.kind == RefKind::Local && r.name == "main"));
    let last = ops::log(&repo, &query(2.0, 4.0)).unwrap();
    assert_eq!(last.commits.len(), 1);
    assert!(!last.has_more);
    assert_eq!(last.commits[0].subject, "one");
    let mut text = query(50.0, 0.0);
    text.text = Some("THIRD change".into());
    let found = ops::log(&repo, &text).unwrap();
    assert_eq!(found.commits.len(), 1);
    text.text = Some(oids[1][..8].to_string());
    let found = ops::log(&repo, &text).unwrap();
    assert_eq!(found.commits[0].oid, oids[1]);
    let mut author = query(50.0, 0.0);
    author.author = Some("test user".into());
    assert_eq!(ops::log(&repo, &author).unwrap().commits.len(), 5);
    author.author = Some("nobody".into());
    assert!(ops::log(&repo, &author).unwrap().commits.is_empty());
    let mut future = query(50.0, 0.0);
    future.since = Some(4_000_000_000.0);
    assert!(ops::log(&repo, &future).unwrap().commits.is_empty());
    let mut range = query(50.0, 0.0);
    range.revisions = vec![format!("{}..main", oids[2])];
    assert_eq!(ops::log(&repo, &range).unwrap().commits.len(), 2);
    range.revisions = vec!["--all".into()];
    assert_eq!(ops::log(&repo, &range).unwrap_err().code, "invalid");

    // Rename, then follow the file through it.
    Cmd::new(&repo.exe, &repo.root, ["mv", "notes.md", "renamed.md"])
        .run()
        .unwrap();
    commit(&repo, "rename", &["renamed.md"]);
    let mut path = query(50.0, 0.0);
    path.path = Some("renamed.md".into());
    assert_eq!(ops::log(&repo, &path).unwrap().commits.len(), 6);
    let details = ops::commit_details(&repo, "HEAD").unwrap();
    assert_eq!(details.files.len(), 1);
    assert_eq!(details.files[0].status, "R");
    assert_eq!(details.files[0].orig_path.as_deref(), Some("notes.md"));

    write(&repo, "renamed.md", "changed\nlines\n");
    let changes = ops::compare(&repo, "HEAD", ops::WORKTREE).unwrap();
    assert_eq!(changes.len(), 1);
    assert_eq!((changes[0].additions, changes[0].deletions), (2, 1));
    let changes = ops::compare(&repo, &oids[0], &oids[4]).unwrap();
    assert_eq!(changes[0].status, "M");
    assert!(ops::compare(&repo, "-p", "HEAD").is_err());

    let empty = scratch_repo().unwrap();
    assert!(ops::log(&empty.1, &query(10.0, 0.0))
        .unwrap()
        .commits
        .is_empty());
}

#[test]
fn file_text_reads_versions_and_detects_encoding() {
    let Some((_dir, repo)) = scratch_repo() else {
        return;
    };
    std::fs::write(
        repo.root.join("bom.md"),
        b"\xEF\xBB\xBFline 1\r\nline 2\r\n",
    )
    .unwrap();
    std::fs::write(repo.root.join("bin.dat"), b"a\0b").unwrap();
    commit(&repo, "add", &["bom.md", "bin.dat"]);
    let spec = |rev: &str, path: &str| GitFileSpec {
        rev: rev.into(),
        path: path.into(),
    };
    let head = ops::file_text(&repo, &spec("HEAD", "bom.md")).unwrap();
    assert_eq!(head.text.as_deref(), Some("line 1\nline 2\n"));
    assert!(head.bom && head.crlf && !head.binary);
    write(&repo, "bom.md", "new\n");
    let disk = ops::file_text(&repo, &spec(ops::WORKTREE, "bom.md")).unwrap();
    assert_eq!(disk.text.as_deref(), Some("new\n"));
    assert!(!disk.bom && !disk.crlf);
    let index = ops::file_text(&repo, &spec(":0", "bom.md")).unwrap();
    assert!(index.bom);
    assert!(
        ops::file_text(&repo, &spec("HEAD", "bin.dat"))
            .unwrap()
            .binary
    );
    let missing = ops::file_text(&repo, &spec("HEAD", "nope.md")).unwrap();
    assert_eq!(missing, GitFileText::default());
    assert_eq!(
        ops::file_text(&repo, &spec(ops::WORKTREE, "gone.md")).unwrap(),
        GitFileText::default()
    );
    assert!(ops::file_text(&repo, &spec("HEAD", "../x")).is_err());
    assert!(ops::file_text(&repo, &spec("HEAD:x", "bom.md")).is_err());
    assert!(ops::file_text(&repo, &spec(ops::WORKTREE, ".git/config")).is_err());
    std::fs::write(repo.root.join("big.md"), vec![b'a'; ops::FILE_LIMIT + 1]).unwrap();
    assert!(
        ops::file_text(&repo, &spec(ops::WORKTREE, "big.md"))
            .unwrap()
            .too_large
    );
}

/// `main` and `feature` both change `doc.md`.
fn diverged(repo: &Repo) {
    write(repo, "doc.md", "base\n");
    commit(repo, "base", &["doc.md"]);
    mutate::create_branch(repo, "feature", "main", true).unwrap();
    write(repo, "doc.md", "feature side\n");
    commit(repo, "feature change", &["doc.md"]);
    mutate::checkout(repo, "main", CheckoutKind::Local).unwrap();
    write(repo, "doc.md", "main side\n");
    commit(repo, "main change", &["doc.md"]);
}

#[test]
fn merge_conflict_resolve_and_continue() {
    let Some((_dir, repo)) = scratch_repo() else {
        return;
    };
    diverged(&repo);
    let result = mutate::merge(&repo, "feature", ConflictStrategy::Manual).unwrap();
    assert_eq!(result.outcome, UpdateOutcome::Conflicts);
    assert_eq!(result.conflicts, ["doc.md"]);
    let conflicts = ops::conflicts(&repo).unwrap();
    assert_eq!(conflicts.operation, RepositoryOperation::Merging);
    assert_eq!(conflicts.yours_stage, 2);
    assert_eq!(conflicts.yours_label, "main");
    assert_eq!(conflicts.theirs_label, "feature");
    assert_eq!(conflicts.files[0].kind, ConflictKind::BothModified);
    let stage = |s: &str| {
        ops::file_text(
            &repo,
            &GitFileSpec {
                rev: s.into(),
                path: "doc.md".into(),
            },
        )
        .unwrap()
        .text
    };
    assert_eq!(stage(":1").as_deref(), Some("base\n"));
    assert_eq!(stage(":2").as_deref(), Some("main side\n"));
    assert_eq!(stage(":3").as_deref(), Some("feature side\n"));
    // Continuing with conflicts left reports them again.
    let early = mutate::operation(&repo, OperationAction::Continue).unwrap();
    assert_eq!(early.outcome, UpdateOutcome::Conflicts);
    assert!(mutate::resolve(&repo, "other.md", &GitResolution::Yours).is_err());
    mutate::resolve(
        &repo,
        "doc.md",
        &GitResolution::Content {
            text: "merged\nresult\n".into(),
            bom: true,
            crlf: true,
        },
    )
    .unwrap();
    assert_eq!(
        std::fs::read(repo.root.join("doc.md")).unwrap(),
        b"\xEF\xBB\xBFmerged\r\nresult\r\n"
    );
    let done = mutate::operation(&repo, OperationAction::Continue).unwrap();
    assert_eq!(done.outcome, UpdateOutcome::Updated);
    assert_eq!(repo.operation(), RepositoryOperation::None);
    let head = ops::commit_details(&repo, "HEAD").unwrap();
    assert_eq!(head.commit.parents.len(), 2);
    assert_eq!(
        head.files.len(),
        1,
        "merge commits diff against the first parent"
    );
    assert_eq!(
        mutate::operation(&repo, OperationAction::Abort)
            .unwrap_err()
            .code,
        "invalid"
    );
}

#[test]
fn merge_strategies_and_abort() {
    let Some((_dir, repo)) = scratch_repo() else {
        return;
    };
    diverged(&repo);
    let result = mutate::merge(&repo, "feature", ConflictStrategy::Remote).unwrap();
    assert_eq!(result.outcome, UpdateOutcome::Updated);
    assert_eq!(read(&repo, "doc.md"), "feature side\n");
    mutate::reset(&repo, "HEAD~1", ResetMode::Hard).unwrap();
    let result = mutate::merge(&repo, "feature", ConflictStrategy::Manual).unwrap();
    assert_eq!(result.outcome, UpdateOutcome::Conflicts);
    let aborted = mutate::operation(&repo, OperationAction::Abort).unwrap();
    assert_eq!(aborted.outcome, UpdateOutcome::UpToDate);
    assert_eq!(read(&repo, "doc.md"), "main side\n");
    assert_eq!(
        mutate::merge(&repo, "no-such-branch", ConflictStrategy::Manual)
            .unwrap_err()
            .code,
        "invalid"
    );
}

#[test]
fn rebase_conflict_swaps_sides() {
    let Some((_dir, repo)) = scratch_repo() else {
        return;
    };
    diverged(&repo);
    let result = mutate::rebase(&repo, "main", Some("feature")).unwrap();
    assert_eq!(result.outcome, UpdateOutcome::Conflicts);
    let conflicts = ops::conflicts(&repo).unwrap();
    assert_eq!(conflicts.operation, RepositoryOperation::Rebasing);
    assert_eq!(conflicts.yours_stage, 3);
    assert_eq!(conflicts.yours_label, "feature");
    assert_eq!(conflicts.theirs_label, "main");
    mutate::resolve(&repo, "doc.md", &GitResolution::Yours).unwrap();
    assert_eq!(read(&repo, "doc.md"), "feature side\n");
    let done = mutate::operation(&repo, OperationAction::Continue).unwrap();
    assert_eq!(done.outcome, UpdateOutcome::Updated);
    assert_eq!(repo.operation(), RepositoryOperation::None);
    let status = ops::status(&repo).unwrap();
    assert_eq!(status.head.branch.as_deref(), Some("feature"));
    let log = ops::log(
        &repo,
        &GitLogQuery {
            revisions: vec!["feature".into()],
            ..query(10.0, 0.0)
        },
    )
    .unwrap();
    assert_eq!(log.commits[1].subject, "main change");
}

#[test]
fn cherry_pick_and_revert() {
    let Some((_dir, repo)) = scratch_repo() else {
        return;
    };
    write(&repo, "a.md", "a\n");
    commit(&repo, "a", &["a.md"]);
    mutate::create_branch(&repo, "side", "main", true).unwrap();
    write(&repo, "b.md", "b\n");
    let picked = commit(&repo, "b", &["b.md"]);
    mutate::checkout(&repo, "main", CheckoutKind::Local).unwrap();
    let result = mutate::cherry_pick(&repo, &picked, false).unwrap();
    assert_eq!(
        (result.outcome, result.changed),
        (UpdateOutcome::Updated, 1)
    );
    let result = mutate::cherry_pick(&repo, "HEAD", true).unwrap();
    assert_eq!(result.outcome, UpdateOutcome::Updated);
    assert!(!repo.root.join("b.md").exists());
}

#[test]
fn rollback_restores_tracked_and_unstages_new_files() {
    let Some((_dir, repo)) = scratch_repo() else {
        return;
    };
    write(&repo, "tracked.md", "original\n");
    write(&repo, "old.md", "old\n");
    commit(&repo, "base", &["tracked.md", "old.md"]);
    write(&repo, "tracked.md", "edited\n");
    write(&repo, "new.md", "new\n");
    write(&repo, "loose.md", "untracked\n");
    Cmd::new(&repo.exe, &repo.root, ["add", "new.md"])
        .run()
        .unwrap();
    Cmd::new(&repo.exe, &repo.root, ["mv", "old.md", "moved.md"])
        .run()
        .unwrap();
    let paths: Vec<String> = ["tracked.md", "new.md", "loose.md", "moved.md"]
        .map(String::from)
        .to_vec();
    mutate::rollback(&repo, &paths).unwrap();
    assert_eq!(read(&repo, "tracked.md"), "original\n");
    assert_eq!(
        read(&repo, "new.md"),
        "new\n",
        "new files are kept, only un-added"
    );
    assert_eq!(
        read(&repo, "old.md"),
        "old\n",
        "renames restore the old path"
    );
    assert!(repo.root.join("loose.md").exists());
    let status = ops::status(&repo).unwrap();
    assert!(
        status
            .changes
            .iter()
            .all(|c| c.kind == ChangeKind::Untracked),
        "{:?}",
        status.changes
    );
}

#[test]
fn stash_round_trip() {
    let Some((_dir, repo)) = scratch_repo() else {
        return;
    };
    write(&repo, "a.md", "a\n");
    commit(&repo, "a", &["a.md"]);
    assert_eq!(
        mutate::stash_push(&repo, "", false).unwrap_err().code,
        "invalid"
    );
    write(&repo, "a.md", "draft\n");
    mutate::stash_push(&repo, "草稿", true).unwrap();
    assert_eq!(read(&repo, "a.md"), "a\n");
    let list = ops::stashes(&repo).unwrap();
    assert_eq!(list.len(), 1);
    assert!(list[0].message.contains("草稿"));
    let result = mutate::stash_apply(&repo, 0, true).unwrap();
    assert_eq!(
        (result.outcome, result.changed),
        (UpdateOutcome::Updated, 1)
    );
    assert_eq!(read(&repo, "a.md"), "draft\n");
    assert!(ops::stashes(&repo).unwrap().is_empty());
    assert_eq!(mutate::stash_drop(&repo, 0).unwrap_err().code, "invalid");
}

#[test]
fn push_update_and_sync_with_a_bare_remote() {
    let Some(exe) = exe() else { return };
    let dir = tempfile::tempdir().unwrap();
    let bare = dir.path().join("remote.git");
    Cmd::new(&exe, dir.path(), ["init", "-q", "--bare", "-b", "main"])
        .arg(&bare)
        .run()
        .unwrap();
    let url = file_url(&bare);
    let a = init_at(&exe, &dir.path().join("a"));
    write(&a, "doc.md", "one\n");
    commit(&a, "one", &["doc.md"]);
    mutate::remote_add(&a, "origin", &url).unwrap();
    assert!(mutate::remote_add(&a, "evil", "ext::sh -c id").is_err());
    let remotes = ops::remotes(&a);
    assert_eq!(
        (remotes[0].name.as_str(), remotes[0].protocol.as_str()),
        ("origin", "file")
    );

    // No upstream yet: update says so; sync pushes and sets the upstream.
    let options = GitUpdateOptions {
        method: PullMethod::Merge,
        autostash: true,
        conflict_strategy: ConflictStrategy::Manual,
        prune: true,
        network: direct(),
    };
    assert_eq!(
        remote::update(&a, &options).unwrap().outcome,
        UpdateOutcome::NoUpstream
    );
    let sync = |repo: &Repo, message: Option<&str>| {
        remote::sync(
            repo,
            &GitSyncOptions {
                method: PullMethod::Merge,
                autostash: true,
                conflict_strategy: ConflictStrategy::Manual,
                prune: false,
                network: direct(),
                commit_message: message.map(String::from),
                push: true,
            },
        )
        .unwrap()
    };
    let first = sync(&a, None);
    assert_eq!(first.pushed, 1);
    assert!(!first.idle);
    assert_eq!(
        ops::status(&a).unwrap().upstream.as_deref(),
        Some("origin/main")
    );
    let idle = sync(&a, None);
    assert!(idle.idle, "{idle:?}");

    let test = remote::remote_test(&a, "origin", &direct()).unwrap();
    assert!(test.ok, "{}", test.message);
    assert_eq!(test.branches, 1);
    let bogus = remote::remote_test(&a, "ftp://nowhere/x", &direct()).unwrap();
    assert!(!bogus.ok);
    let missing =
        remote::remote_test(&a, &file_url(&dir.path().join("missing.git")), &direct()).unwrap();
    assert!(!missing.ok);

    // A second clone pushes a change; the first updates with merge.
    Cmd::new(&exe, dir.path(), ["clone", "-q", &url, "b"])
        .run()
        .unwrap();
    let b = Repo::open(exe.clone(), &dir.path().join("b")).unwrap();
    mutate::set_identity(
        &exe,
        &b.root,
        Some(&b),
        "B",
        "b@example.com",
        IdentityScope::Repository,
    )
    .unwrap();
    write(&b, "doc.md", "two\n");
    write(&b, "extra.md", "x\n");
    commit(&b, "two", &["doc.md", "extra.md"]);
    let pushed = remote::push(
        &b,
        &GitPushOptions {
            remote: "origin".into(),
            branch: "main".into(),
            remote_branch: "main".into(),
            set_upstream: false,
            force: ForceMode::None,
            tags: false,
            network: direct(),
        },
    )
    .unwrap();
    assert_eq!((pushed.result.pushed, pushed.result.rejected), (1, false));

    // A diverging commit in `a`: pushing is rejected, ff-only refuses, merge works.
    write(&a, "local.md", "l\n");
    commit(&a, "local", &["local.md"]);
    let rejected = remote::push(
        &a,
        &GitPushOptions {
            remote: "origin".into(),
            branch: "main".into(),
            remote_branch: "main".into(),
            set_upstream: false,
            force: ForceMode::None,
            tags: false,
            network: direct(),
        },
    );
    assert_eq!(rejected.err().map(|e| e.code), Some("non-fast-forward"));
    let ff = remote::update(
        &a,
        &GitUpdateOptions {
            method: PullMethod::FfOnly,
            ..options.clone()
        },
    );
    assert_eq!(ff.unwrap_err().code, "non-fast-forward");
    let merged = remote::update(&a, &options).unwrap();
    assert_eq!(merged.outcome, UpdateOutcome::Updated);
    assert_eq!(merged.changed, 2);
    assert_eq!(read(&a, "doc.md"), "two\n");

    // Sync commits everything, pushes the merge and the new commit.
    write(&a, "after.md", "after\n");
    let synced = sync(&a, Some("sync commit"));
    assert!(synced.committed.is_some());
    assert_eq!(synced.pushed, 3);
    assert_eq!(synced.update.unwrap().outcome, UpdateOutcome::UpToDate);

    // `b` rebases onto it without local work: fast update.
    let rebased = remote::update(
        &b,
        &GitUpdateOptions {
            method: PullMethod::Rebase,
            ..options.clone()
        },
    )
    .unwrap();
    assert_eq!(rebased.outcome, UpdateOutcome::Updated);
    assert!(b.root.join("after.md").exists());

    // Conflicting edits on both sides surface as conflicts, not as an error.
    write(&b, "doc.md", "b edit\n");
    commit(&b, "b edit", &["doc.md"]);
    sync(&b, None);
    write(&a, "doc.md", "a edit\n");
    commit(&a, "a edit", &["doc.md"]);
    let conflicted = sync(&a, None);
    let update = conflicted.update.unwrap();
    assert_eq!(update.outcome, UpdateOutcome::Conflicts);
    assert_eq!(update.conflicts, ["doc.md"]);
    assert_eq!(conflicted.pushed, 0);
    mutate::operation(&a, OperationAction::Abort).unwrap();

    // Fetch, update another branch, delete a remote branch.
    mutate::create_branch(&b, "topic", "main", false).unwrap();
    remote::push(
        &b,
        &GitPushOptions {
            remote: "origin".into(),
            branch: "topic".into(),
            remote_branch: "topic".into(),
            set_upstream: true,
            force: ForceMode::None,
            tags: false,
            network: direct(),
        },
    )
    .unwrap();
    remote::fetch(&a, None, true, &direct()).unwrap();
    let branches = ops::branches(&a).unwrap();
    assert!(branches
        .remote
        .iter()
        .any(|r| r.full_name == "origin/topic"));
    mutate::checkout(&a, "origin/topic", CheckoutKind::Remote).unwrap();
    mutate::checkout(&a, "main", CheckoutKind::Local).unwrap();
    remote::update_branch(&a, "topic", &direct()).unwrap();
    assert_eq!(
        remote::update_branch(&a, "main", &direct())
            .unwrap_err()
            .code,
        "invalid"
    );
    remote::delete_remote_branch(&b, "origin", "topic", &direct()).unwrap();
    remote::fetch(&a, Some("origin"), true, &direct()).unwrap();
    let branches = ops::branches(&a).unwrap();
    assert!(!branches
        .remote
        .iter()
        .any(|r| r.full_name == "origin/topic"));
    assert!(branches.local.iter().any(|l| l.name == "topic" && l.gone));
    mutate::set_upstream(&a, "topic", None).unwrap();
    mutate::remote_set_url(&a, "origin", &url).unwrap();
    mutate::remote_remove(&a, "origin").unwrap();
    assert!(ops::remotes(&a).is_empty());
}

#[test]
fn cancellation_and_busy_lock() {
    let Some((_dir, repo)) = scratch_repo() else {
        return;
    };
    let flag = AtomicBool::new(true);
    let error = Cmd::new(&repo.exe, &repo.root, ["status"])
        .cancel(Some(&flag))
        .output()
        .err()
        .unwrap();
    assert_eq!(error.code, "cancelled");
    let host = super::GitHost::default();
    let held = host.lock(&repo.root).unwrap();
    std::thread::scope(|scope| {
        let waiter = scope.spawn(|| host.lock(&repo.root).map(|_| ()));
        std::thread::sleep(std::time::Duration::from_millis(150));
        drop(held);
        assert!(waiter.join().unwrap().is_ok());
    });
    let (flag, guard) = host.begin("main", "w1");
    host.cancel("main", "w1");
    assert!(flag.load(std::sync::atomic::Ordering::Acquire));
    drop(guard);
    assert!(host.running.lock().unwrap().is_empty());
}

#[test]
fn not_a_repository_is_reported_without_error() {
    let Some(exe) = exe() else { return };
    let dir = tempfile::tempdir().unwrap();
    let probe = ops::probe(Ok(exe.clone()), dir.path());
    assert!(probe.repository.is_none() && probe.problem.is_none());
    assert_eq!(
        Repo::open(exe, dir.path()).err().map(|e| e.code),
        Some("not-repository")
    );
    let missing = ops::probe(
        Err(super::error::GitError::new("git-missing", "x")),
        dir.path(),
    );
    assert!(missing.git.is_none());
    assert_eq!(missing.problem.unwrap().code, "git-missing");
}
