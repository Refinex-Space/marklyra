//! Local mutations: commits, branches, tags, merges, conflicts, stashes, remotes, identity.
use super::{
    error::{classify, GitError},
    ops::{self, Repo},
    runner::{run_batched, Cmd, GitExe, Output, COMMIT_TIMEOUT},
    types::*,
    validate,
};
use std::{
    collections::HashSet,
    io::Write,
    path::{Path, PathBuf},
};

const MESSAGE_LIMIT: usize = 64 * 1024;
const GITIGNORE: &str =
    "# MarkLyra\n.DS_Store\nThumbs.db\ndesktop.ini\n*.swp\n~$*\n.obsidian/workspace*\n.trash/\n";

/// A commit or tag message in a private temporary file, removed when dropped.
pub(crate) struct MessageFile(PathBuf);
impl MessageFile {
    pub fn new(text: &str) -> Result<Self, GitError> {
        let path = std::env::temp_dir().join(format!("marklyra-git-{}.txt", uuid::Uuid::new_v4()));
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = MessageFile(path);
        options
            .open(&file.0)
            .and_then(|mut handle| handle.write_all(text.as_bytes()))
            .map_err(|_| GitError::new("failed", "无法写入临时说明文件"))?;
        Ok(file)
    }
    pub fn path(&self) -> &Path {
        &self.0
    }
}
impl Drop for MessageFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

fn nul_list(paths: &[String]) -> Vec<u8> {
    let mut bytes = Vec::new();
    for path in paths {
        bytes.extend_from_slice(path.as_bytes());
        bytes.push(0);
    }
    bytes
}

fn combined(output: &Output) -> String {
    format!("{}\n{}", output.text(), output.stderr)
}

/// `git check-ref-format` decides whether `name` is a valid branch (or tag) name.
pub(crate) fn check_ref(exe: &GitExe, cwd: &Path, name: &str, tag: bool) -> Result<(), GitError> {
    validate::ref_name(name)?;
    let full = format!("refs/{}/{name}", if tag { "tags" } else { "heads" });
    let output = Cmd::new(exe, cwd, ["check-ref-format", &full])
        .read_only()
        .output()?;
    if output.success() {
        Ok(())
    } else {
        Err(GitError::invalid(if tag {
            "标签名称无效"
        } else {
            "分支名称无效"
        }))
    }
}

pub(crate) fn count(repo: &Repo, args: &[&str]) -> u32 {
    repo.git(["rev-list", "--count"])
        .args(args.iter().copied())
        .read_only()
        .text()
        .ok()
        .and_then(|text| text.trim().parse().ok())
        .unwrap_or(0)
}

/// Files that differ between two commits (all files of `after` when `before` is unborn).
pub(crate) fn changed_files(repo: &Repo, before: Option<&str>, after: Option<&str>) -> u32 {
    let output = match (before, after) {
        (Some(before), Some(after)) if before != after => repo
            .git([
                "diff",
                "--name-only",
                "-z",
                "--no-ext-diff",
                before,
                after,
                "--",
            ])
            .read_only()
            .output(),
        (None, Some(after)) => repo
            .git(["ls-tree", "-r", "--name-only", "-z", after])
            .read_only()
            .output(),
        _ => return 0,
    };
    output
        .map(|output| super::parse::split_nul(&output.stdout).len() as u32)
        .unwrap_or(0)
}

