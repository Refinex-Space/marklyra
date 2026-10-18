//! Bounded, window-owned receipts for non-mutating entry actions. The native
//! dispatch consumes a validated inspection; resolving never dispatches again.
use super::WindowServices;
use file_index::{InspectedEntryAction, Workspace};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum EntryActionKind {
    OpenNew,
    Info,
    CopyPath,
    Reveal,
    Move,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EntryActionReceipt {
    operation_id: String,
    entry_token: String,
    action: EntryActionKind,
    window_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    workspace: Option<EntryWorkspace>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    warnings: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    move_entry: Option<MoveEntryPreview>,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct MoveEntryPreview {
    relative_path: String,
    kind: file_index::EntryKind,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
struct EntryWorkspace {
    id: String,
    name: String,
    path: String,
}
#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(crate) enum EntryActionResolution {
    Prepared,
    Committed { receipt: EntryActionReceipt },
    Rejected { message: String },
    MutationUncertain { message: String },
}
#[derive(Clone, PartialEq, Eq)]
struct Request {
    workspace: String,
    token: String,
    action: EntryActionKind,
    destination: Option<String>,
}
#[derive(Default)]
pub(super) struct EntryActions {
    requests: HashMap<String, (Request, EntryActionResolution)>,
}
impl EntryActions {
    fn begin(
        &mut self,
        operation: &str,
        request: Request,
    ) -> Result<Option<EntryActionResolution>, String> {
        canonical(operation)?;
        canonical(&request.token)?;
        if let Some((before, state)) = self.requests.get(operation) {
            return if before == &request {
                Ok(Some(state.clone()))
            } else {
                Err("操作标识已用于不同文件动作".into())
            };
        }
        if self.requests.len() >= 256 {
            return Err("文件动作回执已达窗口上限".into());
        }
        self.requests
            .insert(operation.into(), (request, EntryActionResolution::Prepared));
        Ok(None)
    }
}
pub(crate) enum EntryActionStart {
    Resolved(EntryActionResolution),
    Ready(EntryActionTicket),
}
pub(crate) struct EntryActionTicket {
    label: String,
    operation: String,
    request: Request,
    store: Arc<Mutex<EntryActions>>,
    workspace: Arc<Workspace>,
    plan: Option<Box<InspectedEntryAction>>,
    root: Option<document_service::DirectoryBookmark>,
}
impl EntryActionTicket {
    pub(crate) fn finish(
        self,
        dispatched: Result<Option<String>, String>,
    ) -> EntryActionResolution {
        self.finish_with_workspace(dispatched, None)
    }
    pub(crate) fn finish_with_workspace(
        self,
        dispatched: Result<Option<String>, String>,
        workspace: Option<file_index::WorkspacePayload>,
    ) -> EntryActionResolution {
        self.finish_full(dispatched, workspace, vec![], None)
    }
    pub(crate) fn finish_move(
        self,
        receipt: file_index::EntryMoveReceipt,
    ) -> EntryActionResolution {
        if receipt.operation_id != self.operation || receipt.entry_token != self.request.token {
            return self.finish(Err("移动终态不属于当前请求".into()));
        }
        let preview = self
            .workspace
            .display_root_snapshot()
            .ok()
            .and_then(|root| {
                std::path::Path::new(&receipt.path)
                    .strip_prefix(root)
                    .ok()
                    .and_then(|path| path.to_str())
                    .filter(|path| !path.is_empty())
                    .map(|path| MoveEntryPreview {
                        relative_path: path.replace(std::path::MAIN_SEPARATOR, "/"),
                        kind: receipt.kind,
                    })
            });
        self.finish_full(Ok(None), None, receipt.warnings, preview)
    }
    fn finish_full(
        self,
        dispatched: Result<Option<String>, String>,
        workspace: Option<file_index::WorkspacePayload>,
        warnings: Vec<String>,
        move_entry: Option<MoveEntryPreview>,
    ) -> EntryActionResolution {
        let state = match dispatched {
            Ok(window_label) => EntryActionResolution::Committed {
                receipt: EntryActionReceipt {
                    operation_id: self.operation.clone(),
                    entry_token: self.request.token.clone(),
                    action: self.request.action,
                    window_label,
                    workspace: workspace.map(|value| EntryWorkspace {
                        id: value.id,
                        name: value.name,
                        path: value.path,
                    }),
                    warnings,
                    move_entry,
                },
            },
            Err(message) => EntryActionResolution::MutationUncertain { message },
        };
        match self.store.lock() {
            Ok(mut store) => match store.requests.get_mut(&self.operation) {
                Some((request, current))
                    if request == &self.request
                        && matches!(current, EntryActionResolution::Prepared) =>
                {
                    *current = state.clone();
                    state
                }
                _ => EntryActionResolution::MutationUncertain {
                    message: "文件动作回执已更换；不会重放".into(),
                },
            },
            Err(_) => EntryActionResolution::MutationUncertain {
                message: "文件动作回执不可用；不会重放".into(),
            },
        }
    }
}
impl WindowServices {
    pub(crate) fn begin_entry_action(
        &self,
        label: &str,
        workspace: &str,
        token: &str,
        operation: &str,
        action: EntryActionKind,
    ) -> Result<EntryActionStart, String> {
        self.begin_entry_action_at(label, workspace, token, operation, action, None)
    }
    pub(crate) fn begin_entry_move_action(
        &self,
        label: &str,
        workspace: &str,
        token: &str,
        operation: &str,
        destination: Option<&str>,
    ) -> Result<EntryActionStart, String> {
        if let Some(destination) = destination {
            canonical(destination)?;
        }
        self.begin_entry_action_at(
            label,
            workspace,
            token,
            operation,
            EntryActionKind::Move,
            destination.map(str::to_owned),
        )
    }
    fn begin_entry_action_at(
        &self,
        label: &str,
        workspace: &str,
        token: &str,
        operation: &str,
        action: EntryActionKind,
        destination: Option<String>,
    ) -> Result<EntryActionStart, String> {
        self.with_file_lane(|| {
            let registry = self.get_workspaces(label)?;
            let selected = registry
                .lock()
                .map_err(|_| "目录状态不可用")?
                .get(workspace)
                .map_err(|e| e.to_string())?;
            let store = self
                .windows
                .lock()
                .map_err(|_| "窗口服务不可用")?
                .get(label)
                .map(|s| Arc::clone(&s.entry_actions))
                .ok_or("窗口已关闭")?;
            let request = Request {
                workspace: workspace.into(),
                token: token.into(),
                action,
                destination,
            };
            if let Some(state) = store
                .lock()
                .map_err(|_| "文件动作回执不可用")?
                .begin(operation, request.clone())?
            {
                return Ok(EntryActionStart::Resolved(state));
            }
            let preparation = if token == workspace && action == EntryActionKind::CopyPath {
                selected.bookmark().map(|root| (None, Some(root)))
            } else {
                selected
                    .prepare_entry_action(token)
                    .map(|plan| (Some(Box::new(plan)), None))
            };
            let (plan, root) = match preparation {
                Ok(prepared) => prepared,
                Err(error) => {
                    let state = EntryActionResolution::Rejected {
                        message: error.to_string(),
                    };
                    if let Some((_, current)) = store
                        .lock()
                        .map_err(|_| "文件动作回执不可用")?
                        .requests
                        .get_mut(operation)
                    {
                        *current = state.clone();
                    }
                    return Ok(EntryActionStart::Resolved(state));
                }
            };
            Ok(EntryActionStart::Ready(EntryActionTicket {
                label: label.into(),
                operation: operation.into(),
                request,
                store,
                workspace: selected,
                plan,
                root,
            }))
        })
    }
    /// Last capability check before the native action. Never hold the file lane
    /// while waiting for AppKit, a WebView builder or clipboard main-thread work.
    pub(crate) fn prepare_entry_dispatch<T>(
        &self,
        ticket: &EntryActionTicket,
        capture: impl FnOnce(&Workspace, Option<&InspectedEntryAction>) -> Result<T, String>,
    ) -> Result<T, String> {
        self.with_file_lane(|| {
            let registry = self.get_workspaces(&ticket.label)?;
            let selected = registry
                .lock()
                .map_err(|_| "目录状态不可用")?
                .get(&ticket.request.workspace)
                .map_err(|e| e.to_string())?;
            let current = self
                .windows
                .lock()
                .map_err(|_| "窗口服务不可用")?
                .get(&ticket.label)
                .map(|s| Arc::clone(&s.entry_actions))
                .ok_or("窗口已关闭")?;
            if !Arc::ptr_eq(&current, &ticket.store) || !Arc::ptr_eq(&selected, &ticket.workspace) {
                return Err("文件动作所属窗口或目录已更换".into());
            }
            let validate = || {
                if let Some(plan) = &ticket.plan {
                    selected
                        .validate_entry_action(plan)
                        .map_err(|e| e.to_string())
                } else if Some(selected.bookmark().map_err(|e| e.to_string())?) == ticket.root {
                    Ok(())
                } else {
                    Err("目录根授权或位置已更换".into())
                }
            };
            validate()?;
            let result = capture(&selected, ticket.plan.as_deref())?;
            validate()?;
            if ticket.plan.is_some() {
                selected
                    .finish_entry_inspection(&ticket.request.token)
                    .map_err(|e| e.to_string())?;
            }
            Ok(result)
        })
    }
    pub(crate) fn validate_entry_owner(&self, ticket: &EntryActionTicket) -> Result<(), String> {
        self.with_file_lane(|| {
            let registry = self.get_workspaces(&ticket.label)?;
            let selected = registry
                .lock()
                .map_err(|_| "目录状态不可用")?
                .get(&ticket.request.workspace)
                .map_err(|e| e.to_string())?;
            let windows = self.windows.lock().map_err(|_| "窗口服务不可用")?;
            let current = windows.get(&ticket.label).ok_or("窗口已关闭")?;
            if Arc::ptr_eq(&current.entry_actions, &ticket.store)
                && Arc::ptr_eq(&selected, &ticket.workspace)
            {
                Ok(())
            } else {
                Err("文件动作所属窗口或目录已更换".into())
            }
        })
    }
    pub(crate) fn reject_entry_action(
        &self,
        ticket: EntryActionTicket,
        message: String,
    ) -> EntryActionResolution {
        let state = EntryActionResolution::Rejected { message };
        if let Ok(mut store) = ticket.store.lock() {
            if let Some((_, current)) = store.requests.get_mut(&ticket.operation) {
                *current = state.clone();
            }
        }
        state
    }
    pub(crate) fn resolve_entry_action(
        &self,
        label: &str,
        workspace: &str,
        token: &str,
        operation: &str,
        action: EntryActionKind,
    ) -> Result<Option<EntryActionResolution>, String> {
        self.resolve_entry_action_at(label, workspace, token, operation, action, None)
    }
    pub(crate) fn resolve_entry_move_action(
        &self,
        label: &str,
        workspace: &str,
        token: &str,
        operation: &str,
        destination: Option<&str>,
    ) -> Result<Option<EntryActionResolution>, String> {
        if let Some(destination) = destination {
            canonical(destination)?;
        }
        self.resolve_entry_action_at(
            label,
            workspace,
            token,
            operation,
            EntryActionKind::Move,
            destination.map(str::to_owned),
        )
    }
    fn resolve_entry_action_at(
        &self,
        label: &str,
        workspace: &str,
        token: &str,
        operation: &str,
        action: EntryActionKind,
        destination: Option<String>,
    ) -> Result<Option<EntryActionResolution>, String> {
        canonical(operation)?;
        canonical(token)?;
        let store = self
            .windows
            .lock()
            .map_err(|_| "窗口服务不可用")?
            .get(label)
            .map(|s| Arc::clone(&s.entry_actions))
            .ok_or("窗口已关闭")?;
        let store = store.lock().map_err(|_| "文件动作回执不可用")?;
        let request = Request {
            workspace: workspace.into(),
            token: token.into(),
            action,
            destination,
        };
        match store.requests.get(operation) {
            Some((expected, state)) if *expected == request => Ok(Some(state.clone())),
            Some(_) => Err("文件动作回执不属于当前请求".into()),
            None => Ok(None),
        }
    }
}
fn canonical(value: &str) -> Result<(), String> {
    if uuid::Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value) {
        Ok(())
    } else {
        Err("操作和条目令牌必须是标准UUID".into())
    }
}

#[cfg(test)]
mod tests;
