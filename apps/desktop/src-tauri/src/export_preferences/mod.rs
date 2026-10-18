//! Original export format objects, restricted to implemented consumers.
use crate::preferences_store::{PreferenceRecord, Store};
use serde::{Deserialize, Deserializer, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
    deserializer: D,
) -> Result<Option<T>, D::Error> {
    T::deserialize(deserializer).map(Some)
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HtmlSettings {
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub export_theme: Option<String>,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PdfSettings {
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub export_theme: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub paper: Option<String>,
    #[serde(
        rename = "paper.custom",
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub paper_custom: Option<[f64; 2]>,
    #[serde(
        rename = "paper.margin",
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub paper_margin: Option<String>,
    #[serde(
        rename = "paper.marginTop",
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub paper_margin_top: Option<f64>,
    #[serde(
        rename = "paper.marginBottom",
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub paper_margin_bottom: Option<f64>,
    #[serde(
        rename = "paper.marginLeft",
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub paper_margin_left: Option<f64>,
    #[serde(
        rename = "paper.marginRight",
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub paper_margin_right: Option<f64>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub split_pages: Option<bool>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub header: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub footer: Option<String>,
}
fn validate_pandoc_setting(value: &str) -> Result<(), String> {
    if value.is_empty()
        || (value.len() <= 4096
            && !value.chars().any(char::is_control)
            && std::path::Path::new(value).is_absolute())
    {
        Ok(())
    } else {
        Err("Pandoc路径无效".into())
    }
}
fn theme(value: &Option<String>) -> bool {
    value.as_deref().is_none_or(|s| {
        [
            "",
            "github",
            "gothic",
            "newsprint",
            "night",
            "pixyll",
            "whitey",
        ]
        .contains(&s)
    })
}
impl HtmlSettings {
    fn validate(&self) -> Result<(), String> {
        if theme(&self.export_theme) {
            Ok(())
        } else {
            Err("导出主题无效".into())
        }
    }
}
impl PdfSettings {
    pub(crate) fn validate(&self) -> Result<(), String> {
        let valid = theme(&self.export_theme)
            && self.paper.as_deref().is_none_or(|s| {
                ["", "A5", "A4", "A3", "Letter", "Legal", "Tabloid", "custom"].contains(&s)
            })
            && self.paper_custom.is_none_or(|size| {
                size.iter()
                    .all(|n| n.is_finite() && (10.0..=2000.0).contains(n))
            })
            && self
                .paper_margin
                .as_deref()
                .is_none_or(|s| ["", "custom"].contains(&s))
            && [
                self.paper_margin_top,
                self.paper_margin_bottom,
                self.paper_margin_left,
                self.paper_margin_right,
            ]
            .iter()
            .all(|v| v.is_none_or(|n| n.is_finite() && (0.0..=500.0).contains(&n)))
            && self.header.as_deref().is_none_or(str::is_empty)
            && self.footer.as_deref().is_none_or(str::is_empty);
        if valid {
            Ok(())
        } else {
            Err("PDF设置无效或包含暂不支持的页眉页脚，既有数据未修改".into())
        }
    }
}
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImageSettings {
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub image_width: Option<u32>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub quality: Option<u8>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub use_theme_font_size: Option<u8>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub image_font_size: Option<u32>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub export_theme: Option<String>,
}
impl ImageSettings {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if theme(&self.export_theme)
            && self.image_width.is_none_or(|n| (64..=4096).contains(&n))
            && self.quality.is_none_or(|n| n <= 3)
            && self.use_theme_font_size.is_none_or(|n| n <= 1)
            && self.image_font_size.is_none_or(|n| (6..=128).contains(&n))
        {
            Ok(())
        } else {
            Err("图片导出设置超出支持的尺寸、质量或字体范围".into())
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub schema_version: u32,
    pub revision: u64,
    pub html: HtmlSettings,
    pub pdf: PdfSettings,
    #[serde(default)]
    pub image: ImageSettings,
    #[serde(default)]
    pub pandoc_path: String,
}
impl Default for Snapshot {
    fn default() -> Self {
        Self {
            schema_version: 1,
            revision: 0,
            html: HtmlSettings::default(),
            pdf: PdfSettings::default(),
            image: ImageSettings::default(),
            pandoc_path: String::new(),
        }
    }
}
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "key", content = "value", deny_unknown_fields)]
pub enum Change {
    #[serde(rename = "export.html")]
    Html(HtmlSettings),
    #[serde(rename = "export.pdf")]
    Pdf(PdfSettings),
    #[serde(rename = "export.image")]
    Image(ImageSettings),
    #[serde(rename = "pandocPath")]
    PandocPath(String),
}
impl Change {
    fn validate(&self) -> Result<(), String> {
        match self {
            Self::Html(value) => value.validate(),
            Self::Pdf(value) => value.validate(),
            Self::Image(value) => value.validate(),
            Self::PandocPath(value) => validate_pandoc_setting(value),
        }
    }
}
impl PreferenceRecord for Snapshot {
    fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 || self.revision > 9_007_199_254_740_991 {
            return Err("导出偏好损坏或版本不受支持，既有数据未修改".into());
        }
        self.html.validate()?;
        self.pdf.validate()?;
        self.image.validate()?;
        validate_pandoc_setting(&self.pandoc_path)
    }
}
impl Snapshot {
    fn apply(&mut self, expected_revision: u64, change: Change) -> Result<(), String> {
        self.validate()?;
        change.validate()?;
        if self.revision != expected_revision {
            return Err("导出设置已由其它窗口修改，请重新打开设置".into());
        }
        let revision = self
            .revision
            .checked_add(1)
            .filter(|n| *n <= 9_007_199_254_740_991)
            .ok_or("导出设置版本已达上限")?;
        match change {
            Change::Html(value) => self.html = value,
            Change::Pdf(value) => self.pdf = value,
            Change::Image(value) => self.image = value,
            Change::PandocPath(value) => self.pandoc_path = value,
        }
        self.revision = revision;
        Ok(())
    }
}
#[derive(Clone, Default)]
pub struct ExportPreferencesHost(Arc<Mutex<Option<Store<Snapshot>>>>);
impl ExportPreferencesHost {
    fn with<T>(
        &self,
        app: &AppHandle,
        work: impl FnOnce(&Store<Snapshot>) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut store = self.0.lock().map_err(|_| "导出设置状态不可用")?;
        if store.is_none() {
            *store = Some(Store::open(
                &app.path()
                    .app_data_dir()
                    .map_err(|e| e.to_string())?
                    .join("export-preferences-v1"),
            )?);
        }
        work(store.as_ref().ok_or("导出设置尚未初始化")?)
    }
    pub(crate) fn snapshot(&self, app: &AppHandle) -> Result<Snapshot, String> {
        self.with(app, Store::get)
    }
}
impl ExportPreferencesHost {
    pub(crate) fn store_pandoc_path(
        &self,
        app: &AppHandle,
        expected_revision: u64,
        path: String,
        generation: u64,
    ) -> Result<Snapshot, String> {
        app.state::<crate::platform::ui_chrome::PreferencesHost>()
            .with_generation(generation, || {
                self.with(app, |store| {
                    store.transaction(|state| {
                        state.apply(expected_revision, Change::PandocPath(path))?;
                        Ok((state.clone(), true))
                    })
                })
            })
    }
}

