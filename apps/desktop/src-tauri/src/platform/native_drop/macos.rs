use crate::clipboard::native_input::{complete_drop, prepare_drop, InputModifiers, InputPosition};
use objc2::{
    encode::Encoding,
    msg_send,
    runtime::{AnyClass, AnyObject, Bool, Imp, Method, Sel},
    sel, Encode,
};
use objc2_app_kit::{NSEvent, NSEventModifierFlags, NSPasteboard, NSView};
use objc2_foundation::{ns_string, MainThreadMarker, NSArray, NSPoint, NSString};
use serde::Serialize;
use std::{cell::RefCell, collections::HashMap, ffi::c_void, sync::OnceLock};
use tauri::{Emitter, WebviewWindow};

thread_local! {
    static WINDOWS: RefCell<HashMap<usize, WebviewWindow>> = RefCell::default();
}
struct Hooks {
    class: &'static AnyClass,
    entered: Imp,
    updated: Imp,
    dropped: Imp,
}
static HOOKS: OnceLock<Hooks> = OnceLock::new();

fn checked_method(
    class: &'static AnyClass,
    selector: Sel,
    returns: Encoding,
) -> Result<&'static Method, String> {
    // Only methods owned by Wry may change. instance_method alone could return
    // an inherited WKWebView method and would mutate a system framework class.
    let method = class
        .instance_methods()
        .iter()
        .copied()
        .find(|method| method.name() == selector)
        .ok_or("此Wry版本没有自有的文件拖放方法")?;
    let checked = |index, expected: Encoding| {
        method
            .argument_type(index)
            .and_then(|value| {
                value
                    .to_str()
                    .ok()
                    .map(|value| expected.equivalent_to_str(value))
            })
            .unwrap_or(false)
    };
    if method.arguments_count() != 3
        || !returns.equivalent_to_str(
            method
                .return_type()
                .to_str()
                .map_err(|_| "文件拖放返回类型无效")?,
        )
        || !checked(0, Encoding::Object)
        || !checked(1, Encoding::Sel)
        || !checked(2, Encoding::Object)
    {
        return Err("此Wry版本的文件拖放方法签名不兼容".into());
    }
    Ok(method)
}

#[derive(Clone, Copy, Serialize)]
struct Viewport {
    width: f64,
    height: f64,
}

pub(super) fn install(window: &WebviewWindow, pointer: *mut c_void) -> Result<bool, String> {
    MainThreadMarker::new().ok_or("文件拖放需要 AppKit 主线程")?;
    // SAFETY: Tauri supplies this live WKWebView on its main-thread dispatcher.
    let view = unsafe { pointer.cast::<AnyObject>().as_ref() }.ok_or("编辑视图不存在")?;
    let mut ancestor = Some(view.class());
    let mut wry = None;
    while let Some(class) = ancestor {
        // objc2's default class name includes module_path and crate version.
        // This exact value is checked against the locked Wry source/artifact;
        // unknown future versions fail closed without touching a WK superclass.
        if class.name() == c"wry::wkwebview::class::wry_web_view::WryWebView0.57.0" {
            wry = Some(class);
            break;
        }
        ancestor = class.superclass();
    }
    let class = wry.ok_or("编辑视图不是已核对的Wry类型")?;
    let first = checked_method(class, sel!(draggingEntered:), usize::ENCODING)?;
    let second = checked_method(class, sel!(draggingUpdated:), usize::ENCODING)?;
    let third = checked_method(class, sel!(performDragOperation:), Bool::ENCODING)?;
    // SAFETY: Exact validated NSDraggingDestination signatures, installed once
    // on the process-owned Wry class. No object's ISA or layout is changed.
    let (first_imp, second_imp, third_imp): (Imp, Imp, Imp) = unsafe {
        (
            std::mem::transmute::<extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> usize, Imp>(
                entered,
            ),
            std::mem::transmute::<extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> usize, Imp>(
                updated,
            ),
            std::mem::transmute::<extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> Bool, Imp>(
                dropped,
            ),
        )
    };
    if let Some(hooks) = HOOKS.get() {
        if hooks.class != class
            || first.implementation() as usize != first_imp as usize
            || second.implementation() as usize != second_imp as usize
            || third.implementation() as usize != third_imp as usize
        {
            return Err("文件拖放入口已由其他处理器更换".into());
        }
    } else {
        let hooks = unsafe {
            Hooks {
                class,
                entered: first.set_implementation(first_imp),
                updated: second.set_implementation(second_imp),
                dropped: third.set_implementation(third_imp),
            }
        };
        HOOKS.set(hooks).map_err(|_| "文件拖放入口已初始化")?;
    }
    WINDOWS.with(|windows| {
        windows
            .borrow_mut()
            .insert(pointer as usize, window.clone());
    });
    // WK already registers rich/text drag formats. Add file URL/legacy Finder
    // types without removing any of its existing registrations.
    let native = unsafe { &*pointer.cast::<NSView>() };
    let mut types: Vec<_> = native.registeredDraggedTypes().iter().collect();
    for name in ["public.file-url", "NSFilenamesPboardType"] {
        let value = objc2_foundation::NSString::from_str(name);
        if !types.contains(&value) {
            types.push(value);
        }
    }
    native.registerForDraggedTypes(&objc2_foundation::NSArray::from_retained_slice(&types));
    Ok(true)
}

