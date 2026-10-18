//! Bounded raster conversion for explicit native clipboard reads.
use crate::{validation, ImageError, MAX_IMAGE_BYTES};
use image::{ImageDecoder, ImageFormat, ImageReader};
use std::io::{Cursor, Seek, SeekFrom, Write};

#[derive(Clone, Copy, Debug)]
pub enum ClipboardFormat {
    Png,
    Tiff,
    Dib,
}

pub fn clipboard_png(bytes: &[u8], format: ClipboardFormat) -> Result<Vec<u8>, ImageError> {
    if bytes.is_empty() {
        return Err(ImageError::InvalidImage);
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(ImageError::TooLarge);
    }
    if matches!(format, ClipboardFormat::Png) {
        if validation::validate(bytes)?.mime != "image/png" {
            return Err(ImageError::InvalidImage);
        }
        return Ok(bytes.to_vec());
    }
    let wrapped;
    let (bytes, format) = match format {
        ClipboardFormat::Tiff => (bytes, ImageFormat::Tiff),
        ClipboardFormat::Dib => {
            wrapped = dib_bmp(bytes)?;
            (wrapped.as_slice(), ImageFormat::Bmp)
        }
        ClipboardFormat::Png => unreachable!(),
    };
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(validation::limits());
    let mut decoder = reader.into_decoder().map_err(validation::image_error)?;
    let (width, height) = decoder.dimensions();
    validation::dimensions(width, height)?;
    if decoder.total_bytes() > 64 * 1024 * 1024 {
        return Err(ImageError::DecodeLimit);
    }
    let orientation = decoder.orientation().map_err(validation::image_error)?;
    let mut image = image::DynamicImage::from_decoder(decoder).map_err(validation::image_error)?;
    image.apply_orientation(orientation);
    let mut output = LimitedOutput {
        inner: Cursor::new(Vec::new()),
        exceeded: false,
    };
    let result = image.write_to(&mut output, ImageFormat::Png);
    if output.exceeded {
        return Err(ImageError::TooLarge);
    }
    result.map_err(validation::image_error)?;
    Ok(output.inner.into_inner())
}
struct LimitedOutput {
    inner: Cursor<Vec<u8>>,
    exceeded: bool,
}
impl Write for LimitedOutput {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if self
            .inner
            .position()
            .checked_add(bytes.len() as u64)
            .is_none_or(|end| end > MAX_IMAGE_BYTES as u64)
        {
            self.exceeded = true;
            return Err(std::io::Error::other("clipboard PNG exceeds 8 MiB"));
        }
        self.inner.write(bytes)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
impl Seek for LimitedOutput {
    fn seek(&mut self, position: SeekFrom) -> std::io::Result<u64> {
        self.inner.seek(position)
    }
}
fn dib_bmp(dib: &[u8]) -> Result<Vec<u8>, ImageError> {
    let invalid = || ImageError::InvalidImage;
    let u16_at = |offset: usize| -> Result<u16, ImageError> {
        Ok(u16::from_le_bytes(
            dib.get(offset..offset + 2)
                .ok_or_else(invalid)?
                .try_into()
                .map_err(|_| invalid())?,
        ))
    };
    let u32_at = |offset: usize| -> Result<u32, ImageError> {
        Ok(u32::from_le_bytes(
            dib.get(offset..offset + 4)
                .ok_or_else(invalid)?
                .try_into()
                .map_err(|_| invalid())?,
        ))
    };
    let header = u32_at(0)? as usize;
    if !matches!(header, 40 | 108 | 124) || dib.len() < header {
        return Err(invalid());
    }
    let width = u32_at(4)? as i32;
    let height = u32_at(8)? as i32;
    if width <= 0 || height == 0 || height == i32::MIN || u16_at(12)? != 1 {
        return Err(invalid());
    }
    validation::dimensions(width as u32, height.unsigned_abs())?;
    let bits = u16_at(14)?;
    let compression = u32_at(16)?;
    if !matches!(bits, 1 | 4 | 8 | 16 | 24 | 32) || !matches!(compression, 0 | 3) {
        return Err(invalid());
    }
    if compression == 3 && !matches!(bits, 16 | 32) {
        return Err(invalid());
    }
    let colors = u32_at(32)? as usize;
    let max_colors = if bits <= 8 { 1usize << bits } else { 256 };
    if colors > max_colors {
        return Err(invalid());
    }
    let colors = if colors == 0 && bits <= 8 {
        max_colors
    } else {
        colors
    };
    let masks = if header == 40 && compression == 3 {
        12
    } else {
        0
    };
    let offset = header + masks + colors * 4;
    let row_bytes = (u64::from(width as u32) * u64::from(bits)).div_ceil(32) * 4;
    let pixel_bytes = row_bytes * u64::from(height.unsigned_abs());
    if offset as u64 + pixel_bytes > dib.len() as u64 {
        return Err(invalid());
    }
    // Embedded color profiles are not executed or followed; bounds are checked
    // by the decoder. Only pixel formats understood by the bounded BMP decoder.
    let mut bmp = Vec::with_capacity(14 + dib.len());
    bmp.extend_from_slice(b"BM");
    bmp.extend_from_slice(&((14 + dib.len()) as u32).to_le_bytes());
    bmp.extend_from_slice(&[0; 4]);
    bmp.extend_from_slice(&((14 + offset) as u32).to_le_bytes());
    bmp.extend_from_slice(dib);
    Ok(bmp)
}
