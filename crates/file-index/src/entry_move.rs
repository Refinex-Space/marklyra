//! Native-selected, inspection-scoped moves. A display path never grants IO.
//! The host holds its mutation/document lanes across prepare, IO and publication.
use crate::{
    fs_mutation::{check_entity, check_name, check_token, directory_identity, open_entity},
    EntryKind, IndexError, InspectedEntryAction, Workspace,
};
use cap_std::fs::{Dir, File};
use document_service::{DirectoryBookmark, FileLocationLease};
use serde::Serialize;
use std::{
    collections::HashMap,
    io,
    path::{Path, PathBuf},
    sync::Arc,
};
use uuid::Uuid;

mod platform;
mod tree;
use tree::Tree;

const MAX_OPERATIONS: usize = 256;
const MAX_NAMES: usize = 256;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EntryMoveConflictPolicy {
    Cancel,
    KeepBoth,
    Replace,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryMoveReceipt {
    pub operation_id: String,
    pub entry_token: String,
    pub old_path: String,
    pub path: String,
    pub name: String,
    pub kind: EntryKind,
    pub cross_volume: bool,
    pub replaced: bool,
    pub no_change: bool,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum EntryMoveResolution {
    Prepared,
    Committed { receipt: EntryMoveReceipt },
    Rejected { message: String },
    MutationUncertain,
}

/// Captured before a conflict prompt. Replace cannot silently adopt a target
/// that appeared or changed while the user was deciding.
pub struct EntryMoveDestination {
    token: String,
    directory: Arc<Dir>,
    bookmark: DirectoryBookmark,
    name: PathBuf,
    existing: Option<Tree>,
    same_entity: bool,
}
impl EntryMoveDestination {
    pub fn exists(&self) -> bool {
        self.existing.is_some()
    }
    pub fn existing_kind(&self) -> Option<EntryKind> {
        self.existing.as_ref().map(Tree::kind)
    }
    pub fn same_entity(&self) -> bool {
        self.same_entity
    }
    pub fn path(&self) -> &Path {
        self.bookmark.path()
    }
    pub fn directory(&self) -> Arc<Dir> {
        Arc::clone(&self.directory)
    }
}

struct MoveRequest {
    token: String,
    destination: DirectoryBookmark,
    policy: EntryMoveConflictPolicy,
}
struct MoveOperation {
    request: MoveRequest,
    resolution: EntryMoveResolution,
    plan: Option<Arc<MoveData>>,
    committed: Option<EntryMoveCommit>,
}
#[derive(Default)]
pub(super) struct MoveStore {
    operations: HashMap<String, MoveOperation>,
}

pub enum EntryMovePreparation {
    Ready(EntryMovePlan),
    Completed(EntryMoveReceipt),
}
pub struct EntryMovePlan {
    data: Arc<MoveData>,
}
struct MoveData {
    operation: String,
    token: String,
    source: InspectedEntryAction,
    source_tree: Tree,
    source_parent: DirectoryBookmark,
    destination: Arc<Dir>,
    destination_parent: DirectoryBookmark,
    new_name: PathBuf,
    replacement: Option<Tree>,
    cross_volume: bool,
    no_change: bool,
}
impl EntryMovePlan {
    pub fn operation_id(&self) -> &str {
        &self.data.operation
    }
    pub fn entry_token(&self) -> &str {
        &self.data.token
    }
    pub fn source_directory(&self) -> Arc<Dir> {
        self.data.source.directory()
    }
    pub fn destination_directory(&self) -> Arc<Dir> {
        Arc::clone(&self.data.destination)
    }
    pub fn old_name(&self) -> &Path {
        self.data.source.name()
    }
    pub fn new_name(&self) -> &Path {
        &self.data.new_name
    }
    pub fn old_display_path(&self) -> &Path {
        self.data.source.display_path()
    }
    pub fn new_display_path(&self) -> PathBuf {
        self.data
            .destination_parent
            .path()
            .join(&self.data.new_name)
    }
    pub fn kind(&self) -> EntryKind {
        self.data.source.kind()
    }
    pub fn source_identity(&self) -> Arc<same_file::Handle> {
        self.data.source.source_identity()
    }
    pub fn replacement_identity(&self) -> Option<Arc<same_file::Handle>> {
        self.data.replacement.as_ref().map(Tree::identity)
    }
    pub fn replacement_name(&self) -> Option<PathBuf> {
        self.data
            .replacement
            .as_ref()
            .map(|_| hidden(&self.data.operation, "replaced"))
    }
    pub fn replacement_display_path(&self) -> Option<PathBuf> {
        self.replacement_name()
            .map(|name| self.data.destination_parent.path().join(name))
    }
    pub fn replacement_kind(&self) -> Option<EntryKind> {
        self.data.replacement.as_ref().map(Tree::kind)
    }
    pub fn replacement_source(&self) -> Option<Arc<File>> {
        self.data.replacement.as_ref().map(Tree::source)
    }
    pub fn cross_volume(&self) -> bool {
        self.data.cross_volume
    }
    pub fn no_change(&self) -> bool {
        self.data.no_change
    }
}

#[derive(Clone)]
pub struct EntryMoveCommit {
    pub receipt: EntryMoveReceipt,
    pub undo: EntryMoveUndo,
    pub placement: Arc<EntryMovePlacement>,
}
#[derive(Clone)]
pub struct EntryMoveUndo {
    data: Arc<UndoData>,
}
struct UndoData {
    owner: Uuid,
    source_directory: Arc<Dir>,
    source_parent: DirectoryBookmark,
    source_name: PathBuf,
    destination_directory: Arc<Dir>,
    destination_parent: DirectoryBookmark,
    destination_name: PathBuf,
    identity: Arc<same_file::Handle>,
    kind: EntryKind,
    replacement: Option<EntryMoveReplacement>,
    cross_volume: bool,
    no_change: bool,
}
impl EntryMoveUndo {
    pub fn operation_token(&self) -> String {
        self.data.owner.to_string()
    }
    pub fn old_display_path(&self) -> PathBuf {
        self.data.source_parent.path().join(&self.data.source_name)
    }
    pub fn current_display_path(&self) -> PathBuf {
        self.data
            .destination_parent
            .path()
            .join(&self.data.destination_name)
    }
    pub fn current_directory(&self) -> Arc<Dir> {
        Arc::clone(&self.data.destination_directory)
    }
    pub fn current_name(&self) -> &Path {
        &self.data.destination_name
    }
    pub fn current_identity(&self) -> Arc<same_file::Handle> {
        Arc::clone(&self.data.identity)
    }
    pub fn kind(&self) -> EntryKind {
        self.data.kind
    }
    pub fn replacement(&self) -> Option<&EntryMoveReplacement> {
        self.data.replacement.as_ref()
    }
}

pub struct EntryMoveUndoPlan {
    data: Arc<UndoData>,
    operation: String,
    tree: Tree,
    replacement: Option<EntryMoveReplacement>,
}
impl EntryMoveUndoPlan {
    pub fn operation_id(&self) -> &str {
        &self.operation
    }
    pub fn source_directory(&self) -> Arc<Dir> {
        Arc::clone(&self.data.destination_directory)
    }
    pub fn destination_directory(&self) -> Arc<Dir> {
        Arc::clone(&self.data.source_directory)
    }
    pub fn old_name(&self) -> &Path {
        &self.data.destination_name
    }
    pub fn new_name(&self) -> &Path {
        &self.data.source_name
    }
    pub fn old_display_path(&self) -> PathBuf {
        self.data
            .destination_parent
            .path()
            .join(&self.data.destination_name)
    }
    pub fn new_display_path(&self) -> PathBuf {
        self.data.source_parent.path().join(&self.data.source_name)
    }
    pub fn kind(&self) -> EntryKind {
        self.data.kind
    }
    pub fn source_identity(&self) -> Arc<same_file::Handle> {
        self.tree.identity()
    }
    pub fn replacement(&self) -> Option<&EntryMoveReplacement> {
        self.replacement.as_ref()
    }
}

pub struct EntryMovePlacementEntry {
    suffix: PathBuf,
    kind: EntryKind,
    source: Arc<File>,
    destination: Arc<File>,
    source_identity: Arc<same_file::Handle>,
    destination_identity: Arc<same_file::Handle>,
}
impl EntryMovePlacementEntry {
    pub fn suffix(&self) -> &Path {
        &self.suffix
    }
    pub fn kind(&self) -> EntryKind {
        self.kind
    }
    pub fn source(&self) -> Arc<File> {
        Arc::clone(&self.source)
    }
    pub fn destination(&self) -> Arc<File> {
        Arc::clone(&self.destination)
    }
    pub fn source_identity(&self) -> Arc<same_file::Handle> {
        Arc::clone(&self.source_identity)
    }
    pub fn destination_identity(&self) -> Arc<same_file::Handle> {
        Arc::clone(&self.destination_identity)
    }
}
pub struct EntryMovePlacement {
    operation: Uuid,
    entries: Vec<EntryMovePlacementEntry>,
    replacement: Option<EntryMoveReplacement>,
    source_directory: Arc<Dir>,
    source_name: PathBuf,
    source_display: PathBuf,
    destination_directory: Arc<Dir>,
    destination_name: PathBuf,
    destination_display: PathBuf,
    restored_replacement: bool,
    source_replacement: Option<Arc<File>>,
}
impl EntryMovePlacement {
    pub fn entries(&self) -> &[EntryMovePlacementEntry] {
        &self.entries
    }
    pub fn source_identity(&self) -> Arc<same_file::Handle> {
        self.entries[0].source_identity()
    }
    pub fn destination_identity(&self) -> Arc<same_file::Handle> {
        self.entries[0].destination_identity()
    }
    pub fn replacement(&self) -> Option<&EntryMoveReplacement> {
        self.replacement.as_ref()
    }
    pub fn source_directory(&self) -> Arc<Dir> {
        Arc::clone(&self.source_directory)
    }
    pub fn source_name(&self) -> &Path {
        &self.source_name
    }
    pub fn source_display_path(&self) -> &Path {
        &self.source_display
    }
    pub fn destination_directory(&self) -> Arc<Dir> {
        Arc::clone(&self.destination_directory)
    }
    pub fn destination_name(&self) -> &Path {
        &self.destination_name
    }
    pub fn destination_display_path(&self) -> &Path {
        &self.destination_display
    }
    pub fn kind(&self) -> EntryKind {
        self.entries[0].kind
    }
    pub fn publication(&self) -> Result<document_service::NativeMovePublication, IndexError> {
        let entries = self
            .entries
            .iter()
            .map(|entry| {
                document_service::NativeMovePublicationEntry::from_owned_handles(
                    &entry.suffix,
                    match entry.kind {
                        EntryKind::File => document_service::RenameKind::File,
                        EntryKind::Directory => document_service::RenameKind::Directory,
                    },
                    entry.source(),
                    entry.destination(),
                )
            })
            .collect::<Result<Vec<_>, _>>()?;
        let operation = self.operation;
        let kind = match self.kind() {
            EntryKind::File => document_service::RenameKind::File,
            EntryKind::Directory => document_service::RenameKind::Directory,
        };
        Ok(
            document_service::NativeMovePublication::verify_with_source_replacement(
                operation,
                self.source_directory(),
                &self.source_name,
                self.destination_directory(),
                &self.destination_name,
                kind,
                self.source_replacement.clone(),
                entries,
            )?,
        )
    }
    pub fn replacement_publication(
        &self,
    ) -> Result<Option<document_service::NativeMovePublication>, IndexError> {
        self.replacement_placement()
            .map(|placement| placement.publication())
            .transpose()
    }
    pub fn replacement_placement(&self) -> Option<Self> {
        let replacement = self.replacement.as_ref()?;
        let (source_name, destination_name) = if self.restored_replacement {
            (&replacement.name, &replacement.original_name)
        } else {
            (&replacement.original_name, &replacement.name)
        };
        Some(Self {
            operation: self.operation,
            entries: vec![EntryMovePlacementEntry {
                suffix: PathBuf::new(),
                kind: replacement.kind,
                source: replacement.source(),
                destination: replacement.source(),
                source_identity: replacement.identity(),
                destination_identity: replacement.identity(),
            }],
            replacement: None,
            source_directory: replacement.directory(),
            source_name: source_name.clone(),
            source_display: replacement.parent.path().join(source_name),
            destination_directory: replacement.directory(),
            destination_name: destination_name.clone(),
            destination_display: replacement.parent.path().join(destination_name),
            restored_replacement: false,
            source_replacement: if self.restored_replacement {
                None
            } else {
                Some(self.entries[0].destination())
            },
        })
    }
}
#[derive(Clone)]
pub struct EntryMoveReplacement {
    directory: Arc<Dir>,
    parent: DirectoryBookmark,
    name: PathBuf,
    original_name: PathBuf,
    source: Arc<File>,
    identity: Arc<same_file::Handle>,
    kind: EntryKind,
}
impl EntryMoveReplacement {
    pub fn directory(&self) -> Arc<Dir> {
        Arc::clone(&self.directory)
    }
    pub fn name(&self) -> &Path {
        &self.name
    }
    pub fn original_name(&self) -> &Path {
        &self.original_name
    }
    pub fn display_path(&self) -> PathBuf {
        self.parent.path().join(&self.name)
    }
    pub fn source(&self) -> Arc<File> {
        Arc::clone(&self.source)
    }
    pub fn identity(&self) -> Arc<same_file::Handle> {
        Arc::clone(&self.identity)
    }
    pub fn kind(&self) -> EntryKind {
        self.kind
    }
    fn validate(&self) -> Result<(), IndexError> {
        self.parent.reopen()?;
        check_entity(&self.directory, &self.name, self.kind, &self.identity)
    }
}

impl Workspace {
    pub fn inspect_entry_move_destination(
        &self,
        entry_token: &str,
        directory: Arc<Dir>,
        display: &Path,
    ) -> Result<EntryMoveDestination, IndexError> {
        let source = self.prepare_entry_action(entry_token)?;
        let bookmark = DirectoryBookmark::capture(&directory, display)?;
        if source.kind() == EntryKind::Directory {
            let retained = Dir::from_std_file(source.source().try_clone()?.into_std());
            // Prove the canonical directory spelling before prefix checks;
            // case aliases must not bypass a descendant-destination guard.
            DirectoryBookmark::capture(&retained, source.display_path())?;
            if display.starts_with(source.display_path()) {
                return Err(invalid("不能把目录移入自身或其子目录"));
            }
        }
        let existing = Tree::capture_optional(&directory, source.name())?;
        let same_entity = existing
            .as_ref()
            .is_some_and(|tree| tree.identity().as_ref() == source.source_identity().as_ref());
        self.validate_entry_action(&source)?;
        Ok(EntryMoveDestination {
            token: entry_token.to_owned(),
            directory,
            bookmark,
            name: source.name().to_owned(),
            existing,
            same_entity,
        })
    }

    pub fn prepare_entry_move(
        &self,
        operation_id: &str,
        entry_token: &str,
        destination: EntryMoveDestination,
        policy: EntryMoveConflictPolicy,
    ) -> Result<EntryMovePreparation, IndexError> {
        check_token(operation_id)?;
        check_token(entry_token)?;
        let mut store = self.moves.lock().map_err(|_| unavailable())?;
        if let Some(operation) = store.operations.get(operation_id) {
            if operation.request.token != entry_token
                || operation.request.destination != destination.bookmark
                || operation.request.policy != policy
            {
                return Err(invalid("移动标识已用于不同请求"));
            }
            return match &operation.resolution {
                EntryMoveResolution::Prepared => Ok(EntryMovePreparation::Ready(EntryMovePlan {
                    data: Arc::clone(
                        operation
                            .plan
                            .as_ref()
                            .ok_or(IndexError::MutationUncertain)?,
                    ),
                })),
                EntryMoveResolution::Committed { receipt } => {
                    Ok(EntryMovePreparation::Completed(receipt.clone()))
                }
                EntryMoveResolution::Rejected { message } => Err(invalid(message)),
                EntryMoveResolution::MutationUncertain => Err(IndexError::MutationUncertain),
            };
        }
        if store.operations.len() >= MAX_OPERATIONS {
            return Err(invalid("移动回执已达上限，请重新选择工作区"));
        }
        let request = MoveRequest {
            token: entry_token.to_owned(),
            destination: destination.bookmark.clone(),
            policy,
        };
        let result: Result<Arc<MoveData>, IndexError> = (|| {
            if destination.token != entry_token {
                return Err(invalid("目的目录不属于此条目检查"));
            }
            let source = self.prepare_entry_action(entry_token)?;
            let source_parent = DirectoryBookmark::capture(
                &source.directory(),
                source
                    .display_path()
                    .parent()
                    .ok_or(IndexError::InvalidPath)?,
            )?;
            destination.bookmark.reopen()?;
            let no_change = destination.same_entity
                && directory_identity(&source.directory())?
                    == directory_identity(&destination.directory)?;
            if destination.same_entity && !no_change {
                return Err(invalid("目的位置是同一文件的另一硬链接，不能覆盖"));
            }
            if let Some(existing) = &destination.existing {
                existing.validate(&destination.directory, &destination.name, false)?;
            } else {
                absent(&destination.directory, &destination.name)?;
            }
            let mut name = destination.name.clone();
            let mut replacement = None;
            if destination.existing.is_some() && !no_change {
                let target = destination.bookmark.path().join(&name);
                if policy == EntryMoveConflictPolicy::Replace
                    && source.display_path().starts_with(&target)
                {
                    return Err(invalid("不能用子条目替换包含它的父目录"));
                }
                match policy {
                    EntryMoveConflictPolicy::Cancel => return Err(invalid("已取消同名移动")),
                    EntryMoveConflictPolicy::KeepBoth => {
                        let original = name.to_str().ok_or(IndexError::InvalidPath)?;
                        name = choose_name(&destination.directory, original)?;
                    }
                    EntryMoveConflictPolicy::Replace => replacement = destination.existing,
                }
            }
            let cross_volume =
                platform::different_volume(&source.directory(), &destination.directory)?;
            if cross_volume {
                platform::require_copy_support()?;
            }
            let source_tree = Tree::capture(&source.directory(), source.name())?;
            if source_tree.identity().as_ref() != source.source_identity().as_ref() {
                return Err(stale());
            }
            self.validate_entry_action(&source)?;
            Ok(Arc::new(MoveData {
                operation: operation_id.to_owned(),
                token: entry_token.to_owned(),
                source,
                source_tree,
                source_parent,
                destination: destination.directory,
                destination_parent: destination.bookmark,
                new_name: name,
                replacement,
                cross_volume,
                no_change,
            }))
        })();
        let (resolution, plan) = match &result {
            Ok(data) => (EntryMoveResolution::Prepared, Some(Arc::clone(data))),
            Err(error) => (
                EntryMoveResolution::Rejected {
                    message: error.to_string(),
                },
                None,
            ),
        };
        store.operations.insert(
            operation_id.to_owned(),
            MoveOperation {
                request,
                resolution,
                plan,
                committed: None,
            },
        );
        result.map(|data| EntryMovePreparation::Ready(EntryMovePlan { data }))
    }

    pub fn validate_entry_move(&self, plan: &EntryMovePlan) -> Result<(), IndexError> {
        self.validate_entry_action(&plan.data.source)?;
        validate_move_data(&plan.data)
    }

    pub fn resolve_entry_move(
        &self,
        operation_id: &str,
        entry_token: &str,
    ) -> Result<Option<EntryMoveResolution>, IndexError> {
        check_token(operation_id)?;
        check_token(entry_token)?;
        let store = self.moves.lock().map_err(|_| unavailable())?;
        match store.operations.get(operation_id) {
            Some(operation) if operation.request.token == entry_token => {
                Ok(Some(operation.resolution.clone()))
            }
            Some(_) => Err(invalid("移动标识已用于不同条目")),
            None => Ok(None),
        }
    }

    /// The host must latch uncertainty if metadata publication fails after IO.
    pub fn mark_entry_move_uncertain(&self, operation_id: &str) -> Result<(), IndexError> {
        check_token(operation_id)?;
        let mut store = self.moves.lock().map_err(|_| unavailable())?;
        let operation = store.operations.get_mut(operation_id).ok_or_else(stale)?;
        operation.resolution = EntryMoveResolution::MutationUncertain;
        operation.committed = None;
        operation.plan = None;
        Ok(())
    }

    pub fn reject_prepared_entry_move(
        &self,
        operation_id: &str,
        entry_token: &str,
        message: &str,
    ) -> Result<(), IndexError> {
        check_token(operation_id)?;
        check_token(entry_token)?;
        let mut store = self.moves.lock().map_err(|_| unavailable())?;
        let operation = store.operations.get_mut(operation_id).ok_or_else(stale)?;
        if operation.request.token != entry_token {
            return Err(stale());
        }
        if matches!(operation.resolution, EntryMoveResolution::Prepared) {
            operation.resolution = EntryMoveResolution::Rejected {
                message: message.chars().take(2048).collect(),
            };
            operation.plan = None;
        }
        Ok(())
    }

    pub fn commit_entry_move(&self, plan: EntryMovePlan) -> Result<EntryMoveCommit, IndexError> {
        self.commit_entry_move_inner(plan, || {}, false)
    }

    fn commit_entry_move_inner(
        &self,
        plan: EntryMovePlan,
        after_first_mutation: impl FnOnce(),
        force_copy: bool,
    ) -> Result<EntryMoveCommit, IndexError> {
        let data = plan.data;
        let mut store = self.moves.lock().map_err(|_| unavailable())?;
        let operation = store
            .operations
            .get_mut(&data.operation)
            .ok_or_else(stale)?;
        if operation.request.token != data.token
            || operation.request.destination != data.destination_parent
        {
            return Err(stale());
        }
        match &operation.resolution {
            EntryMoveResolution::Committed { .. } => {
                return operation
                    .committed
                    .clone()
                    .ok_or(IndexError::MutationUncertain)
            }
            EntryMoveResolution::Rejected { message } => return Err(invalid(message)),
            EntryMoveResolution::MutationUncertain => return Err(IndexError::MutationUncertain),
            EntryMoveResolution::Prepared => {}
        }
        if !operation
            .plan
            .as_ref()
            .is_some_and(|value| Arc::ptr_eq(value, &data))
        {
            return Err(stale());
        }
        let copy_transfer = data.cross_volume || force_copy;
        let mut mutated = false;
        let result: Result<EntryMoveCommit, IndexError> = (|| {
            self.validate_entry_action(&data.source)?;
            validate_move_data(&data)?;
            // Finish the metadata-preserving copy before displacing either
            // visible entity. Failed copy evidence does not hide an old target.
            let copied_stage = if copy_transfer && !data.no_change {
                let stage = hidden(&data.operation, "stage");
                absent(&data.destination, &stage)?;
                mutated = true;
                let copied = data.source_tree.copy_to(&data.destination, &stage)?;
                self.validate_entry_action(&data.source)?;
                validate_move_data(&data)?;
                Some((stage, copied))
            } else {
                None
            };
            let mut replacement = None;
            if let Some(target) = &data.replacement {
                let backup = hidden(&data.operation, "replaced");
                absent(&data.destination, &backup)?;
                platform::rename_between(
                    &data.destination,
                    &target.source(),
                    &data.new_name,
                    &data.destination,
                    &backup,
                )?;
                mutated = true;
                replacement = Some(EntryMoveReplacement {
                    directory: Arc::clone(&data.destination),
                    parent: data.destination_parent.clone(),
                    name: backup,
                    original_name: data.new_name.clone(),
                    source: target.source(),
                    identity: target.identity(),
                    kind: target.kind(),
                });
            }
            let placement_entries = if data.no_change {
                data.source_tree.same_placement()
            } else if copy_transfer {
                // A failed transfer preserves source, staging and replacement
                // evidence. No name-based destructive rollback is attempted.
                let (stage, copied) = copied_stage.ok_or(IndexError::MutationUncertain)?;
                self.validate_entry_action(&data.source)?;
                data.source_tree
                    .validate(&data.source.directory(), data.source.name(), false)?;
                let retained = hidden(&data.operation, "source");
                absent(&data.source.directory(), &retained)?;
                platform::rename_between(
                    &data.source.directory(),
                    &data.source.source(),
                    data.source.name(),
                    &data.source.directory(),
                    &retained,
                )?;
                copied.validate(&data.destination, &stage, false)?;
                platform::rename_between(
                    &data.destination,
                    &copied.source(),
                    &stage,
                    &data.destination,
                    &data.new_name,
                )?;
                copied.validate(&data.destination, &data.new_name, true)?;
                data.source_tree.placement(&copied)?
            } else {
                platform::rename_between(
                    &data.source.directory(),
                    &data.source.source(),
                    data.source.name(),
                    &data.destination,
                    &data.new_name,
                )?;
                mutated = true;
                data.source_tree
                    .validate(&data.destination, &data.new_name, true)?;
                data.source_tree.same_placement()
            };
            if mutated {
                after_first_mutation();
            }
            data.source_parent.reopen()?;
            data.destination_parent.reopen()?;
            if !data.no_change {
                absent(&data.source.directory(), data.source.name())?;
            }
            if let Some(value) = &replacement {
                value.validate()?;
            }
            let identity = placement_entries[0].destination_identity();
            check_entity(
                &data.destination,
                &data.new_name,
                data.source.kind(),
                &identity,
            )?;
            platform::sync_directory(&data.source.directory())?;
            platform::sync_directory(&data.destination)?;
            let receipt = EntryMoveReceipt {
                operation_id: data.operation.clone(),
                entry_token: data.token.clone(),
                old_path: data.source.display_path().to_string_lossy().into_owned(),
                path: data
                    .destination_parent
                    .path()
                    .join(&data.new_name)
                    .to_string_lossy()
                    .into_owned(),
                name: data.new_name.to_string_lossy().into_owned(),
                kind: data.source.kind(),
                cross_volume: copy_transfer,
                replaced: replacement.is_some(),
                no_change: data.no_change,
                warnings: if copy_transfer {
                    vec!["跨卷移动保留了本机隐藏源备份，未自动删除恢复证据".into()]
                } else {
                    vec![]
                },
            };
            let undo = EntryMoveUndo {
                data: Arc::new(UndoData {
                    owner: Uuid::new_v4(),
                    source_directory: data.source.directory(),
                    source_parent: data.source_parent.clone(),
                    source_name: data.source.name().to_owned(),
                    destination_directory: Arc::clone(&data.destination),
                    destination_parent: data.destination_parent.clone(),
                    destination_name: data.new_name.clone(),
                    identity,
                    kind: data.source.kind(),
                    replacement: replacement.clone(),
                    cross_volume: copy_transfer,
                    no_change: data.no_change,
                }),
            };
            Ok(EntryMoveCommit {
                receipt,
                undo,
                placement: Arc::new(EntryMovePlacement {
                    operation: Uuid::parse_str(&data.operation)
                        .map_err(|_| IndexError::MutationUncertain)?,
                    entries: placement_entries,
                    replacement,
                    source_directory: data.source.directory(),
                    source_name: data.source.name().to_owned(),
                    source_display: data.source.display_path().to_owned(),
                    destination_directory: Arc::clone(&data.destination),
                    destination_name: data.new_name.clone(),
                    destination_display: data.destination_parent.path().join(&data.new_name),
                    restored_replacement: false,
                    source_replacement: None,
                }),
            })
        })();
        match result {
            Ok(commit) => {
                if self.finish_entry_inspection(&data.token).is_err() {
                    operation.resolution = EntryMoveResolution::MutationUncertain;
                    operation.plan = None;
                    return Err(IndexError::MutationUncertain);
                }
                operation.resolution = EntryMoveResolution::Committed {
                    receipt: commit.receipt.clone(),
                };
                operation.committed = Some(commit.clone());
                operation.plan = None;
                Ok(commit)
            }
            Err(_) if mutated => {
                operation.resolution = EntryMoveResolution::MutationUncertain;
                operation.plan = None;
                Err(IndexError::MutationUncertain)
            }
            Err(error) => {
                operation.resolution = EntryMoveResolution::Rejected {
                    message: error.to_string(),
                };
                operation.plan = None;
                Err(error)
            }
        }
    }

    pub fn prepare_entry_move_undo(
        &self,
        operation_id: &str,
        lease: &EntryMoveUndo,
        file_lease: Option<&FileLocationLease>,
    ) -> Result<EntryMoveUndoPlan, IndexError> {
        self.prepare_entry_move_undo_with_replacement(operation_id, lease, file_lease, None)
    }
    pub fn prepare_entry_move_undo_with_replacement(
        &self,
        operation_id: &str,
        lease: &EntryMoveUndo,
        file_lease: Option<&FileLocationLease>,
        replacement_file_lease: Option<&FileLocationLease>,
    ) -> Result<EntryMoveUndoPlan, IndexError> {
        check_token(operation_id)?;
        let data = &lease.data;
        data.source_parent.reopen()?;
        data.destination_parent.reopen()?;
        if data.no_change {
            return Err(invalid("本次移动未改变位置，无需撤销"));
        }
        absent(&data.source_directory, &data.source_name)?;
        let mut replacement = data.replacement.clone();
        if let Some(replacement) = &mut replacement {
            if replacement.kind == EntryKind::File {
                if let Some(file_lease) = replacement_file_lease {
                    replacement.identity = file_lease.current_identity()?;
                    replacement.source = Arc::new(file_lease.open_current()?);
                }
            }
            replacement.validate()?;
        }
        let expected = if data.kind == EntryKind::File {
            if let Some(file_lease) = file_lease {
                file_lease.current_identity()?
            } else {
                Arc::clone(&data.identity)
            }
        } else {
            Arc::clone(&data.identity)
        };
        check_entity(
            &data.destination_directory,
            &data.destination_name,
            data.kind,
            &expected,
        )?;
        let tree = Tree::capture(&data.destination_directory, &data.destination_name)?;
        if tree.identity().as_ref() != expected.as_ref() {
            return Err(stale());
        }
        Ok(EntryMoveUndoPlan {
            data: Arc::clone(data),
            operation: operation_id.to_owned(),
            tree,
            replacement,
        })
    }

    pub fn commit_entry_move_undo(
        &self,
        plan: EntryMoveUndoPlan,
    ) -> Result<EntryMoveCommit, IndexError> {
        // Undo has its own canonical operation UUID and bounded receipt store.
        let mut store = self.moves.lock().map_err(|_| unavailable())?;
        if let Some(operation) = store.operations.get(&plan.operation) {
            if operation.request.token != plan.data.owner.to_string() {
                return Err(invalid("撤销标识已用于其他操作"));
            }
            return match &operation.resolution {
                EntryMoveResolution::Committed { .. } => operation
                    .committed
                    .clone()
                    .ok_or(IndexError::MutationUncertain),
                EntryMoveResolution::Rejected { message } => Err(invalid(message)),
                _ => Err(IndexError::MutationUncertain),
            };
        }
        if store.operations.len() >= MAX_OPERATIONS {
            return Err(invalid("移动回执已达上限"));
        }
        let data = &plan.data;
        let request = MoveRequest {
            token: data.owner.to_string(),
            destination: data.source_parent.clone(),
            policy: EntryMoveConflictPolicy::Cancel,
        };
        let mut mutated = false;
        let result: Result<EntryMoveCommit, IndexError> = (|| {
            data.source_parent.reopen()?;
            data.destination_parent.reopen()?;
            absent(&data.source_directory, &data.source_name)?;
            plan.tree
                .validate(&data.destination_directory, &data.destination_name, false)?;
            if let Some(replacement) = &plan.replacement {
                replacement.validate()?;
            }
            let entries = if data.cross_volume {
                let stage = hidden(&plan.operation, "undo-stage");
                absent(&data.source_directory, &stage)?;
                mutated = true;
                let copied = plan.tree.copy_to(&data.source_directory, &stage)?;
                plan.tree
                    .validate(&data.destination_directory, &data.destination_name, false)?;
                let retained = hidden(&plan.operation, "undo-source");
                absent(&data.destination_directory, &retained)?;
                platform::rename_between(
                    &data.destination_directory,
                    &plan.tree.source(),
                    &data.destination_name,
                    &data.destination_directory,
                    &retained,
                )?;
                platform::rename_between(
                    &data.source_directory,
                    &copied.source(),
                    &stage,
                    &data.source_directory,
                    &data.source_name,
                )?;
                copied.validate(&data.source_directory, &data.source_name, true)?;
                plan.tree.placement(&copied)?
            } else {
                platform::rename_between(
                    &data.destination_directory,
                    &plan.tree.source(),
                    &data.destination_name,
                    &data.source_directory,
                    &data.source_name,
                )?;
                mutated = true;
                plan.tree
                    .validate(&data.source_directory, &data.source_name, true)?;
                plan.tree.same_placement()
            };
            if let Some(replacement) = &plan.replacement {
                replacement.validate()?;
                absent(&data.destination_directory, &data.destination_name)?;
                platform::rename_between(
                    &replacement.directory,
                    &replacement.source,
                    &replacement.name,
                    &data.destination_directory,
                    &data.destination_name,
                )?;
                check_entity(
                    &data.destination_directory,
                    &data.destination_name,
                    replacement.kind,
                    &replacement.identity,
                )?;
            }
            data.source_parent.reopen()?;
            data.destination_parent.reopen()?;
            check_entity(
                &data.source_directory,
                &data.source_name,
                data.kind,
                &entries[0].destination_identity,
            )?;
            platform::sync_directory(&data.source_directory)?;
            platform::sync_directory(&data.destination_directory)?;
            let receipt = EntryMoveReceipt {
                operation_id: plan.operation.clone(),
                entry_token: data.owner.to_string(),
                old_path: data
                    .destination_parent
                    .path()
                    .join(&data.destination_name)
                    .to_string_lossy()
                    .into_owned(),
                path: data
                    .source_parent
                    .path()
                    .join(&data.source_name)
                    .to_string_lossy()
                    .into_owned(),
                name: data.source_name.to_string_lossy().into_owned(),
                kind: data.kind,
                cross_volume: data.cross_volume,
                replaced: data.replacement.is_some(),
                no_change: false,
                warnings: vec![],
            };
            Ok(EntryMoveCommit {
                receipt,
                undo: EntryMoveUndo {
                    data: Arc::clone(data),
                },
                placement: Arc::new(EntryMovePlacement {
                    operation: Uuid::parse_str(&plan.operation)
                        .map_err(|_| IndexError::MutationUncertain)?,
                    entries,
                    replacement: plan.replacement.clone(),
                    source_directory: Arc::clone(&data.destination_directory),
                    source_name: data.destination_name.clone(),
                    source_display: data.destination_parent.path().join(&data.destination_name),
                    destination_directory: Arc::clone(&data.source_directory),
                    destination_name: data.source_name.clone(),
                    destination_display: data.source_parent.path().join(&data.source_name),
                    restored_replacement: plan.replacement.is_some(),
                    source_replacement: plan.replacement.as_ref().map(EntryMoveReplacement::source),
                }),
            })
        })();
        let resolution = match &result {
            Ok(commit) => EntryMoveResolution::Committed {
                receipt: commit.receipt.clone(),
            },
            Err(_) if mutated => EntryMoveResolution::MutationUncertain,
            Err(error) => EntryMoveResolution::Rejected {
                message: error.to_string(),
            },
        };
        store.operations.insert(
            plan.operation,
            MoveOperation {
                request,
                resolution,
                plan: None,
                committed: result.as_ref().ok().cloned(),
            },
        );
        if result.is_err() && mutated {
            Err(IndexError::MutationUncertain)
        } else {
            result
        }
    }
}

fn validate_move_data(data: &MoveData) -> Result<(), IndexError> {
    data.source_parent.reopen()?;
    data.destination_parent.reopen()?;
    data.source_tree
        .validate(&data.source.directory(), data.source.name(), false)?;
    if let Some(replacement) = &data.replacement {
        replacement.validate(&data.destination, &data.new_name, false)?;
    } else if !data.no_change {
        absent(&data.destination, &data.new_name)?;
    }
    if data.source.kind() == EntryKind::Directory
        && data
            .destination_parent
            .path()
            .starts_with(data.source.display_path())
    {
        return Err(invalid("不能把目录移入自身或其子目录"));
    }
    Ok(())
}
fn choose_name(directory: &Dir, source: &str) -> Result<PathBuf, IndexError> {
    let path = Path::new(source);
    let extension = path.extension().and_then(|value| value.to_str());
    let mut stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or(IndexError::InvalidPath)?
        .to_owned();
    for _ in 0..MAX_NAMES {
        stem.push_str(" (copy)");
        let name =
            extension.map_or_else(|| stem.clone(), |extension| format!("{stem}.{extension}"));
        check_name(&name)?;
        match directory.symlink_metadata(&name) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(name.into()),
            Ok(_) => {}
            Err(error) => return Err(error.into()),
        }
    }
    Err(invalid("同名目标持续变化，无法选择保留两者名称"))
}
fn hidden(operation: &str, purpose: &str) -> PathBuf {
    format!(".marklyra-move-{operation}-{purpose}").into()
}
fn absent(directory: &Dir, name: &Path) -> Result<(), IndexError> {
    match directory.symlink_metadata(name) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Ok(_) => Err(invalid("目标名称已被占用，未覆盖现有实体")),
        Err(error) => Err(error.into()),
    }
}
fn invalid(message: &str) -> IndexError {
    io::Error::new(io::ErrorKind::InvalidInput, message).into()
}
fn stale() -> IndexError {
    io::Error::new(
        io::ErrorKind::PermissionDenied,
        "移动源、目的目录或冲突实体已变化，请重新检查",
    )
    .into()
}
fn unavailable() -> IndexError {
    io::Error::other("移动回执状态不可用").into()
}

#[cfg(test)]
mod tests;
