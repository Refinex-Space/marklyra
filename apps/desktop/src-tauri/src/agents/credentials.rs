use super::*;

fn entry(id: &str, name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("dev.refinex.marklyra.agents", &format!("{id}:{name}"))
        .map_err(|_| "系统凭据存储不可用".into())
}

pub(super) fn preserve_references(saved: &AgentSettings, incoming: &mut AgentProfile) {
    incoming.secret_keys = saved
        .profiles
        .iter()
        .find(|profile| profile.id == incoming.id)
        .map(|profile| profile.secret_keys.clone())
        .unwrap_or_default();
    for name in &incoming.secret_keys {
        incoming.env.retain(|key, _| {
            if cfg!(windows) {
                !key.eq_ignore_ascii_case(name)
            } else {
                key != name
            }
        });
    }
}

pub(super) fn validate(name: &str, value: Option<&str>) -> Result<(), String> {
    let mut chars = name.chars();
    if name.len() > 80
        || !chars.next().is_some_and(|c| {
            c.is_ascii_alphabetic() || c == '_' || (value.is_none() && c.is_ascii_digit())
        })
        || !chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(
            "变量名须以字母或下划线开头，只能包含字母、数字和下划线，最多 80 个字符".into(),
        );
    }
    if value.is_some_and(|v| v.is_empty() || v.len() > 16384 || v.contains('\0')) {
        return Err("凭据不能为空、包含空字符或超过 16 KiB".into());
    }
    Ok(())
}

pub(super) fn environment(profile: &AgentProfile) -> Result<Vec<(String, String)>, String> {
    profile
        .secret_keys
        .iter()
        .map(|name| {
            validate(name, None)?;
            let value = entry(&profile.id, name)?
                .get_password()
                .map_err(|_| "智能体凭据不可用，请重新设置".to_string())?;
            validate(name, Some(&value))?;
            Ok((name.clone(), value))
        })
        .collect()
}

pub(super) fn revoke_connections(state: &AgentHostState, id: &str) -> Result<(), String> {
    let processes: Vec<_> = {
        let mut connections = state.connections.lock().map_err(|_| "连接状态不可用")?;
        let ids: Vec<_> = connections
            .iter()
            .filter(|(_, process)| process.profile.id == id)
            .map(|(id, _)| id.clone())
            .collect();
        ids.into_iter()
            .filter_map(|id| connections.remove(&id))
            .collect()
    };
    for process in processes {
        process.stop();
    }
    Ok(())
}

fn previous(entry: &keyring::Entry) -> Result<Option<String>, String> {
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("无法读取原凭据，配置未修改".into()),
    }
}
fn remove(entry: &keyring::Entry) -> Result<(), String> {
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("系统拒绝移除凭据，配置未修改".into()),
    }
}

pub(super) fn restore_settings(root: &Path, before: &AgentSettings) -> bool {
    let current = settings(root)
        .and_then(|value| serde_json::to_value(value).map_err(|_| "无法检查配置".into()));
    if let (Ok(current), Ok(expected)) = (current, serde_json::to_value(before)) {
        if current == expected {
            return true;
        }
    }
    save_settings(root, before).is_ok()
}
pub(super) fn update(root: &Path, id: &str, name: &str, value: Option<&str>) -> Result<(), String> {
    validate(name, value)?;
    let entry = entry(id, name)?;
    update_with(root, id, name, value, &entry, |saved| {
        save_settings(root, saved)
    })
}
fn update_with(
    root: &Path,
    id: &str,
    name: &str,
    value: Option<&str>,
    entry: &keyring::Entry,
    commit: impl FnOnce(&AgentSettings) -> Result<(), String>,
) -> Result<(), String> {
    validate(name, value)?;
    let mut saved = settings(root)?;
    let before = saved.clone();
    let profile = saved
        .profiles
        .iter_mut()
        .find(|profile| profile.id == id)
        .ok_or("智能体不存在")?;
    if value.is_some()
        && !profile.secret_keys.iter().any(|key| key == name)
        && profile.secret_keys.len() >= 16
    {
        return Err("单个智能体最多保存 16 个凭据变量".into());
    }
    let old = previous(entry)?;
    // A credential must never reveal an older plaintext value after deletion.
    #[cfg(windows)]
    if profile
        .secret_keys
        .iter()
        .any(|key| key != name && key.eq_ignore_ascii_case(name))
    {
        return Err("已存在同名环境变量，请使用列表中已有的大小写".into());
    }
    profile.env.retain(|key, _| {
        if cfg!(windows) {
            !key.eq_ignore_ascii_case(name)
        } else {
            key != name
        }
    });
    if let Some(value) = value {
        entry
            .set_password(value)
            .map_err(|_| "无法保存凭据，配置未修改")?;
        if !profile.secret_keys.iter().any(|key| key == name) {
            profile.secret_keys.push(name.into());
        }
    } else {
        remove(entry)?;
        profile.secret_keys.retain(|key| key != name);
    }
    if let Err(error) = commit(&saved) {
        let restored = match old {
            Some(value) => entry
                .set_password(&value)
                .map_err(|_| "原凭据恢复失败".to_string()),
            None => remove(entry),
        };
        let metadata_restored = restore_settings(root, &before);
        if restored.is_err() || !metadata_restored {
            return Err(
                "配置保存失败，凭据或配置回滚未确认；请核对 MarkLyra 配置与系统凭据条目".into(),
            );
        }
        return Err(format!("配置保存失败，原凭据状态已恢复：{error}"));
    }
    Ok(())
}

