//! Product storage names are independent of the bundle identifier. Record
//! schema versions belong in their contents, not in the directory names.
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

const DIRECTORY: &str = "marklyra";

pub fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .data_dir()
        .map(|base| base.join(DIRECTORY))
        .map_err(|error| error.to_string())
}

pub fn config_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .config_dir()
        .map(|base| base.join(DIRECTORY))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_product_roots_use_the_platform_base_without_the_bundle_identifier() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let handle = app.handle();
        assert_eq!(
            data_dir(handle).unwrap(),
            handle.path().data_dir().unwrap().join("marklyra")
        );
        assert_eq!(
            config_dir(handle).unwrap(),
            handle.path().config_dir().unwrap().join("marklyra")
        );
        assert_ne!(
            data_dir(handle).unwrap(),
            handle.path().app_data_dir().unwrap()
        );
        assert_ne!(
            config_dir(handle).unwrap(),
            handle.path().app_config_dir().unwrap()
        );
    }
}
