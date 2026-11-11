//! Puts a small `marklyra` launcher in the person's own bin folder (no administrator rights):
//! it runs this app's executable with `--cli`, so the command line always matches the installed
//! app. A file there that MarkLyra did not write is never replaced or removed.
use serde::Serialize;
use std::path::{Path, PathBuf};

const MARKER: &str = "MarkLyra 命令行启动器";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CliStatus {
    /// Where the launcher goes.
    path: String,
    /// The folder, for the PATH hint.
    directory: String,
    installed: bool,
    /// A launcher written by MarkLyra (ours to replace or remove).
    ours: bool,
    /// It launches this very app.
    current: bool,
    /// The folder is on PATH, so `marklyra` works in a new terminal.
    on_path: bool,
}

fn directory() -> Result<PathBuf, String> {
    #[cfg(windows)]
    {
        let base = std::env::var_os("LOCALAPPDATA").ok_or("找不到 LOCALAPPDATA")?;
        Ok(PathBuf::from(base).join("MarkLyra").join("bin"))
    }
    #[cfg(not(windows))]
    {
        let home = std::env::var_os("HOME").ok_or("找不到主目录")?;
        Ok(PathBuf::from(home).join(".local").join("bin"))
    }
}
fn launcher_name() -> &'static str {
    if cfg!(windows) {
        "marklyra.cmd"
    } else {
        "marklyra"
    }
}

/// The launcher text for an executable path.
fn script(exe: &Path) -> String {
    let exe = exe.to_string_lossy();
    if cfg!(windows) {
        format!("@echo off\r\nrem {MARKER}；删除此文件即可卸载\r\n\"{exe}\" --cli %*\r\n")
    } else {
        // Single quotes keep every character literal; a quote inside is closed, escaped, reopened.
        let quoted = format!("'{}'", exe.replace('\'', "'\\''"));
        format!("#!/bin/sh\n# {MARKER}；删除此文件即可卸载\nexec {quoted} --cli \"$@\"\n")
    }
}

fn on_path(dir: &Path) -> bool {
    std::env::var_os("PATH").is_some_and(|p| std::env::split_paths(&p).any(|entry| entry == dir))
}

pub(crate) fn status_in(dir: &Path, exe: &Path) -> CliStatus {
    let path = dir.join(launcher_name());
    let existing = std::fs::read_to_string(&path).ok();
    let ours = existing.as_deref().is_some_and(|t| t.contains(MARKER));
    CliStatus {
        path: path.to_string_lossy().into_owned(),
        directory: dir.to_string_lossy().into_owned(),
        installed: path.exists(),
        ours,
        current: existing.as_deref() == Some(script(exe).as_str()),
        on_path: on_path(dir),
    }
}

pub(crate) fn install_in(dir: &Path, exe: &Path) -> Result<CliStatus, String> {
    let path = dir.join(launcher_name());
    if let Ok(meta) = std::fs::symlink_metadata(&path) {
        let ours = !meta.file_type().is_symlink()
            && std::fs::read_to_string(&path).is_ok_and(|t| t.contains(MARKER));
        if !ours {
            return Err(format!(
                "{} 已存在且不是 MarkLyra 安装的，未改动",
                path.display()
            ));
        }
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let temp = dir.join(format!(".{}.tmp", launcher_name()));
    std::fs::write(&temp, script(exe)).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    std::fs::rename(&temp, &path).map_err(|e| e.to_string())?;
    Ok(status_in(dir, exe))
}

pub(crate) fn uninstall_in(dir: &Path, exe: &Path) -> Result<CliStatus, String> {
    let status = status_in(dir, exe);
    if status.installed && !status.ours {
        return Err(format!("{} 不是 MarkLyra 安装的，未删除", status.path));
    }
    if status.installed {
        std::fs::remove_file(&status.path).map_err(|e| e.to_string())?;
    }
    Ok(status_in(dir, exe))
}

fn exe() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn cli_status() -> Result<CliStatus, String> {
    Ok(status_in(&directory()?, &exe()?))
}
#[tauri::command]
pub(crate) fn cli_install() -> Result<CliStatus, String> {
    install_in(&directory()?, &exe()?)
}
#[tauri::command]
pub(crate) fn cli_uninstall() -> Result<CliStatus, String> {
    uninstall_in(&directory()?, &exe()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn installs_replaces_its_own_launcher_and_never_touches_foreign_files() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("bin");
        let exe = Path::new("/Applications/Mark Lyra's.app/Contents/MacOS/marklyra-desktop");
        let fresh = status_in(&bin, exe);
        assert!(!fresh.installed);
        let installed = install_in(&bin, exe).unwrap();
        assert!(installed.installed && installed.ours && installed.current);
        let text = std::fs::read_to_string(bin.join(launcher_name())).unwrap();
        if !cfg!(windows) {
            assert!(text.contains("exec '/Applications/Mark Lyra'\\''s.app/Contents/MacOS/marklyra-desktop' --cli \"$@\""));
        }
        // A newer app location replaces our own launcher.
        let moved = Path::new("/Applications/MarkLyra.app/Contents/MacOS/marklyra-desktop");
        assert!(!status_in(&bin, moved).current);
        assert!(install_in(&bin, moved).unwrap().current);
        assert!(!uninstall_in(&bin, moved).unwrap().installed);
        // Someone else's `marklyra` stays as it is.
        std::fs::write(bin.join(launcher_name()), "#!/bin/sh\necho mine\n").unwrap();
        assert!(install_in(&bin, exe).is_err());
        assert!(uninstall_in(&bin, exe).is_err());
        assert_eq!(
            std::fs::read_to_string(bin.join(launcher_name())).unwrap(),
            "#!/bin/sh\necho mine\n"
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_launcher_runs_the_command_line() {
        let dir = tempfile::tempdir().unwrap();
        // Stand in for the app with a script that echoes its arguments.
        let fake = dir.path().join("fake app");
        std::fs::write(&fake, "#!/bin/sh\nprintf '%s|' \"$@\"\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).unwrap();
        let bin = dir.path().join("bin");
        install_in(&bin, &fake).unwrap();
        let out = std::process::Command::new(bin.join("marklyra"))
            .args(["task", "list", "a b"])
            .output()
            .unwrap();
        assert_eq!(String::from_utf8_lossy(&out.stdout), "--cli|task|list|a b|");
    }
}
