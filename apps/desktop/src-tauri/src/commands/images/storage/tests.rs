use super::*;
use std::{fs, path::Path};

const SVG: &str = "PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";
const SVG_BYTES: &[u8] = b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>";

struct Fixture {
    _temporary: tempfile::TempDir,
    path: PathBuf,
    root: Arc<Dir>,
    document: PathBuf,
}
impl Fixture {
    fn new() -> Self {
        let temporary = tempfile::tempdir().unwrap();
        let base = fs::canonicalize(temporary.path()).unwrap();
        let path = base.join("owned-storage");
        let document = base.join("documents/note.md");
        fs::create_dir(&path).unwrap();
        fs::create_dir(document.parent().unwrap()).unwrap();
        fs::write(&document, b"\xef\xbb\xbforiginal\r\n").unwrap();
        let root = Arc::new(Dir::open_ambient_dir(&path, cap_std::ambient_authority()).unwrap());
        Self {
            _temporary: temporary,
            path,
            root,
            document,
        }
    }
    fn draft(&self, service: &mut DocumentService, name: &str) -> (String, String) {
        let id = service
            .create_image_draft(Arc::clone(&self.root), &self.path)
            .unwrap();
        let image = service.import_draft_image(&id, name, SVG).unwrap();
        file_alias(service, &id, &image.source);
        persist_draft_at(&self.root, &service.image_draft_snapshot(&id).unwrap()).unwrap();
        (id, image.source)
    }
    fn open(&self, service: &mut DocumentService) -> String {
        service.open_authorized(&self.document).unwrap().id
    }
}
fn text(source: &str) -> String {
    format!("# own fixture\r\n\r\n![image]({source})\n")
}
fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn file_alias(service: &mut DocumentService, id: &str, source: &str) -> String {
    let snapshot = service.image_draft_snapshot(id).unwrap();
    let view = snapshot_view(&snapshot).unwrap();
    let image = view
        .images
        .iter()
        .find(|image| image.source == source)
        .unwrap();
    let uri = tauri::Url::from_directory_path(view.directory.path())
        .unwrap()
        .join(&image.reference)
        .unwrap()
        .to_string();
    service.add_image_draft_alias(id, source, &uri).unwrap();
    uri
}

fn snapshot_resources(snapshot: &ImageDraftSnapshot) -> usize {
    snapshot_view(snapshot)
        .unwrap()
        .images
        .iter()
        .map(|image| &image.reference)
        .collect::<std::collections::HashSet<_>>()
        .len()
}

#[test]
fn no_copy_binding_uses_128_real_images_instead_of_counting_256_source_spellings() {
    for count in [64, 128] {
        let fixture = Fixture::new();
        let mut service = DocumentService::default();
        let draft = service
            .create_image_draft(Arc::clone(&fixture.root), &fixture.path)
            .unwrap();
        for _ in 0..count {
            let image = service.import_draft_image(&draft, "same.svg", SVG).unwrap();
            file_alias(&mut service, &draft, &image.source);
        }
        let sources = service.image_draft_sources(&draft).unwrap();
        assert_eq!(sources.len(), count * 2);
        let document = fixture.open(&mut service);
        let raw = sources
            .iter()
            .filter(|source| source.starts_with("file://"))
            .map(|source| text(source))
            .collect::<String>();
        service.save(&document, &raw).unwrap();
        service
            .attach_image_draft_aliases(&document, &draft, &sources)
            .unwrap();
        let record = Binding {
            document: service.bookmark(&document).unwrap(),
            identity: service.capture_image_document_identity(&document).unwrap(),
            aliases: Vec::new(),
            staged: vec![StagedBinding {
                snapshot: service.image_draft_snapshot(&draft).unwrap(),
                references: sources.clone(),
            }],
            recovery_history: Vec::new(),
        };
        validate_binding(&record).unwrap();
        write_record(&fixture.root, &binding_name(&fixture.document), &record).unwrap();
        service.close(&document);
        service.close_image_draft(&draft);
        let mut restarted = DocumentService::default();
        let reopened = fixture.open(&mut restarted);
        restore_aliases_at(
            Arc::clone(&fixture.root),
            &fixture.path,
            &mut restarted,
            &reopened,
        )
        .unwrap();
        restarted.close_image_draft(&draft);
        for source in &sources {
            let alias = restarted
                .resolve_image_alias(&reopened, source)
                .unwrap()
                .unwrap();
            assert_eq!(
                restarted.image(&alias.token).unwrap().bytes.as_ref(),
                SVG_BYTES
            );
        }
        assert_eq!(
            fs::read(&fixture.document).unwrap(),
            document_service::Encoding::Utf8Bom.encode(&raw).unwrap()
        );
    }
}

#[test]
fn native_binding_still_rejects_129_distinct_resources_across_owned_drafts() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let document = fixture.open(&mut service);
    let mut staged = Vec::new();
    for count in [64, 65] {
        let id = service
            .create_image_draft(Arc::clone(&fixture.root), &fixture.path)
            .unwrap();
        let mut references = Vec::new();
        for _ in 0..count {
            references.push(
                service
                    .import_draft_image(&id, "same.svg", SVG)
                    .unwrap()
                    .source,
            );
        }
        staged.push(StagedBinding {
            snapshot: service.image_draft_snapshot(&id).unwrap(),
            references,
        });
    }
    let record = Binding {
        document: service.bookmark(&document).unwrap(),
        identity: service.capture_image_document_identity(&document).unwrap(),
        aliases: Vec::new(),
        staged,
        recovery_history: Vec::new(),
    };
    assert!(validate_binding(&record).is_err());
    assert_eq!(
        fs::read(&fixture.document).unwrap(),
        b"\xef\xbb\xbforiginal\r\n"
    );
}

