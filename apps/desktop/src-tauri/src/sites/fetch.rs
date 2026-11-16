//! Page and icon fetch. HTML is never rendered: titles and descriptions are plain text, and
//! icons are decoded and re-encoded (or, for SVG, stripped of scripts) before they touch disk.
use encoding_rs::Encoding;
use image::{codecs::png::PngEncoder, imageops, ExtendedColorType, ImageEncoder, Rgba, RgbaImage};
use sha2::{Digest, Sha256};
use std::{io::Read, time::Duration};
use url::Url;

const PAGE_LIMIT: usize = 256 * 1024;
const ICON_LIMIT: usize = 256 * 1024;
const MANIFEST_LIMIT: usize = 64 * 1024;
const ICON_EDGE: u32 = 128;
const ICON_BYTES: usize = 32 * 1024;
pub(crate) const USER_AGENT: &str =
    concat!("MarkLyra/", env!("CARGO_PKG_VERSION"), " (site preview)");

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ThirdParty {
    Off,
    DuckDuckGo,
    Google,
}
impl ThirdParty {
    pub(crate) fn parse(value: Option<&str>) -> Self {
        match value.unwrap_or("off") {
            "duckduckgo" => Self::DuckDuckGo,
            "google" => Self::Google,
            _ => Self::Off,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub(crate) struct Conditional {
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct IconBlob {
    pub ext: &'static str,
    pub mime: &'static str,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug)]
pub(crate) struct Outcome {
    pub not_modified: bool,
    pub final_url: String,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub icon: Option<IconBlob>,
}

#[derive(Debug)]
pub(crate) enum FetchError {
    Address,
    Network,
    Status,
    Redirect,
    Empty,
}
impl FetchError {
    pub(crate) fn message(&self) -> &'static str {
        match self {
            Self::Address => "网址格式不正确",
            Self::Network => "未能连接网站",
            Self::Status => "网站没有返回页面",
            Self::Redirect => "网站跳转到了不支持的地址",
            Self::Empty => "未能获取网站信息",
        }
    }
}

/// First 16 hex characters of the normalized host, so one domain shares one icon file.
pub(crate) fn icon_stem(url: &str) -> Option<String> {
    let url = site_store::normalize_url(url).ok()?;
    let parsed = Url::parse(&url).ok()?;
    let host = parsed.host_str()?.trim_start_matches("www.");
    if host.is_empty() {
        return None;
    }
    let key = match parsed.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_owned(),
    };
    let digest = Sha256::digest(key.as_bytes());
    Some(
        digest
            .iter()
            .take(8)
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    )
}

fn build(proxy: Option<String>) -> Result<reqwest::blocking::Client, FetchError> {
    let mut builder = reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(USER_AGENT)
        .tcp_nodelay(true);
    builder = match proxy {
        Some(proxy) => builder.proxy(reqwest::Proxy::all(proxy).map_err(|_| FetchError::Network)?),
        None => builder.no_proxy(),
    };
    builder.build().map_err(|_| FetchError::Network)
}

/// The ways to reach a site, in order: through this machine's proxy (environment or system
/// setting) when one is configured, then directly. Sites abroad often answer only through the
/// proxy; a proxy that is switched off or stale must not make every other site fail.
fn routes() -> Vec<reqwest::blocking::Client> {
    let mut routes = Vec::new();
    if let Some(proxy) = crate::agents::network::proxy() {
        if let Ok(client) = build(Some(proxy)) {
            routes.push(client);
        }
    }
    if let Ok(client) = build(None) {
        routes.push(client);
    }
    routes
}

/// [`retrieve`] over each route until one connects. Only connection failures move on to the
/// next route; an answer such as 404 is the site's answer either way.
pub(crate) fn retrieve_any(
    url: &str,
    conditional: Option<&Conditional>,
    third_party: ThirdParty,
) -> Result<Outcome, FetchError> {
    retrieve_over(&routes(), url, conditional, third_party)
}

fn retrieve_over(
    routes: &[reqwest::blocking::Client],
    url: &str,
    conditional: Option<&Conditional>,
    third_party: ThirdParty,
) -> Result<Outcome, FetchError> {
    let mut last = Err(FetchError::Network);
    for client in routes {
        match retrieve(client, url, conditional, third_party) {
            Err(FetchError::Network) => last = Err(FetchError::Network),
            other => return other,
        }
    }
    last
}

pub(crate) fn retrieve(
    client: &reqwest::blocking::Client,
    url: &str,
    conditional: Option<&Conditional>,
    third_party: ThirdParty,
) -> Result<Outcome, FetchError> {
    let start = site_store::normalize_url(url).map_err(|_| FetchError::Address)?;
    let page = exchange(
        client,
        &start,
        conditional,
        "text/html,application/xhtml+xml",
        PAGE_LIMIT,
        true,
    )?;
    if page.not_modified {
        return Ok(Outcome {
            not_modified: true,
            final_url: page.final_url,
            etag: page.etag,
            last_modified: page.last_modified,
            title: None,
            description: None,
            icon: None,
        });
    }
    if !(200..300).contains(&page.status) {
        return Err(FetchError::Status);
    }
    let content_type = page.content_type.clone().unwrap_or_default();
    if content_type.starts_with("image/") {
        let icon =
            normalize_icon(&page.body, Some(content_type.as_str())).ok_or(FetchError::Empty)?;
        return Ok(page.outcome(None, None, Some(icon)));
    }
    let html = decode_html(&page.body, page.content_type.as_deref());
    let meta = parse_head(&html, &page.final_url);
    let mut icon = None;
    for candidate in &meta.icons {
        if let Some(blob) = fetch_icon(client, candidate) {
            icon = Some(blob);
            break;
        }
    }
    if icon.is_none() {
        if let Some(fallback) = third_party_icon(client, &page.final_url, third_party) {
            icon = Some(fallback);
        }
    }
    if meta.title.is_none() && meta.description.is_none() && icon.is_none() {
        return Err(FetchError::Empty);
    }
    Ok(page.outcome(meta.title, meta.description, icon))
}

struct RawPage {
    status: u16,
    final_url: String,
    content_type: Option<String>,
    etag: Option<String>,
    last_modified: Option<String>,
    body: Vec<u8>,
    not_modified: bool,
}
impl RawPage {
    fn outcome(
        self,
        title: Option<String>,
        description: Option<String>,
        icon: Option<IconBlob>,
    ) -> Outcome {
        Outcome {
            not_modified: self.not_modified,
            final_url: self.final_url,
            etag: self.etag,
            last_modified: self.last_modified,
            title,
            description,
            icon,
        }
    }
}

fn exchange(
    client: &reqwest::blocking::Client,
    start: &str,
    conditional: Option<&Conditional>,
    accept: &str,
    limit: usize,
    stop_at_head: bool,
) -> Result<RawPage, FetchError> {
    let mut current = start.to_owned();
    for _ in 0..6 {
        let mut request = client
            .get(&current)
            .header(reqwest::header::ACCEPT, accept)
            .header(reqwest::header::ACCEPT_LANGUAGE, accept_language());
        if let Some(conditional) = conditional {
            if let Some(etag) = &conditional.etag {
                request = request.header(reqwest::header::IF_NONE_MATCH, etag);
            }
            if let Some(modified) = &conditional.last_modified {
                request = request.header(reqwest::header::IF_MODIFIED_SINCE, modified);
            }
        }
        let response = request.send().map_err(|_| FetchError::Network)?;
        let status = response.status().as_u16();
        if matches!(status, 301 | 302 | 303 | 307 | 308) {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or(FetchError::Redirect)?;
            current = resolve_redirect(&current, location)?;
            continue;
        }
        let headers = response.headers().clone();
        let content_type = headers
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let etag = header_text(&headers, reqwest::header::ETAG);
        let last_modified = header_text(&headers, reqwest::header::LAST_MODIFIED);
        if status == 304 {
            return Ok(RawPage {
                status,
                final_url: current,
                content_type,
                etag,
                last_modified,
                body: Vec::new(),
                not_modified: true,
            });
        }
        let body = read_limited(response, limit, stop_at_head).map_err(|_| FetchError::Network)?;
        return Ok(RawPage {
            status,
            final_url: current,
            content_type,
            etag,
            last_modified,
            body,
            not_modified: false,
        });
    }
    Err(FetchError::Redirect)
}

fn header_text(
    headers: &reqwest::header::HeaderMap,
    name: reqwest::header::HeaderName,
) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

fn resolve_redirect(current: &str, location: &str) -> Result<String, FetchError> {
    let next = Url::parse(current)
        .ok()
        .and_then(|base| base.join(location).ok())
        .ok_or(FetchError::Redirect)?;
    if !matches!(next.scheme(), "http" | "https")
        || !next.username().is_empty()
        || next.password().is_some()
    {
        return Err(FetchError::Redirect);
    }
    Ok(next.to_string())
}

/// Stops at `limit` bytes, and for HTML also at the end of `<head>`, so a huge page cannot
/// pin a worker. The unread tail is dropped with the response.
pub(crate) fn read_limited(
    mut response: impl Read,
    limit: usize,
    stop_at_head: bool,
) -> std::io::Result<Vec<u8>> {
    let mut body = Vec::new();
    let mut chunk = [0u8; 8192];
    while body.len() < limit {
        let read = response.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        let room = limit - body.len();
        let take = read.min(room);
        body.extend_from_slice(&chunk[..take]);
        if stop_at_head {
            if let Some(end) = head_end(&body) {
                body.truncate(end);
                break;
            }
        }
        if take < read {
            break;
        }
    }
    Ok(body)
}

fn head_end(body: &[u8]) -> Option<usize> {
    body.windows(7)
        .position(|window| window.eq_ignore_ascii_case(b"</head>"))
        .map(|at| at + 7)
}

pub(crate) fn accept_language() -> String {
    for key in ["LC_ALL", "LC_MESSAGES", "LANG"] {
        if let Some(tag) = std::env::var(key).ok().and_then(|value| locale_tag(&value)) {
            return tag;
        }
    }
    #[cfg(windows)]
    if let Some(tag) = windows_locale() {
        return tag;
    }
    "*".into()
}

fn locale_tag(value: &str) -> Option<String> {
    let token = value.split('.').next().unwrap_or("").trim();
    if token.is_empty() || token == "C" || token == "POSIX" {
        return None;
    }
    Some(token.replace('_', "-"))
}

#[cfg(windows)]
fn windows_locale() -> Option<String> {
    let mut buffer = [0u16; 85];
    // SAFETY: the buffer is writable and large enough for a locale name (LOCALE_NAME_MAX_LENGTH).
    let length = unsafe { windows::Win32::Globalization::GetUserDefaultLocaleName(&mut buffer) };
    if length <= 1 {
        return None;
    }
    let text = String::from_utf16_lossy(&buffer[..(length as usize - 1)]);
    locale_tag(&text)
}

pub(crate) fn decode_html(bytes: &[u8], content_type: Option<&str>) -> String {
    let label = charset_from_type(content_type)
        .or_else(|| charset_from_meta(bytes))
        .unwrap_or_else(|| "utf-8".to_owned());
    let encoding = Encoding::for_label(label.as_bytes()).unwrap_or(encoding_rs::UTF_8);
    let (text, _, _) = encoding.decode(bytes);
    text.into_owned()
}

fn charset_from_type(content_type: Option<&str>) -> Option<String> {
    let value = content_type?;
    for part in value.split(';').skip(1) {
        let mut pair = part.splitn(2, '=');
        if pair
            .next()
            .unwrap_or("")
            .trim()
            .eq_ignore_ascii_case("charset")
        {
            let charset = pair.next().unwrap_or("").trim().trim_matches('"').trim();
            if !charset.is_empty() {
                return Some(charset.to_owned());
            }
        }
    }
    None
}

fn charset_from_meta(bytes: &[u8]) -> Option<String> {
    let head = &bytes[..bytes.len().min(2048)];
    let lower = String::from_utf8_lossy(head).to_ascii_lowercase();
    if let Some(at) = lower.find("charset=") {
        let rest = lower[at + "charset=".len()..].trim_start_matches([' ', '"', '\'']);
        let token: String = rest
            .chars()
            .take_while(|ch| ch.is_ascii_alphanumeric() || *ch == '-' || *ch == '_')
            .collect();
        if !token.is_empty() {
            return Some(token);
        }
    }
    None
}

struct Head {
    title: Option<String>,
    description: Option<String>,
    icons: Vec<IconRef>,
}

struct IconRef {
    url: String,
    hint: IconHint,
    size: Option<u32>,
}

#[derive(Clone, Copy)]
enum IconHint {
    /// Safari's pinned-tab silhouette: one colour meant to be tinted, so a last resort.
    Mask,
    Png,
    Webp,
    Svg,
    Apple,
    Ico,
    Other,
}

fn parse_head(html: &str, base_url: &str) -> Head {
    let document = dom_query::Document::from(html);
    let base = document
        .select("base[href]")
        .attr("href")
        .and_then(|href| {
            Url::parse(base_url)
                .ok()
                .and_then(|base| base.join(href.trim()).ok())
        })
        .and_then(|url| site_store::normalize_url(url.as_str()).ok())
        .unwrap_or_else(|| base_url.to_owned());
    let meta = |selector: &str| {
        document
            .select(selector)
            .attr("content")
            .map(|value| value.to_string())
            .filter(|value| !value.trim().is_empty())
    };
    let og_title = meta("meta[property='og:title']");
    let twitter_title = meta("meta[name='twitter:title']");
    let document_title = document.select("title").text().to_string();
    let document_title = (!document_title.trim().is_empty()).then_some(document_title);
    let site_name = meta("meta[property='og:site_name']");
    let title = choose_title(og_title, twitter_title, document_title, site_name);
    let description = meta("meta[property='og:description']")
        .or_else(|| meta("meta[name='description']"))
        .or_else(|| meta("meta[name='twitter:description']"));
    let mut icons = Vec::new();
    for node in document.select("link").iter() {
        let rel = node
            .attr("rel")
            .map(|value| value.to_string())
            .unwrap_or_default();
        let rel = rel.to_ascii_lowercase();
        let href = node
            .attr("href")
            .map(|value| value.to_string())
            .unwrap_or_default();
        if href.trim().is_empty() {
            continue;
        }
        let kind = node
            .attr("type")
            .map(|value| value.to_string())
            .unwrap_or_default();
        let size = node.attr("sizes").and_then(|value| parse_size(&value));
        let hint = if rel.split_whitespace().any(|token| token == "mask-icon") {
            if !href_looks_svg(&href, &kind) {
                continue;
            }
            IconHint::Mask
        } else if rel
            .split_whitespace()
            .any(|token| token.starts_with("apple-touch-icon"))
        {
            IconHint::Apple
        } else if rel
            .split_whitespace()
            .any(|token| token == "icon" || token == "shortcut")
        {
            hint_of(&href, &kind)
        } else if rel.split_whitespace().any(|token| token == "manifest") {
            if let Some(url) = absolute(&base, &href) {
                icons.extend(manifest_icons_later(url));
            }
            continue;
        } else {
            continue;
        };
        if let Some(url) = absolute(&base, &href) {
            icons.push(IconRef { url, hint, size });
        }
    }
    // Manifests were stored as placeholder urls prefixed so they sort after link icons
    // and are expanded when fetched. See `manifest_icons_later`.
    let mut seen = std::collections::HashSet::new();
    icons.retain(|icon| seen.insert(icon.url.clone()));
    icons.sort_by_key(|icon| rank(icon.hint, icon.size));
    // Files many sites serve without linking them (some add their links from script, which a
    // plain fetch never runs): tried after everything the page names, before a mask icon.
    let mut guesses = Vec::new();
    if let Ok(origin) = Url::parse(&base) {
        for (path, hint, size) in [
            ("/apple-touch-icon.png", IconHint::Apple, Some(180)),
            ("/favicon.svg", IconHint::Svg, None),
            ("/favicon.ico", IconHint::Ico, None),
        ] {
            if let Ok(url) = origin.join(path) {
                if seen.insert(url.to_string()) {
                    guesses.push(IconRef {
                        url: url.to_string(),
                        hint,
                        size,
                    });
                }
            }
        }
    }
    let masks = icons
        .iter()
        .position(|icon| matches!(icon.hint, IconHint::Mask))
        .unwrap_or(icons.len());
    icons.splice(masks..masks, guesses);
    Head {
        title,
        description,
        icons,
    }
}

/// A manifest link is remembered with this prefix and expanded into image candidates on fetch.
const MANIFEST_MARK: &str = "manifest:";

fn manifest_icons_later(url: String) -> Vec<IconRef> {
    vec![IconRef {
        url: format!("{MANIFEST_MARK}{url}"),
        hint: IconHint::Other,
        size: Some(0),
    }]
}

fn choose_title(
    og: Option<String>,
    twitter: Option<String>,
    document: Option<String>,
    site: Option<String>,
) -> Option<String> {
    if let Some(title) = og.or(twitter) {
        return Some(collapse(&title));
    }
    if let (Some(document), Some(site)) = (&document, &site) {
        for separator in [" - ", " | ", " — ", " – ", " · "] {
            if let Some((page, rest)) = document.rsplit_once(separator) {
                if rest.trim().eq_ignore_ascii_case(site.trim()) && !page.trim().is_empty() {
                    return Some(collapse(page));
                }
            }
        }
    }
    document.or(site).map(|value| collapse(&value))
}

fn collapse(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn hint_of(href: &str, kind: &str) -> IconHint {
    let kind = kind.to_ascii_lowercase();
    if kind.contains("svg") || href_looks_svg(href, kind.as_str()) {
        IconHint::Svg
    } else if kind.contains("webp") || href.split('?').next().unwrap_or(href).ends_with(".webp") {
        IconHint::Webp
    } else if kind.contains("png") || href.split('?').next().unwrap_or(href).ends_with(".png") {
        IconHint::Png
    } else if kind.contains("icon") || href.split('?').next().unwrap_or(href).ends_with(".ico") {
        IconHint::Ico
    } else {
        IconHint::Other
    }
}

fn href_looks_svg(href: &str, kind: &str) -> bool {
    kind.to_ascii_lowercase().contains("svg")
        || href
            .split('?')
            .next()
            .unwrap_or(href)
            .to_ascii_lowercase()
            .ends_with(".svg")
}

fn parse_size(value: &str) -> Option<u32> {
    value
        .split_whitespace()
        .filter_map(|token| token.split('x').next().and_then(|n| n.parse().ok()))
        .max()
}

fn rank(hint: IconHint, size: Option<u32>) -> (u8, i32) {
    let size = size.unwrap_or(0) as i32;
    match hint {
        IconHint::Png | IconHint::Webp if size >= 64 => (0, (size - 128).abs()),
        IconHint::Svg => (1, 0),
        IconHint::Apple => (2, (size - 180).abs()),
        IconHint::Png | IconHint::Webp | IconHint::Other => (3, (size - 128).abs()),
        IconHint::Ico => (4, 0),
        IconHint::Mask => (5, 0),
    }
}

fn absolute(base: &str, href: &str) -> Option<String> {
    let href = href.trim();
    if href.starts_with("data:") {
        return Some(href.to_owned());
    }
    let joined = Url::parse(base).ok()?.join(href).ok()?;
    if !matches!(joined.scheme(), "http" | "https") {
        return None;
    }
    Some(joined.to_string())
}

fn fetch_icon(client: &reqwest::blocking::Client, icon: &IconRef) -> Option<IconBlob> {
    if let Some(url) = icon.url.strip_prefix(MANIFEST_MARK) {
        return manifest_icons(client, url)
            .into_iter()
            .find_map(|icon| fetch_icon(client, &icon));
    }
    if let Some(data) = icon.url.strip_prefix("data:") {
        let (mime, bytes) = decode_data_url(data)?;
        return normalize_icon(&bytes, Some(mime.as_str()));
    }
    let response = exchange(client, &icon.url, None, "image/*,*/*", ICON_LIMIT, false).ok()?;
    if !(200..300).contains(&response.status) {
        return None;
    }
    normalize_icon(&response.body, response.content_type.as_deref())
}

fn manifest_icons(client: &reqwest::blocking::Client, url: &str) -> Vec<IconRef> {
    let response = exchange(
        client,
        url,
        None,
        "application/manifest+json,application/json",
        MANIFEST_LIMIT,
        false,
    )
    .ok();
    let Some(response) = response else {
        return Vec::new();
    };
    if !(200..300).contains(&response.status) {
        return Vec::new();
    }
    let text = decode_html(&response.body, response.content_type.as_deref());
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Vec::new();
    };
    let Some(icons) = value.get("icons").and_then(|icons| icons.as_array()) else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for icon in icons {
        let Some(src) = icon.get("src").and_then(|src| src.as_str()) else {
            continue;
        };
        let kind = icon
            .get("type")
            .and_then(|kind| kind.as_str())
            .unwrap_or("");
        let size = icon
            .get("sizes")
            .and_then(|sizes| sizes.as_str())
            .and_then(parse_size);
        let Some(url) = absolute(&response.final_url, src) else {
            continue;
        };
        found.push(IconRef {
            url,
            hint: hint_of(src, kind),
            size,
        });
    }
    found.sort_by_key(|icon| rank(icon.hint, icon.size));
    found
}

fn decode_data_url(value: &str) -> Option<(String, Vec<u8>)> {
    let (meta, data) = value.split_once(',')?;
    let mime = meta.split(';').next().unwrap_or("").to_owned();
    let bytes = if meta.contains(";base64") {
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data.trim()).ok()?
    } else {
        urlencoding_lossy(data)
    };
    Some((mime, bytes))
}

fn urlencoding_lossy(value: &str) -> Vec<u8> {
    let decoded = value.replace('+', " ");
    percent_decode(decoded.as_bytes())
}

fn percent_decode(input: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len());
    let mut index = 0;
    while index < input.len() {
        if input[index] == b'%' && index + 2 < input.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&input[index + 1..index + 3]).unwrap_or(""),
                16,
            ) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(input[index]);
        index += 1;
    }
    out
}

