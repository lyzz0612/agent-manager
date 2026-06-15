use anyhow::{anyhow, Context, Result};
use host_fs::{
    agent_config_path, agent_home_dir, agent_skills_root, agent_state_dir, cursor_cli_install_command,
    cursor_cli_install_root, resolve_agent_skill_path, resolve_cursor_cli_binary, user_home_dir,
    user_path_with_local_bin,
    AgentDefinition,
    COMMON_SKILL_AGENT, SUPPORTED_AGENTS,
};
use host_model::{
    ActionMessage, AgentSummary, AuthStep, CursorAccountStatus, CursorAuthFlowStatus,
    CursorLoginSessionStatus, CursorLoginStartResult, CursorRuntimeStatus, KnownConfig,
    RawConfigDocument, RawConfigPreview, RuntimeActionResult, SkillDocument, SkillFileSummary,
    SkillSummary, SkillsCliCapability, SkillsCliInstallRequest, SkillsCliInstallResult,
    SkillsCliPreviewResult,
};

mod skills_cli;
use host_proc::run_command_with_env;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

const CURSOR_AGENT_ID: &str = "cursor";

#[derive(Debug, Default)]
struct CursorLoginSessionState {
    active: bool,
    auth_url: Option<String>,
    message: String,
    error: Option<String>,
}

fn login_session() -> Arc<Mutex<CursorLoginSessionState>> {
    static SESSION: OnceLock<Arc<Mutex<CursorLoginSessionState>>> = OnceLock::new();
    SESSION
        .get_or_init(|| Arc::new(Mutex::new(CursorLoginSessionState::default())))
        .clone()
}

pub struct CursorProvider;

impl CursorProvider {
    pub fn new() -> Self {
        Self
    }

    pub fn list_agents(&self) -> Vec<AgentSummary> {
        SUPPORTED_AGENTS
            .iter()
            .map(|definition| self.agent_summary(definition))
            .collect()
    }

    pub fn install_agent(&self, agent_id: &str) -> Result<RuntimeActionResult> {
        let definition = find_agent_definition(agent_id)?;
        if !definition.install_supported {
            return Err(anyhow!("暂不支持安装 agent: {agent_id}"));
        }

        match agent_id {
            CURSOR_AGENT_ID => self.install_latest_runtime(),
            other => Err(anyhow!("暂不支持安装 agent: {other}")),
        }
    }

    pub fn upgrade_agent(&self, agent_id: &str) -> Result<RuntimeActionResult> {
        let definition = find_agent_definition(agent_id)?;
        if !definition.install_supported {
            return Err(anyhow!("暂不支持升级 agent: {agent_id}"));
        }

        match agent_id {
            CURSOR_AGENT_ID => self.upgrade_runtime(),
            other => Err(anyhow!("暂不支持升级 agent: {other}")),
        }
    }

    pub fn uninstall_agent(&self, agent_id: &str) -> Result<RuntimeActionResult> {
        let definition = find_agent_definition(agent_id)?;
        if !definition.install_supported {
            return Err(anyhow!("暂不支持卸载 agent: {agent_id}"));
        }

        match agent_id {
            CURSOR_AGENT_ID => self.uninstall_runtime(),
            other => Err(anyhow!("暂不支持卸载 agent: {other}")),
        }
    }

    pub fn runtime_status(&self) -> CursorRuntimeStatus {
        self.agent_runtime_status(CURSOR_AGENT_ID)
    }

    pub fn install_latest_runtime(&self) -> Result<RuntimeActionResult> {
        let home = user_home_dir()?;
        self.run_install_command(&home)
            .context("failed to run official Cursor CLI install command")?;
        let status = self.agent_runtime_status(CURSOR_AGENT_ID);

        if !status.installed {
            return Err(anyhow!(
                "安装命令执行完成，但未检测到 Cursor CLI 安装目录或可执行文件"
            ));
        }

        Ok(RuntimeActionResult {
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            message: "已通过官方安装脚本安装 Cursor CLI".to_string(),
        })
    }

