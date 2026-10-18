//! Process-wide single-slot file history. This never touches Markdown history.
use cap_std::fs::Dir;
use document_service::{DocumentAuthorities, FileLocationLease};
use file_index::EntryKind;
use serde::Serialize;
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

const MAX_RECEIPTS: usize = 4096;

pub(super) struct PreparedRenameUndo {
    parent: Arc<Dir>,
    old: PathBuf,
    new: PathBuf,
    entity: UndoEntity,
}

enum UndoEntity {
    File(FileLocationLease),
    Directory(Arc<same_file::Handle>),
}

pub(super) struct RenameUndo {
    pub parent: Arc<Dir>,
    pub source: PathBuf,
    pub target: PathBuf,
    pub kind: EntryKind,
    entity: UndoEntity,
}

pub(super) struct TrashUndo {
    pub placement: Arc<crate::platform::trash::TrashPlacement>,
    pub original_path: PathBuf,
    pub operation_key: Uuid,
    pub file_lease: Option<document_service::TrashFileLocationLease>,
}

pub(super) enum FileUndoAction {
    Move(super::entry_move::MoveUndo),
    Rename(RenameUndo),
    Trash(TrashUndo),
}
impl FileUndoAction {
    fn available_in(&self, root: &Path) -> bool {
        match self {
            Self::Move(moved) => {
                let old = moved.placement.old_display_path();
                let current = moved.placement.current_display_path();
                strictly_within(&old, root)
                    || strictly_within(&current, root)
                    || moved.placement.kind() == EntryKind::Directory
                        && (old == root || current == root)
            }
            Self::Rename(rename) => rename.available_in(root),
            Self::Trash(trash) => {
                strictly_within(&trash.original_path, root)
                    || strictly_within(trash.placement.display_path(), root)
            }
        }
    }
    fn description(&self) -> String {
        match self {
            Self::Move(moved) => {
                format!("移动“{}”", moved.placement.current_name().to_string_lossy())
            }
            Self::Rename(rename) => rename.description(),
            Self::Trash(trash) => format!(
                "删除“{}”",
                trash
                    .original_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
            ),
        }
    }
}

impl PreparedRenameUndo {
    pub fn prepare(
        authorities: &DocumentAuthorities,
        parent: Arc<Dir>,
        old: &Path,
        new: &Path,
        kind: EntryKind,
        identity: Arc<same_file::Handle>,
    ) -> Result<Self, String> {
        let old_name = old.file_name().ok_or("旧名称无效")?;
        if !old.is_absolute() || old.parent() != new.parent() || new.file_name().is_none() {
            return Err("文件撤销仅接受已验证的同父目录改名".into());
        }
        document_service::DirectoryBookmark::capture(&parent, old.parent().ok_or("缺少父目录")?)
            .map_err(|error| error.to_string())?;
        let entity = match kind {
            EntryKind::File => UndoEntity::File(
                authorities
                    .lease_file(Arc::clone(&parent), Path::new(old_name), &identity)
                    .map_err(|error| error.to_string())?,
            ),
            EntryKind::Directory => UndoEntity::Directory(identity),
        };
        Ok(Self {
            parent,
            old: old.to_owned(),
            new: new.to_owned(),
            entity,
        })
    }

    /// Only the coordinated native move permits this in-memory handoff. A
    /// document plan may already have retargeted the same shared authority.
    pub fn commit(mut self) -> Result<RenameUndo, String> {
        let kind = match &mut self.entity {
            UndoEntity::File(lease) => {
                lease
                    .retarget(
                        Path::new(self.old.file_name().ok_or("旧名称无效")?),
                        Path::new(self.new.file_name().ok_or("新名称无效")?),
                    )
                    .map_err(|error| error.to_string())?;
                EntryKind::File
            }
            UndoEntity::Directory(_) => EntryKind::Directory,
        };
        Ok(RenameUndo {
            parent: self.parent,
            source: self.new,
            target: self.old,
            kind,
            entity: self.entity,
        })
    }
}

impl RenameUndo {
    pub fn expected_identity(&self) -> Result<Arc<same_file::Handle>, String> {
        document_service::DirectoryBookmark::capture(
            &self.parent,
            self.source.parent().ok_or("缺少父目录")?,
        )
        .map_err(|error| error.to_string())?;
        match &self.entity {
            UndoEntity::File(lease) => lease.current_identity().map_err(|error| error.to_string()),
            UndoEntity::Directory(identity) => Ok(Arc::clone(identity)),
        }
    }
    fn available_in(&self, root: &Path) -> bool {
        strictly_within(&self.source, root) || strictly_within(&self.target, root)
    }
    fn description(&self) -> String {
        format!(
            "重命名“{}”",
            self.source
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
        )
    }
}

