use super::{Content, MAX_FORMAT_BYTES};
use objc2::{rc::autoreleasepool, runtime::ProtocolObject};
use objc2_app_kit::{NSPasteboard, NSPasteboardItem};
use objc2_foundation::{ns_string, NSArray, NSString};

pub(super) fn read_general() -> Result<Content, String> {
    main_thread()?;
    autoreleasepool(|_| read(&NSPasteboard::generalPasteboard()))
}
pub(super) fn write_general(data: &Content) -> Result<(), String> {
    main_thread()?;
    autoreleasepool(|_| write(&NSPasteboard::generalPasteboard(), data))
}
fn string(item: &NSPasteboardItem, kind: &NSString) -> Result<Option<String>, String> {
    let Some(value) = item.stringForType(kind) else {
        if item.types().containsObject(kind) {
            return Err("剪贴板声明的文本格式无法读取；未退回可能丢失格式的内容".to_owned());
        }
        return Ok(None);
    };
    // Reject before allocating a potentially much larger UTF-8 Rust String.
    if value.len() > MAX_FORMAT_BYTES {
        return Err("剪贴板格式超过大小限制".to_owned());
    }
    let value = value.to_string();
    if value.len() > MAX_FORMAT_BYTES {
        return Err("剪贴板格式超过大小限制".to_owned());
    }
    Ok(Some(value))
}
fn markdown_html(item: &NSPasteboardItem) -> Result<Option<String>, String> {
    string(item, ns_string!("dev.refinex.marklyra.markdown-html"))
}
pub(super) fn read(board: &NSPasteboard) -> Result<Content, String> {
    main_thread()?;
    let before = board.changeCount();
    let mut result = Content {
        mark_html: None,
        text: String::new(),
        html: None,
    };
    if let Some(items) = board.pasteboardItems() {
        if items.len() > 1024 {
            return Err("剪贴板项目过多".to_owned());
        }
        // Never combine text from one native item with HTML from a different item.
        for item in items {
            let text = string(&item, ns_string!("public.utf8-plain-text"))?;
            let html = string(&item, ns_string!("public.html"))?;
            let mark_html = string(&item, ns_string!("dev.refinex.marklyra.markdown-html"))?;
            // Prefer explicit HTML. RTF is converted only within this same item,
            // never paired with text or markup from a later native item.
            if html.is_none() && mark_html.is_none() {
                if has_rtfd(&item) {
                    return Err("RTFD 附件粘贴尚未实现；未退回会丢失资源的文本".into());
                }
                if let Some(content) = super::rtf::read(&item)? {
                    result = content;
                    break;
                }
            }
            if text.is_some() || html.is_some() || mark_html.is_some() {
                result = Content {
                    text: text.unwrap_or_default(),
                    html,
                    mark_html,
                };
                break;
            }
        }
    }
    if before != board.changeCount() {
        return Err("读取期间剪贴板已改变，请重新粘贴".to_owned());
    }
    result.validate()?;
    Ok(result)
}
pub(super) fn write(board: &NSPasteboard, data: &Content) -> Result<(), String> {
    main_thread()?;
    data.validate()?;
    let item = NSPasteboardItem::new();
    if !item.setString_forType(
        &NSString::from_str(&data.text),
        ns_string!("public.utf8-plain-text"),
    ) {
        return Err("无法准备剪贴板文本".to_owned());
    }
    if let Some(html) = &data.html {
        if !item.setString_forType(&NSString::from_str(html), ns_string!("public.html")) {
            return Err("无法准备剪贴板 HTML".to_owned());
        }
    }
    if let Some(mark_html) = &data.mark_html {
        if !item.setString_forType(
            &NSString::from_str(mark_html),
            ns_string!("dev.refinex.marklyra.markdown-html"),
        ) {
            return Err("无法准备剪贴板 Markdown HTML".into());
        }
    }
    let objects = NSArray::from_retained_slice(&[ProtocolObject::from_retained(item)]);
    // Both formats exist on one item before ownership changes. clear+write is
    // the OS publication protocol, not a rollback-capable database transaction.
    board.clearContents();
    if !board.writeObjects(&objects) {
        return Err("剪贴板写入失败；没有确认完成剪切".to_owned());
    }
    Ok(())
}

