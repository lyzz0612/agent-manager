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

/// agent-manager skill scope → `npx skills --agent` 值（见 vercel-labs/skills Supported Agents 表）。
pub fn skills_cli_agent_name(agent_manager_id: &str) -> Option<&'static str> {
    match agent_manager_id {
        COMMON_SKILL_AGENT => Some("zed"),
        "cursor" => Some("cursor"),
        _ => None,
    }
}

/// Skills 安装向导可勾选的 agent scope：`common` + 已注册 agent。
pub fn installable_skill_agent_ids() -> Vec<&'static str> {
    let mut ids = vec![COMMON_SKILL_AGENT];
    ids.extend(SUPPORTED_AGENTS.iter().map(|definition| definition.id));
    ids
}

#[derive(Debug, Clone, Copy)]
pub struct PluginDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub install_supported: bool,
    pub official_url: &'static str,
    pub install_command: &'static str,
    pub default_workspace: &'static str,
}

pub const GH_PLUGIN_ID: &str = "gh";
pub const PASEO_PLUGIN_ID: &str = "paseo";
pub const PASEO_OFFICIAL_RELAY_ENDPOINT: &str = "relay.paseo.sh:443";
pub const PASEO_DEFAULT_WORKSPACE: &str = "/workspaces/default";

/// Phase 1 支持的插件列表；扩展时在此注册即可。
pub const SUPPORTED_PLUGINS: &[PluginDefinition] = &[
    PluginDefinition {
        id: PASEO_PLUGIN_ID,
        name: "Paseo",
        description: "Paseo CLI 与本地 daemon：管理 AI agent 生命周期、relay 远程接入，以及 workspace 配对；详情页可查看 daemon 状态并获取配对链接。",
        install_supported: true,
        official_url: "https://paseo.sh/docs",
        install_command: "npm install -g @getpaseo/cli",
        default_workspace: PASEO_DEFAULT_WORKSPACE,
    },
    PluginDefinition {
        id: GH_PLUGIN_ID,
        name: "GitHub CLI",
        description: "GitHub 官方 CLI，在网页内完成 GitHub.com OAuth 授权。",
        install_supported: true,
        official_url: "https://cli.github.com/",
        install_command: "",
        default_workspace: "",
    },
];

/// Paseo 用户数据目录 → `~/.paseo`；gh → `~/.config/gh`。
pub fn plugin_home_dir(home: &Path, plugin_id: &str) -> PathBuf {
    if plugin_id == PASEO_PLUGIN_ID {
        home.join(".paseo")
    } else if plugin_id == GH_PLUGIN_ID {
        home.join(".config").join("gh")
    } else {
        home.join(format!(".{plugin_id}"))
    }
}

/// 当前运行环境的 GitHub CLI 安装说明（供 UI 展示；实际安装由管理页下载官方 release）。
pub fn gh_cli_install_command() -> String {
    match std::env::consts::OS {
        "windows" => "winget install --id GitHub.cli".to_string(),
        "macos" => "brew install gh".to_string(),
        "linux" => {
            "推荐点击「安装」，由管理页下载官方 release 到 ~/.local/bin。\n\
             手动（Debian/Ubuntu）：sudo apt install gh\n\
             手动（Fedora/RHEL）：sudo dnf install gh\n\
             更多平台：https://github.com/cli/cli#installation"
                .to_string()
        }
        other => format!("详见 https://cli.github.com/ 获取 {other} 安装说明"),
    }
}

/// GitHub CLI 受管安装根目录 → `~/.local/share/gh`。
pub fn gh_cli_install_root(home: &Path) -> PathBuf {
    home.join(".local").join("share").join("gh")
}

/// 已安装 GitHub CLI 可执行文件候选路径。
pub fn gh_cli_binary_candidates(home: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![home.join(".local").join("bin").join(if cfg!(windows) {
        "gh.exe"
    } else {
        "gh"
    })];

    let root = gh_cli_install_root(home);
    if let Ok(entries) = fs::read_dir(&root) {
        let mut version_dirs = entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.is_dir())
            .collect::<Vec<_>>();
        version_dirs.sort();
        version_dirs.reverse();
        for version_dir in version_dirs {
            candidates.push(version_dir.join("bin").join(if cfg!(windows) {
                "gh.exe"
            } else {
                "gh"
            }));
        }
    }

    candidates
}

/// 解析已安装的 GitHub CLI 可执行文件（受管目录、PATH 与常见系统路径）。
pub fn resolve_gh_cli_binary(home: &Path) -> Result<PathBuf> {
    for candidate in gh_cli_binary_candidates(home) {
        if candidate.is_file() {
            return Ok(candidate.canonicalize().unwrap_or(candidate));
        }
    }

    if let Some(candidate) = find_gh_in_path_env(Some(&user_path_with_local_bin(home))) {
        return Ok(candidate);
    }

    if let Some(candidate) = find_gh_in_path_env(None) {
        return Ok(candidate);
    }

    for candidate in gh_system_binary_candidates() {
        if candidate.is_file() {
            return Ok(candidate.canonicalize().unwrap_or(candidate));
        }
    }

    Err(anyhow!(
        "未找到 GitHub CLI（~/.local/bin/gh、PATH 中的 gh 或 /usr/bin/gh 等）"
    ))
}

fn gh_system_binary_candidates() -> Vec<PathBuf> {
    if cfg!(windows) {
        vec![
            PathBuf::from(r"C:\Program Files\GitHub CLI\gh.exe"),
            PathBuf::from(r"C:\Program Files (x86)\GitHub CLI\gh.exe"),
        ]
    } else {
        vec![
            PathBuf::from("/usr/local/bin/gh"),
            PathBuf::from("/usr/bin/gh"),
            PathBuf::from("/bin/gh"),
        ]
    }
}

fn find_gh_in_path_env(path_override: Option<&str>) -> Option<PathBuf> {
    let path_var = path_override
        .map(str::to_string)
        .or_else(|| env::var("PATH").ok())?;
    let binary_name = if cfg!(windows) { "gh.exe" } else { "gh" };
    let separator = if cfg!(windows) { ';' } else { ':' };

    for dir in path_var.split(separator).map(str::trim).filter(|dir| !dir.is_empty()) {
        let candidate = PathBuf::from(dir).join(binary_name);
        if candidate.is_file() {
            return Some(candidate.canonicalize().unwrap_or(candidate));
        }
    }

    None
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
