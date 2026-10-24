//! Best-effort attention for verified, window-owned decisions. Never activates a window.
use super::*;
use std::collections::HashSet;
use std::sync::atomic::Ordering;

#[derive(Default)]
struct Pending {
    owner: String,
    ids: HashSet<String>,
    seen: HashSet<String>,
}
#[derive(Default)]
pub(super) struct Attention {
    pending: HashMap<String, Pending>,
    active: HashSet<String>,
    enabled: Option<bool>,
    #[cfg(target_os = "macos")]
    dock_request: Option<isize>,
}
impl Attention {
    fn sync(&mut self, connection: &str, owner: &str, ids: HashSet<String>, focused: bool) -> bool {
        let pending = self.pending.entry(connection.into()).or_default();
        pending.owner = owner.into();
        let fresh = ids.iter().any(|id| !pending.seen.contains(id));
        let first = pending.ids.is_empty();
        pending.seen.extend(ids.iter().cloned());
        pending.ids = ids;
        let request = first
            && fresh
            && !focused
            && self.enabled.unwrap_or(true)
            && !self.active.contains(owner);
        if request {
            self.active.insert(owner.into());
        }
        self.prune();
        request
    }
    fn prune(&mut self) {
        self.active.retain(|owner| {
            self.pending
                .values()
                .any(|p| &p.owner == owner && !p.ids.is_empty())
        });
    }
    fn finish(&mut self, connection: &str, id: Option<&str>) {
        if let Some(id) = id {
            if let Some(pending) = self.pending.get_mut(connection) {
                pending.ids.remove(id);
                pending.seen.remove(id);
            }
        } else {
            self.pending.remove(connection);
        }
        self.prune();
    }
}
fn apply(app: &AppHandle, state: &mut Attention, before: HashSet<String>, request: Option<&str>) {
    #[cfg(not(target_os = "macos"))]
    {
        for label in before.difference(&state.active) {
            if let Some(window) = app.get_webview_window(label) {
                native_flash(&window, false);
            }
        }
        if let Some(label) = request {
            if let Some(window) = app.get_webview_window(label) {
                native_flash(&window, true);
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let _ = (app, before);
        use objc2::MainThreadMarker;
        use objc2_app_kit::{NSApplication, NSRequestUserAttentionType};
        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let app = NSApplication::sharedApplication(mtm);
        if state.active.is_empty() || app.isActive() {
            if let Some(id) = state.dock_request.take() {
                app.cancelUserAttentionRequest(id);
            }
        } else if request.is_some() && state.dock_request.is_none() {
            state.dock_request =
                Some(app.requestUserAttention(NSRequestUserAttentionType::InformationalRequest));
        }
    }
}
#[cfg(windows)]
fn native_flash(window: &WebviewWindow, start: bool) {
    use windows::Win32::UI::WindowsAndMessaging::{
        FlashWindowEx, FLASHWINFO, FLASHW_STOP, FLASHW_TRAY,
    };
    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let info = FLASHWINFO {
        cbSize: std::mem::size_of::<FLASHWINFO>() as u32,
        hwnd: windows::Win32::Foundation::HWND(hwnd.0 as _),
        dwFlags: if start { FLASHW_TRAY } else { FLASHW_STOP },
        uCount: if start { 4 } else { 0 },
        dwTimeout: 0,
    };
    // A window-owned handle, used on the UI thread; this API never changes focus.
    unsafe {
        let _ = FlashWindowEx(&info);
    }
}
#[cfg(not(any(windows, target_os = "macos")))]
fn native_flash(window: &WebviewWindow, start: bool) {
    let _ = window.request_user_attention(start.then_some(tauri::UserAttentionType::Informational));
}

#[tauri::command]
pub fn agent_sync_attention(
    window: WebviewWindow,
    connection_id: String,
    request_ids: Vec<String>,
) -> Result<(), String> {
    crate::commands::require_window(&window)?;
    if request_ids.len() > 128 || request_ids.iter().any(|id| id.len() > 1024) {
        return Err("提醒请求无效".into());
    }
    let owned = window.clone();
    window
        .run_on_main_thread(move || {
            let window = owned;
            let app = window.app_handle();
            let host = app.state::<AgentHostState>();
            let Ok(process) = connection(&host, &window, &connection_id) else {
                return;
            };
            if !process.live.load(Ordering::Acquire)
                || process.cancelled_turn.load(Ordering::Acquire)
                || !process
                    .outgoing
                    .lock()
                    .is_ok_and(|requests| requests.values().any(|m| m == "session/prompt"))
            {
                return;
            }
            let Ok(requests) = process.requests.lock() else {
                return;
            };
            let Ok(tools) = host.mcp_pending.lock() else {
                return;
            };
            let ids = request_ids
                .into_iter()
                .filter(|id| {
                    requests.get(id).is_some_and(|r| {
                        !r.executed
                            && matches!(
                                r.method.as_str(),
                                "session/request_permission"
                                    | "fs/write_text_file"
                                    | "terminal/create"
                                    | "elicitation/create"
                            )
                    }) || tools.get(id).is_some_and(|r| {
                        r.owner == window.label() && r.connection_id == connection_id
                    })
                })
                .collect();
            let Ok(mut state) = host.attention.lock() else {
                return;
            };
            if state.enabled.is_none() {
                state.enabled = Some(
                    storage(app)
                        .and_then(|root| settings(&root))
                        .map(|s| s.attention_enabled)
                        .unwrap_or(false),
                );
            }
            let before = state.active.clone();
            let request = state.sync(
                &connection_id,
                window.label(),
                ids,
                crate::windows::is_focused(&window).unwrap_or(true),
            );
            apply(app, &mut state, before, request.then_some(window.label()));
        })
        .map_err(|e| e.to_string())
}

// Native admission also runs while a background WebView is throttled. The UI
// reconciles its queue later; both paths share the same deduplication state.
pub(super) fn admit(window: &WebviewWindow, connection: &str, id: &str) {
    let window_copy = window.clone();
    let connection = connection.to_string();
    let id = id.to_string();
    let _ = window.run_on_main_thread(move || {
        let host = window_copy.state::<AgentHostState>();
        let mut ids = host
            .attention
            .lock()
            .ok()
            .and_then(|s| s.pending.get(&connection).map(|p| p.ids.clone()))
            .unwrap_or_default();
        ids.insert(id);
        let _ = agent_sync_attention(window_copy, connection, ids.into_iter().collect());
    });
}

pub(super) fn finished(window: &WebviewWindow, connection: &str, id: Option<&str>) {
    let app = window.app_handle().clone();
    let connection = connection.to_string();
    let id = id.map(str::to_string);
    let _ = window.run_on_main_thread(move || {
        let host = app.state::<AgentHostState>();
        if let Ok(mut state) = host.attention.lock() {
            let before = state.active.clone();
            state.finish(&connection, id.as_deref());
            apply(&app, &mut state, before, None);
        };
    });
}
// Only native MCP expiry needs to withdraw a still-unanswered card. Normal ACP
// decisions are removed by the session itself; a delayed end event could otherwise
// delete a later request whose provider legitimately reused the same JSON-RPC ID.
pub(super) fn expired(window: &WebviewWindow, connection: &str, id: &str) {
    let _ = window.emit_to(
        window.label(),
        "marklyra:agent-event",
        json!({"connectionId":connection,"kind":"interaction-ended","requestId":id}),
    );
    finished(window, connection, Some(id));
}

pub fn focused(app: &AppHandle, owner: &str) {
    let host = app.state::<AgentHostState>();
    if let Ok(mut state) = host.attention.lock() {
        let before = state.active.clone();
        #[cfg(target_os = "macos")]
        state.active.clear();
        #[cfg(not(target_os = "macos"))]
        state.active.remove(owner);
        let _ = owner;
        apply(app, &mut state, before, None);
    };
}
#[tauri::command]
pub fn agent_set_attention_enabled(
    app: AppHandle,
    window: WebviewWindow,
    enabled: bool,
) -> Result<(), String> {
    require_manager(&window)?;
    let host = app.state::<AgentHostState>();
    let _guard = host
        .operations
        .try_lock()
        .map_err(|_| "已有配置操作进行中")?;
    let root = storage(&app)?;
    let mut saved = settings(&root)?;
    saved.attention_enabled = enabled;
    save_settings(&root, &saved)?;
    let scheduled = app.clone();
    app.run_on_main_thread(move || {
        let host = scheduled.state::<AgentHostState>();
        if let Ok(mut state) = host.attention.lock() {
            let before = state.active.clone();
            state.enabled = Some(enabled);
            if !enabled {
                state.active.clear();
            }
            apply(&scheduled, &mut state, before, None);
        };
    })
    .map_err(|e| e.to_string())?;
    let _ = app.emit("marklyra:agents-changed", ());
    Ok(())
}

#[cfg(test)]
pub(crate) fn verify_native(
    app: &AppHandle,
    window: &WebviewWindow,
    other: &WebviewWindow,
) -> Result<(), String> {
    let root = tempfile::tempdir().map_err(|e| e.to_string())?;
    let mut process = process::test_process(root.path(), root.path());
    let value = Arc::get_mut(&mut process).unwrap();
    value.owner = window.label().into();
    value.window = Some(window.clone());
    value
        .outgoing
        .lock()
        .unwrap()
        .insert("turn".into(), "session/prompt".into());
    value.requests.lock().unwrap().insert(
        "\"approval\"".into(),
        process::PendingServer {
            method: "session/request_permission".into(),
            params: json!({"sessionId":"owned-session"}),
            executed: false,
        },
    );
    let state = app.state::<AgentHostState>();
    state.attention.lock().unwrap().enabled = Some(true);
    state
        .connections
        .lock()
        .unwrap()
        .insert(process.id.clone(), process.clone());
    let barrier = |expected: usize| -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel();
        let app = app.clone();
        let id = process.id.clone();
        window
            .run_on_main_thread(move || {
                let host = app.state::<AgentHostState>();
                let state = host.attention.lock().unwrap();
                let count = state.pending.get(&id).map_or(0, |p| p.ids.len());
                let _ = tx.send(count);
            })
            .map_err(|e| e.to_string())?;
        if rx
            .recv_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?
            != expected
        {
            return Err("native attention ownership or cleanup failed".into());
        }
        Ok(())
    };
    let before = crate::windows::is_focused(window).map_err(|e| e.to_string())?;
    agent_sync_attention(
        other.clone(),
        process.id.clone(),
        vec!["\"approval\"".into()],
    )?;
    barrier(0)?;
    agent_sync_attention(window.clone(), process.id.clone(), vec!["forged".into()])?;
    barrier(0)?;
    agent_sync_attention(
        window.clone(),
        process.id.clone(),
        vec!["\"approval\"".into()],
    )?;
    barrier(1)?;
    agent_sync_attention(
        window.clone(),
        process.id.clone(),
        vec!["\"approval\"".into()],
    )?;
    barrier(1)?;
    assert_eq!(
        before,
        crate::windows::is_focused(window).map_err(|e| e.to_string())?
    );
    assert!(!process.requests.lock().unwrap()["\"approval\""].executed);
    use tauri::Listener;
    let (ended_tx, ended_rx) = std::sync::mpsc::channel();
    let listener = window.listen("marklyra:agent-event", move |event| {
        let value: Value = serde_json::from_str(event.payload()).unwrap();
        if value["kind"] == "interaction-ended" {
            let _ = ended_tx.send(value);
        }
    });
    finished(window, &process.id, Some("\"approval\""));
    barrier(0)?;
    if ended_rx.try_recv().is_ok() {
        return Err(
            "normal completion must not revoke a subsequently reused ACP request ID".into(),
        );
    }
    let expired_id = Uuid::new_v4().to_string();
    expired(window, &process.id, &expired_id);
    barrier(0)?;
    let event = ended_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    assert_eq!(event["connectionId"], process.id);
    assert_eq!(event["requestId"], expired_id);
    window.unlisten(listener);
    process.stop();
    barrier(0)?;
    agent_sync_attention(
        window.clone(),
        process.id.clone(),
        vec!["\"approval\"".into()],
    )?;
    barrier(0)?;
    state.connections.lock().unwrap().remove(&process.id);
    println!("Native attention passed: owner validation, duplicate request, no focus change, stop and stale-request cleanup");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ids(values: &[&str]) -> HashSet<String> {
        values.iter().map(|v| v.to_string()).collect()
    }
    #[test]
    fn legacy_settings_default_on_and_roundtrip_disabled() {
        let mut saved: AgentSettings =
            serde_json::from_value(json!({"profiles":[],"defaultProfileId":null})).unwrap();
        assert!(saved.attention_enabled);
        saved.attention_enabled = false;
        let root = tempfile::tempdir().unwrap();
        save_settings(root.path(), &saved).unwrap();
        assert!(!settings(root.path()).unwrap().attention_enabled);
    }
    #[test]
    fn reminders_are_coalesced_and_focus_does_not_rearm_them() {
        let mut state = Attention::default();
        assert!(state.sync("c", "w", ids(&["a"]), false));
        assert!(!state.sync("c", "w", ids(&["a", "b"]), false));
        state.active.clear();
        assert!(!state.sync("c", "w", ids(&["a", "b"]), false));
        state.finish("c", Some("a"));
        assert!(!state.active.contains("w"));
        state.finish("c", Some("b"));
        assert!(state.sync("c", "w", ids(&["a"]), false));
    }
    #[test]
    fn windows_and_connections_clean_up_independently() {
        let mut state = Attention::default();
        assert!(state.sync("c1", "w1", ids(&["a"]), false));
        assert!(state.sync("c2", "w2", ids(&["a"]), false));
        state.finish("c1", None);
        assert_eq!(state.active, ids(&["w2"]));
        state.finish("c2", None);
        assert!(state.active.is_empty());
    }
    #[test]
    fn same_window_connections_share_one_attention_episode() {
        let mut state = Attention::default();
        assert!(state.sync("a", "window", ids(&["1"]), false));
        assert!(!state.sync("b", "window", ids(&["2"]), false));
        state.finish("a", None);
        assert_eq!(state.active, ids(&["window"]));
        state.finish("b", None);
        assert!(state.active.is_empty());
    }
    #[test]
    fn disabled_and_foreground_requests_are_not_replayed() {
        let mut state = Attention {
            enabled: Some(false),
            ..Default::default()
        };
        assert!(!state.sync("c", "w", ids(&["a"]), false));
        state.enabled = Some(true);
        assert!(!state.sync("c", "w", ids(&["a"]), false));
        state.finish("c", None);
        assert!(!state.sync("c", "w", ids(&["b"]), true));
        assert!(!state.sync("c", "w", ids(&["b"]), false));
    }
}
