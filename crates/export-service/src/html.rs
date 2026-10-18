use crate::{ExportError, MAX_HTML_BYTES};
use cssparser::{Parser, ParserInput, Token};
use dom_query::{Document, NodeRef};

pub const HTML_CSP: &str = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
pub const PREVIEW_CSP: &str = "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

pub struct PreparedHtml(String);
impl PreparedHtml {
    pub fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }
    pub fn len(&self) -> usize {
        self.0.len()
    }
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
    pub fn into_bytes(self) -> Vec<u8> {
        self.0.into_bytes()
    }
}

/// Parse and reserialize the export artifact, never the source Markdown.
/// Unsupported resources are rejected instead of silently removed.
pub fn prepare_html(html: &str) -> Result<PreparedHtml, ExportError> {
    if html.len() > MAX_HTML_BYTES {
        return Err(ExportError::TooLarge);
    }
    if html.trim().is_empty() || html.contains('\0') {
        return Err(ExportError::InvalidText);
    }
    if html
        .bytes()
        .filter(|byte| *byte == b'<')
        .take(100_001)
        .count()
        > 100_000
    {
        return Err(ExportError::Complexity);
    }
    let document = Document::from(html);
    let mut pending = vec![(document.root(), 0usize)];
    let mut count = 0usize;
    while let Some((node, depth)) = pending.pop() {
        count += 1;
        if count > 100_000 || depth > 256 {
            return Err(ExportError::Complexity);
        }
        check_node(node)?;
        pending.extend(node.children_it(false).map(|child| (child, depth + 1)));
    }
    document.select("meta[charset],meta[http-equiv]").remove();
    document.select("head").prepend_html(format!("<meta charset=\"utf-8\"><meta http-equiv=\"Content-Security-Policy\" content=\"{HTML_CSP}\"><meta name=\"referrer\" content=\"no-referrer\">"));
    let output = document.html().to_string();
    if output.len() > MAX_HTML_BYTES {
        return Err(ExportError::TooLarge);
    }
    Ok(PreparedHtml(output))
}

