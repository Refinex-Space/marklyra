//! Tauri commands: authorize the window's workspace, then run an operation off the main thread.
use super::{
    credentials,
    error::GitError,
    mutate,
    ops::{self, Repo},
    remote,
    runner::ProgressFn,
    types::*,
    GitHost,
};
use std::{path::PathBuf, sync::Arc};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[derive(Clone, Copy)]
enum Kind {
    /// No lock, no notification.
    Read,
    /// Serialised per repository; `files` when the work tree may have changed.
    Write { files: bool },
    /// Like `Write`, plus cancellation, progress and saved credentials.
    Network { files: bool },
}

fn workspace_root(window: &WebviewWindow, id: &str) -> Result<PathBuf, String> {
    let workspace = crate::agents::support::authorized_workspace(window, id)?;
    let root = workspace
        .display_root_snapshot()
        .map_err(|error| error.to_string())?;
    Ok(crate::platform::entry_actions::plain_path(&root))
}

fn require_settings(window: &WebviewWindow) -> Result<(), String> {
    if crate::windows::is_editor(window)
        || (window.label() == "preferences"
            && crate::platform::ui_chrome::require_preferences_session(window).is_ok())
    {
        Ok(())
    } else {
        Err("Git 设置仅允许从应用窗口发起".into())
    }
}

fn credentials_root(app: &AppHandle) -> Result<PathBuf, GitError> {
    crate::app_paths::data_dir(app)
        .map(|root| root.join("git"))
        .map_err(|error| GitError::new("failed", error))
}

fn notify(app: &AppHandle, root: &str, files: bool) {
    if let Err(error) = app.emit("marklyra:git-changed", root) {
        eprintln!("Git change notification failed: {error}");
    }
    if files {
        if let Err(error) = app.emit("workspace-files-changed", ()) {
            eprintln!("Workspace change notification failed: {error}");
        }
    }
}

fn progress_sink(app: AppHandle, label: String, workspace_id: String) -> ProgressFn {
    Arc::new(move |operation, phase, percent| {
        let _ = app.emit_to(
            label.as_str(),
            "marklyra:git-progress",
            GitProgress {
                workspace_id: workspace_id.clone(),
                operation: operation.to_string(),
                phase: phase.to_string(),
                percent,
            },
        );
    })
}

async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|_| "[failed] Git 任务异常结束".to_string())?
}

