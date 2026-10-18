//! Typed, versioned preference overrides. No source text, paths or executable settings.
use crate::preferences_store::{PreferenceRecord, Store};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum Key {
    #[serde(rename = "debugMode")]
    DebugMode,
    #[serde(rename = "SmartyPantsOnRendering")]
    ConvertSmartOnRender,
    #[serde(rename = "smartQuote")]
    SmartQuote,
    #[serde(rename = "smartDash")]
    SmartDash,
    #[serde(rename = "remapPunctuation")]
    RemapUnicodePunctuation,
    #[serde(rename = "quitAfterWindowClose")]
    QuitAfterWindowClose,
    #[serde(rename = "noLegacyMath")]
    NoLegacyMath,
    #[serde(rename = "gitlabMath")]
    GitlabMath,
    #[serde(rename = "noDisplayLinesInMath")]
    NoDisplayLinesInMath,
    #[serde(rename = "allowPhysicsConflict")]
    AllowPhysicsConflict,
    #[serde(rename = "auto_numbering_for_math")]
    AutoNumberingForMath,
    #[serde(rename = "zoomByMouse")]
    ZoomByMouse,
    #[serde(rename = "preLinebreakOnExport")]
    PreLinebreakOnExport,
    #[serde(rename = "mathFormatOnCopy")]
    MathFormatOnCopy,
    #[serde(rename = "darkTheme")]
    DarkTheme,
    #[serde(rename = "useSeparateDarkTheme")]
    UseSeparateDarkTheme,
    #[serde(rename = "can_collapse_outline_panel")]
    CanCollapseOutlinePanel,
    #[serde(rename = "noHintForOpenLink")]
    NoHintForOpenLink,

    #[serde(rename = "wordsPerMinute")]
    WordsPerMinute,
    #[serde(rename = "customWordsPerMinute")]
    CustomWordsPerMinute,
    #[serde(rename = "always_show_wordcount")]
    AlwaysShowWordCount,
    #[serde(rename = "useCustomFontSize")]
    UseCustomFontSize,
    #[serde(rename = "customFontSize")]
    CustomFontSize,
    #[serde(rename = "no_pairing_match")]
    NoPairingMatch,
    #[serde(rename = "match_pari_markdown")]
    AutoPairExtendSymbol,
    #[serde(rename = "noEmojiAutoComplete")]
    NoEmojiAutoComplete,
    #[serde(rename = "auto_expand_block")]
    ExpandSimpleBlock,
    #[serde(rename = "codeIndentSize")]
    CodeIndentSize,
    #[serde(rename = "shiftTabAutoIndent")]
    ShiftTabAutoIndent,
    #[serde(rename = "show_line_numbers_for_fence")]
    ShowLineNumbersForFence,
    #[serde(rename = "no_line_wrapping")]
    NoLineWrapping,
    #[serde(rename = "lineWiseCopyCut")]
    LineWiseCopyCut,
    #[serde(rename = "no_mid_caret")]
    NoMidCaret,
    #[serde(rename = "copy_markdown_by_default")]
    CopyMarkdownByDefault,
    #[serde(rename = "line_ending_crlf")]
    LineEndingCrlf,
    #[serde(rename = "defaultCodeLang")]
    DefaultCodeLang,
    #[serde(rename = "defaultCodeLangOption")]
    DefaultCodeLangOption,
    #[serde(rename = "enableAutoSave")]
    EnableAutoSave,
    #[serde(rename = "zoomFactor")]
    ZoomFactor,
    #[serde(rename = "strict_mode")]
    StrictMode,
    #[serde(rename = "enable_inline_math")]
    EnableInlineMath,
    #[serde(rename = "enable_highlight")]
    EnableHighlight,
    #[serde(rename = "enable_subscript")]
    EnableSubscript,
    #[serde(rename = "enable_superscript")]
    EnableSuperscript,
    #[serde(rename = "enable_diagram")]
    EnableDiagram,
    #[serde(rename = "enableAlert")]
    EnableAlert,
    #[serde(rename = "noAutoLink")]
    NoAutoLink,
    #[serde(rename = "ignoreLineBreak")]
    IgnoreLineBreak,
    #[serde(rename = "hideBrAndLineBreak")]
    HideBrAndLineBreak,
    #[serde(rename = "indentFirstLine")]
    IndentFirstLine,
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(untagged)]
pub enum Value {
    Boolean(bool),
    Text(String),
    Number(f64),
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub schema_version: u32,
    pub revision: u64,
    pub values: BTreeMap<Key, Value>,
}
impl Default for Snapshot {
    fn default() -> Self {
        Self {
            schema_version: 1,
            revision: 0,
            values: BTreeMap::new(),
        }
    }
}
#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Change {
    pub key: Key,
    pub value: Value,
}
impl Change {
    fn validate(&self) -> Result<(), String> {
        let valid = match (&self.key, &self.value) {
            (Key::AutoNumberingForMath, Value::Text(v)) => ["", "ams", "all"].contains(&v.as_str()),
            (Key::MathFormatOnCopy, Value::Text(v)) => ["svg", "latex"].contains(&v.as_str()),
            (Key::DarkTheme, Value::Text(v)) => v
                .strip_suffix(".css")
                .is_some_and(crate::themes::valid_theme_id),
            (Key::AutoNumberingForMath | Key::MathFormatOnCopy | Key::DarkTheme, _) => false,
            (Key::WordsPerMinute, Value::Number(v)) => {
                v.is_finite() && v.fract() == 0.0 && (1.0..=999.0).contains(v)
            }
            (Key::WordsPerMinute, _) => false,
            (Key::CustomFontSize, Value::Number(v)) => v.is_finite() && (9.0..=24.0).contains(v),
            (Key::CodeIndentSize, Value::Number(v)) => [2.0, 3.0, 4.0, 5.0].contains(v),
            (Key::DefaultCodeLang, Value::Text(v)) => {
                v.len() <= 80
                    && v.bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"_+#./-".contains(&c))
            }
            (Key::DefaultCodeLangOption, Value::Number(v)) => [0.0, 1.0, 2.0, 3.0].contains(v),
            (Key::DefaultCodeLang | Key::DefaultCodeLangOption, _) => false,
            (Key::ZoomFactor, Value::Number(v)) => [
                0.25, 0.33, 0.5, 0.67, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0,
            ]
            .contains(v),
            (Key::CustomFontSize | Key::CodeIndentSize | Key::ZoomFactor, _) => false,
            (_, Value::Boolean(_)) => true,
            _ => false,
        };
        if valid {
            Ok(())
        } else {
            Err("应用偏好字段或值无效".into())
        }
    }
}
impl PreferenceRecord for Snapshot {
    fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 || self.revision > 9_007_199_254_740_991 {
            return Err("应用偏好损坏或版本不受支持，既有数据未修改".into());
        }
        for (key, value) in &self.values {
            Change {
                key: key.clone(),
                value: value.clone(),
            }
            .validate()?;
        }
        Ok(())
    }
}
impl Snapshot {
    fn reset_link_hint(&mut self) -> Result<bool, String> {
        if self.values.get(&Key::NoHintForOpenLink) != Some(&Value::Boolean(true)) {
            return Ok(false);
        }
        self.apply(
            self.revision,
            Change {
                key: Key::NoHintForOpenLink,
                value: Value::Boolean(false),
            },
        )?;
        Ok(true)
    }

