//! Finds the system `git` and runs it: argument arrays only (never a shell), an inherited but
//! sanitised environment, bounded output, timeouts, cancellation and progress parsing.
use super::error::{classify, GitError};
use std::{
    ffi::OsString,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};

pub(crate) const LOCAL_TIMEOUT: Duration = Duration::from_secs(60);
pub(crate) const COMMIT_TIMEOUT: Duration = Duration::from_secs(180);
const STDOUT_LIMIT: usize = 64 * 1024 * 1024;
const STDERR_LIMIT: usize = 1024 * 1024;
/// Windows argv is limited to 32 767 UTF-16 units; batches stay far below it.
const ARGV_BATCH_BYTES: usize = 16 * 1024;
const MIN_VERSION: (u32, u32) = (2, 25);

/// Configuration placed before every subcommand.
const GLOBAL_CONFIG: [&str; 6] = [
    "core.quotepath=false",
    "color.ui=false",
    "log.showSignature=false",
    "protocol.ext.allow=never",
    "core.pager=cat",
    "i18n.logOutputEncoding=UTF-8",
];
/// Variables that would redirect git to another repository or echo request headers.
const REMOVED_ENV: [&str; 10] = [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_NAMESPACE",
    "GIT_TRACE",
    "GIT_TRACE_CURL",
    "GIT_TRACE_PACKET",
    "GIT_TRACE2",
    "GIT_CURL_VERBOSE",
];

#[derive(Clone, Debug)]
pub(crate) struct GitExe {
    pub path: PathBuf,
    /// `git --version` without the `git version ` prefix, e.g. `2.53.0.windows.1`.
    pub version: String,
    pub numeric: (u32, u32),
}
impl GitExe {
    pub fn at_least(&self, major: u32, minor: u32) -> bool {
        self.numeric >= (major, minor)
    }
}

/// `operation`, `phase`, `percent`.
pub(crate) type ProgressFn = Arc<dyn Fn(&str, &str, Option<u8>) + Send + Sync>;

pub(crate) fn parse_version(text: &str) -> Option<(String, (u32, u32))> {
    let version = text.lines().next()?.trim().strip_prefix("git version ")?;
    let mut parts = version.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts
        .next()?
        .chars()
        .take_while(char::is_ascii_digit)
        .collect::<String>()
        .parse()
        .ok()?;
    Some((version.to_string(), (major, minor)))
}

fn candidates() -> Vec<PathBuf> {
    let name = if cfg!(windows) { "git.exe" } else { "git" };
    let mut paths = Vec::new();
    if let Some(value) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&value).filter(|d| d.is_absolute()) {
            let path = directory.join(name);
            // Git for Windows' `cmd` launcher sets up the environment that `mingw64in` lacks.
            #[cfg(windows)]
            if let Some(launcher) = windows_launcher(&directory) {
                paths.push(launcher);
            }
            paths.push(path);
        }
    }
    #[cfg(windows)]
    {
        for variable in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
            if let Some(base) = std::env::var_os(variable) {
                paths.push(PathBuf::from(base).join(r"Git\cmd\git.exe"));
            }
        }
        if let Some(base) = std::env::var_os("LOCALAPPDATA") {
            paths.push(PathBuf::from(base).join(r"Programs\Git\cmd\git.exe"));
        }
        if let Some(base) = std::env::var_os("USERPROFILE") {
            paths.push(PathBuf::from(base).join(r"scoop\shims\git.exe"));
        }
    }
    #[cfg(target_os = "macos")]
    paths.extend(
        [
            "/opt/homebrew/bin/git",
            "/usr/local/bin/git",
            "/usr/bin/git",
        ]
        .map(PathBuf::from),
    );
    #[cfg(not(any(target_os = "macos", windows)))]
    paths.extend(["/usr/local/bin/git", "/usr/bin/git"].map(PathBuf::from));
    let mut seen = std::collections::HashSet::new();
    paths.retain(|path| seen.insert(path.clone()));
    paths
}