    pub fn upgrade_runtime(&self) -> Result<RuntimeActionResult> {
        let status = self.agent_runtime_status(CURSOR_AGENT_ID);

        if !status.installed {
            return Err(anyhow!("当前未检测到已安装的 Cursor CLI，无法执行升级"));
        }

        let home = user_home_dir()?;
        self.run_agent_command(CURSOR_AGENT_ID, &["update"], &home)
            .context("failed to run `agent update`")?;
        let status = self.agent_runtime_status(CURSOR_AGENT_ID);

        Ok(RuntimeActionResult {
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            message: "已执行 Cursor CLI 手动升级".to_string(),
        })
    }

    pub fn uninstall_runtime(&self) -> Result<RuntimeActionResult> {
        let home = user_home_dir()?;
        let install_root = cursor_cli_install_root(&home);

        if resolve_cursor_cli_binary(&home).is_err() && !install_root.exists() {
            return Err(anyhow!("当前未检测到已安装的 Cursor CLI，无法执行卸载"));
        }

        if !cfg!(windows) {
            let bin_dir = home.join(".local").join("bin");
            for name in ["agent", "cursor-agent"] {
                let link = bin_dir.join(name);
                if link.exists() {
                    fs::remove_file(&link)
                        .with_context(|| format!("failed to remove symlink: {}", link.display()))?;
                }
            }
        }

        if install_root.exists() {
            fs::remove_dir_all(&install_root).with_context(|| {
                format!(
                    "failed to remove Cursor CLI install directory: {}",
                    install_root.display()
                )
            })?;
        }

        let status = self.agent_runtime_status(CURSOR_AGENT_ID);

        Ok(RuntimeActionResult {
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            message: "已卸载 Cursor CLI（保留 ~/.cursor 用户数据）".to_string(),
        })
    }

    pub fn account_status(&self) -> CursorAccountStatus {
        if !self.agent_runtime_status(CURSOR_AGENT_ID).installed {
            return CursorAccountStatus {
                logged_in: false,
                email: None,
                display_name: None,
                note: "尚未安装 Cursor CLI，无法检测账号状态。".to_string(),
            };
        }

        let home = user_home_dir().ok();
        match home.and_then(|home| self.run_agent_command(CURSOR_AGENT_ID, &["status"], &home).ok())
        {
            Some(output) => parse_account_status(&output),
            None => {
                let fallback = user_home_dir()
                    .ok()
                    .and_then(|home| self.read_fallback_account_file(&home));
                fallback.unwrap_or(CursorAccountStatus {
                    logged_in: false,
                    email: None,
                    display_name: None,
                    note: "未能通过 `agent status` 解析账号信息，当前返回最小状态。".to_string(),
                })
            }
        }
    }

    pub fn auth_flow_status(&self) -> CursorAuthFlowStatus {
        CursorAuthFlowStatus {
            summary: "点击「开始登录」获取授权链接，在新标签页完成认证后，本页会自动刷新登录状态。".to_string(),
            steps: vec![
                AuthStep {
                    title: "开始登录".to_string(),
                    detail: "点击「开始登录」，系统会在后台执行 `agent login` 并展示授权链接。".to_string(),
                },
                AuthStep {
                    title: "打开授权链接".to_string(),
                    detail: "在新标签页打开授权链接，按 Cursor 页面提示完成登录。".to_string(),
                },
                AuthStep {
                    title: "等待确认".to_string(),
                    detail: "返回本页后无需手动刷新，系统会持续检测登录结果。".to_string(),
                },
            ],
        }
    }