    fn apply(&mut self, expected: u64, change: Change) -> Result<(), String> {
        self.validate()?;
        change.validate()?;
        if self.revision != expected {
            return Err("应用偏好已由其它窗口更改，请重新打开设置".into());
        }
        self.revision = self
            .revision
            .checked_add(1)
            .filter(|n| *n <= 9_007_199_254_740_991)
            .ok_or("应用偏好版本已达上限")?;
        if change.key == Key::WordsPerMinute {
            self.values
                .insert(Key::CustomWordsPerMinute, Value::Boolean(true));
        }
        if change.key == Key::CustomWordsPerMinute && change.value == Value::Boolean(false) {
            self.values
                .insert(Key::WordsPerMinute, Value::Number(382.0));
        }
        self.values.insert(change.key, change.value);
        Ok(())
    }
}
#[derive(Clone, Default)]
pub struct ApplicationPreferencesHost(Arc<Mutex<Option<Store<Snapshot>>>>);
impl ApplicationPreferencesHost {
    pub(crate) fn snapshot(&self, app: &AppHandle) -> Result<Snapshot, String> {
        self.with(app, Store::get)
    }
    fn with<T>(
        &self,
        app: &AppHandle,
        work: impl FnOnce(&Store<Snapshot>) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut store = self.0.lock().map_err(|_| "应用偏好状态不可用")?;
        if store.is_none() {
            *store = Some(Store::open(
                &crate::app_paths::data_dir(app)?.join("application-preferences"),
            )?);
        }
        work(store.as_ref().ok_or("应用偏好尚未初始化")?)
    }
}
fn require_read(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "preferences"
        || window
            .state::<crate::window_services::WindowServices>()
            .contains(window.label())
    {
        Ok(())
    } else {
        Err("应用偏好仅供受信任窗口读取".into())
    }
}
#[tauri::command]
pub async fn get_application_preferences(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ApplicationPreferencesHost>,
) -> Result<Snapshot, String> {
    require_read(&window)?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || host.with(&app, Store::get))
        .await
        .map_err(|_| "读取应用偏好任务未完成")?
}
#[tauri::command]
pub async fn put_application_preferences(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ApplicationPreferencesHost>,
    expected_revision: u64,
    change: Change,
) -> Result<Snapshot, String> {
    change.validate()?;
    let generation = app
        .state::<crate::platform::ui_chrome::PreferencesHost>()
        .generation_for(window.label())?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = app
            .state::<crate::platform::ui_chrome::PreferencesHost>()
            .with_generation(generation, || {
                host.with(&app, |store| {
                    store.transaction(|state| {
                        state.apply(expected_revision, change)?;
                        Ok((state.clone(), true))
                    })
                })
            })?;
        // A notification failure cannot turn a committed CAS into permission to replay it.
        crate::debug_tools::preferences_changed(&app, &result);
        if let Err(error) = app.emit("application-preferences-changed", &result) {
            eprintln!("Application preferences committed, notification failed: {error}");
        }
        Ok(result)
    })
    .await
    .map_err(|_| "保存应用偏好结果未确认")?
}
#[cfg(test)]
mod tests;