pub(super) fn remove_profile(
    profile: &AgentProfile,
    commit: impl FnOnce() -> Result<(), String>,
) -> Result<(), String> {
    let mut entries = Vec::new();
    for name in &profile.secret_keys {
        let item = entry(&profile.id, name)?;
        let old = previous(&item)?;
        entries.push((item, old));
    }
    let result = entries
        .iter()
        .try_for_each(|(item, _)| remove(item))
        .and_then(|()| commit());
    if let Err(error) = result {
        let mut restored = true;
        for (item, old) in &entries {
            if let Some(old) = old {
                restored &= item.set_password(old).is_ok();
            }
        }
        return Err(if restored {
            error
        } else {
            "卸载未完成，部分凭据恢复未确认；请在系统凭据管理器核对".into()
        });
    }
    Ok(())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Explicit native credential-store probe with an isolated synthetic entry"]
    fn native_keychain_update_remove_and_commit_failure_rollback() {
        let root = tempfile::tempdir().unwrap();
        let id = format!("fixture-{}", Uuid::new_v4());
        let name = "MARKLYRA_TEST_VALUE";
        let entry = keyring::Entry::new("dev.refinex.marklyra.agents.fixture", &id).unwrap();
        assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
        struct Cleanup(keyring::Entry);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = self.0.delete_credential();
            }
        }
        let entry = Cleanup(entry);
        let mut profile = process::test_process(root.path(), root.path())
            .profile
            .clone();
        profile.id = id.clone();
        save_settings(
            root.path(),
            &AgentSettings {
                attention_enabled: true,
                profiles: vec![profile],
                default_profile_id: Some(id.clone()),
            },
        )
        .unwrap();
        let commit = |saved: &AgentSettings| save_settings(root.path(), saved);
        update_with(
            root.path(),
            &id,
            name,
            Some("synthetic-original"),
            &entry.0,
            commit,
        )
        .unwrap();
        assert!(entry
            .0
            .get_password()
            .is_ok_and(|value| value == "synthetic-original"));
        assert!(update_with(
            root.path(),
            &id,
            name,
            Some("synthetic-new"),
            &entry.0,
            |_| Err("fixture failure".into())
        )
        .is_err());
        assert!(entry
            .0
            .get_password()
            .is_ok_and(|value| value == "synthetic-original"));
        assert!(
            update_with(root.path(), &id, name, None, &entry.0, |saved| {
                save_settings(root.path(), saved)?;
                Err("fixture failure after metadata write".into())
            })
            .is_err()
        );
        assert!(settings(root.path()).unwrap().profiles[0]
            .secret_keys
            .iter()
            .any(|key| key == name));
        assert!(entry
            .0
            .get_password()
            .is_ok_and(|value| value == "synthetic-original"));
        update_with(root.path(), &id, name, None, &entry.0, commit).unwrap();
        assert!(matches!(
            entry.0.get_password(),
            Err(keyring::Error::NoEntry)
        ));
        assert!(settings(root.path()).unwrap().profiles[0]
            .secret_keys
            .is_empty());
        assert!(update_with(
            root.path(),
            &id,
            name,
            Some("synthetic-uncommitted"),
            &entry.0,
            |_| Err("fixture failure".into())
        )
        .is_err());
        assert!(matches!(
            entry.0.get_password(),
            Err(keyring::Error::NoEntry)
        ));
        println!("Native credential store passed: synthetic write/read, replacement rollback, new-entry rollback and removal; no user credentials accessed");
    }
}

