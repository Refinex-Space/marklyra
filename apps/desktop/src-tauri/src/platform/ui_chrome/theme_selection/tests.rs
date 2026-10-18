use super::*;
use std::sync::atomic::{AtomicUsize, Ordering};

fn origin(opener: &str, generation: u64) -> Origin {
    Origin {
        opener: opener.into(),
        generation,
    }
}
fn begin(state: &mut PendingState, current: &Origin) -> Begun {
    state
        .begin(current.clone(), Instant::now(), REQUEST_TIMEOUT)
        .unwrap()
}

#[test]
fn preference_reply_stays_pending_until_one_valid_editor_commit_finishes() {
    let mut state = PendingState::default();
    let current = origin("main", 1);
    let begun = begin(&mut state, &current);
    assert!(matches!(
        begun.receiver.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    assert!(state
        .begin(current.clone(), Instant::now(), REQUEST_TIMEOUT)
        .is_err());
    let accepts = AtomicUsize::new(0);
    assert!(state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || {
                accepts.fetch_add(1, Ordering::SeqCst);
                Ok(())
            }
        )
        .unwrap());
    assert_eq!(accepts.load(Ordering::SeqCst), 1);
    assert_eq!(begun.receiver.try_recv().unwrap(), Ok(()));
    assert!(state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || panic!("repeated ACK must not accept resources")
        )
        .is_err());
}
#[test]
fn editor_failure_rejects_preferences_without_accepting_resources() {
    let mut state = PendingState::default();
    let current = origin("main", 1);
    let begun = begin(&mut state, &current);
    assert!(!state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&current),
            Err("CSS failed".into()),
            Instant::now(),
            || panic!("failed CSS must not accept resources")
        )
        .unwrap());
    assert_eq!(begun.receiver.try_recv().unwrap(), Err("CSS failed".into()));
    assert!(state.0.is_none());
}
#[test]
fn style_acceptance_failure_rejects_both_requests_and_emits_only_its_cancel_token() {
    let mut state = PendingState::default();
    let current = origin("editor-owner", 4);
    let begun = begin(&mut state, &current);
    let error = state
        .complete(
            "editor-owner",
            &begun.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || Err("resource expired".into()),
        )
        .unwrap_err();
    assert_eq!(error.message, "resource expired");
    let cancelled = error.cancelled.unwrap();
    assert_eq!(cancelled.opener, "editor-owner");
    assert_eq!(cancelled.token, begun.ticket.token);
    assert_eq!(
        serde_json::to_value(cancelled).unwrap(),
        serde_json::json!({"token":begun.ticket.token})
    );
    assert_eq!(
        begun.receiver.try_recv().unwrap(),
        Err("resource expired".into())
    );
}
#[test]
fn foreign_windows_and_unknown_tokens_cannot_complete_or_cancel_the_pending_request() {
    let mut state = PendingState::default();
    let current = origin("editor-owner", 1);
    let begun = begin(&mut state, &current);
    for (editor, token) in [
        ("main", begun.ticket.token.as_str()),
        ("editor-owner", "wrong-token"),
    ] {
        let error = state
            .complete(
                editor,
                token,
                Some(&current),
                Ok(()),
                Instant::now(),
                || panic!("foreign request must not accept"),
            )
            .unwrap_err();
        assert!(error.cancelled.is_none());
        assert!(state.0.is_some());
    }
    assert!(matches!(
        begun.receiver.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    assert!(state
        .complete(
            "editor-owner",
            &begun.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || Ok(())
        )
        .unwrap());
}
#[test]
fn opener_or_preferences_destruction_wakes_the_waiter_and_late_ack_is_rejected() {
    for label in ["preferences", "editor-owner"] {
        let host = ThemePreferenceHost::default();
        let current = origin("editor-owner", 1);
        let begun = begin(&mut host.0.lock().unwrap(), &current);
        let token = begun.ticket.token.clone();
        let waiter_host = host.clone();
        let (sender, receiver) = mpsc::channel();
        let worker = std::thread::spawn(move || {
            let result = wait_for_result(&waiter_host, begun.ticket, begun.receiver);
            sender.send(result.result).unwrap();
        });
        let notice = host.0.lock().unwrap().cancel_window(label).unwrap();
        assert_eq!(notice.token, token);
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(2)).unwrap(),
            Err(CLOSED_ERROR.into())
        );
        worker.join().unwrap();
        assert!(host
            .0
            .lock()
            .unwrap()
            .complete(
                "editor-owner",
                &token,
                Some(&current),
                Ok(()),
                Instant::now(),
                || panic!("closed request must not accept")
            )
            .is_err());
    }
}
#[test]
fn unrelated_windows_do_not_cancel_an_active_request() {
    let mut state = PendingState::default();
    let current = origin("main", 1);
    let begun = begin(&mut state, &current);
    for label in ["editor-other", "print-preview-1", "unknown"] {
        assert!(state.cancel_window(label).is_none());
    }
    assert!(matches!(
        begun.receiver.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    assert!(state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || Ok(())
        )
        .unwrap());
}
#[test]
fn the_same_opener_with_a_new_preferences_generation_revokes_the_old_request() {
    let mut state = PendingState::default();
    let previous = origin("main", 1);
    let current = origin("main", 2);
    let begun = begin(&mut state, &previous);
    let error = state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || panic!("old generation must not accept"),
        )
        .unwrap_err();
    assert_eq!(error.cancelled.unwrap().token, begun.ticket.token);
    assert_eq!(begun.receiver.try_recv().unwrap(), Err(CLOSED_ERROR.into()));
    let next = begin(&mut state, &current);
    assert!(state
        .complete(
            "main",
            &next.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || Ok(())
        )
        .unwrap());
}
#[test]
fn changing_the_opener_cancels_immediately_and_does_not_retarget_the_old_token() {
    let mut state = PendingState::default();
    let previous = origin("main", 1);
    let current = origin("editor-next", 2);
    let first = begin(&mut state, &previous);
    let next = begin(&mut state, &current);
    let notice = next.cancelled.unwrap();
    assert_eq!(notice.opener, "main");
    assert_eq!(notice.token, first.ticket.token);
    assert_eq!(first.receiver.try_recv().unwrap(), Err(CLOSED_ERROR.into()));
    assert!(state
        .complete(
            "main",
            &first.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || panic!("old opener must not accept")
        )
        .is_err());
    assert!(state
        .complete(
            "editor-next",
            &next.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || Ok(())
        )
        .unwrap());
}
#[test]
fn an_origin_close_clears_pending_and_a_superseded_notification_preserves_current_generation() {
    let mut state = PendingState::default();
    let current = origin("main", 1);
    let begun = begin(&mut state, &current);
    assert!(state.cancel_superseded(Some(&current)).is_none());
    let notice = state.cancel_superseded(None).unwrap();
    assert_eq!(notice.token, begun.ticket.token);
    assert_eq!(begun.receiver.try_recv().unwrap(), Err(CLOSED_ERROR.into()));
}
#[test]
fn timeout_revokes_resources_before_any_accept_and_a_late_ack_cannot_succeed() {
    let host = ThemePreferenceHost::default();
    let current = origin("main", 1);
    let begun = host
        .0
        .lock()
        .unwrap()
        .begin(current.clone(), Instant::now(), Duration::ZERO)
        .unwrap();
    let token = begun.ticket.token.clone();
    let waited = wait_for_result(&host, begun.ticket, begun.receiver);
    assert_eq!(waited.result, Err(TIMEOUT_ERROR.into()));
    assert_eq!(waited.cancelled.unwrap().token, token);
    assert!(host
        .0
        .lock()
        .unwrap()
        .complete(
            "main",
            &token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || panic!("timed out request must not accept")
        )
        .is_err());
}
#[test]
fn completion_at_deadline_cannot_accept_even_if_waiter_has_not_started() {
    let mut state = PendingState::default();
    let current = origin("main", 1);
    let begun = begin(&mut state, &current);
    let error = state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&current),
            Ok(()),
            begun.ticket.deadline,
            || panic!("expired request must not accept"),
        )
        .unwrap_err();
    assert_eq!(error.message, TIMEOUT_ERROR);
    assert!(error.cancelled.is_some());
    assert_eq!(
        begun.receiver.try_recv().unwrap(),
        Err(TIMEOUT_ERROR.into())
    );
}
#[test]
fn timely_completion_already_in_the_channel_wins_a_waiter_starting_after_deadline() {
    let host = ThemePreferenceHost::default();
    let current = origin("main", 1);
    let start = Instant::now() - Duration::from_secs(1);
    let begun = host
        .0
        .lock()
        .unwrap()
        .begin(current.clone(), start, Duration::from_millis(10))
        .unwrap();
    assert!(host
        .0
        .lock()
        .unwrap()
        .complete(
            "main",
            &begun.ticket.token,
            Some(&current),
            Ok(()),
            start + Duration::from_millis(1),
            || Ok(())
        )
        .unwrap());
    let waited = wait_for_result(&host, begun.ticket, begun.receiver);
    assert_eq!(waited.result, Ok(()));
    assert!(waited.cancelled.is_none());
}
#[test]
fn an_old_waiter_timeout_never_cancels_a_newer_request() {
    let host = ThemePreferenceHost::default();
    let current = origin("main", 1);
    let old = host
        .0
        .lock()
        .unwrap()
        .begin(current.clone(), Instant::now(), Duration::ZERO)
        .unwrap();
    let next = begin(&mut host.0.lock().unwrap(), &current);
    assert_eq!(next.cancelled.as_ref().unwrap().token, old.ticket.token);
    assert_eq!(
        wait_for_result(&host, old.ticket, old.receiver).result,
        Err(TIMEOUT_ERROR.into())
    );
    assert!(host
        .0
        .lock()
        .unwrap()
        .complete(
            "main",
            &next.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || Ok(())
        )
        .unwrap());
}
#[test]
fn request_payload_contains_only_token_and_safe_theme_identity() {
    let request = ThemeRequest {
        token: uuid::Uuid::new_v4().to_string(),
        theme_id: "中文.theme".into(),
        target: None,
    };
    assert!(crate::themes::valid_theme_id(&request.theme_id));
    let value = serde_json::to_value(&request).unwrap();
    assert_eq!(
        value,
        serde_json::json!({"token":request.token,"themeId":"中文.theme"})
    );
    assert!(uuid::Uuid::parse_str(value["token"].as_str().unwrap()).is_ok());
}

