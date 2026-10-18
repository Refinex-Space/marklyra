//! App-owned startup settings and identity-backed session metadata, never source text.
mod commands;
#[cfg(test)]
mod native_tabs_tests;
#[cfg(test)]
mod os_open_tests;
pub(crate) mod rename;
mod storage;
#[cfg(test)]
mod tests;
pub use commands::*;
use document_service::{DirectoryBookmark, DocumentBookmark};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
};
use storage::Store;
use tauri::{AppHandle, Manager};
const MAX_REVISION: u64 = 9_007_199_254_740_991;
const MAX_WINDOWS: usize = 32;

/// App-owned grouping only. Never a document capability or an IPC input.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NativeTabRestore {
    pub group: u8,
    pub order: u8,
    pub selected: bool,
    #[serde(default)]
    pub focused: bool,
}
impl NativeTabRestore {
    fn validate(self) -> Result<(), String> {
        if usize::from(self.group) >= MAX_WINDOWS || usize::from(self.order) >= MAX_WINDOWS {
            return Err("启动标签分组超出窗口上限，既有数据未修改".into());
        }
        if self.focused && !self.selected {
            return Err("启动焦点窗口必须是所选标签，既有数据未修改".into());
        }
        Ok(())
    }
}
fn validate_native_tabs(tabs: impl IntoIterator<Item = NativeTabRestore>) -> Result<(), String> {
    let mut positions = HashSet::new();
    let mut selections = HashSet::new();
    let mut focused = false;
    for tab in tabs {
        tab.validate()?;
        if !positions.insert((tab.group, tab.order))
            || (tab.selected && !selections.insert(tab.group))
        {
            return Err("启动标签分组包含重复位置或选中项，既有数据未修改".into());
        }
        if tab.focused {
            if focused {
                return Err("启动标签快照包含多个焦点窗口，既有数据未修改".into());
            }
            focused = true;
        }
    }
    Ok(())
}
/// Filtering unavailable/empty/deduplicated sessions may leave holes, remove
/// the selected tab, or reduce a group to one member. Restore only survivors.
fn normalize_native_tabs(entries: &mut [Session]) {
    let mut groups = HashMap::<u8, Vec<(u8, usize)>>::new();
    for (index, session) in entries.iter().enumerate() {
        if let Some(tab) = session.native_tab {
            groups
                .entry(tab.group)
                .or_default()
                .push((tab.order, index));
        }
    }
    for members in groups.values_mut() {
        members.sort_unstable();
        if members.len() < 2 {
            let session = &mut entries[members[0].1];
            if let Some(tab) = session.native_tab.as_mut().filter(|tab| tab.focused) {
                tab.order = 0;
                tab.selected = true;
            } else {
                session.native_tab = None;
            }
            continue;
        }
        let selected = members
            .iter()
            .position(|(_, index)| entries[*index].native_tab.is_some_and(|tab| tab.selected))
            .unwrap_or(0);
        for (order, (_, index)) in members.iter().enumerate() {
            if let Some(tab) = &mut entries[*index].native_tab {
                tab.order = order as u8;
                tab.selected = order == selected;
            }
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Session {
    document: Option<DocumentBookmark>,
    workspace: Option<DirectoryBookmark>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    native_tab: Option<NativeTabRestore>,
}
impl Session {
    fn validate(&self) -> Result<(), String> {
        if let Some(tab) = self.native_tab {
            tab.validate()?;
        }
        if let Some(value) = &self.document {
            value.validate().map_err(|e| e.to_string())?;
        }
        if let Some(value) = &self.workspace {
            value.validate().map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    fn empty(&self) -> bool {
        self.document.is_none() && self.workspace.is_none()
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stored {
    schema_version: u32,
    revision: u64,
    restore_when_launch: u8,
    pin_folder: Option<DirectoryBookmark>,
    archive: Vec<Session>,
}
impl Default for Stored {
    fn default() -> Self {
        Self {
            schema_version: 1,
            revision: 0,
            restore_when_launch: 0,
            pin_folder: None,
            archive: Vec::new(),
        }
    }
}
impl Stored {
    fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1
            || self.revision > MAX_REVISION
            || self.restore_when_launch > 3
            || self.archive.len() > MAX_WINDOWS
        {
            return Err("启动设置损坏或版本不支持，既有数据未修改".into());
        }
        if let Some(value) = &self.pin_folder {
            value.validate().map_err(|e| e.to_string())?;
        }
        for entry in &self.archive {
            entry.validate()?;
        }
        validate_native_tabs(self.archive.iter().filter_map(|entry| entry.native_tab))
    }
    fn snapshot(&self) -> StartupPreferences {
        StartupPreferences {
            revision: self.revision,
            restore_when_launch: self.restore_when_launch,
            pin_folder: self
                .pin_folder
                .as_ref()
                .map(|p| p.path().to_string_lossy().into_owned()),
        }
    }
    fn change(
        &mut self,
        expected: u64,
        mode: u8,
        folder: Option<DirectoryBookmark>,
    ) -> Result<(), String> {
        if self.revision != expected {
            return Err("启动设置已由其他窗口更改，请重新打开设置".into());
        }
        if mode > 3 {
            return Err("启动选项无效".into());
        }
        if let Some(folder) = folder {
            self.pin_folder = Some(folder);
        }
        if mode == 3 && self.pin_folder.is_none() {
            return Err("请先选择启动目录".into());
        }
        self.restore_when_launch = mode;
        self.revision = self
            .revision
            .checked_add(1)
            .filter(|v| *v <= MAX_REVISION)
            .ok_or("启动设置版本已达上限")?;
        Ok(())
    }
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupPreferences {
    pub revision: u64,
    pub restore_when_launch: u8,
    pub pin_folder: Option<String>,
}
/// Native-only target. Never Deserialize or accept a path/bookmark from IPC.
#[derive(Clone, Debug, Default)]
pub struct StartupTarget {
    session: Session,
    os_open_receipt: Option<crate::os_open::Receipt>,
    draft: Option<StartupDraft>,
    warnings: Vec<String>,
    initial_custom_folder: bool,
    initial_revision: Option<u64>,
}
/// A window-opening handoff only. Never persisted in session preferences or
/// interpreted as a filesystem authority.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupDraft {
    pub text: String,
    pub saved_text: String,
}
impl StartupTarget {
    /// A native picker has already opened this document and captured its
    /// directory capability. This handoff never accepts renderer paths.
    pub(crate) fn with_opened_document(mut self, document: DocumentBookmark) -> Self {
        self.session.document = Some(document);
        self
    }
    pub(crate) fn with_os_open_receipt(mut self, receipt: crate::os_open::Receipt) -> Self {
        self.os_open_receipt = Some(receipt);
        self
    }
    pub(crate) fn inherit_os_workspace(mut self, inherited: Option<Self>) -> Self {
        if self.session.document.is_some() && self.session.workspace.is_none() {
            if let Some(inherited) = inherited {
                self.session.workspace = inherited.session.workspace;
                self.warnings.extend(inherited.warnings);
            }
        }
        self
    }
    pub(crate) fn native_tab(&self) -> Option<NativeTabRestore> {
        self.session.native_tab
    }
    pub(crate) fn with_draft(mut self, text: String, saved_text: String) -> Result<Self, String> {
        document_service::validate_text(&text).map_err(|e| e.to_string())?;
        document_service::validate_text(&saved_text).map_err(|e| e.to_string())?;
        if self.session.document.is_none() {
            return Err("草稿快照需要已授权的文稿".into());
        }
        self.draft = Some(StartupDraft { text, saved_text });
        Ok(self)
    }
    pub(crate) fn from_workspace(bookmark: DirectoryBookmark) -> Result<Self, String> {
        bookmark.reopen().map_err(|error| error.to_string())?;
        Ok(Self {
            session: Session {
                workspace: Some(bookmark),
                document: None,
                native_tab: None,
            },
            ..Self::default()
        })
    }
    pub(crate) fn from_document(
        document: DocumentBookmark,
        workspace: DirectoryBookmark,
    ) -> Result<Self, String> {
        if !document.probe().map_err(|e| e.to_string())? {
            return Err("新窗口文稿已不可用".into());
        }
        workspace.reopen().map_err(|e| e.to_string())?;
        Ok(Self {
            session: Session {
                workspace: Some(workspace),
                document: Some(document),
                native_tab: None,
            },
            ..Self::default()
        })
    }
    pub fn is_initial_custom_folder(&self) -> bool {
        self.initial_custom_folder
    }
}
fn checked_target(session: Session) -> StartupTarget {
    let mut warnings = Vec::new();
    let mut open_failed = false;
    let document = session.document.filter(|value| {
        match value.probe() {
            Ok(true) => {
                if document_service::DocumentService::new()
                    .open_bookmark(value)
                    .is_ok()
                {
                    return true;
                }
                open_failed = true;
            }
            Ok(false) => {}
            Err(_) => {
                open_failed = true;
            }
        }
        warnings.push("上次文件已失效或不可访问，原文件和恢复副本均保留".into());
        false
    });
    let workspace = if open_failed {
        None
    } else {
        session.workspace.filter(|value| {
            let good = value.reopen().is_ok();
            if !good {
                warnings.push("上次目录已移动、替换或不可访问，请重新选择".into());
            }
            good
        })
    };
    StartupTarget {
        session: Session {
            document,
            workspace,
            native_tab: session.native_tab,
        },
        warnings,
        initial_custom_folder: false,
        initial_revision: None,
        draft: None,
        os_open_receipt: None,
    }
}
fn plan(state: &Stored) -> Vec<StartupTarget> {
    let mut output = Vec::new();
    let mut seen = Vec::new();
    let mut warnings = Vec::new();
    if state.restore_when_launch == 3 {
        let mut target = checked_target(Session {
            document: None,
            workspace: state.pin_folder.clone(),
            native_tab: None,
        });
        target.initial_custom_folder = state.pin_folder.is_some();
        target.initial_revision = Some(state.revision);
        return vec![target];
    }
    if state.restore_when_launch > 0 {
        for entry in &state.archive {
            if state.restore_when_launch == 1 {
                if let Some(folder) = &entry.workspace {
                    if !seen.contains(folder) {
                        seen.push(folder.clone());
                        let target = checked_target(Session {
                            document: None,
                            workspace: Some(folder.clone()),
                            native_tab: entry.native_tab,
                        });
                        warnings.extend(target.warnings.clone());
                        if !target.session.empty() {
                            output.push(target);
                        }
                    }
                }
            } else if entry.document.is_some() {
                if let Some(folder) = &entry.workspace {
                    if !seen.contains(folder) {
                        seen.push(folder.clone());
                    }
                }
                let target = checked_target(entry.clone());
                warnings.extend(target.warnings.clone());
                if !target.session.empty() {
                    output.push(target);
                }
            } else if let Some(folder) = &entry.workspace {
                if !seen.contains(folder) {
                    seen.push(folder.clone());
                    let target = checked_target(entry.clone());
                    warnings.extend(target.warnings.clone());
                    if !target.session.empty() {
                        output.push(target);
                    }
                }
            }
        }
    }
    if output.is_empty() {
        output.push(StartupTarget::default());
    }
    let mut sessions: Vec<_> = output.iter().map(|target| target.session.clone()).collect();
    normalize_native_tabs(&mut sessions);
    for (target, session) in output.iter_mut().zip(sessions) {
        target.session.native_tab = session.native_tab;
    }
    output[0].warnings.extend(warnings);
    output
}
struct Slot {
    archivable: bool,
    order: u64,
    token: uuid::Uuid,
    pending: Option<StartupTarget>,
    claimed: Option<StartupTarget>,
    loading: bool,
    consumed: bool,
    current_document_id: Option<String>,
    serial: u64,
    session: Session,
}
type QuitBatch = HashMap<String, (u64, Session)>;
#[derive(Default, Clone)]
pub struct StartupHost {
    store: Arc<Mutex<Option<Store>>>,
    slots: Arc<Mutex<HashMap<String, Slot>>>,
    next_order: Arc<std::sync::atomic::AtomicU64>,
    backup_gate: Arc<Mutex<()>>,
    quit_batch: Arc<Mutex<Option<QuitBatch>>>,
}
impl StartupHost {
    pub(crate) fn os_open_ready(&self, label: &str) -> Result<bool, String> {
        let slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        Ok(slots
            .get(label)
            .is_some_and(|slot| slot.consumed && !slot.loading))
    }
    /// Native event routing never treats a bookmark probe as proof of a
    /// live document's leaf identity. Current IDs are transient, not persisted.
    pub(crate) fn matching_os_target(
        &self,
        services: &crate::window_services::WindowServices,
        _path: &std::path::Path,
        entity: &same_file::Handle,
        directory: bool,
    ) -> Result<Option<String>, String> {
        let candidates = {
            let slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
            let mut ordered: Vec<_> = slots.iter().filter(|(_, slot)| slot.archivable).collect();
            ordered.sort_by_key(|(_, slot)| slot.order);
            ordered
                .into_iter()
                .filter_map(|(label, slot)| {
                    let path = if directory {
                        if slot.session.document.is_some() {
                            return None;
                        }
                        slot.session
                            .workspace
                            .as_ref()
                            .filter(|bookmark| bookmark.reopen().is_ok())
                            .map(|bookmark| bookmark.path().to_owned())
                    } else {
                        slot.session
                            .document
                            .as_ref()
                            .filter(|bookmark| bookmark.probe().unwrap_or(false))
                            .map(DocumentBookmark::path)
                    }?;
                    let receipt = slot
                        .pending
                        .as_ref()
                        .or(slot.claimed.as_ref())
                        .and_then(|target| target.os_open_receipt.clone());
                    Some((
                        label.clone(),
                        path,
                        slot.consumed,
                        slot.current_document_id.clone(),
                        receipt,
                    ))
                })
                .collect::<Vec<_>>()
        };
        for (label, path, consumed, id, receipt) in candidates {
            if receipt
                .as_ref()
                .is_some_and(|receipt| receipt.verify().is_err())
            {
                continue;
            }
            if !directory && consumed {
                let Some(id) = id else {
                    continue;
                };
                let Ok(documents) = services.get_documents(&label) else {
                    continue;
                };
                if !documents
                    .lock()
                    .is_ok_and(|documents| documents.capture_image_document_identity(&id).is_ok())
                {
                    continue;
                }
            }
            if same_file::Handle::from_path(&path).ok().as_ref() == Some(entity) {
                return Ok(Some(label));
            }
        }
        Ok(None)
    }
    pub(crate) fn can_reuse_untitled(&self, label: &str) -> Result<bool, String> {
        let slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        Ok(slots
            .get(label)
            .is_some_and(|slot| slot.consumed && !slot.loading && slot.session.document.is_none()))
    }
    fn with<T>(
        &self,
        app: &AppHandle,
        operation: impl FnOnce(&Store) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut store = self.store.lock().map_err(|_| "启动服务不可用")?;
        if store.is_none() {
            *store = Some(Store::open(
                &crate::app_paths::data_dir(app)?.join("startup"),
            )?);
        }
        operation(store.as_ref().ok_or("启动存储尚未初始化")?)
    }
    pub fn plan_initial(&self, app: &AppHandle) -> Result<Vec<StartupTarget>, String> {
        let state = self.with(app, |store| {
            store.transaction(|state| Ok((state.clone(), false)))
        })?;
        Ok(plan(&state))
    }
    pub fn set_bootstrap(&self, label: &str, target: StartupTarget) -> Result<(), String> {
        self.insert_bootstrap(label, target, true)
    }
    pub(crate) fn set_bootstrap_reserved(
        &self,
        label: &str,
        target: StartupTarget,
    ) -> Result<(), String> {
        self.insert_bootstrap(label, target, false)
    }
    pub(crate) fn publish_bootstrap(&self, label: &str) -> Result<(), String> {
        let mut slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        slots.get_mut(label).ok_or("新窗口授权已释放")?.archivable = true;
        Ok(())
    }
    fn insert_bootstrap(
        &self,
        label: &str,
        target: StartupTarget,
        archivable: bool,
    ) -> Result<(), String> {
        let mut slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        if slots.contains_key(label) || slots.len() >= MAX_WINDOWS {
            return Err("启动窗口已存在或超过上限".into());
        }
        let planned_session = target.session.clone();
        slots.insert(
            label.into(),
            Slot {
                archivable,
                order: self
                    .next_order
                    .fetch_update(
                        std::sync::atomic::Ordering::AcqRel,
                        std::sync::atomic::Ordering::Acquire,
                        |value| value.checked_add(1),
                    )
                    .map_err(|_| "窗口顺序已达上限")?,
                token: uuid::Uuid::new_v4(),
                pending: Some(target),
                claimed: None,
                loading: false,
                consumed: false,
                current_document_id: None,
                serial: 0,
                // A whole-session close backup also retains still-loading siblings.
                session: planned_session,
            },
        );
        Ok(())
    }
    pub fn new_document_target(
        &self,
        app: &AppHandle,
        parent_label: &str,
    ) -> Result<Option<StartupTarget>, String> {
        if let Some(folder) = self
            .slots
            .lock()
            .map_err(|_| "启动窗口状态不可用")?
            .get(parent_label)
            .and_then(|slot| slot.session.workspace.clone())
        {
            return Ok(Some(checked_target(Session {
                document: None,
                workspace: Some(folder),
                native_tab: None,
            })));
        }
        self.with(app, |store| {
            store.transaction(|state| {
                Ok((
                    if state.restore_when_launch >= 1 {
                        state
                            .archive
                            .first()
                            .and_then(|entry| entry.workspace.clone())
                            .map(|folder| {
                                checked_target(Session {
                                    document: None,
                                    workspace: Some(folder),
                                    native_tab: None,
                                })
                            })
                    } else {
                        None
                    },
                    false,
                ))
            })
        })
    }
    pub fn new_window_target(&self, app: &AppHandle) -> Result<Option<StartupTarget>, String> {
        self.with(app, |store| {
            store.transaction(|state| {
                Ok((
                    if state.restore_when_launch == 3 {
                        state.pin_folder.clone().map(|folder| {
                            checked_target(Session {
                                document: None,
                                workspace: Some(folder),
                                native_tab: None,
                            })
                        })
                    } else {
                        None
                    },
                    false,
                ))
            })
        })
    }
    /// Replace layout from a real native-window snapshot. A caller must capture
    /// only this host's published editor windows; no renderer DTO reaches here.
    pub(crate) fn set_native_tab_layout(
        &self,
        layout: Vec<(String, NativeTabRestore)>,
    ) -> Result<(), String> {
        if layout.len() > MAX_WINDOWS {
            return Err("启动标签快照超过窗口上限".into());
        }
        validate_native_tabs(layout.iter().map(|(_, tab)| *tab))?;
        let _gate = self.backup_gate.lock().map_err(|_| "会话备份状态不可用")?;
        let mut slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        let mut owners = HashSet::new();
        for (label, _) in &layout {
            if !owners.insert(label) || !slots.get(label).is_some_and(|slot| slot.archivable) {
                return Err("启动标签快照包含未知、未发布或重复窗口".into());
            }
        }
        for slot in slots.values_mut() {
            slot.session.native_tab = None;
        }
        for (label, tab) in layout {
            slots
                .get_mut(&label)
                .ok_or("启动标签窗口已释放")?
                .session
                .native_tab = Some(tab);
        }
        Ok(())
    }
    pub fn backup(&self, app: &AppHandle) -> Result<(), String> {
        self.checkpoint(|entries| self.with(app, |store| write_archive(store, entries)))
    }
    fn checkpoint(
        &self,
        persist: impl FnOnce(Vec<Session>) -> Result<(), String>,
    ) -> Result<(), String> {
        let _gate = self.backup_gate.lock().map_err(|_| "会话备份状态不可用")?;
        let entries = self.session_snapshot()?;
        if entries.is_empty() {
            return Ok(());
        }
        persist(entries)
    }
    fn session_snapshot(&self) -> Result<Vec<Session>, String> {
        let slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        let mut batch = self.quit_batch.lock().map_err(|_| "退出会话状态不可用")?;
        let mut entries: Vec<_> = if let Some(batch) = batch.as_mut() {
            for (label, slot) in slots.iter().filter(|(_, slot)| slot.archivable) {
                let mut session = slot.session.clone();
                // The group before Quit belongs to the entire batch, including
                // siblings already closed. Later native snapshots describe only
                // surviving windows and must not dismantle that archived group.
                session.native_tab = batch.get(label).and_then(|(_, entry)| entry.native_tab);
                batch.insert(label.clone(), (slot.order, session));
            }
            batch
                .values()
                .filter(|(_, session)| !session.empty())
                .cloned()
                .collect()
        } else {
            slots
                .values()
                .filter(|slot| slot.archivable && !slot.session.empty())
                .map(|slot| (slot.order, slot.session.clone()))
                .collect()
        };
        entries.sort_by_key(|a| a.0);
        let mut entries: Vec<_> = entries.into_iter().map(|(_, entry)| entry).collect();
        normalize_native_tabs(&mut entries);
        Ok(entries)
    }
    pub fn begin_quit_backup(&self) -> Result<(), String> {
        let _gate = self.backup_gate.lock().map_err(|_| "会话备份状态不可用")?;
        let slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        let mut batch = self.quit_batch.lock().map_err(|_| "退出会话状态不可用")?;
        if batch.is_some() {
            return Err("退出会话已开始".into());
        }
        *batch = Some(
            slots
                .iter()
                .filter(|(_, slot)| slot.archivable)
                .map(|(label, slot)| (label.clone(), (slot.order, slot.session.clone())))
                .collect(),
        );
        Ok(())
    }
    pub fn end_quit_backup(&self) {
        let _gate = self.backup_gate.lock().ok();
        if let Ok(mut batch) = self.quit_batch.lock() {
            *batch = None;
        }
    }
    pub fn release(&self, label: &str) {
        if let Ok(mut slots) = self.slots.lock() {
            slots.remove(label);
        }
    }
    pub fn add_warning(&self, label: &str, message: impl Into<String>) -> Result<(), String> {
        let mut message = message.into();
        message.truncate(message.floor_char_boundary(1024));
        let mut slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        if let Some(slot) = slots.get_mut(label) {
            if let Some(target) = slot.pending.as_mut() {
                if target.warnings.len() < 32 {
                    target.warnings.push(message);
                }
            }
            return Ok(());
        }
        drop(slots);
        self.set_bootstrap(
            label,
            StartupTarget {
                warnings: vec![message],
                ..Default::default()
            },
        )
    }
}

fn write_archive(store: &Store, entries: Vec<Session>) -> Result<(), String> {
    if entries.is_empty() {
        return Ok(());
    }
    store.transaction(|state| {
        state.archive = entries;
        Ok(((), true))
    })
}
