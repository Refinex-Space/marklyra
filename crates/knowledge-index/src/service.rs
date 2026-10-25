use crate::{GraphQuery, GraphSnapshot, ReferencePage, Store};
use file_index::Workspace;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeSet, HashSet},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, RecvTimeoutError, SyncSender},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};

pub type EntryFilter = Arc<dyn Fn(&std::fs::File) -> bool + Send + Sync>;
pub type DocumentFilter = Arc<dyn Fn(&str) -> bool + Send + Sync>;
#[derive(Clone, Default, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub generation: u64,
    pub working: bool,
    pub complete: bool,
    pub scanned: usize,
    pub parsed: usize,
    pub unchanged: usize,
    pub unreadable: usize,
    pub skipped: usize,
    pub resolved: usize,
    pub elapsed_ms: u64,
    pub watcher: bool,
    pub error: Option<String>,
    pub sqlite_version: String,
}
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Scan {
    Metadata,
    Content,
    Rebuild,
}
enum Work {
    Changed(Vec<PathBuf>),
    Reconcile(Scan),
    Wake,
}
pub struct IndexService {
    pub database: PathBuf,
    root: PathBuf,
    status: Arc<Mutex<IndexStatus>>,
    cancel: Arc<AtomicBool>,
    active: Arc<AtomicBool>,
    rebuild: Arc<AtomicBool>,
    sender: SyncSender<Work>,
    thread: Mutex<Option<JoinHandle<()>>>,
}
impl IndexService {
    pub fn start(
        workspace: Arc<Workspace>,
        directory: PathBuf,
        include: EntryFilter,
        document: DocumentFilter,
    ) -> Result<Self, String> {
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let database = directory.join("index.sqlite");
        let root = workspace
            .display_root_snapshot()
            .map_err(|e| e.to_string())?;
        let status = Arc::new(Mutex::new(IndexStatus {
            working: true,
            ..Default::default()
        }));
        let cancel = Arc::new(AtomicBool::new(false));
        let active = Arc::new(AtomicBool::new(true));
        let overflow = Arc::new(AtomicBool::new(false));
        let rebuild = Arc::new(AtomicBool::new(false));
        let (tx, rx) = mpsc::sync_channel(64);
        let watch_sender = tx.clone();
        let watch_overflow = overflow.clone();
        let watch_root = root.clone();
        let mut watcher: Option<RecommendedWatcher> =
            notify::recommended_watcher(move |event: notify::Result<Event>| match event {
                Ok(mut event) => {
                    if matches!(event.kind, EventKind::Access(_)) {
                        return;
                    }
                    let rescan = event.need_rescan() || event.paths.is_empty();
                    event.paths.retain(|path| relevant_hint(&watch_root, path));
                    let lost = rescan
                        || (!event.paths.is_empty()
                            && watch_sender.try_send(Work::Changed(event.paths)).is_err());
                    if lost {
                        watch_overflow.store(true, Ordering::Release);
                    }
                }
                Err(_) => {
                    watch_overflow.store(true, Ordering::Release);
                    let _ = watch_sender.try_send(Work::Wake);
                }
            })
            .ok();
        if watcher
            .as_mut()
            .is_some_and(|w| w.watch(&root, RecursiveMode::Recursive).is_err())
        {
            watcher = None;
        }
        if let Ok(mut s) = status.lock() {
            s.watcher = watcher.is_some();
        }
        let thread_status = status.clone();
        let thread_cancel = cancel.clone();
        let thread_active = active.clone();
        let thread_rebuild = rebuild.clone();
        let db = database.clone();
        let root_path = root.clone();
        let worker = thread::Builder::new()
            .name("knowledge-index".into())
            .spawn(move || {
                let _watcher = watcher;
                let result = (|| -> Result<(), String> {
                    let mut store = match Store::open(&db) {
                        Ok(store) => store,
                        Err(error)
                            if error.contains("not a database") || error.contains("malformed") =>
                        {
                            let quarantine = db.with_file_name(format!(
                                "index-corrupt-{}.sqlite",
                                uuid::Uuid::new_v4()
                            ));
                            std::fs::rename(&db, &quarantine).map_err(|e| e.to_string())?;
                            for suffix in ["-wal", "-shm"] {
                                let from = PathBuf::from(format!("{}{suffix}", db.display()));
                                if from.exists() {
                                    std::fs::rename(
                                        from,
                                        PathBuf::from(format!("{}{suffix}", quarantine.display())),
                                    )
                                    .map_err(|e| e.to_string())?;
                                }
                            }
                            Store::open(&db)?
                        }
                        Err(error) => return Err(error),
                    };
                    store.set_root(&root_path)?;
                    if let Ok(mut s) = thread_status.lock() {
                        s.sqlite_version = store.sqlite_version()?;
                    }
                    let context = JobContext {
                        workspace: &workspace,
                        include: &include,
                        document: &document,
                        root: &root_path,
                        cancel: &thread_cancel,
                        active: &thread_active,
                        status: &thread_status,
                    };
                    let mut reconcile = Some(Scan::Metadata);
                    let mut pending = HashSet::<PathBuf>::new();
                    loop {
                        if thread_cancel.load(Ordering::Acquire) {
                            break;
                        }
                        if thread_active.load(Ordering::Acquire) {
                            if overflow.swap(false, Ordering::AcqRel) {
                                reconcile =
                                    Some(reconcile.unwrap_or(Scan::Metadata).max(Scan::Content));
                                pending.clear();
                            }
                            if thread_rebuild.swap(false, Ordering::AcqRel) {
                                reconcile = Some(Scan::Rebuild);
                            }
                            if let Some(mode) = reconcile.take() {
                                scan(&mut store, &context, mode)?;
                            }
                            if !pending.is_empty() {
                                let paths = std::mem::take(&mut pending);
                                update(&mut store, &context, paths)?;
                            }
                        }
                        // Native events do not poll the tree. The long timeout only recovers a dropped event batch.
                        match rx.recv_timeout(Duration::from_secs(30)) {
                            Ok(work) => {
                                collect(work, &mut pending, &mut reconcile);
                                let deadline = Instant::now() + Duration::from_millis(180);
                                while let Some(remaining) =
                                    deadline.checked_duration_since(Instant::now())
                                {
                                    match rx.recv_timeout(remaining) {
                                        Ok(work) => collect(work, &mut pending, &mut reconcile),
                                        Err(_) => break,
                                    }
                                    if thread_cancel.load(Ordering::Acquire) {
                                        break;
                                    }
                                }
                            }
                            Err(RecvTimeoutError::Disconnected) => break,
                            Err(RecvTimeoutError::Timeout) => {
                                if _watcher.is_none() {
                                    reconcile = Some(Scan::Metadata);
                                }
                            }
                        }
                        if pending.len() > 4096 {
                            pending.clear();
                            reconcile =
                                Some(reconcile.unwrap_or(Scan::Metadata).max(Scan::Content));
                        }
                    }
                    store.checkpoint()?;
                    Ok(())
                })();
                if let Ok(mut s) = thread_status.lock() {
                    s.working = false;
                    if let Err(error) = result {
                        s.error = Some(error);
                        s.complete = false;
                    }
                }
            })
            .map_err(|e| e.to_string())?;
        Ok(Self {
            database,
            root,
            status,
            cancel,
            active,
            rebuild,
            sender: tx,
            thread: Mutex::new(Some(worker)),
        })
    }
    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn status(&self) -> IndexStatus {
        self.status.lock().map(|s| s.clone()).unwrap_or_default()
    }
    pub fn active(&self, value: bool) {
        let was_active = self.active.swap(value, Ordering::AcqRel);
        if value && !was_active {
            self.reconcile(false);
        }
        let _ = self.sender.try_send(Work::Wake);
    }
    pub fn reconcile(&self, force: bool) {
        // An explicit rebuild cannot be lost when the bounded event queue is full.
        if force {
            self.rebuild.store(true, Ordering::Release);
            let _ = self.sender.try_send(Work::Wake);
        } else {
            let _ = self.sender.try_send(Work::Reconcile(Scan::Metadata));
        }
    }
    pub fn snapshot(&self, query: &GraphQuery) -> Result<GraphSnapshot, String> {
        crate::snapshot(&self.database, query)
    }
    pub fn references(
        &self,
        note: &str,
        incoming: bool,
        offset: usize,
    ) -> Result<ReferencePage, String> {
        crate::references(&self.database, note, incoming, offset)
    }
    pub fn shutdown(&self) {
        self.cancel.store(true, Ordering::Release);
        let _ = self.sender.try_send(Work::Wake);
        if let Ok(mut handle) = self.thread.lock() {
            if let Some(thread) = handle.take() {
                let _ = thread.join();
            }
        }
    }
}
impl Drop for IndexService {
    fn drop(&mut self) {
        self.cancel.store(true, Ordering::Release);
        let _ = self.sender.try_send(Work::Wake);
    }
}
fn relevant_hint(root: &Path, path: &Path) -> bool {
    path.strip_prefix(root).is_ok_and(|relative| {
        relative.components().all(|part| {
            part.as_os_str()
                .to_str()
                .is_some_and(|name| !name.starts_with('.') && name != "node_modules")
        })
    })
}
fn collect(work: Work, pending: &mut HashSet<PathBuf>, reconcile: &mut Option<Scan>) {
    match work {
        Work::Changed(paths) => pending.extend(paths),
        Work::Reconcile(mode) => *reconcile = Some(reconcile.unwrap_or(Scan::Metadata).max(mode)),
        Work::Wake => {}
    }
}
struct JobContext<'a> {
    workspace: &'a Workspace,
    include: &'a EntryFilter,
    document: &'a DocumentFilter,
    root: &'a Path,
    cancel: &'a AtomicBool,
    active: &'a AtomicBool,
    status: &'a Mutex<IndexStatus>,
}
fn scan(store: &mut Store, context: &JobContext<'_>, mode: Scan) -> Result<(), String> {
    let JobContext {
        workspace,
        include,
        document,
        cancel,
        active,
        status,
        ..
    } = *context;
    let start = Instant::now();
    if mode == Scan::Rebuild {
        store.invalidate()?;
    }
    let stamps = store.stamps()?;
    let previous = store.paths()?;
    let mut seen = BTreeSet::new();
    let mut affected = BTreeSet::new();
    let mut parsed = 0;
    let mut unchanged = 0;
    let mut unreadable = 0;
    let mut resolved = 0;
    let mut paused = false;
    let mut budget = Instant::now();
    let mut batch = 0;
    if let Ok(mut s) = status.lock() {
        s.working = true;
        s.complete = false;
        s.error = None;
        s.scanned = 0;
        s.parsed = 0;
        s.unchanged = 0;
        s.unreadable = 0;
    }
    store.begin_batch()?;
    let report = workspace.scan_knowledge(cancel, include.as_ref(), document.as_ref(), |file| {
        if !active.load(Ordering::Acquire) {
            paused = true;
            return Err("图谱索引已暂停".into());
        }
        let path = file.path.clone();
        let stamp = file.stamp.clone();
        seen.insert(path.clone());
        if mode == Scan::Metadata && stamps.get(&path) == Some(&stamp) {
            unchanged += 1;
        } else {
            match file
                .read()
                .map_err(|e| e.to_string())
                .and_then(|text| store.upsert(&path, &stamp, &text))
            {
                Ok(changed) => {
                    if changed.is_empty() {
                        unchanged += 1;
                    } else {
                        parsed += 1;
                    }
                    affected.extend(changed);
                }
                Err(error) => {
                    store.mark_error(&path, &error)?;
                    unreadable += 1;
                }
            }
        }
        batch += 1;
        if batch >= 128 {
            resolved += store.resolve_sources_with(&affected, &|requested, actual| {
                workspace.same_knowledge_file(requested, actual, include.as_ref())
            })?;
            affected.clear();
            store.commit_batch()?;
            store.begin_batch()?;
            batch = 0;
            if let Ok(mut s) = status.lock() {
                s.scanned = seen.len();
                s.parsed = parsed;
                s.unchanged = unchanged;
                s.unreadable = unreadable;
            }
        }
        if budget.elapsed() >= Duration::from_millis(8) {
            thread::sleep(Duration::from_millis(16));
            budget = Instant::now();
        }
        Ok(())
    });
    let complete = report.as_ref().is_ok_and(|r| r.complete);
    if complete {
        for path in previous.difference(&seen) {
            affected.extend(store.remove(path)?);
        }
    }
    resolved += store.resolve_sources_with(&affected, &|requested, actual| {
        workspace.same_knowledge_file(requested, actual, include.as_ref())
    })?;
    store.commit_batch()?;
    let mut s = status.lock().map_err(|_| "索引状态不可用")?;
    s.working = false;
    s.complete = complete && unreadable == 0;
    s.scanned = seen.len();
    s.parsed = parsed;
    s.unchanged = unchanged;
    s.unreadable = unreadable;
    s.resolved = resolved;
    s.elapsed_ms = start.elapsed().as_millis() as u64;
    s.generation = store.generation()?;
    match report {
        Ok(report) => {
            s.unreadable += report.unreadable;
            s.complete &= report.unreadable == 0;
            s.skipped = report.skipped;
        }
        Err(_) if paused || cancel.load(Ordering::Acquire) => {
            // Closing/hiding a view cancels this scan deliberately; keep the warm service.
            s.error = None;
        }
        Err(error) => s.error = Some(error.to_string()),
    };
    Ok(())
}
fn update(
    store: &mut Store,
    context: &JobContext<'_>,
    paths: HashSet<PathBuf>,
) -> Result<(), String> {
    let JobContext {
        workspace,
        include,
        document,
        root,
        cancel,
        active,
        status,
    } = *context;
    let start = Instant::now();
    let mut affected = BTreeSet::new();
    let mut parsed = 0;
    let mut unchanged = 0;
    let mut errors = 0;
    let mut needs_scan = false;
    if let Ok(mut s) = status.lock() {
        needs_scan = !s.complete;
        s.working = true;
    }
    store.begin_batch()?;
    for path in paths {
        if cancel.load(Ordering::Acquire) || !active.load(Ordering::Acquire) {
            needs_scan = true;
            break;
        }
        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        let Some(relative) = relative.to_str() else {
            continue;
        };
        let relative = relative.replace('\\', "/");
        if relative
            .split('/')
            .any(|part| part.starts_with('.') || part == "node_modules")
        {
            continue;
        }
        if relative.is_empty() || path.is_dir() {
            needs_scan = true;
            continue;
        }
        if !document(&relative) {
            needs_scan |= store.has_descendants(&relative)?;
            continue;
        }
        match workspace.knowledge_file(&relative, include.as_ref()) {
            Ok(file) => {
                let stamp = file.stamp.clone();
                match file
                    .read()
                    .map_err(|e| e.to_string())
                    .and_then(|text| store.upsert(&relative, &stamp, &text))
                {
                    Ok(changed) => {
                        if changed.is_empty() {
                            unchanged += 1;
                        } else {
                            parsed += 1;
                        }
                        affected.extend(changed);
                    }
                    Err(error) => {
                        store.mark_error(&relative, &error)?;
                        errors += 1;
                    }
                }
            }
            Err(file_index::IndexError::InvalidPath) => {
                affected.extend(store.remove(&relative)?);
            }
            Err(file_index::IndexError::Io(error))
                if error.kind() == std::io::ErrorKind::NotFound =>
            {
                affected.extend(store.remove(&relative)?);
                needs_scan = true;
            }
            Err(error) => {
                store.mark_error(&relative, &error.to_string())?;
                errors += 1;
            }
        }
    }
    let resolved = store.resolve_sources_with(&affected, &|requested, actual| {
        workspace.same_knowledge_file(requested, actual, include.as_ref())
    })?;
    store.commit_batch()?;
    if needs_scan {
        scan(store, context, Scan::Metadata)?;
    }
    let mut s = status.lock().map_err(|_| "索引状态不可用")?;
    s.working = false;
    s.parsed = parsed;
    s.unchanged = unchanged;
    s.resolved = resolved;
    s.unreadable += errors;
    s.complete &= errors == 0;
    s.elapsed_ms = start.elapsed().as_millis() as u64;
    s.generation = store.generation()?;
    Ok(())
}

