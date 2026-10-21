use super::*;

/// Resolve configured proxies only; never scan ports or disable TLS verification.
pub(crate) fn proxy() -> Option<String> {
    for key in [
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
        "HTTP_PROXY",
        "http_proxy",
    ] {
        if let Ok(value) = std::env::var(key) {
            if valid(&value) {
                return Some(value);
            }
        }
    }
    system_proxy()
}
fn valid(value: &str) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https" | "socks5" | "socks5h") && url.host_str().is_some()
    })
}
#[cfg(target_os = "macos")]
pub(crate) fn system_proxy() -> Option<String> {
    let output = Command::new("/usr/sbin/scutil")
        .arg("--proxy")
        .output()
        .ok()?;
    parse_macos(&String::from_utf8(output.stdout).ok()?)
}
#[cfg(target_os = "windows")]
pub(crate) fn system_proxy() -> Option<String> {
    use std::os::windows::process::CommandExt;
    let output = Command::new("reg.exe")
        .creation_flags(0x08000000)
        .args([
            "query",
            r"HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings",
        ])
        .output()
        .ok()?;
    let output = String::from_utf8_lossy(&output.stdout);
    if !output
        .lines()
        .any(|line| line.contains("ProxyEnable") && line.trim_end().ends_with("0x1"))
    {
        return None;
    }
    let value = output
        .lines()
        .find(|line| line.contains("ProxyServer"))?
        .split("REG_SZ")
        .nth(1)?
        .trim();
    let server = value
        .split(';')
        .find_map(|part| part.strip_prefix("https="))
        .unwrap_or(value);
    let value = if server.contains("://") {
        server.to_string()
    } else {
        format!("http://{server}")
    };
    valid(&value).then_some(value)
}
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub(crate) fn system_proxy() -> Option<String> {
    None
}
#[cfg(any(target_os = "macos", test))]
fn parse_macos(input: &str) -> Option<String> {
    let fields: HashMap<_, _> = input
        .lines()
        .filter_map(|line| line.trim().split_once(" : "))
        .collect();
    for (prefix, scheme) in [("HTTPS", "http"), ("HTTP", "http"), ("SOCKS", "socks5h")] {
        if fields.get(format!("{prefix}Enable").as_str()) != Some(&"1") {
            continue;
        }
        let host = fields.get(format!("{prefix}Proxy").as_str())?;
        let port = fields
            .get(format!("{prefix}Port").as_str())?
            .parse::<u16>()
            .ok()?;
        let value = format!("{scheme}://{host}:{port}");
        if valid(&value) {
            return Some(value);
        }
    }
    None
}
pub(super) fn apply(command: &mut Command) {
    if let Some(value) = proxy() {
        command
            .env("HTTPS_PROXY", &value)
            .env("HTTP_PROXY", &value)
            .env("ALL_PROXY", &value)
            .env("npm_config_https_proxy", &value)
            .env("npm_config_proxy", &value);
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn uses_enabled_system_proxy_without_port_scanning() {
        assert_eq!(
            parse_macos("HTTPEnable : 1\nHTTPProxy : 127.0.0.1\nHTTPPort : 7890"),
            Some("http://127.0.0.1:7890".into())
        );
        assert_eq!(
            parse_macos("HTTPEnable : 0\nHTTPProxy : 127.0.0.1\nHTTPPort : 7890"),
            None
        );
        assert!(!valid("file:///tmp/proxy"));
    }
}