fn third_party_icon(
    client: &reqwest::blocking::Client,
    page_url: &str,
    third_party: ThirdParty,
) -> Option<IconBlob> {
    if third_party == ThirdParty::Off {
        return None;
    }
    let parsed = Url::parse(page_url).ok()?;
    let host = parsed.host_str()?;
    if !public_host(host) {
        return None;
    }
    let url = match third_party {
        ThirdParty::DuckDuckGo => format!("https://icons.duckduckgo.com/ip3/{host}.ico"),
        ThirdParty::Google => format!("https://www.google.com/s2/favicons?domain={host}&sz=128"),
        ThirdParty::Off => return None,
    };
    let response = exchange(client, &url, None, "image/*,*/*", ICON_LIMIT, false).ok()?;
    if !(200..300).contains(&response.status) {
        return None;
    }
    normalize_icon(&response.body, response.content_type.as_deref())
}

fn public_host(host: &str) -> bool {
    let host = host.trim_start_matches('[').trim_end_matches(']');
    if host.eq_ignore_ascii_case("localhost")
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host == "0.0.0.0"
        || host == "::1"
    {
        return false;
    }
    if let Ok(ip) = host.parse::<std::net::Ipv4Addr>() {
        return !(ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified());
    }
    if let Ok(ip) = host.parse::<std::net::Ipv6Addr>() {
        return !(ip.is_loopback() || ip.is_unspecified() || is_ipv6_unique_local(&ip));
    }
    true
}

