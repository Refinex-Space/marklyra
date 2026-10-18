use super::*;
fn origin() -> Origin {
    Origin {
        opener: "main".into(),
        generation: 1,
    }
}
fn change() -> MarkdownPreferenceChange {
    MarkdownPreferenceChange {
        indent_size: Some(4),
        pretty_indent: Some(true),
        ..Default::default()
    }
}
fn receipt() -> MarkdownPreferences {
    MarkdownPreferences {
        schema_version: 1,
        revision: 1,
        indent_size: 4,
        pretty_indent: true,
        ..Default::default()
    }
}
fn begin(state: &mut PendingState, now: Instant) -> Begun {
    state
        .begin(
            origin(),
            MarkdownPreferences::default(),
            change(),
            now,
            Duration::from_secs(30),
        )
        .unwrap()
}

#[test]
fn only_the_exact_opener_ticket_can_commit_after_its_sdk_ack() {
    let now = Instant::now();
    let mut state = PendingState::default();
    let begun = begin(&mut state, now);
    assert!(state
        .complete(
            "other",
            &begun.ticket.token,
            Some(&origin()),
            None,
            now,
            |_, _| panic!("wrong editor committed")
        )
        .is_err());
    assert!(state
        .complete("main", "wrong", Some(&origin()), None, now, |_, _| panic!(
            "wrong token committed"
        ))
        .is_err());
    assert!(matches!(
        begun.receiver.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    let saved = state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&origin()),
            None,
            now,
            |before, value| {
                assert_eq!(before.revision, 0);
                assert_eq!(value.indent_size, Some(4));
                Ok(receipt())
            },
        )
        .unwrap()
        .unwrap();
    assert_eq!(saved, receipt());
    assert_eq!(begun.receiver.recv().unwrap().unwrap(), receipt());
    assert!(state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&origin()),
            None,
            now,
            |_, _| panic!("duplicate commit")
        )
        .is_err());
}
#[test]
fn failed_storage_keeps_the_ticket_until_the_opener_compensates() {
    let now = Instant::now();
    let mut state = PendingState::default();
    let begun = begin(&mut state, now);
    let error = state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&origin()),
            None,
            now,
            |_, _| Err("write failed".into()),
        )
        .unwrap_err();
    assert_eq!(error.message, "write failed");
    assert!(state.0.is_some());
    assert!(matches!(
        begun.receiver.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
    assert!(state
        .complete(
            "main",
            &begun.ticket.token,
            Some(&origin()),
            Some("write failed; restored".into()),
            now,
            |_, _| panic!("compensation must not persist")
        )
        .unwrap()
        .is_none());
    assert_eq!(
        begun.receiver.recv().unwrap().unwrap_err(),
        "write failed; restored"
    );
}
#[test]
fn stale_generations_and_expired_receipts_cannot_persist() {
    for expired in [false, true] {
        let now = Instant::now();
        let mut state = PendingState::default();
        let begun = begin(&mut state, now);
        let current = if expired {
            origin()
        } else {
            Origin {
                generation: 2,
                ..origin()
            }
        };
        let result = state.complete(
            "main",
            &begun.ticket.token,
            Some(&current),
            None,
            if expired {
                now + Duration::from_secs(30)
            } else {
                now
            },
            |_, _| panic!("stale commit"),
        );
        assert!(result.is_err());
        assert!(begun.receiver.recv().unwrap().is_err());
        assert!(state.0.is_none());
    }
}
#[test]
fn closing_or_retargeting_cancels_only_the_owning_request() {
    let now = Instant::now();
    let mut state = PendingState::default();
    let first = begin(&mut state, now);
    assert!(state.cancel_window("other").is_none());
    let next = Origin {
        opener: "editor-next".into(),
        generation: 2,
    };
    let second = state
        .begin(
            next.clone(),
            MarkdownPreferences::default(),
            change(),
            now,
            Duration::from_secs(30),
        )
        .unwrap();
    assert_eq!(second.cancelled.unwrap().token, first.ticket.token);
    assert!(first.receiver.recv().unwrap().is_err());
    assert!(state
        .complete(
            "main",
            &first.ticket.token,
            Some(&next),
            None,
            now,
            |_, _| panic!("old commit")
        )
        .is_err());
    assert!(state.cancel_window("preferences").is_some());
    assert!(second.receiver.recv().unwrap().is_err());
}
#[test]
fn write_errors_are_reconciled_only_against_the_exact_next_revision_and_values() {
    assert_eq!(
        reconcile_write(
            &MarkdownPreferences::default(),
            change(),
            Err("after rename".into()),
            || Ok(receipt())
        )
        .unwrap(),
        receipt()
    );
    for current in [
        MarkdownPreferences::default(),
        MarkdownPreferences {
            revision: 2,
            ..receipt()
        },
        MarkdownPreferences {
            pretty_indent: false,
            ..receipt()
        },
        MarkdownPreferences {
            heading_style: 1,
            ..receipt()
        },
        MarkdownPreferences {
            ul_style: 1,
            ..receipt()
        },
        MarkdownPreferences {
            ol_style: 1,
            ..receipt()
        },
    ] {
        assert!(reconcile_write(
            &MarkdownPreferences::default(),
            change(),
            Err("failed".into()),
            || Ok(current)
        )
        .is_err());
    }
    assert!(reconcile_write(
        &MarkdownPreferences::default(),
        change(),
        Err("failed".into()),
        || Err("locked".into())
    )
    .unwrap_err()
    .contains("无法确认"));
}
#[test]
fn serializer_write_reconciliation_requires_the_requested_and_unchanged_styles() {
    let before = MarkdownPreferences {
        heading_style: 3,
        ul_style: 2,
        ol_style: 1,
        ..Default::default()
    };
    let change = MarkdownPreferenceChange {
        heading_style: Some(1),
        ul_style: Some(0),
        ..Default::default()
    };
    let receipt = MarkdownPreferences {
        revision: 1,
        heading_style: 1,
        ul_style: 0,
        ..before.clone()
    };
    assert_eq!(
        reconcile_write(&before, change, Err("after rename".into()), || Ok(
            receipt.clone()
        ))
        .unwrap(),
        receipt
    );
    for mismatched in [
        MarkdownPreferences {
            heading_style: 3,
            ..receipt.clone()
        },
        MarkdownPreferences {
            ul_style: 2,
            ..receipt.clone()
        },
        MarkdownPreferences {
            ol_style: 0,
            ..receipt.clone()
        },
    ] {
        assert!(reconcile_write(&before, change, Err("failed".into()), || Ok(mismatched)).is_err());
    }
}
#[test]
fn optional_change_fields_are_omitted_in_the_native_message() {
    let value = serde_json::to_value(MarkdownPreferenceChange {
        indent_size: Some(0),
        pretty_indent: None,
        ..Default::default()
    })
    .unwrap();
    assert_eq!(value, serde_json::json!({"indentSize":0}));
    assert_eq!(
        serde_json::to_value(MarkdownPreferenceChange {
            heading_style: Some(3),
            ul_style: Some(2),
            ol_style: Some(1),
            ..Default::default()
        })
        .unwrap(),
        serde_json::json!({"headingStyle":3,"ulStyle":2,"olStyle":1})
    );
}

#[test]
fn a_second_live_request_cannot_replace_the_same_origins_pending_change() {
    let now = Instant::now();
    let mut state = PendingState::default();
    let first = begin(&mut state, now);
    assert!(state
        .begin(
            origin(),
            MarkdownPreferences::default(),
            change(),
            now,
            Duration::from_secs(30),
        )
        .is_err());
    assert_eq!(state.0.as_ref().unwrap().token, first.ticket.token);
    assert!(matches!(
        first.receiver.try_recv(),
        Err(mpsc::TryRecvError::Empty)
    ));
}

#[test]
fn a_new_request_replaces_an_expired_ticket_and_wait_receives_the_exact_error() {
    let now = Instant::now();
    let mut state = PendingState::default();
    let first = begin(&mut state, now);
    let second = state
        .begin(
            origin(),
            MarkdownPreferences::default(),
            change(),
            now + Duration::from_secs(30),
            Duration::from_secs(30),
        )
        .unwrap();
    assert_eq!(second.cancelled.unwrap().token, first.ticket.token);
    assert_eq!(first.receiver.recv().unwrap().unwrap_err(), TIMEOUT_ERROR);
    assert_eq!(state.0.as_ref().unwrap().token, second.ticket.token);
}

fn slow_claimed_io(accept: bool) {
    // Inject the admission timeline, then gate actual worker threads at the IO boundary.
    // Claim is t=29s; the waiter's actual clock is past t=40s, without a 40s test sleep.
    let started = Instant::now() - Duration::from_secs(40);
    let host = MarkdownPreferenceRequestHost::default();
    let begun = begin(&mut host.0.lock().unwrap(), started);
    let token = begun.ticket.token.clone();
    let origin_lock = Arc::new(Mutex::new(()));
    let (entered_send, entered) = mpsc::channel();
    let (release, release_recv) = mpsc::channel();
    let writer_host = host.clone();
    let writer_origin = origin_lock.clone();
    let writer_token = token.clone();
    let writer = std::thread::spawn(move || {
        let origin_guard = writer_origin.lock().unwrap();
        writer_host.0.lock().unwrap().complete(
            "main",
            &writer_token,
            Some(&origin()),
            None,
            started + Duration::from_secs(29),
            |_, _| {
                // Mirrors the Native command: origin admission lock is released
                // once complete has claimed, before entering synchronous IO.
                drop(origin_guard);
                entered_send.send(()).unwrap();
                release_recv.recv().unwrap();
                if accept {
                    Ok(receipt())
                } else {
                    Err("slow write failed".into())
                }
            },
        )
    });
    entered.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(
        origin_lock.try_lock().is_ok(),
        "GUI origin lock held during IO"
    );
    assert!(matches!(
        host.0.try_lock(),
        Err(std::sync::TryLockError::WouldBlock)
    ));
    let waiter_host = host.clone();
    let (finished_send, finished) = mpsc::channel();
    let waiter = std::thread::spawn(move || {
        finished_send
            .send(wait_for_result(&waiter_host, begun.ticket, begun.receiver))
            .unwrap();
    });
    assert!(matches!(
        finished.recv_timeout(Duration::from_millis(10)),
        Err(mpsc::RecvTimeoutError::Timeout)
    ));
    release.send(()).unwrap();
    let completion = writer.join().unwrap();
    if accept {
        assert_eq!(completion.unwrap(), Some(receipt()));
        let waited = finished.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(waited.result.unwrap(), receipt());
        assert!(waited.cancelled.is_none());
    } else {
        assert_eq!(completion.unwrap_err().message, "slow write failed");
        // No timeout may preempt the opener's get/SDK compensation after a claim.
        assert!(matches!(
            finished.recv_timeout(Duration::from_millis(10)),
            Err(mpsc::RecvTimeoutError::Timeout)
        ));
        let mut state = host.0.lock().unwrap();
        assert!(state.0.as_ref().unwrap().claimed);
        assert!(state
            .begin(
                origin(),
                MarkdownPreferences::default(),
                change(),
                Instant::now(),
                Duration::from_secs(30),
            )
            .is_err());
        state
            .complete(
                "main",
                &token,
                Some(&origin()),
                Some("read confirmed old value; SDK restored".into()),
                Instant::now(),
                |_, _| panic!("error receipt must not write"),
            )
            .unwrap();
        drop(state);
        let waited = finished.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(
            waited.result.unwrap_err(),
            "read confirmed old value; SDK restored"
        );
        assert!(waited.cancelled.is_none());
    }
    waiter.join().unwrap();
}

#[test]
fn a_deadline_admitted_slow_claim_reports_the_real_success_and_releases_the_gui_origin() {
    slow_claimed_io(true);
}

#[test]
fn a_failed_slow_claim_keeps_waiting_past_the_deadline_until_sdk_compensation_finishes() {
    slow_claimed_io(false);
}
