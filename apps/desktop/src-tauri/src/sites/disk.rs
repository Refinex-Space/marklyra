//! Device-local fetch bookkeeping and recently opened sites. Neither file belongs in the
//! workspace: both change often and mean nothing on another machine.
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, io::Write, path::PathBuf};
use tauri::{AppHandle, Runtime};

const RECENT_LIMIT: usize = 50;
const STALE_DAYS: i64 = 30;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
struct FetchDb {
    #[serde(default)]
    entries: HashMap<String, FetchRec>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub(crate) struct FetchRec {
    #[serde(default)]
    pub etag: Option<String>,
    #[serde(default, rename = "lastModified")]
    pub last_modified: Option<String>,
    #[serde(rename = "fetchedAt")]
    pub fetched_at: String,
    #[serde(default)]
    pub failures: u32,
    #[serde(default, rename = "retryAfter")]
    pub retry_after: Option<String>,
    #[serde(default, rename = "finalUrl")]
    pub final_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct RecentDb {
    entries: Vec<RecentEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecentEntry {
    pub id: String,
    pub at: String,
}

pub(crate) fn workspace_dir<R: Runtime>(
    app: &AppHandle<R>,
    identity: &str,
) -> Result<PathBuf, String> {
    if identity.len() != 64 || !identity.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("工作区身份无效".into());
    }
    Ok(crate::app_paths::local_data_dir(app)?
        .join("sites")
        .join(identity))
}

pub(crate) fn engine_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(crate::app_paths::local_data_dir(app)?
        .join("sites")
        .join("engines"))
}

pub(crate) fn record(app: &AppHandle, identity: &str, url: &str) -> Option<FetchRec> {
    let mut db = load(app, identity).ok()?;
    db.entries.remove(url)
}

pub(crate) fn remember_success(
    app: &AppHandle,
    identity: &str,
    url: &str,
    etag: Option<String>,
    last_modified: Option<String>,
    final_url: String,
) {
    let Ok(path) = fetch_path(app, identity) else {
        return;
    };
    let _ = update_fetch(&path, |db| {
        db.entries.insert(
            url.to_owned(),
            FetchRec {
                etag,
                last_modified,
                fetched_at: stamp(Utc::now()),
                failures: 0,
                retry_after: None,
                final_url: Some(final_url),
            },
        );
    });
}

pub(crate) fn remember_failure(app: &AppHandle, identity: &str, url: &str) {
    let Ok(path) = fetch_path(app, identity) else {
        return;
    };
    let _ = update_fetch(&path, |db| fail(db, url));
}

fn fail(db: &mut FetchDb, url: &str) {
    let previous = db.entries.get(url).cloned();
    let failures = previous
        .as_ref()
        .map(|rec| rec.failures.saturating_add(1))
        .unwrap_or(1);
    let retry_after = backoff(failures).map(|delay| stamp(Utc::now() + delay));
    db.entries.insert(
        url.to_owned(),
        FetchRec {
            etag: previous.as_ref().and_then(|rec| rec.etag.clone()),
            last_modified: previous.as_ref().and_then(|rec| rec.last_modified.clone()),
            fetched_at: previous
                .as_ref()
                .map(|rec| rec.fetched_at.clone())
                .unwrap_or_else(|| stamp(Utc::now())),
            failures,
            retry_after,
            final_url: previous.and_then(|rec| rec.final_url),
        },
    );
}

/// Automatic refresh is due when the last success is older than 30 days and the failure
/// backoff has elapsed. After the third failure only a manual refetch tries again.
pub(crate) fn due(record: Option<&FetchRec>, force: bool, now: DateTime<Utc>) -> bool {
    if force {
        return true;
    }
    let Some(record) = record else {
        return true;
    };
    if record.failures >= 4 {
        return false;
    }
    if let Some(until) = record.retry_after.as_deref().and_then(parse_stamp) {
        if until > now {
            return false;
        }
    }
    parse_stamp(&record.fetched_at).is_none_or(|at| now - at > Duration::days(STALE_DAYS))
}

/// Drops what this device kept about deleted sites: fetch records for addresses no longer
/// saved, and the sites' places in the recently opened list.
pub(crate) fn forget(app: &AppHandle, identity: &str, ids: &[String], urls: &[String]) {
    if let Ok(dir) = workspace_dir(app, identity) {
        let _ = forget_in(&dir, ids, urls);
    }
}

fn forget_in(dir: &std::path::Path, ids: &[String], urls: &[String]) -> Result<(), String> {
    let fetch = dir.join("fetch.json");
    if fetch.is_file() && !urls.is_empty() {
        update_fetch(&fetch, |db| {
            for url in urls {
                db.entries.remove(url);
            }
        })?;
    }
    let recent = dir.join("recent.json");
    if recent.is_file() {
        let _guard = FILES.lock().map_err(|_| "站点缓存不可用")?;
        let mut db = read_json::<RecentDb>(&recent)?;
        let count = db.entries.len();
        db.entries.retain(|entry| !ids.contains(&entry.id));
        if db.entries.len() != count {
            write_json(&recent, &db)?;
        }
    }
    Ok(())
}

pub(crate) fn recent(app: &AppHandle, identity: &str) -> Vec<RecentEntry> {
    let Ok(dir) = workspace_dir(app, identity) else {
        return Vec::new();
    };
    read_json::<RecentDb>(&dir.join("recent.json"))
        .unwrap_or(RecentDb {
            entries: Vec::new(),
        })
        .entries
}

pub(crate) fn push_recent(
    app: &AppHandle,
    identity: &str,
    id: &str,
) -> Result<Vec<RecentEntry>, String> {
    if !site_store_id(id) {
        return Err("站点编号无效".into());
    }
    let path = workspace_dir(app, identity)?.join("recent.json");
    let _guard = FILES.lock().map_err(|_| "站点缓存不可用")?;
    let mut entries = read_json::<RecentDb>(&path)
        .unwrap_or(RecentDb {
            entries: Vec::new(),
        })
        .entries;
    entries.retain(|entry| entry.id != id);
    entries.insert(
        0,
        RecentEntry {
            id: id.to_owned(),
            at: stamp(Utc::now()),
        },
    );
    entries.truncate(RECENT_LIMIT);
    write_json(
        &path,
        &RecentDb {
            entries: entries.clone(),
        },
    )?;
    Ok(entries)
}

fn site_store_id(id: &str) -> bool {
    (6..=40).contains(&id.len())
        && id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn backoff(failures: u32) -> Option<Duration> {
    match failures {
        1 => Some(Duration::hours(1)),
        2 => Some(Duration::days(1)),
        3 => Some(Duration::days(7)),
        _ => None,
    }
}

fn stamp(time: DateTime<Utc>) -> String {
    time.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn parse_stamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|time| time.with_timezone(&Utc))
}

/// Every device-local file here is read, changed and written back. Four fetch workers and the
/// open command do that concurrently, so one lock serialises it; without it two results that
/// land together overwrite each other and a failure count or recent entry is lost.
static FILES: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn fetch_path(app: &AppHandle, identity: &str) -> Result<PathBuf, String> {
    Ok(workspace_dir(app, identity)?.join("fetch.json"))
}

fn load(app: &AppHandle, identity: &str) -> Result<FetchDb, String> {
    let path = fetch_path(app, identity)?;
    let _guard = FILES.lock().map_err(|_| "站点缓存不可用")?;
    read_fetch(&path)
}

fn read_fetch(path: &std::path::Path) -> Result<FetchDb, String> {
    if !path.is_file() {
        return Ok(FetchDb::default());
    }
    read_json(path)
}

fn update_fetch(path: &std::path::Path, change: impl FnOnce(&mut FetchDb)) -> Result<(), String> {
    let _guard = FILES.lock().map_err(|_| "站点缓存不可用")?;
    let mut db = read_fetch(path).unwrap_or_default();
    change(&mut db);
    write_json(path, &db)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &std::path::Path) -> Result<T, String> {
    let text = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&text).map_err(|error| error.to_string())
}

