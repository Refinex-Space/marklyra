use super::{
    file_undo::TrashUndo,
    trash_operations::{TrashReceipt, TrashRequest, TrashResolution, TrashStatus},
    WindowServices,
};
use crate::{
    commands::workspaces::Workspaces,
    platform::trash::{self, AuthorizedTrashSource, TrashFailure},
};
use document_service::{DocumentMetadata, RenameKind, TrashRestoreTarget};
use file_index::{EntryKind, InspectedEntryAction, Workspace};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

pub(crate) struct TrashReservation {
    pub request: TrashRequest,
    action: InspectedEntryAction,
    workspace: Arc<Workspace>,
    registry: Workspaces,
    relative_path: String,
}
impl TrashReservation {
    pub fn name(&self) -> String {
        self.action.name().to_string_lossy().into_owned()
    }
}
pub(crate) enum TrashStart {
    Reserved(Box<TrashReservation>),
    Resolved(TrashResolution),
}
pub(crate) struct TrashResult {
    pub resolution: TrashResolution,
    pub documents: Vec<(String, Vec<DocumentMetadata>)>,
    pub uncertain_documents: Vec<(String, Vec<String>)>,
    pub removed_roots: Vec<(String, Vec<String>)>,
    pub uncertain_roots: Vec<(String, Vec<String>)>,
    pub removed: Option<(PathBuf, EntryKind)>,
    pub diagnostic: Option<Arc<super::trash_diagnostic::TrashDiagnostic>>,
}
impl TrashResult {
    fn resolved(resolution: TrashResolution) -> Self {
        Self {
            resolution,
            documents: vec![],
            uncertain_documents: vec![],
            removed_roots: vec![],
            uncertain_roots: vec![],
            removed: None,
            diagnostic: None,
        }
    }
}
pub(crate) struct TrashRestoreChanges {
    pub documents: Vec<(String, Vec<DocumentMetadata>)>,
    pub uncertain_documents: Vec<(String, Vec<String>)>,
    pub removed_roots: Vec<(String, Vec<String>)>,
    pub uncertain_roots: Vec<(String, Vec<String>)>,
    pub restored: Option<(PathBuf, EntryKind)>,
}

