//! One Markdown publication after a native picker-bound image preparation.
use crate::{
    scoped::{FileBaseline, ScopedDocument},
    storage, DirectoryBookmark, DocumentError, DocumentPayload, DocumentService, Encoding,
    ImageCopyMapping,
};
use cap_std::fs::Dir;
use image_assets::{ImageScope, MAX_DOCUMENT_IMAGES};
use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

enum SourceProof {
    Document { epoch: Uuid, metadata_revision: u64 },
    Draft { lifetime: Uuid },
}

/// A native-only one-shot plan, bound to its exact service and source lifetime.
/// Dropping it revokes the provisional URLs immediately; a later image mutation
/// reclaims their registry quota. Newly copied files are deliberately retained.
pub struct PreparedImageSaveAs {
    binding: Arc<()>,
    source_owner: String,
    source_proof: SourceProof,
    path: PathBuf,
    scoped: ScopedDocument,
    target_parent: DirectoryBookmark,
    expected: Option<FileBaseline>,
    scope: ImageScope,
    temporary_owner: String,
    _live: Arc<()>,
    mappings: Vec<ImageCopyMapping>,
}

impl PreparedImageSaveAs {
    pub fn mappings(&self) -> &[ImageCopyMapping] {
        &self.mappings
    }
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The host first applies only the returned href mappings in one conditional
    /// editor transaction. This writes that exact resulting text once, using the
    /// target entity/absence captured before the copies. UI generation, revision
    /// and selection guards remain the host's responsibility.
    pub fn commit(
        self,
        service: &mut DocumentService,
        text: &str,
        source_document_id: Option<&str>,
        encoding: Option<&str>,
    ) -> Result<DocumentPayload, DocumentError> {
        service.prune_image_saves();
        if !Arc::ptr_eq(&self.binding, &service.image_service_binding) {
            return Err(DocumentError::InvalidImageDraft);
        }
        self.target_parent.reopen()?;
        let encoding = match &self.source_proof {
            SourceProof::Document {
                epoch,
                metadata_revision,
            } => {
                if source_document_id != Some(self.source_owner.as_str()) {
                    return Err(DocumentError::UnknownDocument);
                }
                let source = service
                    .documents
                    .get(&self.source_owner)
                    .ok_or(DocumentError::UnknownDocument)?;
                source.ensure_location()?;
                if source.baseline_epoch != *epoch || source.metadata_revision != *metadata_revision
                {
                    return Err(DocumentError::ExternalChange);
                }
                if encoding
                    .map(Encoding::from_label)
                    .transpose()?
                    .is_some_and(|requested| requested != source.encoding)
                {
                    return Err(DocumentError::EncodingConflict);
                }
                source.encoding
            }
            SourceProof::Draft { lifetime } => {
                if source_document_id.is_some() {
                    return Err(DocumentError::InvalidImageDraft);
                }
                let source = service
                    .image_drafts
                    .get(&self.source_owner)
                    .ok_or(DocumentError::InvalidImageDraft)?;
                if source.lifetime != *lifetime {
                    return Err(DocumentError::InvalidImageDraft);
                }
                service.image_draft_snapshot(&self.source_owner)?;
                encoding
                    .map(Encoding::from_label)
                    .transpose()?
                    .unwrap_or(Encoding::Utf8)
            }
        };
        let bytes = encoding.encode(text)?;
        if let Some(expected) = &self.expected {
            self.scoped
                .check_identity(&expected.bytes, &expected.identity)?;
        } else {
            match self.scoped.directory.symlink_metadata(&self.scoped.name) {
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                _ => return Err(DocumentError::ExternalChange),
            }
        }
        let same_source = source_document_id.and_then(|id| {
            service
                .documents
                .get(id)
                .filter(|document| document.path == self.path)
                .map(|_| id)
        });
        let payload = if let Some(id) = same_source {
            service
                .images
                .check_reassign_document(&self.temporary_owner, id)?;
            service.save(id, text)?
        } else {
            service.check_capacity()?;
            let identity = match self.expected {
                Some(expected) if expected.bytes == bytes => expected.identity,
                Some(expected) => {
                    let authority = service
                        .authorities
                        .join(&self.scoped, Arc::clone(&expected.identity))?;
                    let mut current = authority.current(&self.scoped)?;
                    if current.identity != expected.identity {
                        return Err(DocumentError::ExternalChange);
                    }
                    let published = Arc::new(self.scoped.replace(
                        &expected.bytes,
                        &expected.identity,
                        &bytes,
                    )?);
                    current.identity = Arc::clone(&published);
                    published
                }
                None => Arc::new(self.scoped.write_authorized(None, &bytes)?),
            };
            service.register(
                self.path,
                FileBaseline { bytes, identity },
                text.to_owned(),
                encoding,
                self.scope,
                self.scoped,
            )?
        };
        service
            .images
            .reassign_document(&self.temporary_owner, &payload.id);
        service.pending_image_saves.remove(&self.temporary_owner);
        let aliases = service.image_aliases.entry(payload.id.clone()).or_default();
        for mapping in self.mappings {
            aliases.insert(mapping.source, mapping.target.token);
        }
        Ok(payload)
    }
}

