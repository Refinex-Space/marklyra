//! Inspection-scoped raw-byte duplication. A renderer path or draft never
//! grants read/write access; the host serializes this with other mutations.
use crate::{
    fs_mutation::{check_entity, check_name, check_token},
    join_relative, EntryKind, IndexError, InspectedEntryAction, Workspace,
};
use cap_std::fs::{File, Metadata, OpenOptions};
use document_service::MAX_FILE_BYTES;
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{self, Read, Seek, SeekFrom, Write},
    path::Path,
};

const MAX_OPERATIONS: usize = 256;
const MAX_NAME_ATTEMPTS: usize = 256;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntryDuplicateReceipt {
    pub operation_id: String,
    pub entry_token: String,
    pub name: String,
    pub relative_path: String,
    pub kind: EntryKind,
    pub size: Option<u64>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum EntryDuplicateResolution {
    Committed { receipt: EntryDuplicateReceipt },
    Rejected { message: String },
    MutationUncertain,
}

struct Operation {
    token: String,
    resolution: EntryDuplicateResolution,
}

#[derive(Default)]
pub(super) struct DuplicateStore {
    operations: HashMap<String, Operation>,
}

impl Workspace {
    /// Repeating the same UUID and inspection returns its first confirmed
    /// receipt. Rejected/uncertain operations never perform another write.
    /// This leaves the source inspection live; a host finishes it explicitly.
    pub fn duplicate_entry(
        &self,
        operation_id: &str,
        entry_token: &str,
    ) -> Result<EntryDuplicateReceipt, IndexError> {
        self.duplicate_entry_with_hooks(operation_id, entry_token, || {}, || {}, |_, _| Ok(()))
    }

    /// Resolves a lost response without repeating any filesystem operation or
    /// granting authority to the reported display/relative path.
    pub fn resolve_entry_duplicate(
        &self,
        operation_id: &str,
        entry_token: &str,
    ) -> Result<Option<EntryDuplicateResolution>, IndexError> {
        check_token(operation_id)?;
        check_token(entry_token)?;
        let state = self.duplicates.lock().map_err(|_| unavailable())?;
        match state.operations.get(operation_id) {
            Some(operation) if operation.token == entry_token => {
                Ok(Some(operation.resolution.clone()))
            }
            Some(_) => Err(invalid("复制操作标识已用于不同条目检查")),
            None => Ok(None),
        }
    }

    fn duplicate_entry_with_hooks(
        &self,
        operation_id: &str,
        entry_token: &str,
        between_reads: impl FnOnce(),
        before_create: impl FnOnce(),
        after_create: impl FnOnce(&cap_std::fs::Dir, &Path) -> io::Result<()>,
    ) -> Result<EntryDuplicateReceipt, IndexError> {
        check_token(operation_id)?;
        let mut state = self.duplicates.lock().map_err(|_| unavailable())?;
        if let Some(operation) = state.operations.get(operation_id) {
            if operation.token != entry_token {
                return Err(invalid("复制操作标识已用于不同条目检查"));
            }
            return match &operation.resolution {
                EntryDuplicateResolution::Committed { receipt } => Ok(receipt.clone()),
                EntryDuplicateResolution::Rejected { message } => Err(invalid(message)),
                EntryDuplicateResolution::MutationUncertain => Err(IndexError::MutationUncertain),
            };
        }
        if state.operations.len() >= MAX_OPERATIONS {
            return Err(limit("复制回执已达工作区上限，请重新选择目录"));
        }
        // Reserve even a rejected canonical operation ID. Malformed tokens are
        // not retained, so an untrusted request cannot grow this bounded store.
        let valid_token = check_token(entry_token);
        state.operations.insert(
            operation_id.to_owned(),
            Operation {
                token: if valid_token.is_ok() {
                    entry_token.to_owned()
                } else {
                    String::new()
                },
                resolution: EntryDuplicateResolution::MutationUncertain,
            },
        );
        let mut mutated = false;
        let result = (|| {
            valid_token?;
            let plan = self.prepare_entry_action(entry_token)?;
            if plan.kind() != EntryKind::File {
                return Err(invalid("仅支持复制普通文件"));
            }
            let parent = {
                let entries = self.entries.lock().map_err(|_| unavailable())?;
                entries
                    .pending
                    .get(entry_token)
                    .ok_or_else(stale)?
                    .parent
                    .clone()
            };
            let source = plan.source();
            let version = Version::capture(&source)?;
            let bytes = self.read_duplicate_snapshot(&plan, &version, between_reads)?;
            let directory = plan.directory();
            let source_name = plan.name().to_str().ok_or(IndexError::InvalidPath)?;
            before_create();
            for number in 0..MAX_NAME_ATTEMPTS {
                let name = duplicate_name(source_name, number)?;
                check_name(&name)?;
                self.validate_entry_action(&plan)?;
                version.check(&source)?;
                let mut options = OpenOptions::new();
                options.read(true).write(true).create_new(true);
                #[cfg(unix)]
                {
                    use cap_std::fs::OpenOptionsExt;
                    options.mode(0o600);
                }
                let mut target = match directory.open_with(&name, &options) {
                    Ok(file) => file,
                    Err(error)
                        if error.kind() == io::ErrorKind::AlreadyExists
                            || cfg!(windows)
                                && error.kind() == io::ErrorKind::PermissionDenied
                                && directory.symlink_metadata(&name).is_ok() =>
                    {
                        // Windows reports ACCESS_DENIED when CREATE_NEW collides
                        // with a directory. Only an observed entry permits retry.
                        continue;
                    }
                    Err(error) => return Err(error.into()),
                };
                // Once create_new succeeds, retain any partial or externally
                // replaced entity as evidence. Never delete by its old name.
                mutated = true;
                let identity = same_file::Handle::from_file(target.try_clone()?.into_std())?;
                if identity == *plan.source_identity() {
                    return Err(stale());
                }
                after_create(&directory, Path::new(&name))?;
                target.write_all(&bytes)?;
                copy_metadata(&source, &target)?;
                target.sync_all()?;
                let target_version = Version::capture(&target)?;
                if target_version.length != bytes.len() as u64 || read_bounded(&target)? != bytes {
                    return Err(stale());
                }
                target_version.check(&target)?;
                check_entity(&directory, Path::new(&name), EntryKind::File, &identity)?;
                self.validate_entry_action(&plan)?;
                version.check(&source)?;
                #[cfg(unix)]
                directory.try_clone()?.into_std_file().sync_all()?;
                // These are optimistic identity/content checks, not an OS
                // snapshot lock or atomic source compare-and-swap.
                check_entity(&directory, Path::new(&name), EntryKind::File, &identity)?;
                target_version.check(&target)?;
                self.validate_entry_action(&plan)?;
                version.check(&source)?;
                return Ok(EntryDuplicateReceipt {
                    operation_id: operation_id.to_owned(),
                    entry_token: entry_token.to_owned(),
                    relative_path: join_relative(&parent, &name),
                    name,
                    kind: EntryKind::File,
                    size: Some(bytes.len() as u64),
                    warnings: vec![],
                });
            }
            Err(limit("目录持续变化，无法安全选择副本名称"))
        })();
        let resolution = match &result {
            Ok(receipt) => EntryDuplicateResolution::Committed {
                receipt: receipt.clone(),
            },
            Err(_) if mutated => EntryDuplicateResolution::MutationUncertain,
            Err(error) => EntryDuplicateResolution::Rejected {
                message: error.to_string(),
            },
        };
        state
            .operations
            .get_mut(operation_id)
            .ok_or(IndexError::MutationUncertain)?
            .resolution = resolution;
        if result.is_err() && mutated {
            Err(IndexError::MutationUncertain)
        } else {
            result
        }
    }

    fn read_duplicate_snapshot(
        &self,
        plan: &InspectedEntryAction,
        version: &Version,
        between_reads: impl FnOnce(),
    ) -> Result<Vec<u8>, IndexError> {
        self.validate_entry_action(plan)?;
        let source = plan.source();
        version.check(&source)?;
        let bytes = read_bounded(&source)?;
        version.check(&source)?;
        between_reads();
        self.validate_entry_action(plan)?;
        version.check(&source)?;
        if read_bounded(&source)? != bytes {
            return Err(stale());
        }
        version.check(&source)?;
        self.validate_entry_action(plan)?;
        Ok(bytes)
    }
}

#[cfg(target_os = "macos")]
fn copy_metadata(source: &File, target: &File) -> io::Result<()> {
    use std::os::fd::AsRawFd;
    unsafe extern "C" {
        fn fcopyfile(
            from: std::ffi::c_int,
            to: std::ffi::c_int,
            state: *mut std::ffi::c_void,
            flags: u32,
        ) -> std::ffi::c_int;
    }
    // macOS copyfile.h: COPYFILE_METADATA = STAT | ACL | XATTR. Only
    // metadata is copied; the bounded, twice-validated data snapshot above
    // remains authoritative. Resource forks and FinderInfo are named xattrs.
    const COPYFILE_METADATA: u32 = (1 << 0) | (1 << 1) | (1 << 2);
    // SAFETY: Both files retain distinct, live descriptors. The destination
    // is the already-created exclusive entity, so no path is opened, followed,
    // replaced or removed. A null state is supported by fcopyfile.
    let result = unsafe {
        fcopyfile(
            source.as_raw_fd(),
            target.as_raw_fd(),
            std::ptr::null_mut(),
            COPYFILE_METADATA,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}

#[cfg(not(target_os = "macos"))]
fn copy_metadata(source: &File, target: &File) -> io::Result<()> {
    let metadata = source.metadata()?;
    target.set_permissions(metadata.permissions())?;
    let times = std::fs::FileTimes::new().set_modified(metadata.modified()?.into_std());
    target.try_clone()?.into_std().set_times(times)
}

#[derive(PartialEq, Eq)]
struct Version {
    length: u64,
    modified: Option<cap_std::time::SystemTime>,
    #[cfg(unix)]
    changed: (i64, i64),
    #[cfg(windows)]
    created: u64,
}

impl Version {
    fn capture(file: &File) -> Result<Self, IndexError> {
        Self::from_metadata(file.metadata()?)
    }

    fn from_metadata(metadata: Metadata) -> Result<Self, IndexError> {
        #[cfg(any(unix, windows))]
        use cap_std::fs::MetadataExt;
        if !metadata.is_file() {
            return Err(stale());
        }
        Ok(Self {
            length: metadata.len(),
            modified: metadata.modified().ok(),
            #[cfg(unix)]
            changed: (metadata.ctime(), metadata.ctime_nsec()),
            #[cfg(windows)]
            created: metadata.creation_time(),
        })
    }

    fn check(&self, file: &File) -> Result<(), IndexError> {
        if *self == Self::capture(file)? {
            Ok(())
        } else {
            Err(stale())
        }
    }
}

fn read_bounded(source: &File) -> Result<Vec<u8>, IndexError> {
    let size = source.metadata()?.len();
    if size > MAX_FILE_BYTES as u64 {
        return Err(document_service::DocumentError::TooLarge.into());
    }
    let mut file = source.try_clone()?;
    file.seek(SeekFrom::Start(0))?;
    let mut bytes = Vec::with_capacity(size as usize);
    file.take(MAX_FILE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_FILE_BYTES {
        return Err(document_service::DocumentError::TooLarge.into());
    }
    Ok(bytes)
}

// Behavior reconstructed from the installed macOS host's observed naming
// contract: each collision appends another " (copy)" before the final suffix.
fn duplicate_name(name: &str, number: usize) -> Result<String, IndexError> {
    let path = Path::new(name);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or(IndexError::InvalidPath)?;
    let suffix = path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|extension| !extension.is_empty())
        .map(|extension| format!(".{extension}"))
        .unwrap_or_default();
    let name = format!("{stem}{}{suffix}", " (copy)".repeat(number + 1));
    check_name(&name)?;
    Ok(name)
}

fn stale() -> IndexError {
    io::Error::new(
        io::ErrorKind::WouldBlock,
        "复制源或父目录已变化，请重新检查",
    )
    .into()
}
fn invalid(message: &str) -> IndexError {
    io::Error::new(io::ErrorKind::InvalidInput, message).into()
}
fn limit(message: &str) -> IndexError {
    io::Error::new(io::ErrorKind::WouldBlock, message).into()
}
fn unavailable() -> IndexError {
    io::Error::other("复制操作状态不可用").into()
}

#[cfg(test)]
mod tests;
