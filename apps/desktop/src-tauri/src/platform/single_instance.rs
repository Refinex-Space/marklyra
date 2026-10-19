//! Windows has no LaunchServices: Explorer starts a new process for every "open with".
//! A second launch hands its arguments to the running instance and exits, so one process
//! owns every window, the draft store and the window-state writer, as on macOS.
//!
//! Forwarded arguments are OS data, never renderer input: they become OS-owned open receipts
//! through the same path as this process's own command line.
#[cfg(windows)]
use std::ffi::OsString;

#[cfg(any(windows, test))]
const MAX_FORWARDED_UNITS: usize = 32 * 1024;
#[cfg(any(windows, test))]
const MAX_FORWARDED_ARGUMENTS: usize = 65;

/// Arguments travel as one UTF-16 buffer, each argument terminated by a NUL.
#[cfg(any(windows, test))]
fn encode(arguments: &[Vec<u16>]) -> Option<Vec<u16>> {
    let mut buffer = Vec::new();
    for argument in arguments.iter().take(MAX_FORWARDED_ARGUMENTS) {
        if argument.is_empty() || argument.contains(&0) {
            return None;
        }
        buffer.extend_from_slice(argument);
        buffer.push(0);
    }
    (buffer.len() <= MAX_FORWARDED_UNITS).then_some(buffer)
}

#[cfg(any(windows, test))]
fn decode(buffer: &[u16]) -> Vec<Vec<u16>> {
    if buffer.len() > MAX_FORWARDED_UNITS || buffer.last().is_some_and(|unit| *unit != 0) {
        return Vec::new();
    }
    buffer
        .split(|unit| *unit == 0)
        .filter(|part| !part.is_empty())
        .take(MAX_FORWARDED_ARGUMENTS)
        .map(<[u16]>::to_vec)
        .collect()
}

/// Returns `false` when another instance received this launch and this process must exit.
pub fn acquire_or_forward() -> bool {
    #[cfg(windows)]
    {
        if cfg!(debug_assertions) && std::env::var_os("MARKLYRA_ALLOW_MULTIPLE_INSTANCES").is_some()
        {
            return true;
        }
        windows::acquire_or_forward()
    }
    #[cfg(not(windows))]
    true
}