fn main_thread() -> Result<(), String> {
    objc2::MainThreadMarker::new()
        .ok_or("AppKit 剪贴板必须在主线程调用".to_owned())
        .map(|_| ())
}
fn has_rtfd(item: &NSPasteboardItem) -> bool {
    item.types()
        .containsObject(ns_string!("com.apple.flat-rtfd"))
        || item.types().containsObject(ns_string!("public.rtfd"))
}
pub(super) fn read_image_general() -> Result<Option<super::NativeImage>, String> {
    main_thread()?;
    autoreleasepool(|_| read_image(&NSPasteboard::generalPasteboard()))
}
pub(super) fn read_image(board: &NSPasteboard) -> Result<Option<super::NativeImage>, String> {
    main_thread()?;
    let before = board.changeCount();
    if !file_urls(board)?.is_empty() {
        if board.changeCount() != before {
            return Err("读取期间剪贴板已改变，请重新粘贴".into());
        }
        return Ok(None);
    }
    let mut result = None;
    if let Some(items) = board.pasteboardItems() {
        if items.len() > 1024 {
            return Err("剪贴板项目过多".into());
        }
        for item in &items {
            let html = ns_string!("public.html");
            let custom = ns_string!("org.webkit.custom-pasteboard-data");
            let rich = item.types().containsObject(html)
                && string(&item, html)?.is_some_and(|value| !value.is_empty());
            let rtf = if item.types().containsObject(ns_string!("public.rtf")) {
                let data = item
                    .dataForType(ns_string!("public.rtf"))
                    .ok_or("无法读取 RTF 剪贴板")?;
                if data.len() > MAX_FORMAT_BYTES {
                    return Err("RTF 剪贴板超过 8 MiB 限制".into());
                }
                !data.is_empty()
            } else {
                false
            };
            // Browser text/markhtml is not itself a valid AppKit UTI. WebKit's
            // custom-format container is opaque here; never replace its rich
            // source with a bitmap simply because public.html is absent.
            let custom_rich = if item.types().containsObject(custom) {
                let data = item
                    .dataForType(custom)
                    .ok_or("无法读取浏览器自定义剪贴板内容")?;
                if data.len() > MAX_FORMAT_BYTES {
                    return Err("剪贴板自定义内容超过大小限制".into());
                }
                !data.is_empty()
            } else {
                false
            };
            let markdown_rich = markdown_html(&item)?.is_some_and(|value| !value.is_empty());
            if rich || custom_rich || rtf || markdown_rich || has_rtfd(&item) {
                if board.changeCount() != before {
                    return Err("读取期间剪贴板已改变，请重新粘贴".into());
                }
                return Ok(None);
            }
        }
        'items: for item in items {
            for (kind, format) in [
                (ns_string!("public.png"), image_assets::ClipboardFormat::Png),
                (
                    ns_string!("public.tiff"),
                    image_assets::ClipboardFormat::Tiff,
                ),
            ] {
                if !item.types().containsObject(kind) {
                    continue;
                }
                let data = item
                    .dataForType(kind)
                    .ok_or("剪贴板声明的图片格式无法读取")?;
                if data.len() > image_assets::MAX_IMAGE_BYTES {
                    return Err("剪贴板图片超过 8 MiB 限制".into());
                }
                result = Some(super::NativeImage {
                    bytes: data.to_vec(),
                    format,
                });
                break 'items;
            }
        }
    }
    if board.changeCount() != before {
        return Err("读取期间剪贴板已改变，请重新粘贴".into());
    }
    Ok(result)
}
/// One native snapshot selects the same source as the paste priority order:
/// rich markup, system file URLs, raster, then plain text. Companion formats
/// are never combined across separate native items.
pub(super) fn read_input(board: &NSPasteboard) -> Result<super::NativeClipboardInput, String> {
    main_thread()?;
    let before = board.changeCount();
    let content = read(board)?;
    let result = if content.html.as_ref().is_some_and(|value| !value.is_empty())
        || content
            .mark_html
            .as_ref()
            .is_some_and(|value| !value.is_empty())
    {
        super::NativeClipboardInput::Content(content)
    } else {
        let paths = file_urls(board)?;
        if !paths.is_empty() {
            super::NativeClipboardInput::Files(paths)
        } else if let Some(image) = read_image(board)? {
            super::NativeClipboardInput::Image(image)
        } else if !content.text.is_empty() {
            super::NativeClipboardInput::Content(content)
        } else {
            super::NativeClipboardInput::Empty
        }
    };
    if board.changeCount() != before {
        return Err("读取期间剪贴板已改变，请重新粘贴".into());
    }
    Ok(result)
}
fn file_urls(board: &NSPasteboard) -> Result<Vec<std::path::PathBuf>, String> {
    let mut paths = Vec::new();
    if let Some(items) = board.pasteboardItems() {
        if items.len() > 1024 {
            return Err("剪贴板项目过多".into());
        }
        for item in items {
            let Some(value) = string(&item, ns_string!("public.file-url"))? else {
                continue;
            };
            if value.len() > 8192 || value.chars().any(char::is_control) {
                return Err("剪贴板本地文件网址无效".into());
            }
            let url = tauri::Url::parse(&value).map_err(|_| "剪贴板本地文件网址无效")?;
            if url.scheme() != "file"
                || url
                    .host_str()
                    .is_some_and(|host| !host.is_empty() && host != "localhost")
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err("剪贴板文件仅接受本机文件网址".into());
            }
            let path = url.to_file_path().map_err(|_| "剪贴板本地文件网址无效")?;
            if !path.is_absolute() || path.as_os_str().is_empty() {
                return Err("剪贴板本地文件路径无效".into());
            }
            paths.push(path);
            if paths.len() > 32 {
                return Err("一次最多接收 32 个本地文件".into());
            }
        }
    }
    Ok(paths)
}

