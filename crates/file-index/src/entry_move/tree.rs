use super::*;
use crate::fs_mutation::is_link;
use cap_std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom};

const MAX_NODES: usize = 10_000;
const MAX_BYTES: usize = 128 * 1024 * 1024;
const MAX_DEPTH: usize = 128;

pub(super) struct Tree {
    nodes: Vec<Node>,
}
struct Node {
    suffix: PathBuf,
    kind: EntryKind,
    source: Arc<File>,
    identity: Arc<same_file::Handle>,
    state: State,
    bytes: Option<Vec<u8>>,
    extra: platform::ExtraMetadata,
}
#[derive(Debug, PartialEq, Eq)]
struct State {
    size: u64,
    modified: Option<cap_std::time::SystemTime>,
    created: Option<cap_std::time::SystemTime>,
    #[cfg(unix)]
    mode: u32,
    #[cfg(unix)]
    uid: u32,
    #[cfg(unix)]
    gid: u32,
    #[cfg(unix)]
    changed: (i64, i64),
    #[cfg(target_os = "macos")]
    flags: u32,
}
impl State {
    fn capture(file: &File, kind: EntryKind) -> Result<Self, IndexError> {
        let metadata = file.metadata()?;
        if (kind == EntryKind::File && !metadata.is_file())
            || (kind == EntryKind::Directory && !metadata.is_dir())
        {
            return Err(stale());
        }
        #[cfg(unix)]
        use cap_std::fs::MetadataExt;
        #[cfg(target_os = "macos")]
        let flags = {
            use std::os::macos::fs::MetadataExt;
            file.try_clone()?.into_std().metadata()?.st_flags()
        };
        Ok(Self {
            size: if kind == EntryKind::File {
                metadata.len()
            } else {
                0
            },
            modified: metadata.modified().ok(),
            created: metadata.created().ok(),
            #[cfg(unix)]
            mode: metadata.mode(),
            #[cfg(unix)]
            uid: metadata.uid(),
            #[cfg(unix)]
            gid: metadata.gid(),
            #[cfg(unix)]
            changed: (metadata.ctime(), metadata.ctime_nsec()),
            #[cfg(target_os = "macos")]
            flags,
        })
    }
    fn equivalent(&self, other: &Self, ignore_changed: bool) -> bool {
        self.size == other.size
            && self.modified == other.modified
            && self.created == other.created
            && {
                #[cfg(unix)]
                {
                    self.mode == other.mode
                        && self.uid == other.uid
                        && self.gid == other.gid
                        && (ignore_changed || self.changed == other.changed)
                }
                #[cfg(not(unix))]
                {
                    let _ = ignore_changed;
                    true
                }
            }
            && {
                #[cfg(target_os = "macos")]
                {
                    self.flags == other.flags
                }
                #[cfg(not(target_os = "macos"))]
                {
                    true
                }
            }
    }
}
impl Tree {
    pub(super) fn capture_optional(
        directory: &Dir,
        name: &Path,
    ) -> Result<Option<Self>, IndexError> {
        match directory.symlink_metadata(name) {
            Ok(_) => Self::capture(directory, name).map(Some),
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.into()),
        }
    }
    pub(super) fn capture(directory: &Dir, name: &Path) -> Result<Self, IndexError> {
        let mut tree = Self { nodes: vec![] };
        let mut budget = 0usize;
        tree.walk(directory, name, Path::new(""), &mut budget, 0)?;
        tree.validate(directory, name, false)?;
        Ok(tree)
    }
    fn walk(
        &mut self,
        directory: &Dir,
        name: &Path,
        suffix: &Path,
        budget: &mut usize,
        depth: usize,
    ) -> Result<(), IndexError> {
        if self.nodes.len() >= MAX_NODES || depth > MAX_DEPTH {
            return Err(invalid("目录超过安全移动的条目或深度上限，未改动源"));
        }
        let metadata = directory.symlink_metadata(name)?;
        if is_link(&metadata) {
            return Err(invalid("目录包含符号链接或重解析点，未进行隐式跟随或迁移"));
        }
        let kind = if metadata.is_file() {
            EntryKind::File
        } else if metadata.is_dir() {
            EntryKind::Directory
        } else {
            return Err(invalid("目录包含非常规实体，未改动源"));
        };
        let source = Arc::new(platform::open_for_move(directory, name, kind)?);
        let identity = Arc::new(same_file::Handle::from_file(
            source.try_clone()?.into_std(),
        )?);
        check_entity(directory, name, kind, &identity)?;
        let state = State::capture(&source, kind)?;
        let bytes = if kind == EntryKind::File {
            *budget = budget
                .checked_add(usize::try_from(state.size).map_err(|_| invalid("文件过大"))?)
                .ok_or_else(|| invalid("移动大小溢出"))?;
            if *budget > MAX_BYTES {
                return Err(invalid("目录超过128MiB安全移动快照上限，未改动源"));
            }
            Some(read(&source, state.size)?)
        } else {
            None
        };
        let extra = platform::extra_metadata(&source)?;
        if !state.equivalent(&State::capture(&source, kind)?, false) {
            return Err(stale());
        }
        self.nodes.push(Node {
            suffix: suffix.to_owned(),
            kind,
            source: Arc::clone(&source),
            identity,
            state,
            bytes,
            extra,
        });
        if kind == EntryKind::Directory {
            let child = Dir::from_std_file(source.try_clone()?.into_std());
            let mut entries = child.entries()?.collect::<Result<Vec<_>, _>>()?;
            entries.sort_by_key(|entry| entry.file_name());
            for entry in entries {
                let name = entry.file_name();
                self.walk(
                    &child,
                    Path::new(&name),
                    &suffix.join(&name),
                    budget,
                    depth + 1,
                )?;
            }
        }
        Ok(())
    }
    pub(super) fn identity(&self) -> Arc<same_file::Handle> {
        Arc::clone(&self.nodes[0].identity)
    }
    pub(super) fn source(&self) -> Arc<File> {
        Arc::clone(&self.nodes[0].source)
    }
    pub(super) fn kind(&self) -> EntryKind {
        self.nodes[0].kind
    }
    pub(super) fn validate(
        &self,
        directory: &Dir,
        name: &Path,
        root_renamed: bool,
    ) -> Result<(), IndexError> {
        check_entity(directory, name, self.kind(), &self.nodes[0].identity)?;
        let root = if self.kind() == EntryKind::Directory {
            Some(Dir::from_std_file(
                self.nodes[0].source.try_clone()?.into_std(),
            ))
        } else {
            None
        };
        let mut expected = std::collections::BTreeSet::new();
        for node in &self.nodes {
            if !node.suffix.as_os_str().is_empty() {
                let root = root.as_ref().ok_or_else(stale)?;
                let path = &node.suffix;
                if is_link(&root.symlink_metadata(path)?) {
                    return Err(stale());
                }
                let observed = open_entity(root, path, node.kind)?;
                if same_file::Handle::from_file(observed.into_std())? != *node.identity {
                    return Err(stale());
                }
                expected.insert(path.clone());
            }
            if !node.state.equivalent(
                &State::capture(&node.source, node.kind)?,
                root_renamed && node.suffix.as_os_str().is_empty(),
            ) {
                return Err(stale());
            }
            if let Some(bytes) = &node.bytes {
                if read(&node.source, node.state.size)? != *bytes {
                    return Err(stale());
                }
            }
            if platform::extra_metadata(&node.source)? != node.extra {
                return Err(stale());
            }
        }
        if let Some(root) = root {
            let mut actual = std::collections::BTreeSet::new();
            collect_paths(&root, Path::new(""), &mut actual, 0)?;
            if expected != actual {
                return Err(stale());
            }
        }
        check_entity(directory, name, self.kind(), &self.nodes[0].identity)
    }
    pub(super) fn same_placement(&self) -> Vec<EntryMovePlacementEntry> {
        self.nodes
            .iter()
            .map(|node| EntryMovePlacementEntry {
                suffix: node.suffix.clone(),
                kind: node.kind,
                source: Arc::clone(&node.source),
                destination: Arc::clone(&node.source),
                source_identity: Arc::clone(&node.identity),
                destination_identity: Arc::clone(&node.identity),
            })
            .collect()
    }
    pub(super) fn placement(
        &self,
        destination: &Self,
    ) -> Result<Vec<EntryMovePlacementEntry>, IndexError> {
        if self.nodes.len() != destination.nodes.len() {
            return Err(IndexError::MutationUncertain);
        }
        self.nodes
            .iter()
            .zip(&destination.nodes)
            .map(|(source, dest)| {
                if source.suffix != dest.suffix
                    || source.kind != dest.kind
                    || source.bytes != dest.bytes
                    || source.extra != dest.extra
                    || !source.state.equivalent(&dest.state, true)
                {
                    return Err(IndexError::MutationUncertain);
                }
                Ok(EntryMovePlacementEntry {
                    suffix: source.suffix.clone(),
                    kind: source.kind,
                    source: Arc::clone(&source.source),
                    destination: Arc::clone(&dest.source),
                    source_identity: Arc::clone(&source.identity),
                    destination_identity: Arc::clone(&dest.identity),
                })
            })
            .collect()
    }
    pub(super) fn copy_to(&self, directory: &Dir, name: &Path) -> Result<Self, IndexError> {
        self.copy_to_with_hook(directory, name, || {})
    }
    pub(super) fn copy_to_with_hook(
        &self,
        directory: &Dir,
        name: &Path,
        after_copy: impl FnOnce(),
    ) -> Result<Self, IndexError> {
        platform::require_copy_support()?;
        absent(directory, name)?;
        let root_source = &self.nodes[0];
        let root_destination = create(directory, name, root_source.kind)?;
        let target_root = if root_source.kind == EntryKind::Directory {
            Some(Dir::from_std_file(root_destination.try_clone()?.into_std()))
        } else {
            None
        };
        let mut destinations = vec![root_destination];
        for (index, node) in self.nodes.iter().enumerate().skip(1) {
            let root = target_root.as_ref().ok_or(IndexError::MutationUncertain)?;
            let parent = root.open_dir(
                node.suffix
                    .parent()
                    .filter(|parent| !parent.as_os_str().is_empty())
                    .unwrap_or(Path::new(".")),
            )?;
            let name = Path::new(
                node.suffix
                    .file_name()
                    .ok_or(IndexError::MutationUncertain)?,
            );
            // Preserve internal hard-link relationships rather than turning
            // shared resource files into unrelated copies.
            let previous = if node.kind == EntryKind::File {
                self.nodes[..index].iter().position(|earlier| {
                    earlier.kind == EntryKind::File && earlier.identity == node.identity
                })
            } else {
                None
            };
            let target = if let Some(previous) = previous {
                root.hard_link(&self.nodes[previous].suffix, &parent, name)?;
                Arc::new(open_entity(&parent, name, node.kind)?)
            } else {
                create(&parent, name, node.kind)?
            };
            destinations.push(target);
        }
        // Children precede their parents' final metadata to avoid changing a
        // restored directory mtime by later creation, or inheriting read-only
        // permissions before all resources have been copied.
        for index in (0..self.nodes.len()).rev() {
            let node = &self.nodes[index];
            if node.kind == EntryKind::File
                && self.nodes[..index].iter().any(|earlier| {
                    earlier.kind == EntryKind::File && earlier.identity == node.identity
                })
            {
                continue;
            }
            let target = &destinations[index];
            platform::copy_all(&node.source, target, node.kind)?;
            if node.kind == EntryKind::File {
                target.sync_all()?;
            }
        }
        after_copy();
        let mut copied = Self::capture(directory, name)?;
        if copied.nodes.len() != destinations.len() {
            return Err(IndexError::MutationUncertain);
        }
        for (node, owned) in copied.nodes.iter_mut().zip(destinations) {
            let actual = same_file::Handle::from_file(owned.try_clone()?.into_std())?;
            if *node.identity != actual {
                return Err(IndexError::MutationUncertain);
            }
            // The publication evidence is the create_new/directory-create
            // handle retained throughout copy, never a later path adoption.
            node.source = owned;
        }
        self.placement(&copied)?;
        Ok(copied)
    }
}
fn create(directory: &Dir, name: &Path, kind: EntryKind) -> Result<Arc<File>, IndexError> {
    if kind == EntryKind::Directory {
        let builder = cap_std::fs::DirBuilder::new();
        #[cfg(unix)]
        let builder = {
            use cap_std::fs::DirBuilderExt;
            let mut builder = builder;
            builder.mode(0o700);
            builder
        };
        directory.create_dir_with(name, &builder)?;
        Ok(Arc::new(open_entity(directory, name, kind)?))
    } else {
        let mut options = OpenOptions::new();
        options.read(true).write(true).create_new(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        Ok(Arc::new(directory.open_with(name, &options)?))
    }
}
fn read(file: &File, length: u64) -> Result<Vec<u8>, IndexError> {
    if length > MAX_BYTES as u64 {
        return Err(invalid("文件超过安全移动上限"));
    }
    let mut file = file.try_clone()?;
    file.seek(SeekFrom::Start(0))?;
    let mut bytes = Vec::with_capacity(length as usize);
    file.take(MAX_BYTES as u64 + 1).read_to_end(&mut bytes)?;
    if bytes.len() != length as usize {
        return Err(stale());
    }
    Ok(bytes)
}
fn collect_paths(
    directory: &Dir,
    prefix: &Path,
    paths: &mut std::collections::BTreeSet<PathBuf>,
    depth: usize,
) -> Result<(), IndexError> {
    if depth > MAX_DEPTH || paths.len() > MAX_NODES {
        return Err(stale());
    }
    for entry in directory.entries()? {
        let entry = entry?;
        let name = entry.file_name();
        let path = prefix.join(&name);
        let metadata = directory.symlink_metadata(&name)?;
        if is_link(&metadata) || (!metadata.is_dir() && !metadata.is_file()) {
            return Err(stale());
        }
        paths.insert(path.clone());
        if metadata.is_dir() {
            collect_paths(&directory.open_dir(&name)?, &path, paths, depth + 1)?;
        }
    }
    Ok(())
}