/// Result of a merge-like command: conflicts, an error, or the change it made.
pub(crate) fn finish(
    repo: &Repo,
    before: Option<String>,
    output: &Output,
) -> Result<GitUpdateResult, GitError> {
    let text = combined(output);
    let stash_kept = text.contains("Applying autostash resulted in conflicts")
        || text.contains("Your changes are safe in the stash");
    let conflicts = repo.unmerged()?;
    let after = repo.head_oid();
    if !conflicts.is_empty() {
        return Ok(GitUpdateResult {
            outcome: UpdateOutcome::Conflicts,
            changed: changed_files(repo, before.as_deref(), after.as_deref()),
            conflicts,
            before,
            after,
            proxy: None,
            stash_kept,
        });
    }
    if !output.success() {
        return Err(classify(&output.stderr, None));
    }
    Ok(GitUpdateResult {
        outcome: if before == after {
            UpdateOutcome::UpToDate
        } else {
            UpdateOutcome::Updated
        },
        changed: changed_files(repo, before.as_deref(), after.as_deref()),
        conflicts,
        before,
        after,
        proxy: None,
        stash_kept,
    })
}

fn current_branch(repo: &Repo) -> Option<String> {
    repo.git(["symbolic-ref", "--quiet", "--short", "HEAD"])
        .read_only()
        .text()
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|name| !name.is_empty())
}

/// Commits `message` with the given paths; returns the new HEAD.
pub(crate) fn commit(
    repo: &Repo,
    message: &str,
    paths: &[String],
    amend: bool,
) -> Result<String, GitError> {
    let message = validate::message(message, MESSAGE_LIMIT)?;
    let paths = validate::paths(paths)?;
    if paths.is_empty() && !amend {
        return Err(GitError::invalid("请选择要提交的文件"));
    }
    let mut pathspec = paths.clone();
    let mut stage = Vec::new();
    if !paths.is_empty() {
        let (_, changes, _) = ops::status_raw(repo, true)?;
        let wanted: HashSet<&str> = paths.iter().map(String::as_str).collect();
        for change in &changes {
            if !wanted.contains(change.path.as_str()) {
                continue;
            }
            // A staged deletion is neither in the index nor on disk; `add` would reject it.
            if !(change.index == "D" && change.worktree == ".") {
                stage.push(change.path.clone());
            }
            // Committing a rename needs its old path too.
            if let Some(orig) = &change.orig_path {
                if validate::path(orig).is_ok() && !pathspec.contains(orig) {
                    pathspec.push(orig.clone());
                }
            }
        }
        run_batched(|| repo.git(["add", "-A"]), &stage)?;
    }
    let file = MessageFile::new(message)?;
    let mut cmd = repo
        .git(["commit", "--cleanup=whitespace", "-F"])
        .arg(file.path())
        .timeout(COMMIT_TIMEOUT);
    if amend {
        cmd = cmd.arg("--amend");
    }
    cmd = if paths.is_empty() {
        cmd.arg("--only")
    } else {
        cmd.args(["--pathspec-from-file=-", "--pathspec-file-nul"])
            .stdin(nul_list(&pathspec))
            .literal()
    };
    let output = cmd.output()?;
    if !output.success() {
        let text = combined(&output);
        if [
            "nothing to commit",
            "nothing added to commit",
            "no changes added to commit",
        ]
        .iter()
        .any(|needle| text.contains(needle))
        {
            return Err(GitError::invalid("没有可提交的更改"));
        }
        return Err(classify(&output.stderr, None));
    }
    repo.head_oid()
        .ok_or_else(|| GitError::new("failed", "提交后无法读取当前提交"))
}

