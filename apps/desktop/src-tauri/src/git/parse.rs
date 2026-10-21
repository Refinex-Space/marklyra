//! Pure parsers for git's machine-readable output. No process or filesystem access here.
use super::types::*;
use std::collections::HashMap;

pub(crate) const STATUS_LIMIT: usize = 5000;
/// `git log` record format: fields separated by US, records ended by RS.
pub(crate) const LOG_FORMAT: &str = "%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ct%x1f%D%x1f%s%x1e";
pub(crate) const DETAIL_FORMAT: &str =
    "%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cn%x1f%ct%x1f%D%x1f%s%x1f%b%x1e";

pub(crate) fn split_nul(bytes: &[u8]) -> Vec<String> {
    bytes
        .split(|b| *b == 0)
        .filter(|part| !part.is_empty())
        .map(|part| String::from_utf8_lossy(part).into_owned())
        .collect()
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct BranchHeader {
    pub head: GitHead,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

/// `git status --porcelain=v2 --branch -z`.
pub(crate) fn status(bytes: &[u8]) -> (BranchHeader, Vec<GitChange>, bool) {
    let mut header = BranchHeader::default();
    let mut changes = Vec::new();
    let mut truncated = false;
    let mut entries = bytes
        .split(|b| *b == 0)
        .map(|part| String::from_utf8_lossy(part).into_owned());
    while let Some(entry) = entries.next() {
        if let Some(rest) = entry.strip_prefix("# ") {
            branch_header(rest, &mut header);
            continue;
        }
        let change = match entry.as_bytes().first() {
            Some(b'1') => ordinary(&entry),
            Some(b'2') => {
                let orig = entries.next();
                renamed(&entry, orig)
            }
            Some(b'u') => unmerged(&entry),
            Some(b'?') => entry.strip_prefix("? ").map(|path| GitChange {
                path: path.to_string(),
                orig_path: None,
                kind: ChangeKind::Untracked,
                index: "?".into(),
                worktree: "?".into(),
                conflict: None,
            }),
            _ => None,
        };
        if let Some(change) = change {
            if changes.len() >= STATUS_LIMIT {
                truncated = true;
            } else {
                changes.push(change);
            }
        }
    }
    (header, changes, truncated)
}

fn branch_header(rest: &str, header: &mut BranchHeader) {
    if let Some(oid) = rest.strip_prefix("branch.oid ") {
        if oid == "(initial)" {
            header.head.unborn = true;
        } else {
            header.head.oid = Some(oid.to_string());
        }
    } else if let Some(head) = rest.strip_prefix("branch.head ") {
        if head == "(detached)" {
            header.head.detached = true;
        } else {
            header.head.branch = Some(head.to_string());
        }
    } else if let Some(upstream) = rest.strip_prefix("branch.upstream ") {
        header.upstream = Some(upstream.to_string());
    } else if let Some(counts) = rest.strip_prefix("branch.ab ") {
        for part in counts.split(' ') {
            if let Some(n) = part.strip_prefix('+') {
                header.ahead = n.parse().unwrap_or(0);
            } else if let Some(n) = part.strip_prefix('-') {
                header.behind = n.parse().unwrap_or(0);
            }
        }
    }
}

fn letters(xy: &str) -> Option<(char, char)> {
    let mut chars = xy.chars();
    let pair = (chars.next()?, chars.next()?);
    chars.next().is_none().then_some(pair)
}

fn change_kind(x: char, y: char) -> ChangeKind {
    if x == 'R' || y == 'R' {
        ChangeKind::Renamed
    } else if x == 'C' || y == 'C' {
        ChangeKind::Copied
    } else if x == 'A' {
        ChangeKind::Added
    } else if x == 'D' || y == 'D' {
        ChangeKind::Deleted
    } else if x == 'T' || y == 'T' {
        ChangeKind::Typechange
    } else {
        ChangeKind::Modified
    }
}

fn ordinary(entry: &str) -> Option<GitChange> {
    let fields: Vec<&str> = entry.splitn(9, ' ').collect();
    let (x, y) = letters(fields.get(1)?)?;
    Some(GitChange {
        path: fields.get(8)?.to_string(),
        orig_path: None,
        kind: change_kind(x, y),
        index: x.to_string(),
        worktree: y.to_string(),
        conflict: None,
    })
}

fn renamed(entry: &str, orig: Option<String>) -> Option<GitChange> {
    let fields: Vec<&str> = entry.splitn(10, ' ').collect();
    let (x, y) = letters(fields.get(1)?)?;
    Some(GitChange {
        path: fields.get(9)?.to_string(),
        orig_path: orig.filter(|path| !path.is_empty()),
        kind: change_kind(x, y),
        index: x.to_string(),
        worktree: y.to_string(),
        conflict: None,
    })
}

pub(crate) fn conflict_kind(x: char, y: char) -> ConflictKind {
    match (x, y) {
        ('D', 'D') => ConflictKind::BothDeleted,
        ('A', 'U') => ConflictKind::AddedByUs,
        ('U', 'D') => ConflictKind::DeletedByThem,
        ('U', 'A') => ConflictKind::AddedByThem,
        ('D', 'U') => ConflictKind::DeletedByUs,
        ('A', 'A') => ConflictKind::BothAdded,
        _ => ConflictKind::BothModified,
    }
}

fn unmerged(entry: &str) -> Option<GitChange> {
    let fields: Vec<&str> = entry.splitn(11, ' ').collect();
    let (x, y) = letters(fields.get(1)?)?;
    Some(GitChange {
        path: fields.get(10)?.to_string(),
        orig_path: None,
        kind: ChangeKind::Conflicted,
        index: x.to_string(),
        worktree: y.to_string(),
        conflict: Some(conflict_kind(x, y)),
    })
}

/// `[ahead 1, behind 2]`, `[gone]`, or empty.
pub(crate) fn track(value: &str) -> (u32, u32, bool) {
    let inner = value.trim().trim_start_matches('[').trim_end_matches(']');
    if inner == "gone" {
        return (0, 0, true);
    }
    let (mut ahead, mut behind) = (0, 0);
    for part in inner.split(',').map(str::trim) {
        if let Some(n) = part.strip_prefix("ahead ") {
            ahead = n.parse().unwrap_or(0);
        } else if let Some(n) = part.strip_prefix("behind ") {
            behind = n.parse().unwrap_or(0);
        }
    }
    (ahead, behind, false)
}

/// Format for local and remote branches; records end with NUL.
pub(crate) const BRANCH_FORMAT: &str = "%(refname)%1f%(objectname)%1f%(upstream:short)%1f%(upstream:track)%1f%(HEAD)%1f%(symref)%1f%(committerdate:unix)%1f%(contents:subject)%00";
pub(crate) const TAG_FORMAT: &str =
    "%(refname)%1f%(objectname)%1f%(*objectname)%1f%(creatordate:unix)%00";

fn records(bytes: &[u8]) -> impl Iterator<Item = Vec<String>> + '_ {
    bytes
        .split(|b| *b == 0)
        .map(|record| {
            String::from_utf8_lossy(record)
                .trim_start_matches('\n')
                .to_string()
        })
        .filter(|record| !record.is_empty())
        .map(|record| record.split('\x1f').map(str::to_string).collect())
}

/// Splits `refs/remotes/<remote>/<branch>` by the longest configured remote name.
pub(crate) fn split_remote_ref<'a>(
    short: &'a str,
    remotes: &[String],
) -> Option<(&'a str, &'a str)> {
    remotes
        .iter()
        .filter(|remote| {
            short.len() > remote.len() + 1
                && short.starts_with(remote.as_str())
                && short.as_bytes()[remote.len()] == b'/'
        })
        .max_by_key(|remote| remote.len())
        .map(|remote| (&short[..remote.len()], &short[remote.len() + 1..]))
        .or_else(|| short.split_once('/'))
}

