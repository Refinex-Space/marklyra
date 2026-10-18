//! Private, hash-checked AppKit raster inputs; excluded from all editor SDK packages.
use objc2::{rc::Retained, AnyThread};
use objc2_app_kit::NSImage;
use objc2_foundation::{NSData, NSSize};

pub(super) struct TitlebarImages {
    pub outline: Retained<NSImage>,
    pub outline_dark: Retained<NSImage>,
    pub sidebar: Retained<NSImage>,
    pub sidebar_dark: Retained<NSImage>,
}

fn image(bytes: &[u8], width: f64, height: f64) -> Result<Retained<NSImage>, String> {
    let image = NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(bytes))
        .ok_or("无法解码已核验的标题栏图像")?;
    image.setSize(NSSize::new(width, height));
    image.setTemplate(false);
    Ok(image)
}

impl TitlebarImages {
    pub fn load() -> Result<Self, String> {
        Ok(Self {
            outline: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../private/native-titlebar/tocButton@2x.png"
                )),
                13.0,
                10.0,
            )?,
            outline_dark: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../private/native-titlebar/tocButtonWhite@2x.png"
                )),
                13.0,
                10.0,
            )?,
            sidebar: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../private/native-titlebar/sideButton@2x.png"
                )),
                12.0,
                12.0,
            )?,
            sidebar_dark: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../private/native-titlebar/sideButtonWhite@2x.png"
                )),
                12.0,
                12.0,
            )?,
        })
    }
}