/// Starts delivering forwarded launches to this (primary) instance.
pub fn listen(app: &tauri::AppHandle) {
    #[cfg(windows)]
    windows::listen(app);
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
fn deliver(app: &tauri::AppHandle, arguments: Vec<OsString>) {
    crate::os_open::receive_arguments(app, arguments);
}

#[cfg(windows)]
mod windows {
    use super::{decode, deliver, encode, OsString};
    use std::{
        os::windows::ffi::{OsStrExt, OsStringExt},
        sync::{Mutex, OnceLock},
        thread,
        time::Duration,
    };
    use tauri::AppHandle;
    use windows::{
        core::{w, PCWSTR},
        Win32::{
            Foundation::{GetLastError, ERROR_ALREADY_EXISTS, HWND, LPARAM, LRESULT, WPARAM},
            System::{
                DataExchange::COPYDATASTRUCT, LibraryLoader::GetModuleHandleW,
                Threading::CreateMutexW,
            },
            UI::WindowsAndMessaging::{
                AllowSetForegroundWindow, CreateWindowExW, DefWindowProcW, DispatchMessageW,
                FindWindowExW, GetMessageW, RegisterClassW, SendMessageTimeoutW, TranslateMessage,
                ASFW_ANY, HWND_MESSAGE, MSG, SMTO_ABORTIFHUNG, WINDOW_EX_STYLE, WINDOW_STYLE,
                WM_COPYDATA, WNDCLASSW,
            },
        },
    };

    const CLASS: PCWSTR = w!("MarkLyraInstanceMessageWindow");
    /// Identifies this protocol so unrelated WM_COPYDATA senders are ignored.
    const MAGIC: usize = 0x4d4c_5901;

    static APP: OnceLock<AppHandle> = OnceLock::new();
    /// Launches forwarded before the application handle exists are delivered on `listen`.
    static EARLY: Mutex<Vec<Vec<OsString>>> = Mutex::new(Vec::new());

    pub(super) fn acquire_or_forward() -> bool {
        // SAFETY: plain Win32 calls with valid constant arguments. The mutex handle is
        // intentionally never closed: it must live exactly as long as this process.
        unsafe {
            let Ok(mutex) = CreateMutexW(None, true, w!("Local\\MarkLyra.SingleInstance.v1"))
            else {
                // Without the mutex there is nothing to coordinate; run as an ordinary instance.
                return true;
            };
            // A HANDLE has no destructor: leaving it open keeps the mutex for the process lifetime.
            let _ = mutex;
            if GetLastError() != ERROR_ALREADY_EXISTS {
                start_window();
                return true;
            }
        }
        let arguments: Vec<Vec<u16>> = std::env::args_os()
            .skip(1)
            .map(|argument| argument.encode_wide().collect())
            .collect();
        let Some(buffer) = encode(&arguments) else {
            // Malformed arguments are never forwarded; the running instance simply comes forward.
            return !forward(&[]);
        };
        !forward(&buffer)
    }

    /// Delivers the launch to the running instance; false if none answered in time.
    fn forward(buffer: &[u16]) -> bool {
        // SAFETY: the COPYDATASTRUCT and the buffer outlive the synchronous send.
        unsafe {
            let _ = AllowSetForegroundWindow(ASFW_ANY);
            for _ in 0..100 {
                if let Ok(target) = FindWindowExW(Some(HWND_MESSAGE), None, CLASS, PCWSTR::null()) {
                    let data = COPYDATASTRUCT {
                        dwData: MAGIC,
                        cbData: u32::try_from(std::mem::size_of_val(buffer)).unwrap_or(0),
                        lpData: buffer.as_ptr() as *mut _,
                    };
                    let mut result = 0usize;
                    let sent = SendMessageTimeoutW(
                        target,
                        WM_COPYDATA,
                        WPARAM(0),
                        LPARAM(&data as *const COPYDATASTRUCT as isize),
                        SMTO_ABORTIFHUNG,
                        5_000,
                        Some(&mut result),
                    );
                    if sent.0 != 0 {
                        return true;
                    }
                }
                // The primary may still be creating its window.
                thread::sleep(Duration::from_millis(50));
            }
        }
        false
    }

    unsafe extern "system" fn procedure(
        window: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if message == WM_COPYDATA && lparam.0 != 0 {
            // SAFETY: WM_COPYDATA's lParam points to a COPYDATASTRUCT valid for this call.
            let data = unsafe { &*(lparam.0 as *const COPYDATASTRUCT) };
            if data.dwData == MAGIC
                && !data.lpData.is_null()
                && (data.cbData as usize).is_multiple_of(2)
                && data.cbData as usize <= 2 * super::MAX_FORWARDED_UNITS
            {
                // SAFETY: lpData/cbData describe a readable buffer for the duration of the call.
                let units = unsafe {
                    std::slice::from_raw_parts(data.lpData as *const u16, data.cbData as usize / 2)
                };
                let arguments: Vec<OsString> = decode(units)
                    .into_iter()
                    .map(|argument| OsString::from_wide(&argument))
                    .collect();
                match APP.get() {
                    Some(app) => deliver(app, arguments),
                    None => {
                        if let Ok(mut early) = EARLY.lock() {
                            early.push(arguments);
                        }
                    }
                }
                return LRESULT(1);
            }
        }
        // SAFETY: forwards an unhandled message of this window to the default procedure.
        unsafe { DefWindowProcW(window, message, wparam, lparam) }
    }

    /// The message-only window must exist as soon as the mutex is owned, so it is created on
    /// the dedicated thread before the application handle is available.
    pub(super) fn start_window() {
        thread::spawn(|| {
            // SAFETY: class registration and a message-only window owned by this thread;
            // the loop ends only with the process.
            unsafe {
                let Ok(instance) = GetModuleHandleW(None) else {
                    return;
                };
                let class = WNDCLASSW {
                    lpfnWndProc: Some(procedure),
                    hInstance: instance.into(),
                    lpszClassName: CLASS,
                    ..Default::default()
                };
                if RegisterClassW(&class) == 0 {
                    return;
                }
                if CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    CLASS,
                    w!("MarkLyra"),
                    WINDOW_STYLE::default(),
                    0,
                    0,
                    0,
                    0,
                    Some(HWND_MESSAGE),
                    None,
                    Some(instance.into()),
                    None,
                )
                .is_err()
                {
                    return;
                }
                let mut message = MSG::default();
                while GetMessageW(&mut message, None, 0, 0).as_bool() {
                    let _ = TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }
        });
    }

    pub(super) fn listen(app: &AppHandle) {
        let _ = APP.set(app.clone());
        let early = EARLY
            .lock()
            .map(|mut early| std::mem::take(&mut *early))
            .unwrap_or_default();
        for arguments in early {
            deliver(app, arguments);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().collect()
    }

    #[test]
    fn arguments_round_trip_with_unicode_and_spaces() {
        let arguments = vec![wide(r"C:\笔记 本\README.md"), wide("file:///C:/a%20b.md")];
        let buffer = encode(&arguments).unwrap();
        assert_eq!(decode(&buffer), arguments);
    }

    #[test]
    fn malformed_or_oversized_payloads_are_dropped_not_truncated() {
        assert!(encode(&[wide("a"), Vec::new()]).is_none());
        assert!(encode(&[vec![b'a' as u16, 0, b'b' as u16]]).is_none());
        assert!(encode(&[vec![b'a' as u16; MAX_FORWARDED_UNITS]]).is_none());
        assert!(decode(&wide("no terminator")).is_empty());
        assert!(decode(&vec![b'a' as u16; MAX_FORWARDED_UNITS + 1]).is_empty());
        assert!(decode(&[]).is_empty());
    }

    #[test]
    fn at_most_one_more_than_the_open_limit_is_forwarded() {
        let many: Vec<_> = (0..200)
            .map(|index| wide(&format!("f{index}.md")))
            .collect();
        let buffer = encode(&many).unwrap();
        assert_eq!(decode(&buffer).len(), MAX_FORWARDED_ARGUMENTS);
    }
}
