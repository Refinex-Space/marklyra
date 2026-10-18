use super::*;
use cap_std::{ambient_authority, fs::Dir};
use image::{DynamicImage, ImageFormat};
use std::{fs, io::Cursor, path::Path};

fn raster(format: ImageFormat) -> Vec<u8> {
    let mut output = Cursor::new(Vec::new());
    DynamicImage::new_rgb8(2, 2)
        .write_to(&mut output, format)
        .unwrap();
    output.into_inner()
}
fn scope(path: &Path) -> ImageScope {
    ImageScope::document_directory(Arc::new(
        Dir::open_ambient_dir(path, ambient_authority()).unwrap(),
    ))
    .with_logical_root(path)
    .unwrap()
}

#[test]
fn real_raster_decoding_determines_mime_and_import_extension() {
    let temp = tempfile::tempdir().unwrap();
    let mut registry = ImageRegistry::default();
    for (format, mime, extension) in [
        (ImageFormat::Png, "image/png", "png"),
        (ImageFormat::Jpeg, "image/jpeg", "jpg"),
        (ImageFormat::Gif, "image/gif", "gif"),
        (ImageFormat::WebP, "image/webp", "webp"),
    ] {
        let bytes = raster(format);
        let imported = registry
            .import_bytes("doc", &scope(temp.path()), "错误扩展.html", bytes.clone())
            .unwrap();
        assert!(imported.source.ends_with(extension));
        assert!(!imported.source.contains("错误"));
        let resource = registry.get(&imported.token).unwrap();
        assert_eq!(resource.mime, mime);
        assert_eq!(resource.bytes.as_ref(), bytes);
        let resolved = registry
            .resolve("doc", &scope(temp.path()), &imported.source)
            .unwrap();
        assert_eq!(resolved.token, imported.token);
    }
    assert_eq!(fs::read_dir(temp.path().join("assets")).unwrap().count(), 4);
}

#[test]
fn malformed_images_and_png_crc_are_rejected_before_writing() {
    let temp = tempfile::tempdir().unwrap();
    let mut registry = ImageRegistry::default();
    for bytes in [
        b"not an image".to_vec(),
        b"\x89PNG\r\n\x1a\n".to_vec(),
        b"GIF89a".to_vec(),
        b"\xff\xd8\xff\xe0fake".to_vec(),
        b"RIFFxxxxWEBP".to_vec(),
    ] {
        assert!(registry
            .import_bytes("doc", &scope(temp.path()), "photo.png", bytes)
            .is_err());
    }
    let mut corrupt = raster(ImageFormat::Png);
    let mut offset = 8;
    loop {
        let length = u32::from_be_bytes(corrupt[offset..offset + 4].try_into().unwrap()) as usize;
        if &corrupt[offset + 4..offset + 8] == b"IDAT" {
            corrupt[offset + 8 + length] ^= 1;
            break;
        }
        offset += length + 12;
    }
    assert!(matches!(
        registry.import_bytes("doc", &scope(temp.path()), "photo.png", corrupt),
        Err(ImageError::InvalidImage)
    ));
    assert!(!temp.path().join("assets").exists());
}

#[test]
fn percent_decoding_occurs_once_and_source_spelling_is_preserved() {
    let temp = tempfile::tempdir().unwrap();
    let bytes = raster(ImageFormat::Png);
    fs::write(temp.path().join("像 素#.png"), &bytes).unwrap();
    fs::write(temp.path().join("%2e%2e.png"), &bytes).unwrap();
    let mut registry = ImageRegistry::default();
    for reference in ["%E5%83%8F%20%E7%B4%A0%23.png", "./%252e%252e.png"] {
        let found = registry
            .resolve("doc", &scope(temp.path()), reference)
            .unwrap();
        assert_eq!(found.source, reference);
        assert_eq!(registry.get(&found.token).unwrap().bytes.as_ref(), bytes);
    }
}

