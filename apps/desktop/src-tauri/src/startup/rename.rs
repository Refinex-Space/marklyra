//! Retarget only existing identity-verified startup references. A rename plan
//! carries no new renderer authorization and never restores a removed slot.
use super::*;
use crate::rename_metadata::RenameInput;
use tauri::Emitter;

struct SessionChange {
    old: Session,
    new: Session,
    affected: bool,
}
impl SessionChange {
    fn matches(&self, current: &Session) -> bool {
        current.document == self.old.document && current.workspace == self.old.workspace
    }
    fn apply(&self, current: &mut Session) -> bool {
        if !self.matches(current) {
            return false;
        }
        let changed =
            current.document != self.new.document || current.workspace != self.new.workspace;
        // A native layout refresh is independent from filesystem identity and
        // must neither cancel a valid retarget nor be reverted by its old plan.
        current.document = self.new.document.clone();
        current.workspace = self.new.workspace.clone();
        changed
    }
}
struct SlotChange {
    label: String,
    token: uuid::Uuid,
    serial: u64,
    session: SessionChange,
    pending: Option<SessionChange>,
    claimed: Option<SessionChange>,
}
pub(crate) struct StartupRenamePlan {
    origin: Arc<Mutex<HashMap<String, Slot>>>,
    slots: Vec<SlotChange>,
    batch: Vec<(String, u64, SessionChange)>,
    archive: Vec<SessionChange>,
    pin: Option<(DirectoryBookmark, DirectoryBookmark)>,
    warnings: Vec<String>,
}
fn mapped_session(
    session: &Session,
    input: &RenameInput,
    warnings: &mut Vec<String>,
) -> SessionChange {
    let mut new = session.clone();
    let mut affected = false;
    if let Some(book) = &session.document {
        affected |= input.affects_document(&book.path());
        match input.document(book) {
            Ok(Some(mapped)) => new.document = Some(mapped),
            Ok(None) => {}
            Err(error) => warnings.push(format!("一个旧启动文件引用无法验证，保留原授权：{error}")),
        }
    }
    if let Some(book) = &session.workspace {
        affected |= input.affects_directory(book.path());
        match input.directory(book) {
            Ok(Some(mapped)) => new.workspace = Some(mapped),
            Ok(None) => {}
            Err(error) => warnings.push(format!("一个旧启动目录引用无法验证，保留原授权：{error}")),
        }
    }
    SessionChange {
        old: session.clone(),
        new,
        affected,
    }
}
impl StartupRenamePlan {
    pub(crate) fn map_move_books(&mut self, mapping: &crate::move_metadata::MoveBookmarkMappings) {
        fn session(
            change: &mut SessionChange,
            mapping: &crate::move_metadata::MoveBookmarkMappings,
        ) {
            if let Some(book) = &mut change.new.document {
                *book = mapping.document(book);
            }
            if let Some(book) = &mut change.new.workspace {
                *book = mapping.directory(book);
            }
        }
        for slot in &mut self.slots {
            session(&mut slot.session, mapping);
            if let Some(change) = &mut slot.pending {
                session(change, mapping);
            }
            if let Some(change) = &mut slot.claimed {
                session(change, mapping);
            }
        }
        for (_, _, change) in &mut self.batch {
            session(change, mapping);
        }
        for change in &mut self.archive {
            session(change, mapping);
        }
        if let Some((_, next)) = &mut self.pin {
            *next = mapping.directory(next);
        }
    }
}

