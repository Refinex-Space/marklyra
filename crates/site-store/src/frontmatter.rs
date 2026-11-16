//! Minimal frontmatter split and render. Site files are written by the app, so the YAML block
//! is regenerated from the parsed mapping (unknown keys survive, comments do not); the Markdown
//! body below it is kept byte for byte.
use serde_yaml_ng::Mapping;

/// The YAML text between the `---` lines (if any) and everything after the closing line.
/// A leading BOM and CRLF line ends are accepted.
pub(crate) fn split(text: &str) -> (Option<&str>, &str) {
    let text = text.strip_prefix('\u{feff}').unwrap_or(text);
    let mut lines = text.split_inclusive('\n');
    let Some(first) = lines.next() else {
        return (None, text);
    };
    if first.trim_end_matches(['\r', '\n']) != "---" {
        return (None, text);
    }
    let start = first.len();
    let mut offset = start;
    for line in lines {
        if matches!(line.trim_end_matches(['\r', '\n']), "---" | "...") {
            return (Some(&text[start..offset]), &text[offset + line.len()..]);
        }
        offset += line.len();
    }
    (None, text)
}

pub(crate) fn mapping(text: &str) -> Result<Mapping, String> {
    let (front, _) = split(text);
    match front {
        None => Ok(Mapping::new()),
        Some(front) if front.trim().is_empty() => Ok(Mapping::new()),
        Some(front) => {
            serde_yaml_ng::from_str(front).map_err(|error| format!("frontmatter 无法解析：{error}"))
        }
    }
}

pub(crate) fn body(text: &str) -> &str {
    split(text).1
}

pub(crate) fn render(front: &Mapping, body: &str) -> String {
    let yaml = serde_yaml_ng::to_string(front).unwrap_or_default();
    format!("---\n{yaml}---\n{body}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_crlf_bom_and_keeps_body() {
        let text = "\u{feff}---\r\nurl: x\r\n---\r\n正文\r\n第二行";
        let (front, body) = split(text);
        assert_eq!(front, Some("url: x\r\n"));
        assert_eq!(body, "正文\r\n第二行");
        assert!(mapping(text).unwrap().contains_key("url"));
    }

    #[test]
    fn missing_or_unclosed_frontmatter_is_all_body() {
        assert_eq!(split("plain"), (None, "plain"));
        assert_eq!(split("---\na: 1\n"), (None, "---\na: 1\n"));
        assert!(mapping("plain").unwrap().is_empty());
    }

    #[test]
    fn broken_yaml_is_an_error() {
        assert!(mapping("---\na: [1\n---\n").is_err());
    }
}
