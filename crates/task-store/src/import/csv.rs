//! Spreadsheet exports (Linear, Jira, Todoist, or any table with a title column). Columns are
//! recognised by their common names; repeated columns (Jira's several `Labels`) are merged.
use super::{closed_state, date, fingerprint, map_priority, Candidate, Source, SourceProject};
use crate::revision;

/// RFC 4180 rows; quotes may hold separators and newlines.
fn rows(text: &str, sep: char) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if quoted {
            match c {
                '"' if chars.peek() == Some(&'"') => {
                    field.push('"');
                    chars.next();
                }
                '"' => quoted = false,
                _ => field.push(c),
            }
            continue;
        }
        match c {
            '"' if field.is_empty() => quoted = true,
            '\r' => {}
            '\n' => {
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
            }
            c if c == sep => row.push(std::mem::take(&mut field)),
            _ => field.push(c),
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows.retain(|r| r.iter().any(|f| !f.trim().is_empty()));
    rows
}

#[derive(Clone, Copy, PartialEq)]
enum Column {
    Title,
    Description,
    Status,
    Priority,
    Labels,
    Type,
    Due,
    Project,
    Id,
    Parent,
    Bucket,
    Indent,
}

fn column(header: &str) -> Option<Column> {
    let h = header.trim().trim_start_matches('\u{feff}').to_lowercase();
    let is = |names: &[&str]| names.contains(&h.as_str());
    Some(
        if is(&[
            "title", "name", "summary", "task", "content", "subject", "标题", "名称", "任务",
            "内容", "摘要",
        ]) {
            Column::Title
        } else if is(&[
            "description",
            "body",
            "notes",
            "details",
            "描述",
            "说明",
            "备注",
            "详情",
        ]) {
            Column::Description
        } else if is(&["status", "state", "状态"]) {
            Column::Status
        } else if is(&["priority", "优先级"]) {
            Column::Priority
        } else if is(&["labels", "label", "tags", "tag", "标签"]) {
            Column::Labels
        } else if is(&["type", "issue type", "类型"]) {
            Column::Type
        } else if is(&[
            "due",
            "due date",
            "duedate",
            "deadline",
            "date",
            "截止",
            "截止日期",
            "到期",
            "到期日",
        ]) {
            Column::Due
        } else if is(&["project", "project name", "项目"]) {
            Column::Project
        } else if is(&["id", "key", "issue key", "issue id", "identifier", "编号"]) {
            Column::Id
        } else if is(&[
            "parent",
            "parent id",
            "parent issue",
            "parent key",
            "父任务",
        ]) {
            Column::Parent
        } else if is(&["bucket", "队列"]) {
            Column::Bucket
        } else if is(&["indent"]) {
            Column::Indent
        } else {
            return None;
        },
    )
}

/// `WEB-12` → `WEB`, as Linear and Jira number their issues.
fn key_of(id: &str) -> Option<String> {
    let (key, n) = id.trim().rsplit_once('-')?;
    (n.chars().all(|c| c.is_ascii_digit())
        && !n.is_empty()
        && crate::valid_key(&key.to_uppercase()))
    .then(|| key.to_uppercase())
}

