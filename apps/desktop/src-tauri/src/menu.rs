use tauri::{
    menu::{
        CheckMenuItem, Menu, MenuBuilder, MenuItem, MenuItemBuilder, MenuItemKind, Submenu,
        SubmenuBuilder,
    },
    AppHandle, Runtime,
};
pub(crate) mod recent;
mod shortcuts;
pub(crate) mod state;
pub(crate) mod themes;

enum MenuEntry {
    Action(&'static str, &'static str, Option<&'static str>),
    Separator,
}
use MenuEntry::{Action, Separator};

const FILE: &[MenuEntry] = &[
    Action("new", "新建", Some("CmdOrCtrl+N")),
    Action("new-window", "新建窗口", Some("CmdOrCtrl+Shift+N")),
    #[cfg(target_os = "macos")]
    Action("new-tab", "新建标签页", Some("CmdOrCtrl+T")),
    Action("open", "打开…", Some("CmdOrCtrl+O")),
    Action("recent-files", "最近文件…", None),
    Action("marklyra-drafts", "恢复草稿…", None),
    Action("open-folder", "打开文件夹…", None),
    Separator,
    Action("save", "保存", Some("CmdOrCtrl+S")),
    Action("save-as", "另存为…", Some("CmdOrCtrl+Shift+S")),
    Separator,
    Action("import-document", "导入…", None),
    Action("export-menu", "导出", None),
    Action("print-preview", "打印预览…", Some("CmdOrCtrl+P")),
];
const EXPORT: &[MenuEntry] = &[
    Action("export-html", "HTML…", None),
    Action("export-html-plain", "HTML（无样式）…", None),
    Action("export-image", "图像…", None),
    Separator,
    Action("export-docx", "Word（.docx）…", None),
    Action("export-odt", "OpenOffice（.odt）…", None),
    Action("export-rtf", "RTF…", None),
    Action("export-epub", "EPUB…", None),
    Action("export-latex", "LaTeX…", None),
    Action("export-wiki", "Media Wiki…", None),
    Action("export-rst", "reStructuredText…", None),
    Action("export-textile", "Textile…", None),
    Action("export-opml", "OPML…", None),
];
const HISTORY: &[MenuEntry] = &[
    Action("undo", "撤销", Some("CmdOrCtrl+Z")),
    Action("redo", "重做", Some("CmdOrCtrl+Shift+Z")),
];
const SEARCH: &[MenuEntry] = &[
    Action("find", "查找…", Some("CmdOrCtrl+F")),
    // Do not use Cmd+H: it is macOS Hide, not a cross-platform replace shortcut.
    Action("replace", "查找并替换…", Some("CmdOrCtrl+Shift+F")),
];
const PARAGRAPH: &[MenuEntry] = &[
    Action("heading:1", "一级标题", Some("CmdOrCtrl+1")),
    Action("heading:2", "二级标题", Some("CmdOrCtrl+2")),
    Action("heading:3", "三级标题", Some("CmdOrCtrl+3")),
    Action("heading:4", "四级标题", Some("CmdOrCtrl+4")),
    Action("heading:5", "五级标题", Some("CmdOrCtrl+5")),
    Action("heading:6", "六级标题", Some("CmdOrCtrl+6")),
    Separator,
    Action("heading:0", "正文", Some("CmdOrCtrl+0")),
    Separator,
    Action("table-menu", "表格", None),
    Action("math-block", "数学公式块", Some("CmdOrCtrl+Shift+B")),
    Action("code-block", "代码块", Some("CmdOrCtrl+Shift+C")),
    Separator,
    Action("list:blockquote", "引用", Some("CmdOrCtrl+Shift+Q")),
    Separator,
    Action("list:ul", "无序列表", Some("CmdOrCtrl+Shift+U")),
    Action("list:ol", "有序列表", Some("CmdOrCtrl+Shift+O")),
    Action("list:tasklist", "任务列表", Some("CmdOrCtrl+Shift+X")),
    Action("list-indentation-menu", "列表缩进", None),
    Separator,
    Action("hr", "分隔线", Some("CmdOrCtrl+Shift+Minus")),
];
const TABLE: &[MenuEntry] = &[Action(
    "insert-table",
    "插入表格…",
    Some("CmdOrCtrl+Shift+T"),
)];
const LIST_INDENTATION: &[MenuEntry] = &[
    Action("indent", "增加缩进", Some("CmdOrCtrl+BracketRight")),
    Action("outdent", "减少缩进", Some("CmdOrCtrl+BracketLeft")),
];
const FORMAT: &[MenuEntry] = &[
    Action("format:strong", "加粗", Some("CmdOrCtrl+B")),
    Action("format:em", "斜体", Some("CmdOrCtrl+I")),
    Action("format:underline", "下划线", Some("CmdOrCtrl+U")),
    Action("format:code", "行内代码", None),
    Separator,
    Action("format:inline_math", "行内公式", None),
    Action("format:del", "删除线", None),
    Action("format:highlight", "高亮", Some("CmdOrCtrl+Shift+H")),
    Action("format:superscript", "上标", None),
    Action("format:subscript", "下标", None),
    Separator,
    Action("format:link", "链接…", Some("CmdOrCtrl+K")),
    Action("format:image", "图片…", None),
];
const VIEW: &[MenuEntry] = &[
    Action("view:source", "源代码模式", Some("CmdOrCtrl+/")),
    Separator,
    Action("view:focus", "专注模式", Some("F8")),
    Action("view:typewriter", "打字机模式", Some("F9")),
    Separator,
    Action(
        "view:sidebar",
        "显示／隐藏侧边栏",
        Some("CmdOrCtrl+Shift+L"),
    ),
    Action("view:outline", "大纲", Some("CmdOrCtrl+Ctrl+1")),
    Action("view:articles", "文档列表", Some("CmdOrCtrl+Ctrl+2")),
    Action("view:files", "文件树", Some("CmdOrCtrl+Ctrl+3")),
    Action("view:workspace-search", "搜索", Some("CmdOrCtrl+Shift+F")),
    Separator,
    Action("view:statistics", "字数统计", None),
    Action("view:outline-popover", "大纲窗口", None),
    Separator,
    Action("view:fullscreen", "全屏幕", Some("CmdOrCtrl+Ctrl+F")),
];
const THEMES: &[MenuEntry] = &[
    Action("theme:github", "Github", None),
    Action("theme:gothic", "Gothic", None),
    Action("theme:newsprint", "Newsprint", None),
    Action("theme:night", "Night", None),
    Action("theme:pixyll", "Pixyll", None),
    Action("theme:whitey", "Whitey", None),
];
const WINDOW: &[MenuEntry] = &[
    Action("close", "关闭窗口", Some("CmdOrCtrl+W")),
    #[cfg(target_os = "macos")]
    Separator,
    #[cfg(target_os = "macos")]
    Action("tab:next", "显示下一个标签页", Some("Ctrl+Tab")),
    #[cfg(target_os = "macos")]
    Action("tab:previous", "显示上一个标签页", Some("Ctrl+Shift+Tab")),
    #[cfg(target_os = "macos")]
    Action("tab:detach", "将标签页移到新窗口", None),
    #[cfg(target_os = "macos")]
    Action("tab:merge", "合并所有窗口", None),
    #[cfg(target_os = "macos")]
    Action("tab:toggle", "显示／隐藏标签栏", None),
];
const APPLICATION: &[MenuEntry] = &[
    Action("preferences", "偏好设置…", Some("CmdOrCtrl+,")),
    Action("quit", "退出 MarkLyra", Some("CmdOrCtrl+Q")),
];
const GROUPS: &[&[MenuEntry]] = &[
    FILE,
    EXPORT,
    HISTORY,
    SEARCH,
    PARAGRAPH,
    TABLE,
    LIST_INDENTATION,
    FORMAT,
    VIEW,
    THEMES,
    WINDOW,
    APPLICATION,
];
const WINDOW_SUBMENU_ID: &str = "native-window-menu";

fn item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    label: &str,
    accelerator: Option<&'static str>,
) -> tauri::Result<MenuItem<R>> {
    let mut builder = MenuItemBuilder::with_id(id, label);
    if let Some(accelerator) = shortcuts::resolve(id, accelerator) {
        builder = builder.accelerator(accelerator);
    }
    builder.build(app)
}

