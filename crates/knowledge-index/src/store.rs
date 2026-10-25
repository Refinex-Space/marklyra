use crate::{
    fingerprint, parse,
    resolve::{note_keys, reference_keys},
    Catalog, Parsed, Reference,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::Path,
    time::Duration,
};

type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub struct Store {
    connection: Connection,
    catalog: Catalog,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct GraphQuery {
    pub focus: Option<String>,
    pub depth: usize,
    pub filter: String,
    pub folder: String,
    pub tag: String,
    pub show_missing: bool,
    pub show_orphans: bool,
    pub limit: usize,
}
impl Default for GraphQuery {
    fn default() -> Self {
        Self {
            focus: None,
            depth: 1,
            filter: String::new(),
            folder: String::new(),
            tag: String::new(),
            show_missing: true,
            show_orphans: true,
            limit: 2000,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub path: Option<String>,
    pub title: String,
    pub tags: Vec<String>,
    pub incoming: usize,
    pub outgoing: usize,
    pub state: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub count: usize,
    pub anchor_missing: bool,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphSnapshot {
    pub generation: u64,
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub total_notes: usize,
    pub total_edges: usize,
    pub unresolved: usize,
    pub truncated: bool,
    pub folders: Vec<String>,
    pub tags: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphReference {
    pub source: String,
    pub target: Option<String>,
    pub status: String,
    pub fragment: String,
    pub anchor_missing: bool,
    pub candidates: Vec<String>,
    pub source_fingerprint: String,
    #[serde(flatten)]
    pub location: Reference,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferencePage {
    pub items: Vec<GraphReference>,
    pub total: usize,
    pub offset: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnchorMatch {
    pub source_fingerprint: String,
    #[serde(flatten)]
    pub location: crate::AnchorLocation,
}
pub fn anchor(path: &Path, note: &str, fragment: &str) -> Result<Option<AnchorMatch>> {
    if note.len() > 4096 || fragment.len() > 4096 {
        return Err("锚点查询超出范围".into());
    }
    let connection = reader(path)?;
    let row: Option<(String, String)> = connection
        .query_row(
            "SELECT metadata,fingerprint FROM notes WHERE path=? AND error=''",
            [note],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(err)?;
    let Some((metadata, source_fingerprint)) = row else {
        return Ok(None);
    };
    let parsed: Parsed = serde_json::from_str(&metadata).map_err(err)?;
    Ok(parsed
        .anchor_locations
        .get(fragment)
        .or_else(|| parsed.anchor_locations.get(&crate::parse::slug(fragment)))
        .cloned()
        .map(|location| AnchorMatch {
            source_fingerprint,
            location,
        }))
}

impl Store {
    pub fn invalidate(&self) -> Result<()> {
        self.connection
            .execute("UPDATE notes SET stamp='',hash=''", [])
            .map_err(err)?;
        Ok(())
    }
    pub fn set_root(&mut self, root: &Path) -> Result<()> {
        let root_text = root.to_string_lossy();
        let previous: Option<String> = self
            .connection
            .query_row("SELECT value FROM meta WHERE key='root'", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(err)?;
        if previous.as_deref() != Some(root_text.as_ref()) {
            self.connection
                .execute("UPDATE notes SET stamp='',hash=''", [])
                .map_err(err)?;
            self.connection.execute("INSERT INTO meta(key,value) VALUES('root',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[root_text.as_ref()]).map_err(err)?;
        }
        self.catalog.set_root(root);
        Ok(())
    }
    pub fn generation(&self) -> Result<u64> {
        self.connection
            .query_row("SELECT value FROM meta WHERE key='generation'", [], |r| {
                r.get::<_, u32>(0)
            })
            .map(|v| v as u64)
            .map_err(err)
    }
    pub fn begin_batch(&self) -> Result<()> {
        self.connection
            .execute_batch("BEGIN IMMEDIATE")
            .map_err(err)
    }
    pub fn commit_batch(&self) -> Result<()> {
        self.connection.execute_batch("COMMIT").map_err(err)
    }
    pub fn open(path: &Path) -> Result<Self> {
        let connection = Connection::open(path).map_err(err)?;
        connection
            .busy_timeout(Duration::from_secs(2))
            .map_err(err)?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA cache_size=-4096; PRAGMA wal_autocheckpoint=1000;").map_err(err)?;
        let version: u32 = connection
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(err)?;
        if version > 1 {
            return Err("图谱索引由更新版本创建，请使用更新的应用".into());
        }
        connection.execute_batch("
          CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value INTEGER NOT NULL);
          INSERT OR IGNORE INTO meta VALUES('generation',0);
          CREATE TABLE IF NOT EXISTS notes(path TEXT PRIMARY KEY,title TEXT NOT NULL,stamp TEXT NOT NULL,hash TEXT NOT NULL,fingerprint TEXT NOT NULL,metadata TEXT NOT NULL,error TEXT NOT NULL DEFAULT '');
          CREATE TABLE IF NOT EXISTS refs(source TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,ordinal INTEGER NOT NULL,destination TEXT NOT NULL,wiki INTEGER NOT NULL,location TEXT NOT NULL,target TEXT,status TEXT NOT NULL DEFAULT 'pending',fragment TEXT NOT NULL DEFAULT '',anchor_missing INTEGER NOT NULL DEFAULT 0,candidates TEXT NOT NULL DEFAULT '[]',PRIMARY KEY(source,ordinal));
          CREATE INDEX IF NOT EXISTS refs_target ON refs(target);
          CREATE INDEX IF NOT EXISTS refs_status ON refs(status);
          CREATE INDEX IF NOT EXISTS refs_source_resolution ON refs(source,status,target,anchor_missing);
          CREATE TABLE IF NOT EXISTS dependencies(source TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,key TEXT NOT NULL,PRIMARY KEY(source,key));
          CREATE INDEX IF NOT EXISTS dependencies_key ON dependencies(key);
          CREATE TABLE IF NOT EXISTS edges(source TEXT NOT NULL REFERENCES notes(path) ON DELETE CASCADE,target TEXT NOT NULL,count INTEGER NOT NULL,anchor_missing INTEGER NOT NULL,PRIMARY KEY(source,target));
          CREATE INDEX IF NOT EXISTS edges_target ON edges(target);
          PRAGMA user_version=1;
        ").map_err(err)?;
        let extractor: Option<u32> = connection
            .query_row("SELECT value FROM meta WHERE key='extractor'", [], |row| {
                row.get(0)
            })
            .optional()
            .map_err(err)?;
        if extractor != Some(4) {
            connection.execute_batch("UPDATE notes SET hash='',stamp=''; INSERT INTO meta(key,value) VALUES('extractor',4) ON CONFLICT(key) DO UPDATE SET value=excluded.value;").map_err(err)?;
        }
        let mut store = Self {
            connection,
            catalog: Catalog::default(),
        };
        let mut statement = store
            .connection
            .prepare("SELECT path,metadata FROM notes")
            .map_err(err)?;
        for row in statement
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(err)?
        {
            let (path, json) = row.map_err(err)?;
            let parsed: Parsed = serde_json::from_str(&json).map_err(err)?;
            store.catalog.insert(path, &parsed);
        }
        drop(statement);
        Ok(store)
    }
    pub fn stamps(&self) -> Result<BTreeMap<String, String>> {
        self.connection
            .prepare("SELECT path,stamp FROM notes WHERE error=''")
            .map_err(err)?
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(err)?
            .map(|r| r.map_err(err))
            .collect()
    }
    pub fn paths(&self) -> Result<BTreeSet<String>> {
        self.connection
            .prepare("SELECT path FROM notes")
            .map_err(err)?
            .query_map([], |r| r.get(0))
            .map_err(err)?
            .map(|r| r.map_err(err))
            .collect()
    }
    pub fn has_descendants(&self, path: &str) -> Result<bool> {
        self.connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM notes WHERE path>=?1 AND path<?2)",
                params![format!("{path}/"), format!("{path}0")],
                |r| r.get(0),
            )
            .map_err(err)
    }
    fn metadata(&self, path: &str) -> Result<Option<Parsed>> {
        self.connection
            .query_row("SELECT metadata FROM notes WHERE path=?", [path], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .map_err(err)?
            .map(|s| serde_json::from_str(&s).map_err(err))
            .transpose()
    }
    pub fn upsert(&mut self, path: &str, stamp: &str, text: &str) -> Result<BTreeSet<String>> {
        use sha2::{Digest, Sha256};
        let hash = format!("{:x}", Sha256::digest(text.as_bytes()));
        let previous: Option<String> = self
            .connection
            .query_row(
                "SELECT hash FROM notes WHERE path=? AND error=''",
                [path],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        if previous.as_deref() == Some(&hash) {
            self.connection
                .execute(
                    "UPDATE notes SET stamp=? WHERE path=?",
                    params![stamp, path],
                )
                .map_err(err)?;
            return Ok(BTreeSet::new());
        }
        let mut parsed = parse(text, path)?;
        let mut keys = self
            .metadata(path)?
            .map(|p| note_keys(path, &p))
            .unwrap_or_default();
        keys.extend(note_keys(path, &parsed));
        let references = std::mem::take(&mut parsed.references);
        let transaction = self.connection.savepoint().map_err(err)?;
        transaction.execute("INSERT INTO notes(path,title,stamp,hash,fingerprint,metadata,error) VALUES(?1,?2,?3,?4,?5,?6,'') ON CONFLICT(path) DO UPDATE SET title=excluded.title,stamp=excluded.stamp,hash=excluded.hash,fingerprint=excluded.fingerprint,metadata=excluded.metadata,error=''",params![path,parsed.title,stamp,hash,fingerprint(text),serde_json::to_string(&parsed).map_err(err)?]).map_err(err)?;
        transaction
            .execute("DELETE FROM refs WHERE source=?", [path])
            .map_err(err)?;
        transaction
            .execute("DELETE FROM edges WHERE source=?", [path])
            .map_err(err)?;
        transaction
            .execute("DELETE FROM dependencies WHERE source=?", [path])
            .map_err(err)?;
        {
            let mut insert = transaction.prepare_cached("INSERT INTO refs(source,ordinal,destination,wiki,location) VALUES(?1,?2,?3,?4,?5)").map_err(err)?;
            let mut dependency = transaction
                .prepare_cached("INSERT OR IGNORE INTO dependencies VALUES(?1,?2)")
                .map_err(err)?;
            for (i, reference) in references.iter().enumerate() {
                insert
                    .execute(params![
                        path,
                        i as i64,
                        reference.destination,
                        reference.wiki,
                        serde_json::to_string(reference).map_err(err)?
                    ])
                    .map_err(err)?;
                for key in reference_keys(
                    path,
                    &self
                        .catalog
                        .scoped_destination(path, &reference.destination, reference.wiki),
                    reference.wiki,
                ) {
                    dependency.execute(params![path, key]).map_err(err)?;
                }
            }
        }
        transaction.commit().map_err(err)?;
        self.catalog.insert(path.into(), &parsed);
        let mut affected = self.dependents(&keys)?;
        affected.insert(path.into());
        Ok(affected)
    }
    fn dependents(&self, keys: &[String]) -> Result<BTreeSet<String>> {
        let mut result = BTreeSet::new();
        let mut stmt = self
            .connection
            .prepare_cached("SELECT source FROM dependencies WHERE key=?")
            .map_err(err)?;
        for key in keys {
            for path in stmt
                .query_map([key], |r| r.get::<_, String>(0))
                .map_err(err)?
            {
                result.insert(path.map_err(err)?);
            }
        }
        Ok(result)
    }
    pub fn remove(&mut self, path: &str) -> Result<BTreeSet<String>> {
        let keys = self
            .metadata(path)?
            .map(|p| note_keys(path, &p))
            .unwrap_or_default();
        let affected = self.dependents(&keys)?;
        self.connection
            .execute("DELETE FROM notes WHERE path=?", [path])
            .map_err(err)?;
        self.catalog.remove(path);
        Ok(affected)
    }
    pub fn mark_error(&self, path: &str, message: &str) -> Result<()> {
        let metadata = serde_json::to_string(&Parsed::default()).map_err(err)?;
        self.connection.execute("INSERT INTO notes(path,title,stamp,hash,fingerprint,metadata,error) VALUES(?1,?1,'','','',?2,?3) ON CONFLICT(path) DO UPDATE SET error=excluded.error",params![path,metadata,message]).map_err(err)?;
        self.connection
            .execute("UPDATE meta SET value=value+1 WHERE key='generation'", [])
            .map_err(err)?;
        Ok(())
    }
    pub fn resolve_sources(&mut self, sources: &BTreeSet<String>) -> Result<usize> {
        self.resolve_sources_with(sources, &|_, _| false)
    }
    pub fn resolve_sources_with(
        &mut self,
        sources: &BTreeSet<String>,
        equivalent: &dyn Fn(&str, &str) -> bool,
    ) -> Result<usize> {
        let transaction = self.connection.savepoint().map_err(err)?;
        let mut count = 0;
        {
            let mut query = transaction
                .prepare_cached("SELECT ordinal,destination,wiki FROM refs WHERE source=?")
                .map_err(err)?;
            let mut update = transaction.prepare_cached("UPDATE refs SET target=?3,status=?4,fragment=?5,anchor_missing=?6,candidates=?7 WHERE source=?1 AND ordinal=?2").map_err(err)?;
            let mut remove_edges = transaction
                .prepare_cached("DELETE FROM edges WHERE source=?")
                .map_err(err)?;
            let mut aggregate = transaction.prepare_cached("INSERT INTO edges SELECT source,target,COUNT(*),MAX(anchor_missing) FROM refs WHERE source=? AND status='resolved' AND source<>target GROUP BY source,target").map_err(err)?;
            for source in sources {
                let rows = query
                    .query_map([source], |r| {
                        Ok((
                            r.get::<_, u32>(0)?,
                            r.get::<_, String>(1)?,
                            r.get::<_, bool>(2)?,
                        ))
                    })
                    .map_err(err)?
                    .collect::<std::result::Result<Vec<_>, _>>()
                    .map_err(err)?;
                for (ordinal, destination, wiki) in rows {
                    let r = self
                        .catalog
                        .resolve_with(source, &destination, wiki, equivalent);
                    update
                        .execute(params![
                            source,
                            ordinal,
                            r.target,
                            r.status,
                            r.fragment,
                            r.anchor_missing,
                            serde_json::to_string(&r.candidates).map_err(err)?
                        ])
                        .map_err(err)?;
                    count += 1;
                }
                remove_edges.execute([source]).map_err(err)?;
                aggregate.execute([source]).map_err(err)?;
            }
        }
        if !sources.is_empty() {
            transaction
                .execute("UPDATE meta SET value=value+1 WHERE key='generation'", [])
                .map_err(err)?;
        }
        transaction.commit().map_err(err)?;
        Ok(count)
    }
    pub fn checkpoint(&self) -> Result<()> {
        self.connection
            .execute_batch("PRAGMA wal_checkpoint(PASSIVE)")
            .map_err(err)
    }
    pub fn sqlite_version(&self) -> Result<String> {
        self.connection
            .query_row("SELECT sqlite_version()", [], |r| r.get(0))
            .map_err(err)
    }
}

fn reader(path: &Path) -> Result<Connection> {
    let c = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(err)?;
    c.busy_timeout(Duration::from_millis(500)).map_err(err)?;
    c.execute_batch("PRAGMA cache_size=-2048; BEGIN")
        .map_err(err)?;
    Ok(c)
}
fn node(row: &rusqlite::Row<'_>) -> rusqlite::Result<GraphNode> {
    let path: String = row.get(0)?;
    let json: String = row.get(2)?;
    #[derive(Default, Deserialize)]
    struct DisplayMetadata {
        #[serde(default)]
        tags: Vec<String>,
    }
    let parsed: DisplayMetadata = serde_json::from_str(&json).unwrap_or_default();
    let error: String = row.get(5)?;
    Ok(GraphNode {
        id: path.clone(),
        path: Some(path),
        title: row.get(1)?,
        tags: parsed.tags,
        incoming: row.get::<_, u32>(3)? as usize,
        outgoing: row.get::<_, u32>(4)? as usize,
        state: if error.is_empty() { "ready" } else { "stale" }.into(),
    })
}
const NODE_SELECT:&str="SELECT path,title,metadata,(SELECT COUNT(*) FROM edges WHERE target=notes.path),((SELECT COUNT(*) FROM edges WHERE source=notes.path)+(SELECT COUNT(DISTINCT destination) FROM refs WHERE source=notes.path AND status IN ('missing','ambiguous'))),error FROM notes";

pub fn snapshot(path: &Path, query: &GraphQuery) -> Result<GraphSnapshot> {
    if query.filter.len() > 256
        || query.folder.len() > 4096
        || query.tag.len() > 512
        || query.depth > 2
        || query.focus.as_ref().is_some_and(|focus| focus.len() > 4096)
    {
        return Err("图谱查询超出范围".into());
    }
    let connection = reader(path)?;
    let mut result = GraphSnapshot {
        generation: connection
            .query_row("SELECT value FROM meta WHERE key='generation'", [], |r| {
                r.get::<_, u32>(0)
            })
            .map_err(err)? as u64,
        total_notes: connection
            .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get::<_, u32>(0))
            .map_err(err)? as usize,
        total_edges: connection
            .query_row("SELECT COUNT(*) FROM edges", [], |r| r.get::<_, u32>(0))
            .map_err(err)? as usize,
        unresolved: connection
            .query_row(
                "SELECT COUNT(*) FROM refs WHERE status IN ('missing','ambiguous','blocked')",
                [],
                |r| r.get::<_, u32>(0),
            )
            .map_err(err)? as usize,
        ..Default::default()
    };
    let limit = query.limit.clamp(1, 5000);
    let filter = query.filter.to_lowercase();
    let matches = |node: &GraphNode| {
        (filter.is_empty()
            || node.title.to_lowercase().contains(&filter)
            || node.id.to_lowercase().contains(&filter))
            && (query.folder.is_empty()
                || node
                    .id
                    .starts_with(&format!("{}/", query.folder.trim_end_matches('/'))))
            && (query.tag.is_empty() || node.tags.contains(&query.tag))
            && (query.show_orphans || node.incoming + node.outgoing > 0)
    };
    let mut nodes = BTreeMap::<String, GraphNode>::new();
    if let Some(focus) = &query.focus {
        let mut frontier = BTreeSet::from([focus.clone()]);
        let mut visited = BTreeSet::new();
        let mut find = connection
            .prepare(&format!("{NODE_SELECT} WHERE path=?"))
            .map_err(err)?;
        let mut adjacent=connection.prepare("SELECT target FROM edges WHERE source=?1 UNION SELECT source FROM edges WHERE target=?1 ORDER BY 1 LIMIT 5001").map_err(err)?;
        'breadth: for depth in 0..=query.depth.max(1) {
            let mut next = BTreeSet::new();
            for path in frontier {
                if !visited.insert(path.clone()) {
                    continue;
                }
                if let Some(n) = find.query_row([&path], node).optional().map_err(err)? {
                    if path == *focus || matches(&n) {
                        if nodes.len() < limit {
                            nodes.insert(path.clone(), n);
                        } else {
                            result.truncated = true;
                            break 'breadth;
                        }
                    }
                }
                if depth < query.depth.max(1) && visited.len() <= 5000 {
                    for other in adjacent
                        .query_map([&path], |r| r.get::<_, String>(0))
                        .map_err(err)?
                    {
                        if next.len() >= 5001 {
                            result.truncated = true;
                            break;
                        }
                        next.insert(other.map_err(err)?);
                    }
                } else if depth < query.depth.max(1) {
                    result.truncated = true;
                }
            }
            frontier = next;
        }
    } else {
        let mut stmt = connection
            .prepare(&format!("{NODE_SELECT} ORDER BY path"))
            .map_err(err)?;
        for n in stmt.query_map([], node).map_err(err)? {
            let n = n.map_err(err)?;
            if matches(&n) {
                if nodes.len() == limit {
                    result.truncated = true;
                    break;
                }
                nodes.insert(n.id.clone(), n);
            }
        }
    }
    let mut edges = connection
        .prepare("SELECT target,count,anchor_missing FROM edges WHERE source=? ORDER BY target")
        .map_err(err)?;
    let mut inspected_edges = 0;
    'edges: for source in nodes.keys() {
        for edge in edges
            .query_map([source], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, u32>(1)?,
                    r.get::<_, bool>(2)?,
                ))
            })
            .map_err(err)?
        {
            let (target, count, anchor_missing) = edge.map_err(err)?;
            inspected_edges += 1;
            if inspected_edges > 250_000 {
                result.truncated = true;
                break 'edges;
            }
            if nodes.contains_key(&target) {
                if result.edges.len() >= 20_000 {
                    result.truncated = true;
                    break 'edges;
                }
                result.edges.push(GraphEdge {
                    id: fingerprint(&format!("{source}\0{target}")),
                    source: source.clone(),
                    target,
                    count: count as usize,
                    anchor_missing,
                });
            }
        }
    }
    if query.show_missing {
        let mut missing=connection.prepare("SELECT destination,status,COUNT(*) FROM refs WHERE source=? AND status IN ('missing','ambiguous') GROUP BY destination,status ORDER BY destination LIMIT 501").map_err(err)?;
        let mut ghosts = BTreeMap::new();
        'missing: for source in nodes.keys() {
            for (index, row) in missing
                .query_map([source], |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, u32>(2)?,
                    ))
                })
                .map_err(err)?
                .enumerate()
            {
                let (destination, state, count) = row.map_err(err)?;
                if index >= 500 {
                    result.truncated = true;
                    break;
                }
                if nodes.len() + ghosts.len() >= limit || result.edges.len() >= 20_000 {
                    result.truncated = true;
                    break 'missing;
                }
                let id = format!(
                    "missing:{}",
                    fingerprint(&format!("{source}\0{destination}"))
                );
                ghosts.insert(
                    id.clone(),
                    GraphNode {
                        id: id.clone(),
                        path: None,
                        title: destination,
                        tags: Vec::new(),
                        incoming: 1,
                        outgoing: 0,
                        state,
                    },
                );
                result.edges.push(GraphEdge {
                    id: fingerprint(&format!("{source}\0{id}")),
                    source: source.clone(),
                    target: id,
                    count: count as usize,
                    anchor_missing: false,
                });
            }
        }
        nodes.extend(ghosts);
    }
    result.nodes = nodes.into_values().collect();
    let mut folders = BTreeSet::new();
    let mut tags = BTreeSet::new();
    for n in &result.nodes {
        if let Some(path) = &n.path {
            if let Some((folder, _)) = path.rsplit_once('/') {
                folders.insert(folder.to_owned());
            }
        }
        tags.extend(n.tags.clone());
    }
    result.folders = folders.into_iter().collect();
    result.tags = tags.into_iter().collect();
    Ok(result)
}

