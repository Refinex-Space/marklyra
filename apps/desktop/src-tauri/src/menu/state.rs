use serde::Deserialize;
use std::{collections::HashMap, sync::Mutex};
use tauri::{menu::MenuItemKind, AppHandle, Manager, Runtime, WebviewWindow};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditorFacts {
    source_mode: bool,
    focus_mode: bool,
    typewriter_mode: bool,
    can_undo: bool,
    can_redo: bool,
    locked: bool,
    modal_open: bool,
    inline_allowed: bool,
    block_allowed: bool,
    inline_styles: Vec<String>,
    block_styles: Vec<String>,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum SidebarTab {
    Outline,
    #[default]
    Files,
    Search,
}
#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum FileView {
    #[default]
    Tree,
    Articles,
}
#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    context: String,
    serial: u64,
    ready: bool,
    blocked: bool,
    editor: Option<EditorFacts>,
    sidebar: bool,
    sidebar_tab: SidebarTab,
    #[serde(default)]
    outline_panel_open: bool,
    file_view: FileView,
    fullscreen: bool,
    statistics_open: bool,
    #[serde(default)]
    available_formats: Vec<String>,
    #[serde(default)]
    can_import: bool,
    /// The open document is saved on disk, so its file can be renamed from the title or menu.
    #[serde(default)]
    can_rename: bool,
    /// The first-screen home view covers the editor, so commands that edit it do nothing.
    #[serde(default)]
    home: bool,
    #[serde(default)]
    text_input_focused: bool,
}

#[derive(Default)]
pub struct MenuStates(Mutex<HashMap<String, Snapshot>>);
impl MenuStates {
    fn store(&self, label: &str, value: Snapshot) -> Result<(), String> {
        if value.serial > 9_007_199_254_740_991 || value.serial == 0 {
            return Err("菜单状态序号无效".into());
        }
        if value.available_formats.len() > 32
            || value.available_formats.iter().any(|format| {
                ![
                    "html",
                    "html-plain",
                    "pdf",
                    "image",
                    "docx",
                    "odt",
                    "rtf",
                    "epub",
                    "latex",
                    "wiki",
                    "rst",
                    "textile",
                    "opml",
                ]
                .contains(&format.as_str())
                    && !super::exports::is_custom_format(format)
            })
        {
            return Err("菜单导出格式无效".into());
        }
        if let Some(editor) = &value.editor {
            if editor.inline_styles.len() > 16 || editor.block_styles.len() > 32 {
                return Err("菜单状态样式数量超限".into());
            }
            for style in editor.inline_styles.iter().chain(&editor.block_styles) {
                if style.len() > 32
                    || !style
                        .bytes()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'_')
                {
                    return Err("菜单状态样式无效".into());
                }
            }
        }
        let mut windows = self.0.lock().map_err(|_| "菜单状态不可用")?;
        if let Some(previous) = windows.get(label) {
            if previous.context == value.context && previous.serial >= value.serial {
                return Ok(());
            }
        } else if windows.len() >= 256 {
            return Err("菜单状态窗口数量超限".into());
        }
        windows.insert(label.to_owned(), value);
        Ok(())
    }
    fn read(&self, label: &str) -> Option<Snapshot> {
        self.0.lock().ok()?.get(label).cloned()
    }
    pub(crate) fn release(&self, label: &str) {
        if let Ok(mut windows) = self.0.lock() {
            windows.remove(label);
        }
    }
}

