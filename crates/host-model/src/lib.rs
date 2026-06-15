use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthLoginRequest {
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthLoginResponse {
    pub session_token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatus {
    pub authenticated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppStatus {
    pub app_name: String,
    pub version: String,
    pub mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverviewAgentItem {
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverviewPluginItem {
    pub id: String,
    pub name: String,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverviewData {
    pub app_name: String,
    pub version: String,
    pub mode: String,
    pub agents: Vec<OverviewAgentItem>,
    pub plugins: Vec<OverviewPluginItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorRuntimeStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub install_dir: String,
    pub data_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorAccountStatus {
    pub logged_in: bool,
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStep {
    pub title: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorAuthFlowStatus {
    pub summary: String,
    pub steps: Vec<AuthStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorLoginStartResult {
    pub started: bool,
    pub already_logged_in: bool,
    pub auth_url: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CursorLoginSessionStatus {
    pub active: bool,
    pub auth_url: Option<String>,
    pub message: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhAccountStatus {
    pub logged_in: bool,
    pub username: Option<String>,
    pub hostname: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhAuthFlowStatus {
    pub summary: String,
    pub steps: Vec<AuthStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GhLoginStartResult {
    pub started: bool,
    pub already_logged_in: bool,
    pub auth_url: Option<String>,
    pub device_code: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GhLoginSessionStatus {
    pub active: bool,
    pub auth_url: Option<String>,
    pub device_code: Option<String>,
    pub message: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownConfig {
    pub disable_telemetry: bool,
    pub auto_update: bool,
    pub release_track: String,
}

impl Default for KnownConfig {
    fn default() -> Self {
        Self {
            disable_telemetry: false,
            auto_update: true,
            release_track: "stable".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawConfigDocument {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawConfigUpdateRequest {
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawConfigPreview {
    pub path: String,
    pub current_content: String,
    pub next_content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSummary {
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub version: Option<String>,
    pub install_dir: String,
    pub data_dir: String,
    pub install_supported: bool,
    pub install_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSummary {
    pub id: String,
    pub name: String,
    pub agent: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFileSummary {
    pub id: String,
    pub name: String,
    pub agent: String,
    pub folder: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDocument {
    pub id: String,
    pub name: String,
    pub agent: String,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillUpdateRequest {
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsCliCapability {
    pub ready: bool,
    pub node_version: Option<String>,
    pub skills_cli_version: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsCliSourceRequest {
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsCliPreviewSkill {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsCliPreviewResult {
    pub source: String,
    pub skills: Vec<SkillsCliPreviewSkill>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsCliInstallRequest {
    pub source: String,
    pub skills: Vec<String>,
    pub agents: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillsCliInstallResult {
    pub message: String,
    pub installed_skills: Vec<String>,
    pub agents: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeActionResult {
    pub installed: bool,
    pub version: Option<String>,
    pub install_dir: String,
    pub data_dir: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub installed: bool,
    pub version: Option<String>,
    pub install_dir: String,
    pub data_dir: String,
    pub install_supported: bool,
    pub install_command: Option<String>,
    pub official_url: String,
    pub default_workspace: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginDetail {
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub daemon_status: String,
    pub providers_listing: String,
    pub agents_listing: String,
    pub daemon_pair_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionMessage {
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheRefreshRequest {
    pub scope: String,
    #[serde(default)]
    pub plugin_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub app_name: String,
    pub version: String,
    pub mode: String,
    pub repo_root: String,
    pub update_supported: bool,
    pub git_remote: Option<String>,
    pub git_branch: Option<String>,
    pub git_commit: Option<String>,
    pub git_upstream_commit: Option<String>,
    pub update_available: bool,
    pub behind_commits: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateResult {
    pub success: bool,
    pub message: String,
    pub output: String,
    pub version: String,
    pub git_commit: Option<String>,
    pub restart_required: bool,
    #[serde(default)]
    pub started: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateStatus {
    pub active: bool,
    pub phase: String,
    pub message: String,
    pub output: String,
    pub version: String,
    pub git_commit: Option<String>,
}
