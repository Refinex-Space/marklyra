//! HTTPS tokens per host in the system credential store. Only host and user name are kept in
//! the preferences file; the token never leaves the native host.
use super::{error::GitError, types::GitCredential, validate};
use crate::preferences_store::{PreferenceRecord, Store};
use serde::{Deserialize, Serialize};
use std::path::Path;

const SERVICE: &str = "dev.refinex.marklyra.git";
const MAX_HOSTS: usize = 64;

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Hosts {
    hosts: Vec<GitCredential>,
}
impl PreferenceRecord for Hosts {
    const MAX_BYTES: usize = 16 * 1024;
    fn validate(&self) -> Result<(), String> {
        if self.hosts.len() > MAX_HOSTS {
            return Err("保存的 Git 凭据过多".into());
        }
        let mut seen = std::collections::HashSet::new();
        for item in &self.hosts {
            let host = validate::host(&item.host).map_err(|e| e.message)?;
            if host != item.host || !seen.insert(host) {
                return Err("Git 凭据记录无效".into());
            }
            validate::short_text(&item.username, "用户名").map_err(|e| e.message)?;
        }
        Ok(())
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Secret {
    username: String,
    token: String,
}

fn entry(host: &str) -> Result<keyring::Entry, GitError> {
    keyring::Entry::new(SERVICE, host).map_err(|_| GitError::new("failed", "系统凭据存储不可用"))
}

fn store(root: &Path) -> Result<Store<Hosts>, GitError> {
    Store::open(root).map_err(|e| GitError::new("failed", e))
}

pub(crate) fn list(root: &Path) -> Result<Vec<GitCredential>, GitError> {
    Ok(store(root)?
        .get()
        .map_err(|e| GitError::new("failed", e))?
        .hosts)
}

pub(crate) fn save(root: &Path, host: &str, username: &str, token: &str) -> Result<(), GitError> {
    let host = validate::host(host)?;
    let username = validate::short_text(username, "用户名")?;
    validate::token(token)?;
    let secret = serde_json::to_string(&Secret {
        username: username.clone(),
        token: token.to_string(),
    })
    .map_err(|_| GitError::new("failed", "无法编码凭据"))?;
    let store = store(root)?;
    let item = entry(&host)?;
    let previous = match item.get_password() {
        Ok(value) => Some(value),
        Err(keyring::Error::NoEntry) => None,
        Err(_) => return Err(GitError::new("failed", "无法读取原凭据，未做修改")),
    };
    let known = list(root)?;
    if !known.iter().any(|c| c.host == host) && known.len() >= MAX_HOSTS {
        return Err(GitError::invalid(format!(
            "最多保存 {MAX_HOSTS} 个主机的凭据"
        )));
    }
    item.set_password(&secret)
        .map_err(|_| GitError::new("failed", "无法保存凭据到系统凭据存储"))?;
    let result = store.transaction(|state| {
        state.hosts.retain(|c| c.host != host);
        state.hosts.push(GitCredential {
            host: host.clone(),
            username: username.clone(),
        });
        state.hosts.sort_by(|a, b| a.host.cmp(&b.host));
        Ok(((), true))
    });
    if let Err(error) = result {
        let restored = match previous {
            Some(value) => item.set_password(&value).is_ok(),
            None => matches!(
                item.delete_credential(),
                Ok(()) | Err(keyring::Error::NoEntry)
            ),
        };
        return Err(GitError::new(
            "failed",
            if restored {
                format!("凭据列表保存失败，已恢复原凭据：{error}")
            } else {
                "凭据列表保存失败，且原凭据恢复未确认；请在系统凭据管理器中核对".into()
            },
        ));
    }
    Ok(())
}

pub(crate) fn remove(root: &Path, host: &str) -> Result<(), GitError> {
    let host = validate::host(host)?;
    let item = entry(&host)?;
    let previous = match item.get_password() {
        Ok(value) => Some(value),
        Err(keyring::Error::NoEntry) => None,
        Err(_) => return Err(GitError::new("failed", "无法读取凭据，未做修改")),
    };
    match item.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(_) => return Err(GitError::new("failed", "系统拒绝移除凭据，未做修改")),
    }
    let result = store(root)?.transaction(|state| {
        let before = state.hosts.len();
        state.hosts.retain(|c| c.host != host);
        Ok(((), state.hosts.len() != before))
    });
    if let Err(error) = result {
        if let Some(value) = previous {
            let _ = item.set_password(&value);
        }
        return Err(GitError::new(
            "failed",
            format!("凭据列表保存失败：{error}"),
        ));
    }
    Ok(())
}

/// User name and token saved for `authority` (`host` or `host:port`), if any.
pub(crate) fn lookup(root: &Path, authority: &str) -> Option<(String, String)> {
    let known = list(root).ok()?;
    if !known.iter().any(|c| c.host == authority) {
        return None;
    }
    let secret: Secret = serde_json::from_str(&entry(authority).ok()?.get_password().ok()?).ok()?;
    if validate::short_text(&secret.username, "用户名").is_err()
        || validate::token(&secret.token).is_err()
    {
        return None;
    }
    Some((secret.username, secret.token))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn host_records_are_validated_without_touching_the_keyring() {
        let root = tempfile::tempdir().unwrap();
        assert!(list(root.path()).unwrap().is_empty());
        assert!(lookup(root.path(), "example.com").is_none());
        let valid = Hosts {
            hosts: vec![GitCredential {
                host: "example.com".into(),
                username: "me".into(),
            }],
        };
        assert!(valid.validate().is_ok());
        let upper = Hosts {
            hosts: vec![GitCredential {
                host: "Example.com".into(),
                username: "me".into(),
            }],
        };
        assert!(upper.validate().is_err());
        let duplicate = Hosts {
            hosts: vec![valid.hosts[0].clone(), valid.hosts[0].clone()],
        };
        assert!(duplicate.validate().is_err());
        assert!(save(root.path(), "bad host", "me", "t").is_err());
        assert!(save(root.path(), "example.com", "me", "with space").is_err());
    }
}
