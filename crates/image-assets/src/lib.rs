//! Document-owned image bytes and capability-scoped import/lookup.
mod clipboard;
#[cfg(test)]
mod relocation_tests;
mod scope;
mod validation;
pub use clipboard::{clipboard_png, ClipboardFormat};

use base64::{engine::general_purpose::STANDARD, Engine};
pub use scope::{ImageScope, PreparedImageScopeRetarget};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::Arc,
};
use thiserror::Error;
use uuid::Uuid;

/// Validate bounded image data without registering it as a document resource.
pub fn inspect_image(bytes: &[u8]) -> Result<&'static str, ImageError> {
    validation::validate(bytes).map(|kind| kind.mime)
}

pub const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_BASE64_BYTES: usize = MAX_IMAGE_BYTES.div_ceil(3) * 4;
pub const MAX_DOCUMENT_IMAGES: usize = 128;
pub const MAX_REGISTERED_IMAGES: usize = 256;
pub const MAX_REGISTERED_BYTES: usize = 128 * 1024 * 1024;
pub const IMAGE_CSP: &str = "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'none'; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

#[derive(Debug, Error)]
pub enum ImageError {
    #[error("图片引用超出已授权目录；请通过文件夹打开文档，以授予所需的工作区范围")]
    OutsideScope,
    #[error("图片引用必须是相对 URL 路径，不能包含绝对路径、scheme、查询或片段")]
    InvalidReference,
    #[error("图片路径含符号链接，不能通过此引用读取")]
    Symlink,
    #[error("图片超过 8 MiB 大小限制")]
    TooLarge,
    #[error("SVG 超过 1 MiB 解析限制")]
    SvgTooLarge,
    #[error("图片数据无效或格式不支持；当前支持 PNG、JPEG、GIF、WebP 和静态 SVG")]
    InvalidImage,
    #[error("当前解码器不支持 16 位 APNG；请使用静态 PNG 或 8 位动画图片")]
    UnsupportedAnimation,
    #[error("图片尺寸、解码内存或动画帧数超过支持范围")]
    DecodeLimit,
    #[error("SVG 含脚本、外部引用、DTD 或不支持的动态内容")]
    UnsafeSvg,
    #[error("图片资源数量或总字节数达到上限，请关闭不需要的文档")]
    Capacity,
    #[error("图片 base64 数据无效")]
    InvalidBase64,
    #[error("无法使用图片文件名")]
    InvalidName,
    #[error("无法安全导入图片：目标文件系统不支持原子不覆盖发布，或文件权限不足")]
    PublishFailed,
    #[error("图片文件操作失败：{0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub struct ImageRegistration {
    pub token: String,
    pub source: String,
}
#[derive(Clone)]
pub struct ImageResource {
    pub bytes: Arc<[u8]>,
    pub mime: &'static str,
}
struct RegisteredImage {
    document: String,
    sources: HashSet<String>,
    // None keeps already granted immutable bytes renderable after a capability
    // intersection without associating them with a path in the narrower root.
    path: Option<PathBuf>,
    resource: ImageResource,
}

pub struct ImageRegistry {
    images: HashMap<String, RegisteredImage>,
    bytes: usize,
    max_document_images: usize,
    max_images: usize,
    max_bytes: usize,
}