impl WindowServices {
    pub(crate) fn reserve_trash(&self, request: TrashRequest) -> Result<TrashStart, String> {
        self.with_file_lane(|| {
            let registry = self.get_workspaces(&request.label)?;
            let workspace = registry
                .lock()
                .map_err(|_| "目录状态不可用")?
                .get(&request.workspace_id)
                .map_err(|error| error.to_string())?;
            if !self.is_current_workspaces(&request.label, &registry) {
                return Err("编辑窗口已关闭或更换".into());
            }
            if let Some(resolution) = self
                .trash_operations
                .lock()
                .map_err(|_| "删除服务不可用")?
                .resolve(&request)?
            {
                return Ok(TrashStart::Resolved(resolution));
            }
            self.trash_operations
                .lock()
                .map_err(|_| "删除服务不可用")?
                .reserve(request.clone())?;
            let prepared = (|| {
                let action = workspace
                    .prepare_entry_action(&request.entry_token)
                    .map_err(|error| error.to_string())?;
                let root = workspace
                    .display_root_snapshot()
                    .map_err(|error| error.to_string())?;
                let relative_path =
                    relative(action.display_path(), &root)?.ok_or("不能删除工作区根目录")?;
                Ok(TrashReservation {
                    request: request.clone(),
                    action,
                    workspace,
                    registry,
                    relative_path,
                })
            })();
            match prepared {
                Ok(reservation) => Ok(TrashStart::Reserved(Box::new(reservation))),
                Err(message) => {
                    let resolution = TrashResolution::Rejected { message };
                    self.trash_operations
                        .lock()
                        .map_err(|_| "删除服务不可用")?
                        .finish(&request, resolution.clone())?;
                    Ok(TrashStart::Resolved(resolution))
                }
            }
        })
    }
    pub(crate) fn resolve_trash(
        &self,
        request: &TrashRequest,
    ) -> Result<Option<TrashResolution>, String> {
        self.with_file_lane(|| {
            self.get_workspaces(&request.label)?
                .lock()
                .map_err(|_| "目录状态不可用")?
                .get(&request.workspace_id)
                .map_err(|error| error.to_string())?;
            self.trash_operations
                .lock()
                .map_err(|_| "删除服务不可用")?
                .resolve(request)
        })
    }
    pub(crate) fn cancel_trash(
        &self,
        reservation: TrashReservation,
        error: Option<String>,
    ) -> Result<TrashResolution, String> {
        self.with_file_lane(|| {
            let _ = reservation
                .workspace
                .finish_entry_inspection(&reservation.request.entry_token);
            let resolution = match error {
                Some(message) => TrashResolution::Rejected { message },
                None => TrashResolution::Committed {
                    receipt: TrashReceipt {
                        operation_id: reservation.request.operation_id.clone(),
                        entry_token: reservation.request.entry_token.clone(),
                        status: TrashStatus::Cancelled,
                        relative_path: reservation.relative_path,
                        kind: reservation.action.kind(),
                        warnings: vec![],
                        preserve_current: true,
                    },
                },
            };
            self.trash_operations
                .lock()
                .map_err(|_| "删除服务不可用")?
                .finish(&reservation.request, resolution.clone())?;
            Ok(resolution)
        })
    }
    pub(crate) fn perform_trash(
        &self,
        reservation: TrashReservation,
        mut warnings: Vec<String>,
        preserve_current: bool,
    ) -> Result<TrashResult, String> {
        let _gate = self.write_gate.lock().map_err(|_| "文件服务不可用")?;
        let request = &reservation.request;
        let outcome = (|| {
            if !self.is_current_workspaces(&request.label, &reservation.registry) {
                return Err("编辑窗口已关闭或更换".into());
            }
            reservation
                .workspace
                .validate_entry_action(&reservation.action)
                .map_err(|error| error.to_string())?;
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
                .position(|window| window.0 == request.label)
                .ok_or("编辑窗口已关闭")?;
            let mut documents = windows
                .iter()
                .map(|window| {
                    window
                        .1
                        .try_lock()
                        .map_err(|_| "文档正在操作，请稍后重新删除".to_owned())
                })
                .collect::<Result<Vec<_>, _>>()?;
            let mut registries = windows
                .iter()
                .map(|window| {
                    window
                        .2
                        .try_lock()
                        .map_err(|_| "目录正在操作，请稍后重新删除".to_owned())
                })
                .collect::<Result<Vec<_>, _>>()?;
            if !Arc::ptr_eq(
                &reservation.workspace,
                &registries[own]
                    .get(&request.workspace_id)
                    .map_err(|error| error.to_string())?,
            ) {
                return Err("工作区已更换或关闭".into());
            }
            reservation
                .workspace
                .validate_entry_action(&reservation.action)
                .map_err(|error| error.to_string())?;
            let action = &reservation.action;
            let operation_key =
                Uuid::parse_str(&request.operation_id).map_err(|_| "删除操作标识无效")?;
            let kind = match action.kind() {
                EntryKind::File => RenameKind::File,
                EntryKind::Directory => RenameKind::Directory,
            };
            let file_lease = if kind == RenameKind::File {
                Some(
                    self.authorities
                        .lease_file(action.directory(), action.name(), &action.source_identity())
                        .and_then(|lease| lease.prepare_trash(operation_key))
                        .map_err(|error| error.to_string())?,
                )
            } else {
                None
            };
            let plans = documents
                .iter_mut()
                .map(|service| {
                    service
                        .prepare_trash(
                            action.directory(),
                            action.name(),
                            action.display_path(),
                            kind,
                            operation_key,
                        )
                        .map_err(|error| error.to_string())
                })
                .collect::<Result<Vec<_>, _>>()?;
            let source = AuthorizedTrashSource::new(
                action.directory(),
                action.name().to_owned(),
                action.source(),
                action.source_identity(),
                action.kind(),
            )
            .map_err(|error| error.to_string())?;
            let live = self.windows.lock().map_err(|_| "窗口服务不可用")?;
            if live.len() != windows.len()
                || windows.iter().any(|(label, docs, roots)| {
                    !live.get(label).is_some_and(|current| {
                        Arc::ptr_eq(&current.documents, docs)
                            && Arc::ptr_eq(&current.workspaces, roots)
                    })
                })
            {
                return Err("窗口会话已更换，未执行删除".into());
            }
            reservation
                .workspace
                .finish_entry_inspection(&request.entry_token)
                .map_err(|error| error.to_string())?;
            let (placement, uncertain_documents) = match trash::trash(&source) {
                Ok(placement) => (Some(placement), vec![]),
                Err(TrashFailure::NotMoved(message)) => return Err(message),
                Err(TrashFailure::MutationUncertain {
                    message,
                    observed_destination,
                }) => {
                    self.clear_file_undo();
                    let diagnostic = Arc::new(super::trash_diagnostic::TrashDiagnostic::new(
                        &request.operation_id,
                        message.clone(),
                        observed_destination,
                        action,
                    ));
                    warnings.push(message);
                    let uncertain = windows
                        .iter()
                        .zip(plans)
                        .map(|(window, plan)| (window.0.clone(), plan.revoke()))
                        .filter(|(_, ids)| !ids.is_empty())
                        .collect();
                    let (removed_roots, uncertain_roots) = revoke_catalog(
                        &windows,
                        &mut registries,
                        action.display_path(),
                        action.kind(),
                        &mut warnings,
                    );
                    return Ok(TrashResult {
                        resolution: TrashResolution::MutationUncertain,
                        documents: vec![],
                        uncertain_documents: uncertain,
                        removed_roots,
                        uncertain_roots,
                        removed: None,
                        diagnostic: Some(diagnostic),
                    });
                }
            };
            let file_lease = match (file_lease, placement.as_ref()) {
                (Some(lease), Some(placement)) => match lease.commit(placement.display_path()) {
                    Ok(lease) => Some(lease),
                    Err(error) => {
                        self.clear_file_undo();
                        let message = format!("文件已回收，但保存lineage交接未确认：{error}");
                        warnings.push(message.clone());
                        let diagnostic = Arc::new(super::trash_diagnostic::TrashDiagnostic::new(
                            &request.operation_id,
                            message,
                            Some(placement.display_path().to_owned()),
                            action,
                        ));
                        let uncertain = windows
                            .iter()
                            .zip(plans)
                            .map(|(window, plan)| (window.0.clone(), plan.revoke()))
                            .filter(|(_, ids)| !ids.is_empty())
                            .collect();
                        let (removed_roots, uncertain_roots) = revoke_catalog(
                            &windows,
                            &mut registries,
                            action.display_path(),
                            action.kind(),
                            &mut warnings,
                        );
                        return Ok(TrashResult {
                            resolution: TrashResolution::MutationUncertain,
                            documents: vec![],
                            uncertain_documents: uncertain,
                            removed_roots,
                            uncertain_roots,
                            removed: None,
                            diagnostic: Some(diagnostic),
                        });
                    }
                },
                _ => None,
            };
            let metadata = windows
                .iter()
                .zip(plans)
                .map(|(window, plan)| (window.0.clone(), plan.commit()))
                .filter(|(_, values)| !values.is_empty())
                .collect();
            let (removed_roots, uncertain_roots) = revoke_catalog(
                &windows,
                &mut registries,
                action.display_path(),
                action.kind(),
                &mut warnings,
            );
            drop(live);
            drop(documents);
            drop(registries);
            if let Some(placement) = placement {
                match self.file_undo.lock() {
                    Ok(mut undo) => undo.record_trash(TrashUndo {
                        placement: Arc::new(placement),
                        original_path: action.display_path().to_owned(),
                        operation_key,
                        file_lease,
                    }),
                    Err(_) => warnings
                        .push("文件已移入回收站，但内置撤销不可用；可从系统回收站恢复".into()),
                }
            }
            let receipt = TrashReceipt {
                operation_id: request.operation_id.clone(),
                entry_token: request.entry_token.clone(),
                status: TrashStatus::Trashed,
                relative_path: reservation.relative_path.clone(),
                kind: action.kind(),
                warnings,
                preserve_current,
            };
            Ok(TrashResult {
                resolution: TrashResolution::Committed { receipt },
                documents: metadata,
                uncertain_documents,
                removed_roots,
                uncertain_roots,
                removed: Some((action.display_path().to_owned(), action.kind())),
                diagnostic: None,
            })
        })();
        let result = match outcome {
            Ok(result) => result,
            Err(message) => TrashResult::resolved(TrashResolution::Rejected { message }),
        };
        let _ = reservation
            .workspace
            .finish_entry_inspection(&request.entry_token);
        self.trash_operations
            .lock()
            .map_err(|_| "删除服务不可用")?
            .finish_with_diagnostic(
                request,
                result.resolution.clone(),
                result.diagnostic.clone(),
            )?;
        Ok(result)
    }

