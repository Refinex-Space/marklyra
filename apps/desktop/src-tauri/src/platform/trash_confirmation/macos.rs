use super::*;
use block2::RcBlock;
use objc2::{rc::Retained, MainThreadMarker};
use objc2_app_kit::{NSAlert, NSAlertStyle, NSWindow};
use objc2_foundation::{NSLocale, NSString};
use std::cell::RefCell;

struct Sheet {
    alert: Retained<NSAlert>,
    parent: Retained<NSWindow>,
}
thread_local! {
    static SHEETS: RefCell<HashMap<Uuid, Sheet>> = RefCell::new(HashMap::new());
}

pub(super) fn begin(
    window: &WebviewWindow,
    name: &str,
    kind: PromptKind,
    pending: Arc<Pending>,
) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("删除确认必须在主线程显示")?;
    if !pending.active() {
        return Err("删除确认已过期".into());
    }
    let pointer = window.ns_window().map_err(|error| error.to_string())?;
    // SAFETY: Tauri's live NSWindow is obtained and retained only on the main
    // thread. It remains main-thread-local for the sheet lifecycle.
    let parent =
        unsafe { Retained::retain(pointer.cast::<NSWindow>()) }.ok_or("删除确认窗口已关闭")?;
    if parent.attachedSheet().is_some() {
        return Err("请先完成此窗口的其他对话框".into());
    }
    let language = NSLocale::preferredLanguages()
        .firstObject()
        .map(|value| value.to_string());
    let chinese = language
        .as_deref()
        .is_some_and(|value| value.starts_with("zh"));
    let traditional = language.as_deref().is_some_and(|value| {
        value.contains("Hant") || value.contains("TW") || value.contains("HK")
    });
    let (question, detail, suppression, ok, cancel) = if traditional {
        (
            format!("您確定要刪除 {name}?"),
            "您可以從垃圾桶中復原。",
            "不再顯示",
            "確定",
            "取消",
        )
    } else if chinese {
        (
            format!("是否要删除 {name}?"),
            "您可以从回收站恢复文件。",
            "不再显示",
            "确定",
            "取消",
        )
    } else {
        (
            format!("Are you sure you want to delete {name}?"),
            "You can restore from the Trash.",
            "Do not show this again",
            "OK",
            "Cancel",
        )
    };
    let (question, detail, suppression, labels) = match kind {
        PromptKind::Trash => (
            question,
            detail.to_owned(),
            Some(suppression),
            vec![ok, cancel],
        ),
        PromptKind::Move if traditional => (
            format!("確定要移動 {name} 嗎？"),
            String::new(),
            Some("不再顯示"),
            vec!["是", "取消"],
        ),
        PromptKind::Move if chinese => (
            format!("确定要移动 {name} 吗？"),
            String::new(),
            Some("不再显示"),
            vec!["是", "取消"],
        ),
        PromptKind::Move => (
            format!("Are you sure you want to move {name}?"),
            String::new(),
            Some("Do not show this again"),
            vec!["Yes", "Cancel"],
        ),
        PromptKind::MoveConflict if traditional => (
            format!("目的位置已有名為「{name}」的項目。"),
            "取代會保留原項目以供檔案操作復原。".into(),
            None,
            vec!["保留兩者", "取代", "取消"],
        ),
        PromptKind::MoveConflict if chinese => (
            format!("目标位置已存在名为“{name}”的项目。"),
            "替换会保留原项目，供文件操作撤销恢复。".into(),
            None,
            vec!["保留两者", "替换", "取消"],
        ),
        PromptKind::MoveConflict => (
            format!("An item named {name} already exists at the destination."),
            "The replaced item is retained for file Undo.".into(),
            None,
            vec!["Keep Both", "Replace", "Cancel"],
        ),
    };
    let alert = NSAlert::new(mtm);
    // The runtime original uses integer style 1 (Informational).
    alert.setAlertStyle(NSAlertStyle::Informational);
    alert.setMessageText(&NSString::from_str(&question));
    alert.setInformativeText(&NSString::from_str(&detail));
    for (index, label) in labels.iter().enumerate() {
        let button = alert.addButtonWithTitle(&NSString::from_str(label));
        if index == 0 {
            button.setKeyEquivalent(&NSString::from_str("\r"));
        }
        if index + 1 == labels.len() {
            button.setKeyEquivalent(&NSString::from_str("\u{1b}"));
        }
    }
    alert.setShowsSuppressionButton(suppression.is_some());
    if let (Some(button), Some(title)) = (alert.suppressionButton(), suppression) {
        button.setTitle(&NSString::from_str(title));
        button.setState(0);
    }
    let count = labels.len();
    let id = pending.id;
    let completion = RcBlock::new(move |response: isize| {
        let sheet = SHEETS.with(|sheets| sheets.borrow_mut().remove(&id));
        let checked = sheet
            .as_ref()
            .and_then(|sheet| sheet.alert.suppressionButton())
            .is_some_and(|button| button.state() == 1);
        let selection = usize::try_from(response - 1000)
            .ok()
            .filter(|index| *index < count)
            .unwrap_or(count - 1) as u8;
        finish(
            &pending,
            Ok(TrashConfirmation {
                confirmed: selection == 0,
                suppress_future: selection == 0 && checked,
                selection,
            }),
        );
    });
    SHEETS.with(|sheets| {
        sheets.borrow_mut().insert(
            id,
            Sheet {
                alert: alert.clone(),
                parent: parent.clone(),
            },
        )
    });
    alert.beginSheetModalForWindow_completionHandler(&parent, Some(&completion));
    Ok(())
}

pub(super) fn dismiss(id: Uuid) {
    let sheet = SHEETS.with(|sheets| sheets.borrow_mut().remove(&id));
    if let Some(sheet) = sheet {
        // Removing the TLS entry before ending avoids a reentrant RefCell borrow
        // when AppKit invokes completion synchronously during cancellation.
        let window = sheet.alert.window();
        if window
            .sheetParent()
            .is_some_and(|parent| std::ptr::eq::<NSWindow>(&*parent, &*sheet.parent))
        {
            sheet.parent.endSheet_returnCode(&window, 1001);
        }
    }
}
