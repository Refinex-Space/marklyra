//! Main-window geometry only. Native capture stays on the event thread; the
//! bounded background writer performs filesystem work without any UI calls.
mod geometry;
mod restore;
mod storage;

use geometry::{Display, NormalGeometry, PhysicalArea, SavedState, SCHEMA};
use restore::{Action, Observation, PendingRestore};
use std::{
    io,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use storage::Store;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, PhysicalPosition, Window, WindowEvent,
};

const SAVE_INTERVAL: Duration = Duration::from_millis(600);
const RESTORE_TIMEOUT: Duration = Duration::from_secs(2);
const RESTORE_POLL: Duration = Duration::from_millis(40);

struct RestoreJob {
    state: PendingRestore,
    deadline: Instant,
    cancelled: Arc<AtomicBool>,
    armed: bool,
}

#[derive(Clone)]
struct Snapshot {
    revision: u64,
    state: SavedState,
}
struct Queue {
    latest: Option<SavedState>,
    revision: u64,
    pending: bool,
    worker: bool,
    restoring: bool,
    closed: bool,
    restore: Option<RestoreJob>,
}
impl Queue {
    fn update(&mut self, state: SavedState) -> bool {
        if self.restoring || self.closed || !state.valid() || self.latest.as_ref() == Some(&state) {
            return false;
        }
        self.latest = Some(state);
        self.revision = self.revision.saturating_add(1);
        self.pending = true;
        if self.worker {
            false
        } else {
            self.worker = true;
            true
        }
    }
    fn finish_restore(
        &mut self,
        attempted: bool,
        succeeded: bool,
        actual: Option<NormalGeometry>,
        maximized: bool,
    ) {
        if let Some(job) = self.restore.take() {
            job.cancelled.store(true, Ordering::Release);
        }
        if attempted {
            self.revision = self.revision.saturating_add(1);
            // Requested coordinates are not evidence that native setters worked.
            // With no stable observed normal bounds, keep disk evidence untouched
            // until a later normal-window event supplies actual geometry.
            self.latest = actual.map(|normal| SavedState {
                schema: SCHEMA,
                normal,
                maximized: succeeded && maximized,
            });
        }
        self.restoring = false;
        self.pending = attempted && self.latest.is_some();
    }
    fn snapshot(&mut self, pending_only: bool) -> Option<Snapshot> {
        if pending_only && !self.pending {
            return None;
        }
        self.pending = false;
        self.latest.clone().map(|state| Snapshot {
            revision: self.revision,
            state,
        })
    }
}
struct WriteGate {
    last_written: Option<u64>,
    writable: bool,
}
struct Shared {
    queue: Mutex<Queue>,
    writer: Mutex<WriteGate>,
    store: Store,
    last_error: Mutex<Option<String>>,
}
#[derive(Clone)]
struct WindowStateHost(Arc<Shared>);
impl WindowStateHost {
    fn new(store: Store, initial: Option<SavedState>, writable: bool) -> Self {
        Self(Arc::new(Shared {
            queue: Mutex::new(Queue {
                latest: initial,
                revision: 0,
                pending: false,
                worker: false,
                restoring: true,
                closed: false,
                restore: None,
            }),
            writer: Mutex::new(WriteGate {
                last_written: None,
                writable,
            }),
            store,
            last_error: Mutex::new(None),
        }))
    }
    fn report(&self, result: &io::Result<()>) {
        let Ok(mut previous) = self.0.last_error.lock() else {
            return;
        };
        match result {
            Ok(()) => *previous = None,
            Err(error) => {
                let message = error.to_string();
                if previous.as_ref() != Some(&message) {
                    eprintln!("Window preferences were not saved: {message}");
                    *previous = Some(message);
                }
            }
        }
    }
    fn persist(&self, snapshot: Snapshot) -> io::Result<()> {
        // This gate never calls Tauri or locks Queue. A close/exit flush can wait
        // for an in-flight disk write without waiting on the UI thread itself.
        let mut writer = self
            .0
            .writer
            .lock()
            .map_err(|_| io::Error::other("Window preference writer unavailable"))?;
        if !writer.writable {
            return Err(io::Error::other(
                "Window preference evidence is unreadable; writes disabled for this session",
            ));
        }
        if writer
            .last_written
            .is_some_and(|revision| revision >= snapshot.revision)
        {
            return Ok(());
        }
        self.0.store.write(&snapshot.state)?;
        writer.last_written = Some(snapshot.revision);
        Ok(())
    }
    fn submit(&self, observation: Observation) {
        let start = {
            let Ok(mut queue) = self.0.queue.lock() else {
                return;
            };
            let next = match observation {
                Observation::Normal(normal) => Some(SavedState {
                    schema: SCHEMA,
                    normal,
                    maximized: false,
                }),
                Observation::Maximized => queue.latest.clone().map(|mut state| {
                    state.maximized = true;
                    state
                }),
                Observation::Ignore => None,
            };
            next.is_some_and(|state| queue.update(state))
        };
        self.start_writer(start);
    }
    fn start_writer(&self, start: bool) {
        if !start {
            return;
        }
        let host = self.clone();
        if let Err(error) = thread::Builder::new()
            .name("window-preferences".into())
            .spawn(move || loop {
                thread::sleep(SAVE_INTERVAL);
                let snapshot = {
                    let Ok(mut queue) = host.0.queue.lock() else {
                        return;
                    };
                    if queue.closed || !queue.pending {
                        queue.worker = false;
                        return;
                    }
                    queue.snapshot(true)
                };
                if let Some(snapshot) = snapshot {
                    host.report(&host.persist(snapshot));
                }
                let Ok(mut queue) = host.0.queue.lock() else {
                    return;
                };
                if queue.closed || !queue.pending {
                    queue.worker = false;
                    return;
                }
            })
        {
            if let Ok(mut queue) = self.0.queue.lock() {
                queue.worker = false;
            }
            self.report(&Err(error));
        }
    }
    fn flush(&self) -> io::Result<()> {
        let snapshot = self
            .0
            .queue
            .lock()
            .map_err(|_| io::Error::other("Window preference queue unavailable"))?
            .snapshot(false);
        if let Some(snapshot) = snapshot {
            // A different application instance may briefly hold the independent
            // OS lock. Bounded retry; errors are reported, never called success.
            for attempt in 0..10 {
                match self.persist(snapshot.clone()) {
                    Err(error) if error.kind() == io::ErrorKind::WouldBlock && attempt < 9 => {
                        thread::sleep(Duration::from_millis(10))
                    }
                    result => return result,
                }
            }
        } else {
            // Even without usable geometry, exit must wait for any older IO
            // already holding the gate; it must not abandon an active write.
            drop(
                self.0
                    .writer
                    .lock()
                    .map_err(|_| io::Error::other("Window preference writer unavailable"))?,
            );
        }
        Ok(())
    }
    fn schedule_pending(&self) {
        let start = if let Ok(mut queue) = self.0.queue.lock() {
            if queue.pending && !queue.worker && !queue.closed && !queue.restoring {
                queue.worker = true;
                true
            } else {
                false
            }
        } else {
            false
        };
        self.start_writer(start);
    }
    fn capture(&self, window: &Window) {
        let restoring = {
            let Ok(queue) = self.0.queue.lock() else {
                return;
            };
            if queue.closed {
                return;
            }
            queue.restoring
        };
        if restoring {
            self.advance_restore(window);
            return;
        }
        match observe(window) {
            Ok(observation) => self.submit(observation),
            Err(error) => eprintln!("Window geometry capture skipped: {error}"),
        }
    }
    fn advance_restore(&self, window: &Window) {
        let expired = {
            let Ok(queue) = self.0.queue.lock() else {
                return;
            };
            let Some(job) = queue.restore.as_ref() else {
                return;
            };
            if queue.closed || !job.armed || job.cancelled.load(Ordering::Acquire) {
                return;
            }
            Instant::now() >= job.deadline
        };
        let observed = observe(window).unwrap_or(Observation::Ignore);
        let action = {
            let Ok(mut queue) = self.0.queue.lock() else {
                return;
            };
            let Some(job) = queue.restore.as_mut() else {
                return;
            };
            let action = job.state.advance(observed, expired);
            let actual = job.state.last_actual.clone();
            if actual.is_some() {
                queue.latest = actual;
            }
            if let Action::Finish(actual) = &action {
                queue.finish_restore(
                    true,
                    true,
                    actual.as_ref().map(|state| state.normal.clone()),
                    actual.as_ref().is_some_and(|state| state.maximized),
                );
            }
            action
        };
        match action {
            Action::Wait => {}
            Action::Finish(_) => self.schedule_pending(),
            Action::Maximize => {
                // Only the current, unexpired main-thread job can issue this.
                // Closing removes it before any queued polling callback runs.
                let active = self.0.queue.lock().is_ok_and(|queue| {
                    queue.restore.as_ref().is_some_and(|job| {
                        !queue.closed
                            && !job.cancelled.load(Ordering::Acquire)
                            && Instant::now() < job.deadline
                    })
                });
                if active {
                    if let Err(error) = window.maximize() {
                        eprintln!("Window maximize restoration failed: {error}");
                        self.cancel_restore(Some(window));
                        self.schedule_pending();
                    }
                }
            }
        }
    }
    fn cancel_restore(&self, window: Option<&Window>) {
        if !self
            .0
            .queue
            .lock()
            .is_ok_and(|queue| queue.restore.is_some())
        {
            return;
        }
        let observed = window.and_then(|window| observe(window).ok());
        let Ok(mut queue) = self.0.queue.lock() else {
            return;
        };
        let Some(job) = queue.restore.as_ref() else {
            return;
        };
        let actual = job.state.cancel(observed);
        queue.finish_restore(
            true,
            true,
            actual.as_ref().map(|state| state.normal.clone()),
            actual.as_ref().is_some_and(|state| state.maximized),
        );
    }
    fn watch_restore(&self, window: Window) -> io::Result<()> {
        let (cancelled, deadline) = {
            let mut queue = self
                .0
                .queue
                .lock()
                .map_err(|_| io::Error::other("Window restore queue unavailable"))?;
            let Some(job) = queue.restore.as_mut() else {
                return Ok(());
            };
            job.armed = true;
            (job.cancelled.clone(), job.deadline)
        };
        let queued = Arc::new(AtomicBool::new(false));
        let host = self.clone();
        thread::Builder::new()
            .name("window-restore-check".into())
            .spawn(move || {
                while !cancelled.load(Ordering::Acquire) {
                    let expired = Instant::now() >= deadline;
                    if !queued.swap(true, Ordering::AcqRel) {
                        let ui_window = window.clone();
                        let ui_host = host.clone();
                        let ui_cancelled = cancelled.clone();
                        let ui_queued = queued.clone();
                        if window
                            .run_on_main_thread(move || {
                                ui_queued.store(false, Ordering::Release);
                                if !ui_cancelled.load(Ordering::Acquire) {
                                    ui_host.advance_restore(&ui_window);
                                }
                            })
                            .is_err()
                        {
                            host.cancel_restore(None);
                            break;
                        }
                    }
                    // A queued callback checks the actual deadline when delivered;
                    // UI stalls cannot accumulate callbacks or cause a late maximize.
                    if expired {
                        break;
                    }
                    thread::sleep(RESTORE_POLL);
                }
            })?;
        Ok(())
    }
}

