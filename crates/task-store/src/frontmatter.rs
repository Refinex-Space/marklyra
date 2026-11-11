//! YAML frontmatter split and minimal patching. Only the top-level keys being changed are
//! rewritten; every other byte (BOM, newline style, comments, unknown keys, order, body) stays.
use serde_json::Value;

const BOM: &str = "\u{feff}";

pub(crate) struct Parts {
    /// Byte length of the BOM prefix (0 or 3).
    pub bom: usize,
    /// Inner frontmatter text range, between the delimiter lines.
    pub front: Option<(usize, usize)>,
    /// Offset where the body starts.
    pub body: usize,
    pub crlf: bool,
}

fn line_end(text: &str, from: usize) -> (usize, usize) {
    match text[from..].find('\n') {
        Some(i) => (from + i, from + i + 1),
        None => (text.len(), text.len()),
    }
}
fn content(text: &str, start: usize, end: usize) -> &str {
    text[start..end]
        .strip_suffix('\r')
        .unwrap_or(&text[start..end])
}

pub(crate) fn split(text: &str) -> Parts {
    let bom = if text.starts_with(BOM) { BOM.len() } else { 0 };
    let crlf = text.contains("\r\n");
    let (first_end, mut cursor) = line_end(text, bom);
    if content(text, bom, first_end) != "---" || cursor == first_end {
        return Parts {
            bom,
            front: None,
            body: bom,
            crlf,
        };
    }
    let inner = cursor;
    while cursor < text.len() {
        let (end, next) = line_end(text, cursor);
        if matches!(content(text, cursor, end), "---" | "...") {
            return Parts {
                bom,
                front: Some((inner, cursor)),
                body: next,
                crlf,
            };
        }
        cursor = next;
    }
    Parts {
        bom,
        front: None,
        body: bom,
        crlf,
    }
}

pub(crate) fn front_text(text: &str) -> &str {
    split(text).front.map_or("", |(a, b)| &text[a..b])
}
pub(crate) fn body(text: &str) -> &str {
    &text[split(text).body..]
}

fn top_level_key(line: &str) -> Option<String> {
    let first = line.chars().next()?;
    if first.is_whitespace() || matches!(first, '#' | '-') {
        return None;
    }
    let colon = line.find(':')?;
    let key = line[..colon].trim();
    let key = key
        .strip_prefix('"')
        .and_then(|k| k.strip_suffix('"'))
        .or_else(|| key.strip_prefix('\'').and_then(|k| k.strip_suffix('\'')))
        .unwrap_or(key);
    (!key.is_empty()).then(|| key.to_owned())
}
fn continuation(line: &str) -> bool {
    line.starts_with([' ', '\t']) && !line.trim().is_empty()
        || line.starts_with("- ")
        || line == "-"
}

fn plain_ok(s: &str) -> bool {
    !s.is_empty()
        && s.trim() == s
        && !s.starts_with([
            '-', '?', ':', ',', '[', ']', '{', '}', '#', '&', '*', '!', '|', '>', '\'', '"', '%',
            '@', '`',
        ])
        && !s.contains([',', '[', ']', '{', '}', '\n', '\r', '\t'])
        && !s.contains(": ")
        && !s.contains(" #")
        && !s.ends_with(':')
        && !s.chars().any(char::is_control)
        && s.parse::<f64>().is_err()
        && !matches!(
            s.to_ascii_lowercase().as_str(),
            "true" | "false" | "null" | "~" | "yes" | "no" | "on" | "off" | "y" | "n"
        )
}
pub(crate) fn scalar(s: &str) -> String {
    if plain_ok(s) {
        s.to_owned()
    } else {
        serde_json::to_string(s).unwrap_or_else(|_| "\"\"".into())
    }
}
fn emit(value: &Value) -> String {
    match value {
        Value::String(s) => scalar(s),
        // Whole floats (manual order) read better as `3` than `3.0`.
        Value::Number(n) => match n.as_f64() {
            Some(f) if !n.is_i64() && !n.is_u64() && f.fract() == 0.0 && f.abs() < 1e15 => {
                format!("{}", f as i64)
            }
            _ => n.to_string(),
        },
        Value::Bool(b) => b.to_string(),
        Value::Array(items) => format!(
            "[{}]",
            items.iter().map(emit).collect::<Vec<_>>().join(", ")
        ),
        Value::Null => String::new(),
        Value::Object(_) => serde_json::to_string(value).unwrap_or_default(),
    }
}

