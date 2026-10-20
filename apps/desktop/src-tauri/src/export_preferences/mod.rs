//! Export preferences: one confirmed record shared by every window, restricted to settings that
//! an exporter actually consumes.
use crate::exports::arguments;
use crate::preferences_store::{PreferenceRecord, Store};
use serde::{Deserialize, Deserializer, Serialize};
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

pub(crate) const FORMAT_KEYS: [&str; 9] = [
    "docx", "odt", "rtf", "epub", "latex", "wiki", "rst", "textile", "opml",
];
const MAX_CUSTOM: usize = 12;
const MAX_TEXT: usize = 200;
const MAX_CSS_BYTES: usize = 16 * 1024;
/// Writers that cannot produce a standalone file from this pipeline.
const BLOCKED_WRITERS: [&str; 3] = ["pdf", "chunkedhtml", "lua"];
/// Extensions that would make an export an executable or script.
const BLOCKED_EXTENSIONS: [&str; 19] = [
    "exe", "bat", "cmd", "com", "scr", "msi", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf",
    "lnk", "dll", "sh", "jar", "app", "command",
];

fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
    deserializer: D,
) -> Result<Option<T>, D::Error> {
    T::deserialize(deserializer).map(Some)
}

fn present_theme<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<String>, D::Error> {
    let value = String::deserialize(deserializer)?;
    Ok(Some(match value.as_str() {
        "night" => "marklyra-dark".into(),
        "github" | "gothic" | "newsprint" | "pixyll" | "whitey" => "marklyra-light".into(),
        _ => value,
    }))
}

fn theme(value: &Option<String>) -> bool {
    value
        .as_deref()
        .is_none_or(|s| ["", "marklyra-light", "marklyra-dark"].contains(&s))
}

