//! Converter formats supported by the editor.
use crate::MAX_HTML_BYTES;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConversionFormat {
    Docx,
    Odt,
    Rtf,
    Epub,
    Latex,
    Wiki,
    Rst,
    Textile,
    Opml,
}
impl ConversionFormat {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "docx" => Ok(Self::Docx),
            "odt" => Ok(Self::Odt),
            "rtf" => Ok(Self::Rtf),
            "epub" => Ok(Self::Epub),
            "latex" => Ok(Self::Latex),
            "wiki" => Ok(Self::Wiki),
            "rst" => Ok(Self::Rst),
            "textile" => Ok(Self::Textile),
            "opml" => Ok(Self::Opml),
            _ => Err("暂不支持此转换格式".into()),
        }
    }
    pub fn key(self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Odt => "odt",
            Self::Rtf => "rtf",
            Self::Epub => "epub",
            Self::Latex => "latex",
            Self::Wiki => "wiki",
            Self::Rst => "rst",
            Self::Textile => "textile",
            Self::Opml => "opml",
        }
    }
    pub fn writer(self) -> &'static str {
        if self == Self::Wiki {
            "mediawiki"
        } else {
            self.key()
        }
    }
    pub fn extension(self) -> &'static str {
        if self == Self::Latex {
            "tex"
        } else {
            self.key()
        }
    }
    pub fn title(self) -> &'static str {
        match self {
            Self::Docx => "Word (.docx)",
            Self::Odt => "OpenOffice",
            Self::Rtf => "RTF",
            Self::Epub => "Epub",
            Self::Latex => "LaTeX",
            Self::Wiki => "Media Wiki",
            Self::Rst => "reStructuredText",
            Self::Textile => "Textile",
            Self::Opml => "OPML",
        }
    }
    pub fn validate(self, bytes: &[u8]) -> Result<(), String> {
        if bytes.is_empty() || bytes.len() > MAX_HTML_BYTES {
            return Err("转换产物为空或超过32 MiB；未保存".into());
        }
        if matches!(self, Self::Docx | Self::Odt | Self::Epub) {
            let names = zip_names(bytes)?;
            let required = match self {
                Self::Docx => "word/document.xml",
                Self::Odt => "content.xml",
                Self::Epub => "META-INF/container.xml",
                _ => unreachable!(),
            };
            if !names.contains(&required) {
                return Err("转换产物缺少对应格式的必要容器成员；未保存".into());
            }
        } else {
            let text = std::str::from_utf8(bytes).map_err(|_| "转换产物不是UTF-8文本")?;
            if text.contains('\0')
                || (self == Self::Rtf && !text.trim_start().starts_with("{\\rtf"))
                || (self == Self::Opml && !text.contains("<opml"))
                || (self == Self::Latex && !text.contains("\\documentclass"))
            {
                return Err("转换产物与所选格式不符；未保存".into());
            }
        }
        Ok(())
    }
}
/// Original supported extension list; the original misspelled bfz is not guessed into a reader.
pub fn import_reader(extension: &str) -> Result<&'static str, String> {
    match extension.to_ascii_lowercase().as_str() {
        "docx" => Ok("docx"),
        "odt" => Ok("odt"),
        "rtf" => Ok("rtf"),
        "epub" | "epub2" | "epub3" => Ok("epub"),
        "latex" | "tex" | "ltx" => Ok("latex"),
        "rst" | "rest" => Ok("rst"),
        "org" => Ok("org"),
        "wiki" => Ok("mediawiki"),
        "dokuwiki" => Ok("dokuwiki"),
        "textile" => Ok("textile"),
        "opml" => Ok("opml"),
        "ipynb" => Ok("ipynb"),
        "fodt" => Ok("fodt"),
        "dbk" => Ok("docbook"),
        "fb2" => Ok("fb2"),
        "roff" => Ok("man"),
        "bfz" => Err("原版声明bfz但未确认对应转换读取器；未导入".into()),
        _ => Err("此导入扩展不在原版确认范围内".into()),
    }
}
fn zip_names(bytes: &[u8]) -> Result<Vec<&str>, String> {
    let invalid = || "转换产物不是受支持的完整ZIP容器".to_owned();
    let start = bytes.len().saturating_sub(65_557);
    let at = (start..bytes.len().saturating_sub(21))
        .rev()
        .find(|&i| bytes.get(i..i + 4) == Some(b"PK\x05\x06"))
        .ok_or_else(invalid)?;
    let u16at = |i| {
        bytes
            .get(i..i + 2)
            .map(|v| u16::from_le_bytes([v[0], v[1]]) as usize)
            .ok_or_else(invalid)
    };
    let u32at = |i| {
        bytes
            .get(i..i + 4)
            .map(|v| u32::from_le_bytes([v[0], v[1], v[2], v[3]]) as usize)
            .ok_or_else(invalid)
    };
    if u16at(at + 4)? != 0
        || u16at(at + 6)? != 0
        || u16at(at + 8)? != u16at(at + 10)?
        || at + 22 + u16at(at + 20)? != bytes.len()
    {
        return Err(invalid());
    }
    let count = u16at(at + 10)?;
    let size = u32at(at + 12)?;
    let mut pos = u32at(at + 16)?;
    if count == 0 || count > 4096 || pos.checked_add(size) != Some(at) {
        return Err(invalid());
    }
    let mut names = Vec::with_capacity(count);
    for _ in 0..count {
        if bytes.get(pos..pos + 4) != Some(b"PK\x01\x02") {
            return Err(invalid());
        }
        let n = u16at(pos + 28)?;
        let extra = u16at(pos + 30)?;
        let comment = u16at(pos + 32)?;
        let end = pos
            .checked_add(46 + n + extra + comment)
            .filter(|&v| v <= at)
            .ok_or_else(invalid)?;
        let name = std::str::from_utf8(bytes.get(pos + 46..pos + 46 + n).ok_or_else(invalid)?)
            .map_err(|_| invalid())?;
        if name.starts_with('/') || name.contains('\\') || name.split('/').any(|p| p == "..") {
            return Err(invalid());
        }
        names.push(name);
        pos = end;
    }
    if pos != at {
        return Err(invalid());
    }
    Ok(names)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_confirmed_default_formats_are_dispatchable() {
        for key in [
            "docx", "odt", "rtf", "epub", "latex", "wiki", "rst", "textile", "opml",
        ] {
            assert!(ConversionFormat::parse(key).is_ok());
        }
        for key in ["custom", "pdf", "native", "pandoc", "docx; rm", "html"] {
            assert!(ConversionFormat::parse(key).is_err());
        }
    }
    #[test]
    fn fake_extensions_are_not_conversion() {
        assert!(ConversionFormat::Docx.validate(b"<p>Fake</p>").is_err());
        assert!(ConversionFormat::Rtf.validate(b"plain").is_err());
        assert!(ConversionFormat::Rtf
            .validate(br"{\rtf1 converted}")
            .is_ok());
        assert!(ConversionFormat::Latex
            .validate(br"\documentclass{article}")
            .is_ok());
        assert!(ConversionFormat::Rst.validate("中文".as_bytes()).is_ok());
    }
    #[test]
    fn import_aliases_are_explicit() {
        assert_eq!(import_reader("TEX").unwrap(), "latex");
        assert_eq!(import_reader("epub3").unwrap(), "epub");
        assert!(import_reader("html").is_err());
        assert!(import_reader("bfz").is_err());
    }
}
