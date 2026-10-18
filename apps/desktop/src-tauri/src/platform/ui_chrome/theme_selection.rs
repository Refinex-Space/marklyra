//! Preferences waits for the owning editor to apply, persist and accept its theme.
//! No settings, document capabilities or arbitrary JS are passed to Preferences.
use super::{PreferencesHost, PreferencesOrigin, PREFERENCES_LABEL};
use serde::{Deserialize, Serialize};
use std::{
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager, Runtime, State, WebviewWindow, Window, WindowEvent};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const TIMEOUT_ERROR: &str = "编辑窗口应用主题超时，请重试";
const CLOSED_ERROR: &str = "主题请求窗口已关闭或更换";

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
    deadline: Instant,
    sender: mpsc::Sender<Result<(), String>>,
}
#[derive(Default)]
struct PendingState(Option<Pending>);
#[derive(Clone, Default)]
pub struct ThemePreferenceHost(Arc<Mutex<PendingState>>);

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
    receiver: mpsc::Receiver<Result<(), String>>,
    cancelled: Option<Cancelled>,
}
struct WaitResult {
    result: Result<(), String>,
    cancelled: Option<Cancelled>,
}
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ThemeTarget {
    Normal,
    Dark,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThemeRequest {
    token: String,
    theme_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    target: Option<ThemeTarget>,
}

impl PendingState {
    fn begin(&mut self, origin: Origin, now: Instant, timeout: Duration) -> Result<Begun, String> {
        let mut cancelled = self.cancel_superseded(Some(&origin));
        if self
            .0
            .as_ref()
            .is_some_and(|pending| pending.deadline <= now)
        {
            cancelled = self.cancel(TIMEOUT_ERROR);
        }
        if self.0.is_some() {
            return Err("正在等待编辑窗口应用主题，请稍后重试".into());
        }
        let (sender, receiver) = mpsc::channel();
        let ticket = Ticket {
            token: uuid::Uuid::new_v4().to_string(),
            deadline: now + timeout,
        };
        self.0 = Some(Pending {
            token: ticket.token.clone(),
            origin,
            deadline: ticket.deadline,
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
        result: Result<(), String>,
        now: Instant,
        accept_styles: impl FnOnce() -> Result<(), String>,
    ) -> Result<bool, FinishError> {
        let pending = self
            .0
            .as_ref()
            .ok_or_else(|| FinishError::rejected("主题请求已结束或不存在"))?;
        if pending.token != token || pending.origin.opener != editor {
            return Err(FinishError::rejected("主题回执不属于此编辑窗口或请求"));
        }
        if current != Some(&pending.origin) {
            return Err(FinishError {
                message: CLOSED_ERROR.into(),
                cancelled: self.cancel(CLOSED_ERROR),
            });
        }
        if now >= pending.deadline {
            return Err(FinishError {
                message: TIMEOUT_ERROR.into(),
                cancelled: self.cancel(TIMEOUT_ERROR),
            });
        }
        let success = result.is_ok();
        if success {
            if let Err(message) = accept_styles() {
                let cancelled = self.cancel(&message);
                return Err(FinishError { message, cancelled });
            }
        }
        self.0
            .take()
            .expect("verified pending")
            .sender
            .send(result)
            .map_err(|_| FinishError::rejected("偏好设置主题请求已取消"))?;
        Ok(success)
    }
}

fn wait_for_result(
    host: &ThemePreferenceHost,
    ticket: Ticket,
    receiver: mpsc::Receiver<Result<(), String>>,
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
            let cancelled = match host.0.lock() {
                Ok(mut state) => state.cancel_token(&ticket.token, TIMEOUT_ERROR),
                Err(_) => {
                    return WaitResult {
                        result: Err("主题选择状态不可用".into()),
                        cancelled: None,
                    }
                }
            };
            WaitResult {
                result: receiver
                    .try_recv()
                    .unwrap_or_else(|_| Err(TIMEOUT_ERROR.into())),
                cancelled,
            }
        }
    }
}

#[tauri::command]
pub async fn request_preference_theme(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ThemePreferenceHost>,
    theme_id: String,
    target: Option<ThemeTarget>,
) -> Result<(), String> {
    super::require_preferences(window.label())?;
    if !crate::themes::valid_theme_id(&theme_id) {
        return Err("主题名称无效".into());
    }
    let Begun {
        ticket,
        receiver,
        cancelled,
    } = {
        let preferences = app.state::<PreferencesHost>();
        let origin = preferences.0.lock().map_err(|_| "偏好设置窗口状态不可用")?;
        let current = Origin::current(&origin).ok_or(CLOSED_ERROR)?;
        if app.get_webview_window(PREFERENCES_LABEL).is_none()
            || app
                .get_webview_window(&current.opener)
                .filter(crate::windows::is_editor)
                .is_none()
        {
            return Err(CLOSED_ERROR.into());
        }
        let begun = host.0.lock().map_err(|_| "主题选择状态不可用")?.begin(
            current.clone(),
            Instant::now(),
            REQUEST_TIMEOUT,
        )?;
        let message = ThemeRequest {
            token: begun.ticket.token.clone(),
            theme_id,
            target,
        };
        if let Err(error) = crate::windows::emit_to_editor(
            &app,
            &current.opener,
            "preference-theme-request",
            message,
        ) {
            let cancelled = host
                .0
                .lock()
                .map_err(|_| "主题选择状态不可用")?
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
            .map_err(|_| "等待主题应用任务未能完成".to_owned())?;
    notify_cancelled(&app, waited.cancelled);
    waited.result
}

#[tauri::command]
pub fn complete_preference_theme(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ThemePreferenceHost>,
    token: String,
    error: Option<String>,
    styles_token: Option<String>,
) -> Result<(), String> {
    super::require_editor(&window)?;
    if app
        .get_webview_window(window.label())
        .filter(crate::windows::is_editor)
        .is_none()
    {
        return Err(CLOSED_ERROR.into());
    }
    let completion = {
        let preferences = app.state::<PreferencesHost>();
        let origin = preferences.0.lock().map_err(|_| "偏好设置窗口状态不可用")?;
        let current = app
            .get_webview_window(PREFERENCES_LABEL)
            .and_then(|_| Origin::current(&origin));
        // The display error is bounded; no source text, stack, or filesystem path is generated here.
        let result = error.map_or(Ok(()), |message| {
            Err(if message.trim().is_empty() {
                "编辑窗口无法应用所选主题".into()
            } else {
                message
                    .chars()
                    .filter(|ch| !ch.is_control() || *ch == '\n')
                    .take(2048)
                    .collect()
            })
        });
        host.0.lock().map_err(|_| "主题选择状态不可用")?.complete(
            window.label(),
            &token,
            current.as_ref(),
            result,
            Instant::now(),
            || {
                let styles_token = styles_token.as_deref().ok_or("缺少已应用的主题资源标识")?;
                app.state::<crate::themes::ThemeHost>()
                    .accept_styles(window.label(), styles_token)
            },
        )
    };
    let success = match completion {
        Ok(success) => success,
        Err(error) => {
            notify_cancelled(&app, error.cancelled);
            return Err(error.message);
        }
    };
    if success {
        if let Err(error) = crate::menu::themes::schedule_sync(&app) {
            eprintln!("Accepted preference theme menu synchronization failed: {error}");
        }
        for (label, editor) in app.webview_windows() {
            if label != window.label() && crate::windows::is_editor(&editor) {
                // The owning editor has already committed. A later sibling close must
                // not turn this successful request into a contradictory rejection.
                if let Err(error) =
                    crate::windows::emit_to_editor(&app, &label, "preferences-changed", ())
                {
                    eprintln!("Theme preference synchronization failed: {error}");
                }
            }
        }
    }
    Ok(())
}

pub(super) fn origin_changed(app: &AppHandle) {
    let Some(host) = app.try_state::<ThemePreferenceHost>() else {
        return;
    };
    let preferences = app.state::<PreferencesHost>();
    let cancelled = if let Ok(origin) = preferences.0.lock() {
        if let Ok(mut state) = host.0.lock() {
            state.cancel_superseded(Origin::current(&origin).as_ref())
        } else {
            None
        }
    } else {
        None
    };
    notify_cancelled(app, cancelled);
    if let Err(error) = crate::menu::themes::schedule_sync(app) {
        eprintln!("Preferences opener theme menu synchronization failed: {error}");
    }
}
/// A focused Preferences window displays its live opener's accepted theme without
/// enabling editor actions or granting Preferences the opener's resources.
pub(crate) fn focused_preferences_opener<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let preferences = app.get_webview_window(PREFERENCES_LABEL)?;
    if !preferences.is_focused().unwrap_or(false) {
        return None;
    }
    let host = app.try_state::<PreferencesHost>()?;
    let opener = host.0.lock().ok()?.opener.clone()?;
    app.get_webview_window(&opener)
        .filter(crate::windows::is_editor)
        .map(|_| opener)
}
pub(super) fn handle_window(window: &Window, event: &WindowEvent) {
    if matches!(event, WindowEvent::Destroyed) {
        if let Some(host) = window.try_state::<ThemePreferenceHost>() {
            let cancelled = host
                .0
                .lock()
                .ok()
                .and_then(|mut state| state.cancel_window(window.label()));
            notify_cancelled(window.app_handle(), cancelled);
        }
    }
}
fn notify_cancelled(app: &AppHandle, cancelled: Option<Cancelled>) {
    if let Some(cancelled) = cancelled {
        let opener = cancelled.opener.clone();
        // Best effort cancellation is backed by complete's deadline/generation validation.
        let _ =
            crate::windows::emit_to_editor(app, &opener, "preference-theme-cancelled", cancelled);
    }
}

#[cfg(test)]
mod tests;
