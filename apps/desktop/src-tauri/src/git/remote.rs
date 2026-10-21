//! Operations that talk to remotes: fetch, update (pull), push, sync, remote branch changes,
//! connection tests and proxy detection.
use super::{
    error::{classify, GitError},
    mutate::{self, count, finish, strategy_option, MessageFile},
    network::{self, NetPlan},
    ops::{self, Repo},
    parse,
    runner::{Cmd, GitExe, Output, COMMIT_TIMEOUT},
    types::*,
    validate,
};
use std::{path::Path, time::Instant};

/// Runs `job` with the network plan; after a proxy/network failure through a proxy, retries
/// once directly when allowed. Returns the job result and the proxy that carried it.
fn networked<T>(
    repo: &Repo,
    network: &GitNetwork,
    urls: &[String],
    job: impl Fn(&NetPlan) -> Result<T, GitError>,
) -> Result<(T, Option<String>), GitError> {
    let plan = network::plan(repo, network, urls, false)?;
    match job(&plan) {
        Ok(value) => Ok((value, plan.proxy.clone())),
        Err(error)
            if plan.proxied
                && network.fallback_direct
                && matches!(error.code, "proxy" | "network") =>
        {
            repo.cancelled()?;
            let direct = network::plan(repo, network, urls, true)?;
            job(&direct).map(|value| (value, None))
        }
        Err(error) => Err(error),
    }
}

/// A git command against a remote: progress, cancellation and the network plan applied.
fn remote_cmd<'a>(repo: &'a Repo, plan: &NetPlan, operation: &'a str, args: &[&str]) -> Cmd<'a> {
    plan.apply(
        repo.git(args.iter().copied())
            .cancel(repo.cancel.as_deref())
            .progress(repo.progress.as_ref(), operation),
    )
}

pub(crate) fn fetch(
    repo: &Repo,
    remote: Option<&str>,
    prune: bool,
    network: &GitNetwork,
) -> Result<Option<String>, GitError> {
    let mut args = vec!["fetch", "--progress"];
    if prune {
        args.push("--prune");
    }
    let urls = match remote {
        Some(remote) => {
            validate::remote_name(remote)?;
            args.push(remote);
            vec![repo.remote_url(remote, false)?]
        }
        None => {
            args.push("--all");
            repo.remote_names()
                .iter()
                .filter_map(|name| repo.remote_url(name, false).ok())
                .collect()
        }
    };
    let ((), proxy) = networked(repo, network, &urls, |plan| {
        remote_cmd(repo, plan, "fetch", &args).run().map(|_| ())
    })?;
    Ok(proxy)
}

fn no_upstream(before: Option<String>) -> GitUpdateResult {
    GitUpdateResult {
        outcome: UpdateOutcome::NoUpstream,
        changed: 0,
        conflicts: Vec::new(),
        after: before.clone(),
        before,
        proxy: None,
        stash_kept: false,
    }
}

/// Fetches the upstream of the current branch and integrates it.
pub(crate) fn update(repo: &Repo, options: &GitUpdateOptions) -> Result<GitUpdateResult, GitError> {
    network::validate_network(&options.network)?;
    let (header, _, _) = ops::status_raw(repo, false)?;
    let before = header.head.oid.clone();
    let (Some(branch), Some(_)) = (header.head.branch.clone(), header.upstream.as_ref()) else {
        return Ok(no_upstream(before));
    };
    let remote = repo
        .config(&format!("branch.{branch}.remote"))
        .unwrap_or_default();
    let mut proxy = None;
    if !remote.is_empty() && remote != "." {
        validate::remote_name(&remote)?;
        let url = repo.remote_url(&remote, false)?;
        let mut args = vec!["fetch", "--progress"];
        if options.prune {
            args.push("--prune");
        }
        args.push(&remote);
        proxy = networked(repo, &options.network, &[url], |plan| {
            remote_cmd(repo, plan, "fetch", &args).run().map(|_| ())
        })?
        .1;
    }
    repo.cancelled()?;
    let Some(upstream) = repo
        .git(["rev-parse", "--symbolic-full-name", "@{u}"])
        .read_only()
        .text()
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|name| !name.is_empty() && repo.rev_parse(name).is_some())
    else {
        return Err(GitError::new(
            "no-upstream",
            "上游分支不存在（可能已在远程删除）",
        ));
    };
    let behind = if before.is_some() {
        count(repo, &[&format!("HEAD..{upstream}")])
    } else {
        1
    };
    if behind == 0 {
        return Ok(GitUpdateResult {
            outcome: UpdateOutcome::UpToDate,
            changed: 0,
            conflicts: Vec::new(),
            after: before.clone(),
            before,
            proxy,
            stash_kept: false,
        });
    }
    let output = if before.is_none() {
        // A fresh branch with an upstream: adopt the upstream when nothing is staged.
        let staged = repo.git(["ls-files", "-z"]).read_only().run()?;
        if !staged.stdout.is_empty() {
            return Err(GitError::new(
                "dirty",
                "当前分支还没有提交且暂存区有文件，请先提交或清空暂存区后再更新",
            ));
        }
        repo.git(["checkout", "-q", "-B", &branch, &upstream])
            .output()?
    } else {
        let autostash =
            options.autostash && (options.method == PullMethod::Rebase || repo.exe.at_least(2, 27));
        let mut args: Vec<&str> = match options.method {
            PullMethod::Merge => vec!["merge", "--no-edit"],
            PullMethod::Rebase => vec!["rebase"],
            PullMethod::FfOnly => vec!["merge", "--ff-only"],
        };
        if autostash {
            args.push("--autostash");
        }
        if options.method != PullMethod::FfOnly {
            let rebase = options.method == PullMethod::Rebase;
            if let Some(option) = strategy_option(options.conflict_strategy, rebase) {
                args.push(option);
            }
        }
        args.push(&upstream);
        repo.git(args).timeout(COMMIT_TIMEOUT).output()?
    };
    if options.method == PullMethod::FfOnly
        && !output.success()
        && output.stderr.contains("Not possible to fast-forward")
    {
        return Err(GitError::new(
            "non-fast-forward",
            "无法快进：本地分支与远程分支已分叉，请改用合并或变基",
        )
        .with_detail(&output.stderr));
    }
    let mut result = finish(repo, before, &output)?;
    result.proxy = proxy;
    Ok(result)
}