#[test]
fn named_copy_at_64_or_128_images_does_not_preserve_the_old_staged_closure() {
    for count in [64, 128] {
        let fixture = Fixture::new();
        let mut service = DocumentService::default();
        let draft = service
            .create_image_draft(Arc::clone(&fixture.root), &fixture.path)
            .unwrap();
        let mut references = Vec::new();
        for _ in 0..count {
            let image = service.import_draft_image(&draft, "same.svg", SVG).unwrap();
            references.push(file_alias(&mut service, &draft, &image.source));
        }
        let source = fixture.open(&mut service);
        let raw = references
            .iter()
            .map(|reference| text(reference))
            .collect::<String>();
        service.save(&source, &raw).unwrap();
        let closure = service.image_draft_sources(&draft).unwrap();
        service
            .attach_image_draft_aliases(&source, &draft, &closure)
            .unwrap();
        let binding = Binding {
            document: service.bookmark(&source).unwrap(),
            identity: service.capture_image_document_identity(&source).unwrap(),
            aliases: Vec::new(),
            staged: vec![StagedBinding {
                snapshot: service.image_draft_snapshot(&draft).unwrap(),
                references: closure,
            }],
            recovery_history: Vec::new(),
        };
        validate_binding(&binding).unwrap();
        let target = fixture.document.with_file_name("copied.md");
        if count == 128 {
            // The unchanged global 256-registration budget is already occupied
            // by 128 live staged resources plus their 128 named aliases. Safe
            // capacity refusal is not bypassed by a copy transaction.
            assert!(service
                .prepare_image_save_as(&target, &source, &references, "", "assets")
                .is_err());
            assert!(!target.exists());
            assert!(!target.parent().unwrap().join("assets").exists());
            // Native source aliases have their own immutable lifetime; a retired
            // staging cache is not needed to copy this already-authorized owner.
            service.close_image_draft(&draft);
        }
        let retained = super::super::save::retained_staged_binding(Some(binding), true);
        assert!(retained.is_none());
        let plan = service
            .prepare_image_save_as(&target, &source, &references, "", "assets")
            .unwrap();
        let mappings = plan.mappings().to_vec();
        let mapped = mappings
            .iter()
            .map(|mapping| text(&mapping.target.source))
            .collect::<String>();
        let saved = plan
            .commit(&mut service, &mapped, Some(&source), None)
            .unwrap();
        preserve_staged_binding_at(
            Arc::clone(&fixture.root),
            &fixture.path,
            &mut service,
            &saved.id,
            retained,
        )
        .unwrap();
        persist_aliases_at(
            &fixture.root,
            &service,
            &saved.id,
            mappings
                .iter()
                .map(|mapping| (mapping.source.clone(), mapping.target.source.clone()))
                .collect(),
        )
        .unwrap();
        let record = current_binding(&fixture.root, &service, &saved.id)
            .unwrap()
            .unwrap();
        assert!(record.staged.is_empty());
        assert_eq!(record.aliases.len(), count);
        service.close(&source);
        service.close_image_draft(&draft);
        if count == 64 {
            // An unwanted preserved portable closure would double the target
            // count to 128 and reject this 65th actual image.
            service
                .import_image(&saved.id, "next.svg", SVG, "")
                .unwrap();
        }
        service.close(&saved.id);
        let mut restarted = DocumentService::default();
        let reopened = restarted.open_authorized(&target).unwrap();
        restore_aliases_at(
            Arc::clone(&fixture.root),
            &fixture.path,
            &mut restarted,
            &reopened.id,
        )
        .unwrap();
        assert!(restarted.image_draft_snapshot(&draft).is_err());
        for reference in &references {
            let alias = restarted
                .resolve_image_alias(&reopened.id, reference)
                .unwrap()
                .unwrap();
            assert_eq!(
                restarted.image(&alias.token).unwrap().bytes.as_ref(),
                SVG_BYTES
            );
        }
        assert_eq!(
            fs::read(&target).unwrap(),
            document_service::Encoding::Utf8Bom.encode(&mapped).unwrap()
        );
        assert_eq!(
            fs::read(&fixture.document).unwrap(),
            document_service::Encoding::Utf8Bom.encode(&raw).unwrap()
        );
    }
}

