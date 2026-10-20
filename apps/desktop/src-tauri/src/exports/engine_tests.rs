//! The Windows renderers against real WebView2 output. One Tauri runtime per process, so every
//! assertion that needs a renderer lives in a single test.
use super::{
    image_geometry::Geometry,
    image_windows,
    pdf::{PdfContext, PdfLayout},
    pdf_windows, ExportHost,
};
use crate::export_preferences::PdfSettings;
use export_service::prepare_html;
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::{mpsc, Mutex},
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// Runs `work` on a worker thread while this thread drives a real WebView2-backed Tauri app.
fn with_runtime<T: Send + 'static>(
    work: impl FnOnce(&AppHandle, &WebviewWindow) -> T + Send + 'static,
) -> T {
    let data = std::env::temp_dir().join(format!("marklyra-engine-{}", uuid::Uuid::new_v4()));
    // SAFETY: set before any other thread of this process reads the environment.
    unsafe { std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &data) };
    let (tx, rx) = mpsc::channel();
    let job = Mutex::new(Some((work, tx)));
    let app = tauri::Builder::<tauri::Wry>::new()
        .any_thread()
        .manage(ExportHost::default())
        .register_uri_scheme_protocol("marklyra", |context, request| {
            let token = request
                .uri()
                .path()
                .split('/')
                .nth(2)
                .unwrap_or_default()
                .to_owned();
            super::response(
                &context.app_handle().state::<ExportHost>(),
                context.webview_label(),
                &token,
                request.method(),
            )
        })
        .setup(move |app| {
            let host = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .visible(false)
                .additional_browser_args(crate::windows::WEBVIEW_BROWSER_ARGS)
                .build()?;
            let handle = app.handle().clone();
            let (work, tx) = job.lock().unwrap().take().unwrap();
            std::thread::spawn(move || {
                // A failed assertion must still end the event loop, or the test would hang.
                let result =
                    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| work(&handle, &host)));
                let _ = tx.send(result);
                handle.exit(0);
            });
            Ok(())
        })
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("a real WebView2 runtime");
    app.run_return(|_, _| {});
    let _ = std::fs::remove_dir_all(data);
    match rx.recv().expect("the renderer test finished") {
        Ok(value) => value,
        Err(panic) => std::panic::resume_unwind(panic),
    }
}

fn artifacts() -> PathBuf {
    let directory = std::env::var_os("MARKLYRA_ENGINE_ARTIFACTS")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir().join("marklyra-engine-artifacts"));
    std::fs::create_dir_all(&directory).unwrap();
    directory
}

const PNG: &str = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR4nGP8z/CfgRTARJJqhlENxAEmItXBwagGYgDJoQQASk4CHq8YfaYAAAAASUVORK5CYII=";

