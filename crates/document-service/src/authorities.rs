//! Application-injected provenance for successful native atomic publications.
//! This is neither a path grant nor a document/window ID registry. Unknown
//! external inodes never advance an existing lineage, even with equal bytes.
use crate::trash_file_location::NativeTrashRegistration;
use crate::{scoped::ScopedDocument, DocumentError};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, Weak},
};

#[derive(Default)]
pub struct DocumentAuthorities {
    groups: Mutex<Vec<Weak<FileAuthority>>>,
}

pub(crate) struct FileAuthority {
    pub(crate) state: Mutex<AuthorityState>,
}
pub(crate) struct AuthorityState {
    pub(crate) parent: same_file::Handle,
    pub name: PathBuf,
    pub identity: Arc<same_file::Handle>,
    pub(crate) revoked: bool,
    pub(crate) scope: Option<ScopedDocument>,
    pub(crate) suspended: bool,
    pub(crate) trash: Option<Weak<NativeTrashRegistration>>,
}

impl DocumentAuthorities {
    pub(crate) fn join(
        &self,
        scope: &ScopedDocument,
        identity: Arc<same_file::Handle>,
    ) -> Result<Arc<FileAuthority>, DocumentError> {
        self.join_at(scope, identity, None)
    }

    pub(crate) fn join_at(
        &self,
        scope: &ScopedDocument,
        identity: Arc<same_file::Handle>,
        display: Option<&Path>,
    ) -> Result<Arc<FileAuthority>, DocumentError> {
        let parent = parent_identity(scope)?;
        let mut groups = self
            .groups
            .lock()
            .map_err(|_| DocumentError::RelocationUncertain)?;
        groups.retain(|group| group.strong_count() != 0);
        for group in groups.iter().filter_map(Weak::upgrade) {
            let mut current = group
                .state
                .lock()
                .map_err(|_| DocumentError::RelocationUncertain)?;
            if !current.revoked
                && !current.suspended
                && current.parent == parent
                && current.name == scope.name
                && current.identity == identity
            {
                drop(current);
                return Ok(group);
            }
            // An explicit native open may attach the first actual Trash scope.
            // No original-parent alias remains writable while it is suspended.
            if !current.revoked && current.suspended && current.identity == identity {
                if let Some(registration) = current.trash.as_ref().and_then(Weak::upgrade) {
                    if display == Some(registration.source_display.as_path()) {
                        let path = display.ok_or(DocumentError::InvalidPath)?;
                        if path.file_name() != Some(scope.name.as_os_str())
                            || !scope.matches_parent_path(
                                path.parent().ok_or(DocumentError::InvalidPath)?,
                            )?
                        {
                            return Err(DocumentError::ExternalChange);
                        }
                        current.parent = parent;
                        current.name.clone_from(&scope.name);
                        current.scope = Some(scope.clone());
                        current.suspended = false;
                        drop(current);
                        return Ok(group);
                    }
                }
            }
        }
        let group = Arc::new(FileAuthority {
            state: Mutex::new(AuthorityState {
                parent,
                name: scope.name.clone(),
                identity,
                revoked: false,
                scope: Some(scope.clone()),
                suspended: false,
                trash: None,
            }),
        });
        groups.push(Arc::downgrade(&group));
        Ok(group)
    }
}

