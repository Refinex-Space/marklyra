//! Network policy for fetch, pull, push and remote tests: proxy choice, SSH proxy helper and
//! saved HTTPS credentials. Secrets travel only through the child environment, never argv.
use super::{
    error::GitError,
    ops::Repo,
    runner::Cmd,
    types::{GitNetwork, ProxyMode},
    validate,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::{path::PathBuf, time::Duration};

const PROXY_ENV: [&str; 6] = [
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
    "HTTP_PROXY",
    "http_proxy",
];

#[derive(Clone, Debug, Default)]
pub(crate) struct NetPlan {
    configs: Vec<String>,
    env: Vec<(String, String)>,
    env_remove: Vec<&'static str>,
    /// Display form (no credentials) of the proxy carrying the traffic.
    pub proxy: Option<String>,
    proxy_host: Option<String>,
    /// A proxy was in use, so a direct retry is meaningful.
    pub proxied: bool,
    pub timeout: Duration,
}
impl NetPlan {
    pub fn proxy_host(&self) -> Option<&str> {
        self.proxy_host.as_deref()
    }
    pub fn apply<'a>(&self, mut cmd: Cmd<'a>) -> Cmd<'a> {
        for entry in &self.configs {
            cmd = cmd.config(entry.clone());
        }
        for key in &self.env_remove {
            cmd = cmd.env_remove(*key);
        }
        for (key, value) in &self.env {
            cmd = cmd.env(key, value);
        }
        cmd.timeout(self.timeout)
            .proxy_host(self.proxy_host.clone())
    }
}

pub(crate) fn timeout(network: &GitNetwork) -> Duration {
    let seconds = if network.timeout_seconds.is_finite() {
        network.timeout_seconds.clamp(15.0, 1800.0)
    } else {
        120.0
    };
    Duration::from_secs(seconds as u64)
}

pub(crate) fn validate_network(network: &GitNetwork) -> Result<(), GitError> {
    if network.proxy_mode == ProxyMode::Custom {
        validate::proxy_url(&network.proxy_url)?;
    }
    Ok(())
}

/// `HTTPS_PROXY`, `ALL_PROXY`, `HTTP_PROXY` (either case), when it is a valid proxy URL.
pub(crate) fn environment_proxy() -> Option<String> {
    PROXY_ENV.iter().find_map(|key| {
        std::env::var(key)
            .ok()
            .filter(|value| validate::proxy_url(value).is_ok())
    })
}

/// Effective `http.proxy` for `url` (or the repository/global value without a URL).
pub(crate) fn git_config_proxy(cmd: Cmd<'_>, url: Option<&str>) -> Option<String> {
    let cmd = match url {
        Some(url) => cmd.args(["config", "--get-urlmatch", "http.proxy", url]),
        None => cmd.args(["config", "--get", "http.proxy"]),
    };
    cmd.read_only()
        .text()
        .ok()
        .map(|text| text.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn ssh_command_configured(repo: &Repo) -> bool {
    std::env::var_os("GIT_SSH_COMMAND").is_some()
        || std::env::var_os("GIT_SSH").is_some()
        || repo
            .git(["config", "--get", "core.sshCommand"])
            .read_only()
            .text()
            .is_ok_and(|value| !value.trim().is_empty())
}

/// A ProxyCommand helper: `connect.exe` shipped with Git for Windows, or `nc` elsewhere.
fn ssh_helper(repo: &Repo, proxy: &reqwest::Url) -> Option<String> {
    if !proxy.username().is_empty() || proxy.password().is_some() {
        return None;
    }
    let host = proxy.host_str()?;
    let port = proxy.port_or_known_default().or(match proxy.scheme() {
        "socks5" | "socks5h" => Some(1080),
        _ => None,
    })?;
    let address = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    };
    if !address
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':' | '[' | ']'))
    {
        return None;
    }
    let socks = proxy.scheme().starts_with("socks");
    let program = helper_program(repo)?;
    let program = program.to_string_lossy().replace('\\', "/");
    if program.contains(['\'', '"', '%', '\n', '\r']) {
        return None;
    }
    let arguments = if cfg!(windows) {
        format!("{} {address}", if socks { "-S" } else { "-H" })
    } else if socks {
        format!("-X 5 -x {address}")
    } else {
        format!("-X connect -x {address}")
    };
    Some(format!(
        "ssh -o 'ProxyCommand=\"{program}\" {arguments} %h %p'"
    ))
}