#[cfg(windows)]
fn windows_launcher(directory: &Path) -> Option<PathBuf> {
    let text = directory
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase();
    let text = text.trim_end_matches('/');
    let install = if text.ends_with("/mingw64/bin") {
        directory.parent()?.parent()?
    } else if text.ends_with("/git/bin") {
        directory.parent()?
    } else {
        return None;
    };
    Some(install.join("cmd").join("git.exe"))
}

/// The first working git that is new enough. `/usr/bin/git` on macOS is a shim that fails
/// without the command line tools, so every candidate must answer `--version`.
pub(crate) fn discover() -> Result<GitExe, GitError> {
    let mut outdated = None;
    for path in candidates() {
        if !path.is_file() {
            continue;
        }
        let probe = GitExe {
            path: path.clone(),
            version: String::new(),
            numeric: (0, 0),
        };
        let Ok(output) = Cmd::new(&probe, &std::env::temp_dir(), ["--version"])
            .timeout(Duration::from_secs(15))
            .bare()
            .output()
        else {
            continue;
        };
        if !output.success() {
            continue;
        }
        let Some((version, numeric)) = parse_version(&output.text()) else {
            continue;
        };
        if numeric < MIN_VERSION {
            outdated.get_or_insert(version);
            continue;
        }
        return Ok(GitExe {
            path,
            version,
            numeric,
        });
    }
    Err(match outdated {
        Some(version) => GitError::new(
            "git-missing",
            format!("Git 版本过低（{version}），需要 2.25 或更高版本"),
        ),
        None => GitError::new("git-missing", "未找到 Git，请先安装 Git 后重试"),
    })
}

pub(crate) struct Output {
    pub code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: String,
}
impl Output {
    pub fn success(&self) -> bool {
        self.code == Some(0)
    }
    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.stdout).into_owned()
    }
}

/// One git invocation. Built with chained setters, then [`Cmd::output`] or [`Cmd::run`].
pub(crate) struct Cmd<'a> {
    exe: &'a GitExe,
    cwd: &'a Path,
    config: Vec<String>,
    args: Vec<OsString>,
    env: Vec<(OsString, OsString)>,
    env_remove: Vec<OsString>,
    stdin: Option<Vec<u8>>,
    timeout: Duration,
    limit: usize,
    read_only: bool,
    literal: bool,
    bare: bool,
    cancel: Option<&'a AtomicBool>,
    progress: Option<(&'a ProgressFn, &'a str)>,
    proxy_host: Option<String>,
}
impl<'a> Cmd<'a> {
    pub fn new<I, S>(exe: &'a GitExe, cwd: &'a Path, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<OsString>,
    {
        Self {
            exe,
            cwd,
            config: Vec::new(),
            args: args.into_iter().map(Into::into).collect(),
            env: Vec::new(),
            env_remove: Vec::new(),
            stdin: None,
            timeout: LOCAL_TIMEOUT,
            limit: STDOUT_LIMIT,
            read_only: false,
            literal: false,
            bare: false,
            cancel: None,
            progress: None,
            proxy_host: None,
        }
    }
    pub fn arg(mut self, arg: impl Into<OsString>) -> Self {
        self.args.push(arg.into());
        self
    }
    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<OsString>,
    {
        self.args.extend(args.into_iter().map(Into::into));
        self
    }
    /// `-c key=value` before the subcommand.
    pub fn config(mut self, entry: impl Into<String>) -> Self {
        self.config.push(entry.into());
        self
    }
    pub fn env(mut self, key: impl Into<OsString>, value: impl Into<OsString>) -> Self {
        self.env.push((key.into(), value.into()));
        self
    }
    pub fn env_remove(mut self, key: impl Into<OsString>) -> Self {
        self.env_remove.push(key.into());
        self
    }
    pub fn stdin(mut self, bytes: Vec<u8>) -> Self {
        self.stdin = Some(bytes);
        self
    }
    pub fn timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }
    pub fn limit(mut self, limit: usize) -> Self {
        self.limit = limit;
        self
    }
    /// Status, log and other reads never take optional locks that would block a mutation.
    pub fn read_only(mut self) -> Self {
        self.read_only = true;
        self
    }
    /// Paths from the client are pathspecs taken literally (no globs or magic).
    pub fn literal(mut self) -> Self {
        self.literal = true;
        self
    }
    /// No global `-c` options; used for `--version`.
    fn bare(mut self) -> Self {
        self.bare = true;
        self
    }
    pub fn cancel(mut self, flag: Option<&'a AtomicBool>) -> Self {
        self.cancel = flag;
        self
    }
    pub fn progress(mut self, sink: Option<&'a ProgressFn>, operation: &'a str) -> Self {
        self.progress = sink.map(|sink| (sink, operation));
        self
    }
    pub fn proxy_host(mut self, host: Option<String>) -> Self {
        self.proxy_host = host;
        self
    }

