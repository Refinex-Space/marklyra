//! Bounded, capability-scoped crash drafts. No user-document reads or writes.
mod storage;
mod types;

use std::{
    collections::HashMap,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use thiserror::Error;
pub use types::*;
use uuid::Uuid;

pub const MAX_TEXT_BYTES: usize = 32 * 1024 * 1024;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Debug, Error)]
pub enum RecoveryError {
    #[error("恢复存储正在被其他程序实例使用")]
    Busy,
    #[error("恢复会话已失效，请重新建立恢复会话")]
    InvalidSession,
    #[error("恢复记录版本已改变；未覆盖或删除较新的草稿")]
    StaleVersion,
    #[error("恢复记录不存在或已被消费")]
    Missing,
    #[error("恢复记录数据或选择范围无效")]
    InvalidData,
    #[error("恢复数据超过大小或数量上限；现有草稿已保留，请先处理恢复列表")]
    Capacity,
    #[error("恢复目录或条目不是安全的普通目录/文件")]
    InvalidPath,
    #[error("恢复存储操作失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("恢复记录格式无效：{0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone)]
pub struct Limits {
    pub max_records: usize,
    pub max_record_bytes: usize,
    pub max_total_bytes: u64,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            max_records: 64,
            max_record_bytes: 64 * 1024 * 1024,
            max_total_bytes: 256 * 1024 * 1024,
        }
    }
}

struct Session {
    lease: String,
    version: u64,
    sequence: u64,
    created_at: u64,
    last_request: Option<(String, CheckpointReceipt)>,
}