/// A location the user picked in a native dialog, or nothing.
fn stored_path(value: &str) -> Result<(), String> {
    if value.is_empty()
        || (value.len() <= 4096
            && !value.chars().any(char::is_control)
            && std::path::Path::new(value).is_absolute())
    {
        Ok(())
    } else {
        Err("路径无效，必须是本机的绝对路径".into())
    }
}
fn optional_path(value: &Option<String>) -> Result<(), String> {
    value.as_deref().map_or(Ok(()), stored_path)
}
fn short_text(value: &Option<String>, limit: usize) -> bool {
    value
        .as_deref()
        .is_none_or(|text| text.chars().count() <= limit && !text.chars().any(char::is_control))
}
fn static_css(value: &Option<String>) -> bool {
    value.as_deref().is_none_or(|css| {
        css.len() <= MAX_CSS_BYTES && !css.contains(['\0', '<']) && !css.contains("</")
    })
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneralSettings {
    /// `document` saves next to the Markdown file, `custom` in `folder`.
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub folder_mode: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub folder: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub open_location: Option<bool>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub open_file: Option<bool>,
}
impl GeneralSettings {
    fn validate(&self) -> Result<(), String> {
        if self
            .folder_mode
            .as_deref()
            .is_some_and(|mode| !["document", "custom"].contains(&mode))
        {
            return Err("默认导出位置无效".into());
        }
        optional_path(&self.folder)
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HtmlSettings {
    #[serde(
        default,
        deserialize_with = "present_theme",
        skip_serializing_if = "Option::is_none"
    )]
    pub export_theme: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub extra_css: Option<String>,
}
impl HtmlSettings {
    fn validate(&self) -> Result<(), String> {
        if theme(&self.export_theme) && static_css(&self.extra_css) {
            Ok(())
        } else {
            Err("HTML 导出设置无效：主题未知，或自定义样式超过 16 KiB / 含 HTML".into())
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PdfSettings {
    #[serde(
        default,
        deserialize_with = "present_theme",
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
    pub landscape: Option<bool>,
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
    pub bookmarks: Option<bool>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub background: Option<bool>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub author: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub header_left: Option<String>,
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
    pub header_right: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub footer_left: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub footer: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub footer_right: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub extra_css: Option<String>,
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
            && short_text(&self.author, 100)
            && [
                &self.header_left,
                &self.header,
                &self.header_right,
                &self.footer_left,
                &self.footer,
                &self.footer_right,
            ]
            .into_iter()
            .all(|text| short_text(text, MAX_TEXT))
            && static_css(&self.extra_css);
        if valid {
            Ok(())
        } else {
            Err("PDF 设置无效：纸张、边距、页眉页脚或自定义样式超出支持范围，既有数据未修改".into())
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
        deserialize_with = "present_theme",
        skip_serializing_if = "Option::is_none"
    )]
    pub export_theme: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub extra_css: Option<String>,
}
impl ImageSettings {
    pub(crate) fn validate(&self) -> Result<(), String> {
        if theme(&self.export_theme)
            && self.image_width.is_none_or(|n| (64..=4096).contains(&n))
            && self.quality.is_none_or(|n| n <= 3)
            && self.use_theme_font_size.is_none_or(|n| n <= 1)
            && self.image_font_size.is_none_or(|n| (6..=128).contains(&n))
            && static_css(&self.extra_css)
        {
            Ok(())
        } else {
            Err("图片导出设置超出支持的尺寸、质量、字体或样式范围".into())
        }
    }
}

/// Options of one Pandoc-backed format. Paths come only from a native file dialog.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PandocFormat {
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub extra_arguments: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub toc: Option<bool>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub toc_depth: Option<u8>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub number_sections: Option<bool>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub reference_doc: Option<String>,
    #[serde(
        default,
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub template: Option<String>,
}
impl PandocFormat {
    fn validate(&self, writer: &str) -> Result<(), String> {
        if let Some(text) = &self.extra_arguments {
            arguments::parse(text)?;
        }
        if self
            .toc_depth
            .is_some_and(|depth| !(1..=6).contains(&depth))
        {
            return Err("目录层级必须在 1 到 6 之间".into());
        }
        optional_path(&self.reference_doc)?;
        optional_path(&self.template)?;
        let styled = matches!(writer, "docx" | "odt");
        if self.reference_doc.as_deref().is_some_and(|p| !p.is_empty()) && !styled {
            return Err("只有 Word 与 OpenOffice 支持样式参考文档".into());
        }
        if self.template.as_deref().is_some_and(|p| !p.is_empty()) && styled {
            return Err("Word 与 OpenOffice 不使用模板，请改用样式参考文档".into());
        }
        Ok(())
    }
    fn paths(&self) -> (&str, &str) {
        (
            self.reference_doc.as_deref().unwrap_or_default(),
            self.template.as_deref().unwrap_or_default(),
        )
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CustomExport {
    pub id: String,
    pub name: String,
    /// A Pandoc output format such as `gfm`, `asciidoc` or `pptx`.
    pub writer: String,
    pub extension: String,
    #[serde(default)]
    pub options: PandocFormat,
}

/// The Pandoc writer that implements a built-in format key.
pub(crate) fn builtin_writer(key: &str) -> Option<&'static str> {
    FORMAT_KEYS.iter().find(|item| **item == key).map(|item| {
        if *item == "wiki" {
            "mediawiki"
        } else {
            item
        }
    })
}
fn writer_base(writer: &str) -> &str {
    writer.split(['+', '-']).next().unwrap_or(writer)
}
impl CustomExport {
    fn validate(&self) -> Result<(), String> {
        let valid_id =
            uuid::Uuid::parse_str(&self.id).is_ok_and(|id| id.hyphenated().to_string() == self.id);
        let name = self.name.trim();
        let valid_writer = !self.writer.is_empty()
            && self.writer.len() <= 60
            && self.writer.split(['+', '-']).all(|part| {
                !part.is_empty()
                    && part
                        .chars()
                        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
            })
            && !BLOCKED_WRITERS.contains(&writer_base(&self.writer));
        let valid_extension = !self.extension.is_empty()
            && self.extension.len() <= 10
            && self
                .extension
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
            && !BLOCKED_EXTENSIONS.contains(&self.extension.as_str());
        if !valid_id
            || name.is_empty()
            || self.name.chars().count() > 40
            || self.name.chars().any(char::is_control)
            || !valid_writer
            || !valid_extension
        {
            return Err("自定义导出的名称、格式或扩展名无效".into());
        }
        self.options.validate(writer_base(&self.writer))
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Snapshot {
    pub schema_version: u32,
    pub revision: u64,
    #[serde(default)]
    pub general: GeneralSettings,
    pub html: HtmlSettings,
    pub pdf: PdfSettings,
    #[serde(default)]
    pub image: ImageSettings,
    #[serde(default)]
    pub formats: BTreeMap<String, PandocFormat>,
    #[serde(default)]
    pub custom: Vec<CustomExport>,
    #[serde(default)]
    pub pandoc_path: String,
}
impl Default for Snapshot {
    fn default() -> Self {
        Self {
            schema_version: 1,
            revision: 0,
            general: GeneralSettings::default(),
            html: HtmlSettings::default(),
            pdf: PdfSettings::default(),
            image: ImageSettings::default(),
            formats: BTreeMap::new(),
            custom: Vec::new(),
            pandoc_path: String::new(),
        }
    }
}

/// Where a native dialog's answer is stored. Paths never arrive through `Change`.
#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum PathTarget {
    Folder,
    ReferenceDoc { format: String },
    Template { format: String },
}

/// One short-lived request value per command, so the size spread of the variants is harmless.
#[allow(clippy::large_enum_variant)]
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "key", content = "value", deny_unknown_fields)]
pub enum Change {
    #[serde(rename = "export.general")]
    General(GeneralSettings),
    #[serde(rename = "export.html")]
    Html(HtmlSettings),
    #[serde(rename = "export.pdf")]
    Pdf(PdfSettings),
    #[serde(rename = "export.image")]
    Image(ImageSettings),
    #[serde(rename = "export.formats")]
    Formats(BTreeMap<String, PandocFormat>),
    #[serde(rename = "export.custom")]
    Custom(Vec<CustomExport>),
    #[serde(rename = "pandocPath")]
    PandocPath(String),
}
fn validate_formats(formats: &BTreeMap<String, PandocFormat>) -> Result<(), String> {
    for (key, format) in formats {
        let writer = builtin_writer(key).ok_or("导出格式未知")?;
        format.validate(writer)?;
    }
    Ok(())
}
fn validate_custom(custom: &[CustomExport]) -> Result<(), String> {
    if custom.len() > MAX_CUSTOM {
        return Err(format!("自定义导出最多 {MAX_CUSTOM} 项"));
    }
    for (index, item) in custom.iter().enumerate() {
        item.validate()?;
        if custom[..index].iter().any(|other| other.id == item.id) {
            return Err("自定义导出标识重复".into());
        }
    }
    Ok(())
}
impl Change {
    fn validate(&self) -> Result<(), String> {
        match self {
            Self::General(value) => value.validate(),
            Self::Html(value) => value.validate(),
            Self::Pdf(value) => value.validate(),
            Self::Image(value) => value.validate(),
            Self::Formats(value) => validate_formats(value),
            Self::Custom(value) => validate_custom(value),
            Self::PandocPath(value) => stored_path(value).map_err(|_| "Pandoc路径无效".into()),
        }
    }
}
impl PreferenceRecord for Snapshot {
    const MAX_BYTES: usize = 64 * 1024;
    fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 || self.revision > 9_007_199_254_740_991 {
            return Err("导出偏好损坏或版本不受支持，既有数据未修改".into());
        }
        self.general.validate()?;
        self.html.validate()?;
        self.pdf.validate()?;
        self.image.validate()?;
        validate_formats(&self.formats)?;
        validate_custom(&self.custom)?;
        stored_path(&self.pandoc_path).map_err(|_| "Pandoc路径无效".into())
    }
}

/// Typed paths are accepted only when a dialog stored them already; clearing is always allowed.
fn keep_path(proposed: &str, stored: &str) -> Result<(), String> {
    if proposed.is_empty() || proposed == stored {
        Ok(())
    } else {
        Err("文件与文件夹路径只能通过“选择…”对话框设置".into())
    }
}
fn keep_format_paths(proposed: &PandocFormat, stored: Option<&PandocFormat>) -> Result<(), String> {
    let (reference, template) = proposed.paths();
    let (old_reference, old_template) = stored.map_or(("", ""), PandocFormat::paths);
    keep_path(reference, old_reference)?;
    keep_path(template, old_template)
}
impl Snapshot {
    fn apply(&mut self, expected_revision: u64, change: Change) -> Result<(), String> {
        self.validate()?;
        change.validate()?;
        if self.revision != expected_revision {
            return Err("导出设置已由其它窗口修改，请重新打开设置".into());
        }
        match &change {
            Change::General(value) => keep_path(
                value.folder.as_deref().unwrap_or_default(),
                self.general.folder.as_deref().unwrap_or_default(),
            )?,
            Change::Formats(map) => {
                for (key, format) in map {
                    keep_format_paths(format, self.formats.get(key))?;
                }
            }
            Change::Custom(list) => {
                for item in list {
                    let stored = self.custom.iter().find(|other| other.id == item.id);
                    keep_format_paths(&item.options, stored.map(|other| &other.options))?;
                }
            }
            Change::PandocPath(value) => keep_path(value, &self.pandoc_path)?,
            _ => {}
        }
        let revision = self
            .revision
            .checked_add(1)
            .filter(|n| *n <= 9_007_199_254_740_991)
            .ok_or("导出设置版本已达上限")?;
        match change {
            Change::General(value) => self.general = value,
            Change::Html(value) => self.html = value,
            Change::Pdf(value) => self.pdf = value,
            Change::Image(value) => self.image = value,
            Change::Formats(value) => self.formats = value,
            Change::Custom(value) => self.custom = value,
            Change::PandocPath(value) => self.pandoc_path = value,
        }
        self.revision = revision;
        Ok(())
    }
    /// Stores one dialog-chosen location under the same revision check as any other change.
    pub(crate) fn apply_path(
        &mut self,
        expected_revision: u64,
        target: &PathTarget,
        path: &str,
    ) -> Result<(), String> {
        self.validate()?;
        stored_path(path)?;
        if path.is_empty() {
            return Err("所选路径为空".into());
        }
        if self.revision != expected_revision {
            return Err("导出设置已由其它窗口修改，请重新打开设置".into());
        }
        let revision = self
            .revision
            .checked_add(1)
            .filter(|n| *n <= 9_007_199_254_740_991)
            .ok_or("导出设置版本已达上限")?;
        let mut next = self.clone();
        match target {
            PathTarget::Folder => {
                next.general.folder = Some(path.to_owned());
                next.general.folder_mode = Some("custom".into());
            }
            PathTarget::ReferenceDoc { format } => {
                next.options_mut(format)?.reference_doc = Some(path.to_owned());
            }
            PathTarget::Template { format } => {
                next.options_mut(format)?.template = Some(path.to_owned());
            }
        }
        next.revision = revision;
        next.validate()?;
        *self = next;
        Ok(())
    }
    fn options_mut(&mut self, format: &str) -> Result<&mut PandocFormat, String> {
        if let Some(id) = format.strip_prefix("custom:") {
            return self
                .custom
                .iter_mut()
                .find(|item| item.id == id)
                .map(|item| &mut item.options)
                .ok_or_else(|| "自定义导出不存在".into());
        }
        if builtin_writer(format).is_none() {
            return Err("导出格式未知".into());
        }
        Ok(self.formats.entry(format.to_owned()).or_default())
    }
    /// Options for a built-in key (`docx`) or a custom export (`custom:<id>`).
    pub(crate) fn pandoc_options(&self, target: &str) -> Option<PandocFormat> {
        match target.strip_prefix("custom:") {
            Some(id) => self
                .custom
                .iter()
                .find(|item| item.id == id)
                .map(|item| item.options.clone()),
            None => builtin_writer(target)
                .map(|_| self.formats.get(target).cloned().unwrap_or_default()),
        }
    }
    pub(crate) fn custom_export(&self, id: &str) -> Option<&CustomExport> {
        self.custom.iter().find(|item| item.id == id)
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
                &crate::app_paths::data_dir(app)?.join("export-preferences"),
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
                        state.validate()?;
                        stored_path(&path).map_err(|_| "Pandoc路径无效".to_owned())?;
                        if state.revision != expected_revision {
                            return Err("导出设置已由其它窗口修改，请重新打开设置".into());
                        }
                        state.pandoc_path = path;
                        state.revision += 1;
                        state.validate()?;
                        Ok((state.clone(), true))
                    })
                })
            })
    }
    pub(crate) fn store_path(
        &self,
        app: &AppHandle,
        expected_revision: u64,
        target: &PathTarget,
        path: &str,
        generation: u64,
    ) -> Result<Snapshot, String> {
        app.state::<crate::platform::ui_chrome::PreferencesHost>()
            .with_generation(generation, || {
                self.with(app, |store| {
                    store.transaction(|state| {
                        state.apply_path(expected_revision, target, path)?;
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
        notify_changed(&app, &result);
        Ok(result)
    })
    .await
    .map_err(|_| "保存导出设置结果未确认")?
}
/// Every window refreshes its view of the confirmed record when a change is committed, and the
/// native menu follows the custom exports it names.
pub(crate) fn notify_changed(app: &AppHandle, snapshot: &Snapshot) {
    if let Err(error) = app.emit("export-preferences-changed", snapshot) {
        eprintln!("Export preferences committed, notification failed: {error}");
    }
    crate::menu::exports::refresh(app, snapshot);
}
#[cfg(test)]
mod tests;