#[test]
fn checkpoint_versions_are_independent_and_first_publication_is_immutable() {
    let fixture = Fixture::new();
    let mut source = DocumentService::default();
    let (a, _) = fixture.draft(&mut source, "first.svg");
    let (b, _) = fixture.draft(&mut source, "second.svg");
    let first = source.image_draft_snapshot(&a).unwrap();
    let second = source.image_draft_snapshot(&b).unwrap();
    let recovery = new_id();
    // A late version 1 cannot overwrite the already published version 2.
    persist_recovery_at(&fixture.root, &recovery, 2, second.clone()).unwrap();
    persist_recovery_at(&fixture.root, &recovery, 1, first.clone()).unwrap();
    let name = recovery_name(&recovery, 1).unwrap();
    let original = fixture.root.read(&name).unwrap();
    persist_recovery_at(&fixture.root, &recovery, 1, first).unwrap();
    assert!(persist_recovery_at(&fixture.root, &recovery, 1, second.clone()).is_err());
    assert_eq!(fixture.root.read(&name).unwrap(), original);
    let mut restored = DocumentService::default();
    assert_eq!(
        restore_draft_at(
            Arc::clone(&fixture.root),
            &fixture.path,
            &mut restored,
            &recovery,
            2
        )
        .unwrap(),
        Some(b)
    );
    assert_eq!(
        restore_draft_at(
            Arc::clone(&fixture.root),
            &fixture.path,
            &mut restored,
            &recovery,
            1
        )
        .unwrap(),
        Some(a)
    );
    assert!(restore_draft_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut restored,
        &recovery,
        3
    )
    .unwrap()
    .is_none());
    write_record(
        &fixture.root,
        &recovery_name(&recovery, 4).unwrap(),
        &RecoveryImages {
            version: 2,
            snapshot: second,
        },
    )
    .unwrap();
    assert!(restore_draft_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut restored,
        &recovery,
        4
    )
    .is_err());
}

#[test]
fn concurrent_first_publications_cannot_replace_the_winner() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let (a, _) = fixture.draft(&mut service, "first.svg");
    let (b, _) = fixture.draft(&mut service, "second.svg");
    let recovery = new_id();
    let barrier = Arc::new(std::sync::Barrier::new(3));
    let tasks: Vec<_> = [a.clone(), b.clone()]
        .into_iter()
        .map(|draft| {
            let snapshot = service.image_draft_snapshot(&draft).unwrap();
            let root = Arc::clone(&fixture.root);
            let recovery = recovery.clone();
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                persist_recovery_at(&root, &recovery, 1, snapshot)
            })
        })
        .collect();
    barrier.wait();
    let results: Vec<_> = tasks.into_iter().map(|task| task.join().unwrap()).collect();
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    let published = read_recovery_at(&fixture.root, &recovery, 1)
        .unwrap()
        .unwrap();
    assert!([a, b].contains(&published.snapshot.id().to_owned()));
    assert!(fixture.root.entries().unwrap().all(|entry| !entry
        .unwrap()
        .file_name()
        .to_string_lossy()
        .starts_with(".record-")));
}

#[test]
fn selector_uses_only_matching_current_or_previous_native_authority() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let (a, source_a) = fixture.draft(&mut service, "first.svg");
    let (b, source_b) = fixture.draft(&mut service, "second.svg");
    let snapshot_a = service.image_draft_snapshot(&a).unwrap();
    let snapshot_b = service.image_draft_snapshot(&b).unwrap();
    let recovery = new_id();
    assert_eq!(
        select_checkpoint_snapshot_at(
            &fixture.root,
            &fixture.path,
            &recovery,
            0,
            &text(&source_a),
            Some(snapshot_a.clone())
        )
        .unwrap()
        .unwrap()
        .id(),
        a
    );
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        0,
        &text(&source_a),
        Some(snapshot_b.clone())
    )
    .is_err());
    persist_recovery_at(&fixture.root, &recovery, 1, snapshot_a).unwrap();
    assert_eq!(
        select_checkpoint_snapshot_at(
            &fixture.root,
            &fixture.path,
            &recovery,
            1,
            &text(&source_a),
            Some(snapshot_b.clone())
        )
        .unwrap()
        .unwrap()
        .id(),
        a
    );
    // B's manifest exists, but its UUID in Markdown is never a read grant.
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &text(&source_b),
        None
    )
    .is_err());
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        0,
        &text(&source_b),
        None
    )
    .is_err());
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &(text(&source_a) + &text(&source_b)),
        Some(snapshot_b)
    )
    .is_err());
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        "ordinary text",
        None
    )
    .unwrap()
    .is_none());
}

#[test]
fn selector_refreshes_only_the_previous_native_draft_and_keeps_the_version_immutable() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let (id, _) = fixture.draft(&mut service, "first.svg");
    let original = service.image_draft_snapshot(&id).unwrap();
    let recovery = new_id();
    persist_recovery_at(&fixture.root, &recovery, 1, original).unwrap();
    let image = service.import_draft_image(&id, "new.svg", SVG).unwrap();
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &text(&image.source),
        None
    )
    .is_err());
    let refreshed = service.image_draft_snapshot(&id).unwrap();
    persist_draft_at(&fixture.root, &refreshed).unwrap();
    let selected = select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &text(&image.source),
        None,
    )
    .unwrap()
    .unwrap();
    assert_eq!(snapshot_resources(&selected), 2);
    assert!(persist_recovery_at(&fixture.root, &recovery, 1, refreshed).is_err());
    assert_eq!(
        snapshot_resources(
            &read_recovery_at(&fixture.root, &recovery, 1)
                .unwrap()
                .unwrap()
                .snapshot
        ),
        1
    );
    persist_recovery_at(&fixture.root, &recovery, 2, selected).unwrap();
    let (sibling, _) = fixture.draft(&mut service, "sibling.svg");
    write_record(
        &fixture.root,
        &format!("draft-{id}.json"),
        &service.image_draft_snapshot(&sibling).unwrap(),
    )
    .unwrap();
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &text(&image.source),
        None
    )
    .is_err());
}

