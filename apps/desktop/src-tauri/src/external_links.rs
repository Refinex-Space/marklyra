//! Explicit external URI opening; no file paths, custom protocols or shell text.
use tauri::{Url, WebviewWindow};

fn validate(value: &str) -> Result<Url, String> {
    if value.len() > 16_384
        || value
            .chars()
            .any(|value| value <= '\u{1f}' || value == '\u{7f}')
    {
        return Err("外部链接超过长度限制或含控制字符".to_owned());
    }
    let url = Url::parse(value).map_err(|_| "无效的外部链接")?;
    if !matches!(url.scheme(), "http" | "https" | "mailto")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("仅允许不带凭据的 HTTP、HTTPS 或 mailto 链接".to_owned());
    }
    Ok(url)
}

#[tauri::command]
pub async fn open_external_link(window: WebviewWindow, url: String) -> Result<(), String> {
    if !crate::windows::is_editor(&window)
        || !crate::windows::is_focused(&window).map_err(|error| error.to_string())?
    {
        return Err("外部链接仅允许由当前编辑窗口打开".to_owned());
    }
    let url = validate(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        open::that(url.as_str()).map_err(|error| format!("无法打开外部链接：{error}"))
    })
    .await
    .map_err(|_| "外部链接打开任务未完成".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn allows_only_explicit_web_and_mail_protocols_without_credentials() {
        for url in [
            "https://example.invalid/中文?q=a%26b#part",
            "http://localhost:8080/a",
            "mailto:hello@example.invalid?subject=hello",
        ] {
            assert!(validate(url).is_ok(), "{url}");
        }
        for url in [
            "file:///tmp/private.md",
            "javascript:alert(1)",
            "data:text/html,x",
            "marklyra://localhost/index.html",
            "custom:run",
            "/tmp/a.md",
            "--open",
            "https://user:pass@example.invalid",
            "https://user@example.invalid",
            "https://example.invalid/\nfile",
            "mailto:user@example.invalid\r\nBcc:other@example.invalid",
            &format!("https://example.invalid/{}", "a".repeat(16_384)),
        ] {
            assert!(validate(url).is_err(), "{url}");
        }
    }
    #[test]
    fn encoded_punctuation_remains_url_data_and_no_launcher_is_executed_by_tests() {
        let input = "https://example.invalid/?text=%26%26%20open%20file&query=%24%28x%29";
        assert_eq!(validate(input).unwrap().as_str(), input);
    }
}
