use super::*;
use block2::DynBlock;
use objc2::{define_class, msg_send, rc::Retained, sel, DefinedClass, MainThreadOnly};
use objc2_app_kit::{NSDocument, NSDocumentChangeType, NSSaveOperationType, NSSavePanel, NSWindow};
use objc2_foundation::{
    ns_string, MainThreadMarker, NSArray, NSCocoaErrorDomain, NSData, NSError, NSObjectProtocol,
    NSString, NSUserCancelledError, NSURL,
};
use std::{cell::RefCell, ffi::c_void};

struct Ivars {
    parent: Retained<NSWindow>,
    pending: Arc<Pending>,
    display: String,
    suggested: String,
    extension: String,
    selection: RefCell<Option<Result<PathBuf, String>>>,
    panel: RefCell<Option<Retained<NSSavePanel>>>,
}
define_class!(
    // SAFETY: NSDocument is main-thread-only. This subclass is a transient
    // selection proxy; all writes/autosaves are intercepted below.
    #[unsafe(super = NSDocument)]
    #[thread_kind = MainThreadOnly]
    #[ivars = Ivars]
    struct MarkLyraUntitledCloseDocument;
    unsafe impl NSObjectProtocol for MarkLyraUntitledCloseDocument {}
    impl MarkLyraUntitledCloseDocument {
        #[unsafe(method(autosavesInPlace))]
        fn autosaves_in_place() -> bool { true }
        #[unsafe(method_id(writableTypes))]
        fn writable_types() -> Retained<NSArray<NSString>> {
            NSArray::from_slice(&[ns_string!("net.daringfireball.markdown"), ns_string!("public.plain-text")])
        }
        #[unsafe(method(isNativeType:))]
        fn is_native_type(kind: &NSString) -> bool { supported_type(kind) }
        #[unsafe(method_id(windowForSheet))]
        fn window_for_sheet(&self) -> Retained<NSWindow> { self.ivars().parent.clone() }
        #[unsafe(method_id(displayName))]
        fn display_name(&self) -> Retained<NSString> { NSString::from_str(&self.ivars().display) }
        #[unsafe(method(prepareSavePanel:))]
        fn prepare_panel(&self, panel: &NSSavePanel) -> bool {
            // SAFETY: matching NSDocument selector and documented NSSavePanel.
            let accepted: bool = unsafe { msg_send![super(self), prepareSavePanel: panel] };
            // SAFETY: the borrowed live panel is retained only on this thread.
            *self.ivars().panel.borrow_mut() = unsafe { Retained::retain((panel as *const NSSavePanel).cast_mut()) };
            panel.setCanSelectHiddenExtension(true);
            panel.setAllowsOtherFileTypes(true);
            panel.setNameFieldStringValue(&NSString::from_str(&self.ivars().suggested));
            accepted
        }
        #[unsafe(method_id(fileNameExtensionForType:saveOperation:))]
        fn extension(&self, _kind: &NSString, _operation: NSSaveOperationType) -> Retained<NSString> { NSString::from_str(&self.ivars().extension) }
        #[unsafe(method(autosaveWithImplicitCancellability:completionHandler:))]
        fn autosave(&self, _cancellable: bool, callback: &DynBlock<dyn Fn(*mut NSError)>) {
            // Source and recovery are owned by the host. The proxy has no bytes
            // or file URL and never starts an implicit AppKit save.
            callback.call((std::ptr::null_mut(),));
        }
        #[unsafe(method(saveToURL:ofType:forSaveOperation:completionHandler:))]
        fn save_choice(&self, url: &NSURL, kind: &NSString, operation: NSSaveOperationType, callback: &DynBlock<dyn Fn(*mut NSError)>) {
            let result = if !self.ivars().pending.active() || operation != NSSaveOperationType::SaveAsOperation || !supported_type(kind) {
                Err("保存确认类型或窗口已失效".into())
            } else if !url.isFileURL() {
                Err("保存确认没有返回本地文件地址".into())
            } else {
                url.path().map(|value| PathBuf::from(value.to_string())).ok_or("无法读取保存确认路径".into())
            };
            *self.ivars().selection.borrow_mut() = Some(result);
            // This is only path selection. Explicit cancellation ends AppKit's
            // temporary document operation without claiming a successful write.
            // The command writes through Rust only after this delegate returns.
            let cancelled = cancellation();
            callback.call((Retained::as_ptr(&cancelled).cast_mut(),));
        }
        #[unsafe(method(dataOfType:error:))]
        fn refuse_data(&self, _kind: &NSString, error: *mut *mut NSError) -> *mut NSData {
            reject_write(error);
            std::ptr::null_mut()
        }
        #[unsafe(method(writeSafelyToURL:ofType:forSaveOperation:error:))]
        fn refuse_write(&self, _url: &NSURL, _kind: &NSString, _operation: NSSaveOperationType, error: *mut *mut NSError) -> bool {
            reject_write(error);
            false
        }
        #[unsafe(method(document:shouldClose:contextInfo:))]
        fn did_choose(&self, _document: &NSDocument, should_close: bool, _context: *mut c_void) {
            let result = match self.ivars().selection.borrow_mut().take() {
                Some(result) => result.map(Choice::Save),
                None => Ok(if should_close { Choice::Discard } else { Choice::Cancel }),
            };
            finish(&self.ivars().pending, result);
        }
    }
);
thread_local! { static DOCUMENTS: RefCell<HashMap<Uuid, Retained<MarkLyraUntitledCloseDocument>>> = RefCell::new(HashMap::new()); }

