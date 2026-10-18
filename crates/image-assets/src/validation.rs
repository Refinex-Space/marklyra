use crate::{ImageError, MAX_IMAGE_BYTES};
use image::{AnimationDecoder, ImageDecoder, ImageFormat, ImageReader, Limits};
use quick_xml::{
    events::{BytesStart, Event},
    Reader,
};
use std::io::Cursor;

const MAX_DIMENSION: u32 = 16_384;
const MAX_PIXELS: u64 = 16_777_216;
const MAX_DECODE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_FRAMES: usize = 100;
const MAX_SVG_BYTES: usize = 1024 * 1024;
pub(crate) struct ImageKind {
    pub mime: &'static str,
    pub extension: &'static str,
}
pub(crate) fn limits() -> Limits {
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_BYTES);
    limits
}
pub(crate) fn dimensions(width: u32, height: u32) -> Result<(), ImageError> {
    if width == 0
        || height == 0
        || width > MAX_DIMENSION
        || height > MAX_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_PIXELS
    {
        return Err(ImageError::DecodeLimit);
    }
    Ok(())
}
pub(crate) fn image_error(error: image::ImageError) -> ImageError {
    if matches!(error, image::ImageError::Limits(_)) {
        ImageError::DecodeLimit
    } else {
        ImageError::InvalidImage
    }
}
fn frames<'a>(frames: image::Frames<'a>) -> Result<(), ImageError> {
    let mut count = 0;
    for frame in frames {
        count += 1;
        if count > MAX_FRAMES {
            return Err(ImageError::DecodeLimit);
        }
        let frame = frame.map_err(image_error)?;
        dimensions(frame.buffer().width(), frame.buffer().height())?;
    }
    if count == 0 {
        return Err(ImageError::InvalidImage);
    }
    Ok(())
}
pub(crate) fn validate(bytes: &[u8]) -> Result<ImageKind, ImageError> {
    if bytes.is_empty() {
        return Err(ImageError::InvalidImage);
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(ImageError::TooLarge);
    }
    let format = match image::guess_format(bytes) {
        Ok(format) => format,
        Err(_) => return svg(bytes),
    };
    let (mime, extension) = match format {
        ImageFormat::Png => ("image/png", "png"),
        ImageFormat::Jpeg => ("image/jpeg", "jpg"),
        ImageFormat::Gif => ("image/gif", "gif"),
        ImageFormat::WebP => ("image/webp", "webp"),
        _ => return Err(ImageError::InvalidImage),
    };
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits());
    let decoder = reader.into_decoder().map_err(image_error)?;
    let (width, height) = decoder.dimensions();
    dimensions(width, height)?;
    if decoder.total_bytes() > MAX_DECODE_BYTES {
        return Err(ImageError::DecodeLimit);
    }
    drop(decoder);
    match format {
        ImageFormat::Gif => {
            let mut decoder =
                image::codecs::gif::GifDecoder::new(Cursor::new(bytes)).map_err(image_error)?;
            decoder.set_limits(limits()).map_err(image_error)?;
            frames(decoder.into_frames())?;
        }
        ImageFormat::WebP => {
            let mut decoder =
                image::codecs::webp::WebPDecoder::new(Cursor::new(bytes)).map_err(image_error)?;
            decoder.set_limits(limits()).map_err(image_error)?;
            if decoder.has_animation() {
                frames(decoder.into_frames())?;
            } else {
                image::DynamicImage::from_decoder(decoder).map_err(image_error)?;
            }
        }
        ImageFormat::Png => {
            let decoder = image::codecs::png::PngDecoder::with_limits(Cursor::new(bytes), limits())
                .map_err(image_error)?;
            if decoder.is_apng().map_err(image_error)? {
                // image 0.25.10 APNG composition has an unreachable branch for
                // 16-bit color. Reject before iteration rather than poison host state.
                if matches!(
                    decoder.color_type(),
                    image::ColorType::L16
                        | image::ColorType::La16
                        | image::ColorType::Rgb16
                        | image::ColorType::Rgba16
                ) {
                    return Err(ImageError::UnsupportedAnimation);
                }
                frames(decoder.apng().map_err(image_error)?.into_frames())?;
            } else {
                image::DynamicImage::from_decoder(decoder).map_err(image_error)?;
            }
        }
        _ => {
            let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
            reader.limits(limits());
            reader.decode().map_err(image_error)?;
        }
    }
    Ok(ImageKind { mime, extension })
}
fn svg(bytes: &[u8]) -> Result<ImageKind, ImageError> {
    if bytes.len() > MAX_SVG_BYTES {
        return Err(ImageError::SvgTooLarge);
    }
    let text = std::str::from_utf8(bytes).map_err(|_| ImageError::InvalidImage)?;
    let mut reader = Reader::from_str(text.trim_start_matches('\u{feff}'));
    reader.config_mut().check_end_names = true;
    let (mut depth, mut roots, mut nodes) = (0usize, 0usize, 0usize);
    loop {
        match reader.read_event().map_err(|_| ImageError::InvalidImage)? {
            Event::Start(element) => {
                check_svg_element(&element, depth == 0)?;
                if depth == 0 {
                    roots += 1;
                }
                depth += 1;
                nodes += 1;
            }
            Event::Empty(element) => {
                check_svg_element(&element, depth == 0)?;
                if depth == 0 {
                    roots += 1;
                }
                nodes += 1;
            }
            Event::End(_) => {
                depth = depth.checked_sub(1).ok_or(ImageError::InvalidImage)?;
            }
            Event::DocType(_) | Event::PI(_) => return Err(ImageError::UnsafeSvg),
            Event::Text(text)
                if depth == 0 && !text.as_ref().bytes().all(|byte| byte.is_ascii_whitespace()) =>
            {
                return Err(ImageError::InvalidImage);
            }
            Event::CData(_) if depth == 0 => return Err(ImageError::InvalidImage),
            Event::GeneralRef(reference)
                if depth == 0
                    || (reference
                        .resolve_char_ref()
                        .map_err(|_| ImageError::InvalidImage)?
                        .is_none()
                        && !matches!(
                            reference.as_ref(),
                            "amp" | "lt" | "gt" | "apos" | "quot"
                        )) =>
            {
                return Err(ImageError::InvalidImage);
            }
            Event::Decl(declaration) => {
                if roots > 0
                    || declaration
                        .version()
                        .map_err(|_| ImageError::InvalidImage)?
                        != "1.0"
                {
                    return Err(ImageError::InvalidImage);
                }
                if let Some(encoding) = declaration.encoding() {
                    if !matches!(
                        encoding
                            .map_err(|_| ImageError::InvalidImage)?
                            .to_ascii_lowercase()
                            .as_str(),
                        "utf-8" | "utf8"
                    ) {
                        return Err(ImageError::InvalidImage);
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
        if roots > 1 || nodes > 20_000 || depth > 128 {
            return Err(ImageError::DecodeLimit);
        }
    }
    if roots != 1 || depth != 0 {
        return Err(ImageError::InvalidImage);
    }
    Ok(ImageKind {
        mime: "image/svg+xml",
        extension: "svg",
    })
}
fn check_svg_element(element: &BytesStart<'_>, root: bool) -> Result<(), ImageError> {
    let local = element.local_name();
    let name = local.as_ref().to_ascii_lowercase();
    if root && name != "svg" {
        return Err(ImageError::InvalidImage);
    }
    if matches!(
        name.as_str(),
        "script" | "foreignobject" | "animate" | "animatetransform" | "animatemotion" | "set"
    ) {
        return Err(ImageError::UnsafeSvg);
    }
    let mut namespace = false;
    let (mut width, mut height) = (None, None);
    for (index, attribute) in element.attributes().enumerate() {
        if index >= 128 {
            return Err(ImageError::DecodeLimit);
        }
        let attribute = attribute.map_err(|_| ImageError::InvalidImage)?;
        let key = attribute.key.as_ref().to_ascii_lowercase();
        let local = key.rsplit(':').next().unwrap_or_default();
        let value = attribute
            .normalized_value(quick_xml::XmlVersion::Implicit1_0)
            .map_err(|_| ImageError::InvalidImage)?;
        if key == "xmlns" {
            namespace = value == "http://www.w3.org/2000/svg";
        }
        if local.starts_with("on") || local == "src" || local == "base" {
            return Err(ImageError::UnsafeSvg);
        }
        if local == "href" && !value.trim().starts_with('#') {
            return Err(ImageError::UnsafeSvg);
        }
        if root && (local == "width" || local == "height") {
            let dimension = svg_length(&value)?;
            if local == "width" {
                width = dimension;
            } else {
                height = dimension;
            }
        }
        if root && local == "viewbox" {
            let values = value
                .split(|character: char| character.is_whitespace() || character == ',')
                .filter(|value| !value.is_empty())
                .map(str::parse::<f64>)
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| ImageError::InvalidImage)?;
            if values.len() != 4 || values.iter().any(|value| !value.is_finite()) {
                return Err(ImageError::InvalidImage);
            }
            if values[2] <= 0.0
                || values[3] <= 0.0
                || values[2] > f64::from(MAX_DIMENSION)
                || values[3] > f64::from(MAX_DIMENSION)
                || values[2] * values[3] > MAX_PIXELS as f64
            {
                return Err(ImageError::DecodeLimit);
            }
        }
    }
    if width
        .zip(height)
        .is_some_and(|(width, height)| width * height > MAX_PIXELS as f64)
    {
        return Err(ImageError::DecodeLimit);
    }
    if root && !namespace {
        return Err(ImageError::InvalidImage);
    }
    Ok(())
}

fn svg_length(value: &str) -> Result<Option<f64>, ImageError> {
    let value = value.trim();
    if let Some(percent) = value.strip_suffix('%') {
        let percent = percent
            .trim()
            .parse::<f64>()
            .map_err(|_| ImageError::InvalidImage)?;
        return if percent.is_finite() && percent > 0.0 && percent <= 100.0 {
            Ok(None)
        } else {
            Err(ImageError::DecodeLimit)
        };
    }
    let (number, factor) = [
        ("px", 1.0),
        ("pt", 96.0 / 72.0),
        ("pc", 16.0),
        ("mm", 96.0 / 25.4),
        ("cm", 96.0 / 2.54),
        ("in", 96.0),
        ("em", 16.0),
        ("ex", 16.0),
    ]
    .into_iter()
    .find_map(|(unit, factor)| {
        value
            .strip_suffix(unit)
            .map(|number| (number.trim(), factor))
    })
    .unwrap_or((value, 1.0));
    let pixels = number
        .parse::<f64>()
        .map_err(|_| ImageError::InvalidImage)?
        * factor;
    if !pixels.is_finite() || pixels <= 0.0 || pixels > f64::from(MAX_DIMENSION) {
        return Err(ImageError::DecodeLimit);
    }
    Ok(Some(pixels))
}
