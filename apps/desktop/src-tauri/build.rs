fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
        for path in [
            "scripts/prepare-native-icons.mjs",
            "scripts/native-titlebar-manifest.json",
            "apps/desktop/src-tauri/icons/titlebar",
        ] {
            println!("cargo:rerun-if-changed={}", root.join(path).display());
        }
        let status = std::process::Command::new("node")
            .arg(root.join("scripts/prepare-native-icons.mjs"))
            .arg("--check")
            .status()
            .expect(
                "Native icon verification requires Node.js; run pnpm prepare:native-icons first",
            );
        assert!(
            status.success(),
            "Native titlebar source verification failed"
        );
    }
    tauri_build::build()
}