pub(super) fn begin(
    window: &WebviewWindow,
    suggested: &str,
    extension: &str,
    pending: Arc<Pending>,
) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("保存确认必须在主线程显示")?;
    if !pending.active() {
        return Err("保存确认已取消".into());
    }
    let pointer = window.ns_window().map_err(|error| error.to_string())?;
    // SAFETY: live Tauri NSWindow, retained and accessed only on this main thread.
    let parent =
        unsafe { Retained::retain(pointer.cast::<NSWindow>()) }.ok_or("保存确认窗口已关闭")?;
    if parent.attachedSheet().is_some() {
        return Err("请先完成此窗口的其他对话框".into());
    }
    let display = window.title().unwrap_or_else(|_| "未命名".into());
    let id = pending.id;
    let object = MarkLyraUntitledCloseDocument::alloc(mtm).set_ivars(Ivars {
        parent,
        pending,
        display,
        suggested: suggested.into(),
        extension: extension.into(),
        selection: RefCell::new(None),
        panel: RefCell::new(None),
    });
    // SAFETY: NSDocument's default initializer receives the allocated subclass.
    let document: Retained<MarkLyraUntitledCloseDocument> =
        unsafe { msg_send![super(object), init] };
    document.setFileType(Some(ns_string!("net.daringfireball.markdown")));
    document.updateChangeCount(NSDocumentChangeType::ChangeDone);
    DOCUMENTS.with(|documents| documents.borrow_mut().insert(id, document.clone()));
    // SAFETY: self is TLS-retained through the callback; the selector's ABI is
    // declared above and context is null. No window controller/delegate is replaced.
    unsafe {
        document.canCloseDocumentWithDelegate_shouldCloseSelector_contextInfo(
            &document,
            Some(sel!(document:shouldClose:contextInfo:)),
            std::ptr::null_mut(),
        );
    }
    Ok(())
}

pub(super) fn dismiss(id: Uuid) {
    let document = DOCUMENTS.with(|documents| documents.borrow_mut().remove(&id));
    if let Some(document) = document {
        let own_panel = document.ivars().panel.borrow_mut().take();
        if let (Some(panel), Some(sheet)) = (own_panel, document.ivars().parent.attachedSheet()) {
            let own_window: &NSWindow = &panel;
            if std::ptr::eq::<NSWindow>(&*sheet, own_window) {
                document.ivars().parent.endSheet_returnCode(own_window, 0);
            }
        }
    }
}

fn cancellation() -> Retained<NSError> {
    // SAFETY: immutable Foundation domain, correctly typed absent userInfo.
    unsafe {
        NSError::errorWithDomain_code_userInfo(NSCocoaErrorDomain, NSUserCancelledError, None)
    }
}
fn reject_write(error: *mut *mut NSError) {
    if !error.is_null() {
        // SAFETY: AppKit's declared NSError** is valid for this call. The error
        // is autoreleased as required by the Cocoa out-parameter convention.
        unsafe {
            *error = Retained::autorelease_ptr(cancellation());
        }
    }
}

fn supported_type(kind: &NSString) -> bool {
    matches!(
        kind.to_string().as_str(),
        "net.daringfireball.markdown" | "public.plain-text"
    )
}

#[cfg(test)]
mod save_choice_type_tests {
    use super::*;
    #[test]
    fn proxy_keeps_standard_save_types_without_an_os_open_class_claim() {
        for kind in ["net.daringfireball.markdown", "public.plain-text"] {
            assert!(supported_type(&NSString::from_str(kind)));
        }
        assert!(!supported_type(&NSString::from_str("public.folder")));
        // This proxy is manually allocated; associating it with OS file types
        // would divert Tauri's openURLs events into NSDocumentController.
        assert!(!include_str!("../../../Info.plist").contains("NSDocumentClass"));
    }
}
