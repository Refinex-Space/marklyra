//! Explicit manual-validation fixture. No monitoring, secret logging or disk backup.
use objc2::{rc::Retained, runtime::ProtocolObject};
use objc2_app_kit::{NSPasteboard, NSPasteboardItem};
use objc2_foundation::{ns_string, NSArray, NSData, NSString};
use std::io::{Read, Write};
use std::time::{Duration, Instant};

const MAX_BACKUP: usize = 32 * 1024 * 1024;
struct Snapshot {
    items: Vec<Retained<NSPasteboardItem>>,
    formats: usize,
    bytes: usize,
    version: isize,
}
impl Snapshot {
    fn read(board: &NSPasteboard) -> Result<Self, String> {
        let version = board.changeCount();
        let mut result = Self {
            items: Vec::new(),
            formats: 0,
            bytes: 0,
            version,
        };
        if let Some(items) = board.pasteboardItems() {
            if items.len() > 1024 {
                return Err("Clipboard backup exceeds item limit; untouched".into());
            }
            for original in items {
                let item = NSPasteboardItem::new();
                let kinds = original.types();
                if kinds.is_empty() {
                    return Err("Clipboard item has no materializable types; untouched".into());
                }
                for kind in kinds {
                    result.formats += 1;
                    if result.formats > 4096 || kind.len() > 1024 {
                        return Err("Clipboard backup exceeds type limit; untouched".into());
                    }
                    let data = original
                        .dataForType(&kind)
                        .ok_or("A clipboard type cannot be materialized; untouched")?;
                    result.bytes = result
                        .bytes
                        .checked_add(data.len())
                        .filter(|bytes| *bytes <= MAX_BACKUP)
                        .ok_or("Clipboard backup exceeds 32 MiB; untouched")?;
                    let copy = NSData::with_bytes(&data.to_vec());
                    if !item.setData_forType(&copy, &kind) {
                        return Err("A clipboard type cannot be cloned; untouched".into());
                    }
                }
                result.items.push(item);
            }
        }
        // Aggregate board types may include AppKit's derived legacy aliases.
        // Opaque item types above are the bytes we must materialize. A legacy
        // board with advertised data but no item representation is unsupported.
        if result.items.is_empty() && board.types().is_some_and(|kinds| !kinds.is_empty()) {
            return Err(
                "Clipboard types are not represented by restorable items; untouched".into(),
            );
        }
        if board.changeCount() != version {
            return Err("Clipboard changed during backup; untouched".into());
        }
        Ok(result)
    }
    fn same_contents(&self, other: &Self) -> bool {
        self.items.len() == other.items.len()
            && self.formats == other.formats
            && self.bytes == other.bytes
            && self.items.iter().zip(&other.items).all(|(left, right)| {
                let kinds = left.types();
                kinds == right.types()
                    && kinds.iter().all(|kind| {
                        match (left.dataForType(&kind), right.dataForType(&kind)) {
                            (Some(left), Some(right)) => left.isEqualToData(&right),
                            _ => false,
                        }
                    })
            })
    }
}
fn publish(board: &NSPasteboard, items: &[Retained<NSPasteboardItem>]) -> Result<isize, String> {
    let version = board.clearContents();
    if items.is_empty() {
        return Ok(version);
    }
    let objects = NSArray::from_retained_slice(
        &items
            .iter()
            .cloned()
            .map(ProtocolObject::from_retained)
            .collect::<Vec<_>>(),
    );
    if !board.writeObjects(&objects) {
        return Err("Native clipboard publication failed".into());
    }
    // AppKit clearContents acquires ownership and increments changeCount;
    // writeObjects does not increment it again. The named-board self-test
    // verifies this before general-fixture mode is used.
    if board.changeCount() != version {
        return Err("Clipboard ownership changed during publication; no overwrite retry".into());
    }
    Ok(version)
}
fn restore(
    board: &NSPasteboard,
    backup: &Snapshot,
    fixture_version: isize,
) -> Result<bool, String> {
    restore_version(board, backup, fixture_version).map(|version| version.is_some())
}
fn restore_version(
    board: &NSPasteboard,
    backup: &Snapshot,
    fixture_version: isize,
) -> Result<Option<isize>, String> {
    if board.changeCount() != fixture_version {
        return Ok(None);
    }
    publish(board, &backup.items).map(Some)
}