fn submenu<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    entries: &[MenuEntry],
) -> tauri::Result<Submenu<R>> {
    let id = match label {
        "段落" => "paragraph-menu",
        "格式" => "format-menu",
        "查找" => "find-menu",
        "导出" => "export-menu",
        "文件" => "file-menu",
        "显示" => "view-menu",
        _ => label,
    };
    let mut builder = SubmenuBuilder::with_id(app, id, label);
    for entry in entries {
        builder = match entry {
            Action("recent-files", _, _) => builder.item(&recent::build(app)?),
            Action("export-menu", label, _) => builder.item(&submenu(app, label, EXPORT)?),
            Action("table-menu", label, _) => builder.item(&submenu(app, label, TABLE)?),
            Action("list-indentation-menu", label, _) => {
                builder.item(&submenu(app, label, LIST_INDENTATION)?)
            }
            Action(id, label, accelerator) if state::checkable(id) => {
                builder.item(&CheckMenuItem::with_id(
                    app,
                    *id,
                    *label,
                    false,
                    false,
                    shortcuts::resolve(id, *accelerator),
                )?)
            }
            Action(id, label, accelerator) => builder.item(&item(app, id, label, *accelerator)?),
            Separator => builder.separator(),
        };
    }
    builder.build()
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let file = submenu(app, "文件", FILE)?;
    // SDK history is authoritative. Native undo would mutate DOM outside its transactions.
    let mut edit = SubmenuBuilder::new(app, "编辑");
    for entry in HISTORY {
        if let Action(id, label, accelerator) = entry {
            edit = edit.item(&item(app, id, label, *accelerator)?);
        }
    }
    edit = edit
        .separator()
        .cut_with_text("剪切")
        .copy_with_text("复制")
        .paste_with_text("粘贴")
        .select_all_with_text("全选")
        .separator();
    edit = edit.item(&submenu(app, "查找", SEARCH)?);
    let edit = edit.build()?;
    let paragraph = submenu(app, "段落", PARAGRAPH)?;
    let format = submenu(app, "格式", FORMAT)?;
    let view = submenu(app, "显示", VIEW)?;
    let themes = themes::build(app)?;
    let mut window = SubmenuBuilder::with_id(app, WINDOW_SUBMENU_ID, "窗口")
        .minimize_with_text("最小化")
        .maximize_with_text("缩放")
        .separator();
    for entry in WINDOW {
        if let Action(id, label, accelerator) = entry {
            window = window.item(&item(app, id, label, *accelerator)?);
        }
    }
    let window = window.build()?;
    let mut application = SubmenuBuilder::new(app, "MarkLyra")
        .about_with_text("关于 MarkLyra", None)
        .separator();
    for entry in APPLICATION {
        if let Action(id, label, accelerator) = entry {
            if *id == "quit" {
                #[cfg(target_os = "macos")]
                {
                    application = application
                        .separator()
                        .services_with_text("服务")
                        .separator()
                        .hide_with_text("隐藏 MarkLyra")
                        .hide_others_with_text("隐藏其他")
                        .show_all_with_text("显示全部")
                        .separator();
                }
            }
            application = application.item(&item(app, id, label, *accelerator)?);
        }
    }
    let application = application.build()?;
    MenuBuilder::new(app)
        .items(&[
            &application,
            &file,
            &edit,
            &paragraph,
            &format,
            &view,
            &themes,
            &window,
        ])
        .build()
}

