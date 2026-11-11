//! The bundled `marklyra-task` skill, and installing it into each supported ACP agent's own
//! user skill folder. The renderer only names an agent id; the folder comes from the table
//! below (each agent's documented user-level location under the home folder). A skill folder
//! MarkLyra did not write is never replaced or removed, and symbolic links are refused.
use serde::Serialize;
use std::path::{Path, PathBuf};

pub(crate) const NAME: &str = "marklyra-task";
/// Raw bytes from the tree; may still carry CRLF on a Windows checkout before attributes apply.
const SKILL_RAW: &str = include_str!("../skills/marklyra-task/SKILL.md");
const MARKER: &str = "generator: marklyra";
const FILE: &str = "SKILL.md";

/// The whole `SKILL.md`, as installed. Always LF so Windows checkouts match Unix agents and tests.
pub(crate) fn skill() -> &'static str {
    use std::sync::OnceLock;
    static NORMALIZED: OnceLock<String> = OnceLock::new();
    if !SKILL_RAW.contains('\r') {
        return SKILL_RAW;
    }
    NORMALIZED
        .get_or_init(|| SKILL_RAW.replace("\r\n", "\n").replace('\r', "\n"))
        .as_str()
}

/// Agent id (as in the ACP catalog), display name and skills folder relative to home.
/// Sources: Claude Code, Codex, Cursor, GitHub Copilot CLI, Grok Build, Kimi CLI, OpenCode,
/// Qoder and CodeBuddy skill docs; glm-acp-agent reads `~/.claude`; MiniMax Code reads
/// `~/.agents/skills` (MCode Stack README).
const TARGETS: &[(&str, &str, &[&str])] = &[
    ("claude-acp", "Claude", &[".claude", "skills"]),
    ("codex-acp", "Codex", &[".agents", "skills"]),
    ("cursor", "Cursor", &[".cursor", "skills"]),
    ("codebuddy-code", "CodeBuddy", &[".codebuddy", "skills"]),
    ("glm-acp-agent", "GLM", &[".claude", "skills"]),
    (
        "github-copilot-cli",
        "GitHub Copilot",
        &[".copilot", "skills"],
    ),
    ("grok-build", "Grok Build", &[".grok", "skills"]),
    ("kimi", "Kimi", &[".kimi", "skills"]),
    ("minimax-code", "MiniMax Code", &[".agents", "skills"]),
    ("opencode", "OpenCode", &[".config", "opencode", "skills"]),
    ("qoder", "Qoder", &[".qoder", "skills"]),
];

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillStatus {
    agent_id: &'static str,
    name: &'static str,
    /// The `SKILL.md` path.
    path: String,
    installed: bool,
    /// Written by MarkLyra (ours to update or remove).
    ours: bool,
    /// Identical to the skill this app bundles.
    current: bool,
    /// Other agents reading the same folder; installing for one installs for them too.
    shared_with: Vec<&'static str>,
}

/// The skill text without its frontmatter, for agents that get it inline.
pub(crate) fn instructions() -> &'static str {
    let text = skill();
    text.strip_prefix("---")
        .and_then(|rest| rest.split_once("\n---"))
        .map_or(text, |(_, body)| body.trim_start_matches(['\r', '\n']))
}

fn home() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .filter(|h| !h.is_empty())
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or("找不到主目录")?;
    if !home.is_absolute() {
        return Err("主目录无效".into());
    }
    Ok(home)
}

fn target(
    agent_id: &str,
) -> Result<&'static (&'static str, &'static str, &'static [&'static str]), String> {
    TARGETS
        .iter()
        .find(|(id, _, _)| *id == agent_id)
        .ok_or_else(|| "不支持的智能体".to_string())
}
fn folder(home: &Path, relative: &[&str]) -> PathBuf {
    relative
        .iter()
        .fold(home.to_path_buf(), |p, part| p.join(part))
        .join(NAME)
}
fn is_link(path: &Path) -> bool {
    std::fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink())
}
fn ours(text: &str) -> bool {
    text.starts_with("---") && text.contains(MARKER)
}

