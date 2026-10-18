//! Ordinary native Move uses the existing metadata transaction and revocation
//! boundary, while requiring a successful owned-handle publication receipt.
use super::*;
use crate::{move_publication::directory_identity, NativeMovePublication};

struct Source {
    id: String,
    suffix: PathBuf,
    scoped: ScopedDocument,
    parent_identity: same_file::Handle,
    identity: Arc<same_file::Handle>,
}

pub struct PreparedMove<'a> {
    prepared: PreparedRename<'a>,
    source_parent: Arc<Dir>,
    source_name: PathBuf,
    source_identity: same_file::Handle,
    destination_parent: Arc<Dir>,
    destination_name: PathBuf,
    destination_display: PathBuf,
    kind: RenameKind,
    sources: Vec<Source>,
    identities: Vec<Arc<same_file::Handle>>,
    parents: Vec<same_file::Handle>,
    validated: bool,
}

/// Native-only endpoints for one element of an atomic metadata handoff. A
/// replacement uses two elements: old target to its retained backup, and source
/// to target. Renderer paths never construct these capabilities.
#[derive(Clone)]
pub struct NativeMoveTarget {
    pub source_parent: Arc<Dir>,
    pub source_name: PathBuf,
    pub destination_parent: Arc<Dir>,
    pub destination_name: PathBuf,
    pub source_display: PathBuf,
    pub destination_display: PathBuf,
    pub kind: RenameKind,
}

struct DetachedMove {
    changes: Vec<Change>,
    metadata: Vec<DocumentMetadata>,
    source_parent: Arc<Dir>,
    source_name: PathBuf,
    source_identity: same_file::Handle,
    destination_parent: Arc<Dir>,
    destination_name: PathBuf,
    destination_display: PathBuf,
    kind: RenameKind,
    sources: Vec<Source>,
    identities: Vec<Arc<same_file::Handle>>,
    parents: Vec<same_file::Handle>,
    validated: bool,
}

/// Keeps one exclusive service borrow across every replacement/source plan.
/// Individual groups reuse PreparedMove validation, commit and revocation.
pub struct PreparedMoves<'a> {
    service: &'a mut DocumentService,
    plans: Vec<Option<DetachedMove>>,
}

impl DetachedMove {
    fn attach(self, service: &mut DocumentService) -> PreparedMove<'_> {
        PreparedMove {
            prepared: PreparedRename {
                service,
                changes: self.changes,
                metadata: self.metadata,
            },
            source_parent: self.source_parent,
            source_name: self.source_name,
            source_identity: self.source_identity,
            destination_parent: self.destination_parent,
            destination_name: self.destination_name,
            destination_display: self.destination_display,
            kind: self.kind,
            sources: self.sources,
            identities: self.identities,
            parents: self.parents,
            validated: self.validated,
        }
    }
}

impl<'a> PreparedMove<'a> {
    fn detach(self) -> (&'a mut DocumentService, DetachedMove) {
        let PreparedRename {
            service,
            changes,
            metadata,
        } = self.prepared;
        (
            service,
            DetachedMove {
                changes,
                metadata,
                source_parent: self.source_parent,
                source_name: self.source_name,
                source_identity: self.source_identity,
                destination_parent: self.destination_parent,
                destination_name: self.destination_name,
                destination_display: self.destination_display,
                kind: self.kind,
                sources: self.sources,
                identities: self.identities,
                parents: self.parents,
                validated: self.validated,
            },
        )
    }
}

impl PreparedMoves<'_> {
    pub fn affected_count(&self) -> usize {
        self.plans
            .iter()
            .flatten()
            .map(|plan| plan.changes.len())
            .sum()
    }

    pub fn validate_commit(
        &mut self,
        publications: &[&NativeMovePublication],
    ) -> Result<(), DocumentError> {
        if publications.len() != self.plans.len() {
            return Err(DocumentError::InvalidPath);
        }
        for (slot, publication) in self.plans.iter_mut().zip(publications) {
            let mut plan = slot
                .take()
                .expect("native metadata plan stays owned")
                .attach(self.service);
            let result = plan.validate_commit(publication);
            let (_, detached) = plan.detach();
            *slot = Some(detached);
            result?;
        }
        Ok(())
    }

    pub fn commit(self) -> Vec<DocumentMetadata> {
        assert!(self.plans.iter().flatten().all(|plan| plan.validated));
        let mut metadata = Vec::with_capacity(self.affected_count());
        for plan in self.plans.into_iter().flatten() {
            metadata.extend(plan.attach(self.service).commit());
        }
        metadata
    }

    pub fn revoke(self) -> Vec<String> {
        let mut documents = Vec::with_capacity(self.affected_count());
        for plan in self.plans.into_iter().flatten() {
            documents.extend(plan.attach(self.service).revoke());
        }
        documents
    }
}

