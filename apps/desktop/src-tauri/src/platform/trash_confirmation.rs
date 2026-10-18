//! Window-scoped asynchronous system confirmation, separate from the file lane.
use std::{
    collections::HashMap,
    sync::{mpsc, Arc, Mutex, OnceLock},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Runtime, WebviewWindow, Window, WindowEvent};
use uuid::Uuid;

#[cfg(target_os = "macos")]
#[path = "trash_confirmation/macos.rs"]
mod macos;

const TIMEOUT: Duration = Duration::from_secs(110);
const MAX_CONFIRMATIONS: usize = 32;
type Outcome = Result<TrashConfirmation, String>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TrashConfirmation {
    pub confirmed: bool,
    pub suppress_future: bool,
    pub(crate) selection: u8,
}

impl TrashConfirmation {
    fn from_buttons(confirmed: bool, checked: bool) -> Self {
        Self {
            confirmed,
            suppress_future: confirmed && checked,
            selection: if confirmed { 0 } else { 1 },
        }
    }
}

#[derive(Clone, Copy)]
pub(super) enum PromptKind {
    Trash,
    Move,
    MoveConflict,
}

pub(crate) async fn confirm_move(
    app: &AppHandle,
    window: &WebviewWindow,
    name: &str,
    skip: bool,
) -> Outcome {
    confirm_kind(app, window, name, skip, PromptKind::Move).await
}

pub(crate) async fn move_conflict(
    app: &AppHandle,
    window: &WebviewWindow,
    name: &str,
) -> Result<file_index::EntryMoveConflictPolicy, String> {
    let result = confirm_kind(app, window, name, false, PromptKind::MoveConflict).await?;
    Ok(match result.selection {
        0 => file_index::EntryMoveConflictPolicy::KeepBoth,
        1 => file_index::EntryMoveConflictPolicy::Replace,
        _ => file_index::EntryMoveConflictPolicy::Cancel,
    })
}

struct Pending {
    id: Uuid,
    label: String,
    deadline: Instant,
    sender: Mutex<Option<mpsc::Sender<Outcome>>>,
}

impl Pending {
    #[cfg(target_os = "macos")]
    fn active(&self) -> bool {
        Instant::now() < self.deadline && self.sender.lock().is_ok_and(|sender| sender.is_some())
    }

    fn finish_at(&self, result: Outcome, now: Instant) -> bool {
        let mut sender = self
            .sender
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(sender) = sender.take() else {
            return false;
        };
        let result = if now >= self.deadline {
            Err("文件操作确认已超时，未执行文件操作".into())
        } else {
            result
        };
        let _ = sender.send(result);
        true
    }
}

#[derive(Default)]
struct Registry(HashMap<String, Arc<Pending>>);

impl Registry {
    fn insert(&mut self, pending: Arc<Pending>) -> Result<(), String> {
        if self.0.contains_key(&pending.label) {
            return Err("此窗口已有文件操作确认，请先完成或取消".into());
        }
        if self.0.len() >= MAX_CONFIRMATIONS {
            return Err("文件操作确认数量已达上限".into());
        }
        self.0.insert(pending.label.clone(), pending);
        Ok(())
    }
    fn release(&mut self, pending: &Pending) {
        if self
            .0
            .get(&pending.label)
            .is_some_and(|current| current.id == pending.id)
        {
            self.0.remove(&pending.label);
        }
    }
}

fn registry() -> &'static Mutex<Registry> {
    static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(Mutex::default)
}

fn finish(pending: &Pending, result: Outcome) {
    pending.finish_at(result, Instant::now());
    registry()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .release(pending);
}

