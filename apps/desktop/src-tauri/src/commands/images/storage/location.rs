//! Persistent image grants follow only a proved Native file operation. Reading
//! Markdown or observing a new display path can never construct this plan.
use super::*;
use crate::{move_metadata::MoveBookmarkMappings, rename_metadata::RenameInput};
use document_service::{DirectoryBookmark, NativeMovePublication};
use std::{
    path::Path,
    time::{Duration, Instant},
};

const MAX_SCANNED_RECORDS: usize = 20_000;
const MAX_BINDING_RECORDS: usize = 2_048;
const MAX_BINDING_BYTES: u64 = 64 * 1024 * 1024;

struct Change {
    record: Binding,
    expected: Vec<u8>,
    old_name: String,
    destination: DocumentBookmark,
    movement: Option<(usize, PathBuf)>,
    destination_identity: Option<ImageDocumentIdentity>,
}

/// Captured before FS publication; commit is called only by the existing
/// successful rename/OwnedMove metadata callback under the same mutation lane.
pub(crate) struct ImageBindingLocationPlan {
    root: Arc<Dir>,
    root_bookmark: DirectoryBookmark,
    changes: Vec<Change>,
}

impl ImageBindingLocationPlan {
    pub(crate) fn prepare(app: &AppHandle, input: &RenameInput) -> Result<Self, String> {
        let (root, path) = root(app)?;
        Self::prepare_at(root, &path, input)
    }

    fn prepare_at(root: Arc<Dir>, path: &Path, input: &RenameInput) -> Result<Self, String> {
        let root_bookmark =
            DirectoryBookmark::capture(&root, path).map_err(|error| error.to_string())?;
        let mut names = Vec::new();
        if input.kind == file_index::EntryKind::File && input.movement.is_none() {
            names.push(binding_name(&input.old));
        } else if let Some(moves) = input.movement.as_ref().filter(|moves| {
            moves
                .targets
                .iter()
                .all(|target| target.kind == document_service::RenameKind::File)
        }) {
            names.extend(
                moves
                    .targets
                    .iter()
                    .map(|target| binding_name(&target.source_display)),
            );
            names.sort_unstable();
            names.dedup();
        } else {
            let started = Instant::now();
            for (index, entry) in root
                .entries()
                .map_err(|error| error.to_string())?
                .enumerate()
            {
                if index >= MAX_SCANNED_RECORDS || started.elapsed() > Duration::from_millis(500) {
                    return Err("图片位置记录检查达到条目或时间上限".into());
                }
                let name = entry.map_err(|error| error.to_string())?.file_name();
                let Some(name) = name.to_str() else {
                    continue;
                };
                if is_binding_name(name) {
                    if names.len() >= MAX_BINDING_RECORDS {
                        return Err("图片位置记录数量超过限制".into());
                    }
                    names.push(name.to_owned());
                }
            }
        }
        let mut bytes = 0;
        let mut changes = Vec::new();
        for name in names {
            let Some(record): Option<Binding> = read_record(&root, &name)? else {
                continue;
            };
            let expected = record_bytes(&record)?;
            bytes += expected.len() as u64;
            if bytes > MAX_BINDING_BYTES {
                return Err("图片位置记录总字节超过限制".into());
            }
            if name != binding_name(&record.document.path()) {
                return Err("图片绑定记录名称与原生路径不符".into());
            }
            if !input.affects_document(&record.document.path()) {
                continue;
            }
            validate_binding(&record)?;
            // Old keys are intentionally retained after a successful handoff.
            // A stale/tombstoned record is not current authority and must not
            // prevent another live descendant's directory rename.
            let Ok(parent) = record.document.parent().reopen() else {
                continue;
            };
            let old_path = record.document.path();
            let Ok(identity) = ImageDocumentIdentity::capture_file(
                &parent,
                Path::new(old_path.file_name().ok_or("图片文稿缺少名称")?),
            ) else {
                continue;
            };
            if identity != record.identity {
                continue;
            }
            let Some(destination) = input.document(&record.document)? else {
                return Err("图片绑定不属于已验证的文件操作".into());
            };
            let movement = if let Some(moves) = &input.movement {
                Some(
                    moves
                        .targets
                        .iter()
                        .enumerate()
                        .find_map(|(index, target)| {
                            if target.kind == document_service::RenameKind::Directory {
                                old_path
                                    .strip_prefix(&target.source_display)
                                    .ok()
                                    .map(|suffix| (index, suffix.to_owned()))
                            } else if old_path == target.source_display {
                                Some((index, PathBuf::new()))
                            } else {
                                None
                            }
                        })
                        .ok_or("图片绑定缺少实际移动来源")?,
                )
            } else {
                None
            };
            changes.push(Change {
                record,
                expected,
                old_name: name,
                destination,
                movement,
                destination_identity: None,
            });
        }
        Ok(Self {
            root,
            root_bookmark,
            changes,
        })
    }

