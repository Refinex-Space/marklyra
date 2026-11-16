//! Entities read leniently from frontmatter, plus the validation rules every write shares.
use serde::Serialize;
use serde_yaml_ng::{Mapping, Value as Yaml};
use url::Url;

/// Preset label colours; a group may also carry `#rrggbb`.
pub const COLORS: [&str; 11] = [
    "red", "orange", "amber", "green", "teal", "cyan", "blue", "indigo", "purple", "pink", "gray",
];
pub(crate) const MAX_URL: usize = 2048;
pub(crate) const MAX_TITLE: usize = 120;
pub(crate) const MAX_DESCRIPTION: usize = 300;
pub(crate) const MAX_GROUP_NAME: usize = 60;
/// Fields a user edit can pin so a later metadata fetch does not overwrite them.
pub(crate) const MANUAL_FIELDS: [&str; 3] = ["title", "description", "icon"];

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub color: String,
    /// Groups nest one level: a parent never has a parent of its own.
    pub parent: Option<String>,
    pub order: f64,
    pub collapsed: bool,
    pub created: String,
    pub revision: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    pub id: String,
    pub url: String,
    pub title: String,
    pub description: String,
    pub group: Option<String>,
    pub order: f64,
    pub pinned: bool,
    /// Path below the store (`icons/<hash>.png`); `None` shows the letter mark.
    pub icon: Option<String>,
    pub manual: Vec<String>,
    pub created: String,
    pub fetched: Option<String>,
    pub revision: String,
}

/// http/https only, no credentials, bounded length; the host is lowercased and default ports
/// dropped by the URL parser. Anything else is rejected so a file can never carry a `javascript:`
/// or `file:` link that the shell would later hand to the system.
pub fn normalize_url(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("网址不能为空".into());
    }
    if value.len() > MAX_URL || value.chars().any(char::is_control) {
        return Err("网址过长或含控制字符".into());
    }
    let url = Url::parse(value).map_err(|_| "网址格式不正确".to_owned())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("仅支持 http 或 https 网址".into());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("网址不能包含用户名或密码".into());
    }
    if url.host_str().is_none_or(str::is_empty) {
        return Err("网址缺少主机名".into());
    }
    Ok(url.into())
}

pub(crate) fn host_of(url: &str) -> String {
    Url::parse(url)
        .ok()
        .and_then(|u| {
            u.host_str()
                .map(|h| h.trim_start_matches("www.").to_owned())
        })
        .unwrap_or_else(|| url.to_owned())
}

/// Collapses control characters and runs of whitespace, trims, and cuts to `max` characters.
pub(crate) fn clean(value: &str, max: usize) -> String {
    let mut out = String::new();
    let mut gap = false;
    for ch in value.chars() {
        if ch.is_whitespace() || ch.is_control() {
            gap = !out.is_empty();
        } else {
            if gap {
                out.push(' ');
                gap = false;
            }
            out.push(ch);
        }
    }
    out.chars().take(max).collect()
}

pub(crate) fn valid_color(value: &str) -> bool {
    COLORS.contains(&value)
        || value
            .strip_prefix('#')
            .is_some_and(|hex| hex.len() == 6 && hex.bytes().all(|b| b.is_ascii_hexdigit()))
}

