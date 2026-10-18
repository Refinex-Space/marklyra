use super::geometry::SavedState;
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use std::{
    fs,
    io::{self, Read, Write},
    path::Path,
    sync::atomic::{AtomicU64, Ordering},
};

pub(super) const FILE: &str = "state.json";
const LOCK: &str = "store.lock";
const MAX_BYTES: usize = 16 * 1024;
const MAX_PENDING: usize = 8;
static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub(super) struct Store {
    directory: Dir,
}
struct StoreLock(fs::File);
impl Drop for StoreLock {
    fn drop(&mut self) {
        // A fork/duplicate can keep the open file description alive after close.
        // End this transaction's ownership explicitly rather than waiting for
        // every inherited descriptor to close during an unrelated child exec.
        let _ = self.0.unlock();
    }
}
impl Store {
    pub fn open(path: &Path) -> io::Result<Self> {
        fs::create_dir_all(path)?;
        Ok(Self {
            directory: Dir::open_ambient_dir(path, ambient_authority())?,
        })
    }
    fn regular_or_missing(&self, name: &str) -> io::Result<()> {
        match self.directory.symlink_metadata(name) {
            Ok(meta) if meta.is_file() && !meta.file_type().is_symlink() => Ok(()),
            Ok(_) => Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Window preferences must be regular files",
            )),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error),
        }
    }
    fn lock(&self) -> io::Result<StoreLock> {
        self.regular_or_missing(LOCK)?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = self.directory.open_with(LOCK, &options)?.into_std();
        file.try_lock().map_err(io::Error::from)?;
        Ok(StoreLock(file))
    }
    fn read_unlocked(&self) -> io::Result<Option<SavedState>> {
        self.regular_or_missing(FILE)?;
        let file = match self.directory.open(FILE) {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        if file.metadata()?.len() > MAX_BYTES as u64 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Window preference file exceeds 16 KiB",
            ));
        }
        let mut bytes = Vec::new();
        file.take(MAX_BYTES as u64 + 1).read_to_end(&mut bytes)?;
        if bytes.len() > MAX_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Window preference file exceeds 16 KiB",
            ));
        }
        let state: SavedState = serde_json::from_slice(&bytes)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        if !state.valid() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Unsupported or invalid window preference state",
            ));
        }
        Ok(Some(state))
    }
    pub fn read(&self) -> io::Result<Option<SavedState>> {
        let _lock = self.lock()?;
        self.read_unlocked()
    }
    pub fn write(&self, state: &SavedState) -> io::Result<()> {
        if !state.valid() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Invalid window preference state",
            ));
        }
        let bytes = serde_json::to_vec_pretty(state).map_err(io::Error::other)?;
        if bytes.len() > MAX_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "Window preference state exceeds 16 KiB",
            ));
        }
        let _lock = self.lock()?;
        // Never overwrite corrupt or newer-schema evidence, even if another
        // process replaced it after startup. The application keeps default UI.
        self.read_unlocked()?;
        let mut pending = 0;
        for (index, entry) in self.directory.entries()?.enumerate() {
            if index >= 128 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "Window preference directory has unexpected entries",
                ));
            }
            if entry?
                .file_name()
                .to_string_lossy()
                .starts_with(".pending-")
            {
                pending += 1;
            }
        }
        if pending >= MAX_PENDING {
            return Err(io::Error::new(
                io::ErrorKind::StorageFull,
                "Window preference temporary evidence limit reached",
            ));
        }
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut created = None;
        for _ in 0..MAX_PENDING {
            let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            let name = format!(".pending-{}-{sequence}.json", std::process::id());
            match self.directory.open_with(&name, &options) {
                Ok(file) => {
                    created = Some((name, file));
                    break;
                }
                Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error),
            }
        }
        let (name, mut file) = created.ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::AlreadyExists,
                "Cannot allocate a window preference temporary file",
            )
        })?;
        // On failure keep this bounded temporary evidence; do not unlink an
        // unknown/corrupt prior file. Normal success leaves no pending file.
        file.write_all(&bytes)?;
        file.sync_all()?;
        drop(file);
        self.directory.rename(&name, &self.directory, FILE)?;
        #[cfg(unix)]
        self.directory.try_clone()?.into_std_file().sync_all()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::window_state::geometry::{Display, NormalGeometry, PhysicalArea, SCHEMA};
    fn state(width: f64) -> SavedState {
        SavedState {
            schema: SCHEMA,
            maximized: false,
            normal: NormalGeometry {
                width,
                height: 600.0,
                offset_x: 50.0,
                offset_y: 40.0,
                display: Display {
                    name: Some("test".into()),
                    scale: 1.0,
                    work: PhysicalArea {
                        x: 0,
                        y: 0,
                        width: 1920,
                        height: 1080,
                    },
                },
            },
        }
    }
    #[test]
    fn atomic_replacement_roundtrips_without_touching_other_files() {
        let root = tempfile::tempdir().unwrap();
        let store = Store::open(root.path()).unwrap();
        fs::write(root.path().join("unrelated.json"), b"keep").unwrap();
        assert!(store.read().unwrap().is_none());
        store.write(&state(900.0)).unwrap();
        store.write(&state(1000.0)).unwrap();
        assert_eq!(store.read().unwrap(), Some(state(1000.0)));
        assert_eq!(
            fs::read(root.path().join("unrelated.json")).unwrap(),
            b"keep"
        );
        assert!(!fs::read_dir(root.path()).unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".pending-")));
    }
    #[test]
    fn malformed_oversized_unknown_schema_and_fields_are_preserved() {
        let mut unknown_schema = serde_json::to_value(state(900.0)).unwrap();
        unknown_schema["schema"] = 2.into();
        let mut unknown_field = serde_json::to_value(state(900.0)).unwrap();
        unknown_field["future"] = true.into();
        for bytes in [
            b"{broken".to_vec(),
            vec![b'x'; MAX_BYTES + 1],
            serde_json::to_vec(&unknown_schema).unwrap(),
            serde_json::to_vec(&unknown_field).unwrap(),
        ] {
            let root = tempfile::tempdir().unwrap();
            let store = Store::open(root.path()).unwrap();
            fs::write(root.path().join(FILE), &bytes).unwrap();
            assert_eq!(store.read().unwrap_err().kind(), io::ErrorKind::InvalidData);
            assert!(store.write(&state(950.0)).is_err());
            assert_eq!(fs::read(root.path().join(FILE)).unwrap(), bytes);
        }
    }
    #[test]
    fn invalid_new_geometry_does_not_replace_valid_state() {
        let root = tempfile::tempdir().unwrap();
        let store = Store::open(root.path()).unwrap();
        store.write(&state(900.0)).unwrap();
        assert!(store.write(&state(f64::NAN)).is_err());
        assert_eq!(store.read().unwrap(), Some(state(900.0)));
    }
    #[test]
    fn independently_opened_writer_cannot_reenter_the_file_lock() {
        let root = tempfile::tempdir().unwrap();
        let a = Store::open(root.path()).unwrap();
        let b = Store::open(root.path()).unwrap();
        let held = a.lock().unwrap();
        assert_eq!(
            b.write(&state(900.0)).unwrap_err().kind(),
            io::ErrorKind::WouldBlock
        );
        drop(held);
        b.write(&state(900.0)).unwrap();
    }
    #[test]
    fn transaction_unlock_does_not_wait_for_an_inherited_descriptor_to_close() {
        let root = tempfile::tempdir().unwrap();
        let a = Store::open(root.path()).unwrap();
        let b = Store::open(root.path()).unwrap();
        let held = a.lock().unwrap();
        // Models the shared open-file description retained during fork/exec.
        let inherited = held.0.try_clone().unwrap();
        assert_eq!(b.read().unwrap_err().kind(), io::ErrorKind::WouldBlock);
        drop(held);
        assert!(b.read().unwrap().is_none());
        b.write(&state(900.0)).unwrap();
        assert_eq!(b.read().unwrap(), Some(state(900.0)));
        drop(inherited);
    }
    #[test]
    fn stale_temporary_evidence_is_bounded_and_never_deleted() {
        let root = tempfile::tempdir().unwrap();
        let store = Store::open(root.path()).unwrap();
        store.write(&state(900.0)).unwrap();
        for index in 0..MAX_PENDING {
            fs::write(
                root.path().join(format!(".pending-evidence-{index}")),
                b"partial",
            )
            .unwrap();
        }
        assert_eq!(
            store.write(&state(950.0)).unwrap_err().kind(),
            io::ErrorKind::StorageFull
        );
        assert_eq!(store.read().unwrap(), Some(state(900.0)));
        for index in 0..MAX_PENDING {
            assert_eq!(
                fs::read(root.path().join(format!(".pending-evidence-{index}"))).unwrap(),
                b"partial"
            );
        }
    }
    #[cfg(unix)]
    #[test]
    fn symbolic_state_and_lock_paths_never_modify_their_target() {
        use std::os::unix::fs::symlink;
        for name in [FILE, LOCK] {
            let root = tempfile::tempdir().unwrap();
            let outside = tempfile::NamedTempFile::new().unwrap();
            fs::write(outside.path(), b"untouched").unwrap();
            let store = Store::open(root.path()).unwrap();
            symlink(outside.path(), root.path().join(name)).unwrap();
            assert!(store.read().is_err());
            assert!(store.write(&state(900.0)).is_err());
            assert_eq!(fs::read(outside.path()).unwrap(), b"untouched");
        }
    }
}
