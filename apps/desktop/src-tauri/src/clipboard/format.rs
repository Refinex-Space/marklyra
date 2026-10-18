//! CF_HTML offsets are UTF-8 byte offsets. Shared pure checks also run on macOS.
#[cfg(any(windows, test))]
use super::MAX_FORMAT_BYTES;

#[cfg(any(windows, test))]
pub(super) fn encode_markup(value: &str) -> Result<Vec<u8>, String> {
    if value.len() > MAX_FORMAT_BYTES || value.contains('\0') {
        return Err("无效或过大的 Markdown HTML".into());
    }
    let mut bytes = value.as_bytes().to_vec();
    bytes.push(0);
    Ok(bytes)
}
#[cfg(any(windows, test))]
pub(super) fn decode_markup(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_FORMAT_BYTES + 64 * 1024 {
        return Err("Markdown HTML 剪贴板超过大小限制".into());
    }
    // HGLOBAL allocations may contain zero padding beyond the terminator.
    let end = bytes
        .iter()
        .position(|byte| *byte == 0)
        .unwrap_or(bytes.len());
    if end > MAX_FORMAT_BYTES || bytes[end..].iter().any(|byte| *byte != 0) {
        return Err("无效的 Markdown HTML 剪贴板边界".into());
    }
    String::from_utf8(bytes[..end].to_vec()).map_err(|_| "Markdown HTML 剪贴板不是 UTF-8".into())
}