pub(crate) fn valid_id(id: &str) -> bool {
    (6..=40).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn text(map: &Mapping, key: &str) -> Option<String> {
    match map.get(key)? {
        Yaml::String(s) => Some(s.clone()).filter(|s| !s.is_empty()),
        Yaml::Number(n) => Some(n.to_string()),
        Yaml::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}
fn number(map: &Mapping, key: &str) -> Option<f64> {
    match map.get(key)? {
        Yaml::Number(n) => n.as_f64().filter(|n| n.is_finite()),
        Yaml::String(s) => s.parse().ok().filter(|n: &f64| n.is_finite()),
        _ => None,
    }
}
fn flag(map: &Mapping, key: &str) -> bool {
    matches!(map.get(key), Some(Yaml::Bool(true)))
}
fn list(map: &Mapping, key: &str) -> Vec<String> {
    match map.get(key) {
        Some(Yaml::Sequence(items)) => items
            .iter()
            .filter_map(|v| match v {
                Yaml::String(s) => Some(s.clone()),
                _ => None,
            })
            .collect(),
        Some(Yaml::String(s)) if !s.is_empty() => vec![s.clone()],
        _ => Vec::new(),
    }
}

pub(crate) fn parse_group(id: &str, revision: String, map: &Mapping) -> Result<Group, String> {
    let name = text(map, "name")
        .map(|n| clean(&n, MAX_GROUP_NAME))
        .filter(|n| !n.is_empty())
        .ok_or("分组缺少名称")?;
    Ok(Group {
        id: id.into(),
        name,
        color: text(map, "color")
            .filter(|c| valid_color(c))
            .unwrap_or_else(|| "gray".into()),
        parent: text(map, "parent").filter(|p| valid_id(p) && p != id),
        order: number(map, "order").unwrap_or(0.0),
        collapsed: flag(map, "collapsed"),
        created: text(map, "created").unwrap_or_default(),
        revision,
    })
}

pub(crate) fn parse_site(id: &str, revision: String, map: &Mapping) -> Result<Site, String> {
    let url = normalize_url(&text(map, "url").ok_or("站点缺少网址")?)?;
    let title = text(map, "title")
        .map(|t| clean(&t, MAX_TITLE))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| host_of(&url));
    Ok(Site {
        id: id.into(),
        title,
        description: text(map, "description")
            .map(|d| clean(&d, MAX_DESCRIPTION))
            .unwrap_or_default(),
        group: text(map, "group").filter(|g| valid_id(g)),
        order: number(map, "order").unwrap_or(0.0),
        pinned: flag(map, "pinned"),
        icon: text(map, "icon").filter(|i| valid_icon_path(i)),
        manual: list(map, "manual")
            .into_iter()
            .filter(|f| MANUAL_FIELDS.contains(&f.as_str()))
            .collect(),
        created: text(map, "created").unwrap_or_default(),
        fetched: text(map, "fetched"),
        url,
        revision,
    })
}

/// `icons/<name>.png|svg` with a plain file name: the shell never receives a path that could
/// leave the icon directory.
pub(crate) fn valid_icon_path(path: &str) -> bool {
    path.strip_prefix("icons/").is_some_and(|name| {
        (1..=80).contains(&name.len())
            && name
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_'))
            && !name.starts_with('.')
            && (name.ends_with(".png") || name.ends_with(".svg"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_are_normalized_and_dangerous_ones_rejected() {
        assert_eq!(
            normalize_url(" HTTPS://Example.COM:443/a?b=1 ").unwrap(),
            "https://example.com/a?b=1"
        );
        assert_eq!(
            normalize_url("http://localhost:3000").unwrap(),
            "http://localhost:3000/"
        );
        assert_eq!(
            normalize_url("http://192.168.1.20:8080/").unwrap(),
            "http://192.168.1.20:8080/"
        );
        for bad in [
            "",
            "javascript:alert(1)",
            "file:///etc/passwd",
            "mailto:a@b.c",
            "https://user:pw@example.com/",
            "https://user@example.com/",
            "example.com",
            "https://exa\nmple.com",
            &format!("https://example.com/{}", "a".repeat(2100)),
        ] {
            assert!(normalize_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn clean_collapses_whitespace_and_cuts_by_characters() {
        assert_eq!(clean("  a \n\t b\u{0}c  ", 10), "a b c");
        assert_eq!(clean("你好世界", 2), "你好");
        assert_eq!(clean("   ", 5), "");
    }

    #[test]
    fn colors_and_icon_paths_are_validated() {
        assert!(valid_color("blue") && valid_color("#a1B2c3"));
        assert!(!valid_color("#12345") && !valid_color("chartreuse") && !valid_color("#gggggg"));
        assert!(valid_icon_path("icons/5f1c0a9e2b7d4c13.png") && valid_icon_path("icons/a.svg"));
        for bad in [
            "../x.png",
            "icons/../x.png",
            "icons/.png",
            "icons/a/b.png",
            "icons/a.exe",
            "x.png",
        ] {
            assert!(!valid_icon_path(bad), "{bad}");
        }
    }
}
