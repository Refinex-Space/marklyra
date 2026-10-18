use serde::Deserialize;

/// CSS viewport coordinates from the trusted Shell; never filesystem authority.
#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TitlebarLayout {
    pub content_left: f64,
    pub content_right: f64,
    pub viewport_width: f64,
}

impl TitlebarLayout {
    pub fn validate(self) -> Result<Self, String> {
        if !self.viewport_width.is_finite()
            || !(1.0..=131_072.0).contains(&self.viewport_width)
            || !self.content_left.is_finite()
            || !self.content_right.is_finite()
            || self.content_left < 0.0
            || self.content_right <= self.content_left
            || self.content_right > self.viewport_width + 1.0
        {
            return Err("标题栏正文区域无效".into());
        }
        Ok(self)
    }

    #[cfg(any(target_os = "macos", test))]
    pub fn bounds(self, native_width: f64) -> (f64, f64) {
        let scale = native_width / self.viewport_width;
        (self.content_left * scale, self.content_right * scale)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reading_bounds_follow_both_panels_and_webview_zoom() {
        let layout = TitlebarLayout {
            content_left: 270.0,
            content_right: 980.0,
            viewport_width: 1280.0,
        }
        .validate()
        .unwrap();
        assert_eq!(layout.bounds(1280.0), (270.0, 980.0));
        assert_eq!(layout.bounds(1024.0), (216.0, 784.0));
    }

    #[test]
    fn malformed_or_nonfinite_layouts_never_reach_appkit() {
        for (left, right, width) in [
            (-1.0, 800.0, 1000.0),
            (900.0, 800.0, 1000.0),
            (0.0, 1100.0, 1000.0),
            (0.0, 0.0, 0.0),
            (f64::NAN, 800.0, 1000.0),
            (0.0, f64::INFINITY, 1000.0),
        ] {
            assert!(TitlebarLayout {
                content_left: left,
                content_right: right,
                viewport_width: width
            }
            .validate()
            .is_err());
        }
        assert!(serde_json::from_str::<TitlebarLayout>(
            r#"{"contentLeft":0,"contentRight":800,"viewportWidth":1000,"path":"/tmp"}"#
        )
        .is_err());
    }
}
