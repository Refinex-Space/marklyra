//! Bounded, in-memory RTF import. No RTFD, file wrappers or HTML import/network loader.
use super::{Content, MAX_FORMAT_BYTES};
use objc2::{runtime::AnyObject, AnyThread};
use objc2_app_kit::{
    NSAttributedStringAppKitDocumentFormats, NSAttributedStringDocumentFormats,
    NSAttributedStringKitAdditions, NSDocumentTypeDocumentAttribute, NSHTMLTextDocumentType,
    NSPasteboardItem,
};
use objc2_foundation::{ns_string, NSAttributedString, NSData, NSDictionary, NSRange, NSString};

pub(super) fn read(item: &NSPasteboardItem) -> Result<Option<Content>, String> {
    let kind = ns_string!("public.rtf");
    if !item.types().containsObject(kind) {
        return Ok(None);
    }
    let bytes = item
        .dataForType(kind)
        .ok_or("无法读取声明的 RTF 剪贴板内容")?;
    if bytes.len() > MAX_FORMAT_BYTES {
        return Err("RTF 剪贴板超过 8 MiB 限制".into());
    }
    convert(&bytes).map(Some)
}

fn convert(data: &NSData) -> Result<Content, String> {
    objc2::MainThreadMarker::new().ok_or("RTF 转换必须在主线程调用")?;
    if data.len() > MAX_FORMAT_BYTES {
        return Err("RTF 剪贴板超过 8 MiB 限制".into());
    }
    reject_unsupported(&data.to_vec())?;
    // SAFETY: Explicit RTF-only initializer. No document-attributes output pointer
    // is supplied; NSData remains alive for the complete synchronous call.
    let rich = unsafe {
        NSAttributedString::initWithRTF_documentAttributes(NSAttributedString::alloc(), data, None)
    }
    .ok_or("无法解析 RTF 剪贴板；未退回可能丢失格式的文本")?;
    let range = NSRange::new(0, rich.length());
    if range.length > MAX_FORMAT_BYTES || rich.containsAttachmentsInRange(range) {
        return Err("RTF 文本过大或包含尚未支持的附件；未导入".into());
    }
    let text = rich.string().to_string();
    // SAFETY: AppKit's immutable NSString constants are process-lifetime values.
    // This dictionary has exactly the documented document-type NSString value.
    let attributes: objc2::rc::Retained<NSDictionary<NSString, AnyObject>> = unsafe {
        NSDictionary::from_slices(
            &[NSDocumentTypeDocumentAttribute],
            &[NSHTMLTextDocumentType.as_ref()],
        )
    };
    // SAFETY: The range covers the actual UTF-16 length, and the dictionary
    // contains the correctly typed HTML document-format attribute above.
    let html = unsafe { rich.dataFromRange_documentAttributes_error(range, &attributes) }
        .map_err(|_| "RTF 无法转换为 HTML；未导入".to_owned())?;
    if html.len() > MAX_FORMAT_BYTES {
        return Err("RTF 转换后的 HTML 超过 8 MiB 限制".into());
    }
    let content = Content {
        mark_html: None,
        text,
        html: Some(String::from_utf8(html.to_vec()).map_err(|_| "RTF 转换结果不是 UTF-8")?),
    };
    content.validate()?;
    Ok(content)
}

// Reject unsupported resource carriers before AppKit can ignore or decode them.
// Escaped backslashes/braces are text, not control words; binary RTF is unsupported.
fn reject_unsupported(bytes: &[u8]) -> Result<(), String> {
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] != b'\\' {
            at += 1;
            continue;
        }
        at += 1;
        let start = at;
        while at < bytes.len() && bytes[at].is_ascii_alphabetic() {
            at += 1;
        }
        if start == at {
            at = (at + 1).min(bytes.len());
            continue;
        }
        let word = &bytes[start..at];
        if [
            b"pict".as_slice(),
            b"object",
            b"objdata",
            b"filetbl",
            b"bin",
        ]
        .iter()
        .any(|unsupported| word.eq_ignore_ascii_case(unsupported))
        {
            return Err("RTF 包含尚未支持的图片、对象、文件或二进制数据；未导入".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn resource_control_words_are_distinct_from_escaped_text() {
        for source in [
            br"{\rtf1\b text}".as_slice(),
            br"{\rtf1 literal \\pict text}",
            br"{\rtf1\pictorial text}",
        ] {
            assert!(super::reject_unsupported(source).is_ok());
        }
        for source in [
            br"{\rtf1{\pict abc}}".as_slice(),
            br"{\rtf1\OBJECT data}",
            br"{\rtf1\objdata data}",
            br"{\rtf1\filetbl data}",
            br"{\rtf1\bin3 abc}",
        ] {
            assert!(super::reject_unsupported(source).is_err());
        }
    }
}
