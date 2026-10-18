//! Native-owned records. IPC never supplies a manifest, bookmark or data-root path.
use cap_std::fs::{Dir, OpenOptions};
use document_service::{
    DocumentBookmark, DocumentService, ImageDocumentIdentity, ImageDraftSnapshot,
};
use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    path::PathBuf,
    sync::Arc,
};
use tauri::AppHandle;
mod location;
pub(crate) use location::ImageBindingLocationPlan;

const MAX_RECORD_BYTES: u64 = 2 * 1024 * 1024;

pub(super) fn root(app: &AppHandle) -> Result<(Arc<Dir>, PathBuf), String> {
    let parent = crate::app_paths::data_dir(app)?;
    std::fs::create_dir_all(&parent).map_err(|error| error.to_string())?;
    let parent = std::fs::canonicalize(parent).map_err(|error| error.to_string())?;
    let directory = Dir::open_ambient_dir(&parent, cap_std::ambient_authority())
        .map_err(|error| error.to_string())?;
    match directory.create_dir("image-storage") {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(error.to_string()),
    }
    if directory
        .symlink_metadata("image-storage")
        .map_err(|error| error.to_string())?
        .file_type()
        .is_symlink()
    {
        return Err("图片存储目录不能是符号链接".into());
    }
    let path = parent.join("image-storage");
    let child = Arc::new(
        directory
            .open_dir("image-storage")
            .map_err(|error| error.to_string())?,
    );
    document_service::DirectoryBookmark::capture(&child, &path)
        .and_then(|bookmark| bookmark.reopen())
        .map_err(|error| error.to_string())?;
    Ok((child, path))
}

fn record_bytes<T: Serialize>(record: &T) -> Result<Vec<u8>, String> {
    let bytes = serde_json::to_vec(record).map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_RECORD_BYTES {
        return Err("图片恢复记录超过限制".into());
    }
    Ok(bytes)
}

fn check_record_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.len() > 256
        || name.chars().any(char::is_control)
        || std::path::Path::new(name).components().count() != 1
        || !matches!(
            std::path::Path::new(name).components().next(),
            Some(std::path::Component::Normal(_))
        )
    {
        return Err("图片恢复记录名称无效".into());
    }
    Ok(())
}

/// Returns false only when an immutable record was already published. A fully
/// written stage is linked without replacement, so concurrent retries cannot
/// overwrite the first version even when there is no caller-held file lane.
fn publish_record(root: &Dir, name: &str, bytes: &[u8], replace: bool) -> Result<bool, String> {
    check_record_name(name)?;
    if bytes.len() as u64 > MAX_RECORD_BYTES {
        return Err("图片恢复记录超过限制".into());
    }
    let stage = format!(".record-{}", uuid::Uuid::new_v4());
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let result = (|| -> std::io::Result<bool> {
        let mut file = root.open_with(&stage, &options)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);
        if replace {
            root.rename(&stage, root, name)?;
        } else {
            match root.hard_link(&stage, root, name) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                    return Ok(false)
                }
                Err(error) => return Err(error),
            }
        }
        #[cfg(unix)]
        root.try_clone()?.into_std_file().sync_all()?;
        Ok(true)
    })();
    let _ = root.remove_file(stage);
    result.map_err(|error| error.to_string())
}

fn write_record<T: Serialize>(root: &Dir, name: &str, record: &T) -> Result<(), String> {
    publish_record(root, name, &record_bytes(record)?, true).map(|_| ())
}

fn valid_record_metadata(metadata: &cap_std::fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return false;
        }
    }
    metadata.is_file() && !metadata.file_type().is_symlink() && metadata.len() <= MAX_RECORD_BYTES
}

