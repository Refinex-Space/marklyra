//! Site and group files under one capability directory. Files are the only authority; this
//! cache is rebuilt from file stamps and every write checks the revision the caller read.
use crate::{frontmatter as fm, model::*};
use cap_std::fs::{Dir, OpenOptions};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use serde_yaml_ng::{Mapping, Value as Yaml};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    io::{ErrorKind, Read, Write},
    time::UNIX_EPOCH,
};

#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("[io] 站点数据读写失败：{0}")]
    Io(#[from] std::io::Error),
    #[error("[conflict] 站点已在其他地方被修改，已载入最新内容，请重试")]
    Conflict,
    #[error("[not-found] 找不到{0}")]
    NotFound(&'static str),
    #[error("[invalid] {0}")]
    Invalid(String),
}
pub type Result<T> = std::result::Result<T, StoreError>;
fn invalid<T>(message: impl Into<String>) -> Result<T> {
    Err(StoreError::Invalid(message.into()))
}

const MAX_FILE: u64 = 64 * 1024;
const MAX_SITES: usize = 10_000;
const MAX_GROUPS: usize = 500;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvalidFile {
    pub path: String,
    pub error: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub generation: u64,
    /// The `.marklyra/sites` directory exists; reading never creates it.
    pub present: bool,
    pub groups: Vec<Group>,
    pub items: Vec<Site>,
    pub invalid: Vec<InvalidFile>,
    pub truncated: bool,
}
impl Snapshot {
    pub fn empty() -> Self {
        Self {
            generation: 0,
            present: false,
            groups: Vec::new(),
            items: Vec::new(),
            invalid: Vec::new(),
            truncated: false,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ItemsPolicy {
    /// Sites of a removed group become ungrouped.
    Ungroup,
    /// Sites of a removed group are deleted with it.
    Delete,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", deny_unknown_fields)]
pub enum Mutation {
    AddGroup {
        name: String,
        #[serde(default)]
        color: Option<String>,
        #[serde(default)]
        parent: Option<String>,
    },
    /// `set` keys: `name`, `color`, `collapsed`, `parent` (null makes it top level).
    UpdateGroup {
        id: String,
        revision: String,
        set: Map<String, Value>,
    },
    RemoveGroup {
        id: String,
        revision: String,
        items: ItemsPolicy,
    },
    /// Orders the listed siblings (all with the same `parent`) in the given sequence.
    ReorderGroups {
        ids: Vec<String>,
        #[serde(default)]
        parent: Option<String>,
    },
    AddItem {
        url: String,
        #[serde(default)]
        group: Option<String>,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        pinned: bool,
        /// Fields the user typed themselves, so a later fetch keeps them.
        #[serde(default)]
        manual: Vec<String>,
    },
    /// `set` keys: `url`, `title`, `description`, `group` (null ungroups), `pinned`.
    UpdateItem {
        id: String,
        revision: String,
        set: Map<String, Value>,
    },
    /// Moves sites into `group` (`None` is ungrouped), in front of `before` or at the end.
    MoveItems {
        ids: Vec<String>,
        revisions: Vec<String>,
        #[serde(default)]
        group: Option<String>,
        #[serde(default)]
        before: Option<String>,
    },
    RemoveItems {
        ids: Vec<String>,
        revisions: Vec<String>,
    },
}

/// Fields produced by a metadata fetch. `None` means "leave the stored value".
#[derive(Clone, Debug, Default)]
pub struct FetchPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    /// `Some(None)` clears the icon back to the letter mark.
    pub icon: Option<Option<String>>,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    pub generation: u64,
    pub applied: Vec<String>,
    pub conflicts: Vec<String>,
    pub created: Vec<String>,
}

struct Cached<T> {
    stamp: String,
    value: std::result::Result<T, String>,
}

pub struct SiteStore {
    dir: Dir,
    generation: u64,
    groups: HashMap<String, Cached<Group>>,
    items: HashMap<String, Cached<Site>>,
    truncated: bool,
}

// ───────────────────────── 基础工具 ─────────────────────────

fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}
fn revision(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    digest[..12].iter().map(|b| format!("{b:02x}")).collect()
}
fn new_id() -> String {
    const ALPHABET: &[u8; 32] = b"0123456789abcdefghjkmnpqrstvwxyz";
    let bits = u128::from_be_bytes(uuid::Uuid::new_v4().into_bytes());
    (0..8)
        .map(|i| ALPHABET[((bits >> (i * 5)) & 31) as usize] as char)
        .collect()
}
fn stamp(metadata: &cap_std::fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|m| m.into_std().duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}:{modified}", metadata.len())
}
fn open_sub(dir: &Dir, name: &str) -> Result<Option<Dir>> {
    match dir.symlink_metadata(name) {
        Ok(m) if m.is_dir() && !m.file_type().is_symlink() => Ok(Some(dir.open_dir(name)?)),
        Ok(_) => invalid(format!("{name} 不是普通目录")),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}
fn create_sub(dir: &Dir, name: &str) -> Result<Dir> {
    if let Some(sub) = open_sub(dir, name)? {
        return Ok(sub);
    }
    dir.create_dir(name)?;
    open_sub(dir, name)?.ok_or(StoreError::NotFound("目录"))
}
fn read_text(dir: &Dir, name: &str) -> Result<String> {
    let metadata = dir.symlink_metadata(name)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return invalid("不是普通文件");
    }
    if metadata.len() > MAX_FILE {
        return invalid("文件超过 64 KiB");
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    dir.open(name)?.take(MAX_FILE + 1).read_to_end(&mut bytes)?;
    String::from_utf8(bytes).or_else(|_| invalid("站点文件必须是 UTF-8"))
}
/// Same-directory temp file, flush, sync, then rename over the target.
fn write_atomic(dir: &Dir, name: &str, text: &str) -> Result<()> {
    write_atomic_bytes(dir, name, text.as_bytes())
}
fn write_atomic_bytes(dir: &Dir, name: &str, bytes: &[u8]) -> Result<()> {
    let temp = format!(".{name}.{}.tmp", new_id());
    let result = (|| -> Result<()> {
        let mut file = dir.open_with(&temp, OpenOptions::new().write(true).create_new(true))?;
        file.write_all(bytes)?;
        file.sync_all()?;
        dir.rename(&temp, dir, name)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = dir.remove_file(&temp);
    }
    result
}
fn read_bytes(dir: &Dir, name: &str, max: u64) -> Result<Vec<u8>> {
    let metadata = dir.symlink_metadata(name)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return invalid("不是普通文件");
    }
    if metadata.len() > max {
        return invalid("图标超过 32 KiB");
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    dir.open(name)?.take(max + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > max {
        return invalid("图标超过 32 KiB");
    }
    Ok(bytes)
}
fn file_id(name: &str) -> Option<&str> {
    name.strip_suffix(".md").filter(|id| valid_id(id))
}

fn ystr(value: impl Into<String>) -> Yaml {
    Yaml::String(value.into())
}
/// Whole numbers read better as `3` than `3.0`.
fn ynum(value: f64) -> Yaml {
    if value.fract() == 0.0 && value.abs() < 1e15 {
        Yaml::from(value as i64)
    } else {
        Yaml::from(value)
    }
}
fn mapping_of(fields: Vec<(&str, Yaml)>) -> Mapping {
    let mut map = Mapping::new();
    for (key, value) in fields.into_iter().filter(|(_, v)| !v.is_null()) {
        map.insert(ystr(key), value);
    }
    map
}

fn string_field(value: &Value, what: &str) -> Result<String> {
    value
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| StoreError::Invalid(format!("{what}必须是文本")))
}
fn optional_id(value: &Value, what: &str) -> Result<Option<String>> {
    match value {
        Value::Null => Ok(None),
        Value::String(s) => Ok(Some(s.clone())),
        _ => invalid(format!("{what}必须是文本或 null")),
    }
}

impl SiteStore {
    pub fn open(dir: Dir) -> Result<Self> {
        let mut store = Self {
            dir,
            generation: 0,
            groups: HashMap::new(),
            items: HashMap::new(),
            truncated: false,
        };
        store.refresh()?;
        Ok(store)
    }

    /// Creates the folder layout the first time the store is written.
    pub fn initialize(dir: Dir) -> Result<Self> {
        create_sub(&dir, "groups")?;
        create_sub(&dir, "items")?;
        if dir.symlink_metadata(".gitattributes").is_err() {
            write_atomic(&dir, ".gitattributes", "icons/* binary\n")?;
        }
        Self::open(dir)
    }

    pub fn generation(&self) -> u64 {
        self.generation
    }

    /// Re-reads files whose size or modification time changed; returns whether anything did.
    pub fn refresh(&mut self) -> Result<bool> {
        let (groups_changed, groups_truncated) = scan(
            &self.dir,
            "groups",
            &mut self.groups,
            MAX_GROUPS,
            parse_group,
        )?;
        let (items_changed, items_truncated) =
            scan(&self.dir, "items", &mut self.items, MAX_SITES, parse_site)?;
        self.truncated = groups_truncated || items_truncated;
        let changed = groups_changed || items_changed;
        if changed {
            self.generation += 1;
        }
        Ok(changed)
    }

    /// Groups as the shell shows them: a group whose parent is missing, or itself nested,
    /// is shown at the top level instead of disappearing.
    fn groups_view(&self) -> Vec<Group> {
        let mut groups: Vec<Group> = self
            .groups
            .values()
            .filter_map(|c| c.value.as_ref().ok().cloned())
            .collect();
        let parents: HashMap<String, Option<String>> = groups
            .iter()
            .map(|g| (g.id.clone(), g.parent.clone()))
            .collect();
        for group in &mut groups {
            if let Some(parent) = &group.parent {
                if !matches!(parents.get(parent), Some(None)) {
                    group.parent = None;
                }
            }
        }
        groups.sort_by(|a, b| {
            a.order
                .total_cmp(&b.order)
                .then_with(|| a.name.cmp(&b.name))
        });
        groups
    }

    fn items_view(&self, groups: &[Group]) -> Vec<Site> {
        let known: HashSet<&str> = groups.iter().map(|g| g.id.as_str()).collect();
        let mut items: Vec<Site> = self
            .items
            .values()
            .filter_map(|c| c.value.as_ref().ok().cloned())
            .map(|mut s| {
                if s.group.as_deref().is_some_and(|g| !known.contains(g)) {
                    s.group = None;
                }
                s
            })
            .collect();
        items.sort_by(|a, b| {
            a.order
                .total_cmp(&b.order)
                .then_with(|| a.created.cmp(&b.created))
                .then_with(|| a.id.cmp(&b.id))
        });
        items
    }

    pub fn snapshot(&self) -> Snapshot {
        let groups = self.groups_view();
        let items = self.items_view(&groups);
        let mut invalid = Vec::new();
        for (id, cached) in &self.groups {
            if let Err(error) = &cached.value {
                invalid.push(InvalidFile {
                    path: format!("groups/{id}.md"),
                    error: error.clone(),
                });
            }
        }
        for (id, cached) in &self.items {
            if let Err(error) = &cached.value {
                invalid.push(InvalidFile {
                    path: format!("items/{id}.md"),
                    error: error.clone(),
                });
            }
        }
        invalid.sort_by(|a, b| a.path.cmp(&b.path));
        Snapshot {
            generation: self.generation,
            present: true,
            groups,
            items,
            invalid,
            truncated: self.truncated,
        }
    }

    fn fresh_id(&self) -> String {
        loop {
            let id = new_id();
            if !self.groups.contains_key(&id) && !self.items.contains_key(&id) {
                return id;
            }
        }
    }

    fn create(&self, sub: &str, id: &str, fields: Vec<(&str, Yaml)>) -> Result<()> {
        let dir = create_sub(&self.dir, sub)?;
        let text = fm::render(&mapping_of(fields), "");
        write_atomic(&dir, &format!("{id}.md"), &text)
    }

    /// Patches the keys in an existing file; `Null` removes a key. The body and unknown keys
    /// stay, and a patch that changes nothing does not touch the file.
    fn update(&self, sub: &str, id: &str, changes: Vec<(&str, Yaml)>) -> Result<()> {
        let dir = open_sub(&self.dir, sub)?.ok_or(StoreError::NotFound("站点数据"))?;
        let name = format!("{id}.md");
        let text = read_text(&dir, &name)?;
        let original = fm::mapping(&text).map_err(StoreError::Invalid)?;
        let mut map = original.clone();
        for (key, value) in changes {
            if value.is_null() {
                map.remove(key);
            } else {
                map.insert(ystr(key), value);
            }
        }
        if map != original {
            write_atomic(&dir, &name, &fm::render(&map, fm::body(&text)))?;
        }
        Ok(())
    }

    fn remove_file(&self, sub: &str, id: &str) -> Result<()> {
        let dir = open_sub(&self.dir, sub)?.ok_or(StoreError::NotFound("站点数据"))?;
        match dir.remove_file(format!("{id}.md")) {
            Err(e) if e.kind() != ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }

    fn group(&self, id: &str) -> Result<&Group> {
        self.groups
            .get(id)
            .and_then(|c| c.value.as_ref().ok())
            .ok_or(StoreError::NotFound("分组"))
    }
    fn site(&self, id: &str) -> Result<&Site> {
        self.items
            .get(id)
            .and_then(|c| c.value.as_ref().ok())
            .ok_or(StoreError::NotFound("站点"))
    }
    fn existing_group(&self, id: &str) -> Result<()> {
        if self.groups_view().iter().any(|g| g.id == id) {
            Ok(())
        } else {
            Err(StoreError::NotFound("分组"))
        }
    }

    /// `id` (when it exists) becomes a child of `parent`: only one level of nesting is allowed.
    fn check_parent(&self, id: Option<&str>, parent: &str) -> Result<()> {
        let groups = self.groups_view();
        let Some(target) = groups.iter().find(|g| g.id == parent) else {
            return Err(StoreError::NotFound("父分组"));
        };
        if Some(parent) == id {
            return invalid("分组不能成为自己的子分组");
        }
        if target.parent.is_some() {
            return invalid("分组最多嵌套一层");
        }
        if let Some(id) = id {
            if groups.iter().any(|g| g.parent.as_deref() == Some(id)) {
                return invalid("含有子分组的分组不能再成为子分组");
            }
        }
        Ok(())
    }

    fn next_group_order(&self, parent: Option<&str>) -> f64 {
        self.groups_view()
            .iter()
            .filter(|g| g.parent.as_deref() == parent)
            .map(|g| g.order)
            .fold(0.0, f64::max)
            + 1.0
    }

    /// Sort keys for `count` sites placed into `group`, in front of `before` (when it is there)
    /// or after the last site.
    fn placement(
        &self,
        group: Option<&str>,
        moving: &[String],
        before: Option<&str>,
        count: usize,
    ) -> Vec<f64> {
        let groups = self.groups_view();
        let siblings: Vec<f64> = self
            .items_view(&groups)
            .into_iter()
            .filter(|s| s.group.as_deref() == group && !moving.contains(&s.id))
            .map(|s| s.order)
            .collect();
        let anchor = before.and_then(|b| {
            self.items_view(&groups)
                .into_iter()
                .filter(|s| s.group.as_deref() == group && !moving.contains(&s.id))
                .position(|s| s.id == b)
        });
        match anchor {
            Some(index) => {
                let high = siblings[index];
                let low = if index > 0 {
                    siblings[index - 1]
                } else {
                    high - 1.0
                };
                (1..=count)
                    .map(|k| low + (high - low) * k as f64 / (count + 1) as f64)
                    .collect()
            }
            None => {
                let last = siblings.iter().copied().fold(0.0, f64::max);
                (1..=count).map(|k| last + k as f64).collect()
            }
        }
    }

    /// A metadata fetch. `None` leaves a field alone; `icon: Some(None)` returns to the letter mark.
    /// Fields listed in `manual` are left exactly as the user wrote them.
    pub fn apply_fetch(&mut self, id: &str, patch: FetchPatch) -> Result<bool> {
        self.refresh()?;
        let site = self.site(id)?.clone();
        let mut changes = Vec::new();
        if let Some(title) = patch.title {
            let title = clean(&title, MAX_TITLE);
            if !title.is_empty()
                && title != site.title
                && !site.manual.iter().any(|field| field == "title")
            {
                changes.push(("title", ystr(title)));
            }
        }
        if let Some(description) = patch.description {
            let description = clean(&description, MAX_DESCRIPTION);
            if description != site.description
                && !site.manual.iter().any(|field| field == "description")
            {
                changes.push((
                    "description",
                    if description.is_empty() {
                        Yaml::Null
                    } else {
                        ystr(description)
                    },
                ));
            }
        }
        if let Some(icon) = patch.icon {
            if !site.manual.iter().any(|field| field == "icon") {
                let icon = icon.filter(|path| valid_icon_path(path));
                if icon != site.icon {
                    changes.push(("icon", icon.map_or(Yaml::Null, ystr)));
                }
            }
        }
        if changes.is_empty() {
            return Ok(false);
        }
        changes.push(("fetched", ystr(now_iso())));
        self.update("items", id, changes)?;
        self.prune_icons()?;
        self.refresh()?;
        Ok(true)
    }

    /// The user picked a letter, automatic fetch, or an icon file this store already holds.
    pub fn assign_icon(
        &mut self,
        id: &str,
        revision: &str,
        icon: Option<String>,
        manual_icon: bool,
    ) -> Result<MutationResult> {
        self.refresh()?;
        let site = self.site(id)?.clone();
        let mut result = MutationResult::default();
        if site.revision != revision {
            result.conflicts.push(id.to_owned());
            result.generation = self.generation;
            return Ok(result);
        }
        if let Some(path) = &icon {
            if !valid_icon_path(path) {
                return invalid("图标路径无效");
            }
        }
        let mut manual = site.manual.clone();
        if manual_icon {
            if !manual.iter().any(|field| field == "icon") {
                manual.push("icon".to_owned());
            }
        } else {
            manual.retain(|field| field != "icon");
        }
        self.update(
            "items",
            id,
            vec![
                ("icon", icon.map_or(Yaml::Null, ystr)),
                (
                    "manual",
                    if manual.is_empty() {
                        Yaml::Null
                    } else {
                        Yaml::Sequence(manual.into_iter().map(ystr).collect())
                    },
                ),
            ],
        )?;
        self.prune_icons()?;
        self.refresh()?;
        result.applied.push(id.to_owned());
        result.generation = self.generation;
        Ok(result)
    }

    /// Writes `icons/<file_name>`. Identical bytes are left in place so Git stays quiet.
    pub fn write_icon(&self, file_name: &str, bytes: &[u8]) -> Result<String> {
        let path = format!("icons/{file_name}");
        if !valid_icon_path(&path) || bytes.is_empty() || bytes.len() > 32 * 1024 {
            return invalid("图标文件无效");
        }
        let dir = create_sub(&self.dir, "icons")?;
        if read_bytes(&dir, file_name, 32 * 1024).is_ok_and(|current| current == bytes) {
            return Ok(path);
        }
        write_atomic_bytes(&dir, file_name, bytes)?;
        Ok(path)
    }

    pub fn read_icon(&self, file_name: &str) -> Result<Vec<u8>> {
        let path = format!("icons/{file_name}");
        if !valid_icon_path(&path) {
            return invalid("图标路径无效");
        }
        let dir = open_sub(&self.dir, "icons")?.ok_or(StoreError::NotFound("图标"))?;
        read_bytes(&dir, file_name, 32 * 1024)
    }

    /// Deletes icon files no site points at. Called on the next write after a removal.
    pub fn prune_icons(&self) -> Result<()> {
        let Some(dir) = open_sub(&self.dir, "icons")? else {
            return Ok(());
        };
        let used: HashSet<String> = self
            .items
            .values()
            .filter_map(|cached| {
                cached.value.as_ref().ok().and_then(|site| {
                    site.icon
                        .as_deref()
                        .and_then(|path| path.strip_prefix("icons/"))
                        .map(str::to_owned)
                })
            })
            .collect();
        for entry in dir.entries()? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if used.contains(&name) || !valid_icon_path(&format!("icons/{name}")) {
                continue;
            }
            let metadata = dir.symlink_metadata(&name)?;
            if metadata.is_file() && !metadata.file_type().is_symlink() {
                let _ = dir.remove_file(name);
            }
        }
        Ok(())
    }

    pub fn apply(&mut self, mutation: Mutation) -> Result<MutationResult> {
        let drop_icons = matches!(
            &mutation,
            Mutation::RemoveItems { .. }
                | Mutation::RemoveGroup {
                    items: ItemsPolicy::Delete,
                    ..
                }
        );
        self.refresh()?;
        let mut result = MutationResult::default();
        match mutation {
            Mutation::AddGroup {
                name,
                color,
                parent,
            } => {
                let name = clean(&name, MAX_GROUP_NAME);
                if name.is_empty() {
                    return invalid("分组名称不能为空");
                }
                if self.groups.len() >= MAX_GROUPS {
                    return invalid("分组数量已达上限");
                }
                let color = match color {
                    Some(c) if valid_color(&c) => c,
                    Some(_) => return invalid("颜色必须是预设色名或 #rrggbb"),
                    None => COLORS[self.groups.len() % (COLORS.len() - 1)].to_owned(),
                };
                if let Some(parent) = &parent {
                    self.check_parent(None, parent)?;
                }
                let id = self.fresh_id();
                let order = self.next_group_order(parent.as_deref());
                self.create(
                    "groups",
                    &id,
                    vec![
                        ("name", ystr(name)),
                        ("color", ystr(color)),
                        ("parent", parent.map_or(Yaml::Null, ystr)),
                        ("order", ynum(order)),
                        ("created", ystr(now_iso())),
                    ],
                )?;
                result.created.push(id.clone());
                result.applied.push(id);
            }
            Mutation::UpdateGroup { id, revision, set } => {
                if self.group(&id)?.revision != revision {
                    result.conflicts.push(id);
                } else {
                    let mut changes = Vec::new();
                    for (key, value) in &set {
                        match key.as_str() {
                            "name" => {
                                let name = clean(&string_field(value, "分组名称")?, MAX_GROUP_NAME);
                                if name.is_empty() {
                                    return invalid("分组名称不能为空");
                                }
                                changes.push(("name", ystr(name)));
                            }
                            "color" => {
                                let color = string_field(value, "颜色")?;
                                if !valid_color(&color) {
                                    return invalid("颜色必须是预设色名或 #rrggbb");
                                }
                                changes.push(("color", ystr(color)));
                            }
                            "collapsed" => {
                                let flag = value.as_bool().ok_or_else(|| {
                                    StoreError::Invalid("collapsed 必须是布尔值".into())
                                })?;
                                changes.push((
                                    "collapsed",
                                    if flag { Yaml::Bool(true) } else { Yaml::Null },
                                ));
                            }
                            "parent" => {
                                let parent = optional_id(value, "父分组")?;
                                if let Some(parent) = &parent {
                                    self.check_parent(Some(&id), parent)?;
                                }
                                changes.push(("parent", parent.map_or(Yaml::Null, ystr)));
                            }
                            other => return invalid(format!("不支持修改分组字段 {other}")),
                        }
                    }
                    self.update("groups", &id, changes)?;
                    result.applied.push(id);
                }
            }
            Mutation::RemoveGroup {
                id,
                revision,
                items,
            } => {
                if self.group(&id)?.revision != revision {
                    result.conflicts.push(id);
                } else {
                    let mut doomed: Vec<String> = self
                        .groups_view()
                        .into_iter()
                        .filter(|g| g.parent.as_deref() == Some(id.as_str()))
                        .map(|g| g.id)
                        .collect();
                    doomed.push(id.clone());
                    let members: Vec<String> = self
                        .items
                        .iter()
                        .filter_map(|(sid, c)| {
                            let site = c.value.as_ref().ok()?;
                            site.group
                                .as_deref()
                                .is_some_and(|g| doomed.iter().any(|d| d == g))
                                .then(|| sid.clone())
                        })
                        .collect();
                    // Sites first: a half-finished removal leaves sites that read as ungrouped,
                    // never sites that vanished while their group stayed.
                    for sid in &members {
                        match items {
                            ItemsPolicy::Ungroup => {
                                self.update("items", sid, vec![("group", Yaml::Null)])?
                            }
                            ItemsPolicy::Delete => self.remove_file("items", sid)?,
                        }
                    }
                    for gid in &doomed {
                        self.remove_file("groups", gid)?;
                    }
                    result.applied.push(id);
                }
            }
            Mutation::ReorderGroups { ids, parent } => {
                let groups = self.groups_view();
                for id in &ids {
                    let group = groups
                        .iter()
                        .find(|g| &g.id == id)
                        .ok_or(StoreError::NotFound("分组"))?;
                    if group.parent != parent {
                        return invalid("只能在同一层级内排序");
                    }
                }
                for (index, id) in ids.iter().enumerate() {
                    self.update("groups", id, vec![("order", ynum((index + 1) as f64))])?;
                    result.applied.push(id.clone());
                }
            }
            Mutation::AddItem {
                url,
                group,
                title,
                description,
                pinned,
                manual,
            } => {
                if self.items.len() >= MAX_SITES {
                    return invalid("站点数量已达上限");
                }
                let url = normalize_url(&url).map_err(StoreError::Invalid)?;
                if let Some(group) = &group {
                    self.existing_group(group)?;
                }
                if manual.iter().any(|f| !MANUAL_FIELDS.contains(&f.as_str())) {
                    return invalid("manual 只能包含 title、description、icon");
                }
                let title = title
                    .map(|t| clean(&t, MAX_TITLE))
                    .filter(|t| !t.is_empty());
                let description = description
                    .map(|d| clean(&d, MAX_DESCRIPTION))
                    .filter(|d| !d.is_empty());
                let id = self.fresh_id();
                let order = self.placement(group.as_deref(), &[], None, 1)[0];
                self.create(
                    "items",
                    &id,
                    vec![
                        ("url", ystr(url)),
                        ("title", title.map_or(Yaml::Null, ystr)),
                        ("description", description.map_or(Yaml::Null, ystr)),
                        ("group", group.map_or(Yaml::Null, ystr)),
                        ("order", ynum(order)),
                        ("pinned", if pinned { Yaml::Bool(true) } else { Yaml::Null }),
                        (
                            "manual",
                            if manual.is_empty() {
                                Yaml::Null
                            } else {
                                Yaml::Sequence(manual.into_iter().map(ystr).collect())
                            },
                        ),
                        ("created", ystr(now_iso())),
                    ],
                )?;
                result.created.push(id.clone());
                result.applied.push(id);
            }
            Mutation::UpdateItem { id, revision, set } => {
                let site = self.site(&id)?;
                if site.revision != revision {
                    result.conflicts.push(id);
                } else {
                    let mut manual = site.manual.clone();
                    let mut changes = Vec::new();
                    for (key, value) in &set {
                        match key.as_str() {
                            "url" => changes.push((
                                "url",
                                ystr(
                                    normalize_url(&string_field(value, "网址")?)
                                        .map_err(StoreError::Invalid)?,
                                ),
                            )),
                            "title" | "description" => {
                                let (key, max) = if key == "title" {
                                    ("title", MAX_TITLE)
                                } else {
                                    ("description", MAX_DESCRIPTION)
                                };
                                let text = clean(&string_field(value, key)?, max);
                                // Clearing a field returns it to the fetched value.
                                if text.is_empty() {
                                    manual.retain(|f| f != key);
                                    changes.push((key, Yaml::Null));
                                } else {
                                    if !manual.iter().any(|f| f == key) {
                                        manual.push(key.to_owned());
                                    }
                                    changes.push((key, ystr(text)));
                                }
                            }
                            "group" => {
                                let group = optional_id(value, "分组")?;
                                if let Some(group) = &group {
                                    self.existing_group(group)?;
                                }
                                changes.push(("group", group.map_or(Yaml::Null, ystr)));
                            }
                            "pinned" => {
                                let flag = value.as_bool().ok_or_else(|| {
                                    StoreError::Invalid("pinned 必须是布尔值".into())
                                })?;
                                changes.push((
                                    "pinned",
                                    if flag { Yaml::Bool(true) } else { Yaml::Null },
                                ));
                            }
                            other => return invalid(format!("不支持修改站点字段 {other}")),
                        }
                    }
                    changes.push((
                        "manual",
                        if manual.is_empty() {
                            Yaml::Null
                        } else {
                            Yaml::Sequence(manual.into_iter().map(ystr).collect())
                        },
                    ));
                    self.update("items", &id, changes)?;
                    result.applied.push(id);
                }
            }
            Mutation::MoveItems {
                ids,
                revisions,
                group,
                before,
            } => {
                if ids.len() != revisions.len() {
                    return invalid("ids 与 revisions 数量不一致");
                }
                if let Some(group) = &group {
                    self.existing_group(group)?;
                }
                let mut movable = Vec::new();
                for (id, revision) in ids.iter().zip(&revisions) {
                    if self.site(id)?.revision == *revision {
                        movable.push(id.clone());
                    } else {
                        result.conflicts.push(id.clone());
                    }
                }
                let orders =
                    self.placement(group.as_deref(), &movable, before.as_deref(), movable.len());
                for (id, order) in movable.iter().zip(orders) {
                    self.update(
                        "items",
                        id,
                        vec![
                            ("group", group.clone().map_or(Yaml::Null, ystr)),
                            ("order", ynum(order)),
                        ],
                    )?;
                    result.applied.push(id.clone());
                }
            }
            Mutation::RemoveItems { ids, revisions } => {
                if ids.len() != revisions.len() {
                    return invalid("ids 与 revisions 数量不一致");
                }
                for (id, revision) in ids.iter().zip(&revisions) {
                    if self.site(id)?.revision == *revision {
                        self.remove_file("items", id)?;
                        result.applied.push(id.clone());
                    } else {
                        result.conflicts.push(id.clone());
                    }
                }
            }
        }
        self.refresh()?;
        if drop_icons && !result.applied.is_empty() {
            self.prune_icons()?;
        }
        result.generation = self.generation;
        Ok(result)
    }
}

/// Reads the changed files of one sub-directory into `cache`; returns (changed, truncated).
fn scan<T>(
    dir: &Dir,
    sub: &str,
    cache: &mut HashMap<String, Cached<T>>,
    max: usize,
    parse: impl Fn(&str, String, &Mapping) -> std::result::Result<T, String>,
) -> Result<(bool, bool)> {
    let mut changed = false;
    let mut truncated = false;
    let mut seen = HashSet::new();
    if let Some(sub_dir) = open_sub(dir, sub)? {
        for entry in sub_dir.entries()? {
            let entry = entry?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let Some(id) = file_id(&name) else { continue };
            if seen.len() >= max {
                truncated = true;
                break;
            }
            let Ok(metadata) = sub_dir.symlink_metadata(&name) else {
                continue;
            };
            if !metadata.is_file() || metadata.file_type().is_symlink() {
                continue;
            }
            seen.insert(id.to_owned());
            let current = stamp(&metadata);
            if cache.get(id).is_some_and(|c| c.stamp == current) {
                continue;
            }
            let value = read_text(&sub_dir, &name)
                .map_err(|e| e.to_string())
                .and_then(|text| {
                    let map = fm::mapping(&text)?;
                    parse(id, revision(&text), &map)
                });
            cache.insert(
                id.to_owned(),
                Cached {
                    stamp: current,
                    value,
                },
            );
            changed = true;
        }
    }
    let before = cache.len();
    cache.retain(|id, _| seen.contains(id));
    Ok((changed || cache.len() != before, truncated))
}

#[cfg(test)]
mod tests;