#[cfg(any(windows, test))]
pub(super) fn encode_html(fragment: &str) -> Result<Vec<u8>, String> {
    if fragment.len() > MAX_FORMAT_BYTES || fragment.contains('\0') {
        return Err("无效或过大的 HTML 剪贴板内容".to_owned());
    }
    let prefix = "<html><head><meta charset=\"utf-8\"></head><body><!--StartFragment-->";
    let suffix = "<!--EndFragment--></body></html>";
    let header = |start, end, from, to| {
        format!("Version:1.0\r\nStartHTML:{start:010}\r\nEndHTML:{end:010}\r\nStartFragment:{from:010}\r\nEndFragment:{to:010}\r\n")
    };
    let start = header(0, 0, 0, 0).len();
    let from = start + prefix.len();
    let to = from + fragment.len();
    let end = to + suffix.len();
    Ok(format!(
        "{}{prefix}{fragment}{suffix}\0",
        header(start, end, from, to)
    )
    .into_bytes())
}
#[cfg(any(windows, test))]
pub(super) fn decode_html(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > MAX_FORMAT_BYTES + 64 * 1024 {
        return Err("剪贴板 HTML 格式超过大小限制".to_owned());
    }
    let bytes = bytes.strip_suffix(&[0]).unwrap_or(bytes);
    let text = std::str::from_utf8(bytes).map_err(|_| "剪贴板 HTML 不是有效 UTF-8")?;
    let mut fields = std::collections::HashMap::new();
    let mut header_end = 0usize;
    let mut boundary = bytes.len();
    for part in text.split_inclusive('\n') {
        if header_end >= boundary {
            break;
        }
        let Some((name, value)) = part.trim_end_matches(['\r', '\n']).split_once(':') else {
            break;
        };
        if ![
            "Version",
            "StartHTML",
            "EndHTML",
            "StartFragment",
            "EndFragment",
            "StartSelection",
            "EndSelection",
            "SourceURL",
        ]
        .contains(&name)
        {
            break;
        }
        header_end += part.len();
        if header_end > 4096 {
            return Err("HTML 剪贴板 header 过长".to_owned());
        }
        if fields.insert(name, value).is_some() {
            return Err("重复的 HTML 剪贴板 header".to_owned());
        }
        if matches!(name, "StartHTML" | "StartFragment") {
            if let Ok(offset) = value.trim().parse::<usize>() {
                boundary = boundary.min(offset);
            }
        }
    }
    if !matches!(
        fields.get("Version").map(|value| value.trim()),
        Some("0.9" | "1.0")
    ) {
        return Err("HTML 剪贴板版本无效".to_owned());
    }
    let field = |name: &str| -> Result<Option<i64>, String> {
        fields
            .get(name)
            .map(|value| {
                value
                    .trim()
                    .parse()
                    .map_err(|_| "无效的 HTML 剪贴板偏移量".to_owned())
            })
            .transpose()
    };
    let start = field("StartHTML")?.ok_or("缺少 HTML 剪贴板 header")?;
    let end = field("EndHTML")?.ok_or("缺少 HTML 剪贴板 header")?;
    let fragment = (field("StartFragment")?, field("EndFragment")?);
    let (from, to) = match fragment {
        (Some(-1), Some(-1)) | (None, None) => (start, end),
        (Some(a), Some(b)) if a >= 0 && b >= 0 => (a, b),
        _ => return Err("无效的 HTML 剪贴板 fragment".to_owned()),
    };
    let context_valid = if start == -1 && end == -1 {
        true
    } else {
        start >= header_end as i64
            && end >= start
            && end as usize <= bytes.len()
            && from >= start
            && to <= end
    };
    if !context_valid || from < header_end as i64 || to < from || to as usize > bytes.len() {
        return Err("HTML 剪贴板偏移越界".to_owned());
    }
    let fragment = text
        .get(from as usize..to as usize)
        .ok_or("HTML 剪贴板偏移不是字符边界")?;
    if fragment.len() > MAX_FORMAT_BYTES || fragment.contains('\0') {
        return Err("无效或过大的 HTML 剪贴板片段".to_owned());
    }
    Ok(fragment.to_owned())
}
#[cfg(any(windows, test))]
pub(super) fn decode_utf16(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() > (MAX_FORMAT_BYTES + 1) * 2 || !bytes.len().is_multiple_of(2) {
        return Err("剪贴板 Unicode 文本长度无效".to_owned());
    }
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .take_while(|value| *value != 0)
        .collect();
    let text = String::from_utf16(&units).map_err(|_| "剪贴板 Unicode 文本含有非法代理项")?;
    if text.len() > MAX_FORMAT_BYTES {
        return Err("剪贴板文本超过大小限制".to_owned());
    }
    Ok(text)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn markup_utf8_roundtrip_accepts_only_zero_allocation_padding() {
        for text in ["", "<u>中文😀</u>", "<p mdtype=\"paragraph\">==Keep==</p>"] {
            let mut encoded = encode_markup(text).unwrap();
            encoded.extend([0; 16]);
            assert_eq!(decode_markup(&encoded).unwrap(), text);
        }
        assert!(decode_markup(b"ok\0hidden").is_err());
        assert!(decode_markup(&[0xff, 0]).is_err());
        assert!(encode_markup("a\0b").is_err());
        assert!(decode_markup(&vec![b'a'; MAX_FORMAT_BYTES + 1]).is_err());
    }
    #[test]
    fn cf_html_roundtrips_utf8_bytes_and_empty_fragment() {
        for fragment in [
            "<b>中文😀</b>",
            "",
            "<pre>a\r\n b</pre>",
            "<p title='a:b'>é</p>",
        ] {
            assert_eq!(
                decode_html(&encode_html(fragment).unwrap()).unwrap(),
                fragment
            );
        }
    }
    #[test]
    fn accepts_fragment_only_context_and_preserves_header_shaped_plain_content() {
        let fragment = "StartHTML:这是正文\n中文😀";
        let header = |from, to| {
            format!("Version:1.0\r\nStartHTML:-1\r\nEndHTML:-1\r\nStartFragment:{from:010}\r\nEndFragment:{to:010}\r\n")
        };
        let from = header(0, 0).len();
        let data = format!("{}{fragment}\0", header(from, from + fragment.len()));
        assert_eq!(decode_html(data.as_bytes()).unwrap(), fragment);
    }
    #[test]
    fn rejects_offsets_into_header_and_inside_utf8_codepoints() {
        let fragment = "中文";
        let header = |from, to| {
            format!("Version:1.0\r\nStartHTML:-1\r\nEndHTML:-1\r\nStartFragment:{from:010}\r\nEndFragment:{to:010}\r\n")
        };
        let from = header(0, 0).len();
        assert!(decode_html(format!("{}{fragment}", header(0, 3)).as_bytes()).is_err());
        assert!(decode_html(
            format!("{}{fragment}", header(from + 1, from + fragment.len())).as_bytes()
        )
        .is_err());
    }
    #[test]
    fn cf_html_rejects_malformed_offsets_duplicate_fields_and_unbounded_input() {
        let data = encode_html("<b>中</b>").unwrap();
        for bad in [
            b"<b>no header</b>".to_vec(),
            b"StartHTML:0\r\nEndHTML:9999999999\r\n<body>".to_vec(),
            b"StartHTML:0\r\nStartHTML:1\r\nEndHTML:4\r\n<x>".to_vec(),
            vec![b'x'; MAX_FORMAT_BYTES + 65537],
        ] {
            assert!(decode_html(&bad).is_err());
        }
        for cut in 0..data.len() - 1 {
            assert!(decode_html(&data[..cut]).is_err(), "truncation {cut}");
        }
    }
    #[test]
    fn utf16_retains_unicode_and_rejects_odd_bytes_or_broken_surrogates() {
        let bytes: Vec<u8> = "中文😀"
            .encode_utf16()
            .chain([0])
            .flat_map(u16::to_le_bytes)
            .collect();
        assert_eq!(decode_utf16(&bytes).unwrap(), "中文😀");
        assert!(decode_utf16(&[1]).is_err());
        assert!(decode_utf16(&[0x00, 0xd8, 0, 0]).is_err());
    }
}
