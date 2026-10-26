//! Native-selected file receipts. Renderer input can consume a receipt, never
//! create file authority by supplying a path, basename, UUID, or file URL.
use super::{Content, NativeClipboardInput};
use crate::commands::images::{self, NativeInputOwner};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{Manager, WebviewWindow};

const MAX_FILES: usize = 32;
const MAX_PENDING: usize = 32;
const MAX_CAPTURES: usize = 4;
const MAX_TOTAL_BYTES: usize = 64 * 1024 * 1024;
const LIFETIME: Duration = Duration::from_secs(60);
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum InputKind {
    Image,
    File,
    Directory,
}
#[derive(Clone, Debug, Serialize)]
pub(crate) struct InputEntry {
    pub name: String,
    pub kind: InputKind,
}
#[derive(Clone, Copy, Debug, Default, Serialize)]
pub(crate) struct InputPosition {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Copy, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InputModifiers {
    pub alt: bool,
    pub control: bool,
    pub meta: bool,
    pub shift: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeInputReceipt {
    pub ticket: String,
    pub entries: Vec<InputEntry>,
    pub position: InputPosition,
    pub modifiers: InputModifiers,
}
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum NativePaste {
    Images {
        ticket: String,
        entries: Vec<InputEntry>,
    },
    Files {
        ticket: String,
        entries: Vec<InputEntry>,
    },
    Content {
        content: Content,
    },
    Empty,
}
pub(crate) struct SelectedPath {
    path: PathBuf,
    identity: same_file::Handle,
    parent_identity: same_file::Handle,
    kind: InputKind,
}
impl SelectedPath {
    fn capture(path: PathBuf) -> Result<Self, String> {
        validate_path(&path)?;
        let metadata = fs::symlink_metadata(&path).map_err(|_| "所选文件无法读取")?;
        let kind = if metadata.is_dir() {
            InputKind::Directory
        } else if metadata.is_file() {
            if is_image(&path) {
                InputKind::Image
            } else {
                InputKind::File
            }
        } else {
            return Err("原生输入仅接受普通文件与目录".into());
        };
        // A file receipt includes its captured directory entity. A leaf inode
        // alone could be hard-linked into a replaced parent and must never grant
        // that parent's unrelated siblings to a later DocumentService open.
        let parent = path.parent().unwrap_or(path.as_path());
        let directory = cap_std::fs::Dir::open_ambient_dir(parent, cap_std::ambient_authority())
            .map_err(|_| "无法打开所选文件父目录")?;
        let parent_identity = same_file::Handle::from_file(
            directory
                .try_clone()
                .map_err(|_| "无法保留所选文件父目录")?
                .into_std_file(),
        )
        .map_err(|_| "无法验证所选文件父目录")?;
        let basename = path.file_name().map(Path::new).unwrap_or(Path::new("."));
        let leaf = if kind == InputKind::Directory {
            directory
                .open_dir(basename)
                .map_err(|_| "无法打开所选目录实体")?
                .into_std_file()
        } else {
            let file = directory
                .open(basename)
                .map_err(|_| "无法打开所选文件实体")?
                .into_std();
            if !file
                .metadata()
                .map_err(|_| "无法验证所选文件类型")?
                .is_file()
            {
                return Err("所选文件类型已改变".into());
            }
            file
        };
        let identity = same_file::Handle::from_file(leaf).map_err(|_| "无法验证所选文件")?;
        let selected = Self {
            path,
            identity,
            parent_identity,
            kind,
        };
        selected.verify()?;
        Ok(selected)
    }
    fn verify(&self) -> Result<(), String> {
        validate_path(&self.path)?;
        let parent = self.path.parent().unwrap_or(self.path.as_path());
        let before_parent =
            same_file::Handle::from_path(parent).map_err(|_| "所选文件父目录已不可用")?;
        if before_parent != self.parent_identity {
            return Err("所选文件父目录已替换，请重新拖放或复制".into());
        }
        let actual = same_file::Handle::from_path(&self.path).map_err(|_| "所选文件已不可用")?;
        if actual != self.identity {
            return Err("所选文件已替换，请重新拖放或复制".into());
        }
        // Recheck after resolving the leaf. The retained parent handle is also
        // passed into Native open so a parent swap/revert during actual scope
        // creation cannot hide behind a hard link to the same selected leaf.
        let after_parent =
            same_file::Handle::from_path(parent).map_err(|_| "所选文件父目录已不可用")?;
        if after_parent != self.parent_identity {
            return Err("验证期间所选文件父目录已替换".into());
        }
        Ok(())
    }
    pub(crate) fn attachment_bytes(&self) -> Result<(String, Vec<u8>), String> {
        if self.kind == InputKind::Directory {
            return Err("请添加文件，暂不支持目录附件".into());
        }
        let name = self
            .path
            .file_name()
            .and_then(|s| s.to_str())
            .ok_or("附件名称无效")?
            .to_string();
        Ok((
            name,
            self.read_image()
                .map_err(|error| error.replace("图片", "附件"))?,
        ))
    }
    fn read_image(&self) -> Result<Vec<u8>, String> {
        self.verify()?;
        let directory = cap_std::fs::Dir::from_std_file(
            self.parent_identity
                .as_file()
                .try_clone()
                .map_err(|_| "所选图片父目录无法保留")?,
        );
        let basename = self.path.file_name().ok_or("所选图片文件名无效")?;
        let file = directory
            .open(basename)
            .map_err(|_| "所选图片无法读取")?
            .into_std();
        let opened =
            same_file::Handle::from_file(file.try_clone().map_err(|_| "无法验证所选图片")?)
                .map_err(|_| "无法验证所选图片")?;
        if opened != self.identity {
            return Err("所选图片已替换".into());
        }
        let before = file.metadata().map_err(|_| "无法读取图片属性")?;
        if !before.is_file() || before.len() > image_assets::MAX_IMAGE_BYTES as u64 {
            return Err("所选图片超过每张 8 MiB 限制".into());
        }
        let mut bytes = Vec::new();
        file.take(image_assets::MAX_IMAGE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "所选图片读取失败")?;
        if bytes.len() > image_assets::MAX_IMAGE_BYTES || bytes.len() as u64 != before.len() {
            return Err("图片读取期间大小改变".into());
        }
        let after = opened
            .as_file()
            .metadata()
            .map_err(|_| "无法复核图片属性")?;
        if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
            return Err("读取期间图片内容已改变".into());
        }
        self.verify()?;
        Ok(bytes)
    }
}
fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| {
            [
                "png", "jpg", "jpeg", "gif", "webp", "svg", "tif", "tiff", "bmp",
            ]
            .contains(&value.to_ascii_lowercase().as_str())
        })
}
fn validate_path(path: &Path) -> Result<(), String> {
    if !path.is_absolute()
        || path.as_os_str().len() > 8192
        || path.to_string_lossy().chars().any(char::is_control)
    {
        return Err("原生文件路径无效".into());
    }
    let mut current = PathBuf::new();
    for part in path.components() {
        if matches!(
            part,
            std::path::Component::ParentDir | std::path::Component::CurDir
        ) {
            return Err("原生文件路径不能包含相对跳转".into());
        }
        current.push(part);
        // A Windows drive/UNC prefix alone is not an absolute filesystem entry.
        // Validate it after RootDir is appended, then validate every descendant.
        if matches!(part, std::path::Component::Prefix(_)) {
            continue;
        }
        let metadata = fs::symlink_metadata(&current).map_err(|_| "所选路径已不可用")?;
        if metadata.file_type().is_symlink() {
            return Err("所选路径含符号链接，请选择真实文件".into());
        }
    }
    Ok(())
}
/// Captured on AppKit's main thread while the pasteboard version is fenced.
/// It carries real selected entities, never only paths opened later in a worker.
pub(crate) enum NativeClipboardSnapshot {
    Files(Vec<SelectedPath>),
    Content(Content),
    Image(super::NativeImage),
    Empty,
}
impl NativeClipboardSnapshot {
    pub(crate) fn capture(input: NativeClipboardInput) -> Result<Self, String> {
        Ok(match input {
            NativeClipboardInput::Files(paths) => Self::Files(
                paths
                    .into_iter()
                    .map(SelectedPath::capture)
                    .collect::<Result<Vec<_>, _>>()?,
            ),
            NativeClipboardInput::Content(content) => Self::Content(content),
            NativeClipboardInput::Image(image) => Self::Image(image),
            NativeClipboardInput::Empty => Self::Empty,
        })
    }
}
struct InputBatch {
    label: String,
    owner: NativeInputOwner,
    created: Instant,
    entries: Vec<InputEntry>,
    selected: Vec<SelectedPath>,
    images: Vec<(usize, String, Vec<u8>)>,
    bytes: usize,
}
#[derive(Default)]
pub(crate) struct NativeInputHost {
    pending: Mutex<HashMap<String, InputBatch>>,
    running: Mutex<HashMap<String, (String, Arc<AtomicBool>)>>,
    captures: Arc<AtomicUsize>,
}
struct CapturePermit(Arc<AtomicUsize>);
impl Drop for CapturePermit {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}
impl NativeInputHost {
    fn begin_capture(&self) -> Result<CapturePermit, String> {
        self.captures
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                (count < MAX_CAPTURES).then_some(count + 1)
            })
            .map_err(|_| "同时读取的原生输入过多，请稍后重试")?;
        Ok(CapturePermit(Arc::clone(&self.captures)))
    }
    fn revoke_window(&self, label: &str) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.retain(|_, value| value.label != label);
        }
        if let Ok(running) = self.running.lock() {
            for (owner, cancelled) in running.values() {
                if owner == label {
                    cancelled.store(true, Ordering::Release);
                }
            }
        }
    }
    fn insert(&self, batch: InputBatch) -> Result<String, String> {
        let mut pending = self.pending.lock().map_err(|_| "原生输入状态不可用")?;
        pending.retain(|_, value| value.created.elapsed() < LIFETIME);
        if pending.len() >= MAX_PENDING
            || pending.values().map(|value| value.bytes).sum::<usize>() + batch.bytes
                > MAX_TOTAL_BYTES
        {
            return Err("待处理原生输入过多，请稍后重试".into());
        }
        let ticket = uuid::Uuid::new_v4().to_string();
        pending.insert(ticket.clone(), batch);
        Ok(ticket)
    }
    fn take(&self, label: &str, ticket: &str) -> Result<InputBatch, String> {
        uuid::Uuid::parse_str(ticket).map_err(|_| "原生输入凭证无效")?;
        let mut pending = self.pending.lock().map_err(|_| "原生输入状态不可用")?;
        let batch = pending.get(ticket).ok_or("原生输入凭证已使用或失效")?;
        if batch.label != label {
            return Err("原生输入不属于当前窗口".into());
        }
        let batch = pending.remove(ticket).expect("checked receipt");
        if batch.created.elapsed() >= LIFETIME {
            return Err("原生输入凭证已过期，请重试".into());
        }
        Ok(batch)
    }
    fn take_import(
        &self,
        label: &str,
        ticket: &str,
    ) -> Result<(InputBatch, Arc<AtomicBool>), String> {
        uuid::Uuid::parse_str(ticket).map_err(|_| "原生输入凭证无效")?;
        let mut pending = self.pending.lock().map_err(|_| "原生输入状态不可用")?;
        let batch = pending.get(ticket).ok_or("原生输入凭证已使用或失效")?;
        if batch.label != label {
            return Err("原生输入不属于当前窗口".into());
        }
        let batch = pending.remove(ticket).expect("checked receipt");
        if batch.created.elapsed() >= LIFETIME {
            return Err("原生输入凭证已过期，请重试".into());
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        let mut running = self.running.lock().map_err(|_| "原生输入状态不可用")?;
        if running.len() >= MAX_PENDING {
            return Err("同时处理的原生输入过多".into());
        }
        running.insert(ticket.into(), (label.into(), Arc::clone(&cancelled)));
        Ok((batch, cancelled))
    }
}
#[cfg(test)]
fn selected_batch(
    label: String,
    owner: NativeInputOwner,
    paths: Vec<PathBuf>,
) -> Result<InputBatch, String> {
    if paths.is_empty() || paths.len() > MAX_FILES {
        return Err("一次需要 1 至 32 个本地文件".into());
    }
    let selected = paths
        .into_iter()
        .map(SelectedPath::capture)
        .collect::<Result<Vec<_>, _>>()?;
    selected_batch_from_proofs(label, owner, selected)
}
fn selected_batch_from_proofs(
    label: String,
    owner: NativeInputOwner,
    selected: Vec<SelectedPath>,
) -> Result<InputBatch, String> {
    let entries = selected
        .iter()
        .map(|value| InputEntry {
            name: value
                .path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("file")
                .into(),
            kind: value.kind,
        })
        .collect::<Vec<_>>();
    let mut images = Vec::new();
    let mut bytes = 0usize;
    for (index, (value, entry)) in selected.iter().zip(&entries).enumerate() {
        if value.kind != InputKind::Image {
            continue;
        }
        let data = value.read_image()?;
        let (name, data) = normalize_file_image(&entry.name, data)?;
        bytes = bytes
            .checked_add(data.len())
            .ok_or("原生输入图片总计过大")?;
        if bytes > MAX_TOTAL_BYTES {
            return Err("原生输入图片总计超过 64 MiB 限制".into());
        }
        images.push((index, name, data));
    }
    Ok(InputBatch {
        label,
        owner,
        created: Instant::now(),
        entries,
        selected,
        images,
        bytes,
    })
}
fn normalize_file_image(name: &str, bytes: Vec<u8>) -> Result<(String, Vec<u8>), String> {
    let extension = Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let format = match extension.as_str() {
        "tif" | "tiff" => Some(image_assets::ClipboardFormat::Tiff),
        "bmp" => return Err("尚未支持 BMP 文件拖入，请转换为 PNG".into()),
        _ => None,
    };
    if let Some(format) = format {
        let converted =
            image_assets::clipboard_png(&bytes, format).map_err(|error| error.to_string())?;
        return Ok((
            format!(
                "{}.png",
                Path::new(name)
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or("image")
            ),
            converted,
        ));
    }
    Ok((name.into(), bytes))
}
/// Prepared in the synchronous OS callback. Neither the active document nor
/// the selected entity is looked up later from a renderer-supplied path.
pub(crate) struct PreparedNativeDrop {
    window: WebviewWindow,
    owner: NativeInputOwner,
    selected: Vec<SelectedPath>,
    position: InputPosition,
    modifiers: InputModifiers,
    permit: CapturePermit,
}
pub(crate) fn prepare_drop(
    window: WebviewWindow,
    paths: Vec<PathBuf>,
    position: InputPosition,
    modifiers: InputModifiers,
) -> Result<PreparedNativeDrop, String> {
    super::authorize(&window)?;
    if !position.x.is_finite() || !position.y.is_finite() {
        return Err("拖放位置无效".into());
    }
    if paths.is_empty() || paths.len() > MAX_FILES {
        return Err("一次需要 1 至 32 个本地文件".into());
    }
    let permit = window.state::<NativeInputHost>().begin_capture()?;
    let owner = images::capture_native_input_owner(&window)?;
    let selected = paths
        .into_iter()
        .map(SelectedPath::capture)
        .collect::<Result<Vec<_>, _>>()?;
    Ok(PreparedNativeDrop {
        window,
        owner,
        selected,
        position,
        modifiers,
        permit,
    })
}
pub(crate) async fn complete_drop(
    prepared: PreparedNativeDrop,
) -> Result<NativeInputReceipt, String> {
    let PreparedNativeDrop {
        window,
        owner,
        selected,
        position,
        modifiers,
        permit: _permit,
    } = prepared;
    images::require_native_input_owner(&window, &owner)?;
    super::authorize(&window)?;
    let label = window.label().to_owned();
    let retained = owner.clone();
    let batch = tauri::async_runtime::spawn_blocking(move || {
        selected_batch_from_proofs(label, retained, selected)
    })
    .await
    .map_err(|_| "原生拖放读取未完成")??;
    images::require_native_input_owner(&window, &owner)?;
    super::authorize(&window)?;
    let entries = batch.entries.clone();
    let ticket = window.state::<NativeInputHost>().insert(batch)?;
    Ok(NativeInputReceipt {
        ticket,
        entries,
        position,
        modifiers,
    })
}
pub(crate) async fn attachment_drop(
    window: WebviewWindow,
    ticket: String,
) -> Result<Vec<(String, Vec<u8>)>, String> {
    super::authorize(&window)?;
    let batch = window
        .state::<NativeInputHost>()
        .take(window.label(), &ticket)?;
    images::require_native_input_owner(&window, &batch.owner)?;
    tauri::async_runtime::spawn_blocking(move || {
        if batch.selected.len() > 8 {
            return Err("最多添加 8 个附件".into());
        }
        let mut total = 0;
        batch
            .selected
            .into_iter()
            .map(|file| {
                let item = file.attachment_bytes()?;
                total += item.1.len();
                if total > 4 * 1024 * 1024 {
                    return Err("单次附件总量不能超过 4 MiB".into());
                }
                Ok(item)
            })
            .collect()
    })
    .await
    .map_err(|_| "读取拖入附件失败".to_string())?
}

