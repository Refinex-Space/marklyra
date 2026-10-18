//! Preferences waits for its opener to rebase Markdown policy before storage CAS.
//! No settings, document capabilities or arbitrary JS are passed to Preferences.
use super::{PreferencesHost, PreferencesOrigin, PREFERENCES_LABEL};
use crate::markdown_preferences::{
    MarkdownPreferenceChange, MarkdownPreferences, MarkdownPreferencesHost,
};
use serde::Serialize;
use std::{
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, State, WebviewWindow, Window, WindowEvent};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const TIMEOUT_ERROR: &str = "编辑窗口应用Markdown策略超时，请重试";
const CLOSED_ERROR: &str = "Markdown策略请求窗口已关闭或更换";

#[derive(Clone, Debug, PartialEq, Eq)]
struct Origin {
    opener: String,
    generation: u64,
}
impl Origin {
    fn current(origin: &PreferencesOrigin) -> Option<Self> {
        Some(Self {
            opener: origin.opener.clone()?,
            generation: origin.generation,
        })
    }
}
struct Pending {
    token: String,
    origin: Origin,
    before: MarkdownPreferences,
    change: MarkdownPreferenceChange,
    deadline: Instant,
    claimed: bool,
    sender: mpsc::Sender<Result<MarkdownPreferences, String>>,
}
#[derive(Default)]
struct PendingState(Option<Pending>);
#[derive(Clone, Default)]
pub struct MarkdownPreferenceRequestHost(Arc<Mutex<PendingState>>);