pub(crate) fn branches(bytes: &[u8], remotes: &[String]) -> GitBranches {
    let mut result = GitBranches::default();
    for fields in records(bytes) {
        if fields.len() < 8 {
            continue;
        }
        let time = fields[6].trim().parse().unwrap_or(0);
        let subject = fields[7..].join("\x1f");
        if let Some(name) = fields[0].strip_prefix("refs/heads/") {
            let (ahead, behind, gone) = track(&fields[3]);
            let current = fields[4] == "*";
            if current {
                result.current = Some(name.to_string());
            }
            result.local.push(GitLocalBranch {
                name: name.to_string(),
                oid: fields[1].clone(),
                upstream: Some(fields[2].clone()).filter(|u| !u.is_empty()),
                ahead,
                behind,
                gone,
                current,
                subject,
                time,
            });
        } else if let Some(short) = fields[0].strip_prefix("refs/remotes/") {
            if !fields[5].is_empty() || short.ends_with("/HEAD") {
                continue;
            }
            let Some((remote, name)) = split_remote_ref(short, remotes) else {
                continue;
            };
            result.remote.push(GitRemoteBranch {
                remote: remote.to_string(),
                name: name.to_string(),
                full_name: short.to_string(),
                oid: fields[1].clone(),
                subject,
                time,
            });
        }
    }
    result.local.sort_by(|a, b| a.name.cmp(&b.name));
    result
        .remote
        .sort_by(|a, b| a.remote.cmp(&b.remote).then_with(|| a.name.cmp(&b.name)));
    result
}