#[tauri::command]
pub(crate) async fn native_input_clipboard(window: WebviewWindow) -> Result<NativePaste, String> {
    super::authorize(&window)?;
    let _permit = window.state::<NativeInputHost>().begin_capture()?;
    let owner = images::capture_native_input_owner(&window)?;
    let label = window.label().to_owned();
    let input = super::read_native_input(window.clone()).await?;
    let input = match input {
        NativeClipboardSnapshot::Content(content) => {
            images::require_native_input_owner(&window, &owner)?;
            super::authorize(&window)?;
            return Ok(NativePaste::Content { content });
        }
        NativeClipboardSnapshot::Empty => {
            images::require_native_input_owner(&window, &owner)?;
            super::authorize(&window)?;
            return Ok(NativePaste::Empty);
        }
        input => input,
    };
    let retained = owner.clone();
    let batch = tauri::async_runtime::spawn_blocking(move || match input {
        NativeClipboardSnapshot::Files(selected) => {
            selected_batch_from_proofs(label, retained, selected).map(Some)
        }
        NativeClipboardSnapshot::Image(image) => {
            let image = image.convert()?;
            use base64::{engine::general_purpose::STANDARD, Engine};
            let bytes = STANDARD
                .decode(image.base64)
                .map_err(|_| "原生图片编码无效")?;
            let length = bytes.len();
            Ok(Some(InputBatch {
                label,
                owner: retained,
                created: Instant::now(),
                entries: vec![InputEntry {
                    name: image.name.clone(),
                    kind: InputKind::Image,
                }],
                selected: Vec::new(),
                images: vec![(0, image.name, bytes)],
                bytes: length,
            }))
        }
        NativeClipboardSnapshot::Content(_) | NativeClipboardSnapshot::Empty => Ok(None),
    });
    let batch = batch.await.map_err(|_| "原生剪贴板处理未完成")??;
    images::require_native_input_owner(&window, &owner)?;
    super::authorize(&window)?;
    let Some(batch) = batch else {
        return Ok(NativePaste::Empty);
    };
    let all_images = batch
        .entries
        .iter()
        .all(|entry| entry.kind == InputKind::Image);
    let entries = batch.entries.clone();
    let ticket = window.state::<NativeInputHost>().insert(batch)?;
    Ok(if all_images {
        NativePaste::Images { ticket, entries }
    } else {
        NativePaste::Files { ticket, entries }
    })
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NativeImageRequest {
    ticket: String,
    id: String,
    expected_metadata_revision: Option<u64>,
    reference_root: String,
    storage_folder: String,
    relative_path: Option<bool>,
    relative_path_with_dot: Option<bool>,
    mode: Option<ImportMode>,
}
#[derive(Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum ImportMode {
    #[default]
    Images,
    References,
    Paste,
}
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum NativeImportedInput {
    Image {
        name: String,
        source: String,
        url: String,
    },
    Link {
        name: String,
        source: String,
    },
}
#[tauri::command]
pub(crate) async fn import_native_input_images(
    request: NativeImageRequest,
    window: WebviewWindow,
) -> Result<Vec<NativeImportedInput>, String> {
    super::authorize(&window)?;
    let (batch, cancelled) = window
        .state::<NativeInputHost>()
        .take_import(window.label(), &request.ticket)?;
    let completion_window = window.clone();
    let completion_ticket = request.ticket.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        if batch.owner.id != request.id
            || batch.owner.metadata_revision != request.expected_metadata_revision
        {
            return Err("原生图片导入文稿不匹配".into());
        }
        images::require_native_input_owner(&window, &batch.owner)?;
        let mode = request.mode.unwrap_or_default();
        if mode == ImportMode::Images
            && batch
                .entries
                .iter()
                .any(|entry| entry.kind != InputKind::Image)
        {
            return Err("这组原生文件包含文稿或目录，不能仅作为图片导入".into());
        }
        if cancelled.load(Ordering::Acquire) {
            return Err("原生输入已取消".into());
        }
        let document_path = images::native_input_document_path(&window, &batch.owner)?;
        let mut links = HashMap::new();
        for (index, selected) in batch.selected.iter().enumerate() {
            selected.verify()?;
            if mode == ImportMode::References || selected.kind != InputKind::Image {
                let source = file_reference(
                    &selected.path,
                    document_path.as_deref(),
                    request.relative_path,
                    request.relative_path_with_dot,
                )?;
                links.insert(index, source);
            }
        }
        if mode == ImportMode::References && batch.selected.len() != batch.entries.len() {
            return Err("系统位图没有可保留的原文件引用，请导入图片".into());
        }
        let mut imported = HashMap::new();
        if mode != ImportMode::References {
            let indices = batch
                .images
                .iter()
                .map(|(index, _, _)| *index)
                .collect::<Vec<_>>();
            let source_images = batch
                .images
                .into_iter()
                .map(|(_, name, bytes)| (name, bytes))
                .collect();
            let outputs = images::import_native_images(
                &window,
                &batch.owner,
                source_images,
                &request.reference_root,
                &request.storage_folder,
                request.relative_path,
                request.relative_path_with_dot,
                &cancelled,
            )?;
            for (index, image) in indices.into_iter().zip(outputs) {
                imported.insert(
                    index,
                    NativeImportedInput::Image {
                        name: image.name,
                        source: image.source,
                        url: image.url,
                    },
                );
            }
        }
        for selected in &batch.selected {
            selected.verify()?;
        }
        images::require_native_input_owner(&window, &batch.owner)?;
        super::authorize(&window)?;
        if cancelled.load(Ordering::Acquire) {
            return Err("原生输入已取消".into());
        }
        batch
            .entries
            .into_iter()
            .enumerate()
            .map(|(index, entry)| {
                imported
                    .remove(&index)
                    .or_else(|| {
                        links
                            .remove(&index)
                            .map(|source| NativeImportedInput::Link {
                                name: entry.name,
                                source,
                            })
                    })
                    .ok_or_else(|| "原生输入项目不完整，未提交正文".to_owned())
            })
            .collect()
    })
    .await
    .map_err(|_| "原生图片导入未完成".to_owned());
    completion_window
        .state::<NativeInputHost>()
        .running
        .lock()
        .map_err(|_| "原生输入状态不可用")?
        .remove(&completion_ticket);
    result?
}
#[tauri::command]
pub(crate) fn cancel_native_input(ticket: String, window: WebviewWindow) -> Result<(), String> {
    super::authorize(&window)?;
    let host = window.state::<NativeInputHost>();
    let mut pending = host.pending.lock().map_err(|_| "原生输入状态不可用")?;
    if pending
        .get(&ticket)
        .is_some_and(|value| value.label != window.label())
    {
        return Err("原生输入不属于当前窗口".into());
    }
    pending.remove(&ticket);
    drop(pending);
    let running = host.running.lock().map_err(|_| "原生输入状态不可用")?;
    if let Some((label, cancelled)) = running.get(&ticket) {
        if label != window.label() {
            return Err("原生输入不属于当前窗口".into());
        }
        cancelled.store(true, Ordering::Release);
    }
    Ok(())
}
/// Internal-only selected path. A receipt authorizes one handoff; a mixed batch
/// is rejected rather than silently dropping the other selected files.
pub(crate) struct NativeSelectedPath {
    pub path: PathBuf,
    pub kind: InputKind,
    proof: SelectedPath,
    owner: NativeInputOwner,
}
impl NativeSelectedPath {
    pub fn verify(&self) -> Result<(), String> {
        self.proof.verify()
    }
    pub(crate) fn verify_owner(&self, window: &WebviewWindow) -> Result<(), String> {
        super::authorize(window)?;
        images::require_native_input_owner(window, &self.owner)
    }
    pub(crate) fn source_document_id(&self) -> &str {
        &self.owner.id
    }
    pub(crate) fn identity(&self) -> &same_file::Handle {
        &self.proof.identity
    }
    pub(crate) fn parent_identity(&self) -> &same_file::Handle {
        &self.proof.parent_identity
    }
}
pub(crate) fn take_selected_path(
    window: &WebviewWindow,
    ticket: &str,
    index: usize,
) -> Result<NativeSelectedPath, String> {
    super::authorize(window)?;
    let mut batch = window
        .state::<NativeInputHost>()
        .take(window.label(), ticket)?;
    images::require_native_input_owner(window, &batch.owner)?;
    if batch.selected.len() != 1 || index != 0 {
        return Err("一次仅打开一个文稿或目录；混合选择请分别拖入".into());
    }
    let proof = batch.selected.remove(0);
    proof.verify()?;
    Ok(NativeSelectedPath {
        path: proof.path.clone(),
        kind: proof.kind,
        proof,
        owner: batch.owner,
    })
}