#[test]
fn our_atomic_save_refreshes_entity_proof_and_preserves_both_binding_kinds() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let document = fixture.open(&mut service);
    let (draft, staged) = fixture.draft(&mut service, "staged.svg");
    service
        .attach_image_draft_aliases(&document, &draft, std::slice::from_ref(&staged))
        .unwrap();
    persist_staged_alias_at(&fixture.root, &service, &document, &draft, &staged).unwrap();
    let imported = service
        .import_image_with_folder(&document, "copy.svg", SVG, "", "images")
        .unwrap();
    persist_aliases_at(
        &fixture.root,
        &service,
        &document,
        vec![("old-native-href".into(), imported.source)],
    )
    .unwrap();
    let retained = before_save_at(&fixture.root, &service, &document).unwrap();
    assert!(retained.is_some());
    service.save(&document, "updated\r\n").unwrap();
    after_save_at(&fixture.root, &service, &document, retained).unwrap();
    assert_eq!(
        fs::read(&fixture.document).unwrap(),
        b"\xef\xbb\xbfupdated\r\n"
    );
    let mut reopened = DocumentService::default();
    let new_document = fixture.open(&mut reopened);
    restore_aliases_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut reopened,
        &new_document,
    )
    .unwrap();
    assert!(reopened
        .resolve_image_alias(&new_document, "old-native-href")
        .unwrap()
        .is_some());
    assert!(reopened
        .resolve_image_alias(&new_document, &staged)
        .unwrap()
        .is_some());
    assert_eq!(
        current_binding(&fixture.root, &reopened, &new_document)
            .unwrap()
            .unwrap()
            .staged
            .len(),
        1
    );
}

#[test]
fn external_same_bytes_replacement_cannot_restore_or_rebind_old_staged_permissions() {
    let fixture = Fixture::new();
    let mut original = DocumentService::default();
    let document = fixture.open(&mut original);
    let (draft, staged) = fixture.draft(&mut original, "staged.svg");
    persist_staged_alias_at(&fixture.root, &original, &document, &draft, &staged).unwrap();
    let bookmark = original.bookmark(&document).unwrap();
    let retained = fixture.document.with_file_name("retained-old.md");
    fs::rename(&fixture.document, &retained).unwrap();
    fs::copy(&retained, &fixture.document).unwrap();
    let mut fresh = DocumentService::default();
    let replacement = fixture.open(&mut fresh);
    assert_eq!(fresh.bookmark(&replacement).unwrap(), bookmark);
    assert!(restore_aliases_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut fresh,
        &replacement
    )
    .is_err());
    assert!(fresh.resolve_draft_image(&draft, &staged).is_err());
    let before = before_save_at(&fixture.root, &fresh, &replacement).unwrap();
    assert!(before.is_none());
    fresh.save(&replacement, "own new occupant\n").unwrap();
    after_save_at(&fixture.root, &fresh, &replacement, before).unwrap();
    assert!(read_aliases_at(&fixture.root, &fresh, &replacement).is_err());
    assert!(fixture.path.join("staged").join(draft).exists());
    assert_eq!(fs::read(retained).unwrap(), b"\xef\xbb\xbforiginal\r\n");
}

#[test]
fn persisted_expanded_root_ignores_a_document_directory_decoy() {
    let fixture = Fixture::new();
    let mut original = DocumentService::default();
    let document = fixture.open(&mut original);
    let image = original
        .import_image_with_folder(&document, "root.svg", SVG, "images", "images")
        .unwrap();
    assert!(!image.source.contains('/'));
    persist_aliases_at(
        &fixture.root,
        &original,
        &document,
        vec![(
            "old-root-reference".into(),
            format!("images/{}", image.source),
        )],
    )
    .unwrap();
    let decoy = fixture.document.parent().unwrap().join(&image.source);
    fs::write(
        &decoy,
        b"<svg xmlns=\"http://www.w3.org/2000/svg\"><title>decoy</title></svg>",
    )
    .unwrap();
    let mut fresh = DocumentService::default();
    let id = fixture.open(&mut fresh);
    restore_aliases_at(Arc::clone(&fixture.root), &fixture.path, &mut fresh, &id).unwrap();
    let registered = fresh
        .resolve_image_alias(&id, "old-root-reference")
        .unwrap()
        .unwrap();
    assert_eq!(
        fresh.image(&registered.token).unwrap().bytes.as_ref(),
        SVG_BYTES
    );
    assert_ne!(fs::read(decoy).unwrap(), SVG_BYTES);
}

