//! Public WK snapshot API. Only fixed layout probes run in an owned static document.
use super::image_geometry::{finish, CaptureResult, Geometry, MAX_PIXELS};
use block2::{Block, RcBlock};
use objc2::{
    msg_send,
    rc::Retained,
    runtime::{AnyClass, AnyObject},
    AnyThread,
};
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
use objc2_foundation::{NSDictionary, NSError, NSPoint, NSRect, NSSize, NSString};
use std::{
    ffi::c_void,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::WebviewWindow;

unsafe extern "C" {
    static _dispatch_main_q: c_void;
    fn dispatch_time(when: u64, delta: i64) -> u64;
    fn dispatch_after(when: u64, queue: *mut c_void, block: &Block<dyn Fn()>);
}
const LAYOUT:&str="JSON.stringify({ready:document.readyState==='complete'&&document.fonts.status==='loaded'&&!Array.from(document.fonts).some(f=>f.status==='error')&&Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0),height:Math.ceil(Math.max(document.documentElement.scrollHeight,document.body.scrollHeight)),width:Math.ceil(Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)),clipped:Array.from(document.querySelectorAll('pre,.md-fences')).some(e=>e.clientWidth>0&&e.scrollWidth>e.clientWidth+1)})";
#[derive(serde::Deserialize)]
struct Layout {
    ready: bool,
    height: u32,
    width: u32,
    clipped: bool,
}
pub(super) fn capture(
    window: WebviewWindow,
    geometry: Geometry,
    jpeg: bool,
    sender: CaptureResult,
    done: Arc<AtomicBool>,
) {
    let failure = sender.clone();
    let result = window.with_webview(move |webview| {
        // SAFETY: the Tauri-owned WKWebView is live on the OS main thread.
        let view = unsafe { &*webview.inner().cast::<AnyObject>() };
        capture_native(view, geometry, jpeg, sender, done);
    });
    if result.is_err() {
        finish(&failure, Err("无法访问图片渲染视图".into()));
    }
}
/// Called only with an owned isolated WKWebView on the main thread; also used by the native test.
pub(super) fn capture_native(
    view: &AnyObject,
    geometry: Geometry,
    jpeg: bool,
    sender: CaptureResult,
    done: Arc<AtomicBool>,
) {
    if objc2::MainThreadMarker::new().is_none() {
        finish(&sender, Err("图片快照必须在主线程执行".into()));
        return;
    }
    // SAFETY: the borrowed live view is retained for the complete asynchronous capture.
    let retained = unsafe { Retained::retain((view as *const AnyObject).cast_mut()) }
        .expect("live owned WKWebView");
    poll(retained, geometry, jpeg, sender, done, 0, false);
}
fn later(
    view: Retained<AnyObject>,
    geometry: Geometry,
    jpeg: bool,
    sender: CaptureResult,
    done: Arc<AtomicBool>,
    attempt: u32,
    resized: bool,
) {
    let block = RcBlock::new(move || {
        poll(
            view.clone(),
            geometry,
            jpeg,
            sender.clone(),
            done.clone(),
            attempt,
            resized,
        )
    });
    // SAFETY: libdispatch copies the block and executes it on the OS main queue. Captured
    // AppKit objects never cross to a worker; the 50ms delay does not block the event loop.
    unsafe {
        dispatch_after(
            dispatch_time(0, 50_000_000),
            std::ptr::addr_of!(_dispatch_main_q).cast_mut(),
            &block,
        );
    }
}
fn poll(
    view: Retained<AnyObject>,
    geometry: Geometry,
    jpeg: bool,
    sender: CaptureResult,
    done: Arc<AtomicBool>,
    attempt: u32,
    resized: bool,
) {
    if done.load(Ordering::Acquire) {
        return;
    }
    if attempt >= 400 {
        finish(&sender, Err("图片或字体未就绪，未保存不完整截图".into()));
        return;
    }
    let callback_view = view.clone();
    let callback = RcBlock::new(move |value: *mut AnyObject, error: *mut NSError| {
        if done.load(Ordering::Acquire) {
            return;
        }
        if !error.is_null() || value.is_null() {
            finish(&sender, Err("WKWebView无法读取整篇图片布局；未保存".into()));
            return;
        }
        // SAFETY: our constant script returns JSON.stringify, hence NSString on success.
        let value = unsafe { &*value.cast::<NSString>() };
        let layout = match serde_json::from_str::<Layout>(&value.to_string()) {
            Ok(layout) => layout,
            Err(_) => {
                finish(&sender, Err("图片布局响应无效".into()));
                return;
            }
        };
        if !layout.ready {
            later(
                callback_view.clone(),
                geometry,
                jpeg,
                sender.clone(),
                done.clone(),
                attempt + 1,
                resized,
            );
            return;
        }
        if layout.clipped {
            finish(
                &sender,
                Err("代码块存在横向滚动内容；请增大导出宽度，未裁切保存".into()),
            );
            return;
        }
        if layout.width > geometry.width + 1 {
            finish(
                &sender,
                Err("文稿存在超出图片宽度的内容；未裁切保存，请增大导出宽度".into()),
            );
            return;
        }
        if let Err(error) = geometry.check(layout.height) {
            finish(&sender, Err(error));
            return;
        }
        if !resized {
            let size = NSSize::new(f64::from(geometry.width), f64::from(layout.height));
            // SAFETY: this is only our hidden raster view/window, never an editor or user window.
            unsafe {
                let parent: Option<Retained<AnyObject>> = msg_send![&*callback_view, window];
                if let Some(parent) = parent {
                    let _: () = msg_send![&*parent,setContentSize:size];
                }
                let _: () = msg_send![&*callback_view,setFrameSize:size];
            }
            later(
                callback_view.clone(),
                geometry,
                jpeg,
                sender.clone(),
                done.clone(),
                attempt + 1,
                true,
            );
            return;
        }
        snapshot(
            callback_view.clone(),
            geometry,
            layout.height,
            jpeg,
            sender.clone(),
            done.clone(),
        );
    });
    // SAFETY: documented WK API, fixed script, no user arguments or host privileges.
    unsafe {
        let _: () = msg_send![&*view,evaluateJavaScript:&*NSString::from_str(LAYOUT),completionHandler:&*callback];
    }
}
fn snapshot(
    view: Retained<AnyObject>,
    geometry: Geometry,
    height: u32,
    jpeg: bool,
    sender: CaptureResult,
    done: Arc<AtomicBool>,
) {
    let Some(class) = AnyClass::get(c"WKSnapshotConfiguration") else {
        finish(&sender, Err("此macOS不支持WK整篇图片快照".into()));
        return;
    };
    // SAFETY: public configuration with a supported rectangle inside our resized view.
    let config: Retained<AnyObject> = unsafe { msg_send![class, new] };
    let rect = NSRect::new(
        NSPoint::new(0., 0.),
        NSSize::new(f64::from(geometry.width), f64::from(height)),
    );
    let number = AnyClass::get(c"NSNumber").expect("Foundation NSNumber");
    let parent: Option<Retained<AnyObject>> = unsafe { msg_send![&*view, window] };
    let backing: f64 = parent
        .as_ref()
        .map(|window| unsafe { msg_send![&**window, backingScaleFactor] })
        .unwrap_or(1.0);
    if !backing.is_finite() || !(1.0..=4.0).contains(&backing) {
        finish(&sender, Err("显示缩放比例无效，未生成图片".into()));
        return;
    }
    let width: Retained<AnyObject> = unsafe {
        msg_send![number,numberWithDouble:f64::from(geometry.width*geometry.scale) / backing]
    };
    unsafe {
        let _: () = msg_send![&*config,setRect:rect];
        let _: () = msg_send![&*config,setSnapshotWidth:&*width];
        let _: () = msg_send![&*config,setAfterScreenUpdates:true];
    }
    let callback = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        if done.load(Ordering::Acquire) {
            return;
        }
        if !error.is_null() || image.is_null() {
            finish(&sender, Err("WK未能生成完整图片；未保存".into()));
            return;
        }
        // SAFETY: WK's completion handler lends its NSImage for this callback.
        finish(
            &sender,
            encode(
                unsafe { &*image },
                jpeg,
                geometry.width * geometry.scale,
                height * geometry.scale,
            ),
        );
    });
    // SAFETY: WK copies the completion block and holds its own view through capture.
    unsafe {
        let _: () =
            msg_send![&*view,takeSnapshotWithConfiguration:&*config,completionHandler:&*callback];
    }
}
fn encode(
    image: &NSImage,
    jpeg: bool,
    expected_width: u32,
    expected_height: u32,
) -> Result<Vec<u8>, String> {
    let tiff = image.TIFFRepresentation().ok_or("WK快照无法解码为位图")?;
    let bitmap =
        NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &tiff).ok_or("WK快照位图无效")?;
    let width = bitmap.pixelsWide();
    let height = bitmap.pixelsHigh();
    if width != isize::try_from(expected_width).unwrap_or(-1)
        || height != isize::try_from(expected_height).unwrap_or(-1)
    {
        return Err("WK实际图片尺寸与整篇布局不符；未裁切或改后缀保存".into());
    }
    if width <= 0 || height <= 0 || width as u64 * height as u64 > MAX_PIXELS {
        return Err("WK实际图片像素超过16Mi限制；未保存".into());
    }
    // SAFETY: the empty typed property dictionary has no unsupported option values.
    let data = unsafe {
        bitmap.representationUsingType_properties(
            if jpeg {
                NSBitmapImageFileType::JPEG
            } else {
                NSBitmapImageFileType::PNG
            },
            &NSDictionary::new(),
        )
    }
    .ok_or("图片编码失败")?;
    if data.len() > export_service::MAX_HTML_BYTES {
        return Err("图片编码超过32 MiB；未保存".into());
    }
    let bytes = data.to_vec();
    if (jpeg && !bytes.starts_with(&[0xff, 0xd8, 0xff]))
        || (!jpeg && !bytes.starts_with(b"\x89PNG\r\n\x1a\n"))
    {
        return Err("图片编码与目标格式不符".into());
    }
    Ok(bytes)
}