    fn command(&self) -> Command {
        let mut command = Command::new(&self.exe.path);
        if !self.bare {
            for entry in GLOBAL_CONFIG
                .iter()
                .copied()
                .chain(self.config.iter().map(String::as_str))
            {
                command.arg("-c").arg(entry);
            }
        }
        command.args(&self.args).current_dir(self.cwd);
        for key in REMOVED_ENV {
            command.env_remove(key);
        }
        command
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_EDITOR", ":")
            .env("GIT_SEQUENCE_EDITOR", ":")
            .env("GIT_MERGE_AUTOEDIT", "no")
            .env("GIT_PAGER", "cat")
            .env("PAGER", "cat")
            .env("LC_ALL", "C")
            .env("LANGUAGE", "");
        if self.read_only {
            command.env("GIT_OPTIONAL_LOCKS", "0");
        }
        if self.literal {
            command.env("GIT_LITERAL_PATHSPECS", "1");
        } else {
            command.env_remove("GIT_LITERAL_PATHSPECS");
        }
        #[cfg(test)]
        {
            // Tests must not depend on the developer's own git configuration.
            command
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("GIT_CONFIG_GLOBAL", test_global_config());
        }
        for key in &self.env_remove {
            command.env_remove(key);
        }
        for (key, value) in &self.env {
            command.env(key, value);
        }
        command
            .stdin(if self.stdin.is_some() {
                Stdio::piped()
            } else {
                Stdio::null()
            })
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW: git is a console program; the app has no console.
            command.creation_flags(0x0800_0000);
        }
        command
    }

    /// Runs to completion. Only failures to run (spawn, timeout, cancellation, output
    /// overflow) are errors; a non-zero exit is reported in [`Output::code`].
    pub fn output(self) -> Result<Output, GitError> {
        let mut child = self
            .command()
            .spawn()
            .map_err(|_| GitError::new("git-missing", "无法启动 Git，请确认 Git 已正确安装"))?;
        if let (Some(bytes), Some(mut stdin)) = (self.stdin.clone(), child.stdin.take()) {
            thread::spawn(move || {
                let _ = stdin.write_all(&bytes);
            });
        }
        let overflow = Arc::new(AtomicBool::new(false));
        let stdout = Pipe::spawn(child.stdout.take(), self.limit, overflow.clone(), None);
        let progress = self
            .progress
            .map(|(sink, operation)| (sink.clone(), operation.to_string()));
        let stderr = Pipe::spawn(
            child.stderr.take(),
            STDERR_LIMIT,
            Arc::new(AtomicBool::new(false)),
            progress,
        );
        let started = Instant::now();
        let mut failure = None;
        let status = loop {
            if self.cancel.is_some_and(|flag| flag.load(Ordering::Acquire)) {
                failure = Some(GitError::new("cancelled", "已取消"));
            } else if overflow.load(Ordering::Relaxed) {
                failure = Some(GitError::new("failed", "Git 输出超过大小限制，已停止"));
            } else if started.elapsed() > self.timeout {
                failure = Some(GitError::new(
                    "timeout",
                    format!("Git 操作超时（{} 秒）", self.timeout.as_secs()),
                ));
            }
            if failure.is_some() {
                terminate(&mut child);
                break None;
            }
            match child.try_wait() {
                Ok(Some(status)) => break Some(status),
                Ok(None) => thread::sleep(Duration::from_millis(20)),
                Err(_) => {
                    terminate(&mut child);
                    failure = Some(GitError::new("failed", "无法获取 Git 进程状态"));
                    break None;
                }
            }
        };
        // A helper (credential cache, ssh) can inherit the pipes and outlive git; never wait
        // for it indefinitely.
        let grace = Instant::now();
        while !(stdout.done() && stderr.done()) && grace.elapsed() < Duration::from_secs(3) {
            thread::sleep(Duration::from_millis(5));
        }
        if let Some(error) = failure {
            return Err(error);
        }
        let stderr_text = String::from_utf8_lossy(&stderr.take()).into_owned();
        Ok(Output {
            code: status.and_then(|status| status.code()),
            stdout: stdout.take(),
            stderr: stderr_text,
        })
    }

    /// Like [`Cmd::output`], but a non-zero exit becomes a classified error.
    pub fn run(self) -> Result<Output, GitError> {
        let proxy = self.proxy_host.clone();
        let output = self.output()?;
        if output.success() {
            Ok(output)
        } else {
            Err(classify(&output.stderr, proxy.as_deref()))
        }
    }

    /// Standard output of a successful run, lossily decoded.
    pub fn text(self) -> Result<String, GitError> {
        self.run().map(|output| output.text())
    }
}

