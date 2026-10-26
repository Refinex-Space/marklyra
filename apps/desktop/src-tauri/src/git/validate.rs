//! Validation of everything the client sends before it reaches a git argument list.
use super::error::{strip_userinfo, GitError};

const MAX_PATH_BYTES: usize = 4096;
const MAX_PATHS: usize = 20_000;
const MAX_REVISION_BYTES: usize = 256;
const MAX_URL_BYTES: usize = 2048;

fn invalid(message: &str) -> GitError {
    GitError::invalid(message)
}

/// A repository-relative path with `/` separators that cannot leave the work tree.
pub(crate) fn path(value: &str) -> Result<&str, GitError> {
    if value.is_empty()
        || value.len() > MAX_PATH_BYTES
        || value.contains(['\0', '\r', '\n', '\\'])
        || value.starts_with('/')
        || value.ends_with('/')
        || std::path::Path::new(value).is_absolute()
        || value.as_bytes().get(1) == Some(&b':')
    {
        return Err(invalid("文件路径无效"));
    }
    for (index, part) in value.split('/').enumerate() {
        if part.is_empty() || part == "." || part == ".." {
            return Err(invalid("文件路径无效"));
        }
        if index == 0 && part.eq_ignore_ascii_case(".git") {
            return Err(invalid("不能操作 .git 目录"));
        }
    }
    Ok(value)
}

pub(crate) fn paths(values: &[String]) -> Result<Vec<String>, GitError> {
    if values.len() > MAX_PATHS {
        return Err(invalid("一次选择的文件过多"));
    }
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::with_capacity(values.len());
    for value in values {
        path(value)?;
        if seen.insert(value.as_str()) {
            result.push(value.clone());
        }
    }
    Ok(result)
}

/// A revision, ref or (when `range`) a range such as `main..feature`. No option-like or
/// whitespace-bearing text can pass.
pub(crate) fn revision(value: &str, range: bool) -> Result<&str, GitError> {
    let valid = !value.is_empty()
        && value.len() <= MAX_REVISION_BYTES
        && !value.starts_with('-')
        && (range || !value.contains(".."))
        && value.chars().all(|c| {
            if c.is_ascii() {
                c.is_ascii_graphic() && !matches!(c, '\\' | '*' | '?' | '[')
            } else {
                c.is_alphanumeric()
            }
        });
    if valid {
        Ok(value)
    } else {
        Err(invalid("版本或分支名无效"))
    }
}

/// A plain object id prefix or full id.
pub(crate) fn hex(value: &str) -> bool {
    (4..=64).contains(&value.len()) && value.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Shape check for a branch or tag name; `git check-ref-format` decides the rest.
pub(crate) fn ref_name(value: &str) -> Result<&str, GitError> {
    revision(value, false)?;
    if value == "HEAD"
        || value.contains("@{")
        || value.contains(':')
        || value.contains('~')
        || value.contains('^')
    {
        return Err(invalid("分支或标签名称无效"));
    }
    Ok(value)
}

pub(crate) fn remote_name(value: &str) -> Result<&str, GitError> {
    let mut chars = value.chars();
    let valid = value.len() <= 64
        && chars.next().is_some_and(|c| c.is_ascii_alphanumeric())
        && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'));
    if valid {
        Ok(value)
    } else {
        Err(invalid(
            "远程仓库名称只能包含字母、数字、点、下划线和连字符",
        ))
    }
}

/// `user@host:path` without a scheme.
fn scp_like(value: &str) -> bool {
    let Some((user, rest)) = value.split_once('@') else {
        return false;
    };
    let Some((host, path)) = rest.split_once(':') else {
        return false;
    };
    !user.is_empty()
        && user
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        && !host.is_empty()
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-'))
        && !path.is_empty()
        && !path.starts_with('-')
}

pub(crate) fn remote_url(value: &str) -> Result<&str, GitError> {
    let error =
        || invalid("远程地址无效：仅支持 https、http、ssh、git、file 地址或 user@host:path");
    if value.is_empty()
        || value.len() > MAX_URL_BYTES
        || value.starts_with('-')
        || value.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(error());
    }
    if let Some((scheme, _)) = value.split_once("://") {
        let url = reqwest::Url::parse(value).map_err(|_| error())?;
        let scheme = scheme.to_ascii_lowercase();
        let host_ok = url.host_str().is_some_and(|host| !host.is_empty());
        return match scheme.as_str() {
            "https" | "http" | "ssh" | "git" if host_ok => Ok(value),
            "file" => Ok(value),
            _ => Err(error()),
        };
    }
    if value.contains("::") || !scp_like(value) {
        return Err(error());
    }
    Ok(value)
}

