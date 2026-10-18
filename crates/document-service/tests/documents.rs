use std::{fs, path::Path};

use document_service::{DocumentError, DocumentService, Encoding, MAX_TEXT_BYTES};

const SOURCE: &str = "---\r\ntitle: 样本\n---\r\n\r\n  # Heading  \r\n\n-   a\r\n- b\n\n| a | b |\r\n|---|---|\n| 中 | 🙂 |\r\n\n```text\n  keep \t \r\n```\n\n";

fn with_document(test: impl FnOnce(&Path, &mut DocumentService)) {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("note.md");
    let mut service = DocumentService::new();
    test(&path, &mut service);
}

fn encodings() -> [Encoding; 4] {
    [
        Encoding::Utf8,
        Encoding::Utf8Bom,
        Encoding::Utf16LeBom,
        Encoding::Utf16BeBom,
    ]
}

#[test]
fn no_change_preserves_bytes_and_modification_time_for_all_encodings() {
    for encoding in encodings() {
        with_document(|path, service| {
            let bytes = encoding.encode(SOURCE).unwrap();
            fs::write(path, &bytes).unwrap();
            let modified = fs::metadata(path).unwrap().modified().unwrap();
            #[cfg(unix)]
            let inode = {
                use std::os::unix::fs::MetadataExt;
                fs::metadata(path).unwrap().ino()
            };
            let opened = service.open_authorized(path).unwrap();
            assert_eq!(opened.text, SOURCE);
            assert_eq!(opened.encoding, encoding.label());
            let saved = service.save(&opened.id, &opened.text).unwrap();
            assert_eq!(saved, opened);
            assert_eq!(fs::read(path).unwrap(), bytes);
            assert_eq!(fs::metadata(path).unwrap().modified().unwrap(), modified);
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                assert_eq!(fs::metadata(path).unwrap().ino(), inode);
            }
        });
    }
}

#[test]
fn local_edit_preserves_other_text_encoding_bom_and_mixed_newlines() {
    for encoding in encodings() {
        with_document(|path, service| {
            fs::write(path, encoding.encode(SOURCE).unwrap()).unwrap();
            let opened = service.open_authorized(path).unwrap();
            let edited = SOURCE.replacen("Heading", "新标题 🦀", 1);
            let saved = service.save(&opened.id, &edited).unwrap();
            assert_eq!(saved.text, edited);
            assert_eq!(fs::read(path).unwrap(), encoding.encode(&edited).unwrap());
            assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
        });
    }
}

#[test]
fn external_modification_prevents_both_changed_and_unchanged_save() {
    with_document(|path, service| {
        fs::write(path, b"original").unwrap();
        let opened = service.open_authorized(path).unwrap();
        fs::write(path, b"external").unwrap();
        for text in ["ours", "original"] {
            assert!(matches!(
                service.save(&opened.id, text),
                Err(DocumentError::ExternalChange)
            ));
            assert_eq!(fs::read(path).unwrap(), b"external");
        }
    });
}

#[test]
fn deleted_file_is_not_silently_recreated() {
    with_document(|path, service| {
        fs::write(path, b"original").unwrap();
        let opened = service.open_authorized(path).unwrap();
        fs::remove_file(path).unwrap();
        assert!(matches!(
            service.save(&opened.id, "ours"),
            Err(DocumentError::ExternalChange)
        ));
        assert!(!path.exists());
    });
}

#[test]
fn invalid_encoding_and_binary_nuls_are_rejected() {
    for bytes in [
        vec![0xff],
        vec![0xfe, 0xff, 0],
        vec![0xff, 0xfe, 0, 0],
        vec![0xfe, 0xff, 0xd8, 0],
        vec![0x80],
        b"h\0e\0l\0l\0o\0".to_vec(),
    ] {
        assert!(matches!(
            Encoding::decode(&bytes),
            Err(DocumentError::UnsupportedEncoding)
        ));
    }
}