/// Native-only cache-path plan. All entries are preallocated before a move;
/// registered immutable image bytes and URL tokens are kept intact.
pub struct PreparedImageRegistryRetarget {
    paths: Vec<(String, Option<PathBuf>)>,
}
impl PreparedImageRegistryRetarget {
    pub fn commit(self, registry: &mut ImageRegistry) {
        for (token, path) in self.paths {
            registry
                .images
                .get_mut(&token)
                .expect("prepared image registry remains exclusively owned")
                .path = path;
        }
    }
}
impl Default for ImageRegistry {
    fn default() -> Self {
        Self {
            images: HashMap::new(),
            bytes: 0,
            max_document_images: MAX_DOCUMENT_IMAGES,
            max_images: MAX_REGISTERED_IMAGES,
            max_bytes: MAX_REGISTERED_BYTES,
        }
    }
}
impl ImageRegistry {
    pub fn prepare_retarget(
        &self,
        document: &str,
        scope: &PreparedImageScopeRetarget,
    ) -> PreparedImageRegistryRetarget {
        PreparedImageRegistryRetarget {
            paths: self
                .images
                .iter()
                .filter(|(_, image)| image.document == document)
                .filter_map(
                    |(token, image)| match scope.retarget_path(image.path.as_deref()?) {
                        scope::CachePathChange::Unchanged => None,
                        scope::CachePathChange::Mapped(path) => Some((token.clone(), Some(path))),
                        scope::CachePathChange::Detached => Some((token.clone(), None)),
                    },
                )
                .collect(),
        }
    }
    pub fn resolve(
        &mut self,
        document: &str,
        scope: &ImageScope,
        reference: &str,
    ) -> Result<ImageRegistration, ImageError> {
        let path = scope.reference_path(reference)?;
        let bytes = scope.read(&path)?;
        if let Some(token) = self
            .images
            .iter()
            .find(|(_, value)| {
                value.document == document
                    && value.path.as_deref() == Some(path.as_path())
                    && value.resource.bytes.as_ref() == bytes
            })
            .map(|(token, _)| token.clone())
        {
            let image = self
                .images
                .get_mut(&token)
                .expect("matched registration remains present");
            if image.sources.len() < MAX_DOCUMENT_IMAGES {
                image.sources.insert(reference.to_owned());
            }
            return Ok(ImageRegistration {
                token,
                source: reference.to_owned(),
            });
        }
        let kind = validation::validate(&bytes)?;
        let previous = self
            .images
            .iter()
            .find(|(_, value)| {
                value.document == document && value.path.as_deref() == Some(path.as_path())
            })
            .map(|(token, _)| token.clone());
        self.check_capacity(document, bytes.len(), previous.as_deref())?;
        if let Some(token) = previous {
            self.remove(&token);
        }
        Ok(self.register(document, path, reference.to_owned(), bytes, kind.mime))
    }