#[test]
fn schemes_absolute_paths_queries_and_out_of_root_parent_references_are_rejected() {
    let temp = tempfile::tempdir().unwrap();
    let scope = scope(temp.path());
    for reference in ["../photo.png", "%2e%2e/photo.png", "images/../../photo.png"] {
        assert!(matches!(
            scope.reference_path(reference),
            Err(ImageError::OutsideScope)
        ));
    }
    for reference in [
        "/etc/photo.png",
        "file:///photo.png",
        "https://example.test/p.png",
        "C:/photo.png",
        "\\\\server\\share\\p.png",
        "%2fetc/photo.png",
        "file%3a%2f%2fphoto",
        "p.png?version=1",
        "p.svg#view",
        "p%00.png",
        "p%ff.png",
        "p%.png",
        "CON.png",
    ] {
        assert!(scope.reference_path(reference).is_err(), "{reference}");
    }
}

#[test]
fn workspace_scope_allows_parent_links_only_inside_granted_root() {
    let temp = tempfile::tempdir().unwrap();
    fs::create_dir_all(temp.path().join("notes/deep")).unwrap();
    fs::create_dir(temp.path().join("shared")).unwrap();
    fs::write(
        temp.path().join("shared/photo.png"),
        raster(ImageFormat::Png),
    )
    .unwrap();
    let root = Arc::new(Dir::open_ambient_dir(temp.path(), ambient_authority()).unwrap());
    let parent = Arc::new(root.open_dir("notes/deep").unwrap());
    let workspace = ImageScope::workspace(root, parent, Path::new("notes/deep")).unwrap();
    let mut registry = ImageRegistry::default();
    let result = registry
        .resolve("doc", &workspace, "../../shared/photo.png")
        .unwrap();
    assert_eq!(result.source, "../../shared/photo.png");
    assert!(matches!(
        registry.resolve("doc", &workspace, "../../../outside.png"),
        Err(ImageError::OutsideScope)
    ));
}

#[test]
fn imports_keep_existing_files_and_use_safe_unique_names() {
    let temp = tempfile::tempdir().unwrap();
    fs::create_dir(temp.path().join("assets")).unwrap();
    fs::write(temp.path().join("assets/photo.png"), b"existing original").unwrap();
    let mut registry = ImageRegistry::default();
    let first = registry
        .import_bytes(
            "doc",
            &scope(temp.path()),
            "../../photo.png",
            raster(ImageFormat::Png),
        )
        .unwrap();
    let second = registry
        .import_bytes(
            "doc",
            &scope(temp.path()),
            "../../photo.png",
            raster(ImageFormat::Png),
        )
        .unwrap();
    assert_ne!(first.source, second.source);
    assert!(first.source.starts_with("assets/photo-"));
    assert!(!first.source.contains(".."));
    assert_eq!(
        fs::read(temp.path().join("assets/photo.png")).unwrap(),
        b"existing original"
    );
    assert_eq!(fs::read_dir(temp.path().join("assets")).unwrap().count(), 3);
}

#[test]
fn quotas_fail_before_import_and_close_releases_tokens_and_memory() {
    let temp = tempfile::tempdir().unwrap();
    let png = raster(ImageFormat::Png);
    let mut registry = ImageRegistry {
        max_document_images: 1,
        max_images: 2,
        max_bytes: png.len() * 2,
        ..ImageRegistry::default()
    };
    let first = registry
        .import_bytes("one", &scope(temp.path()), "a.png", png.clone())
        .unwrap();
    assert!(matches!(
        registry.import_bytes("one", &scope(temp.path()), "b.png", png.clone()),
        Err(ImageError::Capacity)
    ));
    let second = registry
        .import_bytes("two", &scope(temp.path()), "b.png", png.clone())
        .unwrap();
    assert!(matches!(
        registry.import_bytes("three", &scope(temp.path()), "c.png", png.clone()),
        Err(ImageError::Capacity)
    ));
    assert_eq!(fs::read_dir(temp.path().join("assets")).unwrap().count(), 2);
    registry.close_document("one");
    assert!(registry.get(&first.token).is_none());
    assert!(registry.get(&second.token).is_some());
    assert_eq!(registry.bytes, png.len());
    registry
        .import_bytes("three", &scope(temp.path()), "c.png", png)
        .unwrap();
    let empty = tempfile::tempdir().unwrap();
    registry.max_bytes = 1;
    assert!(matches!(
        registry.import_bytes(
            "four",
            &scope(empty.path()),
            "a.png",
            raster(ImageFormat::Png)
        ),
        Err(ImageError::Capacity)
    ));
    assert!(!empty.path().join("assets").exists());
}

