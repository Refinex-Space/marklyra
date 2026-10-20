//! Creation-scoped capabilities. An inline rename can only consume a newly
//! created entity's live token; an existing filesystem name is never a grant.
use crate::{
    checked_relative,
    fs_mutation::{
        check_entity, check_name, check_token, directory_identity, is_link, open_entity,
        rename_exclusive,
    },
    is_markdown, join_relative, EntryKind, IndexError, Workspace,
};
use cap_std::fs::{Dir, File, OpenOptions};
use serde::Serialize;
use std::{
    collections::HashMap,
    io,
    path::{Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

const MAX_PENDING: usize = 128;
const MAX_RECEIPTS: usize = 256;
const MAX_NAME_ATTEMPTS: usize = 256;
const MAX_UNTITLED_NUMBER: u64 = 1_000_000_000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedWorkspaceEntry {
    pub entry_token: String,
    pub name: String,
    pub relative_path: String,
    pub kind: EntryKind,
    pub size: Option<u64>,
}

#[derive(Clone, PartialEq, Eq)]
struct Request {
    parent: String,
    kind: EntryKind,
    extension: String,
}

struct Receipt {
    request: Request,
    // None reserves a request that may have reached the filesystem. A failed
    // post-check must never let a retry create a second entity under a new name.
    created: Option<CreatedWorkspaceEntry>,
    mutated: bool,
}

pub(super) struct Pending {
    pub(super) entry: CreatedWorkspaceEntry,
    pub(super) parent: String,
    pub(super) directory: Arc<Dir>,
    pub(super) source: Arc<File>,
    pub(super) identity: Arc<same_file::Handle>,
}

pub(crate) struct CreationStore {
    owner: Uuid,
    pub(super) pending: HashMap<String, Pending>,
    receipts: HashMap<String, Receipt>,
}
impl Default for CreationStore {
    fn default() -> Self {
        Self {
            owner: Uuid::new_v4(),
            pending: HashMap::new(),
            receipts: HashMap::new(),
        }
    }
}

/// Host-only plan, bound to this exact workspace, parent and opened entity.
/// The host must serialize its document/session retargeting with commit using
/// its shared write gate. Preparing alone performs no filesystem mutation.
pub struct CreationRenamePlan {
    owner: Uuid,
    root_revision: u64,
    token: String,
    parent: String,
    directory: Arc<Dir>,
    source: Arc<File>,
    identity: Arc<same_file::Handle>,
    old_name: PathBuf,
    new_name: PathBuf,
    old_display_path: PathBuf,
    new_display_path: PathBuf,
    kind: EntryKind,
}
impl CreationRenamePlan {
    pub fn directory(&self) -> Arc<Dir> {
        Arc::clone(&self.directory)
    }
    pub fn source_identity(&self) -> Arc<same_file::Handle> {
        Arc::clone(&self.identity)
    }
    pub fn old_name(&self) -> &Path {
        &self.old_name
    }
    pub fn new_name(&self) -> &Path {
        &self.new_name
    }
    pub fn old_display_path(&self) -> &Path {
        &self.old_display_path
    }
    pub fn new_display_path(&self) -> &Path {
        &self.new_display_path
    }
    pub fn kind(&self) -> EntryKind {
        self.kind
    }
    pub fn entry_token(&self) -> &str {
        &self.token
    }
}

impl Workspace {
    /// Host-only idempotency lookup. Replaying an old request must not clear a
    /// newer file-operation Undo slot. This grants no filesystem capability.
    pub fn creation_operation_known(&self, operation_id: &str) -> Result<bool, IndexError> {
        check_token(operation_id)?;
        let state = self.creations.lock().map_err(|_| unavailable())?;
        Ok(state.receipts.contains_key(operation_id))
    }

    /// Repeating a canonical operation UUID with the same original parameters
    /// returns the original receipt without creating or reauthorizing anything.
    /// Receipts are not evicted: reaching the bounded horizon fails closed.
    pub fn create_untitled(
        &self,
        operation_id: &str,
        parent_relative: &str,
        kind: EntryKind,
        default_extension: &str,
    ) -> Result<CreatedWorkspaceEntry, IndexError> {
        self.create_untitled_with_hook(
            operation_id,
            parent_relative,
            kind,
            default_extension,
            || {},
        )
    }

    fn create_untitled_with_hook(
        &self,
        operation_id: &str,
        parent_relative: &str,
        kind: EntryKind,
        default_extension: &str,
        after_create: impl FnOnce(),
    ) -> Result<CreatedWorkspaceEntry, IndexError> {
        check_token(operation_id)?;
        checked_relative(parent_relative, true)?;
        if !valid_extension(default_extension) {
            return Err(invalid("默认文件扩展名无效"));
        }
        let request = Request {
            parent: parent_relative.to_owned(),
            kind,
            extension: default_extension.to_owned(),
        };
        let mut state = self.creations.lock().map_err(|_| unavailable())?;
        if let Some(receipt) = state.receipts.get(operation_id) {
            return if receipt.request == request {
                receipt.created.clone().ok_or_else(|| {
                    if receipt.mutated {
                        IndexError::MutationUncertain
                    } else {
                        io::Error::other("此前创建操作未确认完成，请刷新核对；未重复创建").into()
                    }
                })
            } else {
                Err(invalid("创建请求标识已用于不同参数"))
            };
        }
        if state.pending.len() >= MAX_PENDING || state.receipts.len() >= MAX_RECEIPTS {
            return Err(limit(
                "创建操作已达当前工作区上限，请完成操作或重新选择目录",
            ));
        }
        self.check_creation_root()?;
        let parent = checked_relative(parent_relative, true)?;
        self.reject_symlinks(&parent)?;
        self.reject_creation_links(&parent)?;
        let directory = Arc::new(self.root.open_dir(&parent)?);
        self.check_creation_parent(parent_relative, &directory)?;
        let extension = if default_extension.is_empty() {
            "md"
        } else {
            default_extension
        };
        let mut number = next_number(&directory, kind, extension)?;
        state.receipts.insert(
            operation_id.to_owned(),
            Receipt {
                request,
                created: None,
                mutated: false,
            },
        );
        for _ in 0..MAX_NAME_ATTEMPTS {
            let name = untitled_name(kind, extension, number);
            check_name(&name)?;
            self.check_creation_parent(parent_relative, &directory)?;
            let source = match create_entity(&directory, &name, kind) {
                Ok(source) => source,
                Err(IndexError::Io(error)) if error.kind() == io::ErrorKind::AlreadyExists => {
                    number = next_candidate(number)?;
                    continue;
                }
                Err(IndexError::MutationUncertain) => {
                    state
                        .receipts
                        .get_mut(operation_id)
                        .ok_or(IndexError::MutationUncertain)?
                        .mutated = true;
                    return Err(IndexError::MutationUncertain);
                }
                Err(error) => return Err(error),
            };
            state
                .receipts
                .get_mut(operation_id)
                .ok_or(IndexError::MutationUncertain)?
                .mutated = true;
            let identity = Arc::new(
                source
                    .try_clone()
                    .and_then(|file| same_file::Handle::from_file(file.into_std()))
                    .map_err(|_| IndexError::MutationUncertain)?,
            );
            after_create();
            check_entity(&directory, Path::new(&name), kind, &identity)
                .and_then(|()| self.check_creation_parent(parent_relative, &directory))
                .map_err(|_| IndexError::MutationUncertain)?;
            let created = CreatedWorkspaceEntry {
                entry_token: operation_id.to_owned(),
                relative_path: join_relative(parent_relative, &name),
                name,
                kind,
                size: (kind == EntryKind::File).then_some(0),
            };
            state.pending.insert(
                operation_id.to_owned(),
                Pending {
                    entry: created.clone(),
                    parent: parent_relative.to_owned(),
                    directory,
                    source: Arc::new(source),
                    identity,
                },
            );
            state
                .receipts
                .get_mut(operation_id)
                .ok_or(IndexError::MutationUncertain)?
                .created = Some(created.clone());
            return Ok(created);
        }
        Err(limit("目录持续变化，无法安全选择未命名文件名称"))
    }

    pub fn prepare_creation_rename(
        &self,
        token: &str,
        new_name: &str,
    ) -> Result<CreationRenamePlan, IndexError> {
        check_token(token)?;
        check_name(new_name)?;
        let (root, root_revision) = self.display_root_binding()?;
        let state = self.creations.lock().map_err(|_| unavailable())?;
        let pending = state.pending.get(token).ok_or_else(expired)?;
        self.check_creation_parent(&pending.parent, &pending.directory)?;
        check_entity(
            &pending.directory,
            Path::new(&pending.entry.name),
            pending.entry.kind,
            &pending.identity,
        )?;
        Ok(CreationRenamePlan {
            owner: state.owner,
            root_revision,
            token: token.to_owned(),
            parent: pending.parent.clone(),
            directory: Arc::clone(&pending.directory),
            source: Arc::clone(&pending.source),
            identity: Arc::clone(&pending.identity),
            old_name: PathBuf::from(&pending.entry.name),
            new_name: PathBuf::from(new_name),
            old_display_path: root.join(&pending.entry.relative_path),
            new_display_path: root.join(&pending.parent).join(new_name),
            kind: pending.entry.kind,
        })
    }

    /// No-replace is atomic at the OS destination boundary. Darwin does not
    /// provide expected-source-inode CAS; a hostile external replacement in the
    /// final check/syscall gap is detected afterwards, never silently repaired.
    /// Success consumes this creation's rename authority exactly once.
    pub fn commit_creation_rename(
        &self,
        plan: CreationRenamePlan,
    ) -> Result<CreatedWorkspaceEntry, IndexError> {
        self.commit_creation_rename_inner(plan, || {})
    }

    #[cfg(test)]
    fn commit_with_postcommit_hook(
        &self,
        plan: CreationRenamePlan,
        after_commit: impl FnOnce(),
    ) -> Result<CreatedWorkspaceEntry, IndexError> {
        self.commit_creation_rename_inner(plan, after_commit)
    }

    fn commit_creation_rename_inner(
        &self,
        plan: CreationRenamePlan,
        after_commit: impl FnOnce(),
    ) -> Result<CreatedWorkspaceEntry, IndexError> {
        let (root, root_revision) = self.display_root_binding()?;
        let mut state = self.creations.lock().map_err(|_| unavailable())?;
        if state.owner != plan.owner {
            return Err(expired());
        }
        let pending = state.pending.get(&plan.token).ok_or_else(expired)?;
        if root_revision != plan.root_revision
            || root.join(&pending.entry.relative_path) != plan.old_display_path
            || root.join(&pending.parent).join(&plan.new_name) != plan.new_display_path
        {
            return Err(io::Error::new(
                io::ErrorKind::WouldBlock,
                "新建条目位置已更新，请重新准备命名操作",
            )
            .into());
        }
        if !Arc::ptr_eq(&pending.directory, &plan.directory)
            || !Arc::ptr_eq(&pending.source, &plan.source)
            || !Arc::ptr_eq(&pending.identity, &plan.identity)
            || Path::new(&pending.entry.name) != plan.old_name
            || pending.parent != plan.parent
            || pending.entry.kind != plan.kind
        {
            return Err(expired());
        }
        self.check_creation_parent(&plan.parent, &plan.directory)?;
        check_entity(&plan.directory, &plan.old_name, plan.kind, &plan.identity)?;
        let size = (plan.kind == EntryKind::File)
            .then(|| plan.source.metadata().map(|metadata| metadata.len()))
            .transpose()?;
        if plan.old_name != plan.new_name {
            if let Err(error) = rename_exclusive(
                &plan.directory,
                &plan.source,
                &plan.old_name,
                &plan.new_name,
            ) {
                if crate::fs_mutation::rename_was_committed(&error) {
                    state.pending.remove(&plan.token);
                    return Err(IndexError::MutationUncertain);
                }
                return Err(error.into());
            }
        }
        // Once the syscall succeeded the token must never authorize a second
        // move, including a failed post-check. Do not delete or overwrite paths
        // in an attempted rollback after an external race.
        state.pending.remove(&plan.token);
        after_commit();
        if check_entity(&plan.directory, &plan.new_name, plan.kind, &plan.identity).is_err()
            || self
                .check_creation_parent(&plan.parent, &plan.directory)
                .is_err()
            || !self
                .display_root_binding()
                .is_ok_and(|binding| binding == (root, root_revision))
        {
            return Err(IndexError::MutationUncertain);
        }
        let name = plan
            .new_name
            .to_str()
            .ok_or(IndexError::MutationUncertain)?;
        Ok(CreatedWorkspaceEntry {
            entry_token: plan.token,
            name: name.to_owned(),
            relative_path: join_relative(&plan.parent, name),
            kind: plan.kind,
            size,
        })
    }

    /// Escape/cancel only releases the capability. The real created entity stays.
    pub fn finish_creation(&self, token: &str) -> Result<(), IndexError> {
        check_token(token)?;
        let mut state = self.creations.lock().map_err(|_| unavailable())?;
        if !state.receipts.contains_key(token) {
            return Err(expired());
        }
        state.pending.remove(token);
        Ok(())
    }

    fn check_creation_root(&self) -> Result<(), IndexError> {
        // An old display path is not authority for a replacement directory.
        document_service::DirectoryBookmark::capture(&self.root, &self.display_root_snapshot()?)?;
        Ok(())
    }

    fn check_creation_parent(&self, relative: &str, expected: &Dir) -> Result<(), IndexError> {
        self.check_creation_root()?;
        let path = checked_relative(relative, true)?;
        self.reject_symlinks(&path)?;
        self.reject_creation_links(&path)?;
        let current = self.root.open_dir(&path)?;
        if directory_identity(&current)? != directory_identity(expected)? {
            return Err(changed());
        }
        Ok(())
    }

    fn reject_creation_links(&self, path: &Path) -> Result<(), IndexError> {
        if path == Path::new(".") {
            return Ok(());
        }
        let mut prefix = PathBuf::new();
        for part in path.components() {
            prefix.push(part);
            if is_link(&self.root.symlink_metadata(&prefix)?) {
                return Err(IndexError::InvalidPath);
            }
        }
        Ok(())
    }
}

fn create_entity(directory: &Dir, name: &str, kind: EntryKind) -> Result<File, IndexError> {
    if kind == EntryKind::Directory {
        directory.create_dir(name)?;
        // mkdir succeeded. A subsequent handle failure must not be reported as
        // an ordinary uncommitted IO failure or authorize another create retry.
        return open_entity(directory, Path::new(name), kind)
            .map_err(|_| IndexError::MutationUncertain);
    }
    let mut options = OpenOptions::new();
    options.read(true).write(true).create_new(true);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    #[cfg(windows)]
    {
        use cap_std::fs::OpenOptionsExt;
        crate::fs_mutation::configure_source(&mut options);
        // The explicit access mask replaces read/write: add FILE_READ_DATA, FILE_WRITE_DATA and
        // FILE_APPEND_DATA so the created file can be filled (duplicates write through this handle).
        options.access_mode(crate::fs_mutation::retained_access() | 0x7);
    }
    Ok(directory.open_with(name, &options)?)
}

fn next_number(directory: &Dir, kind: EntryKind, extension: &str) -> Result<u64, IndexError> {
    let mut next = 0;
    for (index, entry) in directory.entries()?.enumerate() {
        if index >= crate::MAX_DIRECTORY_ENTRIES {
            return Err(limit("目录条目超限，无法完整确定未命名文件名称"));
        }
        let entry = entry?;
        let file_type = entry.file_type()?;
        if file_type.is_symlink()
            || (kind == EntryKind::Directory && !file_type.is_dir())
            || (kind == EntryKind::File && !file_type.is_file())
        {
            continue;
        }
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if kind == EntryKind::File && !is_markdown(Path::new(name), Some(extension)) {
            continue;
        }
        if let Some(number) = untitled_number(name, kind)? {
            next = next.max(next_candidate(number)?);
        }
    }
    Ok(next)
}

fn untitled_number(name: &str, kind: EntryKind) -> Result<Option<u64>, IndexError> {
    let lower = name.to_ascii_lowercase();
    let rest = if kind == EntryKind::Directory {
        lower.strip_prefix("untitled folder")
    } else {
        lower.strip_prefix("untitled")
    };
    let Some(rest) = rest else {
        return Ok(None);
    };
    let number = if kind == EntryKind::File {
        let Some((number, _)) = rest.split_once('.') else {
            return Ok(None);
        };
        number
    } else {
        rest
    };
    if number.is_empty() {
        return Ok(Some(0));
    }
    let Some(number) = number.strip_prefix(' ') else {
        return Ok(None);
    };
    if number.is_empty() || !number.bytes().all(|byte| byte.is_ascii_digit()) {
        return Ok(None);
    }
    let number = number
        .parse::<u64>()
        .map_err(|_| limit("未命名文件编号超限"))?;
    if number > MAX_UNTITLED_NUMBER {
        return Err(limit("未命名文件编号超限"));
    }
    Ok(Some(number))
}

fn next_candidate(number: u64) -> Result<u64, IndexError> {
    number
        .checked_add(1)
        .filter(|value| *value <= MAX_UNTITLED_NUMBER)
        .ok_or_else(|| limit("未命名文件编号超限"))
}

fn untitled_name(kind: EntryKind, extension: &str, number: u64) -> String {
    let base = if kind == EntryKind::Directory {
        "Untitled Folder"
    } else {
        "Untitled"
    };
    let number = if number == 0 {
        String::new()
    } else {
        format!(" {number}")
    };
    let suffix = if kind == EntryKind::File {
        format!(".{extension}")
    } else {
        String::new()
    };
    format!("{base}{number}{suffix}")
}

fn valid_extension(value: &str) -> bool {
    value.len() <= 128
        && (value.is_empty()
            || value.split('.').all(|part| {
                !part.is_empty()
                    && part
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            }))
}

fn invalid(message: &str) -> IndexError {
    io::Error::new(io::ErrorKind::InvalidInput, message).into()
}
fn limit(message: &str) -> IndexError {
    io::Error::new(io::ErrorKind::WouldBlock, message).into()
}
fn changed() -> IndexError {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        "创建的实体或父目录已被替换",
    )
    .into()
}
fn expired() -> IndexError {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        "创建重命名令牌已完成、取消或不属于此工作区",
    )
    .into()
}
fn unavailable() -> IndexError {
    io::Error::other("创建操作状态不可用").into()
}

#[cfg(test)]
mod tests;