#[cfg(test)]
mod validation_tests {
    use super::*;
    #[test]
    fn stale_profile_updates_cannot_remove_or_resurrect_secret_references() {
        let root = tempfile::tempdir().unwrap();
        let mut authoritative = process::test_process(root.path(), root.path())
            .profile
            .clone();
        authoritative.secret_keys = vec!["providerAuth".into()];
        let mut stale = authoritative.clone();
        stale.secret_keys = vec!["DELETED_TOKEN".into()];
        stale
            .env
            .insert("providerAuth".into(), "stale plaintext".into());
        stale.env.insert("MODEL".into(), "fixture-model".into());
        let mut saved = AgentSettings {
            attention_enabled: true,
            profiles: vec![authoritative],
            default_profile_id: None,
        };
        preserve_references(&saved, &mut stale);
        assert_eq!(stale.secret_keys, vec!["providerAuth"]);
        assert!(!stale.env.contains_key("providerAuth"));
        assert!(stale.env.contains_key("MODEL"));
        saved.profiles[0].secret_keys.clear();
        preserve_references(&saved, &mut stale);
        assert!(stale.secret_keys.is_empty());
    }
    #[test]
    fn validates_environment_names_and_values_without_changing_case() {
        for name in ["OPENAI_API_KEY", "providerToken", "_TOKEN2"] {
            assert!(validate(name, Some("test-value")).is_ok());
        }
        for name in ["", "2TOKEN", "A=B", "A-B", "A B", "密钥"] {
            assert!(validate(name, Some("test-value")).is_err());
        }
        for value in ["", "value\0suffix"] {
            assert!(validate("TOKEN", Some(value)).is_err());
        }
        assert!(validate("TOKEN", Some(&"x".repeat(16385))).is_err());
        assert!(validate("TOKEN", None).is_ok());
        // Earlier builds allowed digit-leading names; they must remain removable.
        assert!(validate("2TOKEN", None).is_ok());
    }
    #[test]
    fn credential_changes_revoke_only_the_owned_profile_connections() {
        let root = tempfile::tempdir().unwrap();
        let state = AgentHostState::default();
        let first = process::test_process(root.path(), root.path());
        let mut other = process::test_process(root.path(), root.path());
        Arc::get_mut(&mut other).unwrap().profile.id = "other-profile".into();
        state
            .connections
            .lock()
            .unwrap()
            .insert(first.id.clone(), first.clone());
        state
            .connections
            .lock()
            .unwrap()
            .insert(other.id.clone(), other.clone());
        revoke_connections(&state, &first.profile.id).unwrap();
        assert!(!first.live.load(std::sync::atomic::Ordering::Acquire));
        assert!(other.live.load(std::sync::atomic::Ordering::Acquire));
    }
}

#[cfg(all(test, target_os = "macos"))]
mod lifecycle_tests {
    use super::*;
    #[test]
    #[ignore = "Explicit isolated native keychain transaction probe"]
    fn uninstall_rolls_back_credentials_on_failure_and_removes_all_on_success() {
        let root = tempfile::tempdir().unwrap();
        let mut profile = process::test_process(root.path(), root.path())
            .profile
            .clone();
        profile.id = format!("fixture-{}", Uuid::new_v4());
        profile
            .env
            .insert("providerToken".into(), "legacy-fixture-plaintext".into());
        save_settings(
            root.path(),
            &AgentSettings {
                attention_enabled: true,
                profiles: vec![profile.clone()],
                default_profile_id: Some(profile.id.clone()),
            },
        )
        .unwrap();
        struct Cleanup(Vec<keyring::Entry>);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                for entry in &self.0 {
                    let _ = entry.delete_credential();
                }
            }
        }
        let cleanup = Cleanup(vec![
            entry(&profile.id, "providerToken").unwrap(),
            entry(&profile.id, "SECOND_TOKEN").unwrap(),
        ]);
        update(
            root.path(),
            &profile.id,
            "providerToken",
            Some("isolated-token-one"),
        )
        .unwrap();
        update(
            root.path(),
            &profile.id,
            "SECOND_TOKEN",
            Some("isolated-token-two"),
        )
        .unwrap();
        let saved = settings(root.path()).unwrap().profiles.remove(0);
        assert!(!saved.env.contains_key("providerToken"));
        let bytes = fs::read_to_string(root.path().join("profiles.json")).unwrap();
        assert!(
            !bytes.contains("isolated-token-one")
                && !bytes.contains("isolated-token-two")
                && !bytes.contains("legacy-fixture-plaintext")
        );
        assert!(remove_profile(&saved, || Err("fixture commit failure".into())).is_err());
        assert!(cleanup.0[0]
            .get_password()
            .is_ok_and(|value| value == "isolated-token-one"));
        assert!(cleanup.0[1]
            .get_password()
            .is_ok_and(|value| value == "isolated-token-two"));
        profiles::uninstall(root.path(), &profile.id).unwrap();
        assert!(settings(root.path()).unwrap().profiles.is_empty());
        for entry in &cleanup.0 {
            assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
        }
    }
}