fn helper_program(repo: &Repo) -> Option<PathBuf> {
    let directory = repo.exe.path.parent()?;
    let candidates: Vec<PathBuf> = if cfg!(windows) {
        vec![
            directory.join(r"..\mingw64\bin\connect.exe"),
            directory.join("connect.exe"),
            directory.join(r"..\..\mingw64\bin\connect.exe"),
        ]
    } else {
        let mut list: Vec<PathBuf> = std::env::var_os("PATH")
            .map(|value| {
                std::env::split_paths(&value)
                    .filter(|d| d.is_absolute())
                    .map(|d| d.join("nc"))
                    .collect()
            })
            .unwrap_or_default();
        list.push(PathBuf::from("/usr/bin/nc"));
        list
    };
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .and_then(|path| path.canonicalize().ok())
        .map(|path| crate::platform::entry_actions::plain_path(&path))
}

/// The network plan for traffic to `urls` (remote URLs or names already resolved to URLs).
pub(crate) fn plan(
    repo: &Repo,
    network: &GitNetwork,
    urls: &[String],
    direct: bool,
) -> Result<NetPlan, GitError> {
    validate_network(network)?;
    let infos: Vec<_> = urls.iter().map(|url| validate::url_info(url)).collect();
    let http: Vec<_> = infos
        .iter()
        .zip(urls)
        .filter(|(info, _)| matches!(info.protocol, "http" | "https"))
        .collect();
    let has_ssh = infos.iter().any(|info| info.protocol == "ssh");
    let mut plan = NetPlan {
        timeout: timeout(network),
        ..NetPlan::default()
    };
    let mode = if direct {
        ProxyMode::Direct
    } else {
        network.proxy_mode
    };
    let proxy = match mode {
        ProxyMode::Direct => {
            plan.configs.push("http.proxy=".into());
            plan.env_remove.extend(PROXY_ENV);
            plan.env.push(("NO_PROXY".into(), "*".into()));
            plan.env.push(("no_proxy".into(), "*".into()));
            None
        }
        ProxyMode::Custom => Some(network.proxy_url.trim().to_string()),
        ProxyMode::Auto => {
            let configured = http.first().and_then(|(info, _)| {
                git_config_proxy(repo.git(Vec::<String>::new()), Some(&info.display))
            });
            match configured {
                Some(value) => {
                    // git applies its own configuration; MarkLyra only reports it.
                    plan.proxy = Some(validate::proxy_display(&value));
                    plan.proxy_host = reqwest::Url::parse(&value)
                        .ok()
                        .and_then(|url| url.host_str().map(str::to_string));
                    plan.proxied = true;
                    None
                }
                None => crate::agents::network::proxy(),
            }
        }
    };
    if let Some(proxy) = proxy {
        let parsed = validate::proxy_url(&proxy)?;
        let mut used = false;
        if !http.is_empty() {
            plan.configs.push(format!("http.proxy={proxy}"));
            used = true;
        }
        if network.proxy_ssh && has_ssh && !ssh_command_configured(repo) {
            if let Some(command) = ssh_helper(repo, &parsed) {
                plan.configs.push(format!("core.sshCommand={command}"));
                used = true;
            }
        }
        if used {
            plan.proxy = Some(validate::proxy_display(&proxy));
            plan.proxy_host = parsed.host_str().map(str::to_string);
            plan.proxied = true;
        }
    }
    add_credentials(&mut plan, repo.credentials.as_ref(), &infos);
    Ok(plan)
}