/// Restores tracked paths to HEAD and un-adds new ones; untracked files stay as they are.
pub(crate) fn rollback(repo: &Repo, paths: &[String]) -> Result<(), GitError> {
    let paths = validate::paths(paths)?;
    let wanted: HashSet<&str> = paths.iter().map(String::as_str).collect();
    let (header, changes, _) = ops::status_raw(repo, true)?;
    let in_head = |path: &str| {
        !header.head.unborn
            && repo
                .git(["cat-file", "-e"])
                .arg(format!("HEAD:{path}"))
                .read_only()
                .output()
                .is_ok_and(|output| output.success())
    };
    let (mut unstage, mut restore) = (Vec::new(), Vec::new());
    for change in &changes {
        let selected = wanted.contains(change.path.as_str())
            || change
                .orig_path
                .as_deref()
                .is_some_and(|orig| wanted.contains(orig));
        if !selected || change.kind == ChangeKind::Untracked {
            continue;
        }
        let staged_new = change.index == "A" || change.index == "R" || change.index == "C";
        if header.head.unborn
            || staged_new
            || (change.kind == ChangeKind::Conflicted && !in_head(&change.path))
        {
            unstage.push(change.path.clone());
        } else {
            restore.push(change.path.clone());
        }
        if change.index == "R" {
            if let Some(orig) = change
                .orig_path
                .as_ref()
                .filter(|o| validate::path(o).is_ok())
            {
                restore.push(orig.clone());
            }
        }
    }
    run_batched(
        || repo.git(["rm", "--cached", "-q", "--ignore-unmatch"]),
        &unstage,
    )?;
    run_batched(
        || repo.git(["restore", "--source=HEAD", "--staged", "--worktree"]),
        &restore,
    )
}

pub(crate) fn checkout(repo: &Repo, target: &str, kind: CheckoutKind) -> Result<(), GitError> {
    match kind {
        CheckoutKind::Local => {
            validate::ref_name(target)?;
            repo.git(["switch", "--no-guess", target]).run()?;
        }
        CheckoutKind::Remote => {
            validate::ref_name(target)?;
            let remotes = repo.remote_names();
            let (_, name) = super::parse::split_remote_ref(target, &remotes)
                .ok_or_else(|| GitError::invalid("远程分支名称无效"))?;
            if repo.rev_parse(&format!("refs/remotes/{target}")).is_none() {
                return Err(GitError::invalid("远程分支不存在，请先获取"));
            }
            if repo.rev_parse(&format!("refs/heads/{name}")).is_some() {
                repo.git(["switch", "--no-guess", name]).run()?;
            } else {
                check_ref(&repo.exe, &repo.root, name, false)?;
                repo.git(["switch", "-c", name, "--track", target]).run()?;
            }
        }
        CheckoutKind::Revision => {
            validate::revision(target, false)?;
            repo.git(["switch", "--detach", target]).run()?;
        }
    }
    Ok(())
}

pub(crate) fn create_branch(
    repo: &Repo,
    name: &str,
    from: &str,
    checkout: bool,
) -> Result<(), GitError> {
    check_ref(&repo.exe, &repo.root, name, false)?;
    validate::revision(from, false)?;
    if checkout {
        repo.git(["switch", "-c", name, from]).run()?;
    } else {
        repo.git(["branch", name, from]).run()?;
    }
    Ok(())
}

pub(crate) fn rename_branch(repo: &Repo, from: &str, to: &str) -> Result<(), GitError> {
    validate::ref_name(from)?;
    check_ref(&repo.exe, &repo.root, to, false)?;
    repo.git(["branch", "-m", from, to]).run()?;
    Ok(())
}

pub(crate) fn delete_branch(repo: &Repo, name: &str, force: bool) -> Result<(), GitError> {
    validate::ref_name(name)?;
    if current_branch(repo).as_deref() == Some(name) {
        return Err(GitError::invalid("不能删除当前分支"));
    }
    repo.git(["branch", if force { "-D" } else { "-d" }, name])
        .run()?;
    Ok(())
}

pub(crate) fn set_upstream(
    repo: &Repo,
    branch: &str,
    upstream: Option<&str>,
) -> Result<(), GitError> {
    validate::ref_name(branch)?;
    match upstream {
        Some(upstream) => {
            validate::ref_name(upstream)?;
            repo.git(["branch"])
                .arg(format!("--set-upstream-to={upstream}"))
                .arg(branch)
                .run()?;
        }
        None => {
            let output = repo.git(["branch", "--unset-upstream", branch]).output()?;
            if !output.success() && !output.stderr.contains("has no upstream information") {
                return Err(classify(&output.stderr, None));
            }
        }
    }
    Ok(())
}

