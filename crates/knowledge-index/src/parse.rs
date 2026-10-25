use pulldown_cmark::{Event, LinkType, Options, Parser, Tag, TagEnd};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Reference {
    pub destination: String,
    pub wiki: bool,
    pub line: usize,
    pub column: usize,
    pub match_length: usize,
    pub expected_text: String,
    pub preview: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Parsed {
    pub title: String,
    pub aliases: Vec<String>,
    pub tags: Vec<String>,
    pub anchors: BTreeSet<String>,
    #[serde(default)]
    pub anchor_locations: BTreeMap<String, AnchorLocation>,
    pub references: Vec<Reference>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnchorLocation {
    pub line: usize,
    pub column: usize,
    pub match_length: usize,
    pub expected_text: String,
}
fn anchor_location(
    source: &str,
    range: std::ops::Range<usize>,
    starts: &[usize],
    utf16: &[(usize, usize)],
) -> AnchorLocation {
    let index = starts
        .partition_point(|offset| *offset <= range.start)
        .saturating_sub(1);
    let end = line_end(source, starts, index).min(range.end);
    let expected_text: String = source[range.start..end].chars().take(160).collect();
    AnchorLocation {
        line: index + 1,
        column: utf16_offset(source, utf16, range.start)
            - utf16_offset(source, utf16, starts[index])
            + 1,
        match_length: expected_text.encode_utf16().count(),
        expected_text,
    }
}
fn line_end(source: &str, starts: &[usize], index: usize) -> usize {
    let mut end = starts.get(index + 1).copied().unwrap_or(source.len());
    for byte in [b'\n', b'\r'] {
        if end > 0 && source.as_bytes()[end - 1] == byte {
            end -= 1;
        }
    }
    end
}
fn utf16_offset(source: &str, checkpoints: &[(usize, usize)], byte: usize) -> usize {
    let index = checkpoints
        .partition_point(|(offset, _)| *offset <= byte)
        .saturating_sub(1);
    let (start, units) = checkpoints[index];
    units + source[start..byte].encode_utf16().count()
}

/// Same UTF-16LE FNV-1a source hint as the editor's guarded search navigation.
pub fn fingerprint(text: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for unit in text.encode_utf16() {
        for byte in unit.to_le_bytes() {
            hash = (hash ^ u64::from(byte)).wrapping_mul(0x100000001b3);
        }
    }
    format!("{hash:016x}")
}

#[derive(Default, Deserialize)]
#[serde(default)]
struct Frontmatter {
    title: Option<String>,
    aliases: SafeStrings,
    alias: SafeStrings,
    tags: SafeStrings,
}
#[derive(Default)]
struct SafeStrings(Vec<String>);
impl<'de> Deserialize<'de> for SafeStrings {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct StringsVisitor;
        impl<'de> serde::de::Visitor<'de> for StringsVisitor {
            type Value = SafeStrings;
            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("a string or a bounded list of strings")
            }
            fn visit_unit<E: serde::de::Error>(self) -> Result<Self::Value, E> {
                Ok(SafeStrings::default())
            }
            fn visit_str<E: serde::de::Error>(self, value: &str) -> Result<Self::Value, E> {
                if value.len() > 512 {
                    return Err(E::custom("metadata string exceeds budget"));
                }
                Ok(SafeStrings(vec![value.to_owned()]))
            }
            fn visit_seq<A: serde::de::SeqAccess<'de>>(
                self,
                mut sequence: A,
            ) -> Result<Self::Value, A::Error> {
                let mut values = Vec::new();
                while let Some(value) = sequence.next_element::<String>()? {
                    if values.len() >= 128 || value.len() > 512 {
                        return Err(serde::de::Error::custom("metadata list exceeds budget"));
                    }
                    values.push(value);
                }
                Ok(SafeStrings(values))
            }
        }
        deserializer.deserialize_any(StringsVisitor)
    }
}
fn strings(values: Vec<String>) -> Vec<String> {
    let mut values: Vec<_> = values
        .into_iter()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty() && !s.chars().any(char::is_control))
        .collect();
    values.sort();
    values.dedup();
    values
}

pub(crate) fn slug(text: &str) -> String {
    let mut result = String::new();
    let mut space = false;
    for c in text.to_lowercase().chars() {
        if c.is_whitespace() {
            space = true;
        } else if c.is_alphanumeric() || c == '_' || c == '-' {
            if space && !result.is_empty() {
                result.push('-');
            }
            result.push(c);
            space = false;
        }
    }
    result
}