#[test]
fn binding_alias_limit_is_checked_before_write_and_supported_aliases_restore_in_chunks() {
    let fixture = Fixture::new();
    let mut original = DocumentService::default();
    let document = fixture.open(&mut original);
    let image = original
        .import_image_with_folder(&document, "copy.svg", SVG, "", "images")
        .unwrap();
    let aliases: Vec<_> = (0..256)
        .map(|index| (format!("old-{index}"), image.source.clone()))
        .collect();
    persist_aliases_at(&fixture.root, &original, &document, aliases.clone()).unwrap();
    let name = binding_name(&fixture.document);
    let before = fixture.root.read(&name).unwrap();
    let mut too_many = aliases;
    too_many.push(("excess".into(), image.source));
    assert!(persist_aliases_at(&fixture.root, &original, &document, too_many).is_err());
    assert_eq!(fixture.root.read(&name).unwrap(), before);
    let mut fresh = DocumentService::default();
    let id = fixture.open(&mut fresh);
    restore_aliases_at(Arc::clone(&fixture.root), &fixture.path, &mut fresh, &id).unwrap();
    assert!(fresh.resolve_image_alias(&id, "old-255").unwrap().is_some());
}

#[test]
fn record_capacity_and_invalid_names_do_not_replace_existing_records() {
    let fixture = Fixture::new();
    write_record(
        &fixture.root,
        "record.json",
        &serde_json::json!({"owned":true}),
    )
    .unwrap();
    let before = fixture.root.read("record.json").unwrap();
    assert!(write_record(
        &fixture.root,
        "record.json",
        &"x".repeat(MAX_RECORD_BYTES as usize)
    )
    .is_err());
    assert_eq!(fixture.root.read("record.json").unwrap(), before);
    assert!(write_record(&fixture.root, "../escaped.json", &true).is_err());
    assert!(read_record::<bool>(&fixture.root, "../escaped.json").is_err());
    let large = fs::File::create(fixture.path.join("large.json")).unwrap();
    large.set_len(MAX_RECORD_BYTES + 1).unwrap();
    assert!(read_record::<serde_json::Value>(&fixture.root, "large.json").is_err());
    fixture.root.write("corrupt.json", b"{broken").unwrap();
    assert!(read_record::<serde_json::Value>(&fixture.root, "corrupt.json").is_err());
    assert_eq!(fixture.root.read("corrupt.json").unwrap(), b"{broken");
    assert!(!fixture.path.parent().unwrap().join("escaped.json").exists());
}

#[cfg(unix)]
#[test]
fn symlinked_record_is_never_read_or_replaced_by_checkpoint_publication() {
    let fixture = Fixture::new();
    let outside = fixture.document.with_file_name("unrelated.json");
    fs::write(&outside, br#"{"keep":"original"}"#).unwrap();
    std::os::unix::fs::symlink(&outside, fixture.path.join("link.json")).unwrap();
    assert!(read_record::<serde_json::Value>(&fixture.root, "link.json").is_err());
    let mut service = DocumentService::default();
    let (draft, _) = fixture.draft(&mut service, "own.svg");
    let recovery = new_id();
    let name = recovery_name(&recovery, 1).unwrap();
    std::os::unix::fs::symlink(
        Path::new("../documents/unrelated.json"),
        fixture.path.join(&name),
    )
    .unwrap();
    assert!(persist_recovery_at(
        &fixture.root,
        &recovery,
        1,
        service.image_draft_snapshot(&draft).unwrap()
    )
    .is_err());
    assert!(fs::symlink_metadata(fixture.path.join(name))
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(fs::read(outside).unwrap(), br#"{"keep":"original"}"#);
}

#[test]
fn save_as_carries_only_native_staged_sources_and_survives_source_draft_close() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let original = fixture.open(&mut service);
    let (draft, staged) = fixture.draft(&mut service, "retained.svg");
    persist_staged_alias_at(&fixture.root, &service, &original, &draft, &staged).unwrap();
    let copied = service
        .import_image_with_folder(&original, "old.svg", SVG, "", "images")
        .unwrap();
    persist_aliases_at(
        &fixture.root,
        &service,
        &original,
        vec![("old-relative-alias".into(), copied.source)],
    )
    .unwrap();
    let captured = before_save_at(&fixture.root, &service, &original).unwrap();
    let target = fixture.document.with_file_name("saved-as.md");
    let destination = service
        .save_as_authorized_with_encoding(&target, &text(&staged), Some(&original), None)
        .unwrap();
    preserve_staged_binding_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut service,
        &destination.id,
        captured,
    )
    .unwrap();
    assert!(read_aliases_at(&fixture.root, &service, &destination.id)
        .unwrap()
        .is_empty());
    // The later SaveAs alias update must retain the newly captured staged set.
    persist_aliases_at(&fixture.root, &service, &destination.id, Vec::new()).unwrap();
    service.close_image_draft(&draft);
    let image = service
        .resolve_image_alias(&destination.id, &staged)
        .unwrap()
        .unwrap();
    assert_eq!(
        service.image(&image.token).unwrap().bytes.as_ref(),
        SVG_BYTES
    );
    let mut reopened = DocumentService::default();
    let id = reopened.open_authorized(&target).unwrap().id;
    restore_aliases_at(Arc::clone(&fixture.root), &fixture.path, &mut reopened, &id).unwrap();
    assert!(reopened
        .resolve_image_alias(&id, &staged)
        .unwrap()
        .is_some());
    assert!(reopened
        .resolve_image_alias(&id, "old-relative-alias")
        .unwrap()
        .is_none());
}

#[test]
fn same_slot_publication_can_carry_a_binding_captured_before_its_inode_changed() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let id = fixture.open(&mut service);
    let (draft, staged) = fixture.draft(&mut service, "same-slot.svg");
    persist_staged_alias_at(&fixture.root, &service, &id, &draft, &staged).unwrap();
    let captured = before_save_at(&fixture.root, &service, &id).unwrap();
    service.save(&id, &text(&staged)).unwrap();
    assert!(current_binding(&fixture.root, &service, &id).is_err());
    preserve_staged_binding_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut service,
        &id,
        captured,
    )
    .unwrap();
    let mut reopened = DocumentService::default();
    let fresh = fixture.open(&mut reopened);
    restore_aliases_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut reopened,
        &fresh,
    )
    .unwrap();
    assert!(reopened
        .resolve_image_alias(&fresh, &staged)
        .unwrap()
        .is_some());
}

