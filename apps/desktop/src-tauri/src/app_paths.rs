//! Product storage names are independent of the bundle identifier. Development
//! runs must not contend with an installed release's exclusive draft store.
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

const fn profile_directory(development: bool) -> &'static str {
    if development {
        "marklyra-dev"
    } else {
        "marklyra"
    }
}
const DIRECTORY: &str = profile_directory(cfg!(debug_assertions));

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

pub fn local_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .local_data_dir()
        .map(|base| base.join(DIRECTORY))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_keeps_its_existing_namespace_and_development_is_separate() {
        assert_eq!(profile_directory(false), "marklyra");
        assert_eq!(profile_directory(true), "marklyra-dev");
    }

    #[test]
    #[cfg(debug_assertions)]
    fn development_can_start_while_release_owns_its_recovery_store() {
        let base = tempfile::tempdir().unwrap();
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let production = base.path().join("marklyra/recovery");
        let _release = recovery_store::RecoveryStore::open(&production).unwrap();
        let development = base
            .path()
            .join(data_dir(app.handle()).unwrap().file_name().unwrap())
            .join("recovery");
        assert!(
            recovery_store::RecoveryStore::open(&development).is_ok(),
            "development must not contend with the installed release's draft lock"
        );
        assert!(matches!(
            recovery_store::RecoveryStore::open(&production),
            Err(recovery_store::RecoveryError::Busy)
        ));
    }

    #[test]
    fn native_product_roots_use_the_platform_base_without_the_bundle_identifier() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let handle = app.handle();
        let directory = if cfg!(debug_assertions) {
            "marklyra-dev"
        } else {
            "marklyra"
        };
        assert_eq!(
            data_dir(handle).unwrap(),
            handle.path().data_dir().unwrap().join(directory)
        );
        assert_eq!(
            config_dir(handle).unwrap(),
            handle.path().config_dir().unwrap().join(directory)
        );
        assert_eq!(
            local_data_dir(handle).unwrap(),
            handle.path().local_data_dir().unwrap().join(directory)
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
