//! Wire types. Field names and shapes match `apps/desktop/src/services/git.ts` exactly.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ProxyMode {
    Auto,
    Direct,
    Custom,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitNetwork {
    pub proxy_mode: ProxyMode,
    pub proxy_url: String,
    pub proxy_ssh: bool,
    pub fallback_direct: bool,
    pub timeout_seconds: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct GitExecutable {
    pub path: String,
    pub version: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemote {
    pub name: String,
    pub fetch_url: String,
    pub push_url: String,
    pub protocol: String,
    pub host: Option<String>,
    pub has_embedded_credentials: bool,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RepositoryOperation {
    #[default]
    None,
    Merging,
    Rebasing,
    CherryPicking,
    Reverting,
    Bisecting,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct GitHead {
    pub branch: Option<String>,
    pub oid: Option<String>,
    pub detached: bool,
    pub unborn: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct GitIdentity {
    pub name: String,
    pub email: String,
    pub scope: &'static str,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepository {
    pub root: String,
    pub workspace_prefix: String,
    pub head: GitHead,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub operation: RepositoryOperation,
    pub remotes: Vec<GitRemote>,
    pub identity: GitIdentity,
}
#[derive(Clone, Debug, Serialize)]
pub struct GitProblem {
    pub code: &'static str,
    pub message: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct GitProbe {
    pub git: Option<GitExecutable>,
    pub problem: Option<GitProblem>,
    pub repository: Option<GitRepository>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ChangeKind {
    Modified,
    Added,
    Deleted,
    Renamed,
    Copied,
    Typechange,
    Untracked,
    Conflicted,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConflictKind {
    BothModified,
    BothAdded,
    BothDeleted,
    AddedByUs,
    AddedByThem,
    DeletedByUs,
    DeletedByThem,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    pub path: String,
    pub orig_path: Option<String>,
    pub kind: ChangeKind,
    pub index: String,
    pub worktree: String,
    pub conflict: Option<ConflictKind>,
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct GitStatus {
    pub head: GitHead,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub operation: RepositoryOperation,
    pub changes: Vec<GitChange>,
    pub truncated: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GitLocalBranch {
    pub name: String,
    pub oid: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub gone: bool,
    pub current: bool,
    pub subject: String,
    pub time: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteBranch {
    pub remote: String,
    pub name: String,
    pub full_name: String,
    pub oid: String,
    pub subject: String,
    pub time: i64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GitTag {
    pub name: String,
    pub oid: String,
    pub time: i64,
}
#[derive(Clone, Debug, Default, Serialize)]
pub struct GitBranches {
    pub current: Option<String>,
    pub local: Vec<GitLocalBranch>,
    pub remote: Vec<GitRemoteBranch>,
    pub tags: Vec<GitTag>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum RefKind {
    Head,
    Local,
    Remote,
    Tag,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GitRef {
    pub kind: RefKind,
    pub name: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub oid: String,
    pub parents: Vec<String>,
    pub subject: String,
    pub body: String,
    pub author_name: String,
    pub author_email: String,
    pub author_time: i64,
    pub committer_name: String,
    pub commit_time: i64,
    pub refs: Vec<GitRef>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitLogQuery {
    pub revisions: Vec<String>,
    pub skip: f64,
    pub limit: f64,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub since: Option<f64>,
    #[serde(default)]
    pub until: Option<f64>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub first_parent: Option<bool>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogPage {
    pub commits: Vec<GitCommit>,
    pub has_more: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileChange {
    pub path: String,
    pub orig_path: Option<String>,
    pub status: String,
    pub additions: u64,
    pub deletions: u64,
    pub binary: bool,
}
#[derive(Clone, Debug, Serialize)]
pub struct GitCommitDetails {
    pub commit: GitCommit,
    pub files: Vec<GitFileChange>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitFileSpec {
    pub rev: String,
    pub path: String,
}
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileText {
    pub text: Option<String>,
    pub binary: bool,
    pub too_large: bool,
    pub bom: bool,
    pub crlf: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PullMethod {
    Merge,
    Rebase,
    FfOnly,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ConflictStrategy {
    Manual,
    Local,
    Remote,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitUpdateOptions {
    pub method: PullMethod,
    pub autostash: bool,
    pub conflict_strategy: ConflictStrategy,
    pub prune: bool,
    pub network: GitNetwork,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UpdateOutcome {
    UpToDate,
    Updated,
    Conflicts,
    NoUpstream,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitUpdateResult {
    pub outcome: UpdateOutcome,
    pub changed: u32,
    pub conflicts: Vec<String>,
    pub before: Option<String>,
    pub after: Option<String>,
    pub proxy: Option<String>,
    pub stash_kept: bool,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ForceMode {
    None,
    WithLease,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitPushOptions {
    pub remote: String,
    pub branch: String,
    pub remote_branch: String,
    pub set_upstream: bool,
    pub force: ForceMode,
    pub tags: bool,
    pub network: GitNetwork,
}
#[derive(Clone, Debug, Serialize)]
pub struct GitPushResult {
    pub pushed: u32,
    pub rejected: bool,
    pub proxy: Option<String>,
    pub message: String,
}
/// `GitUpdateOptions` plus the sync fields (spelled out: `deny_unknown_fields` cannot flatten).
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitSyncOptions {
    pub method: PullMethod,
    pub autostash: bool,
    pub conflict_strategy: ConflictStrategy,
    pub prune: bool,
    pub network: GitNetwork,
    pub commit_message: Option<String>,
    pub push: bool,
}
impl GitSyncOptions {
    pub fn update(&self) -> GitUpdateOptions {
        GitUpdateOptions {
            method: self.method,
            autostash: self.autostash,
            conflict_strategy: self.conflict_strategy,
            prune: self.prune,
            network: self.network.clone(),
        }
    }
}
#[derive(Clone, Debug, Serialize)]
pub struct GitSyncResult {
    pub committed: Option<String>,
    pub update: Option<GitUpdateResult>,
    pub pushed: u32,
    pub idle: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GitConflict {
    pub path: String,
    pub kind: ConflictKind,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitConflicts {
    pub operation: RepositoryOperation,
    pub yours_stage: u8,
    pub yours_label: String,
    pub theirs_label: String,
    pub files: Vec<GitConflict>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum GitResolution {
    Yours,
    Theirs,
    Delete,
    Content { text: String, bom: bool, crlf: bool },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct GitStash {
    pub index: u32,
    pub message: String,
    pub oid: String,
    pub time: i64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRemoteTest {
    pub ok: bool,
    pub default_branch: Option<String>,
    pub branches: u32,
    pub elapsed_ms: u64,
    pub proxy: Option<String>,
    pub message: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProxyReport {
    pub environment: Option<String>,
    pub system: Option<String>,
    pub git_config: Option<String>,
    pub effective: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitCredential {
    pub host: String,
    pub username: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitProgress {
    pub workspace_id: String,
    pub operation: String,
    pub phase: String,
    pub percent: Option<u8>,
}
#[derive(Clone, Debug, Serialize)]
pub struct GitCommitted {
    pub oid: String,
}
#[derive(Clone, Debug, Serialize)]
pub struct GitProxyUsed {
    pub proxy: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum CheckoutKind {
    Local,
    Remote,
    Revision,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum OperationAction {
    Continue,
    Abort,
    Skip,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum ResetMode {
    Soft,
    Mixed,
    Hard,
}
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum IdentityScope {
    Repository,
    Global,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn wire_shapes_match_the_client_contract() {
        let resolution: GitResolution =
            serde_json::from_str(r#"{"kind":"content","text":"a","bom":false,"crlf":true}"#)
                .unwrap();
        assert!(matches!(
            resolution,
            GitResolution::Content { crlf: true, .. }
        ));
        assert!(matches!(
            serde_json::from_str::<GitResolution>(r#"{"kind":"yours"}"#).unwrap(),
            GitResolution::Yours
        ));
        assert!(serde_json::from_str::<GitResolution>(r#"{"kind":"other"}"#).is_err());
        let options: GitSyncOptions = serde_json::from_str(
            r#"{"method":"ff-only","autostash":true,"conflictStrategy":"manual","prune":false,
            "network":{"proxyMode":"auto","proxyUrl":"","proxySsh":false,"fallbackDirect":true,"timeoutSeconds":120},
            "commitMessage":null,"push":true}"#,
        )
        .unwrap();
        assert_eq!(options.method, PullMethod::FfOnly);
        assert!(serde_json::from_str::<GitNetwork>(
            r#"{"proxyMode":"auto","proxyUrl":"","proxySsh":false,"fallbackDirect":true,"timeoutSeconds":1,"extra":1}"#
        )
        .is_err());
        let query: GitLogQuery =
            serde_json::from_str(r#"{"revisions":[],"skip":0,"limit":50}"#).unwrap();
        assert!(query.text.is_none() && query.first_parent.is_none());
        let value = serde_json::to_value(GitUpdateResult {
            outcome: UpdateOutcome::UpToDate,
            changed: 0,
            conflicts: vec![],
            before: None,
            after: None,
            proxy: None,
            stash_kept: false,
        })
        .unwrap();
        assert_eq!(value["outcome"], "up-to-date");
        assert!(value.get("stashKept").is_some());
        let value = serde_json::to_value(RepositoryOperation::CherryPicking).unwrap();
        assert_eq!(value, "cherry-picking");
        let value = serde_json::to_value(GitChange {
            path: "a".into(),
            orig_path: None,
            kind: ChangeKind::Typechange,
            index: ".".into(),
            worktree: "T".into(),
            conflict: Some(ConflictKind::DeletedByThem),
        })
        .unwrap();
        assert_eq!(value["kind"], "typechange");
        assert_eq!(value["conflict"], "deleted-by-them");
        assert!(value.get("origPath").is_some());
    }
}
