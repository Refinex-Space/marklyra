//! WebView2 whole-document raster capture through the DevTools protocol.
use super::{
    cdp::{decode, number, Devtools, Finish, Renderer},
    image_geometry::Geometry,
};
use export_service::PreparedHtml;
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, WebviewWindow};

const LOAD_TIMEOUT: Duration = Duration::from_secs(30);
const CAPTURE_TIMEOUT: Duration = Duration::from_secs(60);
const JPEG_QUALITY: u32 = 92;
/// Waits inside the page until the snapshot has settled, then reports what the capture needs.
/// Same readiness and clipping rules as the macOS capture.
const SETTLED: &str = "new Promise((resolve) => { const started = Date.now(); const probe = () => { const ready = document.readyState === 'complete' && document.fonts.status === 'loaded' && !Array.from(document.fonts).some((f) => f.status === 'error') && Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0); if (ready || Date.now() - started > 20000) resolve(JSON.stringify({ ready, width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)), clipped: Array.from(document.querySelectorAll('pre,.md-fences')).some((e) => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1) })); else setTimeout(probe, 50); }; probe(); })";

#[derive(serde::Deserialize)]
struct Probe {
    ready: bool,
    width: u32,
    clipped: bool,
}

/// Viewport emulation: `width` CSS pixels at `scale` device pixels per CSS pixel.
fn viewport(geometry: Geometry, height: u32) -> Value {
    json!({
        "width": geometry.width,
        "height": height,
        "deviceScaleFactor": geometry.scale,
        "mobile": false,
    })
}

/// `Page.captureScreenshot` parameters for the whole `height`-pixel-tall document.
pub(super) fn screenshot_parameters(geometry: Geometry, height: u32, jpeg: bool) -> Value {
    let mut parameters = json!({
        "format": if jpeg { "jpeg" } else { "png" },
        "captureBeyondViewport": true,
        "fromSurface": true,
        "clip": {"x": 0, "y": 0, "width": geometry.width, "height": height, "scale": 1},
    });
    if jpeg {
        parameters["quality"] = json!(JPEG_QUALITY);
    }
    parameters
}

/// The probe result as a verdict: what to refuse, or the settled state.
fn verdict(probe: &Probe, geometry: Geometry) -> Result<(), String> {
    if !probe.ready {
        return Err("图片、字体或布局未在20秒内就绪；未保存".into());
    }
    if probe.clipped {
        return Err("代码块存在横向滚动内容；请增大导出宽度，未裁切保存".into());
    }
    if probe.width > geometry.width + 1 {
        return Err("文稿存在超出图片宽度的内容；未裁切保存，请增大导出宽度".into());
    }
    Ok(())
}

/// The renderer must hand back the encoding that was asked for.
fn check_encoding(bytes: &[u8], jpeg: bool) -> Result<(), String> {
    let valid = if jpeg {
        bytes.starts_with(&[0xff, 0xd8, 0xff])
    } else {
        bytes.starts_with(b"\x89PNG\r\n\x1a\n")
    };
    if valid {
        Ok(())
    } else {
        Err("渲染器没有产出有效的图片；未保存".into())
    }
}

// The steps below each hand over to the next from their completion callback.

fn settle(devtools: Devtools, finish: Finish<Vec<u8>>, geometry: Geometry, jpeg: bool) {
    let next = devtools.clone();
    let parameters = json!({"expression": SETTLED, "awaitPromise": true, "returnByValue": true});
    devtools.call("Runtime.evaluate", &parameters, move |result| {
        let probe = result.and_then(|value| {
            value
                .pointer("/result/value")
                .and_then(Value::as_str)
                .and_then(|text| serde_json::from_str::<Probe>(text).ok())
                .ok_or_else(|| "渲染器无法读取整篇图片布局；未保存".to_owned())
        });
        let step = finish.clone();
        step.then(probe, move |probe| match verdict(&probe, geometry) {
            Ok(()) => measure(next, finish, geometry, jpeg),
            Err(message) => finish.fail(message),
        });
    });
}

fn measure(devtools: Devtools, finish: Finish<Vec<u8>>, geometry: Geometry, jpeg: bool) {
    let next = devtools.clone();
    devtools.call("Page.getLayoutMetrics", &json!({}), move |result| {
        let step = finish.clone();
        step.then(result, move |metrics| {
            let height = number(&metrics, &["cssContentSize", "height"])
                .map_or(0, |height| height.ceil() as u32);
            match geometry.check(height) {
                Ok(()) => resize(next, finish, geometry, height, jpeg),
                Err(message) => finish.fail(message),
            }
        });
    });
}