fn is_ipv6_unique_local(ip: &std::net::Ipv6Addr) -> bool {
    (ip.segments()[0] & 0xfe00) == 0xfc00
}

pub(crate) fn normalize_icon(bytes: &[u8], content_type: Option<&str>) -> Option<IconBlob> {
    let kind = content_type.unwrap_or("").to_ascii_lowercase();
    if kind.contains("svg") || bytes.starts_with(b"<svg") || bytes.starts_with(b"<?xml") {
        let cleaned = sanitize_svg(bytes)?;
        return Some(IconBlob {
            ext: "svg",
            mime: "image/svg+xml",
            bytes: cleaned,
        });
    }
    let image = decode_bitmap(bytes).ok()?;
    let fitted = fit_icon(image)?;
    Some(IconBlob {
        ext: "png",
        mime: "image/png",
        bytes: fitted,
    })
}

fn decode_bitmap(bytes: &[u8]) -> Result<RgbaImage, ()> {
    if let Some(png) = largest_png_in_ico(bytes) {
        return image::load_from_memory(png)
            .map(|image| image.to_rgba8())
            .map_err(|_| ());
    }
    image::load_from_memory(bytes)
        .map(|image| image.to_rgba8())
        .map_err(|_| ())
}

/// ICO can carry several frames. Prefer a PNG frame, and among those the largest one.
fn largest_png_in_ico(bytes: &[u8]) -> Option<&[u8]> {
    if bytes.len() < 6 || bytes[0..4] != [0, 0, 1, 0] {
        return None;
    }
    let count = u16::from_le_bytes([bytes[4], bytes[5]]) as usize;
    if count == 0 || bytes.len() < 6 + count * 16 {
        return None;
    }
    let mut best: Option<(u32, usize, usize)> = None;
    for index in 0..count {
        let entry = 6 + index * 16;
        let width = if bytes[entry] == 0 {
            256
        } else {
            bytes[entry] as u32
        };
        let height = if bytes[entry + 1] == 0 {
            256
        } else {
            bytes[entry + 1] as u32
        };
        let size = u32::from_le_bytes(bytes[entry + 8..entry + 12].try_into().ok()?) as usize;
        let offset = u32::from_le_bytes(bytes[entry + 12..entry + 16].try_into().ok()?) as usize;
        if offset.checked_add(size).is_none_or(|end| end > bytes.len()) || size < 8 {
            continue;
        }
        if &bytes[offset..offset + 8] != b"\x89PNG\r\n\x1a\n" {
            continue;
        }
        let area = width.saturating_mul(height);
        if best.is_none_or(|(best_area, _, _)| area > best_area) {
            best = Some((area, offset, size));
        }
    }
    best.map(|(_, offset, size)| &bytes[offset..offset + size])
}