/// Opens the repository of the window's workspace and runs `job` with the locking,
/// cancellation and notifications that `kind` asks for.
async fn with_repo<T: Send + 'static>(
    window: WebviewWindow,
    workspace_id: String,
    kind: Kind,
    job: impl FnOnce(&Repo) -> Result<T, GitError> + Send + 'static,
) -> Result<T, String> {
    let workspace = workspace_root(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    blocking(move || {
        let host = app.state::<GitHost>();
        let mut repo = Repo::open(host.executable()?, &workspace)?;
        let (files, network) = match kind {
            Kind::Read => return job(&repo).map_err(String::from),
            Kind::Write { files } => (files, false),
            Kind::Network { files } => (files, true),
        };
        let _lock = host.lock(&repo.root)?;
        let _running = if network {
            let (flag, guard) = host.begin(&label, &workspace_id);
            repo.cancel = Some(flag);
            repo.progress = Some(progress_sink(
                app.clone(),
                label.clone(),
                workspace_id.clone(),
            ));
            repo.credentials = credentials_root(&app).ok();
            Some(guard)
        } else {
            None
        };
        let result = job(&repo);
        notify(&app, &repo.display_root(), files);
        result.map_err(String::from)
    })
    .await
}

#[tauri::command]
pub async fn git_probe(window: WebviewWindow, workspace_id: String) -> Result<GitProbe, String> {
    let workspace = workspace_root(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || Ok(ops::probe(app.state::<GitHost>().executable(), &workspace))).await
}

#[tauri::command]
pub async fn git_init(
    window: WebviewWindow,
    workspace_id: String,
    default_branch: String,
    gitignore: bool,
) -> Result<GitProbe, String> {
    let workspace = workspace_root(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || {
        let host = app.state::<GitHost>();
        let exe = host.executable()?;
        let _lock = host.lock(&workspace)?;
        mutate::init(&exe, &workspace, default_branch.trim(), gitignore)?;
        let probe = ops::probe(Ok(exe), &workspace);
        let root = probe
            .repository
            .as_ref()
            .map(|repository| repository.root.clone())
            .unwrap_or_else(|| workspace.to_string_lossy().into_owned());
        notify(&app, &root, true);
        Ok(probe)
    })
    .await
}

#[tauri::command]
pub async fn git_trust_directory(
    window: WebviewWindow,
    workspace_id: String,
) -> Result<(), String> {
    let workspace = workspace_root(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || {
        let exe = app.state::<GitHost>().executable()?;
        mutate::trust(&exe, &workspace)?;
        notify(&app, &workspace.to_string_lossy(), false);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn git_status(window: WebviewWindow, workspace_id: String) -> Result<GitStatus, String> {
    with_repo(window, workspace_id, Kind::Read, ops::status).await
}

#[tauri::command]
pub async fn git_branches(
    window: WebviewWindow,
    workspace_id: String,
) -> Result<GitBranches, String> {
    with_repo(window, workspace_id, Kind::Read, ops::branches).await
}

#[tauri::command]
pub async fn git_log(
    window: WebviewWindow,
    workspace_id: String,
    query: GitLogQuery,
) -> Result<GitLogPage, String> {
    with_repo(window, workspace_id, Kind::Read, move |repo| {
        ops::log(repo, &query)
    })
    .await
}

#[tauri::command]
pub async fn git_commit_details(
    window: WebviewWindow,
    workspace_id: String,
    oid: String,
) -> Result<GitCommitDetails, String> {
    with_repo(window, workspace_id, Kind::Read, move |repo| {
        ops::commit_details(repo, &oid)
    })
    .await
}

#[tauri::command]
pub async fn git_compare(
    window: WebviewWindow,
    workspace_id: String,
    from: String,
    to: String,
) -> Result<Vec<GitFileChange>, String> {
    with_repo(window, workspace_id, Kind::Read, move |repo| {
        ops::compare(repo, &from, &to)
    })
    .await
}

#[tauri::command]
pub async fn git_file_text(
    window: WebviewWindow,
    workspace_id: String,
    spec: GitFileSpec,
) -> Result<GitFileText, String> {
    with_repo(window, workspace_id, Kind::Read, move |repo| {
        ops::file_text(repo, &spec)
    })
    .await
}

#[tauri::command]
pub async fn git_commit(
    window: WebviewWindow,
    workspace_id: String,
    message: String,
    paths: Vec<String>,
    amend: bool,
) -> Result<GitCommitted, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: false },
        move |repo| mutate::commit(repo, &message, &paths, amend).map(|oid| GitCommitted { oid }),
    )
    .await
}

#[tauri::command]
pub async fn git_rollback(
    window: WebviewWindow,
    workspace_id: String,
    paths: Vec<String>,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::rollback(repo, &paths),
    )
    .await
}

#[tauri::command]
pub async fn git_fetch(
    window: WebviewWindow,
    workspace_id: String,
    remote: Option<String>,
    prune: bool,
    network: GitNetwork,
) -> Result<GitProxyUsed, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Network { files: false },
        move |repo| {
            remote::fetch(repo, remote.as_deref(), prune, &network)
                .map(|proxy| GitProxyUsed { proxy })
        },
    )
    .await
}

#[tauri::command]
pub async fn git_update(
    window: WebviewWindow,
    workspace_id: String,
    options: GitUpdateOptions,
) -> Result<GitUpdateResult, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Network { files: true },
        move |repo| remote::update(repo, &options),
    )
    .await
}

#[tauri::command]
pub async fn git_push(
    window: WebviewWindow,
    workspace_id: String,
    options: GitPushOptions,
) -> Result<GitPushResult, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Network { files: false },
        move |repo| remote::push(repo, &options).map(|pushed| pushed.result),
    )
    .await
}

#[tauri::command]
pub async fn git_sync(
    window: WebviewWindow,
    workspace_id: String,
    options: GitSyncOptions,
) -> Result<GitSyncResult, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Network { files: true },
        move |repo| remote::sync(repo, &options),
    )
    .await
}

#[tauri::command]
pub fn git_cancel(window: WebviewWindow, workspace_id: String) -> Result<(), String> {
    crate::commands::require_window(&window)?;
    window
        .state::<GitHost>()
        .cancel(window.label(), &workspace_id);
    Ok(())
}

#[tauri::command]
pub async fn git_checkout(
    window: WebviewWindow,
    workspace_id: String,
    target: String,
    kind: CheckoutKind,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::checkout(repo, &target, kind),
    )
    .await
}