pub struct RecoveryStore {
    disk: storage::Disk,
    sessions: HashMap<String, Session>,
}
impl RecoveryStore {
    /// Root must be chosen by trusted native host code, never by renderer IPC.
    pub fn open(root: &Path) -> Result<Self, RecoveryError> {
        Self::open_with_limits(root, Limits::default())
    }
    pub fn open_with_limits(root: &Path, limits: Limits) -> Result<Self, RecoveryError> {
        Ok(Self {
            disk: storage::Disk::open(root, limits)?,
            sessions: HashMap::new(),
        })
    }
    /// Explicit import of an orphaned synchronous WebView fallback. The caller
    /// must exclude live owners. Identity and content are immutable: retries
    /// return the same durable record, including after it has been consumed.
    pub fn import_fallback(
        &mut self,
        id: &str,
        version: u64,
        content: DraftContent,
    ) -> Result<FallbackReceipt, RecoveryError> {
        validate_id(id)?;
        validate_content(&content)?;
        if version == 0 || version > MAX_SAFE_INTEGER {
            return Err(RecoveryError::InvalidData);
        }
        let identity = FallbackIdentity {
            id: id.into(),
            version,
            checksum: storage::content_digest(&content, self.disk.limits.max_record_bytes)?,
        };
        let record_id = storage::fallback_record_id(id, version);
        let (records, issues) = self.disk.scan()?;
        if issues
            .iter()
            .any(|issue| issue.file.starts_with(&format!("{record_id}.")))
        {
            return Err(RecoveryError::InvalidData);
        }
        if let Some(record) = records.get(&record_id) {
            if record.fallback.as_ref() != Some(&identity) {
                return Err(RecoveryError::StaleVersion);
            }
            return Ok(FallbackReceipt {
                id: record.id.clone(),
                version: record.version,
                updated_at: record.updated_at,
                available: record.content.is_some(),
            });
        }
        let stored = records
            .values()
            .filter(|record| record.content.is_some())
            .count();
        let unstored = self
            .sessions
            .keys()
            .filter(|id| !records.contains_key(*id))
            .count();
        if stored + unstored >= self.disk.limits.max_records {
            return Err(RecoveryError::Capacity);
        }
        let now = now();
        let record = Record {
            id: record_id,
            version: 1,
            sequence: version,
            created_at: now,
            updated_at: now,
            content: Some(content),
            fallback: Some(identity),
        };
        self.disk.write(&record)?;
        Ok(FallbackReceipt {
            id: record.id,
            version: record.version,
            updated_at: now,
            available: true,
        })
    }
    pub fn begin(&mut self) -> Result<RecoverySession, RecoveryError> {
        let (records, _) = self.disk.scan()?;
        let stored = records
            .values()
            .filter(|record| record.content.is_some())
            .count();
        let unstored = self
            .sessions
            .keys()
            .filter(|id| !records.contains_key(*id))
            .count();
        if stored + unstored >= self.disk.limits.max_records {
            return Err(RecoveryError::Capacity);
        }
        let id = Uuid::new_v4().to_string();
        let lease = Uuid::new_v4().to_string();
        self.sessions.insert(
            id.clone(),
            Session {
                lease: lease.clone(),
                version: 0,
                sequence: 0,
                created_at: now(),
                last_request: None,
            },
        );
        Ok(RecoverySession {
            id,
            lease,
            version: 0,
        })
    }
    pub fn checkpoint(
        &mut self,
        request: CheckpointRequest,
    ) -> Result<CheckpointReceipt, RecoveryError> {
        validate_id(&request.id)?;
        let session = self
            .sessions
            .get(&request.id)
            .ok_or(RecoveryError::InvalidSession)?;
        if session.lease != request.lease {
            return Err(RecoveryError::InvalidSession);
        }
        validate_content(&request.content)?;
        let request_hash =
            storage::content_digest(&request.content, self.disk.limits.max_record_bytes)?;
        // A reply may be lost after durable commit. Only the exact last request
        // can be replayed; a later checkpoint permanently invalidates this retry.
        if request.expected_version.checked_add(1) == Some(session.version)
            && request.sequence == session.sequence
        {
            if let Some((hash, receipt)) = &session.last_request {
                if *hash == request_hash {
                    return Ok(receipt.clone());
                }
            }
        }
        if session.version != request.expected_version
            || request.sequence <= session.sequence
            || request.sequence > MAX_SAFE_INTEGER
        {
            return Err(RecoveryError::StaleVersion);
        }
        let version = session
            .version
            .checked_add(1)
            .filter(|value| *value <= MAX_SAFE_INTEGER)
            .ok_or(RecoveryError::Capacity)?;
        let record = Record {
            id: request.id.clone(),
            version,
            sequence: request.sequence,
            created_at: session.created_at,
            updated_at: now(),
            content: Some(request.content),
            fallback: None,
        };
        self.disk.write(&record)?;
        let session = self
            .sessions
            .get_mut(&request.id)
            .ok_or(RecoveryError::InvalidSession)?;
        session.version = version;
        session.sequence = request.sequence;
        let receipt = CheckpointReceipt {
            id: record.id,
            version,
            updated_at: record.updated_at,
        };
        session.last_request = Some((request_hash, receipt.clone()));
        Ok(receipt)
    }
    pub fn list(&self) -> Result<RecoveryListing, RecoveryError> {
        let (records, issues) = self.disk.scan()?;
        let mut drafts = Vec::new();
        let mut saved_copies = Vec::new();
        for record in records.into_values() {
            if let Some(content) = record.content {
                let summary = DraftSummary {
                    active: self.sessions.contains_key(&record.id),
                    id: record.id,
                    version: record.version,
                    updated_at: record.updated_at,
                    text_bytes: content.text.len(),
                    document: content.document,
                };
                if content.text == content.saved_text {
                    saved_copies.push(summary);
                } else {
                    drafts.push(summary);
                }
            }
        }
        for items in [&mut drafts, &mut saved_copies] {
            items.sort_by(|a, b| {
                b.updated_at
                    .cmp(&a.updated_at)
                    .then_with(|| a.id.cmp(&b.id))
            });
        }
        Ok(RecoveryListing {
            drafts,
            saved_copies,
            issues,
        })
    }
    pub fn read(&self, id: &str, version: u64) -> Result<RecoveryDraft, RecoveryError> {
        let record = self.current(id, version)?;
        Ok(RecoveryDraft {
            id: record.id,
            version: record.version,
            sequence: record.sequence,
            created_at: record.created_at,
            updated_at: record.updated_at,
            content: record.content.ok_or(RecoveryError::Missing)?,
        })
    }
    /// Revokes a writer without deleting its durable draft.
    pub fn end(&mut self, id: &str, lease: &str) -> Result<(), RecoveryError> {
        self.validate_lease(id, Some(lease))?;
        if self.sessions.remove(id).is_none() {
            return Err(RecoveryError::InvalidSession);
        }
        Ok(())
    }
    /// Call only after explicit discard, or after another durable checkpoint/save
    /// protects the restored text. Read alone never consumes a recovery record.
    pub fn consume(
        &mut self,
        id: &str,
        version: u64,
        lease: Option<&str>,
    ) -> Result<(), RecoveryError> {
        self.validate_lease(id, lease)?;
        if self
            .sessions
            .get(id)
            .is_some_and(|session| session.version != version)
        {
            return Err(RecoveryError::StaleVersion);
        }
        // An uncheckpointed session can be ended by its valid lease/version zero.
        if version == 0 && self.sessions.get(id).is_some_and(|s| s.version == 0) {
            self.sessions.remove(id);
            return Ok(());
        }
        let (mut records, issues) = self.disk.scan()?;
        // A fallback's version is not proof that the other slot contains no
        // newer recoverable bytes. Never replace damaged evidence with a
        // tombstone, including after restart when no live lease remains.
        let slots = [format!("{id}.0.json"), format!("{id}.1.json")];
        if issues.iter().any(|issue| {
            slots
                .iter()
                .any(|slot| issue.file.eq_ignore_ascii_case(slot))
        }) {
            return Err(RecoveryError::InvalidData);
        }
        let record = records.remove(id).ok_or(RecoveryError::Missing)?;
        if record.content.is_none() && version.checked_add(1) == Some(record.version) {
            self.disk.remove_consumed(&record)?;
            return Ok(());
        }
        if record.version != version {
            return Err(RecoveryError::StaleVersion);
        }
        if record.content.is_none() {
            return Err(RecoveryError::Missing);
        }
        let tombstone = Record {
            version: record
                .version
                .checked_add(1)
                .filter(|v| *v <= MAX_SAFE_INTEGER)
                .ok_or(RecoveryError::Capacity)?,
            updated_at: now(),
            content: None,
            ..record
        };
        self.disk.write(&tombstone)?;
        self.sessions.remove(id);
        // The older slot is removed first. A crash cannot resurrect it while a
        // newer tombstone remains. Failure leaves a safe retryable tombstone.
        self.disk.remove_consumed(&tombstone)?;
        Ok(())
    }
    fn current(&self, id: &str, version: u64) -> Result<Record, RecoveryError> {
        validate_id(id)?;
        let (mut records, _) = self.disk.scan()?;
        let record = records.remove(id).ok_or(RecoveryError::Missing)?;
        if record.content.is_none() {
            return Err(RecoveryError::Missing);
        }
        if record.version != version {
            return Err(RecoveryError::StaleVersion);
        }
        Ok(record)
    }
    fn validate_lease(&self, id: &str, lease: Option<&str>) -> Result<(), RecoveryError> {
        validate_id(id)?;
        if let Some(session) = self.sessions.get(id) {
            if lease != Some(session.lease.as_str()) {
                return Err(RecoveryError::InvalidSession);
            }
        } else if lease.is_some() {
            return Err(RecoveryError::InvalidSession);
        }
        Ok(())
    }
}

