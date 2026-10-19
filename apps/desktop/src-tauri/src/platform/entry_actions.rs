//! OS effects receive only host-verified paths. These functions never grant IO.
use crate::{clipboard::Content, window_services::EntryActionKind};
use std::path::Path;

pub(crate) fn clipboard_path(path: &Path) -> Result<Content, String> {
    let text = path
        .to_str()
        .filter(|v| !v.contains('\0'))
        .ok_or("路径无法转换为剪贴板文本")?
        .to_owned();
    let html = text
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;");
    let data = Content {
        text,
        html: Some(format!("<span>{html}</span>")),
        mark_html: None,
    };
    Ok(data)
}
pub(crate) fn dispatch(action: EntryActionKind, path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let status = match action {
        EntryActionKind::Reveal => std::process::Command::new("/usr/bin/open")
            .arg("-R")
            .arg(path)
            .status(),
        _ => return Err("文件动作不能通过系统路径调度".into()),
    };
    #[cfg(windows)]
    let status = match action {
        EntryActionKind::Reveal => std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path.display()))
            .status(),
        _ => return Err("此平台尚未接通此系统文件动作".into()),
    };
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = (action, path);
        Err("此平台尚未接通系统文件动作".into())
    }
    #[cfg(any(target_os = "macos", windows))]
    if status
        .map_err(|e| format!("无法启动系统文件动作：{e}"))?
        .success()
    {
        Ok(())
    } else {
        Err("系统文件动作未确认成功；请核对系统窗口，不会自动重放".into())
    }
}
#[cfg(target_os = "macos")]
pub(crate) async fn show_info(
    window: tauri::WebviewWindow,
    path: std::path::PathBuf,
) -> Result<(), String> {
    let (send, mut receive) = tauri::async_runtime::channel(1);
    let target = window.clone();
    window
        .run_on_main_thread(move || {
            let result = (|| {
                if !crate::windows::is_editor(&target)
                    || !crate::windows::is_focused(&target).map_err(|e| e.to_string())?
                {
                    return Err("简介操作窗口已关闭或失去焦点".into());
                }
                use objc2::{rc::autoreleasepool, MainThreadMarker};
                use objc2_app_kit::NSPasteboard;
                use objc2_foundation::{ns_string, NSArray, NSString};
                MainThreadMarker::new().ok_or("系统简介必须在主线程执行")?;
                autoreleasepool(|_| {
                    let board = NSPasteboard::pasteboardWithUniqueName();
                    let kind = ns_string!("NSFilenamesPboardType");
                    let types = NSArray::from_slice(&[kind]);
                    // A filenames property list consists only of validated NSStrings;
                    // no general pasteboard or caller-provided service is involved.
                    unsafe {
                        board.declareTypes_owner(&types, None);
                    }
                    let paths = NSArray::from_slice(&[&*NSString::from_str(
                        path.to_str().ok_or("路径无法编码")?,
                    )]);
                    if !unsafe { board.setPropertyList_forType(&paths, kind) } {
                        return Err("无法准备系统简介服务参数".into());
                    }
                    // Same public AppKit ABI as the generated NSApplication wrapper;
                    // existing AppKit linkage suffices without enabling extra APIs.
                    unsafe extern "C-unwind" {
                        fn NSPerformService(
                            name: &NSString,
                            board: Option<&NSPasteboard>,
                        ) -> objc2::runtime::Bool;
                    }
                    let ok =
                        unsafe { NSPerformService(ns_string!("Finder/Show Info"), Some(&board)) }
                            .as_bool();
                    board.clearContents();
                    if ok {
                        Ok(())
                    } else {
                        Err("系统显示简介服务未确认成功；不会自动重放".into())
                    }
                })
            })();
            let _ = send.try_send(result);
        })
        .map_err(|e| e.to_string())?;
    receive.recv().await.ok_or("系统简介主线程任务未完成")?
}
#[cfg(not(any(target_os = "macos", windows)))]
pub(crate) async fn show_info(
    _window: tauri::WebviewWindow,
    _path: std::path::PathBuf,
) -> Result<(), String> {
    Err("此平台尚未接通系统显示简介".into())
}
#[cfg(windows)]
pub(crate) async fn show_info(
    window: tauri::WebviewWindow,
    path: std::path::PathBuf,
) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::HWND,
            System::Com::{CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED},
            UI::Shell::{
                ShellExecuteExW, SEE_MASK_INVOKEIDLIST, SEE_MASK_NOASYNC, SHELLEXECUTEINFOW,
            },
        },
    };
    if !crate::windows::is_editor(&window)
        || !crate::windows::is_focused(&window).map_err(|e| e.to_string())?
    {
        return Err("属性操作窗口已关闭或失去焦点".into());
    }
    let owner = window.hwnd().map_err(|e| e.to_string())?.0 as usize;
    let path = path
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let (send, mut receive) = tauri::async_runtime::channel(1);
    // A dedicated STA avoids adopting an unrelated async pool COM apartment.
    std::thread::Builder::new()
        .name("file-properties".into())
        .spawn(move || {
            let result = (|| {
                // SAFETY: this dedicated thread owns its COM apartment and all
                // arguments remain live through the synchronous Shell call.
                unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok() }
                    .map_err(|e| e.to_string())?;
                struct Apartment;
                impl Drop for Apartment {
                    fn drop(&mut self) {
                        unsafe {
                            CoUninitialize();
                        }
                    }
                }
                let _apartment = Apartment;
                let verb = "properties"
                    .encode_utf16()
                    .chain(Some(0))
                    .collect::<Vec<_>>();
                let mut request = SHELLEXECUTEINFOW {
                    cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
                    fMask: SEE_MASK_INVOKEIDLIST | SEE_MASK_NOASYNC,
                    hwnd: HWND(owner as *mut _),
                    lpVerb: PCWSTR(verb.as_ptr()),
                    lpFile: PCWSTR(path.as_ptr()),
                    nShow: 1,
                    ..Default::default()
                };
                unsafe { ShellExecuteExW(&mut request) }.map_err(|e| e.to_string())
            })();
            let _ = send.try_send(result);
        })
        .map_err(|e| e.to_string())?;
    receive.recv().await.ok_or("系统属性线程未完成")?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn path_clipboard_has_plain_and_escaped_html_without_private_markup() {
        let data = clipboard_path(Path::new("/Owned/中<&\"'>.md")).unwrap();
        assert_eq!(data.text, "/Owned/中<&\"'>.md");
        assert_eq!(
            data.html.as_deref(),
            Some("<span>/Owned/中&lt;&amp;&quot;&#39;&gt;.md</span>")
        );
        assert!(data.mark_html.is_none());
    }
}