fn fit_icon(image: RgbaImage) -> Option<Vec<u8>> {
    if image.width() > 4096 || image.height() > 4096 || is_blank(&image) {
        return None;
    }
    let png = render_png(&image, ICON_EDGE)?;
    if png.len() <= ICON_BYTES {
        return Some(png);
    }
    render_png(&image, 64).filter(|png| png.len() <= ICON_BYTES)
}

fn render_png(image: &RgbaImage, edge: u32) -> Option<Vec<u8>> {
    let (width, height) = image.dimensions();
    let scale = edge as f64 / width.max(height).max(1) as f64;
    let fitted_width = ((width as f64) * scale).round().clamp(1.0, edge as f64) as u32;
    let fitted_height = ((height as f64) * scale).round().clamp(1.0, edge as f64) as u32;
    let resized = imageops::resize(
        image,
        fitted_width,
        fitted_height,
        imageops::FilterType::Lanczos3,
    );
    let mut canvas = RgbaImage::from_pixel(edge, edge, Rgba([0, 0, 0, 0]));
    imageops::overlay(
        &mut canvas,
        &resized,
        ((edge - fitted_width) / 2).into(),
        ((edge - fitted_height) / 2).into(),
    );
    let mut bytes = Vec::new();
    PngEncoder::new(&mut bytes)
        .write_image(canvas.as_raw(), edge, edge, ExtendedColorType::Rgba8)
        .ok()?;
    Some(bytes)
}