fn actual_theme_leases() -> (
    tempfile::TempDir,
    crate::themes::ThemeHost,
    crate::themes::PreparedThemeStyles,
    crate::themes::PreparedThemeStyles,
) {
    let config = tempfile::tempdir().unwrap();
    let themes = crate::themes::ThemeHost::default();
    themes.register_window("main").unwrap();
    themes.catalog(config.path()).unwrap();
    std::fs::write(config.path().join("themes/marklyra-light.css"), b"old{}").unwrap();
    std::fs::write(config.path().join("themes/gothic.css"), b"new{}").unwrap();
    let old = themes
        .prepare_styles(
            themes.begin_load("main", 1).unwrap(),
            "marklyra-light",
            config.path(),
        )
        .unwrap();
    themes.accept_styles("main", &old.token).unwrap();
    let new = themes
        .prepare_styles(
            themes.begin_load("main", 2).unwrap(),
            "gothic",
            config.path(),
        )
        .unwrap();
    (config, themes, old, new)
}
#[test]
fn preferences_receives_success_only_after_the_real_theme_host_accepts_the_pending_styles() {
    let (_config, themes, old, new) = actual_theme_leases();
    let mut state = PendingState::default();
    let current = origin("main", 1);
    let begun = begin(&mut state, &current);
    assert!(matches!(
        begun.receiver.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    assert!(state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&current),
            Ok(()),
            Instant::now(),
            || themes.accept_styles("main", &new.token)
        )
        .unwrap());
    assert_eq!(begun.receiver.try_recv().unwrap(), Ok(()));
    assert_eq!(
        crate::themes::resource_response(
            &themes,
            "main",
            &old.token,
            "marklyra-light.css",
            &tauri::http::Method::GET
        )
        .status(),
        tauri::http::StatusCode::NOT_FOUND
    );
    assert_eq!(
        crate::themes::resource_response(
            &themes,
            "main",
            &new.token,
            "gothic.css",
            &tauri::http::Method::GET
        )
        .status(),
        tauri::http::StatusCode::OK
    );
}
#[test]
fn expired_preferences_completion_does_not_accept_resources_or_destroy_the_old_active_styles() {
    let (_config, themes, old, new) = actual_theme_leases();
    let mut state = PendingState::default();
    let current = origin("main", 1);
    let begun = begin(&mut state, &current);
    assert!(state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&current),
            Ok(()),
            begun.ticket.deadline,
            || themes.accept_styles("main", &new.token)
        )
        .is_err());
    assert_eq!(
        begun.receiver.try_recv().unwrap(),
        Err(TIMEOUT_ERROR.into())
    );
    assert_eq!(
        crate::themes::resource_response(
            &themes,
            "main",
            &old.token,
            "marklyra-light.css",
            &tauri::http::Method::GET
        )
        .status(),
        tauri::http::StatusCode::OK
    );
    assert_eq!(
        crate::themes::resource_response(
            &themes,
            "main",
            &new.token,
            "gothic.css",
            &tauri::http::Method::GET
        )
        .status(),
        tauri::http::StatusCode::OK
    );
}