#[cfg(target_os = "macos")]
pub fn register_window_menu<R: Runtime>(menu: &Menu<R>) -> tauri::Result<()> {
    // Muda resolves the submenu through NSApp.mainMenu's delegate. Before
    // app.set_menu this silently does nothing, even though the call returns Ok.
    let item = menu
        .get(WINDOW_SUBMENU_ID)
        .ok_or_else(|| std::io::Error::other("Window submenu is missing"))?;
    item.as_submenu()
        .ok_or_else(|| std::io::Error::other("Window item is not a submenu"))?
        .set_as_windows_menu_for_nsapp()
}

fn action_for_id(id: &str) -> Option<&str> {
    if themes::theme_id(id).is_some() {
        return Some(id);
    }
    if recent::record_id(id).is_some() {
        return Some(id);
    }
    GROUPS
        .iter()
        .flat_map(|entries| entries.iter())
        .find_map(|entry| {
            if let Action(action, _, _) = entry {
                if *action == id {
                    // Quit is coordinated natively across all editor windows.
                    return Some(*action);
                }
            }
            None
        })
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, event: tauri::menu::MenuEvent) {
    if let Some(action) = action_for_id(event.id().as_ref()) {
        let Some(window) = crate::windows::focused_editor(app) else {
            return;
        };
        if themes::theme_id(action).is_some() {
            // Native check items toggle before this event; only an accepted theme may
            // change the radio-like selection while the requested styles are pending.
            if let Err(error) = themes::sync(app, false) {
                eprintln!("Pending theme menu synchronization failed: {error}");
            }
        }
        // A check item toggles optimistically in AppKit/Muda. Keep confirmed
        // state until the SDK/host publishes the completed action.
        if let Err(error) = set_preview_context(app, false) {
            eprintln!("Pending menu synchronization failed: {error}");
        }
        if !state::current(app).enabled(action) {
            return;
        }
        if let Err(error) = crate::editor_commands::emit_menu_action(app, window.label(), action) {
            eprintln!("Menu event delivery failed: {error}");
        }
    }
}

