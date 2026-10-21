//! Repository handle and read-only operations. Everything here takes a plain repository root
//! so it can be tested without a window.
use super::{
    error::GitError,
    parse,
    runner::{Cmd, GitExe, ProgressFn},
    types::*,
    validate,
};
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

pub(crate) const FILE_LIMIT: usize = 4 * 1024 * 1024;
const LOG_LIMIT: usize = 500;
const TAG_LIMIT: usize = 500;
pub(crate) const WORKTREE: &str = "WORKTREE";

pub(crate) struct Repo {
    pub exe: GitExe,
    /// Top level of the work tree; the working directory of every git command.
    pub root: PathBuf,
    /// Workspace folder relative to `root`, without a trailing `/`.
    pub prefix: String,
    pub git_dir: PathBuf,
    pub cancel: Option<Arc<AtomicBool>>,
    pub progress: Option<ProgressFn>,
    /// Preferences folder of saved HTTPS credentials.
    pub credentials: Option<PathBuf>,
}

/// Native separators for display.
pub(crate) fn display_path(path: &str) -> String {
    if cfg!(windows) {
        path.replace('/', "\\")
    } else {
        path.to_string()
    }
}

impl Repo {
    /// The repository containing `workspace`.
    pub fn open(exe: GitExe, workspace: &Path) -> Result<Self, GitError> {
        let output = Cmd::new(
            &exe,
            workspace,
            [
                "rev-parse",
                "--show-toplevel",
                "--show-prefix",
                "--absolute-git-dir",
            ],
        )
        .read_only()
        .output()?;
        if !output.success() {
            let error = super::error::classify(&output.stderr, None);
            if error.code == "failed" && output.stderr.contains("must be run in a work tree") {
                return Err(GitError::new("not-repository", "当前文件夹不是 Git 仓库"));
            }
            return Err(error);
        }
        let text = output.text();
        let lines: Vec<&str> = text.split('\n').map(|l| l.trim_end_matches('\r')).collect();
        let (Some(top), Some(prefix), Some(git_dir)) = (lines.first(), lines.get(1), lines.get(2))
        else {
            return Err(GitError::new("failed", "无法识别 Git 仓库位置"));
        };
        if top.is_empty() || git_dir.is_empty() {
            return Err(GitError::new("not-repository", "当前文件夹不是 Git 仓库"));
        }
        Ok(Self {
            exe,
            root: PathBuf::from(display_path(top)),
            prefix: prefix.trim_end_matches('/').to_string(),
            git_dir: PathBuf::from(display_path(git_dir)),
            cancel: None,
            progress: None,
            credentials: None,
        })
    }
    pub fn git<I, S>(&self, args: I) -> Cmd<'_>
    where
        I: IntoIterator<Item = S>,
        S: Into<OsString>,
    {
        Cmd::new(&self.exe, &self.root, args)
    }
    pub fn display_root(&self) -> String {
        self.root.to_string_lossy().into_owned()
    }
    pub fn cancelled(&self) -> Result<(), GitError> {
        if self
            .cancel
            .as_ref()
            .is_some_and(|flag| flag.load(Ordering::Acquire))
        {
            Err(GitError::new("cancelled", "已取消"))
        } else {
            Ok(())
        }
    }
    pub fn rev_parse(&self, rev: &str) -> Option<String> {
        self.git(["rev-parse", "--verify", "--quiet", "--end-of-options", rev])
            .read_only()
            .text()
            .ok()
            .map(|text| text.trim().to_string())
            .filter(|oid| !oid.is_empty())
    }
    pub fn head_oid(&self) -> Option<String> {
        self.rev_parse("HEAD^{commit}")
    }
    pub fn config(&self, key: &str) -> Option<String> {
        self.git(["config", "--get", key])
            .read_only()
            .text()
            .ok()
            .map(|text| text.trim_end_matches(['\n', '\r']).to_string())
            .filter(|value| !value.is_empty())
    }
    pub fn operation(&self) -> RepositoryOperation {
        let has = |name: &str| self.git_dir.join(name).exists();
        if has("rebase-merge") || has("rebase-apply") {
            RepositoryOperation::Rebasing
        } else if has("MERGE_HEAD") {
            RepositoryOperation::Merging
        } else if has("CHERRY_PICK_HEAD") {
            RepositoryOperation::CherryPicking
        } else if has("REVERT_HEAD") {
            RepositoryOperation::Reverting
        } else if has("BISECT_LOG") {
            RepositoryOperation::Bisecting
        } else {
            RepositoryOperation::None
        }
    }
    pub fn read_git_file(&self, name: &str) -> Option<String> {
        let path = self.git_dir.join(name);
        let metadata = std::fs::symlink_metadata(&path).ok()?;
        if !metadata.is_file() || metadata.len() > 64 * 1024 {
            return None;
        }
        std::fs::read_to_string(path).ok()
    }
    pub fn remote_names(&self) -> Vec<String> {
        self.git(["remote"])
            .read_only()
            .text()
            .map(|text| {
                text.lines()
                    .map(str::trim)
                    .filter(|l| !l.is_empty())
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    }
    /// Paths with unmerged index entries.
    pub fn unmerged(&self) -> Result<Vec<String>, GitError> {
        let output = self
            .git(["diff", "--name-only", "--diff-filter=U", "-z"])
            .read_only()
            .run()?;
        Ok(parse::split_nul(&output.stdout))
    }
    /// Effective URL of a remote (`insteadOf` applied), fetch or push.
    pub fn remote_url(&self, remote: &str, push: bool) -> Result<String, GitError> {
        let mut cmd = self.git(["remote", "get-url"]);
        if push {
            cmd = cmd.arg("--push");
        }
        Ok(cmd.arg(remote).read_only().text()?.trim().to_string())
    }
}

pub(crate) fn status_raw(
    repo: &Repo,
    untracked: bool,
) -> Result<(parse::BranchHeader, Vec<GitChange>, bool), GitError> {
    let output = repo
        .git([
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            if untracked {
                "--untracked-files=all"
            } else {
                "--untracked-files=no"
            },
            "--ignore-submodules=dirty",
        ])
        .read_only()
        .run()?;
    Ok(parse::status(&output.stdout))
}

pub(crate) fn status(repo: &Repo) -> Result<GitStatus, GitError> {
    let (header, changes, truncated) = status_raw(repo, true)?;
    Ok(GitStatus {
        head: header.head,
        upstream: header.upstream,
        ahead: header.ahead,
        behind: header.behind,
        operation: repo.operation(),
        changes,
        truncated,
    })
}

pub(crate) fn remotes(repo: &Repo) -> Vec<GitRemote> {
    let output = repo
        .git([
            "config",
            "-z",
            "--get-regexp",
            r"^remote\..*\.(url|pushurl)$",
        ])
        .read_only()
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    parse::remote_config(&output.stdout)
        .into_iter()
        .map(|(name, fetch, push)| {
            let fetch = validate::url_info(&fetch);
            let push = validate::url_info(&push);
            GitRemote {
                name,
                protocol: fetch.protocol.to_string(),
                host: fetch.host.clone(),
                has_embedded_credentials: fetch.had_credentials || push.had_credentials,
                fetch_url: fetch.display,
                push_url: push.display,
            }
        })
        .collect()
}

pub(crate) fn identity(repo: &Repo) -> GitIdentity {
    let read = |key: &str| -> Option<(String, String)> {
        let text = repo
            .git(["config", "--show-scope", "--get", key])
            .read_only()
            .text()
            .ok()?;
        let (scope, value) = text.trim_end_matches(['\n', '\r']).split_once('\t')?;
        Some((scope.to_string(), value.to_string()))
    };
    let name = read("user.name");
    let email = read("user.email");
    let scope = name
        .as_ref()
        .or(email.as_ref())
        .map(|(scope, _)| match scope.as_str() {
            "global" => "global",
            "system" => "system",
            _ => "repository",
        })
        .unwrap_or("none");
    GitIdentity {
        name: name.map(|(_, v)| v).unwrap_or_default(),
        email: email.map(|(_, v)| v).unwrap_or_default(),
        scope,
    }
}

pub(crate) fn repository(repo: &Repo) -> Result<GitRepository, GitError> {
    let (header, _, _) = status_raw(repo, false)?;
    Ok(GitRepository {
        root: repo.display_root(),
        workspace_prefix: repo.prefix.clone(),
        head: header.head,
        upstream: header.upstream,
        ahead: header.ahead,
        behind: header.behind,
        operation: repo.operation(),
        remotes: remotes(repo),
        identity: identity(repo),
    })
}

pub(crate) fn executable(exe: &GitExe) -> GitExecutable {
    GitExecutable {
        path: exe.path.to_string_lossy().into_owned(),
        version: exe.version.clone(),
    }
}

/// Probe never fails for a missing repository; problems are reported in the result.
pub(crate) fn probe(exe: Result<GitExe, GitError>, workspace: &Path) -> GitProbe {
    let exe = match exe {
        Ok(exe) => exe,
        Err(error) => {
            return GitProbe {
                git: None,
                problem: Some(GitProblem {
                    code: error.code,
                    message: error.message,
                }),
                repository: None,
            }
        }
    };
    let git = Some(executable(&exe));
    let result = Repo::open(exe, workspace).and_then(|repo| repository(&repo));
    match result {
        Ok(repository) => GitProbe {
            git,
            problem: None,
            repository: Some(repository),
        },
        Err(error) if error.code == "not-repository" => GitProbe {
            git,
            problem: None,
            repository: None,
        },
        Err(error) => GitProbe {
            git,
            problem: Some(GitProblem {
                code: error.code,
                message: error.message,
            }),
            repository: None,
        },
    }
}

pub(crate) fn branches(repo: &Repo) -> Result<GitBranches, GitError> {
    let remotes = repo.remote_names();
    let output = repo
        .git(["for-each-ref"])
        .arg(format!("--format={}", parse::BRANCH_FORMAT))
        .args(["refs/heads", "refs/remotes"])
        .read_only()
        .run()?;
    let mut result = parse::branches(&output.stdout, &remotes);
    let tags = repo
        .git(["for-each-ref", "--sort=-creatordate"])
        .arg(format!("--count={TAG_LIMIT}"))
        .arg(format!("--format={}", parse::TAG_FORMAT))
        .arg("refs/tags")
        .read_only()
        .run()?;
    result.tags = parse::tags(&tags.stdout);
    Ok(result)
}

fn integer(value: f64, min: i64, max: i64) -> Result<i64, GitError> {
    if !value.is_finite() {
        return Err(GitError::invalid("数值参数无效"));
    }
    Ok((value.floor() as i64).clamp(min, max))
}

pub(crate) fn log(repo: &Repo, query: &GitLogQuery) -> Result<GitLogPage, GitError> {
    let limit = integer(query.limit, 1, LOG_LIMIT as i64)? as usize;
    let skip = integer(query.skip, 0, i64::from(u32::MAX))? as usize;
    let text = query
        .text
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty());
    let author = query
        .author
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty());
    for value in [text, author].into_iter().flatten() {
        if value.len() > 1024 || value.contains(['\0', '\n', '\r']) {
            return Err(GitError::invalid("搜索文本无效"));
        }
    }
    if query.revisions.len() > 64 {
        return Err(GitError::invalid("版本过多"));
    }
    for revision in &query.revisions {
        validate::revision(revision, true)?;
    }
    let path = match query.path.as_deref().filter(|p| !p.is_empty()) {
        Some(path) => Some(validate::path(path)?),
        None => None,
    };
    let head = repo.head_oid();
    let mut cmd = repo
        .git(["log", "--date-order", "--decorate=full"])
        .arg(format!("--format={}", parse::LOG_FORMAT))
        .arg(format!("--skip={skip}"))
        .arg(format!("--max-count={}", limit + 1));
    if let Some(text) = text {
        cmd = cmd
            .args(["--regexp-ignore-case", "--fixed-strings"])
            .arg(format!("--grep={text}"));
    }
    if let Some(author) = author {
        if text.is_none() {
            cmd = cmd.args(["--regexp-ignore-case", "--fixed-strings"]);
        }
        cmd = cmd.arg(format!("--author={author}"));
    }
    if let Some(since) = query.since {
        cmd = cmd.arg(format!(
            "--since=@{} +0000",
            integer(since, 0, i64::MAX / 2)?
        ));
    }
    if let Some(until) = query.until {
        cmd = cmd.arg(format!(
            "--until=@{} +0000",
            integer(until, 0, i64::MAX / 2)?
        ));
    }
    if query.first_parent == Some(true) {
        cmd = cmd.arg("--first-parent");
    }
    if let Some(path) = path {
        let is_file = head.is_some()
            && repo
                .git(["cat-file", "-t"])
                .arg(format!("HEAD:{path}"))
                .read_only()
                .text()
                .is_ok_and(|kind| kind.trim() == "blob");
        if is_file {
            cmd = cmd.arg("--follow");
        }
    }
    if query.revisions.is_empty() {
        cmd = cmd.args(["--exclude=refs/stash", "--all"]);
    } else {
        cmd = cmd.arg("--end-of-options").args(&query.revisions);
    }
    cmd = cmd.arg("--");
    if let Some(path) = path {
        cmd = cmd.arg(path).literal();
    }
    let output = cmd.read_only().run()?;
    let mut commits = parse::log(&output.stdout);
    let mut has_more = commits.len() > limit;
    commits.truncate(limit);
    if let Some(text) = text.filter(|t| skip == 0 && validate::hex(t) && t.len() <= 40) {
        if let Some(oid) = repo.rev_parse(&format!("{text}^{{commit}}")) {
            if !commits.iter().any(|c| c.oid == oid) {
                let found = repo
                    .git(["log", "-1", "--decorate=full"])
                    .arg(format!("--format={}", parse::LOG_FORMAT))
                    .arg(&oid)
                    .arg("--")
                    .read_only()
                    .run()?;
                if let Some(commit) = parse::log(&found.stdout).into_iter().next() {
                    commits.insert(0, commit);
                    if commits.len() > limit {
                        commits.truncate(limit);
                        has_more = true;
                    }
                }
            }
        }
    }
    Ok(GitLogPage { commits, has_more })
}

