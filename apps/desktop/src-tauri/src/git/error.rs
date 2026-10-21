//! Host errors travel to the client as `[code] message\n\ndetail` (see `services/git.ts`).
//! Classification reads git's English messages (`LC_ALL=C`); details never carry credentials.

const DETAIL_LIMIT: usize = 2000;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct GitError {
    pub code: &'static str,
    pub message: String,
    pub detail: String,
}
impl GitError {
    pub fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: String::new(),
        }
    }
    pub fn invalid(message: impl Into<String>) -> Self {
        Self::new("invalid", message)
    }
    pub fn with_detail(mut self, stderr: &str) -> Self {
        self.detail = detail(stderr);
        self
    }
}
impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)?;
        if !self.detail.is_empty() {
            write!(f, "\n\n{}", self.detail)?;
        }
        Ok(())
    }
}
impl From<GitError> for String {
    fn from(error: GitError) -> Self {
        error.to_string()
    }
}

/// The last part of git's diagnostics, without credentials, bounded.
pub(crate) fn detail(stderr: &str) -> String {
    let text = redact(stderr.trim());
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.trim().is_empty())
        .collect();
    let mut result = lines.join("\n");
    if result.chars().count() > DETAIL_LIMIT {
        let skip = result.chars().count() - DETAIL_LIMIT;
        result = format!("…{}", result.chars().skip(skip).collect::<String>());
    }
    result
}

fn first_line(stderr: &str) -> String {
    let lines: Vec<&str> = stderr
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    let line = lines
        .iter()
        .find(|line| line.starts_with("fatal:") || line.starts_with("error:"))
        .or_else(|| lines.iter().find(|line| !line.starts_with("hint:")))
        .copied()
        .unwrap_or("");
    let line = line
        .trim_start_matches("fatal:")
        .trim_start_matches("error:")
        .trim();
    redact(line).chars().take(300).collect()
}

/// Maps git's diagnostics to a client error code with a Chinese message.
pub(crate) fn classify(stderr: &str, proxy_host: Option<&str>) -> GitError {
    let lower = stderr.to_lowercase();
    let has = |needle: &str| lower.contains(&needle.to_lowercase());
    let any = |needles: &[&str]| needles.iter().any(|needle| has(needle));
    let (code, message): (&'static str, String) = if has("detected dubious ownership") {
        (
            "dubious-ownership",
            "仓库目录归属与当前用户不一致，Git 拒绝访问；确认可信后可将其加入安全目录".into(),
        )
    } else if has("not a git repository") {
        ("not-repository", "当前文件夹不是 Git 仓库".into())
    } else if has("host key verification failed") {
        (
            "auth",
            "SSH 主机密钥校验失败：请先在终端中连接一次该主机并确认指纹".into(),
        )
    } else if any(&[
        "authentication failed",
        "could not read username",
        "could not read password",
        "permission denied (publickey",
        "terminal prompts disabled",
        "returned error: 401",
        "returned error: 403",
        "http basic: access denied",
        "invalid username or password",
        "permission to ",
    ]) {
        (
            "auth",
            "认证失败：请检查凭据（HTTPS 令牌/凭据管理器）或 SSH 密钥".into(),
        )
    } else if any(&[
        "could not resolve proxy",
        "proxy connect aborted",
        "received http code 407",
        "returned error: 407",
        "unsupported proxy",
        "socks",
    ]) || (has("proxy") && has("connection refused"))
        || proxy_host
            .is_some_and(|host| !host.is_empty() && has(&format!("failed to connect to {host}")))
    {
        ("proxy", "无法通过代理连接：请检查代理设置或改用直连".into())
    } else if any(&[
        "could not resolve host",
        "failed to connect",
        "connection timed out",
        "connection refused",
        "unable to access",
        "operation timed out",
        "ssl",
        "early eof",
        "the remote end hung up",
        "connection reset",
        "network is unreachable",
        "could not read from remote repository",
    ]) {
        ("network", "无法连接远程仓库：请检查网络连接".into())
    } else if has("index.lock") && any(&["unable to create", "file exists"]) {
        (
            "locked",
            "Git 索引被占用（index.lock）：可能有其他 Git 程序正在运行；若没有，请删除该文件后重试"
                .into(),
        )
    } else if any(&[
        "please tell me who you are",
        "unable to auto-detect email address",
        "empty ident name",
    ]) {
        (
            "invalid",
            "未设置 Git 用户名和邮箱，请先填写提交身份".into(),
        )
    } else if any(&[
        "your local changes to the following files would be overwritten",
        "please commit your changes or stash them",
        "cannot pull with rebase: you have unstaged changes",
        "cannot rebase: you have unstaged changes",
        "your index contains uncommitted changes",
        "untracked working tree files would be overwritten",
        "untracked working tree file",
    ]) {
        ("dirty", "工作区有未提交的更改，请先提交或暂存后再试".into())
    } else if has("not fully merged") {
        (
            "not-merged",
            "分支尚未完全合并；如确认要删除，请使用强制删除".into(),
        )
    } else if (has("[rejected]") || has("! ["))
        && any(&["non-fast-forward", "fetch first", "stale info"])
        || has("not possible to fast-forward")
    {
        (
            "non-fast-forward",
            "无法快进：远程分支包含本地没有的提交，请先更新".into(),
        )
    } else if any(&["has no upstream branch", "no tracking information"]) {
        ("no-upstream", "当前分支没有设置上游分支".into())
    } else if any(&[
        "not something we can merge",
        "unknown revision",
        "did not match any",
        "bad revision",
        "not a valid object name",
        "invalid reference",
        "not a valid branch name",
        "is not a valid",
        "invalid upstream",
        "already exists",
        "no such remote",
        "no such branch",
        "couldn't find remote ref",
    ]) {
        ("invalid", format!("操作无效：{}", first_line(stderr)))
    } else {
        let line = first_line(stderr);
        (
            "failed",
            if line.is_empty() {
                "Git 命令执行失败".into()
            } else {
                format!("Git 命令执行失败：{line}")
            },
        )
    };
    GitError::new(code, message).with_detail(stderr)
}