    pub fn start_login(&self) -> CursorLoginStartResult {
        if !self.agent_runtime_status(CURSOR_AGENT_ID).installed {
            return CursorLoginStartResult {
                started: false,
                already_logged_in: false,
                auth_url: None,
                message: "尚未安装 Cursor CLI，无法开始登录。".to_string(),
            };
        }

        if self.account_status().logged_in {
            return CursorLoginStartResult {
                started: false,
                already_logged_in: true,
                auth_url: None,
                message: "当前已登录 Cursor。".to_string(),
            };
        }

        let session = login_session();
        {
            let guard = session.lock().expect("cursor login session lock poisoned");
            if guard.active {
                return CursorLoginStartResult {
                    started: true,
                    already_logged_in: false,
                    auth_url: guard.auth_url.clone(),
                    message: guard.message.clone(),
                };
            }
        }

        let home = match user_home_dir() {
            Ok(home) => home,
            Err(error) => {
                return CursorLoginStartResult {
                    started: false,
                    already_logged_in: false,
                    auth_url: None,
                    message: error.to_string(),
                };
            }
        };

        if let Err(error) = self.spawn_login_process(&home) {
            return CursorLoginStartResult {
                started: false,
                already_logged_in: false,
                auth_url: None,
                message: error.to_string(),
            };
        }

        for _ in 0..20 {
            std::thread::sleep(Duration::from_millis(250));
            let guard = session.lock().expect("cursor login session lock poisoned");
            if guard.auth_url.is_some() || guard.error.is_some() {
                return CursorLoginStartResult {
                    started: true,
                    already_logged_in: false,
                    auth_url: guard.auth_url.clone(),
                    message: guard.message.clone(),
                };
            }
        }

        let guard = session.lock().expect("cursor login session lock poisoned");
        CursorLoginStartResult {
            started: true,
            already_logged_in: false,
            auth_url: guard.auth_url.clone(),
            message: guard.message.clone(),
        }
    }

    pub fn login_session_status(&self) -> CursorLoginSessionStatus {
        let session = login_session();
        let guard = session.lock().expect("cursor login session lock poisoned");
        CursorLoginSessionStatus {
            active: guard.active,
            auth_url: guard.auth_url.clone(),
            message: guard.message.clone(),
            error: guard.error.clone(),
        }
    }

    pub fn logout(&self) -> Result<ActionMessage> {
        if !self.agent_runtime_status(CURSOR_AGENT_ID).installed {
            return Err(anyhow!("尚未安装 Cursor CLI，无法注销。"));
        }

        let home = user_home_dir()?;
        self.run_agent_command(CURSOR_AGENT_ID, &["logout"], &home)?;

        let session = login_session();
        {
            let mut guard = session.lock().expect("cursor login session lock poisoned");
            *guard = CursorLoginSessionState::default();
        }

        Ok(ActionMessage {
            message: "已注销 Cursor 账号。".to_string(),
        })
    }

    pub fn known_config(&self) -> Result<KnownConfig> {
        let config = self.read_config_json()?;

        Ok(KnownConfig {
            disable_telemetry: config
                .get("disableTelemetry")
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
            auto_update: config
                .get("autoUpdate")
                .and_then(|value| value.as_bool())
                .unwrap_or(true),
            release_track: config
                .get("releaseTrack")
                .and_then(|value| value.as_str())
                .unwrap_or("stable")
                .to_string(),
        })
    }

    pub fn update_known_config(&self, next: KnownConfig) -> Result<KnownConfig> {
        let mut config = self.read_config_json()?;

        if !config.is_object() {
            config = Value::Object(Map::new());
        }

        let object = config
            .as_object_mut()
            .expect("config should be a JSON object after normalization");
        object.insert(
            "disableTelemetry".to_string(),
            Value::Bool(next.disable_telemetry),
        );
        object.insert("autoUpdate".to_string(), Value::Bool(next.auto_update));
        object.insert(
            "releaseTrack".to_string(),
            Value::String(next.release_track.clone()),
        );

        self.write_config_json(&Value::Object(object.clone()))?;
        Ok(next)
    }