#[test]
fn resolving_changed_assets_retires_old_url_and_reuses_quota() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("photo.png"), raster(ImageFormat::Png)).unwrap();
    let mut registry = ImageRegistry {
        max_document_images: 1,
        ..ImageRegistry::default()
    };
    let first = registry
        .resolve("doc", &scope(temp.path()), "photo.png")
        .unwrap();
    fs::write(temp.path().join("photo.png"), raster(ImageFormat::Jpeg)).unwrap();
    let second = registry
        .resolve("doc", &scope(temp.path()), "photo.png")
        .unwrap();
    assert_ne!(first.token, second.token);
    assert!(registry.get(&first.token).is_none());
    assert_eq!(registry.get(&second.token).unwrap().mime, "image/jpeg");
}

#[test]
fn base64_bytes_dimensions_and_animation_are_bounded() {
    let temp = tempfile::tempdir().unwrap();
    let mut registry = ImageRegistry::default();
    assert!(matches!(
        registry.import_base64(
            "doc",
            &scope(temp.path()),
            "a.png",
            "data:image/png;base64,AA=="
        ),
        Err(ImageError::InvalidBase64)
    ));
    assert!(matches!(
        registry.import_base64(
            "doc",
            &scope(temp.path()),
            "a.png",
            &"A".repeat(MAX_BASE64_BYTES + 1)
        ),
        Err(ImageError::TooLarge)
    ));
    assert!(matches!(
        validation::validate(&vec![0; MAX_IMAGE_BYTES + 1]),
        Err(ImageError::TooLarge)
    ));
    let mut gif = raster(ImageFormat::Gif);
    gif[6..8].copy_from_slice(&5000u16.to_le_bytes());
    gif[8..10].copy_from_slice(&5000u16.to_le_bytes());
    assert!(matches!(
        validation::validate(&gif),
        Err(ImageError::DecodeLimit)
    ));
    let mut animation = Vec::new();
    {
        let mut encoder = image::codecs::gif::GifEncoder::new(&mut animation);
        for _ in 0..101 {
            encoder
                .encode_frame(image::Frame::new(image::RgbaImage::new(1, 1)))
                .unwrap();
        }
    }
    assert!(matches!(
        validation::validate(&animation),
        Err(ImageError::DecodeLimit)
    ));
    assert!(!temp.path().join("assets").exists());
}

#[test]
fn svg_requires_a_real_static_svg_document_without_active_or_external_references() {
    let svg=br##"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><defs><path id="p" d="M0 0L10 10"/></defs><use href="#p"/><text>A &amp; B</text></svg>"##;
    assert_eq!(validation::validate(svg).unwrap().mime, "image/svg+xml");
    for svg in [
        r#"<html/>"#,
        r#"<svg/>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg"><path></svg>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/secret"/></svg>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg"><use href="file:///etc/secret"/></svg>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="href" to="https://example.test"/></svg>"#,
        r#"<!DOCTYPE svg SYSTEM "file:///etc/secret"><svg xmlns="http://www.w3.org/2000/svg"/>"#,
        r#"<?xml-stylesheet href="https://example.test/style"?><svg xmlns="http://www.w3.org/2000/svg"/>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg"><text>&missing;</text></svg>"#,
        r#"<?xml version="1.0" encoding="UTF-16"?><svg xmlns="http://www.w3.org/2000/svg"/>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="999999999" height="1"/>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="1000cm" height="1"/>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="8192" height="8192"/>"#,
        r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100000 2"/>"#,
    ] {
        assert!(validation::validate(svg.as_bytes()).is_err(), "{svg}");
    }
    let attributes = (0..127)
        .map(|index| format!(" data-{index}=\"x\""))
        .collect::<String>();
    let bounded = format!("<svg xmlns=\"http://www.w3.org/2000/svg\"{attributes}/>");
    assert!(validation::validate(bounded.as_bytes()).is_ok());
    let excessive = format!("<svg xmlns=\"http://www.w3.org/2000/svg\"{attributes} extra=\"x\"/>");
    assert!(matches!(
        validation::validate(excessive.as_bytes()),
        Err(ImageError::DecodeLimit)
    ));
    assert!(IMAGE_CSP.contains("sandbox;"));
    assert!(IMAGE_CSP.contains("script-src 'none'"));
    assert!(IMAGE_CSP.contains("connect-src 'none'"));
}