impl PreparedMove<'_> {
    pub fn affected_count(&self) -> usize {
        self.prepared.affected_count()
    }

    /// The host validates every window plan before committing any. On failure
    /// after disk movement it must revoke all plans rather than retry the IO.
    pub fn validate_commit(
        &mut self,
        publication: &NativeMovePublication,
    ) -> Result<(), DocumentError> {
        if self.validated
            || publication.kind != self.kind
            || publication.source_name != self.source_name
            || publication.destination_name != self.destination_name
            || publication.source_identity() != &self.source_identity
            || directory_identity(&publication.source_parent)?
                != directory_identity(&self.source_parent)?
            || directory_identity(&publication.destination_parent)?
                != directory_identity(&self.destination_parent)?
        {
            return Err(DocumentError::ExternalChange);
        }
        let destination = if self.kind == RenameKind::Directory {
            Some(publication.destination_directory()?)
        } else {
            None
        };
        let mut identities = Vec::with_capacity(self.sources.len());
        let mut scopes = Vec::with_capacity(self.sources.len());
        let mut parents = Vec::with_capacity(self.sources.len());
        for source in &self.sources {
            let identity =
                publication.entry_identity(&source.suffix, &source.identity, RenameKind::File)?;
            let scope = if let Some(directory) = &destination {
                ScopedDocument::new(
                    Arc::new(crate::authority::open_directory_nofollow(
                        directory,
                        source.suffix.parent().ok_or(DocumentError::InvalidPath)?,
                    )?),
                    Path::new(
                        source
                            .suffix
                            .file_name()
                            .ok_or(DocumentError::InvalidPath)?,
                    ),
                )?
            } else {
                ScopedDocument::new(Arc::clone(&self.destination_parent), &self.destination_name)?
            };
            if scope.identity()? != *identity {
                return Err(DocumentError::ExternalChange);
            }
            // All services are held under the native mutation lane. This also
            // detects poisoned/revoked lineages before the first plan commits.
            let document = &self.prepared.service.documents[&source.id];
            if document.authority.current(&source.scoped)?.identity != source.identity {
                return Err(DocumentError::ExternalChange);
            }
            identities.push(identity);
            parents.push(directory_identity(&scope.directory)?);
            scopes.push(scope);
        }
        for (change, scope) in self.prepared.changes.iter_mut().zip(scopes) {
            change.scoped = scope;
            if let Some(directory) = &destination {
                if let Some((scope, registry)) = change.images.take() {
                    change.images = Some((
                        scope.rebind_directory_transfer(
                            Arc::clone(directory),
                            &self.destination_display,
                        )?,
                        registry,
                    ));
                }
            }
        }
        self.identities = identities;
        self.parents = parents;
        self.validated = true;
        Ok(())
    }

    /// Only after every service's validate_commit succeeds. This preserves each
    /// alias's text/encoding/saved-byte baseline and advances only the shared
    /// proven publication location/identity; no source load or save occurs.
    pub fn commit(self) -> Vec<DocumentMetadata> {
        assert!(
            self.validated,
            "native Move needs its owned publication proof"
        );
        for (((source, change), identity), parent) in self
            .sources
            .iter()
            .zip(&self.prepared.changes)
            .zip(self.identities)
            .zip(self.parents)
        {
            self.prepared.service.documents[&source.id]
                .authority
                .move_to(
                    &source.scoped,
                    &source.parent_identity,
                    &source.identity,
                    &change.scoped,
                    parent,
                    identity,
                );
        }
        self.prepared.commit()
    }

    pub fn revoke(self) -> Vec<String> {
        self.prepared.revoke()
    }
}

