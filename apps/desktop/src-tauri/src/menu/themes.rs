use crate::themes::ThemeEntry;
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
};
use tauri::{
    menu::{CheckMenuItem, MenuItemKind, Submenu},
    AppHandle, Manager, Runtime,
};

const SUBMENU_ID: &str = "themes-submenu";
static REQUEST: AtomicU64 = AtomicU64::new(0);

/// Last confirmed presentation is retained while a non-editor owns native focus.
/// This stores no window authority, resource token or user path.
#[derive(Default)]
pub(crate) struct ThemeMenuState(Mutex<Option<String>>);
#[derive(Debug, PartialEq, Eq)]
struct Selection {
    theme_id: Option<String>,
    enabled: bool,
}
impl Selection {
    fn checked(&self, action: &str) -> bool {
        self.theme_id
            .as_deref()
            .is_some_and(|id| theme_id(action) == Some(id))
    }
}
impl ThemeMenuState {
    fn resolve(
        &self,
        focused: Option<&str>,
        preferences_opener: Option<&str>,
        active_theme: impl FnOnce(&str) -> Option<String>,
    ) -> Selection {
        let owner = focused.or(preferences_opener);
        let active = owner.and_then(active_theme);
        let theme_id = match self.0.lock() {
            Ok(mut confirmed) => {
                if owner.is_none() {
                    confirmed.clone()
                } else {
                    if active.is_some() {
                        *confirmed = active.clone();
                    }
                    active
                }
            }
            Err(_) => active,
        };
        Selection {
            theme_id,
            enabled: focused.is_some(),
        }
    }
}
fn selection<R: Runtime>(app: &AppHandle<R>) -> Selection {
    let focused = crate::windows::focused_editor(app);
    let opener = crate::platform::ui_chrome::theme_selection::focused_preferences_opener(app);
    let lookup = |label: &str| {
        app.try_state::<crate::themes::ThemeHost>()?
            .active_theme(label)
    };
    if let Some(state) = app.try_state::<ThemeMenuState>() {
        state.resolve(
            focused.as_ref().map(|window| window.label()),
            opener.as_deref(),
            lookup,
        )
    } else {
        ThemeMenuState::default().resolve(
            focused.as_ref().map(|window| window.label()),
            opener.as_deref(),
            lookup,
        )
    }
}

pub(super) fn theme_id(action: &str) -> Option<&str> {
    let id = action.strip_prefix("theme:")?;
    crate::themes::valid_theme_id(id).then_some(id)
}

pub(super) fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let menu = Submenu::with_id(app, SUBMENU_ID, "主题", true)?;
    let entries: Vec<_> = crate::themes::BUILTINS
        .iter()
        .copied()
        .map(|(id, name)| ThemeEntry {
            id: id.into(),
            name: name.into(),
            builtin: true,
        })
        .collect();
    fill(app, &menu, &entries, &selection(app))?;
    Ok(menu)
}

fn fill<R: Runtime>(
    app: &AppHandle<R>,
    menu: &Submenu<R>,
    entries: &[ThemeEntry],
    selection: &Selection,
) -> tauri::Result<()> {
    let mut next = Vec::with_capacity(entries.len());
    let mut ids = HashSet::new();
    for entry in entries {
        if !crate::themes::valid_theme_id(&entry.id) || !ids.insert(&entry.id) {
            continue;
        }
        let action = format!("theme:{}", entry.id);
        next.push(CheckMenuItem::with_id(
            app,
            &action,
            entry.name.replace('&', "&&"),
            selection.enabled,
            selection.checked(&action),
            None::<&str>,
        )?);
    }
    // Build the complete replacement before changing this one submenu.
    for old in menu.items()? {
        menu.remove(&old)?;
    }
    for item in next {
        menu.append(&item)?;
    }
    Ok(())
}

