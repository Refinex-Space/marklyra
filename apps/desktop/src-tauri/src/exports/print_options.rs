use serde::Deserialize;

/// Only page geometry crosses the native print boundary. HTML, paths, printer
/// names and arbitrary print dictionaries remain outside this contract.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct PrintOptions {
    paper_size: String,
    custom_paper_size_mm: Option<[f64; 2]>,
    /// Turns a known paper size on its side; the system default paper stays as it is.
    landscape: bool,
    margins_mm: Option<PrintMargins>,
    header: String,
    footer: String,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrintMargins {
    pub top: f64,
    pub right: f64,
    pub bottom: f64,
    pub left: f64,
}

#[derive(Clone, Debug, Default)]
pub(super) struct PrintLayout {
    pub paper_mm: Option<[f64; 2]>,
    pub margins_mm: Option<PrintMargins>,
}

impl PrintOptions {
    pub(super) fn validate(self) -> Result<PrintLayout, String> {
        if !self.header.is_empty() || !self.footer.is_empty() {
            return Err("此宿主尚不支持自定义打印页眉和页脚；请清空后重试".into());
        }
        // These millimetre values follow the original application's paper UI,
        // including its rounded US paper dimensions.
        let paper_mm = match self.paper_size.as_str() {
            "" => None,
            "A5" => Some([148.0, 210.0]),
            "A4" => Some([210.0, 297.0]),
            "A3" => Some([297.0, 420.0]),
            "Letter" => Some([216.0, 279.0]),
            "Legal" => Some([216.0, 356.0]),
            "Tabloid" => Some([279.0, 432.0]),
            "custom" => Some(self.custom_paper_size_mm.unwrap_or([210.0, 297.0])),
            _ => return Err("打印纸型无效".into()),
        };
        let paper_mm = if self.landscape {
            paper_mm.map(|[width, height]| [height, width])
        } else {
            paper_mm
        };
        if paper_mm.is_some_and(|size| {
            size.into_iter()
                .any(|value| !value.is_finite() || !(10.0..=2000.0).contains(&value))
        }) {
            return Err("自定义纸张尺寸必须为 10 至 2000 毫米".into());
        }
        if let Some(margins) = self.margins_mm {
            if [margins.top, margins.right, margins.bottom, margins.left]
                .into_iter()
                .any(|value| !value.is_finite() || !(0.0..=500.0).contains(&value))
            {
                return Err("打印边距必须为 0 至 500 毫米".into());
            }
            if let Some([width, height]) = paper_mm {
                check_printable_area(width, height, margins)?;
            }
        }
        Ok(PrintLayout {
            paper_mm,
            margins_mm: self.margins_mm,
        })
    }
}

pub(super) fn check_printable_area(
    width_mm: f64,
    height_mm: f64,
    margins: PrintMargins,
) -> Result<(), String> {
    if margins.left + margins.right >= width_mm || margins.top + margins.bottom >= height_mm {
        Err("打印边距不能占满纸张，请减小边距".into())
    } else {
        Ok(())
    }
}

impl PrintLayout {
    /// WebView2's system print UI takes no PrintSettings argument. Its public
    /// paged-media CSS consumes this validated geometry instead. WKWebView gets
    /// the same geometry through NSPrintInfo and must not count margins twice.
    #[cfg(any(target_os = "windows", test))]
    pub(super) fn windows_html(&self, html: String) -> String {
        let mut rules = String::new();
        if let Some([width, height]) = self.paper_mm {
            rules.push_str(&format!("size:{width}mm {height}mm;"));
        }
        if let Some(margins) = self.margins_mm {
            rules.push_str(&format!(
                "margin:{}mm {}mm {}mm {}mm;",
                margins.top, margins.right, margins.bottom, margins.left
            ));
        }
        if rules.is_empty() {
            html
        } else {
            // A style appended after the immutable export wins over the
            // original forPrint margin:0 rule without executing any script.
            format!("{html}<style>@media print{{@page{{{rules}}}}}</style>")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_keeps_system_geometry_and_rejects_active_or_unknown_options() {
        let layout = PrintOptions::default().validate().unwrap();
        assert!(layout.paper_mm.is_none());
        assert!(layout.margins_mm.is_none());
        assert!(serde_json::from_str::<PrintOptions>(r#"{"path":"/tmp/out.pdf"}"#).is_err());
        for field in ["header", "footer"] {
            let value = format!(r#"{{"{field}":"${{pageNo}}"}}"#);
            assert!(serde_json::from_str::<PrintOptions>(&value)
                .unwrap()
                .validate()
                .is_err());
        }
    }

    #[test]
    fn landscape_swaps_a_known_paper_and_leaves_the_system_default_alone() {
        let layout = serde_json::from_str::<PrintOptions>(r#"{"paperSize":"A4","landscape":true}"#)
            .unwrap()
            .validate()
            .unwrap();
        assert_eq!(layout.paper_mm, Some([297.0, 210.0]));
        let layout = serde_json::from_str::<PrintOptions>(r#"{"landscape":true}"#)
            .unwrap()
            .validate()
            .unwrap();
        assert_eq!(layout.paper_mm, None);
    }

    #[test]
    fn native_geometry_is_bounded_and_cannot_remove_printable_area() {
        for value in [
            r#"{"paperSize":"unknown"}"#,
            r#"{"paperSize":"custom","customPaperSizeMm":[0,297]}"#,
            r#"{"paperSize":"custom","customPaperSizeMm":[2001,297]}"#,
            r#"{"paperSize":"A4","marginsMm":{"top":150,"right":16,"bottom":150,"left":16}}"#,
            r#"{"marginsMm":{"top":-1,"right":16,"bottom":16,"left":16}}"#,
        ] {
            assert!(
                serde_json::from_str::<PrintOptions>(value)
                    .unwrap()
                    .validate()
                    .is_err(),
                "{value}"
            );
        }
        let options = PrintOptions {
            custom_paper_size_mm: Some([f64::NAN, 297.0]),
            paper_size: "custom".into(),
            ..PrintOptions::default()
        };
        assert!(options.validate().is_err());
    }

    #[test]
    fn windows_css_consumes_validated_paper_and_margins_without_script() {
        let layout = serde_json::from_str::<PrintOptions>(
            r#"{"paperSize":"A5","marginsMm":{"top":10,"right":11,"bottom":12,"left":13}}"#,
        )
        .unwrap()
        .validate()
        .unwrap();
        let output = layout.windows_html("<p>snapshot</p>".into());
        assert_eq!(
            output,
            "<p>snapshot</p><style>@media print{@page{size:148mm 210mm;margin:10mm 11mm 12mm 13mm;}}</style>"
        );
        assert!(export_service::prepare_html(&output).is_ok());
        assert_eq!(
            PrintLayout::default().windows_html("<p>x</p>".into()),
            "<p>x</p>"
        );
    }
}
