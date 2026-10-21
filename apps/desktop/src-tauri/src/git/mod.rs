//! Native Git integration through the system `git` executable. The client contract lives in
//! `apps/desktop/src/services/git.ts`; every command is scoped to a workspace the calling
//! window is authorized for, and runs git with argument arrays only.
mod commands;
mod credentials;
mod error;
mod mutate;
mod network;
mod ops;
mod parse;
mod remote;
mod runner;
#[cfg(test)]
mod tests;
mod types;
mod validate;

pub use commands::*;

use error::GitError;
use runner::GitExe;
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, Arc, Mutex},
    time::{Duration, Instant},
};

const LOCK_WAIT: Duration = Duration::from_secs(30);

type Running = Arc<Mutex<HashMap<(String, String), Arc<AtomicBool>>>>;

/// App-wide Git state: the discovered executable, per-repository mutation locks and the
/// cancellation flags of running network operations.
#[derive(Default)]
pub struct GitHost {
    executable: Mutex<Option<GitExe>>,
    busy: Arc<Mutex<HashSet<PathBuf>>>,
    running: Running,
}

/// Held while a mutation runs in one repository.
pub(crate) struct RepoLock {
    busy: Arc<Mutex<HashSet<PathBuf>>>,
    key: PathBuf,
}
impl Drop for RepoLock {
    fn drop(&mut self) {
        if let Ok(mut busy) = self.busy.lock() {
            busy.remove(&self.key);
        }
    }
}

/// Registration of a running network operation; removed when dropped.
pub(crate) struct RunningGuard {
    running: Running,
    key: (String, String),
    flag: Arc<AtomicBool>,
}
impl Drop for RunningGuard {
    fn drop(&mut self) {
        if let Ok(mut running) = self.running.lock() {
            if running
                .get(&self.key)
                .is_some_and(|flag| Arc::ptr_eq(flag, &self.flag))
            {
                running.remove(&self.key);
            }
        }
    }
}

impl GitHost {
    /// The cached executable, discovered again when it disappeared or was never found.
    pub(crate) fn executable(&self) -> Result<GitExe, GitError> {
        let mut cached = self
            .executable
            .lock()
            .map_err(|_| GitError::new("failed", "Git 状态不可用"))?;
        if let Some(exe) = cached.as_ref().filter(|exe| exe.path.is_file()) {
            return Ok(exe.clone());
        }
        let exe = runner::discover()?;
        *cached = Some(exe.clone());
        Ok(exe)
    }

    /// Serialises mutations per repository, waiting up to 30 seconds for the previous one.
    pub(crate) fn lock(&self, root: &Path) -> Result<RepoLock, GitError> {
        let key = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
        let started = Instant::now();
        loop {
            {
                let mut busy = self
                    .busy
                    .lock()
                    .map_err(|_| GitError::new("failed", "Git 状态不可用"))?;
                if busy.insert(key.clone()) {
                    return Ok(RepoLock {
                        busy: self.busy.clone(),
                        key,
                    });
                }
            }
            if started.elapsed() >= LOCK_WAIT {
                return Err(GitError::new("busy", "另一个 Git 操作正在进行，请稍后再试"));
            }
            std::thread::sleep(Duration::from_millis(50));
        }
    }

    pub(crate) fn begin(&self, label: &str, workspace_id: &str) -> (Arc<AtomicBool>, RunningGuard) {
        let flag = Arc::new(AtomicBool::new(false));
        let key = (label.to_string(), workspace_id.to_string());
        if let Ok(mut running) = self.running.lock() {
            running.insert(key.clone(), flag.clone());
        }
        (
            flag.clone(),
            RunningGuard {
                running: self.running.clone(),
                key,
                flag,
            },
        )
    }

    pub(crate) fn cancel(&self, label: &str, workspace_id: &str) {
        if let Ok(running) = self.running.lock() {
            if let Some(flag) = running.get(&(label.to_string(), workspace_id.to_string())) {
                flag.store(true, std::sync::atomic::Ordering::Release);
            }
        }
    }
}
