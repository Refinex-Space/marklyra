use std::sync::{atomic::AtomicBool, Arc};

#[cfg(target_os = "macos")]
const MAX_IMAGE_BYTES: usize = 8 * 1024 * 1024;

/// Downloads only the URL already approved by the host's image action.
/// Document ownership, destination authorization and image validation stay with the caller.
pub(super) fn download_image(url: &str, cancelled: Arc<AtomicBool>) -> Result<Vec<u8>, String> {
    let url = checked_url(url)?;
    #[cfg(target_os = "macos")]
    {
        macos::download(&url, cancelled)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (url, cancelled);
        Err("此平台尚不支持受控图片下载".into())
    }
}

fn checked_url(input: &str) -> Result<tauri::Url, String> {
    let invalid = || "图片下载仅接受不含认证信息的 HTTP 或 HTTPS 网址".to_owned();
    if input.len() > 8192 || input.chars().any(char::is_control) {
        return Err(invalid());
    }
    let url = tauri::Url::parse(input).map_err(|_| invalid())?;
    let authority = input
        .split_once("://")
        .map(|(_, rest)| rest.split(['/', '?', '#']).next().unwrap_or(""));
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || authority.is_none_or(|part| part.contains('@'))
    {
        return Err(invalid());
    }
    Ok(url)
}

#[cfg(target_os = "macos")]
mod macos {
    use super::MAX_IMAGE_BYTES;
    use std::{
        io::Read,
        process::{Child, Command, ExitStatus, Stdio},
        sync::{atomic::Ordering, mpsc, Arc},
        thread,
        time::{Duration, Instant},
    };

    const FAILED: &str = "图片下载失败，请检查网址或网络连接";
    const CANCELLED: &str = "图片下载已取消";
    const TOO_LARGE: &str = "图片下载已停止：文件超过 8 MiB 上限";

    struct OwnedDownload {
        child: Child,
        reaped: bool,
    }
    impl Drop for OwnedDownload {
        fn drop(&mut self) {
            if !self.reaped {
                let _ = self.child.kill();
                let _ = self.child.wait();
            }
        }
    }

    enum OutputError {
        TooLarge,
        Read,
    }

    fn read_image(mut source: impl Read) -> Result<Vec<u8>, OutputError> {
        let mut output = Vec::new();
        let mut buffer = [0_u8; 32 * 1024];
        loop {
            // A single extra byte proves that an absent or false Content-Length
            // cannot bypass the limit; that byte is never appended to the image.
            let available = (MAX_IMAGE_BYTES - output.len() + 1).min(buffer.len());
            match source.read(&mut buffer[..available]) {
                Ok(0) => return Ok(output),
                Ok(count) if count > MAX_IMAGE_BYTES - output.len() => {
                    return Err(OutputError::TooLarge);
                }
                Ok(count) => output.extend_from_slice(&buffer[..count]),
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => return Err(OutputError::Read),
            }
        }
    }

    fn read_status(mut source: impl Read) -> Option<u16> {
        // --silent removes diagnostics; write-out sends only the HTTP status here.
        // Any unexpected stderr is discarded, never logged or returned to JS.
        let mut status = [0_u8; 3];
        if source.read_exact(&mut status).is_err() {
            return None;
        }
        let mut unexpected = [0_u8; 64];
        let mut extra = false;
        loop {
            match source.read(&mut unexpected) {
                Ok(0) => break,
                Ok(_) => extra = true,
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => return None,
            }
        }
        if extra || !status.iter().all(u8::is_ascii_digit) {
            return None;
        }
        Some(
            u16::from(status[0] - b'0') * 100
                + u16::from(status[1] - b'0') * 10
                + u16::from(status[2] - b'0'),
        )
    }

    pub(super) fn download(
        url: &tauri::Url,
        cancelled: Arc<super::AtomicBool>,
    ) -> Result<Vec<u8>, String> {
        if cancelled.load(Ordering::Acquire) {
            return Err(CANCELLED.into());
        }
        let mut command = Command::new("/usr/bin/curl");
        command
            .env_clear()
            .args([
                "--disable", // Must be first: never load a user or system curlrc.
                "--globoff",
                "--proto",
                "=http,https",
                "--proto-redir",
                "=http,https",
                "--no-location",
                "--max-redirs",
                "0",
                "--no-netrc",
                "--proxy",
                "",
                "--noproxy",
                "*",
                "--connect-timeout",
                "5",
                "--max-time",
                "15",
                "--retry",
                "0",
                "--silent",
                "--no-show-error",
                "--output",
                "-",
                "--write-out",
                "%{stderr}%{http_code}",
                "--url",
            ])
            .arg(url.as_str())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        let mut child = OwnedDownload {
            child: command.spawn().map_err(|_| FAILED.to_owned())?,
            reaped: false,
        };
        let stdout = child.child.stdout.take().ok_or(FAILED)?;
        let stderr = child.child.stderr.take().ok_or(FAILED)?;
        let (send, receive) = mpsc::sync_channel(1);
        let reader = thread::spawn(move || {
            let _ = send.send(read_image(stdout));
        });
        let status_reader = thread::spawn(move || read_status(stderr));
        let started = Instant::now();
        let mut output = None;
        let completion: Result<ExitStatus, &str> = loop {
            if cancelled.load(Ordering::Acquire) {
                break Err(CANCELLED);
            }
            if started.elapsed() > Duration::from_secs(16) {
                break Err(FAILED);
            }
            if output.is_none() {
                match receive.try_recv() {
                    Ok(Ok(bytes)) => output = Some(bytes),
                    Ok(Err(OutputError::TooLarge)) => break Err(TOO_LARGE),
                    Ok(Err(OutputError::Read)) => break Err(FAILED),
                    Err(mpsc::TryRecvError::Disconnected) => break Err(FAILED),
                    Err(mpsc::TryRecvError::Empty) => {}
                }
            }
            match child.child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) => thread::sleep(Duration::from_millis(10)),
                Err(_) => break Err(FAILED),
            }
        };
        if completion.is_err() {
            let _ = child.child.kill();
        }
        child.reaped = child.child.wait().is_ok();
        let _ = reader.join();
        let status = status_reader.join().ok().flatten();
        let exit = completion.map_err(str::to_owned)?;
        if cancelled.load(Ordering::Acquire) {
            return Err(CANCELLED.into());
        }
        if output.is_none() {
            output = Some(match receive.recv() {
                Ok(Ok(bytes)) => bytes,
                Ok(Err(OutputError::TooLarge)) => return Err(TOO_LARGE.into()),
                _ => return Err(FAILED.into()),
            });
        }
        if matches!(status, Some(300..=399)) {
            return Err("图片下载已拒绝：不跟随重定向".into());
        }
        if !exit.success() || !matches!(status, Some(200..=299)) {
            return Err(FAILED.into());
        }
        let bytes = output.ok_or(FAILED)?;
        if bytes.is_empty() {
            return Err("图片下载失败：服务器返回空内容".into());
        }
        Ok(bytes)
    }
}

#[cfg(test)]
#[path = "download_tests.rs"]
mod tests;