    pub fn raw_config(&self) -> Result<RawConfigDocument> {
        let path = self.config_file()?;

        if !path.exists() {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            self.write_config_json(&default_config_json())?;
        }

        Ok(RawConfigDocument {
            path: path.to_string_lossy().to_string(),
            content: fs::read_to_string(&path).unwrap_or_else(|_| "{}".to_string()),
        })
    }

    pub fn preview_raw_config(&self, next_content: String) -> Result<RawConfigPreview> {
        serde_json::from_str::<Value>(&next_content).context("原始配置必须是合法 JSON")?;
        let current = self.raw_config()?;

        Ok(RawConfigPreview {
            path: current.path,
            current_content: current.content,
            next_content,
        })
    }

    pub fn save_raw_config(&self, next_content: String) -> Result<RawConfigDocument> {
        serde_json::from_str::<Value>(&next_content).context("原始配置必须是合法 JSON")?;
        let path = self.config_file()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, next_content.as_bytes())
            .with_context(|| format!("failed to write config file: {}", path.display()))?;
        self.raw_config()
    }

    pub fn list_skills(&self) -> Result<Vec<SkillSummary>> {
        let home = user_home_dir()?;
        let mut skills = Vec::new();

        let common_root = agent_skills_root(&home, COMMON_SKILL_AGENT);
        if common_root.is_dir() {
            for path in collect_skill_folders(&common_root)? {
                skills.push(skill_folder_summary_from_path(
                    COMMON_SKILL_AGENT,
                    &common_root,
                    &path,
                )?);
            }
        }

        for definition in SUPPORTED_AGENTS {
            let agent_root = agent_skills_root(&home, definition.id);
            if !agent_root.is_dir() {
                continue;
            }

            for path in collect_skill_folders(&agent_root)? {
                skills.push(skill_folder_summary_from_path(
                    definition.id,
                    &agent_root,
                    &path,
                )?);
            }
        }

        skills.sort_by(|left, right| left.id.cmp(&right.id));
        skills.dedup_by(|left, right| left.id == right.id);
        Ok(skills)
    }

    pub fn list_skill_files(&self, folder_id: &str) -> Result<Vec<SkillFileSummary>> {
        let (agent, folder_path) = self.resolve_skill_folder(folder_id)?;
        let folder_name = folder_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("unknown")
            .to_string();
        let mut files = Vec::new();

        for path in collect_files(&folder_path)? {
            files.push(skill_file_summary_from_path(
                &agent,
                &folder_name,
                &folder_path,
                &path,
            )?);
        }

        files.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(files)
    }

    pub fn read_skill(&self, id: &str) -> Result<SkillDocument> {
        let (agent, path) = self.resolve_skill_file(id)?;
        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read skill: {}", path.display()))?;

        Ok(SkillDocument {
            id: id.to_string(),
            name: skill_display_name(&path),
            agent,
            path: path.to_string_lossy().to_string(),
            content,
        })
    }

    pub fn update_skill(&self, id: &str, content: &str) -> Result<SkillDocument> {
        let (_, path) = self.resolve_skill_file(id)?;

        fs::write(&path, content.as_bytes())
            .with_context(|| format!("failed to update skill: {}", path.display()))?;

        self.read_skill(id)
    }

    pub fn skills_cli_status(&self) -> SkillsCliCapability {
        skills_cli::skills_cli_status()
    }

    pub fn skills_cli_preview(&self, source: &str) -> Result<SkillsCliPreviewResult> {
        skills_cli::skills_cli_preview(source)
    }

    pub fn skills_cli_install(
        &self,
        request: &SkillsCliInstallRequest,
    ) -> Result<SkillsCliInstallResult> {
        skills_cli::skills_cli_install(request)
    }

    fn agent_summary(&self, definition: &AgentDefinition) -> AgentSummary {
        let status = self.agent_runtime_status(definition.id);
        AgentSummary {
            id: definition.id.to_string(),
            name: definition.name.to_string(),
            installed: status.installed,
            version: status.version,
            install_dir: status.install_dir,
            data_dir: status.data_dir,
            install_supported: definition.install_supported,
            install_command: self.install_command_for(definition),
        }
    }

    fn install_command_for(&self, definition: &AgentDefinition) -> Option<String> {
        if !definition.install_supported || definition.id != CURSOR_AGENT_ID {
            return None;
        }

        Some(cursor_cli_install_command().to_string())
    }

    fn agent_runtime_status(&self, agent_id: &str) -> CursorRuntimeStatus {
        let default_data_dir = format!("~/.{agent_id}");
        let default_install_dir = if agent_id == CURSOR_AGENT_ID {
            if cfg!(windows) {
                "%LOCALAPPDATA%\\cursor-agent".to_string()
            } else {
                "~/.local/share/cursor-agent".to_string()
            }
        } else {
            String::new()
        };

        let Ok(home) = user_home_dir() else {
            return CursorRuntimeStatus {
                installed: false,
                version: None,
                install_dir: default_install_dir,
                data_dir: default_data_dir,
            };
        };

        let data_dir = agent_home_dir(&home, agent_id)
            .to_string_lossy()
            .to_string();

        if agent_id != CURSOR_AGENT_ID {
            return CursorRuntimeStatus {
                installed: false,
                version: None,
                install_dir: String::new(),
                data_dir,
            };
        }

        let install_dir = cursor_cli_install_root(&home)
            .to_string_lossy()
            .to_string();
        let installed = resolve_cursor_cli_binary(&home).is_ok();
        let version = if installed {
            self.run_agent_command(CURSOR_AGENT_ID, &["--version"], &home).ok()
        } else {
            None
        };

        CursorRuntimeStatus {
            installed,
            version,
            install_dir,
            data_dir,
        }
    }

    fn config_file(&self) -> Result<PathBuf> {
        let home = user_home_dir()?;
        Ok(agent_config_path(&home, CURSOR_AGENT_ID))
    }

    fn read_config_json(&self) -> Result<Value> {
        let path = self.config_file()?;

        if !path.exists() {
            let default = default_config_json();
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            self.write_config_json(&default)?;
            return Ok(default);
        }

        let content = fs::read_to_string(&path)
            .with_context(|| format!("failed to read config file: {}", path.display()))?;
        serde_json::from_str(&content).context("配置文件不是合法 JSON")
    }

    fn write_config_json(&self, value: &Value) -> Result<()> {
        let path = self.config_file()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let contents = serde_json::to_string_pretty(value)?;
        fs::write(&path, contents.as_bytes())
            .with_context(|| format!("failed to write config file: {}", path.display()))
    }

    fn resolve_skill_folder(&self, folder_id: &str) -> Result<(String, PathBuf)> {
        let (agent, rest) = folder_id
            .split_once('/')
            .ok_or_else(|| anyhow!("无效的 skill 文件夹 id，应为 agent/文件夹名"))?;
        let home = user_home_dir()?;
        let path = resolve_agent_skill_path(&home, agent, rest)?;

        if !path.is_dir() {
            return Err(anyhow!("未找到 skill 文件夹: {folder_id}"));
        }

        Ok((agent.to_string(), path))
    }

    fn resolve_skill_file(&self, id: &str) -> Result<(String, PathBuf)> {
        let (agent, rest) = id
            .split_once('/')
            .ok_or_else(|| anyhow!("无效的 skill 文件 id，应为 agent/相对路径"))?;
        let home = user_home_dir()?;
        let path = resolve_agent_skill_path(&home, agent, rest)?;

        if path.is_dir() {
            return Err(anyhow!("不能编辑 skill 文件夹，请选择文件夹内的文件"));
        }

        Ok((agent.to_string(), path))
    }

    fn user_env(&self, home: &Path) -> BTreeMap<String, String> {
        let mut envs = BTreeMap::new();
        envs.insert("HOME".to_string(), home.to_string_lossy().to_string());
        envs.insert("USERPROFILE".to_string(), home.to_string_lossy().to_string());
        envs.insert("PATH".to_string(), user_path_with_local_bin(home));
        envs
    }

    fn run_install_command(&self, home: &Path) -> Result<String> {
        let command = cursor_cli_install_command();
        if cfg!(windows) {
            run_command_with_env(
                "powershell",
                &["-NoProfile", "-Command", command],
                home,
                &self.user_env(home),
            )
        } else {
            run_command_with_env("bash", &["-lc", command], home, &self.user_env(home))
        }
    }

    fn run_agent_command(&self, agent_id: &str, args: &[&str], home: &Path) -> Result<String> {
        if agent_id != CURSOR_AGENT_ID {
            return Err(anyhow!("暂不支持运行 agent: {agent_id}"));
        }

        let binary = resolve_cursor_cli_binary(home)?;
        let program = binary.to_string_lossy().to_string();
        run_command_with_env(&program, args, home, &self.user_env(home))
    }

    fn spawn_login_process(&self, home: &Path) -> Result<()> {
        let binary = resolve_cursor_cli_binary(home)?;
        let program = binary.to_string_lossy().to_string();
        let home_buf = home.to_path_buf();
        let envs = self.user_env(home);
        let session = login_session();

        {
            let mut guard = session.lock().expect("cursor login session lock poisoned");
            guard.active = true;
            guard.auth_url = None;
            guard.error = None;
            guard.message = "正在启动 Cursor 登录...".to_string();
        }

        std::thread::spawn(move || {
            let mut command = Command::new(&program);
            command
                .args(["login"])
                .current_dir(&home_buf)
                .envs(&envs)
                .env("NO_OPEN_BROWSER", "1")
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());

            let mut child = match command.spawn() {
                Ok(child) => child,
                Err(error) => {
                    set_login_session_error(&session, error.to_string());
                    return;
                }
            };

            if let Some(stdout) = child.stdout.take() {
                let session_clone = session.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines().map_while(Result::ok) {
                        update_login_session_from_line(&session_clone, &line);
                    }
                });
            }

            if let Some(stderr) = child.stderr.take() {
                let session_clone = session.clone();
                std::thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines().map_while(Result::ok) {
                        update_login_session_from_line(&session_clone, &line);
                    }
                });
            }

            let exit_status = child.wait();
            let mut guard = session.lock().expect("cursor login session lock poisoned");
            guard.active = false;

            match exit_status {
                Ok(status) if status.success() => {
                    guard.message = "登录成功。".to_string();
                    guard.auth_url = None;
                }
                Ok(_) if guard.error.is_none() => {
                    guard.error = Some("登录未完成或已取消。".to_string());
                    if guard.message.is_empty() {
                        guard.message = "登录流程已结束。".to_string();
                    }
                }
                Err(error) if guard.error.is_none() => {
                    guard.error = Some(error.to_string());
                }
                _ => {}
            }
        });

        Ok(())
    }

    fn read_fallback_account_file(&self, home: &Path) -> Option<CursorAccountStatus> {
        let account_file = agent_state_dir(home, CURSOR_AGENT_ID).join("account.json");
        let contents = fs::read_to_string(account_file).ok()?;
        let json = serde_json::from_str::<serde_json::Value>(&contents).ok()?;

        Some(CursorAccountStatus {
            logged_in: json
                .get("logged_in")
                .and_then(|value| value.as_bool())
                .unwrap_or(false),
            email: json
                .get("email")
                .and_then(|value| value.as_str())
                .map(ToString::to_string),
            display_name: json
                .get("display_name")
                .and_then(|value| value.as_str())
                .map(ToString::to_string),
            note: "Cursor CLI 账号信息按 best-effort 从 ~/.cursor/state 读取。".to_string(),
        })
    }
}