    pub(crate) fn commit_moves(
        mut self,
        mappings: &MoveBookmarkMappings,
        publications: &[&NativeMovePublication],
    ) -> Vec<String> {
        for change in &mut self.changes {
            let Some((index, suffix)) = &change.movement else {
                return vec!["图片位置交接缺少移动来源证明".into()];
            };
            let Some(publication) = publications.get(*index) else {
                return vec!["图片位置交接缺少实际移动回执".into()];
            };
            change.destination = mappings.document(&change.record.document);
            if change.destination == change.record.document {
                return vec!["图片位置书签尚未通过实际移动交接".into()];
            }
            match publication.image_document_identity(suffix, &change.record.identity) {
                Ok(identity) => change.destination_identity = Some(identity),
                Err(error) => return vec![format!("图片位置实体未由移动回执证明：{error}")],
            }
        }
        self.commit()
    }

    pub(crate) fn commit(self) -> Vec<String> {
        if let Err(error) = self.root_bookmark.reopen() {
            return vec![format!("文件已移动，但图片记录目录身份未确认：{error}")];
        }
        // Replacement/Undo can write one group's destination over another old
        // record key. Validate every captured source before our first write.
        for change in &self.changes {
            match read_record::<Binding>(&self.root, &change.old_name).and_then(|current| {
                if current.as_ref().map(record_bytes).transpose()?.as_deref()
                    == Some(change.expected.as_slice())
                {
                    Ok(())
                } else {
                    Err("原图片绑定记录已有新变化或消失".into())
                }
            }) {
                Ok(()) => {}
                Err(error) => {
                    return vec![format!("文件位置已更新，但图片绑定迁移未完成：{error}")]
                }
            }
        }
        let mut warnings = Vec::new();
        for mut change in self.changes {
            let result = (|| {
                let parent = change
                    .destination
                    .parent()
                    .reopen()
                    .map_err(|error| error.to_string())?;
                let path = change.destination.path();
                let identity = ImageDocumentIdentity::capture_file(
                    &parent,
                    Path::new(path.file_name().ok_or("目的文稿缺少名称")?),
                )
                .map_err(|error| error.to_string())?;
                let expected = change
                    .destination_identity
                    .as_ref()
                    .unwrap_or(&change.record.identity);
                if &identity != expected {
                    return Err("目的文稿实体不属于已确认的文件操作".into());
                }
                let new_name = binding_name(&path);
                if let Some(existing) = read_record::<Binding>(&self.root, &new_name)? {
                    if existing.document.path() != path {
                        return Err("目的图片绑定名称存在冲突".into());
                    }
                }
                let changed_parent = change.record.document.path().parent() != path.parent();
                if changed_parent && !change.record.aliases.is_empty() {
                    change.record.aliases.clear();
                    warnings.push(
                        "文稿父目录已变化；未证明随操作携带的相对图片历史引用未重新授权".into(),
                    );
                }
                change.record.document = change.destination;
                change.record.identity = identity;
                validate_binding(&change.record)?;
                write_record(&self.root, &new_name, &change.record)
            })();
            if let Err(error) = result {
                warnings.push(format!("文件位置已更新，但图片绑定迁移未完成：{error}"));
            }
        }
        warnings
    }
}

fn is_binding_name(name: &str) -> bool {
    name.strip_prefix("binding-")
        .and_then(|name| name.strip_suffix(".json"))
        .is_some_and(|hash| hash.len() == 16 && hash.bytes().all(|byte| byte.is_ascii_hexdigit()))
}

#[cfg(test)]
mod tests;
