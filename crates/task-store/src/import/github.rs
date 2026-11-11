//! GitHub issues as `gh issue list --state all --json …` writes them, or the REST API's
//! array. Pull requests are left out; priority labels (`P1`, `priority: high`) set priority.
use super::{fingerprint, map_priority, Candidate, Source};
use serde_json::Value;

fn text<'a>(v: &'a Value, keys: &[&str]) -> Option<&'a str> {
    keys.iter().find_map(|k| v.get(*k).and_then(Value::as_str))
}

/// `https://github.com/owner/repo/issues/12` → `owner/repo`.
fn repo_of(url: &str) -> Option<String> {
    let rest = url.split("github.com/").nth(1)?;
    let parts: Vec<&str> = rest.split('/').collect();
    match parts[..] {
        [owner, repo, "issues" | "pull", ..] => Some(format!("{owner}/{repo}")),
        _ => None,
    }
}

/// `P1`, `priority: high`, `priority/urgent` → a priority; other labels stay labels.
fn priority_label(name: &str) -> Option<u8> {
    let l = name.trim().to_lowercase();
    let value = l
        .strip_prefix("priority")
        .map(|r| r.trim_start_matches([':', '/', '-', ' ']))
        .or_else(|| {
            l.strip_prefix("优先级")
                .map(|r| r.trim_start_matches([':', '：', '/', ' ']))
        })
        .unwrap_or(&l);
    let p = match value {
        "p0" => 1,
        "p1" => 2,
        "p2" => 3,
        "p3" | "p4" => 4,
        v if v != l || l.starts_with("priority") => map_priority(v),
        _ => 0,
    };
    (p > 0).then_some(p)
}

pub fn parse(bytes: &[u8], label: &str) -> Result<Source, String> {
    let value: Value =
        serde_json::from_slice(bytes).map_err(|e| format!("不是有效的 JSON：{e}"))?;
    let items = match &value {
        Value::Array(a) => a.clone(),
        Value::Object(o) => o
            .get("items")
            .or_else(|| o.get("issues"))
            .and_then(Value::as_array)
            .cloned()
            .ok_or("找不到 issue 列表；请使用 gh issue list --json 的输出")?,
        _ => return Err("找不到 issue 列表；请使用 gh issue list --json 的输出".into()),
    };
    let mut source = Source {
        kind: "github".into(),
        label: label.into(),
        fingerprint: fingerprint(bytes),
        ..Source::default()
    };
    let (mut pulls, mut unknown_repo) = (0, 0);
    for issue in &items {
        if issue.get("pull_request").is_some() || issue["isPullRequest"] == true {
            pulls += 1;
            continue;
        }
        let Some(number) = issue.get("number").and_then(Value::as_u64) else {
            continue;
        };
        let url = text(issue, &["url", "html_url"]).unwrap_or("");
        let repo = repo_of(url);
        if repo.is_none() {
            unknown_repo += 1;
        }
        let reference = format!("{}#{number}", repo.as_deref().unwrap_or(""));
        let state = text(issue, &["state"]).unwrap_or("open").to_lowercase();
        let reason = text(issue, &["stateReason", "state_reason"])
            .unwrap_or("")
            .to_lowercase();
        let closed = state == "closed";
        let mut priority = 0;
        let mut labels = Vec::new();
        for l in issue
            .get("labels")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let Some(name) = l.as_str().or_else(|| l.get("name").and_then(Value::as_str)) else {
                continue;
            };
            match priority_label(name) {
                Some(p) if priority == 0 => priority = p,
                Some(_) => {}
                None => labels.push(name.trim().to_owned()),
            }
        }
        let mut description = text(issue, &["body"]).unwrap_or("").trim_end().to_owned();
        if !url.is_empty() {
            if !description.is_empty() {
                description.push_str("\n\n");
            }
            description.push_str(url);
        }
        let comments = issue
            .get("comments")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|c| {
                let body = c.get("body").and_then(Value::as_str)?.trim();
                let who = c
                    .get("author")
                    .or_else(|| c.get("user"))
                    .and_then(|a| a.get("login"))
                    .and_then(Value::as_str);
                (!body.is_empty()).then(|| match who {
                    Some(who) => format!("@{who}\n\n{body}"),
                    None => body.to_owned(),
                })
            })
            .collect();
        source.candidates.push(Candidate {
            source_ref: format!("github:{reference}"),
            title: text(issue, &["title"]).unwrap_or("").trim().to_owned(),
            description,
            status: Some(if closed { "done" } else { "todo" }.into()),
            closed,
            cancelled: closed && reason == "not_planned",
            priority,
            labels,
            bucket: issue
                .get("milestone")
                .and_then(|m| m.get("title"))
                .and_then(Value::as_str)
                .map(String::from),
            due: issue
                .get("milestone")
                .and_then(|m| text(m, &["dueOn", "due_on"]))
                .and_then(super::date),
            comments,
            previous_id: Some(reference),
            ..Candidate::default()
        });
        if closed && reason == "not_planned" {
            source.candidates.last_mut().unwrap().status = Some("cancelled".into());
        }
    }
    if pulls > 0 {
        source
            .warnings
            .push(format!("跳过 {pulls} 个 Pull Request"));
    }
    if unknown_repo > 0 {
        source.warnings.push(format!(
            "{unknown_repo} 项没有 url，无法确定所属仓库；导出时请加上 url 字段"
        ));
    }
    Ok(source)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gh_cli_output() {
        let json = r#"[
          {"number":12,"title":"登录失败","body":"步骤…","state":"OPEN","url":"https://github.com/acme/web/issues/12",
           "labels":[{"name":"bug"},{"name":"P1"}],"milestone":{"title":"v1.2"},
           "comments":[{"author":{"login":"ann"},"body":"复现了"}]},
          {"number":13,"title":"旧需求","state":"CLOSED","stateReason":"NOT_PLANNED","url":"https://github.com/acme/web/issues/13","labels":[]},
          {"number":14,"title":"PR","state":"OPEN","isPullRequest":true}
        ]"#;
        let s = parse(json.as_bytes(), "issues.json").unwrap();
        assert_eq!(s.candidates.len(), 2);
        let a = &s.candidates[0];
        assert_eq!(a.source_ref, "github:acme/web#12");
        assert_eq!(a.priority, 2);
        assert_eq!(a.labels, vec!["bug"]);
        assert_eq!(a.bucket.as_deref(), Some("v1.2"));
        assert_eq!(a.comments, vec!["@ann\n\n复现了"]);
        assert!(a
            .description
            .ends_with("https://github.com/acme/web/issues/12"));
        assert!(s.candidates[1].cancelled);
        assert_eq!(s.warnings.len(), 1);
    }

    #[test]
    fn priority_labels() {
        assert_eq!(priority_label("priority: high"), Some(2));
        assert_eq!(priority_label("priority/urgent"), Some(1));
        assert_eq!(priority_label("P0"), Some(1));
        assert_eq!(priority_label("high"), None);
        assert_eq!(priority_label("bug"), None);
    }
}