fn check_node(node: NodeRef<'_>) -> Result<(), ExportError> {
    let Some((name, namespace)) = node
        .query(|node| {
            node.as_element().map(|element| {
                (
                    element.name.local.as_ref().to_ascii_lowercase(),
                    element.name.ns.to_string(),
                )
            })
        })
        .flatten()
    else {
        return Ok(());
    };
    if !matches!(
        namespace.as_str(),
        "http://www.w3.org/1999/xhtml"
            | "http://www.w3.org/2000/svg"
            | "http://www.w3.org/1998/Math/MathML"
    ) || matches!(
        name.as_str(),
        "script"
            | "iframe"
            | "frame"
            | "frameset"
            | "object"
            | "embed"
            | "applet"
            | "base"
            | "link"
            | "form"
            | "template"
            | "noscript"
            | "audio"
            | "video"
            | "source"
            | "track"
            | "animate"
            | "animatetransform"
            | "animatemotion"
            | "set"
    ) {
        return Err(ExportError::ActiveContent(name));
    }
    if name == "style" {
        check_css(&node.text())?;
    }
    if node.attr("contenteditable").is_some() {
        node.set_attr("contenteditable", "false");
    }
    if name == "input" {
        if !node
            .attr("type")
            .is_some_and(|value| value.eq_ignore_ascii_case("checkbox"))
        {
            return Err(ExportError::ActiveContent("input".to_owned()));
        }
        node.set_attr("disabled", "");
    }
    if name == "textarea" {
        node.set_attr("readonly", "");
    }
    if matches!(name.as_str(), "button" | "select") {
        node.set_attr("disabled", "");
    }
    for attribute in node.attrs() {
        let key = attribute.name.local.as_ref().to_ascii_lowercase();
        let value = attribute.value.trim();
        if name == "meta"
            && key == "http-equiv"
            && value.eq_ignore_ascii_case("content-security-policy")
        {
            continue;
        }
        if key.starts_with("on")
            || matches!(
                key.as_str(),
                "srcdoc"
                    | "action"
                    | "formaction"
                    | "ping"
                    | "srcset"
                    | "background"
                    | "manifest"
                    | "codebase"
                    | "classid"
                    | "profile"
                    | "http-equiv"
                    | "autofocus"
            )
        {
            return Err(ExportError::ActiveContent(format!("{name}.{key}")));
        }
        match key.as_str() {
            "src" | "poster"
                if !matches!(name.as_str(), "img" | "image" | "feimage")
                    || !data_resource(value, false) =>
            {
                return Err(ExportError::ExternalResource(format!("{name}.{key}")))
            }
            "href" => {
                let allowed = value.starts_with('#')
                    || matches!(name.as_str(), "image" | "feimage") && data_resource(value, false)
                    || name == "a" && hyperlink(value);
                if !allowed {
                    return Err(ExportError::ExternalResource(format!("{name}.{key}")));
                }
            }
            "style" | "fill" | "stroke" | "filter" | "clip-path" | "mask" | "marker-start"
            | "marker-end" | "marker-mid" | "cursor" => check_css(value)?,
            _ => {}
        }
    }
    Ok(())
}
fn hyperlink(value: &str) -> bool {
    !value.chars().any(char::is_control)
        && ["https://", "http://", "mailto:"]
            .iter()
            .any(|prefix| value.to_ascii_lowercase().starts_with(prefix))
}
fn data_resource(value: &str, font: bool) -> bool {
    let Some((metadata, body)) = value.split_once(',') else {
        return false;
    };
    let metadata = metadata.to_ascii_lowercase();
    let Some(mime) = metadata.strip_prefix("data:") else {
        return false;
    };
    let mime = mime.split(';').next().unwrap_or_default();
    let allowed = matches!(
        mime,
        "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/svg+xml"
    ) || font
        && matches!(
            mime,
            "font/woff"
                | "font/woff2"
                | "font/ttf"
                | "font/otf"
                | "application/font-woff"
                | "application/x-font-ttf"
                | "application/x-font-opentype"
        );
    allowed && !body.is_empty() && !metadata.contains(['\r', '\n', '\0'])
}
fn css_url(value: &str) -> bool {
    value.starts_with('#') || data_resource(value, true)
}
fn check_css(css: &str) -> Result<(), ExportError> {
    let mut input = ParserInput::new(css);
    let mut parser = Parser::new(&mut input);
    scan_css(&mut parser, 0).map_err(|_| ExportError::InvalidCss)
}
fn scan_css<'i>(
    parser: &mut Parser<'i, '_>,
    depth: usize,
) -> Result<(), cssparser::ParseError<'i, ()>> {
    if depth > 64 {
        return Err(parser.new_custom_error(()));
    }
    while !parser.is_exhausted() {
        let token = parser.next_including_whitespace_and_comments()?.clone();
        match token {
            Token::BadUrl(_) | Token::BadString(_) => return Err(parser.new_custom_error(())),
            Token::AtKeyword(name)
                if name.eq_ignore_ascii_case("import")
                    || name.eq_ignore_ascii_case("namespace") =>
            {
                return Err(parser.new_custom_error(()))
            }
            Token::UnquotedUrl(value) if !css_url(&value) => {
                return Err(parser.new_custom_error(()))
            }
            Token::Function(name) if name.eq_ignore_ascii_case("url") => {
                parser.parse_nested_block(|inner| {
                    let value = inner.expect_string()?.clone();
                    if !css_url(&value) {
                        return Err(inner.new_custom_error(()));
                    }
                    inner.expect_exhausted()?;
                    Ok(())
                })?;
            }
            Token::Function(name) => {
                if matches!(
                    name.to_ascii_lowercase().as_str(),
                    "image-set"
                        | "-webkit-image-set"
                        | "image"
                        | "src"
                        | "expression"
                        | "paint"
                        | "local"
                ) {
                    return Err(parser.new_custom_error(()));
                }
                parser.parse_nested_block(|inner| scan_css(inner, depth + 1))?;
            }
            Token::ParenthesisBlock | Token::CurlyBracketBlock | Token::SquareBracketBlock => {
                parser.parse_nested_block(|inner| scan_css(inner, depth + 1))?;
            }
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rich_static_html_is_preserved_and_policy_precedes_content() {
        let html = prepare_html("<!doctype html><html><head><style>@media print{a{color:red}} svg{fill:url(#x)} @font-face{font-family:Test;src:url(data:font/woff2;base64,AAAA)}</style></head><body><h1 id='中'>中文 😀</h1><a href='#中'>TOC</a><a href='https://example.test'>link</a><table><tr><td>A</td></tr></table><svg><defs><path id='x' d='M0 0'/></defs><use href='#x'/><foreignObject><div>label</div></foreignObject></svg><img src='data:image/png;base64,AAAA'></body></html>").unwrap();
        let output = std::str::from_utf8(html.as_bytes()).unwrap();
        assert!(output.find("Content-Security-Policy").unwrap() < output.find("<style>").unwrap());
        assert!(
            output.contains("中文 😀")
                && output.contains("<foreignObject>")
                && output.contains("href=\"#x\"")
        );
        assert!(output.contains("charset=\"utf-8\""));
    }
    #[test]
    fn scripts_active_content_and_nonportable_urls_are_rejected() {
        for input in [
            "<script>1</script>",
            "<p onclick='1'>x</p>",
            "<img src='https://x.test/a.png'>",
            "<img src='marklyra://localhost/__images/id'>",
            "<img src='blob:test'>",
            "<img src='file:///a.png'>",
            "<img srcset='a.png 2x'>",
            "<iframe srcdoc='x'></iframe>",
            "<meta http-equiv=refresh content='0;url=https://x.test'>",
            "<link rel=stylesheet href='a.css'>",
            "<base href='file:///'>",
            "<a href='javascript:1'>x</a>",
            "<svg><use href='x.svg#x'/></svg>",
            "<svg><animate attributeName='href'/></svg>",
            "<template><script>1</script></template>",
            "<img src='data:text/html,script'>",
        ] {
            assert!(prepare_html(input).is_err(), "{input}");
        }
    }
    #[test]
    fn css_tokenization_catches_escaped_urls_and_nested_resource_functions() {
        for css in [
            r"a{background:u\72l(https://x.test/p)}",
            r"@im\70ort 'https://x.test/x.css';",
            "a{background:URL('file:///x')}",
            "a{background:image-set('https://x.test/a' 1x)}",
            "@font-face{src:local(Font)}",
            "@media print{a{background:url(../a.png)}}",
        ] {
            assert!(
                prepare_html(&format!("<style>{css}</style><p>test</p>")).is_err(),
                "{css}"
            );
        }
        assert!(prepare_html("<p style='background:u&#114;l(https://x.test)'>x</p>").is_err());
    }
    #[test]
    fn text_size_structure_and_css_nesting_are_bounded() {
        assert!(matches!(prepare_html("\0"), Err(ExportError::InvalidText)));
        assert!(matches!(
            prepare_html(&"x".repeat(MAX_HTML_BYTES + 1)),
            Err(ExportError::TooLarge)
        ));
        assert!(matches!(
            prepare_html(&"<div>".repeat(258)),
            Err(ExportError::Complexity)
        ));
        assert!(check_css(&format!("{}x{}", "f(".repeat(66), ")".repeat(66))).is_err());
    }
    #[test]
    fn input_policy_is_read_only_and_existing_csp_is_replaced() {
        let html = prepare_html("<meta http-equiv='Content-Security-Policy' content=\"default-src *\"><p contenteditable>text</p><input type=checkbox checked><textarea>code</textarea>").unwrap();
        let output = std::str::from_utf8(html.as_bytes()).unwrap();
        assert!(!output.contains("default-src *"));
        assert_eq!(output.matches("Content-Security-Policy").count(), 1);
        assert!(
            output.contains("contenteditable=\"false\"")
                && output.contains("disabled=\"\"")
                && output.contains("readonly=\"\"")
        );
        assert!(prepare_html("<input type=file>").is_err());
    }
}
