use super::{
    entry_rename::{EntryRenameRequest, EntryRenameResult},
    file_undo::{
        BeginUndo, FileUndoAction, FileUndoRequest, FileUndoResolution, FileUndoSnapshot,
        RenameUndo,
    },
    WindowServices,
};
use file_index::{EntryRenamePlan, EntryRenamePreparation};
use std::path::Path;

pub(crate) struct FileUndoResult {
    pub resolution: FileUndoResolution,
    pub changes: Option<UndoChanges>,
    pub diagnostic: Option<std::sync::Arc<super::trash_diagnostic::TrashDiagnostic>>,
}
pub(crate) enum UndoChanges {
    Moved(super::entry_move::EntryMoveResult),
    Rename(EntryRenameResult),
    Restored(super::trash_entry::TrashRestoreChanges),
}

impl WindowServices {
    /// All callers mutate the slot while already owning the native file lane.
    pub(super) fn record_file_undo(&self, undo: RenameUndo) -> Result<(), String> {
        self.file_undo
            .lock()
            .map_err(|_| "文件操作撤销服务不可用")?
            .record(undo);
        Ok(())
    }
    pub(crate) fn clear_file_undo(&self) {
        self.file_undo
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clear();
    }
    pub(crate) fn get_file_undo(
        &self,
        label: &str,
        workspace_id: &str,
    ) -> Result<Option<FileUndoSnapshot>, String> {
        self.with_file_lane(|| {
            let registry = self.get_workspaces(label)?;
            let workspace = registry
                .lock()
                .map_err(|_| "目录状态不可用")?
                .get(workspace_id)
                .map_err(|error| error.to_string())?;
            if !self.is_current_workspaces(label, &registry) {
                return Err("编辑窗口已关闭或更换".into());
            }
            let root = workspace
                .display_root_snapshot()
                .map_err(|error| error.to_string())?;
            Ok(self
                .file_undo
                .lock()
                .map_err(|_| "文件操作撤销服务不可用")?
                .snapshot(&root))
        })
    }
    pub(crate) fn resolve_file_undo(
        &self,
        request: &FileUndoRequest,
    ) -> Result<Option<FileUndoResolution>, String> {
        self.with_file_lane(|| {
            self.get_workspaces(&request.label)?
                .lock()
                .map_err(|_| "目录状态不可用")?
                .get(&request.workspace_id)
                .map_err(|error| error.to_string())?;
            self.file_undo
                .lock()
                .map_err(|_| "文件操作撤销服务不可用")?
                .resolve(request)
        })
    }
    #[cfg(test)]
    pub(crate) fn perform_file_undo<M>(
        &self,
        request: FileUndoRequest,
        before_move: impl FnOnce(&EntryRenamePlan) -> Result<M, String>,
        after_move: impl FnOnce(M) -> Vec<String>,
    ) -> Result<FileUndoResult, String> {
        self.perform_file_undo_with_move(
            request,
            before_move,
            after_move,
            |_| Ok(()),
            |_, _| vec![],
        )
    }
    pub(crate) fn perform_file_undo_with_move<M, N>(
        &self,
        request: FileUndoRequest,
        before_move: impl FnOnce(&EntryRenamePlan) -> Result<M, String>,
        after_move: impl FnOnce(M) -> Vec<String>,
        before_native_move: impl FnOnce(Vec<document_service::NativeMoveTarget>) -> Result<N, String>,
        after_native_move: impl FnOnce(N, &[&document_service::NativeMovePublication]) -> Vec<String>,
    ) -> Result<FileUndoResult, String> {
        let _gate = self.write_gate.lock().map_err(|_| "文件服务不可用")?;
        let registry = self.get_workspaces(&request.label)?;
        let workspace = registry
            .lock()
            .map_err(|_| "目录状态不可用")?
            .get(&request.workspace_id)
            .map_err(|error| error.to_string())?;
        if !self.is_current_workspaces(&request.label, &registry) {
            return Err("编辑窗口已关闭或更换".into());
        }
        let root = workspace
            .display_root_snapshot()
            .map_err(|error| error.to_string())?;
        let action = match self
            .file_undo
            .lock()
            .map_err(|_| "文件操作撤销服务不可用")?
            .begin(request.clone(), &root)?
        {
            BeginUndo::Resolved(resolution) => {
                return Ok(FileUndoResult {
                    resolution,
                    changes: None,
                    diagnostic: None,
                })
            }
            BeginUndo::Perform(action) => action,
        };
        let result = match action {
            FileUndoAction::Move(undo) => self
                .undo_move_in_lane(&request, undo, before_native_move, after_native_move)
                .map(|changes| {
                    let resolution = match &changes.receipt {
                        Some(receipt) => FileUndoResolution::Committed {
                            receipt: super::file_undo::FileUndoReceipt {
                                operation_id: request.operation_id.clone(),
                                undo_token: request.undo_token.clone(),
                                restored_relative_path: std::path::Path::new(&receipt.path)
                                    .strip_prefix(&root)
                                    .ok()
                                    .and_then(|path| path.to_str())
                                    .map(|path| path.replace(std::path::MAIN_SEPARATOR, "/")),
                                kind: receipt.kind,
                                warnings: receipt.warnings.clone(),
                            },
                        },
                        None => FileUndoResolution::MutationUncertain,
                    };
                    FileUndoResult {
                        resolution,
                        changes: Some(UndoChanges::Moved(changes)),
                        diagnostic: None,
                    }
                }),
            FileUndoAction::Rename(action) => self.perform_rename_undo_in_lane(
                &request,
                &root,
                &workspace,
                action,
                before_move,
                after_move,
            ),
            FileUndoAction::Trash(action) => self.restore_trash_in_lane(&request, &root, action),
        };
        let mut result = match result {
            Ok(result) => result,
            Err(message) => FileUndoResult {
                resolution: FileUndoResolution::Rejected { message },
                changes: None,
                diagnostic: None,
            },
        };
        if self
            .file_undo
            .lock()
            .map_err(|_| "文件操作撤销服务不可用")?
            .finish_with_diagnostic(
                &request,
                result.resolution.clone(),
                result.diagnostic.clone(),
            )
            .is_err()
        {
            self.clear_file_undo();
            result.resolution = FileUndoResolution::MutationUncertain;
        }
        Ok(result)
    }
    fn perform_rename_undo_in_lane<M>(
        &self,
        request: &FileUndoRequest,
        root: &Path,
        workspace: &file_index::Workspace,
        action: RenameUndo,
        before_move: impl FnOnce(&EntryRenamePlan) -> Result<M, String>,
        after_move: impl FnOnce(M) -> Vec<String>,
    ) -> Result<FileUndoResult, String> {
        let mut inspection = None;
        let result = (|| {
            let relative = relative_in(&action.source, root)?;
            let target = relative_in(&action.target, root)?;
            let expected = action.expected_identity()?;
            let entry = workspace
                .inspect_entry(&relative)
                .map_err(|error| error.to_string())?;
            inspection = Some(entry.entry_token.clone());
            let name = action
                .target
                .file_name()
                .and_then(|name| name.to_str())
                .ok_or("恢复名称无效")?;
            let prepared = match workspace
                .prepare_entry_rename(&request.operation_id, &entry.entry_token, name)
                .map_err(|error| error.to_string())?
            {
                EntryRenamePreparation::Ready(plan) => plan,
                EntryRenamePreparation::Completed(_) => {
                    return Err("文件撤销的内部请求已经完成，未重复执行".into())
                }
            };
            if prepared.source_identity().as_ref() != expected.as_ref()
                || prepared.kind() != action.kind
                || prepared.old_display_path() != action.source
                || prepared.new_display_path() != action.target
            {
                return Err("原文件实体已被替换，未执行撤销".into());
            }
            drop(prepared);
            let changes = self.rename_workspace_entry_in_lane(
                EntryRenameRequest {
                    label: &request.label,
                    workspace_id: &request.workspace_id,
                    token: &entry.entry_token,
                    name,
                    operation_id: &request.operation_id,
                },
                |plan| {
                    if plan.source_identity().as_ref() != expected.as_ref() {
                        return Err("原文件实体已被替换，未执行撤销".into());
                    }
                    before_move(plan)
                },
                after_move,
                false,
            )?;
            let resolution = match &changes.receipt {
                Some(receipt) => FileUndoResolution::Committed {
                    receipt: super::file_undo::FileUndoReceipt {
                        operation_id: request.operation_id.clone(),
                        undo_token: request.undo_token.clone(),
                        restored_relative_path: Some(target),
                        kind: action.kind,
                        warnings: receipt.warnings.clone(),
                    },
                },
                None => FileUndoResolution::MutationUncertain,
            };
            Ok(FileUndoResult {
                resolution,
                changes: Some(UndoChanges::Rename(changes)),
                diagnostic: None,
            })
        })();
        if let Some(token) = inspection {
            let _ = workspace.finish_entry_inspection(&token);
        }
        result
    }
}

fn relative_in(path: &Path, root: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "文件操作不属于当前工作区")?;
    if relative.as_os_str().is_empty() {
        return Err("不能通过文件撤销移动工作区根目录".into());
    }
    Ok(relative
        .to_str()
        .ok_or("文件路径无法编码")?
        .replace(std::path::MAIN_SEPARATOR, "/"))
}

#[cfg(test)]
mod tests;