fn status(
    home: &Path,
    (id, name, relative): &(&'static str, &'static str, &[&str]),
) -> SkillStatus {
    let dir = folder(home, relative);
    let path = dir.join(FILE);
    let linked = is_link(&dir) || is_link(&path);
    let text = (!linked)
        .then(|| std::fs::read_to_string(&path).ok())
        .flatten();
    SkillStatus {
        agent_id: id,
        name,
        path: path.to_string_lossy().into_owned(),
        installed: linked || path.exists(),
        ours: text.as_deref().is_some_and(ours),
        current: text.as_deref() == Some(skill()),
        shared_with: TARGETS
            .iter()
            .filter(|(other, _, r)| other != id && r == relative)
            .map(|(_, n, _)| *n)
            .collect(),
    }
}

pub(crate) fn statuses_in(home: &Path) -> Vec<SkillStatus> {
    TARGETS.iter().map(|t| status(home, t)).collect()
}

pub(crate) fn install_in(home: &Path, agent_id: &str) -> Result<Vec<SkillStatus>, String> {
    let (_, _, relative) = target(agent_id)?;
    let dir = folder(home, relative);
    let path = dir.join(FILE);
    if is_link(&dir) || is_link(&path) {
        return Err(format!("{} 是符号链接，未改动", dir.display()));
    }
    if dir.exists() {
        if !dir.is_dir() {
            return Err(format!("{} 已存在且不是文件夹，未改动", dir.display()));
        }
        let mine = std::fs::read_to_string(&path).is_ok_and(|t| ours(&t));
        let empty = std::fs::read_dir(&dir).is_ok_and(|mut d| d.next().is_none());
        if !mine && !empty {
            return Err(format!(
                "{} 已存在且不是 MarkLyra 安装的，未改动",
                dir.display()
            ));
        }
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let temp = dir.join(format!(".{FILE}.tmp"));
    std::fs::write(&temp, skill()).map_err(|e| e.to_string())?;
    std::fs::rename(&temp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&temp);
        e.to_string()
    })?;
    Ok(statuses_in(home))
}