pub fn references(path: &Path, note: &str, incoming: bool, offset: usize) -> Result<ReferencePage> {
    references_matching(path, note, incoming, offset, None)
}
pub fn references_matching(
    path: &Path,
    note: &str,
    incoming: bool,
    offset: usize,
    destination: Option<&str>,
) -> Result<ReferencePage> {
    if note.len() > 4096 || offset > 1_000_000 || destination.is_some_and(|s| s.len() > 4096) {
        return Err("引用查询超出范围".into());
    }
    let connection = reader(path)?;
    let field = if incoming { "target" } else { "source" };
    let total = connection
        .query_row(
            &format!(
                "SELECT COUNT(*) FROM refs WHERE {field}=?1 AND (?2 IS NULL OR destination=?2)"
            ),
            params![note, destination],
            |r| r.get::<_, u32>(0),
        )
        .map_err(err)? as usize;
    let mut stmt=connection.prepare(&format!("SELECT refs.source,target,destination,status,fragment,anchor_missing,candidates,location,notes.fingerprint FROM refs JOIN notes ON notes.path=refs.source WHERE refs.{field}=?1 AND (?3 IS NULL OR destination=?3) ORDER BY refs.source,ordinal LIMIT 50 OFFSET ?2")).map_err(err)?;
    let mut items = Vec::new();
    let mut rows = stmt
        .query(params![note, offset as i64, destination])
        .map_err(err)?;
    while let Some(r) = rows.next().map_err(err)? {
        items.push(GraphReference {
            source: r.get(0).map_err(err)?,
            target: r.get(1).map_err(err)?,
            status: r.get(3).map_err(err)?,
            fragment: r.get(4).map_err(err)?,
            anchor_missing: r.get(5).map_err(err)?,
            candidates: serde_json::from_str(&r.get::<_, String>(6).map_err(err)?).map_err(err)?,
            location: serde_json::from_str(&r.get::<_, String>(7).map_err(err)?).map_err(err)?,
            source_fingerprint: r.get(8).map_err(err)?,
        });
    }
    Ok(ReferencePage {
        items,
        total,
        offset,
    })
}

#[cfg(test)]
mod performance_regressions {
    use super::*;
    #[test]
    fn resolving_one_source_does_not_walk_every_resolved_reference() {
        let directory = tempfile::tempdir().unwrap();
        let store = Store::open(&directory.path().join("index.sqlite")).unwrap();
        store
            .connection
            .execute_batch(
                "BEGIN;
            WITH RECURSIVE n(x) AS (VALUES(0) UNION ALL SELECT x+1 FROM n WHERE x<4999)
            INSERT INTO notes SELECT 'n'||x,'','','','','{}','' FROM n;
            INSERT INTO refs(source,ordinal,destination,wiki,location,target,status)
            SELECT path,0,'target',0,'{}','n4999','resolved' FROM notes;
            COMMIT;",
            )
            .unwrap();
        let mut statement = store.connection.prepare("INSERT INTO edges SELECT source,target,COUNT(*),MAX(anchor_missing) FROM refs WHERE source=? AND status='resolved' AND source<>target GROUP BY source,target").unwrap();
        statement.execute(["n0"]).unwrap();
        assert!(
            statement.get_status(rusqlite::StatementStatus::VmStep) < 200,
            "single-source aggregation must use the covering source/status index"
        );
    }
}
