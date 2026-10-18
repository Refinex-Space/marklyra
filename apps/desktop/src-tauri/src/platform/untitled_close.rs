//! Native choice only. NSDocument never owns source, file URLs or persistence;
//! the caller writes a selected path through the existing document service.
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{mpsc, Arc, Mutex, OnceLock},
};
use tauri::{AppHandle, Runtime, WebviewWindow, Window, WindowEvent};
use uuid::Uuid;

#[cfg(target_os = "macos")]
mod macos;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Choice {
    Save(PathBuf),
    Discard,
    Cancel,
    #[cfg(not(target_os = "macos"))]
    Unsupported,
}
type Outcome = Result<Choice, String>;
struct Pending {
    id: Uuid,
    label: String,
    sender: Mutex<Option<mpsc::Sender<Outcome>>>,
}
impl Pending {
    fn finish(&self, result: Outcome) -> bool {
        let sender = self
            .sender
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take();
        sender.is_some_and(|sender| sender.send(result).is_ok())
    }
    #[cfg(target_os = "macos")]
    fn active(&self) -> bool {
        self.sender.lock().is_ok_and(|sender| sender.is_some())
    }
}
#[derive(Default)]
struct Registry(HashMap<String, Arc<Pending>>);
impl Registry {
    fn insert(&mut self, pending: Arc<Pending>) -> Result<(), String> {
        if self.0.contains_key(&pending.label) {
            return Err("此窗口已有保存确认".into());
        }
        if self.0.len() >= 32 {
            return Err("保存确认窗口已达上限".into());
        }
        self.0.insert(pending.label.clone(), pending);
        Ok(())
    }
    fn release(&mut self, pending: &Pending) {
        if self
            .0
            .get(&pending.label)
            .is_some_and(|current| current.id == pending.id)
        {
            self.0.remove(&pending.label);
        }
    }
}
fn registry() -> &'static Mutex<Registry> {
    static REGISTRY: OnceLock<Mutex<Registry>> = OnceLock::new();
    REGISTRY.get_or_init(Mutex::default)
}
fn finish(pending: &Pending, result: Outcome) {
    pending.finish(result);
    registry()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .release(pending);
}

pub(crate) async fn select(
    app: &AppHandle,
    window: &WebviewWindow,
    suggested: &str,
    extension: &str,
) -> Outcome {
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, window, suggested, extension);
        Ok(Choice::Unsupported)
    }
    #[cfg(target_os = "macos")]
    {
        window.is_visible().map_err(|_| "保存确认窗口已关闭")?;
        let (sender, receiver) = mpsc::channel();
        let pending = Arc::new(Pending {
            id: Uuid::new_v4(),
            label: window.label().into(),
            sender: Mutex::new(Some(sender)),
        });
        registry()
            .lock()
            .map_err(|_| "保存确认状态不可用")?
            .insert(pending.clone())?;
        let queued = pending.clone();
        let parent = window.clone();
        let suggestion = suggested.to_owned();
        let extension = extension.to_owned();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = macos::begin(&parent, &suggestion, &extension, queued.clone()) {
                finish(&queued, Err(error));
            }
        }) {
            finish(&pending, Err(format!("无法显示保存确认：{error}")));
        }
        let result = tauri::async_runtime::spawn_blocking(move || {
            receiver.recv().map_err(|_| "保存确认未返回结果".to_owned())
        })
        .await
        .map_err(|_| "保存确认任务未能完成".to_owned())?;
        // This command future runs off the main thread. Cleanup is queued after
        // the Objective-C delegate returns; its borrowed self stays TLS-owned.
        let id = pending.id;
        if let Err(error) = app.run_on_main_thread(move || macos::dismiss(id)) {
            eprintln!("Native close choice resolved, but cleanup could not be queued: {error}");
        }
        result?
    }
}

pub(crate) fn handle_window<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if !matches!(event, WindowEvent::Destroyed) {
        return;
    }
    let pending = registry()
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .0
        .get(window.label())
        .cloned();
    if let Some(pending) = pending {
        finish(
            &pending,
            Err("保存确认所属窗口已关闭，未授权继续操作".into()),
        );
        #[cfg(target_os = "macos")]
        macos::dismiss(pending.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn pending(label: &str) -> (Arc<Pending>, mpsc::Receiver<Outcome>) {
        let (sender, receiver) = mpsc::channel();
        (
            Arc::new(Pending {
                id: Uuid::new_v4(),
                label: label.into(),
                sender: Mutex::new(Some(sender)),
            }),
            receiver,
        )
    }
    #[test]
    fn one_choice_per_lifetime_and_no_late_reply_to_another_window() {
        let (first, result) = pending("main");
        assert!(first.finish(Ok(Choice::Cancel)));
        assert!(!first.finish(Ok(Choice::Discard)));
        assert_eq!(result.recv().unwrap().unwrap(), Choice::Cancel);
        let (second, next) = pending("main");
        let mut registry = Registry::default();
        registry.insert(second.clone()).unwrap();
        registry.release(&first);
        assert!(registry.0.contains_key("main"));
        assert!(next.try_recv().is_err());
        registry.release(&second);
        assert!(registry.0.is_empty());
    }
    #[test]
    fn registry_refuses_overlapping_dialogs_but_keeps_other_windows_independent() {
        let mut registry = Registry::default();
        let (first, _rx) = pending("main");
        registry.insert(first).unwrap();
        let (duplicate, _rx2) = pending("main");
        assert!(registry.insert(duplicate).is_err());
        let (other, _rx3) = pending("other");
        registry.insert(other).unwrap();
        assert_eq!(registry.0.len(), 2);
    }
    #[test]
    fn capacity_is_bounded_and_a_destroyed_lifetime_cannot_publish_a_save() {
        let mut registry = Registry::default();
        let mut receivers = Vec::new();
        for index in 0..32 {
            let (item, receiver) = pending(&format!("editor-{index}"));
            receivers.push(receiver);
            registry.insert(item).unwrap();
        }
        let (extra, _receiver) = pending("extra");
        assert!(registry.insert(extra).is_err());
        let current = registry.0.get("editor-0").unwrap();
        assert!(current.finish(Err("window destroyed".into())));
        assert!(!current.finish(Ok(Choice::Save(PathBuf::from(
            "not-authorized-after-close.md"
        )))));
        assert_eq!(
            receivers[0].recv().unwrap().unwrap_err(),
            "window destroyed"
        );
        assert_eq!(registry.0.len(), 32);
    }
}