/// Runs `base -- <paths>` in as many invocations as needed to respect argv limits.
pub(crate) fn run_batched<'a>(
    make: impl Fn() -> Cmd<'a>,
    paths: &[String],
) -> Result<(), GitError> {
    let mut start = 0;
    while start < paths.len() {
        let mut end = start;
        let mut bytes = 0;
        while end < paths.len() && (end == start || bytes + paths[end].len() < ARGV_BATCH_BYTES) {
            bytes += paths[end].len() + 1;
            end += 1;
        }
        make().arg("--").args(&paths[start..end]).literal().run()?;
        start = end;
    }
    Ok(())
}

struct Pipe {
    buffer: Arc<Mutex<Vec<u8>>>,
    finished: Arc<AtomicBool>,
}
impl Pipe {
    fn spawn(
        pipe: Option<impl Read + Send + 'static>,
        limit: usize,
        overflow: Arc<AtomicBool>,
        progress: Option<(ProgressFn, String)>,
    ) -> Self {
        let buffer = Arc::new(Mutex::new(Vec::new()));
        let finished = Arc::new(AtomicBool::new(false));
        let Some(mut pipe) = pipe else {
            finished.store(true, Ordering::Release);
            return Self { buffer, finished };
        };
        let (target, done) = (buffer.clone(), finished.clone());
        thread::spawn(move || {
            let mut chunk = [0u8; 8192];
            let mut lines = progress.map(|(sink, operation)| LineSplitter {
                sink,
                operation,
                line: Vec::new(),
                last: None,
            });
            while let Ok(n) = pipe.read(&mut chunk) {
                if n == 0 {
                    break;
                }
                let Ok(mut out) = target.lock() else { break };
                match lines.as_mut() {
                    Some(lines) => lines.feed(&chunk[..n], &mut out, limit),
                    None => {
                        let allowed = limit.saturating_sub(out.len()).min(n);
                        out.extend_from_slice(&chunk[..allowed]);
                        if allowed < n {
                            overflow.store(true, Ordering::Relaxed);
                        }
                    }
                }
            }
            if let (Some(lines), Ok(mut out)) = (lines.as_mut(), target.lock()) {
                lines.flush(&mut out, limit);
            }
            done.store(true, Ordering::Release);
        });
        Self { buffer, finished }
    }
    fn done(&self) -> bool {
        self.finished.load(Ordering::Acquire)
    }
    fn take(&self) -> Vec<u8> {
        self.buffer
            .lock()
            .map(|mut bytes| std::mem::take(&mut *bytes))
            .unwrap_or_default()
    }
}

