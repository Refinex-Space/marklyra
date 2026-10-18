//! Native-only metadata plans derived from a verified rename or owned Move.
use cap_std::fs::Dir;
use document_service::{DirectoryBookmark, DocumentBookmark};
use file_index::EntryKind;
use std::{
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use tauri::{AppHandle, Emitter, Manager};

pub(crate) struct RenameInput {
    pub(crate) parent: Arc<Dir>,
    pub(crate) source: Option<Arc<Dir>>,
    pub(crate) old_name: PathBuf,
    pub(crate) new_name: PathBuf,
    pub(crate) old: PathBuf,
    pub(crate) new: PathBuf,
    pub(crate) kind: EntryKind,
    pub(crate) movement: Option<Arc<crate::move_metadata::MoveMetadataInput>>,
}
impl RenameInput {
    pub(crate) fn new(
        parent: Arc<Dir>,
        old_name: &Path,
        new_name: &Path,
        old: &Path,
        new: &Path,
        kind: EntryKind,
    ) -> Result<Self, String> {
        let single = |path: &Path| {
            let mut parts = path.components();
            matches!(parts.next(), Some(Component::Normal(_))) && parts.next().is_none()
        };
        if !single(old_name)
            || !single(new_name)
            || !old.is_absolute()
            || old.parent() != new.parent()
            || old.file_name() != Some(old_name.as_os_str())
            || new.file_name() != Some(new_name.as_os_str())
        {
            return Err("名称元数据计划需要已验证的同父目录实体".into());
        }
        DirectoryBookmark::capture(&parent, old.parent().ok_or("缺少父目录")?)
            .map_err(|e| e.to_string())?;
        let source = if kind == EntryKind::Directory {
            let source = Arc::new(parent.open_dir(old_name).map_err(|e| e.to_string())?);
            DirectoryBookmark::capture(&source, old).map_err(|e| e.to_string())?;
            Some(source)
        } else {
            None
        };
        Ok(Self {
            parent,
            source,
            old_name: old_name.to_owned(),
            new_name: new_name.to_owned(),
            old: old.to_owned(),
            new: new.to_owned(),
            kind,
            movement: None,
        })
    }
    pub(crate) fn affects_document(&self, path: &Path) -> bool {
        self.movement.as_ref().map_or_else(
            || {
                if self.kind == EntryKind::Directory {
                    path.starts_with(&self.old)
                } else {
                    path == self.old
                }
            },
            |moves| moves.affects_document(path),
        )
    }
    pub(crate) fn affects_directory(&self, path: &Path) -> bool {
        self.movement.as_ref().map_or_else(
            || self.kind == EntryKind::Directory && path.starts_with(&self.old),
            |moves| moves.affects_directory(path),
        )
    }
    pub(crate) fn directory(
        &self,
        book: &DirectoryBookmark,
    ) -> Result<Option<DirectoryBookmark>, String> {
        if let Some(movement) = &self.movement {
            return movement.directory(book);
        }
        let Some(source) = &self.source else {
            return Ok(None);
        };
        book.prepare_retarget(source, &self.old, &self.new)
            .map(|plan| plan.map(|plan| plan.commit()))
            .map_err(|e| e.to_string())
    }
    pub(crate) fn document(
        &self,
        book: &DocumentBookmark,
    ) -> Result<Option<DocumentBookmark>, String> {
        if let Some(movement) = &self.movement {
            return movement.document(book);
        }
        let plan = if let Some(source) = &self.source {
            book.prepare_retarget(source, &self.old, &self.new)
        } else {
            book.prepare_file_retarget(
                &self.parent,
                &self.old_name,
                &self.new_name,
                &self.old,
                &self.new,
            )
        };
        plan.map(|plan| plan.map(|plan| plan.commit()))
            .map_err(|e| e.to_string())
    }
}

pub(crate) struct RenameMetadataPlan {
    history_ticket: Option<crate::file_preferences::HistoryTicket>,
    recent: Option<recent_files::RecentRenamePlan>,
    folders: Option<crate::file_preferences::rename_metadata::FolderRenamePlan>,
    startup: Option<crate::startup::rename::StartupRenamePlan>,
    images: Option<crate::commands::images::ImageBindingLocationPlan>,
    warnings: Vec<String>,
    movement: Option<Arc<crate::move_metadata::MoveMetadataInput>>,
}
impl RenameMetadataPlan {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn prepare(
        app: &AppHandle,
        parent: Arc<Dir>,
        old_name: &Path,
        new_name: &Path,
        old: &Path,
        new: &Path,
        kind: EntryKind,
    ) -> Result<Self, String> {
        let input = RenameInput::new(parent, old_name, new_name, old, new, kind)?;
        Self::prepare_input(app, input)
    }
    pub(crate) fn prepare_moves(
        app: &AppHandle,
        targets: Vec<document_service::NativeMoveTarget>,
    ) -> Result<Self, String> {
        let movement = crate::move_metadata::MoveMetadataInput::new(targets)?;
        let main = movement.targets.last().ok_or("缺少移动目标")?;
        let input = RenameInput {
            parent: Arc::clone(&main.source_parent),
            source: None,
            old_name: main.source_name.clone(),
            new_name: main.destination_name.clone(),
            old: main.source_display.clone(),
            new: main.destination_display.clone(),
            kind: if main.kind == document_service::RenameKind::Directory {
                EntryKind::Directory
            } else {
                EntryKind::File
            },
            movement: Some(Arc::clone(&movement)),
        };
        Self::prepare_input(app, input)
    }
    fn prepare_input(app: &AppHandle, input: RenameInput) -> Result<Self, String> {
        if input.old == input.new {
            return Ok(Self {
                history_ticket: None,
                recent: None,
                folders: None,
                startup: None,
                images: None,
                warnings: vec![],
                movement: None,
            });
        }
        let mut warnings = vec![];
        let images = match crate::commands::images::ImageBindingLocationPlan::prepare(app, &input) {
            Ok(plan) => Some(plan),
            Err(error) => {
                warnings.push(format!("图片绑定位置迁移尚未准备：{error}"));
                None
            }
        };
        let (history_ticket, folders) = match app
            .state::<crate::file_preferences::FilePreferencesHost>()
            .prepare_rename_metadata(app, &input)
        {
            Ok((ticket, plan)) => {
                warnings.extend(plan.warnings.iter().cloned());
                (ticket, Some(plan))
            }
            Err(error) => {
                warnings.push(format!("最近目录路径迁移尚未准备：{error}"));
                (None, None)
            }
        };
        let recent = if history_ticket.is_some() {
            let prepared = if let Some(movement) = &input.movement {
                let targets: Vec<_> = movement
                    .targets
                    .iter()
                    .map(|target| {
                        (
                            target.source_display.as_path(),
                            target.destination_display.as_path(),
                            target.kind == document_service::RenameKind::Directory,
                        )
                    })
                    .collect();
                crate::commands::recent::rename::prepare_moves(app, &targets)
            } else {
                crate::commands::recent::rename::prepare_subtree(
                    app,
                    &input.old,
                    &input.new,
                    input.kind == EntryKind::Directory,
                )
            };
            match prepared {
                Ok(plan) => Some(plan),
                Err(error) => {
                    warnings.push(format!("最近文件路径迁移尚未准备：{error}"));
                    None
                }
            }
        } else {
            None
        };
        let startup = match app
            .state::<crate::startup::StartupHost>()
            .prepare_rename(app, &input)
        {
            Ok(plan) => Some(plan),
            Err(error) => {
                warnings.push(format!("启动路径迁移尚未准备：{error}"));
                None
            }
        };
        Ok(Self {
            history_ticket,
            recent,
            folders,
            startup,
            images,
            warnings,
            movement: input.movement,
        })
    }

    pub(crate) fn commit_moves(
        mut self,
        app: &AppHandle,
        publications: &[&document_service::NativeMovePublication],
    ) -> Vec<String> {
        let mapped = self
            .movement
            .as_ref()
            .ok_or("缺少移动元数据计划")
            .and_then(|moves| {
                moves
                    .finalize(publications)
                    .map_err(|_| "移动书签身份交接未确认")
            });
        match mapped {
            Ok(mapped) => {
                if let Some(images) = self.images.take() {
                    self.warnings
                        .extend(images.commit_moves(&mapped, publications));
                }
                if let Some(folders) = &mut self.folders {
                    folders.map_move_books(&mapped);
                }
                if let Some(startup) = &mut self.startup {
                    startup.map_move_books(&mapped);
                }
            }
            Err(error) => {
                self.warnings.push(error.into());
                self.folders = None;
                self.startup = None;
                self.images = None;
            }
        }
        self.commit(app)
    }
    pub(crate) fn commit(mut self, app: &AppHandle) -> Vec<String> {
        if let Some(images) = self.images.take() {
            self.warnings.extend(images.commit());
        }
        let host = app.state::<crate::file_preferences::FilePreferencesHost>();
        if let (Some(ticket), Some(plan)) = (self.history_ticket, self.recent) {
            match host.commit_rename_history(app, ticket, || {
                crate::commands::recent::rename::commit_subtree(app, plan)
            }) {
                Ok(Some(report)) if report.skipped != 0 => self.warnings.push(format!(
                    "{} 条最近文件记录已有新变化，未覆盖",
                    report.skipped
                )),
                Ok(_) => {}
                Err(error) => self
                    .warnings
                    .push(format!("文件已改名，但最近文件路径迁移未能确认：{error}")),
            }
        }
        if let Some(plan) = self.folders {
            if let Err(error) = host.commit_folder_rename(app, plan) {
                self.warnings
                    .push(format!("最近目录路径迁移未能确认：{error}"));
            }
        }
        if let Some(plan) = self.startup {
            self.warnings.extend(
                app.state::<crate::startup::StartupHost>()
                    .commit_rename(app, plan),
            );
        }
        let _ = app.emit("recent-files-changed", ());
        let _ = app.emit("directory-history-changed", ());
        crate::commands::recent::refresh_native_menu(app);
        let mut seen = std::collections::HashSet::new();
        self.warnings
            .into_iter()
            .map(|warning| warning[..warning.floor_char_boundary(1024)].to_owned())
            .filter(|warning| seen.insert(warning.clone()))
            .take(32)
            .collect()
    }
}