#[test]
fn native_unicode_asset_names_match_without_truncating_the_encoded_reference() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let (id, source) = fixture.draft(&mut service, &format!("{}.svg", "图".repeat(64)));
    assert!(source.contains('%'));
    let selected = select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &new_id(),
        0,
        &text(&source),
        Some(service.image_draft_snapshot(&id).unwrap()),
    )
    .unwrap()
    .unwrap();
    assert_eq!(selected.id(), id);
}

#[test]
fn exact_native_file_uri_sources_select_and_restore_without_markdown_path_authority() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let (a, portable_a) = fixture.draft(&mut service, "本地图片.svg");
    let (b, portable_b) = fixture.draft(&mut service, "sibling.svg");
    let uri_a = file_alias(&mut service, &a, &portable_a);
    let uri_b = file_alias(&mut service, &b, &portable_b);
    let snapshot = service.image_draft_snapshot(&a).unwrap();
    let recovery = new_id();
    let selected = select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        0,
        &text(&uri_a),
        Some(snapshot.clone()),
    )
    .unwrap()
    .unwrap();
    persist_recovery_at(&fixture.root, &recovery, 1, selected).unwrap();
    let mut restored = DocumentService::default();
    restore_draft_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut restored,
        &recovery,
        1,
    )
    .unwrap();
    let image = restored.resolve_draft_image(&a, &uri_a).unwrap();
    assert_eq!(
        restored.image(&image.token).unwrap().bytes.as_ref(),
        SVG_BYTES
    );
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &text(&uri_b),
        None
    )
    .is_err());
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &(text(&uri_a) + &text(&uri_b)),
        Some(snapshot.clone())
    )
    .is_err());
    let unknown = tauri::Url::from_file_path(
        fixture
            .path
            .join("staged")
            .join(new_id())
            .join("unknown.svg"),
    )
    .unwrap()
    .to_string();
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &text(&unknown),
        Some(snapshot.clone())
    )
    .is_err());
    let ordinary = tauri::Url::from_file_path(fixture.document.with_file_name("ordinary.svg"))
        .unwrap()
        .to_string();
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &text(&ordinary),
        Some(snapshot)
    )
    .unwrap()
    .is_none());
}

#[test]
fn previous_native_file_uri_association_refreshes_only_its_known_manifest() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let (id, _) = fixture.draft(&mut service, "first.svg");
    let recovery = new_id();
    persist_recovery_at(
        &fixture.root,
        &recovery,
        1,
        service.image_draft_snapshot(&id).unwrap(),
    )
    .unwrap();
    let next = service.import_draft_image(&id, "second.svg", SVG).unwrap();
    let uri = file_alias(&mut service, &id, &next.source);
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &text(&uri),
        None
    )
    .is_err());
    persist_draft_at(&fixture.root, &service.image_draft_snapshot(&id).unwrap()).unwrap();
    let selected = select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &recovery,
        1,
        &format!("<img src='{uri}' />"),
        None,
    )
    .unwrap()
    .unwrap();
    assert_eq!(snapshot_resources(&selected), 2);
}

#[test]
fn snapshot_file_alias_must_prove_the_same_native_reference_and_legacy_records_still_match() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let (id, portable) = fixture.draft(&mut service, "own.svg");
    let snapshot = service.image_draft_snapshot(&id).unwrap();
    let mut value = serde_json::to_value(&snapshot).unwrap();
    let images = value["images"].as_array_mut().unwrap();
    images.retain(|image| image["source"].as_str().unwrap().starts_with("staged/"));
    let legacy: ImageDraftSnapshot = serde_json::from_value(value.clone()).unwrap();
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &new_id(),
        0,
        &text(&portable),
        Some(legacy)
    )
    .unwrap()
    .is_some());
    let reference = value["images"][0]["reference"].as_str().unwrap().to_owned();
    let unowned = tauri::Url::from_file_path(fixture.document.with_file_name("unowned.svg"))
        .unwrap()
        .to_string();
    value["images"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::json!({"source":unowned,"reference":reference}));
    let corrupted: ImageDraftSnapshot = serde_json::from_value(value).unwrap();
    assert!(snapshot_view(&corrupted).is_err());
}