/// Update the same native menu objects; never replace the app menu on focus.
/// This is presentation only: exports::handle_menu enforces routing separately.
pub fn set_preview_context<R: Runtime>(app: &AppHandle<R>, preview: bool) -> tauri::Result<()> {
    if let Some(menu) = app.menu() {
        update_items(menu.items()?, preview)?;
        state::update(menu.items()?, &state::current(app), preview)?;
    }
    themes::sync(app, preview || state::current(app).active().is_none())?;
    Ok(())
}
fn update_items<R: Runtime>(items: Vec<MenuItemKind<R>>, preview: bool) -> tauri::Result<()> {
    for item in items {
        match item {
            MenuItemKind::Submenu(menu) => update_items(menu.items()?, preview)?,
            MenuItemKind::Check(item) if action_for_id(item.id().as_ref()).is_some() => {
                item.set_enabled(action_enabled(item.id().as_ref(), preview))?;
            }
            MenuItemKind::MenuItem(item) if action_for_id(item.id().as_ref()).is_some() => {
                let id = item.id().as_ref();
                item.set_enabled(action_enabled(id, preview))?;
                if id == "print-preview" {
                    item.set_text(if !preview {
                        "打印预览…"
                    } else if cfg!(any(target_os = "macos", target_os = "windows")) {
                        "打印…"
                    } else {
                        "打印（暂不可用）"
                    })?;
                }
                if id == "close" {
                    item.set_text(if preview {
                        "关闭打印预览"
                    } else {
                        "关闭窗口"
                    })?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}
fn action_enabled(id: &str, preview: bool) -> bool {
    !preview
        || id == "quit"
        || id == "close"
        || id == "print-preview" && cfg!(any(target_os = "macos", target_os = "windows"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn theme_check_actions_use_the_same_preview_disablement_as_other_editor_actions() {
        for id in [
            "theme:github",
            "theme:night",
            "theme:中文主题",
            "save",
            "undo",
        ] {
            assert!(action_enabled(id, false));
            assert!(!action_enabled(id, true));
        }
        assert!(action_enabled("close", true));
        assert!(action_enabled("quit", true));
        assert_eq!(
            action_enabled("print-preview", true),
            cfg!(any(target_os = "macos", target_os = "windows"))
        );
    }

    #[test]
    fn all_supported_ids_keep_their_typed_payload_contract() {
        for id in [
            "new",
            "new-window",
            "open",
            "recent-files",
            "marklyra-drafts",
            "open-folder",
            "save",
            "save-as",
            "export-html",
            "print-preview",
            "undo",
            "redo",
            "close",
            "find",
            "replace",
            "insert-table",
            "code-block",
            "math-block",
            "hr",
            "preferences",
        ] {
            assert_eq!(action_for_id(id), Some(id));
        }
        for heading in 0..=6 {
            let id = format!("heading:{heading}");
            assert_eq!(action_for_id(&id), Some(id.as_str()));
        }
        for (prefix, values) in [
            (
                "format",
                &[
                    "strong",
                    "em",
                    "del",
                    "code",
                    "underline",
                    "highlight",
                    "link",
                    "image",
                ][..],
            ),
            ("list", &["ul", "ol", "tasklist", "blockquote"][..]),
            (
                "view",
                &["source", "focus", "typewriter", "sidebar", "outline"][..],
            ),
            (
                "theme",
                &["github", "gothic", "night", "newsprint", "pixyll", "whitey"][..],
            ),
        ] {
            for value in values {
                let id = format!("{prefix}:{value}");
                assert_eq!(action_for_id(&id), Some(id.as_str()));
            }
        }
        assert_eq!(action_for_id("quit"), Some("quit"));
    }

    #[test]
    fn unknown_and_native_edit_ids_are_never_forwarded_as_commands() {
        for id in [
            "",
            "heading:7",
            "heading:-1",
            "heading:01",
            "format:anything",
            "theme:../custom",
            "view:unknown",
            "list:unknown",
            "copy",
            "paste",
            "cut",
            "select-all",
            "Quit",
            "open;delete",
        ] {
            assert_eq!(action_for_id(id), None, "{id}");
        }
    }

    #[test]
    fn custom_menu_ids_and_shortcuts_are_unique_and_avoid_native_edit_keys() {
        let mut ids = HashSet::new();
        let mut shortcuts = HashSet::new();
        for entry in GROUPS.iter().flat_map(|entries| entries.iter()) {
            if let Action(id, label, accelerator) = entry {
                assert!(!label.is_empty());
                assert!(ids.insert(id), "duplicate menu id: {id}");
                if let Some(accelerator) = shortcuts::resolve(id, *accelerator) {
                    assert!(
                        shortcuts.insert(accelerator),
                        "duplicate shortcut: {accelerator}"
                    );
                    assert!(![
                        "CmdOrCtrl+X",
                        "CmdOrCtrl+C",
                        "CmdOrCtrl+V",
                        "CmdOrCtrl+A",
                        "CmdOrCtrl+H"
                    ]
                    .contains(&accelerator));
                }
            }
        }
        assert_eq!(
            ids.len(),
            77 + if cfg!(target_os = "macos") { 6 } else { 0 }
        );
        #[cfg(target_os = "macos")]
        {
            for id in [
                "new-tab",
                "tab:next",
                "tab:previous",
                "tab:detach",
                "tab:merge",
                "tab:toggle",
            ] {
                assert!(ids.contains(&id));
            }
            for shortcut in ["CmdOrCtrl+T", "Ctrl+Tab", "Ctrl+Shift+Tab"] {
                assert!(shortcuts.contains(&shortcut));
            }
        }
        assert!(shortcuts.contains(&"CmdOrCtrl+,"));
        assert!(shortcuts.contains(&"CmdOrCtrl+P"));
        assert!(shortcuts.contains(&"CmdOrCtrl+/"));
        assert!(shortcuts.contains(&"CmdOrCtrl+Shift+Z"));
    }
}
