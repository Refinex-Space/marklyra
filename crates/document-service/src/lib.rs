//! Source-preserving document storage. Only trusted host code authorizes paths;
//! subsequent IPC saves use opaque document IDs and never accept file paths.

mod authorities;
mod authority;
mod codec;
mod external;
mod file_location;
mod image_document_identity;
mod image_drafts;
mod image_save_as;
mod move_publication;
mod rename;
mod scoped;
mod storage;
mod trash;
mod trash_file_location;
mod watch;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};

pub use authorities::DocumentAuthorities;
pub use authority::{
    DirectoryBookmark, DocumentBookmark, PreparedBookmarkRetarget, PreparedDirectoryBookmarkMove,
    PreparedDocumentBookmarkMove, PreparedDocumentBookmarkRetarget,
};
pub use codec::{validate_text, Encoding};
pub use external::{DocumentChange, UnreadableReason};
pub use file_location::FileLocationLease;
pub use image_assets::{ImageRegistration, ImageResource, IMAGE_CSP};
use image_assets::{ImageRegistry, ImageScope};
pub use image_document_identity::ImageDocumentIdentity;
pub use image_drafts::{ImageCopyMapping, ImageDraftSnapshot};
pub use image_save_as::PreparedImageSaveAs;
pub use move_publication::{NativeMovePublication, NativeMovePublicationEntry};
pub use rename::{NativeMoveTarget, PreparedMove, PreparedMoves, PreparedRename, RenameKind};
use serde::Serialize;
use thiserror::Error;
pub use trash::{PreparedTrash, PreparedTrashRestore, TrashRestoreTarget};
pub use trash_file_location::{PreparedTrashFileLease, TrashFileLocationLease, TrashFileSource};
use uuid::Uuid;
pub use watch::{DocumentDiskChange, DocumentWatch, WatchFailure};

pub const MAX_FILE_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_TEXT_BYTES: usize = 32 * 1024 * 1024;
const MAX_OPEN_DOCUMENTS: usize = 128;

