use recent_files::RecentListing;
use tauri::{
    menu::{MenuItem, MenuItemKind, PredefinedMenuItem, Submenu},
    AppHandle, Manager, Runtime,
};

const SUBMENU_ID: &str = "recent-files-submenu";
const PREFIX: &str = "recent-open:";

/// Only a canonical opaque UUID can become a routed native recent-file action.
pub(super) fn record_id(action: &str) -> Option<&str> {
    let id = action.strip_prefix(PREFIX)?;
    (id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                byte == b'-'
            } else {
                byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
            }
        }))
    .then_some(id)
}

fn label(name: &str, path: &str) -> String {
    // No path characters can become a shortcut, line break or Windows mnemonic.
    // The management panel retains the complete unmodified path for inspection.
    let text = format!("{name} — {path}");
    let mut chars = text.chars();
    let mut output: String = chars
        .by_ref()
        .take(180)
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect();
    if chars.next().is_some() {
        output.push('…');
    }
    output.replace('&', "&&")
}

pub(super) fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let menu = Submenu::with_id(app, SUBMENU_ID, "最近文件", true)?;
    fill(app, &menu, None, true)?;
    Ok(menu)
}

fn find<R: Runtime>(items: Vec<MenuItemKind<R>>) -> tauri::Result<Option<Submenu<R>>> {
    for item in items {
        if let MenuItemKind::Submenu(menu) = item {
            if menu.id().as_ref() == SUBMENU_ID {
                return Ok(Some(menu));
            }
            if let Some(found) = find(menu.items()?)? {
                return Ok(Some(found));
            }
        }
    }
    Ok(None)
}

/// Called on the UI thread, after the store transaction has released every lock.
/// Keep the existing submenu and all unrelated native menu objects in place.
pub(crate) fn update<R: Runtime>(
    app: &AppHandle<R>,
    listing: Option<&RecentListing>,
) -> tauri::Result<()> {
    let Some(root) = app.menu() else {
        return Ok(());
    };
    let Some(menu) = find(root.items()?)? else {
        return Ok(());
    };
    let enabled = app
        .get_webview_window("main")
        .is_some_and(|window| crate::windows::is_focused(&window).unwrap_or(false));
    fill(app, &menu, listing, enabled)
}

fn fill<R: Runtime>(
    app: &AppHandle<R>,
    menu: &Submenu<R>,
    listing: Option<&RecentListing>,
    enabled: bool,
) -> tauri::Result<()> {
    let mut next: Vec<MenuItemKind<R>> = Vec::new();
    if let Some(listing) = listing {
        for entry in listing.entries.iter().take(recent_files::MAX_ENTRIES) {
            let id = format!("{PREFIX}{}", entry.id);
            if record_id(&id).is_none() {
                continue;
            }
            next.push(MenuItemKind::MenuItem(MenuItem::with_id(
                app,
                id,
                label(&entry.name, &entry.path),
                enabled,
                None::<&str>,
            )?));
        }
    }
    if next.is_empty() {
        next.push(MenuItemKind::MenuItem(MenuItem::with_id(
            app,
            "recent-files-status",
            if listing.is_some() {
                "暂无最近文件"
            } else {
                "最近文件暂不可用"
            },
            false,
            None::<&str>,
        )?));
    }
    next.push(MenuItemKind::Predefined(PredefinedMenuItem::separator(
        app,
    )?));
    next.push(MenuItemKind::MenuItem(MenuItem::with_id(
        app,
        "recent-files",
        "管理最近文件…",
        enabled,
        None::<&str>,
    )?));
    // Construct every replacement before mutating the existing submenu.
    for previous in menu.items()? {
        menu.remove(&previous)?;
    }
    for item in next {
        menu.append(&item)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_actions_accept_only_canonical_opaque_ids() {
        let id = "de305d54-75b4-431b-adb2-eb6b9e546014";
        assert_eq!(record_id(&format!("recent-open:{id}")), Some(id));
        for action in [
            "recent-open:/tmp/a.md",
            "recent-open:../file.md",
            "recent-open:DE305D54-75B4-431B-ADB2-EB6B9E546014",
            "recent-open:de305d54-75b4-431b-adb2-eb6b9e546014:extra",
            "recent-files",
        ] {
            assert_eq!(record_id(action), None, "{action}");
        }
    }

    #[test]
    fn labels_distinguish_duplicate_names_without_native_control_characters() {
        assert_ne!(label("a.md", "/one/a.md"), label("a.md", "/two/a.md"));
        let escaped = label("A&B\t中.md", "/path\n/A&B.md");
        assert!(escaped.contains("A&&B 中.md"));
        assert!(!escaped.chars().any(char::is_control));
        let long = label("日文😀.md", &"中".repeat(300));
        assert!(long.ends_with('…'));
        assert_eq!(long.chars().count(), 181);
    }
}
