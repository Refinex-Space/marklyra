//! A native persisted image binding must identify its actual Markdown entity,
//! not merely the selected parent and basename. This proof grants no IO scope.
use crate::{authority::Identity, DocumentError, DocumentService};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImageDocumentIdentity {
    identity: Identity,
}
impl ImageDocumentIdentity {
    /// Native-only metadata proof from an existing directory capability and one
    /// basename. No path is opened as ambient authority and no text is decoded.
    pub fn capture_file(directory: &cap_std::fs::Dir, name: &Path) -> Result<Self, DocumentError> {
        let scope =
            crate::scoped::ScopedDocument::new(std::sync::Arc::new(directory.try_clone()?), name)?;
        let mut options = cap_std::fs::OpenOptions::new();
        options
            .read(true)
            ._cap_fs_ext_follow(cap_primitives::fs::FollowSymlinks::No);
        let file = directory.open_with(name, &options)?;
        let observed = same_file::Handle::from_file(file.try_clone()?.into_std())?;
        let result = Self::of_owned_file(&file)?;
        if scope.identity()? != observed {
            return Err(DocumentError::ExternalChange);
        }
        Ok(result)
    }
    pub(crate) fn of_owned_file(file: &cap_std::fs::File) -> Result<Self, DocumentError> {
        if !file.metadata()?.is_file() {
            return Err(DocumentError::InvalidPath);
        }
        Ok(Self {
            identity: Identity::of_file(&file.try_clone()?.into_std())?,
        })
    }
}

impl DocumentService {
    /// Native-only persisted binding evidence. The host recaptures it after each
    /// successful atomic Save because publishing a new inode changes the proof.
    /// Renderer JSON or a proof by itself never authorizes any file or alias.
    pub fn capture_image_document_identity(
        &self,
        id: &str,
    ) -> Result<ImageDocumentIdentity, DocumentError> {
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        let current = document.authority.current(&document.scoped)?;
        let file = document.scoped.open_regular()?.into_std();
        let observed = same_file::Handle::from_file(file.try_clone()?)?;
        if current.identity.as_ref() != &observed {
            return Err(DocumentError::ExternalChange);
        }
        let identity = Identity::of_file(&file)?;
        if document.scoped.identity()? != observed || Identity::of_file(&file)? != identity {
            return Err(DocumentError::ExternalChange);
        }
        Ok(ImageDocumentIdentity { identity })
    }

    /// Compare only an already authorized current document. An external same-byte
    /// replacement is rejected by capture; a fresh open of it returns false.
    pub fn matches_image_document_identity(
        &self,
        id: &str,
        proof: &ImageDocumentIdentity,
    ) -> Result<bool, DocumentError> {
        Ok(self.capture_image_document_identity(id)? == *proof)
    }
}
