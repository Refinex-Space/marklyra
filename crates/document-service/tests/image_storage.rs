use cap_std::{ambient_authority, fs::Dir};
use document_service::{DocumentError, DocumentService, Encoding, ImageDraftSnapshot};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

const IMAGE: &[u8] = br#"<svg xmlns="http://www.w3.org/2000/svg"/>"#;
const ENCODED: &str = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";
fn file_href(path: &Path) -> String {
    use std::fmt::Write;
    let path = path.to_str().unwrap().replace('\\', "/");
    let mut encoded = String::new();
    for byte in path.bytes() {
        if byte.is_ascii_alphanumeric() || b"/-._~:".contains(&byte) {
            encoded.push(char::from(byte));
        } else {
            write!(&mut encoded, "%{byte:02X}").unwrap();
        }
    }
    format!(
        "file://{}{encoded}",
        if encoded.starts_with('/') { "" } else { "/" }
    )
}

#[test]
fn native_file_uri_aliases_restore_only_the_same_owned_staged_image_and_keep_no_action_markdown_usable(
) {
    let app = tempfile::tempdir().unwrap();
    let staging = app.path().join("cache # space");
    fs::create_dir(&staging).unwrap();
    let target = tempfile::tempdir().unwrap();
    let mut service = DocumentService::new();
    let (draft, image) = drafted(&mut service, &staging);
    let (foreign_draft, foreign) = drafted(&mut service, &staging);
    let path = service.image_path(&draft, &image.source).unwrap();
    let uri = file_href(&path);
    assert!(uri.contains("%23%20space"));
    service
        .add_image_draft_alias(&draft, &image.source, &uri)
        .unwrap();
    service
        .add_image_draft_alias(&draft, &image.source, &uri)
        .unwrap();
    assert_eq!(service.image_draft_sources(&draft).unwrap().len(), 2);
    assert_eq!(service.image_path(&draft, &uri).unwrap(), path);
    assert_eq!(
        service.resolve_draft_image(&draft, &uri).unwrap().token,
        image.token
    );
    let foreign_uri = file_href(&service.image_path(&foreign_draft, &foreign.source).unwrap());
    assert!(service
        .add_image_draft_alias(&draft, &image.source, &foreign_uri)
        .is_err());
    assert!(service
        .add_image_draft_alias(&draft, &image.source, "relative.svg")
        .is_err());
    assert!(service
        .add_image_draft_alias(&draft, &foreign.source, &uri)
        .is_err());
    let snapshot = service.image_draft_snapshot(&draft).unwrap();
    let mut forged = serde_json::to_value(&snapshot).unwrap();
    let alias = forged["images"]
        .as_array_mut()
        .unwrap()
        .iter_mut()
        .find(|image| image["source"] == uri)
        .unwrap();
    alias["source"] = serde_json::json!(foreign_uri);
    let forged: ImageDraftSnapshot = serde_json::from_value(forged).unwrap();
    service.close_image_draft(&draft);
    assert!(service
        .restore_image_draft(root(&staging), &native_path(&staging), &forged)
        .is_err());
    assert!(service.image_draft_sources(&draft).is_err());
    service
        .restore_image_draft(root(&staging), &native_path(&staging), &snapshot)
        .unwrap();
    let restored = service.resolve_draft_image(&draft, &uri).unwrap();
    assert_eq!(
        service.image(&restored.token).unwrap().bytes.as_ref(),
        IMAGE
    );
    let raw = format!("![same]({uri})\r\nTail  \n");
    let saved_path = target.path().join("no-action.md");
    let saved = service.save_as_authorized(&saved_path, &raw, None).unwrap();
    service
        .attach_image_draft_aliases(
            &saved.id,
            &draft,
            &service.image_draft_sources(&draft).unwrap(),
        )
        .unwrap();
    service.close_image_draft(&draft);
    service.close(&saved.id);
    let reopened = service.open_authorized(&saved_path).unwrap();
    service
        .restore_image_draft(root(&staging), &native_path(&staging), &snapshot)
        .unwrap();
    service
        .attach_image_draft_aliases(
            &reopened.id,
            &draft,
            &service.image_draft_sources(&draft).unwrap(),
        )
        .unwrap();
    service.close_image_draft(&draft);
    let alias = service
        .resolve_image_alias(&reopened.id, &uri)
        .unwrap()
        .unwrap();
    assert_eq!(service.image(&alias.token).unwrap().bytes.as_ref(), IMAGE);
    assert_eq!(fs::read(&path).unwrap(), IMAGE);
    assert_eq!(fs::read_to_string(&saved_path).unwrap(), raw);
    assert!(!target.path().join("assets").exists());
}

