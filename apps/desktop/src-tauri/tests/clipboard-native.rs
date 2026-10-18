//! Main-thread AppKit tests; general clipboard is used only with an explicit fixture switch.
#[cfg(target_os = "macos")]
#[path = "../src/clipboard/content.rs"]
mod content;
#[cfg(target_os = "macos")]
use content::{Content, MAX_FORMAT_BYTES};
#[cfg(target_os = "macos")]
#[allow(dead_code)]
#[path = "../src/clipboard/macos.rs"]
mod platform;
#[cfg(target_os = "macos")]
#[path = "../src/clipboard/rtf.rs"]
mod rtf;

#[cfg(target_os = "macos")]
#[path = "../src/clipboard/image.rs"]
mod image;
#[cfg(target_os = "macos")]
use image::NativeImage;

#[cfg(target_os = "macos")]
#[allow(dead_code)]
enum NativeClipboardInput {
    Files(Vec<std::path::PathBuf>),
    Content(Content),
    Image(NativeImage),
    Empty,
}

#[cfg(target_os = "macos")]
#[path = "support/clipboard_fixture.rs"]
mod fixture;

#[cfg(target_os = "macos")]
fn main() {
    use objc2::rc::autoreleasepool;
    use objc2_app_kit::NSPasteboard;
    assert!(objc2::MainThreadMarker::new().is_some());
    let arguments: Vec<_> = std::env::args_os().skip(1).collect();
    if !arguments.is_empty() {
        let result = autoreleasepool(|_| {
            match arguments.as_slice() {
            [mode] if mode == "--fixture-self-test" => fixture::self_test(),
            [mode, path] if mode == "--general-image-fixture" => fixture::general(std::path::Path::new(path)),
            [mode, path] if mode == "--general-tiff-fixture" => fixture::general_tiff(std::path::Path::new(path)),
            [mode, path] if mode == "--general-html-image-fixture" => fixture::general_html_image(std::path::Path::new(path)),
            [mode, paths @ ..] if mode == "--general-file-fixture" => fixture::general_files(paths),
            [mode, path] if mode == "--expect-copy-path" => fixture::expect_copy_path(std::path::Path::new(path)),
            [mode, input, output] if mode == "--export-rtf-fixture" => fixture::export_rtf(std::path::Path::new(input), std::path::Path::new(output)),
            _ => Err("Supported fixture arguments: --fixture-self-test | --general-image-fixture <PNG> | --general-tiff-fixture <TIFF> | --general-html-image-fixture <PNG> | --general-file-fixture <OWN FILE OR DIR>... | --expect-copy-path <ABSOLUTE OWN PATH> | --export-rtf-fixture <RTF> <NEW JSON>".to_owned()),
        }
        });
        if let Err(error) = result {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }

    autoreleasepool(|_| {
        let board = NSPasteboard::pasteboardWithUniqueName();
        let data = Content {
            mark_html: Some("<p mdtype=\"paragraph\">**marklyra-native**</p>".into()),
            text: "marklyra-native-clipboard-中文😀".into(),
            html: Some("<p><strong>marklyra-native-clipboard-中文😀</strong></p>".into()),
        };
        platform::write(&board, &data).unwrap();
        assert_eq!(platform::read(&board).unwrap(), data);
        assert_eq!(board.pasteboardItems().unwrap().len(), 1);
        platform::write(
            &board,
            &Content {
                mark_html: None,
                text: "plain".into(),
                html: None,
            },
        )
        .unwrap();
        assert_eq!(
            platform::read(&board).unwrap(),
            Content {
                mark_html: None,
                text: "plain".into(),
                html: None
            }
        );
        board.clearContents();
        assert_eq!(
            platform::read(&board).unwrap(),
            Content {
                mark_html: None,
                text: "".into(),
                html: None
            }
        );
    });
    autoreleasepool(|_| {
        let board = NSPasteboard::pasteboardWithUniqueName();
        let data = Content {
            mark_html: None,
            text: "preserved-fixture".into(),
            html: Some("<b>preserved-fixture</b>".into()),
        };
        platform::write(&board, &data).unwrap();
        let version = board.changeCount();
        assert!(platform::write(
            &board,
            &Content {
                mark_html: None,
                text: "x\0y".into(),
                html: None
            }
        )
        .is_err());
        assert_eq!(board.changeCount(), version);
        assert_eq!(platform::read(&board).unwrap(), data);
        board.clearContents();
    });
    autoreleasepool(|_| {
        use objc2::runtime::ProtocolObject;
        use objc2_app_kit::NSPasteboardItem;
        use objc2_foundation::{ns_string, NSArray, NSData, NSString};
        let board = NSPasteboard::pasteboardWithUniqueName();
        let item = NSPasteboardItem::new();
        assert!(item.setString_forType(
            &NSString::from_str("fallback fixture"),
            ns_string!("public.utf8-plain-text")
        ));
        assert!(item.setData_forType(&NSData::with_bytes(&[0xff]), ns_string!("public.html")));
        board.clearContents();
        assert!(board.writeObjects(&NSArray::from_retained_slice(&[
            ProtocolObject::from_retained(item)
        ])));
        assert!(platform::read(&board).is_err());
        board.clearContents();
    });
    autoreleasepool(|_| {
        use base64::{engine::general_purpose::STANDARD, Engine};
        use objc2::runtime::ProtocolObject;
        use objc2_app_kit::NSPasteboardItem;
        use objc2_foundation::{ns_string, NSArray, NSData, NSString};
        let board = NSPasteboard::pasteboardWithUniqueName();
        let png = include_bytes!("../../../../crates/image-assets/test-fixtures/clipboard-rgb.png");
        let tiff =
            include_bytes!("../../../../crates/image-assets/test-fixtures/clipboard-rgb.tiff");
        for (kind, bytes) in [
            (ns_string!("public.png"), png.as_slice()),
            (ns_string!("public.tiff"), tiff.as_slice()),
        ] {
            let item = NSPasteboardItem::new();
            assert!(item.setData_forType(&NSData::with_bytes(bytes), kind));
            assert!(item.setString_forType(
                &NSString::from_str("plain companion text"),
                ns_string!("public.utf8-plain-text")
            ));
            board.clearContents();
            assert!(board.writeObjects(&NSArray::from_retained_slice(&[
                ProtocolObject::from_retained(item)
            ])));
            let count = board.changeCount();
            let converted = platform::read_image(&board)
                .unwrap()
                .unwrap()
                .convert()
                .unwrap();
            assert_eq!(converted.mime, "image/png");
            assert!(converted.name.ends_with(".png"));
            assert!(STANDARD
                .decode(converted.base64)
                .unwrap()
                .starts_with(b"\x89PNG\r\n\x1a\n"));
            assert_eq!(board.changeCount(), count);
        }
        for html_kind in [
            ns_string!("public.html"),
            ns_string!("org.webkit.custom-pasteboard-data"),
        ] {
            let item = NSPasteboardItem::new();
            assert!(item.setData_forType(&NSData::with_bytes(png), ns_string!("public.png")));
            assert!(item.setString_forType(
                &NSString::from_str("<strong>keep rich source</strong>"),
                html_kind
            ));
            board.clearContents();
            assert!(board.writeObjects(&NSArray::from_retained_slice(&[
                ProtocolObject::from_retained(item)
            ])));
            assert!(platform::read_image(&board).unwrap().is_none());
        }
        board.clearContents();
        assert!(platform::read_image(&board).unwrap().is_none());
    });
    autoreleasepool(|_| {
        use objc2::runtime::ProtocolObject;
        use objc2_app_kit::NSPasteboardItem;
        use objc2_foundation::{ns_string, NSArray, NSData, NSString};
        let board = NSPasteboard::pasteboardWithUniqueName();
        let publish = |items: Vec<objc2::rc::Retained<NSPasteboardItem>>| {
            board.clearContents();
            assert!(board.writeObjects(&NSArray::from_retained_slice(
                &items
                    .into_iter()
                    .map(ProtocolObject::from_retained)
                    .collect::<Vec<_>>()
            )));
        };
        let rich = || {
            let item = NSPasteboardItem::new();
            assert!(item.setData_forType(
                &NSData::with_bytes(br"{\rtf1\ansi Plain \b Bravo\b0  \u20013?\u25991?}"),
                ns_string!("public.rtf")
            ));
            item
        };
        publish(vec![rich()]);
        let version = board.changeCount();
        let converted = platform::read(&board).unwrap();
        assert_eq!(converted.text, "Plain Bravo 中文");
        let html = converted.html.unwrap();
        assert!(
            html.contains("Bravo") && (html.contains("font-weight: bold") || html.contains("<b>"))
        );
        assert_eq!(board.changeCount(), version);
        let item = rich();
        assert!(item.setString_forType(
            &NSString::from_str("<em>HTML wins</em>"),
            ns_string!("public.html")
        ));
        assert!(item.setString_forType(
            &NSString::from_str("HTML wins"),
            ns_string!("public.utf8-plain-text")
        ));
        publish(vec![item]);
        assert_eq!(
            platform::read(&board).unwrap(),
            Content {
                mark_html: None,
                text: "HTML wins".into(),
                html: Some("<em>HTML wins</em>".into())
            }
        );
        let invalid = NSPasteboardItem::new();
        assert!(invalid.setData_forType(&NSData::with_bytes(b"not RTF"), ns_string!("public.rtf")));
        assert!(invalid.setString_forType(
            &NSString::from_str("must not silently degrade"),
            ns_string!("public.utf8-plain-text")
        ));
        publish(vec![invalid]);
        assert!(platform::read(&board).is_err());
        let first = NSPasteboardItem::new();
        assert!(first.setString_forType(
            &NSString::from_str("first native item"),
            ns_string!("public.utf8-plain-text")
        ));
        publish(vec![first, rich()]);
        assert_eq!(
            platform::read(&board).unwrap(),
            Content {
                mark_html: None,
                text: "first native item".into(),
                html: None
            }
        );
        let item = rich();
        let png = include_bytes!("../../../../crates/image-assets/test-fixtures/clipboard-rgb.png");
        assert!(item.setData_forType(&NSData::with_bytes(png), ns_string!("public.png")));
        publish(vec![item]);
        assert!(platform::read_image(&board).unwrap().is_none());
        assert_eq!(platform::read(&board).unwrap().text, "Plain Bravo 中文");
        let huge = NSPasteboardItem::new();
        assert!(huge.setData_forType(
            &NSData::with_bytes(&vec![b' '; MAX_FORMAT_BYTES + 1]),
            ns_string!("public.rtf")
        ));
        publish(vec![huge]);
        assert!(platform::read(&board).is_err());
        let attachment = NSPasteboardItem::new();
        let hex: String = png.iter().map(|byte| format!("{byte:02x}")).collect();
        let source = format!("{{\\rtf1\\ansi Before{{\\pict\\pngblip {hex}}}After}}");
        assert!(attachment.setData_forType(
            &NSData::with_bytes(source.as_bytes()),
            ns_string!("public.rtf")
        ));
        publish(vec![attachment]);
        assert!(platform::read(&board).is_err());
        let rtfd = NSPasteboardItem::new();
        assert!(rtfd.setData_forType(
            &NSData::with_bytes(b"unsupported RTFD fixture"),
            ns_string!("com.apple.flat-rtfd")
        ));
        assert!(rtfd.setString_forType(
            &NSString::from_str("not a safe text fallback"),
            ns_string!("public.utf8-plain-text")
        ));
        publish(vec![rtfd]);
        assert!(platform::read_image(&board).unwrap().is_none());
        assert!(platform::read(&board).is_err());
        board.clearContents();
    });
    autoreleasepool(|_| {
        use objc2::runtime::ProtocolObject;
        use objc2_app_kit::NSPasteboardItem;
        use objc2_foundation::{ns_string, NSArray, NSData, NSString};
        let board = NSPasteboard::pasteboardWithUniqueName();
        let png = include_bytes!("../../../../crates/image-assets/test-fixtures/clipboard-rgb.png");
        let item = |url: &str| {
            let item = NSPasteboardItem::new();
            assert!(item.setString_forType(&NSString::from_str(url), ns_string!("public.file-url")));
            assert!(item.setData_forType(&NSData::with_bytes(png), ns_string!("public.png")));
            item
        };
        let publish = |items: Vec<objc2::rc::Retained<NSPasteboardItem>>| {
            board.clearContents();
            assert!(board.writeObjects(&NSArray::from_retained_slice(
                &items
                    .into_iter()
                    .map(ProtocolObject::from_retained)
                    .collect::<Vec<_>>()
            )));
        };
        publish(vec![item("file:///own/a%20%E4%B8%AD%E6%96%87.png")]);
        let count = board.changeCount();
        let NativeClipboardInput::Files(files) = platform::read_input(&board).unwrap() else {
            panic!("file URL must outrank image preview");
        };
        assert_eq!(files, vec![std::path::PathBuf::from("/own/a 中文.png")]);
        assert!(platform::read_image(&board).unwrap().is_none());
        assert_eq!(board.changeCount(), count);
        let rich = item("file:///own/a.png");
        assert!(rich.setString_forType(
            &NSString::from_str("<b>rich source</b>"),
            ns_string!("public.html")
        ));
        publish(vec![rich]);
        let NativeClipboardInput::Content(content) = platform::read_input(&board).unwrap() else {
            panic!("HTML must outrank file URL and image preview");
        };
        assert_eq!(content.html.as_deref(), Some("<b>rich source</b>"));
        for bad in [
            "https://example.invalid/a.png",
            "file://remote.invalid/a.png",
            "file:///own/a.png?query",
            "file:///own/a.png#fragment",
        ] {
            publish(vec![item(bad)]);
            assert!(platform::read_input(&board).is_err());
        }
        publish(vec![item("file:///own/A.md"), item("file:///own/folder/")]);
        let NativeClipboardInput::Files(paths) = platform::read_input(&board).unwrap() else {
            panic!("expected ordered files");
        };
        assert_eq!(
            paths,
            vec![
                std::path::PathBuf::from("/own/A.md"),
                std::path::PathBuf::from("/own/folder/")
            ]
        );
        assert_eq!(platform::read_file_urls(&board).unwrap(), paths);
        board.clearContents();
        assert!(matches!(
            platform::read_input(&board).unwrap(),
            NativeClipboardInput::Empty
        ));
        for kind in [
            ns_string!("public.html"),
            ns_string!("dev.refinex.marklyra.markdown-html"),
        ] {
            let rich = item("file:///own/internal.png");
            assert!(rich.setString_forType(ns_string!("<p>Preserve internal drag</p>"), kind));
            publish(vec![rich]);
            assert!(platform::drop_has_rich_content(&board).unwrap());
        }
        let opaque = item("file:///own/internal.png");
        assert!(opaque.setData_forType(
            &NSData::with_bytes(&[0, 255, 7]),
            ns_string!("org.webkit.custom-pasteboard-data")
        ));
        publish(vec![opaque]);
        assert!(platform::drop_has_rich_content(&board).unwrap());
        let empty_html = item("file:///own/finder.png");
        assert!(empty_html.setString_forType(ns_string!(""), ns_string!("public.html")));
        publish(vec![empty_html]);
        assert!(!platform::drop_has_rich_content(&board).unwrap());
        let oversized = item("file:///own/finder.png");
        assert!(oversized.setData_forType(
            &NSData::with_bytes(&vec![1; MAX_FORMAT_BYTES + 1]),
            ns_string!("org.webkit.custom-pasteboard-data")
        ));
        publish(vec![oversized]);
        assert!(platform::drop_has_rich_content(&board).is_err());
        board.clearContents();
    });
    autoreleasepool(|_| fixture::copy_path_self_test().unwrap());
    println!("AppKit named pasteboard: 29 native cases passed on OS main thread; general clipboard untouched");
}
#[cfg(not(target_os = "macos"))]
fn main() {
    println!(
        "AppKit named pasteboard checks apply only to macOS; no Windows native test is claimed"
    );
}