pub(super) fn release(label: &str) {
    WINDOWS.with(|windows| {
        windows
            .borrow_mut()
            .retain(|_, window| window.label() != label)
    });
}

fn paths(sender: &AnyObject) -> Result<Vec<std::path::PathBuf>, String> {
    // SAFETY: Called only by AppKit with an NSDraggingInfo sender. The returned
    // pasteboard is borrowed within the synchronous drag callback, never stored.
    let board: &NSPasteboard = unsafe { msg_send![sender, draggingPasteboard] };
    let version = board.changeCount();
    if crate::clipboard::macos::drop_has_rich_content(board)? {
        if board.changeCount() != version {
            return Err("系统文件拖放内容已更换".into());
        }
        return Ok(Vec::new());
    }
    let files = crate::clipboard::macos::read_file_urls(board)?;
    if !files.is_empty() {
        if board.changeCount() != version {
            return Err("系统文件拖放内容已更换".into());
        }
        return Ok(files);
    }
    let Some(values) = board.propertyListForType(ns_string!("NSFilenamesPboardType")) else {
        if board.changeCount() != version {
            return Err("系统文件拖放内容已更换".into());
        }
        return Ok(Vec::new());
    };
    let values = values
        .downcast::<NSArray>()
        .map_err(|_| "系统文件拖放列表无效")?;
    if values.len() > 32 {
        return Err("一次最多拖入 32 个文件".into());
    }
    let mut paths = Vec::new();
    for value in values {
        let value = value
            .downcast::<NSString>()
            .map_err(|_| "系统文件拖放路径无效")?;
        if value.len() > 8192 {
            return Err("系统文件拖放路径过长".into());
        }
        paths.push(std::path::PathBuf::from(value.to_string()));
    }
    if board.changeCount() != version {
        return Err("系统文件拖放内容已更换".into());
    }
    Ok(paths)
}
fn original_entered(this: &AnyObject, selector: Sel, sender: &AnyObject) -> usize {
    // SAFETY: Each retained IMP had this exact checked signature before install.
    let call: unsafe extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> usize =
        unsafe { std::mem::transmute(HOOKS.get().expect("installed file input hooks").entered) };
    unsafe { call(this, selector, sender) }
}
fn original_updated(this: &AnyObject, selector: Sel, sender: &AnyObject) -> usize {
    let call: unsafe extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> usize =
        unsafe { std::mem::transmute(HOOKS.get().expect("installed file input hooks").updated) };
    unsafe { call(this, selector, sender) }
}
fn original_dropped(this: &AnyObject, selector: Sel, sender: &AnyObject) -> Bool {
    let call: unsafe extern "C-unwind" fn(&AnyObject, Sel, &AnyObject) -> Bool =
        unsafe { std::mem::transmute(HOOKS.get().expect("installed file input hooks").dropped) };
    unsafe { call(this, selector, sender) }
}
fn ours(this: &AnyObject) -> bool {
    WINDOWS.with(|windows| windows.borrow().contains_key(&(this as *const _ as usize)))
}
extern "C-unwind" fn entered(this: &AnyObject, _selector: Sel, sender: &AnyObject) -> usize {
    if ours(this) && paths(sender).map_or(true, |paths| !paths.is_empty()) {
        return 1; // NSDragOperationCopy; never move/delete a source file.
    }
    // SAFETY: Exact original destination method on this object's superclass.
    original_entered(this, _selector, sender)
}
extern "C-unwind" fn updated(this: &AnyObject, _selector: Sel, sender: &AnyObject) -> usize {
    if ours(this) && paths(sender).map_or(true, |paths| !paths.is_empty()) {
        return 1;
    }
    original_updated(this, _selector, sender)
}
extern "C-unwind" fn dropped(this: &AnyObject, _selector: Sel, sender: &AnyObject) -> Bool {
    let window =
        WINDOWS.with(|windows| windows.borrow().get(&(this as *const _ as usize)).cloned());
    let Some(window) = window else {
        return original_dropped(this, _selector, sender);
    };
    let paths = match paths(sender) {
        Ok(paths) if paths.is_empty() => {
            return original_dropped(this, _selector, sender);
        }
        Ok(paths) => paths,
        Err(error) => {
            let _ = window.emit("native-file-input-error", error);
            return Bool::YES;
        }
    };
    // Only an actual AppKit drop on this owned destination may activate it.
    // The renderer has no API for creating a file receipt or selecting a path.
    if let Err(error) = window.set_focus() {
        let _ = window.emit("native-file-input-error", error.to_string());
        return Bool::YES;
    }
    // AppKit coordinates are logical points. Include the actual view dimensions
    // so Shell converts through its current CSS zoom without guessing Retina DPI.
    let location: NSPoint = unsafe { msg_send![sender, draggingLocation] };
    let native = unsafe { &*(this as *const AnyObject).cast::<NSView>() };
    let local = native.convertPoint_fromView(location, None);
    let bounds = native.bounds();
    let position = InputPosition {
        x: local.x - bounds.origin.x,
        y: if native.isFlipped() {
            local.y - bounds.origin.y
        } else {
            bounds.size.height - local.y + bounds.origin.y
        },
    };
    let viewport = Viewport {
        width: bounds.size.width,
        height: bounds.size.height,
    };
    let flags = NSEvent::modifierFlags_class();
    let modifiers = InputModifiers {
        alt: flags.contains(NSEventModifierFlags::Option),
        control: flags.contains(NSEventModifierFlags::Control),
        meta: flags.contains(NSEventModifierFlags::Command),
        shift: flags.contains(NSEventModifierFlags::Shift),
    };
    let prepared = match prepare_drop(window.clone(), paths, position, modifiers) {
        Ok(prepared) => prepared,
        Err(error) => {
            let _ = window.emit("native-file-input-error", error);
            return Bool::YES;
        }
    };
    tauri::async_runtime::spawn(async move {
        match complete_drop(prepared).await {
            Ok(receipt) => {
                #[derive(Clone, Serialize)]
                struct Event<T: Serialize> {
                    #[serde(flatten)]
                    receipt: T,
                    viewport: Viewport,
                }
                if let Err(error) = window.emit("native-file-drop", Event { receipt, viewport }) {
                    eprintln!("Native file input delivery failed: {error}");
                }
            }
            Err(error) => {
                let _ = window.emit("native-file-input-error", error);
            }
        }
    });
    Bool::YES
}