/// `git push --porcelain` lines: `<flag>\t<from>:<to>\t<summary>`.
fn push_lines(output: &Output) -> Vec<(char, String)> {
    output
        .text()
        .lines()
        .filter_map(|line| {
            let mut parts = line.splitn(3, '\t');
            let flag = parts.next()?.chars().next()?;
            let _refs = parts.next()?;
            Some((flag, parts.next().unwrap_or("").trim().to_string()))
        })
        .collect()
}

pub(crate) struct Pushed {
    pub result: GitPushResult,
    /// The remote changed (commits sent or a branch created).
    pub changed: bool,
}

pub(crate) fn push(repo: &Repo, options: &GitPushOptions) -> Result<Pushed, GitError> {
    validate::remote_name(&options.remote)?;
    validate::ref_name(&options.branch)?;
    mutate::check_ref(&repo.exe, &repo.root, &options.remote_branch, false)?;
    let local = format!("refs/heads/{}", options.branch);
    if repo.rev_parse(&local).is_none() {
        return Err(GitError::invalid("本地分支不存在或还没有提交"));
    }
    let tracking = format!("refs/remotes/{}/{}", options.remote, options.remote_branch);
    let pending = if repo.rev_parse(&tracking).is_some() {
        count(repo, &[&format!("{tracking}..{local}")])
    } else {
        count(
            repo,
            &[&local, "--not", &format!("--remotes={}", options.remote)],
        )
    };
    let url = repo.remote_url(&options.remote, true)?;
    let refspec = format!("{local}:refs/heads/{}", options.remote_branch);
    let mut args = vec!["push", "--progress", "--porcelain"];
    if options.set_upstream {
        args.push("--set-upstream");
    }
    if options.force == ForceMode::WithLease {
        args.push("--force-with-lease");
    }
    if options.tags {
        args.push("--follow-tags");
    }
    args.push(&options.remote);
    args.push(&refspec);
    let (output, proxy) = networked(repo, &options.network, &[url], |plan| {
        let output = remote_cmd(repo, plan, "push", &args).output()?;
        if output.success() || push_lines(&output).iter().any(|(flag, _)| *flag == '!') {
            Ok(output)
        } else {
            Err(classify(&output.stderr, plan.proxy_host()))
        }
    })?;
    let lines = push_lines(&output);
    if let Some((_, summary)) = lines.iter().find(|(flag, _)| *flag == '!') {
        if ["non-fast-forward", "fetch first", "stale info"]
            .iter()
            .any(|reason| summary.contains(reason))
        {
            return Err(GitError::new(
                "non-fast-forward",
                "推送被拒绝：远程分支包含本地没有的提交，请先更新",
            )
            .with_detail(&output.stderr));
        }
        return Ok(Pushed {
            result: GitPushResult {
                pushed: 0,
                rejected: true,
                proxy,
                message: format!("推送被拒绝：{}", super::error::redact(summary)),
            },
            changed: false,
        });
    }
    let up_to_date = !lines.is_empty() && lines.iter().all(|(flag, _)| *flag == '=');
    let target = format!("{}/{}", options.remote, options.remote_branch);
    Ok(Pushed {
        result: GitPushResult {
            pushed: if up_to_date { 0 } else { pending },
            rejected: false,
            proxy,
            message: if up_to_date {
                format!("{target} 已是最新")
            } else {
                format!("已推送 {pending} 个提交到 {target}")
            },
        },
        changed: !up_to_date,
    })
}

