//! Extra Pandoc arguments are configuration, never a shell command line.
//!
//! The text is tokenised here, every option must be on a small allow-list of pure formatting
//! switches, and the result is handed to Pandoc as separate, normalised argv entries. Anything
//! that reads another file, runs a filter or chooses the output location is refused.

pub const MAX_ARGUMENT_BYTES: usize = 1024;
const MAX_TOKENS: usize = 32;
const MAX_VALUE_BYTES: usize = 200;

enum Kind {
    Flag,
    Integer(i64, i64),
    Choice(&'static [&'static str]),
    /// `KEY[:VALUE]`, as Pandoc's `--variable` and `--metadata` take it.
    Pair,
    Identifier,
    Offsets,
}
struct Allowed {
    long: &'static str,
    short: Option<char>,
    kind: Kind,
}

const ALLOWED: &[Allowed] = &[
    Allowed {
        long: "toc",
        short: None,
        kind: Kind::Flag,
    },
    Allowed {
        long: "table-of-contents",
        short: None,
        kind: Kind::Flag,
    },
    Allowed {
        long: "toc-depth",
        short: None,
        kind: Kind::Integer(1, 6),
    },
    Allowed {
        long: "number-sections",
        short: Some('N'),
        kind: Kind::Flag,
    },
    Allowed {
        long: "number-offset",
        short: None,
        kind: Kind::Offsets,
    },
    Allowed {
        long: "shift-heading-level-by",
        short: None,
        kind: Kind::Integer(-5, 5),
    },
    Allowed {
        long: "top-level-division",
        short: None,
        kind: Kind::Choice(&["default", "section", "chapter", "part"]),
    },
    Allowed {
        long: "columns",
        short: None,
        kind: Kind::Integer(20, 1000),
    },
    Allowed {
        long: "tab-stop",
        short: None,
        kind: Kind::Integer(1, 16),
    },
    Allowed {
        long: "preserve-tabs",
        short: Some('p'),
        kind: Kind::Flag,
    },
    Allowed {
        long: "wrap",
        short: None,
        kind: Kind::Choice(&["auto", "none", "preserve"]),
    },
    Allowed {
        long: "variable",
        short: Some('V'),
        kind: Kind::Pair,
    },
    Allowed {
        long: "metadata",
        short: Some('M'),
        kind: Kind::Pair,
    },
    Allowed {
        long: "id-prefix",
        short: None,
        kind: Kind::Identifier,
    },
    Allowed {
        long: "reference-links",
        short: None,
        kind: Kind::Flag,
    },
    Allowed {
        long: "reference-location",
        short: None,
        kind: Kind::Choice(&["block", "section", "document"]),
    },
    Allowed {
        long: "markdown-headings",
        short: None,
        kind: Kind::Choice(&["setext", "atx"]),
    },
    Allowed {
        long: "epub-chapter-level",
        short: None,
        kind: Kind::Integer(1, 6),
    },
    Allowed {
        long: "section-divs",
        short: None,
        kind: Kind::Flag,
    },
    Allowed {
        long: "ascii",
        short: None,
        kind: Kind::Flag,
    },
    Allowed {
        long: "strip-comments",
        short: None,
        kind: Kind::Flag,
    },
    Allowed {
        long: "eol",
        short: None,
        kind: Kind::Choice(&["crlf", "lf", "native"]),
    },
];

fn tokenize(text: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut started = false;
    let mut quote: Option<char> = None;
    for ch in text.chars() {
        match quote {
            Some(open) if ch == open => quote = None,
            Some(_) => current.push(ch),
            None if ch == '"' || ch == '\'' => {
                quote = Some(ch);
                started = true;
            }
            None if ch.is_whitespace() => {
                if started {
                    tokens.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            None => {
                current.push(ch);
                started = true;
            }
        }
    }
    if quote.is_some() {
        return Err("参数中的引号没有闭合".into());
    }
    if started {
        tokens.push(current);
    }
    Ok(tokens)
}

fn find_long(name: &str) -> Option<&'static Allowed> {
    ALLOWED.iter().find(|item| item.long == name)
}
fn find_short(short: char) -> Option<&'static Allowed> {
    ALLOWED.iter().find(|item| item.short == Some(short))
}

fn plain_text(value: &str) -> bool {
    value.len() <= MAX_VALUE_BYTES && !value.chars().any(char::is_control)
}