fn file_reference(
    path: &Path,
    document: Option<&Path>,
    relative: Option<bool>,
    dot: Option<bool>,
) -> Result<String, String> {
    let url = tauri::Url::from_file_path(path).map_err(|_| "所选文件无法转换为引用")?;
    let Some(parent) = document
        .and_then(Path::parent)
        .filter(|_| relative != Some(false))
    else {
        return Ok(url.to_string());
    };
    let base = tauri::Url::from_directory_path(parent).map_err(|_| "文稿目录无法转换为引用")?;
    let from = base
        .path()
        .trim_end_matches('/')
        .split('/')
        .collect::<Vec<_>>();
    let to = url.path().split('/').collect::<Vec<_>>();
    let shared = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    if shared == 0 {
        return Ok(url.to_string());
    }
    let mut parts = vec![".."; from.len() - shared];
    parts.extend_from_slice(&to[shared..]);
    let mut source = parts.join("/");
    if source.is_empty() {
        source = ".".into();
    }
    if dot == Some(true) && !source.starts_with('.') {
        source = format!("./{source}");
    }
    Ok(source)
}

/// Called for editor blur/destruction; in-flight captures carry the earlier
/// context epoch and cannot publish a fresh receipt after a focus roundtrip.
pub(crate) fn invalidate_window(app: &tauri::AppHandle, label: &str) {
    app.state::<NativeInputHost>().revoke_window(label);
    app.state::<images::ImageHost>()
        .invalidate_native_input(label);
}
pub(crate) fn forget_window(app: &tauri::AppHandle, label: &str) {
    app.state::<NativeInputHost>().revoke_window(label);
    app.state::<images::ImageHost>().forget_native_input(label);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn attachment_files_use_retained_entities_and_reject_replacement_and_directories() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let path = root.join("notes.txt");
        fs::write(&path, b"attachment text").unwrap();
        let selected = SelectedPath::capture(path.clone()).unwrap();
        let (name, bytes) = selected.attachment_bytes().unwrap();
        assert_eq!(name, "notes.txt");
        assert_eq!(bytes, b"attachment text");
        fs::rename(&path, root.join("original.txt")).unwrap();
        fs::write(&path, b"replacement").unwrap();
        assert!(selected.attachment_bytes().is_err());
        assert!(SelectedPath::capture(root)
            .unwrap()
            .attachment_bytes()
            .is_err());
    }
    fn owner() -> NativeInputOwner {
        NativeInputOwner {
            registry: Arc::new(Mutex::new(document_service::DocumentService::new())),
            id: "draft".into(),
            metadata_revision: None,
            generation: 1,
        }
    }
    fn batch(label: &str) -> InputBatch {
        InputBatch {
            label: label.into(),
            owner: owner(),
            created: Instant::now(),
            entries: vec![],
            selected: vec![],
            images: vec![],
            bytes: 0,
        }
    }
    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = fs::canonicalize(dir.path()).unwrap();
        (dir, root)
    }
    #[test]
    fn window_revocation_releases_only_its_pending_registry_and_cancels_its_running_io() {
        let host = NativeInputHost::default();
        let pending = batch("a");
        let registry = Arc::downgrade(&pending.owner.registry);
        let a = host.insert(pending).unwrap();
        let b = host.insert(batch("b")).unwrap();
        let running_a = host.insert(batch("a")).unwrap();
        let (_, a_flag) = host.take_import("a", &running_a).unwrap();
        let running_b = host.insert(batch("b")).unwrap();
        let (_, b_flag) = host.take_import("b", &running_b).unwrap();
        host.revoke_window("a");
        assert!(registry.upgrade().is_none());
        assert!(host.take("a", &a).is_err());
        assert!(host.take("b", &b).is_ok());
        assert!(a_flag.load(Ordering::Acquire));
        assert!(!b_flag.load(Ordering::Acquire));
    }
    #[test]
    fn capture_concurrency_is_bounded_and_early_drop_releases_the_slot() {
        let host = NativeInputHost::default();
        let mut permits = (0..MAX_CAPTURES)
            .map(|_| host.begin_capture().unwrap())
            .collect::<Vec<_>>();
        assert!(host.begin_capture().is_err());
        permits.pop();
        assert!(host.begin_capture().is_ok());
        drop(permits);
        assert_eq!(host.captures.load(Ordering::Acquire), 0);
    }
    #[test]
    fn receipts_are_single_use_and_cannot_be_claimed_by_another_window() {
        let host = NativeInputHost::default();
        let id = host.insert(batch("a")).unwrap();
        assert!(host.take("b", &id).is_err());
        assert!(host.take("a", &id).is_ok());
        assert!(host.take("a", &id).is_err());
        assert!(host.take("a", "/tmp/not-a-ticket").is_err());
    }
    #[test]
    fn receipt_expiry_and_pending_bounds_do_not_authorize_replay() {
        let host = NativeInputHost::default();
        let mut expired = batch("a");
        expired.created = Instant::now() - LIFETIME;
        let id = host.insert(expired).unwrap();
        assert!(host.take("a", &id).is_err());
        for _ in 0..MAX_PENDING {
            host.insert(batch("a")).unwrap();
        }
        assert!(host.insert(batch("a")).is_err());
    }
    #[test]
    fn take_to_running_handoff_leaves_a_cancellable_single_operation() {
        let host = NativeInputHost::default();
        let id = host.insert(batch("a")).unwrap();
        let (_, flag) = host.take_import("a", &id).unwrap();
        assert!(host.take_import("a", &id).is_err());
        let running = host.running.lock().unwrap();
        let (label, retained) = running.get(&id).unwrap();
        assert_eq!(label, "a");
        retained.store(true, Ordering::Release);
        assert!(flag.load(Ordering::Acquire));
    }
    #[test]
    fn selected_files_are_not_interpreted_from_names_and_replacement_invalidates_proof() {
        let (_dir, root) = fixture();
        let path = root.join("A.md");
        fs::write(&path, b"one").unwrap();
        let selected = SelectedPath::capture(path.clone()).unwrap();
        assert_eq!(selected.kind, InputKind::File);
        fs::rename(&path, root.join("old.md")).unwrap();
        fs::write(&path, b"one").unwrap();
        assert!(selected.verify().is_err());
        assert!(SelectedPath::capture(root.join("missing.png")).is_err());
        assert!(SelectedPath::capture(PathBuf::from("relative.png")).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn direct_and_ancestor_symlinks_are_rejected_without_reading_targets() {
        let (_dir, root) = fixture();
        fs::create_dir(root.join("real")).unwrap();
        fs::write(root.join("real/A.md"), b"one").unwrap();
        std::os::unix::fs::symlink(root.join("real/A.md"), root.join("link.md")).unwrap();
        std::os::unix::fs::symlink(root.join("real"), root.join("linked-dir")).unwrap();
        assert!(SelectedPath::capture(root.join("link.md")).is_err());
        assert!(SelectedPath::capture(root.join("linked-dir/A.md")).is_err());
    }
    #[test]
    fn replaced_parent_with_a_hard_link_to_the_same_leaf_is_rejected() {
        let (_dir, root) = fixture();
        let parent = root.join("selected");
        fs::create_dir(&parent).unwrap();
        let path = parent.join("own.md");
        fs::write(&path, b"own source\r\n").unwrap();
        let selected = SelectedPath::capture(path.clone()).unwrap();
        if !crate::test_support::rename_retained_directory(&parent, &root.join("retained-parent")) {
            selected.verify().unwrap();
            assert!(path.is_file());
            return;
        }
        fs::create_dir(&parent).unwrap();
        fs::hard_link(root.join("retained-parent/own.md"), &path).unwrap();
        fs::write(parent.join("unrelated.md"), b"not granted").unwrap();
        // This is the attack: checking the selected leaf alone still succeeds.
        assert_eq!(
            same_file::Handle::from_path(&path).unwrap(),
            selected.identity
        );
        assert!(selected.verify().is_err());
        assert_ne!(
            same_file::Handle::from_path(&parent).unwrap(),
            selected.parent_identity
        );
        // A new, explicit OS selection may establish the new parent; an old
        // receipt cannot silently acquire it through an unchanged leaf inode.
        assert!(SelectedPath::capture(path).unwrap().verify().is_ok());
    }
    #[test]
    fn parent_swap_and_revert_keeps_the_original_parent_proof_and_original_image_bytes() {
        let (_dir, root) = fixture();
        let parent = root.join("selected");
        fs::create_dir(&parent).unwrap();
        let path = parent.join("own.png");
        let png =
            include_bytes!("../../../../../crates/image-assets/test-fixtures/clipboard-rgb.png");
        fs::write(&path, png).unwrap();
        let selected = SelectedPath::capture(path.clone()).unwrap();
        selected.verify().unwrap();
        if !crate::test_support::rename_retained_directory(&parent, &root.join("retained-parent")) {
            selected.verify().unwrap();
            assert!(path.is_file());
            return;
        }
        fs::create_dir(&parent).unwrap();
        fs::hard_link(root.join("retained-parent/own.png"), &path).unwrap();
        let transient =
            cap_std::fs::Dir::open_ambient_dir(&parent, cap_std::ambient_authority()).unwrap();
        let transient_identity =
            same_file::Handle::from_file(transient.try_clone().unwrap().into_std_file()).unwrap();
        let transient_leaf =
            same_file::Handle::from_file(transient.open("own.png").unwrap().into_std()).unwrap();
        assert_eq!(transient_leaf, selected.identity);
        assert!(selected.read_image().is_err());
        fs::remove_file(&path).unwrap();
        fs::remove_dir(&parent).unwrap();
        fs::rename(root.join("retained-parent"), &parent).unwrap();
        selected.verify().unwrap();
        // Both pathname checks now pass, yet a Core scope retained from the
        // transient directory must fail its expected-parent comparison.
        assert_ne!(transient_identity, selected.parent_identity);
        assert_eq!(selected.read_image().unwrap(), png);
    }
    #[cfg(unix)]
    #[test]
    fn parent_replaced_by_a_symlink_cannot_reuse_the_same_leaf_proof() {
        let (_dir, root) = fixture();
        let parent = root.join("selected");
        fs::create_dir(&parent).unwrap();
        let path = parent.join("own.md");
        fs::write(&path, b"own").unwrap();
        let selected = SelectedPath::capture(path.clone()).unwrap();
        fs::rename(&parent, root.join("retained-parent")).unwrap();
        std::os::unix::fs::symlink(root.join("retained-parent"), &parent).unwrap();
        assert_eq!(
            same_file::Handle::from_path(&path).unwrap(),
            selected.identity
        );
        assert!(selected.verify().is_err());
        assert!(SelectedPath::capture(path).is_err());
    }
    #[test]
    fn bitmap_snapshot_and_file_urls_stay_separate_from_display_names() {
        let (_dir, root) = fixture();
        fs::create_dir(root.join("folder")).unwrap();
        fs::write(root.join("plain.md"), b"untouched\r\n").unwrap();
        fs::write(
            root.join("image 中文.png"),
            include_bytes!("../../../../../crates/image-assets/test-fixtures/clipboard-rgb.png"),
        )
        .unwrap();
        let batch = selected_batch(
            "a".into(),
            owner(),
            vec![
                root.join("plain.md"),
                root.join("image 中文.png"),
                root.join("folder"),
            ],
        )
        .unwrap();
        assert_eq!(
            batch
                .entries
                .iter()
                .map(|entry| entry.kind)
                .collect::<Vec<_>>(),
            vec![InputKind::File, InputKind::Image, InputKind::Directory]
        );
        assert_eq!(batch.images.len(), 1);
        assert_eq!(batch.images[0].0, 1);
        assert_eq!(fs::read(root.join("plain.md")).unwrap(), b"untouched\r\n");
        let json = serde_json::to_string(&NativeInputReceipt {
            ticket: "opaque".into(),
            entries: batch.entries,
            position: InputPosition::default(),
            modifiers: InputModifiers::default(),
        })
        .unwrap();
        assert!(!json.contains(root.to_str().unwrap()));
        assert!(!json.contains("base64"));
    }
    #[test]
    fn oversized_files_and_batch_count_are_bounded_before_import() {
        let (_dir, root) = fixture();
        let path = root.join("huge.png");
        fs::File::create(&path)
            .unwrap()
            .set_len(image_assets::MAX_IMAGE_BYTES as u64 + 1)
            .unwrap();
        assert!(selected_batch("a".into(), owner(), vec![path.clone()]).is_err());
        assert!(selected_batch("a".into(), owner(), vec![path; MAX_FILES + 1]).is_err());
        assert!(selected_batch("a".into(), owner(), vec![]).is_err());
    }
    #[test]
    fn native_links_use_url_encoded_lexical_relative_paths_without_reading_siblings() {
        let path = |value: &str| {
            PathBuf::from(if cfg!(windows) {
                format!("C:{value}")
            } else {
                value.to_owned()
            })
        };
        let drive = if cfg!(windows) { "C:/" } else { "" };
        assert_eq!(
            file_reference(
                &path("/own/shared/a 中文.md"),
                Some(&path("/own/docs/A.md")),
                None,
                None
            )
            .unwrap(),
            "../shared/a%20%E4%B8%AD%E6%96%87.md"
        );
        assert_eq!(
            file_reference(
                &path("/own/docs/a.md"),
                Some(&path("/own/docs/A.md")),
                Some(true),
                Some(true)
            )
            .unwrap(),
            "./a.md"
        );
        assert_eq!(
            file_reference(
                &path("/own/docs/a.md"),
                Some(&path("/own/docs/A.md")),
                Some(false),
                None
            )
            .unwrap(),
            format!("file:///{drive}own/docs/a.md")
        );
        assert_eq!(
            file_reference(&path("/own/a.md"), None, None, None).unwrap(),
            format!("file:///{drive}own/a.md")
        );
    }
    #[test]
    fn request_payload_rejects_paths_unknown_mode_and_extra_authority_fields() {
        let valid = r#"{"ticket":"x","id":"draft","referenceRoot":"","storageFolder":"assets","mode":"paste"}"#;
        assert!(serde_json::from_str::<NativeImageRequest>(valid).is_ok());
        assert!(serde_json::from_str::<NativeImageRequest>(
            &valid.replace("\"paste\"", "\"open-any-path\"")
        )
        .is_err());
        assert!(serde_json::from_str::<NativeImageRequest>(
            &valid.replace("\"mode\":", "\"path\":\"/tmp/secret\",\"mode\":")
        )
        .is_err());
    }
}
