use crate::{DocumentError, MAX_FILE_BYTES, MAX_TEXT_BYTES};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Encoding {
    Utf8,
    Utf8Bom,
    Utf16LeBom,
    Utf16BeBom,
}

impl Encoding {
    pub fn from_label(label: &str) -> Result<Self, DocumentError> {
        match label {
            "UTF-8" => Ok(Self::Utf8),
            "UTF-8 BOM" => Ok(Self::Utf8Bom),
            "UTF-16LE BOM" => Ok(Self::Utf16LeBom),
            "UTF-16BE BOM" => Ok(Self::Utf16BeBom),
            _ => Err(DocumentError::UnsupportedEncoding),
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Utf8 => "UTF-8",
            Self::Utf8Bom => "UTF-8 BOM",
            Self::Utf16LeBom => "UTF-16LE BOM",
            Self::Utf16BeBom => "UTF-16BE BOM",
        }
    }

    pub fn decode(bytes: &[u8]) -> Result<(Self, String), DocumentError> {
        if bytes.len() > MAX_FILE_BYTES {
            return Err(DocumentError::TooLarge);
        }
        // UTF-32 must be checked before its prefix can be mistaken for UTF-16LE.
        if bytes.starts_with(&[0xff, 0xfe, 0, 0]) || bytes.starts_with(&[0, 0, 0xfe, 0xff]) {
            return Err(DocumentError::UnsupportedEncoding);
        }
        let (encoding, text) = if let Some(content) = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]) {
            (Self::Utf8Bom, decode_utf8(content)?)
        } else if let Some(content) = bytes.strip_prefix(&[0xff, 0xfe]) {
            (Self::Utf16LeBom, decode_utf16(content, true)?)
        } else if let Some(content) = bytes.strip_prefix(&[0xfe, 0xff]) {
            (Self::Utf16BeBom, decode_utf16(content, false)?)
        } else {
            (Self::Utf8, decode_utf8(bytes)?)
        };
        validate_text(&text)?;
        Ok((encoding, text))
    }

    pub fn encode(self, text: &str) -> Result<Vec<u8>, DocumentError> {
        validate_text(text)?;
        let bytes = match self {
            Self::Utf8 => text.as_bytes().to_vec(),
            Self::Utf8Bom => [&[0xef, 0xbb, 0xbf], text.as_bytes()].concat(),
            Self::Utf16LeBom | Self::Utf16BeBom => {
                let little = self == Self::Utf16LeBom;
                let mut bytes = if little {
                    vec![0xff, 0xfe]
                } else {
                    vec![0xfe, 0xff]
                };
                for unit in text.encode_utf16() {
                    bytes.extend_from_slice(&if little {
                        unit.to_le_bytes()
                    } else {
                        unit.to_be_bytes()
                    });
                }
                bytes
            }
        };
        if bytes.len() > MAX_FILE_BYTES {
            return Err(DocumentError::TooLarge);
        }
        Ok(bytes)
    }
}

pub fn validate_text(text: &str) -> Result<(), DocumentError> {
    if text.len() > MAX_TEXT_BYTES {
        return Err(DocumentError::TooLarge);
    }
    if text.contains('\0') {
        return Err(DocumentError::UnsupportedEncoding);
    }
    Ok(())
}

fn decode_utf8(bytes: &[u8]) -> Result<String, DocumentError> {
    String::from_utf8(bytes.to_vec()).map_err(|_| DocumentError::UnsupportedEncoding)
}

fn decode_utf16(bytes: &[u8], little: bool) -> Result<String, DocumentError> {
    if !bytes.len().is_multiple_of(2) {
        return Err(DocumentError::UnsupportedEncoding);
    }
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| {
            if little {
                u16::from_le_bytes([pair[0], pair[1]])
            } else {
                u16::from_be_bytes([pair[0], pair[1]])
            }
        })
        .collect();
    String::from_utf16(&units).map_err(|_| DocumentError::UnsupportedEncoding)
}