#[test]
fn portable_and_file_uri_spellings_do_not_double_the_actual_image_quota() {
    let staging = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    let mut service = DocumentService::new();
    let draft = service
        .create_image_draft(root(staging.path()), &native_path(staging.path()))
        .unwrap();
    for _ in 0..128 {
        let image = service
            .import_draft_image(&draft, "same.svg", ENCODED)
            .unwrap();
        let uri = file_href(&service.image_path(&draft, &image.source).unwrap());
        service
            .add_image_draft_alias(&draft, &image.source, &uri)
            .unwrap();
    }
    let sources = service.image_draft_sources(&draft).unwrap();
    assert_eq!(sources.len(), 256);
    assert!(service
        .import_draft_image(&draft, "over.svg", ENCODED)
        .is_err());
    assert!(service
        .add_image_draft_alias(
            &draft,
            &sources[0],
            &format!(
                "file://localhost{}",
                sources[0].strip_prefix("file://").unwrap()
            )
        )
        .is_err());
    let saved = service
        .save_as_authorized(&target.path().join("kept.md"), "unchanged", None)
        .unwrap();
    service
        .attach_image_draft_aliases(&saved.id, &draft, &sources)
        .unwrap();
    assert_eq!(service.image_draft_sources(&draft).unwrap().len(), 256);
    service.close_image_draft(&draft);
    for source in &sources {
        let alias = service
            .resolve_image_alias(&saved.id, source)
            .unwrap()
            .unwrap();
        assert_eq!(service.image(&alias.token).unwrap().bytes.as_ref(), IMAGE);
    }
    assert_eq!(
        fs::read_to_string(target.path().join("kept.md")).unwrap(),
        "unchanged"
    );
}

#[test]
fn current_image_copy_rereads_current_bytes_but_respects_an_explicit_undo_alias() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("source.md"), "source").unwrap();
    fs::write(temp.path().join("target.md"), "target").unwrap();
    fs::write(temp.path().join("current.svg"), IMAGE).unwrap();
    let mut service = DocumentService::new();
    let source = service
        .open_authorized(&temp.path().join("source.md"))
        .unwrap();
    let target = service
        .open_authorized(&temp.path().join("target.md"))
        .unwrap();
    let old = service.resolve_image(&source.id, "current.svg").unwrap();
    let updated = br#"<svg xmlns="http://www.w3.org/2000/svg" width="9"/>"#;
    fs::write(temp.path().join("current.svg"), updated).unwrap();
    let copied = service
        .copy_current_images(
            &source.id,
            &target.id,
            &["current.svg".to_owned()],
            "",
            "copies",
        )
        .unwrap();
    assert_eq!(
        service
            .image(&copied[0].target.token)
            .unwrap()
            .bytes
            .as_ref(),
        updated
    );
    assert_eq!(
        fs::read(temp.path().join(&copied[0].target.source)).unwrap(),
        updated
    );
    assert!(service.image(&old.token).is_none());
    fs::write(temp.path().join("undo.svg"), IMAGE).unwrap();
    service
        .attach_image_aliases(
            &source.id,
            &[("old-href.svg".to_owned(), "undo.svg".to_owned())],
        )
        .unwrap();
    fs::write(temp.path().join("old-href.svg"), updated).unwrap();
    let copied = service
        .copy_current_images(
            &source.id,
            &target.id,
            &["old-href.svg".to_owned()],
            "",
            "copies",
        )
        .unwrap();
    assert_eq!(
        service
            .image(&copied[0].target.token)
            .unwrap()
            .bytes
            .as_ref(),
        IMAGE
    );
    assert_eq!(
        fs::read_to_string(temp.path().join("source.md")).unwrap(),
        "source"
    );
    assert_eq!(
        fs::read_to_string(temp.path().join("target.md")).unwrap(),
        "target"
    );
}

#[test]
fn repeated_named_no_action_imports_can_reuse_one_draft_snapshot_for_both_images() {
    let staging = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    let path = target.path().join("named.md");
    fs::write(&path, "original\r\n").unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&path).unwrap();
    let draft = service
        .create_image_draft(root(staging.path()), &native_path(staging.path()))
        .unwrap();
    let mut uris = Vec::new();
    for name in ["first.svg", "second.svg"] {
        let imported = service.import_draft_image(&draft, name, ENCODED).unwrap();
        let uri = file_href(&service.image_path(&draft, &imported.source).unwrap());
        service
            .add_image_draft_alias(&draft, &imported.source, &uri)
            .unwrap();
        service
            .attach_image_draft_aliases(&document.id, &draft, std::slice::from_ref(&uri))
            .unwrap();
        uris.push(uri);
    }
    let snapshot = service.image_draft_snapshot(&draft).unwrap();
    let raw = format!("![first]({})\r\n![second]({})\nTail  ", uris[0], uris[1]);
    service.save(&document.id, &raw).unwrap();
    let identity = service
        .capture_image_document_identity(&document.id)
        .unwrap();
    let snapshot: ImageDraftSnapshot =
        serde_json::from_slice(&serde_json::to_vec(&snapshot).unwrap()).unwrap();
    service.close(&document.id);
    service.close_image_draft(&draft);
    let mut restarted = DocumentService::new();
    let reopened = restarted.open_authorized(&path).unwrap();
    assert!(restarted
        .matches_image_document_identity(&reopened.id, &identity)
        .unwrap());
    restarted
        .restore_image_draft(
            root(staging.path()),
            &native_path(staging.path()),
            &snapshot,
        )
        .unwrap();
    restarted
        .attach_image_draft_aliases(&reopened.id, &draft, &uris)
        .unwrap();
    restarted.close_image_draft(&draft);
    for uri in uris {
        let alias = restarted
            .resolve_image_alias(&reopened.id, &uri)
            .unwrap()
            .unwrap();
        assert_eq!(restarted.image(&alias.token).unwrap().bytes.as_ref(), IMAGE);
    }
    assert_eq!(fs::read_to_string(path).unwrap(), raw);
    assert!(!target.path().join("assets").exists());
}
fn root(path: &Path) -> Arc<Dir> {
    Arc::new(Dir::open_ambient_dir(path, ambient_authority()).unwrap())
}
fn native_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap()
}
fn drafted(
    service: &mut DocumentService,
    path: &Path,
) -> (String, document_service::ImageRegistration) {
    let id = service
        .create_image_draft(root(path), &native_path(path))
        .unwrap();
    let image = service
        .import_draft_image(&id, "same.svg", ENCODED)
        .unwrap();
    (id, image)
}

