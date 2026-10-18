//! Public WKWebView/AppKit printing, scoped to an immutable preview window.
use super::print_options::{check_printable_area, PrintLayout};
use objc2::{define_class, msg_send, rc::Retained, sel, DefinedClass, MainThreadOnly};
use objc2_app_kit::{NSPrintInfo, NSPrintOperation, NSWindow};
use objc2_foundation::{MainThreadMarker, NSCopying, NSObject, NSObjectProtocol, NSSize, NSString};
use std::{cell::RefCell, collections::HashMap, ffi::c_void};
use tauri::WebviewWindow;

struct Ivars {
    label: String,
}
define_class!(
    // SAFETY: the delegate only receives AppKit's documented completion method,
    // and is retained on the main thread for the whole print operation.
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[ivars = Ivars]
    struct MarkLyraPrintDelegate;
    unsafe impl NSObjectProtocol for MarkLyraPrintDelegate {}
    impl MarkLyraPrintDelegate {
        #[unsafe(method(printOperation:didRun:contextInfo:))]
        fn did_run(&self, operation: &NSPrintOperation, completed: bool, _context: *mut c_void) {
            // AppKit's false result includes cancellation and failure. Do not
            // label it as a successful file write, nor show an error on cancel.
            eprintln!("Print operation ended for {} (AppKit completed={completed})", self.ivars().label);
            // SAFETY: both borrowed objects are live for this AppKit callback.
            // Hold them across session removal, then release on method exit.
            let _receiver = unsafe { Retained::retain((self as *const Self).cast_mut()) };
            let _operation = unsafe { Retained::retain((operation as *const NSPrintOperation).cast_mut()) };
            SESSIONS.with(|sessions| sessions.borrow_mut().remove(&self.ivars().label));
        }
    }
);

struct PrintSession {
    _operation: Retained<NSPrintOperation>,
    _delegate: Retained<MarkLyraPrintDelegate>,
    parent: Retained<NSWindow>,
    sheet: Option<Retained<NSWindow>>,
}
thread_local! {
    static SESSIONS: RefCell<HashMap<String, PrintSession>> = RefCell::new(HashMap::new());
}

const POINTS_PER_MM: f64 = 72.0 / 25.4;

pub(super) fn begin(
    window: &WebviewWindow,
    pointer: *mut c_void,
    layout: PrintLayout,
) -> Result<(), String> {
    let mtm = MainThreadMarker::new().ok_or("打印面板必须在主线程显示")?;
    if SESSIONS.with(|sessions| sessions.borrow().contains_key(window.label()))
        || NSPrintOperation::currentOperation(mtm).is_some()
    {
        return Err("请先完成或取消当前打印面板".into());
    }
    // SAFETY: Tauri dispatches this live WKWebView pointer on its main thread.
    let view = unsafe { pointer.cast::<objc2::runtime::AnyObject>().as_ref() }
        .ok_or("打印预览视图已关闭")?;
    let supported: bool =
        unsafe { msg_send![view, respondsToSelector: sel!(printOperationWithPrintInfo:)] };
    if !supported {
        return Err("此 macOS 版本不支持 WKWebView 原生打印".into());
    }
    // SAFETY: WKWebView is an NSView; its documented window property is retained
    // only for this setup. No original application's object is touched.
    let parent: Option<Retained<NSWindow>> = unsafe { msg_send![view, window] };
    let parent = parent.ok_or("打印预览窗口已关闭")?;
    if parent.attachedSheet().is_some() {
        return Err("请先完成此预览窗口的其他对话框".into());
    }
    // Wry's generic print() mutates sharedPrintInfo. A private copy ensures a
    // cancelled preview cannot change another preview's geometry or system state.
    let info = NSPrintInfo::sharedPrintInfo().copy();
    if let Some([width, height]) = layout.paper_mm {
        info.setPaperSize(NSSize::new(width * POINTS_PER_MM, height * POINTS_PER_MM));
    }
    if let Some(margins) = layout.margins_mm {
        let paper = info.paperSize();
        check_printable_area(
            paper.width / POINTS_PER_MM,
            paper.height / POINTS_PER_MM,
            margins,
        )?;
        info.setTopMargin(margins.top * POINTS_PER_MM);
        info.setRightMargin(margins.right * POINTS_PER_MM);
        info.setBottomMargin(margins.bottom * POINTS_PER_MM);
        info.setLeftMargin(margins.left * POINTS_PER_MM);
    }
    // SAFETY: public macOS 11+ WKWebView selector, checked above. AppKit returns
    // a retained operation bound to this scriptless, self-contained snapshot.
    let operation: Option<Retained<NSPrintOperation>> =
        unsafe { msg_send![view, printOperationWithPrintInfo: &*info] };
    let operation = operation.ok_or("WKWebView未能创建打印操作，请重新打开预览后重试")?;
    operation.setCanSpawnSeparateThread(true);
    operation.setShowsPrintPanel(true);
    operation.setShowsProgressPanel(true);
    operation.setJobTitle(Some(&NSString::from_str(
        &window.title().unwrap_or_else(|_| "打印预览".into()),
    )));
    let delegate = MarkLyraPrintDelegate::alloc(mtm).set_ivars(Ivars {
        label: window.label().into(),
    });
    // SAFETY: NSObject's default initializer receives the allocated subclass.
    let delegate: Retained<MarkLyraPrintDelegate> = unsafe { msg_send![super(delegate), init] };
    SESSIONS.with(|sessions| {
        sessions.borrow_mut().insert(
            window.label().into(),
            PrintSession {
                _operation: operation.clone(),
                _delegate: delegate.clone(),
                parent: parent.clone(),
                sheet: None,
            },
        );
    });
    // SAFETY: delegate and operation stay retained until the declared callback.
    // This only opens a system panel: printing or saving PDF requires its user's
    // explicit action. The editor remains available while the sheet is open.
    unsafe {
        operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
            &parent,
            Some(&delegate),
            Some(sel!(printOperation:didRun:contextInfo:)),
            std::ptr::null_mut(),
        );
    }
    // Only remember the sheet introduced by this operation. Destruction never
    // ends an unrelated panel which may have appeared later on another window.
    let sheet = parent.attachedSheet();
    SESSIONS.with(|sessions| {
        if let Some(session) = sessions.borrow_mut().get_mut(window.label()) {
            session.sheet = sheet;
        }
    });
    Ok(())
}

pub(super) fn dismiss(label: &str) {
    let own_sheet = SESSIONS.with(|sessions| {
        sessions.borrow().get(label).and_then(|session| {
            session
                .sheet
                .as_ref()
                .map(|sheet| (session.parent.clone(), sheet.clone()))
        })
    });
    if let Some((parent, sheet)) = own_sheet {
        if parent
            .attachedSheet()
            .is_some_and(|attached| std::ptr::eq::<NSWindow>(&*attached, &*sheet))
        {
            // NSModalResponseCancel. Retain the operation/delegate until its
            // completion callback even when the owning editor is destroyed.
            parent.endSheet_returnCode(&sheet, 0);
        }
    }
}