/// Applies `changes` in order; `Value::Null` removes the key. Keys that do not exist yet are
/// appended at the end of the frontmatter. A file without frontmatter gains one.
pub(crate) fn patch(text: &str, changes: &[(String, Value)]) -> String {
    let parts = split(text);
    let nl = if parts.crlf { "\r\n" } else { "\n" };
    let line = |key: &str, value: &Value| format!("{key}: {}{nl}", emit(value));
    let Some((start, end)) = parts.front else {
        let mut out = String::with_capacity(text.len() + 128);
        out.push_str(&text[..parts.bom]);
        out.push_str("---");
        out.push_str(nl);
        for (key, value) in changes.iter().filter(|(_, v)| !v.is_null()) {
            out.push_str(&line(key, value));
        }
        out.push_str("---");
        out.push_str(nl);
        out.push_str(&text[parts.bom..]);
        return out;
    };
    // Split the inner block into lines that keep their own line endings.
    let inner = &text[start..end];
    let mut lines: Vec<&str> = Vec::new();
    let mut cursor = 0;
    while cursor < inner.len() {
        let (_, next) = line_end(inner, cursor);
        lines.push(&inner[cursor..next]);
        cursor = next;
    }
    let bare = |l: &str| l.trim_end_matches(['\n', '\r']).to_owned();
    // Top-level key spans: [first, last] line indexes.
    let mut spans: Vec<(String, usize, usize)> = Vec::new();
    for (i, l) in lines.iter().enumerate() {
        let b = bare(l);
        if let Some(key) = top_level_key(&b) {
            spans.push((key, i, i));
        } else if continuation(&b) {
            if let Some(last) = spans.last_mut() {
                if last.2 + 1 == i {
                    last.2 = i;
                }
            }
        }
    }
    let mut replaced: Vec<Option<String>> = vec![None; lines.len()];
    let mut removed = vec![false; lines.len()];
    let mut appended = String::new();
    for (key, value) in changes {
        match spans.iter().find(|(k, _, _)| k == key) {
            Some(&(_, a, b)) => {
                for flag in &mut removed[a..=b] {
                    *flag = true;
                }
                replaced[a] = (!value.is_null()).then(|| line(key, value));
            }
            None if !value.is_null() => appended.push_str(&line(key, value)),
            None => {}
        }
    }
    let mut out = String::with_capacity(text.len() + appended.len() + 64);
    out.push_str(&text[..start]);
    for (i, l) in lines.iter().enumerate() {
        if let Some(r) = &replaced[i] {
            // Keep the original line terminator when the replaced span was the last line
            // without one (cannot happen inside a closed block, but stay defensive).
            out.push_str(r);
        } else if !removed[i] {
            out.push_str(l);
        }
    }
    if !appended.is_empty() {
        if !out.ends_with('\n') && out.len() > start {
            out.push_str(nl);
        }
        out.push_str(&appended);
    }
    out.push_str(&text[end..]);
    out
}

/// Replaces the body, keeping the BOM and frontmatter bytes untouched.
pub(crate) fn with_body(text: &str, body: &str) -> String {
    let parts = split(text);
    let mut out = String::with_capacity(parts.body + body.len());
    out.push_str(&text[..parts.body]);
    out.push_str(body);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn set(pairs: &[(&str, Value)]) -> Vec<(String, Value)> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.clone()))
            .collect()
    }

    #[test]
    fn unchanged_keys_comments_and_body_keep_their_bytes() {
        let src = "\u{feff}---\r\ntitle: 旧标题\r\n# 用户注释\r\ncustom_field: keep me\r\nlabels:\r\n  - a\r\n  - b\r\nstatus: todo\r\n---\r\n正文 **保留**\r\n无结尾换行";
        let out = patch(
            src,
            &set(&[("status", json!("done")), ("labels", json!(["x", "y z"]))]),
        );
        assert_eq!(
            out,
            "\u{feff}---\r\ntitle: 旧标题\r\n# 用户注释\r\ncustom_field: keep me\r\nlabels: [x, y z]\r\nstatus: done\r\n---\r\n正文 **保留**\r\n无结尾换行"
        );
    }

    #[test]
    fn removal_append_and_creation() {
        let src = "---\nb: 1\ndue: 2026-01-01\n---\n";
        assert_eq!(
            patch(src, &set(&[("due", Value::Null), ("c", json!("x"))])),
            "---\nb: 1\nc: x\n---\n"
        );
        assert_eq!(
            patch("正文", &set(&[("title", json!("T"))])),
            "---\ntitle: T\n---\n正文"
        );
        assert_eq!(patch(src, &[]), src);
    }

    #[test]
    fn risky_scalars_are_quoted_and_parse_back() {
        for s in [
            "true",
            "123",
            "a: b",
            "- x",
            "#tag",
            "",
            " pad",
            "引号\"和\\",
            "多\n行",
        ] {
            let text = patch("---\n---\n", &set(&[("v", json!(s))]));
            let map: serde_yaml_ng::Mapping = serde_yaml_ng::from_str(front_text(&text)).unwrap();
            assert_eq!(map.get("v").and_then(|v| v.as_str()), Some(s), "{text}");
        }
        assert_eq!(scalar("2026-11-20"), "2026-11-20");
        assert_eq!(
            patch(
                "---\n---\n",
                &set(&[("order", json!(3.0)), ("half", json!(2.5))])
            ),
            "---\norder: 3\nhalf: 2.5\n---\n"
        );
        assert_eq!(scalar("2026-11-10T11:38:14Z"), "2026-11-10T11:38:14Z");
    }

    #[test]
    fn body_replacement_keeps_frontmatter_bytes() {
        let src = "---\r\nz: 1\r\na: 2\r\n---\r\nold";
        assert_eq!(
            with_body(src, "new\r\n"),
            "---\r\nz: 1\r\na: 2\r\n---\r\nnew\r\n"
        );
        assert_eq!(body(src), "old");
        assert_eq!(with_body("plain", "x"), "x");
    }
}
