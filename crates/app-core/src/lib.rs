mod runtime_cache;
mod update;

use anyhow::{bail, Context, Result};
use cursor_provider::CursorProvider;
use host_model::{
    ActionMessage, AgentSummary, AppSettings, AppStatus, AppUpdateResult, AppUpdateStatus,
    CacheRefreshRequest, CursorAccountStatus, CursorAuthFlowStatus, CursorLoginSessionStatus,
    CursorLoginStartResult, CursorRuntimeStatus, KnownConfig, OverviewAgentItem, OverviewData,
    OverviewPluginItem, PluginDetail, PluginSummary, RawConfigDocument, RawConfigPreview,
    RuntimeActionResult, SkillDocument, SkillFileSummary, SkillSummary,
};
use paseo_provider::PaseoProvider;
use runtime_cache::{RefreshScope, RefreshTiming, RuntimeCache};
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tracing::{info, warn};
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
    cache: Arc<RwLock<RuntimeCache>>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Result<Self> {
        update::recover_stale_update_job_on_startup(&config);
        Ok(Self {
            config,
            sessions: Arc::new(RwLock::new(HashSet::new())),
            cache: Arc::new(RwLock::new(RuntimeCache::new())),
        })
    }

    pub fn warmup_cache(&self) {
        if let Err(error) = self.refresh_cache(RefreshScope::All) {
            warn!(error = %error, "runtime cache warmup failed");
        }
    }

    pub fn refresh_cache(&self, scope: RefreshScope) -> Result<ActionMessage> {
        let timing = RefreshTiming::new(scope.clone());
        let message = match scope {
            RefreshScope::All => {
                self.refresh_overview_bundle()?;
                self.refresh_cursor_runtime_internal()?;
                self.refresh_cursor_account_internal()?;
                self.refresh_plugin_detail_internal("paseo")?;
                "已刷新全部运行时缓存".to_string()
            }
            RefreshScope::Overview => {
                self.refresh_overview_bundle()?;
                "已刷新 overview 缓存".to_string()
            }
            RefreshScope::Agents => {
                self.refresh_agents_internal()?;
                "已刷新 agents 缓存".to_string()
            }
            RefreshScope::Plugins => {
                self.refresh_plugins_internal()?;
                "已刷新 plugins 缓存".to_string()
            }
            RefreshScope::Plugin(plugin_id) => {
                self.refresh_plugin_detail_internal(&plugin_id)?;
                format!("已刷新 plugin:{plugin_id} 缓存")
            }
            RefreshScope::CursorRuntime => {
                self.refresh_cursor_runtime_internal()?;
                "已刷新 cursor_runtime 缓存".to_string()
            }
            RefreshScope::CursorAccount => {
                self.refresh_cursor_account_internal()?;
                "已刷新 cursor_account 缓存".to_string()
            }
        };

        info!(
            scope = timing.scope.label(),
            elapsed_ms = timing.elapsed_ms(),
            "runtime cache refreshed"
        );

        Ok(ActionMessage { message })
    }

    pub fn refresh_cache_request(&self, request: &CacheRefreshRequest) -> Result<ActionMessage> {
        let scope = RefreshScope::parse(
            request.scope.trim(),
            request.plugin_id.as_deref(),
        )
        .map_err(|message| anyhow::anyhow!(message))?;
        self.refresh_cache(scope)
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

    pub fn overview(&self) -> OverviewData {
        if let Some(overview) = self
            .cache
            .read()
            .expect("runtime cache lock poisoned")
            .overview()
            .cloned()
        {
            return overview;
        }

        self.refresh_overview_bundle()
            .unwrap_or_else(|error| {
                warn!(error = %error, "failed to refresh overview cache on read");
                self.build_overview_from_live()
            })
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
        if let Some(agents) = self
            .cache
            .read()
            .expect("runtime cache lock poisoned")
            .agents()
            .cloned()
        {
            return agents;
        }

        self.refresh_agents_internal()
            .unwrap_or_else(|error| {
                warn!(error = %error, "failed to refresh agents cache on read");
                self.provider().list_agents()
            })
    }

    pub fn install_agent(&self, agent_id: &str) -> Result<RuntimeActionResult> {
        let result = self.provider().install_agent(agent_id)?;
        self.after_agent_mutation();
        Ok(result)
    }

    pub fn upgrade_agent(&self, agent_id: &str) -> Result<RuntimeActionResult> {
        let result = self.provider().upgrade_agent(agent_id)?;
        self.after_agent_mutation();
        Ok(result)
    }

    pub fn uninstall_agent(&self, agent_id: &str) -> Result<RuntimeActionResult> {
        let result = self.provider().uninstall_agent(agent_id)?;
        self.after_agent_mutation();
        Ok(result)
    }

    pub fn list_plugins(&self) -> Vec<PluginSummary> {
        if let Some(plugins) = self
            .cache
            .read()
            .expect("runtime cache lock poisoned")
            .plugins()
            .cloned()
        {
            return plugins;
        }

        self.refresh_plugins_internal()
            .unwrap_or_else(|error| {
                warn!(error = %error, "failed to refresh plugins cache on read");
                self.paseo_provider().list_plugins()
            })
    }

    pub fn plugin_detail(&self, plugin_id: &str) -> Result<PluginDetail> {
        if let Some(detail) = self
            .cache
            .read()
            .expect("runtime cache lock poisoned")
            .plugin_detail(plugin_id)
            .cloned()
        {
            return Ok(detail);
        }

        self.refresh_plugin_detail_internal(plugin_id)
    }

    pub fn install_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        let result = self.paseo_provider().install_plugin(plugin_id)?;
        self.after_plugin_mutation(plugin_id);
        Ok(result)
    }

    pub fn upgrade_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        let result = self.paseo_provider().upgrade_plugin(plugin_id)?;
        self.after_plugin_mutation(plugin_id);
        Ok(result)
    }

    pub fn uninstall_plugin(&self, plugin_id: &str) -> Result<RuntimeActionResult> {
        let result = self.paseo_provider().uninstall_plugin(plugin_id)?;
        self.after_plugin_mutation(plugin_id);
        Ok(result)
    }

    pub fn paseo_daemon_action(&self, plugin_id: &str, action: &str) -> Result<ActionMessage> {
        let result = self.paseo_provider().daemon_action(plugin_id, action)?;
        self.after_daemon_mutation(plugin_id);
        Ok(result)
    }

    pub fn cursor_runtime_status(&self) -> CursorRuntimeStatus {
        if let Some(status) = self
            .cache
            .read()
            .expect("runtime cache lock poisoned")
            .cursor_runtime()
            .cloned()
        {
            return status;
        }

        self.refresh_cursor_runtime_internal()
            .unwrap_or_else(|error| {
                warn!(error = %error, "failed to refresh cursor runtime cache on read");
                self.provider().runtime_status()
            })
    }

    pub fn install_cursor_runtime(&self) -> Result<RuntimeActionResult> {
        let result = self.provider().install_latest_runtime()?;
        self.after_cursor_runtime_mutation();
        Ok(result)
    }

    pub fn upgrade_cursor_runtime(&self) -> Result<RuntimeActionResult> {
        let result = self.provider().upgrade_runtime()?;
        self.after_cursor_runtime_mutation();
        Ok(result)
    }

    pub fn cursor_account_status(&self) -> CursorAccountStatus {
        if self.provider().login_session_status().active {
            let status = self.provider().account_status();
            self.cache
                .write()
                .expect("runtime cache lock poisoned")
                .set_cursor_account(status.clone());
            return status;
        }

        if let Some(status) = self
            .cache
            .read()
            .expect("runtime cache lock poisoned")
            .cursor_account()
            .cloned()
        {
            return status;
        }

        self.refresh_cursor_account_internal()
            .unwrap_or_else(|error| {
                warn!(error = %error, "failed to refresh cursor account cache on read");
                self.provider().account_status()
            })
    }

    pub fn cursor_auth_flow_status(&self) -> CursorAuthFlowStatus {
        self.provider().auth_flow_status()
    }

    pub fn start_cursor_login(&self) -> CursorLoginStartResult {
        let result = self.provider().start_login();
        if result.started || result.already_logged_in {
            self.after_cursor_account_mutation();
        }
        result
    }

    pub fn cursor_login_session_status(&self) -> CursorLoginSessionStatus {
        self.provider().login_session_status()
    }

    pub fn logout_cursor(&self) -> Result<ActionMessage> {
        let result = self.provider().logout()?;
        self.after_cursor_account_mutation();
        Ok(result)
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

    fn refresh_overview_bundle(&self) -> Result<OverviewData> {
        let agents = self.provider().list_agents();
        let plugins = self.paseo_provider().list_plugins();
        let overview = self.build_overview_from_parts(&agents, &plugins);
        let mut cache = self.cache.write().expect("runtime cache lock poisoned");
        cache.set_agents(agents);
        cache.set_plugins(plugins);
        cache.set_overview(overview.clone());
        Ok(overview)
    }

    fn refresh_agents_internal(&self) -> Result<Vec<AgentSummary>> {
        let agents = self.provider().list_agents();
        self.cache
            .write()
            .expect("runtime cache lock poisoned")
            .set_agents(agents.clone());
        Ok(agents)
    }

    fn refresh_plugins_internal(&self) -> Result<Vec<PluginSummary>> {
        let plugins = self.paseo_provider().list_plugins();
        self.cache
            .write()
            .expect("runtime cache lock poisoned")
            .set_plugins(plugins.clone());
        Ok(plugins)
    }

    fn refresh_plugin_detail_internal(&self, plugin_id: &str) -> Result<PluginDetail> {
        let detail = self.paseo_provider().plugin_detail(plugin_id)?;
        self.cache
            .write()
            .expect("runtime cache lock poisoned")
            .set_plugin_detail(plugin_id, detail.clone());
        Ok(detail)
    }

    fn refresh_cursor_runtime_internal(&self) -> Result<CursorRuntimeStatus> {
        let status = self.provider().runtime_status();
        self.cache
            .write()
            .expect("runtime cache lock poisoned")
            .set_cursor_runtime(status.clone());
        Ok(status)
    }

    fn refresh_cursor_account_internal(&self) -> Result<CursorAccountStatus> {
        let status = self.provider().account_status();
        self.cache
            .write()
            .expect("runtime cache lock poisoned")
            .set_cursor_account(status.clone());
        Ok(status)
    }

    fn build_overview_from_live(&self) -> OverviewData {
        let agents = self.provider().list_agents();
        let plugins = self.paseo_provider().list_plugins();
        self.build_overview_from_parts(&agents, &plugins)
    }

    fn build_overview_from_parts(
        &self,
        agents: &[AgentSummary],
        plugins: &[PluginSummary],
    ) -> OverviewData {
        let status = self.status();
        OverviewData {
            app_name: status.app_name,
            version: status.version,
            mode: status.mode,
            agents: agents
                .iter()
                .map(|agent| OverviewAgentItem {
                    id: agent.id.clone(),
                    name: agent.name.clone(),
                    installed: agent.installed,
                    version: agent.version.clone(),
                })
                .collect(),
            plugins: plugins
                .iter()
                .map(|plugin| OverviewPluginItem {
                    id: plugin.id.clone(),
                    name: plugin.name.clone(),
                    installed: plugin.installed,
                })
                .collect(),
        }
    }

    fn after_agent_mutation(&self) {
        self.refresh_after_mutation(|| {
            self.refresh_overview_bundle()?;
            self.refresh_cursor_runtime_internal()?;
            self.refresh_cursor_account_internal()?;
            Ok(())
        });
    }

    fn after_plugin_mutation(&self, plugin_id: &str) {
        let plugin_id = plugin_id.to_string();
        self.refresh_after_mutation(|| {
            self.refresh_overview_bundle()?;
            self.refresh_plugins_internal()?;
            self.refresh_plugin_detail_internal(&plugin_id)?;
            Ok(())
        });
    }

    fn after_daemon_mutation(&self, plugin_id: &str) {
        let plugin_id = plugin_id.to_string();
        self.refresh_after_mutation(|| {
            self.refresh_plugins_internal()?;
            self.refresh_plugin_detail_internal(&plugin_id)?;
            Ok(())
        });
    }

    fn after_cursor_runtime_mutation(&self) {
        self.refresh_after_mutation(|| {
            self.refresh_overview_bundle()?;
            self.refresh_cursor_runtime_internal()?;
            Ok(())
        });
    }

    fn after_cursor_account_mutation(&self) {
        self.refresh_after_mutation(|| self.refresh_cursor_account_internal().map(|_| ()));
    }

    fn refresh_after_mutation<F>(&self, refresh: F)
    where
        F: FnOnce() -> Result<()>,
    {
        if let Err(error) = refresh() {
            warn!(error = %error, "runtime cache refresh after mutation failed");
        }
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
