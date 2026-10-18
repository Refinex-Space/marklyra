//! Application-owned user themes. Original resources are never copied here.
//! Leases bind an already opened directory capability to one editor window.
use cap_std::{ambient_authority, fs::Dir};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use tauri::http::{header, Method, Response, StatusCode};

mod files;
use files::{checked_path, mime, open_checked, read_asset};

const MAX_WINDOWS: usize = 32;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
const MAX_CATALOG_ENTRIES: usize = 1_024;
const MAX_CSS_BYTES: usize = 2 * 1024 * 1024;
const MAX_ASSET_BYTES: usize = 8 * 1024 * 1024;
const MAX_LEASE_BYTES: usize = 16 * 1024 * 1024;
const MAX_LEASE_ASSETS: usize = 256;
const MAX_CACHE_BYTES: usize = 64 * 1024 * 1024;
const RESOURCE_CSP: &str = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; sandbox";
const BUILTINS: &[(&str, &str)] = &[
    ("github", "Github"),
    ("gothic", "Gothic"),
    ("night", "Night"),
    ("newsprint", "Newsprint"),
    ("pixyll", "Pixyll"),
    ("whitey", "Whitey"),
];

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
pub struct ThemeEntry {
    pub id: String,
    pub name: String,
    /// Identifies a built-in ID; a local CSS file may still override its styles.
    pub builtin: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeCatalog {
    pub folder_path: String,
    pub themes: Vec<ThemeEntry>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeStyles {
    pub theme: Option<String>,
    pub base_user: Option<String>,
    pub theme_user: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct PreparedThemeStyles {
    pub token: String,
    /// Custom themes start from the built-in GitHub style, then load their CSS.
    pub theme: String,
    pub styles: ThemeStyles,
}
struct ThemeFolder {
    root: Dir,
    path: PathBuf,
}
struct Asset {
    bytes: Arc<[u8]>,
    mime: &'static str,
}
struct Lease {
    token: String,
    theme_id: String,
    folder: Arc<ThemeFolder>,
    assets: Mutex<HashMap<String, Asset>>,
    bytes: AtomicUsize,
}
struct Owner {
    generation: String,
    latest_request: u64,
    active: Option<Arc<Lease>>,
    pending: Option<Arc<Lease>>,
}
#[derive(Default)]
struct HostState {
    folder: Option<Arc<ThemeFolder>>,
    owners: HashMap<String, Owner>,
    cached_bytes: usize,
}
#[derive(Clone, Default)]
pub struct ThemeHost(Arc<Mutex<HostState>>);

/// Created synchronously before work is dispatched, preserving IPC request order.
pub struct ThemeLoadRequest {
    label: String,
    generation: String,
    request_id: u64,
}

impl ThemeHost {
    pub fn register_window(&self, label: &str) -> Result<(), String> {
        let mut state = self.0.lock().map_err(|_| "主题状态不可用")?;
        if state.owners.contains_key(label) {
            return Ok(());
        }
        if state.owners.len() >= MAX_WINDOWS {
            return Err("主题窗口已达到32个上限".into());
        }
        state.owners.insert(
            label.into(),
            Owner {
                generation: uuid::Uuid::new_v4().to_string(),
                latest_request: 0,
                active: None,
                pending: None,
            },
        );
        Ok(())
    }
    pub fn release_window(&self, label: &str) {
        if let Ok(mut state) = self.0.lock() {
            if let Some(owner) = state.owners.remove(label) {
                for lease in [owner.active, owner.pending].into_iter().flatten() {
                    state.cached_bytes -= lease.bytes.load(Ordering::Relaxed);
                }
            }
        }
    }
    pub fn begin_load(&self, label: &str, request_id: u64) -> Result<ThemeLoadRequest, String> {
        if request_id == 0 || request_id > MAX_SAFE_INTEGER {
            return Err("主题请求序号无效".into());
        }
        let mut state = self.0.lock().map_err(|_| "主题状态不可用")?;
        let owner = state.owners.get_mut(label).ok_or("主题编辑窗口已关闭")?;
        if request_id <= owner.latest_request {
            return Err("主题请求已过期".into());
        }
        owner.latest_request = request_id;
        let request = ThemeLoadRequest {
            label: label.into(),
            generation: owner.generation.clone(),
            request_id,
        };
        let discarded = owner.pending.take();
        if let Some(lease) = discarded {
            state.cached_bytes -= lease.bytes.load(Ordering::Relaxed);
        }
        Ok(request)
    }
    fn folder(&self, config_directory: &Path) -> Result<Arc<ThemeFolder>, String> {
        let mut state = self.0.lock().map_err(|_| "主题状态不可用")?;
        if let Some(folder) = &state.folder {
            return Ok(folder.clone());
        }
        std::fs::create_dir_all(config_directory).map_err(|_| "无法创建应用配置目录")?;
        let config = Dir::open_ambient_dir(config_directory, ambient_authority())
            .map_err(|_| "无法访问应用配置目录")?;
        match config.symlink_metadata("themes") {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {}
            Ok(_) => return Err("主题目录必须为真实目录，不能为符号链接".into()),
            Err(error) if error.kind() == ErrorKind::NotFound => {
                config
                    .create_dir("themes")
                    .map_err(|_| "无法创建主题目录")?;
            }
            Err(_) => return Err("无法读取主题目录".into()),
        }
        let before = config
            .symlink_metadata("themes")
            .map_err(|_| "主题目录已更换")?;
        let root = config.open_dir("themes").map_err(|_| "无法打开主题目录")?;
        let after = config
            .symlink_metadata("themes")
            .map_err(|_| "主题目录已更换")?;
        if before.file_type().is_symlink()
            || after.file_type().is_symlink()
            || !files::same_object(&before, &root.dir_metadata().map_err(|_| "主题目录不可用")?)
            || !files::same_object(&before, &after)
        {
            return Err("主题目录已更换".into());
        }
        let folder = Arc::new(ThemeFolder {
            root,
            path: config_directory.join("themes"),
        });
        state.folder = Some(folder.clone());
        Ok(folder)
    }
    pub fn folder_path(&self, config_directory: &Path) -> Result<PathBuf, String> {
        let folder = self.folder(config_directory)?;
        // Opening Finder/Explorer uses an ambient path. Refuse if that path no longer
        // identifies the retained capability, rather than opening a replacement folder.
        let config = Dir::open_ambient_dir(config_directory, ambient_authority())
            .map_err(|_| "应用配置目录已移动")?;
        let before = config
            .symlink_metadata("themes")
            .map_err(|_| "主题目录已移动")?;
        let observed = config.open_dir("themes").map_err(|_| "主题目录已移动")?;
        let after = config
            .symlink_metadata("themes")
            .map_err(|_| "主题目录已移动")?;
        if before.file_type().is_symlink()
            || after.file_type().is_symlink()
            || !files::same_object(&before, &after)
            || !files::same_object(
                &before,
                &observed.dir_metadata().map_err(|_| "主题目录不可用")?,
            )
            || !files::same_object(
                &before,
                &folder.root.dir_metadata().map_err(|_| "主题目录不可用")?,
            )
        {
            return Err("主题目录路径已更换，请重启应用后重试".into());
        }
        Ok(folder.path.clone())
    }
    pub fn catalog(&self, config_directory: &Path) -> Result<ThemeCatalog, String> {
        let folder = self.folder(config_directory)?;
        let sources = catalog_sources(&folder)?;
        let mut themes: Vec<_> = BUILTINS
            .iter()
            .map(|(id, name)| ThemeEntry {
                id: (*id).into(),
                name: (*name).into(),
                builtin: true,
            })
            .collect();
        let custom: Vec<_> = sources
            .into_iter()
            .filter(|(id, _)| !builtin(id))
            .map(|(id, source)| ThemeEntry {
                id,
                name: source.name,
                builtin: false,
            })
            .collect();
        themes.extend(custom);
        themes.sort_by(|a, b| {
            // The Mac menu compares complete filenames: '-' sorts before the '.css'
            // suffix, so a dark variant precedes its shorter base theme name.
            // Unicode ordering remains locale independent, not Foundation-equivalent.
            format!("{}.css", a.id)
                .to_lowercase()
                .cmp(&format!("{}.css", b.id).to_lowercase())
                .then_with(|| a.id.cmp(&b.id))
        });
        Ok(ThemeCatalog {
            folder_path: folder.path.to_str().ok_or("主题路径不是有效UTF-8")?.into(),
            themes,
        })
    }
    pub fn prepare_styles(
        &self,
        request: ThemeLoadRequest,
        theme_id: &str,
        config: &Path,
    ) -> Result<PreparedThemeStyles, String> {
        if !valid_theme_id(theme_id) {
            return Err("主题名称无效".into());
        }
        self.verify_request(&request)?;
        let folder = self.folder(config)?;
        let sources = catalog_sources(&folder)?;
        let main = sources.get(theme_id).map(|source| source.filename.clone());
        if main.is_none() && !builtin(theme_id) {
            return Err("所选主题不存在".into());
        }
        let token = uuid::Uuid::new_v4().to_string();
        let mut assets = HashMap::new();
        let mut bytes = 0;
        let theme = read_optional_css(&folder.root, main.as_deref(), &mut assets, &mut bytes)?;
        if main.is_some() && theme.is_none() {
            return Err("所选主题文件已移除".into());
        }
        let base_user =
            read_optional_css(&folder.root, Some("base.user.css"), &mut assets, &mut bytes)?;
        let theme_user_name = format!("{theme_id}.user.css");
        let theme_user = read_optional_css(
            &folder.root,
            Some(&theme_user_name),
            &mut assets,
            &mut bytes,
        )?;
        let result = PreparedThemeStyles {
            token: token.clone(),
            theme: if builtin(theme_id) {
                theme_id
            } else {
                "github"
            }
            .into(),
            styles: ThemeStyles {
                theme: theme.map(|path| resource_url(&token, &path)),
                base_user: base_user.map(|path| resource_url(&token, &path)),
                theme_user: theme_user.map(|path| resource_url(&token, &path)),
            },
        };
        let lease = Arc::new(Lease {
            token,
            theme_id: theme_id.into(),
            folder,
            assets: Mutex::new(assets),
            bytes: AtomicUsize::new(bytes),
        });
        let mut state = self.0.lock().map_err(|_| "主题状态不可用")?;
        if !request_current(&state, &request) {
            return Err("主题请求已过期或窗口已关闭".into());
        }
        if state.cached_bytes + bytes > MAX_CACHE_BYTES {
            return Err("主题资源缓存达到64MiB上限".into());
        }
        state
            .owners
            .get_mut(&request.label)
            .expect("verified owner")
            .pending = Some(lease);
        state.cached_bytes += bytes;
        Ok(result)
    }
    fn verify_request(&self, request: &ThemeLoadRequest) -> Result<(), String> {
        let state = self.0.lock().map_err(|_| "主题状态不可用")?;
        if request_current(&state, request) {
            Ok(())
        } else {
            Err("主题请求已过期或窗口已关闭".into())
        }
    }
    pub fn accept_styles(&self, label: &str, token: &str) -> Result<(), String> {
        let mut state = self.0.lock().map_err(|_| "主题状态不可用")?;
        let owner = state.owners.get_mut(label).ok_or("主题编辑窗口已关闭")?;
        if owner
            .active
            .as_ref()
            .is_some_and(|lease| lease.token == token)
        {
            return Ok(());
        }
        if owner
            .pending
            .as_ref()
            .is_none_or(|lease| lease.token != token)
        {
            return Err("主题资源已过期或不属于此窗口".into());
        }
        let old = owner.active.take();
        owner.active = owner.pending.take();
        if let Some(lease) = old {
            state.cached_bytes -= lease.bytes.load(Ordering::Relaxed);
        }
        Ok(())
    }
    /// Menu presentation follows accepted styles only, never a pending/custom fallback ID.
    pub fn active_theme(&self, label: &str) -> Option<String> {
        self.0
            .lock()
            .ok()?
            .owners
            .get(label)?
            .active
            .as_ref()
            .map(|lease| lease.theme_id.clone())
    }
    fn lease(&self, label: &str, token: &str) -> Result<Arc<Lease>, StatusCode> {
        let state = self
            .0
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        find_lease(&state, label, token)
            .cloned()
            .ok_or(StatusCode::NOT_FOUND)
    }
    fn asset(&self, label: &str, token: &str, path: &str) -> Result<Asset, StatusCode> {
        checked_path(path).map_err(|_| StatusCode::BAD_REQUEST)?;
        let content_type = mime(path).ok_or(StatusCode::NOT_FOUND)?;
        let lease = self.lease(label, token)?;
        // Serialize reads per lease; never hold the host ownership lock across disk I/O.
        let mut cache = lease
            .assets
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        let existing = cache.get(path);
        if existing.is_none() && cache.len() >= MAX_LEASE_ASSETS {
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }
        let bytes = match existing {
            Some(asset) => asset.bytes.clone(),
            None => Arc::<[u8]>::from(
                read_asset(
                    &lease.folder.root,
                    path,
                    if content_type.starts_with("text/css") {
                        MAX_CSS_BYTES
                    } else {
                        MAX_ASSET_BYTES
                    },
                )
                .map_err(|error| {
                    if error.kind() == ErrorKind::FileTooLarge {
                        StatusCode::PAYLOAD_TOO_LARGE
                    } else {
                        StatusCode::NOT_FOUND
                    }
                })?,
            ),
        };
        let mut state = self
            .0
            .lock()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        if !find_lease(&state, label, token).is_some_and(|current| Arc::ptr_eq(current, &lease)) {
            return Err(StatusCode::NOT_FOUND);
        }
        if existing.is_none() {
            if lease.bytes.load(Ordering::Relaxed) + bytes.len() > MAX_LEASE_BYTES
                || state.cached_bytes + bytes.len() > MAX_CACHE_BYTES
            {
                return Err(StatusCode::PAYLOAD_TOO_LARGE);
            }
            lease.bytes.fetch_add(bytes.len(), Ordering::Relaxed);
            state.cached_bytes += bytes.len();
            cache.insert(
                path.into(),
                Asset {
                    bytes: bytes.clone(),
                    mime: content_type,
                },
            );
        }
        Ok(Asset {
            bytes,
            mime: content_type,
        })
    }
}
fn find_lease<'a>(state: &'a HostState, label: &str, token: &str) -> Option<&'a Arc<Lease>> {
    let owner = state.owners.get(label)?;
    [&owner.active, &owner.pending]
        .into_iter()
        .flatten()
        .find(|lease| lease.token == token)
}
fn request_current(state: &HostState, request: &ThemeLoadRequest) -> bool {
    state.owners.get(&request.label).is_some_and(|owner| {
        owner.generation == request.generation && owner.latest_request == request.request_id
    })
}
struct ThemeSource {
    name: String,
    filename: String,
}
fn catalog_sources(folder: &ThemeFolder) -> Result<HashMap<String, ThemeSource>, String> {
    let mut sources = HashMap::new();
    for (index, entry) in folder
        .root
        .entries()
        .map_err(|_| "无法列举主题目录")?
        .enumerate()
    {
        if index >= MAX_CATALOG_ENTRIES {
            return Err("主题目录超过1024个条目上限".into());
        }
        let entry = entry.map_err(|_| "无法读取主题目录条目")?;
        let filename = entry.file_name();
        let Some(filename) = filename.to_str() else {
            continue;
        };
        if checked_path(filename).is_err() || filename.starts_with('.') {
            continue;
        }
        // Mac readTheme enumerates source filenames using ^[^\sA-Z]+\.css.
        // Require the actual suffix as well: no trailing suffix accepted by that regex quirk.
        if filename
            .chars()
            .any(|ch| ch.is_whitespace() || ch.is_ascii_uppercase())
            || !filename.ends_with(".css")
            || filename.ends_with(".user.css")
        {
            continue;
        }
        let stem = &filename[..filename.len() - 4];
        let id = stem.to_owned();
        if !valid_theme_id(&id) {
            continue;
        }
        let before = folder
            .root
            .symlink_metadata(filename)
            .map_err(|_| "主题文件已更换")?;
        if !before.is_file() || before.file_type().is_symlink() {
            continue;
        }
        let file = open_checked(&folder.root, filename).map_err(|_| "主题文件已更换")?;
        drop(file);
        if sources
            .insert(
                id,
                ThemeSource {
                    name: display_name(stem),
                    filename: filename.into(),
                },
            )
            .is_some()
        {
            return Err("主题文件名称正规化后重复，请调整冲突名称".into());
        }
    }
    Ok(sources)
}
fn read_optional_css(
    root: &Dir,
    path: Option<&str>,
    assets: &mut HashMap<String, Asset>,
    total: &mut usize,
) -> Result<Option<String>, String> {
    let Some(path) = path else {
        return Ok(None);
    };
    if assets.contains_key(path) {
        return Ok(Some(path.into()));
    }
    match root.symlink_metadata(path) {
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("无法读取用户主题文件".into()),
        Ok(_) => {}
    }
    let bytes = read_asset(root, path, MAX_CSS_BYTES)
        .map_err(|_| "用户主题CSS必须为不超过2MiB的真实文件")?;
    std::str::from_utf8(&bytes).map_err(|_| "用户主题CSS必须为有效UTF-8")?;
    *total += bytes.len();
    assets.insert(
        path.into(),
        Asset {
            bytes: bytes.into(),
            mime: "text/css; charset=utf-8",
        },
    );
    Ok(Some(path.into()))
}
fn builtin(id: &str) -> bool {
    BUILTINS.iter().any(|(key, _)| *key == id)
}
/// Locale-independent display capitalization; filenames and IDs are never rewritten.
fn display_name(name: &str) -> String {
    let mut output = String::new();
    let mut word_start = true;
    for ch in name.chars().map(|ch| if ch == '-' { ' ' } else { ch }) {
        if word_start {
            output.extend(ch.to_uppercase());
        } else {
            output.extend(ch.to_lowercase());
        }
        word_start = !ch.is_alphanumeric();
    }
    output
}
pub fn valid_theme_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 480
        && id.chars().count() <= 120
        && !id.starts_with('.')
        && !id.ends_with('.')
        && !id.ends_with(".user")
        && !id.chars().any(|ch| {
            ch.is_control()
                || ch.is_whitespace()
                || ch.is_ascii_uppercase()
                || "<>:\"/\\|?*%".contains(ch)
        })
        && !files::reserved_name(id)
}
pub fn resource_url(token: &str, path: &str) -> String {
    let origin = if cfg!(target_os = "windows") {
        "http://marklyra.localhost"
    } else {
        "marklyra://localhost"
    };
    let mut encoded = String::new();
    for byte in path.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~/".contains(&byte) {
            encoded.push(char::from(byte));
        } else {
            use std::fmt::Write;
            write!(&mut encoded, "%{byte:02X}").expect("string write");
        }
    }
    format!("{origin}/__styles/{token}/{encoded}")
}
pub fn resource_response(
    host: &ThemeHost,
    label: &str,
    token: &str,
    path: &str,
    method: &Method,
) -> Response<Vec<u8>> {
    let head = method == Method::HEAD;
    let (status, bytes, content_type) = if method != Method::GET && !head {
        (
            StatusCode::METHOD_NOT_ALLOWED,
            Arc::<[u8]>::from(&b"Read-only theme resources"[..]),
            "text/plain; charset=utf-8",
        )
    } else {
        match host.asset(label, token, path) {
            Ok(asset) => (StatusCode::OK, asset.bytes, asset.mime),
            Err(status) => (
                status,
                Arc::<[u8]>::from(&b"Theme resource unavailable"[..]),
                "text/plain; charset=utf-8",
            ),
        }
    };
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CONTENT_LENGTH, bytes.len())
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::ALLOW, "GET, HEAD")
        .header("X-Content-Type-Options", "nosniff")
        .header("Referrer-Policy", "no-referrer")
        .header("Content-Security-Policy", RESOURCE_CSP)
        .body(if head { Vec::new() } else { bytes.to_vec() })
        .expect("fixed theme response headers")
}

#[cfg(test)]
mod tests;