/// Removes passwords and token-like user names from every URL in `text`.
pub(crate) fn redact(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(index) = rest.find("://") {
        let (head, tail) = rest.split_at(index + 3);
        result.push_str(head);
        let end = tail
            .find(|c: char| c == '/' || c.is_whitespace() || matches!(c, '\'' | '"' | '>' | ')'))
            .unwrap_or(tail.len());
        let authority = &tail[..end];
        match authority.rfind('@') {
            Some(at) => {
                let (user, _) = strip_userinfo(&authority[..at]);
                if let Some(user) = user {
                    result.push_str(&user);
                    result.push('@');
                }
                result.push_str(&authority[at + 1..]);
            }
            None => result.push_str(authority),
        }
        rest = &tail[end..];
    }
    result.push_str(rest);
    result
}

/// `user:password` -> (`Some(user)`, removed). Token-like user names are dropped entirely.
pub(crate) fn strip_userinfo(userinfo: &str) -> (Option<String>, bool) {
    let (user, password) = match userinfo.split_once(':') {
        Some((user, password)) => (user, Some(password)),
        None => (userinfo, None),
    };
    if user.is_empty() || token_like(user) {
        return (None, true);
    }
    (Some(user.to_string()), password.is_some())
}

fn token_like(user: &str) -> bool {
    let lower = user.to_ascii_lowercase();
    [
        "ghp_",
        "gho_",
        "ghu_",
        "ghs_",
        "github_pat_",
        "glpat-",
        "x-access-token",
        "oauth2",
    ]
    .iter()
    .any(|prefix| lower.starts_with(prefix))
        || (user.len() >= 20
            && user
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-'))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn errors_are_classified_and_formatted() {
        let cases = [
            ("fatal: Authentication failed for 'https://example.com/r.git/'", "auth"),
            ("git@github.com: Permission denied (publickey).", "auth"),
            ("fatal: could not read Username for 'https://x': terminal prompts disabled", "auth"),
            ("fatal: unable to access 'https://x/': Could not resolve proxy: p", "proxy"),
            ("fatal: unable to access 'https://x/': Failed to connect to 127.0.0.1 port 7890", "proxy"),
            ("fatal: unable to access 'https://x/': Could not resolve host: x", "network"),
            ("fatal: detected dubious ownership in repository at 'D:/r'", "dubious-ownership"),
            ("merge: nope - not something we can merge", "invalid"),
            ("error: Your local changes to the following files would be overwritten by checkout:", "dirty"),
            ("error: The branch 'x' is not fully merged.", "not-merged"),
            (" ! [rejected]        main -> main (fetch first)", "non-fast-forward"),
            ("fatal: Not possible to fast-forward, aborting.", "non-fast-forward"),
            ("fatal: The current branch x has no upstream branch.", "no-upstream"),
            ("fatal: Unable to create 'D:/r/.git/index.lock': File exists.", "locked"),
            ("*** Please tell me who you are.", "invalid"),
            ("fatal: something odd", "failed"),
        ];
        for (stderr, code) in cases {
            assert_eq!(classify(stderr, Some("127.0.0.1")).code, code, "{stderr}");
        }
        let error = classify("fatal: something odd\n", None);
        assert_eq!(
            error.to_string(),
            "[failed] Git 命令执行失败：something odd\n\nfatal: something odd"
        );
        assert_eq!(GitError::new("busy", "x").to_string(), "[busy] x");
        let long = "x".repeat(5000);
        assert!(detail(&long).chars().count() <= DETAIL_LIMIT + 1);
    }
    #[test]
    fn credentials_are_removed_from_urls() {
        assert_eq!(
            redact("fatal: unable to access 'https://user:s3cret@host/r.git/': x"),
            "fatal: unable to access 'https://user@host/r.git/': x"
        );
        assert_eq!(
            redact("https://ghp_abcdefghijklmnopqrstuvwxyz0123@github.com/o/r"),
            "https://github.com/o/r"
        );
        assert_eq!(redact("ssh://git@host:22/r"), "ssh://git@host:22/r");
        assert_eq!(redact("no urls here"), "no urls here");
        assert_eq!(
            classify("fatal: Authentication failed for 'https://a:tok@h/'", None).detail,
            "fatal: Authentication failed for 'https://a@h/'"
        );
    }
}