#[derive(Debug, Error)]
pub enum DocumentError {
    #[error("文件超过当前支持的 32 MiB 大小限制")]
    TooLarge,
    #[error("不支持此编码或文件包含无效文本；当前支持 UTF-8 和带 BOM 的 UTF-16")]
    UnsupportedEncoding,
    #[error("另存为不能覆盖已打开文档的原编码；请使用该文档的编码")]
    EncodingConflict,
    #[error("文档不存在或已关闭，请重新打开")]
    UnknownDocument,
    #[error("文件已被外部程序修改、移动或删除；请另存为以保留当前内容")]
    ExternalChange,
    #[error("选择的路径不是可用的普通文件")]
    InvalidPath,
    #[error("文件为只读，请另存为")]
    ReadOnly,
    #[error("打开的文档过多，请重启应用后重试")]
    TooManyDocuments,
    #[error("文件在读取期间持续变化，请稍后重新检查")]
    UnstableRead,
    #[error("磁盘版本或重载快照已失效；当前保存基线未改变，请重新检查")]
    StaleReload,
    #[error("当前操作不支持跨父目录或无法证明原授权关系的重命名")]
    UnsupportedRename,
    #[error("文档元数据版本已达上限，请重新打开文档")]
    MetadataRevisionLimit,
    #[error("文件移动结果尚未确认；当前稿件已保留，请刷新核对或显式另存为")]
    RelocationUncertain,
    #[cfg_attr(
        windows,
        error("文件已移入回收站；当前正文已保留，请撤销删除或显式另存为")
    )]
    #[cfg_attr(
        not(windows),
        error("文件已移入废纸篓；当前正文已保留，请撤销删除或显式另存为")
    )]
    Trashed,
    #[error("图片暂存会话不存在或其原生恢复记录已失效")]
    InvalidImageDraft,
    #[error("{0}")]
    Image(#[from] image_assets::ImageError),
    #[error("文件操作失败：{0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DocumentPayload {
    pub id: String,
    pub path: String,
    pub text: String,
    pub encoding: String,
    #[serde(rename = "metadataRevision")]
    pub metadata_revision: u64,
    #[serde(rename = "locationState")]
    pub location_state: DocumentLocationState,
}
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DocumentLocationState {
    Available,
    Trashed,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadata {
    pub id: String,
    pub path: String,
    pub encoding: String,
    pub metadata_revision: u64,
    pub location_state: DocumentLocationState,
}

struct Document {
    path: PathBuf,
    original_bytes: Vec<u8>,
    identity: Arc<same_file::Handle>,
    authority: Arc<authorities::FileAuthority>,
    text: String,
    encoding: Encoding,
    scoped: scoped::ScopedDocument,
    image_scope: ImageScope,
    baseline_epoch: Uuid,
    metadata_revision: u64,
    relocation_uncertain: bool,
    trashed_by: Option<Uuid>,
    trashed_location: Option<Arc<trash::TrashedLocation>>,
}

impl Document {
    fn ensure_location(&self) -> Result<(), DocumentError> {
        if self.relocation_uncertain {
            Err(DocumentError::RelocationUncertain)
        } else if self.trashed_by.is_some() {
            Err(DocumentError::Trashed)
        } else {
            self.authority.current(&self.scoped).map(|_| ())
        }
    }
    fn location_state(&self) -> DocumentLocationState {
        if self.trashed_by.is_some() {
            DocumentLocationState::Trashed
        } else {
            DocumentLocationState::Available
        }
    }
    fn payload(&self, id: &str) -> DocumentPayload {
        DocumentPayload {
            id: id.to_owned(),
            path: self.path.to_string_lossy().into_owned(),
            text: self.text.clone(),
            encoding: self.encoding.label().to_owned(),
            metadata_revision: self.metadata_revision,
            location_state: self.location_state(),
        }
    }
    fn metadata(&self, id: &str) -> DocumentMetadata {
        DocumentMetadata {
            id: id.to_owned(),
            path: self.path.to_string_lossy().into_owned(),
            encoding: self.encoding.label().to_owned(),
            metadata_revision: self.metadata_revision,
            location_state: self.location_state(),
        }
    }
}

#[derive(Default)]
pub struct DocumentService {
    authorities: Arc<DocumentAuthorities>,
    documents: HashMap<String, Document>,
    images: ImageRegistry,
    image_drafts: HashMap<String, image_drafts::ImageDraft>,
    pending_image_saves: HashMap<String, std::sync::Weak<()>>,
    image_service_binding: Arc<()>,
    image_aliases: HashMap<String, HashMap<String, String>>,
    pending_reloads: HashMap<String, external::PendingReload>,
    watchers: HashMap<String, watch::WatchRegistration>,
    retired_watchers: Vec<watch::WatchRegistration>,
}

impl DocumentService {
    /// Capture only an existing session's actual directory capability.
    pub fn bookmark(&self, id: &str) -> Result<DocumentBookmark, DocumentError> {
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        let bookmark = DocumentBookmark {
            parent: DirectoryBookmark::capture(
                &document.scoped.directory,
                document.path.parent().ok_or(DocumentError::InvalidPath)?,
            )?,
            name: document.scoped.name.clone(),
        };
        bookmark.validate()?;
        Ok(bookmark)
    }
    pub fn open_bookmark(
        &mut self,
        bookmark: &DocumentBookmark,
    ) -> Result<DocumentPayload, DocumentError> {
        bookmark.validate()?;
        self.open_in_directory(bookmark.parent.reopen()?, &bookmark.name, bookmark.path())
    }
    pub fn new() -> Self {
        Self::default()
    }
    pub fn with_authorities(authorities: Arc<DocumentAuthorities>) -> Self {
        Self {
            authorities,
            ..Self::default()
        }
    }

    /// The host must call this only for a path returned by the native picker.
    /// Every open creates a separate session so a rejected async result cannot
    /// replace the active session's original bytes or authorization.
    pub fn open_authorized(&mut self, path: &Path) -> Result<DocumentPayload, DocumentError> {
        self.open_authorized_with_identity(path, None, None)
    }

    /// A native file receipt binds this open to its retained entity, including
    /// when the path is replaced and restored around the actual read.
    pub fn open_authorized_entity(
        &mut self,
        path: &Path,
        expected: &same_file::Handle,
    ) -> Result<DocumentPayload, DocumentError> {
        self.open_authorized_with_identity(path, Some(expected), None)
    }

    /// Native receipts also bind the parent from which local image capability
    /// is derived. A hard link to the same leaf under a substituted parent must
    /// not authorize that parent's other files.
    pub fn open_authorized_entity_in_parent(
        &mut self,
        path: &Path,
        expected: &same_file::Handle,
        expected_parent: &same_file::Handle,
    ) -> Result<DocumentPayload, DocumentError> {
        self.open_authorized_with_identity(path, Some(expected), Some(expected_parent))
    }

    fn open_authorized_with_identity(
        &mut self,
        path: &Path,
        expected: Option<&same_file::Handle>,
        expected_parent: Option<&same_file::Handle>,
    ) -> Result<DocumentPayload, DocumentError> {
        self.check_capacity()?;
        let path = storage::normalize_selected_path(path)?;
        let directory = Arc::new(cap_std::fs::Dir::open_ambient_dir(
            path.parent().ok_or(DocumentError::InvalidPath)?,
            cap_std::ambient_authority(),
        )?);
        if let Some(expected_parent) = expected_parent {
            let actual_parent =
                same_file::Handle::from_file(directory.try_clone()?.into_std_file())?;
            if &actual_parent != expected_parent {
                return Err(DocumentError::ExternalChange);
            }
        }
        let scoped = scoped::ScopedDocument::new(
            Arc::clone(&directory),
            Path::new(path.file_name().ok_or(DocumentError::InvalidPath)?),
        )?;
        let snapshot = match expected {
            Some(expected) => scoped.read_snapshot_for_entity(expected)?,
            None => scoped.read_snapshot()?,
        };
        let (encoding, text) = Encoding::decode(&snapshot.bytes)?;
        let image_scope = ImageScope::document_directory(directory)
            .with_logical_root(path.parent().ok_or(DocumentError::InvalidPath)?)?;
        self.register(
            path,
            snapshot.into_baseline(),
            text,
            encoding,
            image_scope,
            scoped,
        )
    }

    /// A trusted workspace host supplies an already authorized parent handle.
    /// Display paths are not used for reading or saving this scoped document.
    pub fn open_in_directory(
        &mut self,
        directory: Arc<cap_std::fs::Dir>,
        name: &Path,
        display_path: PathBuf,
    ) -> Result<DocumentPayload, DocumentError> {
        self.check_capacity()?;
        let image_scope = ImageScope::document_directory(Arc::clone(&directory))
            .with_logical_root(display_path.parent().ok_or(DocumentError::InvalidPath)?)?;
        let scoped = scoped::ScopedDocument::new(directory, name)?;
        let snapshot = scoped.read_snapshot()?;
        let (encoding, text) = Encoding::decode(&snapshot.bytes)?;
        self.register(
            display_path,
            snapshot.into_baseline(),
            text,
            encoding,
            image_scope,
            scoped,
        )
    }

    /// Workspace authorization is explicit and stays in Rust; only this root
    /// permits parent references from the document directory into sibling folders.
    pub fn open_in_workspace(
        &mut self,
        root: Arc<cap_std::fs::Dir>,
        relative: &Path,
        display_path: PathBuf,
    ) -> Result<DocumentPayload, DocumentError> {
        if relative
            .components()
            .any(|part| !matches!(part, std::path::Component::Normal(_)))
        {
            return Err(DocumentError::InvalidPath);
        }
        let base = relative.parent().unwrap_or(Path::new(""));
        let parent = Arc::new(root.open_dir(if base.as_os_str().is_empty() {
            Path::new(".")
        } else {
            base
        })?);
        let name = relative.file_name().ok_or(DocumentError::InvalidPath)?;
        let mut logical_root = display_path.clone();
        for _ in relative.components() {
            logical_root.pop();
        }
        let image_scope = ImageScope::workspace(root, Arc::clone(&parent), base)?
            .with_logical_root(&logical_root)?;
        let payload = self.open_in_directory(parent, Path::new(name), display_path)?;
        if let Some(document) = self.documents.get_mut(&payload.id) {
            document.image_scope = image_scope;
        }
        Ok(payload)
    }

    pub fn resolve_image(
        &mut self,
        id: &str,
        reference: &str,
    ) -> Result<ImageRegistration, DocumentError> {
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        if let Some(token) = self
            .image_aliases
            .get(id)
            .and_then(|aliases| aliases.get(reference))
        {
            if self.images.get(token).is_some() {
                return Ok(ImageRegistration {
                    token: token.clone(),
                    source: reference.to_owned(),
                });
            }
        }
        Ok(self.images.resolve(id, &document.image_scope, reference)?)
    }
    /// Exact Native-confirmed Undo/migration alias only. This intentionally does
    /// not attempt a document-directory read of raw hrefs before YAML root is
    /// applied by the caller's ordinary reference resolver.
    pub fn resolve_image_alias(
        &self,
        id: &str,
        source: &str,
    ) -> Result<Option<ImageRegistration>, DocumentError> {
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        Ok(self
            .image_aliases
            .get(id)
            .and_then(|aliases| aliases.get(source))
            .filter(|token| self.images.get(token).is_some())
            .map(|token| ImageRegistration {
                token: token.clone(),
                source: source.to_owned(),
            }))
    }
    pub fn import_image(
        &mut self,
        id: &str,
        name: &str,
        base64: &str,
        reference_root: &str,
    ) -> Result<ImageRegistration, DocumentError> {
        self.import_image_with_folder(id, name, base64, reference_root, "assets")
    }
    pub fn import_image_with_folder(
        &mut self,
        id: &str,
        name: &str,
        base64: &str,
        reference_root: &str,
        storage_folder: &str,
    ) -> Result<ImageRegistration, DocumentError> {
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        let stem = document
            .path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or(image_assets::ImageError::InvalidName)?;
        let folder = storage_folder.replace("${filename}", stem);
        if folder.contains("${") {
            return Err(image_assets::ImageError::InvalidReference.into());
        }
        Ok(self.images.import_base64_with_folder(
            id,
            &document.image_scope,
            name,
            base64,
            reference_root,
            &folder,
        )?)
    }
    pub fn image(&self, token: &str) -> Option<ImageResource> {
        if let Some(owner) = self.images.registration_owner(token) {
            if self
                .pending_image_saves
                .get(owner)
                .is_some_and(|lease| lease.upgrade().is_none())
            {
                return None;
            }
        }
        self.images.get(token)
    }

    pub fn save(&mut self, id: &str, text: &str) -> Result<DocumentPayload, DocumentError> {
        let document = self
            .documents
            .get_mut(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        validate_text(text)?;
        let authority = Arc::clone(&document.authority);
        let mut current_identity = authority.current(&document.scoped)?;
        document
            .scoped
            .check_identity(&document.original_bytes, &current_identity.identity)?;
        if document.text == text {
            // Do not rewrite: preserve bytes, inode, timestamps and metadata.
            self.pending_reloads.remove(id);
            document.identity = Arc::clone(&current_identity.identity);
            document.baseline_epoch = Uuid::new_v4();
            return Ok(document.payload(id));
        }
        let bytes = document.encoding.encode(text)?;
        let published = Arc::new(document.scoped.replace(
            &document.original_bytes,
            &current_identity.identity,
            &bytes,
        )?);
        current_identity.identity = Arc::clone(&published);
        document.identity = published;
        document.original_bytes = bytes;
        document.text = text.to_owned();
        document.baseline_epoch = Uuid::new_v4();
        self.pending_reloads.remove(id);
        Ok(document.payload(id))
    }

    /// New documents default to UTF-8; source_id preserves an open document encoding.
    /// The native save picker confirms an
    /// overwrite; existing bytes are checked again before replacement.
    pub fn save_as_authorized(
        &mut self,
        path: &Path,
        text: &str,
        source_id: Option<&str>,
    ) -> Result<DocumentPayload, DocumentError> {
        self.save_as_authorized_with_encoding(path, text, source_id, None)
    }

    /// A runtime untitled draft may retain a supported original encoding.
    /// A source session remains authoritative; a contradictory hint is rejected.
    /// `path` still requires a native save picker grant, exactly as above.
    pub fn save_as_authorized_with_encoding(
        &mut self,
        path: &Path,
        text: &str,
        source_id: Option<&str>,
        encoding: Option<&str>,
    ) -> Result<DocumentPayload, DocumentError> {
        let requested = encoding.map(Encoding::from_label).transpose()?;
        let path = storage::normalize_selected_path(path)?;
        let encoding = if let Some(id) = source_id {
            let source = self
                .documents
                .get(id)
                .ok_or(DocumentError::UnknownDocument)?;
            if requested.is_some_and(|encoding| encoding != source.encoding) {
                return Err(DocumentError::EncodingConflict);
            }
            if source.path == path && !source.relocation_uncertain && source.trashed_by.is_none() {
                return self.save(id, text);
            }
            source.encoding
        } else {
            requested.unwrap_or(Encoding::Utf8)
        };
        let bytes = encoding.encode(text)?;
        self.check_capacity()?;
        let directory = Arc::new(cap_std::fs::Dir::open_ambient_dir(
            path.parent().ok_or(DocumentError::InvalidPath)?,
            cap_std::ambient_authority(),
        )?);

        let scoped = scoped::ScopedDocument::new(
            Arc::clone(&directory),
            Path::new(path.file_name().ok_or(DocumentError::InvalidPath)?),
        )?;
        let image_scope = ImageScope::document_directory(directory)
            .with_logical_root(path.parent().ok_or(DocumentError::InvalidPath)?)?;
        let expected = match scoped.read_snapshot() {
            Ok(snapshot) => Some(snapshot.into_baseline()),
            Err(DocumentError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        let identity = match expected {
            Some(expected) if expected.bytes == bytes => expected.identity,
            Some(expected) => {
                let authority = self
                    .authorities
                    .join(&scoped, Arc::clone(&expected.identity))?;
                let mut current = authority.current(&scoped)?;
                // A stale read cannot advance a lineage that moved meanwhile.
                if current.identity != expected.identity {
                    return Err(DocumentError::ExternalChange);
                }
                let published =
                    Arc::new(scoped.replace(&expected.bytes, &expected.identity, &bytes)?);
                current.identity = Arc::clone(&published);
                published
            }
            None => Arc::new(scoped.write_authorized(None, &bytes)?),
        };
        self.register(
            path,
            scoped::FileBaseline { bytes, identity },
            text.to_owned(),
            encoding,
            image_scope,
            scoped,
        )
    }

    pub fn close(&mut self, id: &str) {
        self.retired_watchers.clear();
        self.close_document_watches(id);
        self.images.close_document(id);
        self.image_aliases.remove(id);
        self.documents.remove(id);
        self.pending_reloads.remove(id);
    }

    /// Trusted native host metadata for recording a recent-file grant. This is
    /// deliberately not a renderer command and never accepts a caller path.
    pub fn authorized_path(&self, id: &str) -> Result<PathBuf, DocumentError> {
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        Ok(document.path.clone())
    }
    /// A possibly stale display hint for native titles/SaveAs dialogs only. This
    /// grants no IO/recent/bookmark authority, including after an uncertain move.
    pub fn display_path(&self, id: &str) -> Result<PathBuf, DocumentError> {
        self.documents
            .get(id)
            .map(|document| document.path.clone())
            .ok_or(DocumentError::UnknownDocument)
    }
    pub fn get_metadata(&self, id: &str) -> Result<DocumentMetadata, DocumentError> {
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        if document.trashed_by.is_none() || document.relocation_uncertain {
            document.ensure_location()?;
        }
        Ok(document.metadata(id))
    }

    /// A host-owned inspection may hand a draft to a new window only for the
    /// same live entity. A bookmark's display name alone cannot establish it.
    pub fn validate_entry_identity(
        &self,
        id: &str,
        identity: &same_file::Handle,
    ) -> Result<(), DocumentError> {
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        let current = document.authority.current(&document.scoped)?;
        if current.identity.as_ref() == identity {
            Ok(())
        } else {
            Err(DocumentError::ExternalChange)
        }
    }

    fn check_capacity(&self) -> Result<(), DocumentError> {
        if self.documents.len() >= MAX_OPEN_DOCUMENTS {
            return Err(DocumentError::TooManyDocuments);
        }
        Ok(())
    }

    fn register(
        &mut self,
        path: PathBuf,
        baseline: scoped::FileBaseline,
        text: String,
        encoding: Encoding,
        image_scope: ImageScope,
        scoped: scoped::ScopedDocument,
    ) -> Result<DocumentPayload, DocumentError> {
        self.check_capacity()?;
        let id = Uuid::new_v4().to_string();
        let authority =
            self.authorities
                .join_at(&scoped, Arc::clone(&baseline.identity), Some(&path))?;
        let document = Document {
            path,
            original_bytes: baseline.bytes,
            identity: baseline.identity,
            authority,
            text,
            encoding,
            scoped,
            image_scope,
            baseline_epoch: Uuid::new_v4(),
            metadata_revision: 0,
            relocation_uncertain: false,
            trashed_by: None,
            trashed_location: None,
        };
        let payload = document.payload(&id);
        self.documents.insert(id, document);
        Ok(payload)
    }
}