#[tauri::command]
pub async fn git_create_branch(
    window: WebviewWindow,
    workspace_id: String,
    name: String,
    from: String,
    checkout: bool,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: checkout },
        move |repo| mutate::create_branch(repo, name.trim(), &from, checkout),
    )
    .await
}

#[tauri::command]
pub async fn git_rename_branch(
    window: WebviewWindow,
    workspace_id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: false },
        move |repo| mutate::rename_branch(repo, &from, to.trim()),
    )
    .await
}

#[tauri::command]
pub async fn git_delete_branch(
    window: WebviewWindow,
    workspace_id: String,
    name: String,
    force: bool,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: false },
        move |repo| mutate::delete_branch(repo, &name, force),
    )
    .await
}

#[tauri::command]
pub async fn git_delete_remote_branch(
    window: WebviewWindow,
    workspace_id: String,
    remote: String,
    name: String,
    network: GitNetwork,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Network { files: false },
        move |repo| remote::delete_remote_branch(repo, &remote, &name, &network),
    )
    .await
}

#[tauri::command]
pub async fn git_update_branch(
    window: WebviewWindow,
    workspace_id: String,
    name: String,
    network: GitNetwork,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Network { files: false },
        move |repo| remote::update_branch(repo, &name, &network),
    )
    .await
}

#[tauri::command]
pub async fn git_set_upstream(
    window: WebviewWindow,
    workspace_id: String,
    branch: String,
    upstream: Option<String>,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: false },
        move |repo| mutate::set_upstream(repo, &branch, upstream.as_deref()),
    )
    .await
}

#[tauri::command]
pub async fn git_merge(
    window: WebviewWindow,
    workspace_id: String,
    target: String,
    conflict_strategy: ConflictStrategy,
) -> Result<GitUpdateResult, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::merge(repo, &target, conflict_strategy),
    )
    .await
}

#[tauri::command]
pub async fn git_rebase(
    window: WebviewWindow,
    workspace_id: String,
    onto: String,
    branch: Option<String>,
) -> Result<GitUpdateResult, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::rebase(repo, &onto, branch.as_deref()),
    )
    .await
}

#[tauri::command]
pub async fn git_operation(
    window: WebviewWindow,
    workspace_id: String,
    action: OperationAction,
) -> Result<GitUpdateResult, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::operation(repo, action),
    )
    .await
}

#[tauri::command]
pub async fn git_cherry_pick(
    window: WebviewWindow,
    workspace_id: String,
    oid: String,
) -> Result<GitUpdateResult, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::cherry_pick(repo, &oid, false),
    )
    .await
}

#[tauri::command]
pub async fn git_revert(
    window: WebviewWindow,
    workspace_id: String,
    oid: String,
) -> Result<GitUpdateResult, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::cherry_pick(repo, &oid, true),
    )
    .await
}

#[tauri::command]
pub async fn git_reset(
    window: WebviewWindow,
    workspace_id: String,
    target: String,
    mode: ResetMode,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::reset(repo, &target, mode),
    )
    .await
}

#[tauri::command]
pub async fn git_create_tag(
    window: WebviewWindow,
    workspace_id: String,
    name: String,
    target: String,
    message: String,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: false },
        move |repo| mutate::create_tag(repo, name.trim(), &target, &message),
    )
    .await
}

#[tauri::command]
pub async fn git_delete_tag(
    window: WebviewWindow,
    workspace_id: String,
    name: String,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: false },
        move |repo| mutate::delete_tag(repo, &name),
    )
    .await
}

#[tauri::command]
pub async fn git_conflicts(
    window: WebviewWindow,
    workspace_id: String,
) -> Result<GitConflicts, String> {
    with_repo(window, workspace_id, Kind::Read, ops::conflicts).await
}

#[tauri::command]
pub async fn git_resolve(
    window: WebviewWindow,
    workspace_id: String,
    path: String,
    resolution: GitResolution,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::resolve(repo, &path, &resolution),
    )
    .await
}

#[tauri::command]
pub async fn git_stash_list(
    window: WebviewWindow,
    workspace_id: String,
) -> Result<Vec<GitStash>, String> {
    with_repo(window, workspace_id, Kind::Read, ops::stashes).await
}

#[tauri::command]
pub async fn git_stash_push(
    window: WebviewWindow,
    workspace_id: String,
    message: String,
    include_untracked: bool,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::stash_push(repo, &message, include_untracked),
    )
    .await
}

#[tauri::command]
pub async fn git_stash_apply(
    window: WebviewWindow,
    workspace_id: String,
    index: u32,
    pop: bool,
) -> Result<GitUpdateResult, String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: true },
        move |repo| mutate::stash_apply(repo, index, pop),
    )
    .await
}