pub(crate) fn schedule_update(app: &AppHandle, entries: &[ThemeEntry]) -> Result<(), String> {
    let request = REQUEST.fetch_add(1, Ordering::SeqCst) + 1;
    let entries = entries.to_vec();
    let ui_app = app.clone();
    app.run_on_main_thread(move || {
        if request != REQUEST.load(Ordering::SeqCst) {
            return;
        }
        let result = (|| {
            let Some(root) = ui_app.menu() else {
                return Ok(());
            };
            let menu = root.items()?.into_iter().find_map(|item| match item {
                MenuItemKind::Submenu(menu) if menu.id().as_ref() == SUBMENU_ID => Some(menu),
                _ => None,
            });
            if let Some(menu) = menu {
                fill(&ui_app, &menu, &entries, &selection(&ui_app))?;
            }
            Ok::<_, tauri::Error>(())
        })();
        if let Err(error) = result {
            eprintln!("Theme menu update failed: {error}");
        }
    })
    .map_err(|error| error.to_string())
}

/// Update existing CheckMenuItems; focus and failure recovery never replace menus.
pub(super) fn sync<R: Runtime>(app: &AppHandle<R>, force_disabled: bool) -> tauri::Result<()> {
    let Some(root) = app.menu() else {
        return Ok(());
    };
    let selected = selection(app);
    for item in root.items()? {
        if let MenuItemKind::Submenu(menu) = item {
            if menu.id().as_ref() != SUBMENU_ID {
                continue;
            }
            for item in menu.items()? {
                if let MenuItemKind::Check(item) = item {
                    if theme_id(item.id().as_ref()).is_some() {
                        item.set_checked(selected.checked(item.id().as_ref()))?;
                        item.set_enabled(selected.enabled && !force_disabled)?;
                    }
                }
            }
        }
    }
    Ok(())
}
pub(crate) fn schedule_sync<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let ui_app = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = sync(&ui_app, false) {
            eprintln!("Theme menu synchronization failed: {error}");
        }
    })
    .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::themes::ThemeHost;
    fn setup() -> (tempfile::TempDir, ThemeHost) {
        let config = tempfile::tempdir().unwrap();
        let themes = ThemeHost::default();
        for label in ["main", "editor-other", "editor-initial"] {
            themes.register_window(label).unwrap();
        }
        themes.catalog(config.path()).unwrap();
        (config, themes)
    }
    fn accept(themes: &ThemeHost, config: &std::path::Path, label: &str, id: &str, request: u64) {
        let styles = themes
            .prepare_styles(themes.begin_load(label, request).unwrap(), id, config)
            .unwrap();
        themes.accept_styles(label, &styles.token).unwrap();
    }
    #[test]
    fn only_portable_theme_ids_can_be_routed() {
        for id in ["marklyra-light", "custom-night", "中文主题", "a.b"] {
            assert_eq!(theme_id(&format!("theme:{id}")), Some(id));
        }
        for id in [
            "../private",
            "A",
            "a b",
            "base.user",
            "con",
            "x%2fy",
            "a:",
            "",
        ] {
            assert_eq!(theme_id(&format!("theme:{id}")), None);
        }
        assert_eq!(theme_id("save"), None);
    }
    #[test]
    fn only_accepted_styles_are_checked_while_pending_or_failed_selection_syncs_to_the_old_id() {
        let (config, themes) = setup();
        let state = ThemeMenuState::default();
        accept(&themes, config.path(), "main", "marklyra-light", 1);
        let pending = themes
            .prepare_styles(
                themes.begin_load("main", 2).unwrap(),
                "marklyra-dark",
                config.path(),
            )
            .unwrap();
        for _ in 0..2 {
            let selected = state.resolve(Some("main"), None, |label| themes.active_theme(label));
            assert!(selected.enabled);
            assert!(selected.checked("theme:marklyra-light"));
            assert!(!selected.checked("theme:marklyra-dark"));
            assert!(!selected.checked("save"));
        }
        assert!(themes.accept_styles("main", "invalid-token").is_err());
        assert!(state
            .resolve(Some("main"), None, |label| themes.active_theme(label))
            .checked("theme:marklyra-light"));
        themes.accept_styles("main", &pending.token).unwrap();
        let selected = state.resolve(Some("main"), None, |label| themes.active_theme(label));
        assert!(!selected.checked("theme:marklyra-light"));
        assert!(selected.checked("theme:marklyra-dark"));
    }
    #[test]
    fn catalog_rebuild_keeps_the_custom_actual_theme_checked_exactly_once() {
        let (config, themes) = setup();
        std::fs::write(config.path().join("themes/bespoke.css"), b"body{}").unwrap();
        accept(&themes, config.path(), "main", "bespoke", 1);
        let state = ThemeMenuState::default();
        for extra in [None, Some("another.css")] {
            if let Some(filename) = extra {
                std::fs::write(config.path().join("themes").join(filename), b"body{}").unwrap();
            }
            let catalog = themes.catalog(config.path()).unwrap();
            let selected = state.resolve(Some("main"), None, |label| themes.active_theme(label));
            let checked = catalog
                .themes
                .iter()
                .filter(|entry| selected.checked(&format!("theme:{}", entry.id)))
                .map(|entry| entry.id.as_str())
                .collect::<Vec<_>>();
            assert_eq!(checked, ["bespoke"]);
            assert!(!selected.checked("theme:marklyra-light"));
        }
    }
    #[test]
    fn focused_editor_wins_over_preferences_opener_and_non_editors_never_enable_actions() {
        let (config, themes) = setup();
        accept(&themes, config.path(), "main", "marklyra-light", 1);
        accept(&themes, config.path(), "editor-other", "marklyra-dark", 1);
        let state = ThemeMenuState::default();
        let selected = state.resolve(Some("main"), Some("editor-other"), |label| {
            themes.active_theme(label)
        });
        assert_eq!(
            selected,
            Selection {
                theme_id: Some("marklyra-light".into()),
                enabled: true
            }
        );
        let preferences = state.resolve(None, Some("editor-other"), |label| {
            themes.active_theme(label)
        });
        assert_eq!(
            preferences,
            Selection {
                theme_id: Some("marklyra-dark".into()),
                enabled: false
            }
        );
        let preview = state.resolve(None, None, |_| {
            panic!("non-editor menu sync must not query resources")
        });
        assert_eq!(preview, preferences);
        let initial = state.resolve(Some("editor-initial"), None, |label| {
            themes.active_theme(label)
        });
        assert!(initial.enabled);
        assert_eq!(initial.theme_id, None);
        assert!(!initial.checked("theme:marklyra-dark"));
        assert_eq!(state.resolve(None, None, |_| None), preferences);
    }
    #[test]
    fn closing_one_window_revokes_its_active_state_without_changing_another_window_selection() {
        let (config, themes) = setup();
        accept(&themes, config.path(), "main", "marklyra-light", 1);
        accept(&themes, config.path(), "editor-other", "marklyra-dark", 1);
        let state = ThemeMenuState::default();
        state.resolve(Some("main"), None, |label| themes.active_theme(label));
        themes.release_window("main");
        assert_eq!(themes.active_theme("main"), None);
        let selected = state.resolve(Some("editor-other"), None, |label| {
            themes.active_theme(label)
        });
        assert!(selected.checked("theme:marklyra-dark"));
        themes.release_window("editor-other");
        let no_editor = state.resolve(None, None, |_| None);
        assert!(!no_editor.enabled);
        assert!(no_editor.checked("theme:marklyra-dark"));
    }
    #[test]
    fn no_accepted_theme_never_produces_a_checked_unknown_or_non_theme_action() {
        let state = ThemeMenuState::default();
        let selected = state.resolve(None, None, |_| panic!("no owner"));
        for action in ["save", "theme:marklyra-light", "theme:../bad"] {
            assert!(!selected.checked(action));
        }
    }
}