fn read_record<T: serde::de::DeserializeOwned>(
    root: &Dir,
    name: &str,
) -> Result<Option<T>, String> {
    check_record_name(name)?;
    let metadata = match root.symlink_metadata(name) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.to_string()),
    };
    if !valid_record_metadata(&metadata) {
        return Err("图片恢复记录不是有效的普通文件".into());
    }
    let mut file = root.open(name).map_err(|error| error.to_string())?;
    let opened = file.metadata().map_err(|error| error.to_string())?;
    if !valid_record_metadata(&opened) {
        return Err("图片恢复记录不是有效的普通文件".into());
    }
    #[cfg(unix)]
    {
        use cap_std::fs::MetadataExt;
        if (metadata.dev(), metadata.ino()) != (opened.dev(), opened.ino()) {
            return Err("图片恢复记录读取期间已变化".into());
        }
    }
    let identity = same_file::Handle::from_file(
        file.try_clone()
            .map_err(|error| error.to_string())?
            .into_std(),
    )
    .map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(MAX_RECORD_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    let after = root
        .symlink_metadata(name)
        .map_err(|error| error.to_string())?;
    let observed = same_file::Handle::from_file(
        root.open(name)
            .map_err(|error| error.to_string())?
            .into_std(),
    )
    .map_err(|error| error.to_string())?;
    let retained = file.metadata().map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_RECORD_BYTES
        || !valid_record_metadata(&after)
        || identity != observed
        || opened.len() != retained.len()
        || opened.modified().ok() != retained.modified().ok()
    {
        return Err("图片恢复记录读取期间已变化或超过限制".into());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "图片恢复记录损坏，原图片已保留".into())
}

pub(super) fn persist_draft(
    app: &AppHandle,
    documents: &DocumentService,
    id: &str,
) -> Result<(), String> {
    let snapshot = documents
        .image_draft_snapshot(id)
        .map_err(|error| error.to_string())?;
    let (root, _) = root(app)?;
    persist_draft_at(&root, &snapshot)
}