/// A theme-like document: print rules that try to take over the page, a long Chinese body with a
/// top-level heading before every page, an embedded image and a table.
fn document() -> String {
    let mut body = String::new();
    for section in 1..=3 {
        body.push_str(&format!("<h1>第{section}章 标题 Chapter {section}</h1>"));
        for paragraph in 0..14 {
            body.push_str(&format!(
                "<p>这是第{section}章的第{paragraph}段，用于验证中文排版、分页、页眉页脚与书签是否按设置生效。The quick brown fox jumps over the lazy dog. 敏捷的棕色狐狸跳过了懒惰的狗，反复书写直到占满整整一行以上的宽度。</p>"
            ));
        }
        if section == 1 {
            body.push_str(&format!(
                "<p><img alt=\"dot\" width=\"64\" height=\"64\" src=\"data:image/png;base64,{PNG}\"></p><table><thead><tr><th>列A</th><th>列B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
            ));
        }
    }
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>引擎测试</title><style>html,body{{margin:0;background:#fff}}body{{font:14px/1.6 'Microsoft YaHei',sans-serif;color:#222}}#write{{padding:0}}h1{{break-before:page;margin:0 0 12px}}h1:first-of-type{{break-before:auto}}@media print{{@page{{size:A5 landscape;margin:3mm}}body.typora-export{{padding:0}}}}</style></head><body class=\"typora-export\"><div id=\"write\">{body}</div></body></html>"
    )
}

/// What a PDF library reads back from a generated file.
struct Measured {
    pages: usize,
    outline: usize,
    /// Per page: text, x and y of its origin in points (y counts from the bottom), font size.
    items: Vec<Vec<(String, f64, f64, f64)>>,
}

/// Page layout details need a PDF reader. `MARKLYRA_PDF_MEASURE` names a script that prints
/// `{pages, media, outline, items}` for one PDF; without it only the structural checks run.
fn measure(pdf: &Path) -> Option<Measured> {
    let script = std::env::var_os("MARKLYRA_PDF_MEASURE")?;
    let output = Command::new("python")
        .arg("-I")
        .arg(script)
        .arg(pdf)
        .output()
        .expect("the PDF measuring script starts");
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap_or_else(|_| {
        panic!(
            "the measuring script failed: {}",
            String::from_utf8_lossy(&output.stderr)
        )
    });
    let number = |value: &serde_json::Value| value.as_f64().unwrap_or_default();
    Some(Measured {
        pages: value["pages"].as_u64()? as usize,
        outline: value["outline"].as_u64()? as usize,
        items: value["items"]
            .as_array()?
            .iter()
            .map(|page| {
                page.as_array()
                    .map(|items| {
                        items
                            .iter()
                            .map(|item| {
                                (
                                    item[0].as_str().unwrap_or_default().to_owned(),
                                    number(&item[1]),
                                    number(&item[2]),
                                    number(&item[3]),
                                )
                            })
                            .collect()
                    })
                    .unwrap_or_default()
            })
            .collect(),
    })
}

fn page_count(pdf: &[u8]) -> usize {
    String::from_utf8_lossy(pdf)
        .split("/Type /Page")
        .skip(1)
        .filter(|rest| !rest.starts_with('s'))
        .count()
}

fn media_box(pdf: &[u8]) -> Vec<f64> {
    let text = String::from_utf8_lossy(pdf);
    text.split("/MediaBox")
        .nth(1)
        .and_then(|rest| rest.split('[').nth(1))
        .and_then(|rest| rest.split(']').next())
        .map(|numbers| {
            numbers
                .split_whitespace()
                .filter_map(|number| number.parse().ok())
                .collect()
        })
        .unwrap_or_default()
}

fn png_size(bytes: &[u8]) -> (u32, u32) {
    let at = |offset: usize| u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap());
    (at(16), at(20))
}

/// The first pixel (RGBA) of a PNG; the first scanline has no neighbours, so the filter is moot.
fn png_first_pixel(bytes: &[u8]) -> [u8; 4] {
    use std::io::Read;
    let mut data = Vec::new();
    let mut at = 8;
    while at + 8 <= bytes.len() {
        let length = u32::from_be_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
        if &bytes[at + 4..at + 8] == b"IDAT" {
            data.extend_from_slice(&bytes[at + 8..at + 8 + length]);
        }
        at += 12 + length;
    }
    let mut raw = vec![0; 16];
    flate2::read::ZlibDecoder::new(&data[..])
        .read_exact(&mut raw)
        .unwrap();
    let channels = if bytes[25] == 6 { 4 } else { 3 };
    let mut pixel = [255; 4];
    pixel[..channels].copy_from_slice(&raw[1..1 + channels]);
    pixel
}

fn jpeg_size(bytes: &[u8]) -> (u32, u32) {
    let mut at = 2;
    while at + 9 < bytes.len() {
        assert_eq!(bytes[at], 0xff);
        let marker = bytes[at + 1];
        let length = usize::from(u16::from_be_bytes([bytes[at + 2], bytes[at + 3]]));
        if (0xc0..=0xc3).contains(&marker) {
            return (
                u32::from(u16::from_be_bytes([bytes[at + 7], bytes[at + 8]])),
                u32::from(u16::from_be_bytes([bytes[at + 5], bytes[at + 6]])),
            );
        }
        at += 2 + length;
    }
    panic!("no JPEG frame header");
}