/// Splits stderr on `\r` and `\n`; progress lines go to the sink, the rest is kept.
struct LineSplitter {
    sink: ProgressFn,
    operation: String,
    line: Vec<u8>,
    last: Option<(Instant, String)>,
}
impl LineSplitter {
    fn feed(&mut self, bytes: &[u8], out: &mut Vec<u8>, limit: usize) {
        for &byte in bytes {
            if byte == b'\r' || byte == b'\n' {
                self.flush(out, limit);
            } else if self.line.len() < 64 * 1024 {
                self.line.push(byte);
            }
        }
    }
    fn flush(&mut self, out: &mut Vec<u8>, limit: usize) {
        if self.line.is_empty() {
            return;
        }
        let text = String::from_utf8_lossy(&std::mem::take(&mut self.line)).into_owned();
        if let Some((phase, percent)) = parse_progress(&text) {
            let now = Instant::now();
            let due = match &self.last {
                Some((at, last_phase)) => {
                    last_phase != phase
                        || percent == Some(100)
                        || now.duration_since(*at) >= Duration::from_millis(100)
                }
                None => true,
            };
            if due {
                self.last = Some((now, phase.to_string()));
                (self.sink)(&self.operation, phase, percent);
            }
            return;
        }
        if out.len() + text.len() < limit {
            out.extend_from_slice(text.as_bytes());
            out.push(b'\n');
        }
    }
}

/// `Receiving objects:  45% (450/1000), 1.2 MiB | 2 MiB/s` -> (`Receiving objects`, 45).
pub(crate) fn parse_progress(line: &str) -> Option<(&str, Option<u8>)> {
    let line = line.trim();
    let line = line.strip_prefix("remote: ").unwrap_or(line).trim_start();
    let (phase, rest) = line.split_once(": ")?;
    let mut chars = phase.chars();
    if phase.is_empty()
        || phase.len() > 48
        || !chars.next().is_some_and(|c| c.is_ascii_uppercase())
        || !chars.all(|c| c.is_ascii_alphabetic() || c == ' ')
    {
        return None;
    }
    let rest = rest.trim_start();
    if !rest.starts_with(|c: char| c.is_ascii_digit()) {
        return None;
    }
    let percent = rest
        .split_once('%')
        .and_then(|(number, _)| number.trim().parse::<u8>().ok())
        .filter(|value| *value <= 100);
    Some((phase, percent))
}

fn terminate(child: &mut Child) {
    #[cfg(unix)]
    if let Ok(pid) = i32::try_from(child.id()) {
        // SAFETY: process_group(0) gave git its own group; a negative PID targets only that
        // group (git and the helpers it started).
        unsafe {
            libc::kill(-pid, libc::SIGKILL);
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill.exe")
            .creation_flags(0x0800_0000)
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

#[cfg(test)]
fn test_global_config() -> &'static Path {
    static FILE: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
    FILE.get_or_init(|| {
        let path = std::env::temp_dir().join(format!(
            "marklyra-git-test-{}.gitconfig",
            std::process::id()
        ));
        let _ = std::fs::write(&path, "");
        path
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn versions_and_progress_lines_parse() {
        assert_eq!(
            parse_version("git version 2.53.0.windows.1\n"),
            Some(("2.53.0.windows.1".into(), (2, 53)))
        );
        assert_eq!(
            parse_version("git version 2.39.5 (Apple Git-154)"),
            Some(("2.39.5 (Apple Git-154)".into(), (2, 39)))
        );
        assert_eq!(
            parse_version("xcrun: error: invalid active developer path"),
            None
        );
        assert_eq!(
            parse_progress("Receiving objects:  45% (450/1000), 1.2 MiB | 2 MiB/s"),
            Some(("Receiving objects", Some(45)))
        );
        assert_eq!(
            parse_progress("remote: Counting objects: 100% (3/3), done."),
            Some(("Counting objects", Some(100)))
        );
        assert_eq!(
            parse_progress("remote: Enumerating objects: 5, done."),
            Some(("Enumerating objects", None))
        );
        for line in [
            "fatal: unable to access 'https://x/': Could not resolve host: x",
            "CONFLICT (content): Merge conflict in a.md",
            "Note: switching to 'abc'.",
            "To https://example.com/repo.git",
        ] {
            assert_eq!(parse_progress(line), None, "{line}");
        }
    }
}