/// Apply only the caller's durable page scale; no renderer-supplied window/path/JS.
#[tauri::command]
pub async fn apply_application_zoom(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ApplicationPreferencesHost>,
) -> Result<(), String> {
    if !window
        .state::<crate::window_services::WindowServices>()
        .contains(window.label())
    {
        return Err("页面缩放仅供文稿窗口应用".into());
    }
    let host = host.inner().clone();
    let scale = tauri::async_runtime::spawn_blocking(move || {
        host.with(&app, |store| {
            let state = store.get()?;
            Ok(match state.values.get(&Key::ZoomFactor) {
                Some(Value::Number(v)) => *v,
                _ => 1.0,
            })
        })
    })
    .await
    .map_err(|_| "页面缩放设置读取未完成")??;
    window
        .set_zoom(scale)
        .map_err(|error| format!("页面缩放未能应用：{error}"))
}

fn require_registered_editor(window: &WebviewWindow) -> Result<(), String> {
    if window
        .state::<crate::window_services::WindowServices>()
        .contains(window.label())
    {
        Ok(())
    } else {
        Err("仅允许已登记的文稿窗口更改此外观偏好".into())
    }
}
fn editor_change_allowed(key: &Key) -> bool {
    matches!(
        key,
        Key::DarkTheme | Key::CanCollapseOutlinePanel | Key::NoHintForOpenLink
    )
}
#[tauri::command]
pub async fn put_editor_appearance_preference(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ApplicationPreferencesHost>,
    expected_revision: u64,
    change: Change,
) -> Result<Snapshot, String> {
    require_registered_editor(&window)?;
    if !editor_change_allowed(&change.key) {
        return Err("不允许从此入口更改该偏好".into());
    }
    change.validate()?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let result = host.with(&app, |store| {
            store.transaction(|s| {
                s.apply(expected_revision, change)?;
                Ok((s.clone(), true))
            })
        })?;
        if let Err(error) = app.emit("application-preferences-changed", &result) {
            eprintln!("Appearance preference committed, notification failed: {error}");
        }
        Ok(result)
    })
    .await
    .map_err(|_| "外观偏好保存结果未确认")?
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ZoomDirection {
    In,
    Out,
}
fn next_zoom(value: f64, direction: ZoomDirection) -> f64 {
    const LEVELS: [f64; 14] = [
        0.25, 0.33, 0.5, 0.67, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0,
    ];
    match direction {
        ZoomDirection::In => LEVELS
            .into_iter()
            .find(|x| *x > value)
            .unwrap_or((value + 1.0).min(5.0)),
        ZoomDirection::Out if value > 3.0 => value - 1.0,
        ZoomDirection::Out => LEVELS
            .into_iter()
            .rev()
            .find(|x| *x < value)
            .unwrap_or(0.25),
    }
}
#[tauri::command]
pub async fn step_application_zoom(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ApplicationPreferencesHost>,
    direction: ZoomDirection,
) -> Result<Snapshot, String> {
    require_registered_editor(&window)?;
    let host = host.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let result = host.with(&app, |store| {
            store.transaction(|s| {
                if s.values.get(&Key::ZoomByMouse) != Some(&Value::Boolean(true)) {
                    return Err("请先启用修饰键滚轮缩放".into());
                }
                let scale = match s.values.get(&Key::ZoomFactor) {
                    Some(Value::Number(v)) => *v,
                    _ => 1.0,
                };
                let next = next_zoom(scale, direction);
                if scale == next {
                    return Ok((s.clone(), false));
                }
                s.apply(
                    s.revision,
                    Change {
                        key: Key::ZoomFactor,
                        value: Value::Number(next),
                    },
                )?;
                Ok((s.clone(), true))
            })
        })?;
        if let Err(error) = app.emit("application-preferences-changed", &result) {
            eprintln!("Zoom committed, notification failed: {error}");
        }
        Ok::<_, String>(result)
    })
    .await
    .map_err(|_| "缩放保存结果未确认")??;
    let scale = match result.values.get(&Key::ZoomFactor) {
        Some(Value::Number(v)) => *v,
        _ => 1.0,
    };
    window
        .set_zoom(scale)
        .map_err(|e| format!("缩放已保存但显示未确认：{e}"))?;
    Ok(result)
}
/// Window chrome may have a forced appearance. Read the OS preference independently.
#[tauri::command]
pub fn system_appearance_dark(window: WebviewWindow) -> Result<bool, String> {
    require_read(&window)?;
    #[cfg(target_os = "macos")]
    {
        use objc2_foundation::{NSString, NSUserDefaults};
        Ok(NSUserDefaults::standardUserDefaults()
            .stringForKey(&NSString::from_str("AppleInterfaceStyle"))
            .is_some_and(|s| s.to_string() == "Dark"))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(window.theme().map_err(|e| e.to_string())? == tauri::Theme::Dark)
    }
}