pub(crate) fn uninstall_in(home: &Path, agent_id: &str) -> Result<Vec<SkillStatus>, String> {
    let (_, _, relative) = target(agent_id)?;
    let dir = folder(home, relative);
    let path = dir.join(FILE);
    if is_link(&dir) || is_link(&path) {
        return Err(format!("{} 是符号链接，未删除", dir.display()));
    }
    if path.exists() {
        let mine = std::fs::read_to_string(&path).is_ok_and(|t| ours(&t));
        if !mine {
            return Err(format!("{} 不是 MarkLyra 安装的，未删除", dir.display()));
        }
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    // Only an empty folder goes; anything the person added beside the skill stays.
    let _ = std::fs::remove_dir(&dir);
    Ok(statuses_in(home))
}

#[tauri::command]
pub(crate) fn agent_skills_status() -> Result<Vec<SkillStatus>, String> {
    Ok(statuses_in(&home()?))
}
#[tauri::command]
pub(crate) fn agent_skill_install(agent_id: String) -> Result<Vec<SkillStatus>, String> {
    install_in(&home()?, &agent_id)
}
#[tauri::command]
pub(crate) fn agent_skill_uninstall(agent_id: String) -> Result<Vec<SkillStatus>, String> {
    uninstall_in(&home()?, &agent_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn find<'a>(list: &'a [SkillStatus], id: &str) -> &'a SkillStatus {
        list.iter().find(|s| s.agent_id == id).unwrap()
    }

    #[test]
    fn covers_every_supported_agent_once() {
        let mut ids: Vec<&str> = TARGETS.iter().map(|(id, _, _)| *id).collect();
        let mut supported = crate::agents::supported_agents().to_vec();
        ids.sort_unstable();
        supported.sort_unstable();
        assert_eq!(ids, supported);
    }

    #[test]
    fn the_bundled_skill_is_well_formed() {
        let text = skill();
        assert!(text.starts_with("---\nname: marklyra-task\ndescription: "));
        assert!(!text.contains('\r'));
        assert!(ours(text));
        let body = instructions();
        assert!(body.starts_with("# MarkLyra 任务"));
        assert!(!body.contains(MARKER));
        let description = text.lines().nth(2).unwrap();
        assert!(description.chars().count() <= 1024);
    }

    #[test]
    fn installs_updates_and_removes_only_its_own_skill() {
        let home = tempfile::tempdir().unwrap();
        let home = home.path();
        let claude_skill = home
            .join(".claude")
            .join("skills")
            .join("marklyra-task")
            .join("SKILL.md");
        let opencode_skill = home
            .join(".config")
            .join("opencode")
            .join("skills")
            .join("marklyra-task")
            .join("SKILL.md");
        let fresh = statuses_in(home);
        assert!(fresh.iter().all(|s| !s.installed));
        assert_eq!(
            Path::new(&find(&fresh, "claude-acp").path),
            claude_skill.as_path()
        );
        assert_eq!(
            Path::new(&find(&fresh, "opencode").path),
            opencode_skill.as_path()
        );

        let after = install_in(home, "claude-acp").unwrap();
        let claude = find(&after, "claude-acp");
        assert!(claude.installed && claude.ours && claude.current);
        // GLM reads the same folder, so it shows as installed too.
        assert!(find(&after, "glm-acp-agent").current);
        assert_eq!(claude.shared_with, vec!["GLM"]);
        assert!(!find(&after, "codex-acp").installed);
        assert_eq!(std::fs::read_to_string(&claude_skill).unwrap(), skill());

        // An older copy of our own skill is replaced.
        std::fs::write(
            &claude_skill,
            "---\nname: marklyra-task\nmetadata:\n  generator: marklyra\n---\nold",
        )
        .unwrap();
        let stale = statuses_in(home);
        assert!(find(&stale, "claude-acp").ours && !find(&stale, "claude-acp").current);
        assert!(find(&install_in(home, "claude-acp").unwrap(), "claude-acp").current);

        // Removing keeps files the person put beside it, and the parent skills folder.
        let notes = home
            .join(".claude")
            .join("skills")
            .join("marklyra-task")
            .join("notes.md");
        std::fs::write(&notes, "mine").unwrap();
        let removed = uninstall_in(home, "glm-acp-agent").unwrap();
        assert!(!find(&removed, "claude-acp").installed);
        assert!(notes.exists());
        std::fs::remove_file(&notes).unwrap();
        install_in(home, "claude-acp").unwrap();
        uninstall_in(home, "claude-acp").unwrap();
        assert!(!home
            .join(".claude")
            .join("skills")
            .join("marklyra-task")
            .exists());
        assert!(home.join(".claude").join("skills").is_dir());
    }

    #[test]
    fn someone_elses_skill_is_left_alone() {
        let home = tempfile::tempdir().unwrap();
        let home = home.path();
        let dir = home.join(".agents/skills/marklyra-task");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SKILL.md"), "---\nname: marklyra-task\n---\nmine").unwrap();
        let status = statuses_in(home);
        assert!(find(&status, "codex-acp").installed && !find(&status, "codex-acp").ours);
        assert!(install_in(home, "codex-acp").is_err());
        assert!(uninstall_in(home, "minimax-code").is_err());
        assert_eq!(
            std::fs::read_to_string(dir.join("SKILL.md")).unwrap(),
            "---\nname: marklyra-task\n---\nmine"
        );
        // A folder holding other files but no skill is not ours either; an empty one is.
        let other = home.join(".kimi/skills/marklyra-task");
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(other.join("README.md"), "mine").unwrap();
        assert!(install_in(home, "kimi").is_err());
        std::fs::remove_file(other.join("README.md")).unwrap();
        assert!(find(&install_in(home, "kimi").unwrap(), "kimi").current);
    }

    #[test]
    fn unknown_agents_are_refused() {
        let home = tempfile::tempdir().unwrap();
        assert!(install_in(home.path(), "../../etc").is_err());
        assert!(uninstall_in(home.path(), "pi").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn symbolic_links_are_refused() {
        let home = tempfile::tempdir().unwrap();
        let home = home.path();
        let elsewhere = home.join("elsewhere");
        std::fs::create_dir_all(&elsewhere).unwrap();
        std::fs::create_dir_all(home.join(".qoder/skills")).unwrap();
        std::os::unix::fs::symlink(&elsewhere, home.join(".qoder/skills/marklyra-task")).unwrap();
        assert!(install_in(home, "qoder").is_err());
        assert!(uninstall_in(home, "qoder").is_err());
        assert!(std::fs::read_dir(&elsewhere).unwrap().next().is_none());
    }
}