pub(crate) fn tags(bytes: &[u8]) -> Vec<GitTag> {
    let mut tags: Vec<GitTag> = records(bytes)
        .filter(|fields| fields.len() >= 4)
        .filter_map(|fields| {
            let name = fields[0].strip_prefix("refs/tags/")?.to_string();
            let oid = if fields[2].is_empty() {
                fields[1].clone()
            } else {
                fields[2].clone()
            };
            Some(GitTag {
                name,
                oid,
                time: fields[3].trim().parse().unwrap_or(0),
            })
        })
        .collect();
    tags.sort_by(|a, b| b.time.cmp(&a.time).then_with(|| a.name.cmp(&b.name)));
    tags
}

/// `%D` with `--decorate=full`: `HEAD -> refs/heads/main, tag: refs/tags/v1, refs/remotes/o/x`.
pub(crate) fn decorations(value: &str) -> Vec<GitRef> {
    let mut refs = Vec::new();
    for item in value
        .split(", ")
        .map(str::trim)
        .filter(|item| !item.is_empty())
    {
        let item = match item.strip_prefix("HEAD -> ") {
            Some(rest) => {
                refs.push(GitRef {
                    kind: RefKind::Head,
                    name: "HEAD".into(),
                });
                rest
            }
            None => item,
        };
        let item = item.strip_prefix("tag: ").unwrap_or(item);
        let (kind, name) = if item == "HEAD" {
            (RefKind::Head, "HEAD")
        } else if let Some(name) = item.strip_prefix("refs/heads/") {
            (RefKind::Local, name)
        } else if let Some(name) = item.strip_prefix("refs/remotes/") {
            if name.ends_with("/HEAD") {
                continue;
            }
            (RefKind::Remote, name)
        } else if let Some(name) = item.strip_prefix("refs/tags/") {
            (RefKind::Tag, name)
        } else {
            continue;
        };
        refs.push(GitRef {
            kind,
            name: name.to_string(),
        });
    }
    refs
}

/// Records produced with [`LOG_FORMAT`] or [`DETAIL_FORMAT`].
pub(crate) fn log(bytes: &[u8]) -> Vec<GitCommit> {
    String::from_utf8_lossy(bytes)
        .split('\x1e')
        .map(|record| record.trim_start_matches(['\n', '\r']))
        .filter(|record| !record.is_empty())
        .filter_map(|record| {
            let fields: Vec<&str> = record.split('\x1f').collect();
            if fields.len() < 9 {
                return None;
            }
            Some(GitCommit {
                oid: fields[0].to_string(),
                parents: fields[1].split_whitespace().map(str::to_string).collect(),
                author_name: fields[2].to_string(),
                author_email: fields[3].to_string(),
                author_time: fields[4].trim().parse().unwrap_or(0),
                committer_name: fields[5].to_string(),
                commit_time: fields[6].trim().parse().unwrap_or(0),
                refs: decorations(fields[7]),
                subject: fields[8].to_string(),
                body: fields
                    .get(9..)
                    .map(|rest| rest.join("\x1f").trim_end().to_string())
                    .unwrap_or_default(),
            })
        })
        .collect()
}