#[test]
fn two_source_spellings_do_not_reduce_the_native_128_asset_quota() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let id = service
        .create_image_draft(Arc::clone(&fixture.root), &fixture.path)
        .unwrap();
    let mut last_uri = String::new();
    for index in 0..image_assets::MAX_DOCUMENT_IMAGES {
        let image = service
            .import_draft_image(&id, &format!("image-{index}.svg"), SVG)
            .unwrap();
        last_uri = file_alias(&mut service, &id, &image.source);
    }
    let snapshot = service.image_draft_snapshot(&id).unwrap();
    assert_eq!(snapshot_view(&snapshot).unwrap().images.len(), 256);
    assert_eq!(snapshot_resources(&snapshot), 128);
    assert!(select_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &new_id(),
        0,
        &text(&last_uri),
        Some(snapshot)
    )
    .unwrap()
    .is_some());
    assert!(service.import_draft_image(&id, "excess.svg", SVG).is_err());
}

#[test]
fn named_stage_discovery_uses_the_current_entity_binding_and_rejects_mixed_owners() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let document = fixture.open(&mut service);
    let (a, source_a) = fixture.draft(&mut service, "first.svg");
    persist_staged_alias_at(&fixture.root, &service, &document, &a, &source_a).unwrap();
    let mut reopened = DocumentService::default();
    let id = fixture.open(&mut reopened);
    assert_eq!(
        existing_staged_owner_at(Arc::clone(&fixture.root), &fixture.path, &mut reopened, &id)
            .unwrap(),
        Some(a.clone())
    );
    assert!(reopened
        .resolve_image_alias(&id, &source_a)
        .unwrap()
        .is_some());
    let (b, source_b) = fixture.draft(&mut service, "second.svg");
    persist_staged_alias_at(&fixture.root, &service, &document, &b, &source_b).unwrap();
    let mut mixed = DocumentService::default();
    let mixed_id = fixture.open(&mut mixed);
    assert!(existing_staged_owner_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut mixed,
        &mixed_id
    )
    .is_err());
    assert!(mixed.image_draft_snapshot(&a).is_err());
    assert!(mixed.image_draft_snapshot(&b).is_err());
    let retained = fixture.document.with_file_name("old-entity.md");
    fs::rename(&fixture.document, &retained).unwrap();
    fs::copy(retained, &fixture.document).unwrap();
    let mut replacement = DocumentService::default();
    let replacement_id = fixture.open(&mut replacement);
    assert!(existing_staged_owner_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut replacement,
        &replacement_id
    )
    .is_err());
    assert!(replacement.image_draft_snapshot(&a).is_err());
}

#[test]
fn copied_untitled_history_recovers_old_uri_after_undo_save_and_restart_without_live_stage_quota() {
    for count in [1, 64, 128] {
        let fixture = Fixture::new();
        let mut service = DocumentService::default();
        let draft = service
            .create_image_draft(Arc::clone(&fixture.root), &fixture.path)
            .unwrap();
        let mut original_sources = Vec::new();
        for _ in 0..count {
            let image = service
                .import_draft_image(&draft, "history.svg", SVG)
                .unwrap();
            original_sources.push(file_alias(&mut service, &draft, &image.source));
        }
        let historical = service.image_draft_snapshot(&draft).unwrap();
        persist_draft_at(&fixture.root, &historical).unwrap();
        let target = fixture.document.with_file_name("copied-history.md");
        let plan = service
            .prepare_image_save_as(&target, &draft, &original_sources, "", "assets")
            .unwrap();
        let mappings = plan.mappings().to_vec();
        let copied_text = mappings
            .iter()
            .map(|mapping| text(&mapping.target.source))
            .collect::<String>();
        let saved = plan.commit(&mut service, &copied_text, None, None).unwrap();
        let aliases = mappings
            .iter()
            .map(|mapping| (mapping.source.clone(), mapping.target.source.clone()))
            .collect();
        persist_aliases_at(&fixture.root, &service, &saved.id, aliases).unwrap();
        persist_recovery_history_at(&fixture.root, &service, &saved.id, vec![historical]).unwrap();
        service.close_image_draft(&draft);
        assert!(service.image_draft_snapshot(&draft).is_err());
        // Actual SDK Undo is covered by the parent's WK run. Here its exact old
        // text is saved to prove native entity rebinding and journal association.
        let old_text = original_sources
            .iter()
            .map(|source| text(source))
            .collect::<String>();
        let binding = before_save_at(&fixture.root, &service, &saved.id).unwrap();
        service.save(&saved.id, &old_text).unwrap();
        after_save_at(&fixture.root, &service, &saved.id, binding).unwrap();
        assert_eq!(fs::read(&target).unwrap(), old_text.as_bytes());
        let visible = service
            .resolve_image_alias(&saved.id, &original_sources[0])
            .unwrap()
            .unwrap();
        assert_eq!(
            service.image(&visible.token).unwrap().bytes.as_ref(),
            SVG_BYTES
        );
        let selected = bound_checkpoint_snapshot_at(
            &fixture.root,
            &fixture.path,
            &service,
            &saved.id,
            &old_text,
        )
        .unwrap()
        .unwrap();
        assert!(service.image_draft_snapshot(&draft).is_err());
        assert!(current_binding(&fixture.root, &service, &saved.id)
            .unwrap()
            .unwrap()
            .staged
            .is_empty());
        if count == 64 {
            service
                .import_image(&saved.id, "next.svg", SVG, "")
                .unwrap();
        }
        if count == 128 {
            assert!(service
                .import_image(&saved.id, "excess.svg", SVG, "")
                .is_err());
        }
        let journal_path = fixture.path.join("own-journal");
        let mut journal = recovery_store::RecoveryStore::open(&journal_path).unwrap();
        let session = journal.begin().unwrap();
        let receipt = journal
            .checkpoint(recovery_store::CheckpointRequest {
                id: session.id.clone(),
                lease: session.lease,
                expected_version: 0,
                sequence: 1,
                content: recovery_store::DraftContent {
                    text: old_text.clone(),
                    saved_text: old_text.clone(),
                    document: None,
                    selection: None,
                },
            })
            .unwrap();
        persist_recovery_at(&fixture.root, &receipt.id, receipt.version, selected).unwrap();
        drop(journal);
        drop(service);
        let journal = recovery_store::RecoveryStore::open(&journal_path).unwrap();
        let runtime_text = journal.read(&receipt.id, receipt.version).unwrap();
        assert_eq!(runtime_text.content.text, old_text);
        let mut restarted = DocumentService::default();
        let restored = restore_draft_at(
            Arc::clone(&fixture.root),
            &fixture.path,
            &mut restarted,
            &receipt.id,
            receipt.version,
        )
        .unwrap()
        .unwrap();
        for source in original_sources {
            let image = restarted.resolve_draft_image(&restored, &source).unwrap();
            assert_eq!(
                restarted.image(&image.token).unwrap().bytes.as_ref(),
                SVG_BYTES
            );
        }
    }
}