pub fn parse(bytes: &[u8], label: &str) -> Result<Source, String> {
    let text = std::str::from_utf8(bytes)
        .map_err(|_| "文件不是 UTF-8 编码，请导出为 UTF-8 CSV".to_owned())?
        .trim_start_matches('\u{feff}');
    let first = text.lines().next().unwrap_or("");
    let sep = [',', ';', '\t']
        .into_iter()
        .max_by_key(|s| first.matches(*s).count())
        .unwrap_or(',');
    let mut table = rows(text, sep).into_iter();
    let header = table.next().ok_or("文件是空的")?;
    let columns: Vec<Option<Column>> = header.iter().map(|h| column(h)).collect();
    if !columns.contains(&Some(Column::Title)) {
        return Err("找不到标题列（title、name、summary、content 或“标题”）".into());
    }
    let ignored: Vec<&str> = header
        .iter()
        .zip(&columns)
        .filter(|(h, c)| c.is_none() && !h.trim().is_empty())
        .map(|(h, _)| h.trim())
        .collect();
    // Todoist: TYPE is task/section/note, PRIORITY 4 is the highest, INDENT nests.
    let todoist = columns.contains(&Some(Column::Indent));
    let mut source = Source {
        kind: "csv".into(),
        label: label.into(),
        fingerprint: fingerprint(bytes),
        ..Source::default()
    };
    if !ignored.is_empty() {
        source
            .warnings
            .push(format!("未使用的列：{}", ignored.join("、")));
    }
    let mut seen = std::collections::HashMap::<String, usize>::new();
    let mut stack: Vec<(usize, String)> = Vec::new();
    for row in table {
        let get = |col: Column| -> Vec<&str> {
            columns
                .iter()
                .zip(&row)
                .filter(|(c, v)| **c == Some(col) && !v.trim().is_empty())
                .map(|(_, v)| v.trim())
                .collect()
        };
        let one = |col: Column| get(col).first().map(|s| (*s).to_owned());
        if todoist {
            match one(Column::Type)
                .as_deref()
                .map(str::to_lowercase)
                .as_deref()
            {
                Some("task") | None => {}
                _ => continue,
            }
        }
        let title = one(Column::Title).unwrap_or_default();
        let description = one(Column::Description).unwrap_or_default();
        let id = one(Column::Id);
        let status = one(Column::Status);
        let (closed, cancelled) = status.as_deref().map_or((false, false), closed_state);
        let priority = match one(Column::Priority) {
            Some(p) if todoist => match p.trim() {
                "4" => 1,
                "3" => 2,
                "2" => 3,
                _ => 0,
            },
            Some(p) => map_priority(&p),
            None => 0,
        };
        let labels = get(Column::Labels)
            .into_iter()
            .flat_map(|v| v.split([',', ';', '|']))
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(String::from)
            .collect();
        let source_ref = match &id {
            Some(id) => format!("csv:{id}"),
            None => {
                let base = format!(
                    "csv:~{}",
                    &revision(&format!("{title}\n{description}"))[..12]
                );
                let n = seen.entry(base.clone()).or_default();
                *n += 1;
                if *n == 1 {
                    base
                } else {
                    format!("{base}:{n}")
                }
            }
        };
        let mut parent_ref = one(Column::Parent).map(|p| format!("csv:{p}"));
        if todoist {
            let indent = one(Column::Indent)
                .and_then(|i| i.parse().ok())
                .unwrap_or(1usize);
            stack.retain(|(level, _)| *level < indent);
            parent_ref = stack.last().map(|(_, r)| r.clone());
            stack.push((indent, source_ref.clone()));
        }
        let project = one(Column::Project).map(|name| SourceProject {
            key: id.as_deref().and_then(key_of),
            name,
        });
        source.candidates.push(Candidate {
            source_ref,
            title: title.split_whitespace().collect::<Vec<_>>().join(" "),
            description,
            status,
            closed,
            cancelled,
            priority,
            labels,
            kind: if todoist { None } else { one(Column::Type) },
            bucket: one(Column::Bucket),
            due: one(Column::Due).and_then(|d| date(&d)),
            project,
            parent_ref,
            previous_id: id,
            ..Candidate::default()
        });
    }
    Ok(source)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn linear_export() {
        let text = "ID,Title,Description,Status,Priority,Labels,Project,Due Date,Parent issue\n\
            WEB-1,首页改版,\"第一行\n第二行, 带逗号\",In Progress,Urgent,\"设计, 前端\",官网,2026-03-05,\n\
            WEB-2,子任务,,Done,Low,,官网,,WEB-1\n";
        let s = parse(text.as_bytes(), "linear.csv").unwrap();
        assert_eq!(s.candidates.len(), 2);
        let a = &s.candidates[0];
        assert_eq!(a.source_ref, "csv:WEB-1");
        assert_eq!(a.description, "第一行\n第二行, 带逗号");
        assert_eq!(a.priority, 1);
        assert_eq!(a.labels, vec!["设计", "前端"]);
        assert_eq!(a.due.as_deref(), Some("2026-03-05"));
        assert_eq!(a.project.as_ref().unwrap().key.as_deref(), Some("WEB"));
        let b = &s.candidates[1];
        assert!(b.closed && !b.cancelled);
        assert_eq!(b.parent_ref.as_deref(), Some("csv:WEB-1"));
    }

    #[test]
    fn jira_repeated_labels_and_semicolons() {
        let text = "Summary;Issue key;Status;Labels;Labels\nFix;OPS-3;Won't Do;a;b\n";
        let s = parse(text.as_bytes(), "jira.csv").unwrap();
        let c = &s.candidates[0];
        assert_eq!(c.labels, vec!["a", "b"]);
        assert!(c.cancelled);
    }

    #[test]
    fn todoist_indent_and_priority() {
        let text = "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT\nsection,Inbox,,,\ntask,Parent,,4,1\ntask,Child,,1,2\n";
        let s = parse(text.as_bytes(), "todoist.csv").unwrap();
        assert_eq!(s.candidates.len(), 2);
        assert_eq!(s.candidates[0].priority, 1);
        assert_eq!(
            s.candidates[1].parent_ref.as_deref(),
            Some(s.candidates[0].source_ref.as_str())
        );
    }

    #[test]
    fn no_title_column_and_not_utf8() {
        assert!(parse(b"a,b\n1,2\n", "x.csv").is_err());
        assert!(parse(&[0xff, 0xfe, 0x00], "x.csv").is_err());
    }
}