#[test]
fn durable_drafts_keep_original_bytes_unique_names_and_exact_owner_boundaries() {
    let temp = tempfile::tempdir().unwrap();
    let mut service = DocumentService::new();
    let (first, image) = drafted(&mut service, temp.path());
    let second = service
        .create_image_draft(root(temp.path()), &native_path(temp.path()))
        .unwrap();
    let another = service
        .import_draft_image(&first, "same.svg", ENCODED)
        .unwrap();
    assert_ne!(image.source, another.source);
    assert!(image.source.starts_with(&format!("staged/{first}/")));
    let path = temp.path().join(&image.source);
    assert_eq!(fs::read(&path).unwrap(), IMAGE);
    assert_eq!(service.image(&image.token).unwrap().bytes.as_ref(), IMAGE);
    assert!(service.resolve_draft_image(&second, &image.source).is_err());
    for reference in [
        format!("../{first}/x.svg"),
        format!("file://{}", path.display()),
        image.source.replacen("staged/", "staged/../staged/", 1),
    ] {
        assert!(service.resolve_draft_image(&first, &reference).is_err());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            fs::metadata(path.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
    }
    let before = fs::read_dir(path.parent().unwrap()).unwrap().count();
    assert!(service
        .import_draft_image(&first, "bad.png", "AA==")
        .is_err());
    assert_eq!(
        fs::read_dir(path.parent().unwrap()).unwrap().count(),
        before
    );
    service.close_image_draft(&first);
    assert!(service.image(&image.token).is_none());
    assert!(service.resolve_draft_image(&first, &image.source).is_err());
    assert_eq!(fs::read(&path).unwrap(), IMAGE);
    assert!(service.image_draft_snapshot(&second).is_ok());
}

#[test]
fn native_checkpoint_revalidates_app_root_directory_identity_and_exact_sources() {
    let temp = tempfile::tempdir().unwrap();
    let other = tempfile::tempdir().unwrap();
    let mut first = DocumentService::new();
    let (id, image) = drafted(&mut first, temp.path());
    let snapshot = first.image_draft_snapshot(&id).unwrap();
    let json = serde_json::to_string(&snapshot).unwrap();
    let decoded: ImageDraftSnapshot = serde_json::from_str(&json).unwrap();
    first.close_image_draft(&id);
    let mut restored = DocumentService::new();
    assert!(restored
        .restore_image_draft(root(other.path()), &native_path(other.path()), &decoded)
        .is_err());
    assert_eq!(
        restored
            .restore_image_draft(root(temp.path()), &native_path(temp.path()), &decoded)
            .unwrap(),
        id
    );
    let loaded = restored.resolve_draft_image(&id, &image.source).unwrap();
    assert_ne!(loaded.token, image.token);
    assert_eq!(restored.image(&loaded.token).unwrap().bytes.as_ref(), IMAGE);
    assert!(restored
        .restore_image_draft(root(temp.path()), &native_path(temp.path()), &decoded)
        .is_err());
    restored.close_image_draft(&id);
    let mut forged = serde_json::from_str::<serde_json::Value>(&json).unwrap();
    forged["images"][0]["reference"] = serde_json::json!("../outside.svg");
    let forged: ImageDraftSnapshot = serde_json::from_value(forged).unwrap();
    assert!(restored
        .restore_image_draft(root(temp.path()), &native_path(temp.path()), &forged)
        .is_err());
    let directory = temp.path().join("staged").join(&id);
    fs::rename(&directory, temp.path().join("original")).unwrap();
    fs::create_dir(&directory).unwrap();
    assert!(restored
        .restore_image_draft(root(temp.path()), &native_path(temp.path()), &decoded)
        .is_err());
    assert!(restored.image_draft_snapshot(&id).is_err());
    assert_eq!(
        fs::read(
            temp.path()
                .join("original")
                .join(Path::new(&image.source).file_name().unwrap())
        )
        .unwrap(),
        IMAGE
    );
}

#[test]
fn app_root_display_mismatch_does_not_create_a_staging_directory() {
    let one = tempfile::tempdir().unwrap();
    let two = tempfile::tempdir().unwrap();
    let mut service = DocumentService::new();
    assert!(service
        .create_image_draft(root(one.path()), &native_path(two.path()))
        .is_err());
    assert!(!one.path().join("staged").exists());
    assert!(!two.path().join("staged").exists());
}

#[test]
fn first_save_prepares_without_markdown_then_commits_once_with_encoding_and_undo_aliases() {
    let staging = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    for encoding in [
        Encoding::Utf8,
        Encoding::Utf8Bom,
        Encoding::Utf16LeBom,
        Encoding::Utf16BeBom,
    ] {
        let mut service = DocumentService::new();
        let (id, image) = drafted(&mut service, staging.path());
        let snapshot = service.image_draft_snapshot(&id).unwrap();
        let destination = target.path().join(format!("{}.md", encoding.label()));
        let original = format!("# Title\r\n\r\n![same]({})\n\nTail  \r\n", image.source);
        let plan = service
            .prepare_image_save_as(
                &destination,
                &id,
                std::slice::from_ref(&image.source),
                "",
                "${filename}.assets",
            )
            .unwrap();
        assert!(!destination.exists());
        let copied = plan.mappings()[0].target.clone();
        assert!(service.image(&copied.token).is_some());
        let changed = original.replace(&image.source, &copied.source);
        let saved = plan
            .commit(&mut service, &changed, None, Some(encoding.label()))
            .unwrap();
        assert_eq!(
            fs::read(&destination).unwrap(),
            encoding.encode(&changed).unwrap()
        );
        assert_eq!(service.image(&copied.token).unwrap().bytes.as_ref(), IMAGE);
        assert_eq!(
            service
                .resolve_image(&saved.id, &image.source)
                .unwrap()
                .token,
            copied.token
        );
        assert_eq!(fs::read(staging.path().join(&image.source)).unwrap(), IMAGE);
        service.close_image_draft(&id);
        service.save(&saved.id, &original).unwrap();
        assert_eq!(
            fs::read(&destination).unwrap(),
            encoding.encode(&original).unwrap()
        );
        assert!(service.resolve_image(&saved.id, &image.source).is_ok());
        service.save(&saved.id, &changed).unwrap();
        assert_eq!(
            fs::read(&destination).unwrap(),
            encoding.encode(&changed).unwrap()
        );
        service.save(&saved.id, &original).unwrap();
        service.close(&saved.id);
        assert!(service.image(&copied.token).is_none());
        let reopened = service.open_authorized(&destination).unwrap();
        assert!(service.resolve_image(&reopened.id, &image.source).is_err());
        service
            .restore_image_draft(
                root(staging.path()),
                &native_path(staging.path()),
                &snapshot,
            )
            .unwrap();
        service
            .attach_image_draft_aliases(&reopened.id, &id, std::slice::from_ref(&image.source))
            .unwrap();
        service.close_image_draft(&id);
        let restored = service.resolve_image(&reopened.id, &image.source).unwrap();
        assert_eq!(
            service.image(&restored.token).unwrap().bytes.as_ref(),
            IMAGE
        );
        assert_eq!(
            fs::read(&destination).unwrap(),
            encoding.encode(&original).unwrap()
        );
    }
}

#[test]
fn save_as_rejects_new_target_and_same_byte_foreign_entity_without_touching_original() {
    let staging = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    let mut service = DocumentService::new();
    let (id, image) = drafted(&mut service, staging.path());
    let destination = target.path().join("new.md");
    let plan = service
        .prepare_image_save_as(
            &destination,
            &id,
            std::slice::from_ref(&image.source),
            "",
            "assets",
        )
        .unwrap();
    let token = plan.mappings()[0].target.token.clone();
    fs::write(&destination, b"foreign").unwrap();
    assert!(matches!(
        plan.commit(&mut service, "mine", None, None),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&destination).unwrap(), b"foreign");
    assert!(service.image(&token).is_none());
    let plan = service
        .prepare_image_save_as(
            &destination,
            &id,
            std::slice::from_ref(&image.source),
            "",
            "assets",
        )
        .unwrap();
    fs::write(target.path().join("replacement"), b"foreign").unwrap();
    fs::rename(target.path().join("replacement"), &destination).unwrap();
    assert!(matches!(
        plan.commit(&mut service, "mine", None, None),
        Err(DocumentError::ExternalChange)
    ));
    assert_eq!(fs::read(&destination).unwrap(), b"foreign");
    assert_eq!(fs::read(staging.path().join(&image.source)).unwrap(), IMAGE);
}

#[test]
fn stale_draft_lifetime_named_epoch_and_other_service_cannot_commit_a_plan() {
    let staging = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    let mut service = DocumentService::new();
    let (id, image) = drafted(&mut service, staging.path());
    let snapshot = service.image_draft_snapshot(&id).unwrap();
    let path = target.path().join("new.md");
    let plan = service
        .prepare_image_save_as(
            &path,
            &id,
            std::slice::from_ref(&image.source),
            "",
            "assets",
        )
        .unwrap();
    service.close_image_draft(&id);
    service
        .restore_image_draft(
            root(staging.path()),
            &native_path(staging.path()),
            &snapshot,
        )
        .unwrap();
    assert!(plan.commit(&mut service, "mine", None, None).is_err());
    assert!(!path.exists());
    let plan = service
        .prepare_image_save_as(
            &path,
            &id,
            std::slice::from_ref(&image.source),
            "",
            "assets",
        )
        .unwrap();
    assert!(plan
        .commit(&mut DocumentService::new(), "mine", None, None)
        .is_err());
    assert!(!path.exists());
    let named_path = target.path().join("named.md");
    fs::write(&named_path, "original").unwrap();
    fs::write(target.path().join("old.svg"), IMAGE).unwrap();
    let named = service.open_authorized(&named_path).unwrap();
    let plan = service
        .prepare_image_save_as(&path, &named.id, &["old.svg".to_owned()], "", "assets")
        .unwrap();
    service.save(&named.id, "original").unwrap();
    assert!(plan
        .commit(&mut service, "mine", Some(&named.id), None)
        .is_err());
    assert!(!path.exists());
    assert_eq!(fs::read(&named_path).unwrap(), b"original");
}

#[test]
fn dropped_preparations_revoke_urls_and_reclaim_quota_without_deleting_copies() {
    let staging = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    let mut service = DocumentService::new();
    let (id, image) = drafted(&mut service, staging.path());
    let path = target.path().join("not-saved.md");
    for _ in 0..260 {
        let plan = service
            .prepare_image_save_as(
                &path,
                &id,
                std::slice::from_ref(&image.source),
                "",
                "assets",
            )
            .unwrap();
        let token = plan.mappings()[0].target.token.clone();
        assert!(service.image(&token).is_some());
        drop(plan);
        assert!(service.image(&token).is_none());
    }
    assert!(!path.exists());
    assert_eq!(
        fs::read_dir(target.path().join("assets")).unwrap().count(),
        260
    );
    assert_eq!(fs::read(staging.path().join(&image.source)).unwrap(), IMAGE);
}

#[test]
fn copy_preflights_all_references_then_rolls_back_only_new_urls_on_partial_capacity_failure() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("source.md"), b"source").unwrap();
    fs::write(temp.path().join("target.md"), b"target").unwrap();
    fs::write(temp.path().join("one.svg"), IMAGE).unwrap();
    fs::write(temp.path().join("two.svg"), IMAGE).unwrap();
    let mut service = DocumentService::new();
    let source = service
        .open_authorized(&temp.path().join("source.md"))
        .unwrap();
    let target = service
        .open_authorized(&temp.path().join("target.md"))
        .unwrap();
    assert!(service
        .copy_owned_images(
            &source.id,
            &target.id,
            &["one.svg".to_owned(), "../outside.svg".to_owned()],
            "",
            "moved"
        )
        .is_err());
    assert!(!temp.path().join("moved").exists());
    for _ in 0..127 {
        service
            .import_image(&target.id, "existing.svg", ENCODED, "")
            .unwrap();
    }
    assert!(service
        .copy_owned_images(
            &source.id,
            &target.id,
            &["one.svg".to_owned(), "two.svg".to_owned()],
            "",
            "moved"
        )
        .is_err());
    assert_eq!(fs::read_dir(temp.path().join("moved")).unwrap().count(), 1);
    service
        .import_image(&target.id, "last.svg", ENCODED, "")
        .unwrap();
    assert_eq!(fs::read(temp.path().join("source.md")).unwrap(), b"source");
    assert_eq!(fs::read(temp.path().join("target.md")).unwrap(), b"target");
    assert_eq!(fs::read(temp.path().join("one.svg")).unwrap(), IMAGE);
    assert!(service.resolve_image(&target.id, "one.svg").is_err()); // No failed-copy alias installed; quota is full.
}