fn display(monitor: &tauri::Monitor) -> Display {
    let work = monitor.work_area();
    Display {
        name: monitor.name().cloned(),
        scale: monitor.scale_factor(),
        work: PhysicalArea {
            x: work.position.x,
            y: work.position.y,
            width: work.size.width,
            height: work.size.height,
        },
    }
}
fn observe(window: &Window) -> tauri::Result<Observation> {
    if window.label() != "main" || window.is_minimized()? || window.is_fullscreen()? {
        return Ok(Observation::Ignore);
    }
    if window.is_maximized()? {
        return Ok(Observation::Maximized);
    }
    let scale = window.scale_factor()?;
    let position = window.outer_position()?;
    let size = window.inner_size()?;
    let monitor = window.current_monitor()?;
    // Do not replace normal bounds with a DPI/maximize transition sample.
    if window.is_minimized()?
        || window.is_fullscreen()?
        || (window.scale_factor()? - scale).abs() > 0.000_001
    {
        return Ok(Observation::Ignore);
    }
    if window.is_maximized()? {
        return Ok(Observation::Maximized);
    }
    Ok(monitor
        .and_then(|monitor| {
            geometry::capture(
                (position.x, position.y),
                (size.width, size.height),
                scale,
                display(&monitor),
            )
        })
        .map_or(Observation::Ignore, Observation::Normal))
}
fn decorations(window: &Window) -> tauri::Result<(f64, f64)> {
    let scale = window.scale_factor()?;
    let outer = window.outer_size()?;
    let inner = window.inner_size()?;
    Ok((
        f64::from(outer.width.saturating_sub(inner.width)) / scale,
        f64::from(outer.height.saturating_sub(inner.height)) / scale,
    ))
}