fn is_blank(image: &RgbaImage) -> bool {
    let mut min_alpha = 255u8;
    let mut max_alpha = 0u8;
    let mut first: Option<[u8; 3]> = None;
    let mut varied = false;
    for pixel in image.pixels() {
        min_alpha = min_alpha.min(pixel[3]);
        max_alpha = max_alpha.max(pixel[3]);
        if pixel[3] < 16 {
            continue;
        }
        let color = [pixel[0], pixel[1], pixel[2]];
        if let Some(seen) = first {
            if color.iter().zip(seen).any(|(a, b)| a.abs_diff(b) > 12) {
                varied = true;
            }
        } else {
            first = Some(color);
        }
    }
    max_alpha < 16 || (first.is_some() && !varied && min_alpha > 240)
}

/// Drops scripts, event handlers and external references. The result is only ever shown in `<img>`.
pub(crate) fn sanitize_svg(input: &[u8]) -> Option<Vec<u8>> {
    if input.len() > ICON_BYTES {
        return None;
    }
    let text = std::str::from_utf8(input).ok()?;
    let mut index = 0;
    let bytes = text.as_bytes();
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
    }
    if bytes[index..].starts_with(&[0xEF, 0xBB, 0xBF]) {
        index += 3;
    }
    let preamble = &text[index..];
    let body = skip_svg_preamble(preamble)?;
    if !body.to_ascii_lowercase().starts_with("<svg") {
        return None;
    }
    // The XML declaration, DOCTYPE and leading comments are optional in an image and carry
    // quoted URLs that a tag scanner would cut in half; only the <svg> element is kept.
    let cleaned = with_namespace(rewrite_svg(body));
    if cleaned.len() > ICON_BYTES || !cleaned.to_ascii_lowercase().contains("<svg") {
        return None;
    }
    let lower = cleaned.to_ascii_lowercase();
    if lower.contains("<script")
        || lower.contains("javascript:")
        || lower.contains("<foreignobject")
    {
        return None;
    }
    Some(cleaned.into_bytes())
}

const SVG_NS: &str = "http://www.w3.org/2000/svg";
const XLINK_NS: &str = "http://www.w3.org/1999/xlink";

/// Gives the root element the SVG namespace when the source left it out (inline-style SVG),
/// which an <img> needs before it will draw anything.
fn with_namespace(svg: String) -> String {
    let root_end = svg.find('>').unwrap_or(svg.len());
    if svg[..root_end].contains("xmlns=") || svg.len() < 4 {
        return svg;
    }
    format!("<svg xmlns=\"{SVG_NS}\"{}", &svg[4..])
}

fn skip_svg_preamble(input: &str) -> Option<&str> {
    let mut rest = input.trim_start();
    loop {
        let lower = rest.to_ascii_lowercase();
        if lower.starts_with("<?xml") {
            rest = rest.get(rest.find("?>")? + 2..)?.trim_start();
        } else if lower.starts_with("<!doctype") || lower.starts_with("<!--") {
            let end = if lower.starts_with("<!--") {
                "-->"
            } else {
                ">"
            };
            rest = rest.get(rest.find(end)? + end.len()..)?.trim_start();
        } else {
            return Some(rest);
        }
    }
}

fn rewrite_svg(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] != b'<' {
            let ch = input[index..].chars().next().unwrap_or('\u{FFFD}');
            out.push(ch);
            index += ch.len_utf8();
            continue;
        }
        let end = index + tag_span(&input[index..]);
        let tag = &input[index..end];
        let name = tag_name(tag);
        if is_skipped_element(&name) && !tag.ends_with("/>") && !tag.starts_with("</") {
            let close = format!("</{name}");
            if let Some(found) = input[end..]
                .to_ascii_lowercase()
                .find(&close.to_ascii_lowercase())
            {
                let after = end + found + close.len();
                index = input[after..]
                    .find('>')
                    .map(|at| after + at + 1)
                    .unwrap_or(input.len());
                continue;
            }
            break;
        }
        if !is_skipped_element(&name) {
            out.push_str(&rewrite_tag(tag));
        }
        index = end;
    }
    out
}

fn is_skipped_element(name: &str) -> bool {
    matches!(name, "script" | "foreignobject")
}