fn find_agent_definition(agent_id: &str) -> Result<&'static AgentDefinition> {
    SUPPORTED_AGENTS
        .iter()
        .find(|definition| definition.id == agent_id)
        .ok_or_else(|| anyhow!("未知 agent: {agent_id}"))
}

fn default_config_json() -> Value {
    json!({
        "disableTelemetry": false,
        "autoUpdate": true,
        "releaseTrack": "stable"
    })
}

fn skill_folder_summary_from_path(
    agent: &str,
    agent_root: &Path,
    path: &Path,
) -> Result<SkillSummary> {
    let relative = path
        .strip_prefix(agent_root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let id = format!("{agent}/{relative}");
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(&relative)
        .to_string();

    Ok(SkillSummary {
        id,
        name,
        agent: agent.to_string(),
        path: path.to_string_lossy().to_string(),
    })
}

fn skill_file_summary_from_path(
    agent: &str,
    folder: &str,
    folder_path: &Path,
    path: &Path,
) -> Result<SkillFileSummary> {
    let relative = path
        .strip_prefix(folder_path)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/");
    let id = format!("{agent}/{folder}/{relative}");

    Ok(SkillFileSummary {
        id,
        name: relative,
        agent: agent.to_string(),
        folder: folder.to_string(),
        path: path.to_string_lossy().to_string(),
    })
}

fn skill_display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_string()
}

