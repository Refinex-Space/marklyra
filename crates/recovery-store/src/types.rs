use serde::{Deserialize, Serialize};

/// Advisory metadata, never an authorization to reopen or overwrite this path.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentMetadata {
    pub path: String,
    pub encoding: String,
}

/// UTF-16 offsets in the exact stored Markdown, not transient DOM/cid bookmarks.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SourceSelection {
    pub anchor: u64,
    pub head: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DraftContent {
    pub text: String,
    pub saved_text: String,
    pub document: Option<DocumentMetadata>,
    pub selection: Option<SourceSelection>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CheckpointRequest {
    pub id: String,
    pub lease: String,
    pub expected_version: u64,
    pub sequence: u64,
    #[serde(flatten)]
    pub content: DraftContent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverySession {
    pub id: String,
    pub lease: String,
    pub version: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointReceipt {
    pub id: String,
    pub version: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSummary {
    pub id: String,
    pub version: u64,
    pub updated_at: u64,
    pub text_bytes: usize,
    pub document: Option<DocumentMetadata>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryDraft {
    pub id: String,
    pub version: u64,
    pub sequence: u64,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(flatten)]
    pub content: DraftContent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryIssue {
    pub file: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryListing {
    pub drafts: Vec<DraftSummary>,
    pub saved_copies: Vec<DraftSummary>,
    pub issues: Vec<RecoveryIssue>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Record {
    pub id: String,
    pub version: u64,
    pub sequence: u64,
    pub created_at: u64,
    pub updated_at: u64,
    /// None is a durable deletion marker, protecting interrupted consumption.
    pub content: Option<DraftContent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback: Option<FallbackIdentity>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Envelope {
    pub schema_version: u32,
    pub checksum: String,
    pub record: Record,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct FallbackIdentity {
    pub id: String,
    pub version: u64,
    pub checksum: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FallbackReceipt {
    pub id: String,
    pub version: u64,
    pub updated_at: u64,
    pub available: bool,
}
