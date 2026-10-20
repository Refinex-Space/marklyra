//! App-owned updater: the isolated settings page never receives updater IPC or URLs.
use crate::preferences_store::{PreferenceRecord, Store};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_updater::{Error, Update, UpdaterExt};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Preferences {
    automatic: bool,
}
impl PreferenceRecord for Preferences {
    fn validate(&self) -> Result<(), String> {
        Ok(())
    }
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    current_version: String,
    automatic: bool,
    phase: String,
    version: Option<String>,
    downloaded: u64,
    total: Option<u64>,
    message: String,
}
#[derive(Default)]
struct Pending {
    snapshot: Snapshot,
    update: Option<Update>,
    bytes: Option<Vec<u8>>,
}
#[derive(Default)]
pub struct UpdateHost {
    busy: AtomicBool,
    install_requested: AtomicBool,
    installing: AtomicBool,
    pending: Mutex<Pending>,
}
struct Operation<'a>(&'a AtomicBool);
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
impl UpdateHost {
    fn begin(&self) -> Result<Operation<'_>, String> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Operation(&self.busy))
            .map_err(|_| "更新操作正在进行，请稍候。".into())
    }
}
fn store(app: &AppHandle) -> Result<Store<Preferences>, String> {
    Store::open(&crate::app_paths::data_dir(app)?.join("updates"))
}
fn require_host(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "preferences" || crate::windows::is_editor(window) {
        Ok(())
    } else {
        Err("更新仅供应用窗口使用。".into())
    }
}
fn change(app: &AppHandle, apply: impl FnOnce(&mut Pending)) {
    let host = app.state::<UpdateHost>();
    if let Ok(mut pending) = host.pending.lock() {
        apply(&mut pending);
        let _ = app.emit("app-update-changed", &pending.snapshot);
    };
}
fn configured(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|value| value.get("pubkey"))
        .and_then(|value| value.as_str())
        .is_some_and(|key| !key.trim().is_empty())
}
fn network_error(error: &Error) -> bool {
    matches!(error, Error::Reqwest(_) | Error::Network(_))
}
fn safe_download_url(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url
            .path()
            .starts_with("/Refinex-Space/marklyra/releases/download/v")
        && url.path().split('/').count() == 7
}
fn failure(error: &Error) -> &'static str {
    match error {
        Error::Minisign(_) | Error::Base64(_) | Error::SignatureUtf8(_) => {
            "更新包签名校验失败，已停止安装。"
        }
        Error::TargetNotFound(_) | Error::TargetsNotFound(_) => {
            "最新版本缺少当前系统架构的更新包。"
        }
        _ => "更新失败，请检查网络后重试；也可从 GitHub Release 手动下载安装。",
    }
}
#[tauri::command]
pub fn app_update_status(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, UpdateHost>,
) -> Result<Snapshot, String> {
    require_host(&window)?;
    let mut result = host
        .pending
        .lock()
        .map_err(|_| "更新状态不可用")?
        .snapshot
        .clone();
    result.current_version = app.package_info().version.to_string();
    result.automatic = store(&app)?.get()?.automatic;
    Ok(result)
}
#[tauri::command]
pub fn app_update_automatic(
    app: AppHandle,
    window: WebviewWindow,
    automatic: bool,
) -> Result<(), String> {
    crate::platform::ui_chrome::require_preferences_session(&window)?;
    store(&app)?.transaction(|value| {
        value.automatic = automatic;
        Ok(((), true))
    })?;
    change(&app, |pending| pending.snapshot.automatic = automatic);
    Ok(())
}
async fn check(app: &AppHandle) -> Result<(), String> {
    let host = app.state::<UpdateHost>();
    let _operation = host.begin()?;
    if host.install_requested.load(Ordering::Acquire) || host.installing.load(Ordering::Acquire) {
        return Err("正在准备安装更新。".into());
    }
    // A periodic check must never discard a verified download waiting for the user.
    if host
        .pending
        .lock()
        .map_err(|_| "更新状态不可用")?
        .bytes
        .is_some()
    {
        return Ok(());
    }
    if !configured(app) {
        return Err("当前开发构建未配置更新公钥，请使用正式发布包。".into());
    }
    change(app, |pending| {
        pending.update = None;
        pending.snapshot.phase = "checking".into();
        pending.snapshot.message.clear();
        pending.snapshot.version = None;
    });
    let builder = || {
        app.updater_builder()
            .timeout(Duration::from_secs(20))
            .configure_client(|client| client.connect_timeout(Duration::from_secs(10)))
    };
    let result = async {
        let first = builder().build()?.check().await;
        let update = match first {
            Err(ref error) if network_error(error) => builder().no_proxy().build()?.check().await?,
            result => result?,
        };
        Ok::<_, Error>(update)
    }
    .await;
    match result {
        Ok(update) => {
            if update
                .as_ref()
                .is_some_and(|update| !safe_download_url(&update.download_url))
            {
                change(app, |pending| {
                    pending.snapshot.phase = "error".into();
                    pending.snapshot.message = "更新包地址不属于 MarkLyra 官方仓库。".into();
                });
                return Err("更新包地址不属于 MarkLyra 官方仓库。".into());
            }
            change(app, |pending| {
                pending.snapshot.phase = if update.is_some() {
                    "available"
                } else {
                    "current"
                }
                .into();
                pending.snapshot.version = update.as_ref().map(|item| item.version.clone());
                pending.update = update;
            });
            Ok(())
        }
        Err(error) => {
            change(app, |pending| {
                pending.snapshot.phase = "error".into();
                pending.snapshot.message = failure(&error).into();
            });
            Err(failure(&error).into())
        }
    }
}
#[tauri::command]
pub async fn app_update_check(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    require_host(&window)?;
    check(&app).await
}
#[tauri::command]
pub async fn app_update_download(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, UpdateHost>,
) -> Result<(), String> {
    require_host(&window)?;
    let _operation = host.begin()?;
    let mut update = host
        .pending
        .lock()
        .map_err(|_| "更新状态不可用")?
        .update
        .clone()
        .ok_or("请先检查更新。")?;
    if host.install_requested.load(Ordering::Acquire) || host.installing.load(Ordering::Acquire) {
        return Err("正在安装更新。".into());
    }
    update.timeout = Some(Duration::from_secs(20 * 60));
    update.no_proxy = false;
    let mut result = None;
    for direct in [false, true] {
        update.no_proxy = direct;
        change(&app, |pending| {
            pending.snapshot.phase = "downloading".into();
            pending.snapshot.downloaded = 0;
            pending.snapshot.total = None;
            pending.snapshot.message.clear();
            pending.bytes = None;
        });
        let mut downloaded = 0;
        let mut last = Instant::now();
        let download = update
            .download(
                |chunk, total| {
                    downloaded += chunk as u64;
                    if last.elapsed() >= Duration::from_millis(200) || total == Some(downloaded) {
                        change(&app, |pending| {
                            pending.snapshot.downloaded = downloaded;
                            pending.snapshot.total = total;
                        });
                        last = Instant::now();
                    }
                },
                || {},
            )
            .await;
        let retry = !direct && download.as_ref().is_err_and(network_error);
        result = Some(download);
        if !retry {
            break;
        }
    }
    match result.expect("download attempted") {
        Ok(bytes) => {
            change(&app, |pending| {
                pending.bytes = Some(bytes);
                pending.snapshot.phase = "ready".into();
            });
            Ok(())
        }
        Err(error) => {
            change(&app, |pending| {
                pending.snapshot.phase = "error".into();
                pending.snapshot.message = failure(&error).into();
            });
            Err(failure(&error).into())
        }
    }
}
#[tauri::command]
pub fn app_update_install(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, UpdateHost>,
) -> Result<(), String> {
    require_host(&window)?;
    let _operation = host.begin()?;
    if host
        .pending
        .lock()
        .map_err(|_| "更新状态不可用")?
        .bytes
        .is_none()
    {
        return Err("请先下载并验证更新。".into());
    }
    host.install_requested.store(true, Ordering::Release);
    crate::windows::request_quit(&app); // Existing save/IME/recovery/quit cancellation protocol.
    Ok(())
}
pub(crate) fn cancel_install<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(host) = app.try_state::<UpdateHost>() {
        host.install_requested.store(false, Ordering::Release);
    }
}
/// Called only after every editor completed its existing close protocol.
pub(crate) fn intercept_exit(app: &AppHandle) -> bool {
    let host = app.state::<UpdateHost>();
    if host.installing.load(Ordering::Acquire) {
        return true;
    }
    if !host.install_requested.swap(false, Ordering::AcqRel) {
        return false;
    }
    host.installing.store(true, Ordering::Release);
    let staged = host
        .pending
        .lock()
        .ok()
        .and_then(|mut pending| Some((pending.update.take()?, pending.bytes.take()?)));
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = staged
            .ok_or_else(|| "已验证的更新包不可用。".to_owned())
            .and_then(|(update, bytes)| {
                update
                    .install(bytes)
                    .map_err(|error| failure(&error).into())
            });
        if result.is_ok() {
            app.state::<UpdateHost>()
                .installing
                .store(false, Ordering::Release);
            app.restart();
        } else {
            app.state::<UpdateHost>()
                .installing
                .store(false, Ordering::Release);
            crate::windows::cancel_finished_quit(&app);
            change(&app, |pending| {
                pending.snapshot.phase = "error".into();
                pending.snapshot.message =
                    "更新安装失败，请重新打开应用并重试；原文稿已按关闭流程处理。".into();
            });
            use tauri_plugin_dialog::DialogExt;
            app.dialog()
                .message("更新安装失败，请重新打开 MarkLyra 后重试，或手动下载安装包。")
                .title("MarkLyra 更新")
                .show(move |_| app.exit(0));
        }
    });
    true
}
pub fn start(app: &AppHandle) {
    change(app, |pending| {
        pending.snapshot.current_version = app.package_info().version.to_string();
        pending.snapshot.automatic = store(app)
            .and_then(|store| store.get())
            .is_ok_and(|value| value.automatic);
    });
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(30));
        let mut last: Option<Instant> = None;
        loop {
            let automatic = store(&app)
                .and_then(|store| store.get())
                .is_ok_and(|value| value.automatic);
            if !automatic {
                last = None;
            }
            if automatic
                && configured(&app)
                && last.is_none_or(|last| last.elapsed() >= Duration::from_secs(6 * 60 * 60))
            {
                let _ = tauri::async_runtime::block_on(check(&app));
                last = Some(Instant::now());
            }
            std::thread::sleep(Duration::from_secs(60));
        }
    });
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn official_downloads_only() {
        assert!(safe_download_url(&tauri::Url::parse("https://github.com/Refinex-Space/marklyra/releases/download/v0.2.0/MarkLyra.app.tar.gz").unwrap()));
        for url in [
            "http://github.com/Refinex-Space/marklyra/releases/download/v0.2.0/a",
            "https://github.com/other/marklyra/releases/download/v1/a",
            "https://github.com@evil.invalid/Refinex-Space/marklyra/releases/download/v1/a",
            "https://github.com/Refinex-Space/marklyra/releases/download/v1/a?token=x",
        ] {
            assert!(!safe_download_url(&tauri::Url::parse(url).unwrap()));
        }
    }
    #[test]
    fn operation_gate_releases_on_error_and_cancel_keeps_download() {
        let host = UpdateHost::default();
        let guard = host.begin().unwrap();
        assert!(host.begin().is_err());
        drop(guard);
        assert!(host.begin().is_ok());
        host.pending.lock().unwrap().bytes = Some(vec![1]);
        host.install_requested.store(true, Ordering::Release);
        let app = tauri::test::mock_builder()
            .manage(host)
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        cancel_install(app.handle());
        assert!(!app
            .state::<UpdateHost>()
            .install_requested
            .load(Ordering::Acquire));
        assert!(app
            .state::<UpdateHost>()
            .pending
            .lock()
            .unwrap()
            .bytes
            .is_some());
    }
    #[test]
    fn updater_dependency_keeps_system_proxy_and_socks_features() {
        let output = std::process::Command::new(env!("CARGO"))
            .current_dir(env!("CARGO_MANIFEST_DIR"))
            .args([
                "tree",
                "--locked",
                "--offline",
                "-p",
                "marklyra-desktop",
                "-e",
                "features",
                "--invert",
                "reqwest@0.13.5",
                "--prefix",
                "none",
            ])
            .output()
            .unwrap();
        assert!(output.status.success());
        let features = String::from_utf8(output.stdout).unwrap();
        assert!(features.contains("tauri-plugin-updater v2.10.1"));
        assert!(features.contains("reqwest feature \"system-proxy\""));
        assert!(features.contains("reqwest feature \"socks\""));
    }
    #[test]
    fn automatic_preference_survives_reopen() {
        let root = tempfile::tempdir().unwrap();
        let store = Store::<Preferences>::open(root.path()).unwrap();
        assert!(!store.get().unwrap().automatic);
        store
            .transaction(|value| {
                value.automatic = true;
                Ok(((), true))
            })
            .unwrap();
        assert!(
            Store::<Preferences>::open(root.path())
                .unwrap()
                .get()
                .unwrap()
                .automatic
        );
    }
}
