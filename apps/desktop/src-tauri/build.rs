fn main() {
    println!("cargo:rerun-if-changed=icons/titlebar");
    tauri_build::build()
}