fn diff_files(repo: &Repo, base: &[&str], revs: &[&str]) -> Result<Vec<GitFileChange>, GitError> {
    let run = |format: &str| {
        repo.git(base.iter().copied())
            .args([
                "-z",
                "--find-renames",
                "--no-ext-diff",
                "--no-textconv",
                format,
            ])
            .args(revs.iter().copied())
            .arg("--")
            .read_only()
            .run()
    };
    let numstat = run("--numstat")?;
    let names = run("--name-status")?;
    Ok(parse::file_changes(&numstat.stdout, &names.stdout))
}

pub(crate) fn commit_details(repo: &Repo, oid: &str) -> Result<GitCommitDetails, GitError> {
    validate::revision(oid, false)?;
    let output = repo
        .git(["show", "-s", "--decorate=full"])
        .arg(format!("--format={}", parse::DETAIL_FORMAT))
        .args(["--end-of-options", oid, "--"])
        .read_only()
        .run()?;
    let commit = parse::log(&output.stdout)
        .into_iter()
        .next()
        .ok_or_else(|| GitError::invalid("找不到该提交"))?;
    let files = match commit.parents.first() {
        None => diff_files(
            repo,
            &["diff-tree", "-r", "--root", "--no-commit-id"],
            &[&commit.oid],
        )?,
        Some(_) if commit.parents.len() == 1 => {
            diff_files(repo, &["diff-tree", "-r", "--no-commit-id"], &[&commit.oid])?
        }
        Some(first) => diff_files(repo, &["diff"], &[first, &commit.oid])?,
    };
    Ok(GitCommitDetails { commit, files })
}