/// `--numstat -z`: `add\tdel\tpath\0` or, for renames, `add\tdel\t\0old\0new\0`.
pub(crate) fn numstat(bytes: &[u8]) -> HashMap<String, (u64, u64, bool)> {
    let mut result = HashMap::new();
    let mut parts = bytes.split(|b| *b == 0).map(|part| {
        String::from_utf8_lossy(part)
            .trim_start_matches('\n')
            .to_string()
    });
    while let Some(part) = parts.next() {
        let mut fields = part.splitn(3, '\t');
        let (Some(add), Some(del), Some(path)) = (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        let binary = add == "-" || del == "-";
        let counts = (add.parse().unwrap_or(0), del.parse().unwrap_or(0), binary);
        let path = if path.is_empty() {
            let _old = parts.next();
            parts.next().unwrap_or_default()
        } else {
            path.to_string()
        };
        if !path.is_empty() {
            result.insert(path, counts);
        }
    }
    result
}

/// `--name-status -z`: `M\0path\0` or `R100\0old\0new\0`.
pub(crate) fn name_status(bytes: &[u8]) -> Vec<(String, String, Option<String>)> {
    let mut result = Vec::new();
    let mut parts = split_nul(bytes).into_iter();
    while let Some(status) = parts.next() {
        let status = status.trim_start_matches('\n');
        let letter = status.chars().next().unwrap_or('M');
        if matches!(letter, 'R' | 'C') {
            let (Some(old), Some(new)) = (parts.next(), parts.next()) else {
                break;
            };
            result.push((letter.to_string(), new, Some(old)));
        } else {
            let Some(path) = parts.next() else { break };
            let letter = match letter {
                'A' | 'M' | 'D' | 'T' => letter,
                _ => 'M',
            };
            result.push((letter.to_string(), path, None));
        }
    }
    result
}

pub(crate) fn file_changes(numstat_out: &[u8], name_status_out: &[u8]) -> Vec<GitFileChange> {
    let counts = numstat(numstat_out);
    name_status(name_status_out)
        .into_iter()
        .map(|(status, path, orig_path)| {
            let (additions, deletions, binary) = counts.get(&path).copied().unwrap_or_default();
            GitFileChange {
                path,
                orig_path,
                status,
                additions,
                deletions,
                binary,
            }
        })
        .collect()
}

/// `git ls-remote --symref`: branch count and the advertised HEAD branch.
pub(crate) fn ls_remote(text: &str) -> (u32, Option<String>) {
    let mut branches = 0;
    let mut default = None;
    for line in text.lines() {
        if let Some(rest) = line.strip_prefix("ref: ") {
            if let Some((target, name)) = rest.split_once('\t') {
                if name == "HEAD" {
                    default = target.strip_prefix("refs/heads/").map(str::to_string);
                }
            }
        } else if let Some((_, name)) = line.split_once('\t') {
            if name.starts_with("refs/heads/") {
                branches += 1;
            }
        }
    }
    (branches, default)
}

/// `git stash list --format=%gd%x1f%H%x1f%ct%x1f%gs`.
pub(crate) fn stashes(text: &str) -> Vec<GitStash> {
    text.lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.splitn(4, '\x1f').collect();
            let index = fields
                .first()?
                .strip_prefix("stash@{")?
                .strip_suffix('}')?
                .parse()
                .ok()?;
            Some(GitStash {
                index,
                oid: fields.get(1)?.to_string(),
                time: fields.get(2)?.trim().parse().unwrap_or(0),
                message: fields.get(3).unwrap_or(&"").to_string(),
            })
        })
        .collect()
}

/// `git config -z --get-regexp ^remote\..*\.(url|pushurl)$`: name, fetch URL, push URL.
pub(crate) fn remote_config(bytes: &[u8]) -> Vec<(String, String, String)> {
    let mut order: Vec<String> = Vec::new();
    let mut fetch: HashMap<String, String> = HashMap::new();
    let mut push: HashMap<String, String> = HashMap::new();
    for entry in split_nul(bytes) {
        let Some((key, value)) = entry.split_once('\n') else {
            continue;
        };
        let Some(rest) = key.strip_prefix("remote.") else {
            continue;
        };
        let (name, map) = if let Some(name) = rest.strip_suffix(".pushurl") {
            (name, &mut push)
        } else if let Some(name) = rest.strip_suffix(".url") {
            (name, &mut fetch)
        } else {
            continue;
        };
        if !order.iter().any(|known| known == name) {
            order.push(name.to_string());
        }
        map.entry(name.to_string())
            .or_insert_with(|| value.to_string());
    }
    order
        .into_iter()
        .filter_map(|name| {
            let fetch_url = fetch.get(&name)?.clone();
            let push_url = push
                .get(&name)
                .cloned()
                .unwrap_or_else(|| fetch_url.clone());
            Some((name, fetch_url, push_url))
        })
        .collect()
}

/// The incoming side named in `MERGE_MSG`'s first line.
pub(crate) fn merge_label(message: &str) -> Option<String> {
    let line = message.lines().next()?.trim();
    for prefix in [
        "Merge remote-tracking branch '",
        "Merge branch '",
        "Merge tag '",
        "Merge commit '",
    ] {
        if let Some(rest) = line.strip_prefix(prefix) {
            return rest
                .split('\'')
                .next()
                .map(str::to_string)
                .filter(|s| !s.is_empty());
        }
    }
    None
}

#[cfg(test)]
#[path = "parse_tests.rs"]
mod tests;