#[cfg(unix)]
#[test]
fn symlink_reads_and_asset_directory_escape_are_denied() {
    use std::os::unix::fs::symlink;
    let temp = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("photo.png"), raster(ImageFormat::Png)).unwrap();
    symlink(outside.path(), temp.path().join("images")).unwrap();
    symlink(
        outside.path().join("photo.png"),
        temp.path().join("photo.png"),
    )
    .unwrap();
    symlink(outside.path(), temp.path().join("assets")).unwrap();
    let mut registry = ImageRegistry::default();
    for reference in ["images/photo.png", "photo.png"] {
        assert!(matches!(
            registry.resolve("doc", &scope(temp.path()), reference),
            Err(ImageError::Symlink)
        ));
    }
    assert!(matches!(
        registry.import_bytes(
            "doc",
            &scope(temp.path()),
            "photo.png",
            raster(ImageFormat::Png)
        ),
        Err(ImageError::Symlink)
    ));
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 1);
    assert!(registry.images.is_empty());
}

#[test]
fn imported_sources_reopen_correctly_under_relative_yaml_roots() {
    let temp = tempfile::tempdir().unwrap();
    fs::create_dir(temp.path().join("docs")).unwrap();
    let doc_directory = temp.path().join("docs");
    let image_scope = scope(&doc_directory);
    let bytes = raster(ImageFormat::Png);
    let encoded = STANDARD.encode(&bytes);
    for reference_root in [
        "./media",
        "media/",
        "./图 片",
        "./%E5%9B%BE%20%E7%89%87",
        "../docs/media",
        ".",
        "",
    ] {
        let mut registry = ImageRegistry::default();
        let imported = registry
            .import_base64_with_root("doc", &image_scope, "像 素.png", &encoded, reference_root)
            .unwrap();
        if reference_root.contains("media")
            || reference_root.contains("片")
            || reference_root.contains("%")
        {
            assert!(imported.source.starts_with("../assets/"));
        }
        let reference = if reference_root.is_empty() {
            imported.source.clone()
        } else {
            format!(
                "{}/{}",
                reference_root.trim_end_matches('/'),
                imported.source
            )
        };
        // A fresh registry ensures the relative source can be resolved from disk,
        // not merely displayed through the original import's in-memory URL.
        let mut reopened = ImageRegistry::default();
        let resolved = reopened
            .resolve("new-doc", &image_scope, &reference)
            .unwrap();
        assert_eq!(reopened.get(&resolved.token).unwrap().bytes.as_ref(), bytes);
    }
}

