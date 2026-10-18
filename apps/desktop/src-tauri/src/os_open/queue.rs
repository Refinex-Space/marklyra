use document_service::{DocumentPayload, DocumentService};
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};
pub(super) const MAX_INPUTS: usize = 64;
const CLAIM_LIFETIME: Duration = Duration::from_secs(120);
#[derive(Clone, Debug)]
pub(crate) struct Receipt {
    pub path: PathBuf,
    pub entity: Arc<same_file::Handle>,
    parent: Arc<same_file::Handle>,
    pub directory: bool,
}
pub(super) fn validate_path(path: &Path) -> Result<(), String> {
    if !path.is_absolute()
        || path.as_os_str().len() > 4096
        || path.to_str().is_none_or(|value| {
            value
                .chars()
                .any(|value| value <= '\u{1f}' || value == '\u{7f}')
        })
    {
        return Err("系统文件路径必须是无控制字符的本机绝对路径".into());
    }
    Ok(())
}
impl Receipt {
    pub fn capture(path: PathBuf) -> Result<Self, String> {
        validate_path(&path)?;
        let path = std::fs::canonicalize(path).map_err(|_| "系统打开项目不存在或不可访问")?;
        validate_path(&path)?;
        let metadata = std::fs::metadata(&path).map_err(|_| "无法读取系统打开项目")?;
        if !metadata.is_file() && !metadata.is_dir() {
            return Err("系统打开只支持普通文稿和目录".into());
        }
        let directory = metadata.is_dir();
        if !directory {
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if !file_index::TEXT_EXTENSIONS
                .iter()
                .any(|known| extension.eq_ignore_ascii_case(known))
            {
                return Err("此系统打开格式尚不支持直接编辑，请使用导入菜单".into());
            }
        }
        let entity =
            Arc::new(same_file::Handle::from_path(&path).map_err(|_| "无法确认系统打开实体")?);
        let parent = Arc::new(
            same_file::Handle::from_path(path.parent().unwrap_or(&path))
                .map_err(|_| "无法确认系统打开父目录")?,
        );
        let receipt = Self {
            path,
            entity,
            parent,
            directory,
        };
        receipt.verify()?;
        Ok(receipt)
    }
    pub fn verify(&self) -> Result<(), String> {
        if same_file::Handle::from_path(&self.path).ok().as_ref() != Some(self.entity.as_ref())
            || same_file::Handle::from_path(self.path.parent().unwrap_or(&self.path))
                .ok()
                .as_ref()
                != Some(self.parent.as_ref())
        {
            return Err("系统打开项目或父目录已改变，请重新打开".into());
        }
        Ok(())
    }
    pub fn same_entity(&self, other: &Self) -> bool {
        self.directory == other.directory && self.entity == other.entity
    }
    pub fn open(&self, documents: &mut DocumentService) -> Result<DocumentPayload, String> {
        self.verify()?;
        let opened = documents
            .open_authorized_entity_in_parent(&self.path, &self.entity, &self.parent)
            .map_err(|error| error.to_string())?;
        if let Err(error) = self.verify() {
            documents.close(&opened.id);
            return Err(error);
        }
        Ok(opened)
    }
    pub fn target(&self) -> Result<crate::startup::StartupTarget, String> {
        self.verify()?;
        let target = if self.directory {
            let mut registry = file_index::WorkspaceRegistry::default();
            let selected = registry
                .select_authorized_entity(&self.path, &self.entity)
                .map_err(|error| error.to_string())?;
            let bookmark = registry
                .get(&selected.id)
                .and_then(|workspace| workspace.bookmark())
                .map_err(|error| error.to_string())?;
            crate::startup::StartupTarget::from_workspace(bookmark)?
        } else {
            let mut documents = DocumentService::new();
            let opened = self.open(&mut documents)?;
            let bookmark = documents
                .bookmark(&opened.id)
                .map_err(|error| error.to_string())?;
            crate::startup::StartupTarget::default().with_opened_document(bookmark)
        };
        self.verify()?;
        Ok(target.with_os_open_receipt(self.clone()))
    }
}
struct Claim {
    token: String,
    owner: String,
    receipt: Receipt,
    candidate: Option<String>,
    started: Instant,
    completing: bool,
}
#[derive(Default)]
pub(super) struct OpenQueue {
    pending: VecDeque<Receipt>,
    claim: Option<Claim>,
    warnings: VecDeque<String>,
    completed: VecDeque<(String, String)>,
}
impl OpenQueue {
    pub fn warn(&mut self, message: String) {
        if self.warnings.len() < 8 {
            self.warnings.push_back(message);
        }
    }
    pub fn next_warning(&mut self) -> Option<String> {
        self.warnings.pop_front()
    }
    pub fn push(&mut self, receipt: Receipt) {
        if self.pending.iter().any(|other| receipt.same_entity(other))
            || self
                .claim
                .as_ref()
                .is_some_and(|other| receipt.same_entity(&other.receipt))
        {
            return;
        }
        if self.pending.len() + usize::from(self.claim.is_some()) >= MAX_INPUTS {
            self.warn("一次最多排队64个系统打开项目，其余项目未打开，请分批重试".into());
        } else {
            self.pending.push_back(receipt);
        }
    }
    pub fn claim(&mut self, owner: &str) -> Option<(String, Receipt)> {
        if self.claim.is_some() {
            return None;
        }
        let receipt = self.pending.pop_front()?;
        let token = uuid::Uuid::new_v4().to_string();
        self.claim = Some(Claim {
            token: token.clone(),
            owner: owner.into(),
            receipt: receipt.clone(),
            candidate: None,
            started: Instant::now(),
            completing: false,
        });
        Some((token, receipt))
    }
    pub fn set_candidate(&mut self, owner: &str, token: &str, id: String) -> bool {
        if let Some(claim) = self
            .claim
            .as_mut()
            .filter(|claim| claim.owner == owner && claim.token == token && !claim.completing)
        {
            claim.candidate = Some(id);
            true
        } else {
            false
        }
    }
    pub fn completion(
        &mut self,
        owner: &str,
        token: &str,
    ) -> Result<Option<(Receipt, Option<String>)>, String> {
        if self
            .completed
            .iter()
            .any(|(label, completed)| label == owner && completed == token)
        {
            return Ok(None);
        }
        let claim = self
            .claim
            .as_mut()
            .filter(|claim| claim.owner == owner && claim.token == token)
            .ok_or("系统打开回执不属于当前窗口或已失效")?;
        if claim.completing {
            return Err("系统打开回执正在完成".into());
        }
        claim.completing = true;
        Ok(Some((claim.receipt.clone(), claim.candidate.clone())))
    }
    pub fn finish(&mut self, owner: &str, token: &str) {
        if self
            .claim
            .as_ref()
            .is_some_and(|claim| claim.owner == owner && claim.token == token)
        {
            self.claim = None;
            self.completed.push_back((owner.into(), token.into()));
            if self.completed.len() > MAX_INPUTS {
                self.completed.pop_front();
            }
        }
    }
    pub fn release_stale(&mut self) {
        if self
            .claim
            .as_ref()
            .is_some_and(|claim| !claim.completing && claim.started.elapsed() >= CLAIM_LIFETIME)
        {
            if let Some(claim) = self.claim.take() {
                if claim.candidate.is_none() {
                    self.pending.push_front(claim.receipt);
                } else {
                    // A lost ACK must not replay content already loaded by
                    // that window or block all later OS events indefinitely.
                    self.completed.push_back((claim.owner, claim.token));
                    if self.completed.len() > MAX_INPUTS {
                        self.completed.pop_front();
                    }
                    self.warn("系统打开确认已超时；原窗口内容保留，本次项目未自动重放".into());
                }
            }
        }
    }
    #[cfg(test)]
    pub fn age_claim(&mut self, age: Duration) {
        if let Some(claim) = self.claim.as_mut() {
            claim.started = Instant::now() - age;
        }
    }
    pub fn release_owner(&mut self, owner: &str) {
        if self
            .claim
            .as_ref()
            .is_some_and(|claim| claim.owner == owner && !claim.completing)
        {
            if let Some(claim) = self.claim.take() {
                self.pending.push_front(claim.receipt);
            }
        }
    }
}
