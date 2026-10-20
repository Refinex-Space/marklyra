use serde::{de::DeserializeOwned, Serialize};
use std::marker::PhantomData;

pub(crate) trait PreferenceRecord: Serialize + DeserializeOwned + Default + Clone {
    /// The largest accepted record. Most preferences are tiny; list-like records raise it.
    const MAX_BYTES: usize = 4 * 1024;
    fn validate(&self) -> Result<(), String>;
}
use cap_std::fs::{Dir, OpenOptions};
use std::{
    io::{Read, Write},
    path::Path,
    sync::Mutex,
};

const FILE: &str = "preferences.json";
static PROCESS_GATE: Mutex<()> = Mutex::new(());

pub(crate) struct Store<T: PreferenceRecord>(Dir, PhantomData<T>);
struct Lock(std::fs::File);
impl Drop for Lock {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}
impl<T: PreferenceRecord> Store<T> {
    pub fn open(root: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(root).map_err(message)?;
        let metadata = std::fs::symlink_metadata(root).map_err(message)?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Err("应用偏好目录无效".into());
        }
        let directory =
            Dir::open_ambient_dir(root, cap_std::ambient_authority()).map_err(message)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            directory
                .try_clone()
                .map_err(message)?
                .into_std_file()
                .set_permissions(std::fs::Permissions::from_mode(0o700))
                .map_err(message)?;
        }
        Ok(Self(directory, PhantomData))
    }
    fn regular_or_absent(&self, name: &str) -> Result<bool, String> {
        match self.0.symlink_metadata(name) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => Ok(true),
            Ok(_) => Err("应用偏好必须是普通文件，既有数据未修改".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(error) => Err(message(error)),
        }
    }
    fn read(&self) -> Result<T, String> {
        if !self.regular_or_absent(FILE)? {
            return Ok(T::default());
        }
        let file = self.0.open(FILE).map_err(message)?;
        let metadata = file.metadata().map_err(message)?;
        if !metadata.is_file() || metadata.len() > T::MAX_BYTES as u64 {
            return Err("应用偏好损坏或超过大小限制，既有数据未修改".into());
        }
        #[cfg(unix)]
        {
            use cap_std::fs::MetadataExt;
            if metadata.nlink() != 1 {
                return Err("应用偏好不允许硬链接".into());
            }
        }
        let mut bytes = Vec::new();
        file.take(T::MAX_BYTES as u64 + 1)
            .read_to_end(&mut bytes)
            .map_err(message)?;
        if bytes.len() > T::MAX_BYTES {
            return Err("应用偏好超过大小限制".into());
        }
        let state: T = serde_json::from_slice(&bytes)
            .map_err(|_| "应用偏好损坏或版本不受支持，既有数据未修改")?;
        state.validate()?;
        Ok(state)
    }
    pub(crate) fn transaction<R>(
        &self,
        operation: impl FnOnce(&mut T) -> Result<(R, bool), String>,
    ) -> Result<R, String> {
        let _process = PROCESS_GATE.lock().map_err(|_| "应用偏好进程状态不可用")?;
        self.regular_or_absent("store.lock")?;
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let file = self
            .0
            .open_with("store.lock", &options)
            .map_err(message)?
            .into_std();
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if file.metadata().map_err(message)?.nlink() != 1 {
                return Err("应用偏好锁不允许硬链接".into());
            }
        }
        file.try_lock()
            .map_err(|_| "应用偏好正被另一进程使用，请重试")?;
        let _lock = Lock(file);
        let mut state = self.read()?;
        let (result, changed) = operation(&mut state)?;
        if changed {
            state.validate()?;
            self.write(&state)?;
        }
        Ok(result)
    }
    pub fn get(&self) -> Result<T, String> {
        self.transaction(|state| Ok((state.clone(), false)))
    }
    fn write(&self, state: &T) -> Result<(), String> {
        let bytes = serde_json::to_vec(state).map_err(|error| error.to_string())?;
        if bytes.len() > T::MAX_BYTES {
            return Err("应用偏好超过大小限制".into());
        }
        let mut pending = 0;
        for (index, entry) in self.0.entries().map_err(message)?.enumerate() {
            if index >= 128 {
                return Err("应用偏好目录有过多条目，既有数据未修改".into());
            }
            if entry
                .map_err(message)?
                .file_name()
                .to_string_lossy()
                .starts_with(".pending-")
            {
                pending += 1;
            }
        }
        if pending >= 8 {
            return Err("应用偏好临时证据已达上限，既有数据未修改".into());
        }
        let name = format!(".pending-{}", uuid::Uuid::new_v4());
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = self.0.open_with(&name, &options).map_err(message)?;
        file.write_all(&bytes).map_err(message)?;
        file.sync_all().map_err(message)?;
        drop(file);
        self.regular_or_absent(FILE)?;
        self.0.rename(&name, &self.0, FILE).map_err(message)?;
        #[cfg(unix)]
        self.0
            .try_clone()
            .map_err(message)?
            .into_std_file()
            .sync_all()
            .map_err(message)?;
        Ok(())
    }
}
fn message(error: std::io::Error) -> String {
    format!("应用偏好存储失败：{error}")
}