pub(crate) fn sync(repo: &Repo, options: &GitSyncOptions) -> Result<GitSyncResult, GitError> {
    network::validate_network(&options.network)?;
    let mut committed = None;
    if let Some(message) = options.commit_message.as_deref() {
        let message = validate::message(message, 64 * 1024)?;
        let (_, changes, _) = ops::status_raw(repo, true)?;
        if changes.iter().any(|c| c.conflict.is_some()) {
            return Err(GitError::new("conflicts", "存在未解决的冲突，请先解决冲突"));
        }
        if !changes.is_empty() {
            repo.git(["add", "-A"]).run()?;
            let file = MessageFile::new(message)?;
            let output = repo
                .git(["commit", "--cleanup=whitespace", "-F"])
                .arg(file.path())
                .timeout(COMMIT_TIMEOUT)
                .output()?;
            if !output.success() {
                return Err(classify(&output.stderr, None));
            }
            committed = repo.head_oid();
        }
    }
    if !repo.unmerged()?.is_empty() {
        return Err(GitError::new("conflicts", "存在未解决的冲突，请先解决冲突"));
    }
    let (header, _, _) = ops::status_raw(repo, false)?;
    let Some(branch) = header.head.branch.clone() else {
        return Err(GitError::new("no-upstream", "当前未在任何分支上，无法同步"));
    };
    let mut pushed = 0;
    let mut remote_changed = false;
    let push = |remote: String, remote_branch: String, set_upstream: bool| {
        let result = self::push(
            repo,
            &GitPushOptions {
                remote,
                branch: branch.clone(),
                remote_branch,
                set_upstream,
                force: ForceMode::None,
                tags: false,
                network: options.network.clone(),
            },
        )?;
        if result.result.rejected {
            return Err(GitError::new("failed", result.result.message));
        }
        Ok::<_, GitError>(result)
    };
    let update = if header.upstream.is_some() {
        let result = update(repo, &options.update())?;
        if result.outcome == UpdateOutcome::Conflicts {
            return Ok(GitSyncResult {
                committed,
                update: Some(result),
                pushed: 0,
                idle: false,
            });
        }
        let remote = repo
            .config(&format!("branch.{branch}.remote"))
            .unwrap_or_default();
        let merge = repo
            .config(&format!("branch.{branch}.merge"))
            .unwrap_or_default();
        let remote_branch = merge.strip_prefix("refs/heads/").unwrap_or("").to_string();
        if options.push
            && !remote.is_empty()
            && remote != "."
            && !remote_branch.is_empty()
            && count(repo, &["@{u}..HEAD"]) > 0
        {
            repo.cancelled()?;
            let result = push(remote, remote_branch, false)?;
            pushed = result.result.pushed;
            remote_changed = result.changed;
        }
        Some(result)
    } else {
        if options.push && !header.head.unborn {
            let remotes = repo.remote_names();
            let remote = if remotes.iter().any(|r| r == "origin") {
                "origin".to_string()
            } else if remotes.len() == 1 {
                remotes[0].clone()
            } else {
                return Err(GitError::new(
                    "no-upstream",
                    "当前分支没有上游分支，也无法确定要推送到哪个远程仓库",
                ));
            };
            let result = push(remote, branch.clone(), true)?;
            pushed = result.result.pushed;
            remote_changed = result.changed;
        }
        None
    };
    let idle = committed.is_none()
        && update
            .as_ref()
            .is_none_or(|u| u.outcome == UpdateOutcome::UpToDate)
        && pushed == 0
        && !remote_changed;
    Ok(GitSyncResult {
        committed,
        update,
        pushed,
        idle,
    })
}

pub(crate) fn delete_remote_branch(
    repo: &Repo,
    remote: &str,
    name: &str,
    network: &GitNetwork,
) -> Result<(), GitError> {
    validate::remote_name(remote)?;
    validate::ref_name(name)?;
    let url = repo.remote_url(remote, true)?;
    let target = format!("refs/heads/{name}");
    networked(repo, network, &[url], |plan| {
        remote_cmd(
            repo,
            plan,
            "push",
            &["push", "--progress", remote, "--delete", &target],
        )
        .run()
        .map(|_| ())
    })?;
    Ok(())
}