fn collect_skill_folders(root: &Path) -> Result<Vec<PathBuf>> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut folders = Vec::new();

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            folders.push(path);
        }
    }

    folders.sort();
    Ok(folders)
}

fn collect_files(root: &Path) -> Result<Vec<PathBuf>> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();

    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            files.extend(collect_files(&path)?);
        } else if path.is_file() {
            files.push(path);
        }
    }

    Ok(files)
}

fn parse_account_status(output: &str) -> CursorAccountStatus {
    let lower = output.to_ascii_lowercase();
    let email = Regex::new(r"(?i)([A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,})")
        .ok()
        .and_then(|regex| regex.captures(output))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().to_string());
    let explicitly_logged_out = lower.contains("not logged in")
        || lower.contains("not authenticated")
        || lower.contains("logged out");
    let logged_in = !explicitly_logged_out
        && (lower.contains("logged in") || email.is_some());
    let display_name = Regex::new(r"(?im)^(?:name|display name|signed in as)\s*:\s*(.+)$")
        .ok()
        .and_then(|regex| regex.captures(output))
        .and_then(|captures| captures.get(1))
        .map(|value| value.as_str().trim().to_string())
        .filter(|value| email.as_ref().map(|mail| mail != value).unwrap_or(true));

    CursorAccountStatus {
        logged_in,
        email,
        display_name,
        note: "Cursor CLI 账号信息由 `agent status` 输出做 best-effort 解析。".to_string(),
    }
}

fn update_login_session_from_line(session: &Arc<Mutex<CursorLoginSessionState>>, line: &str) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return;
    }

    let mut guard = session.lock().expect("cursor login session lock poisoned");
    if let Some(url) = extract_auth_url(trimmed) {
        guard.auth_url = Some(url);
        guard.message = "请在浏览器中打开授权链接完成登录。".to_string();
        return;
    }

    if guard.auth_url.is_none() {
        guard.message = trimmed.to_string();
    }
}

fn set_login_session_error(session: &Arc<Mutex<CursorLoginSessionState>>, message: String) {
    let mut guard = session.lock().expect("cursor login session lock poisoned");
    guard.active = false;
    guard.error = Some(message.clone());
    guard.message = message;
}

fn extract_auth_url(text: &str) -> Option<String> {
    Regex::new(r"https://[^\s]+")
        .ok()?
        .find(text)
        .map(|value| value.as_str().to_string())
}
