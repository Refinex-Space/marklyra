//! Streaming, read-only input for the knowledge index. Never creates document sessions.
use crate::{
    articles::same_metadata, checked_relative, directory_visible, ignored_name, IndexError,
    Workspace,
};
use cap_std::fs::{Dir, File, Metadata, ReadDir};
use document_service::Encoding;
use std::{
    io::Read,
    sync::atomic::{AtomicBool, Ordering},
};

pub struct KnowledgeFile {
    pub path: String,
    pub stamp: String,
    pub size: u64,
    parent: Dir,
    name: String,
    file: File,
    before: Metadata,
}
impl KnowledgeFile {
    pub fn read(mut self) -> Result<String, IndexError> {
        const LIMIT: u64 = 8 * 1024 * 1024;
        if self.size > LIMIT {
            return Err(IndexError::Io(std::io::Error::other(
                "文档超过图谱单文件 8 MiB 读取预算",
            )));
        }
        let mut bytes = Vec::with_capacity(self.size as usize);
        self.file.by_ref().take(LIMIT + 1).read_to_end(&mut bytes)?;
        let after = self.parent.symlink_metadata(&self.name)?;
        if bytes.len() as u64 > LIMIT
            || after.file_type().is_symlink()
            || !same_metadata(&self.before, &self.file.metadata()?)
            || !same_metadata(&self.before, &after)
        {
            return Err(IndexError::Io(std::io::Error::other(
                "索引读取期间文件已变化",
            )));
        }
        Ok(Encoding::decode(&bytes)?.1)
    }
}

#[derive(Default, Debug)]
pub struct KnowledgeScan {
    pub entries: usize,
    pub documents: usize,
    pub skipped: usize,
    pub unreadable: usize,
    pub complete: bool,
}
struct Frame {
    directory: Dir,
    entries: ReadDir,
    relative: String,
    depth: usize,
}

fn open_file(
    parent: &Dir,
    name: &str,
    path: String,
    include: &dyn Fn(&std::fs::File) -> bool,
) -> Result<KnowledgeFile, IndexError> {
    let before = parent.symlink_metadata(name)?;
    if !before.is_file() || before.file_type().is_symlink() || ignored_name(name) {
        return Err(IndexError::InvalidPath);
    }
    let file = parent.open(name)?;
    let opened = file.metadata()?;
    let after = parent.symlink_metadata(name)?;
    if after.file_type().is_symlink()
        || !same_metadata(&before, &opened)
        || !same_metadata(&before, &after)
    {
        return Err(IndexError::Io(std::io::Error::other(
            "索引打开期间文件已变化",
        )));
    }
    if !include(&file.try_clone()?.into_std()) {
        return Err(IndexError::InvalidPath);
    }
    Ok(KnowledgeFile {
        path,
        stamp: stamp(&before)?,
        size: before.len(),
        parent: parent.try_clone()?,
        name: name.into(),
        file,
        before,
    })
}

fn stamp(metadata: &Metadata) -> std::io::Result<String> {
    let base = format!("{}:{:?}", metadata.len(), metadata.modified()?);
    #[cfg(unix)]
    {
        use cap_std::fs::MetadataExt;
        Ok(format!("{base}:{}:{}", metadata.dev(), metadata.ino()))
    }
    #[cfg(windows)]
    {
        use cap_std::fs::MetadataExt;
        Ok(format!("{base}:{}", metadata.creation_time()))
    }
    #[cfg(not(any(unix, windows)))]
    {
        Ok(base)
    }
}