struct Slot {
    token: String,
    action: FileUndoAction,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileUndoSnapshot {
    pub token: String,
    pub description: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileUndoReceipt {
    pub operation_id: String,
    pub undo_token: String,
    pub restored_relative_path: Option<String>,
    pub kind: EntryKind,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(crate) enum FileUndoResolution {
    Prepared,
    Committed { receipt: FileUndoReceipt },
    Rejected { message: String },
    MutationUncertain,
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct FileUndoRequest {
    pub label: String,
    pub workspace_id: String,
    pub undo_token: String,
    pub operation_id: String,
}
struct Operation {
    request: FileUndoRequest,
    resolution: FileUndoResolution,
    diagnostic: Option<Arc<super::trash_diagnostic::TrashDiagnostic>>,
}

pub(super) enum BeginUndo {
    Perform(FileUndoAction),
    Resolved(FileUndoResolution),
}

#[derive(Default)]
pub(super) struct FileUndoStore {
    slot: Option<Slot>,
    operations: HashMap<String, Operation>,
}
impl FileUndoStore {
    #[cfg(test)]
    pub(super) fn discard_trash_file_lease_for_test(&mut self) {
        if let Some(Slot {
            action: FileUndoAction::Trash(trash),
            ..
        }) = &mut self.slot
        {
            trash.file_lease = None;
        }
    }
    #[cfg(test)]
    pub(super) fn trash_source_for_test(&self) -> Option<PathBuf> {
        match &self.slot.as_ref()?.action {
            FileUndoAction::Trash(trash) => Some(trash.placement.display_path().to_owned()),
            _ => None,
        }
    }
    #[cfg(test)]
    pub(super) fn trash_placement_for_test(
        &self,
    ) -> Option<Arc<crate::platform::trash::TrashPlacement>> {
        match &self.slot.as_ref()?.action {
            FileUndoAction::Trash(trash) => Some(Arc::clone(&trash.placement)),
            _ => None,
        }
    }
    pub fn record(&mut self, rename: RenameUndo) {
        self.slot = Some(Slot {
            token: Uuid::new_v4().to_string(),
            action: FileUndoAction::Rename(rename),
        });
    }
    pub(super) fn record_move(&mut self, moved: super::entry_move::MoveUndo) {
        self.slot = Some(Slot {
            token: Uuid::new_v4().to_string(),
            action: FileUndoAction::Move(moved),
        });
    }
    pub fn record_trash(&mut self, trash: TrashUndo) {
        self.slot = Some(Slot {
            token: Uuid::new_v4().to_string(),
            action: FileUndoAction::Trash(trash),
        });
    }
    pub fn clear(&mut self) {
        self.slot = None;
    }
    pub fn snapshot(&self, root: &Path) -> Option<FileUndoSnapshot> {
        self.slot
            .as_ref()
            .filter(|slot| slot.action.available_in(root))
            .map(|slot| FileUndoSnapshot {
                token: slot.token.clone(),
                description: slot.action.description(),
            })
    }
    pub fn resolve(&self, request: &FileUndoRequest) -> Result<Option<FileUndoResolution>, String> {
        canonical_uuid(&request.operation_id)?;
        match self.operations.get(&request.operation_id) {
            Some(operation) if operation.request == *request => {
                Ok(Some(operation.resolution.clone()))
            }
            Some(_) => Err("文件撤销请求标识已用于不同参数".into()),
            None => Ok(None),
        }
    }
    pub fn begin(&mut self, request: FileUndoRequest, root: &Path) -> Result<BeginUndo, String> {
        canonical_uuid(&request.undo_token)?;
        if let Some(resolution) = self.resolve(&request)? {
            return Ok(BeginUndo::Resolved(resolution));
        }
        if self.operations.len() >= MAX_RECEIPTS {
            return Err("文件操作回执已达本次应用会话上限，请重启应用后重试".into());
        }
        let eligible = self
            .slot
            .as_ref()
            .is_some_and(|slot| slot.token == request.undo_token && slot.action.available_in(root));
        let resolution = if eligible {
            FileUndoResolution::Prepared
        } else {
            FileUndoResolution::Rejected {
                message: "文件撤销已失效或不属于当前工作区，请重新打开菜单".into(),
            }
        };
        self.operations.insert(
            request.operation_id.clone(),
            Operation {
                request,
                resolution: resolution.clone(),
                diagnostic: None,
            },
        );
        if !eligible {
            return Ok(BeginUndo::Resolved(resolution));
        }
        // Source/target/metadata preflight follows this consumption. A failed
        // attempt never restores the slot and cannot become a file Redo.
        let slot = self.slot.take().ok_or("文件撤销状态已变化")?;
        Ok(BeginUndo::Perform(slot.action))
    }
    #[cfg(test)]
    pub fn finish(
        &mut self,
        request: &FileUndoRequest,
        resolution: FileUndoResolution,
    ) -> Result<(), String> {
        self.finish_with_diagnostic(request, resolution, None)
    }
    pub fn finish_with_diagnostic(
        &mut self,
        request: &FileUndoRequest,
        resolution: FileUndoResolution,
        diagnostic: Option<Arc<super::trash_diagnostic::TrashDiagnostic>>,
    ) -> Result<(), String> {
        let operation = self
            .operations
            .get_mut(&request.operation_id)
            .filter(|operation| operation.request == *request)
            .ok_or("文件撤销请求已失效")?;
        if !matches!(operation.resolution, FileUndoResolution::Prepared) {
            return Err("文件撤销已经完成，不能重新提交结果".into());
        }
        if matches!(resolution, FileUndoResolution::Prepared) {
            return Err("文件撤销没有终结结果".into());
        }
        operation.resolution = resolution;
        operation.diagnostic = diagnostic;
        Ok(())
    }
}

fn strictly_within(path: &Path, root: &Path) -> bool {
    path != root && path.starts_with(root)
}
fn canonical_uuid(value: &str) -> Result<(), String> {
    if Uuid::parse_str(value).is_ok_and(|id| id.hyphenated().to_string() == value) {
        Ok(())
    } else {
        Err("文件撤销请求标识无效".into())
    }
}

#[cfg(test)]
mod tests;