#[test]
fn workspace_yaml_parent_root_never_expands_the_capability_boundary() {
    let temp = tempfile::tempdir().unwrap();
    fs::create_dir(temp.path().join("docs")).unwrap();
    let root = Arc::new(Dir::open_ambient_dir(temp.path(), ambient_authority()).unwrap());
    let parent = Arc::new(root.open_dir("docs").unwrap());
    let workspace = ImageScope::workspace(root, parent, Path::new("docs"))
        .unwrap()
        .with_logical_root(temp.path())
        .unwrap();
    let png = raster(ImageFormat::Png);
    let mut registry = ImageRegistry::default();
    let imported = registry
        .import_base64_with_root(
            "doc",
            &workspace,
            "photo.png",
            &STANDARD.encode(&png),
            "../public",
        )
        .unwrap();
    assert!(imported.source.starts_with("../docs/assets/"));
    let reference = format!("../public/{}", imported.source);
    let mut reopened = ImageRegistry::default();
    let resolved = reopened.resolve("new-doc", &workspace, &reference).unwrap();
    assert_eq!(reopened.get(&resolved.token).unwrap().bytes.as_ref(), png);
    let direct = scope(&temp.path().join("docs"));
    let before = fs::read_dir(temp.path().join("docs/assets"))
        .unwrap()
        .count();
    assert!(matches!(
        registry.import_base64_with_root(
            "direct",
            &direct,
            "photo.png",
            &STANDARD.encode(raster(ImageFormat::Png)),
            "../public"
        ),
        Err(ImageError::OutsideScope)
    ));
    assert_eq!(
        fs::read_dir(temp.path().join("docs/assets"))
            .unwrap()
            .count(),
        before
    );
}

#[test]
fn sixteen_bit_apng_is_rejected_without_entering_decoder_panic_branch() {
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, 2, 2);
        encoder.set_color(png::ColorType::Grayscale);
        encoder.set_depth(png::BitDepth::Sixteen);
        encoder.set_animated(1, 0).unwrap();
        let mut writer = encoder.write_header().unwrap();
        writer.write_image_data(&[0; 8]).unwrap();
        writer.finish().unwrap();
    }
    assert!(matches!(
        validation::validate(&bytes),
        Err(ImageError::UnsupportedAnimation)
    ));
}

#[test]
fn malformed_image_prefix_corpus_does_not_panic() {
    let prefixes: &[&[u8]] = &[
        b"\x89PNG\r\n\x1a\n",
        b"GIF89a",
        b"\xff\xd8\xff\xe0",
        b"RIFFxxxxWEBP",
        b"<svg",
    ];
    let mut random = 0x12345678u32;
    for prefix in prefixes {
        for length in 0..128 {
            let mut bytes = prefix.to_vec();
            for _ in 0..length {
                random = random.wrapping_mul(1664525).wrapping_add(1013904223);
                bytes.push((random >> 24) as u8);
            }
            assert!(std::panic::catch_unwind(|| {
                let _ = validation::validate(&bytes);
            })
            .is_ok());
        }
    }
}