impl DocumentService {
    pub fn prepare_moves(
        &mut self,
        targets: Vec<NativeMoveTarget>,
    ) -> Result<PreparedMoves<'_>, DocumentError> {
        if targets.is_empty() || targets.len() > 2 {
            return Err(DocumentError::InvalidPath);
        }
        let mut plans = Vec::with_capacity(targets.len());
        let mut affected = std::collections::HashSet::new();
        for target in targets {
            let plan = self.prepare_move(
                target.source_parent,
                &target.source_name,
                target.destination_parent,
                &target.destination_name,
                &target.source_display,
                &target.destination_display,
                target.kind,
            )?;
            let (_, detached) = plan.detach();
            if detached
                .sources
                .iter()
                .any(|source| !affected.insert(source.id.clone()))
            {
                return Err(DocumentError::UnsupportedRename);
            }
            plans.push(Some(detached));
        }
        self.retired_watchers.reserve(
            plans
                .iter()
                .flatten()
                .flat_map(|plan| &plan.changes)
                .map(|change| change.watches.len())
                .sum(),
        );
        Ok(PreparedMoves {
            service: self,
            plans,
        })
    }

    /// Both parents are native capabilities. In particular the destination must
    /// come from explicit folder selection or an existing workspace grant.
    #[allow(clippy::too_many_arguments)]
    pub fn prepare_move(
        &mut self,
        source_parent: Arc<Dir>,
        old_name: &Path,
        destination_parent: Arc<Dir>,
        new_name: &Path,
        old_display: &Path,
        new_display: &Path,
        kind: RenameKind,
    ) -> Result<PreparedMove<'_>, DocumentError> {
        if !valid_display(old_display)
            || !valid_display(new_display)
            || old_display.file_name() != Some(old_name.as_os_str())
            || new_display.file_name() != Some(new_name.as_os_str())
        {
            return Err(DocumentError::InvalidPath);
        }
        DirectoryBookmark::capture(
            &destination_parent,
            new_display.parent().ok_or(DocumentError::InvalidPath)?,
        )?;
        let source_directory = if kind == RenameKind::Directory {
            Some(Arc::new(crate::authority::open_directory_nofollow(
                &source_parent,
                old_name,
            )?))
        } else {
            None
        };
        let source_identity = if let Some(directory) = &source_directory {
            directory_identity(directory)?
        } else {
            ScopedDocument::new(Arc::clone(&source_parent), old_name)?.identity()?
        };
        // Reuse existing exact source/cohort/revision/watch preflight. Its
        // temporary same-parent candidate is never installed or exposed.
        let same_parent_candidate = old_display
            .parent()
            .ok_or(DocumentError::InvalidPath)?
            .join(new_name);
        let mut prepared = self.prepare_rename(
            Arc::clone(&source_parent),
            old_name,
            new_name,
            old_display,
            &same_parent_candidate,
            kind,
        )?;
        let mut sources = Vec::with_capacity(prepared.changes.len());
        for (change, metadata) in prepared.changes.iter_mut().zip(&mut prepared.metadata) {
            let document = &prepared.service.documents[&change.id];
            let suffix = if kind == RenameKind::Directory {
                document
                    .path
                    .strip_prefix(old_display)
                    .map_err(|_| DocumentError::InvalidPath)?
                    .to_owned()
            } else {
                PathBuf::new()
            };
            let path = if kind == RenameKind::Directory {
                new_display.join(&suffix)
            } else {
                new_display.to_owned()
            };
            if !valid_display(&path) {
                return Err(DocumentError::InvalidPath);
            }
            let scope = if let Some(directory) = &source_directory {
                document.image_scope.prepare_directory_move(
                    Arc::clone(directory),
                    old_display,
                    new_display,
                )?
            } else {
                document.image_scope.prepare_authorized_file_move(
                    &source_parent,
                    old_display,
                    Arc::clone(&destination_parent),
                    new_display,
                )?
            };
            let registry = prepared.service.images.prepare_retarget(&change.id, &scope);
            sources.push(Source {
                id: change.id.clone(),
                suffix,
                scoped: document.scoped.clone(),
                parent_identity: directory_identity(&document.scoped.directory)?,
                identity: Arc::clone(&document.authority.current(&document.scoped)?.identity),
            });
            change.path = path.clone();
            change.authority_name = None;
            change.images = Some((scope, registry));
            metadata.path = path.to_string_lossy().into_owned();
        }
        Ok(PreparedMove {
            prepared,
            source_parent,
            source_name: old_name.to_owned(),
            source_identity,
            destination_parent,
            destination_name: new_name.to_owned(),
            destination_display: new_display.to_owned(),
            kind,
            sources,
            identities: vec![],
            parents: vec![],
            validated: false,
        })
    }
}

#[cfg(test)]
mod tests;
