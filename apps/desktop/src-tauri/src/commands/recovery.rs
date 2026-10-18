//! Crash-draft IPC. Paths are metadata; live sessions belong to one native window.
use recovery_store::{
    CheckpointReceipt, CheckpointRequest, RecoveryDraft, RecoveryListing, RecoverySession,
    RecoveryStore,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FallbackContext {
    owner: String,
    active_owners: Vec<String>,
    active_labels: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FallbackRequest {
    id: String,
    version: u64,
    owner: Option<String>,
    legacy_label: Option<String>,
    content: recovery_store::DraftContent,
}
#[derive(Default)]
struct RecoveryState {
    store: Option<RecoveryStore>,
    windows: HashSet<String>,
    owners: HashMap<String, (String, String)>,
    fallback_owners: HashMap<String, String>,
}
impl RecoveryState {
    fn store(&mut self) -> Result<&mut RecoveryStore, String> {
        self.store
            .as_mut()
            .ok_or_else(|| "恢复存储初始化失败".into())
    }
    fn require_window(&self, label: &str) -> Result<(), String> {
        if self.windows.contains(label) {
            Ok(())
        } else {
            Err("编辑窗口已关闭或未注册".into())
        }
    }
    fn require_owner(&self, label: &str, id: &str) -> Result<(), String> {
        self.require_window(label)?;
        if self.owners.get(id).is_some_and(|(owner, _)| owner == label) {
            Ok(())
        } else {
            Err("恢复会话不属于当前窗口".into())
        }
    }
    fn require_access(&self, label: &str, id: &str) -> Result<(), String> {
        self.require_window(label)?;
        if self.owners.get(id).is_some_and(|(owner, _)| owner != label) {
            Err("恢复草稿正在其他窗口使用".into())
        } else {
            Ok(())
        }
    }
    fn begin(&mut self, label: &str) -> Result<RecoverySession, String> {
        self.require_window(label)?;
        let session = self.store()?.begin().map_err(|error| error.to_string())?;
        self.owners
            .insert(session.id.clone(), (label.into(), session.lease.clone()));
        Ok(session)
    }
    fn list(&mut self, label: &str) -> Result<RecoveryListing, String> {
        self.require_window(label)?;
        let mut listing = self.store()?.list().map_err(|error| error.to_string())?;
        listing
            .drafts
            .retain(|entry| self.require_access(label, &entry.id).is_ok());
        listing
            .saved_copies
            .retain(|entry| self.require_access(label, &entry.id).is_ok());
        Ok(listing)
    }
    fn checkpoint(
        &mut self,
        label: &str,
        checkpoint: CheckpointRequest,
    ) -> Result<CheckpointReceipt, String> {
        self.require_owner(label, &checkpoint.id)?;
        self.store()?
            .checkpoint(checkpoint)
            .map_err(|error| error.to_string())
    }
    fn read(&mut self, label: &str, id: &str, version: u64) -> Result<RecoveryDraft, String> {
        self.require_access(label, id)?;
        self.store()?
            .read(id, version)
            .map_err(|error| error.to_string())
    }
    fn consume(
        &mut self,
        label: &str,
        id: &str,
        version: u64,
        lease: Option<&str>,
    ) -> Result<(), String> {
        self.require_access(label, id)?;
        self.store()?
            .consume(id, version, lease)
            .map_err(|error| error.to_string())?;
        self.owners.remove(id);
        Ok(())
    }
    fn end(&mut self, label: &str, id: &str, lease: &str) -> Result<(), String> {
        self.require_owner(label, id)?;
        self.store()?
            .end(id, lease)
            .map_err(|error| error.to_string())?;
        self.owners.remove(id);
        Ok(())
    }
    fn fallback_context(&mut self, label: &str) -> Result<FallbackContext, String> {
        self.require_window(label)?;
        let owner = self
            .fallback_owners
            .entry(label.into())
            .or_insert_with(|| uuid::Uuid::new_v4().to_string())
            .clone();
        Ok(FallbackContext {
            owner,
            active_owners: self.fallback_owners.values().cloned().collect(),
            active_labels: self.windows.iter().cloned().collect(),
        })
    }
    fn import_fallback(
        &mut self,
        label: &str,
        fallback: FallbackRequest,
    ) -> Result<recovery_store::FallbackReceipt, String> {
        self.require_window(label)?;
        if fallback
            .owner
            .as_ref()
            .is_some_and(|owner| self.fallback_owners.values().any(|active| active == owner))
            || fallback
                .legacy_label
                .as_ref()
                .is_some_and(|label| self.windows.contains(label))
        {
            return Err("本地副本仍由运行中的编辑窗口使用，不能导入".into());
        }
        self.store()?
            .import_fallback(&fallback.id, fallback.version, fallback.content)
            .map_err(|error| error.to_string())
    }
    fn release(&mut self, label: &str) -> Result<(), String> {
        self.windows.remove(label);
        self.fallback_owners.remove(label);
        let sessions: Vec<_> = self
            .owners
            .iter()
            .filter(|(_, (owner, _))| owner == label)
            .map(|(id, (_, lease))| (id.clone(), lease.clone()))
            .collect();
        for (id, lease) in sessions {
            match self.store()?.end(&id, &lease) {
                Ok(()) | Err(recovery_store::RecoveryError::InvalidSession) => {
                    // A consume can durably tombstone and revoke the session,
                    // then report a cleanup IO error. Closing still releases its
                    // host ownership; it never deletes or resurrects a draft.
                    self.owners.remove(&id);
                }
                Err(error) => return Err(error.to_string()),
            }
        }
        Ok(())
    }
}
#[derive(Default, Clone)]
pub struct RecoveryHost {
    state: Arc<Mutex<RecoveryState>>,
}
impl RecoveryHost {
    pub fn register_window(&self, label: &str) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|_| "恢复存储状态不可用")?;
        if !state.windows.insert(label.into()) {
            return Err("恢复窗口已注册".into());
        }
        Ok(())
    }
    pub fn release_window(&self, label: &str) -> Result<(), String> {
        self.state
            .lock()
            .map_err(|_| "恢复存储状态不可用")?
            .release(label)
    }
}
async fn run<T: Send + 'static>(
    app: AppHandle,
    label: String,
    host: &RecoveryHost,
    operation: impl FnOnce(&mut RecoveryState, &str) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    let host = host.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = host
            .state
            .lock()
            .map_err(|_| "恢复存储状态不可用，请重新启动应用")?;
        state.require_window(&label)?;
        if state.store.is_none() {
            let root = app
                .path()
                .app_data_dir()
                .map_err(|error| error.to_string())?
                .join("recovery-v1");
            state.store = Some(RecoveryStore::open(&root).map_err(|error| error.to_string())?);
        }
        operation(&mut state, &label)
    })
    .await
    .map_err(|_| "恢复存储任务未能完成".to_owned())?
}
#[tauri::command]
pub async fn begin_recovery_session(
    app: AppHandle,
    window: WebviewWindow,
    recovery: State<'_, RecoveryHost>,
) -> Result<RecoverySession, String> {
    run(
        app,
        window.label().into(),
        recovery.inner(),
        RecoveryState::begin,
    )
    .await
}
#[tauri::command]
pub async fn checkpoint_recovery(
    app: AppHandle,
    window: WebviewWindow,
    checkpoint: CheckpointRequest,
    recovery: State<'_, RecoveryHost>,
) -> Result<CheckpointWithImages, String> {
    let captured = super::images::capture_checkpoint_images(&window, &checkpoint.content.text)
        .and_then(|current| {
            super::images::select_checkpoint_images(
                &app,
                &checkpoint.id,
                checkpoint.expected_version,
                &checkpoint.content.text,
                current,
            )
        });
    let receipt = run(
        app.clone(),
        window.label().into(),
        recovery.inner(),
        move |state, label| state.checkpoint(label, checkpoint),
    )
    .await?;
    // Association comes from this window's native-created draft, never from
    // Markdown paths or an extra renderer-supplied image capability.
    let image_warning = captured
        .and_then(|snapshot| {
            super::images::checkpoint_images(&app, &receipt.id, receipt.version, snapshot)
        })
        .err();
    Ok(CheckpointWithImages {
        receipt,
        image_warning,
    })
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointWithImages {
    #[serde(flatten)]
    receipt: CheckpointReceipt,
    image_warning: Option<String>,
}
#[tauri::command]
pub async fn list_recovery_drafts(
    app: AppHandle,
    window: WebviewWindow,
    recovery: State<'_, RecoveryHost>,
) -> Result<RecoveryListing, String> {
    run(
        app,
        window.label().into(),
        recovery.inner(),
        RecoveryState::list,
    )
    .await
}
#[tauri::command]
pub async fn read_recovery_draft(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    version: u64,
    recovery: State<'_, RecoveryHost>,
) -> Result<ReadDraft, String> {
    let draft = run(
        app.clone(),
        window.label().into(),
        recovery.inner(),
        move |state, label| state.read(label, &id, version),
    )
    .await?;
    let (image_context, image_warning) =
        match super::images::restore_recovery_images(&app, &window, &draft.id, draft.version) {
            Ok(context) => (context, None),
            Err(error) => (None, Some(error)),
        };
    Ok(ReadDraft {
        draft,
        image_context,
        image_warning,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadDraft {
    #[serde(flatten)]
    draft: RecoveryDraft,
    image_context: Option<String>,
    image_warning: Option<String>,
}
#[tauri::command]
pub async fn consume_recovery_draft(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    version: u64,
    lease: Option<String>,
    recovery: State<'_, RecoveryHost>,
) -> Result<(), String> {
    run(
        app,
        window.label().into(),
        recovery.inner(),
        move |state, label| state.consume(label, &id, version, lease.as_deref()),
    )
    .await
}
#[tauri::command]
pub async fn end_recovery_session(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    lease: String,
    recovery: State<'_, RecoveryHost>,
) -> Result<(), String> {
    run(
        app,
        window.label().into(),
        recovery.inner(),
        move |state, label| state.end(label, &id, &lease),
    )
    .await
}

#[tauri::command]
pub async fn fallback_recovery_context(
    app: AppHandle,
    window: WebviewWindow,
    recovery: State<'_, RecoveryHost>,
) -> Result<FallbackContext, String> {
    // run opens and retains the exclusive store lock before granting an owner.
    // A second process cannot classify a first process's localStorage as orphaned.
    run(
        app,
        window.label().into(),
        recovery.inner(),
        RecoveryState::fallback_context,
    )
    .await
}
#[tauri::command]
pub async fn import_fallback_recovery(
    app: AppHandle,
    window: WebviewWindow,
    fallback: FallbackRequest,
    recovery: State<'_, RecoveryHost>,
) -> Result<recovery_store::FallbackReceipt, String> {
    run(
        app,
        window.label().into(),
        recovery.inner(),
        move |state, label| state.import_fallback(label, fallback),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use recovery_store::DraftContent;
    fn fixture() -> (tempfile::TempDir, RecoveryState) {
        let temp = tempfile::tempdir().unwrap();
        let mut state = RecoveryState {
            store: Some(RecoveryStore::open(temp.path()).unwrap()),
            ..Default::default()
        };
        state
            .windows
            .extend(["main".into(), "editor-second".into()]);
        (temp, state)
    }
    fn checkpoint(state: &mut RecoveryState, session: &RecoverySession) {
        state
            .checkpoint(
                &state.owners[&session.id].0.clone(),
                CheckpointRequest {
                    id: session.id.clone(),
                    lease: session.lease.clone(),
                    expected_version: 0,
                    sequence: 1,
                    content: DraftContent {
                        text: "unsaved".into(),
                        saved_text: "".into(),
                        document: None,
                        selection: None,
                    },
                },
            )
            .unwrap();
    }
    #[test]
    fn active_drafts_are_private_until_window_releases_ownership() {
        let (_temp, mut state) = fixture();
        let a = state.begin("main").unwrap();
        let b = state.begin("editor-second").unwrap();
        checkpoint(&mut state, &a);
        checkpoint(&mut state, &b);
        assert_eq!(state.list("main").unwrap().drafts.len(), 1);
        assert_eq!(state.list("editor-second").unwrap().drafts[0].id, b.id);
        assert!(state.require_owner("editor-second", &a.id).is_err());
        assert!(state.require_access("editor-second", &a.id).is_err());
        assert!(state
            .checkpoint(
                "editor-second",
                CheckpointRequest {
                    id: a.id.clone(),
                    lease: a.lease.clone(),
                    expected_version: 1,
                    sequence: 2,
                    content: DraftContent {
                        text: "must not replace".into(),
                        saved_text: "".into(),
                        document: None,
                        selection: None
                    },
                }
            )
            .is_err());
        assert_eq!(
            state.read("main", &a.id, 1).unwrap().content.text,
            "unsaved"
        );
        assert!(state.read("editor-second", &a.id, 1).is_err());
        assert!(state
            .consume("editor-second", &a.id, 1, Some(&a.lease))
            .is_err());
        assert!(state.end("editor-second", &a.id, &a.lease).is_err());
        state.release("main").unwrap();
        assert!(state.begin("main").is_err());
        assert!(!state.windows.contains("main"));
        assert!(state.require_owner("main", &a.id).is_err());
        assert!(state.require_owner("editor-second", &b.id).is_ok());
        let listing = state.list("editor-second").unwrap();
        assert_eq!(listing.drafts.len(), 2);
        assert!(
            !listing
                .drafts
                .iter()
                .find(|draft| draft.id == a.id)
                .unwrap()
                .active
        );
        state.require_access("editor-second", &a.id).unwrap();
        let draft = state.read("editor-second", &a.id, 1).unwrap();
        assert_eq!(draft.content.text, "unsaved");
        state.consume("editor-second", &a.id, 1, None).unwrap();
        assert_eq!(state.list("editor-second").unwrap().drafts[0].id, b.id);
    }
    #[test]
    fn close_releases_ownership_when_store_already_revoked_a_consumed_session() {
        let (_temp, mut state) = fixture();
        let session = state.begin("main").unwrap();
        checkpoint(&mut state, &session);
        state
            .store()
            .unwrap()
            .consume(&session.id, 1, Some(&session.lease))
            .unwrap();
        // Models the store already revoking the session before a later disk
        // cleanup error prevents the host from updating its owner map.
        assert!(state.owners.contains_key(&session.id));
        state.release("main").unwrap();
        assert!(!state.owners.contains_key(&session.id));
        assert!(state.list("editor-second").unwrap().drafts.is_empty());
    }
    #[test]
    fn fallback_import_rechecks_live_owners_and_keeps_original_metadata() {
        let (_temp, mut state) = fixture();
        let context = state.fallback_context("main").unwrap();
        let request = || FallbackRequest {
            id: "00000000-0000-4000-8000-000000000099".into(),
            version: 1,
            owner: Some(context.owner.clone()),
            legacy_label: None,
            content: DraftContent {
                text: "\u{feff}中\r\n文".into(),
                saved_text: "".into(),
                document: None,
                selection: None,
            },
        };
        assert!(state.import_fallback("editor-second", request()).is_err());
        assert!(state.import_fallback("main", request()).is_err());
        state.release("main").unwrap();
        let imported = state.import_fallback("editor-second", request()).unwrap();
        assert_eq!(
            state
                .read("editor-second", &imported.id, imported.version)
                .unwrap()
                .content,
            request().content
        );
        assert_eq!(
            state
                .import_fallback("editor-second", request())
                .unwrap()
                .id,
            imported.id
        );
    }
    #[test]
    fn recovery_registration_is_explicit_and_release_is_idempotent() {
        let host = RecoveryHost::default();
        host.register_window("main").unwrap();
        assert!(host.register_window("main").is_err());
        host.release_window("main").unwrap();
        host.release_window("main").unwrap();
        assert!(!host.state.lock().unwrap().windows.contains("main"));
    }
}
