use super::Stored;
use std::path::Path;

pub(crate) const EXTENSIONLESS: &str = "";

#[derive(Clone, Debug)]
pub(crate) struct DocumentTypes {
    pub(crate) custom_extension: String,
    pub(crate) disabled: Vec<String>,
    pub(crate) custom_extensions: Vec<String>,
}
impl Default for DocumentTypes {
    fn default() -> Self {
        Self {
            custom_extension: "md".into(),
            disabled: Vec::new(),
            custom_extensions: Vec::new(),
        }
    }
}
impl DocumentTypes {
    pub(crate) fn catalog(&self) -> Vec<String> {
        let mut result: Vec<String> = file_index::TEXT_EXTENSIONS
            .iter()
            .map(|s| (*s).into())
            .collect();
        result.push(EXTENSIONLESS.into());
        for custom in self
            .custom_extensions
            .iter()
            .chain(std::iter::once(&self.custom_extension))
        {
            let custom = custom.to_ascii_lowercase();
            if !custom.is_empty() && !result.contains(&custom) {
                result.push(custom);
            }
        }
        result
    }
    pub(crate) fn allows(&self, path: &Path) -> bool {
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            return false;
        };
        let kind = file_index::TEXT_EXTENSIONS
            .iter()
            .copied()
            .chain(self.custom_extensions.iter().map(String::as_str))
            .chain(std::iter::once(self.custom_extension.as_str()))
            .filter(|id| {
                !id.is_empty()
                    && name.len() > id.len() + 1
                    && name.get(name.len() - id.len() - 1..).is_some_and(|suffix| {
                        suffix.starts_with('.') && suffix[1..].eq_ignore_ascii_case(id)
                    })
            })
            .max_by_key(|id| id.len());
        let kind = match kind {
            Some(kind) => kind,
            None if path.extension().is_none_or(|id| id.is_empty()) => EXTENSIONLESS,
            None => return false,
        };
        !self.disabled.iter().any(|id| id.eq_ignore_ascii_case(kind))
    }
    pub(crate) fn require(&self, path: &Path) -> Result<(), String> {
        if self.allows(path) {
            Ok(())
        } else {
            Err("该文件类型未启用或不受支持，请在设置 → 文件 → 支持的文件类型中查看。".into())
        }
    }
    pub(crate) fn enabled_extensions(&self) -> Vec<String> {
        self.catalog()
            .into_iter()
            .filter(|id| id != EXTENSIONLESS && !self.disabled.contains(id))
            .collect()
    }
}
impl Stored {
    pub(super) fn document_types(&self) -> DocumentTypes {
        DocumentTypes {
            custom_extension: if self.default_extension.is_empty() {
                "md".into()
            } else {
                self.default_extension.clone()
            },
            disabled: self.disabled_file_types.clone(),
            custom_extensions: self.custom_file_extensions.clone(),
        }
    }
    pub(super) fn validate_file_types(&self) -> Result<(), String> {
        let policy = self.document_types();
        let catalog = policy.catalog();
        let mut seen = std::collections::HashSet::new();
        let mut disabled_seen = std::collections::HashSet::new();
        if self.custom_file_extensions.len() > 32
            || catalog.len() > 48
            || self.custom_file_extensions.iter().any(|id| {
                id.is_empty()
                    || !super::valid_extension(id)
                    || id != &id.to_ascii_lowercase()
                    || !seen.insert(id)
            })
            || self.disabled_file_types.len() > catalog.len()
            || self.disabled_file_types.iter().any(|id| {
                !catalog.contains(id) || !std::collections::HashSet::insert(&mut disabled_seen, id)
            })
            || policy.enabled_extensions().is_empty()
            || !policy.allows(Path::new(&format!("Untitled.{}", policy.custom_extension)))
        {
            return Err("文件类型设置无效，至少保留一种可新建的类型，且默认类型必须启用。".into());
        }
        Ok(())
    }
    pub(super) fn remember_custom_type(&mut self) -> Result<(), String> {
        let extension = self.document_types().custom_extension.to_ascii_lowercase();
        if !file_index::TEXT_EXTENSIONS.contains(&extension.as_str())
            && !self.custom_file_extensions.contains(&extension)
        {
            if self.custom_file_extensions.len() >= 32 {
                return Err("自定义文件类型最多32种".into());
            }
            self.custom_file_extensions.push(extension);
        }
        Ok(())
    }
    pub(super) fn set_disabled_file_types(&mut self, disabled: Vec<String>) -> Result<(), String> {
        self.remember_custom_type()?;
        let catalog = self.document_types().catalog();
        let mut seen = std::collections::HashSet::new();
        if disabled
            .iter()
            .any(|id| !catalog.contains(id) || !seen.insert(id))
        {
            return Err("文件类型列表无效".into());
        }
        let enabled = catalog
            .iter()
            .find(|id| id.as_str() != EXTENSIONLESS && !disabled.contains(id))
            .ok_or("至少保留一种可新建的文件类型")?
            .clone();
        self.disabled_file_types = catalog
            .into_iter()
            .filter(|id| disabled.contains(id))
            .collect();
        if !self.document_types().allows(Path::new(&format!(
            "Untitled.{}",
            self.document_types().custom_extension
        ))) {
            self.default_extension = enabled;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::file_preferences::{change, storage::Store, PreferenceChange};

    #[test]
    fn disabled_defaults_fall_back_atomically_and_survive_restart() {
        let root = tempfile::tempdir().unwrap();
        let store = Store::open(root.path()).unwrap();
        let saved = store
            .transaction(|state| {
                change(
                    state,
                    0,
                    PreferenceChange::DisabledFileTypes(vec!["md".into(), "".into()]),
                )?;
                Ok((state.snapshot(true), true))
            })
            .unwrap();
        assert_eq!(saved.default_extension, "markdown");
        assert_eq!(saved.supported_file_types.len(), 16);
        assert!(saved.disabled_file_types.contains(&"md".into()));
        let reopened = Store::open(root.path()).unwrap();
        let policy = reopened
            .transaction(|state| Ok((state.document_types(), false)))
            .unwrap();
        assert!(!policy.allows(Path::new("file.MD")));
        assert!(!policy.allows(Path::new("README")));
        assert!(policy.allows(Path::new("file.txt")));
        assert!(!policy.allows(Path::new("file.docx")));
        let before = std::fs::read(root.path().join("preferences.json")).unwrap();
        for disabled in [
            vec!["unknown".into()],
            vec!["txt".into(), "txt".into()],
            policy.catalog(),
        ] {
            assert!(reopened
                .transaction(|state| {
                    change(state, 1, PreferenceChange::DisabledFileTypes(disabled))?;
                    Ok(((), true))
                })
                .is_err());
            assert_eq!(
                std::fs::read(root.path().join("preferences.json")).unwrap(),
                before
            );
        }
        assert!(reopened
            .transaction(|state| {
                change(state, 0, PreferenceChange::DisabledFileTypes(vec![]))?;
                Ok(((), true))
            })
            .is_err());
    }

    #[test]
    fn custom_types_remain_listed_when_disabled_and_cannot_bypass_by_final_suffix() {
        let mut state = Stored::default();
        change(
            &mut state,
            0,
            PreferenceChange::DefaultExtension("foo.md".into()),
        )
        .unwrap();
        change(
            &mut state,
            1,
            PreferenceChange::DisabledFileTypes(vec!["foo.md".into()]),
        )
        .unwrap();
        assert_eq!(state.default_extension, "md");
        let policy = state.document_types();
        assert!(policy.catalog().contains(&"foo.md".into()));
        assert!(!policy.allows(Path::new("note.FOO.MD")));
        assert!(policy.allows(Path::new("note.md")));
        change(&mut state, 2, PreferenceChange::DisabledFileTypes(vec![])).unwrap();
        assert!(state.document_types().allows(Path::new("note.foo.md")));
    }

    #[test]
    fn every_workspace_scan_filters_before_reading_disabled_documents() {
        let root = tempfile::tempdir().unwrap();
        std::fs::create_dir(root.path().join("sub.md")).unwrap();
        for name in ["a.md", "b.txt", "c.foo.md", "README", "sub.md/d.txt"] {
            std::fs::write(root.path().join(name), "match own fixture").unwrap();
        }
        let mut state = Stored::default();
        change(
            &mut state,
            0,
            PreferenceChange::DefaultExtension("foo.md".into()),
        )
        .unwrap();
        change(
            &mut state,
            1,
            PreferenceChange::DisabledFileTypes(vec!["md".into(), "foo.md".into(), "".into()]),
        )
        .unwrap();
        let types = state.document_types();
        let mut registry = file_index::WorkspaceRegistry::default();
        let selected = registry.select_authorized(root.path()).unwrap();
        let workspace = registry.get(&selected.id).unwrap();
        let include = |name: &str| types.allows(Path::new(name));
        let listing = workspace
            .list_directory_with_filters("", |_| true, include)
            .unwrap();
        assert_eq!(
            listing
                .entries
                .iter()
                .map(|e| e.name.as_str())
                .collect::<std::collections::BTreeSet<_>>(),
            ["b.txt", "sub.md"].into_iter().collect()
        );
        let articles = workspace
            .list_documents_with_filters(|_| true, include)
            .unwrap();
        assert_eq!(articles.entries.len(), 2);
        let search = workspace
            .search_with_filters(
                file_index::SearchOptions {
                    query: "match",
                    case_sensitive: false,
                    whole_word: false,
                    use_regex: false,
                    max_results: 10,
                },
                |_| true,
                include,
            )
            .unwrap();
        assert_eq!(search.matches.len(), 2);
        let before = workspace
            .catalog_snapshot_with_filters(|_| true, include)
            .unwrap();
        std::fs::write(root.path().join("a.md"), "disabled source changed").unwrap();
        assert_eq!(
            workspace
                .catalog_snapshot_with_filters(|_| true, include)
                .unwrap()
                .fingerprint,
            before.fingerprint
        );
    }
}