fn write_json(path: &std::path::Path, value: &impl Serialize) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let text = serde_json::to_string(value).map_err(|error| error.to_string())?;
    let temp = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&temp).map_err(|error| error.to_string())?;
        file.write_all(text.as_bytes())
            .map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
    }
    fs::rename(&temp, path).map_err(|error| {
        let _ = fs::remove_file(&temp);
        error.to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rec(failures: u32, fetched_at: &str, retry_after: Option<&str>) -> FetchRec {
        FetchRec {
            etag: None,
            last_modified: None,
            fetched_at: fetched_at.into(),
            failures,
            retry_after: retry_after.map(str::to_owned),
            final_url: None,
        }
    }

    #[test]
    fn concurrent_results_are_all_kept() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fetch.json");
        let threads: Vec<_> = (0..8)
            .map(|worker| {
                let path = path.clone();
                std::thread::spawn(move || {
                    for n in 0..25 {
                        update_fetch(&path, |db| fail(db, &format!("https://w{worker}.dev/{n}")))
                            .unwrap();
                    }
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
        assert_eq!(read_fetch(&path).unwrap().entries.len(), 200);
    }

    #[test]
    fn deleted_sites_leave_no_records_behind() {
        let dir = tempfile::tempdir().unwrap();
        let fetch = dir.path().join("fetch.json");
        for url in ["https://a.dev/", "https://b.dev/"] {
            update_fetch(&fetch, |db| fail(db, url)).unwrap();
        }
        write_json(
            &dir.path().join("recent.json"),
            &RecentDb {
                entries: ["site-one", "site-two"]
                    .map(|id| RecentEntry {
                        id: id.into(),
                        at: String::new(),
                    })
                    .to_vec(),
            },
        )
        .unwrap();
        forget_in(dir.path(), &["site-one".into()], &["https://a.dev/".into()]).unwrap();
        let left: Vec<String> = read_fetch(&fetch).unwrap().entries.into_keys().collect();
        assert_eq!(left, ["https://b.dev/"]);
        let recent: RecentDb = read_json(&dir.path().join("recent.json")).unwrap();
        assert_eq!(
            recent
                .entries
                .iter()
                .map(|e| e.id.as_str())
                .collect::<Vec<_>>(),
            ["site-two"]
        );
    }

    #[test]
    fn backoff_then_only_a_manual_refetch() {
        let now = parse_stamp("2026-11-16T12:00:00Z").unwrap();
        assert!(due(None, false, now));
        assert!(!due(
            Some(&rec(0, "2026-11-01T12:00:00Z", None)),
            false,
            now
        ));
        assert!(due(Some(&rec(0, "2026-10-01T12:00:00Z", None)), false, now));
        assert!(!due(
            Some(&rec(
                1,
                "2026-10-01T12:00:00Z",
                Some("2026-11-16T13:00:00Z")
            )),
            false,
            now
        ));
        assert!(due(
            Some(&rec(
                1,
                "2026-10-01T12:00:00Z",
                Some("2026-11-16T11:00:00Z")
            )),
            false,
            now
        ));
        assert!(!due(
            Some(&rec(4, "2026-01-01T00:00:00Z", None)),
            false,
            now
        ));
        assert!(due(Some(&rec(4, "2026-01-01T00:00:00Z", None)), true, now));
        assert_eq!(backoff(1), Some(Duration::hours(1)));
        assert_eq!(backoff(2), Some(Duration::days(1)));
        assert_eq!(backoff(3), Some(Duration::days(7)));
        assert_eq!(backoff(4), None);
    }
}