    pub(super) fn restore_trash_in_lane(
        &self,
        request: &super::file_undo::FileUndoRequest,
        root: &Path,
        mut undo: TrashUndo,
    ) -> Result<super::perform_file_undo::FileUndoResult, String> {
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
        let mut documents = windows
            .iter()
            .map(|window| {
                window
                    .1
                    .try_lock()
                    .map_err(|_| "文档正在操作，文件撤销未执行".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()?;
        let mut registries = windows
            .iter()
            .map(|window| {
                window
                    .2
                    .try_lock()
                    .map_err(|_| "目录正在操作，文件撤销未执行".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()?;
        if let Some(file) = &undo.file_lease {
            if let Some(proof) = file.current_source().map_err(|error| error.to_string())? {
                undo.placement = Arc::new(
                    undo.placement
                        .refresh_file_source(undo.operation_key, &proof)
                        .map_err(|error| error.to_string())?,
                );
            }
        }
        let placement = undo.placement.as_ref();
        document_service::DirectoryBookmark::capture(
            &placement.original_parent(),
            undo.original_path.parent().ok_or("原目录无效")?,
        )
        .map_err(|error| error.to_string())?;
        let source_directory = placement
            .entry_directory()
            .map_err(|error| error.to_string())?;
        let identity = placement.source_identity();
        let kind = match placement.kind() {
            EntryKind::File => RenameKind::File,
            EntryKind::Directory => RenameKind::Directory,
        };
        if kind == RenameKind::File && undo.file_lease.is_none() {
            for service in &mut documents {
                if service.has_available_document_at(placement.display_path()) {
                    return Err("此回收站文件正在另一个文稿会话中使用；跨父目录跟随尚未支持，未移动文件，请先另存该稿并从系统回收站恢复".into());
                }
            }
        }
        let plans = documents
            .iter_mut()
            .map(|service| {
                let target = TrashRestoreTarget {
                    parent: placement.original_parent(),
                    name: placement.original_name(),
                    display: &undo.original_path,
                    kind,
                    operation_key: undo.operation_key,
                    source_identity: &identity,
                    source_directory: source_directory.as_deref(),
                    source_display: placement.display_path(),
                };
                match &undo.file_lease {
                    Some(file) => service.prepare_file_trash_restore(target, file),
                    None => service.prepare_trash_restore(target),
                }
                .map_err(|error| error.to_string())
            })
            .collect::<Result<Vec<_>, _>>()?;
        let live = self.windows.lock().map_err(|_| "窗口服务不可用")?;
        if live.len() != windows.len()
            || windows.iter().any(|(label, docs, roots)| {
                !live.get(label).is_some_and(|current| {
                    Arc::ptr_eq(&current.documents, docs) && Arc::ptr_eq(&current.workspaces, roots)
                })
            })
        {
            return Err("窗口会话已更换，文件撤销未执行".into());
        }
        let mut warnings = vec![];
        let changes = match trash::restore(placement) {
            Ok(()) => {
                if let Some(file) = undo.file_lease.take() {
                    if let Err(error) = file.finish_restore() {
                        warnings.push(format!("文件已恢复，但保存lineage未完成：{error}"));
                        let uncertain = windows
                            .iter()
                            .zip(plans)
                            .map(|(window, plan)| (window.0.clone(), plan.revoke()))
                            .filter(|(_, ids)| !ids.is_empty())
                            .collect();
                        let (removed_roots, uncertain_roots) = revoke_catalog(
                            &windows,
                            &mut registries,
                            placement.display_path(),
                            placement.kind(),
                            &mut warnings,
                        );
                        return Ok(super::perform_file_undo::FileUndoResult {
                            resolution: super::FileUndoResolution::MutationUncertain,
                            diagnostic: Some(Arc::new(
                                super::trash_diagnostic::TrashDiagnostic::from_restore(
                                    &request.operation_id,
                                    format!("Restore publication handoff failed: {error}"),
                                    Some(undo.original_path.clone()),
                                    undo.original_path.clone(),
                                    placement,
                                ),
                            )),
                            changes: Some(super::perform_file_undo::UndoChanges::Restored(
                                TrashRestoreChanges {
                                    documents: vec![],
                                    uncertain_documents: uncertain,
                                    removed_roots,
                                    uncertain_roots,
                                    restored: None,
                                },
                            )),
                        });
                    }
                }
                let metadata = windows
                    .iter()
                    .zip(plans)
                    .map(|(window, plan)| (window.0.clone(), plan.commit()))
                    .filter(|(_, values)| !values.is_empty())
                    .collect();
                let (removed_roots, uncertain_roots) = revoke_catalog(
                    &windows,
                    &mut registries,
                    placement.display_path(),
                    placement.kind(),
                    &mut warnings,
                );
                TrashRestoreChanges {
                    documents: metadata,
                    uncertain_documents: vec![],
                    removed_roots,
                    uncertain_roots,
                    restored: Some((undo.original_path.clone(), placement.kind())),
                }
            }
            Err(TrashFailure::NotMoved(message)) => return Err(message),
            Err(TrashFailure::MutationUncertain {
                message,
                observed_destination,
            }) => {
                let diagnostic = Arc::new(super::trash_diagnostic::TrashDiagnostic::from_restore(
                    &request.operation_id,
                    message.clone(),
                    observed_destination,
                    undo.original_path.clone(),
                    placement,
                ));
                warnings.push(message);
                let uncertain = windows
                    .iter()
                    .zip(plans)
                    .map(|(window, plan)| (window.0.clone(), plan.revoke()))
                    .filter(|(_, ids)| !ids.is_empty())
                    .collect();
                let (removed_roots, uncertain_roots) = revoke_catalog(
                    &windows,
                    &mut registries,
                    placement.display_path(),
                    placement.kind(),
                    &mut warnings,
                );
                return Ok(super::perform_file_undo::FileUndoResult {
                    resolution: super::FileUndoResolution::MutationUncertain,
                    diagnostic: Some(diagnostic),
                    changes: Some(super::perform_file_undo::UndoChanges::Restored(
                        TrashRestoreChanges {
                            documents: vec![],
                            uncertain_documents: uncertain,
                            removed_roots,
                            uncertain_roots,
                            restored: None,
                        },
                    )),
                });
            }
        };
        drop(live);
        Ok(super::perform_file_undo::FileUndoResult {
            diagnostic: None,
            resolution: super::FileUndoResolution::Committed {
                receipt: super::FileUndoReceipt {
                    operation_id: request.operation_id.clone(),
                    undo_token: request.undo_token.clone(),
                    restored_relative_path: relative(&undo.original_path, root)?,
                    kind: placement.kind(),
                    warnings,
                },
            },
            changes: Some(super::perform_file_undo::UndoChanges::Restored(changes)),
        })
    }
}

type WindowSnapshot = (String, crate::commands::Documents, Workspaces);
type RootChanges = Vec<(String, Vec<String>)>;
fn revoke_catalog(
    windows: &[WindowSnapshot],
    registries: &mut [std::sync::MutexGuard<'_, file_index::WorkspaceRegistry>],
    path: &Path,
    kind: EntryKind,
    warnings: &mut Vec<String>,
) -> (RootChanges, RootChanges) {
    let mut removed = vec![];
    let mut uncertain = vec![];
    for (window, registry) in windows.iter().zip(registries) {
        let before = registry.ids();
        if let Err(error) = registry.invalidate_removed_entries(path) {
            warnings.push(format!("旧条目授权已停用，请重新选择目录：{error}"));
        }
        if kind == EntryKind::Directory {
            if let Err(error) = registry.detach_removed_directory(path) {
                warnings.push(format!("删除后的目录状态未完全确认：{error}"));
            }
        }
        let deleted = before
            .iter()
            .filter(|id| registry.get(id).is_err())
            .cloned()
            .collect::<Vec<_>>();
        let revoked = before
            .iter()
            .filter(|id| {
                registry
                    .get(id)
                    .is_ok_and(|workspace| workspace.metadata(id).is_err())
            })
            .cloned()
            .collect::<Vec<_>>();
        if !deleted.is_empty() {
            removed.push((window.0.clone(), deleted));
        }
        if !revoked.is_empty() {
            uncertain.push((window.0.clone(), revoked));
        }
    }
    (removed, uncertain)
}
fn relative(path: &Path, root: &Path) -> Result<Option<String>, String> {
    match path.strip_prefix(root) {
        Ok(path) if !path.as_os_str().is_empty() => Ok(Some(
            path.to_str()
                .ok_or("文件路径无法编码")?
                .replace(std::path::MAIN_SEPARATOR, "/"),
        )),
        _ => Ok(None),
    }
}