struct Ticket {
    token: String,
    deadline: Instant,
}
#[derive(Clone, Debug, Serialize)]
struct Cancelled {
    token: String,
    #[serde(skip)]
    opener: String,
}
#[derive(Debug)]
struct FinishError {
    message: String,
    cancelled: Option<Cancelled>,
}
impl FinishError {
    fn rejected(message: &str) -> Self {
        Self {
            message: message.into(),
            cancelled: None,
        }
    }
}
struct Begun {
    ticket: Ticket,
    receiver: mpsc::Receiver<Result<MarkdownPreferences, String>>,
    cancelled: Option<Cancelled>,
}
struct WaitResult {
    result: Result<MarkdownPreferences, String>,
    cancelled: Option<Cancelled>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownRequest {
    token: String,
    before: MarkdownPreferences,
    change: MarkdownPreferenceChange,
}

impl PendingState {
    fn begin(
        &mut self,
        origin: Origin,
        before: MarkdownPreferences,
        change: MarkdownPreferenceChange,
        now: Instant,
        timeout: Duration,
    ) -> Result<Begun, String> {
        let mut cancelled = self.cancel_superseded(Some(&origin));
        if self
            .0
            .as_ref()
            .is_some_and(|pending| !pending.claimed && pending.deadline <= now)
        {
            cancelled = self.cancel(TIMEOUT_ERROR);
        }
        if self.0.is_some() {
            return Err("正在等待编辑窗口应用Markdown策略，请稍后重试".into());
        }
        let (sender, receiver) = mpsc::channel();
        let ticket = Ticket {
            token: uuid::Uuid::new_v4().to_string(),
            deadline: now + timeout,
        };
        self.0 = Some(Pending {
            token: ticket.token.clone(),
            origin,
            before,
            change,
            deadline: ticket.deadline,
            claimed: false,
            sender,
        });
        Ok(Begun {
            ticket,
            receiver,
            cancelled,
        })
    }
    fn cancel(&mut self, message: &str) -> Option<Cancelled> {
        let pending = self.0.take()?;
        let _ = pending.sender.send(Err(message.into()));
        Some(Cancelled {
            token: pending.token,
            opener: pending.origin.opener,
        })
    }
    fn cancel_token(&mut self, token: &str, message: &str) -> Option<Cancelled> {
        if self
            .0
            .as_ref()
            .is_some_and(|pending| pending.token == token)
        {
            self.cancel(message)
        } else {
            None
        }
    }
    fn cancel_window(&mut self, label: &str) -> Option<Cancelled> {
        if label == PREFERENCES_LABEL
            || self
                .0
                .as_ref()
                .is_some_and(|pending| pending.origin.opener == label)
        {
            self.cancel(CLOSED_ERROR)
        } else {
            None
        }
    }
    fn cancel_superseded(&mut self, origin: Option<&Origin>) -> Option<Cancelled> {
        if self
            .0
            .as_ref()
            .is_some_and(|pending| Some(&pending.origin) != origin)
        {
            self.cancel(CLOSED_ERROR)
        } else {
            None
        }
    }
    fn complete(
        &mut self,
        editor: &str,
        token: &str,
        current: Option<&Origin>,
        error: Option<String>,
        now: Instant,
        commit: impl FnOnce(
            &MarkdownPreferences,
            MarkdownPreferenceChange,
        ) -> Result<MarkdownPreferences, String>,
    ) -> Result<Option<MarkdownPreferences>, FinishError> {
        let pending = self
            .0
            .as_mut()
            .ok_or_else(|| FinishError::rejected("Markdown策略请求已结束或不存在"))?;
        if pending.token != token || pending.origin.opener != editor {
            return Err(FinishError::rejected(
                "Markdown策略回执不属于此编辑窗口或请求",
            ));
        }
        if current != Some(&pending.origin) {
            return Err(FinishError {
                message: CLOSED_ERROR.into(),
                cancelled: self.cancel(CLOSED_ERROR),
            });
        }
        if !pending.claimed && now >= pending.deadline {
            return Err(FinishError {
                message: TIMEOUT_ERROR.into(),
                cancelled: self.cancel(TIMEOUT_ERROR),
            });
        }
        if error.is_none() {
            // Deadline admission is before IO. Once claimed, a timer cannot
            // prove that storage did not publish or preempt opener compensation.
            pending.claimed = true;
        }
        let result = match error {
            Some(message) => Err(message),
            None => Ok(
                commit(&pending.before, pending.change).map_err(|message| FinishError {
                    message,
                    cancelled: None,
                })?,
            ),
        };
        let receipt = result.as_ref().ok().cloned();
        self.0
            .take()
            .expect("verified pending")
            .sender
            .send(result)
            .map_err(|_| FinishError::rejected("Markdown策略请求已取消"))?;
        Ok(receipt)
    }
}

fn wait_for_result(
    host: &MarkdownPreferenceRequestHost,
    ticket: Ticket,
    receiver: mpsc::Receiver<Result<MarkdownPreferences, String>>,
) -> WaitResult {
    match receiver.recv_timeout(ticket.deadline.saturating_duration_since(Instant::now())) {
        Ok(result) => WaitResult {
            result,
            cancelled: None,
        },
        Err(mpsc::RecvTimeoutError::Disconnected) => WaitResult {
            result: Err(CLOSED_ERROR.into()),
            cancelled: None,
        },
        Err(mpsc::RecvTimeoutError::Timeout) => {
            // Completion and timeout arbitrate under the same lock. A completion that
            // won before its deadline must not be reported as a timeout afterwards.
            let (cancelled, claimed) = match host.0.lock() {
                Ok(mut state) => {
                    let claimed = state
                        .0
                        .as_ref()
                        .is_some_and(|pending| pending.token == ticket.token && pending.claimed);
                    (
                        if claimed {
                            None
                        } else {
                            state.cancel_token(&ticket.token, TIMEOUT_ERROR)
                        },
                        claimed,
                    )
                }
                Err(_) => {
                    return WaitResult {
                        result: Err("Markdown策略选择状态不可用".into()),
                        cancelled: None,
                    }
                }
            };
            WaitResult {
                // Claimed storage may still be uncertain or awaiting the opener's
                // compensating SDK operation. Keep its real result channel alive.
                result: if claimed {
                    receiver.recv().unwrap_or_else(|_| Err(CLOSED_ERROR.into()))
                } else {
                    receiver
                        .try_recv()
                        .unwrap_or_else(|_| Err(TIMEOUT_ERROR.into()))
                },
                cancelled,
            }
        }
    }
}

#[tauri::command]
pub async fn request_preference_markdown(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, MarkdownPreferenceRequestHost>,
    expected_revision: u64,
    change: MarkdownPreferenceChange,
) -> Result<MarkdownPreferences, String> {
    super::require_preferences(window.label())?;
    change.validate()?;
    // Capture the requesting Preferences generation before asynchronous disk IO.
    // A held read must not retarget an old UI change to a newly reopened opener.
    let requested_origin = {
        let preferences = app.state::<PreferencesHost>();
        let origin = preferences.0.lock().map_err(|_| "偏好设置窗口状态不可用")?;
        Origin::current(&origin).ok_or(CLOSED_ERROR)?
    };
    let disk_app = app.clone();
    let before = tauri::async_runtime::spawn_blocking(move || {
        disk_app.state::<MarkdownPreferencesHost>().get(&disk_app)
    })
    .await
    .map_err(|_| "读取Markdown策略任务未完成")??;
    if before.revision != expected_revision {
        return Err("Markdown偏好已由其他窗口更改，请重新打开设置".into());
    }
    let Begun {
        ticket,
        receiver,
        cancelled,
    } = {
        let preferences = app.state::<PreferencesHost>();
        let origin = preferences.0.lock().map_err(|_| "偏好设置窗口状态不可用")?;
        let current = Origin::current(&origin).ok_or(CLOSED_ERROR)?;
        if current != requested_origin {
            return Err(CLOSED_ERROR.into());
        }
        if app.get_webview_window(PREFERENCES_LABEL).is_none()
            || app
                .get_webview_window(&current.opener)
                .filter(crate::windows::is_editor)
                .is_none()
        {
            return Err(CLOSED_ERROR.into());
        }
        let begun = host
            .0
            .try_lock()
            .map_err(|_| "正在确认Markdown策略请求，请稍后重试")?
            .begin(
                current.clone(),
                before.clone(),
                change,
                Instant::now(),
                REQUEST_TIMEOUT,
            )?;
        let message = MarkdownRequest {
            token: begun.ticket.token.clone(),
            before,
            change,
        };
        if let Err(error) = crate::windows::emit_to_editor(
            &app,
            &current.opener,
            "preference-markdown-request",
            message,
        ) {
            let cancelled = host
                .0
                .lock()
                .map_err(|_| "Markdown策略请求状态不可用")?
                .cancel_token(&begun.ticket.token, CLOSED_ERROR);
            notify_cancelled(&app, cancelled);
            notify_cancelled(&app, begun.cancelled);
            return Err(error);
        }
        begun
    };
    notify_cancelled(&app, cancelled);
    let host = host.inner().clone();
    let waited =
        tauri::async_runtime::spawn_blocking(move || wait_for_result(&host, ticket, receiver))
            .await
            .map_err(|_| "等待Markdown策略应用任务未能完成")?;
    notify_cancelled(&app, waited.cancelled);
    waited.result
}

fn reconcile_write(
    before: &MarkdownPreferences,
    change: MarkdownPreferenceChange,
    write: Result<MarkdownPreferences, String>,
    read: impl FnOnce() -> Result<MarkdownPreferences, String>,
) -> Result<MarkdownPreferences, String> {
    match write {
        Ok(snapshot) => Ok(snapshot),
        Err(error) => {
            let current = read()
                .map_err(|read_error| format!("{error}；无法确认是否已保存：{read_error}"))?;
            let expected_next = before.revision.checked_add(1);
            if Some(current.revision) == expected_next
                && current.indent_size == change.indent_size.unwrap_or(before.indent_size)
                && current.pretty_indent == change.pretty_indent.unwrap_or(before.pretty_indent)
                && current.heading_style == change.heading_style.unwrap_or(before.heading_style)
                && current.ul_style == change.ul_style.unwrap_or(before.ul_style)
                && current.ol_style == change.ol_style.unwrap_or(before.ol_style)
            {
                Ok(current)
            } else {
                Err(error)
            }
        }
    }
}

#[tauri::command]
pub async fn complete_preference_markdown(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, MarkdownPreferenceRequestHost>,
    token: String,
    error: Option<String>,
) -> Result<Option<MarkdownPreferences>, String> {
    super::require_editor(&window)?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let completion = {
            let preferences = app.state::<PreferencesHost>();
            let origin = preferences.0.lock().map_err(|_| "偏好设置窗口状态不可用")?;
            let current = app
                .get_webview_window(PREFERENCES_LABEL)
                .and_then(|_| Origin::current(&origin));
            let error = error.map(|message| {
                if message.trim().is_empty() {
                    "编辑窗口无法应用Markdown策略".into()
                } else {
                    message
                        .chars()
                        .filter(|ch| !ch.is_control() || *ch == '\n')
                        .take(2048)
                        .collect()
                }
            });
            host.0
                .try_lock()
                .map_err(|_| "正在确认Markdown策略请求，请稍后重试")?
                .complete(
                    window.label(),
                    &token,
                    current.as_ref(),
                    error,
                    Instant::now(),
                    |before, change| {
                        // complete has admitted and claimed this exact origin while
                        // both locks were held. IO must not retain the GUI origin lock.
                        drop(origin);
                        let disk = app.state::<MarkdownPreferencesHost>();
                        reconcile_write(
                            before,
                            change,
                            disk.put(&app, before.revision, change),
                            || disk.get(&app),
                        )
                    },
                )
        };
        let snapshot = match completion {
            Ok(value) => value,
            Err(error) => {
                notify_cancelled(&app, error.cancelled);
                return Err(error.message);
            }
        };
        if let Some(value) = &snapshot {
            for (label, editor) in app.webview_windows() {
                if label != window.label() && crate::windows::is_editor(&editor) {
                    if let Err(error) = crate::windows::emit_to_editor(
                        &app,
                        &label,
                        "markdown-preferences-changed",
                        value.revision,
                    ) {
                        eprintln!(
                            "Markdown preference synchronization notification failed: {error}"
                        );
                    }
                }
            }
        }
        Ok(snapshot)
    })
    .await
    .map_err(|_| "Markdown策略回执任务未能完成")?
}