/// Call once from Tauri setup after its configured main window exists.
/// A preference failure never prevents the editor from opening normally.
pub fn setup(app: &AppHandle) -> Result<(), String> {
    let main = app
        .get_webview_window("main")
        .ok_or("Main window is unavailable")?;
    let window = main.as_ref().window();
    let path = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("window-state-v1");
    let store = Store::open(&path).map_err(|error| error.to_string())?;
    let (saved, writable) = match store.read() {
        Ok(saved) => (saved, true),
        Err(error) => {
            eprintln!("Window preferences ignored and preserved: {error}");
            (None, false)
        }
    };
    let monitors: Vec<_> = window
        .available_monitors()
        .map_err(|error| error.to_string())?
        .iter()
        .map(display)
        .collect();
    let primary = window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .as_ref()
        .map(display);
    let plan = saved.as_ref().and_then(|saved| {
        geometry::restore(
            saved,
            &monitors,
            primary.as_ref(),
            decorations(&window).unwrap_or((0.0, 32.0)),
        )
    });
    let current = match observe(&window).map_err(|error| error.to_string())? {
        Observation::Normal(normal) => Some(SavedState {
            schema: SCHEMA,
            normal,
            maximized: false,
        }),
        _ => None,
    };
    let host = WindowStateHost::new(store, current.clone(), writable);
    if !app.manage(host.clone()) {
        return Err("Window preference host is already initialized".into());
    }
    let Some(plan) = plan else {
        if let Ok(mut queue) = host.0.queue.lock() {
            queue.restoring = false;
        }
        return Ok(());
    };
    if let Ok(mut queue) = host.0.queue.lock() {
        queue.restore = Some(RestoreJob {
            state: PendingRestore::new(plan.state.clone(), current),
            deadline: Instant::now() + RESTORE_TIMEOUT,
            cancelled: Arc::new(AtomicBool::new(false)),
            armed: false,
        });
    }
    let set_position = || match geometry::position_command(&plan, cfg!(target_os = "macos")) {
        geometry::PositionCommand::Logical(x, y) => window.set_position(LogicalPosition::new(x, y)),
        geometry::PositionCommand::Physical(x, y) => {
            window.set_position(PhysicalPosition::new(x, y))
        }
    };
    let requested = (|| -> tauri::Result<()> {
        if window.is_maximized()? {
            window.unmaximize()?;
        }
        set_position()?;
        window.set_size(LogicalSize::new(
            plan.state.normal.width,
            plan.state.normal.height,
        ))?;
        // AppKit resizing can shift its frame origin; queue the target top-left
        // last. All requests precede arming the confirmation state machine.
        set_position()?;
        Ok(())
    })();
    if let Err(error) = requested {
        host.cancel_restore(Some(&window));
        host.schedule_pending();
        return Err(error.to_string());
    }
    if let Err(error) = host.watch_restore(window.clone()) {
        host.cancel_restore(Some(&window));
        host.schedule_pending();
        return Err(error.to_string());
    }
    Ok(())
}