pub(crate) fn compare(repo: &Repo, from: &str, to: &str) -> Result<Vec<GitFileChange>, GitError> {
    validate::revision(from, false)?;
    if to == WORKTREE {
        diff_files(repo, &["diff"], &[from])
    } else {
        validate::revision(to, false)?;
        diff_files(repo, &["diff"], &[from, to])
    }
}

/// Decodes file bytes for the client: BOM removed, CRLF normalised, binary detected.
pub(crate) fn decode(bytes: Vec<u8>) -> GitFileText {
    let bom = bytes.starts_with(&[0xEF, 0xBB, 0xBF]);
    let body = if bom { &bytes[3..] } else { &bytes[..] };
    if body.iter().take(8000).any(|b| *b == 0) {
        return GitFileText {
            binary: true,
            bom,
            ..GitFileText::default()
        };
    }
    match std::str::from_utf8(body) {
        Ok(text) => GitFileText {
            crlf: text.contains("\r\n"),
            text: Some(text.replace("\r\n", "\n")),
            binary: false,
            too_large: false,
            bom,
        },
        Err(_) => GitFileText {
            binary: true,
            bom,
            ..GitFileText::default()
        },
    }
}

fn missing_object(stderr: &str) -> bool {
    [
        "does not exist",
        "exists on disk, but not in",
        "but not at stage",
        "not in the index",
        "Not a valid object name",
        "invalid object name",
        "bad revision",
        "unknown revision",
    ]
    .iter()
    .any(|needle| stderr.contains(needle))
}

