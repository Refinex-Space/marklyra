use super::{format, Content, MAX_FORMAT_BYTES};
use clipboard_win::{raw, Clipboard};
use tauri::WebviewWindow;

fn open(window: &WebviewWindow) -> Result<Clipboard, String> {
    let owner = window.hwnd().map_err(|error| error.to_string())?.0;
    Clipboard::new_attempts_for(owner as clipboard_win::types::HWND, 10)
        .map_err(|_| "系统剪贴板正被占用，请重试".to_owned())
}
fn bytes(kind: u32, limit: usize) -> Result<Option<Vec<u8>>, String> {
    if !raw::is_format_avail(kind) {
        return Ok(None);
    }
    let length = raw::size(kind).ok_or("无法读取系统剪贴板格式大小")?.get();
    if length > limit {
        return Err("系统剪贴板格式超过大小限制".to_owned());
    }
    let mut result = vec![0; length];
    let read = raw::get(kind, &mut result).map_err(|_| "无法读取系统剪贴板格式")?;
    if read != length {
        return Err("系统剪贴板格式长度不一致".to_owned());
    }
    Ok(Some(result))
}
pub(super) fn read(window: &WebviewWindow) -> Result<Content, String> {
    let _clipboard = open(window)?;
    let html_format = clipboard_win::register_format("HTML Format")
        .ok_or("无法注册系统 HTML 剪贴板格式")?
        .get();
    // One OpenClipboard guard covers availability, size, and both format reads.
    let text = bytes(
        clipboard_win::formats::CF_UNICODETEXT,
        (MAX_FORMAT_BYTES + 1) * 2,
    )?
    .map(|value| format::decode_utf16(&value))
    .transpose()?
    .unwrap_or_default();
    let html = bytes(html_format, MAX_FORMAT_BYTES + 64 * 1024)?
        .map(|value| format::decode_html(&value))
        .transpose()?;
    let mark_format = clipboard_win::register_format("text/markhtml")
        .ok_or("无法注册 Markdown HTML 剪贴板格式")?
        .get();
    let mark_html = bytes(mark_format, MAX_FORMAT_BYTES + 64 * 1024)?
        .map(|value| format::decode_markup(&value))
        .transpose()?;
    let content = Content {
        text,
        html,
        mark_html,
    };
    content.validate()?;
    Ok(content)
}
pub(super) fn write(window: &WebviewWindow, content: &Content) -> Result<(), String> {
    content.validate()?;
    // Prepare both buffers and register the format before changing ownership.
    let text: Vec<u8> = content
        .text
        .encode_utf16()
        .chain([0])
        .flat_map(u16::to_le_bytes)
        .collect();
    let html = content
        .html
        .as_deref()
        .map(format::encode_html)
        .transpose()?;
    let html_format = if html.is_some() {
        Some(
            clipboard_win::register_format("HTML Format")
                .ok_or("无法注册系统 HTML 剪贴板格式")?
                .get(),
        )
    } else {
        None
    };
    let markup = content
        .mark_html
        .as_deref()
        .map(format::encode_markup)
        .transpose()?;
    let mark_format = if markup.is_some() {
        Some(
            clipboard_win::register_format("text/markhtml")
                .ok_or("无法注册 Markdown HTML 剪贴板格式")?
                .get(),
        )
    } else {
        None
    };
    let _clipboard = open(window)?;
    raw::empty().map_err(|_| "无法准备系统剪贴板写入")?;
    raw::set_without_clear(clipboard_win::formats::CF_UNICODETEXT, &text)
        .map_err(|_| "剪贴板文本写入失败；没有确认完成剪切")?;
    if let (Some(kind), Some(html)) = (html_format, html) {
        raw::set_without_clear(kind, &html)
            .map_err(|_| "剪贴板 HTML 写入失败；没有确认完成剪切")?;
    }
    if let (Some(kind), Some(markup)) = (mark_format, markup) {
        raw::set_without_clear(kind, &markup)
            .map_err(|_| "Markdown HTML 写入失败；没有确认完成剪切")?;
    }
    // Windows exposes both formats when this one guard closes. A failure after
    // empty() is reported, never disguised as an all-format rollback or success.
    Ok(())
}

pub(super) fn read_image(window: &WebviewWindow) -> Result<Option<super::NativeImage>, String> {
    let _clipboard = open(window)?;
    let html = clipboard_win::register_format("HTML Format")
        .ok_or("无法注册系统 HTML 剪贴板格式")?
        .get();
    if let Some(data) = bytes(html, MAX_FORMAT_BYTES + 64 * 1024)? {
        if !format::decode_html(&data)?.is_empty() {
            return Ok(None);
        }
    }
    let markhtml = clipboard_win::register_format("text/markhtml")
        .ok_or("无法注册系统 Markdown 剪贴板格式")?
        .get();
    if bytes(markhtml, MAX_FORMAT_BYTES + 64 * 1024)?
        .map(|data| format::decode_markup(&data))
        .transpose()?
        .is_some_and(|data| !data.is_empty())
    {
        return Ok(None);
    }
    let png = clipboard_win::register_format("PNG")
        .ok_or("无法注册系统 PNG 剪贴板格式")?
        .get();
    for (kind, format) in [
        (png, image_assets::ClipboardFormat::Png),
        (
            clipboard_win::formats::CF_DIBV5,
            image_assets::ClipboardFormat::Dib,
        ),
        (
            clipboard_win::formats::CF_DIB,
            image_assets::ClipboardFormat::Dib,
        ),
    ] {
        if let Some(bytes) = bytes(kind, image_assets::MAX_IMAGE_BYTES)? {
            return Ok(Some(super::NativeImage { bytes, format }));
        }
    }
    // CF_BITMAP-only handles are not read through raw::get_bitmap: that API
    // allocates the native-reported pixel size before a caller can bound it.
    Ok(None)
}