#[test]
fn native_alias_restore_only_reads_the_destination_grant_and_never_rewrites_source() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("note.md"),
        "![old](staged/old/image.svg)\r\nTail  \n",
    )
    .unwrap();
    fs::write(temp.path().join("copied.svg"), IMAGE).unwrap();
    let mut service = DocumentService::new();
    let note = service
        .open_authorized(&temp.path().join("note.md"))
        .unwrap();
    service
        .attach_image_aliases(
            &note.id,
            &[("staged/old/image.svg".to_owned(), "copied.svg".to_owned())],
        )
        .unwrap();
    let resolved = service
        .resolve_image(&note.id, "staged/old/image.svg")
        .unwrap();
    assert_eq!(
        service.image(&resolved.token).unwrap().bytes.as_ref(),
        IMAGE
    );
    assert!(service
        .attach_image_aliases(&note.id, &[("bad".to_owned(), "../outside.svg".to_owned())])
        .is_err());
    service.save(&note.id, &note.text).unwrap();
    assert_eq!(
        fs::read_to_string(temp.path().join("note.md")).unwrap(),
        note.text
    );
    service.close(&note.id);
    assert!(service.image(&resolved.token).is_none());
}

#[test]
fn after_move_copy_uses_exact_old_displayed_bytes_and_never_a_new_parents_same_named_image() {
    use cap_std::fs::File;
    use document_service::{NativeMovePublication, NativeMovePublicationEntry, RenameKind};
    let temp = tempfile::tempdir().unwrap();
    let base = native_path(temp.path());
    let left = base.join("left");
    let right = base.join("right");
    fs::create_dir(&left).unwrap();
    fs::create_dir(&right).unwrap();
    let old = left.join("A.md");
    let new = right.join("B.md");
    fs::write(&old, "![same](same.svg)\r\n![unloaded](unloaded.svg)\n").unwrap();
    fs::write(left.join("same.svg"), IMAGE).unwrap();
    fs::write(left.join("unloaded.svg"), IMAGE).unwrap();
    let foreign = br#"<svg xmlns="http://www.w3.org/2000/svg" width="3"/>"#;
    fs::write(right.join("same.svg"), foreign).unwrap();
    fs::write(right.join("unloaded.svg"), foreign).unwrap();
    let mut service = DocumentService::new();
    let source = service.open_authorized(&old).unwrap();
    let displayed = service.resolve_image(&source.id, "same.svg").unwrap();
    let held = Arc::new(File::open_ambient(&old, ambient_authority()).unwrap());
    let mut movement = service
        .prepare_move(
            root(&left),
            Path::new("A.md"),
            root(&right),
            Path::new("B.md"),
            &old,
            &new,
            RenameKind::File,
        )
        .unwrap();
    fs::rename(&old, &new).unwrap();
    let publication = NativeMovePublication::verify(
        uuid::Uuid::new_v4(),
        root(&left),
        Path::new("A.md"),
        root(&right),
        Path::new("B.md"),
        RenameKind::File,
        vec![NativeMovePublicationEntry::from_owned_handles(
            Path::new(""),
            RenameKind::File,
            held,
            Arc::new(File::open_ambient(&new, ambient_authority()).unwrap()),
        )
        .unwrap()],
    )
    .unwrap();
    movement.validate_commit(&publication).unwrap();
    movement.commit();
    let current = service.resolve_image(&source.id, "same.svg").unwrap();
    assert_eq!(
        service.image(&current.token).unwrap().bytes.as_ref(),
        foreign
    );
    assert_eq!(
        service.image(&displayed.token).unwrap().bytes.as_ref(),
        IMAGE
    );
    fs::write(right.join("copies.md"), "copy target").unwrap();
    let copy_target = service.open_authorized(&right.join("copies.md")).unwrap();
    let current_copy = service
        .copy_current_images(
            &source.id,
            &copy_target.id,
            &["same.svg".to_owned()],
            "",
            "current.assets",
        )
        .unwrap();
    assert_eq!(
        service
            .image(&current_copy[0].target.token)
            .unwrap()
            .bytes
            .as_ref(),
        foreign
    );
    assert_eq!(
        fs::read(right.join(&current_copy[0].target.source)).unwrap(),
        foreign
    );
    let copied = service
        .copy_owned_images(
            &source.id,
            &source.id,
            &["same.svg".to_owned()],
            "",
            "${filename}.assets",
        )
        .unwrap();
    assert_eq!(
        service
            .image(&copied[0].target.token)
            .unwrap()
            .bytes
            .as_ref(),
        IMAGE
    );
    assert_eq!(
        fs::read(right.join(&copied[0].target.source)).unwrap(),
        IMAGE
    );
    assert!(service
        .copy_owned_images(
            &source.id,
            &source.id,
            &["unloaded.svg".to_owned()],
            "",
            "B.assets"
        )
        .is_err());
    assert_eq!(fs::read(right.join("same.svg")).unwrap(), foreign);
    assert_eq!(fs::read(left.join("same.svg")).unwrap(), IMAGE);
    assert_eq!(fs::read_to_string(&new).unwrap(), source.text);
}

