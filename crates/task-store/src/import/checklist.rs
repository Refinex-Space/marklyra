//! Checklist items in notes (`- [ ] …`). Each becomes a task and its line becomes a link to
//! it (`- [WEB-3 写公告](task:…)`), the same link "convert to task" writes. Only lines that
//! still read as they did when previewed are rewritten.
use super::{fingerprint, Candidate, Source};
use crate::revision;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

const MAX_NOTE: u64 = 2 * 1024 * 1024;
const MAX_NOTES: usize = 5000;

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteItem {
    /// Workspace-relative, `/`-separated.
    pub path: String,
    /// Zero-based line number.
    pub line: usize,
    /// The line as read, without its line ending.
    pub line_text: String,
}

struct Item<'a> {
    indent: usize,
    /// Indent plus list marker (`  - `, `1. `).
    marker: &'a str,
    done: bool,
    text: &'a str,
}

fn item(line: &str) -> Option<Item<'_>> {
    let rest = line.trim_start_matches([' ', '\t']);
    let indent = line.len() - rest.len();
    let after = if let Some(r) = rest.strip_prefix(['-', '*', '+']) {
        r
    } else {
        let digits = rest.len() - rest.trim_start_matches(|c: char| c.is_ascii_digit()).len();
        if digits == 0 || digits > 9 {
            return None;
        }
        rest[digits..].strip_prefix(['.', ')'])?
    };
    let marker_end = line.len() - after.len() + 1;
    let after = after.strip_prefix(' ')?;
    let (done, text) = match after.strip_prefix("[ ] ") {
        Some(t) => (false, t),
        None => (
            true,
            after
                .strip_prefix("[x] ")
                .or_else(|| after.strip_prefix("[X] "))?,
        ),
    };
    Some(Item {
        indent,
        marker: &line[..marker_end],
        done,
        text: text.trim(),
    })
}

/// Lines with their endings kept, so a rewrite changes nothing else.
fn lines(text: &str) -> Vec<&str> {
    text.split_inclusive('\n').collect()
}
fn bare(line: &str) -> &str {
    line.trim_end_matches('\n').trim_end_matches('\r')
}

pub fn parse(notes: &[(String, String)], label: &str) -> Source {
    let mut all = String::new();
    let mut source = Source {
        kind: "notes".into(),
        label: label.into(),
        ..Source::default()
    };
    for (path, text) in notes {
        all.push_str(path);
        all.push_str(text);
        let mut fence: Option<&str> = None;
        let mut in_front = text.starts_with("---\n") || text.starts_with("---\r\n");
        let mut seen: HashMap<String, usize> = HashMap::new();
        // Open checklist items by indent, for nesting.
        let mut stack: Vec<(usize, String)> = Vec::new();
        for (n, raw) in lines(text).into_iter().enumerate() {
            let line = bare(raw);
            if in_front {
                if n > 0 && matches!(line, "---" | "...") {
                    in_front = false;
                }
                continue;
            }
            let trimmed = line.trim_start();
            if let Some(f) = fence {
                if trimmed.starts_with(f) {
                    fence = None;
                }
                continue;
            }
            if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
                fence = Some(&trimmed[..3]);
                continue;
            }
            let Some(it) = item(line) else {
                if !trimmed.is_empty() && line.len() - trimmed.len() == 0 {
                    stack.clear();
                }
                continue;
            };
            stack.retain(|(indent, _)| *indent < it.indent);
            if it.text.is_empty() || it.text.contains("](task:") {
                continue;
            }
            let base = format!("note:{path}:{}", &revision(it.text)[..12]);
            let count = seen.entry(base.clone()).or_default();
            *count += 1;
            let source_ref = if *count == 1 {
                base
            } else {
                format!("{base}:{count}")
            };
            source.candidates.push(Candidate {
                source_ref: source_ref.clone(),
                title: it.text.split_whitespace().collect::<Vec<_>>().join(" "),
                status: Some(if it.done { "done" } else { "todo" }.into()),
                closed: it.done,
                parent_ref: stack.last().map(|(_, r)| r.clone()),
                note: Some(NoteItem {
                    path: path.clone(),
                    line: n,
                    line_text: line.to_owned(),
                }),
                ..Candidate::default()
            });
            stack.push((it.indent, source_ref));
        }
    }
    source.fingerprint = fingerprint(all.as_bytes());
    source
}

fn escape(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace('[', "\\[")
        .replace(']', "\\]")
}

