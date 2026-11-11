//! Task tools for in-app agents. The logic is shared with the `marklyra` command line in
//! `task_store::tools`; this side adds what only the app knows: the agent's authorized
//! workspace, the store lock, approval (in `mcp.rs`) and the agent's name on each write.
use super::process::AgentProcess;
use serde_json::Value;
use std::sync::Arc;
pub(super) use task_store::tools::{is_task_tool, is_write, selection, Plan};
use tauri::AppHandle;

pub(super) fn schemas() -> Vec<Value> {
    task_store::tools::schemas(true)
}

fn workspace(process: &AgentProcess) -> Result<&Arc<file_index::Workspace>, String> {
    process
        .workspace
        .as_ref()
        .ok_or_else(|| "请先在 MarkLyra 中打开文件夹".to_string())
}

pub(super) fn read(
    app: &AppHandle,
    process: &AgentProcess,
    name: &str,
    args: &Value,
) -> Result<Value, String> {
    let (today, now) = crate::tasks::local_today();
    crate::tasks::with_store(app, workspace(process)?, false, |store| {
        Ok((
            task_store::tools::read(store, name, args, &today, now)?,
            false,
        ))
    })
}

/// Validates a write and builds its approval preview. Nothing is written, not even the task
/// folder: agents add tasks only to folders that already have them.
pub(super) fn plan(
    app: &AppHandle,
    process: &AgentProcess,
    name: &str,
    args: &Value,
) -> Result<Plan, String> {
    if !crate::tasks::has_store(app, workspace(process)?)? {
        return Err(
            "这个文件夹还没有任务。请先在 MarkLyra 的任务视图中新建一个任务或项目，再让智能体继续"
                .into(),
        );
    }
    crate::tasks::with_store(app, workspace(process)?, false, |store| {
        Ok((task_store::tools::plan(store, name, args)?, false))
    })
}

/// Applies the ticked items on behalf of the agent; returns the outcome and undo receipts.
pub(super) fn execute(
    app: &AppHandle,
    process: &AgentProcess,
    plan: &Plan,
    selected: &[usize],
) -> Result<(Value, Vec<Value>), String> {
    let actor = format!("ai:{}", process.profile.agent_id);
    crate::tasks::with_store(app, workspace(process)?, false, |store| {
        let (outcome, receipts, wrote) = task_store::tools::execute(store, plan, selected, &actor)?;
        Ok(((outcome, receipts), wrote))
    })
}