pub async fn confirm(app: &AppHandle, window: &WebviewWindow, name: &str, skip: bool) -> Outcome {
    confirm_kind(app, window, name, skip, PromptKind::Trash).await
}
async fn confirm_kind(
    app: &AppHandle,
    window: &WebviewWindow,
    name: &str,
    skip: bool,
    kind: PromptKind,
) -> Outcome {
    // Plain short UI text, never a URL, script, format string or file grant.
    if name.is_empty() || name.len() > 1024 || name.chars().any(char::is_control) {
        return Err("文件操作确认名称无效".into());
    }
    window.is_visible().map_err(|_| "文件操作确认窗口已关闭")?;
    if skip {
        return Ok(TrashConfirmation::from_buttons(true, false));
    }
    let (sender, receiver) = mpsc::channel();
    let pending = Arc::new(Pending {
        id: Uuid::new_v4(),
        label: window.label().to_owned(),
        deadline: Instant::now() + TIMEOUT,
        sender: Mutex::new(Some(sender)),
    });
    registry()
        .lock()
        .map_err(|_| "文件操作确认状态不可用")?
        .insert(Arc::clone(&pending))?;

    #[cfg(target_os = "macos")]
    {
        let queued = Arc::clone(&pending);
        let window = window.clone();
        let name = name.to_owned();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = macos::begin(&window, &name, kind, Arc::clone(&queued)) {
                finish(&queued, Err(error));
            }
        }) {
            finish(&pending, Err(error.to_string()));
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_dialog::{
            DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
        };
        let queued = Arc::clone(&pending);
        let (message, title, buttons) = match kind {
            PromptKind::Trash => (
                format!("Are you sure you want to delete {name}?\nYou can restore from the Trash."),
                "Delete",
                MessageDialogButtons::OkCancel,
            ),
            PromptKind::Move => (
                format!("Are you sure you want to move {name}?"),
                "Move",
                MessageDialogButtons::OkCancel,
            ),
            PromptKind::MoveConflict => (
                format!("An item named {name} already exists at the destination."),
                "Move",
                MessageDialogButtons::YesNoCancelCustom(
                    "Keep Both".into(),
                    "Replace".into(),
                    "Cancel".into(),
                ),
            ),
        };
        app.dialog()
            .message(message)
            .title(title)
            .parent(window)
            .buttons(buttons)
            .kind(MessageDialogKind::Warning)
            .show_with_result(move |answer| {
                let selection = if matches!(kind, PromptKind::MoveConflict) {
                    match answer {
                        MessageDialogResult::Custom(value) if value == "Keep Both" => 0,
                        MessageDialogResult::Custom(value) if value == "Replace" => 1,
                        _ => 2,
                    }
                } else if matches!(answer, MessageDialogResult::Ok | MessageDialogResult::Yes) {
                    0
                } else {
                    1
                };
                finish(
                    &queued,
                    Ok(TrashConfirmation {
                        confirmed: selection == 0,
                        suppress_future: false,
                        selection,
                    }),
                );
            });
    }

    let deadline = pending.deadline;
    let waiting = Arc::clone(&pending);
    #[cfg(target_os = "macos")]
    let waiting_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let outcome =
            match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
                Ok(result) => result,
                Err(_) => Err("文件操作确认已超时或取消，未执行文件操作".into()),
            };
        // This worker owns timeout cleanup even if the caller drops its async
        // future while waiting. No permanently reserved label or orphan sheet.
        finish(&waiting, outcome.clone());
        #[cfg(target_os = "macos")]
        dismiss(&waiting_app, waiting.id);
        outcome
    })
    .await;
    let outcome = result.unwrap_or_else(|error| Err(error.to_string()));
    // Consumes the sender before scheduling dismissal; even a late OK cannot
    // complete a new request, or turn this timeout/close into an authorization.
    finish(&pending, outcome.clone());
    #[cfg(target_os = "macos")]
    dismiss(app, pending.id);
    outcome
}

pub fn handle_window<R: Runtime>(app: &AppHandle<R>, window: &Window<R>, event: &WindowEvent) {
    if !matches!(event, WindowEvent::Destroyed) {
        return;
    }
    let pending = registry()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .0
        .get(window.label())
        .cloned();
    if let Some(pending) = pending {
        finish(
            &pending,
            Err("文件操作确认窗口已关闭，未执行文件操作".into()),
        );
        #[cfg(target_os = "macos")]
        dismiss(app, pending.id);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[cfg(target_os = "macos")]
fn dismiss<R: Runtime>(app: &AppHandle<R>, id: Uuid) {
    let _ = app.run_on_main_thread(move || macos::dismiss(id));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pending(label: &str) -> (Arc<Pending>, mpsc::Receiver<Outcome>) {
        let (sender, receiver) = mpsc::channel();
        (
            Arc::new(Pending {
                id: Uuid::new_v4(),
                label: label.into(),
                deadline: Instant::now() + TIMEOUT,
                sender: Mutex::new(Some(sender)),
            }),
            receiver,
        )
    }

    #[test]
    fn suppression_requires_ok_and_checked() {
        for (confirmed, checked) in [(false, false), (false, true), (true, false), (true, true)] {
            let result = TrashConfirmation::from_buttons(confirmed, checked);
            assert_eq!(result.confirmed, confirmed);
            assert_eq!(result.suppress_future, confirmed && checked);
        }
    }

    #[test]
    fn close_consumes_once_and_old_completion_cannot_remove_reopened_window_request() {
        let mut registry = Registry::default();
        let (old, receiver) = pending("editor");
        registry.insert(Arc::clone(&old)).unwrap();
        assert!(old.finish_at(Err("closed".into()), Instant::now()));
        registry.release(&old);
        let (new, new_receiver) = pending("editor");
        registry.insert(Arc::clone(&new)).unwrap();
        assert!(!old.finish_at(
            Ok(TrashConfirmation::from_buttons(true, true)),
            Instant::now()
        ));
        registry.release(&old);
        assert_eq!(registry.0.get("editor").unwrap().id, new.id);
        assert_eq!(receiver.try_recv().unwrap(), Err("closed".into()));
        assert!(new_receiver.try_recv().is_err());
    }

    #[test]
    fn deadline_rejects_late_ok_even_before_timeout_worker_wakes() {
        let (request, receiver) = pending("editor");
        assert!(request.finish_at(
            Ok(TrashConfirmation::from_buttons(true, true)),
            request.deadline
        ));
        assert!(receiver.try_recv().unwrap().is_err());
        assert!(!request.finish_at(
            Ok(TrashConfirmation::from_buttons(true, true)),
            Instant::now()
        ));
    }

    #[test]
    fn duplicate_window_and_global_budget_are_bounded() {
        let mut registry = Registry::default();
        for index in 0..MAX_CONFIRMATIONS {
            registry
                .insert(pending(&format!("editor-{index}")).0)
                .unwrap();
        }
        assert!(registry.insert(pending("editor-0").0).is_err());
        assert!(registry.insert(pending("overflow").0).is_err());
    }
}