/// Fast-forwards a branch that is not checked out to its upstream.
pub(crate) fn update_branch(repo: &Repo, name: &str, network: &GitNetwork) -> Result<(), GitError> {
    validate::ref_name(name)?;
    let current = repo
        .git(["symbolic-ref", "--quiet", "--short", "HEAD"])
        .read_only()
        .text()
        .map(|text| text.trim().to_string())
        .unwrap_or_default();
    if current == name {
        return Err(GitError::invalid("这是当前分支，请使用“更新项目”"));
    }
    let (Some(remote), Some(merge)) = (
        repo.config(&format!("branch.{name}.remote")),
        repo.config(&format!("branch.{name}.merge")),
    ) else {
        return Err(GitError::new("no-upstream", "该分支没有设置上游分支"));
    };
    let Some(source) = merge.strip_prefix("refs/heads/") else {
        return Err(GitError::new("no-upstream", "该分支的上游不是分支"));
    };
    validate::ref_name(source)?;
    let refspec = format!("refs/heads/{source}:refs/heads/{name}");
    if remote == "." {
        repo.git(["fetch", ".", &refspec]).run()?;
        return Ok(());
    }
    validate::remote_name(&remote)?;
    let url = repo.remote_url(&remote, false)?;
    networked(repo, network, &[url], |plan| {
        remote_cmd(
            repo,
            plan,
            "fetch",
            &["fetch", "--progress", &remote, &refspec],
        )
        .run()
        .map(|_| ())
    })?;
    Ok(())
}

/// `ls-remote` against a configured remote or a URL. Failures are reported, never raised.
pub(crate) fn remote_test(
    repo: &Repo,
    target: &str,
    network: &GitNetwork,
) -> Result<GitRemoteTest, GitError> {
    let started = Instant::now();
    let failed = |message: String, proxy: Option<String>| GitRemoteTest {
        ok: false,
        default_branch: None,
        branches: 0,
        elapsed_ms: started.elapsed().as_millis() as u64,
        proxy,
        message,
    };
    let configured = validate::remote_name(target).is_ok()
        && repo.remote_names().iter().any(|name| name == target);
    let url = if configured {
        match repo.remote_url(target, false) {
            Ok(url) => url,
            Err(error) => return Ok(failed(error.message, None)),
        }
    } else {
        match validate::remote_url(target) {
            Ok(url) => url.to_string(),
            Err(error) => return Ok(failed(error.message, None)),
        }
    };
    if let Err(error) = network::validate_network(network) {
        return Ok(failed(error.message, None));
    }
    let argument = if configured { target } else { url.as_str() };
    let result = networked(repo, network, std::slice::from_ref(&url), |plan| {
        remote_cmd(repo, plan, "test", &["ls-remote", "--symref", argument]).run()
    });
    Ok(match result {
        Ok((output, proxy)) => {
            let (branches, default_branch) = parse::ls_remote(&output.text());
            GitRemoteTest {
                ok: true,
                default_branch,
                branches,
                elapsed_ms: started.elapsed().as_millis() as u64,
                proxy,
                message: format!("连接成功，远程仓库有 {branches} 个分支"),
            }
        }
        Err(error) => {
            let reason = error.detail.lines().last().unwrap_or("").trim();
            let message = if reason.is_empty() {
                error.message
            } else {
                format!(
                    "{}（{}）",
                    error.message,
                    reason.chars().take(200).collect::<String>()
                )
            };
            failed(message, None)
        }
    })
}

pub(crate) fn detect_proxy(exe: Option<&GitExe>, repo: Option<&Repo>) -> GitProxyReport {
    let environment = network::environment_proxy().map(|p| validate::proxy_display(&p));
    let system = crate::agents::network::system_proxy().map(|p| validate::proxy_display(&p));
    let git_config = match (repo, exe) {
        (Some(repo), _) => network::git_config_proxy(repo.git(Vec::<String>::new()), None),
        (None, Some(exe)) => {
            let home = std::env::temp_dir();
            Cmd::new(exe, &home, ["config", "--global", "--get", "http.proxy"])
                .read_only()
                .text()
                .ok()
                .map(|text| text.trim().to_string())
                .filter(|text| !text.is_empty())
        }
        (None, None) => None,
    }
    .map(|p| validate::proxy_display(&p));
    let effective = git_config
        .clone()
        .or_else(|| environment.clone())
        .or_else(|| system.clone());
    GitProxyReport {
        environment,
        system,
        git_config,
        effective,
    }
}

/// A repository-less handle for commands that may run outside a repository (remote tests,
/// global configuration).
pub(crate) fn outside(exe: GitExe, cwd: &Path) -> Repo {
    Repo {
        exe,
        root: cwd.to_path_buf(),
        prefix: String::new(),
        git_dir: cwd.join(".git"),
        cancel: None,
        progress: None,
        credentials: None,
    }
}