#[test]
fn named_history_is_metadata_only_and_rejects_foreign_mixed_and_replaced_entities() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let document = fixture.open(&mut service);
    let (a, portable_a) = fixture.draft(&mut service, "first.svg");
    let (b, portable_b) = fixture.draft(&mut service, "foreign.svg");
    let uri_a = file_alias(&mut service, &a, &portable_a);
    let uri_b = file_alias(&mut service, &b, &portable_b);
    persist_recovery_history_at(
        &fixture.root,
        &service,
        &document,
        vec![service.image_draft_snapshot(&a).unwrap()],
    )
    .unwrap();
    service.close_image_draft(&a);
    service.close_image_draft(&b);
    assert!(bound_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &service,
        &document,
        &text(&uri_b)
    )
    .unwrap()
    .is_none());
    assert!(bound_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &service,
        &document,
        &(text(&uri_a) + &text(&uri_b))
    )
    .unwrap()
    .is_none());
    assert!(bound_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &service,
        &document,
        &text(&uri_a)
    )
    .unwrap()
    .is_some());
    assert!(service.image_draft_snapshot(&a).is_err());
    assert!(existing_staged_owner_at(
        Arc::clone(&fixture.root),
        &fixture.path,
        &mut service,
        &document
    )
    .unwrap()
    .is_none());
    let mut fresh = DocumentService::default();
    let reopened = fixture.open(&mut fresh);
    assert!(bound_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &fresh,
        &reopened,
        &text(&uri_a)
    )
    .unwrap()
    .is_some());
    let retained = fixture.document.with_file_name("old-history-entity.md");
    fs::rename(&fixture.document, &retained).unwrap();
    fs::copy(retained, &fixture.document).unwrap();
    let mut replacement = DocumentService::default();
    let id = fixture.open(&mut replacement);
    assert!(bound_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &replacement,
        &id,
        &text(&uri_a)
    )
    .is_err());
    assert!(replacement.image_draft_snapshot(&a).is_err());
}

#[test]
fn legacy_binding_history_defaults_empty_and_new_history_has_bounded_metadata() {
    let fixture = Fixture::new();
    let mut service = DocumentService::default();
    let id = fixture.open(&mut service);
    let (draft, _) = fixture.draft(&mut service, "proof.svg");
    persist_recovery_history_at(
        &fixture.root,
        &service,
        &id,
        vec![service.image_draft_snapshot(&draft).unwrap()],
    )
    .unwrap();
    let binding = current_binding(&fixture.root, &service, &id)
        .unwrap()
        .unwrap();
    let mut legacy = serde_json::to_value(&binding).unwrap();
    legacy.as_object_mut().unwrap().remove("recoveryHistory");
    let mut legacy: Binding = serde_json::from_value(legacy).unwrap();
    assert!(legacy.recovery_history.is_empty());
    let old_uri = service
        .image_draft_sources(&draft)
        .unwrap()
        .into_iter()
        .find(|source| source.starts_with("file://"))
        .unwrap();
    let copied = service.import_image(&id, "copied.svg", SVG, "").unwrap();
    legacy.aliases.push((old_uri.clone(), copied.source));
    write_record(&fixture.root, &binding_name(&fixture.document), &legacy).unwrap();
    // A v5-style copied binding's alias and Markdown URI do not invent the new
    // metadata proof, even though the old native draft manifest happens to exist.
    assert!(bound_checkpoint_snapshot_at(
        &fixture.root,
        &fixture.path,
        &service,
        &id,
        &text(&old_uri)
    )
    .unwrap()
    .is_none());
    let mut over_limit = binding;
    over_limit.recovery_history = vec![service.image_draft_snapshot(&draft).unwrap(); 129];
    assert!(validate_binding(&over_limit).is_err());
}