#[cfg(unix)]
#[test]
fn symlink_staging_copy_destinations_and_substituted_drafts_never_touch_their_targets() {
    use std::os::unix::fs::symlink;
    let staging = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    symlink(outside.path(), staging.path().join("staged")).unwrap();
    let mut service = DocumentService::new();
    assert!(service
        .create_image_draft(root(staging.path()), &native_path(staging.path()))
        .is_err());
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    fs::remove_file(staging.path().join("staged")).unwrap();
    let (id, image) = drafted(&mut service, staging.path());
    let target = tempfile::tempdir().unwrap();
    symlink(outside.path(), target.path().join("assets")).unwrap();
    assert!(service
        .prepare_image_save_as(
            &target.path().join("note.md"),
            &id,
            std::slice::from_ref(&image.source),
            "",
            "assets"
        )
        .is_err());
    assert!(!target.path().join("note.md").exists());
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    let own = staging.path().join("staged").join(&id);
    fs::rename(&own, staging.path().join("retained")).unwrap();
    symlink(outside.path(), &own).unwrap();
    assert!(service
        .import_draft_image(&id, "late.svg", ENCODED)
        .is_err());
    assert!(service.resolve_draft_image(&id, &image.source).is_err());
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
}

#[cfg(unix)]
#[test]
fn read_only_image_destination_fails_without_publishing_markdown_or_removing_staged_bytes() {
    use std::os::unix::fs::PermissionsExt;
    let staging = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    let mut service = DocumentService::new();
    let (id, image) = drafted(&mut service, staging.path());
    fs::create_dir(target.path().join("assets")).unwrap();
    fs::set_permissions(
        target.path().join("assets"),
        fs::Permissions::from_mode(0o500),
    )
    .unwrap();
    let result = service.prepare_image_save_as(
        &target.path().join("note.md"),
        &id,
        std::slice::from_ref(&image.source),
        "",
        "assets",
    );
    fs::set_permissions(
        target.path().join("assets"),
        fs::Permissions::from_mode(0o700),
    )
    .unwrap();
    assert!(result.is_err());
    assert!(!target.path().join("note.md").exists());
    assert_eq!(
        fs::read_dir(target.path().join("assets")).unwrap().count(),
        0
    );
    assert_eq!(fs::read(staging.path().join(&image.source)).unwrap(), IMAGE);
    assert!(service.image(&image.token).is_some());
}

