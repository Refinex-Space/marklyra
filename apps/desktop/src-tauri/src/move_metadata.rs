//! Defer bookmark identity changes until the owned Move publication is known.
//! Existing folder/startup compare-and-swap plans still own the installation.
use cap_std::fs::Dir;
use document_service::{
    DirectoryBookmark, DocumentBookmark, NativeMovePublication, NativeMoveTarget,
    PreparedDirectoryBookmarkMove, PreparedDocumentBookmarkMove, RenameKind,
};
use std::sync::{Arc, Mutex};

pub(crate) struct MoveMetadataInput {
    pub targets: Vec<NativeMoveTarget>,
    sources: Vec<Option<Arc<Dir>>>,
    recipes: Mutex<Recipes>,
}
#[derive(Default)]
struct Recipes {
    directories: Vec<(usize, DirectoryBookmark, PreparedDirectoryBookmarkMove)>,
    documents: Vec<(usize, DocumentBookmark, PreparedDocumentBookmarkMove)>,
}
pub(crate) struct MoveBookmarkMappings {
    directories: Vec<(DirectoryBookmark, DirectoryBookmark)>,
    documents: Vec<(DocumentBookmark, DocumentBookmark)>,
}
impl MoveBookmarkMappings {
    pub fn directory(&self, book: &DirectoryBookmark) -> DirectoryBookmark {
        self.directories
            .iter()
            .find(|(old, _)| old == book)
            .map_or_else(|| book.clone(), |(_, new)| new.clone())
    }
    pub fn document(&self, book: &DocumentBookmark) -> DocumentBookmark {
        self.documents
            .iter()
            .find(|(old, _)| old == book)
            .map_or_else(|| book.clone(), |(_, new)| new.clone())
    }
}
impl MoveMetadataInput {
    pub fn new(targets: Vec<NativeMoveTarget>) -> Result<Arc<Self>, String> {
        if targets.is_empty() || targets.len() > 2 {
            return Err("移动元数据批次无效".into());
        }
        let mut sources = vec![];
        for target in &targets {
            DirectoryBookmark::capture(
                &target.source_parent,
                target.source_display.parent().ok_or("缺少源父目录")?,
            )
            .map_err(|e| e.to_string())?;
            DirectoryBookmark::capture(
                &target.destination_parent,
                target
                    .destination_display
                    .parent()
                    .ok_or("缺少目的父目录")?,
            )
            .map_err(|e| e.to_string())?;
            if target.kind == RenameKind::Directory {
                let source = Arc::new(
                    target
                        .source_parent
                        .open_dir(&target.source_name)
                        .map_err(|e| e.to_string())?,
                );
                DirectoryBookmark::capture(&source, &target.source_display)
                    .map_err(|e| e.to_string())?;
                sources.push(Some(source));
            } else {
                sources.push(None);
            }
        }
        Ok(Arc::new(Self {
            targets,
            sources,
            recipes: Mutex::default(),
        }))
    }
    pub fn affects_document(&self, path: &std::path::Path) -> bool {
        self.targets.iter().any(|target| {
            if target.kind == RenameKind::Directory {
                path.starts_with(&target.source_display)
            } else {
                path == target.source_display
            }
        })
    }
    pub fn affects_directory(&self, path: &std::path::Path) -> bool {
        self.targets.iter().any(|target| {
            target.kind == RenameKind::Directory && path.starts_with(&target.source_display)
        })
    }
    pub fn directory(&self, book: &DirectoryBookmark) -> Result<Option<DirectoryBookmark>, String> {
        for (index, target) in self.targets.iter().enumerate() {
            let Some(source) = &self.sources[index] else {
                continue;
            };
            if let Some(plan) = book
                .prepare_directory_move(
                    source,
                    Arc::clone(&target.destination_parent),
                    &target.source_display,
                    &target.destination_display,
                )
                .map_err(|e| e.to_string())?
            {
                let mut recipes = self.recipes.lock().map_err(|_| "移动元数据不可用")?;
                if recipes.directories.len() + recipes.documents.len() >= 1024 {
                    return Err("移动书签数量已达上限".into());
                }
                recipes.directories.push((index, book.clone(), plan));
                return Ok(Some(book.clone()));
            }
        }
        Ok(None)
    }
    pub fn document(&self, book: &DocumentBookmark) -> Result<Option<DocumentBookmark>, String> {
        for (index, target) in self.targets.iter().enumerate() {
            let plan = if let Some(source) = &self.sources[index] {
                book.prepare_directory_move(
                    source,
                    Arc::clone(&target.destination_parent),
                    &target.source_display,
                    &target.destination_display,
                )
            } else {
                book.prepare_file_move(
                    &target.source_parent,
                    Arc::clone(&target.destination_parent),
                    &target.source_name,
                    &target.destination_name,
                    &target.source_display,
                    &target.destination_display,
                )
            }
            .map_err(|e| e.to_string())?;
            if let Some(plan) = plan {
                let mut recipes = self.recipes.lock().map_err(|_| "移动元数据不可用")?;
                if recipes.directories.len() + recipes.documents.len() >= 1024 {
                    return Err("移动书签数量已达上限".into());
                }
                recipes.documents.push((index, book.clone(), plan));
                return Ok(Some(book.clone()));
            }
        }
        Ok(None)
    }
    pub fn finalize(
        &self,
        publications: &[&NativeMovePublication],
    ) -> Result<MoveBookmarkMappings, String> {
        if publications.len() != self.targets.len() {
            return Err("移动书签发布数量不符".into());
        }
        let recipes = std::mem::take(&mut *self.recipes.lock().map_err(|_| "移动元数据不可用")?);
        let directories = recipes
            .directories
            .into_iter()
            .map(|(index, book, plan)| {
                Ok((
                    book,
                    plan.finalize(publications[index])
                        .map_err(|e| e.to_string())?
                        .commit(),
                ))
            })
            .collect::<Result<Vec<_>, String>>()?;
        let documents = recipes
            .documents
            .into_iter()
            .map(|(index, book, plan)| {
                Ok((
                    book,
                    plan.finalize(publications[index])
                        .map_err(|e| e.to_string())?
                        .commit(),
                ))
            })
            .collect::<Result<Vec<_>, String>>()?;
        Ok(MoveBookmarkMappings {
            directories,
            documents,
        })
    }
}

#[cfg(test)]
mod tests;
