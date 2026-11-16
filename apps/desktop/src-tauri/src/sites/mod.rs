//! Window-authorized access to the workspace site store. The renderer only names a workspace
//! id; the directory is the host-resolved `.marklyra/sites` below that authorized root.
mod disk;
mod fetch;

use crate::knowledge::{authorized, identity};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use site_store::{FetchPatch, Mutation, MutationResult, SiteStore, Snapshot};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{mpsc, Arc, Condvar, Mutex, Once},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

pub(crate) const CHANGED: &str = "marklyra:sites-changed";

struct Entry {
    store: Mutex<Option<SiteStore>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
}
pub(crate) struct SitesHost {
    entries: Mutex<HashMap<String, Arc<Entry>>>,
    queue: Queue,
}
impl Default for SitesHost {
    fn default() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            queue: Queue::default(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Changed {
    generation: u64,
}

fn entry(
    window: &WebviewWindow,
    workspace_id: &str,
) -> Result<(Arc<Entry>, Arc<file_index::Workspace>), String> {
    let workspace = authorized(window, workspace_id)?;
    let key = identity(&workspace)?;
    let host = window.state::<SitesHost>();
    let mut map = host.entries.lock().map_err(|_| "站点状态不可用")?;
    let entry = map
        .entry(key)
        .or_insert_with(|| {
            Arc::new(Entry {
                store: Mutex::new(None),
                watcher: Mutex::new(None),
            })
        })
        .clone();
    Ok((entry, workspace))
}

/// Opens (or with `create`, initializes) the store and starts watching it once.
fn ensure(
    app: &AppHandle,
    entry: &Arc<Entry>,
    workspace: &file_index::Workspace,
    create: bool,
) -> Result<(), String> {
    let mut store = entry.store.lock().map_err(|_| "站点状态不可用")?;
    if store.is_some() {
        return Ok(());
    }
    let Some(dir) = workspace
        .site_directory(create)
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    *store = Some(
        if create {
            SiteStore::initialize(dir)
        } else {
            SiteStore::open(dir)
        }
        .map_err(|e| e.to_string())?,
    );
    drop(store);
    let path = workspace
        .display_root_snapshot()
        .map_err(|e| e.to_string())?
        .join(".marklyra")
        .join("sites");
    let (send, receive) = mpsc::channel::<()>();
    let watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if event.is_ok_and(|e| {
            !e.paths.iter().all(|p| {
                p.file_name()
                    .is_some_and(|n| n.to_string_lossy().ends_with(".tmp"))
            })
        }) {
            let _ = send.send(());
        }
    })
    .and_then(|mut w| w.watch(&path, RecursiveMode::Recursive).map(|_| w));
    // Without a watcher the app still refreshes on focus and after its own writes.
    if let Ok(watcher) = watcher {
        *entry.watcher.lock().map_err(|_| "站点状态不可用")? = Some(watcher);
        let weak = Arc::downgrade(entry);
        let app = app.clone();
        std::thread::Builder::new()
            .name("marklyra-sites-watch".into())
            .spawn(move || {
                while receive.recv().is_ok() {
                    // Coalesce bursts (atomic renames emit several events).
                    while receive.recv_timeout(Duration::from_millis(180)).is_ok() {}
                    let Some(entry) = weak.upgrade() else { break };
                    let changed = entry.store.lock().ok().and_then(|mut s| {
                        s.as_mut()
                            .and_then(|s| s.refresh().ok().filter(|c| *c).map(|_| s.generation()))
                    });
                    if let Some(generation) = changed {
                        let _ = app.emit(CHANGED, Changed { generation });
                    }
                }
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> impl std::future::Future<Output = Result<T, String>> {
    let handle = tauri::async_runtime::spawn_blocking(task);
    async move { handle.await.map_err(|e| e.to_string())? }
}

/// Reading never creates `.marklyra/sites`: a folder without one yields an empty snapshot.
#[tauri::command]
pub(crate) async fn sites_snapshot(
    window: WebviewWindow,
    workspace_id: String,
) -> Result<Snapshot, String> {
    let (entry, workspace) = entry(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || {
        ensure(&app, &entry, &workspace, false)?;
        let mut store = entry.store.lock().map_err(|_| "站点状态不可用")?;
        Ok(match store.as_mut() {
            Some(store) => {
                store.refresh().map_err(|e| e.to_string())?;
                store.snapshot()
            }
            None => Snapshot::empty(),
        })
    })
    .await
}

#[tauri::command]
pub(crate) async fn sites_mutate(
    window: WebviewWindow,
    workspace_id: String,
    mutation: Mutation,
) -> Result<MutationResult, String> {
    let (entry, workspace) = entry(&window, &workspace_id)?;
    let key = identity(&workspace)?;
    let app = window.app_handle().clone();
    let removes = matches!(
        mutation,
        Mutation::RemoveItems { .. } | Mutation::RemoveGroup { .. }
    );
    blocking(move || {
        ensure(&app, &entry, &workspace, true)?;
        let (result, gone) = {
            let mut store = entry.store.lock().map_err(|_| "站点状态不可用")?;
            let store = store.as_mut().ok_or("站点目录不可用")?;
            let before = if removes {
                store.snapshot().items
            } else {
                Vec::new()
            };
            let result = store.apply(mutation).map_err(|e| e.to_string())?;
            (
                result,
                removes.then(|| departed(&before, &store.snapshot().items)),
            )
        };
        // A deleted site leaves nothing behind on this device either: its fetch record (when no
        // other site shares the address) and its place in 最近打开. Icons are pruned by the store.
        if let Some((ids, urls)) = gone {
            if !ids.is_empty() {
                disk::forget(&app, &key, &ids, &urls);
            }
        }
        let _ = app.emit(
            CHANGED,
            Changed {
                generation: result.generation,
            },
        );
        Ok(result)
    })
    .await
}

/// Sites in `before` that are gone from `after`, and the addresses no remaining site uses.
fn departed(before: &[site_store::Site], after: &[site_store::Site]) -> (Vec<String>, Vec<String>) {
    let kept: HashSet<&str> = after.iter().map(|site| site.id.as_str()).collect();
    let urls: HashSet<&str> = after.iter().map(|site| site.url.as_str()).collect();
    let gone: Vec<&site_store::Site> = before
        .iter()
        .filter(|site| !kept.contains(site.id.as_str()))
        .collect();
    let mut addresses: Vec<String> = gone
        .iter()
        .filter(|site| !urls.contains(site.url.as_str()))
        .map(|site| site.url.clone())
        .collect();
    addresses.dedup();
    (
        gone.into_iter().map(|site| site.id.clone()).collect(),
        addresses,
    )
}

const FETCHING: &str = "marklyra:sites-fetching";
const PREVIEW_TTL: Duration = Duration::from_secs(10 * 60);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Fetching {
    id: String,
    active: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PreviewDto {
    title: String,
    description: String,
    icon_data_url: Option<String>,
}

#[derive(Clone, Serialize)]
pub(crate) struct IconDto {
    mime: String,
    base64: String,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum IconSource {
    Auto,
    Letter,
    Upload { bytes: Vec<u8>, mime: String },
}

struct CachedPreview {
    at: Instant,
    outcome: fetch::Outcome,
}

struct Extra {
    identity: String,
    id: String,
}

struct Job {
    app: AppHandle,
    identity: String,
    id: String,
    url: String,
    host: String,
    third_party: fetch::ThirdParty,
    conditional: fetch::Conditional,
}

struct Slot {
    jobs: VecDeque<Job>,
    busy: HashSet<String>,
}

struct Queue {
    slot: Mutex<Slot>,
    wake: Condvar,
    inflight: Mutex<HashMap<String, Vec<Extra>>>,
    previews: Mutex<HashMap<String, CachedPreview>>,
    started: Once,
}
impl Default for Queue {
    fn default() -> Self {
        Self {
            slot: Mutex::new(Slot {
                jobs: VecDeque::new(),
                busy: HashSet::new(),
            }),
            wake: Condvar::new(),
            inflight: Mutex::new(HashMap::new()),
            previews: Mutex::new(HashMap::new()),
            started: Once::new(),
        }
    }
}

fn icon_dto(blob: &fetch::IconBlob) -> IconDto {
    use base64::Engine;
    IconDto {
        mime: blob.mime.to_owned(),
        base64: base64::engine::general_purpose::STANDARD.encode(&blob.bytes),
    }
}

fn data_url(blob: &fetch::IconBlob) -> String {
    let dto = icon_dto(blob);
    format!("data:{};base64,{}", dto.mime, dto.base64)
}

fn host_of(url: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_else(|| url.to_owned())
}

fn display_title(url: &str, title: Option<String>) -> String {
    title
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| host_of(url).trim_start_matches("www.").to_owned())
}

fn emit_fetch(app: &AppHandle, id: &str, active: bool) {
    let _ = app.emit(
        FETCHING,
        Fetching {
            id: id.to_owned(),
            active,
        },
    );
}

fn fresh_preview(app: &AppHandle, url: &str) -> Option<fetch::Outcome> {
    let host = app.state::<SitesHost>();
    let previews = host.queue.previews.lock().ok()?;
    let cached = previews.get(url)?;
    (cached.at.elapsed() < PREVIEW_TTL).then(|| cached.outcome.clone())
}

fn store_preview(app: &AppHandle, url: &str, outcome: fetch::Outcome) {
    if let Ok(mut previews) = app.state::<SitesHost>().queue.previews.lock() {
        previews.insert(
            url.to_owned(),
            CachedPreview {
                at: Instant::now(),
                outcome,
            },
        );
    }
}

fn ensure_workers(app: &AppHandle) {
    let host = app.state::<SitesHost>();
    host.queue.started.call_once(|| {
        for index in 0..4 {
            let app = app.clone();
            let _ = std::thread::Builder::new()
                .name(format!("marklyra-sites-fetch-{index}"))
                .spawn(move || worker(app));
        }
    });
}

fn worker(app: AppHandle) {
    loop {
        let job = {
            let host = app.state::<SitesHost>();
            let Ok(mut slot) = host.queue.slot.lock() else {
                break;
            };
            loop {
                if let Some(index) = slot
                    .jobs
                    .iter()
                    .position(|job| !slot.busy.contains(&job.host))
                {
                    let job = slot.jobs.remove(index).expect("index was just found");
                    slot.busy.insert(job.host.clone());
                    break job;
                }
                slot = match host.queue.wake.wait(slot) {
                    Ok(slot) => slot,
                    Err(_) => return,
                };
            }
        };
        let outcome = fetch::retrieve_any(&job.url, Some(&job.conditional), job.third_party);
        let host = app.state::<SitesHost>();
        if let Ok(mut slot) = host.queue.slot.lock() {
            slot.busy.remove(&job.host);
            host.queue.wake.notify_all();
        }
        settle(&job, outcome);
    }
}

fn enqueue(
    app: &AppHandle,
    identity: String,
    id: String,
    url: String,
    third_party: fetch::ThirdParty,
    conditional: fetch::Conditional,
) {
    ensure_workers(app);
    let host_name = host_of(&url);
    let attached = {
        let host = app.state::<SitesHost>();
        let Ok(mut inflight) = host.queue.inflight.lock() else {
            return;
        };
        if let Some(waiters) = inflight.get_mut(&url) {
            waiters.push(Extra {
                identity: identity.clone(),
                id: id.clone(),
            });
            true
        } else {
            inflight.insert(url.clone(), Vec::new());
            false
        }
    };
    emit_fetch(app, &id, true);
    if attached {
        return;
    }
    let host = app.state::<SitesHost>();
    {
        let Ok(mut slot) = host.queue.slot.lock() else {
            return;
        };
        slot.jobs.push_back(Job {
            app: app.clone(),
            identity,
            id,
            url,
            host: host_name,
            third_party,
            conditional,
        });
    }
    host.queue.wake.notify_one();
}

fn settle(job: &Job, outcome: Result<fetch::Outcome, fetch::FetchError>) {
    let extras = app_state_take(&job.app, &job.url);
    let targets = std::iter::once(Extra {
        identity: job.identity.clone(),
        id: job.id.clone(),
    })
    .chain(extras);
    match outcome {
        Ok(outcome) => {
            if !outcome.not_modified {
                store_preview(&job.app, &job.url, outcome.clone());
            }
            disk::remember_success(
                &job.app,
                &job.identity,
                &job.url,
                outcome.etag.clone(),
                outcome.last_modified.clone(),
                outcome.final_url.clone(),
            );
            for target in targets {
                emit_fetch(&job.app, &target.id, false);
                if outcome.not_modified {
                    continue;
                }
                if let Some(generation) =
                    apply_cached(&job.app, &target.identity, &target.id, &job.url, &outcome)
                {
                    let _ = job.app.emit(CHANGED, Changed { generation });
                }
            }
        }
        Err(_) => {
            disk::remember_failure(&job.app, &job.identity, &job.url);
            for target in targets {
                emit_fetch(&job.app, &target.id, false);
            }
        }
    }
}

fn app_state_take(app: &AppHandle, url: &str) -> Vec<Extra> {
    app.state::<SitesHost>()
        .queue
        .inflight
        .lock()
        .ok()
        .and_then(|mut inflight| inflight.remove(url))
        .unwrap_or_default()
}

fn apply_cached(
    app: &AppHandle,
    identity: &str,
    id: &str,
    url: &str,
    outcome: &fetch::Outcome,
) -> Option<u64> {
    let host = app.state::<SitesHost>();
    let entry = host.entries.lock().ok()?.get(identity)?.clone();
    let mut store = entry.store.lock().ok()?;
    let store = store.as_mut()?;
    let changed = write_outcome(store, id, url, outcome).ok()?;
    changed.then(|| store.generation())
}

fn write_outcome(
    store: &mut SiteStore,
    id: &str,
    url: &str,
    outcome: &fetch::Outcome,
) -> Result<bool, String> {
    let site = store
        .snapshot()
        .items
        .into_iter()
        .find(|site| site.id == id)
        .ok_or("找不到站点")?;
    if site.url != url {
        return Ok(false);
    }
    let mut patch = FetchPatch {
        title: outcome.title.clone(),
        description: outcome.description.clone(),
        icon: None,
    };
    if let Some(icon) = &outcome.icon {
        if !site.manual.iter().any(|field| field == "icon") {
            if let Some(stem) = fetch::icon_stem(url) {
                let path = store
                    .write_icon(&format!("{stem}.{}", icon.ext), &icon.bytes)
                    .map_err(|error| error.to_string())?;
                patch.icon = Some(Some(path));
            }
        }
    }
    store
        .apply_fetch(id, patch)
        .map_err(|error| error.to_string())
}

fn lookup(store: &mut SiteStore, id: &str) -> Result<site_store::Site, String> {
    store.refresh().map_err(|error| error.to_string())?;
    store
        .snapshot()
        .items
        .into_iter()
        .find(|site| site.id == id)
        .ok_or_else(|| "找不到站点".to_owned())
}

fn covered(site: &site_store::Site) -> bool {
    ["title", "description", "icon"]
        .iter()
        .all(|field| site.manual.iter().any(|manual| manual == field))
}

#[tauri::command]
pub(crate) async fn sites_preview(
    window: WebviewWindow,
    workspace_id: String,
    url: String,
    third_party: Option<String>,
    fresh: Option<bool>,
) -> Result<PreviewDto, String> {
    let _ = entry(&window, &workspace_id)?;
    let url = site_store::normalize_url(&url)?;
    let app = window.app_handle().clone();
    let third_party = fetch::ThirdParty::parse(third_party.as_deref());
    blocking(move || {
        if fresh != Some(true) {
            if let Some(outcome) = fresh_preview(&app, &url) {
                return Ok(preview_dto(&url, &outcome));
            }
        }
        let outcome = fetch::retrieve_any(&url, None, third_party)
            .map_err(|error| error.message().to_owned())?;
        store_preview(&app, &url, outcome.clone());
        Ok(preview_dto(&url, &outcome))
    })
    .await
}

fn preview_dto(url: &str, outcome: &fetch::Outcome) -> PreviewDto {
    PreviewDto {
        title: display_title(url, outcome.title.clone()),
        description: outcome.description.clone().unwrap_or_default(),
        icon_data_url: outcome.icon.as_ref().map(data_url),
    }
}

#[tauri::command]
pub(crate) async fn sites_enrich(
    window: WebviewWindow,
    workspace_id: String,
    id: String,
    third_party: Option<String>,
) -> Result<(), String> {
    let (entry, workspace) = entry(&window, &workspace_id)?;
    let key = identity(&workspace)?;
    let app = window.app_handle().clone();
    let third_party = fetch::ThirdParty::parse(third_party.as_deref());
    let site = blocking({
        let entry = entry.clone();
        let app = app.clone();
        move || {
            ensure(&app, &entry, &workspace, false)?;
            let mut store = entry.store.lock().map_err(|_| "站点状态不可用")?;
            let store = store.as_mut().ok_or("站点目录不可用")?;
            lookup(store, &id)
        }
    })
    .await?;
    if covered(&site) {
        return Ok(());
    }
    if let Some(outcome) = fresh_preview(&app, &site.url) {
        let id = site.id.clone();
        let url = site.url.clone();
        return blocking(move || {
            let mut store = entry.store.lock().map_err(|_| "站点状态不可用")?;
            let store = store.as_mut().ok_or("站点目录不可用")?;
            if let Some(changed) =
                write_outcome(store, &id, &url, &outcome)?.then(|| store.generation())
            {
                let _ = app.emit(
                    CHANGED,
                    Changed {
                        generation: changed,
                    },
                );
            }
            disk::remember_success(
                &app,
                &key,
                &url,
                outcome.etag,
                outcome.last_modified,
                outcome.final_url,
            );
            Ok(())
        })
        .await;
    }
    let record = disk::record(&app, &key, &site.url);
    enqueue(
        &app,
        key,
        site.id,
        site.url,
        third_party,
        fetch::Conditional {
            etag: record.as_ref().and_then(|record| record.etag.clone()),
            last_modified: record.and_then(|record| record.last_modified),
        },
    );
    Ok(())
}

#[tauri::command]
pub(crate) async fn sites_refetch(
    window: WebviewWindow,
    workspace_id: String,
    ids: Vec<String>,
    third_party: Option<String>,
    force: bool,
) -> Result<(), String> {
    let (entry, workspace) = entry(&window, &workspace_id)?;
    let key = identity(&workspace)?;
    let app = window.app_handle().clone();
    let third_party = fetch::ThirdParty::parse(third_party.as_deref());
    let limit = if force { 50 } else { 20 };
    let queued = blocking({
        let entry = entry;
        let app = app.clone();
        let key = key.clone();
        move || {
            ensure(&app, &entry, &workspace, false)?;
            let mut store = entry.store.lock().map_err(|_| "站点状态不可用")?;
            let store = store.as_mut().ok_or("站点目录不可用")?;
            store.refresh().map_err(|error| error.to_string())?;
            let mut chosen = Vec::new();
            let now = chrono::Utc::now();
            for id in ids {
                if chosen.len() >= limit {
                    break;
                }
                let Ok(site) = lookup(store, &id) else {
                    continue;
                };
                if covered(&site) {
                    continue;
                }
                let record = disk::record(&app, &key, &site.url);
                if !disk::due(record.as_ref(), force, now) {
                    continue;
                }
                chosen.push((
                    site.id,
                    site.url,
                    fetch::Conditional {
                        etag: record.as_ref().and_then(|record| record.etag.clone()),
                        last_modified: record.and_then(|record| record.last_modified),
                    },
                ));
            }
            Ok(chosen)
        }
    })
    .await?;
    for (id, url, conditional) in queued {
        enqueue(&app, key.clone(), id, url, third_party, conditional);
    }
    Ok(())
}

enum PreparedIcon {
    Auto,
    Letter,
    File(fetch::IconBlob),
}

#[tauri::command]
pub(crate) async fn sites_set_icon(
    window: WebviewWindow,
    workspace_id: String,
    id: String,
    revision: String,
    source: IconSource,
) -> Result<MutationResult, String> {
    let (entry, workspace) = entry(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    let prepared = match source {
        IconSource::Auto => PreparedIcon::Auto,
        IconSource::Letter => PreparedIcon::Letter,
        IconSource::Upload { bytes, mime } => {
            if bytes.len() > 1_500_000 {
                return Err("图片过大".into());
            }
            let blob =
                fetch::normalize_icon(&bytes, Some(mime.as_str())).ok_or("无法使用这张图片")?;
            PreparedIcon::File(blob)
        }
    };
    blocking(move || {
        ensure(&app, &entry, &workspace, true)?;
        let mut store = entry.store.lock().map_err(|_| "站点状态不可用")?;
        let store = store.as_mut().ok_or("站点目录不可用")?;
        let (icon, manual_icon) = match prepared {
            PreparedIcon::File(blob) => {
                use sha2::{Digest, Sha256};
                let digest = Sha256::digest(&blob.bytes);
                let stem: String = digest
                    .iter()
                    .take(8)
                    .map(|byte| format!("{byte:02x}"))
                    .collect();
                let path = store
                    .write_icon(&format!("{stem}.{}", blob.ext), &blob.bytes)
                    .map_err(|error| error.to_string())?;
                (Some(path), true)
            }
            PreparedIcon::Letter => (None, true),
            PreparedIcon::Auto => (None, false),
        };
        let result = store
            .assign_icon(&id, &revision, icon, manual_icon)
            .map_err(|error| error.to_string())?;
        if !result.applied.is_empty() {
            let _ = app.emit(
                CHANGED,
                Changed {
                    generation: result.generation,
                },
            );
        }
        Ok(result)
    })
    .await
}

#[tauri::command]
pub(crate) async fn sites_icon(
    window: WebviewWindow,
    workspace_id: String,
    name: String,
) -> Result<IconDto, String> {
    let (entry, workspace) = entry(&window, &workspace_id)?;
    let app = window.app_handle().clone();
    blocking(move || {
        ensure(&app, &entry, &workspace, false)?;
        let store = entry.store.lock().map_err(|_| "站点状态不可用")?;
        let store = store.as_ref().ok_or("站点目录不可用")?;
        let bytes = store.read_icon(&name).map_err(|error| error.to_string())?;
        let mime = if name.ends_with(".svg") {
            "image/svg+xml"
        } else {
            "image/png"
        };
        use base64::Engine;
        Ok(IconDto {
            mime: mime.to_owned(),
            base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        })
    })
    .await
}

#[tauri::command]
pub(crate) async fn sites_recent(
    window: WebviewWindow,
    workspace_id: String,
) -> Result<Vec<disk::RecentEntry>, String> {
    let (_, workspace) = entry(&window, &workspace_id)?;
    let key = identity(&workspace)?;
    Ok(disk::recent(window.app_handle(), &key))
}

#[tauri::command]
pub(crate) async fn sites_record_open(
    window: WebviewWindow,
    workspace_id: String,
    id: String,
) -> Result<Vec<disk::RecentEntry>, String> {
    let (_, workspace) = entry(&window, &workspace_id)?;
    let key = identity(&workspace)?;
    disk::push_recent(window.app_handle(), &key, &id)
}

#[tauri::command]
pub(crate) async fn sites_engine_icon(
    window: WebviewWindow,
    workspace_id: String,
    template: String,
) -> Result<IconDto, String> {
    let _ = entry(&window, &workspace_id)?;
    let origin = engine_origin(&template)?;
    let stem = fetch::icon_stem(&origin).ok_or("搜索地址无效")?;
    let app = window.app_handle().clone();
    blocking(move || {
        let dir = disk::engine_dir(&app)?;
        if let Some(blob) = read_engine(&dir, &stem) {
            return Ok(icon_dto(&blob));
        }
        let outcome = fetch::retrieve_any(&origin, None, fetch::ThirdParty::Off)
            .map_err(|error| error.message().to_owned())?;
        let blob = outcome.icon.ok_or("未能获取搜索引擎图标")?;
        std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        let path = dir.join(format!("{stem}.{}", blob.ext));
        let temp = dir.join(format!("{stem}.{}.tmp", blob.ext));
        std::fs::write(&temp, &blob.bytes).map_err(|error| error.to_string())?;
        std::fs::rename(&temp, &path).map_err(|error| error.to_string())?;
        Ok(icon_dto(&blob))
    })
    .await
}

fn engine_origin(template: &str) -> Result<String, String> {
    if template.matches("%s").count() != 1 {
        return Err("搜索地址需要包含一个 %s".into());
    }
    let mut url = url::Url::parse(template).map_err(|_| "搜索地址无效".to_owned())?;
    if url.scheme() != "https" {
        return Err("搜索地址必须是 https".into());
    }
    url.set_path("/");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

fn read_engine(dir: &std::path::Path, stem: &str) -> Option<fetch::IconBlob> {
    for (ext, mime) in [("png", "image/png"), ("svg", "image/svg+xml")] {
        let path = dir.join(format!("{stem}.{ext}"));
        let Ok(bytes) = std::fs::read(&path) else {
            continue;
        };
        if !bytes.is_empty() && bytes.len() <= 32 * 1024 {
            return Some(fetch::IconBlob { ext, mime, bytes });
        }
    }
    None
}
