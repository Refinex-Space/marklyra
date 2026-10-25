//! Hash-checked AppKit raster inputs and the application-owned graph SVG; excluded from editor SDK packages.
use objc2::{rc::Retained, AnyThread};
use objc2_app_kit::NSImage;
use objc2_foundation::{NSData, NSSize};

pub(super) struct TitlebarImages {
    pub graph: Retained<NSImage>,
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
        let graph = image(
            include_bytes!("../../../../public/icons/knowledge-graph.svg"),
            16.0,
            16.0,
        )?;
        graph.setTemplate(true);
        Ok(Self {
            graph,
            outline: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../resources/native-titlebar/tocButton@2x.png"
                )),
                13.0,
                10.0,
            )?,
            outline_dark: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../resources/native-titlebar/tocButtonWhite@2x.png"
                )),
                13.0,
                10.0,
            )?,
            sidebar: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../resources/native-titlebar/sideButton@2x.png"
                )),
                12.0,
                12.0,
            )?,
            sidebar_dark: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/../../../resources/native-titlebar/sideButtonWhite@2x.png"
                )),
                12.0,
                12.0,
            )?,
        })
    }
}