#[test]
fn empty_documents_and_leading_bom_are_roundtripped() {
    for encoding in encodings() {
        for text in [
            "",
            "\u{feff}literal BOM character",
            "😀\r\n日本語\r한국어\n",
        ] {
            let bytes = encoding.encode(text).unwrap();
            // A leading U+FEFF in an otherwise BOM-less UTF-8 file is inherently
            // indistinguishable from a file BOM, but the encoded bytes stay intact.
            let (decoded_encoding, decoded) = Encoding::decode(&bytes).unwrap();
            assert_eq!(decoded_encoding.encode(&decoded).unwrap(), bytes);
        }
    }
}

#[test]
fn save_as_keeps_source_encoding_without_changing_original() {
    for encoding in encodings() {
        with_document(|path, service| {
            let bytes = encoding.encode(SOURCE).unwrap();
            fs::write(path, &bytes).unwrap();
            let opened = service.open_authorized(path).unwrap();
            let destination = path.with_file_name("copy.md");
            let copied = service
                .save_as_authorized(&destination, "副本", Some(&opened.id))
                .unwrap();
            assert_ne!(copied.id, opened.id);
            assert_eq!(copied.encoding, encoding.label());
            assert_eq!(fs::read(path).unwrap(), bytes);
            assert_eq!(
                fs::read(destination).unwrap(),
                encoding.encode("副本").unwrap()
            );
        });
    }
}

#[test]
fn save_as_to_same_path_does_not_bypass_conflict() {
    with_document(|path, service| {
        fs::write(path, b"original").unwrap();
        let opened = service.open_authorized(path).unwrap();
        fs::write(path, b"external").unwrap();
        assert!(matches!(
            service.save_as_authorized(path, "ours", Some(&opened.id)),
            Err(DocumentError::ExternalChange)
        ));
        assert_eq!(fs::read(path).unwrap(), b"external");
    });
}

#[test]
fn new_save_as_defaults_to_utf8_and_opens_registered_document() {
    with_document(|path, service| {
        let created = service
            .save_as_authorized(path, "# 你好\r\n", None)
            .unwrap();
        assert_eq!(created.encoding, "UTF-8");
        assert_eq!(fs::read(path).unwrap(), "# 你好\r\n".as_bytes());
        service.save(&created.id, "changed").unwrap();
        assert_eq!(fs::read(path).unwrap(), b"changed");
        let reopened = service.open_authorized(path).unwrap();
        assert_ne!(reopened.id, created.id);
        assert_eq!(reopened.text, "changed");
    });
}

#[test]
fn runtime_untitled_save_as_preserves_supported_encoding_bom_and_raw_bytes() {
    for encoding in encodings() {
        with_document(|path, service| {
            assert_eq!(Encoding::from_label(encoding.label()).unwrap(), encoding);
            let created = service
                .save_as_authorized_with_encoding(path, SOURCE, None, Some(encoding.label()))
                .unwrap();
            assert_eq!(created.encoding, encoding.label());
            assert_eq!(fs::read(path).unwrap(), encoding.encode(SOURCE).unwrap());
            let edited = SOURCE.replacen("Heading", "恢复文档 😀", 1);
            service.save(&created.id, &edited).unwrap();
            assert_eq!(fs::read(path).unwrap(), encoding.encode(&edited).unwrap());
        });
    }
}

#[test]
fn unknown_encoding_hint_does_not_create_or_replace_a_file() {
    for label in [
        "utf-8",
        "UTF-16",
        "UTF-32",
        "ISO-8859-1",
        " UTF-8",
        "UTF-8\0",
    ] {
        with_document(|path, service| {
            assert!(matches!(
                Encoding::from_label(label),
                Err(DocumentError::UnsupportedEncoding)
            ));
            assert!(matches!(
                service.save_as_authorized_with_encoding(path, "ours", None, Some(label)),
                Err(DocumentError::UnsupportedEncoding)
            ));
            assert!(!path.exists());
            fs::write(path, b"original").unwrap();
            assert!(matches!(
                service.save_as_authorized_with_encoding(path, "ours", None, Some(label)),
                Err(DocumentError::UnsupportedEncoding)
            ));
            assert_eq!(fs::read(path).unwrap(), b"original");
        });
    }
}

