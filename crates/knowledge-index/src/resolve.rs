use crate::Parsed;
use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use unicode_normalization::UnicodeNormalization;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    pub status: String,
    pub target: Option<String>,
    pub fragment: String,
    pub candidates: Vec<String>,
    pub key: String,
    pub anchor_missing: bool,
}
#[derive(Default)]
pub struct Catalog {
    notes: BTreeMap<String, BTreeSet<String>>,
    names: HashMap<String, BTreeSet<String>>,
    normalized: HashMap<String, BTreeSet<String>>,
    keys: HashMap<String, Vec<String>>,
    root: Option<String>,
}
fn normalized(s: &str) -> String {
    s.nfc().collect::<String>()
}
fn folded(s: &str) -> String {
    normalized(s).to_lowercase()
}
fn file_name(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}
pub(crate) fn base_name(path: &str) -> &str {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit_once('.').map_or(name, |(stem, _)| stem)
}
fn path_join(base: &str, path: &str) -> Option<String> {
    let mut parts: Vec<&str> = base.split('/').filter(|p| !p.is_empty()).collect();
    for p in path.split('/') {
        match p {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            _ => parts.push(p),
        }
    }
    Some(parts.join("/"))
}
impl Catalog {
    pub fn set_root(&mut self, root: &std::path::Path) {
        self.root = Some(root.to_string_lossy().replace('\\', "/"));
    }
    pub(crate) fn scoped_destination(&self, source: &str, destination: &str, wiki: bool) -> String {
        let Some(root) = &self.root else {
            return destination.into();
        };
        let (raw, suffix) = destination
            .split_once('#')
            .map_or((destination, String::new()), |(path, anchor)| {
                (path, format!("#{anchor}"))
            });
        let raw = raw
            .strip_prefix("file://localhost")
            .or_else(|| raw.strip_prefix("file://"))
            .unwrap_or(raw);
        let raw = if wiki {
            raw
        } else {
            raw.split_once('?').map_or(raw, |(p, _)| p)
        };
        let Ok(decoded) = percent_decode_str(raw).decode_utf8() else {
            return destination.into();
        };
        let mut decoded = decoded.replace('\\', "/");
        if decoded.as_bytes().get(2) == Some(&b':') && decoded.starts_with('/') {
            decoded.remove(0);
        }
        let Some(relative) = decoded.strip_prefix(&format!("{}/", root.trim_end_matches('/')))
        else {
            return destination.into();
        };
        let depth = source.split('/').count().saturating_sub(1);
        format!(
            "{}{}{}",
            "../".repeat(depth),
            percent_encoding::utf8_percent_encode(relative, percent_encoding::NON_ALPHANUMERIC),
            suffix
        )
    }
    pub fn insert(&mut self, path: String, parsed: &Parsed) {
        self.remove(&path);
        self.normalized
            .entry(folded(&path))
            .or_default()
            .insert(path.clone());
        for key in std::iter::once(base_name(&path))
            .chain(std::iter::once(file_name(&path)))
            .chain(parsed.aliases.iter().map(String::as_str))
        {
            self.names
                .entry(folded(key))
                .or_default()
                .insert(path.clone());
        }
        self.keys.insert(
            path.clone(),
            std::iter::once(base_name(&path))
                .chain(std::iter::once(file_name(&path)))
                .chain(parsed.aliases.iter().map(String::as_str))
                .map(folded)
                .collect(),
        );
        self.notes.insert(path, parsed.anchors.clone());
    }
    pub fn remove(&mut self, path: &str) {
        self.notes.remove(path);
        if let Some(keys) = self.keys.remove(path) {
            for key in keys {
                if self.names.get_mut(&key).is_some_and(|paths| {
                    paths.remove(path);
                    paths.is_empty()
                }) {
                    self.names.remove(&key);
                }
            }
        }
        let key = folded(path);
        if self.normalized.get_mut(&key).is_some_and(|paths| {
            paths.remove(path);
            paths.is_empty()
        }) {
            self.normalized.remove(&key);
        }
    }
    fn exact(&self, path: &str, equivalent: &dyn Fn(&str, &str) -> bool) -> Vec<String> {
        if self.notes.contains_key(path) {
            return vec![path.to_owned()];
        }
        self.normalized
            .get(&folded(path))
            .map(|v| {
                v.iter()
                    .filter(|actual| equivalent(path, actual))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }
    pub fn resolve(&self, source: &str, destination: &str, wiki: bool) -> Resolution {
        self.resolve_with(source, destination, wiki, &|_, _| false)
    }
    pub fn resolve_with(
        &self,
        source: &str,
        destination: &str,
        wiki: bool,
        equivalent: &dyn Fn(&str, &str) -> bool,
    ) -> Resolution {
        let scoped = self.scoped_destination(source, destination, wiki);
        let destination = scoped.as_str();
        let mut out = Resolution {
            status: "missing".into(),
            target: None,
            fragment: String::new(),
            candidates: Vec::new(),
            key: String::new(),
            anchor_missing: false,
        };
        if destination.len() > 4096 || destination.contains('\0') {
            out.status = "blocked".into();
            return out;
        }
        let (raw_path, fragment) = destination.split_once('#').unwrap_or((destination, ""));
        let raw_path = if wiki {
            raw_path
        } else {
            raw_path.split_once('?').map_or(raw_path, |(p, _)| p)
        };
        let Ok(path) = percent_decode_str(raw_path).decode_utf8() else {
            out.status = "blocked".into();
            return out;
        };
        let Ok(fragment) = percent_decode_str(fragment).decode_utf8() else {
            out.status = "blocked".into();
            return out;
        };
        out.fragment = fragment.into_owned();
        let path = path.replace('\\', "/");
        if path.contains(':') || path.starts_with('/') || path.starts_with('~') {
            out.status = if path.starts_with("http:")
                || path.starts_with("https:")
                || path.starts_with("mailto:")
            {
                "external"
            } else {
                "blocked"
            }
            .into();
            return out;
        }
        let base = source.rsplit_once('/').map_or("", |(base, _)| base);
        let Some(relative) = path_join(base, &path) else {
            out.status = "blocked".into();
            return out;
        };
        if relative
            .split('/')
            .any(|part| part.starts_with('.') || part == "node_modules")
        {
            out.status = "blocked".into();
            return out;
        }
        out.key = if wiki {
            format!("wiki:{}", folded(&path))
        } else {
            format!("path:{relative}")
        };
        let candidates = if path.is_empty() {
            self.exact(source, equivalent)
        } else if !wiki {
            self.exact(&relative, equivalent)
        } else {
            let mut matches = self.exact(&relative, equivalent);
            if matches.is_empty() {
                matches = self.exact(&format!("{relative}.md"), equivalent);
            }
            if matches.is_empty() && path.contains('/') {
                if let Some(root_path) = path_join("", &path) {
                    matches = self.exact(&root_path, equivalent);
                    if matches.is_empty() {
                        matches = self.exact(&format!("{root_path}.md"), equivalent);
                    }
                }
            }
            if matches.is_empty() && !path.contains('/') {
                matches = self
                    .names
                    .get(&folded(&path))
                    .map(|v| v.iter().cloned().collect())
                    .unwrap_or_default();
            }
            matches
        };
        match candidates.as_slice() {
            [target] => {
                out.status = "resolved".into();
                out.target = Some(target.clone());
                out.anchor_missing = !out.fragment.is_empty()
                    && self.notes.get(target).is_none_or(|a| {
                        !a.contains(&out.fragment)
                            && !a.contains(&crate::parse::slug(&out.fragment))
                    });
            }
            [] => {}
            _ => {
                out.status = "ambiguous".into();
                out.candidates = candidates.into_iter().take(32).collect();
            }
        }
        out
    }
}

pub(crate) fn note_keys(path: &str, parsed: &Parsed) -> Vec<String> {
    let mut keys = vec![
        format!("p:{}", normalized(path)),
        format!("pf:{}", folded(path)),
        format!("n:{}", folded(base_name(path))),
        format!("n:{}", folded(file_name(path))),
    ];
    keys.extend(parsed.aliases.iter().map(|a| format!("n:{}", folded(a))));
    keys
}
pub(crate) fn reference_keys(source: &str, destination: &str, wiki: bool) -> Vec<String> {
    let raw = destination.split('#').next().unwrap_or("");
    let raw = if wiki {
        raw
    } else {
        raw.split('?').next().unwrap_or("")
    };
    let Ok(path) = percent_decode_str(raw).decode_utf8() else {
        return Vec::new();
    };
    let path = path.replace('\\', "/");
    if path.is_empty() {
        return vec![format!("p:{}", normalized(source))];
    }
    if path.contains(':') || path.starts_with('/') {
        return Vec::new();
    }
    let parent = source.rsplit_once('/').map_or("", |(p, _)| p);
    let mut keys = Vec::new();
    for base in if wiki { vec![parent, ""] } else { vec![parent] } {
        if let Some(joined) = path_join(base, &path) {
            keys.push(format!("p:{}", normalized(&joined)));
            keys.push(format!("pf:{}", folded(&joined)));
            if wiki {
                keys.push(format!("p:{}.md", normalized(&joined)));
                keys.push(format!("pf:{}.md", folded(&joined)));
            }
        }
    }
    if wiki && !path.contains('/') {
        keys.push(format!("n:{}", folded(&path)));
    }
    keys.sort();
    keys.dedup();
    keys
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn relative_paths_percent_encoding_fragments_and_boundaries() {
        let mut c = Catalog::default();
        let mut p = Parsed::default();
        p.anchors.insert("标题".into());
        c.insert("a#b.md".into(), &p);
        c.insert("dir/source.md".into(), &p);
        let r = c.resolve("dir/source.md", "../a%23b.md#%E6%A0%87%E9%A2%98", false);
        assert_eq!(r.target.as_deref(), Some("a#b.md"));
        assert!(!r.anchor_missing);
        assert_eq!(
            c.resolve("dir/source.md", "../../escape.md", false).status,
            "blocked"
        );
        assert_eq!(
            c.resolve("dir/source.md", "https://example.com", false)
                .status,
            "external"
        );
        assert_eq!(
            c.resolve("dir/source.md", "#missing", false)
                .target
                .as_deref(),
            Some("dir/source.md")
        );
        assert!(c.resolve("dir/source.md", "#missing", false).anchor_missing);
    }
    #[test]
    fn unique_wiki_becomes_ambiguous_and_explicit_paths_never_fall_back_to_basename() {
        let mut c = Catalog::default();
        c.insert("a/Note.md".into(), &Parsed::default());
        assert_eq!(
            c.resolve("source.md", "Note", true).target.as_deref(),
            Some("a/Note.md")
        );
        c.insert("b/Note.md".into(), &Parsed::default());
        assert_eq!(c.resolve("source.md", "Note", true).status, "ambiguous");
        assert_eq!(c.resolve("source.md", "wrong/Note", true).status, "missing");
        assert_eq!(c.resolve("source.md", "Note.md", false).status, "missing");
    }
}

#[cfg(test)]
mod spelling_regressions {
    use super::*;
    #[test]
    fn dotted_wiki_names_do_not_fall_back_to_a_different_document() {
        let mut catalog = Catalog::default();
        catalog.insert("one/Design.v1.md".into(), &Parsed::default());
        catalog.insert("two/Design.md".into(), &Parsed::default());
        assert_eq!(
            catalog
                .resolve("source.md", "Design.v1", true)
                .target
                .as_deref(),
            Some("one/Design.v1.md")
        );
        catalog.remove("one/Design.v1.md");
        assert_eq!(
            catalog.resolve("source.md", "Design.v1", true).status,
            "missing"
        );
    }
    #[test]
    fn wiki_question_marks_are_literal_and_case_needs_filesystem_evidence() {
        let mut catalog = Catalog::default();
        catalog.insert("Question?.md".into(), &Parsed::default());
        catalog.insert("Question.md".into(), &Parsed::default());
        assert_eq!(
            catalog
                .resolve("source.md", "Question?", true)
                .target
                .as_deref(),
            Some("Question?.md")
        );
        assert_eq!(
            catalog.resolve("source.md", "question.md", false).status,
            "missing"
        );
        assert_eq!(
            catalog
                .resolve_with("source.md", "question.md", false, &|a, b| a
                    == "question.md"
                    && b == "Question.md")
                .target
                .as_deref(),
            Some("Question.md")
        );
    }
}