#[tauri::command]
pub async fn get_export_preferences(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ExportPreferencesHost>,
) -> Result<Snapshot, String> {
    if window.label() != "preferences"
        && !window
            .state::<crate::window_services::WindowServices>()
            .contains(window.label())
    {
        return Err("导出设置仅供受信任窗口读取".into());
    }
    let host = host.inner().clone();
    tauri::async_runtime::spawn_blocking(move || host.snapshot(&app))
        .await
        .map_err(|_| "读取导出设置任务未完成")?
}
#[tauri::command]
pub async fn put_export_preferences(
    app: AppHandle,
    window: WebviewWindow,
    host: State<'_, ExportPreferencesHost>,
    expected_revision: u64,
    change: Change,
) -> Result<Snapshot, String> {
    if window.label() != "preferences" {
        return Err("请从偏好设置更改导出设置".into());
    }
    change.validate()?;
    if matches!(&change, Change::PandocPath(path) if !path.is_empty()) {
        return Err("请选择并验证Pandoc程序，不能直接写入未经验证路径".into());
    }
    let generation = app
        .state::<crate::platform::ui_chrome::PreferencesHost>()
        .generation()?;
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
        if let Err(error) = app.emit("export-preferences-changed", &result) {
            eprintln!("Export preferences committed, notification failed: {error}");
        }
        Ok(result)
    })
    .await
    .map_err(|_| "保存导出设置结果未确认")?
}
#[cfg(test)]
mod tests;
