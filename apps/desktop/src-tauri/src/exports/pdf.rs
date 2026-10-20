//! Direct PDF export. The page geometry, header/footer and PDF options come from the confirmed
//! settings; only the per-document variables (title, author) arrive with the request.
use super::print_options::{check_printable_area, PrintMargins};
#[cfg(windows)]
use super::{delivery, main_only, SavedExport};
use crate::export_preferences::PdfSettings;
#[cfg(windows)]
use export_service::{prepare_html, suggested_filename};
use serde::Deserialize;
#[cfg(windows)]
use tauri::{AppHandle, WebviewWindow};

fn clean(value: &str) -> String {
    value
        .chars()
        .filter(|c| !c.is_control())
        .take(200)
        .collect()
}

/// Variables of the document being exported, available to header and footer text.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct PdfContext {
    pub title: String,
    pub author: String,
}

/// The default when the settings leave margins and paper alone.
const DEFAULT_MARGIN_MM: f64 = 16.0;
/// Room a one-line header or footer needs inside the margin.
const BAND_MM: f64 = 12.0;

/// Everything a renderer needs to produce the PDF, with units and defaults already resolved.
#[derive(Clone, Debug)]
pub(super) struct PdfLayout {
    /// Paper size in millimetres after orientation, width first.
    pub paper_mm: [f64; 2],
    pub margins_mm: PrintMargins,
    /// Chromium print-template HTML; `None` when the header is empty.
    pub header: Option<String>,
    pub footer: Option<String>,
    pub bookmarks: bool,
    pub background: bool,
}

fn paper_mm(settings: &PdfSettings) -> Result<[f64; 2], String> {
    Ok(match settings.paper.as_deref().unwrap_or_default() {
        "" | "A4" => [210.0, 297.0],
        "A5" => [148.0, 210.0],
        "A3" => [297.0, 420.0],
        "Letter" => [216.0, 279.0],
        "Legal" => [216.0, 356.0],
        "Tabloid" => [279.0, 432.0],
        "custom" => settings.paper_custom.unwrap_or([210.0, 297.0]),
        _ => return Err("PDF 纸型无效".into()),
    })
}

fn escape(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            '&' => "&amp;".to_owned(),
            '<' => "&lt;".to_owned(),
            '>' => "&gt;".to_owned(),
            '"' => "&quot;".to_owned(),
            '\'' => "&#39;".to_owned(),
            other => other.to_string(),
        })
        .collect()
}

