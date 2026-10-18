//! Native-only durable image drafts and copy preparation. A renderer reference
//! never grants a path; each draft resolves only its exact registered sources.
use crate::{
    authority::open_directory_nofollow, DirectoryBookmark, DocumentError, DocumentService,
};
use cap_std::fs::{Dir, DirBuilder};
use image_assets::{ImageRegistration, ImageScope, MAX_DOCUMENT_IMAGES};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

const MAX_IMAGE_DRAFTS: usize = 128;
const MAX_DRAFT_SOURCES: usize = MAX_DOCUMENT_IMAGES * 2;

pub(crate) struct ImageDraft {
    directory: Arc<Dir>,
    bookmark: DirectoryBookmark,
    scope: ImageScope,
    // Portable source -> filename relative to this draft's directory capability.
    sources: HashMap<String, String>,
    pub(crate) lifetime: Uuid,
}

/// Trusted checkpoint record. The host persists this outside renderer-controlled
/// data and restores it only for that checkpoint's editor lifetime. Deserializing
/// arbitrary IPC JSON must never authorize this native-only API.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImageDraftSnapshot {
    id: String,
    directory: DirectoryBookmark,
    images: Vec<DraftImageRecord>,
}
impl ImageDraftSnapshot {
    pub fn id(&self) -> &str {
        &self.id
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DraftImageRecord {
    source: String,
    reference: String,
}

#[derive(Debug, Clone)]
pub struct ImageCopyMapping {
    pub source: String,
    pub target: ImageRegistration,
}

impl DocumentService {
    /// `root` and `display_root` must come from the host's application-owned
    /// durable data directory. They are never obtained from renderer strings.
    /// Separate draft UUID directories keep windows and editor lifetimes apart.
    pub fn create_image_draft(
        &mut self,
        root: Arc<Dir>,
        display_root: &Path,
    ) -> Result<String, DocumentError> {
        self.prune_image_saves();
        self.check_image_draft_capacity()?;
        DirectoryBookmark::capture(&root, display_root)?;
        create_private_directory(&root, Path::new("staged"), true)?;
        let staging = open_directory_nofollow(&root, Path::new("staged"))?;
        let id = Uuid::new_v4().to_string();
        create_private_directory(&staging, Path::new(&id), false)?;
        let directory = Arc::new(open_directory_nofollow(&staging, Path::new(&id))?);
        let path = display_root.join("staged").join(&id);
        let bookmark = DirectoryBookmark::capture(&directory, &path)?;
        let scope =
            ImageScope::document_directory(Arc::clone(&directory)).with_logical_root(&path)?;
        self.image_drafts.insert(
            id.clone(),
            ImageDraft {
                directory,
                bookmark,
                scope,
                sources: HashMap::new(),
                lifetime: Uuid::new_v4(),
            },
        );
        Ok(id)
    }

    pub fn import_draft_image(
        &mut self,
        id: &str,
        name: &str,
        base64: &str,
    ) -> Result<ImageRegistration, DocumentError> {
        self.prune_image_saves();
        let draft = self
            .image_drafts
            .get_mut(id)
            .ok_or(DocumentError::InvalidImageDraft)?;
        verify_draft(draft)?;
        if draft.sources.len() >= MAX_DRAFT_SOURCES {
            return Err(image_assets::ImageError::Capacity.into());
        }
        let registration = self.images.import_base64_with_folder(
            &owner(id),
            &draft.scope,
            name,
            base64,
            "",
            ".",
        )?;
        let source = portable_source(id, &registration.source);
        draft.sources.insert(source.clone(), registration.source);
        Ok(ImageRegistration {
            token: registration.token,
            source,
        })
    }

    /// Native-only spelling alias for the exact already-owned staged image.
    /// It permits portable import APIs and original-compatible file URI output
    /// to coexist, without reading or granting another filesystem location.
    pub fn add_image_draft_alias(
        &mut self,
        id: &str,
        existing_source: &str,
        alias_href: &str,
    ) -> Result<(), DocumentError> {
        let draft = self
            .image_drafts
            .get_mut(id)
            .ok_or(DocumentError::InvalidImageDraft)?;
        verify_draft(draft)?;
        let reference = draft
            .sources
            .get(existing_source)
            .ok_or(image_assets::ImageError::OutsideScope)?
            .clone();
        if !is_absolute_source(alias_href)
            || !draft.scope.references_same_path(&reference, alias_href)?
        {
            return Err(image_assets::ImageError::OutsideScope.into());
        }
        if let Some(previous) = draft.sources.get(alias_href) {
            return if previous == &reference {
                Ok(())
            } else {
                Err(image_assets::ImageError::OutsideScope.into())
            };
        }
        if draft.sources.len() >= MAX_DRAFT_SOURCES {
            return Err(image_assets::ImageError::Capacity.into());
        }
        draft.sources.insert(alias_href.to_owned(), reference);
        Ok(())
    }

    /// Only exact sources returned to this draft are accepted. Another draft's
    /// directory, relative traversal and ambient file URLs confer no permission.
    pub fn resolve_draft_image(
        &mut self,
        id: &str,
        source: &str,
    ) -> Result<ImageRegistration, DocumentError> {
        let draft = self
            .image_drafts
            .get(id)
            .ok_or(DocumentError::InvalidImageDraft)?;
        verify_draft(draft)?;
        let reference = draft
            .sources
            .get(source)
            .ok_or(image_assets::ImageError::OutsideScope)?;
        let registration = self.images.resolve(&owner(id), &draft.scope, reference)?;
        Ok(ImageRegistration {
            token: registration.token,
            source: source.to_owned(),
        })
    }

    pub fn image_draft_snapshot(&self, id: &str) -> Result<ImageDraftSnapshot, DocumentError> {
        let draft = self
            .image_drafts
            .get(id)
            .ok_or(DocumentError::InvalidImageDraft)?;
        verify_draft(draft)?;
        let mut images: Vec<_> = draft
            .sources
            .iter()
            .map(|(source, reference)| DraftImageRecord {
                source: source.clone(),
                reference: reference.clone(),
            })
            .collect();
        images.sort_unstable_by(|first, second| first.source.cmp(&second.source));
        Ok(ImageDraftSnapshot {
            id: id.to_owned(),
            directory: draft.bookmark.clone(),
            images,
        })
    }
    /// Exact Native-owned reference closure for retaining an unparsed Markdown
    /// draft on SaveAs. No source text or caller path participates in this grant.
    pub fn image_draft_sources(&self, id: &str) -> Result<Vec<String>, DocumentError> {
        Ok(self
            .image_draft_snapshot(id)?
            .images
            .into_iter()
            .map(|image| image.source)
            .collect())
    }

    /// Restore a native-owned checkpoint, not a renderer-supplied manifest. The
    /// old directory identity, exact app-data subtree and each real image are
    /// rechecked; failure leaves no live draft or newly registered tokens.
    pub fn restore_image_draft(
        &mut self,
        root: Arc<Dir>,
        display_root: &Path,
        snapshot: &ImageDraftSnapshot,
    ) -> Result<String, DocumentError> {
        self.prune_image_saves();
        self.check_image_draft_capacity()?;
        if self.image_drafts.contains_key(&snapshot.id)
            || Uuid::parse_str(&snapshot.id)
                .ok()
                .as_ref()
                .map(Uuid::to_string)
                .as_deref()
                != Some(&snapshot.id)
            || snapshot.images.len() > MAX_DRAFT_SOURCES
            || snapshot.directory.path() != display_root.join("staged").join(&snapshot.id)
        {
            return Err(DocumentError::InvalidImageDraft);
        }
        DirectoryBookmark::capture(&root, display_root)?;
        let directory = Arc::new(open_directory_nofollow(
            &root,
            &PathBuf::from("staged").join(&snapshot.id),
        )?);
        if DirectoryBookmark::capture(&directory, snapshot.directory.path())? != snapshot.directory
        {
            return Err(DocumentError::InvalidImageDraft);
        }
        let scope = ImageScope::document_directory(Arc::clone(&directory))
            .with_logical_root(snapshot.directory.path())?;
        let mut sources = HashMap::new();
        let result = (|| {
            for image in &snapshot.images {
                let same_source = image.source == portable_source(&snapshot.id, &image.reference)
                    || is_absolute_source(&image.source)
                        && scope.references_same_path(&image.reference, &image.source)?;
                if image.reference.contains('/')
                    || !same_source
                    || sources
                        .insert(image.source.clone(), image.reference.clone())
                        .is_some()
                {
                    return Err(DocumentError::InvalidImageDraft);
                }
                self.images
                    .resolve(&owner(&snapshot.id), &scope, &image.reference)?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            self.images.close_document(&owner(&snapshot.id));
            return Err(error);
        }
        self.image_drafts.insert(
            snapshot.id.clone(),
            ImageDraft {
                directory,
                bookmark: snapshot.directory.clone(),
                scope,
                sources,
                lifetime: Uuid::new_v4(),
            },
        );
        Ok(snapshot.id.clone())
    }

    /// Closing revokes only this editor's resource URLs. Durable staged files
    /// stay available to its native recovery record; no asset is deleted.
    pub fn close_image_draft(&mut self, id: &str) {
        self.image_drafts.remove(id);
        self.images.close_document(&owner(id));
    }
    /// Native-only Reveal location. Resolves real authorized bytes first, then
    /// proves the current display root and registered path still refer to those
    /// exact bytes. A detached cache or pathless Undo alias grants no path.
    pub fn image_path(&mut self, id: &str, reference: &str) -> Result<PathBuf, DocumentError> {
        let draft = self.image_drafts.contains_key(id);
        let registration = if draft {
            self.resolve_draft_image(id, reference)?
        } else {
            self.resolve_image(id, reference)?
        };
        let owner = if draft { owner(id) } else { id.to_owned() };
        let path = self
            .images
            .registration_path(&owner, &registration.token)
            .ok_or(image_assets::ImageError::OutsideScope)?;
        let image = self
            .images
            .get(&registration.token)
            .ok_or(image_assets::ImageError::OutsideScope)?;
        let scope = if draft {
            &self
                .image_drafts
                .get(id)
                .ok_or(DocumentError::InvalidImageDraft)?
                .scope
        } else {
            &self
                .documents
                .get(id)
                .ok_or(DocumentError::UnknownDocument)?
                .image_scope
        };
        Ok(scope.verified_image_path(&path, &image.bytes)?)
    }

    /// Native recovery may bind only the exact sources from a checkpoint owned
    /// by this window. Clone immutable bytes to the document's lifetime so closing
    /// the restored draft does not invalidate Undo or a saved old staged href.
    pub fn attach_image_draft_aliases(
        &mut self,
        document_id: &str,
        draft_id: &str,
        references: &[String],
    ) -> Result<(), DocumentError> {
        self.prune_image_saves();
        self.documents
            .get(document_id)
            .ok_or(DocumentError::UnknownDocument)?
            .ensure_location()?;
        if references.len() > MAX_DRAFT_SOURCES {
            return Err(image_assets::ImageError::Capacity.into());
        }
        let mut pending = Vec::new();
        let mut seen = HashSet::new();
        for reference in references {
            if !seen.insert(reference.as_str()) {
                continue;
            }
            let registration = self.resolve_draft_image(draft_id, reference)?;
            pending.push((reference.clone(), registration.token));
        }
        self.attach_validated_aliases(document_id, pending)
    }

    /// Restore native-owned SaveAs/Move mappings by resolving their target only
    /// inside this document's existing capability. Old href strings are exact
    /// aliases to immutable bytes, never authority for their old directories.
    pub fn attach_image_aliases(
        &mut self,
        document_id: &str,
        mappings: &[(String, String)],
    ) -> Result<(), DocumentError> {
        self.attach_image_aliases_with_root(document_id, mappings, "")
    }
    pub fn attach_image_aliases_with_root(
        &mut self,
        document_id: &str,
        mappings: &[(String, String)],
        reference_root: &str,
    ) -> Result<(), DocumentError> {
        self.prune_image_saves();
        self.documents
            .get(document_id)
            .ok_or(DocumentError::UnknownDocument)?
            .ensure_location()?;
        if mappings.len() > MAX_DOCUMENT_IMAGES {
            return Err(image_assets::ImageError::Capacity.into());
        }
        let mut pending = Vec::new();
        let mut seen = HashSet::new();
        for (source, target) in mappings {
            if source.is_empty()
                || source.len() > 4096
                || source.chars().any(char::is_control)
                || !seen.insert(source.as_str())
            {
                return Err(image_assets::ImageError::InvalidReference.into());
            }
            let document = self
                .documents
                .get(document_id)
                .ok_or(DocumentError::UnknownDocument)?;
            let reference = image_reference_with_root(target, reference_root);
            let registration =
                self.images
                    .resolve(document_id, &document.image_scope, &reference)?;
            pending.push((source.clone(), registration.token));
        }
        self.attach_validated_aliases(document_id, pending)
    }

    fn attach_validated_aliases(
        &mut self,
        document_id: &str,
        pending: Vec<(String, String)>,
    ) -> Result<(), DocumentError> {
        let mut prepared = Vec::new();
        let mut aliases_by_resource = HashMap::<String, String>::new();
        for (source, token) in pending {
            if self
                .image_aliases
                .get(document_id)
                .is_some_and(|aliases| aliases.contains_key(&source))
            {
                continue;
            }
            if let Some(previous) = aliases_by_resource.get(&token) {
                prepared.push((source, previous.clone(), false));
                continue;
            }
            if self.images.registration_owner(&token) == Some(document_id) {
                aliases_by_resource.insert(token.clone(), token.clone());
                prepared.push((source, token, false));
                continue;
            }
            match self.images.alias_registration(document_id, &token, &source) {
                Ok(registration) => {
                    aliases_by_resource.insert(token, registration.token.clone());
                    prepared.push((source, registration.token, true));
                }
                Err(error) => {
                    for (_, token, cloned) in &prepared {
                        if *cloned {
                            self.images.discard_registration(document_id, token);
                        }
                    }
                    return Err(error.into());
                }
            }
        }
        self.image_aliases
            .entry(document_id.to_owned())
            .or_default()
            .extend(
                prepared
                    .into_iter()
                    .map(|(source, token, _)| (source, token)),
            );
        Ok(())
    }

    /// Copy preparation for explicitly confirmed SaveAs/rename/Move. Both owners
    /// must already belong to this service. It reads all source references first,
    /// then atomically publishes each copy without replacement. Source files,
    /// registrations, Markdown, document baselines and encoding stay unchanged.
    /// On failure new target URLs are revoked; safely retained orphan copies may
    /// remain on disk. The host applies minimal conditional href patches only
    /// after success, and keeps old references/tokens for Undo.
    pub fn copy_owned_images(
        &mut self,
        source_owner: &str,
        destination_id: &str,
        references: &[String],
        reference_root: &str,
        storage_folder: &str,
    ) -> Result<Vec<ImageCopyMapping>, DocumentError> {
        self.copy_images(
            source_owner,
            destination_id,
            references,
            reference_root,
            storage_folder,
            false,
        )
    }

    /// Current image-menu copy: exact Native aliases follow the currently shown
    /// Undo image; other hrefs are reread through the current source capability.
    /// Unlike migration, this never prefers a detached pre-Move cached resource.
    pub fn copy_current_images(
        &mut self,
        source_owner: &str,
        destination_id: &str,
        references: &[String],
        reference_root: &str,
        storage_folder: &str,
    ) -> Result<Vec<ImageCopyMapping>, DocumentError> {
        self.copy_images(
            source_owner,
            destination_id,
            references,
            reference_root,
            storage_folder,
            true,
        )
    }

    fn copy_images(
        &mut self,
        source_owner: &str,
        destination_id: &str,
        references: &[String],
        reference_root: &str,
        storage_folder: &str,
        current_scope: bool,
    ) -> Result<Vec<ImageCopyMapping>, DocumentError> {
        self.prune_image_saves();
        let destination = self
            .documents
            .get(destination_id)
            .ok_or(DocumentError::UnknownDocument)?;
        destination.ensure_location()?;
        let stem = destination
            .path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .ok_or(image_assets::ImageError::InvalidName)?;
        let folder = storage_folder.replace("${filename}", stem);
        if folder.contains("${") || references.len() > MAX_DOCUMENT_IMAGES {
            return Err(image_assets::ImageError::InvalidReference.into());
        }
        let scope = destination.image_scope.clone();
        scope.validate_import_target(reference_root, &folder)?;
        let mut seen = HashSet::new();
        let mut pending = Vec::new();
        for reference in references {
            if !seen.insert(reference.as_str()) {
                continue;
            }
            let registration = if current_scope {
                if self.image_drafts.contains_key(source_owner) {
                    self.resolve_draft_image(source_owner, reference)?
                } else if let Some(alias) = self.resolve_image_alias(source_owner, reference)? {
                    alias
                } else {
                    self.resolve_image(
                        source_owner,
                        &image_reference_with_root(reference, reference_root),
                    )?
                }
            } else {
                self.owned_image_for_copy(source_owner, reference, reference_root)?
            };
            let resource = self
                .images
                .get(&registration.token)
                .ok_or(DocumentError::InvalidImageDraft)?;
            pending.push((reference.clone(), resource.bytes));
        }
        let mut copied = Vec::<ImageCopyMapping>::new();
        for (source, bytes) in pending {
            let name = source
                .rsplit('/')
                .next()
                .ok_or(image_assets::ImageError::InvalidName)?;
            match self.images.import_bytes_with_folder(
                destination_id,
                &scope,
                name,
                bytes.as_ref().to_vec(),
                reference_root,
                &folder,
            ) {
                Ok(target) => copied.push(ImageCopyMapping { source, target }),
                Err(error) => {
                    for mapping in &copied {
                        self.images
                            .discard_registration(destination_id, &mapping.target.token);
                    }
                    return Err(error.into());
                }
            }
        }
        let aliases = self
            .image_aliases
            .entry(destination_id.to_owned())
            .or_default();
        for mapping in &copied {
            aliases.insert(mapping.source.clone(), mapping.target.token.clone());
        }
        Ok(copied)
    }

    fn check_image_draft_capacity(&self) -> Result<(), DocumentError> {
        if self.image_drafts.len() >= MAX_IMAGE_DRAFTS {
            Err(image_assets::ImageError::Capacity.into())
        } else {
            Ok(())
        }
    }
    pub(crate) fn owned_image_for_copy(
        &mut self,
        source_owner: &str,
        reference: &str,
        reference_root: &str,
    ) -> Result<ImageRegistration, DocumentError> {
        if let Some(draft) = self.image_drafts.get(source_owner) {
            verify_draft(draft)?;
            let internal = draft
                .sources
                .get(reference)
                .ok_or(image_assets::ImageError::OutsideScope)?;
            if let Some(mut registration) = self
                .images
                .registered_source(&owner(source_owner), internal)
            {
                registration.source = reference.to_owned();
                return Ok(registration);
            }
            self.resolve_draft_image(source_owner, reference)
        } else {
            let document = self
                .documents
                .get(source_owner)
                .ok_or(DocumentError::UnknownDocument)?;
            document.ensure_location()?;
            if let Some(token) = self
                .image_aliases
                .get(source_owner)
                .and_then(|aliases| aliases.get(reference))
            {
                return Ok(ImageRegistration {
                    token: token.clone(),
                    source: reference.to_owned(),
                });
            }
            let resolved = image_reference_with_root(reference, reference_root);
            if let Some(registration) = self.images.registered_source(source_owner, &resolved) {
                return Ok(registration);
            }
            if document.metadata_revision > 0 {
                return Err(image_assets::ImageError::OutsideScope.into());
            }
            self.resolve_image(source_owner, &resolved)
        }
    }
}

fn image_reference_with_root(reference: &str, root: &str) -> String {
    if root.is_empty() || Path::new(reference).is_absolute() || reference.contains(':') {
        reference.to_owned()
    } else {
        format!("{}/{}", root.trim_end_matches('/'), reference)
    }
}
fn is_absolute_source(source: &str) -> bool {
    source.starts_with("file://") || Path::new(source).is_absolute()
}

fn owner(id: &str) -> String {
    format!("draft:{id}")
}
fn portable_source(id: &str, reference: &str) -> String {
    format!("staged/{id}/{reference}")
}
fn verify_draft(draft: &ImageDraft) -> Result<(), DocumentError> {
    if DirectoryBookmark::capture(&draft.directory, draft.bookmark.path())? != draft.bookmark {
        Err(DocumentError::InvalidImageDraft)
    } else {
        Ok(())
    }
}
fn create_private_directory(root: &Dir, name: &Path, may_exist: bool) -> Result<(), DocumentError> {
    let mut builder = DirBuilder::new();
    #[cfg(unix)]
    {
        use cap_std::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    match root.create_dir_with(name, &builder) {
        Ok(()) => Ok(()),
        Err(error) if may_exist && error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        Err(error) => Err(error.into()),
    }
}