impl DocumentService {
    /// The path is exclusively a native save-picker grant. Neither YAML nor a
    /// renderer path is an authorization source. Preparation copies images but
    /// never publishes Markdown or changes a document's saved baseline.
    pub fn prepare_image_save_as(
        &mut self,
        path: &Path,
        source_owner: &str,
        references: &[String],
        reference_root: &str,
        storage_folder: &str,
    ) -> Result<PreparedImageSaveAs, DocumentError> {
        self.prune_image_saves();
        self.check_capacity()?;
        if references.len() > MAX_DOCUMENT_IMAGES {
            return Err(image_assets::ImageError::Capacity.into());
        }
        let source_proof = if let Some(source) = self.image_drafts.get(source_owner) {
            self.image_draft_snapshot(source_owner)?;
            SourceProof::Draft {
                lifetime: source.lifetime,
            }
        } else {
            let source = self
                .documents
                .get(source_owner)
                .ok_or(DocumentError::UnknownDocument)?;
            source.ensure_location()?;
            SourceProof::Document {
                epoch: source.baseline_epoch,
                metadata_revision: source.metadata_revision,
            }
        };
        if std::fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
            return Err(DocumentError::InvalidPath);
        }
        let path = storage::normalize_selected_path(path)?;
        let parent = path.parent().ok_or(DocumentError::InvalidPath)?;
        let directory = Arc::new(Dir::open_ambient_dir(parent, cap_std::ambient_authority())?);
        let target_parent = DirectoryBookmark::capture(&directory, parent)?;
        let scoped = ScopedDocument::new(
            Arc::clone(&directory),
            Path::new(path.file_name().ok_or(DocumentError::InvalidPath)?),
        )?;
        let expected = match scoped.read_snapshot() {
            Ok(snapshot) => Some(snapshot.into_baseline()),
            Err(DocumentError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error),
        };
        let scope = if let Some(source) = self.documents.get(source_owner) {
            source
                .image_scope
                .prepare_authorized_file_move(
                    &source.scoped.directory,
                    &source.path,
                    directory,
                    &path,
                )?
                .commit()
        } else {
            ImageScope::document_directory(directory).with_logical_root(parent)?
        };
        let stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .ok_or(image_assets::ImageError::InvalidName)?;
        let folder = storage_folder.replace("${filename}", stem);
        if folder.contains("${") {
            return Err(image_assets::ImageError::InvalidReference.into());
        }
        scope.validate_import_target(reference_root, &folder)?;
        let mut seen = HashSet::new();
        let mut pending = Vec::new();
        for reference in references {
            if !seen.insert(reference.as_str()) {
                continue;
            }
            let registration =
                self.owned_image_for_copy(source_owner, reference, reference_root)?;
            let resource = self
                .images
                .get(&registration.token)
                .ok_or(DocumentError::InvalidImageDraft)?;
            pending.push((reference.clone(), resource.bytes));
        }
        let temporary_owner = format!("prepared:{}", Uuid::new_v4());
        let live = Arc::new(());
        self.pending_image_saves
            .insert(temporary_owner.clone(), Arc::downgrade(&live));
        let mut mappings = Vec::new();
        for (source, bytes) in pending {
            let name = source
                .rsplit('/')
                .next()
                .ok_or(image_assets::ImageError::InvalidName)?;
            match self.images.import_bytes_with_folder(
                &temporary_owner,
                &scope,
                name,
                bytes.as_ref().to_vec(),
                reference_root,
                &folder,
            ) {
                Ok(target) => mappings.push(ImageCopyMapping { source, target }),
                Err(error) => {
                    self.images.close_document(&temporary_owner);
                    self.pending_image_saves.remove(&temporary_owner);
                    return Err(error.into());
                }
            }
        }
        Ok(PreparedImageSaveAs {
            binding: Arc::clone(&self.image_service_binding),
            source_owner: source_owner.to_owned(),
            source_proof,
            path,
            scoped,
            target_parent,
            expected,
            scope,
            temporary_owner,
            _live: live,
            mappings,
        })
    }

    pub(crate) fn prune_image_saves(&mut self) {
        let retired: Vec<_> = self
            .pending_image_saves
            .iter()
            .filter(|(_, lease)| lease.upgrade().is_none())
            .map(|(owner, _)| owner.clone())
            .collect();
        for owner in retired {
            self.images.close_document(&owner);
            self.pending_image_saves.remove(&owner);
        }
    }
}