pub fn parse(source: &str, path: &str) -> Result<Parsed, String> {
    if source.len() > 8 * 1024 * 1024 {
        return Err("文档超过图谱解析预算".into());
    }
    let mut parsed = Parsed::default();
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS
        | Options::ENABLE_WIKILINKS
        | Options::ENABLE_MATH;
    let mut heading: Option<(String, Option<String>, std::ops::Range<usize>)> = None;
    let mut heading_counts = HashMap::<String, usize>::new();
    let mut metadata = String::new();
    let mut in_metadata = false;
    let mut image_depth = 0usize;
    let mut in_code = false;
    // Construct once: looking up every occurrence must not repeatedly scan a large prefix.
    let mut line_starts = vec![0];
    let mut utf16 = vec![(0, 0)];
    let mut units = 0;
    let bytes = source.as_bytes();
    for (i, character) in source.char_indices() {
        if i - utf16.last().unwrap().0 >= 256 {
            utf16.push((i, units));
        }
        units += character.len_utf16();
        if character == '\n' || (character == '\r' && bytes.get(i + 1) != Some(&b'\n')) {
            line_starts.push(i + 1);
        }
    }
    for (event, range) in Parser::new_ext(source, options).into_offset_iter() {
        match event {
            Event::Start(Tag::MetadataBlock(_)) => in_metadata = true,
            Event::End(TagEnd::MetadataBlock(_)) => in_metadata = false,
            Event::Start(Tag::CodeBlock(_)) => in_code = true,
            Event::End(TagEnd::CodeBlock) => in_code = false,
            Event::Code(text) => {
                if let Some((heading, _, _)) = &mut heading {
                    heading.push_str(&text);
                }
            }
            Event::Start(Tag::Image { .. }) => image_depth += 1,
            Event::End(TagEnd::Image) => image_depth = image_depth.saturating_sub(1),
            Event::Start(Tag::Heading { id, .. }) => {
                heading = Some((String::new(), id.map(|v| v.into_string()), range.clone()))
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some((text, id, range)) = heading.take() {
                    if parsed.anchors.len() >= 20_000 {
                        return Err("文档锚点超过图谱预算".into());
                    }
                    let text = text.trim().to_owned();
                    if parsed.title.is_empty() {
                        parsed.title = text.chars().take(256).collect();
                    }
                    let base = slug(&text);
                    let count = heading_counts.entry(base.clone()).or_default();
                    let location = anchor_location(source, range, &line_starts, &utf16);
                    let slug = if *count == 0 {
                        base
                    } else {
                        format!("{base}-{count}")
                    };
                    *count += 1;
                    for anchor in std::iter::once(slug).chain(std::iter::once(text)).chain(id) {
                        parsed.anchors.insert(anchor.clone());
                        parsed
                            .anchor_locations
                            .entry(anchor)
                            .or_insert_with(|| location.clone());
                    }
                }
            }
            Event::Text(text) if !in_code => {
                if in_metadata {
                    if metadata.len() + text.len() > 32 * 1024 {
                        return Err("文档元数据超过图谱 32 KiB 预算".into());
                    }
                    metadata.push_str(&text);
                } else if let Some((heading, _, _)) = &mut heading {
                    heading.push_str(&text);
                } else if let Some(block) = text
                    .split_whitespace()
                    .next_back()
                    .and_then(|s| s.strip_prefix('^'))
                {
                    if !block.is_empty() && block.chars().all(|c| c.is_alphanumeric() || c == '-') {
                        let tail = &source[range.end..];
                        if tail
                            .split(['\r', '\n'])
                            .next()
                            .unwrap_or("")
                            .trim()
                            .is_empty()
                        {
                            if parsed.anchors.len() >= 20_000 {
                                return Err("文档锚点超过图谱预算".into());
                            }
                            let key = format!("^{block}");
                            parsed.anchors.insert(key.clone());
                            parsed.anchor_locations.insert(
                                key,
                                anchor_location(source, range.clone(), &line_starts, &utf16),
                            );
                        }
                    }
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some((text, _, _)) = &mut heading {
                    text.push(' ');
                }
            }
            Event::Start(Tag::Link {
                dest_url,
                link_type,
                ..
            }) if !in_metadata && image_depth == 0 => {
                if parsed.references.len() >= 20_000 {
                    return Err("文档引用超过图谱单文件 20,000 条预算".into());
                }
                let line_index = line_starts
                    .partition_point(|start| *start <= range.start)
                    .saturating_sub(1);
                let start = line_starts[line_index];
                let end = line_end(source, &line_starts, line_index);
                let matched = &source[range.start..range.end.min(end)];
                // Source navigation only needs a bounded, exact prefix and the complete source fingerprint.
                let expected_text: String = matched.chars().take(160).collect();
                parsed.references.push(Reference {
                    destination: dest_url.into_string(),
                    wiki: matches!(link_type, LinkType::WikiLink { .. }),
                    line: line_index + 1,
                    column: utf16_offset(source, &utf16, range.start)
                        - utf16_offset(source, &utf16, start)
                        + 1,
                    match_length: expected_text.encode_utf16().count(),
                    expected_text,
                    preview: source[start..end].chars().take(240).collect(),
                });
            }
            _ => {}
        }
    }
    if !metadata.trim().is_empty() {
        // Only the three supported fields are deserialized. Unknown properties and aliases are
        // skipped without expanding arbitrary YAML value trees.
        match serde_yaml_ng::from_str::<Frontmatter>(&metadata) {
            Ok(value) => {
                if let Some(title) = value
                    .title
                    .filter(|s| !s.trim().is_empty() && s.len() <= 512)
                {
                    parsed.title = title;
                }
                parsed.aliases = strings(if value.aliases.0.is_empty() {
                    value.alias.0
                } else {
                    value.aliases.0
                });
                parsed.tags = strings(value.tags.0)
                    .into_iter()
                    .map(|s| s.trim_start_matches('#').to_owned())
                    .collect();
            }
            Err(_) => parsed
                .warnings
                .push("YAML 元数据无法解析，正文链接仍已索引".into()),
        }
    }
    if parsed.title.is_empty() {
        parsed.title = path.rsplit('/').next().unwrap_or(path).to_owned();
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn extracts_real_references_and_ignores_code_images_math_and_metadata() {
        let text = "---\ntitle: 标题\naliases: [别名, alias]\ntags: [rust, '#图谱']\nrelated: '[[meta]]'\n---\n# Heading\n\n[x](a%23b.md#h) [ref][id] [[folder/笔记|显示]] ![图](image.png)\n`[fake](x)`\n```md\n[[fake]]\n```\n    [indented](fake.md)\n\n$[[math]]$\n\n[id]: <ref.md> \"Title\"\n";
        let p = parse(text, "a.md").unwrap();
        assert_eq!(p.title, "标题");
        assert_eq!(p.aliases, ["alias", "别名"]);
        assert_eq!(p.tags, ["图谱", "rust"]);
        assert_eq!(
            p.references
                .iter()
                .map(|r| r.destination.as_str())
                .collect::<Vec<_>>(),
            ["a%23b.md#h", "ref.md", "folder/笔记"]
        );
        assert!(p.references[2].wiki);
    }
    #[test]
    fn source_positions_preserve_crlf_unicode_and_utf16_columns() {
        let source = "# 标题\r\n\r\n😀 [显示](a.md)  \r\n";
        let p = parse(source, "a.md").unwrap();
        let r = &p.references[0];
        assert_eq!((r.line, r.column, r.match_length), (3, 4, 10));
        assert_eq!(r.expected_text, "[显示](a.md)");
        assert_eq!(fingerprint(""), "cbf29ce484222325");
    }
    #[test]
    fn reference_definitions_are_not_extra_occurrences_and_headings_are_distinct() {
        let p = parse(
            "# Title\n# Title\n[a][x]\n\n[x]: a.md\n\n\\[no](b.md)\n",
            "x.md",
        )
        .unwrap();
        assert_eq!(p.references.len(), 1);
        assert!(p.anchors.contains("title-1"));
    }
}

#[cfg(test)]
mod metadata_regressions {
    use super::*;
    #[test]
    fn long_link_lines_have_bounded_source_position_cost() {
        let line = "😀 [中文](target.md) ";
        let source = line.repeat(20_000);
        let start = std::time::Instant::now();
        let parsed = parse(&source, "source.md").unwrap();
        assert_eq!(parsed.references.len(), 20_000);
        assert_eq!(
            parsed.references.last().unwrap().column,
            line.encode_utf16().count() * 19_999 + 4
        );
        assert!(
            start.elapsed() < std::time::Duration::from_secs(2),
            "source positions must not rescan an ever-growing line prefix: {:?}",
            start.elapsed()
        );
    }
    #[test]
    fn block_anchors_share_the_heading_budget() {
        let source = (0..20_001)
            .map(|i| format!("text ^block-{i}\n\n"))
            .collect::<String>();
        assert!(parse(&source, "source.md").is_err());
    }
    #[test]
    fn ignored_yaml_alias_trees_are_not_expanded_and_code_cannot_define_block_anchors() {
        let mut text = "---\ntitle: Safe\na0: &a0 [x,x,x,x,x,x,x,x,x,x]\n".to_owned();
        for i in 1..12 {
            text.push_str(&format!(
                "a{i}: &a{i} [{}]\n",
                vec![format!("*a{}", i - 1); 10].join(",")
            ));
        }
        text.push_str("tags: [notes]\n---\n\n`^inline`\n\n```\n^fenced\n```\n\nText ^real\n");
        let parsed = parse(&text, "note.md").unwrap();
        assert_eq!(parsed.title, "Safe");
        assert_eq!(parsed.tags, ["notes"]);
        assert!(parsed.anchors.contains("^real"));
        assert!(!parsed.anchors.contains("^inline"));
        assert!(!parsed.anchors.contains("^fenced"));
    }
}