/// `${title}` and friends become literal text or the print engine's own page fields.
fn zone(text: &str, context: &PdfContext) -> String {
    let mut output = String::new();
    let mut rest = text;
    while let Some(start) = rest.find("${") {
        output.push_str(&escape(&rest[..start]));
        let Some(end) = rest[start..].find('}') else {
            rest = &rest[start..];
            break;
        };
        let name = &rest[start + 2..start + end];
        match name {
            "title" => output.push_str(&escape(&clean(&context.title))),
            "author" => output.push_str(&escape(&clean(&context.author))),
            "pageNo" => output.push_str(r#"<span class="pageNumber"></span>"#),
            "totalPages" => output.push_str(r#"<span class="totalPages"></span>"#),
            "today" => output.push_str(r#"<span class="date"></span>"#),
            _ => output.push_str(&escape(&rest[start..start + end + 1])),
        }
        rest = &rest[start + end + 1..];
    }
    output.push_str(&escape(rest));
    output
}

/// A one-line template with three zones, padded to line up with the page body.
fn band(
    left: &str,
    center: &str,
    right: &str,
    margins: &PrintMargins,
    context: &PdfContext,
) -> Option<String> {
    if [left, center, right]
        .iter()
        .all(|text| text.trim().is_empty())
    {
        return None;
    }
    let cell = |align: &str, text: &str| {
        format!(
            r#"<span style="flex:1 1 0;min-width:0;text-align:{align};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{}</span>"#,
            zone(text, context)
        )
    };
    Some(format!(
        r#"<div style="box-sizing:border-box;width:100%;display:flex;align-items:center;padding:0 {}mm 0 {}mm;font:9px/1.2 'Segoe UI','Microsoft YaHei',-apple-system,sans-serif;color:#666;-webkit-print-color-adjust:exact">{}{}{}</div>"#,
        margins.right,
        margins.left,
        cell("left", left),
        cell("center", center),
        cell("right", right),
    ))
}

impl PdfLayout {
    pub(super) fn resolve(settings: &PdfSettings, context: &PdfContext) -> Result<Self, String> {
        settings.validate()?;
        let mut paper = paper_mm(settings)?;
        if settings.landscape == Some(true) {
            paper.reverse();
        }
        let custom = settings.paper_margin.as_deref() == Some("custom");
        let pick = |value: Option<f64>| {
            if custom {
                value.unwrap_or(DEFAULT_MARGIN_MM)
            } else {
                DEFAULT_MARGIN_MM
            }
        };
        let mut margins = PrintMargins {
            top: pick(settings.paper_margin_top),
            right: pick(settings.paper_margin_right),
            bottom: pick(settings.paper_margin_bottom),
            left: pick(settings.paper_margin_left),
        };
        let text = |value: &Option<String>| value.clone().unwrap_or_default();
        let header = band(
            &text(&settings.header_left),
            &text(&settings.header),
            &text(&settings.header_right),
            &margins,
            context,
        );
        let footer = band(
            &text(&settings.footer_left),
            &text(&settings.footer),
            &text(&settings.footer_right),
            &margins,
            context,
        );
        // A header or footer needs a band to live in; widen a margin that is too thin for it.
        if header.is_some() {
            margins.top = margins.top.max(BAND_MM);
        }
        if footer.is_some() {
            margins.bottom = margins.bottom.max(BAND_MM);
        }
        check_printable_area(paper[0], paper[1], margins)?;
        Ok(Self {
            paper_mm: paper,
            margins_mm: margins,
            header,
            footer,
            bookmarks: settings.bookmarks.unwrap_or(true),
            background: settings.background.unwrap_or(true),
        })
    }
}

/// Reads the confirmed settings for an export that is about to render.
#[cfg(windows)]
fn layout_for(app: &AppHandle, context: &PdfContext) -> Result<PdfLayout, String> {
    use crate::export_preferences::ExportPreferencesHost;
    use tauri::Manager;
    let settings = app.state::<ExportPreferencesHost>().snapshot(app)?.pdf;
    PdfLayout::resolve(&settings, context)
}

#[tauri::command]
pub async fn save_export_pdf(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    html: String,
    suggested_name: String,
    source_id: Option<String>,
    context: PdfContext,
) -> Result<super::SavedExport, String> {
    #[cfg(not(windows))]
    {
        let _ = (app, window, html, suggested_name, source_id, context);
        Err("此平台通过系统打印面板导出 PDF；请使用打印预览".into())
    }
    #[cfg(windows)]
    {
        main_only(&window)?;
        tauri::async_runtime::spawn_blocking(move || -> Result<SavedExport, String> {
            let layout = layout_for(&app, &context)?;
            let prepared = prepare_html(&html).map_err(|error| error.to_string())?;
            let name = suggested_filename(&suggested_name);
            let name = format!("{}.pdf", name.strip_suffix(".html").unwrap_or("Untitled"));
            let path = delivery::ask_destination(
                &app,
                &window,
                "导出为 PDF",
                name,
                ("PDF", &["pdf"]),
                source_id.as_deref(),
            )?;
            if !path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"))
            {
                return Err("输出扩展名必须是 .pdf；未保存".into());
            }
            let bytes = render(&app, &window, prepared, &layout)?;
            delivery::deliver(
                &app,
                &window,
                &path,
                source_id.as_deref(),
                &bytes,
                Vec::new(),
            )
        })
        .await
        .map_err(|_| "PDF 导出任务未完成".to_owned())?
    }
}

#[cfg(windows)]
fn render(
    app: &AppHandle,
    window: &WebviewWindow,
    prepared: export_service::PreparedHtml,
    layout: &PdfLayout,
) -> Result<Vec<u8>, String> {
    super::pdf_windows::render(app, window, prepared, layout)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> PdfContext {
        PdfContext {
            title: "A & B <x>".into(),
            author: "李".into(),
        }
    }

    #[test]
    fn defaults_are_a4_with_even_margins_and_no_bands() {
        let layout = PdfLayout::resolve(&PdfSettings::default(), &context()).unwrap();
        assert_eq!(layout.paper_mm, [210.0, 297.0]);
        assert_eq!(layout.margins_mm.top, 16.0);
        assert_eq!(layout.margins_mm.left, 16.0);
        assert!(layout.header.is_none() && layout.footer.is_none());
        assert!(layout.bookmarks && layout.background);
    }

    #[test]
    fn paper_orientation_and_custom_margins_are_applied() {
        let settings = PdfSettings {
            paper: Some("Letter".into()),
            landscape: Some(true),
            paper_margin: Some("custom".into()),
            paper_margin_top: Some(20.0),
            paper_margin_left: Some(30.0),
            bookmarks: Some(false),
            background: Some(false),
            ..Default::default()
        };
        let layout = PdfLayout::resolve(&settings, &context()).unwrap();
        assert_eq!(layout.paper_mm, [279.0, 216.0]);
        assert_eq!(layout.margins_mm.top, 20.0);
        assert_eq!(layout.margins_mm.left, 30.0);
        assert_eq!(layout.margins_mm.right, 16.0);
        assert!(!layout.bookmarks && !layout.background);
        // Margins that leave no printable area are refused instead of producing blank pages.
        let impossible = PdfSettings {
            paper: Some("A5".into()),
            paper_margin: Some("custom".into()),
            paper_margin_left: Some(80.0),
            paper_margin_right: Some(80.0),
            ..Default::default()
        };
        assert!(PdfLayout::resolve(&impossible, &context()).is_err());
    }

    #[test]
    fn header_and_footer_variables_resolve_without_injecting_markup() {
        let settings = PdfSettings {
            header: Some("${title} · ${author}".into()),
            footer_right: Some("第 ${pageNo} / ${totalPages} 页 ${today} ${unknown}".into()),
            paper_margin: Some("custom".into()),
            paper_margin_top: Some(2.0),
            paper_margin_bottom: Some(30.0),
            ..Default::default()
        };
        let layout = PdfLayout::resolve(&settings, &context()).unwrap();
        let header = layout.header.unwrap();
        assert!(header.contains("A &amp; B &lt;x&gt; · 李"));
        assert!(!header.contains("<x>"));
        let footer = layout.footer.unwrap();
        assert!(footer.contains(r#"<span class="pageNumber"></span>"#));
        assert!(footer.contains(r#"<span class="totalPages"></span>"#));
        assert!(footer.contains(r#"<span class="date"></span>"#));
        assert!(footer.contains("${unknown}"));
        // A thin margin is widened to hold the band; a roomy one is left alone.
        assert_eq!(layout.margins_mm.top, BAND_MM);
        assert_eq!(layout.margins_mm.bottom, 30.0);
    }

    #[test]
    fn markup_in_user_text_is_inert() {
        let settings = PdfSettings {
            footer: Some(r#"</div><script>alert(1)</script>"#.into()),
            ..Default::default()
        };
        let footer = PdfLayout::resolve(&settings, &context())
            .unwrap()
            .footer
            .unwrap();
        assert!(!footer.contains("<script>"));
        assert!(footer.contains("&lt;script&gt;"));
    }
}
