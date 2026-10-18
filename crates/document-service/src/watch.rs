//! Native filesystem events are hints only. They never read document content,
//! update saved baselines, or grant paths to the frontend.
use crate::{scoped::ScopedDocument, DocumentError, DocumentService};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{sync_channel, RecvTimeoutError},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use uuid::Uuid;

const MAX_WATCHES: usize = 32;
const MAX_DOCUMENT_WATCHES: usize = 4;
const DEBOUNCE: Duration = Duration::from_millis(200);
const MAX_DELAY: Duration = Duration::from_secs(1);
const TICK: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum WatchFailure {
    PathDrift,
    WatcherError,
    Capacity,
    Unavailable,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum DocumentWatch {
    Watching {
        #[serde(rename = "watchId")]
        watch_id: String,
    },
    Fallback {
        reason: WatchFailure,
        message: String,
    },
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentDiskChange {
    pub id: String,
    pub watch_id: String,
}

pub(crate) struct WatchRegistration {
    document: String,
    stop: Arc<AtomicBool>,
    status: Arc<Mutex<DocumentWatch>>,
    thread: Option<JoinHandle<()>>,
}
impl Drop for WatchRegistration {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
impl WatchRegistration {
    pub(crate) fn stop(&self) {
        self.stop.store(true, Ordering::Release);
    }
    fn start(
        document: String,
        watch_id: String,
        path: PathBuf,
        scope: ScopedDocument,
        callback: Arc<dyn Fn(DocumentDiskChange) + Send + Sync>,
    ) -> Result<Self, DocumentWatch> {
        let Some(parent) = path.parent().map(Path::to_owned) else {
            return Err(fallback(WatchFailure::Unavailable));
        };
        if !scope.matches_parent_path(&parent).unwrap_or(false) {
            return Err(fallback(WatchFailure::PathDrift));
        }
        let (sender, receiver) = sync_channel::<()>(1);
        let failed = Arc::new(AtomicBool::new(false));
        let error_flag = Arc::clone(&failed);
        let target = path.clone();
        let watched_parent = parent.clone();
        let mut watcher: RecommendedWatcher =
            notify::recommended_watcher(move |result: notify::Result<Event>| {
                let relevant = match result {
                    Ok(event) => event_relevant(&event, &target, &watched_parent),
                    Err(_) => {
                        error_flag.store(true, Ordering::Release);
                        true
                    }
                };
                if relevant {
                    let _ = sender.try_send(());
                }
            })
            .map_err(|_| fallback(WatchFailure::Unavailable))?;
        watcher
            .watch(&parent, RecursiveMode::NonRecursive)
            .map_err(|_| fallback(WatchFailure::Unavailable))?;
        if !scope.matches_parent_path(&parent).unwrap_or(false) {
            return Err(fallback(WatchFailure::PathDrift));
        }
        let stop = Arc::new(AtomicBool::new(false));
        let stopped = Arc::clone(&stop);
        let status = Arc::new(Mutex::new(DocumentWatch::Watching {
            watch_id: watch_id.clone(),
        }));
        let current = Arc::clone(&status);
        let hint = DocumentDiskChange {
            id: document.clone(),
            watch_id,
        };
        let worker = thread::Builder::new()
            .name("document-watch".to_owned())
            .spawn(move || {
                // Owning the watcher here guarantees it is stopped before join returns.
                let _watcher = watcher;
                let mut pending: Option<(Instant, Instant)> = None;
                let mut checked_parent = Instant::now();
                while !stopped.load(Ordering::Acquire) {
                    match receiver.recv_timeout(TICK) {
                        Ok(()) => {
                            let now = Instant::now();
                            pending = Some((pending.map_or(now, |entry| entry.0), now));
                        }
                        Err(RecvTimeoutError::Disconnected) => {
                            if !stopped.load(Ordering::Acquire) {
                                if let Ok(mut status) = current.lock() {
                                    *status = fallback(WatchFailure::WatcherError);
                                }
                                callback(hint.clone());
                            }
                            break;
                        }
                        Err(RecvTimeoutError::Timeout) => {}
                    }
                    if stopped.load(Ordering::Acquire) {
                        break;
                    }
                    let failure = if failed.load(Ordering::Acquire) {
                        Some(WatchFailure::WatcherError)
                    } else if checked_parent.elapsed() >= MAX_DELAY {
                        checked_parent = Instant::now();
                        (!scope.matches_parent_path(&parent).unwrap_or(false))
                            .then_some(WatchFailure::PathDrift)
                    } else {
                        None
                    };
                    if let Some(reason) = failure {
                        if let Ok(mut status) = current.lock() {
                            *status = fallback(reason);
                        }
                        callback(hint.clone());
                        break;
                    }
                    if pending.is_some_and(|(first, last)| {
                        first.elapsed() >= MAX_DELAY || last.elapsed() >= DEBOUNCE
                    }) {
                        // Recheck authority before forwarding even a content-free hint.
                        if !scope.matches_parent_path(&parent).unwrap_or(false) {
                            if let Ok(mut status) = current.lock() {
                                *status = fallback(WatchFailure::PathDrift);
                            }
                            callback(hint.clone());
                            break;
                        }
                        pending = None;
                        callback(hint.clone());
                    }
                }
            })
            .map_err(|_| fallback(WatchFailure::Unavailable))?;
        Ok(Self {
            document,
            stop,
            status,
            thread: Some(worker),
        })
    }
    fn active(&self) -> bool {
        self.status
            .lock()
            .is_ok_and(|status| matches!(*status, DocumentWatch::Watching { .. }))
    }
}
fn fallback(reason: WatchFailure) -> DocumentWatch {
    let message = match reason {
        WatchFailure::PathDrift => "文档父目录已移动或不可访问；将使用焦点恢复与定期内容检查",
        WatchFailure::WatcherError => "系统文件监听已停止；将使用焦点恢复与定期内容检查",
        WatchFailure::Capacity => "文件监听数量达到上限；将使用焦点恢复与定期内容检查",
        WatchFailure::Unavailable => "当前目录无法建立系统文件监听；将使用焦点恢复与定期内容检查",
    };
    DocumentWatch::Fallback {
        reason,
        message: message.to_owned(),
    }
}
fn event_relevant(event: &Event, target: &Path, parent: &Path) -> bool {
    !matches!(event.kind, EventKind::Access(_))
        && (event.paths.is_empty()
            || event
                .paths
                .iter()
                .any(|path| path == target || path == parent))
}
impl DocumentService {
    /// Separate leases deliberately coexist: out-of-order async start/cleanup
    /// cannot stop another mount's native subscription.
    pub fn start_document_watch(
        &mut self,
        id: &str,
        callback: Arc<dyn Fn(DocumentDiskChange) + Send + Sync>,
    ) -> Result<DocumentWatch, DocumentError> {
        self.retired_watchers.clear();
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        self.watchers.retain(|_, watcher| watcher.active());
        if self.watchers.len() >= MAX_WATCHES
            || self
                .watchers
                .values()
                .filter(|watcher| watcher.document == id)
                .count()
                >= MAX_DOCUMENT_WATCHES
        {
            return Ok(fallback(WatchFailure::Capacity));
        }
        let watch_id = Uuid::new_v4().to_string();
        match WatchRegistration::start(
            id.to_owned(),
            watch_id.clone(),
            document.path.clone(),
            document.scoped.clone(),
            callback,
        ) {
            Ok(watcher) => {
                self.watchers.insert(watch_id.clone(), watcher);
                Ok(DocumentWatch::Watching { watch_id })
            }
            Err(status) => Ok(status),
        }
    }
    pub fn stop_document_watch(&mut self, id: &str, watch_id: &str) -> bool {
        if self
            .watchers
            .get(watch_id)
            .is_some_and(|watcher| watcher.document == id)
        {
            self.watchers.remove(watch_id);
            true
        } else {
            false
        }
    }
    pub(crate) fn close_document_watches(&mut self, id: &str) {
        self.watchers.retain(|_, watcher| watcher.document != id);
    }
    /// Preallocated by rename preflight. Joining OS watchers is deliberately
    /// deferred until the next preflight/start/close, outside the move commit.
    pub(crate) fn retire_watches(&mut self, watches: Vec<String>) {
        for id in watches {
            if let Some(watcher) = self.watchers.remove(&id) {
                watcher.stop();
                self.retired_watchers.push(watcher);
            }
        }
    }
    pub(crate) fn watches_for(&self, document: &str) -> Vec<String> {
        self.watchers
            .iter()
            .filter(|(_, watcher)| watcher.document == document)
            .map(|(id, _)| id.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, ModifyKind};
    fn test_lease(service: &mut DocumentService, document: &str, lease: &str) {
        service.watchers.insert(
            lease.to_owned(),
            WatchRegistration {
                document: document.to_owned(),
                stop: Arc::new(AtomicBool::new(false)),
                status: Arc::new(Mutex::new(DocumentWatch::Watching {
                    watch_id: lease.to_owned(),
                })),
                thread: None,
            },
        );
    }
    fn open_test_document(
        service: &mut DocumentService,
        root: &Path,
        name: &str,
    ) -> crate::DocumentPayload {
        let path = root.join(name);
        std::fs::write(&path, "test").unwrap();
        service.open_authorized(&path).unwrap()
    }
    #[test]
    fn out_of_order_strictmode_leases_cannot_stop_another_subscription() {
        let dir = tempfile::tempdir().unwrap();
        let mut service = DocumentService::new();
        let document = open_test_document(&mut service, dir.path(), "note.md");
        for old_starts_late in [false, true] {
            if old_starts_late {
                test_lease(&mut service, &document.id, "new");
                test_lease(&mut service, &document.id, "old");
            } else {
                test_lease(&mut service, &document.id, "old");
                test_lease(&mut service, &document.id, "new");
            }
            assert!(service.stop_document_watch(&document.id, "old"));
            assert!(service.watchers.contains_key("new"));
            assert!(!service.stop_document_watch(&document.id, "old"));
            assert!(!service.stop_document_watch("other-document", "new"));
            assert!(service.stop_document_watch(&document.id, "new"));
        }
    }
    #[test]
    fn lease_capacity_and_close_are_bounded_and_late_start_cannot_reauthorize() {
        let dir = tempfile::tempdir().unwrap();
        let mut service = DocumentService::new();
        let document = open_test_document(&mut service, dir.path(), "note.md");
        let other = open_test_document(&mut service, dir.path(), "other.md");
        for index in 0..MAX_DOCUMENT_WATCHES {
            test_lease(&mut service, &document.id, &format!("lease-{index}"));
        }
        assert!(matches!(
            service
                .start_document_watch(&document.id, Arc::new(|_| {}))
                .unwrap(),
            DocumentWatch::Fallback {
                reason: WatchFailure::Capacity,
                ..
            }
        ));
        test_lease(&mut service, &other.id, "unrelated");
        service.close(&document.id);
        assert_eq!(service.watchers.len(), 1);
        assert!(service.watchers.contains_key("unrelated"));
        assert!(matches!(
            service.start_document_watch(&document.id, Arc::new(|_| {})),
            Err(DocumentError::UnknownDocument)
        ));
        for index in 1..MAX_WATCHES {
            test_lease(&mut service, "other", &format!("global-{index}"));
        }
        assert!(matches!(
            service
                .start_document_watch(&other.id, Arc::new(|_| {}))
                .unwrap(),
            DocumentWatch::Fallback {
                reason: WatchFailure::Capacity,
                ..
            }
        ));
    }
    #[test]
    fn native_event_filter_accepts_replacement_but_ignores_reads_and_other_files() {
        let parent = Path::new("/project");
        let target = parent.join("note.md");
        assert!(event_relevant(
            &Event::new(EventKind::Modify(ModifyKind::Name(
                notify::event::RenameMode::Both
            )))
            .add_path(parent.join("temp"))
            .add_path(target.clone()),
            &target,
            parent
        ));
        assert!(!event_relevant(
            &Event::new(EventKind::Access(AccessKind::Read)).add_path(target.clone()),
            &target,
            parent
        ));
        assert!(!event_relevant(
            &Event::new(EventKind::Any).add_path(parent.join("other.md")),
            &target,
            parent
        ));
        assert!(event_relevant(&Event::new(EventKind::Any), &target, parent));
    }
    #[test]
    fn same_parent_rename_revokes_all_old_watch_tickets_without_touching_other_documents() {
        let temp = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(temp.path()).unwrap();
        let mut service = DocumentService::new();
        let document = open_test_document(&mut service, &root, "A.md");
        let other = open_test_document(&mut service, &root, "Other.md");
        test_lease(&mut service, &document.id, "old-first");
        test_lease(&mut service, &document.id, "old-second");
        test_lease(&mut service, &other.id, "other-lease");
        let directory = Arc::new(
            cap_std::fs::Dir::open_ambient_dir(&root, cap_std::ambient_authority()).unwrap(),
        );
        let plan = service
            .prepare_rename(
                directory,
                Path::new("A.md"),
                Path::new("B.md"),
                &root.join("A.md"),
                &root.join("B.md"),
                crate::RenameKind::File,
            )
            .unwrap();
        std::fs::rename(root.join("A.md"), root.join("B.md")).unwrap();
        plan.commit();
        assert!(!service.stop_document_watch(&document.id, "old-first"));
        assert!(!service.stop_document_watch(&document.id, "old-second"));
        assert!(service.stop_document_watch(&other.id, "other-lease"));
        assert!(service.watchers.is_empty());
    }
    #[test]
    fn uncertain_move_revokes_old_watch_tickets_and_refuses_new_leases() {
        let temp = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(temp.path()).unwrap();
        let mut service = DocumentService::new();
        let document = open_test_document(&mut service, &root, "A.md");
        let other = open_test_document(&mut service, &root, "Other.md");
        test_lease(&mut service, &document.id, "old-lease");
        test_lease(&mut service, &other.id, "other-lease");
        let directory = Arc::new(
            cap_std::fs::Dir::open_ambient_dir(&root, cap_std::ambient_authority()).unwrap(),
        );
        let plan = service
            .prepare_rename(
                directory,
                Path::new("A.md"),
                Path::new("B.md"),
                &root.join("A.md"),
                &root.join("B.md"),
                crate::RenameKind::File,
            )
            .unwrap();
        std::fs::rename(root.join("A.md"), root.join("B.md")).unwrap();
        assert_eq!(plan.revoke(), vec![document.id.clone()]);
        assert!(!service.stop_document_watch(&document.id, "old-lease"));
        assert!(matches!(
            service.start_document_watch(&document.id, Arc::new(|_| {})),
            Err(DocumentError::RelocationUncertain)
        ));
        assert!(service.stop_document_watch(&other.id, "other-lease"));
    }
    #[test]
    fn rename_commit_does_not_join_a_stopped_os_watch_worker() {
        let temp = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(temp.path()).unwrap();
        let mut service = DocumentService::new();
        let document = open_test_document(&mut service, &root, "A.md");
        let (release, held) = std::sync::mpsc::channel();
        let stopped = Arc::new(AtomicBool::new(false));
        let worker = std::thread::spawn(move || held.recv().unwrap());
        service.watchers.insert(
            "held".to_owned(),
            WatchRegistration {
                document: document.id.clone(),
                stop: Arc::clone(&stopped),
                status: Arc::new(Mutex::new(DocumentWatch::Watching {
                    watch_id: "held".to_owned(),
                })),
                thread: Some(worker),
            },
        );
        let (committed, result) = std::sync::mpsc::channel();
        let coordinator = std::thread::spawn(move || {
            let directory = Arc::new(
                cap_std::fs::Dir::open_ambient_dir(&root, cap_std::ambient_authority()).unwrap(),
            );
            let plan = service
                .prepare_rename(
                    directory,
                    Path::new("A.md"),
                    Path::new("B.md"),
                    &root.join("A.md"),
                    &root.join("B.md"),
                    crate::RenameKind::File,
                )
                .unwrap();
            std::fs::rename(root.join("A.md"), root.join("B.md")).unwrap();
            plan.commit();
            committed.send(service).unwrap();
        });
        let received = result.recv_timeout(Duration::from_secs(3));
        // Always release the controlled worker, including the negative path, so
        // a regression produces a bounded failure instead of a hanging suite.
        release.send(()).unwrap();
        coordinator.join().unwrap();
        let mut service = received.expect("commit must not wait for watch thread destruction");
        assert!(stopped.load(Ordering::Acquire));
        assert!(!service.stop_document_watch(&document.id, "held"));
        assert_eq!(service.retired_watchers.len(), 1);
        service.close(&document.id);
        assert!(service.retired_watchers.is_empty());
    }
}