impl StartupHost {
    pub(crate) fn prepare_rename(
        &self,
        app: &AppHandle,
        input: &RenameInput,
    ) -> Result<StartupRenamePlan, String> {
        // Same order as backup: never hold a store while waiting for slots.
        let _gate = self.backup_gate.lock().map_err(|_| "会话备份状态不可用")?;
        let mut warnings = vec![];
        let state = self
            .with(app, |store| {
                store.transaction(|state| Ok((state.clone(), false)))
            })
            .unwrap_or_else(|error| {
                warnings.push(format!(
                    "旧启动存储不可读取，仅维护仍可验证的内存会话：{error}"
                ));
                Stored::default()
            });
        let mut plan = self.prepare_rename_memory(&state, input)?;
        plan.warnings.extend(warnings);
        Ok(plan)
    }
    fn prepare_rename_memory(
        &self,
        state: &Stored,
        input: &RenameInput,
    ) -> Result<StartupRenamePlan, String> {
        let mut warnings = vec![];
        let slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        let batch = self.quit_batch.lock().map_err(|_| "退出会话状态不可用")?;
        let slots = slots
            .iter()
            .map(|(label, slot)| SlotChange {
                label: label.clone(),
                token: slot.token,
                serial: slot.serial,
                session: mapped_session(&slot.session, input, &mut warnings),
                pending: slot
                    .pending
                    .as_ref()
                    .map(|target| mapped_session(&target.session, input, &mut warnings)),
                claimed: slot
                    .claimed
                    .as_ref()
                    .map(|target| mapped_session(&target.session, input, &mut warnings)),
            })
            .collect();
        let batch = batch
            .as_ref()
            .map(|batch| {
                batch
                    .iter()
                    .map(|(label, (order, session))| {
                        (
                            label.clone(),
                            *order,
                            mapped_session(session, input, &mut warnings),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();
        let archive = state
            .archive
            .iter()
            .map(|session| mapped_session(session, input, &mut warnings))
            .collect();
        let pin = state
            .pin_folder
            .as_ref()
            .and_then(|book| match input.directory(book) {
                Ok(Some(mapped)) => Some((book.clone(), mapped)),
                Ok(None) => None,
                Err(error) => {
                    warnings.push(format!("原固定启动目录无法验证，保持原授权：{error}"));
                    None
                }
            });
        Ok(StartupRenamePlan {
            origin: Arc::clone(&self.slots),
            slots,
            batch,
            archive,
            pin,
            warnings,
        })
    }
    pub(crate) fn commit_rename(&self, app: &AppHandle, plan: StartupRenamePlan) -> Vec<String> {
        let mut warnings = plan.warnings.clone();
        let gate = match self.backup_gate.lock() {
            Ok(gate) => gate,
            Err(_) => {
                warnings.push("启动会话路径迁移未确认：备份状态不可用".into());
                return warnings;
            }
        };
        if !Arc::ptr_eq(&self.slots, &plan.origin) {
            warnings.push("启动路径计划不属于当前宿主，未应用".into());
            return warnings;
        }
        if let Err(error) = self.apply_rename_memory(&plan) {
            warnings.push(format!("活动启动会话路径迁移未确认：{error}"));
        }
        let result = self.with(app, |store| Self::apply_rename_store(store, &plan));
        drop(gate);
        match result {
            Ok(Some(preferences)) => {
                let _ = app.emit("startup-preferences-changed", preferences);
            }
            Ok(None) => {}
            Err(error) => warnings.push(format!("启动记录持久化路径迁移未确认：{error}")),
        }
        warnings
    }
    fn apply_rename_memory(&self, plan: &StartupRenamePlan) -> Result<(), String> {
        let mut slots = self.slots.lock().map_err(|_| "启动窗口状态不可用")?;
        let mut batch = self.quit_batch.lock().map_err(|_| "退出会话状态不可用")?;
        for change in &plan.slots {
            let Some(slot) = slots
                .get_mut(&change.label)
                .filter(|slot| slot.token == change.token && slot.serial == change.serial)
            else {
                continue;
            };
            change.session.apply(&mut slot.session);
            if let (Some(target), Some(mapped)) = (&mut slot.pending, &change.pending) {
                mapped.apply(&mut target.session);
            }
            // A target may have become claimed after prepare. Match that same
            // immutable session, rearm its exact flags/warnings and reject the
            // old in-flight result through the existing serial CAS.
            if slot.loading {
                if let Some(target) = &slot.claimed {
                    let mapped = change.claimed.as_ref().or(change.pending.as_ref());
                    if let Some(mapped) =
                        mapped.filter(|mapped| mapped.affected && mapped.matches(&target.session))
                    {
                        let next = slot.serial.checked_add(1).ok_or("启动窗口版本已达上限")?;
                        let mut target = target.clone();
                        mapped.apply(&mut target.session);
                        if target.warnings.len() < 32 {
                            target
                                .warnings
                                .push("目录位置已更新，启动目标已重新准备；旧结果已取消".into());
                        }
                        slot.pending = Some(target);
                        slot.claimed = None;
                        slot.loading = false;
                        slot.consumed = false;
                        slot.serial = next;
                    }
                }
            }
        }
        if let Some(batch) = batch.as_mut() {
            for (label, order, change) in &plan.batch {
                if let Some((current_order, session)) = batch.get_mut(label) {
                    if current_order == order {
                        change.apply(session);
                    }
                }
            }
        }
        Ok(())
    }
    fn apply_rename_store(
        store: &Store,
        plan: &StartupRenamePlan,
    ) -> Result<Option<StartupPreferences>, String> {
        store.transaction(|state| {
            let mut changed = false;
            for change in &plan.archive {
                for session in &mut state.archive {
                    changed |= change.apply(session);
                }
            }
            let mut preferences = None;
            if let Some((expected, mapped)) = &plan.pin {
                if state.pin_folder.as_ref() == Some(expected) && expected != mapped {
                    state.pin_folder = Some(mapped.clone());
                    state.revision = state
                        .revision
                        .checked_add(1)
                        .filter(|v| *v <= MAX_REVISION)
                        .ok_or("启动设置版本已达上限")?;
                    changed = true;
                    preferences = Some(state.snapshot());
                }
            }
            Ok((preferences, changed))
        })
    }
}

#[cfg(test)]
mod tests;
