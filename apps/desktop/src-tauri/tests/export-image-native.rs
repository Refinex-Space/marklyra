//! No product debug command: exercise the actual capture implementation on owned hidden WK views.
#[cfg(target_os = "macos")]
#[allow(dead_code, unused_imports)]
#[path = "../src/exports/image_geometry.rs"]
mod image_geometry;
#[cfg(target_os = "macos")]
#[allow(dead_code)]
#[path = "../src/exports/image_macos.rs"]
mod image_macos;

#[cfg(target_os = "macos")]
fn main() {
    use objc2::{
        msg_send,
        rc::{Allocated, Retained},
        runtime::{AnyClass, AnyObject},
        AnyThread, MainThreadMarker, MainThreadOnly,
    };
    use objc2_app_kit::{
        NSBackingStoreType, NSBitmapImageRep, NSView, NSWindow, NSWindowStyleMask,
    };
    use objc2_foundation::{NSData, NSPoint, NSRect, NSSize, NSString};
    use std::{
        path::PathBuf,
        sync::{
            atomic::{AtomicBool, Ordering},
            mpsc, Arc, Mutex,
        },
        time::{Duration, Instant},
    };
    let mtm = MainThreadMarker::new().expect("native image harness runs on main thread");
    let app_class = AnyClass::get(c"NSApplication").expect("AppKit application");
    let application: Retained<AnyObject> = unsafe { msg_send![app_class, sharedApplication] };
    unsafe {
        let _: bool = msg_send![&*application, setActivationPolicy: 2isize];
    }
    // Load WebKit through its linked framework, without opening a user-facing application window.
    #[link(name = "WebKit", kind = "framework")]
    unsafe extern "C" {}
    let output = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::current_dir().unwrap().join(format!(
                "../../../artifacts/formats/native-{}",
                uuid::Uuid::new_v4()
            ))
        });
    assert!(output.is_absolute());
    std::fs::create_dir_all(output.parent().unwrap()).unwrap();
    std::fs::create_dir(&output).expect("new evidence directory only");
    let html="<!doctype html><html><head><meta charset=utf-8><meta http-equiv=Content-Security-Policy content=\"sandbox allow-scripts;default-src 'none';style-src 'unsafe-inline';img-src data:;script-src 'none'\"><style>html,body{margin:0;background:white}body{font:24px serif}#top{height:80px;background:rgb(255,0,0)}#middle{height:3300px;padding:20px;box-sizing:border-box}#bottom{height:100px;background:rgb(0,0,255);color:white}svg{display:block}</style></head><body><div id=top>TOP 中文</div><div id=middle><h1>Whole document 原生图片</h1><svg width=180 height=90 xmlns='http://www.w3.org/2000/svg'><rect width='180' height='90' fill='green' /><text x=10 y=50 fill=white>SVG x²</text></svg><pre>fn main() {\n  println!(\"CJK 中文\");\n}</pre><img alt=inline width=64 height=64 src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR4nGP8z/CfgRTARJJqhlENxAEmItXBwagGYgDJoQQASk4CHq8YfaYAAAAASUVORK5CYII='></div><div id=bottom>FULL DOCUMENT BOTTOM</div></body></html>";
    let mut records = Vec::new();
    for (name, jpeg, scale) in [
        ("full.png", false, 1),
        ("full.jpg", true, 1),
        ("high.png", false, 2),
    ] {
        let config_class = AnyClass::get(c"WKWebViewConfiguration").expect("WK configuration");
        let config: Retained<AnyObject> = unsafe { msg_send![config_class, new] };
        let preferences: Retained<AnyObject> = unsafe { msg_send![&*config, preferences] };
        unsafe {
            let _: () = msg_send![&*preferences,setJavaScriptEnabled:true];
        }
        // SAFETY: this new borderless test window is confined to the OS main thread.
        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                NSRect::new(NSPoint::new(0., 0.), NSSize::new(640., 64.)),
                NSWindowStyleMask::Borderless,
                NSBackingStoreType::Buffered,
                false,
            )
        };
        let class = AnyClass::get(c"WKWebView").expect("WKWebView");
        let view: Retained<AnyObject> = unsafe {
            let allocated: Allocated<AnyObject> = msg_send![class, alloc];
            msg_send![allocated,initWithFrame:NSRect::new(NSPoint::new(0.,0.),NSSize::new(640.,64.)),configuration:&*config]
        };
        window.setContentView(Some(unsafe {
            &*(&*view as *const AnyObject).cast::<NSView>()
        }));
        unsafe {
            let _: *mut AnyObject = msg_send![&*view,loadHTMLString:&*NSString::from_str(html),baseURL:std::ptr::null::<AnyObject>()];
        }
        let started = Instant::now();
        while unsafe { msg_send![&*view, isLoading] } {
            pump();
            assert!(
                started.elapsed() < Duration::from_secs(15),
                "WK load timeout"
            );
        }
        pump();
        let (tx, rx) = mpsc::channel();
        let sender = Arc::new(Mutex::new(Some(tx)));
        let done = Arc::new(AtomicBool::new(false));
        image_macos::capture_native(
            &view,
            image_geometry::Geometry { width: 640, scale },
            jpeg,
            sender,
            done.clone(),
        );
        let bytes = loop {
            match rx.try_recv() {
                Ok(result) => break result.expect("actual capture result"),
                Err(mpsc::TryRecvError::Disconnected) => panic!("capture sender disconnected"),
                Err(mpsc::TryRecvError::Empty) => {
                    pump();
                    assert!(
                        started.elapsed() < Duration::from_secs(35),
                        "capture timeout"
                    );
                }
            }
        };
        done.store(true, Ordering::Release);
        let bitmap =
            NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &NSData::with_bytes(&bytes))
                .expect("encoded PNG/JPEG decodes");
        assert!(
            bitmap.pixelsHigh() > 3000,
            "whole document rather than64px viewport"
        );
        records.push(serde_json::json!({"file":name,"bytes":bytes.len(),"width":bitmap.pixelsWide(),"height":bitmap.pixelsHigh(),"requestedWidth":640,"scale":scale,"hidden":true,"documentScriptsBlockedByCsp":true}));
        std::fs::write(output.join(name), bytes).unwrap();
        // The retained hidden window is simply released; no existing window is touched.
        drop(window);
        drop(view);
    }
    std::fs::write(output.join("report.json"),serde_json::to_vec_pretty(&serde_json::json!({"kind":"real WK public API capture; direct product capture_native implementation; excludes menu/dialog acceptance","records":records})).unwrap()).unwrap();
    println!(
        "Actual WK PNG/JPEG whole-document output: {}",
        output.display()
    );
    fn pump() {
        let run_loop = AnyClass::get(c"NSRunLoop").unwrap();
        let date = AnyClass::get(c"NSDate").unwrap();
        unsafe {
            let current: Retained<AnyObject> = msg_send![run_loop, currentRunLoop];
            let until: Retained<AnyObject> = msg_send![date,dateWithTimeIntervalSinceNow:0.02f64];
            let _: bool = msg_send![&*current,runMode:&*NSString::from_str("kCFRunLoopDefaultMode"),beforeDate:&*until];
        }
    }
}
#[cfg(not(target_os = "macos"))]
fn main() {
    println!("Native raster harness requires macOS WKWebView; Windows is not claimed");
}