#[test]
fn real_webview2_renders_pdf_and_whole_document_images() {
    let output = artifacts();
    let html = document();
    with_runtime(move |app, window| {
        let context = PdfContext {
            title: "Engine-Test".into(),
            author: "liyao".into(),
        };
        // 1. Default settings: A4, 16 mm margins, bookmarks, tagged. The document's own
        //    `@page { size: A5 landscape; margin: 3mm }` must not win.
        let layout = PdfLayout::resolve(&PdfSettings::default(), &context).unwrap();
        let prepared = prepare_html(&html).unwrap();
        let pdf = pdf_windows::render(app, window, prepared, &layout).expect("a default PDF");
        std::fs::write(output.join("default.pdf"), &pdf).unwrap();
        assert!(pdf.starts_with(b"%PDF-"));
        let boxed = media_box(&pdf);
        assert_eq!(boxed.len(), 4, "MediaBox");
        assert!(
            (boxed[2] - 595.28).abs() < 0.5 && (boxed[3] - 841.89).abs() < 0.5,
            "{boxed:?}"
        );
        assert!(
            String::from_utf8_lossy(&pdf).contains("/Outlines"),
            "bookmarks"
        );
        assert!(app
            .state::<ExportHost>()
            .renderers
            .lock()
            .unwrap()
            .is_empty());
        assert!(page_count(&pdf) >= 3, "three chapters each start a page");
        let margin = 16.0 / 25.4 * 72.0;
        if let Some(measured) = measure(&output.join("default.pdf")) {
            assert_eq!(measured.pages, page_count(&pdf));
            assert_eq!(measured.outline, 3, "one bookmark per chapter");
            let height = boxed[3];
            for page in &measured.items {
                for (text, x, y, size) in page {
                    // Words start at the left margin or later; baselines stay inside the page body.
                    assert!(*x >= margin - 1.0, "{text:?} at x={x}");
                    assert!(*y <= height - margin + 1.0, "{text:?} at y={y}");
                    assert!(*y >= margin - 1.0, "{text:?} at y={y}, size {size}");
                }
            }
            let left = measured.items[0]
                .iter()
                .map(|item| item.1)
                .fold(f64::MAX, f64::min);
            assert!(
                (left - margin).abs() < 2.0,
                "body starts at the left margin: {left}"
            );
        }

        // 2. Landscape Letter, custom margins, header, footer with page numbers, no bookmarks.
        let settings = PdfSettings {
            paper: Some("Letter".into()),
            landscape: Some(true),
            paper_margin: Some("custom".into()),
            paper_margin_top: Some(30.0),
            paper_margin_bottom: Some(30.0),
            paper_margin_left: Some(40.0),
            paper_margin_right: Some(10.0),
            bookmarks: Some(false),
            header: Some("HEADER ${title}".into()),
            footer: Some("Page ${pageNo} of ${totalPages}".into()),
            footer_left: Some("LEFT-ZONE".into()),
            header_right: Some("RR".into()),
            footer_right: Some("${author}".into()),
            ..Default::default()
        };
        let layout = PdfLayout::resolve(&settings, &context).unwrap();
        let pdf = pdf_windows::render(app, window, prepare_html(&html).unwrap(), &layout)
            .expect("a custom PDF");
        std::fs::write(output.join("custom.pdf"), &pdf).unwrap();
        let boxed = media_box(&pdf);
        assert!(
            (boxed[2] - 791.0).abs() < 1.5 && (boxed[3] - 612.2).abs() < 1.5,
            "{boxed:?}"
        );
        assert!(
            !String::from_utf8_lossy(&pdf).contains("/Outlines"),
            "no bookmarks"
        );
        assert!(page_count(&pdf) >= 3);
        if let Some(measured) = measure(&output.join("custom.pdf")) {
            let (width, height) = (boxed[2], boxed[3]);
            let band = 30.0 / 25.4 * 72.0;
            let left = 40.0 / 25.4 * 72.0;
            for (number, page) in measured.items.iter().enumerate() {
                let header: Vec<_> = page
                    .iter()
                    .filter(|item| item.0.contains("HEADER"))
                    .collect();
                let footer: Vec<_> = page.iter().filter(|item| item.0.contains("Page")).collect();
                assert_eq!(header.len(), 1, "page {number} header");
                assert_eq!(footer.len(), 1, "page {number} footer");
                let zone = |text: &str| {
                    page.iter()
                        .find(|item| item.0.contains(text))
                        .map(|item| item.1)
                };
                if number == 0 {
                    println!(
                        "zones: left x={:?} right-header x={:?} author x={:?} width={width}",
                        zone("LEFT-ZONE"),
                        zone("RR"),
                        zone("liyao")
                    );
                }
                assert!(
                    header[0].2 > height - band,
                    "header sits in the top margin: {}",
                    header[0].2
                );
                assert!(
                    footer[0].2 < band,
                    "footer sits in the bottom margin: {}",
                    footer[0].2
                );
                assert!(header[0].0.contains("Engine-Test"), "{:?}", header[0].0);
                let numbers: Vec<_> = footer.iter().map(|item| item.0.as_str()).collect();
                assert!(footer[0].0.contains("Page"), "{numbers:?}");
                assert!(
                    page.iter()
                        .any(|item| item.0.trim() == (number + 1).to_string() && item.2 < band),
                    "page {number} number in {numbers:?}"
                );
                assert!(
                    page.iter()
                        .any(|item| item.0.trim() == measured.pages.to_string() && item.2 < band),
                    "total {} in {numbers:?}",
                    measured.pages
                );
                // Body text keeps the explicit margins: left 40 mm, right 10 mm, 30 mm bands.
                for item in page
                    .iter()
                    .filter(|item| item.2 > band && item.2 < height - band)
                {
                    assert!(item.1 >= left - 1.5, "{:?} at x={}", item.0, item.1);
                    assert!(
                        item.1 <= width - 10.0 / 25.4 * 72.0,
                        "{:?} at x={}",
                        item.0,
                        item.1
                    );
                }
            }
            println!(
                "custom header x={:.1} body x={:.1} (left margin {left:.1})",
                measured.items[0]
                    .iter()
                    .find(|i| i.0.contains("HEADER"))
                    .map_or(0.0, |i| i.1),
                measured.items[0]
                    .iter()
                    .find(|i| i.2 > band && i.2 < height - band)
                    .map_or(0.0, |i| i.1),
            );
        }

        // 3. Whole-document images: exact pixel size, background, both encodings.
        let tall = "<!doctype html><html><head><meta charset=\"utf-8\"><style>html,body{margin:0;background:#fdf6e3}#a{height:1200px;background:#fdf6e3}#b{height:800px;background:#268bd2}</style></head><body><div id=\"a\"></div><div id=\"b\"></div></body></html>";
        let geometry = Geometry {
            width: 500,
            scale: 2,
        };
        let png = image_windows::capture(app, window, prepare_html(tall).unwrap(), geometry, false)
            .expect("a PNG");
        std::fs::write(output.join("whole.png"), &png).unwrap();
        assert_eq!(png_size(&png), (1000, 4000));
        assert_eq!(png_first_pixel(&png), [0xfd, 0xf6, 0xe3, 0xff]);
        let jpeg = image_windows::capture(
            app,
            window,
            prepare_html(tall).unwrap(),
            Geometry {
                width: 500,
                scale: 1,
            },
            true,
        )
        .expect("a JPEG");
        std::fs::write(output.join("whole.jpg"), &jpeg).unwrap();
        assert_eq!(jpeg_size(&jpeg), (500, 2000));

        // 4. The real renderer for a long, wide, themed document, and the refusals.
        let image = image_windows::capture(
            app,
            window,
            prepare_html(&html).unwrap(),
            Geometry {
                width: 640,
                scale: 1,
            },
            false,
        )
        .expect("the long document");
        std::fs::write(output.join("document.png"), &image).unwrap();
        assert_eq!(png_size(&image).0, 640);
        let wide = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body style=\"margin:0\"><div style=\"width:900px;height:50px;background:#000\"></div></body></html>";
        let refused = image_windows::capture(
            app,
            window,
            prepare_html(wide).unwrap(),
            Geometry {
                width: 500,
                scale: 1,
            },
            false,
        );
        assert!(refused.unwrap_err().contains("超出图片宽度"));
        let huge = "<!doctype html><html><body style=\"margin:0\"><div style=\"height:40000px\"></div></body></html>";
        let refused = image_windows::capture(
            app,
            window,
            prepare_html(huge).unwrap(),
            Geometry {
                width: 500,
                scale: 1,
            },
            false,
        );
        assert!(refused.unwrap_err().contains("32,768"));
        assert!(app
            .state::<ExportHost>()
            .renderers
            .lock()
            .unwrap()
            .is_empty());
        assert!(app.state::<ExportHost>().owners.lock().unwrap().is_empty());
        println!("artifacts: {}", output.display());
    });
}
