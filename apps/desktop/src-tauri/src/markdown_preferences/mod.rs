//! App-owned Markdown serialization policy. No document, history or filesystem grants.
mod storage;
#[cfg(test)]
mod tests;

use serde::{Deserialize, Deserializer, Serialize};
use std::sync::{Arc, Mutex};
use storage::Store;
use tauri::{AppHandle, Manager, State, WebviewWindow};

const MAX_REVISION: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarkdownPreferences {
    pub schema_version: u32,
    pub revision: u64,
    pub indent_size: i8,
    pub pretty_indent: bool,
    // Existing schema 1 snapshots contain only indentation preferences. Reading
    // them supplies engine defaults without rewriting the stored evidence.
    #[serde(default)]
    pub heading_style: u8,
    #[serde(default)]
    pub ul_style: u8,
    #[serde(default)]
    pub ol_style: u8,
}
impl Default for MarkdownPreferences {
    fn default() -> Self {
        Self {
            schema_version: 1,
            revision: 0,
            indent_size: 2,
            pretty_indent: false,
            heading_style: 0,
            ul_style: 0,
            ol_style: 0,
        }
    }
}
fn valid_indent(value: i8) -> bool {
    matches!(value, -1 | 0 | 2 | 3 | 4 | 5)
}
impl MarkdownPreferences {
    fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1
            || self.revision > MAX_REVISION
            || !valid_indent(self.indent_size)
            || self.heading_style > 3
            || self.ul_style > 2
            || self.ol_style > 1
        {
            return Err("Markdown偏好损坏或版本不受支持，既有数据未修改".into());
        }
        Ok(())
    }
    fn apply(&mut self, expected: u64, change: MarkdownPreferenceChange) -> Result<(), String> {
        self.validate()?;
        change.validate()?;
        if self.revision != expected {
            return Err("Markdown偏好已由其他窗口更改，请重新读取设置".into());
        }
        let next_revision = self
            .revision
            .checked_add(1)
            .filter(|value| *value <= MAX_REVISION)
            .ok_or("Markdown偏好版本已达上限")?;
        if let Some(value) = change.indent_size {
            self.indent_size = value;
        }
        if let Some(value) = change.pretty_indent {
            self.pretty_indent = value;
        }
        if let Some(value) = change.heading_style {
            self.heading_style = value;
        }
        if let Some(value) = change.ul_style {
            self.ul_style = value;
        }
        if let Some(value) = change.ol_style {
            self.ol_style = value;
        }
        self.revision = next_revision;
        Ok(())
    }
}

fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
    value: D,
) -> Result<Option<T>, D::Error> {
    T::deserialize(value).map(Some)
}
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MarkdownPreferenceChange {
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub indent_size: Option<i8>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub pretty_indent: Option<bool>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub heading_style: Option<u8>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub ul_style: Option<u8>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub ol_style: Option<u8>,
}
impl MarkdownPreferenceChange {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.indent_size.is_none()
            && self.pretty_indent.is_none()
            && self.heading_style.is_none()
            && self.ul_style.is_none()
            && self.ol_style.is_none()
        {
            return Err("Markdown偏好变更不能为空".into());
        }
        if self.indent_size.is_some_and(|value| !valid_indent(value)) {
            return Err("Markdown缩进值无效".into());
        }
        if self.heading_style.is_some_and(|value| value > 3)
            || self.ul_style.is_some_and(|value| value > 2)
            || self.ol_style.is_some_and(|value| value > 1)
        {
            return Err("Markdown序列化样式值无效".into());
        }
        Ok(())
    }
}

#[derive(Clone, Default)]
pub struct MarkdownPreferencesHost {
    store: Arc<Mutex<Option<Store>>>,
}
impl MarkdownPreferencesHost {
    fn with<T>(
        &self,
        app: &AppHandle,
        operation: impl FnOnce(&Store) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut store = self.store.lock().map_err(|_| "Markdown偏好状态不可用")?;
        if store.is_none() {
            let root = crate::app_paths::data_dir(app)?.join("markdown-preferences");
            *store = Some(Store::open(&root)?);
        }
        operation(store.as_ref().ok_or("Markdown偏好尚未初始化")?)
    }
    pub(crate) fn get(&self, app: &AppHandle) -> Result<MarkdownPreferences, String> {
        self.with(app, Store::get)
    }
    /// Storage CAS only; the UI coordinator owns editor rebase and acknowledgements.
    pub(crate) fn put(
        &self,
        app: &AppHandle,
        expected: u64,
        change: MarkdownPreferenceChange,
    ) -> Result<MarkdownPreferences, String> {
        self.with(app, |store| store.put(expected, change))
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
        Err("Markdown偏好仅供受信任的应用窗口读取".into())
    }
}

#[tauri::command]
pub async fn get_markdown_preferences(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, MarkdownPreferencesHost>,
) -> Result<MarkdownPreferences, String> {
    require_read(&window)?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || host.get(&app))
        .await
        .map_err(|_| "读取Markdown偏好任务未完成")?
}

#[tauri::command]
pub async fn put_markdown_preferences(
    app: AppHandle,
    window: WebviewWindow,
    expected_revision: u64,
    change: MarkdownPreferenceChange,
    host: State<'_, MarkdownPreferencesHost>,
) -> Result<MarkdownPreferences, String> {
    change.validate()?;
    let generation = app
        .state::<crate::platform::ui_chrome::PreferencesHost>()
        .generation_for(window.label())?;
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut current_generation = false;
        let result = app
            .state::<crate::platform::ui_chrome::PreferencesHost>()
            .with_generation(generation, || {
                current_generation = true;
                host.put(&app, expected_revision, change)
            });
        if current_generation {
            result
        } else {
            Err("无法确认当前偏好设置窗口，Markdown偏好未保存".into())
        }
    })
    .await
    .map_err(|_| "保存Markdown偏好任务未完成")?
}
