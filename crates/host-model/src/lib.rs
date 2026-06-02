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
pub struct CursorRuntimeStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub managed_root: String,
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
pub struct SkillSummary {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillDocument {
    pub name: String,
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillUpdateRequest {
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeActionResult {
    pub installed: bool,
    pub version: Option<String>,
    pub managed_root: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionMessage {
    pub message: String,
}
