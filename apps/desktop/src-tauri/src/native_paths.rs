//! Lexical spelling comparisons only. These helpers never authorize or open a path.
use std::path::{Path, PathBuf};

pub(crate) fn comparison_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    if let Some(std::path::Component::Prefix(prefix)) = path.components().next() {
        if let std::path::Prefix::VerbatimDisk(drive) = prefix.kind() {
            let mut normalized = PathBuf::from(format!("{}:\\", char::from(drive)));
            normalized.extend(path.components().skip(2).map(|part| part.as_os_str()));
            return normalized;
        }
    }
    path.to_owned()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn file_url_drive_spelling_matches_canonical_root_but_not_other_locations() {
        assert_eq!(
            comparison_path(Path::new(r"\\?\C:\owned\image.png")),
            Path::new(r"C:\owned\image.png")
        );
        let root = comparison_path(Path::new(r"\\?\C:\owned"));
        assert!(Path::new(r"C:\owned\image.png").starts_with(&root));
        for outside in [r"C:\owned-other\image.png", r"D:\owned\image.png"] {
            assert!(!Path::new(outside).starts_with(&root));
        }
    }
}