fn tag_name(tag: &str) -> String {
    tag.trim_start_matches('<')
        .trim_start_matches('/')
        .split(|ch: char| ch.is_whitespace() || ch == '>' || ch == '/')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
}

fn tag_span(input: &str) -> usize {
    let bytes = input.as_bytes();
    let mut quote: Option<u8> = None;
    for (offset, byte) in bytes.iter().enumerate().skip(1) {
        if let Some(mark) = quote {
            if *byte == mark {
                quote = None;
            }
        } else if *byte == b'"' || *byte == b'\'' {
            quote = Some(*byte);
        } else if *byte == b'>' {
            return offset + 1;
        }
    }
    input.len()
}

fn rewrite_tag(tag: &str) -> String {
    if !tag.starts_with('<') || tag.starts_with("</") {
        return tag.to_owned();
    }
    let bytes = tag.as_bytes();
    let mut name_end = 1;
    while name_end < bytes.len()
        && !bytes[name_end].is_ascii_whitespace()
        && bytes[name_end] != b'>'
        && bytes[name_end] != b'/'
    {
        name_end += 1;
    }
    let mut out = tag[..name_end].to_owned();
    let mut index = name_end;
    while index < bytes.len() {
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        if index >= bytes.len() || bytes[index] == b'>' || bytes[index] == b'/' {
            break;
        }
        let start = index;
        while index < bytes.len()
            && bytes[index] != b'='
            && !bytes[index].is_ascii_whitespace()
            && bytes[index] != b'>'
            && bytes[index] != b'/'
        {
            index += 1;
        }
        let name = &tag[start..index];
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        let value = if index < bytes.len() && bytes[index] == b'=' {
            index += 1;
            while index < bytes.len() && bytes[index].is_ascii_whitespace() {
                index += 1;
            }
            if index < bytes.len() && (bytes[index] == b'"' || bytes[index] == b'\'') {
                let quote = bytes[index];
                index += 1;
                let value_start = index;
                while index < bytes.len() && bytes[index] != quote {
                    index += 1;
                }
                let value = &tag[value_start..index];
                if index < bytes.len() {
                    index += 1;
                }
                Some(value)
            } else {
                let value_start = index;
                while index < bytes.len()
                    && !bytes[index].is_ascii_whitespace()
                    && bytes[index] != b'>'
                {
                    index += 1;
                }
                Some(&tag[value_start..index])
            }
        } else {
            None
        };
        if attribute_allowed(name, value) {
            out.push(' ');
            out.push_str(name);
            if let Some(value) = value {
                out.push_str("=\"");
                out.push_str(&value.replace('"', "&quot;"));
                out.push('"');
            }
        }
    }
    if tag.ends_with("/>") {
        out.push_str(" />");
    } else {
        out.push('>');
    }
    out
}