impl Snapshot {
    pub(super) fn active(&self) -> Option<&EditorFacts> {
        self.editor
            .as_ref()
            .filter(|editor| self.ready && !self.blocked && !editor.modal_open)
    }
    pub(super) fn enabled(&self, action: &str) -> bool {
        if matches!(action, "quit" | "close") {
            return true;
        }
        if action == "view:statistics" && self.statistics_open {
            return self.ready && self.editor.is_some();
        }
        let Some(editor) = self.active() else {
            return false;
        };
        if self.home && crate::editor_commands::is_editor_action(action) {
            return false;
        }
        if self.text_input_focused
            && crate::editor_commands::is_editor_action(action)
            && !matches!(action, "find" | "replace")
        {
            return false;
        }
        if action == "import-document" {
            return self.can_import;
        }
        if action == "rename-document" {
            return self.can_rename && !editor.locked;
        }
        if let Some(format) = action.strip_prefix("export-") {
            return format == "html" || self.available_formats.iter().any(|item| item == format);
        }
        if action == "undo" {
            return !editor.locked && editor.can_undo;
        }
        if action == "redo" {
            return !editor.locked && editor.can_redo;
        }
        if action.starts_with("format:") {
            return editor.inline_allowed && !editor.source_mode && !editor.locked;
        }
        if action.starts_with("heading:") {
            return editor.block_allowed && !editor.source_mode && !editor.locked;
        }
        if action.starts_with("list:")
            || matches!(action, "code-block" | "math-block" | "indent" | "outdent")
        {
            return !editor.source_mode
                && !editor.locked
                && (!editor
                    .block_styles
                    .iter()
                    .any(|style| style == "meta_block")
                    || editor.block_allowed);
        }
        if matches!(action, "insert-table" | "hr") {
            return editor.block_allowed && !editor.source_mode && !editor.locked;
        }
        if action == "view:source" {
            return !editor.locked;
        }
        if action.starts_with("view:")
            && !matches!(action, "view:focus" | "view:typewriter" | "view:fullscreen")
        {
            return !editor.source_mode;
        }
        true
    }
    pub(super) fn checked(&self, action: &str) -> bool {
        let Some(editor) = self.editor.as_ref() else {
            return false;
        };
        match action {
            "view:source" => editor.source_mode,
            "view:focus" => editor.focus_mode,
            "view:typewriter" => editor.typewriter_mode,
            "view:sidebar" => self.sidebar,
            "view:outline" => self.outline_panel_open,
            "view:files" => {
                self.sidebar
                    && self.sidebar_tab == SidebarTab::Files
                    && self.file_view == FileView::Tree
            }
            "view:articles" => {
                self.sidebar
                    && self.sidebar_tab == SidebarTab::Files
                    && self.file_view == FileView::Articles
            }
            "view:workspace-search" => self.sidebar && self.sidebar_tab == SidebarTab::Search,
            "view:statistics" => self.statistics_open,
            "view:fullscreen" => self.fullscreen,
            _ => {
                if let Some(style) = action.strip_prefix("format:") {
                    return editor.inline_styles.iter().any(|item| item == style);
                }
                if let Some(style) = action.strip_prefix("list:") {
                    return editor.block_styles.iter().any(|item| item == style);
                }
                if let Some(level) = action.strip_prefix("heading:") {
                    let style = if level == "0" {
                        "paragraph".to_owned()
                    } else {
                        format!("header{level}")
                    };
                    return editor.block_styles.iter().any(|item| item == &style);
                }
                match action {
                    "code-block" => editor.block_styles.iter().any(|item| item == "fences"),
                    "math-block" => editor.block_styles.iter().any(|item| item == "math_block"),
                    _ => false,
                }
            }
        }
    }
}

pub(super) fn checkable(action: &str) -> bool {
    action.starts_with("heading:")
        || action.starts_with("format:")
        || action.starts_with("list:")
        || matches!(
            action,
            "code-block"
                | "math-block"
                | "view:source"
                | "view:focus"
                | "view:typewriter"
                | "view:sidebar"
                | "view:outline"
                | "view:files"
                | "view:articles"
                | "view:workspace-search"
                | "view:statistics"
                | "view:fullscreen"
        )
}
pub(super) fn current<R: Runtime>(app: &AppHandle<R>) -> Snapshot {
    let Some(window) = crate::windows::focused_editor(app) else {
        return Snapshot::default();
    };
    let value = app
        .try_state::<MenuStates>()
        .and_then(|state| state.read(window.label()));
    value
        .filter(|value| {
            app.try_state::<crate::window_services::WindowServices>()
                .is_some_and(|services| {
                    services
                        .with_editor_commands(window.label(), |state| {
                            state.validate_menu_context(&value.context)
                        })
                        .is_ok()
                })
        })
        .unwrap_or_default()
}