    pub fn import_base64(
        &mut self,
        document: &str,
        scope: &ImageScope,
        name: &str,
        encoded: &str,
    ) -> Result<ImageRegistration, ImageError> {
        self.import_base64_with_root(document, scope, name, encoded, "")
    }
    pub fn import_base64_with_root(
        &mut self,
        document: &str,
        scope: &ImageScope,
        name: &str,
        encoded: &str,
        reference_root: &str,
    ) -> Result<ImageRegistration, ImageError> {
        if encoded.len() > MAX_BASE64_BYTES {
            return Err(ImageError::TooLarge);
        }
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| ImageError::InvalidBase64)?;
        self.import_with_folder(document, scope, name, bytes, reference_root, "assets")
    }
    pub fn import_bytes(
        &mut self,
        document: &str,
        scope: &ImageScope,
        name: &str,
        bytes: Vec<u8>,
    ) -> Result<ImageRegistration, ImageError> {
        self.import_with_folder(document, scope, name, bytes, "", "assets")
    }
    /// Trusted host copy/import into an already owned scope. Bytes are validated
    /// again and publication keeps the same atomic, no-replace policy as base64.
    pub fn import_bytes_with_folder(
        &mut self,
        document: &str,
        scope: &ImageScope,
        name: &str,
        bytes: Vec<u8>,
        reference_root: &str,
        storage_folder: &str,
    ) -> Result<ImageRegistration, ImageError> {
        self.import_with_folder(document, scope, name, bytes, reference_root, storage_folder)
    }
    /// Release only a caller-owned registration, never its physical asset. This
    /// is used to roll back a failed multi-image preparation without deleting
    /// immutable files that may already be referenced elsewhere.
    pub fn discard_registration(&mut self, document: &str, token: &str) -> bool {
        if self
            .images
            .get(token)
            .is_some_and(|image| image.document == document)
        {
            self.remove(token);
            true
        } else {
            false
        }
    }
    pub fn import_base64_with_folder(
        &mut self,
        document: &str,
        scope: &ImageScope,
        name: &str,
        encoded: &str,
        reference_root: &str,
        storage_folder: &str,
    ) -> Result<ImageRegistration, ImageError> {
        if encoded.len() > MAX_BASE64_BYTES {
            return Err(ImageError::TooLarge);
        }
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| ImageError::InvalidBase64)?;
        self.import_with_folder(document, scope, name, bytes, reference_root, storage_folder)
    }
    fn import_with_folder(
        &mut self,
        document: &str,
        scope: &ImageScope,
        name: &str,
        bytes: Vec<u8>,
        reference_root: &str,
        storage_folder: &str,
    ) -> Result<ImageRegistration, ImageError> {
        let kind = validation::validate(&bytes)?;
        self.check_capacity(document, bytes.len(), None)?;
        let imported =
            scope.import(name, kind.extension, &bytes, reference_root, storage_folder)?;
        Ok(self.register(document, imported.path, imported.source, bytes, kind.mime))
    }
    pub fn get(&self, token: &str) -> Option<ImageResource> {
        self.images.get(token).map(|entry| entry.resource.clone())
    }
    pub fn registration_owner(&self, token: &str) -> Option<&str> {
        self.images.get(token).map(|entry| entry.document.as_str())
    }
    pub fn registration_path(&self, document: &str, token: &str) -> Option<PathBuf> {
        self.images
            .get(token)
            .filter(|entry| entry.document == document)
            .and_then(|entry| entry.path.clone())
    }
    /// Exact already-registered reference only. This permits a native confirmed
    /// image copy after its old directory grant was intersected by Move, without
    /// resolving the same text against unrelated new destination siblings.
    pub fn registered_source(&self, document: &str, source: &str) -> Option<ImageRegistration> {
        self.images
            .iter()
            .filter(|(_, image)| image.document == document && image.sources.contains(source))
            .min_by_key(|(_, image)| image.path.is_some())
            .map(|(token, _)| ImageRegistration {
                token: token.clone(),
                source: source.to_owned(),
            })
    }
    /// Clone already validated immutable bytes into a second owner's lifetime.
    /// This grants no filesystem path and never makes a token a disk-read API.
    pub fn alias_registration(
        &mut self,
        document: &str,
        token: &str,
        source: &str,
    ) -> Result<ImageRegistration, ImageError> {
        let resource = self
            .images
            .get(token)
            .ok_or(ImageError::OutsideScope)?
            .resource
            .clone();
        self.check_capacity(document, resource.bytes.len(), None)?;
        let token = Uuid::new_v4().to_string();
        self.bytes += resource.bytes.len();
        self.images.insert(
            token.clone(),
            RegisteredImage {
                document: document.to_owned(),
                sources: HashSet::from([source.to_owned()]),
                path: None,
                resource,
            },
        );
        Ok(ImageRegistration {
            token,
            source: source.to_owned(),
        })
    }
    /// Native transaction commit after the destination document has been
    /// registered. The prepared set was already quota-checked and stays in the
    /// same registry; resources and tokens are unchanged, with no filesystem IO.
    pub fn reassign_document(&mut self, from: &str, to: &str) {
        for image in self
            .images
            .values_mut()
            .filter(|image| image.document == from)
        {
            image.document = to.to_owned();
        }
    }
    pub fn check_reassign_document(&self, from: &str, to: &str) -> Result<(), ImageError> {
        if self
            .images
            .values()
            .filter(|image| image.document == from || image.document == to)
            .count()
            > self.max_document_images
        {
            Err(ImageError::Capacity)
        } else {
            Ok(())
        }
    }
    pub fn close_document(&mut self, document: &str) {
        let removed: Vec<_> = self
            .images
            .iter()
            .filter(|(_, entry)| entry.document == document)
            .map(|(token, _)| token.clone())
            .collect();
        for token in removed {
            self.remove(&token);
        }
    }
    fn check_capacity(
        &self,
        document: &str,
        length: usize,
        previous: Option<&str>,
    ) -> Result<(), ImageError> {
        let previous_bytes = previous
            .and_then(|token| self.images.get(token))
            .map_or(0, |entry| entry.resource.bytes.len());
        let replacement = usize::from(previous.is_some());
        if self.images.len() + 1 - replacement > self.max_images
            || self
                .images
                .values()
                .filter(|entry| entry.document == document)
                .count()
                + 1
                - replacement
                > self.max_document_images
            || self.bytes - previous_bytes + length > self.max_bytes
        {
            return Err(ImageError::Capacity);
        }
        Ok(())
    }
    fn register(
        &mut self,
        document: &str,
        path: PathBuf,
        source: String,
        bytes: Vec<u8>,
        mime: &'static str,
    ) -> ImageRegistration {
        let token = Uuid::new_v4().to_string();
        self.bytes += bytes.len();
        self.images.insert(
            token.clone(),
            RegisteredImage {
                document: document.to_owned(),
                sources: HashSet::from([source.clone()]),
                path: Some(path),
                resource: ImageResource {
                    bytes: bytes.into(),
                    mime,
                },
            },
        );
        ImageRegistration { token, source }
    }
    fn remove(&mut self, token: &str) {
        if let Some(entry) = self.images.remove(token) {
            self.bytes -= entry.resource.bytes.len();
        }
    }
}

#[cfg(test)]
mod tests;
