use file_index::EntryKind;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

const MAX_OPERATIONS: usize = 4096;

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct TrashRequest {
    pub label: String,
    pub workspace_id: String,
    pub entry_token: String,
    pub operation_id: String,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum TrashStatus {
    Trashed,
    Cancelled,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrashReceipt {
    pub operation_id: String,
    pub entry_token: String,
    pub status: TrashStatus,
    pub relative_path: String,
    pub kind: EntryKind,
    pub warnings: Vec<String>,
    pub preserve_current: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub(crate) enum TrashResolution {
    Prepared,
    Committed { receipt: TrashReceipt },
    Rejected { message: String },
    MutationUncertain,
}

struct Operation {
    request: TrashRequest,
    resolution: TrashResolution,
    diagnostic: Option<Arc<super::trash_diagnostic::TrashDiagnostic>>,
}

#[derive(Default)]
pub(super) struct TrashOperations {
    operations: HashMap<String, Operation>,
}
impl TrashOperations {
    pub fn resolve(&self, request: &TrashRequest) -> Result<Option<TrashResolution>, String> {
        for value in [&request.operation_id, &request.entry_token] {
            if !Uuid::parse_str(value).is_ok_and(|id| id.hyphenated().to_string() == *value) {
                return Err("删除操作标识无效".into());
            }
        }
        match self.operations.get(&request.operation_id) {
            Some(operation) if operation.request == *request => {
                Ok(Some(operation.resolution.clone()))
            }
            Some(_) => Err("删除操作标识已用于不同参数".into()),
            None => Ok(None),
        }
    }
    pub fn reserve(&mut self, request: TrashRequest) -> Result<(), String> {
        if self.resolve(&request)?.is_some() {
            return Err("删除请求已经存在，请核对结果".into());
        }
        if self.operations.len() >= MAX_OPERATIONS {
            return Err("删除操作回执已达本次应用会话上限，请重启应用后重试".into());
        }
        let busy = self.operations.values().any(|operation| {
            operation.request.label == request.label
                && matches!(operation.resolution, TrashResolution::Prepared)
        });
        let resolution = if busy {
            TrashResolution::Rejected {
                message: "此窗口已有删除请求，请先完成或取消确认".into(),
            }
        } else {
            TrashResolution::Prepared
        };
        self.operations.insert(
            request.operation_id.clone(),
            Operation {
                request,
                resolution,
                diagnostic: None,
            },
        );
        if busy {
            Err("此窗口已有删除请求，请先完成或取消确认".into())
        } else {
            Ok(())
        }
    }
    pub fn finish(
        &mut self,
        request: &TrashRequest,
        resolution: TrashResolution,
    ) -> Result<(), String> {
        self.finish_with_diagnostic(request, resolution, None)
    }

    pub fn finish_with_diagnostic(
        &mut self,
        request: &TrashRequest,
        resolution: TrashResolution,
        diagnostic: Option<Arc<super::trash_diagnostic::TrashDiagnostic>>,
    ) -> Result<(), String> {
        let operation = self
            .operations
            .get_mut(&request.operation_id)
            .filter(|operation| operation.request == *request)
            .ok_or("删除请求已失效")?;
        if !matches!(operation.resolution, TrashResolution::Prepared)
            || matches!(resolution, TrashResolution::Prepared)
        {
            return Err("删除请求已经结束，不能重新执行".into());
        }
        operation.resolution = resolution;
        operation.diagnostic = diagnostic;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> TrashRequest {
        TrashRequest {
            label: "main".into(),
            workspace_id: "workspace".into(),
            entry_token: Uuid::new_v4().to_string(),
            operation_id: Uuid::new_v4().to_string(),
        }
    }
    #[test]
    fn one_pending_confirmation_per_window_and_final_receipts_are_never_reopened() {
        let mut store = TrashOperations::default();
        let first = request();
        store.reserve(first.clone()).unwrap();
        let other = request();
        assert!(store.reserve(other.clone()).is_err());
        assert!(matches!(
            store.resolve(&other).unwrap(),
            Some(TrashResolution::Rejected { .. })
        ));
        store
            .finish(
                &first,
                TrashResolution::Rejected {
                    message: "cancelled before IO".into(),
                },
            )
            .unwrap();
        assert!(store.reserve(first.clone()).is_err());
        assert!(store.finish(&first, TrashResolution::Prepared).is_err());
        store.reserve(request()).unwrap();
    }
    #[test]
    fn resolution_is_bound_to_window_workspace_and_inspected_entity() {
        let mut store = TrashOperations::default();
        let first = request();
        store.reserve(first.clone()).unwrap();
        let mut foreign = first.clone();
        foreign.entry_token = Uuid::new_v4().to_string();
        assert!(store.resolve(&foreign).is_err());
        foreign = first.clone();
        foreign.label = "other".into();
        assert!(store.resolve(&foreign).is_err());
        foreign = first;
        foreign.workspace_id = "other".into();
        assert!(store.resolve(&foreign).is_err());
    }
}
