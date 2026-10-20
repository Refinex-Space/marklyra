//! WebView2 PDF output through the DevTools protocol (`Page.printToPDF`).
use super::{
    cdp::{decode, read_stream, Renderer},
    pdf::PdfLayout,
};
use export_service::{PreparedHtml, MAX_HTML_BYTES};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, WebviewWindow};

const LOAD_TIMEOUT: Duration = Duration::from_secs(30);
const RENDER_TIMEOUT: Duration = Duration::from_secs(90);
const MM_PER_INCH: f64 = 25.4;
/// Web fonts of the snapshot are embedded but still decode lazily; a page that has not settled
/// yet would print with fallback glyphs. The wait is best effort and bounded inside the page.
const SETTLED: &str = "Promise.race([document.fonts.ready.then(() => true), new Promise((done) => setTimeout(() => done(false), 10000))])";

/// The page as the settings define it, as the last `@page` rule of the document. A theme or
/// print stylesheet with its own `@page` (size, orientation, margin) would otherwise win over the
/// protocol parameters; a later rule of equal weight beats it, so the settings always decide.
pub(super) fn page_rule(layout: &PdfLayout) -> String {
    let [width, height] = layout.paper_mm;
    let margins = &layout.margins_mm;
    format!(
        "@page{{size:{width:.3}mm {height:.3}mm;margin:{:.3}mm {:.3}mm {:.3}mm {:.3}mm}}",
        margins.top, margins.right, margins.bottom, margins.left
    )
}

/// Script that appends [`page_rule`] to the snapshot and then waits for its fonts.
fn prepare_script(layout: &PdfLayout) -> String {
    format!(
        "(() => {{ const rule = document.createElement('style'); rule.id = 'marklyra-page'; rule.textContent = {}; document.head.append(rule); return {SETTLED}; }})()",
        json!(page_rule(layout))
    )
}

/// `Page.printToPDF` parameters for a resolved layout. Paper and margins are given both here and
/// in the document's last `@page` rule, so the settings alone decide the page.
pub(super) fn print_parameters(layout: &PdfLayout) -> Value {
    let inches = |mm: f64| mm / MM_PER_INCH;
    let mut parameters = json!({
        "paperWidth": inches(layout.paper_mm[0]),
        "paperHeight": inches(layout.paper_mm[1]),
        "marginTop": inches(layout.margins_mm.top),
        "marginBottom": inches(layout.margins_mm.bottom),
        "marginLeft": inches(layout.margins_mm.left),
        "marginRight": inches(layout.margins_mm.right),
        "printBackground": layout.background,
        "generateDocumentOutline": layout.bookmarks,
        "generateTaggedPDF": true,
        "preferCSSPageSize": true,
        "transferMode": "ReturnAsStream",
    });
    if layout.header.is_some() || layout.footer.is_some() {
        // Chromium fills a missing template with its own date/title/URL band.
        let blank = "<span></span>".to_owned();
        parameters["displayHeaderFooter"] = json!(true);
        parameters["headerTemplate"] =
            json!(layout.header.clone().unwrap_or_else(|| blank.clone()));
        parameters["footerTemplate"] = json!(layout.footer.clone().unwrap_or(blank));
    }
    parameters
}

/// Renders `prepared` in an owned, hidden WebView2 renderer and returns the PDF bytes.
/// Blocking; called from a worker thread.
pub(super) fn render(
    app: &AppHandle,
    window: &WebviewWindow,
    prepared: PreparedHtml,
    layout: &PdfLayout,
) -> Result<Vec<u8>, String> {
    let renderer = Renderer::open(app, window, prepared, "pdf-export-", 900.0, 700.0)?;
    renderer.wait_loaded(LOAD_TIMEOUT)?;
    let parameters = print_parameters(layout);
    let script = prepare_script(layout);
    renderer
        .drive(RENDER_TIMEOUT, move |devtools, finish| {
            let print = devtools.clone();
            let settle = json!({"expression": script, "awaitPromise": true, "returnByValue": true});
            devtools.call("Runtime.evaluate", &settle, move |result| {
                // The page rule is what makes the settings win, so a failed script is a failure.
                let failed = result.and_then(|value| match value.get("exceptionDetails") {
                    Some(_) => Err("无法为导出页面设定纸张与边距；未保存".to_owned()),
                    None => Ok(()),
                });
                let step = finish.clone();
                step.then(failed, move |()| {
                    let reader = print.clone();
                    print.call("Page.printToPDF", &parameters, move |result| {
                        let done = finish.clone();
                        done.then(result, |value| {
                            match value.get("stream").and_then(Value::as_str) {
                                Some(handle) => {
                                    read_stream(reader, handle.to_owned(), MAX_HTML_BYTES, finish)
                                }
                                None => match decode(&value) {
                                    Ok(bytes) => finish.ok(bytes),
                                    Err(message) => finish.fail(message),
                                },
                            }
                        });
                    });
                });
            });
        })
        .and_then(|bytes| {
            if bytes.starts_with(b"%PDF-") {
                Ok(bytes)
            } else {
                Err("渲染器没有产出有效的 PDF；未保存".into())
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::exports::print_options::PrintMargins;

    fn layout() -> PdfLayout {
        PdfLayout {
            paper_mm: [210.0, 297.0],
            margins_mm: PrintMargins {
                top: 25.4,
                right: 12.7,
                bottom: 25.4,
                left: 12.7,
            },
            header: None,
            footer: None,
            bookmarks: true,
            background: false,
        }
    }

    #[test]
    fn the_page_rule_states_paper_and_margins_in_millimetres() {
        assert_eq!(
            page_rule(&layout()),
            "@page{size:210.000mm 297.000mm;margin:25.400mm 12.700mm 25.400mm 12.700mm}"
        );
        let script = prepare_script(&layout());
        assert!(script.contains("document.head.append(rule)"));
        assert!(script.contains("document.fonts.ready"));
    }

    #[test]
    fn geometry_is_sent_in_inches_and_matches_the_page_rule() {
        let value = print_parameters(&layout());
        assert!((value["paperWidth"].as_f64().unwrap() - 8.2677).abs() < 1e-3);
        assert!((value["paperHeight"].as_f64().unwrap() - 11.6929).abs() < 1e-3);
        assert_eq!(value["marginTop"], 1.0);
        assert_eq!(value["marginLeft"], 0.5);
        assert_eq!(value["preferCSSPageSize"], true);
        assert_eq!(value["printBackground"], false);
        assert_eq!(value["generateDocumentOutline"], true);
        assert_eq!(value["transferMode"], "ReturnAsStream");
        assert!(value.get("displayHeaderFooter").is_none());
    }

    #[test]
    fn a_single_band_never_lets_chromium_add_its_own_other_band() {
        let mut only_footer = layout();
        only_footer.footer = Some("<div>f</div>".into());
        let value = print_parameters(&only_footer);
        assert_eq!(value["displayHeaderFooter"], true);
        assert_eq!(value["footerTemplate"], "<div>f</div>");
        assert_eq!(value["headerTemplate"], "<span></span>");
        let mut only_header = layout();
        only_header.header = Some("<div>h</div>".into());
        let value = print_parameters(&only_header);
        assert_eq!(value["headerTemplate"], "<div>h</div>");
        assert_eq!(value["footerTemplate"], "<span></span>");
    }
}