/// Saved HTTPS tokens become an `Authorization` header scoped to that host, passed through
/// `GIT_CONFIG_*` environment variables so they never appear in a process listing.
fn add_credentials(plan: &mut NetPlan, root: Option<&PathBuf>, infos: &[validate::UrlInfo]) {
    let Some(root) = root else { return };
    let mut index = std::env::var("GIT_CONFIG_COUNT")
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let start = index;
    let mut seen = std::collections::HashSet::new();
    for info in infos {
        if !matches!(info.protocol, "http" | "https") || info.had_credentials {
            continue;
        }
        let Some(authority) = info.authority.as_deref() else {
            continue;
        };
        if !seen.insert(authority.to_string()) {
            continue;
        }
        let Some((username, token)) = super::credentials::lookup(root, authority) else {
            continue;
        };
        let header = format!(
            "Authorization: Basic {}",
            STANDARD.encode(format!("{username}:{token}"))
        );
        plan.env.push((
            format!("GIT_CONFIG_KEY_{index}"),
            format!("http.{}://{authority}/.extraHeader", info.protocol),
        ));
        plan.env.push((format!("GIT_CONFIG_VALUE_{index}"), header));
        index += 1;
    }
    if index > start {
        plan.env
            .push(("GIT_CONFIG_COUNT".into(), index.to_string()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::types::ProxyMode;
    fn network(mode: ProxyMode, url: &str) -> GitNetwork {
        GitNetwork {
            proxy_mode: mode,
            proxy_url: url.into(),
            proxy_ssh: false,
            fallback_direct: true,
            timeout_seconds: 5.0,
        }
    }
    #[test]
    fn timeouts_are_clamped_and_custom_proxies_validated() {
        assert_eq!(
            timeout(&network(ProxyMode::Auto, "")),
            Duration::from_secs(15)
        );
        let mut long = network(ProxyMode::Auto, "");
        long.timeout_seconds = 1e9;
        assert_eq!(timeout(&long), Duration::from_secs(1800));
        long.timeout_seconds = f64::NAN;
        assert_eq!(timeout(&long), Duration::from_secs(120));
        assert!(validate_network(&network(ProxyMode::Custom, "ftp://x")).is_err());
        assert!(validate_network(&network(ProxyMode::Custom, "socks5://127.0.0.1:1080")).is_ok());
        assert!(validate_network(&network(ProxyMode::Direct, "garbage")).is_ok());
    }
    #[test]
    fn custom_and_direct_plans() {
        let Some(repo) = crate::git::tests::scratch_repo() else {
            return;
        };
        let urls = vec!["https://user:secret@example.com/r.git".to_string()];
        let custom = plan(
            &repo.1,
            &network(ProxyMode::Custom, "http://u:p@127.0.0.1:7890"),
            &urls,
            false,
        )
        .unwrap();
        assert_eq!(custom.proxy.as_deref(), Some("http://127.0.0.1:7890"));
        assert!(custom.proxied);
        assert!(custom
            .configs
            .contains(&"http.proxy=http://u:p@127.0.0.1:7890".to_string()));
        let direct = plan(
            &repo.1,
            &network(ProxyMode::Custom, "http://p:1"),
            &urls,
            true,
        )
        .unwrap();
        assert_eq!(direct.proxy, None);
        assert!(!direct.proxied);
        assert!(direct.configs.contains(&"http.proxy=".to_string()));
        assert!(direct.env.contains(&("NO_PROXY".into(), "*".into())));
        // SSH-only remotes never get an HTTP proxy.
        let ssh = plan(
            &repo.1,
            &network(ProxyMode::Custom, "http://127.0.0.1:7890"),
            &["git@example.com:o/r.git".to_string()],
            false,
        )
        .unwrap();
        assert_eq!(ssh.proxy, None);
        assert!(ssh.configs.is_empty());
    }
}
