//! One Move publication, all document/registry owners, and the separate file Undo.
use super::{entry_rename::EntryRenameResult, WindowServices};
use document_service::{FileLocationLease, NativeMovePublication, NativeMoveTarget, RenameKind};
use file_index::{
    EntryKind, EntryMoveCommit, EntryMoveConflictPolicy, EntryMoveDestination, EntryMovePlan,
    EntryMovePreparation, EntryMoveReceipt, EntryMoveUndo, EntryMoveUndoPlan, Workspace,
};
use std::{path::PathBuf, sync::Arc};

pub(crate) struct EntryMoveResult {
    pub receipt: Option<EntryMoveReceipt>,
    pub changes: EntryRenameResult,
    pub paths: Vec<(PathBuf, PathBuf, EntryKind)>,
}
pub(super) struct MoveUndo {
    pub workspace: Arc<Workspace>,
    pub placement: EntryMoveUndo,
    pub file: Option<FileLocationLease>,
    pub replacement: Option<FileLocationLease>,
}
pub(crate) struct EntryMoveRequest<'a> {
    pub label: &'a str,
    pub workspace_id: &'a str,
    pub token: &'a str,
    pub operation_id: &'a str,
}
enum Plan {
    Forward(EntryMovePlan),
    Undo(EntryMoveUndoPlan),
}
impl Plan {
    fn main(&self) -> NativeMoveTarget {
        match self {
            Self::Forward(plan) => target(
                plan.source_directory(),
                plan.old_name(),
                plan.destination_directory(),
                plan.new_name(),
                plan.old_display_path(),
                &plan.new_display_path(),
                plan.kind(),
            ),
            Self::Undo(plan) => target(
                plan.source_directory(),
                plan.old_name(),
                plan.destination_directory(),
                plan.new_name(),
                &plan.old_display_path(),
                &plan.new_display_path(),
                plan.kind(),
            ),
        }
    }
    fn targets(&self) -> Vec<NativeMoveTarget> {
        let mut targets = vec![];
        match self {
            Self::Forward(plan) => {
                if let (Some(name), Some(display), Some(kind)) = (
                    plan.replacement_name(),
                    plan.replacement_display_path(),
                    plan.replacement_kind(),
                ) {
                    targets.push(target(
                        plan.destination_directory(),
                        plan.new_name(),
                        plan.destination_directory(),
                        &name,
                        &plan.new_display_path(),
                        &display,
                        kind,
                    ));
                }
            }
            Self::Undo(plan) => {
                if let Some(replacement) = plan.replacement() {
                    let old = replacement.display_path();
                    let new = old
                        .parent()
                        .expect("validated backup parent")
                        .join(replacement.original_name());
                    targets.push(target(
                        replacement.directory(),
                        replacement.name(),
                        replacement.directory(),
                        replacement.original_name(),
                        &old,
                        &new,
                        replacement.kind(),
                    ));
                }
            }
        }
        targets.push(self.main());
        targets
    }
    fn commit(self, workspace: &Workspace) -> Result<EntryMoveCommit, file_index::IndexError> {
        match self {
            Self::Forward(plan) => workspace.commit_entry_move(plan),
            Self::Undo(plan) => workspace.commit_entry_move_undo(plan),
        }
    }
}
fn target(
    source_parent: Arc<cap_std::fs::Dir>,
    source_name: &std::path::Path,
    destination_parent: Arc<cap_std::fs::Dir>,
    destination_name: &std::path::Path,
    source_display: &std::path::Path,
    destination_display: &std::path::Path,
    kind: EntryKind,
) -> NativeMoveTarget {
    NativeMoveTarget {
        source_parent,
        source_name: source_name.into(),
        destination_parent,
        destination_name: destination_name.into(),
        source_display: source_display.into(),
        destination_display: destination_display.into(),
        kind: if kind == EntryKind::File {
            RenameKind::File
        } else {
            RenameKind::Directory
        },
    }
}
fn empty_changes() -> EntryRenameResult {
    EntryRenameResult {
        receipt: None,
        documents: vec![],
        workspaces: vec![],
        uncertain_documents: vec![],
        uncertain_workspaces: vec![],
        moved: None,
    }
}
impl WindowServices {
    pub(crate) fn inspect_move_destination(
        &self,
        request: &EntryMoveRequest<'_>,
        destination: Arc<cap_std::fs::Dir>,
        display: &std::path::Path,
    ) -> Result<EntryMoveDestination, String> {
        self.mutate_workspace(request.label, request.workspace_id, |workspace| {
            workspace
                .inspect_entry_move_destination(request.token, destination, display)
                .map_err(|e| e.to_string())
        })
    }
    pub(crate) fn move_workspace_entry<M>(
        &self,
        request: EntryMoveRequest<'_>,
        destination: EntryMoveDestination,
        policy: EntryMoveConflictPolicy,
        before: impl FnOnce(Vec<NativeMoveTarget>) -> Result<M, String>,
        after: impl FnOnce(M, &[&NativeMovePublication]) -> Vec<String>,
    ) -> Result<EntryMoveResult, String> {
        let _gate = self.write_gate.lock().map_err(|_| "文件服务不可用")?;
        let registry = self.get_workspaces(request.label)?;
        let workspace = registry
            .lock()
            .map_err(|_| "目录状态不可用")?
            .get(request.workspace_id)
            .map_err(|e| e.to_string())?;
        if !self.is_current_workspaces(request.label, &registry) {
            return Err("移动所属窗口已关闭或更换".into());
        }
        let plan = match workspace
            .prepare_entry_move(request.operation_id, request.token, destination, policy)
            .map_err(|e| e.to_string())?
        {
            EntryMovePreparation::Completed(receipt) => {
                return Ok(EntryMoveResult {
                    receipt: Some(receipt),
                    changes: empty_changes(),
                    paths: vec![],
                })
            }
            EntryMovePreparation::Ready(plan) => plan,
        };
        if plan.no_change() {
            let committed = workspace
                .commit_entry_move(plan)
                .map_err(|e| e.to_string())?;
            return Ok(EntryMoveResult {
                receipt: Some(committed.receipt),
                changes: empty_changes(),
                paths: vec![],
            });
        }
        let result = self.commit_move_in_lane(
            request.label,
            Some(request.workspace_id),
            Arc::clone(&workspace),
            Plan::Forward(plan),
            None,
            before,
            after,
        );
        if let Err(message) = &result {
            let _ =
                workspace.reject_prepared_entry_move(request.operation_id, request.token, message);
        }
        result
    }
    pub(super) fn undo_move_in_lane<M>(
        &self,
        request: &super::file_undo::FileUndoRequest,
        undo: MoveUndo,
        before: impl FnOnce(Vec<NativeMoveTarget>) -> Result<M, String>,
        after: impl FnOnce(M, &[&NativeMovePublication]) -> Vec<String>,
    ) -> Result<EntryMoveResult, String> {
        let plan = undo
            .workspace
            .prepare_entry_move_undo_with_replacement(
                &request.operation_id,
                &undo.placement,
                undo.file.as_ref(),
                undo.replacement.as_ref(),
            )
            .map_err(|e| e.to_string())?;
        let workspace = Arc::clone(&undo.workspace);
        self.commit_move_in_lane(
            &request.label,
            None,
            workspace,
            Plan::Undo(plan),
            Some(undo),
            before,
            after,
        )
    }
    #[allow(clippy::too_many_arguments)]
    fn commit_move_in_lane<M>(
        &self,
        label: &str,
        workspace_id: Option<&str>,
        workspace: Arc<Workspace>,
        plan: Plan,
        previous_undo: Option<MoveUndo>,
        before: impl FnOnce(Vec<NativeMoveTarget>) -> Result<M, String>,
        after: impl FnOnce(M, &[&NativeMovePublication]) -> Vec<String>,
    ) -> Result<EntryMoveResult, String> {
        let specs = plan.targets();
        let mut pin = match &plan {
            Plan::Forward(plan) if plan.kind() == EntryKind::File => Some(
                self.authorities
                    .lease_file(
                        plan.source_directory(),
                        plan.old_name(),
                        &plan.source_identity(),
                    )
                    .map_err(|e| e.to_string())?,
            ),
            _ => None,
        };
        let mut replacement_pin = match &plan {
            Plan::Forward(plan) if plan.replacement_kind() == Some(EntryKind::File) => Some(
                self.authorities
                    .lease_file(
                        plan.destination_directory(),
                        plan.new_name(),
                        plan.replacement_identity()
                            .ok_or("替换实体已变化")?
                            .as_ref(),
                    )
                    .map_err(|e| e.to_string())?,
            ),
            _ => None,
        };
        if let Some(undo) = previous_undo {
            pin = undo.file;
            replacement_pin = undo.replacement;
        }
        let metadata = before(specs.clone())?;
        let mut windows: Vec<_> = self
            .windows
            .lock()
            .map_err(|_| "窗口服务不可用")?
            .iter()
            .map(|(label, service)| {
                (
                    label.clone(),
                    Arc::clone(&service.documents),
                    Arc::clone(&service.workspaces),
                )
            })
            .collect();
        windows.sort_by(|a, b| a.0.cmp(&b.0));
        let own = windows
            .iter()
            .position(|entry| entry.0 == label)
            .ok_or("移动窗口已关闭")?;
        let mut documents = windows
            .iter()
            .map(|entry| entry.1.try_lock().map_err(|_| "文档正在操作，请稍后移动"))
            .collect::<Result<Vec<_>, _>>()?;
        let mut registries = windows
            .iter()
            .map(|entry| entry.2.try_lock().map_err(|_| "目录正在操作，请稍后移动"))
            .collect::<Result<Vec<_>, _>>()?;
        if let Some(id) = workspace_id {
            if !Arc::ptr_eq(
                &workspace,
                &registries[own].get(id).map_err(|e| e.to_string())?,
            ) {
                return Err("工作区已更换，未移动".into());
            }
        }
        let mut mount_plans = vec![];
        for spec in &specs {
            mount_plans.push(
                registries
                    .iter()
                    .map(|registry| {
                        registry
                            .prepare_move_relocation(
                                Arc::clone(&spec.source_parent),
                                &spec.source_name,
                                &spec.source_display,
                                &spec.destination_display,
                                if spec.kind == RenameKind::File {
                                    EntryKind::File
                                } else {
                                    EntryKind::Directory
                                },
                            )
                            .map_err(|e| e.to_string())
                    })
                    .collect::<Result<Vec<_>, _>>()?,
            );
        }
        for plans in &mount_plans {
            for (_, plan) in plans.iter().flatten() {
                plan.validate().map_err(|e| e.to_string())?;
            }
        }
        for index in 0..registries.len() {
            let plans = mount_plans
                .iter()
                .flat_map(|batch| batch[index].iter().map(|(_, plan)| plan))
                .collect::<Vec<_>>();
            file_index::WorkspaceMoveRelocationPlan::validate_batch(&plans)
                .map_err(|e| e.to_string())?;
        }
        let mut document_plans = documents
            .iter_mut()
            .map(|service| {
                service
                    .prepare_moves(specs.clone())
                    .map_err(|e| e.to_string())
            })
            .collect::<Result<Vec<_>, _>>()?;
        let live = self.windows.lock().map_err(|_| "窗口服务不可用")?;
        if live.len() != windows.len()
            || windows.iter().any(|(label, docs, registry)| {
                !live.get(label).is_some_and(|current| {
                    Arc::ptr_eq(&current.documents, docs)
                        && Arc::ptr_eq(&current.workspaces, registry)
                })
            })
        {
            return Err("窗口会话已更换，未移动".into());
        }
        let mut uncertain = empty_changes();
        let committed = match plan.commit(&workspace) {
            Ok(committed) => Some(committed),
            Err(file_index::IndexError::MutationUncertain) => None,
            Err(error) => return Err(error.to_string()),
        };
        let publications = committed
            .as_ref()
            .map(|commit| {
                let mut placements = vec![];
                if let Some(replacement) = commit.placement.replacement_placement() {
                    placements.push(Arc::new(replacement));
                }
                placements.push(Arc::clone(&commit.placement));
                let mut publications = vec![];
                if let Some(replacement) = commit
                    .placement
                    .replacement_publication()
                    .map_err(|e| e.to_string())?
                {
                    publications.push(replacement);
                }
                publications.push(commit.placement.publication().map_err(|e| e.to_string())?);
                if placements.len() != specs.len() || publications.len() != specs.len() {
                    return Err("移动发布批次不符".to_owned());
                }
                let refs = publications.iter().collect::<Vec<_>>();
                for plan in &mut document_plans {
                    plan.validate_commit(&refs).map_err(|e| e.to_string())?;
                }
                for (plans, placement) in mount_plans.iter().zip(&placements) {
                    for (_, plan) in plans.iter().flatten() {
                        plan.validate_commit(placement).map_err(|e| e.to_string())?;
                    }
                }
                Ok::<_, String>((placements, publications))
            })
            .transpose();
        let successful = matches!(&publications, Ok(Some(_)));
        if !successful {
            uncertain.uncertain_documents = windows
                .iter()
                .zip(document_plans)
                .map(|(window, plan)| (window.0.clone(), plan.revoke()))
                .filter(|(_, ids)| !ids.is_empty())
                .collect();
            let mut roots = std::collections::HashMap::<String, Vec<String>>::new();
            for plans in mount_plans {
                for (window, plans) in windows.iter().zip(plans) {
                    for (id, plan) in plans {
                        plan.revoke();
                        roots.entry(window.0.clone()).or_default().push(id);
                    }
                }
            }
            uncertain.uncertain_workspaces = roots.into_iter().collect();
            if let Some(commit) = &committed {
                let _ = workspace.mark_entry_move_uncertain(&commit.receipt.operation_id);
            }
            self.clear_file_undo();
            return Ok(EntryMoveResult {
                receipt: None,
                changes: uncertain,
                paths: vec![],
            });
        }
        let (placements, publications) = publications
            .map_err(|e| e.to_string())?
            .ok_or("移动发布缺失")?;
        let pin_result = (|| -> Result<(), String> {
            let main = publications.last().expect("verified nonempty publication");
            if let Some(pin) = &mut pin {
                pin.retarget_move(main).map_err(|e| e.to_string())?;
            }
            if let (Some(pin), Some(replacement)) = (
                &mut replacement_pin,
                publications.first().filter(|_| publications.len() > 1),
            ) {
                pin.retarget_move(replacement).map_err(|e| e.to_string())?;
            }
            Ok(())
        })();
        if let Err(error) = pin_result {
            eprintln!("Move publication pin handoff failed: {error}");
            uncertain.uncertain_documents = windows
                .iter()
                .zip(document_plans)
                .map(|(window, plan)| (window.0.clone(), plan.revoke()))
                .filter(|(_, ids)| !ids.is_empty())
                .collect();
            for plans in mount_plans {
                for (window, plans) in windows.iter().zip(plans) {
                    for (id, plan) in plans {
                        plan.revoke();
                        uncertain
                            .uncertain_workspaces
                            .push((window.0.clone(), vec![id]));
                    }
                }
            }
            if let Some(commit) = &committed {
                let _ = workspace.mark_entry_move_uncertain(&commit.receipt.operation_id);
            }
            self.clear_file_undo();
            return Ok(EntryMoveResult {
                receipt: None,
                changes: uncertain,
                paths: vec![],
            });
        }
        let affected_roots = mount_plans
            .iter()
            .flat_map(|batch| {
                windows.iter().zip(batch).flat_map(|(window, plans)| {
                    plans
                        .iter()
                        .map(move |(id, _)| (window.0.clone(), id.clone()))
                })
            })
            .collect::<Vec<_>>();
        let mut changed_workspaces =
            std::collections::HashMap::<String, Vec<file_index::WorkspacePayload>>::new();
        let mut mount_failure = false;
        for (plans, placement) in mount_plans.into_iter().zip(&placements) {
            for ((window, registry), plans) in windows.iter().zip(registries.iter_mut()).zip(plans)
            {
                for (id, plan) in plans {
                    match registry.commit_move_relocation(&id, plan, placement) {
                        Ok(payload) => changed_workspaces
                            .entry(window.0.clone())
                            .or_default()
                            .push(payload),
                        Err(_) => {
                            mount_failure = true;
                            if let Ok(root) = registry.get(&id) {
                                root.revoke_location();
                            }
                            uncertain
                                .uncertain_workspaces
                                .push((window.0.clone(), vec![id]));
                        }
                    }
                }
            }
        }
        if mount_failure {
            for (window, id) in &affected_roots {
                if let Some(index) = windows.iter().position(|entry| &entry.0 == window) {
                    if let Ok(root) = registries[index].get(id) {
                        root.revoke_location();
                    }
                }
            }
            uncertain.uncertain_workspaces = affected_roots
                .into_iter()
                .map(|(label, id)| (label, vec![id]))
                .collect();
            if let Some(commit) = &committed {
                let _ = workspace.mark_entry_move_uncertain(&commit.receipt.operation_id);
            }
            uncertain.uncertain_documents = windows
                .iter()
                .zip(document_plans)
                .map(|(window, plan)| (window.0.clone(), plan.revoke()))
                .filter(|(_, ids)| !ids.is_empty())
                .collect();
            self.clear_file_undo();
            return Ok(EntryMoveResult {
                receipt: None,
                changes: uncertain,
                paths: vec![],
            });
        }
        let mut changes = empty_changes();
        changes.documents = windows
            .iter()
            .zip(document_plans)
            .map(|(window, plan)| (window.0.clone(), plan.commit()))
            .filter(|(_, meta)| !meta.is_empty())
            .collect();
        changes.workspaces = changed_workspaces.into_iter().collect();
        drop(live);
        drop(documents);
        drop(registries);
        let refs = publications.iter().collect::<Vec<_>>();
        let mut committed = committed.expect("verified commit exists");
        committed.receipt.warnings.extend(after(metadata, &refs));
        if workspace_id.is_some() {
            let recorded = match self.file_undo.lock() {
                Ok(mut store) => {
                    store.record_move(MoveUndo {
                        workspace,
                        placement: committed.undo,
                        file: pin,
                        replacement: replacement_pin,
                    });
                    true
                }
                Err(error) => {
                    drop(error);
                    false
                }
            };
            if !recorded {
                committed
                    .receipt
                    .warnings
                    .push("文件已移动，但文件撤销槽不可用；未重新执行移动".into());
                self.clear_file_undo();
            }
        }
        let paths = specs
            .into_iter()
            .map(|target| {
                (
                    target.source_display,
                    target.destination_display,
                    if target.kind == RenameKind::File {
                        EntryKind::File
                    } else {
                        EntryKind::Directory
                    },
                )
            })
            .collect();
        Ok(EntryMoveResult {
            receipt: Some(committed.receipt),
            changes,
            paths,
        })
    }
}

#[cfg(test)]
mod tests;