pub(super) fn update<R: Runtime>(
    items: Vec<MenuItemKind<R>>,
    state: &Snapshot,
    preview: bool,
) -> tauri::Result<()> {
    for item in items {
        match item {
            MenuItemKind::Submenu(menu) => {
                match menu.id().as_ref() {
                    "paragraph-menu" | "format-menu" => menu.set_enabled(
                        !preview
                            && state
                                .active()
                                .is_some_and(|editor| !editor.source_mode && !editor.locked),
                    )?,
                    "export-menu" | "find-menu" => {
                        menu.set_enabled(!preview && state.active().is_some())?
                    }
                    _ => {}
                }
                update(menu.items()?, state, preview)?;
            }
            MenuItemKind::Check(item) if super::action_for_id(item.id().as_ref()).is_some() => {
                let id = item.id().as_ref();
                item.set_enabled(super::action_enabled(id, preview) && state.enabled(id))?;
                if checkable(id) {
                    item.set_checked(state.checked(id))?;
                }
            }
            MenuItemKind::MenuItem(item) if super::action_for_id(item.id().as_ref()).is_some() => {
                let id = item.id().as_ref();
                item.set_enabled(if preview {
                    super::action_enabled(id, true)
                } else {
                    state.enabled(id)
                })?;
                if super::exports::custom_id(id).is_some() {
                    let available = id.strip_prefix("export-").is_some_and(|format| {
                        state.available_formats.iter().any(|item| item == format)
                    });
                    let text = item.text()?;
                    let next = super::exports::availability_label(&text, available);
                    if next != text {
                        item.set_text(next)?;
                    }
                }
                if let Some(label) = dependent_format_label(id) {
                    let available = id.strip_prefix("export-").is_some_and(|format| {
                        state.available_formats.iter().any(|item| item == format)
                    });
                    item.set_text(if available {
                        label.to_owned()
                    } else {
                        format!("{label}（需要 Pandoc）")
                    })?;
                }
                if id == "import-document" {
                    item.set_text(if state.can_import {
                        "导入…"
                    } else {
                        "导入…（需要 Pandoc）"
                    })?;
                }
                if id == "view:fullscreen" {
                    item.set_text(if state.fullscreen {
                        "退出全屏幕"
                    } else {
                        "进入全屏幕"
                    })?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn dependent_format_label(id: &str) -> Option<&'static str> {
    match id {
        "export-docx" => Some("Word（.docx）…"),
        "export-odt" => Some("OpenOffice（.odt）…"),
        "export-rtf" => Some("RTF…"),
        "export-epub" => Some("EPUB…"),
        "export-latex" => Some("LaTeX…"),
        "export-wiki" => Some("Media Wiki…"),
        "export-rst" => Some("reStructuredText…"),
        "export-textile" => Some("Textile…"),
        "export-opml" => Some("OPML…"),
        _ => None,
    }
}

#[tauri::command]
pub fn sync_editor_menu_state(window: WebviewWindow, snapshot: Snapshot) -> Result<(), String> {
    window
        .state::<crate::window_services::WindowServices>()
        .with_editor_commands(window.label(), |state| {
            state.validate_menu_context(&snapshot.context)?;
            window.state::<MenuStates>().store(window.label(), snapshot)
        })?;
    let app = window.app_handle().clone();
    let label = window.label().to_owned();
    window
        .run_on_main_thread(move || {
            // Inactive windows may publish state, but never paint the application menu.
            if crate::windows::focused_editor(&app).is_none_or(|window| window.label() != label) {
                return;
            }
            if let Err(error) = super::set_preview_context(&app, false) {
                eprintln!("Menu state update failed: {error}");
            }
        })
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn ready() -> Snapshot {
        Snapshot {
            ready: true,
            editor: Some(EditorFacts {
                inline_allowed: true,
                block_allowed: true,
                block_styles: vec!["paragraph".into()],
                ..Default::default()
            }),
            ..Default::default()
        }
    }
    #[test]
    fn source_locks_original_paragraph_format_sidebar_but_preserves_modes_and_find() {
        let mut state = ready();
        state.editor.as_mut().unwrap().source_mode = true;
        for action in [
            "heading:1",
            "format:strong",
            "list:ul",
            "code-block",
            "math-block",
            "insert-table",
            "hr",
            "view:sidebar",
            "view:outline",
            "view:statistics",
        ] {
            assert!(!state.enabled(action), "{action}");
        }
        for action in [
            "find",
            "replace",
            "view:source",
            "view:focus",
            "view:typewriter",
            "view:fullscreen",
            "save",
        ] {
            assert!(state.enabled(action), "{action}");
        }
    }
    #[test]
    fn history_locked_modal_and_loading_states_gate_actions() {
        let mut state = ready();
        assert!(!state.enabled("undo"));
        assert!(!state.enabled("redo"));
        state.editor.as_mut().unwrap().can_undo = true;
        assert!(state.enabled("undo"));
        state.editor.as_mut().unwrap().locked = true;
        assert!(!state.enabled("undo"));
        assert!(!state.enabled("format:strong"));
        state.editor.as_mut().unwrap().modal_open = true;
        assert!(!state.enabled("find"));
        for action in ["quit", "close"] {
            assert!(state.enabled(action));
        }
        for action in ["new", "new-window", "preferences"] {
            assert!(!state.enabled(action));
        }
        state.ready = false;
        assert!(!state.enabled("view:focus"));
    }
    #[test]
    fn checked_state_is_confirmed_original_state_and_current_sidebar() {
        let mut state = ready();
        state.editor.as_mut().unwrap().focus_mode = true;
        state.editor.as_mut().unwrap().inline_styles = vec!["strong".into()];
        assert!(state.checked("view:focus"));
        assert!(!state.checked("view:typewriter"));
        assert!(state.checked("format:strong"));
        assert!(state.checked("heading:0"));
        state.sidebar = true;
        state.sidebar_tab = SidebarTab::Files;
        state.file_view = FileView::Articles;
        assert!(state.checked("view:articles"));
        assert!(!state.checked("view:files"));
        state.sidebar = false;
        assert!(!state.checked("view:articles"));
        state.outline_panel_open = true;
        assert!(state.checked("view:outline"));
        assert!(!state.sidebar);
    }
    #[test]
    fn late_snapshot_does_not_reverse_newer_same_context() {
        let states = MenuStates::default();
        let mut state = ready();
        state.context = "a".into();
        state.serial = 2;
        states.store("main", state.clone()).unwrap();
        state.serial = 1;
        state.fullscreen = true;
        states.store("main", state).unwrap();
        assert!(!states.read("main").unwrap().fullscreen);
        states.release("main");
        assert!(states.read("main").is_none());
    }
    #[test]
    fn unknown_fields_and_unbounded_state_are_rejected() {
        assert!(serde_json::from_value::<Snapshot>(
            serde_json::json!({"arbitraryAction": "delete"})
        )
        .is_err());
        let states = MenuStates::default();
        let mut value = ready();
        value.serial = 1;
        value.editor.as_mut().unwrap().inline_styles = vec!["x".repeat(33)];
        assert!(states.store("main", value).is_err());
    }
    #[test]
    fn sidebar_text_input_does_not_offer_document_mutations_but_find_and_save_stay_available() {
        let mut state = ready();
        state.text_input_focused = true;
        for action in [
            "undo",
            "format:strong",
            "heading:1",
            "view:source",
            "view:focus",
            "indent",
        ] {
            assert!(!state.enabled(action), "{action}");
        }
        for action in ["find", "replace", "save", "open"] {
            assert!(state.enabled(action), "{action}");
        }
    }
    #[test]
    fn creation_and_preferences_require_a_ready_unblocked_editor() {
        let mut state = ready();
        for action in ["new", "new-window", "preferences"] {
            assert!(state.enabled(action));
        }
        state.blocked = true;
        for action in ["new", "new-window", "preferences"] {
            assert!(!state.enabled(action));
        }
        state.blocked = false;
        state.ready = false;
        for action in ["new", "new-window", "preferences"] {
            assert!(!state.enabled(action));
        }
    }
    #[test]
    fn the_home_view_keeps_start_actions_but_not_commands_on_the_hidden_editor() {
        let mut state = ready();
        state.home = true;
        for action in [
            "new",
            "open",
            "open-folder",
            "quick-open",
            "recent-files",
            "preferences",
        ] {
            assert!(state.enabled(action), "{action}");
        }
        for action in ["undo", "format:strong", "heading:1", "find", "view:source"] {
            assert!(!state.enabled(action), "{action}");
        }
        state.home = false;
        assert!(state.enabled("find"));
    }
    #[test]
    fn an_open_statistics_panel_keeps_its_own_close_action_available() {
        let mut state = ready();
        state.statistics_open = true;
        state.blocked = true;
        assert!(state.enabled("view:statistics"));
        assert!(state.checked("view:statistics"));
        assert!(!state.enabled("view:source"));
        assert!(!state.enabled("format:strong"));
    }
}
