//! One native move with coordinated document and directory metadata handoff.
use super::WindowServices;
use document_service::{DocumentMetadata, RenameKind};
use file_index::{
    EntryKind, EntryRenamePlan, EntryRenamePreparation, EntryRenameReceipt, WorkspacePayload,
};

pub(crate) struct EntryRenameResult {
    pub receipt: Option<EntryRenameReceipt>,
    pub documents: Vec<(String, Vec<DocumentMetadata>)>,
    pub workspaces: Vec<(String, Vec<WorkspacePayload>)>,
    pub uncertain_documents: Vec<(String, Vec<String>)>,
    pub uncertain_workspaces: Vec<(String, Vec<String>)>,
    pub moved: Option<(std::path::PathBuf, std::path::PathBuf, EntryKind)>,
}

pub(crate) struct EntryRenameRequest<'a> {
    pub label: &'a str,
    pub workspace_id: &'a str,
    pub token: &'a str,
    pub name: &'a str,
    pub operation_id: &'a str,
}
impl EntryRenameResult {
    fn completed(receipt: EntryRenameReceipt) -> Self {
        Self {
            receipt: Some(receipt),
            documents: vec![],
            workspaces: vec![],
            uncertain_documents: vec![],
            uncertain_workspaces: vec![],
            moved: None,
        }
    }
}

impl WindowServices {
    /// Metadata stores prepare old identity proofs before the move, and commit
    /// after capability guards have been released, still inside the write lane.
    pub(crate) fn rename_workspace_entry<M>(
        &self,
        request: EntryRenameRequest<'_>,
        before_move: impl FnOnce(&EntryRenamePlan) -> Result<M, String>,
        after_move: impl FnOnce(M) -> Vec<String>,
    ) -> Result<EntryRenameResult, String> {
        let _gate = self.write_gate.lock().map_err(|_| "文件服务不可用")?;
        self.rename_workspace_entry_in_lane(request, before_move, after_move, true)
    }

