use anyhow::{anyhow, Result};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

pub const COMMON_SKILL_AGENT: &str = "common";

#[derive(Debug, Clone, Copy)]
pub struct AgentDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub install_supported: bool,
}

/// Phase 1 支持的 agent 列表；扩展时在此注册即可。
/// 本项目中 `cursor` 指 Cursor CLI（`agent` 命令行工具），不是 Cursor IDE。
pub const SUPPORTED_AGENTS: &[AgentDefinition] = &[AgentDefinition {
    id: "cursor",
    name: "Cursor CLI",
    install_supported: true,
}];

#[derive(Debug, Clone, Copy)]
pub struct PluginDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub install_supported: bool,
    pub official_url: &'static str,
    pub install_command: &'static str,
    pub default_workspace: &'static str,
}

pub const PASEO_PLUGIN_ID: &str = "paseo";
pub const PASEO_OFFICIAL_RELAY_ENDPOINT: &str = "relay.paseo.sh:443";
pub const PASEO_DEFAULT_WORKSPACE: &str = "/workspaces/default";

/// Phase 1 支持的插件列表；扩展时在此注册即可。
pub const SUPPORTED_PLUGINS: &[PluginDefinition] = &[PluginDefinition {
    id: PASEO_PLUGIN_ID,
    name: "Paseo",
    install_supported: true,
    official_url: "https://paseo.sh/docs",
    install_command: "npm install -g @getpaseo/cli",
    default_workspace: PASEO_DEFAULT_WORKSPACE,
}];

/// Paseo 用户数据目录 → `~/.paseo`。
pub fn plugin_home_dir(home: &Path, plugin_id: &str) -> PathBuf {
    if plugin_id == PASEO_PLUGIN_ID {
        home.join(".paseo")
    } else {
        home.join(format!(".{plugin_id}"))
    }
}

pub fn plugin_config_path(home: &Path, plugin_id: &str) -> PathBuf {
    plugin_home_dir(home, plugin_id).join("config.json")
}

pub fn find_plugin_definition(plugin_id: &str) -> Result<&'static PluginDefinition> {
    SUPPORTED_PLUGINS
        .iter()
        .find(|definition| definition.id == plugin_id)
        .ok_or_else(|| anyhow!("未知插件: {plugin_id}"))
}

/// 解析用户主目录（`~`），兼容 Linux/macOS 与 Windows。
pub fn user_home_dir() -> Result<PathBuf> {
    if let Ok(home) = env::var("HOME") {
        let trimmed = home.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }

    if let Ok(profile) = env::var("USERPROFILE") {
        let trimmed = profile.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }

    Err(anyhow!("无法解析用户主目录，请设置 HOME 或 USERPROFILE"))
}

/// Cursor CLI 用户数据目录（配置、状态、skills）→ `~/.cursor`。
pub fn agent_home_dir(home: &Path, agent_id: &str) -> PathBuf {
    home.join(format!(".{agent_id}"))
}

/// 当前平台的 Cursor CLI 官方安装命令。
pub fn cursor_cli_install_command() -> &'static str {
    if cfg!(windows) {
        "irm 'https://cursor.com/install?win32=true' | iex"
    } else {
        "curl https://cursor.com/install -fsS | bash"
    }
}