/// A path under the work tree that does not escape it through links.
pub(crate) fn worktree_path(repo: &Repo, path: &str) -> Result<PathBuf, GitError> {
    validate::path(path)?;
    let full = repo.root.join(path);
    let root = repo
        .root
        .canonicalize()
        .map_err(|_| GitError::new("failed", "无法访问仓库目录"))?;
    // The nearest existing ancestor decides where the path really leads.
    let existing = full
        .ancestors()
        .skip(1)
        .find_map(|ancestor| ancestor.canonicalize().ok())
        .ok_or_else(|| GitError::new("failed", "无法访问仓库目录"))?;
    if !existing.starts_with(&root) {
        return Err(GitError::invalid("文件位于仓库之外"));
    }
    Ok(full)
}

pub(crate) fn file_text(repo: &Repo, spec: &GitFileSpec) -> Result<GitFileText, GitError> {
    let path = validate::path(&spec.path)?;
    if spec.rev == WORKTREE {
        let full = worktree_path(repo, path)?;
        let metadata = match std::fs::symlink_metadata(&full) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(GitFileText::default())
            }
            Err(_) => return Err(GitError::new("failed", "无法读取文件")),
        };
        if metadata.file_type().is_symlink() {
            let target = full
                .canonicalize()
                .map_err(|_| GitError::new("failed", "无法读取文件"))?;
            let root = repo
                .root
                .canonicalize()
                .map_err(|_| GitError::new("failed", "无法访问仓库目录"))?;
            if !target.starts_with(&root) {
                return Err(GitError::invalid("链接指向仓库之外"));
            }
        }
        if full.is_dir() {
            return Err(GitError::invalid("该路径是文件夹"));
        }
        if std::fs::metadata(&full).map(|m| m.len()).unwrap_or(0) > FILE_LIMIT as u64 {
            return Ok(GitFileText {
                too_large: true,
                ..GitFileText::default()
            });
        }
        use std::io::Read;
        let mut bytes = Vec::new();
        std::fs::File::open(&full)
            .and_then(|file| file.take(FILE_LIMIT as u64 + 1).read_to_end(&mut bytes))
            .map_err(|_| GitError::new("failed", "无法读取文件"))?;
        if bytes.len() > FILE_LIMIT {
            return Ok(GitFileText {
                too_large: true,
                ..GitFileText::default()
            });
        }
        return Ok(decode(bytes));
    }
    let object = match spec.rev.as_str() {
        ":0" | ":1" | ":2" | ":3" => format!("{}:{path}", spec.rev),
        rev => {
            validate::revision(rev, false)?;
            if rev.contains(':') {
                return Err(GitError::invalid("版本无效"));
            }
            format!("{rev}:{path}")
        }
    };
    let size = repo.git(["cat-file", "-s", &object]).read_only().output()?;
    if !size.success() {
        if missing_object(&size.stderr) {
            return Ok(GitFileText::default());
        }
        return Err(super::error::classify(&size.stderr, None));
    }
    if size.text().trim().parse::<u64>().unwrap_or(u64::MAX) > FILE_LIMIT as u64 {
        return Ok(GitFileText {
            too_large: true,
            ..GitFileText::default()
        });
    }
    let output = repo
        .git(["cat-file", "blob", &object])
        .limit(FILE_LIMIT + 1)
        .read_only()
        .run()?;
    Ok(decode(output.stdout))
}