    pub(super) fn rename_workspace_entry_in_lane<M>(
        &self,
        request: EntryRenameRequest<'_>,
        before_move: impl FnOnce(&EntryRenamePlan) -> Result<M, String>,
        after_move: impl FnOnce(M) -> Vec<String>,
        record_file_undo: bool,
    ) -> Result<EntryRenameResult, String> {
        let EntryRenameRequest {
            label,
            workspace_id,
            token,
            name,
            operation_id,
        } = request;
        // Directory-history publication can hold its metadata store while
        // restoring a workspace. Never wait for those stores with registries
        // held. Capture the selected entry, release its registry, then prepare
        // metadata before the coordinated capability snapshot.
        let retained = self.get_workspaces(label)?;
        let workspace = retained
            .lock()
            .map_err(|_| "目录状态不可用")?
            .get(workspace_id)
            .map_err(|error| error.to_string())?;
        if !self.is_current_workspaces(label, &retained) {
            return Err("编辑窗口已关闭或更换".into());
        }
        let mut rename = match workspace
            .prepare_entry_rename(operation_id, token, name)
            .map_err(|error| error.to_string())?
        {
            EntryRenamePreparation::Completed(receipt) => {
                return Ok(EntryRenameResult::completed(receipt))
            }
            EntryRenamePreparation::Ready(plan) => plan,
        };
        if !record_file_undo {
            rename.preserve_modified_time();
        }
        let old = rename.old_display_path().to_owned();
        let new = rename.new_display_path().to_owned();
        if old == new {
            return workspace
                .commit_entry_rename(rename)
                .map(EntryRenameResult::completed)
                .map_err(|error| error.to_string());
        }
        let kind = match rename.kind() {
            EntryKind::File => RenameKind::File,
            EntryKind::Directory => RenameKind::Directory,
        };
        let entry_kind = rename.kind();
        let undo = if record_file_undo {
            Some(super::file_undo::PreparedRenameUndo::prepare(
                &self.authorities,
                rename.directory(),
                &old,
                &new,
                entry_kind,
                rename.source_identity(),
            )?)
        } else {
            None
        };
        let metadata = before_move(&rename)?;
        let mut windows: Vec<_> = self
            .windows
            .lock()
            .map_err(|_| "窗口服务不可用")?
            .iter()
            .map(|(label, service)| {
                (
                    label.clone(),
                    service.documents.clone(),
                    service.workspaces.clone(),
                )
            })
            .collect();
        windows.sort_by(|a, b| a.0.cmp(&b.0));
        let own = windows
            .iter()
            .position(|entry| entry.0 == label)
            .ok_or("编辑窗口已关闭或未注册")?;
        let mut documents = windows
            .iter()
            .map(|entry| {
                entry
                    .1
                    .try_lock()
                    .map_err(|_| "文档正在操作，请重试重命名".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()?;
        let registries = windows
            .iter()
            .map(|entry| {
                entry
                    .2
                    .try_lock()
                    .map_err(|_| "目录正在操作，请重试重命名".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()?;
        if !std::sync::Arc::ptr_eq(
            &workspace,
            &registries[own]
                .get(workspace_id)
                .map_err(|error| error.to_string())?,
        ) {
            return Err("工作区已更换或关闭，请重试重命名".into());
        }
        let mount_plans = if kind == RenameKind::Directory && old != new {
            let source = rename
                .directory()
                .open_dir(rename.old_name())
                .map_err(|e| e.to_string())?;
            registries
                .iter()
                .map(|registry| {
                    registry
                        .prepare_relocation(&source, &old, &new)
                        .map_err(|e| e.to_string())
                })
                .collect::<Result<Vec<_>, _>>()?
        } else {
            (0..registries.len()).map(|_| vec![]).collect()
        };
        for plan in mount_plans
            .iter()
            .flat_map(|plans| plans.iter().map(|(_, plan)| plan))
        {
            plan.validate().map_err(|e| e.to_string())?;
        }
        let plans = documents
            .iter_mut()
            .map(|service| {
                service
                    .prepare_rename(
                        rename.directory(),
                        rename.old_name(),
                        rename.new_name(),
                        &old,
                        &new,
                        kind,
                    )
                    .map_err(|e| e.to_string())
            })
            .collect::<Result<Vec<_>, _>>()?;
        // Reservation may register/remove windows without taking write_gate.
        // Whole-map Arc validation closes that race without an inverse wait.
        let live = self.windows.lock().map_err(|_| "窗口服务不可用")?;
        if live.len() != windows.len()
            || windows.iter().any(|(label, docs, registries)| {
                !live.get(label).is_some_and(|current| {
                    std::sync::Arc::ptr_eq(&current.documents, docs)
                        && std::sync::Arc::ptr_eq(&current.workspaces, registries)
                })
            })
        {
            return Err("窗口会话已更换，请重试重命名".into());
        }
        let receipt = match workspace.commit_entry_rename(rename) {
            Ok(receipt) => receipt,
            Err(file_index::IndexError::MutationUncertain) => {
                let uncertain_documents = windows
                    .iter()
                    .zip(plans)
                    .map(|(window, plan)| (window.0.clone(), plan.revoke()))
                    .filter(|(_, ids)| !ids.is_empty())
                    .collect();
                let uncertain_workspaces = windows
                    .iter()
                    .zip(mount_plans)
                    .map(|(window, plans)| {
                        let ids = plans
                            .into_iter()
                            .map(|(id, plan)| {
                                plan.revoke();
                                id
                            })
                            .collect::<Vec<_>>();
                        (window.0.clone(), ids)
                    })
                    .filter(|(_, ids)| !ids.is_empty())
                    .collect();
                self.clear_file_undo();
                return Ok(EntryRenameResult {
                    receipt: None,
                    documents: vec![],
                    workspaces: vec![],
                    uncertain_documents,
                    uncertain_workspaces,
                    moved: None,
                });
            }
            Err(error) => return Err(error.to_string()),
        };
        let mut workspaces = Vec::new();
        let mut mount_failed = false;
        let affected_ids: Vec<Vec<String>> = mount_plans
            .iter()
            .map(|plans| plans.iter().map(|(id, _)| id.clone()).collect())
            .collect();
        for (window, plans) in windows.iter().zip(mount_plans) {
            let mut changed = vec![];
            for (id, plan) in plans {
                match plan.commit(&id) {
                    Ok(payload) => changed.push(payload),
                    Err(_) => mount_failed = true,
                }
            }
            if !changed.is_empty() {
                workspaces.push((window.0.clone(), changed));
            }
        }
        let mut result = if mount_failed {
            for (registry, ids) in registries.iter().zip(&affected_ids) {
                for id in ids {
                    if let Ok(workspace) = registry.get(id) {
                        workspace.revoke_location();
                    }
                }
            }
            let _ = workspace.mark_entry_rename_uncertain(operation_id);
            EntryRenameResult {
                receipt: None,
                documents: vec![],
                workspaces: vec![],
                uncertain_documents: windows
                    .iter()
                    .zip(plans)
                    .map(|(window, plan)| (window.0.clone(), plan.revoke()))
                    .filter(|(_, ids)| !ids.is_empty())
                    .collect(),
                uncertain_workspaces: windows
                    .iter()
                    .zip(affected_ids)
                    .map(|(window, ids)| (window.0.clone(), ids))
                    .filter(|(_, ids)| !ids.is_empty())
                    .collect(),
                moved: None,
            }
        } else {
            let changed = windows
                .iter()
                .zip(plans)
                .map(|(window, plan)| (window.0.clone(), plan.commit()))
                .filter(|(_, changed)| !changed.is_empty())
                .collect();
            EntryRenameResult {
                receipt: Some(receipt),
                documents: changed,
                workspaces,
                uncertain_documents: vec![],
                uncertain_workspaces: vec![],
                moved: (old != new).then_some((old, new, entry_kind)),
            }
        };
        drop(live);
        drop(documents);
        drop(registries);
        if let Some(receipt) = &mut result.receipt {
            let warnings = after_move(metadata);
            if let Err(error) = workspace.record_entry_rename_warnings(operation_id, &warnings) {
                eprintln!("Rename metadata warning receipt was not retained: {error}");
            }
            receipt.warnings.extend(warnings);
            if let Some(undo) = undo {
                match undo.commit().and_then(|undo| self.record_file_undo(undo)) {
                    Ok(()) => {}
                    Err(error) => {
                        self.clear_file_undo();
                        let warnings = vec![format!("文件已改名，但文件操作撤销未能建立：{error}")];
                        let _ = workspace.record_entry_rename_warnings(operation_id, &warnings);
                        receipt.warnings.extend(warnings);
                    }
                }
            }
        } else if record_file_undo {
            self.clear_file_undo();
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests;
