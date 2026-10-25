//! ACP integration adapted and modified for MarkLyra from Markune.
use super::*;

pub(super) fn uninstall(root: &Path, profile_id: &str) -> Result<(), String> {
    uninstall_with(root, profile_id, |saved| save_settings(root, saved))
}
fn uninstall_with(
    root: &Path,
    profile_id: &str,
    commit: impl FnOnce(&AgentSettings) -> Result<(), String>,
) -> Result<(), String> {
    let mut saved = settings(root)?;
    let before = saved.clone();
    let item = saved
        .profiles
        .iter()
        .find(|p| p.id == profile_id)
        .ok_or("智能体不存在")?
        .clone();
    let mut retiring = None;
    if let Some(path) = &item.managed_path {
        let path = PathBuf::from(path);
        if path.is_dir() {
            let checked = path.canonicalize().map_err(|_| "安装目录不可用")?;
            if !checked.starts_with(root.join("installations")) {
                return Err("安装目录越界".into());
            }
            let parked = checked.with_file_name(format!(".removing-{}", Uuid::new_v4()));
            fs::rename(&checked, &parked).map_err(|_| "安装程序仍被占用或无法卸载")?;
            retiring = Some((checked, parked));
        }
    }
    saved.profiles.retain(|p| p.id != profile_id);
    if saved.default_profile_id.as_deref() == Some(profile_id) {
        saved.default_profile_id = saved.profiles.last().map(|p| p.id.clone());
    }
    if let Err(error) = credentials::remove_profile(&item, || commit(&saved)) {
        let metadata_restored = credentials::restore_settings(root, &before);
        if let Some((original, parked)) = &retiring {
            fs::rename(parked, original)
                .map_err(|_| "卸载未完成，安装备份保留在 .removing 目录")?;
        }
        if !metadata_restored {
            return Err("卸载未完成，原配置恢复未确认；请保留应用数据目录并重试".into());
        }
        return Err(error);
    }
    let mut incomplete = Vec::new();
    if let Some((_, parked)) = retiring {
        if fs::remove_dir_all(parked).is_err() {
            incomplete.push("受管安装目录");
        }
    }
    if !incomplete.is_empty() {
        return Err(format!(
            "智能体配置已移除，但 {} 清理未确认；请核对系统凭据管理器和应用数据目录",
            incomplete.join("、")
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(root: &Path, managed: bool, program: &Path) -> AgentProfile {
        let mut profile = process::test_process(root, root).profile.clone();
        profile.managed_path =
            managed.then(|| program.parent().unwrap().to_string_lossy().into_owned());
        profile.executable = program.to_string_lossy().into_owned();
        save_settings(
            root,
            &AgentSettings {
                attention_enabled: true,
                profiles: vec![profile.clone()],
                default_profile_id: Some(profile.id.clone()),
            },
        )
        .unwrap();
        profile
    }
    #[test]
    fn uninstall_removes_owned_payload_but_preserves_local_cli_and_history() {
        for managed in [true, false] {
            let temp = tempfile::tempdir().unwrap();
            let root = temp.path().canonicalize().unwrap();
            let folder = root.join("installations/fixture/1");
            fs::create_dir_all(&folder).unwrap();
            let program = folder.join("agent");
            fs::write(&program, "fixture").unwrap();
            let profile = fixture(&root, managed, &program);
            fs::create_dir(root.join("sessions")).unwrap();
            fs::write(root.join("sessions/history.json"), "keep").unwrap();
            uninstall(&root, &profile.id).unwrap();
            assert!(settings(&root).unwrap().profiles.is_empty());
            assert_eq!(program.exists(), !managed);
            assert!(root.join("sessions/history.json").exists());
        }
    }
    #[test]
    fn failed_settings_commit_restores_the_installed_program() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let folder = root.join("installations/fixture/1");
        fs::create_dir_all(&folder).unwrap();
        let program = folder.join("agent");
        fs::write(&program, "original").unwrap();
        let profile = fixture(&root, true, &program);
        assert!(uninstall_with(&root, &profile.id, |saved| {
            save_settings(&root, saved)?;
            Err("fixture commit failure after write".into())
        })
        .is_err());
        assert_eq!(fs::read_to_string(program).unwrap(), "original");
        assert_eq!(settings(&root).unwrap().profiles.len(), 1);
    }
    #[test]
    fn unmanaged_external_directory_is_never_deleted() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let program = outside.path().join("external");
        fs::write(&program, "protected").unwrap();
        let profile = fixture(&root, true, &program);
        assert!(uninstall(&root, &profile.id).is_err());
        assert_eq!(fs::read_to_string(program).unwrap(), "protected");
        assert_eq!(settings(&root).unwrap().profiles.len(), 1);
    }
}