pub(super) fn origin_changed(app: &AppHandle) {
    let Some(host) = app.try_state::<MarkdownPreferenceRequestHost>() else {
        return;
    };
    let preferences = app.state::<PreferencesHost>();
    let (cancelled, deferred) = if let Ok(origin) = preferences.0.lock() {
        match host.0.try_lock() {
            Ok(mut state) => (
                state.cancel_superseded(Origin::current(&origin).as_ref()),
                false,
            ),
            Err(std::sync::TryLockError::WouldBlock) => (None, true),
            Err(std::sync::TryLockError::Poisoned(_)) => (None, false),
        }
    } else {
        (None, false)
    };
    notify_cancelled(app, cancelled);
    if deferred {
        let host = host.inner().clone();
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            // Wait without retaining the GUI origin mutex, then check the latest
            // origin again. Do not cancel from an obsolete captured generation.
            if let Ok(state) = host.0.lock() {
                drop(state);
                origin_changed(&app);
            }
        });
    }
}
pub(super) fn handle_window(window: &Window, event: &WindowEvent) {
    if matches!(event, WindowEvent::Destroyed) {
        if let Some(host) = window.try_state::<MarkdownPreferenceRequestHost>() {
            match host.0.try_lock() {
                Ok(mut state) => {
                    let cancelled = state.cancel_window(window.label());
                    drop(state);
                    notify_cancelled(window.app_handle(), cancelled);
                }
                Err(std::sync::TryLockError::WouldBlock) => {
                    // This callback runs on the GUI thread. A claimed write owns
                    // its result; closing the UI cannot cancel synchronous IO.
                    let host = host.inner().clone();
                    let app = window.app_handle().clone();
                    let label = window.label().to_owned();
                    tauri::async_runtime::spawn_blocking(move || {
                        if label == PREFERENCES_LABEL {
                            if let Ok(state) = host.0.lock() {
                                drop(state);
                                // Run after the GUI's current Destroyed callback
                                // has closed the origin. Recheck the latest origin,
                                // so delayed cleanup cannot cancel a reopened page.
                                let current_app = app.clone();
                                let _ =
                                    app.run_on_main_thread(move || origin_changed(&current_app));
                            }
                            return;
                        }
                        let cancelled = host
                            .0
                            .lock()
                            .ok()
                            .and_then(|mut state| state.cancel_window(&label));
                        notify_cancelled(&app, cancelled);
                    });
                }
                Err(std::sync::TryLockError::Poisoned(_)) => {}
            }
        }
    }
}
fn notify_cancelled(app: &AppHandle, cancelled: Option<Cancelled>) {
    if let Some(cancelled) = cancelled {
        let opener = cancelled.opener.clone();
        // Best effort cancellation is backed by complete's deadline/generation validation.
        let _ = crate::windows::emit_to_editor(
            app,
            &opener,
            "preference-markdown-cancelled",
            cancelled,
        );
    }
}

#[cfg(test)]
mod tests;
