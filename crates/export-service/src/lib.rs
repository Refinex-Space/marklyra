//! Self-contained HTML export and bounded, disposable print-preview resources.
mod formats;
mod html;
pub use formats::{import_reader, validate_converted, ConversionFormat};
mod storage;

pub use html::{prepare_html, PreparedHtml, HTML_CSP, PREVIEW_CSP};
use std::{collections::HashMap, sync::Arc};
pub use storage::{suggested_filename, ExportDestination};
use thiserror::Error;
use uuid::Uuid;

pub const MAX_HTML_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_PREVIEWS: usize = 4;
pub const MAX_PREVIEW_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("导出 HTML 为空、含 NUL 或不是有效 UTF-8 文本")]
    InvalidText,
    #[error("导出 HTML 超过 32 MiB 限制")]
    TooLarge,
    #[error("导出 HTML 结构或 CSS 嵌套超过支持范围")]
    Complexity,
    #[error("导出 HTML 含不支持的活动内容：{0}")]
    ActiveContent(String),
    #[error("导出 HTML 仍引用非内嵌资源：{0}")]
    ExternalResource(String),
    #[error("导出 HTML 含无法安全解析的 CSS")]
    InvalidCss,
    #[error("打印预览已达到数量或内存上限，请先关闭其他预览")]
    Capacity,
    #[error("导出路径不是可写的普通文件")]
    InvalidPath,
    #[error("导出目标在保存期间发生变化；未覆盖，请重试")]
    ExternalChange,
    #[error("导出目标为只读文件")]
    ReadOnly,
    #[error("导出文件操作失败：{0}")]
    Io(#[from] std::io::Error),
}

#[derive(Default)]
pub struct PreviewRegistry {
    entries: HashMap<String, Arc<[u8]>>,
    bytes: usize,
}
impl PreviewRegistry {
    pub fn insert(&mut self, html: PreparedHtml) -> Result<String, ExportError> {
        if self.entries.len() >= MAX_PREVIEWS || self.bytes + html.len() > MAX_PREVIEW_BYTES {
            return Err(ExportError::Capacity);
        }
        let token = Uuid::new_v4().to_string();
        self.bytes += html.len();
        self.entries.insert(token.clone(), html.into_bytes().into());
        Ok(token)
    }
    pub fn get(&self, token: &str) -> Option<Arc<[u8]>> {
        self.entries.get(token).cloned()
    }
    pub fn close(&mut self, token: &str) {
        if let Some(bytes) = self.entries.remove(token) {
            self.bytes -= bytes.len();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn previews_are_bounded_and_close_revokes_only_its_resource() {
        let mut registry = PreviewRegistry::default();
        let first = registry
            .insert(prepare_html("<p>第一篇</p>").unwrap())
            .unwrap();
        for _ in 1..MAX_PREVIEWS {
            registry
                .insert(prepare_html("<p>Other</p>").unwrap())
                .unwrap();
        }
        assert!(matches!(
            registry.insert(prepare_html("<p>Extra</p>").unwrap()),
            Err(ExportError::Capacity)
        ));
        registry.close(&first);
        assert!(registry.get(&first).is_none());
        assert_eq!(registry.entries.len(), MAX_PREVIEWS - 1);
        registry
            .insert(prepare_html("<p>New</p>").unwrap())
            .unwrap();
        registry.bytes = MAX_PREVIEW_BYTES;
        registry.entries.clear();
        assert!(matches!(
            registry.insert(prepare_html("<p>Extra</p>").unwrap()),
            Err(ExportError::Capacity)
        ));
    }
}