#[test]
fn clipboard_tiff_and_dib_decode_to_png_with_exact_pixels() {
    use image::{GenericImageView, Rgb, RgbImage};
    let pixels = RgbImage::from_fn(2, 2, |x, y| Rgb([(x * 120) as u8, (y * 100) as u8, 42]));
    for format in [ImageFormat::Tiff, ImageFormat::Bmp] {
        let mut output = Cursor::new(Vec::new());
        DynamicImage::ImageRgb8(pixels.clone())
            .write_to(&mut output, format)
            .unwrap();
        let encoded = output.into_inner();
        let (bytes, clipboard_format) = if format == ImageFormat::Bmp {
            (&encoded[14..], ClipboardFormat::Dib)
        } else {
            (encoded.as_slice(), ClipboardFormat::Tiff)
        };
        let png = clipboard_png(bytes, clipboard_format).unwrap();
        let decoded = image::load_from_memory(&png).unwrap();
        assert_eq!(decoded.dimensions(), (2, 2));
        assert_eq!(decoded.to_rgb8(), pixels);
        assert_eq!(clipboard_png(&png, ClipboardFormat::Png).unwrap(), png);
    }
}
#[test]
fn clipboard_dimension_and_length_limits_reject_before_pixel_allocation() {
    let mut dib = vec![0; 44];
    dib[..4].copy_from_slice(&40u32.to_le_bytes());
    dib[4..8].copy_from_slice(&20000i32.to_le_bytes());
    dib[8..12].copy_from_slice(&1i32.to_le_bytes());
    dib[12..14].copy_from_slice(&1u16.to_le_bytes());
    dib[14..16].copy_from_slice(&24u16.to_le_bytes());
    assert!(matches!(
        clipboard_png(&dib, ClipboardFormat::Dib),
        Err(ImageError::DecodeLimit)
    ));
    dib[4..8].copy_from_slice(&2i32.to_le_bytes());
    assert!(matches!(
        clipboard_png(&dib, ClipboardFormat::Dib),
        Err(ImageError::InvalidImage)
    ));
    assert!(matches!(
        clipboard_png(&vec![0; MAX_IMAGE_BYTES + 1], ClipboardFormat::Tiff),
        Err(ImageError::TooLarge)
    ));
    assert!(clipboard_png(b"not tiff", ClipboardFormat::Tiff).is_err());
}
#[test]
fn configured_storage_is_document_relative_and_root_only_changes_reference() {
    let temp = tempfile::tempdir().unwrap();
    let scope = scope(temp.path());
    let mut registry = ImageRegistry::default();
    let bytes = STANDARD.encode(raster(ImageFormat::Png));
    for folder in [".", "assets", "images/截图", "a/../b", "a/./b"] {
        let imported = registry
            .import_base64_with_folder("doc", &scope, "clip.png", &bytes, "yaml-root", folder)
            .unwrap();
        assert!(imported.source.starts_with("../"));
        assert!(!temp.path().join("yaml-root").exists());
        let effective = ImageScope::document_directory(Arc::new(
            Dir::open_ambient_dir(temp.path(), ambient_authority()).unwrap(),
        ))
        .with_logical_root(temp.path())
        .unwrap();
        let actual = imported.source.strip_prefix("../").unwrap();
        assert!(registry.resolve("doc", &effective, actual).is_ok());
    }
    for folder in [
        "",
        "../outside",
        "/absolute",
        "a//b",
        "a\\b",
        "CON",
        "x.",
        "x ",
        "C:/escape",
    ] {
        assert!(
            registry
                .import_base64_with_folder("doc", &scope, "clip.png", &bytes, "", folder)
                .is_err(),
            "{folder}"
        );
    }
}
#[cfg(unix)]
#[test]
fn custom_storage_rejects_symlink_at_every_depth_without_touching_target() {
    use std::os::unix::fs::symlink;
    let temp = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::create_dir(temp.path().join("images")).unwrap();
    symlink(outside.path(), temp.path().join("images/escape")).unwrap();
    let mut registry = ImageRegistry::default();
    let bytes = STANDARD.encode(raster(ImageFormat::Png));
    assert!(matches!(
        registry.import_base64_with_folder(
            "doc",
            &scope(temp.path()),
            "clip.png",
            &bytes,
            "",
            "images/escape/nested"
        ),
        Err(ImageError::Symlink)
    ));
    assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
}

#[test]
fn parent_and_absolute_storage_targets_are_limited_to_the_existing_workspace_root() {
    let temp = tempfile::tempdir().unwrap();
    let path = std::fs::canonicalize(temp.path()).unwrap();
    std::fs::create_dir(path.join("docs")).unwrap();
    let scope = ImageScope::workspace(
        Arc::new(Dir::open_ambient_dir(&path, ambient_authority()).unwrap()),
        Arc::new(Dir::open_ambient_dir(path.join("docs"), ambient_authority()).unwrap()),
        std::path::Path::new("docs"),
    )
    .unwrap()
    .with_logical_root(&path)
    .unwrap();
    let bytes = raster(ImageFormat::Png);
    let mut registry = ImageRegistry::default();
    for folder in [
        "../shared".to_owned(),
        path.join("shared/absolute").to_str().unwrap().to_owned(),
        "media%20literal".to_owned(),
    ] {
        let imported = registry
            .import_bytes_with_folder(
                "doc",
                &scope,
                "same.png",
                bytes.clone(),
                "../reference-root",
                &folder,
            )
            .unwrap();
        let reference = format!("../reference-root/{}", imported.source);
        let mut fresh = ImageRegistry::default();
        let reopened = fresh.resolve("other", &scope, &reference).unwrap();
        assert_eq!(fresh.get(&reopened.token).unwrap().bytes.as_ref(), bytes);
    }
    assert!(path.join("docs/media%20literal").is_dir());
    assert!(!path.join("docs/media literal").exists());
    let outside = tempfile::tempdir().unwrap();
    for folder in [
        "../../escape".to_owned(),
        outside
            .path()
            .join("not-created")
            .to_str()
            .unwrap()
            .to_owned(),
    ] {
        assert!(matches!(
            registry.import_bytes_with_folder(
                "doc",
                &scope,
                "same.png",
                bytes.clone(),
                "",
                &folder
            ),
            Err(ImageError::OutsideScope)
        ));
    }
    assert!(!outside.path().join("not-created").exists());
    let direct = ImageScope::document_directory(Arc::new(
        Dir::open_ambient_dir(path.join("docs"), ambient_authority()).unwrap(),
    ))
    .with_logical_root(&path.join("docs"))
    .unwrap();
    assert!(matches!(
        registry.import_bytes_with_folder("direct", &direct, "same.png", bytes, "", "../shared"),
        Err(ImageError::OutsideScope)
    ));
}