pub(crate) fn strategy_option(strategy: ConflictStrategy, rebase: bool) -> Option<&'static str> {
    // While rebasing, "ours" is the branch being rebased onto, so the sides swap.
    match (strategy, rebase) {
        (ConflictStrategy::Manual, _) => None,
        (ConflictStrategy::Local, false) | (ConflictStrategy::Remote, true) => Some("-Xours"),
        (ConflictStrategy::Local, true) | (ConflictStrategy::Remote, false) => Some("-Xtheirs"),
    }
}

pub(crate) fn merge(
    repo: &Repo,
    target: &str,
    strategy: ConflictStrategy,
) -> Result<GitUpdateResult, GitError> {
    validate::revision(target, false)?;
    let before = repo.head_oid();
    let mut cmd = repo.git(["merge", "--no-edit"]).timeout(COMMIT_TIMEOUT);
    if let Some(option) = strategy_option(strategy, false) {
        cmd = cmd.arg(option);
    }
    let output = cmd.arg(target).output()?;
    finish(repo, before, &output)
}

pub(crate) fn rebase(
    repo: &Repo,
    onto: &str,
    branch: Option<&str>,
) -> Result<GitUpdateResult, GitError> {
    validate::revision(onto, false)?;
    let before = match branch {
        Some(branch) => {
            validate::ref_name(branch)?;
            repo.rev_parse(&format!("refs/heads/{branch}^{{commit}}"))
                .ok_or_else(|| GitError::invalid("分支不存在"))
                .map(Some)?
        }
        None => repo.head_oid(),
    };
    let mut cmd = repo.git(["rebase", onto]).timeout(COMMIT_TIMEOUT);
    if let Some(branch) = branch {
        cmd = cmd.arg(branch);
    }
    let output = cmd.output()?;
    finish(repo, before, &output)
}

fn conflicts_now(repo: &Repo, before: Option<String>, conflicts: Vec<String>) -> GitUpdateResult {
    GitUpdateResult {
        outcome: UpdateOutcome::Conflicts,
        changed: 0,
        conflicts,
        after: repo.head_oid(),
        before,
        proxy: None,
        stash_kept: false,
    }
}

pub(crate) fn operation(repo: &Repo, action: OperationAction) -> Result<GitUpdateResult, GitError> {
    let current = repo.operation();
    let before = repo.head_oid();
    let flag = match action {
        OperationAction::Continue => "--continue",
        OperationAction::Abort => "--abort",
        OperationAction::Skip => "--skip",
    };
    if action == OperationAction::Continue {
        let unmerged = repo.unmerged()?;
        if !unmerged.is_empty() {
            return Ok(conflicts_now(repo, before, unmerged));
        }
    }
    let args: Vec<&str> = match (current, action) {
        (RepositoryOperation::Merging, OperationAction::Continue) => vec!["commit", "--no-edit"],
        (RepositoryOperation::Merging, OperationAction::Abort) => vec!["merge", "--abort"],
        (RepositoryOperation::Rebasing, _) => vec!["rebase", flag],
        (RepositoryOperation::CherryPicking, _) => vec!["cherry-pick", flag],
        (RepositoryOperation::Reverting, _) => vec!["revert", flag],
        (RepositoryOperation::Bisecting, OperationAction::Abort) => vec!["bisect", "reset"],
        _ => return Err(GitError::invalid("当前没有可继续、跳过或中止的操作")),
    };
    let output = repo.git(args).timeout(COMMIT_TIMEOUT).output()?;
    finish(repo, before, &output)
}

pub(crate) fn cherry_pick(
    repo: &Repo,
    oid: &str,
    revert: bool,
) -> Result<GitUpdateResult, GitError> {
    validate::revision(oid, false)?;
    let before = repo.head_oid();
    let cmd = if revert {
        repo.git(["revert", "--no-edit", oid])
    } else {
        repo.git(["cherry-pick", oid])
    };
    let output = cmd.timeout(COMMIT_TIMEOUT).output()?;
    finish(repo, before, &output)
}

