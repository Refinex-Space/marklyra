use crate::{
    types::{Envelope, Record},
    validate_content, validate_id, Limits, RecoveryError, RecoveryIssue,
};
use cap_std::fs::{Dir, OpenOptions};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
};
use uuid::Uuid;

const SCHEMA_VERSION: u32 = 1;
const MAX_ENTRIES: usize = 4096;
pub(crate) struct Disk {
    directory: Dir,
    // Lifetime of the OS lock is lifetime of this file. A process crash releases
    // it automatically; the existence of .lock alone never marks a store busy.
    _lock: std::fs::File,
    pub limits: Limits,
}
impl Drop for Disk {
    fn drop(&mut self) {
        // Explicit unlock also releases the shared open-file-description lock
        // if a concurrently spawned child briefly inherited it before exec.
        let _ = self._lock.unlock();
    }
}
impl Disk {
    pub fn open(root: &Path, limits: Limits) -> Result<Self, RecoveryError> {
        if limits.max_records == 0 || limits.max_record_bytes == 0 || limits.max_total_bytes == 0 {
            return Err(RecoveryError::InvalidData);
        }
        std::fs::create_dir_all(root)?;
        let metadata = std::fs::symlink_metadata(root)?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(RecoveryError::InvalidPath);
        }
        let directory = Dir::open_ambient_dir(root, cap_std::ambient_authority())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            directory
                .try_clone()?
                .into_std_file()
                .set_permissions(std::fs::Permissions::from_mode(0o700))?;
        }
        match directory.symlink_metadata(".lock") {
            Ok(meta) if !meta.is_file() || meta.file_type().is_symlink() => {
                return Err(RecoveryError::InvalidPath)
            }
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error.into()),
            _ => {}
        }
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let lock = directory.open_with(".lock", &options)?.into_std();
        if !lock.metadata()?.is_file() {
            return Err(RecoveryError::InvalidPath);
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if lock.metadata()?.nlink() != 1 {
                return Err(RecoveryError::InvalidPath);
            }
        }
        lock.try_lock().map_err(|error| match error {
            std::fs::TryLockError::WouldBlock => RecoveryError::Busy,
            std::fs::TryLockError::Error(error) => RecoveryError::Io(error),
        })?;
        Ok(Self {
            directory,
            _lock: lock,
            limits,
        })
    }
    pub fn scan(&self) -> Result<(HashMap<String, Record>, Vec<RecoveryIssue>), RecoveryError> {
        let mut records: HashMap<String, Record> = HashMap::new();
        let mut issues = Vec::new();
        for (count, entry) in self.directory.entries()?.enumerate() {
            if count >= MAX_ENTRIES {
                return Err(RecoveryError::Capacity);
            }
            let entry = entry?;
            let file = entry.file_name().to_string_lossy().into_owned();
            if file == ".lock" {
                continue;
            }
            let Some((id, slot)) = slot_name(&file) else {
                issues.push(RecoveryIssue {
                    file,
                    reason: "未完成的临时文件或未知条目已保留；不自动当作可恢复稿件".to_owned(),
                });
                continue;
            };
            let record = match self.read_record(&file, id, slot) {
                Ok(record) => record,
                Err(error) => {
                    issues.push(RecoveryIssue {
                        file,
                        reason: error.to_string(),
                    });
                    continue;
                }
            };
            if records
                .get(id)
                .is_none_or(|old| record.version > old.version)
            {
                records.insert(id.to_owned(), record);
            }
        }
        Ok((records, issues))
    }
    fn read_record(&self, file_name: &str, id: &str, slot: u64) -> Result<Record, RecoveryError> {
        let metadata = self.directory.symlink_metadata(file_name)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(RecoveryError::InvalidPath);
        }
        if metadata.len() > self.limits.max_record_bytes as u64 {
            return Err(RecoveryError::Capacity);
        }
        let mut file = self.directory.open(file_name)?;
        if !file.metadata()?.is_file() {
            return Err(RecoveryError::InvalidPath);
        }
        #[cfg(unix)]
        {
            use cap_std::fs::MetadataExt;
            if file.metadata()?.nlink() != 1 {
                return Err(RecoveryError::InvalidPath);
            }
        }
        let mut bytes = Vec::new();
        (&mut file)
            .take(self.limits.max_record_bytes as u64 + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() > self.limits.max_record_bytes {
            return Err(RecoveryError::Capacity);
        }
        let envelope: Envelope = serde_json::from_slice(&bytes)?;
        if envelope.schema_version != SCHEMA_VERSION {
            return Err(RecoveryError::InvalidData);
        }
        let record = envelope.record;
        if record.id != id
            || record.version == 0
            || record.version % 2 != slot
            || record.version > crate::MAX_SAFE_INTEGER
            || record.sequence > crate::MAX_SAFE_INTEGER
        {
            return Err(RecoveryError::InvalidData);
        }
        if let Some(content) = &record.content {
            validate_content(content)?;
        }
        let payload = bounded_json(&record, self.limits.max_record_bytes)?;
        if envelope.checksum != digest(&payload) {
            return Err(RecoveryError::InvalidData);
        }
        Ok(record)
    }
    pub fn write(&self, record: &Record) -> Result<(), RecoveryError> {
        validate_id(&record.id)?;
        let payload = bounded_json(record, self.limits.max_record_bytes)?;
        let bytes = bounded_json(
            &Envelope {
                schema_version: SCHEMA_VERSION,
                checksum: digest(&payload),
                record: record.clone(),
            },
            self.limits.max_record_bytes,
        )?;
        // Include the temporary copy in the physical capacity budget. No hidden
        // LRU eviction: reaching this limit must never destroy an older draft.
        let reserve = 4096u64.min(self.limits.max_total_bytes / 4);
        let budget = if record.content.is_some() {
            self.limits.max_total_bytes.saturating_sub(reserve)
        } else {
            self.limits.max_total_bytes
        };
        if self
            .disk_bytes()?
            .checked_add(bytes.len() as u64)
            .is_none_or(|size| size > budget)
        {
            return Err(RecoveryError::Capacity);
        }
        let target = format!("{}.{}.json", record.id, record.version % 2);
        if let Ok(meta) = self.directory.symlink_metadata(&target) {
            if !meta.is_file() || meta.file_type().is_symlink() {
                return Err(RecoveryError::InvalidPath);
            }
        }
        let temporary = format!(".pending-{}.json", Uuid::new_v4());
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = self.directory.open_with(&temporary, &options)?;
        let result = (|| {
            file.write_all(&bytes)?;
            file.sync_all()?;
            drop(file);
            self.directory
                .rename(&temporary, &self.directory, &target)?;
            self.sync_directory()?;
            Ok(())
        })();
        if result.is_err() {
            let _ = self.directory.remove_file(&temporary);
        }
        result
    }
    pub fn remove_consumed(&self, record: &Record) -> Result<(), RecoveryError> {
        // Imported fallback tombstones are durable deduplication receipts.
        // Retaining the small tombstone prevents an old WebView copy from
        // resurrecting a draft after an explicit consume and process restart.
        if record.fallback.is_some() {
            let previous = format!("{}.{}.json", record.id, 1 - record.version % 2);
            match self.directory.remove_file(previous) {
                Ok(()) => self.sync_directory()?,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
            return Ok(());
        }
        for slot in [1 - record.version % 2, record.version % 2] {
            let path = format!("{}.{}.json", record.id, slot);
            match self.directory.remove_file(path) {
                Ok(()) => {
                    self.sync_directory()?;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
        }
        Ok(())
    }
    fn sync_directory(&self) -> Result<(), RecoveryError> {
        // Directory fsync is supported on Unix. Windows still syncs each file;
        // hardware/power-loss durability and Windows rename need OS validation.
        #[cfg(unix)]
        self.directory.try_clone()?.into_std_file().sync_all()?;
        Ok(())
    }
    fn disk_bytes(&self) -> Result<u64, RecoveryError> {
        let mut total = 0u64;
        for (count, entry) in self.directory.entries()?.enumerate() {
            if count >= MAX_ENTRIES {
                return Err(RecoveryError::Capacity);
            }
            let entry = entry?;
            let metadata = self.directory.symlink_metadata(entry.file_name())?;
            total = total
                .checked_add(metadata.len())
                .ok_or(RecoveryError::Capacity)?;
        }
        Ok(total)
    }
}
fn slot_name(file: &str) -> Option<(&str, u64)> {
    let base = file.strip_suffix(".json")?;
    let (id, slot) = base.rsplit_once('.')?;
    validate_id(id).ok()?;
    let slot = match slot {
        "0" => 0,
        "1" => 1,
        _ => return None,
    };
    Some((id, slot))
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(crate) fn content_digest(
    content: &crate::DraftContent,
    max: usize,
) -> Result<String, RecoveryError> {
    Ok(digest(&bounded_json(content, max)?))
}
fn bounded_json(value: &impl serde::Serialize, max: usize) -> Result<Vec<u8>, RecoveryError> {
    struct Buffer {
        bytes: Vec<u8>,
        max: usize,
        exceeded: bool,
    }
    impl Write for Buffer {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            if self.bytes.len().saturating_add(bytes.len()) > self.max {
                self.exceeded = true;
                return Err(std::io::Error::other("recovery record capacity exceeded"));
            }
            self.bytes.extend_from_slice(bytes);
            Ok(bytes.len())
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }
    let mut buffer = Buffer {
        bytes: Vec::new(),
        max,
        exceeded: false,
    };
    let result = serde_json::to_writer(&mut buffer, value);
    if buffer.exceeded {
        return Err(RecoveryError::Capacity);
    }
    result?;
    Ok(buffer.bytes)
}

pub(crate) fn fallback_record_id(id: &str, version: u64) -> String {
    let hash = Sha256::digest(format!("marklyra-fallback-v1:{id}:{version}"));
    let mut bytes = [0; 16];
    bytes.copy_from_slice(&hash[..16]);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    Uuid::from_bytes(bytes).to_string()
}