#[test]
fn explicit_encoding_cannot_override_an_existing_source_session() {
    for original in encodings() {
        for requested in encodings() {
            if original == requested {
                continue;
            }
            with_document(|path, service| {
                let bytes = original.encode(SOURCE).unwrap();
                fs::write(path, &bytes).unwrap();
                let opened = service.open_authorized(path).unwrap();
                let new_path = path.with_file_name("new.md");
                for target in [path, new_path.as_path()] {
                    assert!(matches!(
                        service.save_as_authorized_with_encoding(
                            target,
                            "ours",
                            Some(&opened.id),
                            Some(requested.label())
                        ),
                        Err(DocumentError::EncodingConflict)
                    ));
                }
                assert!(!new_path.exists());
                assert_eq!(fs::read(path).unwrap(), bytes);
                fs::write(&new_path, b"existing destination").unwrap();
                assert!(matches!(
                    service.save_as_authorized_with_encoding(
                        &new_path,
                        "ours",
                        Some(&opened.id),
                        Some(requested.label())
                    ),
                    Err(DocumentError::EncodingConflict)
                ));
                assert_eq!(fs::read(new_path).unwrap(), b"existing destination");
            });
        }
    }
}

#[test]
fn matching_encoding_hint_preserves_same_path_conflict_protection() {
    for encoding in encodings() {
        with_document(|path, service| {
            let bytes = encoding.encode(SOURCE).unwrap();
            fs::write(path, bytes).unwrap();
            let opened = service.open_authorized(path).unwrap();
            fs::write(path, b"external changed").unwrap();
            assert!(matches!(
                service.save_as_authorized_with_encoding(
                    path,
                    "ours",
                    Some(&opened.id),
                    Some(encoding.label())
                ),
                Err(DocumentError::ExternalChange)
            ));
            assert_eq!(fs::read(path).unwrap(), b"external changed");
        });
    }
}

#[test]
fn unknown_id_cannot_write_a_path_or_create_a_file() {
    with_document(|path, service| {
        assert!(matches!(
            service.save(&path.to_string_lossy(), "ours"),
            Err(DocumentError::UnknownDocument)
        ));
        assert!(!path.exists());
        fs::write(path, b"original").unwrap();
        let opened = service.open_authorized(path).unwrap();
        service.close(&opened.id);
        assert!(matches!(
            service.save(&opened.id, "ours"),
            Err(DocumentError::UnknownDocument)
        ));
        assert_eq!(fs::read(path).unwrap(), b"original");
    });
}

#[test]
fn invalid_text_is_rejected_before_disk_mutation() {
    with_document(|path, service| {
        fs::write(path, b"original").unwrap();
        let opened = service.open_authorized(path).unwrap();
        assert!(matches!(
            service.save(&opened.id, "a\0b"),
            Err(DocumentError::UnsupportedEncoding)
        ));
        assert!(matches!(
            service.save(&opened.id, &"x".repeat(MAX_TEXT_BYTES + 1)),
            Err(DocumentError::TooLarge)
        ));
        assert_eq!(fs::read(path).unwrap(), b"original");
    });
}

#[test]
fn read_only_file_and_failed_destination_leave_original_untouched() {
    with_document(|path, service| {
        fs::write(path, b"original").unwrap();
        let opened = service.open_authorized(path).unwrap();
        let original_permissions = fs::metadata(path).unwrap().permissions();
        let mut permissions = original_permissions.clone();
        permissions.set_readonly(true);
        fs::set_permissions(path, permissions).unwrap();
        assert!(matches!(
            service.save(&opened.id, "ours"),
            Err(DocumentError::ReadOnly)
        ));
        fs::set_permissions(path, original_permissions).unwrap();
        let invalid = path.parent().unwrap().join("missing").join("copy.md");
        assert!(service
            .save_as_authorized(&invalid, "ours", Some(&opened.id))
            .is_err());
        assert_eq!(fs::read(path).unwrap(), b"original");
    });
}