/// Called only after a registered editor was actually destroyed, after close confirmation.
pub(crate) fn after_editor_destroyed(app: &AppHandle) {
    if crate::windows::has_editors(app) {
        return;
    }
    let Some(host) = app.try_state::<ApplicationPreferencesHost>() else {
        return;
    };
    match host.with(app, |store| {
        Ok(store.get()?.values.get(&Key::QuitAfterWindowClose) == Some(&Value::Boolean(true)))
    }) {
        Ok(true) if !crate::windows::has_editors(app) => app.exit(0),
        Ok(_) => {}
        Err(error) => {
            eprintln!("Last-window preference unavailable; application retained: {error}")
        }
    }
}
#[tauri::command]
pub async fn reset_dialog_warnings(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
    let generation = app
        .state::<crate::platform::ui_chrome::PreferencesHost>()
        .generation_for(window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<crate::platform::ui_chrome::PreferencesHost>()
            .with_generation(generation, || {
                app.state::<crate::file_preferences::FilePreferencesHost>()
                    .reset_trash_warning(&app)?;
                let snapshot = app
                    .state::<ApplicationPreferencesHost>()
                    .with(&app, |store| {
                        store.transaction(|state| {
                            let changed = state.reset_link_hint()?;
                            Ok((state.clone(), changed))
                        })
                    })?;
                if let Err(error) = app.emit("application-preferences-changed", &snapshot) {
                    eprintln!("Warning preferences reset, notification failed: {error}");
                }
                Ok(())
            })
    })
    .await
    .map_err(|_| "重设提示结果未确认")?
}