/// Compose this with the existing export window handler; ignore all previews.
pub fn handle_window(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    let Some(host) = window.try_state::<WindowStateHost>() else {
        return;
    };
    match event {
        WindowEvent::Moved(_)
        | WindowEvent::Resized(_)
        | WindowEvent::ScaleFactorChanged { .. }
        | WindowEvent::Focused(_) => host.capture(window),
        WindowEvent::CloseRequested { .. } => {
            host.cancel_restore(Some(window));
            host.capture(window);
            host.report(&host.flush());
        }
        WindowEvent::Destroyed => {
            host.cancel_restore(None);
            if let Ok(mut queue) = host.0.queue.lock() {
                queue.closed = true;
            }
            host.report(&host.flush());
        }
        _ => {}
    }
}

/// Call for RunEvent::ExitRequested and RunEvent::Exit. Synchronous completion,
/// including any older in-flight write, precedes returning to the exit loop.
pub fn handle_exit(app: &AppHandle) {
    let Some(host) = app.try_state::<WindowStateHost>() else {
        return;
    };
    if let Some(main) = app.get_webview_window("main") {
        let window = main.as_ref().window();
        host.cancel_restore(Some(&window));
        host.capture(&window);
    } else {
        host.cancel_restore(None);
    }
    host.report(&host.flush());
}

