//! Exercise the production native controls in an isolated, hidden Tauri window.
#[cfg(target_os = "macos")]
#[path = "../src/platform/ui_chrome/native_hover.rs"]
mod native_hover;
#[cfg(target_os = "macos")]
#[path = "../src/platform/ui_chrome/native_images.rs"]
mod native_images;
#[cfg(target_os = "macos")]
#[path = "../src/platform/ui_chrome/native_title.rs"]
mod native_title;
#[cfg(target_os = "macos")]
#[path = "../src/platform/ui_chrome/native_title_action.rs"]
mod native_title_action;
#[cfg(target_os = "macos")]
#[expect(
    unused_imports,
    reason = "Included unit tests use the standard harness; this native fixture has its own main"
)]
#[path = "../src/platform/ui_chrome/title_layout.rs"]
mod title_layout;
#[cfg(target_os = "macos")]
#[expect(
    unused_imports,
    reason = "Included unit tests use the standard harness; this native fixture has its own main"
)]
mod macos {
    include!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/src/platform/ui_chrome/macos.rs"
    ));
    pub(crate) mod regression {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/support/titlebar_settings_fixture.rs"
        ));
    }
}

// Only the Shell data and event delivery are doubled. All AppKit construction,
// transitions, layout, visibility and hit testing use the production implementation.
#[cfg(target_os = "macos")]
mod windows {
    pub fn emit_to_editor(
        app: &tauri::AppHandle,
        label: &str,
        event: &str,
        action: &str,
    ) -> Result<(), String> {
        use tauri::Emitter;
        app.emit_to(label, event, action)
            .map_err(|error| error.to_string())
    }
}
#[cfg(target_os = "macos")]
#[derive(Clone, Default, PartialEq)]
enum StatisticsUnit {
    #[default]
    Words,
    Characters,
    Lines,
    ReadingMinutes,
}
#[cfg(target_os = "macos")]
#[derive(Clone, Default)]
struct StatisticsSnapshot {
    unit: StatisticsUnit,
}
#[cfg(target_os = "macos")]
impl StatisticsSnapshot {
    fn menu_labels(&self) -> [(StatisticsUnit, String); 4] {
        [
            (StatisticsUnit::Words, "0 词".into()),
            (StatisticsUnit::Characters, "0 字符".into()),
            (StatisticsUnit::Lines, "0 行".into()),
            (StatisticsUnit::ReadingMinutes, "0 分钟".into()),
        ]
    }
}
#[cfg(target_os = "macos")]
struct DocumentChrome {
    path: Option<std::path::PathBuf>,
    file_proxy: bool,
    dirty: bool,
    statistics_label: String,
    statistics: StatisticsSnapshot,
    always_show_word_count: bool,
    dark: bool,
    outline_panel_open: bool,
    sidebar_open: bool,
    ai_panel_open: bool,
    graph_open: bool,
    graph_available: bool,
    source_mode: Option<bool>,
    can_close_document: bool,
    image_preview_open: bool,
    untitled_name: Option<String>,
}
#[cfg(target_os = "macos")]
impl DocumentChrome {
    fn title(&self) -> String {
        self.untitled_name
            .clone()
            .unwrap_or_else(|| "Layout fixture".into())
    }
}

#[cfg(target_os = "macos")]
fn main() {
    use tauri::{WebviewUrl, WebviewWindowBuilder};
    tauri::Builder::default()
        .setup(|app| {
            let window = WebviewWindowBuilder::new(
                app,
                "titlebar-settings-fixture",
                WebviewUrl::External("about:blank".parse().unwrap()),
            )
            .title("MarkLyra titlebar settings fixture")
            .visible(false)
            .incognito(true)
            .inner_size(1280.0, 800.0)
            .build()?;
            let sidebar_icons = std::env::args().any(|arg| arg == "--sidebar-icons");
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                if sidebar_icons {
                    macos::regression::verify_sidebar_icons(&window);
                } else {
                    macos::regression::verify_preferences_layout(&window);
                }
            }));
            if result.is_ok() {
                if sidebar_icons {
                    println!("Native sidebar icons passed: repeated open/close, light/dark appearance and independent table of contents");
                } else {
                    println!("Native settings transitions passed: visibility, non-overlapping frames and separate hit targets");
                }
            }
            app.handle().exit(if result.is_ok() { 0 } else { 1 });
            Ok(())
        })
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("titlebar settings fixture build failed")
        .run(|_, _| {});
}

#[cfg(not(target_os = "macos"))]
fn main() {
    println!("Native titlebar settings regression requires macOS");
}