fn resize(
    devtools: Devtools,
    finish: Finish<Vec<u8>>,
    geometry: Geometry,
    height: u32,
    jpeg: bool,
) {
    let next = devtools.clone();
    devtools.call(
        "Emulation.setDeviceMetricsOverride",
        &viewport(geometry, height),
        move |result| {
            let step = finish.clone();
            step.then(result, move |_| shoot(next, finish, geometry, height, jpeg));
        },
    );
}

fn shoot(devtools: Devtools, finish: Finish<Vec<u8>>, geometry: Geometry, height: u32, jpeg: bool) {
    devtools.call(
        "Page.captureScreenshot",
        &screenshot_parameters(geometry, height, jpeg),
        move |result| match result.and_then(|value| decode(&value)) {
            Ok(bytes) => finish.ok(bytes),
            Err(message) => finish.fail(message),
        },
    );
}

/// Renders `prepared` in an owned, hidden WebView2 renderer and returns PNG or JPEG bytes of the
/// whole document at `geometry`. Blocking; called from a worker thread.
pub(super) fn capture(
    app: &AppHandle,
    window: &WebviewWindow,
    prepared: PreparedHtml,
    geometry: Geometry,
    jpeg: bool,
) -> Result<Vec<u8>, String> {
    let renderer = Renderer::open(
        app,
        window,
        prepared,
        "image-export-",
        f64::from(geometry.width),
        64.0,
    )?;
    renderer.wait_loaded(LOAD_TIMEOUT)?;
    renderer
        .drive(CAPTURE_TIMEOUT, move |devtools, finish| {
            let next = devtools.clone();
            // The document is laid out at its final width before anything is measured.
            devtools.call(
                "Emulation.setDeviceMetricsOverride",
                &viewport(geometry, 64),
                move |result| {
                    let step = finish.clone();
                    step.then(result, move |_| settle(next, finish, geometry, jpeg));
                },
            );
        })
        .and_then(|bytes| check_encoding(&bytes, jpeg).map(|()| bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn geometry() -> Geometry {
        Geometry {
            width: 640,
            scale: 2,
        }
    }

    #[test]
    fn the_whole_document_is_captured_at_the_requested_scale() {
        let png = screenshot_parameters(geometry(), 3000, false);
        assert_eq!(png["format"], "png");
        assert_eq!(png["captureBeyondViewport"], true);
        assert_eq!(png["clip"]["width"], 640);
        assert_eq!(png["clip"]["height"], 3000);
        assert_eq!(png["clip"]["scale"], 1);
        assert!(png.get("quality").is_none());
        let jpeg = screenshot_parameters(geometry(), 3000, true);
        assert_eq!(jpeg["format"], "jpeg");
        assert_eq!(jpeg["quality"], 92);
        let view = viewport(geometry(), 3000);
        assert_eq!(view["width"], 640);
        assert_eq!(view["deviceScaleFactor"], 2);
        assert_eq!(view["mobile"], false);
    }

    #[test]
    fn unsettled_clipped_or_overwide_pages_are_refused_instead_of_cropped() {
        let ok = Probe {
            ready: true,
            width: 640,
            clipped: false,
        };
        assert!(verdict(&ok, geometry()).is_ok());
        for probe in [
            Probe {
                ready: false,
                width: 640,
                clipped: false,
            },
            Probe {
                ready: true,
                width: 640,
                clipped: true,
            },
            Probe {
                ready: true,
                width: 900,
                clipped: false,
            },
        ] {
            assert!(verdict(&probe, geometry()).is_err());
        }
    }

    #[test]
    fn only_the_requested_encoding_is_accepted() {
        assert!(check_encoding(b"\x89PNG\r\n\x1a\nrest", false).is_ok());
        assert!(check_encoding(&[0xff, 0xd8, 0xff, 0xe0], true).is_ok());
        assert!(check_encoding(&[0xff, 0xd8, 0xff, 0xe0], false).is_err());
        assert!(check_encoding(b"\x89PNG\r\n\x1a\n", true).is_err());
        assert!(check_encoding(b"", true).is_err());
    }
}
