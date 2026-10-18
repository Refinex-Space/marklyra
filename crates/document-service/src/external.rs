//! Observing disk never changes the saved baseline. Acceptance is an explicit,
//! version-bound second phase after the host has conditionally applied the view.
use crate::{scoped::DiskSnapshot, DocumentError, DocumentPayload, DocumentService, Encoding};
use serde::Serialize;
use std::{
    io::ErrorKind,
    time::{Duration, Instant},
};
use uuid::Uuid;

pub const MAX_PENDING_RELOAD_BYTES: usize = 64 * 1024 * 1024;
const RELOAD_TTL: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum UnreadableReason {
    InvalidPath,
    UnsupportedEncoding,
    TooLarge,
    PermissionDenied,
    Io,
    Unstable,
    Capacity,
}
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "lowercase")]
pub enum DocumentChange {
    Unchanged,
    Changed {
        version: String,
        document: DocumentPayload,
    },
    Missing {
        message: String,
    },
    Unreadable {
        reason: UnreadableReason,
        message: String,
    },
}
pub(crate) struct PendingReload {
    token: String,
    baseline_epoch: Uuid,
    snapshot: DiskSnapshot,
    text: String,
    encoding: Encoding,
    created: Instant,
}
impl PendingReload {
    fn bytes(&self) -> usize {
        self.snapshot.bytes.len() + self.text.len()
    }
    fn expired(&self) -> bool {
        self.created.elapsed() >= RELOAD_TTL
    }
}
impl DocumentService {
    /// No baseline update, no writes, and no authorization derived from JS paths.
    pub fn check_document_change(&mut self, id: &str) -> Result<DocumentChange, DocumentError> {
        self.expire_reloads();
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        let snapshot = match document.scoped.read_snapshot() {
            Ok(snapshot) => snapshot,
            Err(error) => {
                self.pending_reloads.remove(id);
                return Ok(unreadable(error));
            }
        };
        if snapshot.bytes == document.original_bytes
            && snapshot.version.identity == *document.authority.current(&document.scoped)?.identity
        {
            self.pending_reloads.remove(id);
            return Ok(DocumentChange::Unchanged);
        }
        if let Some(pending) = self.pending_reloads.get(id) {
            if pending.baseline_epoch == document.baseline_epoch
                && pending.snapshot.version == snapshot.version
                && pending.snapshot.bytes == snapshot.bytes
            {
                return Ok(candidate(
                    id,
                    &document.path.to_string_lossy(),
                    document.metadata_revision,
                    pending,
                ));
            }
        }
        let (encoding, text) = match Encoding::decode(&snapshot.bytes) {
            Ok(value) => value,
            Err(error) => {
                self.pending_reloads.remove(id);
                return Ok(unreadable(error));
            }
        };
        let bytes = self
            .pending_reloads
            .iter()
            .filter(|(key, _)| key.as_str() != id)
            .map(|(_, value)| value.bytes())
            .sum::<usize>();
        if bytes + snapshot.bytes.len() + text.len() > MAX_PENDING_RELOAD_BYTES {
            self.pending_reloads.remove(id);
            return Ok(DocumentChange::Unreadable {
                reason: UnreadableReason::Capacity,
                message: "待处理磁盘快照达到 64 MiB 上限，请关闭或处理其他文档后重试".to_owned(),
            });
        }
        let pending = PendingReload {
            token: Uuid::new_v4().to_string(),
            baseline_epoch: document.baseline_epoch,
            snapshot,
            text,
            encoding,
            created: Instant::now(),
        };
        let result = candidate(
            id,
            &document.path.to_string_lossy(),
            document.metadata_revision,
            &pending,
        );
        self.pending_reloads.insert(id.to_owned(), pending);
        Ok(result)
    }
    /// Call only after the SDK has conditionally reloaded this exact candidate.
    /// The disk is checked again; failure never changes the baseline or the disk.
    pub fn accept_document_change(
        &mut self,
        id: &str,
        version: &str,
    ) -> Result<DocumentPayload, DocumentError> {
        self.expire_reloads();
        let document = self
            .documents
            .get(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.ensure_location()?;
        let pending = self
            .pending_reloads
            .get(id)
            .filter(|pending| {
                pending.token == version && pending.baseline_epoch == document.baseline_epoch
            })
            .ok_or(DocumentError::StaleReload)?;
        let matches = document.scoped.read_snapshot().is_ok_and(|current| {
            current.version == pending.snapshot.version && current.bytes == pending.snapshot.bytes
        }) && !pending.expired();
        if !matches {
            self.pending_reloads.remove(id);
            return Err(DocumentError::StaleReload);
        }
        let pending = self
            .pending_reloads
            .remove(id)
            .ok_or(DocumentError::StaleReload)?;
        let document = self
            .documents
            .get_mut(id)
            .ok_or(DocumentError::UnknownDocument)?;
        document.original_bytes = pending.snapshot.bytes;
        let identity = std::sync::Arc::new(pending.snapshot.version.identity);
        document.authority = self
            .authorities
            .join(&document.scoped, std::sync::Arc::clone(&identity))?;
        document.identity = identity;
        document.text = pending.text;
        document.encoding = pending.encoding;
        document.baseline_epoch = Uuid::new_v4();
        Ok(document.payload(id))
    }
    /// A stale dismiss must never evict a newer candidate for the same document.
    pub fn dismiss_document_change(
        &mut self,
        id: &str,
        version: &str,
    ) -> Result<bool, DocumentError> {
        if !self.documents.contains_key(id) {
            return Err(DocumentError::UnknownDocument);
        }
        self.expire_reloads();
        if self
            .pending_reloads
            .get(id)
            .is_some_and(|pending| pending.token == version)
        {
            self.pending_reloads.remove(id);
            Ok(true)
        } else {
            Ok(false)
        }
    }
    fn expire_reloads(&mut self) {
        self.pending_reloads.retain(|_, pending| !pending.expired());
    }
}
fn candidate(
    id: &str,
    path: &str,
    metadata_revision: u64,
    pending: &PendingReload,
) -> DocumentChange {
    DocumentChange::Changed {
        version: pending.token.clone(),
        document: DocumentPayload {
            id: id.to_owned(),
            path: path.to_owned(),
            text: pending.text.clone(),
            encoding: pending.encoding.label().to_owned(),
            metadata_revision,
            location_state: crate::DocumentLocationState::Available,
        },
    }
}
fn unreadable(error: DocumentError) -> DocumentChange {
    let reason = match &error {
        DocumentError::Io(error) if error.kind() == ErrorKind::NotFound => {
            return DocumentChange::Missing {
                message: "磁盘文件已移动或删除；当前稿件仍保留，请另存为".to_owned(),
            }
        }
        DocumentError::Io(error) if error.kind() == ErrorKind::PermissionDenied => {
            UnreadableReason::PermissionDenied
        }
        DocumentError::InvalidPath => UnreadableReason::InvalidPath,
        DocumentError::UnsupportedEncoding => UnreadableReason::UnsupportedEncoding,
        DocumentError::TooLarge => UnreadableReason::TooLarge,
        DocumentError::UnstableRead => UnreadableReason::Unstable,
        _ => UnreadableReason::Io,
    };
    DocumentChange::Unreadable {
        reason,
        message: error.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn expired_candidates_cannot_update_baseline() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.md");
        std::fs::write(&path, b"old").unwrap();
        let mut service = DocumentService::new();
        let document = service.open_authorized(&path).unwrap();
        std::fs::write(&path, b"new").unwrap();
        let DocumentChange::Changed { version, .. } =
            service.check_document_change(&document.id).unwrap()
        else {
            panic!("expected change");
        };
        service
            .pending_reloads
            .get_mut(&document.id)
            .unwrap()
            .created = Instant::now() - RELOAD_TTL;
        assert!(matches!(
            service.accept_document_change(&document.id, &version),
            Err(DocumentError::StaleReload)
        ));
        assert!(matches!(
            service.save(&document.id, "ours"),
            Err(DocumentError::ExternalChange)
        ));
    }
    #[test]
    fn pending_memory_limit_is_checked_and_dismiss_releases_it() {
        let dir = tempfile::tempdir().unwrap();
        let mut service = DocumentService::new();
        let mut ids = Vec::new();
        for index in 0..3 {
            let path = dir.path().join(format!("{index}.md"));
            std::fs::write(&path, b"old").unwrap();
            let document = service.open_authorized(&path).unwrap();
            std::fs::write(&path, "x".repeat(16 * 1024 * 1024)).unwrap();
            ids.push(document.id);
        }
        let DocumentChange::Changed { version, .. } =
            service.check_document_change(&ids[0]).unwrap()
        else {
            panic!("expected first");
        };
        assert!(matches!(
            service.check_document_change(&ids[1]).unwrap(),
            DocumentChange::Changed { .. }
        ));
        assert!(matches!(
            service.check_document_change(&ids[2]).unwrap(),
            DocumentChange::Unreadable {
                reason: UnreadableReason::Capacity,
                ..
            }
        ));
        service.dismiss_document_change(&ids[0], &version).unwrap();
        assert!(matches!(
            service.check_document_change(&ids[2]).unwrap(),
            DocumentChange::Changed { .. }
        ));
    }
}