/// `- [ ] 写公告` → `- [WEB-3 写公告](task:id)`; the checkbox goes, as the task now holds
/// the state and the link shows it.
pub fn link_line(line: &str, human: &str, id: &str) -> Option<String> {
    let it = item(line)?;
    let title = it.text.split_whitespace().collect::<Vec<_>>().join(" ");
    Some(format!(
        "{}[{}](task:{id})",
        it.marker.trim_end().to_owned() + " ",
        escape(&format!("{human} {title}"))
    ))
}

/// Applies the links to one note; `None` when any line changed since it was read.
pub fn rewrite(text: &str, links: &[super::NoteLink]) -> Option<String> {
    let mut out: Vec<String> = lines(text).into_iter().map(String::from).collect();
    for link in links {
        let line = out.get_mut(link.line)?;
        if bare(line) != link.original {
            return None;
        }
        let ending = &line[bare(line).len()..];
        *line = format!("{}{ending}", link.replacement);
    }
    Some(out.concat())
}

/// Markdown notes under `folder`, relative to `root`. Hidden folders, links and large files
/// are skipped.
pub fn collect(root: &Path, folder: &Path) -> Result<Vec<(String, String)>, String> {
    let mut notes = Vec::new();
    let mut pending = vec![folder.to_path_buf()];
    let single = fs::symlink_metadata(folder)
        .map_err(|e| format!("无法读取「{}」：{e}", folder.display()))?;
    if single.is_file() {
        pending.clear();
        let text = fs::read_to_string(folder).map_err(|e| format!("无法读取笔记：{e}"))?;
        notes.push((relative(root, folder)?, text));
    }
    while let Some(dir) = pending.pop() {
        let mut entries: Vec<_> = fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(meta) = fs::symlink_metadata(entry.path()) else {
                continue;
            };
            if name.starts_with('.') || name == "node_modules" {
                continue;
            }
            if meta.is_dir() {
                pending.push(entry.path());
            } else if meta.is_file()
                && meta.len() <= MAX_NOTE
                && (name.ends_with(".md") || name.ends_with(".markdown"))
            {
                if notes.len() >= MAX_NOTES {
                    return Err(format!("笔记超过 {MAX_NOTES} 篇，请选择更小的文件夹"));
                }
                if let Ok(text) = fs::read_to_string(entry.path()) {
                    notes.push((relative(root, &entry.path())?, text));
                }
            }
        }
    }
    notes.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(notes)
}

fn relative(root: &Path, path: &Path) -> Result<String, String> {
    let rel = path
        .strip_prefix(root)
        .map_err(|_| "只能导入当前工作区内的笔记".to_owned())?;
    Ok(rel
        .components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::import::NoteLink;

    const NOTE: &str = "---\ntitle: 计划\n- [ ] 不是清单\n---\n# 发布\r\n- [ ] 写公告\r\n  - [ ] 配图 [草稿]\r\n- [x] 定日期\r\n```\n- [ ] 代码里\n```\n1. [ ] 编号项\n- [WEB-1 已有](task:abc)\n";

    #[test]
    fn finds_items_nesting_and_skips_code() {
        let s = parse(&[("计划.md".into(), NOTE.into())], "计划.md");
        let titles: Vec<&str> = s.candidates.iter().map(|c| c.title.as_str()).collect();
        assert_eq!(titles, vec!["写公告", "配图 [草稿]", "定日期", "编号项"]);
        assert_eq!(
            s.candidates[1].parent_ref.as_deref(),
            Some(s.candidates[0].source_ref.as_str())
        );
        assert!(s.candidates[2].closed);
        assert_eq!(s.candidates[0].note.as_ref().unwrap().line, 5);
    }

    #[test]
    fn rewrites_only_unchanged_lines() {
        let s = parse(&[("计划.md".into(), NOTE.into())], "计划.md");
        let note = s.candidates[1].note.clone().unwrap();
        let replacement = link_line(&note.line_text, "WEB-2", "xyz").unwrap();
        assert_eq!(replacement, "  - [WEB-2 配图 \\[草稿\\]](task:xyz)");
        let link = NoteLink {
            path: note.path,
            line: note.line,
            original: note.line_text,
            replacement,
        };
        let out = rewrite(NOTE, std::slice::from_ref(&link)).unwrap();
        assert!(out.contains("  - [WEB-2 配图 \\[草稿\\]](task:xyz)\r\n- [x] 定日期\r\n"));
        assert_eq!(
            out.len(),
            NOTE.len() - "[ ] 配图 [草稿]".len() + "[WEB-2 配图 \\[草稿\\]](task:xyz)".len()
        );
        assert!(rewrite(&NOTE.replace("配图", "插图"), &[link]).is_none());
        assert_eq!(
            link_line("1. [ ] 编号项", "A-1", "q").unwrap(),
            "1. [A-1 编号项](task:q)"
        );
    }
}
