//! Clipboard access is explicit and confined to the trusted main webview.
//! No clipboard monitoring or disk persistence. Explicit image reads are bounded raster snapshots.
mod format;
mod image;
pub(crate) mod native_input;
pub use image::{ClipboardImage, NativeImage};
pub(crate) use native_input::NativeInputHost;
#[cfg(target_os = "macos")]
pub(crate) mod macos;
#[cfg(target_os = "macos")]
mod rtf;
#[cfg(windows)]
mod windows;

mod content;
pub use content::{Content, MAX_FORMAT_BYTES};
#[cfg(not(target_os = "macos"))]
use std::sync::{Arc, Mutex};
use tauri::{State, WebviewWindow};

#[derive(Clone, Default)]
pub struct ClipboardHost {
    #[cfg(not(target_os = "macos"))]
    gate: Arc<Mutex<()>>,
}
fn authorize(window: &WebviewWindow) -> Result<(), String> {
    if !crate::windows::is_editor(window)
        || !window.is_focused().map_err(|error| error.to_string())?
    {
        return Err("剪贴板操作仅允许由当前编辑窗口发起".to_owned());
    }
    Ok(())
}

#[cfg(target_os = "macos")]
async fn on_main<T: Send + 'static>(
    window: WebviewWindow,
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    let dispatcher = window.clone();
    dispatcher
        .run_on_main_thread(move || {
            let result = authorize(&window).and_then(|_| work());
            let _ = sender.try_send(result);
        })
        .map_err(|error| error.to_string())?;
    // One response, asynchronously awaited; never block the main thread or hold
    // a clipboard mutex while dispatching into it (WebKit uses the same AppKit API).
    receiver
        .recv()
        .await
        .ok_or("剪贴板主线程任务未完成".to_owned())?
}

#[tauri::command]
pub async fn clipboard_read(
    window: WebviewWindow,
    host: State<'_, ClipboardHost>,
) -> Result<Content, String> {
    authorize(&window)?;
    #[cfg(target_os = "macos")]
    {
        let _ = host;
        on_main(window, macos::read_general).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let host = host.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _gate = host.gate.lock().map_err(|_| "剪贴板服务状态不可用")?;
            authorize(&window)?;
            #[cfg(windows)]
            {
                windows::read(&window)
            }
            #[cfg(not(windows))]
            Err("此平台尚未实现原生富文本剪贴板".to_owned())
        })
        .await
        .map_err(|_| "剪贴板读取任务未完成".to_owned())?
    }
}
#[tauri::command]
pub async fn clipboard_read_image(
    window: WebviewWindow,
    host: State<'_, ClipboardHost>,
) -> Result<Option<ClipboardImage>, String> {
    authorize(&window)?;
    #[cfg(target_os = "macos")]
    let raw = {
        let _ = host;
        on_main(window, macos::read_image_general).await?
    };
    #[cfg(not(target_os = "macos"))]
    let raw = {
        let host = host.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _gate = host.gate.lock().map_err(|_| "剪贴板服务状态不可用")?;
            authorize(&window)?;
            #[cfg(windows)]
            {
                windows::read_image(&window)
            }
            #[cfg(not(windows))]
            {
                Err::<Option<NativeImage>, _>("此平台尚未实现原生图片剪贴板".to_owned())
            }
        })
        .await
        .map_err(|_| "剪贴板读取任务未完成".to_owned())??
    };
    tauri::async_runtime::spawn_blocking(move || raw.map(NativeImage::convert).transpose())
        .await
        .map_err(|_| "剪贴板图片转换任务未完成".to_owned())?
}
#[tauri::command]
pub async fn clipboard_write(
    window: WebviewWindow,
    host: State<'_, ClipboardHost>,
    data: Content,
) -> Result<(), String> {
    authorize(&window)?;
    data.validate()?;
    #[cfg(target_os = "macos")]
    {
        let _ = host;
        on_main(window, move || macos::write_general(&data)).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let host = host.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _gate = host.gate.lock().map_err(|_| "剪贴板服务状态不可用")?;
            authorize(&window)?;
            #[cfg(windows)]
            {
                windows::write(&window, &data)
            }
            #[cfg(not(windows))]
            Err("此平台尚未实现原生富文本剪贴板".to_owned())
        })
        .await
        .map_err(|_| "剪贴板写入任务未完成".to_owned())?
    }
}

/// Native-only source snapshot. File paths never cross renderer IPC.
pub(crate) enum NativeClipboardInput {
    Files(Vec<std::path::PathBuf>),
    Content(Content),
    Image(NativeImage),
    Empty,
}

pub(crate) async fn read_native_input(
    window: WebviewWindow,
) -> Result<native_input::NativeClipboardSnapshot, String> {
    authorize(&window)?;
    #[cfg(target_os = "macos")]
    {
        on_main(window, || {
            objc2::rc::autoreleasepool(|_| {
                let board = objc2_app_kit::NSPasteboard::generalPasteboard();
                let before = board.changeCount();
                let snapshot =
                    native_input::NativeClipboardSnapshot::capture(macos::read_input(&board)?)?;
                if before != board.changeCount() {
                    return Err("读取期间剪贴板已改变，请重新粘贴".into());
                }
                Ok(snapshot)
            })
        })
        .await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        Err("此平台尚未验证统一原生文件与图片剪贴板快照".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn contents_validate_without_touching_the_system_clipboard() {
        assert!(Content {
            mark_html: None,
            text: "中文😀".into(),
            html: Some("<strong>中文😀</strong>".into())
        }
        .validate()
        .is_ok());
        assert!(Content {
            mark_html: None,
            text: "".into(),
            html: None
        }
        .validate()
        .is_ok());
        assert!(Content {
            mark_html: None,
            text: "a\0b".into(),
            html: None
        }
        .validate()
        .is_err());
        assert!(Content {
            mark_html: None,
            text: "".into(),
            html: Some("x".repeat(MAX_FORMAT_BYTES + 1))
        }
        .validate()
        .is_err());
        assert!(serde_json::from_str::<Content>(r#"{"text":"x","format":"shell"}"#).is_err());
    }
}
