//! Shared limits for whole-document raster capture and its native regression harness.
use std::sync::{mpsc, Arc, Mutex};
pub(super) const MAX_PIXELS: u64 = 16_777_216;
pub(super) const MAX_HEIGHT: u32 = 32_768;
#[derive(Clone, Copy)]
pub(super) struct Geometry {
    pub width: u32,
    pub scale: u32,
}
impl Geometry {
    pub fn check(self, height: u32) -> Result<(), String> {
        if height == 0
            || height > MAX_HEIGHT
            || u64::from(self.width) * u64::from(height) * u64::from(self.scale).pow(2) > MAX_PIXELS
        {
            return Err(
                "整篇图片超过32,768px或16Mi像素限制；请降低宽度/质量或缩短文稿，未裁切保存".into(),
            );
        }
        Ok(())
    }
}
pub(super) type CaptureResult = Arc<Mutex<Option<mpsc::Sender<Result<Vec<u8>, String>>>>>;
pub(super) fn finish(sender: &CaptureResult, value: Result<Vec<u8>, String>) {
    if let Ok(mut sender) = sender.lock() {
        if let Some(sender) = sender.take() {
            let _ = sender.send(value);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn whole_document_budget_rejects_instead_of_cropping() {
        let medium = Geometry {
            width: 640,
            scale: 1,
        };
        assert!(medium.check(12000).is_ok());
        assert!(medium.check(32769).is_err());
        assert!(Geometry {
            width: 4096,
            scale: 3
        }
        .check(1000)
        .is_err());
        assert!(medium.check(0).is_err());
    }
}