/// Cursor CLI 安装根目录。
///
/// - Unix：`~/.local/share/cursor-agent`
/// - Windows：`%LOCALAPPDATA%\cursor-agent`
pub fn cursor_cli_install_root(home: &Path) -> PathBuf {
    if cfg!(windows) {
        env::var("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join("AppData").join("Local"))
            .join("cursor-agent")
    } else {
        home.join(".local").join("share").join("cursor-agent")
    }
}

/// Cursor CLI 可执行文件候选名（按优先级）。
///
/// 优先返回安装目录内的实际二进制，避免依赖 `PATH` 或 `~/.local/bin` 软链接。
pub fn cursor_cli_binary_candidates(home: &Path) -> Vec<PathBuf> {
    if cfg!(windows) {
        let root = cursor_cli_install_root(home);
        vec![
            root.join("agent.exe"),
            root.join("cursor-agent.exe"),
            root.join("agent.cmd"),
            root.join("cursor-agent.cmd"),
        ]
    } else {
        let mut candidates = cursor_cli_version_binary_candidates(home);
        let root = cursor_cli_install_root(home);
        candidates.push(root.join("cursor-agent"));
        candidates.push(root.join("agent"));

        let bin = home.join(".local").join("bin");
        candidates.push(bin.join("agent"));
        candidates.push(bin.join("cursor-agent"));
        candidates
    }
}

/// 解析已安装的 Cursor CLI 可执行文件，返回 canonical 绝对路径。
pub fn resolve_cursor_cli_binary(home: &Path) -> Result<PathBuf> {
    for candidate in cursor_cli_binary_candidates(home) {
        if candidate.exists() {
            return Ok(candidate
                .canonicalize()
                .unwrap_or(candidate));
        }
    }

    if cfg!(windows) {
        Err(anyhow!(
            "未找到 Cursor CLI（%LOCALAPPDATA%\\cursor-agent\\agent.exe）"
        ))
    } else {
        Err(anyhow!(
            "未找到 Cursor CLI（~/.local/share/cursor-agent/versions/*/cursor-agent 或 ~/.local/bin/agent）"
        ))
    }
}

fn cursor_cli_version_binary_candidates(home: &Path) -> Vec<PathBuf> {
    let versions_dir = cursor_cli_install_root(home).join("versions");
    let Ok(entries) = fs::read_dir(&versions_dir) else {
        return Vec::new();
    };

    let mut version_dirs = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect::<Vec<_>>();
    version_dirs.sort();
    version_dirs.reverse();

    let mut candidates = Vec::new();
    for version_dir in version_dirs {
        for name in ["cursor-agent", "agent"] {
            let path = version_dir.join(name);
            if path.is_file() {
                candidates.push(path);
            }
        }
    }

    candidates
}

pub fn agent_config_path(home: &Path, agent_id: &str) -> PathBuf {
    agent_home_dir(home, agent_id).join("config.json")
}

pub fn agent_state_dir(home: &Path, agent_id: &str) -> PathBuf {
    agent_home_dir(home, agent_id).join("state")
}

pub fn user_path_with_local_bin(home: &Path) -> String {
    let existing = env::var("PATH").unwrap_or_default();
    let separator = if cfg!(windows) { ';' } else { ':' };
    let mut prefixes = Vec::new();

    if cfg!(windows) {
        prefixes.push(cursor_cli_install_root(home));
    } else {
        prefixes.push(home.join(".local").join("bin"));
    }

    let mut path = prefixes
        .iter()
        .map(|entry| entry.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join(&separator.to_string());

    if !existing.is_empty() {
        if !path.is_empty() {
            path.push(separator);
        }
        path.push_str(&existing);
    }

    path
}

/// 返回某个 agent 的 user 级 skill 根目录。
///
/// - `common` → `~/.agents/skills`
/// - 其他 agent（如 `cursor`）→ `~/.{agent}/skills`
pub fn agent_skills_root(home: &Path, agent_id: &str) -> PathBuf {
    if agent_id == COMMON_SKILL_AGENT {
        home.join(".agents").join("skills")
    } else {
        home.join(format!(".{agent_id}")).join("skills")
    }
}

pub fn ensure_agent_skills_root(home: &Path, agent_id: &str) -> Result<PathBuf> {
    let root = agent_skills_root(home, agent_id);
    fs::create_dir_all(&root)?;
    Ok(root)
}

pub fn resolve_agent_skill_path(home: &Path, agent_id: &str, relative: &str) -> Result<PathBuf> {
    if relative.is_empty() || relative.contains("..") {
        return Err(anyhow!("无效的 skill 相对路径"));
    }

    let root = agent_skills_root(home, agent_id);
    let path = root.join(relative);

    if !path.exists() {
        return Err(anyhow!("未找到 skill: {agent_id}/{relative}"));
    }

    Ok(path)
}
