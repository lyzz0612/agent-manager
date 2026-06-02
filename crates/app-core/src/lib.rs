use anyhow::{bail, Context, Result};
use cursor_provider::CursorProvider;
use host_model::{
    ActionMessage, AppStatus, CursorAccountStatus, CursorAuthFlowStatus, CursorRuntimeStatus,
    KnownConfig, RawConfigDocument, RawConfigPreview, RuntimeActionResult, SkillDocument,
    SkillSummary,
};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use uuid::Uuid;

pub const DEFAULT_DEV_TOKEN: &str = "dev-agent-manager-token";
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

        Ok(Self {
            app_name: "agent-manager".to_string(),
            mode,
            port,
            admin_token,
            managed_base_dir,
            web_dist_dir,
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
        let provider = CursorProvider::new(config.managed_base_dir.clone());
        provider.ensure_layout()?;

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

    pub fn read_skill(&self, name: &str) -> Result<SkillDocument> {
        self.provider().read_skill(name)
    }

    pub fn update_skill(&self, name: &str, content: &str) -> Result<SkillDocument> {
        self.provider().update_skill(name, content)
    }

    pub fn delete_skill(&self, name: &str) -> Result<ActionMessage> {
        self.provider().delete_skill(name)
    }

    fn provider(&self) -> CursorProvider {
        CursorProvider::new(self.config.managed_base_dir.clone())
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
