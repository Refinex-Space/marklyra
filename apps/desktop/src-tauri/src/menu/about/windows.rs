use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager, Runtime};
use windows::{
    core::{s, w, BOOL, HRESULT, PCWSTR},
    Win32::{
        Foundation::{FreeLibrary, HWND, LPARAM, WPARAM},
        System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32},
        UI::{
            Controls::{
                TASKDIALOGCONFIG, TASKDIALOGCONFIG_0, TASKDIALOG_BUTTON, TASKDIALOG_NOTIFICATIONS,
                TDF_ALLOW_DIALOG_CANCELLATION, TDF_ENABLE_HYPERLINKS,
                TDF_POSITION_RELATIVE_TO_WINDOW, TDF_SIZE_TO_CONTENT, TDF_USE_HICON_MAIN,
                TDN_HYPERLINK_CLICKED,
            },
            WindowsAndMessaging::{CreateIconFromResourceEx, DestroyIcon, LR_DEFAULTCOLOR},
        },
    },
};

static OPEN: AtomicBool = AtomicBool::new(false);

struct OpenGuard;
impl Drop for OpenGuard {
    fn drop(&mut self) {
        OPEN.store(false, Ordering::Release);
    }
}

pub(super) fn show<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if OPEN.swap(true, Ordering::AcqRel) {
        return Ok(());
    }
    let _guard = OpenGuard;
    let parent = app
        .webview_windows()
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
        .and_then(|window| window.hwnd().ok())
        .unwrap_or_default();
    let title = wide("关于 MarkLyra");
    let name = wide(super::NAME);
    let content = wide(&format!(
        "版本 {}\n\n{}\n\n<a href=\"{}\">GitHub · Refinex-Space/marklyra</a>",
        app.package_info().version,
        super::DESCRIPTION,
        super::REPOSITORY,
    ));
    let footer = wide(super::COPYRIGHT);
    let okay = wide("确定");
    let button = TASKDIALOG_BUTTON {
        nButtonID: 1,
        pszButtonText: PCWSTR(okay.as_ptr()),
    };
    // SAFETY: Runs on Tauri's STA UI thread. All strings, the button and HICON
    // remain alive until the modal native dialog returns. PNG is a tracked input.
    unsafe {
        let icon = CreateIconFromResourceEx(super::ICON, true, 0x00030000, 64, 64, LR_DEFAULTCOLOR)
            .map_err(|error| error.to_string())?;
        let config = TASKDIALOGCONFIG {
            cbSize: std::mem::size_of::<TASKDIALOGCONFIG>() as u32,
            hwndParent: parent,
            dwFlags: TDF_ALLOW_DIALOG_CANCELLATION
                | TDF_ENABLE_HYPERLINKS
                | TDF_USE_HICON_MAIN
                | TDF_POSITION_RELATIVE_TO_WINDOW
                | TDF_SIZE_TO_CONTENT,
            pszWindowTitle: PCWSTR(title.as_ptr()),
            Anonymous1: TASKDIALOGCONFIG_0 { hMainIcon: icon },
            pszMainInstruction: PCWSTR(name.as_ptr()),
            pszContent: PCWSTR(content.as_ptr()),
            pszFooter: PCWSTR(footer.as_ptr()),
            cButtons: 1,
            pButtons: &button,
            nDefaultButton: 1,
            pfCallback: Some(callback),
            ..Default::default()
        };
        let result = task_dialog(&config);
        let _ = DestroyIcon(icon);
        result.map_err(|error| error.to_string())
    }
}

/// TaskDialogIndirect exists only in Common Controls v6. The packaged app has
/// Tauri's v6 manifest, but Rust test executables do not. Avoid a static import
/// that would prevent the entire executable from loading before any tests run.
unsafe fn task_dialog(config: &TASKDIALOGCONFIG) -> windows::core::Result<()> {
    type Show = unsafe extern "system" fn(
        *const TASKDIALOGCONFIG,
        *mut i32,
        *mut i32,
        *mut BOOL,
    ) -> HRESULT;
    // SAFETY: Use the OS library search path (and the active SxS manifest), never
    // a DLL from the document/current directory. Keep it loaded through the call.
    unsafe {
        let library = LoadLibraryExW(w!("comctl32.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32)?;
        let result = match GetProcAddress(library, s!("TaskDialogIndirect")) {
            Some(address) => {
                // The symbol is Microsoft's documented TASKDIALOGCONFIG ABI.
                let show: Show = std::mem::transmute(address);
                show(
                    config,
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                    std::ptr::null_mut(),
                )
                .ok()
            }
            None => Err(windows::core::Error::new(
                HRESULT(0x8007007fu32 as i32),
                "Windows Common Controls v6 is required for the About dialog",
            )),
        };
        let _ = FreeLibrary(library);
        result
    }
}

unsafe extern "system" fn callback(
    _window: HWND,
    notification: TASKDIALOG_NOTIFICATIONS,
    _wparam: WPARAM,
    _lparam: LPARAM,
    _data: isize,
) -> HRESULT {
    if notification == TDN_HYPERLINK_CLICKED {
        // Only the fixed project destination is opened, never callback-supplied text.
        if let Err(error) = open::that_detached(super::REPOSITORY) {
            eprintln!("Cannot open project repository: {error}");
        }
    }
    HRESULT(0)
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}