/// Display form of a remote URL: protocol, host and whether credentials were removed.
pub(crate) struct UrlInfo {
    pub display: String,
    pub protocol: &'static str,
    pub host: Option<String>,
    /// `host` or `host:port` in lower case, used to find saved credentials.
    pub authority: Option<String>,
    pub had_credentials: bool,
}
pub(crate) fn url_info(value: &str) -> UrlInfo {
    if let Some((scheme, _)) = value.split_once("://") {
        let protocol = match scheme.to_ascii_lowercase().as_str() {
            "https" => "https",
            "http" => "http",
            "ssh" | "git+ssh" | "ssh+git" => "ssh",
            "git" => "git",
            "file" => "file",
            _ => "other",
        };
        if let Ok(mut url) = reqwest::Url::parse(value) {
            let mut had_credentials = false;
            if !url.username().is_empty() || url.password().is_some() {
                let userinfo = match url.password() {
                    Some(password) => format!("{}:{password}", url.username()),
                    None => url.username().to_string(),
                };
                let (user, removed) = strip_userinfo(&userinfo);
                had_credentials = removed;
                let _ = url.set_password(None);
                let _ = url.set_username(user.as_deref().unwrap_or(""));
            }
            let host = url.host_str().filter(|h| !h.is_empty()).map(str::to_string);
            let authority = host.as_ref().map(|host| match url.port() {
                Some(port) => format!("{}:{port}", host.to_ascii_lowercase()),
                None => host.to_ascii_lowercase(),
            });
            // `Url` normalises the text; keep the input when nothing was removed.
            let display = if had_credentials {
                url.to_string()
            } else {
                value.to_string()
            };
            return UrlInfo {
                display,
                protocol,
                host,
                authority,
                had_credentials,
            };
        }
        return UrlInfo {
            display: super::error::redact(value),
            protocol,
            host: None,
            authority: None,
            had_credentials: false,
        };
    }
    if scp_like(value) {
        let host = value
            .split_once('@')
            .and_then(|(_, rest)| rest.split_once(':'))
            .map(|(host, _)| host.to_string());
        return UrlInfo {
            display: value.to_string(),
            protocol: "ssh",
            authority: host.as_ref().map(|h| h.to_ascii_lowercase()),
            host,
            had_credentials: false,
        };
    }
    let local = value.starts_with('/')
        || value.starts_with('.')
        || value.as_bytes().get(1) == Some(&b':')
        || value.starts_with("\\\\");
    UrlInfo {
        display: value.to_string(),
        protocol: if local { "file" } else { "other" },
        host: None,
        authority: None,
        had_credentials: false,
    }
}

/// Commit or tag message: not blank, bounded, no NUL.
pub(crate) fn message(value: &str, max: usize) -> Result<&str, GitError> {
    if value.trim().is_empty() {
        return Err(invalid("提交说明不能为空"));
    }
    if value.len() > max || value.contains('\0') {
        return Err(invalid("说明过长或包含无效字符"));
    }
    Ok(value)
}

/// `user.name` / `user.email` / credential user names.
pub(crate) fn short_text(value: &str, what: &str) -> Result<String, GitError> {
    let value = value.trim();
    if value.is_empty()
        || value.chars().count() > 256
        || value.starts_with('-')
        || value.chars().any(char::is_control)
    {
        return Err(GitError::invalid(format!(
            "{what}无效：不能为空、以“-”开头、包含控制字符或超过 256 个字符"
        )));
    }
    Ok(value.to_string())
}

/// Saved credential host: `example.com` or `example.com:8443`, lower case.
pub(crate) fn host(value: &str) -> Result<String, GitError> {
    let value = value.trim().to_ascii_lowercase();
    let (name, port) = match value.split_once(':') {
        Some((name, port)) => (name, Some(port)),
        None => (value.as_str(), None),
    };
    let name_ok = !name.is_empty()
        && name.len() <= 253
        && !name.starts_with(['.', '-'])
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '-'));
    let port_ok = port.is_none_or(|port| {
        !port.is_empty()
            && port.len() <= 5
            && port.bytes().all(|b| b.is_ascii_digit())
            && port.parse::<u32>().is_ok_and(|p| (1..=65535).contains(&p))
    });
    if name_ok && port_ok {
        Ok(value)
    } else {
        Err(invalid(
            "主机名无效，例如 github.com 或 git.example.com:8443",
        ))
    }
}

pub(crate) fn token(value: &str) -> Result<&str, GitError> {
    if value.is_empty()
        || value.len() > 4096
        || value.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(invalid(
            "令牌不能为空、包含空白或控制字符，且不超过 4096 个字符",
        ));
    }
    Ok(value)
}

/// `http://`, `https://`, `socks5://` or `socks5h://` with a host.
pub(crate) fn proxy_url(value: &str) -> Result<reqwest::Url, GitError> {
    reqwest::Url::parse(value.trim())
        .ok()
        .filter(|url| {
            matches!(url.scheme(), "http" | "https" | "socks5" | "socks5h")
                && url.host_str().is_some_and(|host| !host.is_empty())
                && !value.chars().any(char::is_control)
        })
        .ok_or_else(|| {
            invalid("代理地址无效：需要 http://、https://、socks5:// 或 socks5h:// 开头并包含主机")
        })
}