impl FileAuthority {
    pub(crate) fn move_to(
        &self,
        old_scope: &ScopedDocument,
        old_parent: &same_file::Handle,
        old_identity: &same_file::Handle,
        new_scope: &ScopedDocument,
        new_parent: same_file::Handle,
        new_identity: Arc<same_file::Handle>,
    ) {
        let mut current = self
            .state
            .lock()
            .expect("native move prevalidated authority");
        let source = &current.parent == old_parent
            && current.name == old_scope.name
            && current.identity.as_ref() == old_identity;
        let already_moved = current.parent == new_parent
            && current.name == new_scope.name
            && current.identity == new_identity;
        assert!(!current.revoked && !current.suspended && (source || already_moved));
        current.parent = new_parent;
        current.name.clone_from(&new_scope.name);
        current.scope = Some(new_scope.clone());
        current.identity = new_identity;
    }
    /// Native-only retarget after a verified same-parent move. The caller keeps
    /// the mutation lane; another document plan may already have applied it.
    pub(crate) fn try_retarget(&self, old: &Path, new: PathBuf) -> Result<(), DocumentError> {
        let mut current = self
            .state
            .lock()
            .map_err(|_| DocumentError::RelocationUncertain)?;
        if current.revoked || current.suspended || (current.name != old && current.name != new) {
            return Err(DocumentError::RelocationUncertain);
        }
        current.name = new.clone();
        if let Some(scope) = &mut current.scope {
            scope.name = new;
        }
        Ok(())
    }
    pub(crate) fn current(
        &self,
        scope: &ScopedDocument,
    ) -> Result<MutexGuard<'_, AuthorityState>, DocumentError> {
        let parent = parent_identity(scope)?;
        let current = self
            .state
            .lock()
            .map_err(|_| DocumentError::RelocationUncertain)?;
        if current.revoked
            || current.suspended
            || current.parent != parent
            || current.name != scope.name
        {
            return Err(DocumentError::RelocationUncertain);
        }
        Ok(current)
    }

    pub(crate) fn retarget(&self, old: &Path, new: PathBuf) {
        // The host's mutation gate and every affected service guard remain held.
        // No method holding this mutex calls back into DocumentAuthorities.
        let mut current = self
            .state
            .lock()
            .expect("preflight-validated authority under native mutation gate");
        assert!(
            !current.revoked && !current.suspended && (current.name == old || current.name == new)
        );
        current.name = new.clone();
        if let Some(scope) = &mut current.scope {
            scope.name = new;
        }
    }

    pub(crate) fn revoke(&self) {
        // Revocation itself remains fail closed even after a foreign panic.
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .revoked = true;
    }
}

fn parent_identity(scope: &ScopedDocument) -> Result<same_file::Handle, DocumentError> {
    Ok(same_file::Handle::from_file(
        scope.directory.try_clone()?.into_std_file(),
    )?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::DocumentService;
    use std::fs;

    #[test]
    fn publication_keeps_one_current_identity_instead_of_a_save_history() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().join("A.md");
        fs::write(&path, b"Alpha").unwrap();
        let authorities = Arc::new(DocumentAuthorities::default());
        let mut service = DocumentService::with_authorities(Arc::clone(&authorities));
        let document = service.open_authorized(&path).unwrap();
        let group = Arc::clone(&service.documents[&document.id].authority);
        for index in 0..32 {
            service
                .save(&document.id, &format!("Alpha{index}"))
                .unwrap();
            assert!(Arc::ptr_eq(
                &service.documents[&document.id].authority,
                &group
            ));
            assert_eq!(authorities.groups.lock().unwrap().len(), 1);
        }
        drop(group);
        service.close(&document.id);
        assert_eq!(authorities.groups.lock().unwrap()[0].strong_count(), 0);
        let fresh = service.open_authorized(&path).unwrap();
        assert_eq!(authorities.groups.lock().unwrap().len(), 1);
        service.close(&fresh.id);
    }

    #[test]
    fn identical_inode_at_other_parent_or_basename_has_separate_publication_authority() {
        let temporary = tempfile::tempdir().unwrap();
        let root = temporary.path();
        fs::create_dir(root.join("other")).unwrap();
        let path = root.join("A.md");
        fs::write(&path, b"Alpha").unwrap();
        fs::hard_link(&path, root.join("alias.md")).unwrap();
        fs::hard_link(&path, root.join("other/A.md")).unwrap();
        let authorities = Arc::new(DocumentAuthorities::default());
        let mut first = DocumentService::with_authorities(Arc::clone(&authorities));
        let mut second = DocumentService::with_authorities(Arc::clone(&authorities));
        let a = first.open_authorized(&path).unwrap();
        let b = second.open_authorized(&root.join("alias.md")).unwrap();
        let c = second.open_authorized(&root.join("other/A.md")).unwrap();
        assert_eq!(authorities.groups.lock().unwrap().len(), 3);
        first.save(&a.id, "First").unwrap();
        second.save(&b.id, "Alias").unwrap();
        second.save(&c.id, "Other").unwrap();
        assert_eq!(fs::read(path).unwrap(), b"First");
        assert_eq!(fs::read(root.join("alias.md")).unwrap(), b"Alias");
        assert_eq!(fs::read(root.join("other/A.md")).unwrap(), b"Other");
    }
}
