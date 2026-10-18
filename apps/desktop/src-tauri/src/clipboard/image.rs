use base64::{engine::general_purpose::STANDARD, Engine};
use image_assets::ClipboardFormat;
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ClipboardImage {
    pub name: String,
    #[serde(rename = "type")]
    pub mime: &'static str,
    pub base64: String,
}
pub struct NativeImage {
    pub bytes: Vec<u8>,
    pub format: ClipboardFormat,
}
impl NativeImage {
    pub fn convert(self) -> Result<ClipboardImage, String> {
        let png = image_assets::clipboard_png(&self.bytes, self.format)
            .map_err(|error| error.to_string())?;
        Ok(ClipboardImage {
            name: format!("clipboard-{}.png", uuid::Uuid::new_v4()),
            mime: "image/png",
            base64: STANDARD.encode(png),
        })
    }
}