#[tauri::command]
pub async fn git_stash_drop(
    window: WebviewWindow,
    workspace_id: String,
    index: u32,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: false },
        move |repo| mutate::stash_drop(repo, index),
    )
    .await
}

#[tauri::command]
pub async fn git_remote_add(
    window: WebviewWindow,
    workspace_id: String,
    name: String,
    url: String,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: false },
        move |repo| mutate::remote_add(repo, name.trim(), url.trim()),
    )
    .await
}

#[tauri::command]
pub async fn git_remote_set_url(
    window: WebviewWindow,
    workspace_id: String,
    name: String,
    url: String,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: false },
        move |repo| mutate::remote_set_url(repo, &name, url.trim()),
    )
    .await
}

#[tauri::command]
pub async fn git_remote_remove(
    window: WebviewWindow,
    workspace_id: String,
    name: String,
) -> Result<(), String> {
    with_repo(
        window,
        workspace_id,
        Kind::Write { files: false },
        move |repo| mutate::remote_remove(repo, &name),
    )
    .await
}

/// Works outside a repository too, so a URL can be tested before `git remote add`.
#[tauri::command]
pub async fn git_remote_test(
    window: WebviewWindow,
    workspace_id: String,
    target: String,
    network: GitNetwork,
) -> Result<GitRemoteTest, String> {
    let workspace = workspace_root(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    blocking(move || {
        let host = app.state::<GitHost>();
        let exe = host.executable()?;
        let mut repo = match Repo::open(exe.clone(), &workspace) {
            Ok(repo) => repo,
            Err(error) if error.code == "not-repository" => remote::outside(exe, &workspace),
            Err(error) => return Err(error.into()),
        };
        let (flag, _running) = host.begin(&label, &workspace_id);
        repo.cancel = Some(flag);
        repo.progress = Some(progress_sink(
            app.clone(),
            label.clone(),
            workspace_id.clone(),
        ));
        repo.credentials = credentials_root(&app).ok();
        remote::remote_test(&repo, target.trim(), &network).map_err(String::from)
    })
    .await
}

#[tauri::command]
pub async fn git_set_identity(
    window: WebviewWindow,
    workspace_id: String,
    name: String,
    email: String,
    scope: IdentityScope,
) -> Result<(), String> {
    let workspace = workspace_root(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || {
        let exe = app.state::<GitHost>().executable()?;
        let repo = match Repo::open(exe.clone(), &workspace) {
            Ok(repo) => Some(repo),
            Err(error) if error.code == "not-repository" => None,
            Err(error) => return Err(error.into()),
        };
        mutate::set_identity(&exe, &workspace, repo.as_ref(), &name, &email, scope)?;
        let root = repo
            .map(|repo| repo.display_root())
            .unwrap_or_else(|| workspace.to_string_lossy().into_owned());
        notify(&app, &root, false);
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn git_detect_proxy(
    window: WebviewWindow,
    workspace_id: Option<String>,
) -> Result<GitProxyReport, String> {
    let workspace = match workspace_id.as_deref() {
        Some(id) => Some(workspace_root(&window, id)?),
        None => {
            require_settings(&window)?;
            None
        }
    };
    let app = window.app_handle().clone();
    blocking(move || {
        let exe = app.state::<GitHost>().executable().ok();
        let repo = match (&exe, &workspace) {
            (Some(exe), Some(workspace)) => Repo::open(exe.clone(), workspace).ok(),
            _ => None,
        };
        Ok(remote::detect_proxy(exe.as_ref(), repo.as_ref()))
    })
    .await
}

#[tauri::command]
pub async fn git_credentials_list(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Vec<GitCredential>, String> {
    require_settings(&window)?;
    blocking(move || Ok(credentials::list(&credentials_root(&app)?)?)).await
}

#[tauri::command]
pub async fn git_credentials_save(
    app: AppHandle,
    window: WebviewWindow,
    host: String,
    username: String,
    token: String,
) -> Result<(), String> {
    require_settings(&window)?;
    blocking(move || {
        Ok(credentials::save(
            &credentials_root(&app)?,
            &host,
            &username,
            &token,
        )?)
    })
    .await
}

#[tauri::command]
pub async fn git_credentials_remove(
    app: AppHandle,
    window: WebviewWindow,
    host: String,
) -> Result<(), String> {
    require_settings(&window)?;
    blocking(move || Ok(credentials::remove(&credentials_root(&app)?, &host)?)).await
}
