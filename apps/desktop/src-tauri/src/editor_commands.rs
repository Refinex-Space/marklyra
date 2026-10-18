//! Window-local issuance order for native editor menu actions. A fence only
//! acknowledges issuance; the parent must still await SDK completion through it.
use crate::window_services::WindowServices;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use uuid::Uuid;

const MAX_SAFE_SEQUENCE: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct EditorCommandSnapshot {
    context: String,
    issued: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Owner {
    // Changes with each new context, including A -> B -> A, and window lifetime.
    token: Uuid,
    context: String,
}

#[derive(Default)]
pub(crate) struct EditorCommandState {
    owner: Option<Owner>,
    issued: u64,
    faulted: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
struct EditorCommand {
    context: String,
    sequence: u64,
    action: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(untagged)]
enum MenuPayload {
    Legacy(String),
    Editor(EditorCommand),
}

impl EditorCommandState {
    pub(crate) fn validate_menu_context(&self, context: &str) -> Result<(), String> {
        self.owner(context).map(|_| ())
    }
    fn register(&mut self, context: &str) -> Result<EditorCommandSnapshot, String> {
        validate_context(context)?;
        if self
            .owner
            .as_ref()
            .is_none_or(|owner| owner.context != context)
        {
            self.owner = Some(Owner {
                token: Uuid::new_v4(),
                context: context.to_owned(),
            });
            self.issued = 0;
            self.faulted = false;
        }
        self.snapshot(context)
    }

    fn owner(&self, context: &str) -> Result<Owner, String> {
        validate_context(context)?;
        let owner = self.owner.as_ref().ok_or("编辑命令上下文尚未注册")?;
        if owner.context != context {
            return Err("编辑命令上下文已更换".into());
        }
        if self.faulted {
            return Err("原生编辑命令投递未确认，请重新创建编辑器".into());
        }
        Ok(owner.clone())
    }

    fn snapshot(&self, context: &str) -> Result<EditorCommandSnapshot, String> {
        let owner = self.owner(context)?;
        Ok(EditorCommandSnapshot {
            context: owner.context,
            issued: self.issued,
        })
    }

    fn fence(&self, expected: &Owner) -> Result<EditorCommandSnapshot, String> {
        if self.owner.as_ref() != Some(expected) {
            return Err("编辑命令上下文或窗口已更换".into());
        }
        self.snapshot(&expected.context)
    }

    fn issue(&mut self, action: &str) -> Result<Option<(Owner, EditorCommand)>, String> {
        let Some(owner) = self.owner.as_ref() else {
            return Ok(None);
        };
        let owner = self.owner(&owner.context)?;
        if self.issued >= MAX_SAFE_SEQUENCE {
            self.faulted = true;
            return Err("原生编辑命令序号已达上限，请重新创建编辑器".into());
        }
        self.issued += 1;
        Ok(Some((
            owner.clone(),
            EditorCommand {
                context: owner.context,
                sequence: self.issued,
                action: action.to_owned(),
            },
        )))
    }

    fn delivery_failed(&mut self, expected: &Owner, sequence: u64) {
        if self.owner.as_ref() == Some(expected) && sequence <= self.issued {
            self.faulted = true;
        }
    }
}

fn validate_context(context: &str) -> Result<(), String> {
    if Uuid::parse_str(context).is_ok_and(|id| id.to_string() == context) {
        Ok(())
    } else {
        Err("编辑命令上下文必须为标准UUID".into())
    }
}

pub(crate) fn is_editor_action(action: &str) -> bool {
    matches!(
        action,
        "undo"
            | "redo"
            | "heading:0"
            | "heading:1"
            | "heading:2"
            | "heading:3"
            | "heading:4"
            | "heading:5"
            | "heading:6"
            | "format:strong"
            | "format:em"
            | "format:del"
            | "format:code"
            | "format:underline"
            | "format:highlight"
            | "format:subscript"
            | "format:superscript"
            | "format:inline_math"
            | "format:link"
            | "format:image"
            | "list:ul"
            | "list:ol"
            | "list:tasklist"
            | "list:blockquote"
            | "code-block"
            | "math-block"
            | "insert-table"
            | "hr"
            | "indent"
            | "outdent"
            | "find"
            | "replace"
            | "view:source"
            | "view:focus"
            | "view:typewriter"
    )
}

fn emit_with(
    services: &WindowServices,
    label: &str,
    action: &str,
    emit: impl FnOnce(MenuPayload) -> Result<(), String>,
) -> Result<(), String> {
    // Never retain the window-services lock while invoking an event listener.
    let issued = services.with_editor_commands(label, |state| {
        if is_editor_action(action) {
            state.issue(action)
        } else {
            Ok(None)
        }
    })?;
    if let Some((owner, command)) = issued {
        let sequence = command.sequence;
        let result = emit(MenuPayload::Editor(command));
        if result.is_err() {
            services.with_editor_commands(label, |state| {
                state.delivery_failed(&owner, sequence);
                Ok(())
            })?;
        }
        result
    } else {
        emit(MenuPayload::Legacy(action.to_owned()))
    }
}

pub(crate) fn emit_menu_action<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    action: &str,
) -> Result<(), String> {
    emit_with(&app.state::<WindowServices>(), label, action, |payload| {
        crate::windows::emit_to_editor(app, label, "menu-action", payload)
    })
}

fn register<R: Runtime>(
    window: &WebviewWindow<R>,
    context: &str,
) -> Result<EditorCommandSnapshot, String> {
    window
        .state::<WindowServices>()
        .with_editor_commands(window.label(), |state| state.register(context))
}

#[tauri::command]
pub fn register_editor_command_context(
    window: WebviewWindow,
    context: String,
) -> Result<EditorCommandSnapshot, String> {
    register(&window, &context)
}

type FenceReceiver = tauri::async_runtime::Receiver<Result<EditorCommandSnapshot, String>>;

async fn enqueue_fence<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    owner: Owner,
) -> Result<FenceReceiver, String> {
    // Wry handles run_on_main_thread inline when already on main. This worker
    // hop is essential: only the proxy task participates in native menu FIFO.
    tauri::async_runtime::spawn_blocking(move || {
        let (sender, receiver) = tauri::async_runtime::channel(1);
        let current_app = app.clone();
        app.run_on_main_thread(move || {
            let result = current_app
                .state::<WindowServices>()
                .with_editor_commands(&label, |state| state.fence(&owner));
            let _ = sender.try_send(result);
        })
        .map_err(|error| format!("原生编辑命令屏障投递失败: {error}"))?;
        Ok(receiver)
    })
    .await
    .map_err(|_| "原生编辑命令屏障任务未完成".to_owned())?
}

async fn fence<R: Runtime>(
    window: WebviewWindow<R>,
    context: String,
) -> Result<EditorCommandSnapshot, String> {
    let owner = window
        .state::<WindowServices>()
        .with_editor_commands(window.label(), |state| state.owner(&context))?;
    let mut receiver = enqueue_fence(
        window.app_handle().clone(),
        window.label().to_owned(),
        owner,
    )
    .await?;
    receiver
        .recv()
        .await
        .ok_or("原生编辑命令屏障未确认".to_owned())?
}

#[tauri::command]
pub async fn editor_command_fence(
    window: WebviewWindow,
    context: String,
) -> Result<EditorCommandSnapshot, String> {
    fence(window, context).await
}

#[cfg(test)]
mod tests;
