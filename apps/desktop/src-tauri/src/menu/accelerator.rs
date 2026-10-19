//! Menu accelerators as Windows virtual-key chords.
//!
//! WebView2 owns keyboard focus, so the top-level window never sees the keys that
//! Win32 would turn into menu commands. The host matches the same accelerator strings
//! that the native menu displays, before the page receives them.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Chord {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub key: u32,
}

fn key(name: &str) -> Option<u32> {
    let bytes = name.as_bytes();
    if bytes.len() == 1 && bytes[0].is_ascii_alphanumeric() {
        return Some(u32::from(bytes[0].to_ascii_uppercase()));
    }
    if let Some(number) = name.strip_prefix('F').and_then(|n| n.parse::<u32>().ok()) {
        return (1..=12).contains(&number).then(|| 0x6F + number);
    }
    Some(match name {
        "Tab" => 0x09,
        "Enter" | "Return" => 0x0D,
        "Escape" | "Esc" => 0x1B,
        "Space" => 0x20,
        "Comma" | "," => 0xBC,
        "Period" | "." => 0xBE,
        "Minus" | "-" => 0xBD,
        "Equal" | "=" | "Plus" => 0xBB,
        "Slash" | "/" => 0xBF,
        "Semicolon" | ";" => 0xBA,
        "Quote" | "'" => 0xDE,
        "Backquote" | "`" => 0xC0,
        "BracketLeft" | "[" => 0xDB,
        "BracketRight" | "]" => 0xDD,
        "Backslash" | "\\" => 0xDC,
        _ => return None,
    })
}

/// Parses `CmdOrCtrl+Shift+L` style strings. `Cmd`/`Super` have no Windows chord.
pub fn parse(text: &str) -> Option<Chord> {
    let mut chord = Chord {
        ctrl: false,
        shift: false,
        alt: false,
        key: 0,
    };
    let mut parts = text.split('+').peekable();
    while let Some(part) = parts.next() {
        if parts.peek().is_none() {
            chord.key = key(part)?;
            break;
        }
        match part {
            "CmdOrCtrl" | "CommandOrControl" | "Ctrl" | "Control" => chord.ctrl = true,
            "Shift" => chord.shift = true,
            "Alt" | "Option" => chord.alt = true,
            _ => return None,
        }
    }
    (chord.key != 0).then_some(chord)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_menu_notation_used_by_every_windows_binding() {
        assert_eq!(
            parse("CmdOrCtrl+Shift+L"),
            Some(Chord {
                ctrl: true,
                shift: true,
                alt: false,
                key: u32::from(b'L')
            })
        );
        assert_eq!(parse("F11").map(|c| (c.ctrl, c.key)), Some((false, 0x7A)));
        assert_eq!(parse("Ctrl+Shift+1").map(|c| c.key), Some(u32::from(b'1')));
        assert_eq!(parse("CmdOrCtrl+Shift+Minus").map(|c| c.key), Some(0xBD));
        assert_eq!(parse("CmdOrCtrl+BracketRight").map(|c| c.key), Some(0xDD));
        assert_eq!(parse("Ctrl+Backquote").map(|c| c.key), Some(0xC0));
        assert_eq!(parse("CmdOrCtrl+,").map(|c| c.key), Some(0xBC));
        assert_eq!(parse("Ctrl+Tab").map(|c| c.key), Some(0x09));
    }

    #[test]
    fn rejects_unknown_modifiers_and_keys() {
        assert_eq!(parse("Cmd+Shift+F"), None);
        assert_eq!(parse("Ctrl+Hyper"), None);
        assert_eq!(parse("Ctrl+"), None);
        assert_eq!(parse(""), None);
    }
}