fn persist_draft_at(root: &Dir, snapshot: &ImageDraftSnapshot) -> Result<(), String> {
    checked_uuid(snapshot.id())?;
    write_record(root, &format!("draft-{}.json", snapshot.id()), snapshot)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoveryImages {
    version: u64,
    snapshot: ImageDraftSnapshot,
}

fn checked_uuid(id: &str) -> Result<(), String> {
    if uuid::Uuid::parse_str(id)
        .ok()
        .map(|value| value.to_string())
        .as_deref()
        != Some(id)
    {
        return Err("恢复会话身份无效".into());
    }
    Ok(())
}
fn recovery_name(id: &str, version: u64) -> Result<String, String> {
    checked_uuid(id)?;
    if version == 0 || version > 9_007_199_254_740_991 {
        return Err("图片检查点版本无效".into());
    }
    Ok(format!("recovery-{id}-{version}.json"))
}
fn read_recovery_at(root: &Dir, id: &str, version: u64) -> Result<Option<RecoveryImages>, String> {
    let Some(record): Option<RecoveryImages> = read_record(root, &recovery_name(id, version)?)?
    else {
        return Ok(None);
    };
    if record.version != version {
        return Err("图片检查点版本不符，未恢复旧权限".into());
    }
    snapshot_view(&record.snapshot)?;
    Ok(Some(record))
}

pub(super) fn persist_recovery(
    app: &AppHandle,
    recovery_id: &str,
    version: u64,
    snapshot: ImageDraftSnapshot,
) -> Result<(), String> {
    let (root, _) = root(app)?;
    persist_recovery_at(&root, recovery_id, version, snapshot)
}
fn persist_recovery_at(
    root: &Dir,
    id: &str,
    version: u64,
    snapshot: ImageDraftSnapshot,
) -> Result<(), String> {
    snapshot_view(&snapshot)?;
    let name = recovery_name(id, version)?;
    let record = RecoveryImages { version, snapshot };
    let bytes = record_bytes(&record)?;
    if publish_record(root, &name, &bytes, false)? {
        return Ok(());
    }
    let existing =
        read_recovery_at(root, id, version)?.ok_or("图片检查点首次记录不可用，未覆写")?;
    if record_bytes(&existing)? != bytes {
        return Err("图片检查点关联冲突，已保留首次记录".into());
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SnapshotView {
    id: String,
    directory: document_service::DirectoryBookmark,
    images: Vec<SnapshotImage>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SnapshotImage {
    source: String,
    reference: String,
}

// Snapshot fields stay private in core. Inspect its serialized native schema;
// this helper is never exposed as a renderer manifest deserializer.
fn snapshot_view(snapshot: &ImageDraftSnapshot) -> Result<SnapshotView, String> {
    let view: SnapshotView =
        serde_json::from_slice(&record_bytes(snapshot)?).map_err(|_| "图片暂存记录格式无效")?;
    checked_uuid(&view.id)?;
    // Portable and file-URI keys may name the same native asset. Alias keys do
    // not double the underlying per-document resource quota.
    if view.images.len() > image_assets::MAX_DOCUMENT_IMAGES * 2 {
        return Err("图片绑定数量超过限制".into());
    }
    let directory =
        tauri::Url::from_directory_path(view.directory.path()).map_err(|_| "图片暂存目录无效")?;
    let mut known = std::collections::HashSet::new();
    let mut files = std::collections::HashSet::new();
    for image in &view.images {
        let reference = std::path::Path::new(&image.reference);
        if image.reference.is_empty()
            || image.reference.len() > 4096
            || image.reference.contains(['/', '\\', '?', '#'])
            || image.reference.chars().any(char::is_control)
            || reference.components().count() != 1
            || !matches!(
                reference.components().next(),
                Some(std::path::Component::Normal(_))
            )
            || !known.insert(&image.source)
        {
            return Err("图片暂存记录来源无效".into());
        }
        files.insert(&image.reference);
        let expected = directory
            .join(&image.reference)
            .map_err(|_| "图片暂存引用无效")?
            .to_file_path()
            .map_err(|_| "图片暂存引用无效")?;
        if expected.parent() != Some(view.directory.path()) {
            return Err("图片暂存引用已越界".into());
        }
        let portable = format!("staged/{}/{}", view.id, image.reference);
        let same_native_file = tauri::Url::parse(&image.source)
            .ok()
            .filter(|url| {
                url.scheme() == "file"
                    && url.username().is_empty()
                    && url.password().is_none()
                    && url.query().is_none()
                    && url.fragment().is_none()
            })
            .and_then(|url| url.to_file_path().ok())
            .is_some_and(|path| path == expected);
        if image.source != portable && !same_native_file {
            return Err("图片暂存记录来源无效".into());
        }
    }
    if files.len() > image_assets::MAX_DOCUMENT_IMAGES {
        return Err("图片绑定数量超过限制".into());
    }
    Ok(view)
}

fn staged_sources(
    text: &str,
    display_root: &std::path::Path,
) -> Result<std::collections::HashSet<String>, String> {
    if text.len() > document_service::MAX_TEXT_BYTES {
        return Err("图片检查点正文超过限制".into());
    }
    let mut sources = std::collections::HashSet::new();
    for (offset, _) in text.match_indices("staged/") {
        // A staged segment inside an absolute path or URL is not a portable
        // key; file URIs are handled below as their exact complete source.
        if text[..offset].chars().next_back().is_some_and(|character| {
            character.is_alphanumeric() || matches!(character, '/' | '.' | '-' | '_' | '%' | ':')
        }) {
            continue;
        }
        let rest = &text[offset + "staged/".len()..];
        let Some((id, _)) = rest.split_once('/') else {
            continue;
        };
        if checked_uuid(id).is_err() {
            continue;
        }
        let candidate = &text[offset..];
        let end = candidate
            .find(|character: char| {
                !character.is_alphanumeric() && !matches!(character, '/' | '.' | '-' | '_' | '%')
            })
            .unwrap_or(candidate.len());
        insert_source(&mut sources, &candidate[..end])?;
    }
    let staged = display_root.join("staged");
    for (offset, _) in text.match_indices("file://") {
        let candidate = &text[offset..];
        let end = candidate
            .find(|character: char| {
                character.is_whitespace() || matches!(character, '<' | '>' | '\"' | '`' | ')' | ']')
            })
            .unwrap_or(candidate.len());
        // A closing single quote can delimit an HTML src; apostrophes inside a
        // native directory path remain part of the actual file URL.
        let source = candidate[..end].trim_end_matches('\'');
        let Some(path) = tauri::Url::parse(source)
            .ok()
            .filter(|url| url.scheme() == "file")
            .and_then(|url| url.to_file_path().ok())
        else {
            continue;
        };
        if path.strip_prefix(&staged).is_ok() {
            insert_source(&mut sources, source)?;
        }
    }
    Ok(sources)
}
fn insert_source(
    sources: &mut std::collections::HashSet<String>,
    source: &str,
) -> Result<(), String> {
    if source.len() > 4096 {
        return Err("图片检查点引用超过限制".into());
    }
    sources.insert(source.to_owned());
    if sources.len() > image_assets::MAX_DOCUMENT_IMAGES * 2 {
        return Err("图片绑定数量超过限制".into());
    }
    Ok(())
}

fn matches_sources(
    snapshot: &ImageDraftSnapshot,
    requested: &std::collections::HashSet<String>,
) -> Result<bool, String> {
    let view = snapshot_view(snapshot)?;
    let known: std::collections::HashSet<_> = view
        .images
        .iter()
        .map(|image| image.source.as_str())
        .collect();
    Ok(requested
        .iter()
        .all(|source| known.contains(source.as_str())))
}

pub(super) fn select_checkpoint_snapshot(
    app: &AppHandle,
    id: &str,
    expected_version: u64,
    text: &str,
    current: Option<ImageDraftSnapshot>,
) -> Result<Option<ImageDraftSnapshot>, String> {
    let (root, path) = root(app)?;
    select_checkpoint_snapshot_at(&root, &path, id, expected_version, text, current)
}
fn select_checkpoint_snapshot_at(
    root: &Dir,
    display_root: &std::path::Path,
    id: &str,
    expected_version: u64,
    text: &str,
    current: Option<ImageDraftSnapshot>,
) -> Result<Option<ImageDraftSnapshot>, String> {
    checked_uuid(id)?;
    if expected_version > 9_007_199_254_740_991 {
        return Err("图片检查点版本无效".into());
    }
    let requested = staged_sources(text, display_root)?;
    if requested.is_empty() {
        return Ok(None);
    }
    if let Some(current) = current {
        if matches_sources(&current, &requested)? {
            return Ok(Some(current));
        }
    }
    if expected_version != 0 {
        if let Some(previous) = read_recovery_at(root, id, expected_version)? {
            // The previous native checkpoint is the only source of this ID.
            // Markdown cannot select arbitrary draft-<UUID>.json manifests.
            let previous_view = snapshot_view(&previous.snapshot)?;
            let refreshed: Option<ImageDraftSnapshot> =
                read_record(root, &format!("draft-{}.json", previous.snapshot.id()))?;
            if let Some(refreshed) = refreshed {
                let view = snapshot_view(&refreshed)?;
                if view.id != previous_view.id || view.directory != previous_view.directory {
                    return Err("图片暂存身份已变化，未恢复旧权限".into());
                }
                if matches_sources(&refreshed, &requested)? {
                    return Ok(Some(refreshed));
                }
            }
            if matches_sources(&previous.snapshot, &requested)? {
                return Ok(Some(previous.snapshot));
            }
        }
    }
    Err("检查点图片缺少匹配的本机来源记录，正文仍会保留".into())
}

/// Only a native checkpoint association grants staged images. Markdown UUIDs
/// and renderer-supplied metadata never grant access to another draft.
pub(super) fn restore_draft(
    app: &AppHandle,
    documents: &mut DocumentService,
    recovery_id: &str,
    version: u64,
) -> Result<Option<String>, String> {
    let (root, path) = root(app)?;
    restore_draft_at(root, &path, documents, recovery_id, version)
}
fn restore_draft_at(
    root: Arc<Dir>,
    path: &std::path::Path,
    documents: &mut DocumentService,
    id: &str,
    version: u64,
) -> Result<Option<String>, String> {
    let Some(record) = read_recovery_at(&root, id, version)? else {
        return Ok(None);
    };
    let snapshot = record.snapshot;
    if documents.image_draft_snapshot(snapshot.id()).is_ok() {
        return Ok(Some(snapshot.id().into()));
    }
    documents
        .restore_image_draft(root, path, &snapshot)
        .map(Some)
        .map_err(|error| error.to_string())
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Binding {
    document: DocumentBookmark,
    identity: ImageDocumentIdentity,
    aliases: Vec<(String, String)>,
    #[serde(default)]
    staged: Vec<StagedBinding>,
    #[serde(default)]
    recovery_history: Vec<ImageDraftSnapshot>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StagedBinding {
    snapshot: ImageDraftSnapshot,
    references: Vec<String>,
}

fn binding_name(path: &std::path::Path) -> String {
    let mut digest = 0xcbf29ce484222325u64;
    for byte in path.to_string_lossy().as_bytes() {
        digest = (digest ^ u64::from(*byte)).wrapping_mul(0x100000001b3);
    }
    format!("binding-{digest:016x}.json")
}

fn binding_matches(
    documents: &DocumentService,
    id: &str,
    record: &Binding,
) -> Result<bool, String> {
    let bookmark = documents.bookmark(id).map_err(|error| error.to_string())?;
    validate_binding(record)?;
    Ok(record.document == bookmark
        && documents
            .matches_image_document_identity(id, &record.identity)
            .map_err(|error| error.to_string())?)
}
fn validate_binding(record: &Binding) -> Result<(), String> {
    if record.recovery_history.len() > 128 {
        return Err("图片历史恢复记录超过限制".into());
    }
    let mut history_bytes = 0;
    for snapshot in &record.recovery_history {
        snapshot_view(snapshot)?;
        history_bytes += record_bytes(snapshot)?.len();
        if history_bytes > MAX_RECORD_BYTES as usize / 2 {
            return Err("图片历史恢复记录超过限制".into());
        }
    }
    if record.aliases.len() > 256
        || record.staged.len() > 128
        || record
            .staged
            .iter()
            .map(|item| item.references.len())
            .sum::<usize>()
            > image_assets::MAX_DOCUMENT_IMAGES * 2
    {
        return Err("图片绑定数量超过限制".into());
    }
    let mut resources = std::collections::HashSet::new();
    for staged in &record.staged {
        let view = snapshot_view(&staged.snapshot)?;
        let directory_identity = record_bytes(&view.directory)?;
        let known: std::collections::HashMap<_, _> = view
            .images
            .iter()
            .map(|image| (image.source.as_str(), image.reference.as_str()))
            .collect();
        for source in &staged.references {
            let reference = known.get(source.as_str()).ok_or("图片绑定来源无效")?;
            resources.insert((directory_identity.clone(), (*reference).to_owned()));
            if resources.len() > image_assets::MAX_DOCUMENT_IMAGES {
                return Err("图片绑定数量超过限制".into());
            }
        }
    }
    Ok(())
}
fn current_binding(
    root: &Dir,
    documents: &DocumentService,
    id: &str,
) -> Result<Option<Binding>, String> {
    let bookmark = documents.bookmark(id).map_err(|error| error.to_string())?;
    let Some(binding): Option<Binding> = read_record(root, &binding_name(&bookmark.path()))? else {
        return Ok(None);
    };
    if !binding_matches(documents, id, &binding)? {
        return Err("文稿文件实体或所属目录已被替换，未恢复旧图片权限".into());
    }
    Ok(Some(binding))
}

pub(super) fn read_aliases(
    app: &AppHandle,
    documents: &DocumentService,
    id: &str,
) -> Result<Vec<(String, String)>, String> {
    let (root, _) = root(app)?;
    read_aliases_at(&root, documents, id)
}
fn read_aliases_at(
    root: &Dir,
    documents: &DocumentService,
    id: &str,
) -> Result<Vec<(String, String)>, String> {
    Ok(current_binding(root, documents, id)?.map_or_else(Vec::new, |record| record.aliases))
}
pub(super) fn persist_aliases(
    app: &AppHandle,
    documents: &DocumentService,
    id: &str,
    aliases: Vec<(String, String)>,
) -> Result<(), String> {
    let (root, _) = root(app)?;
    persist_aliases_at(&root, documents, id, aliases)
}
fn persist_aliases_at(
    root: &Dir,
    documents: &DocumentService,
    id: &str,
    aliases: Vec<(String, String)>,
) -> Result<(), String> {
    let bookmark = documents.bookmark(id).map_err(|error| error.to_string())?;
    let name = binding_name(&bookmark.path());
    let identity = documents
        .capture_image_document_identity(id)
        .map_err(|error| error.to_string())?;
    let previous: Option<Binding> = read_record(root, &name)?;
    let (staged, recovery_history) = match previous {
        Some(record) if binding_matches(documents, id, &record)? => {
            (record.staged, record.recovery_history)
        }
        _ => (Vec::new(), Vec::new()),
    };
    let record = Binding {
        document: bookmark,
        identity,
        aliases,
        staged,
        recovery_history,
    };
    validate_binding(&record)?;
    write_record(root, &name, &record)
}

pub(super) fn persist_staged_alias(
    app: &AppHandle,
    documents: &DocumentService,
    id: &str,
    draft: &str,
    source: &str,
) -> Result<(), String> {
    let (root, _) = root(app)?;
    persist_staged_alias_at(&root, documents, id, draft, source)
}
fn persist_staged_alias_at(
    root: &Dir,
    documents: &DocumentService,
    id: &str,
    draft: &str,
    source: &str,
) -> Result<(), String> {
    let document = documents.bookmark(id).map_err(|error| error.to_string())?;
    let name = binding_name(&document.path());
    let identity = documents
        .capture_image_document_identity(id)
        .map_err(|error| error.to_string())?;
    let previous: Option<Binding> = read_record(root, &name)?;
    let mut binding = match previous {
        Some(record) if binding_matches(documents, id, &record)? => record,
        _ => Binding {
            document,
            identity,
            aliases: Vec::new(),
            staged: Vec::new(),
            recovery_history: Vec::new(),
        },
    };
    let snapshot = documents
        .image_draft_snapshot(draft)
        .map_err(|error| error.to_string())?;
    if let Some(entry) = binding
        .staged
        .iter_mut()
        .find(|entry| entry.snapshot.id() == draft)
    {
        entry.snapshot = snapshot;
        if !entry.references.iter().any(|value| value == source) {
            entry.references.push(source.into());
        }
    } else {
        binding.staged.push(StagedBinding {
            snapshot,
            references: vec![source.into()],
        });
    }
    validate_binding(&binding)?;
    write_record(root, &name, &binding)
}
pub(super) fn restore_aliases(
    app: &AppHandle,
    documents: &mut DocumentService,
    id: &str,
) -> Result<(), String> {
    let (root, path) = root(app)?;
    restore_aliases_at(root, &path, documents, id)
}
fn restore_aliases_at(
    root: Arc<Dir>,
    path: &std::path::Path,
    documents: &mut DocumentService,
    id: &str,
) -> Result<(), String> {
    let Some(binding) = current_binding(&root, documents, id)? else {
        return Ok(());
    };
    // Targets are native-persisted scope-relative paths, already expanded from
    // their original YAML root by SaveAs. Current renderer YAML is not a grant.
    for aliases in binding.aliases.chunks(image_assets::MAX_DOCUMENT_IMAGES) {
        documents
            .attach_image_aliases(id, aliases)
            .map_err(|error| error.to_string())?;
    }
    for staged in binding.staged {
        let draft = staged.snapshot.id().to_owned();
        if documents.image_draft_snapshot(&draft).is_err() {
            documents
                .restore_image_draft(Arc::clone(&root), path, &staged.snapshot)
                .map_err(|error| error.to_string())?;
        }
        documents
            .attach_image_draft_aliases(id, &draft, &staged.references)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// Capture before our atomic Save; only that successful publication may rebind
/// this record to the replacement inode. A newly opened external occupant cannot.
pub(super) fn before_save(
    app: &AppHandle,
    documents: &DocumentService,
    id: &str,
) -> Result<Option<Binding>, String> {
    let (root, _) = root(app)?;
    before_save_at(&root, documents, id)
}
fn before_save_at(
    root: &Dir,
    documents: &DocumentService,
    id: &str,
) -> Result<Option<Binding>, String> {
    let bookmark = documents.bookmark(id).map_err(|error| error.to_string())?;
    let binding: Option<Binding> = read_record(root, &binding_name(&bookmark.path()))?;
    match binding {
        Some(record) if binding_matches(documents, id, &record)? => Ok(Some(record)),
        _ => Ok(None),
    }
}
pub(super) fn after_save(
    app: &AppHandle,
    documents: &DocumentService,
    id: &str,
    record: Option<Binding>,
) -> Result<(), String> {
    let (root, _) = root(app)?;
    after_save_at(&root, documents, id, record)
}
fn after_save_at(
    root: &Dir,
    documents: &DocumentService,
    id: &str,
    record: Option<Binding>,
) -> Result<(), String> {
    let Some(mut record) = record else {
        return Ok(());
    };
    let bookmark = documents.bookmark(id).map_err(|error| error.to_string())?;
    if record.document != bookmark {
        return Err("正文已保存，图片绑定文稿位置已改变".into());
    }
    record.identity = documents
        .capture_image_document_identity(id)
        .map_err(|error| error.to_string())?;
    record.document = bookmark;
    validate_binding(&record)?;
    write_record(root, &binding_name(&record.document.path()), &record)
}

/// Metadata only: these proofs permit later recovery selection, not live stage
/// activation or registry allocation while a copied document is being edited.
pub(super) fn recovery_history(binding: Option<&Binding>) -> Vec<ImageDraftSnapshot> {
    binding.map_or_else(Vec::new, |record| {
        record
            .recovery_history
            .iter()
            .cloned()
            .chain(record.staged.iter().map(|stage| stage.snapshot.clone()))
            .collect()
    })
}
pub(super) fn persist_recovery_history(
    app: &AppHandle,
    documents: &DocumentService,
    id: &str,
    history: Vec<ImageDraftSnapshot>,
) -> Result<(), String> {
    let (root, _) = root(app)?;
    persist_recovery_history_at(&root, documents, id, history)
}
fn persist_recovery_history_at(
    root: &Dir,
    documents: &DocumentService,
    id: &str,
    history: Vec<ImageDraftSnapshot>,
) -> Result<(), String> {
    if history.is_empty() {
        return Ok(());
    }
    let document = documents.bookmark(id).map_err(|error| error.to_string())?;
    let identity = documents
        .capture_image_document_identity(id)
        .map_err(|error| error.to_string())?;
    let name = binding_name(&document.path());
    let previous: Option<Binding> = read_record(root, &name)?;
    let mut binding = match previous {
        Some(record) if binding_matches(documents, id, &record)? => record,
        _ => Binding {
            document,
            identity,
            aliases: Vec::new(),
            staged: Vec::new(),
            recovery_history: Vec::new(),
        },
    };
    for snapshot in history {
        let incoming = snapshot_view(&snapshot)?;
        if let Some(existing) = binding
            .recovery_history
            .iter_mut()
            .find(|old| old.id() == snapshot.id())
        {
            let old = snapshot_view(existing)?;
            if old.directory != incoming.directory {
                return Err("图片历史来源身份冲突".into());
            }
            let previous_sources = old
                .images
                .iter()
                .map(|image| image.source.clone())
                .collect();
            if matches_sources(&snapshot, &previous_sources)? {
                *existing = snapshot;
            } else {
                let incoming_sources = incoming
                    .images
                    .iter()
                    .map(|image| image.source.clone())
                    .collect();
                if !matches_sources(existing, &incoming_sources)? {
                    return Err("图片历史来源记录不完整".into());
                }
            }
        } else {
            binding.recovery_history.push(snapshot);
        }
    }
    validate_binding(&binding)?;
    write_record(root, &name, &binding)
}
pub(super) fn bound_checkpoint_snapshot(
    app: &AppHandle,
    documents: &DocumentService,
    id: &str,
    text: &str,
) -> Result<Option<ImageDraftSnapshot>, String> {
    let (root, path) = root(app)?;
    bound_checkpoint_snapshot_at(&root, &path, documents, id, text)
}
fn bound_checkpoint_snapshot_at(
    root: &Dir,
    path: &std::path::Path,
    documents: &DocumentService,
    id: &str,
    text: &str,
) -> Result<Option<ImageDraftSnapshot>, String> {
    let requested = staged_sources(text, path)?;
    if requested.is_empty() {
        return Ok(None);
    }
    let Some(binding) = current_binding(root, documents, id)? else {
        return Ok(None);
    };
    for snapshot in recovery_history(Some(&binding)) {
        if matches_sources(&snapshot, &requested)? {
            return Ok(Some(snapshot));
        }
    }
    Ok(None)
}

/// Discover an existing named stage only through its verified native binding.
/// Old mixed-owner records are not resolved by picking a Markdown UUID.
pub(super) fn existing_staged_owner(
    app: &AppHandle,
    documents: &mut DocumentService,
    id: &str,
) -> Result<Option<String>, String> {
    let (root, path) = root(app)?;
    existing_staged_owner_at(root, &path, documents, id)
}
fn existing_staged_owner_at(
    root: Arc<Dir>,
    path: &std::path::Path,
    documents: &mut DocumentService,
    id: &str,
) -> Result<Option<String>, String> {
    let Some(mut binding) = current_binding(&root, documents, id)? else {
        return Ok(None);
    };
    if binding.staged.is_empty() {
        return Ok(None);
    }
    if binding.staged.len() != 1 {
        return Err("文稿包含多个暂存图片来源，未自动选择图片权限".into());
    }
    let staged = binding.staged.pop().expect("one native binding");
    let draft = staged.snapshot.id().to_owned();
    if documents.image_draft_snapshot(&draft).is_err() {
        documents
            .restore_image_draft(Arc::clone(&root), path, &staged.snapshot)
            .map_err(|error| error.to_string())?;
    }
    documents
        .attach_image_draft_aliases(id, &draft, &staged.references)
        .map_err(|error| error.to_string())?;
    Ok(Some(draft))
}

/// Carry only native-captured staged permissions across our own SaveAs. The
/// source Binding is obtained before publication while its original entity is
/// still verified; neither renderer Markdown nor old relative aliases enter it.
pub(super) fn preserve_staged_binding(
    app: &AppHandle,
    documents: &mut DocumentService,
    destination_id: &str,
    source: Option<Binding>,
) -> Result<(), String> {
    let (root, path) = root(app)?;
    preserve_staged_binding_at(root, &path, documents, destination_id, source)
}
fn preserve_staged_binding_at(
    root: Arc<Dir>,
    path: &std::path::Path,
    documents: &mut DocumentService,
    destination_id: &str,
    source: Option<Binding>,
) -> Result<(), String> {
    let Some(source) = source else { return Ok(()) };
    validate_binding(&source)?;
    if source.staged.is_empty() {
        return Ok(());
    }
    let document = documents
        .bookmark(destination_id)
        .map_err(|error| error.to_string())?;
    let identity = documents
        .capture_image_document_identity(destination_id)
        .map_err(|error| error.to_string())?;
    let name = binding_name(&document.path());
    let previous: Option<Binding> = read_record(&root, &name)?;
    let mut binding = match previous {
        Some(record) if binding_matches(documents, destination_id, &record)? => record,
        _ => Binding {
            document,
            identity,
            aliases: Vec::new(),
            staged: Vec::new(),
            recovery_history: Vec::new(),
        },
    };
    for incoming in source.staged {
        if let Some(retained) = binding
            .staged
            .iter_mut()
            .find(|entry| entry.snapshot.id() == incoming.snapshot.id())
        {
            let old = snapshot_view(&retained.snapshot)?;
            let new = snapshot_view(&incoming.snapshot)?;
            if old.directory != new.directory {
                return Err("图片暂存身份已变化，未合并旧权限".into());
            }
            let references: std::collections::HashSet<_> = retained
                .references
                .iter()
                .chain(&incoming.references)
                .cloned()
                .collect();
            if !matches_sources(&retained.snapshot, &references)? {
                if !matches_sources(&incoming.snapshot, &references)? {
                    return Err("图片暂存来源不完整，未合并旧权限".into());
                }
                retained.snapshot = incoming.snapshot;
            }
            retained.references = references.into_iter().collect();
            retained.references.sort_unstable();
        } else {
            binding.staged.push(incoming);
        }
    }
    validate_binding(&binding)?;
    for staged in &binding.staged {
        let id = staged.snapshot.id();
        if documents.image_draft_snapshot(id).is_err() {
            documents
                .restore_image_draft(Arc::clone(&root), path, &staged.snapshot)
                .map_err(|error| error.to_string())?;
        }
        documents
            .attach_image_draft_aliases(destination_id, id, &staged.references)
            .map_err(|error| error.to_string())?;
    }
    write_record(&root, &name, &binding)
}

#[cfg(test)]
#[path = "storage/tests.rs"]
mod tests;
