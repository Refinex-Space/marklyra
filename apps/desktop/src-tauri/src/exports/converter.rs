//! A selected Pandoc binary, never a shell or a user-provided argument vector.
use export_service::MAX_HTML_BYTES;
use same_file::Handle;
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant, SystemTime},
};

pub(super) struct Scratch(PathBuf);
impl Scratch {
    pub fn new() -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!("marklyra-formats-{}", uuid::Uuid::new_v4()));
        let mut builder = fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&path).map_err(|_| "无法创建隔离转换目录")?;
        Ok(Self(path))
    }
    pub fn path(&self) -> &Path {
        &self.0
    }
    pub fn put(&self, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
        let path = self.0.join(name);
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        options
            .open(&path)
            .and_then(|mut f| f.write_all(bytes))
            .map_err(|_| "无法准备转换快照")?;
        Ok(path)
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[derive(Debug)]
pub(super) struct Pandoc {
    path: PathBuf,
    identity: Handle,
    bytes: u64,
    modified: Option<SystemTime>,
    pub version: String,
    pub readers: Vec<String>,
    pub writers: Vec<String>,
    /// Extensions the Markdown reader of this build understands, without their +/- sign.
    pub markdown_extensions: Vec<String>,
}
/// What a finished Pandoc run left behind.
pub(super) struct RunOutput {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}
/// Why a run failed, with what the process itself said about it.
pub(super) struct RunFailure {
    pub message: String,
    pub stderr: String,
}
impl From<String> for RunFailure {
    fn from(message: String) -> Self {
        Self {
            message,
            stderr: String::new(),
        }
    }
}
impl From<&str> for RunFailure {
    fn from(message: &str) -> Self {
        message.to_owned().into()
    }
}
/// A finished export: the produced bytes and the converter's own warnings.
pub(super) struct Converted {
    pub bytes: Vec<u8>,
    pub warnings: Vec<String>,
}
/// Markdown extensions MarkLyra documents rely on, in the order they are applied.
const MARKDOWN_EXTENSIONS: [&str; 14] = [
    "+tex_math_dollars",
    "+pipe_tables",
    "+task_lists",
    "+strikeout",
    "+footnotes",
    "+yaml_metadata_block",
    "+emoji",
    "+mark",
    "+superscript",
    "+subscript",
    "+lists_without_preceding_blankline",
    "+east_asian_line_breaks",
    "+autolink_bare_uris",
    "-smart",
];
impl Pandoc {
    pub fn path(&self) -> &Path {
        &self.path
    }
    fn validate_identity(&self) -> Result<(), String> {
        let m = fs::metadata(&self.path).map_err(|_| "转换器路径已失效")?;
        if self.identity != Handle::from_path(&self.path).map_err(|_| "转换器实体已失效")?
            || m.len() != self.bytes
            || m.modified().ok() != self.modified
        {
            return Err("转换器已被替换，请重新选择并验证".into());
        }
        Ok(())
    }
    pub fn inspect(path: &Path) -> Result<Self, String> {
        if !path.is_absolute() {
            return Err("Pandoc必须为绝对本机路径".into());
        }
        let path = fs::canonicalize(path).map_err(|_| "Pandoc路径不存在")?;
        if !path
            .file_name()
            .and_then(|v| v.to_str())
            .is_some_and(|v| v == "pandoc" || v.eq_ignore_ascii_case("pandoc.exe"))
        {
            return Err("请选择名称为pandoc或pandoc.exe的已安装程序；不接受其它命令".into());
        }
        let meta = fs::metadata(&path).map_err(|_| "无法读取Pandoc路径")?;
        if !meta.is_file() || meta.len() > 512 * 1024 * 1024 {
            return Err("Pandoc必须是普通可执行文件".into());
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if meta.permissions().mode() & 0o111 == 0 {
                return Err("Pandoc文件不可执行".into());
            }
        }
        let mut magic = [0u8; 4];
        File::open(&path)
            .and_then(|mut f| f.read_exact(&mut magic))
            .map_err(|_| "Pandoc制品为空")?;
        // Do not execute scripts, command files or a renamed shell from a settings path.
        if !matches!(
            magic,
            [0x7f, b'E', b'L', b'F']
                | [0xcf, 0xfa, 0xed, 0xfe]
                | [0xfe, 0xed, 0xfa, 0xcf]
                | [0xca, 0xfe, 0xba, 0xbe]
                | [0xbe, 0xba, 0xfe, 0xca]
        ) && &magic[..2] != b"MZ"
        {
            return Err("Pandoc必须为本机二进制程序，拒绝脚本与shell命令".into());
        }
        let mut tool = Self {
            identity: Handle::from_path(&path).map_err(|_| "无法绑定Pandoc实体")?,
            bytes: meta.len(),
            modified: meta.modified().ok(),
            path,
            version: String::new(),
            readers: vec![],
            writers: vec![],
            markdown_extensions: vec![],
        };
        let scratch = Scratch::new()?;
        let version = tool.run(
            &["--version"],
            scratch.path(),
            Duration::from_secs(3),
            64 * 1024,
        )?;
        let version = String::from_utf8(version).map_err(|_| "Pandoc版本响应不是文本")?;
        tool.version = parse_version(&version)?;
        let help = tool.run(
            &["--help"],
            scratch.path(),
            Duration::from_secs(3),
            256 * 1024,
        )?;
        let help = String::from_utf8_lossy(&help);
        if !help.contains("--sandbox") || !help.contains("--fail-if-warnings") {
            return Err("Pandoc缺少本轮转换所需的sandbox/fail-if-warnings能力；未执行转换".into());
        }
        tool.readers = tool.list("--list-input-formats", scratch.path())?;
        tool.writers = tool.list("--list-output-formats", scratch.path())?;
        // Optional knowledge: an older build without the listing simply gets the plain reader.
        tool.markdown_extensions = tool
            .run(
                &["--list-extensions=markdown"],
                scratch.path(),
                Duration::from_secs(3),
                64 * 1024,
            )
            .map(|bytes| {
                String::from_utf8_lossy(&bytes)
                    .lines()
                    .filter_map(|line| line.strip_prefix(['+', '-']))
                    .map(|name| name.trim().to_owned())
                    .filter(|name| !name.is_empty())
                    .collect()
            })
            .unwrap_or_default();
        Ok(tool)
    }
    /// The reader specification for MarkLyra documents on this Pandoc build.
    pub fn markdown_reader(&self) -> String {
        let mut spec = String::from("markdown");
        for extension in MARKDOWN_EXTENSIONS {
            if self
                .markdown_extensions
                .iter()
                .any(|known| known == &extension[1..])
            {
                spec.push_str(extension);
            }
        }
        spec
    }
    fn list(&self, arg: &str, cwd: &Path) -> Result<Vec<String>, String> {
        let output = self.run(&[arg], cwd, Duration::from_secs(3), 64 * 1024)?;
        let text = std::str::from_utf8(&output).map_err(|_| "Pandoc格式列表无效")?;
        Ok(text
            .lines()
            .filter(|line| {
                !line.is_empty()
                    && line.len() < 64
                    && line
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
            })
            .map(str::to_owned)
            .collect())
    }
    pub fn convert(
        &self,
        from: &str,
        to: &str,
        input: &Path,
        cwd: &Path,
    ) -> Result<Vec<u8>, String> {
        let reader = from.split(['+', '-']).next().unwrap_or(from);
        let writer = to.split(['+', '-']).next().unwrap_or(to);
        if !self.readers.iter().any(|s| s == reader) || !self.writers.iter().any(|s| s == writer) {
            return Err("当前Pandoc未编译所需读取器或写出器".into());
        }
        let input = input.to_str().ok_or("转换快照路径不能编码为Unicode")?;
        let output = cwd.join(format!("result-{}", uuid::Uuid::new_v4()));
        let output_arg = output.to_str().ok_or("转换输出路径不能编码为Unicode")?;
        self.run_observing(
            &[
                "--sandbox",
                "--fail-if-warnings",
                "--standalone",
                "--wrap=none",
                "--from",
                from,
                "--to",
                to,
                "--output",
                output_arg,
                input,
                "+RTS",
                "-M512M",
                "-RTS",
            ],
            cwd,
            Duration::from_secs(60),
            64 * 1024,
            Some(&output),
        )?;
        let metadata = fs::symlink_metadata(&output).map_err(|_| "Pandoc未产生转换文件")?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > MAX_HTML_BYTES as u64
        {
            return Err("转换产物不是普通文件或超过32 MiB".into());
        }
        let mut bytes = Vec::with_capacity(metadata.len() as usize);
        File::open(&output)
            .and_then(|file| file.take(MAX_HTML_BYTES as u64 + 1).read_to_end(&mut bytes))
            .map_err(|_| "无法读取转换产物")?;
        if bytes.is_empty() || bytes.len() > MAX_HTML_BYTES {
            return Err("转换产物为空或超过32 MiB".into());
        }
        Ok(bytes)
    }
    /// Converts one Markdown snapshot. The converter runs sandboxed on a private copy; its
    /// warnings are kept so a file that is written anyway can say what was lost.
    pub fn export(
        &self,
        reader: &str,
        writer: &str,
        input: &Path,
        cwd: &Path,
        extra: &[String],
    ) -> Result<Converted, RunFailure> {
        let writer_base = writer.split(['+', '-']).next().unwrap_or(writer);
        if !self.writers.iter().any(|s| s == writer_base) {
            return Err("当前Pandoc未提供所选的输出格式".into());
        }
        let input = input.to_str().ok_or("转换快照路径不能编码为Unicode")?;
        let output = cwd.join(format!("result-{}", uuid::Uuid::new_v4()));
        let output_arg = output.to_str().ok_or("转换输出路径不能编码为Unicode")?;
        let mut args: Vec<&str> = vec![
            "--sandbox",
            "--standalone",
            "--wrap=none",
            "--from",
            reader,
            "--to",
            writer,
        ];
        args.extend(extra.iter().map(String::as_str));
        args.extend(["--output", output_arg, input, "+RTS", "-M512M", "-RTS"]);
        let ran = self.run_full(
            &args,
            cwd,
            Duration::from_secs(120),
            64 * 1024,
            Some(&output),
        )?;
        let metadata = fs::symlink_metadata(&output).map_err(|_| "Pandoc未产生转换文件")?;
        if !metadata.is_file()
            || metadata.file_type().is_symlink()
            || metadata.len() > MAX_HTML_BYTES as u64
        {
            return Err("转换产物不是普通文件或超过32 MiB".into());
        }
        let mut bytes = Vec::with_capacity(metadata.len() as usize);
        File::open(&output)
            .and_then(|file| file.take(MAX_HTML_BYTES as u64 + 1).read_to_end(&mut bytes))
            .map_err(|_| "无法读取转换产物")?;
        if bytes.is_empty() || bytes.len() > MAX_HTML_BYTES {
            return Err("转换产物为空或超过32 MiB".into());
        }
        Ok(Converted {
            bytes,
            warnings: summarize(&String::from_utf8_lossy(&ran.stderr), cwd, 5),
        })
    }
    fn run(
        &self,
        args: &[&str],
        cwd: &Path,
        timeout: Duration,
        limit: usize,
    ) -> Result<Vec<u8>, String> {
        self.run_observing(args, cwd, timeout, limit, None)
    }
    fn run_observing(
        &self,
        args: &[&str],
        cwd: &Path,
        timeout: Duration,
        limit: usize,
        output: Option<&Path>,
    ) -> Result<Vec<u8>, String> {
        self.run_full(args, cwd, timeout, limit, output)
            .map(|ran| ran.stdout)
            .map_err(|failure| failure.message)
    }
    fn run_full(
        &self,
        args: &[&str],
        cwd: &Path,
        timeout: Duration,
        limit: usize,
        output: Option<&Path>,
    ) -> Result<RunOutput, RunFailure> {
        self.validate_identity()?;
        let mut command = Command::new(&self.path);
        command
            .args(args)
            .current_dir(cwd)
            .env_clear()
            .env("HOME", cwd)
            .env("TMPDIR", cwd)
            .env("TEMP", cwd)
            .env("TMP", cwd)
            .env("LANG", "C.UTF-8")
            .stdin(Stdio::null())
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
            // CREATE_NO_WINDOW: the app has no console of its own, so a console child such as
            // Pandoc would otherwise open (and close) a terminal window for every run. Each
            // capability inspection runs it five times.
            command.creation_flags(0x0800_0000);
        }
        #[cfg(windows)]
        if let Some(root) = std::env::var_os("SystemRoot") {
            command.env("SystemRoot", root);
        }
        let mut child = command.spawn().map_err(|_| "无法启动已验证Pandoc")?;
        let overflow = Arc::new(AtomicBool::new(false));
        let out = read_pipe(
            child.stdout.take().ok_or("转换标准输出不可用")?,
            limit,
            overflow.clone(),
        );
        let err = read_pipe(
            child.stderr.take().ok_or("转换错误输出不可用")?,
            64 * 1024,
            overflow.clone(),
        );
        let started = Instant::now();
        let mut reason = None;
        let status = loop {
            if output.is_some_and(|path| {
                fs::symlink_metadata(path).is_ok_and(|metadata| {
                    !metadata.is_file()
                        || metadata.file_type().is_symlink()
                        || metadata.len() > MAX_HTML_BYTES as u64
                })
            }) {
                reason = Some("转换产物超过限制或实体无效，已停止且未保存");
            } else if overflow.load(Ordering::Relaxed) {
                reason = Some("转换输出超过限制，已停止且未保存");
            } else if started.elapsed() > timeout {
                reason = Some("转换超时，已停止且未保存");
            }
            if reason.is_some() {
                terminate(&mut child);
                break child.wait();
            }
            match child.try_wait() {
                Ok(Some(s)) => break Ok(s),
                Ok(None) => thread::sleep(Duration::from_millis(20)),
                Err(e) => {
                    terminate(&mut child);
                    let _ = child.wait();
                    break Err(e);
                }
            }
        };
        // A descendant can inherit stdout after the main process exits. Never
        // join a reader indefinitely; drain only until the original deadline.
        while !out.is_finished() || !err.is_finished() {
            if started.elapsed() > timeout || overflow.load(Ordering::Relaxed) {
                terminate(&mut child);
                if reason.is_none() {
                    reason = Some("转换管道未在限制内关闭，已停止且未保存");
                }
                let drain = Instant::now();
                while (!out.is_finished() || !err.is_finished())
                    && drain.elapsed() < Duration::from_millis(250)
                {
                    thread::sleep(Duration::from_millis(5));
                }
                if !out.is_finished() || !err.is_finished() {
                    // On unsupported platforms, dropping handles detaches bounded
                    // readers rather than freezing this command on an inherited pipe.
                    return Err("转换管道未关闭；未保存产物".into());
                }
                break;
            }
            thread::sleep(Duration::from_millis(5));
        }
        let output = out.join().map_err(|_| "转换输出读取失败")??;
        let errors = err.join().map_err(|_| "转换错误读取失败")??;
        if let Some(reason) = reason {
            return Err(reason.into());
        }
        if !status.map_err(|_| "转换任务状态不可用")?.success() {
            // Import keeps the generic text; export shows `stderr` for the person's own document.
            return Err(RunFailure {
                message: if errors.is_empty() {
                    "Pandoc转换失败；当前稿和目标未修改"
                } else {
                    "Pandoc拒绝转换或产生警告；为避免遗漏内容，未保存产物"
                }
                .into(),
                stderr: String::from_utf8_lossy(&errors).into_owned(),
            });
        }
        Ok(RunOutput {
            stdout: output,
            stderr: errors,
        })
    }
}
/// The first few meaningful lines of Pandoc's diagnostics, without scratch paths, bounded so
/// they are safe to show next to a result.
pub(super) fn summarize(text: &str, scratch: &Path, limit: usize) -> Vec<String> {
    let hidden = scratch.display().to_string();
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(|line| {
            line.trim_start_matches("[WARNING]")
                .trim_start_matches("[ERROR]")
                .trim()
                .replace(&hidden, "")
                .replace('\\', "/")
        })
        .filter(|line| !line.is_empty())
        .take(limit)
        .map(|line| line.chars().take(240).collect())
        .collect()
}
fn terminate(child: &mut std::process::Child) {
    #[cfg(unix)]
    {
        unsafe extern "C" {
            fn kill(pid: i32, signal: i32) -> i32;
        }
        if let Ok(pid) = i32::try_from(child.id()) {
            // SAFETY: process_group(0) created this command's own group. A negative
            // PID only targets that group, never another editor or candidate app.
            unsafe {
                let _ = kill(-pid, 9);
            }
        }
    }
    let _ = child.kill();
}
fn read_pipe(
    mut pipe: impl Read + Send + 'static,
    limit: usize,
    overflow: Arc<AtomicBool>,
) -> thread::JoinHandle<Result<Vec<u8>, String>> {
    thread::spawn(move || {
        let mut output = Vec::new();
        let mut chunk = [0; 8192];
        loop {
            let n = pipe.read(&mut chunk).map_err(|_| "无法读取转换进程输出")?;
            if n == 0 {
                break;
            }
            let allowed = limit.saturating_sub(output.len()).min(n);
            output.extend_from_slice(&chunk[..allowed]);
            if allowed < n {
                overflow.store(true, Ordering::Relaxed);
            }
        }
        Ok(output)
    })
}
fn parse_version(text: &str) -> Result<String, String> {
    let version = text
        .lines()
        .next()
        .and_then(|line| line.strip_prefix("pandoc "))
        .ok_or("所选程序未返回Pandoc版本标识")?;
    let parts: Vec<_> = version.split('.').collect();
    if parts.len() < 2
        || parts.len() > 4
        || parts
            .iter()
            .any(|v| v.is_empty() || !v.bytes().all(|c| c.is_ascii_digit()))
        || parts[0].parse::<u32>().unwrap_or(0) < 2
    {
        return Err("Pandoc版本无效或低于原版>=2.0门槛".into());
    }
    Ok(version.into())
}
/// Where an installed Pandoc is looked for: the `PATH` first, then the usual install places.
pub(super) fn default_paths() -> Vec<PathBuf> {
    let name = if cfg!(windows) {
        "pandoc.exe"
    } else {
        "pandoc"
    };
    let mut paths: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|value| {
            std::env::split_paths(&value)
                .filter(|directory| directory.is_absolute())
                .map(|directory| directory.join(name))
                .collect()
        })
        .unwrap_or_default();
    #[cfg(target_os = "macos")]
    paths.extend(
        [
            "/opt/homebrew/bin/pandoc",
            "/usr/local/bin/pandoc",
            "/opt/local/bin/pandoc",
            "/usr/bin/pandoc",
        ]
        .map(PathBuf::from),
    );
    #[cfg(windows)]
    {
        for base in [
            std::env::var_os("LOCALAPPDATA"),
            std::env::var_os("ProgramFiles"),
            std::env::var_os("ProgramFiles(x86)"),
        ]
        .into_iter()
        .flatten()
        {
            paths.push(PathBuf::from(base).join("Pandoc/pandoc.exe"));
        }
        for (variable, tail) in [
            ("USERPROFILE", "scoop/shims/pandoc.exe"),
            ("ProgramData", "chocolatey/bin/pandoc.exe"),
        ] {
            if let Some(base) = std::env::var_os(variable) {
                paths.push(PathBuf::from(base).join(tail));
            }
        }
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    paths.extend(["/usr/local/bin/pandoc", "/usr/bin/pandoc"].map(PathBuf::from));
    let mut seen = std::collections::HashSet::new();
    paths.retain(|path| seen.insert(path.clone()));
    paths
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn version_response_is_not_a_command_or_arbitrary_text() {
        for value in ["pandoc 2.19.2\nCompiled with", "pandoc 3.6.4"] {
            assert!(parse_version(value).is_ok());
        }
        for value in [
            "pandoc 1.9",
            "bash 5.0",
            "pandoc 3; touch x",
            "pandoc 3.0-beta",
        ] {
            assert!(parse_version(value).is_err());
        }
    }
    #[test]
    fn scripts_and_relative_paths_are_rejected_before_execution() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("pandoc");
        fs::write(&p, b"#!/bin/sh\necho pandoc 3.0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&p, fs::Permissions::from_mode(0o700)).unwrap();
        }
        assert!(Pandoc::inspect(&p).unwrap_err().contains("二进制"));
        assert!(Pandoc::inspect(Path::new("pandoc")).is_err());
    }
    #[test]
    fn pipe_memory_is_bounded() {
        let flag = Arc::new(AtomicBool::new(false));
        let result = read_pipe(std::io::Cursor::new(vec![7; 100]), 12, flag.clone())
            .join()
            .unwrap()
            .unwrap();
        assert_eq!(result.len(), 12);
        assert!(flag.load(Ordering::Relaxed));
    }
    #[test]
    fn scratch_is_owned_and_removed() {
        let p;
        {
            let s = Scratch::new().unwrap();
            p = s.path().to_owned();
            s.put("input", b"text").unwrap();
            assert!(s.put("input", b"overwrite").is_err());
        }
        assert!(!p.exists());
    }
    #[cfg(unix)]
    fn bound_tool(path: &Path) -> Pandoc {
        let metadata = fs::metadata(path).unwrap();
        Pandoc {
            path: path.to_owned(),
            identity: Handle::from_path(path).unwrap(),
            bytes: metadata.len(),
            modified: metadata.modified().ok(),
            version: "test-only".into(),
            readers: vec![],
            writers: vec![],
            markdown_extensions: vec![],
        }
    }
    #[test]
    #[cfg(unix)]
    fn process_timeout_and_output_quota_stop_without_publishing() {
        let scratch = Scratch::new().unwrap();
        let timeout = bound_tool(Path::new("/bin/sleep"))
            .run(&["2"], scratch.path(), Duration::from_millis(40), 1024)
            .unwrap_err();
        assert!(timeout.contains("超时"));
        let quota = bound_tool(Path::new("/usr/bin/yes"))
            .run(&[], scratch.path(), Duration::from_secs(2), 4096)
            .unwrap_err();
        assert!(quota.contains("限制"));
        assert_eq!(fs::read_dir(scratch.path()).unwrap().count(), 0);
    }
    #[test]
    #[cfg(unix)]
    fn changed_binary_is_rejected_before_it_can_run() {
        let scratch = Scratch::new().unwrap();
        let path = scratch.put("pandoc", b"original bytes").unwrap();
        let tool = bound_tool(&path);
        fs::write(&path, b"replacement with different bytes").unwrap();
        assert!(tool
            .run(&["--version"], scratch.path(), Duration::from_secs(1), 1024)
            .unwrap_err()
            .contains("替换"));
    }
    #[test]
    #[cfg(unix)]
    fn output_file_quota_is_monitored_before_process_completion() {
        let scratch = Scratch::new().unwrap();
        let output = scratch.put("result", b"initial").unwrap();
        OpenOptions::new()
            .write(true)
            .open(&output)
            .unwrap()
            .set_len(MAX_HTML_BYTES as u64 + 1)
            .unwrap();
        let started = Instant::now();
        let error = bound_tool(Path::new("/bin/sleep"))
            .run_observing(
                &["2"],
                scratch.path(),
                Duration::from_secs(3),
                1024,
                Some(&output),
            )
            .unwrap_err();
        assert!(error.contains("产物超过限制"));
        assert!(started.elapsed() < Duration::from_secs(1));
    }
}