pub(crate) fn reset(repo: &Repo, target: &str, mode: ResetMode) -> Result<(), GitError> {
    validate::revision(target, false)?;
    let mode = match mode {
        ResetMode::Soft => "--soft",
        ResetMode::Mixed => "--mixed",
        ResetMode::Hard => "--hard",
    };
    repo.git(["reset", "-q", mode, target, "--"]).run()?;
    Ok(())
}

pub(crate) fn create_tag(
    repo: &Repo,
    name: &str,
    target: &str,
    message: &str,
) -> Result<(), GitError> {
    check_ref(&repo.exe, &repo.root, name, true)?;
    validate::revision(target, false)?;
    if message.trim().is_empty() {
        repo.git(["tag", name, target]).run()?;
    } else {
        let message = validate::message(message, MESSAGE_LIMIT)?;
        let file = MessageFile::new(message)?;
        repo.git(["tag", "-a", name, "-F"])
            .arg(file.path())
            .arg(target)
            .timeout(COMMIT_TIMEOUT)
            .run()?;
    }
    Ok(())
}

pub(crate) fn delete_tag(repo: &Repo, name: &str) -> Result<(), GitError> {
    validate::ref_name(name)?;
    repo.git(["tag", "-d", name]).run()?;
    Ok(())
}

/// Writes `bytes` next to `target` and renames it over; refuses links.
fn replace_file(target: &Path, bytes: &[u8]) -> Result<(), GitError> {
    let failed = || GitError::new("failed", "无法写入冲突文件");
    if let Ok(metadata) = std::fs::symlink_metadata(target) {
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(GitError::invalid("冲突路径是链接或文件夹，无法写入"));
        }
    }
    let parent = target.parent().ok_or_else(failed)?;
    std::fs::create_dir_all(parent).map_err(|_| failed())?;
    let temporary = parent.join(format!(".marklyra-resolve-{}", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> {
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        #[cfg(unix)]
        if let Ok(metadata) = std::fs::metadata(target) {
            std::fs::set_permissions(&temporary, metadata.permissions())?;
        }
        std::fs::rename(&temporary, target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
        return Err(failed());
    }
    Ok(())
}

pub(crate) fn resolution_bytes(text: &str, bom: bool, crlf: bool) -> Vec<u8> {
    let normalized = text.replace("\r\n", "\n");
    let body = if crlf {
        normalized.replace('\n', "\r\n")
    } else {
        normalized
    };
    let mut bytes = Vec::with_capacity(body.len() + 3);
    if bom {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    bytes.extend_from_slice(body.as_bytes());
    bytes
}

pub(crate) fn resolve(repo: &Repo, path: &str, resolution: &GitResolution) -> Result<(), GitError> {
    let path = validate::path(path)?;
    if !repo.unmerged()?.iter().any(|p| p == path) {
        return Err(GitError::invalid("该文件当前没有冲突"));
    }
    let full = ops::worktree_path(repo, path)?;
    let remove = || -> Result<(), GitError> {
        repo.git(["rm", "-q", "-f", "--", path]).literal().run()?;
        Ok(())
    };
    match resolution {
        GitResolution::Content { text, bom, crlf } => {
            if text.len() > 64 * 1024 * 1024 {
                return Err(GitError::invalid("内容过大"));
            }
            replace_file(&full, &resolution_bytes(text, *bom, *crlf))?;
            repo.git(["add", "--", path]).literal().run()?;
        }
        GitResolution::Delete => remove()?,
        GitResolution::Yours | GitResolution::Theirs => {
            let rebasing = repo.operation() == RepositoryOperation::Rebasing;
            let yours = matches!(resolution, GitResolution::Yours);
            // Stage 2 is "ours" (HEAD). While rebasing HEAD is the upstream, so local is 3.
            let stage = match (yours, rebasing) {
                (true, false) | (false, true) => "2",
                _ => "3",
            };
            let entries = repo
                .git(["ls-files", "-u", "-z", "--", path])
                .literal()
                .read_only()
                .run()?;
            let present = super::parse::split_nul(&entries.stdout)
                .iter()
                .any(|entry| {
                    entry
                        .split('\t')
                        .next()
                        .and_then(|meta| meta.split(' ').nth(2))
                        .is_some_and(|value| value == stage)
                });
            if present {
                let side = if stage == "2" { "--ours" } else { "--theirs" };
                repo.git(["checkout", side, "--", path]).literal().run()?;
                repo.git(["add", "--", path]).literal().run()?;
            } else {
                remove()?;
            }
        }
    }
    Ok(())
}

fn stash_ref(repo: &Repo, index: u32) -> Result<String, GitError> {
    if index > 100_000 {
        return Err(GitError::invalid("暂存编号无效"));
    }
    let name = format!("stash@{{{index}}}");
    repo.rev_parse(&name)
        .ok_or_else(|| GitError::invalid("该暂存不存在"))?;
    Ok(name)
}

pub(crate) fn stash_push(
    repo: &Repo,
    message: &str,
    include_untracked: bool,
) -> Result<(), GitError> {
    let message = message.trim();
    if message.len() > 4096 || message.chars().any(char::is_control) {
        return Err(GitError::invalid("暂存说明过长或包含无效字符"));
    }
    let mut cmd = repo.git(["stash", "push"]);
    if include_untracked {
        cmd = cmd.arg("--include-untracked");
    }
    if !message.is_empty() {
        cmd = cmd.arg("-m").arg(message);
    }
    let output = cmd.run()?;
    if combined(&output).contains("No local changes to save") {
        return Err(GitError::invalid("没有可暂存的更改"));
    }
    Ok(())
}

pub(crate) fn stash_apply(repo: &Repo, index: u32, pop: bool) -> Result<GitUpdateResult, GitError> {
    let name = stash_ref(repo, index)?;
    let files = repo
        .git(["stash", "show", "--name-only", "-z", &name])
        .read_only()
        .output()
        .map(|output| super::parse::split_nul(&output.stdout).len() as u32)
        .unwrap_or(0);
    let before = repo.head_oid();
    let output = repo
        .git(["stash", if pop { "pop" } else { "apply" }, &name])
        .output()?;
    let mut result = finish(repo, before, &output)?;
    result.changed = files;
    if result.outcome == UpdateOutcome::Conflicts {
        result.stash_kept = pop;
    } else {
        result.outcome = UpdateOutcome::Updated;
    }
    Ok(result)
}

pub(crate) fn stash_drop(repo: &Repo, index: u32) -> Result<(), GitError> {
    let name = stash_ref(repo, index)?;
    repo.git(["stash", "drop", "-q", &name]).run()?;
    Ok(())
}

pub(crate) fn remote_add(repo: &Repo, name: &str, url: &str) -> Result<(), GitError> {
    validate::remote_name(name)?;
    validate::remote_url(url)?;
    repo.git(["remote", "add", name, url]).run()?;
    Ok(())
}

pub(crate) fn remote_set_url(repo: &Repo, name: &str, url: &str) -> Result<(), GitError> {
    validate::remote_name(name)?;
    validate::remote_url(url)?;
    repo.git(["remote", "set-url", name, url]).run()?;
    Ok(())
}

pub(crate) fn remote_remove(repo: &Repo, name: &str) -> Result<(), GitError> {
    validate::remote_name(name)?;
    repo.git(["remote", "remove", name]).run()?;
    Ok(())
}

/// `user.name` and `user.email` in the repository (`repo`) or the global configuration.
pub(crate) fn set_identity(
    exe: &GitExe,
    cwd: &Path,
    repo: Option<&Repo>,
    name: &str,
    email: &str,
    scope: IdentityScope,
) -> Result<(), GitError> {
    let name = validate::short_text(name, "用户名")?;
    let email = validate::short_text(email, "邮箱")?;
    if !email.contains('@') {
        return Err(GitError::invalid("邮箱格式无效"));
    }
    let (cwd, flag) = match scope {
        IdentityScope::Repository => (
            repo.map(|repo| repo.root.as_path())
                .ok_or_else(|| GitError::new("not-repository", "当前文件夹不是 Git 仓库"))?,
            "--local",
        ),
        IdentityScope::Global => (cwd, "--global"),
    };
    for (key, value) in [("user.name", &name), ("user.email", &email)] {
        Cmd::new(exe, cwd, ["config", flag, key, value.as_str()]).run()?;
    }
    Ok(())
}

/// `git init` in a folder that is not yet inside a repository.
pub(crate) fn init(
    exe: &GitExe,
    workspace: &Path,
    branch: &str,
    gitignore: bool,
) -> Result<(), GitError> {
    match Repo::open(exe.clone(), workspace) {
        Ok(_) => return Err(GitError::invalid("当前文件夹已在 Git 仓库中")),
        Err(error) if error.code == "not-repository" => {}
        Err(error) => return Err(error),
    }
    check_ref(exe, workspace, branch, false)?;
    if exe.at_least(2, 28) {
        Cmd::new(exe, workspace, ["init", "-q", "-b", branch]).run()?;
    } else {
        Cmd::new(exe, workspace, ["init", "-q"]).run()?;
        Cmd::new(exe, workspace, ["symbolic-ref", "HEAD"])
            .arg(format!("refs/heads/{branch}"))
            .run()?;
    }
    if gitignore {
        let created = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(workspace.join(".gitignore"))
            .and_then(|mut file| file.write_all(GITIGNORE.as_bytes()));
        if let Err(error) = created {
            if error.kind() != std::io::ErrorKind::AlreadyExists {
                return Err(GitError::new("failed", "仓库已创建，但无法写入 .gitignore"));
            }
        }
    }
    Ok(())
}

/// Adds the repository of `workspace` to the global `safe.directory` list.
pub(crate) fn trust(exe: &GitExe, workspace: &Path) -> Result<(), GitError> {
    let output = Cmd::new(exe, workspace, ["rev-parse", "--show-toplevel"])
        .read_only()
        .output()?;
    if output.success() {
        return Ok(());
    }
    if !output.stderr.contains("dubious ownership") {
        return Err(classify(&output.stderr, None));
    }
    let suggested = output
        .stderr
        .lines()
        .find_map(|line| {
            line.trim()
                .strip_prefix("git config --global --add safe.directory ")
        })
        .map(|path| path.trim().trim_matches('\'').trim_matches('"').to_string())
        .filter(|path| !path.is_empty() && !path.contains(['\0', '\n', '*']))
        .ok_or_else(|| GitError::new("failed", "无法识别需要信任的仓库目录"))?;
    let candidate = PathBuf::from(ops::display_path(&suggested))
        .canonicalize()
        .map_err(|_| GitError::new("failed", "无法识别需要信任的仓库目录"))?;
    let workspace = workspace
        .canonicalize()
        .map_err(|_| GitError::new("failed", "无法访问工作目录"))?;
    if !workspace.starts_with(&candidate) {
        return Err(GitError::invalid("需要信任的目录不包含当前工作目录"));
    }
    let existing = Cmd::new(
        exe,
        &workspace,
        ["config", "--global", "--get-all", "safe.directory"],
    )
    .read_only()
    .output()?;
    if existing.text().lines().any(|line| line.trim() == suggested) {
        return Ok(());
    }
    Cmd::new(
        exe,
        &workspace,
        ["config", "--global", "--add", "safe.directory", &suggested],
    )
    .run()?;
    Ok(())
}
