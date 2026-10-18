use crate::{validate, RecentError, RecentListing, MAX_STORE_BYTES};
use cap_std::fs::{Dir, OpenOptions};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::Path,
    time::{Duration, Instant},
};
use uuid::Uuid;

const FILE: &str = "history.json";
// Some OS file-lock implementations are process-scoped. Protect independent
// store instances in this process as well as other processes via the file lock.
static PROCESS_GATE: std::sync::Mutex<()> = std::sync::Mutex::new(());
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Envelope {
    schema_version: u32,
    checksum: String,
    listing: RecentListing,
}
pub(crate) struct Disk {
    directory: Dir,
}
struct Lock(std::fs::File);
impl Drop for Lock {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}
impl Disk {
    pub fn open(root: &Path) -> Result<Self, RecentError> {
        std::fs::create_dir_all(root)?;
        let meta = std::fs::symlink_metadata(root)?;
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err(RecentError::InvalidPath);
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
        Ok(Self { directory })
    }
    /// Lock only one read/modify/write transaction, then reopen/re-read next time.
    /// Independent application processes therefore merge against the latest disk
    /// state instead of overwriting it with an old in-memory cache.
    pub fn transaction<T>(
        &self,
        work: impl FnOnce(&Self) -> Result<T, RecentError>,
    ) -> Result<T, RecentError> {
        let _process = PROCESS_GATE
            .lock()
            .map_err(|_| std::io::Error::other("recent-file process state is unavailable"))?;
        self.regular_or_absent(".lock")?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = self.directory.open_with(".lock", &options)?.into_std();
        if !file.metadata()?.is_file() {
            return Err(RecentError::InvalidPath);
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if file.metadata()?.nlink() != 1 {
                return Err(RecentError::InvalidPath);
            }
        }
        let deadline = Instant::now() + Duration::from_millis(500);
        loop {
            match file.try_lock() {
                Ok(()) => break,
                Err(std::fs::TryLockError::WouldBlock) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(5))
                }
                Err(std::fs::TryLockError::WouldBlock) => return Err(RecentError::Busy),
                Err(std::fs::TryLockError::Error(error)) => return Err(error.into()),
            }
        }
        let _lock = Lock(file);
        self.clean_abandoned_staging()?;
        work(self)
    }
    pub fn read(&self) -> Result<RecentListing, RecentError> {
        if !self.regular_or_absent(FILE)? {
            return Ok(RecentListing::default());
        }
        let mut file = self.directory.open(FILE)?;
        let meta = file.metadata()?;
        if !meta.is_file() {
            return Err(RecentError::InvalidPath);
        }
        #[cfg(unix)]
        {
            use cap_std::fs::MetadataExt;
            if meta.nlink() != 1 {
                return Err(RecentError::InvalidPath);
            }
        }
        if meta.len() > MAX_STORE_BYTES as u64 {
            return Err(RecentError::Corrupt);
        }
        let mut bytes = Vec::new();
        (&mut file)
            .take(MAX_STORE_BYTES as u64 + 1)
            .read_to_end(&mut bytes)?;
        if bytes.len() > MAX_STORE_BYTES {
            return Err(RecentError::Corrupt);
        }
        let envelope: Envelope =
            serde_json::from_slice(&bytes).map_err(|_| RecentError::Corrupt)?;
        if envelope.schema_version != 1 {
            return Err(RecentError::Corrupt);
        }
        validate(&envelope.listing)?;
        let payload = serde_json::to_vec(&envelope.listing).map_err(|_| RecentError::Corrupt)?;
        if envelope.checksum != digest(&payload) {
            return Err(RecentError::Corrupt);
        }
        Ok(envelope.listing)
    }
    pub fn write(&self, listing: &RecentListing) -> Result<(), RecentError> {
        validate(listing)?;
        let payload = serde_json::to_vec(listing).map_err(|_| RecentError::Corrupt)?;
        let bytes = serde_json::to_vec(&Envelope {
            schema_version: 1,
            checksum: digest(&payload),
            listing: listing.clone(),
        })
        .map_err(|_| RecentError::Corrupt)?;
        if bytes.len() > MAX_STORE_BYTES {
            return Err(RecentError::TooLarge);
        }
        self.publish(FILE, &bytes)
    }
    fn publish(&self, target: &str, bytes: &[u8]) -> Result<(), RecentError> {
        self.regular_or_absent(target)?;
        let pending = format!(".pending-{}", Uuid::new_v4());
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = self.directory.open_with(&pending, &options)?;
        let result = (|| {
            file.write_all(bytes)?;
            file.sync_all()?;
            drop(file);
            self.directory.rename(&pending, &self.directory, target)?;
            self.sync_directory()?;
            Ok(())
        })();
        if result.is_err() {
            let _ = self.directory.remove_file(&pending);
        }
        result
    }
    pub fn quarantine(&self) -> Result<(), RecentError> {
        self.regular_or_absent("last-corrupt.json")?;
        if self.regular_or_absent(FILE)? {
            let mut bytes = Vec::new();
            self.directory
                .open(FILE)?
                .take(MAX_STORE_BYTES as u64)
                .read_to_end(&mut bytes)?;
            // Preserve only the bounded prefix of an oversized corrupt index.
            // This is metadata in app data, never any referenced user document.
            self.publish("last-corrupt.json", &bytes)?;
            self.directory.remove_file(FILE)?;
            self.sync_directory()?;
        }
        Ok(())
    }
    fn clean_abandoned_staging(&self) -> Result<(), RecentError> {
        // Only this writer's UUID staging namespace is eligible, while the OS
        // lock excludes any live writer. These are unacknowledged metadata
        // candidates, not document drafts; unrelated files remain untouched.
        for (count, entry) in self.directory.entries()?.enumerate() {
            if count >= 256 {
                return Err(RecentError::TooLarge);
            }
            let entry = entry?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            let Some(id) = name.strip_prefix(".pending-") else {
                continue;
            };
            if crate::validate_id(id).is_err() {
                continue;
            }
            let metadata = self.directory.symlink_metadata(name)?;
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                continue;
            }
            #[cfg(unix)]
            {
                use cap_std::fs::MetadataExt;
                if metadata.nlink() != 1 {
                    continue;
                }
            }
            self.directory.remove_file(name)?;
        }
        Ok(())
    }
    fn regular_or_absent(&self, path: &str) -> Result<bool, RecentError> {
        match self.directory.symlink_metadata(path) {
            Ok(meta) if meta.is_file() && !meta.file_type().is_symlink() => {
                #[cfg(unix)]
                {
                    use cap_std::fs::MetadataExt;
                    if meta.nlink() != 1 {
                        return Err(RecentError::InvalidPath);
                    }
                }
                Ok(true)
            }
            Ok(_) => Err(RecentError::InvalidPath),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(error.into()),
        }
    }
    fn sync_directory(&self) -> Result<(), RecentError> {
        #[cfg(unix)]
        self.directory.try_clone()?.into_std_file().sync_all()?;
        Ok(())
    }
}
fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
