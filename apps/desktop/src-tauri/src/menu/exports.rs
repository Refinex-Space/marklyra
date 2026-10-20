//! User-defined Pandoc exports in File → Export: one native item per configured export.
use crate::export_preferences::Snapshot;
use tauri::{
    menu::{MenuItem, MenuItemKind, PredefinedMenuItem, Submenu},
    AppHandle, Manager, Runtime,
};

const SUBMENU_ID: &str = "export-menu";
pub(super) const PREFIX: &str = "export-custom:";
const NEEDS_PANDOC: &str = "（需要 Pandoc）";

fn canonical_uuid(id: &str) -> bool {
    id.len() == 36
        && id.bytes().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                byte == b'-'
            } else {
                byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)
            }
        })
}

/// Only a canonical UUID can become a routed native custom-export action.
pub(super) fn custom_id(action: &str) -> Option<&str> {
    action.strip_prefix(PREFIX).filter(|id| canonical_uuid(id))
}

/// Whether a window-reported available format names a custom export (`custom:<uuid>`).
pub(super) fn is_custom_format(format: &str) -> bool {
    format.strip_prefix("custom:").is_some_and(canonical_uuid)
}

/// The name as a menu label: no mnemonics, line breaks or runaway length.
fn label(name: &str) -> String {
    let mut chars = name.trim().chars();
    let mut output: String = chars
        .by_ref()
        .take(60)
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
    format!("{}…", output.replace('&', "&&"))
}

/// The item text for a custom export, with or without the missing-converter hint.
pub(super) fn availability_label(current: &str, available: bool) -> String {
    let base = current.strip_suffix(NEEDS_PANDOC).unwrap_or(current);
    if available {
        base.to_owned()
    } else {
        format!("{base}{NEEDS_PANDOC}")
    }
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

/// Replaces every item after the fixed ones with the configured custom exports. Called on the
/// UI thread; the rest of the native menu stays in place.
pub(crate) fn update<R: Runtime>(
    app: &AppHandle<R>,
    exports: &[(String, String)],
) -> tauri::Result<()> {
    let Some(root) = app.menu() else {
        return Ok(());
    };
    let Some(menu) = find(root.items()?)? else {
        return Ok(());
    };
    for item in menu.items()?.into_iter().skip(super::EXPORT.len()) {
        menu.remove(&item)?;
    }
    if exports.is_empty() {
        return Ok(());
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    for (id, name) in exports {
        let action = format!("{PREFIX}{id}");
        if custom_id(&action).is_none() {
            continue;
        }
        menu.append(&MenuItem::with_id(
            app,
            action,
            label(name),
            false,
            None::<&str>,
        )?)?;
    }
    // New items start disabled; the current window state decides what is available.
    crate::menu::state::update(root.items()?, &crate::menu::state::current(app), false)
}

/// Posts the custom exports of a committed record to the native menu.
pub(crate) fn refresh<R: Runtime>(app: &AppHandle<R>, snapshot: &Snapshot) {
    let exports: Vec<(String, String)> = snapshot
        .custom
        .iter()
        .map(|item| (item.id.clone(), item.name.clone()))
        .collect();
    let handle = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        if let Err(error) = update(&handle, &exports) {
            eprintln!("Custom export menu update failed: {error}");
        }
    }) {
        eprintln!("Custom export menu update could not be scheduled: {error}");
    }
}

/// Builds the custom exports at startup from the stored record, when it can be read.
pub(crate) fn refresh_stored(app: &AppHandle) {
    let Some(host) = app.try_state::<crate::export_preferences::ExportPreferencesHost>() else {
        return;
    };
    match host.snapshot(app) {
        Ok(snapshot) => refresh(app, &snapshot),
        Err(error) => eprintln!("Custom exports are not in the menu: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_canonical_uuids_are_custom_export_actions() {
        let id = "0b1f6c1e-6a4e-4f0a-9d53-0f2f7a8f6b11";
        assert_eq!(custom_id(&format!("export-custom:{id}")), Some(id));
        for bad in [
            "export-custom:",
            "export-custom:not-a-uuid",
            "export-custom:0B1F6C1E-6A4E-4F0A-9D53-0F2F7A8F6B11",
            "export-docx",
            "export-custom:0b1f6c1e-6a4e-4f0a-9d53-0f2f7a8f6b11/x",
        ] {
            assert_eq!(custom_id(bad), None, "{bad}");
        }
    }

    #[test]
    fn labels_cannot_inject_mnemonics_or_control_characters() {
        assert_eq!(label("A & B"), "A && B…");
        assert_eq!(label("two\nlines"), "two lines…");
        assert!(label(&"长".repeat(100)).chars().count() <= 62);
    }

    #[test]
    fn the_converter_hint_is_added_and_removed_without_stacking() {
        let missing = availability_label("AsciiDoc…", false);
        assert_eq!(missing, "AsciiDoc…（需要 Pandoc）");
        assert_eq!(availability_label(&missing, false), missing);
        assert_eq!(availability_label(&missing, true), "AsciiDoc…");
    }
}
