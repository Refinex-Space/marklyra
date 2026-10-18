//! Native-only evidence. Reading this journal never grants restore authority.
use cap_std::fs::File;
use file_index::InspectedEntryAction;
use serde::Serialize;
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
    sync::Arc,
};

pub(crate) struct TrashDiagnostic {
    operation_id: String,
    message: String,
    observed_destination: Option<PathBuf>,
    original_path: PathBuf,
    source: Arc<File>,
    identity: Arc<same_file::Handle>,
}

impl TrashDiagnostic {
    pub(super) fn from_restore(
        operation_id: &str,
        message: String,
        observed_destination: Option<PathBuf>,
        original_path: PathBuf,
        placement: &crate::platform::trash::TrashPlacement,
    ) -> Self {
        Self {
            operation_id: operation_id.to_owned(),
            message,
            observed_destination,
            original_path,
            source: placement.source(),
            identity: placement.source_identity(),
        }
    }
    pub(super) fn new(
        operation_id: &str,
        message: String,
        observed_destination: Option<PathBuf>,
        action: &InspectedEntryAction,
    ) -> Self {
        Self {
            operation_id: operation_id.to_owned(),
            message,
            observed_destination,
            original_path: action.display_path().to_owned(),
            source: action.source(),
            identity: action.source_identity(),
        }
    }

    /// Retains the original source FD in memory and preserves informational OS
    /// evidence on disk. No journal field is accepted as a new filesystem grant.
    pub(crate) fn write(&self, directory: &Path) -> io::Result<()> {
        let builder = fs::DirBuilder::new();
        #[cfg(unix)]
        let builder = {
            use std::os::unix::fs::DirBuilderExt;
            let mut builder = builder;
            builder.mode(0o700);
            builder
        };
        match builder.create(directory) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
        let metadata = fs::symlink_metadata(directory)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(io::Error::other(
                "File operation journal is not a directory",
            ));
        }
        let source_identity_retained = self
            .source
            .try_clone()
            .and_then(|file| same_file::Handle::from_file(file.into_std()))
            .is_ok_and(|identity| identity == *self.identity);
        #[derive(Serialize)]
        #[serde(rename_all = "camelCase")]
        struct Record<'a> {
            schema_version: u8,
            operation_id: &'a str,
            message: &'a str,
            original_path: &'a Path,
            observed_destination: Option<&'a Path>,
            source_identity_retained: bool,
        }
        let bytes = serde_json::to_vec_pretty(&Record {
            schema_version: 1,
            operation_id: &self.operation_id,
            message: &self.message,
            original_path: &self.original_path,
            observed_destination: self.observed_destination.as_deref(),
            source_identity_retained,
        })?;
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(directory.join(format!("{}.json", self.operation_id)))?;
        file.write_all(&bytes)?;
        file.sync_all()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uncertain_evidence_is_private_non_authorizing_and_never_overwrites_an_old_record() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("source.md"), b"original").unwrap();
        let mut registry = file_index::WorkspaceRegistry::default();
        let payload = registry.select_authorized(root.path()).unwrap();
        let workspace = registry.get(&payload.id).unwrap();
        let entry = workspace.inspect_entry("source.md").unwrap();
        let action = workspace.prepare_entry_action(&entry.entry_token).unwrap();
        let diagnostic = TrashDiagnostic::new(
            &uuid::Uuid::new_v4().to_string(),
            "test-only denied endpoint".into(),
            Some(root.path().join("os-result.md")),
            &action,
        );
        let directory = root.path().join("journal");
        diagnostic.write(&directory).unwrap();
        let path = directory.join(format!("{}.json", diagnostic.operation_id));
        let bytes = fs::read(&path).unwrap();
        let value: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(value["sourceIdentityRetained"], true);
        assert_eq!(value["message"], "test-only denied endpoint");
        assert!(value.get("restoreToken").is_none());
        assert!(diagnostic.write(&directory).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
            assert_eq!(
                fs::metadata(&directory).unwrap().permissions().mode() & 0o777,
                0o700
            );
        }
    }
}