#[test]
fn absolute_and_local_file_urls_decode_once_and_never_expand_a_scope() {
    let temp = tempfile::tempdir().unwrap();
    let path = std::fs::canonicalize(temp.path()).unwrap();
    let scope = scope(&path).with_logical_root(&path).unwrap();
    let bytes = raster(ImageFormat::Png);
    std::fs::write(path.join("space #.png"), &bytes).unwrap();
    std::fs::write(path.join("%2e.png"), &bytes).unwrap();
    let encoded = format!("{}/space%20%23.png", path.to_str().unwrap());
    let mut registry = ImageRegistry::default();
    for reference in [
        encoded.clone(),
        format!("file://{encoded}"),
        format!("file://localhost{encoded}"),
        format!("file://LOCALHOST{encoded}"),
        format!("file://{}/%252e.png", path.display()),
    ] {
        let found = registry.resolve("doc", &scope, &reference).unwrap();
        assert_eq!(found.source, reference);
        assert_eq!(registry.get(&found.token).unwrap().bytes.as_ref(), bytes);
    }
    for reference in [
        format!("file://example.test{encoded}"),
        format!("file://localhost:80{encoded}"),
        format!("file://user@localhost{encoded}"),
        format!("file://{encoded}?q=1"),
        format!("file://{encoded}#part"),
        format!("//localhost{encoded}"),
        "https://example.test/x.png".to_owned(),
    ] {
        assert!(
            matches!(
                registry.resolve("doc", &scope, &reference),
                Err(ImageError::InvalidReference)
            ),
            "{reference}"
        );
    }
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("secret.png"), bytes).unwrap();
    assert!(matches!(
        registry.resolve(
            "doc",
            &scope,
            &format!("file://{}/secret.png", outside.path().display())
        ),
        Err(ImageError::OutsideScope)
    ));
}

#[cfg(unix)]
#[test]
fn absolute_file_read_and_parent_storage_refuse_even_in_scope_symlink_targets() {
    use std::os::unix::fs::symlink;
    let temp = tempfile::tempdir().unwrap();
    let path = std::fs::canonicalize(temp.path()).unwrap();
    std::fs::create_dir(path.join("real")).unwrap();
    let bytes = raster(ImageFormat::Png);
    std::fs::write(path.join("real/image.png"), &bytes).unwrap();
    symlink("real", path.join("alias")).unwrap();
    symlink("real/image.png", path.join("single.png")).unwrap();
    let scope = scope(&path).with_logical_root(&path).unwrap();
    let mut registry = ImageRegistry::default();
    for reference in [
        format!("file://{}/alias/image.png", path.display()),
        path.join("single.png").to_str().unwrap().to_owned(),
    ] {
        assert!(matches!(
            registry.resolve("doc", &scope, &reference),
            Err(ImageError::Symlink)
        ));
    }
    assert!(matches!(
        registry.import_bytes_with_folder(
            "doc",
            &scope,
            "copy.png",
            bytes,
            "",
            path.join("alias").to_str().unwrap()
        ),
        Err(ImageError::Symlink)
    ));
    assert_eq!(std::fs::read_dir(path.join("real")).unwrap().count(), 1);
}