fn attribute_allowed(name: &str, value: Option<&str>) -> bool {
    let name = name.to_ascii_lowercase();
    if name.starts_with("on") || name == "style" {
        return false;
    }
    let Some(value) = value else {
        return !name.starts_with("on");
    };
    // Namespaces are identifiers, not fetched references; only the two SVG uses are kept.
    // Dropping the SVG namespace makes an <img> refuse the file entirely.
    if name == "xmlns" {
        return value.trim() == SVG_NS;
    }
    if name == "xmlns:xlink" {
        return value.trim() == XLINK_NS;
    }
    if name.starts_with("xmlns:") {
        return false;
    }
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();
    if lower.contains("javascript:")
        || lower.contains("http:")
        || lower.contains("https:")
        || lower.starts_with("//")
    {
        return false;
    }
    if name == "href" || name.ends_with(":href") {
        return trimmed.starts_with('#') || lower.starts_with("data:");
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::Write,
        net::TcpListener,
        sync::{Arc, Mutex},
        thread,
        time::Duration,
    };

    fn png(width: u32, height: u32, color: [u8; 4]) -> Vec<u8> {
        let mut image = RgbaImage::new(width, height);
        for (index, pixel) in image.pixels_mut().enumerate() {
            *pixel = Rgba(if index % 3 == 0 { [0, 0, 0, 0] } else { color });
        }
        let mut bytes = Vec::new();
        PngEncoder::new(&mut bytes)
            .write_image(image.as_raw(), width, height, ExtendedColorType::Rgba8)
            .unwrap();
        bytes
    }

    fn solid(width: u32, height: u32, color: [u8; 4]) -> Vec<u8> {
        let image = RgbaImage::from_pixel(width, height, Rgba(color));
        let mut bytes = Vec::new();
        PngEncoder::new(&mut bytes)
            .write_image(image.as_raw(), width, height, ExtendedColorType::Rgba8)
            .unwrap();
        bytes
    }

    fn ico_pngs(frames: &[(u8, &[u8])]) -> Vec<u8> {
        let mut bytes = vec![0, 0, 1, 0, frames.len() as u8, 0];
        let mut images = Vec::new();
        let mut offset = 6 + frames.len() * 16;
        for (edge, png) in frames {
            bytes.extend_from_slice(&[*edge, *edge, 0, 0, 1, 0, 0, 0]);
            bytes.extend_from_slice(&(png.len() as u32).to_le_bytes());
            bytes.extend_from_slice(&(offset as u32).to_le_bytes());
            offset += png.len();
            images.extend_from_slice(png);
        }
        bytes.extend_from_slice(&images);
        bytes
    }

    struct Server {
        origin: String,
        stop: std::sync::mpsc::Sender<()>,
        thread: Option<thread::JoinHandle<()>>,
    }
    impl Drop for Server {
        fn drop(&mut self) {
            let _ = self.stop.send(());
            if let Some(thread) = self.thread.take() {
                let _ = thread.join();
            }
        }
    }

    fn serve(handler: impl Fn(String, String) -> Vec<u8> + Send + Sync + 'static) -> Server {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let origin = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let (stop, recv) = std::sync::mpsc::channel();
        let handler = Arc::new(handler);
        let thread = thread::spawn(move || loop {
            if recv.try_recv().is_ok() {
                break;
            }
            match listener.accept() {
                Ok((mut stream, _)) => {
                    stream
                        .set_read_timeout(Some(Duration::from_secs(2)))
                        .unwrap();
                    let mut request = Vec::new();
                    let mut chunk = [0u8; 2048];
                    loop {
                        match std::io::Read::read(&mut stream, &mut chunk) {
                            Ok(0) => break,
                            Ok(n) => {
                                request.extend_from_slice(&chunk[..n]);
                                if request.windows(4).any(|window| window == b"\r\n\r\n") {
                                    break;
                                }
                            }
                            Err(_) => break,
                        }
                    }
                    let text = String::from_utf8_lossy(&request).into_owned();
                    let path = text.split_whitespace().nth(1).unwrap_or("/").to_owned();
                    let response = handler(path, text);
                    let _ = stream.write_all(&response);
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(5));
                }
                Err(_) => break,
            }
        });
        Server {
            origin,
            stop,
            thread: Some(thread),
        }
    }

    fn http(status: &str, headers: &[(&str, &str)], body: &[u8]) -> Vec<u8> {
        let mut head = format!(
            "HTTP/1.1 {status}\r\nConnection: close\r\nContent-Length: {}\r\n",
            body.len()
        );
        for (name, value) in headers {
            head.push_str(name);
            head.push_str(": ");
            head.push_str(value);
            head.push_str("\r\n");
        }
        head.push_str("\r\n");
        let mut bytes = head.into_bytes();
        bytes.extend_from_slice(body);
        bytes
    }

    fn test_client() -> reqwest::blocking::Client {
        reqwest::blocking::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(3))
            .no_proxy()
            .build()
            .unwrap()
    }

    #[test]
    fn a_dead_proxy_falls_back_to_a_direct_connection() {
        let server = serve(|_, _| {
            http(
                "200 OK",
                &[("Content-Type", "text/html")],
                b"<html><head><title>Direct</title></head>",
            )
        });
        // A port nothing listens on stands in for a proxy that has been switched off.
        let closed = TcpListener::bind("127.0.0.1:0").unwrap();
        let dead = format!("http://{}", closed.local_addr().unwrap());
        drop(closed);
        let routes = [build(Some(dead)).unwrap(), test_client()];
        let outcome = retrieve_over(
            &routes,
            &format!("{}/", server.origin),
            None,
            ThirdParty::Off,
        )
        .unwrap();
        assert_eq!(outcome.title.as_deref(), Some("Direct"));
        // An answer from the site is final: a 404 is not retried on another route.
        let missing = serve(|_, _| http("404 Not Found", &[], b""));
        let calls = [test_client(), test_client()];
        assert!(matches!(
            retrieve_over(
                &calls,
                &format!("{}/", missing.origin),
                None,
                ThirdParty::Off
            ),
            Err(FetchError::Status)
        ));
    }

    #[test]
    fn gbk_pages_decode_and_relative_icons_follow_base() {
        let icon = png(32, 32, [20, 90, 200, 255]);
        let icon_bytes = Arc::new(icon);
        let served = Arc::new(Mutex::new(Vec::new()));
        let recorded = Arc::clone(&served);
        let payload = Arc::clone(&icon_bytes);
        let server = serve(move |path, _| {
            recorded.lock().unwrap().push(path.clone());
            if path.starts_with("/assets/mark.png") {
                return http(
                    "200 OK",
                    &[("Content-Type", "image/png")],
                    payload.as_slice(),
                );
            }
            let (bytes, _, _) = encoding_rs::GBK.encode(
                "<html><head><meta charset=\"gbk\"><base href=\"/assets/\"><title>中文标题</title><link rel=\"icon\" href=\"mark.png\"></head><body>",
            );
            http("200 OK", &[("Content-Type", "text/html")], bytes.as_ref())
        });
        let outcome = retrieve(
            &test_client(),
            &format!("{}/page", server.origin),
            None,
            ThirdParty::Off,
        )
        .unwrap();
        assert_eq!(outcome.title.as_deref(), Some("中文标题"));
        assert!(outcome.icon.unwrap().bytes.starts_with(b"\x89PNG"));
        let paths = served.lock().unwrap().clone();
        assert!(
            paths
                .iter()
                .any(|path| path.starts_with("/assets/mark.png")),
            "{paths:?}"
        );
    }

    #[test]
    fn manifest_base_and_largest_ico_frame_are_chosen() {
        let small = png(16, 16, [200, 20, 20, 255]);
        let large = png(32, 32, [20, 20, 200, 255]);
        let ico = ico_pngs(&[(16, &small), (32, &large)]);
        let placeholder = solid(64, 64, [240, 240, 240, 255]);
        let server = serve(move |path, _| {
            match path.as_str() {
            "/" => http(
                "200 OK",
                &[("Content-Type", "text/html")],
                b"<head><base href=\"/nested/\"><link rel=\"icon\" href=\"blank.png\" sizes=\"64x64\"><link rel=\"manifest\" href=\"app.webmanifest\"><title>Docs</title></head>",
            ),
            "/nested/blank.png" => http("200 OK", &[("Content-Type", "image/png")], &placeholder),
            "/nested/app.webmanifest" => http(
                "200 OK",
                &[("Content-Type", "application/manifest+json")],
                br#"{"icons":[{"src":"mark.ico","sizes":"32x32","type":"image/x-icon"}]}"#,
            ),
            "/nested/mark.ico" => http("200 OK", &[("Content-Type", "image/x-icon")], &ico),
            _ => http("404 Not Found", &[], b""),
        }
        });
        let outcome = retrieve(
            &test_client(),
            &format!("{}/", server.origin),
            None,
            ThirdParty::Off,
        )
        .unwrap();
        let icon = outcome.icon.expect("icon");
        let decoded = image::load_from_memory(&icon.bytes).unwrap().to_rgba8();
        let center = decoded.get_pixel(decoded.width() / 2, decoded.height() / 2);
        assert!(
            center[2] > center[0],
            "expected the 32px blue frame, got {center:?}"
        );
    }

    #[test]
    fn cleaned_svg_keeps_its_namespace_so_img_can_decode_it() {
        // Radix UI's favicon: without xmlns an <img> shows a broken-image glyph.
        let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" width="35" height="35" viewBox="0 0 35 35" fill="#1C2024"><rect x="5" width="12" height="12" /></svg>"##;
        let cleaned = String::from_utf8(sanitize_svg(svg).unwrap()).unwrap();
        assert!(
            cleaned.starts_with(r##"<svg xmlns="http://www.w3.org/2000/svg""##),
            "{cleaned}"
        );
        // A namespace pointing anywhere else is still dropped.
        let odd = br##"<svg xmlns="http://evil.example/ns" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/></svg>"##;
        let cleaned = String::from_utf8(sanitize_svg(odd).unwrap()).unwrap();
        assert!(!cleaned.contains("evil.example"), "{cleaned}");
        assert!(
            cleaned.contains(r##"xmlns="http://www.w3.org/2000/svg""##),
            "{cleaned}"
        );
        assert!(
            cleaned.contains(r##"xmlns:xlink="http://www.w3.org/1999/xlink""##),
            "{cleaned}"
        );
    }

    #[test]
    fn a_doctype_preamble_is_dropped_not_cut_in_half() {
        // Tailwind's potrace export: the DOCTYPE carries a quoted URL with slashes in it.
        let svg = br##"<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20010904//EN"
 "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">
<svg version="1.0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26"><path d="M1 1h4v4z"/></svg>"##;
        let cleaned = String::from_utf8(sanitize_svg(svg).unwrap()).unwrap();
        assert!(cleaned.starts_with("<svg "), "{cleaned}");
        assert!(!cleaned.contains("DOCTYPE"), "{cleaned}");
    }

    #[test]
    fn mask_icons_are_the_last_resort_and_candidates_are_unique() {
        let html = r##"<head>
<link rel="mask-icon" href="/safari-pinned-tab.svg" color="#000">
<link rel="icon" href="/favicon.ico">
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
</head>"##;
        let head = parse_head(html, "https://example.com/");
        let urls: Vec<&str> = head.icons.iter().map(|icon| icon.url.as_str()).collect();
        assert_eq!(
            urls.first(),
            Some(&"https://example.com/apple-touch-icon.png")
        );
        assert_eq!(
            urls.last(),
            Some(&"https://example.com/safari-pinned-tab.svg")
        );
        let unique: std::collections::HashSet<_> = urls.iter().collect();
        assert_eq!(unique.len(), urls.len(), "{urls:?}");
    }

    #[test]
    fn pages_without_icon_links_still_try_the_conventional_files() {
        let head = parse_head("<head><title>x</title></head>", "https://example.com/a/b");
        let urls: Vec<&str> = head.icons.iter().map(|icon| icon.url.as_str()).collect();
        for path in ["/apple-touch-icon.png", "/favicon.svg", "/favicon.ico"] {
            assert!(
                urls.contains(&format!("https://example.com{path}").as_str()),
                "{urls:?}"
            );
        }
    }

    #[test]
    fn svg_scripts_are_removed_and_oversized_html_is_cut() {
        let svg = br##"<svg xmlns="http://www.w3.org/2000/svg" onclick="alert(1)"><script>bad()</script><a href="https://evil.test"></a><path href="#here"/></svg>"##;
        let cleaned = String::from_utf8(sanitize_svg(svg).unwrap()).unwrap();
        assert!(!cleaned.to_ascii_lowercase().contains("<script"));
        assert!(!cleaned.contains("onclick"));
        assert!(!cleaned.contains("evil.test"));
        assert!(cleaned.contains("#here"));
        let huge = Arc::new(Mutex::new(0usize));
        let count = Arc::clone(&huge);
        let server = serve(move |path, _| {
            if path == "/icon.svg" {
                return http("200 OK", &[("Content-Type", "image/svg+xml")], svg);
            }
            let mut body = b"<head><title>Cut</title><link rel=\"icon\" href=\"/icon.svg\" type=\"image/svg+xml\">".to_vec();
            body.extend(std::iter::repeat_n(b'a', 400 * 1024));
            body.extend(b"</head>");
            *count.lock().unwrap() = body.len();
            http("200 OK", &[("Content-Type", "text/html")], &body)
        });
        let outcome = retrieve(
            &test_client(),
            &format!("{}/big", server.origin),
            None,
            ThirdParty::Off,
        )
        .unwrap();
        assert_eq!(outcome.title.as_deref(), Some("Cut"));
        let svg = String::from_utf8(outcome.icon.unwrap().bytes).unwrap();
        assert!(!svg.to_ascii_lowercase().contains("<script"));
        assert!(*huge.lock().unwrap() > PAGE_LIMIT);
    }

    #[test]
    fn non_http_redirects_are_refused_and_a_match_returns_304() {
        let server = serve(|path, headers| {
            if path == "/away" {
                return http("302 Found", &[("Location", "file:///etc/passwd")], b"");
            }
            if headers
                .to_ascii_lowercase()
                .contains("if-none-match: \"v1\"")
            {
                return http("304 Not Modified", &[("ETag", "\"v1\"")], b"");
            }
            http(
                "200 OK",
                &[("Content-Type", "text/html"), ("ETag", "\"v1\"")],
                b"<head><title>Once</title></head>",
            )
        });
        let client = test_client();
        let error = retrieve(
            &client,
            &format!("{}/away", server.origin),
            None,
            ThirdParty::Off,
        )
        .unwrap_err();
        assert!(matches!(error, FetchError::Redirect), "{error:?}");
        let first = retrieve(
            &client,
            &format!("{}/page", server.origin),
            None,
            ThirdParty::Off,
        )
        .unwrap();
        assert_eq!(first.etag.as_deref(), Some("\"v1\""));
        let second = retrieve(
            &client,
            &format!("{}/page", server.origin),
            Some(&Conditional {
                etag: first.etag.clone(),
                last_modified: None,
            }),
            ThirdParty::Off,
        )
        .unwrap();
        assert!(second.not_modified);
        assert!(second.title.is_none());
    }

    #[test]
    fn a_short_title_wins_when_the_document_title_repeats_the_site_name() {
        let html = "<head><title>指南 - Vite</title><meta property=\"og:site_name\" content=\"Vite\"><meta name=\"description\" content=\"快\"></head>";
        let head = parse_head(html, "https://vitejs.dev/");
        assert_eq!(head.title.as_deref(), Some("指南"));
        assert_eq!(head.description.as_deref(), Some("快"));
    }

    #[test]
    fn read_limited_stops_at_the_cap_and_at_the_head() {
        let mut body = b"<head><title>T</title></head>".to_vec();
        body.extend(std::iter::repeat_n(b'y', 1024));
        let read = read_limited(std::io::Cursor::new(body), 256, true).unwrap();
        assert!(read
            .windows(7)
            .any(|window| window.eq_ignore_ascii_case(b"</head>")));
        assert!(!read.windows(4).any(|window| window == b"yyyy"));
        let long = vec![b'z'; 1000];
        assert_eq!(
            read_limited(std::io::Cursor::new(long), 256, false)
                .unwrap()
                .len(),
            256
        );
    }
}