pub(crate) fn read_file_urls(board: &NSPasteboard) -> Result<Vec<std::path::PathBuf>, String> {
    main_thread()?;
    let before = board.changeCount();
    let paths = file_urls(board)?;
    if board.changeCount() != before {
        return Err("读取期间拖放项目已改变".into());
    }
    Ok(paths)
}

/// A file-only Native destination must leave richer editor payloads
/// to WKWebView, including opaque custom WebKit markup that we cannot decode.
pub(crate) fn drop_has_rich_content(board: &NSPasteboard) -> Result<bool, String> {
    main_thread()?;
    let before = board.changeCount();
    let mut rich = false;
    if let Some(items) = board.pasteboardItems() {
        if items.len() > 1024 {
            return Err("拖放项目过多".into());
        }
        for item in items {
            for kind in [
                ns_string!("dev.refinex.marklyra.markdown-html"),
                ns_string!("public.html"),
            ] {
                if string(&item, kind)?.is_some_and(|value| !value.is_empty()) {
                    rich = true;
                    break;
                }
            }
            if rich {
                break;
            }
            let kind = ns_string!("org.webkit.custom-pasteboard-data");
            if item.types().containsObject(kind) {
                let bytes = item
                    .dataForType(kind)
                    .ok_or("拖放声明的 WebKit 自定义格式无法读取")?;
                if bytes.len() > MAX_FORMAT_BYTES {
                    return Err("拖放自定义格式超过大小限制".into());
                }
                if !bytes.is_empty() {
                    rich = true;
                    break;
                }
            }
        }
    }
    if board.changeCount() != before {
        return Err("读取期间拖放项目已改变".into());
    }
    Ok(rich)
}

#[cfg(test)]
mod tests {
    #[test]
    fn background_calls_are_rejected_before_accessing_any_pasteboard() {
        let error = std::thread::spawn(super::read_general)
            .join()
            .unwrap()
            .unwrap_err();
        assert!(error.contains("主线程"));
    }
}