/// Display form of a proxy without credentials.
pub(crate) fn proxy_display(value: &str) -> String {
    match reqwest::Url::parse(value) {
        Ok(mut url) => {
            let _ = url.set_password(None);
            let _ = url.set_username("");
            url.to_string().trim_end_matches('/').to_string()
        }
        Err(_) => super::error::redact(value),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths_stay_inside_the_work_tree() {
        for ok in [
            "a.md",
            "笔记/第 1 章.md",
            "dir/sub/file name.md",
            ".gitignore",
            "x/.git",
        ] {
            assert!(path(ok).is_ok(), "{ok}");
        }
        for bad in [
            "",
            "/etc/passwd",
            "../x",
            "a/../b",
            "a/./b",
            "./a",
            "a\\b",
            "C:/x",
            "c:x",
            ".git/config",
            ".GIT/hooks/x",
            "a\nb",
            "a\0b",
            "a//b",
            "dir/",
        ] {
            assert!(path(bad).is_err(), "{bad:?}");
        }
        assert!(path(&"a".repeat(4097)).is_err());
        assert_eq!(
            paths(&["a".into(), "a".into(), "b".into()]).unwrap(),
            ["a", "b"]
        );
    }
    #[test]
    fn revisions_cannot_become_options() {
        for ok in [
            "main",
            "origin/main",
            "HEAD~2",
            "v1.0^{commit}",
            "stash@{1}",
            "功能/分支",
            "fix#12",
            "abc123",
        ] {
            assert!(revision(ok, false).is_ok(), "{ok}");
        }
        for bad in ["", "-x", "--output=x", "a b", "a\tb", "a..b", "a\\b", "x*"] {
            assert!(revision(bad, false).is_err(), "{bad:?}");
        }
        assert!(revision("main..feature", true).is_ok());
        assert!(revision("^main", true).is_ok());
        assert!(ref_name("feature/x").is_ok());
        for bad in ["HEAD", "@{-1}", "a:b", "x~1"] {
            assert!(ref_name(bad).is_err(), "{bad}");
        }
        assert!(hex("abcd") && hex("ABCDEF0123") && !hex("abc") && !hex("xyz1"));
    }
    #[test]
    fn remotes_and_urls_are_restricted() {
        for ok in ["origin", "up-stream", "my.remote_2"] {
            assert!(remote_name(ok).is_ok(), "{ok}");
        }
        for bad in ["", "-x", ".x", "a b", "a/b", &"a".repeat(65)] {
            assert!(remote_name(bad).is_err(), "{bad}");
        }
        for ok in [
            "https://github.com/o/r.git",
            "http://host:8080/r",
            "ssh://git@host:22/r.git",
            "git://host/r",
            "git@github.com:o/r.git",
            "file:///C:/repos/r.git",
            "file:///srv/r.git",
        ] {
            assert!(remote_url(ok).is_ok(), "{ok}");
        }
        for bad in [
            "ext::sh -c touch% /tmp/x",
            "fd::3",
            "-uhelp",
            "https://",
            "ftp://host/r",
            "/srv/r.git",
            "host:path",
            "https://h/a b",
            "transport::https://h",
            "git@host:-oProxyCommand=x",
        ] {
            assert!(remote_url(bad).is_err(), "{bad}");
        }
    }
    #[test]
    fn url_display_hides_credentials() {
        let info = url_info("https://user:token@Example.com:8443/r.git");
        assert_eq!(info.display, "https://user@example.com:8443/r.git");
        assert!(info.had_credentials);
        assert_eq!(info.authority.as_deref(), Some("example.com:8443"));
        assert_eq!(info.protocol, "https");
        let info = url_info("git@github.com:o/r.git");
        assert_eq!(
            (info.protocol, info.host.as_deref()),
            ("ssh", Some("github.com"))
        );
        assert!(!info.had_credentials);
        let info = url_info("https://github.com/o/r");
        assert_eq!(info.display, "https://github.com/o/r");
        assert_eq!(url_info("D:/repos/r.git").protocol, "file");
        assert_eq!(url_info("weird").protocol, "other");
    }
    #[test]
    fn hosts_tokens_and_proxies() {
        assert_eq!(host("GitHub.com").unwrap(), "github.com");
        assert_eq!(
            host("git.example.com:8443").unwrap(),
            "git.example.com:8443"
        );
        for bad in ["", "a b", "x:0", "x:99999", "-x", "h/x", "h:p"] {
            assert!(host(bad).is_err(), "{bad}");
        }
        assert!(token("ghp_x").is_ok());
        assert!(token("a b").is_err() && token("").is_err());
        assert!(proxy_url("socks5h://127.0.0.1:7890").is_ok());
        assert!(proxy_url("http://proxy:8080").is_ok());
        for bad in ["", "ftp://p", "file:///x", "127.0.0.1:7890"] {
            assert!(proxy_url(bad).is_err(), "{bad}");
        }
        assert_eq!(proxy_display("http://u:p@proxy:8080"), "http://proxy:8080");
        assert!(short_text("Li Yao", "用户名").is_ok());
        assert!(short_text("-x", "用户名").is_err() && short_text("a\nb", "用户名").is_err());
        assert!(message("  ", 10).is_err() && message("ok", 10).is_ok());
    }
}