#[cfg(all(test, unix))]
mod boundary_regressions {
    use super::*;
    #[test]
    fn recovery_scan_does_not_reparse_unchanged_files() {
        let notes = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let root = notes.path().canonicalize().unwrap();
        std::fs::write(root.join("a.md"), "[B](b.md)").unwrap();
        std::fs::write(root.join("b.md"), "# B").unwrap();
        let mut registry = file_index::WorkspaceRegistry::default();
        let selected = registry.select_authorized(&root).unwrap();
        let workspace = registry.get(&selected.id).unwrap();
        let mut store = Store::open(&data.path().join("index.sqlite")).unwrap();
        store.set_root(&root).unwrap();
        let include: EntryFilter = Arc::new(|_| true);
        let document: DocumentFilter = Arc::new(|name| name.ends_with(".md"));
        let cancel = AtomicBool::new(false);
        let active = AtomicBool::new(true);
        let status = Mutex::new(IndexStatus::default());
        let context = JobContext {
            workspace: &workspace,
            include: &include,
            document: &document,
            root: &root,
            cancel: &cancel,
            active: &active,
            status: &status,
        };
        scan(&mut store, &context, Scan::Metadata).unwrap();
        let generation = store.generation().unwrap();
        scan(&mut store, &context, Scan::Content).unwrap();
        assert_eq!(store.generation().unwrap(), generation);
        assert_eq!(status.lock().unwrap().parsed, 0);
        assert_eq!(status.lock().unwrap().unchanged, 2);
        scan(&mut store, &context, Scan::Rebuild).unwrap();
        assert!(store.generation().unwrap() > generation);
        assert_eq!(status.lock().unwrap().parsed, 2);
        active.store(false, Ordering::Release);
        scan(&mut store, &context, Scan::Metadata).unwrap();
        assert!(!status.lock().unwrap().complete);
        assert!(
            status.lock().unwrap().error.is_none(),
            "an expected pause is not an index failure"
        );
        active.store(true, Ordering::Release);
        scan(&mut store, &context, Scan::Metadata).unwrap();
        assert_eq!(status.lock().unwrap().parsed, 0);
        assert_eq!(status.lock().unwrap().unchanged, 2);
        assert!(!relevant_hint(&root, &root.join(".git/objects/test")));
        assert!(!relevant_hint(&root, &root.join("node_modules/note.md")));
        assert!(relevant_hint(&root, &root.join("new-folder")));
    }
    #[test]
    fn watcher_hints_cannot_add_hidden_or_symlink_documents() {
        let notes = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let root = notes.path().canonicalize().unwrap();
        std::fs::write(root.join("a.md"), "# A").unwrap();
        std::fs::write(outside.path().join("secret.md"), "# Outside").unwrap();
        let mut registry = file_index::WorkspaceRegistry::default();
        let selected = registry.select_authorized(&root).unwrap();
        let workspace = registry.get(&selected.id).unwrap();
        let mut store = Store::open(&data.path().join("index.sqlite")).unwrap();
        store.set_root(&root).unwrap();
        let changed = store.upsert("a.md", "1", "# A").unwrap();
        store.resolve_sources(&changed).unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret.md"), root.join("link.md")).unwrap();
        std::fs::create_dir(root.join(".hidden")).unwrap();
        std::fs::write(root.join(".hidden/hidden.md"), "# Hidden").unwrap();
        let include: EntryFilter = Arc::new(|_| true);
        let document: DocumentFilter = Arc::new(|name| name.ends_with(".md"));
        let cancel = AtomicBool::new(false);
        let active = AtomicBool::new(true);
        let status = Mutex::new(IndexStatus {
            complete: true,
            ..Default::default()
        });
        let context = JobContext {
            workspace: &workspace,
            include: &include,
            document: &document,
            root: &root,
            cancel: &cancel,
            active: &active,
            status: &status,
        };
        update(
            &mut store,
            &context,
            HashSet::from([root.join("link.md"), root.join(".hidden/hidden.md")]),
        )
        .unwrap();
        let graph =
            crate::snapshot(&data.path().join("index.sqlite"), &GraphQuery::default()).unwrap();
        assert_eq!(graph.total_notes, 1);
        assert!(graph
            .nodes
            .iter()
            .all(|n| n.path.as_deref() == Some("a.md")));
    }
}