impl Workspace {
    /// Case/Unicode equivalence is proved by the filesystem, not a global lowercase rule.
    pub fn same_knowledge_file(
        &self,
        requested: &str,
        actual: &str,
        include: &dyn Fn(&std::fs::File) -> bool,
    ) -> bool {
        let same = || -> Result<bool, IndexError> {
            let requested = self.knowledge_file(requested, include)?;
            let actual = self.knowledge_file(actual, include)?;
            Ok(same_file::Handle::from_file(requested.file.into_std())?
                == same_file::Handle::from_file(actual.file.into_std())?)
        };
        same().unwrap_or(false)
    }
    pub fn knowledge_file(
        &self,
        relative: &str,
        include: &dyn Fn(&std::fs::File) -> bool,
    ) -> Result<KnowledgeFile, IndexError> {
        let path = checked_relative(relative, false)?;
        let binding = self.display_root_binding()?;
        let mut directory = self.root.try_clone()?;
        for part in path
            .parent()
            .into_iter()
            .flat_map(std::path::Path::components)
        {
            let name = part.as_os_str().to_str().ok_or(IndexError::InvalidPath)?;
            if ignored_name(name) {
                return Err(IndexError::InvalidPath);
            }
            let metadata = directory.symlink_metadata(name)?;
            directory = directory_visible(&directory, name, &metadata, include)?
                .ok_or(IndexError::InvalidPath)?;
        }
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or(IndexError::InvalidPath)?;
        let result = open_file(&directory, name, relative.into(), include)?;
        if binding != self.display_root_binding()? {
            return Err(IndexError::InvalidPath);
        }
        Ok(result)
    }

    pub fn scan_knowledge(
        &self,
        cancel: &AtomicBool,
        include: &dyn Fn(&std::fs::File) -> bool,
        document: &dyn Fn(&str) -> bool,
        mut visit: impl FnMut(KnowledgeFile) -> Result<(), String>,
    ) -> Result<KnowledgeScan, IndexError> {
        let binding = self.display_root_binding()?;
        let root = self.root.try_clone()?;
        let mut frames = vec![Frame {
            entries: root.entries()?,
            directory: root,
            relative: String::new(),
            depth: 0,
        }];
        let mut report = KnowledgeScan {
            complete: true,
            ..Default::default()
        };
        while let Some(frame) = frames.last_mut() {
            if cancel.load(Ordering::Relaxed)
                || report.entries >= 500_000
                || report.documents >= 100_000
            {
                report.complete = false;
                break;
            }
            let Some(entry) = frame.entries.next() else {
                frames.pop();
                continue;
            };
            report.entries += 1;
            let Ok(entry) = entry else {
                report.unreadable += 1;
                continue;
            };
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                report.skipped += 1;
                continue;
            };
            if ignored_name(&name) {
                report.skipped += 1;
                continue;
            }
            let relative = if frame.relative.is_empty() {
                name.clone()
            } else {
                format!("{}/{}", frame.relative, name)
            };
            if checked_relative(&relative, false).is_err() {
                report.skipped += 1;
                continue;
            }
            let Ok(metadata) = frame.directory.symlink_metadata(&name) else {
                report.unreadable += 1;
                continue;
            };
            if metadata.file_type().is_symlink() {
                report.skipped += 1;
                continue;
            }
            if metadata.is_dir() {
                if frame.depth >= 64 {
                    report.complete = false;
                    continue;
                }
                match directory_visible(&frame.directory, &name, &metadata, include) {
                    Ok(Some(directory)) => match directory.entries() {
                        Ok(entries) => {
                            let depth = frame.depth + 1;
                            frames.push(Frame {
                                directory,
                                entries,
                                relative,
                                depth,
                            });
                        }
                        Err(_) => report.unreadable += 1,
                    },
                    Ok(None) => report.skipped += 1,
                    Err(_) => report.unreadable += 1,
                }
            } else if metadata.is_file() && document(&name) {
                report.documents += 1;
                match open_file(&frame.directory, &name, relative, include) {
                    Ok(file) => {
                        visit(file).map_err(|e| IndexError::Io(std::io::Error::other(e)))?
                    }
                    Err(_) => report.unreadable += 1,
                }
            }
        }
        report.complete &= report.unreadable == 0 && binding == self.display_root_binding()?;
        Ok(report)
    }
}