#[test]
fn reveal_paths_require_current_directory_bytes_and_never_turn_a_pathless_alias_into_a_grant() {
    let staging = tempfile::tempdir().unwrap();
    let parent = tempfile::tempdir().unwrap();
    let directory = parent.path().join("notes");
    fs::create_dir(&directory).unwrap();
    fs::write(directory.join("note.md"), "![image](image.svg)").unwrap();
    fs::write(directory.join("image.svg"), IMAGE).unwrap();
    let mut service = DocumentService::new();
    let (draft, staged) = drafted(&mut service, staging.path());
    assert_eq!(
        service.image_path(&draft, &staged.source).unwrap(),
        native_path(&staging.path().join(&staged.source))
    );
    let document = service.open_authorized(&directory.join("note.md")).unwrap();
    let actual = native_path(&directory.join("image.svg"));
    assert_eq!(
        service.image_path(&document.id, "image.svg").unwrap(),
        actual
    );
    assert_eq!(
        service
            .image_path(&document.id, &format!("file://{}", actual.display()))
            .unwrap(),
        actual
    );
    service
        .attach_image_draft_aliases(&document.id, &draft, std::slice::from_ref(&staged.source))
        .unwrap();
    assert!(service.resolve_image(&document.id, &staged.source).is_ok());
    assert!(service.image_path(&document.id, &staged.source).is_err());
    fs::rename(&directory, parent.path().join("retained")).unwrap();
    fs::create_dir(&directory).unwrap();
    fs::write(directory.join("image.svg"), IMAGE).unwrap();
    assert!(service.image_path(&document.id, "image.svg").is_err());
    assert_eq!(
        fs::read(parent.path().join("retained/image.svg")).unwrap(),
        IMAGE
    );
}