pub(crate) fn validate_id(id: &str) -> Result<(), RecoveryError> {
    if Uuid::parse_str(id).is_ok_and(|uuid| uuid.to_string() == id) {
        Ok(())
    } else {
        Err(RecoveryError::InvalidPath)
    }
}
pub(crate) fn validate_content(content: &DraftContent) -> Result<(), RecoveryError> {
    for text in [&content.text, &content.saved_text] {
        if text.len() > MAX_TEXT_BYTES {
            return Err(RecoveryError::Capacity);
        }
        if text.contains('\0') {
            return Err(RecoveryError::InvalidData);
        }
    }
    if let Some(document) = &content.document {
        if document.path.len() > 4096
            || document.path.is_empty()
            || document.path.contains('\0')
            || !matches!(
                document.encoding.as_str(),
                "UTF-8" | "UTF-8 BOM" | "UTF-16LE BOM" | "UTF-16BE BOM"
            )
        {
            return Err(RecoveryError::InvalidData);
        }
    }
    if let Some(selection) = &content.selection {
        let mut offsets = vec![selection.anchor, selection.head];
        offsets.sort_unstable();
        let mut offset = 0u64;
        for ch in content.text.chars() {
            offsets.retain(|target| *target != offset);
            offset += ch.len_utf16() as u64;
        }
        offsets.retain(|target| *target != offset);
        if !offsets.is_empty() {
            return Err(RecoveryError::InvalidData);
        }
    }
    Ok(())
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(MAX_SAFE_INTEGER as u128) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    fn crash_between_tombstone_and_unlink(root: &Path) -> String {
        let mut store = RecoveryStore::open(root).unwrap();
        let session = store.begin().unwrap();
        store
            .checkpoint(CheckpointRequest {
                id: session.id.clone(),
                lease: session.lease,
                expected_version: 0,
                sequence: 1,
                content: DraftContent {
                    text: "draft".to_owned(),
                    saved_text: String::new(),
                    document: None,
                    selection: None,
                },
            })
            .unwrap();
        let old = store.current(&session.id, 1).unwrap();
        store
            .disk
            .write(&Record {
                version: 2,
                content: None,
                ..old
            })
            .unwrap();
        // No unlink: this is the exact durable state of interruption after the
        // atomic deletion marker and before removal of the previous data slot.
        session.id
    }
    #[test]
    fn interrupted_consume_cannot_resurrect_the_previous_slot_and_can_be_retried() {
        let root = tempfile::tempdir().unwrap();
        let id = crash_between_tombstone_and_unlink(root.path());
        let mut store = RecoveryStore::open(root.path()).unwrap();
        assert!(store.list().unwrap().drafts.is_empty());
        assert!(matches!(store.read(&id, 1), Err(RecoveryError::Missing)));
        store.consume(&id, 1, None).unwrap();
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    }
    #[test]
    fn stale_active_consume_does_not_delete_a_corrupted_newer_checkpoint() {
        let root = tempfile::tempdir().unwrap();
        let mut store = RecoveryStore::open(root.path()).unwrap();
        let session = store.begin().unwrap();
        for version in 0..2 {
            store
                .checkpoint(CheckpointRequest {
                    id: session.id.clone(),
                    lease: session.lease.clone(),
                    expected_version: version,
                    sequence: version + 1,
                    content: DraftContent {
                        text: format!("draft {version}"),
                        saved_text: String::new(),
                        document: None,
                        selection: None,
                    },
                })
                .unwrap();
        }
        std::fs::write(
            root.path().join(format!("{}.0.json", session.id)),
            b"corrupt",
        )
        .unwrap();
        assert!(matches!(
            store.consume(&session.id, 1, Some(&session.lease)),
            Err(RecoveryError::StaleVersion)
        ));
        assert_eq!(store.list().unwrap().drafts.len(), 1);
    }
}