fn short(oid: &str) -> String {
    oid.chars().take(7).collect()
}

pub(crate) fn conflicts(repo: &Repo) -> Result<GitConflicts, GitError> {
    let (header, changes, _) = status_raw(repo, false)?;
    let operation = repo.operation();
    let current = header
        .head
        .branch
        .clone()
        .or_else(|| header.head.oid.as_deref().map(short))
        .unwrap_or_else(|| "本地".into());
    let (yours, theirs) = match operation {
        RepositoryOperation::Merging => {
            let theirs = repo
                .read_git_file("MERGE_MSG")
                .and_then(|message| parse::merge_label(&message))
                .or_else(|| {
                    repo.read_git_file("MERGE_HEAD")
                        .map(|oid| short(oid.trim()))
                })
                .unwrap_or_else(|| "传入".into());
            (current, theirs)
        }
        RepositoryOperation::Rebasing => {
            let dir = if repo.git_dir.join("rebase-merge").is_dir() {
                "rebase-merge"
            } else {
                "rebase-apply"
            };
            let yours = repo
                .read_git_file(&format!("{dir}/head-name"))
                .map(|name| name.trim().trim_start_matches("refs/heads/").to_string())
                .filter(|name| !name.is_empty() && name != "detached HEAD")
                .unwrap_or_else(|| "本地".into());
            let theirs = repo
                .read_git_file(&format!("{dir}/onto"))
                .map(|oid| oid.trim().to_string())
                .filter(|oid| validate::hex(oid))
                .map(|oid| {
                    repo.git(["for-each-ref", "--count=1", "--format=%(refname:short)"])
                        .arg(format!("--points-at={oid}"))
                        .args(["refs/heads", "refs/remotes"])
                        .read_only()
                        .text()
                        .ok()
                        .map(|name| name.trim().to_string())
                        .filter(|name| !name.is_empty())
                        .unwrap_or_else(|| short(&oid))
                })
                .unwrap_or_else(|| "传入".into());
            (yours, theirs)
        }
        RepositoryOperation::CherryPicking => (
            current,
            repo.read_git_file("CHERRY_PICK_HEAD")
                .map(|oid| short(oid.trim()))
                .unwrap_or_else(|| "传入".into()),
        ),
        RepositoryOperation::Reverting => (
            current,
            repo.read_git_file("REVERT_HEAD")
                .map(|oid| short(oid.trim()))
                .unwrap_or_else(|| "传入".into()),
        ),
        _ => ("本地".into(), "传入".into()),
    };
    Ok(GitConflicts {
        operation,
        yours_stage: if operation == RepositoryOperation::Rebasing {
            3
        } else {
            2
        },
        yours_label: yours,
        theirs_label: theirs,
        files: changes
            .into_iter()
            .filter_map(|change| {
                change.conflict.map(|kind| GitConflict {
                    path: change.path,
                    kind,
                })
            })
            .collect(),
    })
}

pub(crate) fn stashes(repo: &Repo) -> Result<Vec<GitStash>, GitError> {
    let output = repo
        .git(["stash", "list", "--format=%gd%x1f%H%x1f%ct%x1f%gs"])
        .read_only()
        .run()?;
    Ok(parse::stashes(&output.text()))
}
