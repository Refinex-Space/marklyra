//! Inspection-scoped rename of existing entries. Filesystem receipts describe
//! only this domain; host document/mount retargeting must confirm independently.
use crate::{
    checked_relative,
    fs_mutation::{
        check_entity, check_name, check_parent, check_token, is_link, open_entity, rename_exclusive,
    },
    join_relative, EntryKind, IndexError, Workspace,
};
use cap_std::fs::{Dir, File};
use serde::Serialize;
use std::{
    collections::HashMap,
    io,
    path::{Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

const MAX_INSPECTIONS: usize = 128;
const MAX_OPERATIONS: usize = 256;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InspectedWorkspaceEntry {
    pub entry_token: String,
    pub name: String,
    pub relative_path: String,
    pub kind: EntryKind,
    pub size: Option<u64>,
}

pub(super) struct Pending {
    pub(super) entry: InspectedWorkspaceEntry,
    pub(super) parent: String,
    pub(super) directory: Arc<Dir>,
    pub(super) source: Arc<File>,
    pub(super) identity: Arc<same_file::Handle>,
}

pub(super) struct EntryStore {
    pub(super) owner: Uuid,
    pub(super) pending: HashMap<String, Pending>,
    operations: HashMap<String, Operation>,
}
impl Default for EntryStore {
    fn default() -> Self {
        Self {
            owner: Uuid::new_v4(),
            pending: HashMap::new(),
            operations: HashMap::new(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryRenameReceipt {
    pub operation_id: String,
    pub entry_token: String,
    pub old_relative_path: String,
    pub name: String,
    pub relative_path: String,
    pub kind: EntryKind,
    pub size: Option<u64>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum EntryRenameResolution {
    Prepared,
    Committed { receipt: EntryRenameReceipt },
    Rejected { message: String },
    MutationUncertain,
}

#[derive(PartialEq, Eq)]
struct Request {
    token: String,
    name: String,
}
struct Operation {
    request: Request,
    resolution: EntryRenameResolution,
}

pub enum EntryRenamePreparation {
    Ready(EntryRenamePlan),
    Completed(EntryRenameReceipt),
}

pub struct EntryRenamePlan {
    owner: Uuid,
    operation_id: String,
    token: String,
    parent: String,
    root_revision: u64,
    directory: Arc<Dir>,
    source: Arc<File>,
    identity: Arc<same_file::Handle>,
    old_name: PathBuf,
    new_name: PathBuf,
    old_display_path: PathBuf,
    new_display_path: PathBuf,
    kind: EntryKind,
    update_mtime: bool,
}
impl EntryRenamePlan {
    /// File-operation Undo is a plain inverse move in the original host. It
    /// must preserve the file's current modification time instead of applying
    /// Rename's separate timestamp side effect. Not a renderer option.
    pub fn preserve_modified_time(&mut self) {
        self.update_mtime = false;
    }
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
    pub fn operation_id(&self) -> &str {
        &self.operation_id
    }
}

impl Workspace {
    pub fn inspect_entry(&self, relative: &str) -> Result<InspectedWorkspaceEntry, IndexError> {
        let path = checked_relative(relative, false)?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(IndexError::InvalidPath)?;
        check_name(name)?;
        let parent = path
            .parent()
            .and_then(|parent| parent.to_str())
            .ok_or(IndexError::InvalidPath)?;
        let (root, _) = self.display_root_binding()?;
        self.reject_symlinks(&path)?;
        let directory = Arc::new(self.root.open_dir(if parent.is_empty() {
            Path::new(".")
        } else {
            Path::new(parent)
        })?);
        check_parent(self, parent, &directory)?;
        let metadata = directory.symlink_metadata(name)?;
        if is_link(&metadata) {
            return Err(IndexError::InvalidPath);
        }
        let kind = if metadata.is_file() {
            EntryKind::File
        } else if metadata.is_dir() {
            EntryKind::Directory
        } else {
            return Err(IndexError::InvalidPath);
        };
        let source = Arc::new(open_entity(&directory, Path::new(name), kind)?);
        let identity = Arc::new(same_file::Handle::from_file(
            source.try_clone()?.into_std(),
        )?);
        // Never turn a still-live creation capability into a generic one. Do
        // not nest creation/entry locks; the native host serializes mutations.
        if self
            .creations
            .lock()
            .map_err(|_| unavailable())?
            .pending
            .values()
            .any(|pending| pending.identity.as_ref() == identity.as_ref())
        {
            return Err(invalid("新建条目仍在命名，请使用其创建令牌或先结束该操作"));
        }
        let mut state = self.entries.lock().map_err(|_| unavailable())?;
        if state.pending.len() >= MAX_INSPECTIONS {
            return Err(limit("条目检查已达上限，请结束不需要的命名操作"));
        }
        check_entity(&directory, Path::new(name), kind, &identity)?;
        check_parent(self, parent, &directory)?;
        if self.display_root_snapshot()? != root {
            return Err(stale());
        }
        let entry = InspectedWorkspaceEntry {
            entry_token: Uuid::new_v4().to_string(),
            name: name.to_owned(),
            relative_path: relative.to_owned(),
            kind,
            size: (kind == EntryKind::File).then_some(metadata.len()),
        };
        state.pending.insert(
            entry.entry_token.clone(),
            Pending {
                entry: entry.clone(),
                parent: parent.to_owned(),
                directory,
                source,
                identity,
            },
        );
        Ok(entry)
    }

    pub fn prepare_entry_rename(
        &self,
        operation_id: &str,
        entry_token: &str,
        new_name: &str,
    ) -> Result<EntryRenamePreparation, IndexError> {
        check_token(operation_id)?;
        if let Err(error) = check_token(entry_token).and_then(|()| check_name(new_name)) {
            let mut state = self.entries.lock().map_err(|_| unavailable())?;
            if !state.operations.contains_key(operation_id)
                && state.operations.len() < MAX_OPERATIONS
            {
                // No valid request can ever reuse a validation-rejected UUID.
                // Do not retain an unbounded malformed name/token payload.
                state.operations.insert(
                    operation_id.to_owned(),
                    Operation {
                        request: Request {
                            token: String::new(),
                            name: String::new(),
                        },
                        resolution: EntryRenameResolution::Rejected {
                            message: error.to_string(),
                        },
                    },
                );
            }
            return Err(error);
        }
        let (root, root_revision) = self.display_root_binding()?;
        let mut state = self.entries.lock().map_err(|_| unavailable())?;
        let request = Request {
            token: entry_token.to_owned(),
            name: new_name.to_owned(),
        };
        if let Some(operation) = state.operations.get(operation_id) {
            if operation.request != request {
                return Err(invalid("命名操作标识已用于不同参数"));
            }
            match &operation.resolution {
                EntryRenameResolution::Committed { receipt } => {
                    return Ok(EntryRenamePreparation::Completed(receipt.clone()))
                }
                EntryRenameResolution::MutationUncertain => {
                    return Err(IndexError::MutationUncertain)
                }
                EntryRenameResolution::Rejected { message } => return Err(invalid(message)),
                EntryRenameResolution::Prepared => {}
            }
        } else if state.operations.len() >= MAX_OPERATIONS {
            return Err(limit("命名回执已达工作区上限，请重新选择目录"));
        }
        state
            .operations
            .entry(operation_id.to_owned())
            .or_insert(Operation {
                request,
                resolution: EntryRenameResolution::Prepared,
            });
        let prepared: Result<EntryRenamePlan, IndexError> = (|| {
            let pending = state.pending.get(entry_token).ok_or_else(expired)?;
            check_parent(self, &pending.parent, &pending.directory)?;
            check_entity(
                &pending.directory,
                Path::new(&pending.entry.name),
                pending.entry.kind,
                &pending.identity,
            )?;
            Ok(EntryRenamePlan {
                owner: state.owner,
                operation_id: operation_id.to_owned(),
                token: entry_token.to_owned(),
                parent: pending.parent.clone(),
                root_revision,
                directory: Arc::clone(&pending.directory),
                source: Arc::clone(&pending.source),
                identity: Arc::clone(&pending.identity),
                old_name: PathBuf::from(&pending.entry.name),
                new_name: PathBuf::from(new_name),
                old_display_path: root.join(&pending.entry.relative_path),
                new_display_path: root.join(&pending.parent).join(new_name),
                kind: pending.entry.kind,
                update_mtime: true,
            })
        })();
        match prepared {
            Ok(plan) => Ok(EntryRenamePreparation::Ready(plan)),
            Err(error) => {
                set_resolution(
                    &mut state,
                    operation_id,
                    EntryRenameResolution::Rejected {
                        message: error.to_string(),
                    },
                );
                Err(error)
            }
        }
    }

    pub fn resolve_entry_rename(
        &self,
        operation_id: &str,
    ) -> Result<Option<EntryRenameResolution>, IndexError> {
        check_token(operation_id)?;
        Ok(self
            .entries
            .lock()
            .map_err(|_| unavailable())?
            .operations
            .get(operation_id)
            .map(|operation| operation.resolution.clone()))
    }

    /// Native host outcome reconciliation only; never an IPC path grant.
    pub fn record_entry_rename_warnings(
        &self,
        operation_id: &str,
        warnings: &[String],
    ) -> Result<(), IndexError> {
        check_token(operation_id)?;
        let mut state = self.entries.lock().map_err(|_| unavailable())?;
        let operation = state.operations.get_mut(operation_id).ok_or_else(expired)?;
        let EntryRenameResolution::Committed { receipt } = &mut operation.resolution else {
            return Err(invalid("只有已确认的命名操作可以记录宿主警告"));
        };
        for warning in warnings {
            if receipt.warnings.len() >= 32 {
                break;
            }
            let warning = warning[..warning.floor_char_boundary(1024)].to_owned();
            if !warning.is_empty() && !receipt.warnings.contains(&warning) {
                receipt.warnings.push(warning);
            }
        }
        Ok(())
    }

    /// Filesystem commit can precede failed host document/mount handoff. Latch
    /// that host uncertainty so a lost-ACK query cannot reassert FS-only success.
    pub fn mark_entry_rename_uncertain(&self, operation_id: &str) -> Result<(), IndexError> {
        check_token(operation_id)?;
        let mut state = self.entries.lock().map_err(|_| unavailable())?;
        let operation = state.operations.get_mut(operation_id).ok_or_else(expired)?;
        if !matches!(
            operation.resolution,
            EntryRenameResolution::Committed { .. } | EntryRenameResolution::MutationUncertain
        ) {
            return Err(invalid("尚未提交的命名操作不能标记为宿主交接不确定"));
        }
        operation.resolution = EntryRenameResolution::MutationUncertain;
        Ok(())
    }

    pub fn finish_entry_inspection(&self, entry_token: &str) -> Result<(), IndexError> {
        check_token(entry_token)?;
        let mut state = self.entries.lock().map_err(|_| unavailable())?;
        state.pending.remove(entry_token);
        reject_other_prepared(&mut state, entry_token, None);
        Ok(())
    }

    pub fn commit_entry_rename(
        &self,
        plan: EntryRenamePlan,
    ) -> Result<EntryRenameReceipt, IndexError> {
        self.commit_entry_rename_inner(plan, || {})
    }

    fn commit_entry_rename_inner(
        &self,
        plan: EntryRenamePlan,
        after_commit: impl FnOnce(),
    ) -> Result<EntryRenameReceipt, IndexError> {
        let (root, revision) = self.display_root_binding()?;
        let mut state = self.entries.lock().map_err(|_| unavailable())?;
        if state.owner != plan.owner {
            return Err(expired());
        }
        let operation = state
            .operations
            .get(&plan.operation_id)
            .ok_or_else(expired)?;
        if operation.request.token != plan.token
            || Path::new(&operation.request.name) != plan.new_name
        {
            return Err(expired());
        }
        match &operation.resolution {
            EntryRenameResolution::Committed { receipt } => return Ok(receipt.clone()),
            EntryRenameResolution::MutationUncertain => return Err(IndexError::MutationUncertain),
            EntryRenameResolution::Rejected { message } => return Err(invalid(message)),
            EntryRenameResolution::Prepared => {}
        }
        let pending = state.pending.get(&plan.token).ok_or_else(expired)?;
        // A verified ancestor rebind changes the stored relative parent while
        // preserving its FD. Keep the operation prepared so a fresh plan can
        // bind the new location; never execute an already prepared old binding.
        if revision != plan.root_revision
            || pending.parent != plan.parent
            || root.join(&pending.entry.relative_path) != plan.old_display_path
            || root.join(&pending.parent).join(&plan.new_name) != plan.new_display_path
            || !Arc::ptr_eq(&pending.directory, &plan.directory)
            || !Arc::ptr_eq(&pending.source, &plan.source)
            || !Arc::ptr_eq(&pending.identity, &plan.identity)
            || Path::new(&pending.entry.name) != plan.old_name
            || pending.entry.kind != plan.kind
        {
            return Err(stale());
        }
        let preflight = check_parent(self, &plan.parent, &plan.directory).and_then(|()| {
            check_entity(&plan.directory, &plan.old_name, plan.kind, &plan.identity)
        });
        if let Err(error) = preflight {
            set_resolution(
                &mut state,
                &plan.operation_id,
                EntryRenameResolution::Rejected {
                    message: error.to_string(),
                },
            );
            return Err(error);
        }
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
                set_resolution(
                    &mut state,
                    &plan.operation_id,
                    EntryRenameResolution::Rejected {
                        message: document_service::describe_io(&error),
                    },
                );
                return Err(error.into());
            }
        }
        state.pending.remove(&plan.token);
        reject_other_prepared(&mut state, &plan.token, Some(&plan.operation_id));
        after_commit();
        let confirmed = check_entity(&plan.directory, &plan.new_name, plan.kind, &plan.identity)
            .and_then(|()| check_parent(self, &plan.parent, &plan.directory));
        if confirmed.is_err()
            || !self
                .display_root_binding()
                .is_ok_and(|binding| binding == (root, revision))
        {
            set_resolution(
                &mut state,
                &plan.operation_id,
                EntryRenameResolution::MutationUncertain,
            );
            return Err(IndexError::MutationUncertain);
        }
        let mut warnings = vec![];
        if plan.update_mtime && plan.old_name != plan.new_name {
            // Original macOS code attempts this extra metadata update and does
            // not undo a successful rename when it fails. Never reopen by path.
            if let Err(error) = plan
                .source
                .try_clone()
                .map(File::into_std)
                .and_then(|file| file.set_modified(std::time::SystemTime::now()))
            {
                warnings.push(format!("名称已更新，但修改时间未能更新：{error}"));
            }
        }
        let name = plan
            .new_name
            .to_str()
            .ok_or(IndexError::MutationUncertain)?
            .to_owned();
        let receipt = EntryRenameReceipt {
            operation_id: plan.operation_id.clone(),
            entry_token: plan.token,
            old_relative_path: join_relative(
                &plan.parent,
                plan.old_name
                    .to_str()
                    .ok_or(IndexError::MutationUncertain)?,
            ),
            relative_path: join_relative(&plan.parent, &name),
            name,
            kind: plan.kind,
            size,
            warnings,
        };
        set_resolution(
            &mut state,
            &plan.operation_id,
            EntryRenameResolution::Committed {
                receipt: receipt.clone(),
            },
        );
        Ok(receipt)
    }
}

fn set_resolution(state: &mut EntryStore, id: &str, resolution: EntryRenameResolution) {
    if let Some(operation) = state.operations.get_mut(id) {
        operation.resolution = resolution;
    }
}
fn reject_other_prepared(state: &mut EntryStore, token: &str, except: Option<&str>) {
    for (id, operation) in &mut state.operations {
        if operation.request.token == token
            && except != Some(id.as_str())
            && matches!(operation.resolution, EntryRenameResolution::Prepared)
        {
            operation.resolution = EntryRenameResolution::Rejected {
                message: "条目检查令牌已结束或由另一命名操作消费".into(),
            };
        }
    }
}
fn invalid(message: &str) -> IndexError {
    io::Error::new(io::ErrorKind::InvalidInput, message).into()
}
fn expired() -> IndexError {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        "条目检查令牌不属于此工作区或已结束",
    )
    .into()
}
fn stale() -> IndexError {
    io::Error::new(
        io::ErrorKind::WouldBlock,
        "条目位置已更新，请重新准备命名操作",
    )
    .into()
}
fn unavailable() -> IndexError {
    io::Error::other("条目命名状态不可用").into()
}
fn limit(message: &str) -> IndexError {
    io::Error::new(io::ErrorKind::WouldBlock, message).into()
}

#[cfg(test)]
mod tests;
