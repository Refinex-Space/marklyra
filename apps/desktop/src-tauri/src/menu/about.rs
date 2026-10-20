//! Native About surfaces share product information, not window chrome.
use tauri::{AppHandle, Runtime};

pub const MENU_ID: &str = "about-marklyra";
const NAME: &str = "MarkLyra";
const DESCRIPTION: &str = "专注写作的 Markdown 编辑器与阅读器";
const REPOSITORY: &str = "https://github.com/Refinex-Space/marklyra";
const COPYRIGHT: &str = "Copyright © 2026 refinex";
const ICON: &[u8] = include_bytes!("../../icons/128x128@2x.png");

#[cfg(target_os = "macos")]
#[path = "about/macos.rs"]
mod native;
#[cfg(windows)]
#[path = "about/windows.rs"]
mod native;

pub fn show<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    let dispatcher = app.clone();
    if let Err(error) = dispatcher.run_on_main_thread(move || {
        #[cfg(any(target_os = "macos", windows))]
        if let Err(error) = native::show(&app) {
            eprintln!("Cannot open About MarkLyra: {error}");
        }
        #[cfg(not(any(target_os = "macos", windows)))]
        let _ = app;
    }) {
        eprintln!("Cannot dispatch About MarkLyra: {error}");
    }
}