#[cfg(unix)]
#[test]
fn atomic_save_keeps_unix_permissions() {
    use std::os::unix::fs::PermissionsExt;
    with_document(|path, service| {
        fs::write(path, b"original").unwrap();
        fs::set_permissions(path, fs::Permissions::from_mode(0o640)).unwrap();
        let opened = service.open_authorized(path).unwrap();
        service.save(&opened.id, "ours").unwrap();
        assert_eq!(
            fs::metadata(path).unwrap().permissions().mode() & 0o777,
            0o640
        );
    });
}

#[cfg(unix)]
#[test]
fn substituted_symlink_is_rejected() {
    use std::os::unix::fs::symlink;
    with_document(|path, service| {
        fs::write(path, b"original").unwrap();
        let opened = service.open_authorized(path).unwrap();
        let other = path.with_file_name("other.md");
        fs::write(&other, b"original").unwrap();
        fs::remove_file(path).unwrap();
        symlink(&other, path).unwrap();
        assert!(matches!(
            service.save(&opened.id, "ours"),
            Err(DocumentError::ExternalChange)
        ));
        assert_eq!(fs::read(other).unwrap(), b"original");
    });
}

#[test]
fn rejected_reopen_does_not_replace_older_external_change_snapshot() {
    with_document(|path, service| {
        fs::write(path, b"original").unwrap();
        let active = service.open_authorized(path).unwrap();
        fs::write(path, b"external").unwrap();
        let incoming = service.open_authorized(path).unwrap();
        assert_ne!(incoming.id, active.id);
        assert_eq!(incoming.text, "external");
        service.close(&incoming.id);
        assert!(matches!(
            service.save(&active.id, "unsaved user input"),
            Err(DocumentError::ExternalChange)
        ));
        assert_eq!(fs::read(path).unwrap(), b"external");
    });
}

#[test]
fn closing_old_session_does_not_close_reopened_session_at_same_path() {
    with_document(|path, service| {
        fs::write(path, b"original").unwrap();
        let old = service.open_authorized(path).unwrap();
        let new = service.open_authorized(path).unwrap();
        assert_ne!(new.id, old.id);
        service.close(&old.id);
        assert!(matches!(
            service.save(&old.id, "discarded"),
            Err(DocumentError::UnknownDocument)
        ));
        let saved = service.save(&new.id, "new session content").unwrap();
        assert_eq!(saved.id, new.id);
        assert_eq!(fs::read(path).unwrap(), b"new session content");
    });
}

#[test]
fn same_path_sessions_cannot_bypass_capacity_or_write_when_full() {
    with_document(|path, service| {
        fs::write(path, b"original").unwrap();
        let sessions: Vec<_> = (0..128)
            .map(|_| service.open_authorized(path).unwrap())
            .collect();
        let ids: std::collections::HashSet<_> =
            sessions.iter().map(|document| &document.id).collect();
        assert_eq!(ids.len(), 128);
        assert!(matches!(
            service.open_authorized(path),
            Err(DocumentError::TooManyDocuments)
        ));
        assert!(matches!(
            service.save_as_authorized(path, "must not write", None),
            Err(DocumentError::TooManyDocuments)
        ));
        assert_eq!(fs::read(path).unwrap(), b"original");
        let updated = service
            .save_as_authorized(path, "same session", Some(&sessions[0].id))
            .unwrap();
        assert_eq!(updated.id, sessions[0].id);
        assert_eq!(fs::read(path).unwrap(), b"same session");
        service.close(&sessions[1].id);
        let reopened = service.open_authorized(path).unwrap();
        assert!(!ids.contains(&reopened.id));
        assert_eq!(reopened.text, "same session");
        assert!(matches!(
            service.open_authorized(path),
            Err(DocumentError::TooManyDocuments)
        ));
    });
}
