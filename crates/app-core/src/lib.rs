mod update;

use anyhow::{bail, Context, Result};
use cursor_provider::CursorProvider;
use host_model::{
    ActionMessage, AgentSummary, AppSettings, AppStatus, AppUpdateResult, AppUpdateStatus,
    CursorAccountStatus, CursorAuthFlowStatus, CursorLoginSessionStatus, CursorLoginStartResult,
    CursorRuntimeStatus, KnownConfig, PluginDetail, PluginSummary, RawConfigDocument,
    RawConfigPreview, RuntimeActionResult, SkillDocument, SkillFileSummary, SkillSummary,
};
use paseo_provider::PaseoProvider;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use uuid::Uuid;

pub use update::parse_update_worker_parent_pid;

pub const DEFAULT_DEV_TOKEN: &str = "123456";
pub const DEFAULT_PORT: u16 = 3000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppMode {
    Development,
    Production,
}

impl AppMode {
    pub fn from_env() -> Self {
        match env::var("APP_ENV")
            .unwrap_or_else(|_| "development".to_string())
            .to_ascii_lowercase()
            .as_str()
        {
            "production" | "prod" => Self::Production,
            _ => Self::Development,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Development => "development",
            Self::Production => "production",
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub app_name: String,
    pub mode: AppMode,
    pub port: u16,
    pub admin_token: String,
    pub managed_base_dir: PathBuf,
    pub web_dist_dir: PathBuf,
    pub repo_root: PathBuf,
    pub version: String,
}

impl AppConfig {
    pub fn load(repo_root: &Path) -> Result<Self> {
        let mode = AppMode::from_env();
        let admin_token = resolve_admin_token(&mode)?;
        let port = env::var("PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(DEFAULT_PORT);
        let managed_base_dir = env::var("MANAGED_BASE_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| repo_root.join(".local"));
        let web_dist_dir = env::var("WEB_DIST_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| repo_root.join("apps").join("web").join("dist"));
        let resolved_repo_root = env::var("REPO_ROOT")
            .map(PathBuf::from)
            .unwrap_or_else(|_| repo_root.to_path_buf());

        Ok(Self {
            app_name: "agent-manager".to_string(),
            mode,
            port,
            admin_token,
            managed_base_dir,
            web_dist_dir,
            repo_root: resolved_repo_root,
            version: read_version(repo_root)?,
        })
    }

    pub fn status(&self) -> AppStatus {
        AppStatus {
            app_name: self.app_name.clone(),
            version: self.version.clone(),
            mode: self.mode.as_str().to_string(),
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub sessions: Arc<RwLock<HashSet<String>>>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Result<Self> {
        Ok(Self {
            config,
            sessions: Arc::new(RwLock::new(HashSet::new())),
        })
    }

    pub fn login(&self, token: &str) -> Option<String> {
        if token != self.config.admin_token {
            return None;
        }

        let session_token = Uuid::new_v4().to_string();
        self.sessions
            .write()
            .expect("session lock poisoned")
            .insert(session_token.clone());
        Some(session_token)
    }

    pub fn is_authenticated(&self, session_token: &str) -> bool {
        self.sessions
            .read()
            .expect("session lock poisoned")
            .contains(session_token)
    }

    pub fn logout(&self, session_token: &str) {
        self.sessions
            .write()
            .expect("session lock poisoned")
            .remove(session_token);
    }

    pub fn status(&self) -> AppStatus {
        self.config.status()
    }

    pub fn app_settings(&self) -> AppSettings {
        update::app_settings(&self.config)
    }

    pub fn check_for_updates(&self) -> Result<AppSettings> {
        update::check_for_updates(&self.config)
    }

    pub fn spawn_background_update(&self) -> Result<AppUpdateResult> {
        update::spawn_background_update(&self.config)
    }

    pub fn update_job_status(&self) -> AppUpdateStatus {
        update::update_job_status(&self.config)
    }

    pub fn run_update_worker(parent_pid: u32) -> Result<()> {
        let repo_root = std::env::current_dir().context("failed to resolve current directory")?;
        let config = AppConfig::load(&repo_root)?;
        update::run_update_worker(&config, parent_pid)
    }

    pub fn list_agents(&self) -> Vec<AgentSummary> {
        self.provider().list_agents()
    }

    pub fn install_agent(&self, agent_id: &str) -> Result<RuntimeActionResult> {
        self.provider().install_agent(agent_id)
    }

    pub fn upgrade_agent(&self, agent_id: &str) -> Result<RuntimeActionResult> {
        self.provider().upgrade_agent(agent_id)
    }

    pub fn uninstall_agent(&self, agent_id: &str) -> Result<RuntimeActionResult> {
        self.provider().uninstall_agent(agent_id)
    }

    pub fn list_plugins(&self) -> Vec<PluginSummary> {
        self.paseo_provider().list_plugins()
    }

    pub fn plugin_detail(&self, plugin_id: &str) -> Result<PluginDetail> {
        self.paseo_provider().plugin_detail(plugin_id)
    }

    pub fn install_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        self.paseo_provider().install_plugin(plugin_id)
    }

    pub fn upgrade_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        self.paseo_provider().upgrade_plugin(plugin_id)
    }

    pub fn uninstall_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        self.paseo_provider().uninstall_plugin(plugin_id)
    }

    pub fn paseo_daemon_action(&self, plugin_id: &str, action: &str) -> Result<ActionMessage> {
        self.paseo_provider().daemon_action(plugin_id, action)
    }

    pub fn cursor_runtime_status(&self) -> CursorRuntimeStatus {
        self.provider().runtime_status()
    }

    pub fn install_cursor_runtime(&self) -> Result<RuntimeActionResult> {
        self.provider().install_latest_runtime()
    }

    pub fn upgrade_cursor_runtime(&self) -> Result<RuntimeActionResult> {
        self.provider().upgrade_runtime()
    }

    pub fn cursor_account_status(&self) -> CursorAccountStatus {
        self.provider().account_status()
    }

    pub fn cursor_auth_flow_status(&self) -> CursorAuthFlowStatus {
        self.provider().auth_flow_status()
    }

    pub fn start_cursor_login(&self) -> CursorLoginStartResult {
        self.provider().start_login()
    }

    pub fn cursor_login_session_status(&self) -> CursorLoginSessionStatus {
        self.provider().login_session_status()
    }

    pub fn known_config(&self) -> Result<KnownConfig> {
        self.provider().known_config()
    }

    pub fn update_known_config(&self, next: KnownConfig) -> Result<KnownConfig> {
        self.provider().update_known_config(next)
    }

    pub fn raw_config(&self) -> Result<RawConfigDocument> {
        self.provider().raw_config()
    }

    pub fn preview_raw_config(&self, next_content: String) -> Result<RawConfigPreview> {
        self.provider().preview_raw_config(next_content)
    }

    pub fn save_raw_config(&self, next_content: String) -> Result<RawConfigDocument> {
        self.provider().save_raw_config(next_content)
    }

    pub fn list_skills(&self) -> Result<Vec<SkillSummary>> {
        self.provider().list_skills()
    }

    pub fn list_skill_files(&self, folder_id: &str) -> Result<Vec<SkillFileSummary>> {
        self.provider().list_skill_files(folder_id)
    }

    pub fn read_skill(&self, id: &str) -> Result<SkillDocument> {
        self.provider().read_skill(id)
    }

    pub fn update_skill(&self, id: &str, content: &str) -> Result<SkillDocument> {
        self.provider().update_skill(id, content)
    }

    fn provider(&self) -> CursorProvider {
        CursorProvider::new()
    }

    fn paseo_provider(&self) -> PaseoProvider {
        PaseoProvider::new()
    }
}

fn resolve_admin_token(mode: &AppMode) -> Result<String> {
    if let Ok(token) = env::var("ADMIN_TOKEN") {
        if !token.trim().is_empty() {
            return Ok(token);
        }
    }

    if let Ok(token) = env::var("MANAGER_TOKEN") {
        if !token.trim().is_empty() {
            return Ok(token);
        }
    }

    if matches!(mode, AppMode::Development) {
        return Ok(DEFAULT_DEV_TOKEN.to_string());
    }

    bail!("ADMIN_TOKEN is required when APP_ENV=production")
}

pub fn read_version(repo_root: &Path) -> Result<String> {
    fs::read_to_string(repo_root.join("VERSION"))
        .context("failed to read VERSION")
        .map(|contents| contents.trim().to_string())
}
