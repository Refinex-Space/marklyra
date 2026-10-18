//! Actual document-service I/O timings, not GUI or WebView latency.
use document_service::{DocumentService, Encoding};
#[cfg(unix)]
use std::os::unix::fs::{DirBuilderExt, MetadataExt};
use std::{
    error::Error,
    fs,
    path::PathBuf,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

fn main() -> Result<(), Box<dyn Error>> {
    let input = PathBuf::from(
        std::env::args_os()
            .nth(1)
            .ok_or("fixture directory required")?,
    );
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let temporary = std::env::temp_dir().join(format!(
        "marklyra-io-{}-{nonce}",
        std::process::id()
    ));
    let mut builder = fs::DirBuilder::new();
    #[cfg(unix)]
    builder.mode(0o700);
    builder.create(&temporary)?;
    eprintln!("Self-owned I/O fixtures: {}", temporary.display());
    let mut rows = Vec::new();
    for bytes in [10240usize, 102400, 1048576] {
        for kind in ["plain", "mixed"] {
            let id = format!("{kind}-{bytes}");
            let raw = fs::read_to_string(input.join(format!("{id}.md")))?;
            if raw.len() != bytes {
                return Err("fixture byte count mismatch".into());
            }
            for (codec, name) in [
                (Encoding::Utf8, "utf8"),
                (Encoding::Utf8Bom, "utf8-bom"),
                (Encoding::Utf16LeBom, "utf16le-bom"),
                (Encoding::Utf16BeBom, "utf16be-bom"),
            ] {
                let path = temporary.join(format!("{id}-{name}.md"));
                let physical = codec.encode(&raw)?;
                fs::write(&path, &physical)?;
                let mut opens = Vec::new();
                for _ in 0..20 {
                    let mut service = DocumentService::new();
                    let start = Instant::now();
                    let document = service.open_authorized(&path)?;
                    opens.push(start.elapsed().as_secs_f64() * 1000.0);
                    if document.text != raw {
                        return Err("decoded source changed".into());
                    }
                }
                let mut service = DocumentService::new();
                let document = service.open_authorized(&path)?;
                let before = fs::metadata(&path)?;
                let mut noops = Vec::new();
                for _ in 0..100 {
                    let start = Instant::now();
                    service.save(&document.id, &raw)?;
                    noops.push(start.elapsed().as_secs_f64() * 1000.0);
                    if fs::read(&path)? != physical {
                        return Err("unchanged save altered bytes".into());
                    }
                }
                let after = fs::metadata(&path)?;
                if before.modified()? != after.modified()? {
                    return Err("unchanged save changed mtime".into());
                }
                #[cfg(unix)]
                if before.ino() != after.ino() {
                    return Err("unchanged save changed inode".into());
                }
                let mut saves = Vec::new();
                for index in 1..=100 {
                    let text = format!("{raw}{}", "x".repeat(index));
                    let start = Instant::now();
                    service.save(&document.id, &text)?;
                    saves.push(start.elapsed().as_secs_f64() * 1000.0);
                    if fs::read(&path)? != codec.encode(&text)? {
                        return Err("atomic save changed bytes or encoding".into());
                    }
                }
                service.save(&document.id, &raw)?;
                if fs::read(&path)? != physical {
                    return Err("final restore changed exact physical source".into());
                }
                rows.push(format!("{{\"id\":\"{id}\",\"encoding\":\"{name}\",\"physicalBytes\":{},\"openMs\":{:?},\"unchangedSaveMs\":{:?},\"changedSaveMs\":{:?},\"exact\":true,\"unchangedMtimeAndInode\":true}}", physical.len(), opens, noops, saves));
            }
        }
    }
    fs::remove_dir_all(&temporary)?;
    println!("{{\"scope\":\"Actual native document-service, self-owned temporary filesystem; excludes Tauri/WebView/GUI\",\"cases\":[{}],\"fixtureCleanup\":true}}", rows.join(","));
    Ok(())
}