#[cfg(test)]
mod tests {
    use super::*;
    fn state(width: f64) -> SavedState {
        SavedState {
            schema: SCHEMA,
            maximized: false,
            normal: NormalGeometry {
                width,
                height: 600.0,
                offset_x: 100.0,
                offset_y: 80.0,
                display: Display {
                    name: Some("test".into()),
                    scale: 1.0,
                    work: PhysicalArea {
                        x: 0,
                        y: 0,
                        width: 1920,
                        height: 1080,
                    },
                },
            },
        }
    }
    fn queue() -> Queue {
        Queue {
            latest: Some(state(900.0)),
            revision: 0,
            pending: false,
            worker: false,
            restoring: false,
            closed: false,
            restore: None,
        }
    }
    #[test]
    fn rapid_events_coalesce_into_one_latest_record_and_one_worker() {
        let mut q = queue();
        assert!(q.update(state(901.0)));
        for width in 902..1900 {
            assert!(!q.update(state(f64::from(width))));
        }
        let latest = q.snapshot(true).unwrap();
        assert_eq!(latest.state.normal.width, 1899.0);
        assert_eq!(latest.revision, 999);
        assert!(q.snapshot(true).is_none());
    }
    #[test]
    fn unchanged_restoring_and_closed_events_do_not_schedule_writes() {
        let mut q = queue();
        assert!(!q.update(state(900.0)));
        q.restoring = true;
        assert!(!q.update(state(901.0)));
        q.restoring = false;
        q.closed = true;
        assert!(!q.update(state(902.0)));
        assert_eq!(q.latest, Some(state(900.0)));
    }
    #[test]
    fn synchronous_latest_flush_prevents_delayed_old_snapshot_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let host = WindowStateHost::new(Store::open(dir.path()).unwrap(), Some(state(900.0)), true);
        let older = Snapshot {
            revision: 1,
            state: state(950.0),
        };
        {
            let mut queue = host.0.queue.lock().unwrap();
            queue.restoring = false;
            queue.latest = Some(state(1100.0));
            queue.revision = 2;
            queue.pending = true;
        }
        host.flush().unwrap();
        host.persist(older).unwrap();
        assert_eq!(host.0.store.read().unwrap(), Some(state(1100.0)));
        assert!(!host.0.queue.lock().unwrap().pending);
    }
    #[test]
    fn exit_flush_waits_for_the_disk_gate_and_is_durable_before_return() {
        let dir = tempfile::tempdir().unwrap();
        let host =
            WindowStateHost::new(Store::open(dir.path()).unwrap(), Some(state(1050.0)), true);
        let gate = host.0.writer.lock().unwrap();
        let (started_tx, started_rx) = std::sync::mpsc::channel();
        let (done_tx, done_rx) = std::sync::mpsc::channel();
        let worker = host.clone();
        let thread = thread::spawn(move || {
            started_tx.send(()).unwrap();
            done_tx.send(worker.flush()).unwrap();
        });
        started_rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(matches!(
            done_rx.recv_timeout(Duration::from_millis(20)),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout)
        ));
        drop(gate);
        done_rx
            .recv_timeout(Duration::from_secs(2))
            .unwrap()
            .unwrap();
        thread.join().unwrap();
        assert_eq!(host.0.store.read().unwrap(), Some(state(1050.0)));
    }

    #[test]
    fn failed_native_restore_saves_only_observed_geometry_and_never_the_plan() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path()).unwrap();
        store.write(&state(900.0)).unwrap();
        let host = WindowStateHost::new(store, Some(state(1500.0)), true);
        host.0
            .queue
            .lock()
            .unwrap()
            .finish_restore(true, false, None, true);
        host.flush().unwrap();
        assert_eq!(host.0.store.read().unwrap(), Some(state(900.0)));
        host.0
            .queue
            .lock()
            .unwrap()
            .finish_restore(true, false, Some(state(1020.0).normal), true);
        host.flush().unwrap();
        assert_eq!(host.0.store.read().unwrap(), Some(state(1020.0)));
    }

    #[test]
    fn restored_maximization_retains_observed_normal_bounds_not_requested_size() {
        let mut q = queue();
        q.latest = Some(state(1500.0));
        q.finish_restore(true, true, Some(state(1020.0).normal), true);
        let saved = q.latest.unwrap();
        assert!(saved.maximized);
        assert_eq!(saved.normal.width, 1020.0);
        assert!(!q.restoring);
    }

    #[test]
    fn cancellation_invalidates_queued_restore_checks_without_closing_the_window() {
        let mut q = queue();
        let cancelled = Arc::new(AtomicBool::new(false));
        q.restoring = true;
        q.restore = Some(RestoreJob {
            state: PendingRestore::new(state(1500.0), q.latest.clone()),
            deadline: Instant::now() + RESTORE_TIMEOUT,
            cancelled: cancelled.clone(),
            armed: true,
        });
        q.finish_restore(true, false, Some(state(1020.0).normal), false);
        assert!(cancelled.load(Ordering::Acquire));
        assert!(q.restore.is_none());
        assert!(!q.closed && !q.restoring);
        assert!(q.update(state(1100.0)));
        assert_eq!(q.latest.unwrap().normal.width, 1100.0);
    }

    #[test]
    fn disabled_writer_preserves_invalid_original_evidence() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::open(dir.path()).unwrap();
        std::fs::write(dir.path().join(storage::FILE), b"corrupted").unwrap();
        let host = WindowStateHost::new(store, Some(state(900.0)), false);
        assert!(host.flush().is_err());
        assert_eq!(
            std::fs::read(dir.path().join(storage::FILE)).unwrap(),
            b"corrupted"
        );
    }
    #[test]
    fn maximization_keeps_last_normal_bounds_and_ignored_states_do_not_erase_them() {
        let dir = tempfile::tempdir().unwrap();
        let host = WindowStateHost::new(Store::open(dir.path()).unwrap(), Some(state(900.0)), true);
        {
            let mut queue = host.0.queue.lock().unwrap();
            queue.restoring = false;
            queue.worker = true;
        }
        host.submit(Observation::Maximized);
        host.submit(Observation::Ignore);
        let current = host.0.queue.lock().unwrap().latest.clone().unwrap();
        assert!(current.maximized);
        assert_eq!(current.normal, state(900.0).normal);
        host.submit(Observation::Normal(state(950.0).normal));
        assert!(
            !host
                .0
                .queue
                .lock()
                .unwrap()
                .latest
                .as_ref()
                .unwrap()
                .maximized
        );
    }
}