#[test]
fn yaml_root_source_copy_and_restored_alias_never_read_a_same_named_document_sibling() {
    let temp = tempfile::tempdir().unwrap();
    let base = native_path(temp.path());
    fs::create_dir(base.join("source")).unwrap();
    fs::create_dir(base.join("target")).unwrap();
    fs::create_dir(base.join("source/media")).unwrap();
    fs::write(
        base.join("source/note.md"),
        "---\r\nmarklyra-root-url: ./media\n---\r\n![same](pixel.svg)\nTail  ",
    )
    .unwrap();
    fs::write(base.join("source/media/pixel.svg"), IMAGE).unwrap();
    let foreign = br#"<svg xmlns="http://www.w3.org/2000/svg" width="7"/>"#;
    fs::write(base.join("source/pixel.svg"), foreign).unwrap();
    let mut service = DocumentService::new();
    let source = service
        .open_authorized(&base.join("source/note.md"))
        .unwrap();
    assert!(service
        .resolve_image_alias(&source.id, "pixel.svg")
        .unwrap()
        .is_none());
    service.resolve_image(&source.id, "pixel.svg").unwrap(); // Deliberately register the wrong same-spelled sibling too.
    let path = base.join("target/copy.md");
    let plan = service
        .prepare_image_save_as(
            &path,
            &source.id,
            &["pixel.svg".to_owned()],
            "./media",
            "assets",
        )
        .unwrap();
    let mapping = plan.mappings()[0].clone();
    assert_eq!(mapping.source, "pixel.svg");
    assert!(mapping.target.source.starts_with("../assets/"));
    assert_eq!(
        service.image(&mapping.target.token).unwrap().bytes.as_ref(),
        IMAGE
    );
    let changed = source
        .text
        .replace("(pixel.svg)", &format!("({})", mapping.target.source));
    let saved = plan
        .commit(&mut service, &changed, Some(&source.id), None)
        .unwrap();
    let alias = service
        .resolve_image_alias(&saved.id, "pixel.svg")
        .unwrap()
        .unwrap();
    assert_eq!(service.image(&alias.token).unwrap().bytes.as_ref(), IMAGE);
    service.close(&saved.id);
    let reopened = service.open_authorized(&path).unwrap();
    service
        .attach_image_aliases_with_root(
            &reopened.id,
            &[("pixel.svg".to_owned(), mapping.target.source)],
            "./media",
        )
        .unwrap();
    let alias = service
        .resolve_image_alias(&reopened.id, "pixel.svg")
        .unwrap()
        .unwrap();
    assert_eq!(service.image(&alias.token).unwrap().bytes.as_ref(), IMAGE);
    assert_eq!(fs::read(base.join("source/pixel.svg")).unwrap(), foreign);
    assert_eq!(
        fs::read_to_string(base.join("source/note.md")).unwrap(),
        source.text
    );
    assert_eq!(fs::read_to_string(&path).unwrap(), changed);
}

