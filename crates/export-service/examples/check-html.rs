//! Local fixture checker; this is not exposed to WebViews or IPC.
use std::{error::Error, io::Read};
fn main() -> Result<(), Box<dyn Error>> {
    let path = std::env::args()
        .nth(1)
        .ok_or("usage: check-html <fixture.html> [new-output.html]")?;
    let file = std::fs::File::open(path)?;
    let mut html = String::new();
    file.take(export_service::MAX_HTML_BYTES as u64 + 1)
        .read_to_string(&mut html)?;
    let prepared = export_service::prepare_html(&html)?;
    if let Some(output) = std::env::args().nth(2) {
        use std::io::Write;
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(output)?
            .write_all(prepared.as_bytes())?;
    }
    println!("validated {} UTF-8 bytes", prepared.len());
    Ok(())
}