fn check_value(option: &Allowed, value: &str) -> Result<(), String> {
    let invalid = || format!("选项 --{} 的值“{value}”无效", option.long);
    match &option.kind {
        Kind::Flag => Err(format!("选项 --{} 不接受值", option.long)),
        Kind::Integer(low, high) => value
            .parse::<i64>()
            .ok()
            .filter(|number| (low..=high).contains(&number))
            .map(|_| ())
            .ok_or_else(invalid),
        Kind::Choice(choices) => choices.contains(&value).then_some(()).ok_or_else(invalid),
        Kind::Pair => {
            let key = value.split(':').next().unwrap_or_default();
            let valid_key = key.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
                && key
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
            (valid_key && plain_text(value))
                .then_some(())
                .ok_or_else(invalid)
        }
        Kind::Identifier => (value.len() <= 40
            && value
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
        .then_some(())
        .ok_or_else(invalid),
        Kind::Offsets => {
            let parts: Vec<&str> = value.split(',').collect();
            (parts.len() <= 6
                && parts.iter().all(|part| {
                    !part.is_empty() && part.len() <= 4 && part.bytes().all(|b| b.is_ascii_digit())
                }))
            .then_some(())
            .ok_or_else(invalid)
        }
    }
}

/// Validates the free-form field and returns one normalised argv entry per option.
pub fn parse(text: &str) -> Result<Vec<String>, String> {
    if text.len() > MAX_ARGUMENT_BYTES {
        return Err(format!("额外参数不能超过 {MAX_ARGUMENT_BYTES} 字节"));
    }
    if text.chars().any(|c| c.is_control() && !c.is_whitespace()) {
        return Err("额外参数不能包含控制字符".into());
    }
    let tokens = tokenize(text)?;
    if tokens.len() > MAX_TOKENS {
        return Err("额外参数过多".into());
    }
    let mut result = Vec::new();
    let mut index = 0;
    while index < tokens.len() {
        let token = &tokens[index];
        index += 1;
        let (option, inline) = if let Some(long) = token.strip_prefix("--") {
            let (name, inline) = match long.split_once('=') {
                Some((name, value)) => (name, Some(value.to_owned())),
                None => (long, None),
            };
            (
                find_long(name).ok_or_else(|| {
                    format!(
                        "不支持的选项 --{name}；仅允许版式类选项（如 --toc、--toc-depth、-V、-M）"
                    )
                })?,
                inline,
            )
        } else if let Some(short) = token.strip_prefix('-').filter(|rest| !rest.is_empty()) {
            let mut chars = short.chars();
            let letter = chars.next().unwrap_or_default();
            let rest: String = chars.collect();
            let option = find_short(letter)
                .ok_or_else(|| format!("不支持的选项 -{letter}；仅允许版式类选项"))?;
            let inline = (!rest.is_empty()).then_some(rest);
            if matches!(option.kind, Kind::Flag) && inline.is_some() {
                return Err(format!("选项 -{letter} 不能与其它字符合写"));
            }
            (option, inline)
        } else {
            return Err(format!("意外的参数“{token}”；选项必须以 - 或 -- 开头"));
        };
        if matches!(option.kind, Kind::Flag) {
            if inline.is_some() {
                return Err(format!("选项 --{} 不接受值", option.long));
            }
            result.push(format!("--{}", option.long));
            continue;
        }
        let value = match inline {
            Some(value) => value,
            None => {
                let next = tokens
                    .get(index)
                    .ok_or_else(|| format!("选项 --{} 缺少值", option.long))?;
                index += 1;
                next.clone()
            }
        };
        check_value(option, &value)?;
        result.push(format!("--{}={value}", option.long));
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typical_formatting_options_are_normalised() {
        assert_eq!(
            parse("--toc --toc-depth 2 -N -V geometry:margin=1in -M \"title:My Title\"").unwrap(),
            [
                "--toc",
                "--toc-depth=2",
                "--number-sections",
                "--variable=geometry:margin=1in",
                "--metadata=title:My Title"
            ]
        );
        assert_eq!(
            parse("-Vmainfont:SimSun").unwrap(),
            ["--variable=mainfont:SimSun"]
        );
        assert!(parse("").unwrap().is_empty());
        assert!(parse("   ").unwrap().is_empty());
    }

    #[test]
    fn options_that_read_files_run_code_or_choose_output_are_refused() {
        for text in [
            "--lua-filter=x.lua",
            "--filter pandoc-crossref",
            "-F x",
            "--output=/tmp/x",
            "-o x",
            "--extract-media=media",
            "--include-in-header=a.html",
            "-H a.html",
            "--css=a.css",
            "--reference-doc=a.docx",
            "--template=a.tex",
            "--data-dir=/",
            "--resource-path=/",
            "--sandbox",
            "--from=html",
            "--to=pdf",
            "--pdf-engine=xelatex",
            "--epub-cover-image=a.png",
            "--bibliography=a.bib",
            "--defaults=a.yaml",
            "--citeproc",
        ] {
            assert!(parse(text).is_err(), "{text}");
        }
    }

    #[test]
    fn malformed_values_and_shell_text_are_refused() {
        for text in [
            "--toc-depth=9",
            "--toc-depth=x",
            "--toc=yes",
            "--wrap=sometimes",
            "-V",
            "-V 1abc:x",
            "-V key;rm:x",
            "--id-prefix=a b",
            "toc",
            "--toc; del x",
            "\"--toc",
            "-Nx",
        ] {
            assert!(parse(text).is_err(), "{text}");
        }
        assert!(parse(&"a ".repeat(MAX_ARGUMENT_BYTES)).is_err());
        assert!(parse("--toc\0").is_err());
    }
}