#[test]
fn save_as_parent_replacement_is_rejected_before_any_markdown_publication() {
    let staging = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    let directory = target.path().join("chosen");
    fs::create_dir(&directory).unwrap();
    let mut service = DocumentService::new();
    let (id, image) = drafted(&mut service, staging.path());
    let path = directory.join("note.md");
    let plan = service
        .prepare_image_save_as(
            &path,
            &id,
            std::slice::from_ref(&image.source),
            "",
            "assets",
        )
        .unwrap();
    fs::rename(&directory, target.path().join("retained")).unwrap();
    fs::create_dir(&directory).unwrap();
    assert!(plan.commit(&mut service, "mine", None, None).is_err());
    assert!(!path.exists());
    assert!(!target.path().join("retained/note.md").exists());
    assert_eq!(fs::read_dir(directory).unwrap().count(), 0);
    assert_eq!(fs::read(staging.path().join(&image.source)).unwrap(), IMAGE);
}

#[test]
fn native_image_binding_identity_survives_reopen_but_requires_update_after_own_atomic_save() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("note.md");
    fs::write(&path, "original\r\n").unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&path).unwrap();
    let first = service
        .capture_image_document_identity(&document.id)
        .unwrap();
    let record = serde_json::to_vec(&first).unwrap();
    let decoded: document_service::ImageDocumentIdentity = serde_json::from_slice(&record).unwrap();
    assert!(service
        .matches_image_document_identity(&document.id, &decoded)
        .unwrap());
    service.close(&document.id);
    let reopened = service.open_authorized(&path).unwrap();
    assert!(service
        .matches_image_document_identity(&reopened.id, &decoded)
        .unwrap());
    service.save(&reopened.id, "original\r\n").unwrap();
    assert!(service
        .matches_image_document_identity(&reopened.id, &decoded)
        .unwrap());
    service.save(&reopened.id, "changed\r\n").unwrap();
    assert!(!service
        .matches_image_document_identity(&reopened.id, &decoded)
        .unwrap());
    let updated = service
        .capture_image_document_identity(&reopened.id)
        .unwrap();
    assert!(service
        .matches_image_document_identity(&reopened.id, &updated)
        .unwrap());
    service.close(&reopened.id);
    let mut fresh = DocumentService::new();
    let final_open = fresh.open_authorized(&path).unwrap();
    assert!(fresh
        .matches_image_document_identity(&final_open.id, &updated)
        .unwrap());
    assert!(!fresh
        .matches_image_document_identity(&final_open.id, &decoded)
        .unwrap());
}

#[test]
fn native_image_binding_identity_rejects_same_byte_external_inode_replacement() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("note.md");
    fs::write(&path, "same bytes").unwrap();
    let mut service = DocumentService::new();
    let document = service.open_authorized(&path).unwrap();
    let proof = service
        .capture_image_document_identity(&document.id)
        .unwrap();
    fs::write(temp.path().join("foreign"), "same bytes").unwrap();
    fs::rename(temp.path().join("foreign"), &path).unwrap();
    assert!(matches!(
        service.capture_image_document_identity(&document.id),
        Err(DocumentError::ExternalChange)
    ));
    assert!(service
        .matches_image_document_identity(&document.id, &proof)
        .is_err());
    let replacement = service.open_authorized(&path).unwrap();
    assert!(!service
        .matches_image_document_identity(&replacement.id, &proof)
        .unwrap());
    assert_eq!(fs::read_to_string(path).unwrap(), "same bytes");
}

#[test]
fn no_action_save_attaches_only_the_sorted_owned_draft_reference_closure_without_parsing_markdown()
{
    let staging = tempfile::tempdir().unwrap();
    let target = tempfile::tempdir().unwrap();
    let mut service = DocumentService::new();
    let (draft, first) = drafted(&mut service, staging.path());
    let second = service
        .import_draft_image(&draft, "second.svg", ENCODED)
        .unwrap();
    let (foreign_draft, foreign) = drafted(&mut service, staging.path());
    let sources = service.image_draft_sources(&draft).unwrap();
    let mut expected = vec![first.source.clone(), second.source.clone()];
    expected.sort();
    assert_eq!(sources, expected);
    assert!(!sources.contains(&foreign.source));
    let raw = format!(
        "Unparsed original syntax: {}\r\n\n![shown]({})\n![foreign]({})\r\nTail  ",
        second.source, first.source, foreign.source
    );
    let path = target.path().join("kept.md");
    let saved = service
        .save_as_authorized_with_encoding(&path, &raw, None, Some("UTF-8 BOM"))
        .unwrap();
    service
        .attach_image_draft_aliases(&saved.id, &draft, &sources)
        .unwrap();
    assert_eq!(
        fs::read(&path).unwrap(),
        Encoding::Utf8Bom.encode(&raw).unwrap()
    );
    assert!(!target.path().join("assets").exists());
    assert!(service
        .resolve_image_alias(&saved.id, &first.source)
        .unwrap()
        .is_some());
    assert!(service
        .resolve_image_alias(&saved.id, &second.source)
        .unwrap()
        .is_some());
    assert!(service
        .resolve_image_alias(&saved.id, &foreign.source)
        .unwrap()
        .is_none());
    service.close_image_draft(&draft);
    assert!(service.image_draft_sources(&draft).is_err());
    assert!(service
        .resolve_image_alias(&saved.id, &first.source)
        .unwrap()
        .is_some());
    assert_eq!(
        service.image_draft_sources(&foreign_draft).unwrap(),
        vec![foreign.source]
    );
    assert_eq!(
        fs::read(&path).unwrap(),
        Encoding::Utf8Bom.encode(&raw).unwrap()
    );
}
