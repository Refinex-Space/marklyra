use document_service::{DocumentService, Encoding};
use serde::Deserialize;
use std::fs;

#[derive(Deserialize)]
struct Fixture {
    id: String,
    source: String,
    from: usize,
    to: usize,
    insert: String,
}

// The shared fixtures use UTF-16 offsets, just like the SDK. Do not index a
// Rust UTF-8 string directly with them or split a surrogate pair.
fn byte_offset(text: &str, offset: usize) -> usize {
    let mut units = 0;
    for (index, point) in text.char_indices() {
        if units == offset {
            return index;
        }
        units += point.len_utf16();
        assert!(units <= offset, "fixture endpoint splits a surrogate pair");
    }
    assert_eq!(units, offset);
    text.len()
}

#[test]
fn composite_sources_keep_physical_encoding_and_outside_bytes_on_save_undo_redo() {
    let fixtures: Vec<Fixture> =
        serde_json::from_str(include_str!("../../../tests/fixtures/source-cases.json")).unwrap();
    for fixture in fixtures {
        let from = byte_offset(&fixture.source, fixture.from);
        let to = byte_offset(&fixture.source, fixture.to);
        let edited = format!(
            "{}{}{}",
            &fixture.source[..from],
            fixture.insert,
            &fixture.source[to..]
        );
        for encoding in [
            Encoding::Utf8,
            Encoding::Utf8Bom,
            Encoding::Utf16LeBom,
            Encoding::Utf16BeBom,
        ] {
            let directory = tempfile::tempdir().unwrap();
            let path = directory.path().join(format!("{}.md", fixture.id));
            let original = encoding.encode(&fixture.source).unwrap();
            fs::write(&path, &original).unwrap();
            let mut service = DocumentService::new();
            let opened = service.open_authorized(&path).unwrap();
            assert_eq!(opened.text, fixture.source);
            assert_eq!(opened.encoding, encoding.label());
            for text in [&fixture.source, &edited, &fixture.source, &edited] {
                service.save(&opened.id, text).unwrap();
                assert_eq!(fs::read(&path).unwrap(), encoding.encode(text).unwrap());
            }
        }
    }
}