struct ExpectedPath {
    text: String,
    html: String,
}
impl ExpectedPath {
    fn new(path: &std::path::Path) -> Result<Self, String> {
        let text = path
            .to_str()
            .filter(|value| path.is_absolute() && value.len() <= 4096 && !value.contains('\0'))
            .ok_or("INVALID_EXPECTED_PATH_UNTOUCHED")?
            .to_owned();
        let escaped = text
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
            .replace('\'', "&#39;");
        Ok(Self {
            text,
            html: format!("<span>{escaped}</span>"),
        })
    }
    fn matches(&self, snapshot: &Snapshot) -> bool {
        if snapshot.items.len() != 1 || snapshot.formats != 2 {
            return false;
        }
        let item = &snapshot.items[0];
        [
            (ns_string!("public.utf8-plain-text"), &self.text),
            (ns_string!("public.html"), &self.html),
        ]
        .iter()
        .all(|(kind, expected)| {
            item.stringForType(kind)
                .is_some_and(|value| value.len() <= 16384 && value.to_string() == **expected)
        })
    }
}
#[derive(Debug, PartialEq, Eq)]
enum CopyPathOutcome {
    VerifiedAndRestored,
    TimeoutUnchanged,
    TimeoutExpectedUnstable,
    ExternalChangePreserved,
}
fn require_preauthorized_access(board: &NSPasteboard) -> Result<(), String> {
    // accessBehavior is read-only metadata, available since macOS 15.4. Do
    // not trigger a new permission prompt or interpret a denied read as empty.
    // SAFETY: The receiver is a live NSPasteboard; the optional property is
    // called only after its selector is confirmed. Both operations are reads.
    let supported: bool =
        unsafe { objc2::msg_send![board, respondsToSelector: objc2::sel!(accessBehavior)] };
    if supported {
        let behavior: isize = unsafe { objc2::msg_send![board, accessBehavior] };
        // NSPasteboardAccessBehaviorAlwaysAllow = 2 in the platform SDK.
        if behavior != 2 {
            return Err("ACCESS_NOT_PREAUTHORIZED_UNTOUCHED".into());
        }
    }
    Ok(())
}
/// Explicit fixture only. This is optimistic changeCount fencing: AppKit has
/// no atomic cross-process compare-and-publish primitive. Detected external
/// changes never authorize restoration or a publication retry.
fn await_copy_path(
    board: &NSPasteboard,
    backup: &Snapshot,
    expected: &ExpectedPath,
    timeout: Duration,
    stable_for: Duration,
    mut before_poll: impl FnMut(),
    before_restore: impl FnOnce(),
) -> Result<CopyPathOutcome, String> {
    let next_version = backup
        .version
        .checked_add(1)
        .ok_or("VERSION_LIMIT_UNTOUCHED")?;
    let started = Instant::now();
    let mut matched = None;
    loop {
        before_poll();
        let version = board.changeCount();
        if matched.is_none() && version == backup.version {
            if started.elapsed() >= timeout {
                let current =
                    Snapshot::read(board).map_err(|_| "TIMEOUT_READ_CHANGED_UNTOUCHED")?;
                return Ok(
                    if current.version == backup.version && backup.same_contents(&current) {
                        CopyPathOutcome::TimeoutUnchanged
                    } else {
                        CopyPathOutcome::ExternalChangePreserved
                    },
                );
            }
        } else {
            // One real product Copy Path calls clearContents once. A skipped
            // version proves another publication occurred, even between polls.
            if version != next_version {
                return Ok(CopyPathOutcome::ExternalChangePreserved);
            }
            let current =
                Snapshot::read(board).map_err(|_| "EXPECTED_VERSION_CHANGED_UNTOUCHED")?;
            if current.version != next_version || !expected.matches(&current) {
                return Ok(CopyPathOutcome::ExternalChangePreserved);
            }
            let since = matched.get_or_insert_with(Instant::now);
            if since.elapsed() >= stable_for {
                before_restore();
                let Some(restored_version) = restore_version(board, backup, next_version)
                    .map_err(|_| "RESTORE_PUBLICATION_FAILED_NO_RETRY")?
                else {
                    return Ok(CopyPathOutcome::ExternalChangePreserved);
                };
                let restored =
                    Snapshot::read(board).map_err(|_| "RESTORE_VERIFICATION_FAILED_NO_RETRY")?;
                if restored.version != restored_version
                    || !backup.same_contents(&restored)
                    || board.changeCount() != restored_version
                {
                    return Err("RESTORE_VERIFICATION_CHANGED_NO_RETRY".into());
                }
                return Ok(CopyPathOutcome::VerifiedAndRestored);
            }
        }
        if started.elapsed() >= timeout {
            return Ok(CopyPathOutcome::TimeoutExpectedUnstable);
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

/// Never publishes a fixture value. The user must invoke the real application's
/// Copy Path action after READY; the captured opaque clipboard stays only in RAM.
pub fn expect_copy_path(path: &std::path::Path) -> Result<(), String> {
    if objc2::MainThreadMarker::new().is_none() {
        return Err("MAIN_THREAD_REQUIRED_UNTOUCHED".into());
    }
    let expected = ExpectedPath::new(path)?;
    let metadata =
        std::fs::symlink_metadata(path).map_err(|_| "EXPECTED_PATH_UNAVAILABLE_UNTOUCHED")?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("EXPECTED_PATH_UNSUPPORTED_UNTOUCHED".into());
    }
    let board = NSPasteboard::generalPasteboard();
    require_preauthorized_access(&board)?;
    let backup = Snapshot::read(&board).map_err(|_| "SNAPSHOT_UNSUPPORTED_UNTOUCHED")?;
    if board.changeCount() != backup.version {
        return Err("SNAPSHOT_CHANGED_UNTOUCHED".into());
    }
    println!(
        "READY items={} formats={} bytes={} change_count={}",
        backup.items.len(),
        backup.formats,
        backup.bytes,
        backup.version
    );
    std::io::stdout()
        .flush()
        .map_err(|_| "READY_OUTPUT_FAILED_UNTOUCHED")?;
    match await_copy_path(
        &board,
        &backup,
        &expected,
        Duration::from_secs(60),
        Duration::from_millis(200),
        || {},
        || {},
    )? {
        CopyPathOutcome::VerifiedAndRestored => {
            println!("VERIFIED_AND_RESTORED");
            Ok(())
        }
        CopyPathOutcome::TimeoutUnchanged => Err("TIMEOUT_UNCHANGED".into()),
        CopyPathOutcome::TimeoutExpectedUnstable => {
            Err("TIMEOUT_EXPECTED_UNSTABLE_NOT_RESTORED".into())
        }
        CopyPathOutcome::ExternalChangePreserved => {
            Err("NOT_RESTORED_EXTERNAL_CHANGE_PRESERVED".into())
        }
    }
}
fn image_item(png: &[u8]) -> Result<Retained<NSPasteboardItem>, String> {
    let item = NSPasteboardItem::new();
    if !item.setData_forType(&NSData::with_bytes(png), ns_string!("public.png")) {
        return Err("PNG clipboard preparation failed; untouched".into());
    }
    Ok(item)
}
fn read_raster(
    path: &std::path::Path,
    format: image_assets::ClipboardFormat,
) -> Result<Vec<u8>, String> {
    validate_selected_fixture(path)?;
    let file = std::fs::File::open(path).map_err(|_| "Cannot open caller-owned raster fixture")?;
    let meta = file
        .metadata()
        .map_err(|_| "Cannot inspect raster fixture")?;
    if !meta.is_file() || meta.len() > image_assets::MAX_IMAGE_BYTES as u64 {
        return Err("Raster fixture must be at most 8 MiB".into());
    }
    let mut bytes = Vec::new();
    file.take(image_assets::MAX_IMAGE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read raster fixture")?;
    image_assets::clipboard_png(&bytes, format).map_err(|_| "Raster fixture validation failed")?;
    Ok(bytes)
}
fn validate_selected_fixture(path: &std::path::Path) -> Result<(), String> {
    if !path.is_absolute()
        || path.as_os_str().len() > 8192
        || path.to_string_lossy().chars().any(char::is_control)
    {
        return Err("Fixture must be an absolute caller-owned path".into());
    }
    let mut current = std::path::PathBuf::new();
    for part in path.components() {
        if matches!(
            part,
            std::path::Component::ParentDir | std::path::Component::CurDir
        ) {
            return Err("Fixture paths cannot contain traversal".into());
        }
        current.push(part);
        let meta =
            std::fs::symlink_metadata(&current).map_err(|_| "Fixture path is unavailable")?;
        if meta.file_type().is_symlink() {
            return Err("Fixture paths cannot contain symlinks".into());
        }
    }
    let meta = std::fs::symlink_metadata(path).map_err(|_| "Fixture path is unavailable")?;
    if !meta.is_file() && !meta.is_dir() {
        return Err("Fixture must be a regular file or directory".into());
    }
    Ok(())
}
fn general_items(items: &[Retained<NSPasteboardItem>]) -> Result<(), String> {
    if objc2::MainThreadMarker::new().is_none() {
        return Err("Main thread required".into());
    }
    if items.is_empty() || items.len() > 32 {
        return Err("Fixture needs 1 to 32 caller-owned items".into());
    }
    let board = NSPasteboard::generalPasteboard();
    require_preauthorized_access(&board)?;
    let backup = Snapshot::read(&board)?;
    if board.changeCount() != backup.version {
        return Err("Clipboard changed before fixture; untouched".into());
    }
    // Preparation is complete. The captured opaque values remain only in RAM.
    let expected_version = backup
        .version
        .checked_add(1)
        .ok_or("VERSION_LIMIT_UNTOUCHED")?;
    let version = match publish(&board, items) {
        Ok(version) => version,
        Err(error) => {
            // clearContents is the one version increment (named-board tests
            // verify it). Restore only while that exact publication is owned.
            if let Some(version) = restore_version(&board, &backup, expected_version)? {
                let restored = Snapshot::read(&board)?;
                if restored.version != version
                    || !backup.same_contents(&restored)
                    || board.changeCount() != version
                {
                    return Err("FAILED_PUBLICATION_RESTORE_CHANGED_NO_RETRY".into());
                }
            }
            return Err(error);
        }
    };
    println!(
        "READY items={} formats={} bytes={} change_count={version}",
        backup.items.len(),
        backup.formats,
        backup.bytes
    );
    let output = std::io::stdout().flush();
    let mut line = String::new();
    let input = if output.is_ok() {
        std::io::stdin().read_line(&mut line)
    } else {
        Err(std::io::Error::other("stdout unavailable"))
    };
    if let Some(restored_version) = restore_version(&board, &backup, version)? {
        let restored = Snapshot::read(&board)?;
        if restored.version != restored_version
            || !backup.same_contents(&restored)
            || board.changeCount() != restored_version
        {
            return Err("RESTORE_VERIFICATION_CHANGED_NO_RETRY".into());
        }
        println!("RESTORED_AND_VERIFIED opaque original clipboard items, formats and bytes");
    } else {
        println!("NOT_RESTORED external clipboard change preserved");
    }
    input.map(|_| ()).map_err(|_| {
        "Fixture input IO failed; ownership-fenced restoration was already attempted".into()
    })
}
pub fn general(path: &std::path::Path) -> Result<(), String> {
    let bytes = read_raster(path, image_assets::ClipboardFormat::Png)?;
    general_items(&[image_item(&bytes)?])
}
pub fn general_tiff(path: &std::path::Path) -> Result<(), String> {
    let bytes = read_raster(path, image_assets::ClipboardFormat::Tiff)?;
    let item = NSPasteboardItem::new();
    if !item.setData_forType(&NSData::with_bytes(&bytes), ns_string!("public.tiff")) {
        return Err("TIFF fixture preparation failed; untouched".into());
    }
    general_items(&[item])
}
pub fn general_html_image(path: &std::path::Path) -> Result<(), String> {
    let bytes = read_raster(path, image_assets::ClipboardFormat::Png)?;
    let item = image_item(&bytes)?;
    if !item.setString_forType(
        ns_string!("<strong>MarkLyra rich priority</strong>"),
        ns_string!("public.html"),
    ) {
        return Err("HTML fixture preparation failed; untouched".into());
    }
    general_items(&[item])
}
fn file_items(paths: &[std::ffi::OsString]) -> Result<Vec<Retained<NSPasteboardItem>>, String> {
    if paths.is_empty() || paths.len() > 32 {
        return Err("File fixture needs 1 to 32 caller-owned paths".into());
    }
    let mut items = Vec::new();
    for path in paths {
        let path = std::path::Path::new(path);
        validate_selected_fixture(path)?;
        let url =
            tauri::Url::from_file_path(path).map_err(|_| "File fixture URI cannot be encoded")?;
        let item = NSPasteboardItem::new();
        if !item.setString_forType(
            &NSString::from_str(url.as_str()),
            ns_string!("public.file-url"),
        ) {
            return Err("File fixture preparation failed; untouched".into());
        }
        items.push(item);
    }
    Ok(items)
}
pub fn general_files(paths: &[std::ffi::OsString]) -> Result<(), String> {
    let items = file_items(paths)?;
    general_items(&items)
}
pub fn self_test() -> Result<(), String> {
    if objc2::MainThreadMarker::new().is_none() {
        return Err("Main thread required".into());
    }
    let board = NSPasteboard::pasteboardWithUniqueName();
    let first = NSPasteboardItem::new();
    assert!(first.setString_forType(
        &NSString::from_str("private fixture text"),
        ns_string!("public.utf8-plain-text")
    ));
    assert!(first.setData_forType(
        &NSData::with_bytes(&[0, 255, 0, 7]),
        ns_string!("org.marklyra.fixture")
    ));
    let second = NSPasteboardItem::new();
    assert!(second.setString_forType(
        &NSString::from_str("second fixture item"),
        ns_string!("public.utf8-plain-text")
    ));
    publish(&board, &[first, second])?;
    let backup = Snapshot::read(&board)?;
    assert_eq!(backup.items.len(), 2);
    assert_eq!(backup.formats, 3);
    let png = include_bytes!("../../../../../crates/image-assets/test-fixtures/clipboard-rgb.png");
    let version = publish(&board, &[image_item(png)?])?;
    assert!(restore(&board, &backup, version)?);
    let restored = Snapshot::read(&board)?;
    assert_eq!(restored.items.len(), backup.items.len());
    for (original, copied) in backup.items.iter().zip(&restored.items) {
        assert_eq!(original.types(), copied.types());
        for kind in original.types() {
            assert_eq!(
                original.dataForType(&kind).unwrap().to_vec(),
                copied.dataForType(&kind).unwrap().to_vec()
            );
        }
    }
    let version = publish(&board, &[image_item(png)?])?;
    let external = NSPasteboardItem::new();
    assert!(external.setString_forType(
        &NSString::from_str("external fixture replacement"),
        ns_string!("public.utf8-plain-text")
    ));
    publish(&board, &[external])?;
    assert!(!restore(&board, &backup, version)?);
    assert_eq!(
        board
            .stringForType(ns_string!("public.utf8-plain-text"))
            .unwrap()
            .to_string(),
        "external fixture replacement"
    );
    let large = NSPasteboardItem::new();
    assert!(large.setData_forType(
        &NSData::with_bytes(&vec![0; MAX_BACKUP + 1]),
        ns_string!("org.marklyra.fixture")
    ));
    publish(&board, &[large])?;
    let version = board.changeCount();
    assert!(Snapshot::read(&board).is_err());
    assert_eq!(board.changeCount(), version);
    board.clearContents();
    println!("Fixture named-pasteboard self-test: 3 cases passed; general clipboard untouched");
    copy_path_self_test()?;
    payload_preparation_self_test()?;
    Ok(())
}

/// All data is owned by this test and all boards have unique names. No access
/// to generalPasteboard, even on a test failure or a timeout.
pub fn copy_path_self_test() -> Result<(), String> {
    if objc2::MainThreadMarker::new().is_none() {
        return Err("Main thread required".into());
    }
    let expected = ExpectedPath::new(std::path::Path::new("/own/Copy &<>'\" 中文.md"))?;
    let content = super::Content {
        text: "/own/Copy &<>'\" 中文.md".into(),
        html: Some("<span>/own/Copy &amp;&lt;&gt;&#39;&quot; 中文.md</span>".into()),
        mark_html: None,
    };
    let original = || {
        let first = NSPasteboardItem::new();
        assert!(first.setData_forType(
            &NSData::with_bytes(&[0, 255, 0, 7]),
            ns_string!("org.marklyra.fixture")
        ));
        assert!(first.setString_forType(
            &NSString::from_str("owned original"),
            ns_string!("public.utf8-plain-text")
        ));
        let second = NSPasteboardItem::new();
        assert!(second.setData_forType(
            &NSData::with_bytes(&[7, 0, 255]),
            ns_string!("org.marklyra.second-fixture")
        ));
        vec![first, second]
    };
    let board = NSPasteboard::pasteboardWithUniqueName();
    require_preauthorized_access(&board)?;
    publish(&board, &original())?;
    let backup = Snapshot::read(&board)?;
    let mut written = false;
    let outcome = await_copy_path(
        &board,
        &backup,
        &expected,
        Duration::from_secs(2),
        Duration::from_millis(200),
        || {
            if !written {
                super::platform::write(&board, &content).unwrap();
                written = true;
            }
        },
        || {},
    )?;
    assert_eq!(outcome, CopyPathOutcome::VerifiedAndRestored);
    assert!(backup.same_contents(&Snapshot::read(&board)?));
    board.clearContents();

    let board = NSPasteboard::pasteboardWithUniqueName();
    publish(&board, &original())?;
    let backup = Snapshot::read(&board)?;
    let outcome = await_copy_path(
        &board,
        &backup,
        &expected,
        Duration::from_millis(30),
        Duration::from_millis(200),
        || {},
        || {},
    )?;
    assert_eq!(outcome, CopyPathOutcome::TimeoutUnchanged);
    assert_eq!(board.changeCount(), backup.version);
    assert!(backup.same_contents(&Snapshot::read(&board)?));
    board.clearContents();

    let board = NSPasteboard::pasteboardWithUniqueName();
    publish(&board, &original())?;
    let backup = Snapshot::read(&board)?;
    let external_item = NSPasteboardItem::new();
    assert!(external_item.setData_forType(
        &NSData::with_bytes(&[3, 0, 8, 255, 4]),
        ns_string!("org.marklyra.external-fixture"),
    ));
    let external = vec![external_item];
    let mut written = false;
    let mut external_version = None;
    let mut external_snapshot = None;
    let outcome = await_copy_path(
        &board,
        &backup,
        &expected,
        Duration::from_secs(2),
        Duration::from_millis(30),
        || {
            if !written {
                super::platform::write(&board, &content).unwrap();
                written = true;
            }
        },
        || {
            external_version = Some(publish(&board, &external).unwrap());
            external_snapshot = Some(Snapshot::read(&board).unwrap());
        },
    )?;
    assert_eq!(outcome, CopyPathOutcome::ExternalChangePreserved);
    assert_eq!(board.changeCount(), external_version.unwrap());
    let current = Snapshot::read(&board)?;
    assert!(current.same_contents(external_snapshot.as_ref().unwrap()));
    assert!(!current.same_contents(&backup));
    // The external opaque payload must survive without another publication.
    assert_eq!(current.version, external_version.unwrap());
    board.clearContents();
    println!("Copy Path named-pasteboard self-test: 3 cases passed; general clipboard untouched");
    Ok(())
}

/// Converts only the caller-supplied fixture through a unique named board.
/// Never reads or writes the general clipboard; output must be a new file.
pub fn export_rtf(input: &std::path::Path, output: &std::path::Path) -> Result<(), String> {
    if objc2::MainThreadMarker::new().is_none() {
        return Err("Main thread required".into());
    }
    let file = std::fs::File::open(input).map_err(|_| "Cannot open RTF fixture")?;
    let metadata = file.metadata().map_err(|_| "Cannot inspect RTF fixture")?;
    if !metadata.is_file() || metadata.len() > super::MAX_FORMAT_BYTES as u64 {
        return Err("RTF fixture exceeds limit".into());
    }
    let mut bytes = Vec::new();
    file.take(super::MAX_FORMAT_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read RTF fixture")?;
    if bytes.len() > super::MAX_FORMAT_BYTES {
        return Err("RTF fixture changed or exceeds limit".into());
    }
    let item = NSPasteboardItem::new();
    if !item.setData_forType(&NSData::with_bytes(&bytes), ns_string!("public.rtf")) {
        return Err("Cannot prepare RTF fixture".into());
    }
    let board = NSPasteboard::pasteboardWithUniqueName();
    publish(&board, &[item])?;
    let result = super::platform::read(&board);
    board.clearContents();
    let json = serde_json::to_vec_pretty(&result?).map_err(|_| "Cannot encode fixture")?;
    let mut output = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output)
        .map_err(|_| "Fixture output must be a new file")?;
    output
        .write_all(&json)
        .map_err(|_| "Cannot write fixture")?;
    println!("EXPORTED caller-owned RTF fixture via named board; general clipboard untouched");
    Ok(())
}

/// Exercises preparation and format ordering only on a unique named board.
fn payload_preparation_self_test() -> Result<(), String> {
    let temporary = tempfile::tempdir().map_err(|_| "Cannot create fixture directory")?;
    let root = std::fs::canonicalize(temporary.path())
        .map_err(|_| "Cannot canonicalize fixture directory")?;
    let png = root.join("own 中文.png");
    let tiff = root.join("own.tiff");
    let markdown = root.join("own.md");
    let directory = root.join("own-folder");
    std::fs::write(
        &png,
        include_bytes!("../../../../../crates/image-assets/test-fixtures/clipboard-rgb.png"),
    )
    .map_err(|_| "Cannot create PNG fixture")?;
    std::fs::write(
        &tiff,
        include_bytes!("../../../../../crates/image-assets/test-fixtures/clipboard-rgb.tiff"),
    )
    .map_err(|_| "Cannot create TIFF fixture")?;
    std::fs::write(&markdown, b"\xef\xbb\xbfown\r\n").map_err(|_| "Cannot create text fixture")?;
    std::fs::create_dir(&directory).map_err(|_| "Cannot create directory fixture")?;
    assert!(file_items(&[]).is_err());
    assert!(file_items(&[root.join("missing").into_os_string()]).is_err());
    let paths = vec![
        png.clone().into_os_string(),
        markdown.clone().into_os_string(),
        directory.into_os_string(),
    ];
    let board = NSPasteboard::pasteboardWithUniqueName();
    publish(&board, &file_items(&paths)?)?;
    let super::NativeClipboardInput::Files(actual) = super::platform::read_input(&board)? else {
        return Err("FILE_FIXTURE_PRIORITY_FAILED".into());
    };
    assert_eq!(
        actual,
        paths
            .iter()
            .map(std::path::PathBuf::from)
            .collect::<Vec<_>>()
    );
    let bytes = read_raster(&tiff, image_assets::ClipboardFormat::Tiff)?;
    let item = NSPasteboardItem::new();
    assert!(item.setData_forType(&NSData::with_bytes(&bytes), ns_string!("public.tiff")));
    publish(&board, &[item])?;
    let super::NativeClipboardInput::Image(image) = super::platform::read_input(&board)? else {
        return Err("TIFF_FIXTURE_PRIORITY_FAILED".into());
    };
    assert_eq!(image.convert()?.mime, "image/png");
    let item = image_item(&read_raster(&png, image_assets::ClipboardFormat::Png)?)?;
    assert!(item.setString_forType(
        ns_string!("<strong>MarkLyra rich priority</strong>"),
        ns_string!("public.html")
    ));
    publish(&board, &[item])?;
    let super::NativeClipboardInput::Content(content) = super::platform::read_input(&board)? else {
        return Err("HTML_FIXTURE_PRIORITY_FAILED".into());
    };
    assert_eq!(
        content.html.as_deref(),
        Some("<strong>MarkLyra rich priority</strong>")
    );
    board.clearContents();
    println!("MarkLyra payload preparation self-test: 3 named-board cases passed; general clipboard untouched");
    Ok(())
}
