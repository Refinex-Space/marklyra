//! Shared titlebar SVGs and the application-owned knowledge-graph SVG.
use objc2::{rc::Retained, AnyThread};
use objc2_app_kit::NSImage;
use objc2_foundation::{NSData, NSSize};

pub(super) struct TitlebarImages {
    pub graph: Retained<NSImage>,
    pub outline: Retained<NSImage>,
    pub sidebar: Retained<NSImage>,
    pub sidebar_collapsed: Retained<NSImage>,
}

fn image(bytes: &[u8], width: f64, height: f64) -> Result<Retained<NSImage>, String> {
    let image = NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(bytes))
        .ok_or("无法解码标题栏图像")?;
    image.setSize(NSSize::new(width, height));
    image.setTemplate(true);
    Ok(image)
}

impl TitlebarImages {
    pub fn load() -> Result<Self, String> {
        Ok(Self {
            graph: image(
                include_bytes!("../../../../public/icons/knowledge-graph.svg"),
                16.0,
                16.0,
            )?,
            outline: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/icons/titlebar/table-of-contents.svg"
                )),
                14.0,
                14.0,
            )?,
            sidebar: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/icons/titlebar/panel-left.svg"
                )),
                14.0,
                14.0,
            )?,
            sidebar_collapsed: image(
                include_bytes!(concat!(
                    env!("CARGO_MANIFEST_DIR"),
                    "/icons/titlebar/panel-right.svg"
                )),
                14.0,
                14.0,
            )?,
        })
    }
}
