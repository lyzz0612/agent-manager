use app_core::{parse_update_worker_parent_pid, AppConfig, AppState};
use axum::{
    extract::{Path, State},
    http::{header::SET_COOKIE, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use host_model::{
    ActionMessage, AgentSummary, AppSettings, AppStatus, AppUpdateResult, AppUpdateStatus,
    AuthLoginRequest,
    AuthLoginResponse, CacheRefreshRequest, CursorAccountStatus, CursorAuthFlowStatus,
    CursorLoginSessionStatus,
    CursorLoginStartResult, CursorRuntimeStatus,
    KnownConfig, OverviewData, PluginDetail, PluginSummary, RawConfigDocument, RawConfigPreview,
    RawConfigUpdateRequest, RuntimeActionResult, SessionStatus, SkillDocument, SkillFileSummary,
    SkillSummary, SkillUpdateRequest, SkillsCliCapability, SkillsCliInstallRequest,
    SkillsCliInstallResult, SkillsCliPreviewResult, SkillsCliSourceRequest,
};
use serde_json::json;
use std::sync::Arc;
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing::info;

const SESSION_COOKIE_NAME: &str = "agent_manager_session";

struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if let Some(parent_pid) = parse_update_worker_parent_pid(&args) {
        return AppState::run_update_worker(parent_pid);
    }

    tracing_subscriber::fmt()
        .with_env_filter("agent_manager_server=info,app_core=info,tower_http=info")
        .init();

    let repo_root = std::env::current_dir()?;
    let config = AppConfig::load(&repo_root)?;
    let port = config.port;
    let web_dist_dir = config.web_dist_dir.clone();
    let state = Arc::new(AppState::new(config)?);
    let warmup_state = state.clone();
    tokio::spawn(async move {
        tokio::task::spawn_blocking(move || warmup_state.warmup_cache())
            .await
            .ok();
    });

    let api = Router::new()
        .route("/health", get(health))
        .route("/app/status", get(app_status))
        .route("/overview", get(overview))
        .route("/app/settings", get(app_settings))
        .route("/app/update/check", post(check_app_update))
        .route("/app/update/status", get(update_job_status))
        .route("/app/update/pull", post(pull_app_update))
        .route("/auth/login", post(login))
        .route("/auth/session", get(session_status))
        .route("/auth/logout", post(logout))
        .route("/cache/refresh", post(refresh_runtime_cache))
        .route("/agents", get(list_agents))
        .route("/agents/:id/install", post(install_agent))
        .route("/agents/:id/upgrade", post(upgrade_agent))
        .route("/agents/:id/uninstall", post(uninstall_agent))
        .route("/plugins", get(list_plugins))
        .route("/plugins/:id", get(get_plugin))
        .route("/plugins/:id/install", post(install_plugin))
        .route("/plugins/:id/upgrade", post(upgrade_plugin))
        .route("/plugins/:id/uninstall", post(uninstall_plugin))
        .route("/plugins/:id/daemon/:action", post(paseo_daemon_action))
        .route("/cursor/runtime", get(runtime_status))
        .route("/cursor/runtime/install", post(install_runtime))
        .route("/cursor/runtime/upgrade", post(upgrade_runtime))
        .route("/cursor/account", get(account_status))
        .route("/cursor/auth-flow", get(auth_flow_status))
        .route("/cursor/login/start", post(start_cursor_login))
        .route("/cursor/login/status", get(cursor_login_status))
        .route("/cursor/logout", post(logout_cursor))
        .route(
            "/profile/known-config",
            get(get_known_config).put(update_known_config),
        )
        .route("/profile/raw-config", get(get_raw_config))
        .route("/profile/raw-config/preview", post(preview_raw_config))
        .route("/profile/raw-config/confirm", post(confirm_raw_config))
        .route("/profile/skills", get(list_skills))
        .route("/profile/skills/cli/status", get(skills_cli_status))
        .route("/profile/skills/cli/preview", post(skills_cli_preview))
        .route("/profile/skills/cli/install", post(skills_cli_install))
        .route("/profile/skills/:folder_id/files", get(list_skill_files))
        .route(
            "/profile/skills/:id",
            get(get_skill).put(update_skill),
        )
        .with_state(state.clone());

    let static_files =
        ServeDir::new(&web_dist_dir).not_found_service(ServeFile::new(web_dist_dir.join("index.html")));

    let app = Router::new()
        .nest("/api", api)
        .fallback_service(static_files)
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    info!(port, "agent-manager server listening");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{signal, SignalKind};

        let mut terminate =
            signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
        terminate.recv().await;
        info!("received SIGTERM, shutting down gracefully");
    }

    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
        info!("received Ctrl+C, shutting down gracefully");
    }
}

async fn health() -> Json<ActionMessage> {
    Json(ActionMessage {
        message: "ok".to_string(),
    })
}

async fn app_status(State(state): State<Arc<AppState>>) -> Json<AppStatus> {
    Json(state.status())
}

async fn overview(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<OverviewData>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.overview()))
}

async fn app_settings(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AppSettings>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.app_settings()))
}

async fn check_app_update(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AppSettings>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.check_for_updates()?))
}

async fn update_job_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AppUpdateStatus>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.update_job_status()))
}

async fn pull_app_update(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<AppUpdateResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.spawn_background_update()?))
}

async fn login(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AuthLoginRequest>,
) -> Result<([(axum::http::HeaderName, String); 1], Json<AuthLoginResponse>), ApiError> {
    let Some(session_token) = state.login(&payload.token) else {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "访问令牌无效，请重试。",
        ));
    };

    Ok((
        [(SET_COOKIE, build_session_cookie(&session_token))],
        Json(AuthLoginResponse { session_token }),
    ))
}

async fn session_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Json<SessionStatus> {
    Json(SessionStatus {
        authenticated: is_authenticated(&state, &headers),
    })
}

async fn logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<([(axum::http::HeaderName, String); 1], StatusCode), ApiError> {
    if let Some(session_token) = extract_session_token(&headers) {
        state.logout(&session_token);
    }

    Ok(([(SET_COOKIE, clear_session_cookie())], StatusCode::NO_CONTENT))
}

async fn refresh_runtime_cache(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<CacheRefreshRequest>,
) -> Result<Json<ActionMessage>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.refresh_cache_request(&payload).map_err(|error| {
        if error.to_string().contains("未知 cache scope")
            || error.to_string().contains("plugin scope")
        {
            ApiError::new(StatusCode::BAD_REQUEST, error.to_string())
        } else {
            ApiError::from(error)
        }
    })?))
}

async fn list_agents(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Vec<AgentSummary>>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.list_agents()))
}

async fn install_agent(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(agent_id): Path<String>,
) -> Result<Json<RuntimeActionResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.install_agent(&agent_id)?))
}

async fn upgrade_agent(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(agent_id): Path<String>,
) -> Result<Json<RuntimeActionResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.upgrade_agent(&agent_id)?))
}

async fn uninstall_agent(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(agent_id): Path<String>,
) -> Result<Json<RuntimeActionResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.uninstall_agent(&agent_id)?))
}

async fn list_plugins(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Vec<PluginSummary>>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.list_plugins()))
}

async fn get_plugin(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(plugin_id): Path<String>,
) -> Result<Json<PluginDetail>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.plugin_detail(&plugin_id)?))
}

async fn install_plugin(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(plugin_id): Path<String>,
) -> Result<Json<RuntimeActionResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.install_plugin(&plugin_id)?))
}

async fn upgrade_plugin(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(plugin_id): Path<String>,
) -> Result<Json<RuntimeActionResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.upgrade_plugin(&plugin_id)?))
}

async fn uninstall_plugin(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(plugin_id): Path<String>,
) -> Result<Json<RuntimeActionResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.uninstall_plugin(&plugin_id)?))
}

async fn paseo_daemon_action(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path((plugin_id, action)): Path<(String, String)>,
) -> Result<Json<ActionMessage>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.paseo_daemon_action(&plugin_id, &action)?))
}

async fn runtime_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<CursorRuntimeStatus>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.cursor_runtime_status()))
}

async fn install_runtime(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeActionResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.install_cursor_runtime()?))
}

async fn upgrade_runtime(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RuntimeActionResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.upgrade_cursor_runtime()?))
}

async fn account_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<CursorAccountStatus>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.cursor_account_status()))
}

async fn auth_flow_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<CursorAuthFlowStatus>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.cursor_auth_flow_status()))
}

async fn start_cursor_login(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<CursorLoginStartResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.start_cursor_login()))
}

async fn cursor_login_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<CursorLoginSessionStatus>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.cursor_login_session_status()))
}

async fn logout_cursor(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<ActionMessage>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.logout_cursor()?))
}

async fn get_known_config(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<KnownConfig>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.known_config()?))
}

async fn update_known_config(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<KnownConfig>,
) -> Result<Json<KnownConfig>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.update_known_config(payload)?))
}

async fn get_raw_config(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<RawConfigDocument>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.raw_config()?))
}

async fn preview_raw_config(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<RawConfigUpdateRequest>,
) -> Result<Json<RawConfigPreview>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.preview_raw_config(payload.content)?))
}

async fn confirm_raw_config(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<RawConfigUpdateRequest>,
) -> Result<Json<RawConfigDocument>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.save_raw_config(payload.content)?))
}

async fn list_skills(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Vec<SkillSummary>>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.list_skills()?))
}

async fn list_skill_files(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(folder_id): Path<String>,
) -> Result<Json<Vec<SkillFileSummary>>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.list_skill_files(&folder_id)?))
}

async fn get_skill(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<SkillDocument>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.read_skill(&id)?))
}

async fn update_skill(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<SkillUpdateRequest>,
) -> Result<Json<SkillDocument>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.update_skill(&id, &payload.content)?))
}

async fn skills_cli_status(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<SkillsCliCapability>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    Ok(Json(state.skills_cli_status()))
}

async fn skills_cli_preview(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<SkillsCliSourceRequest>,
) -> Result<Json<SkillsCliPreviewResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    match state.skills_cli_preview(&payload.source) {
        Ok(result) => Ok(Json(result)),
        Err(error) => Err(map_skills_cli_error(error)),
    }
}

async fn skills_cli_install(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(payload): Json<SkillsCliInstallRequest>,
) -> Result<Json<SkillsCliInstallResult>, ApiError> {
    ensure_authenticated(&state, &headers)?;
    if !state.skills_cli_status().ready {
        return Err(ApiError::new(
            StatusCode::SERVICE_UNAVAILABLE,
            state.skills_cli_status().message,
        ));
    }
    match state.skills_cli_install(&payload) {
        Ok(result) => Ok(Json(result)),
        Err(error) => Err(map_skills_cli_error(error)),
    }
}

fn map_skills_cli_error(error: anyhow::Error) -> ApiError {
    let message = error.to_string();
    let status = if message.contains("请提供有效的仓库或链接")
        || message.contains("请至少选择")
        || message.contains("未知或未支持的 agent")
    {
        StatusCode::BAD_REQUEST
    } else if message.contains("Skills CLI 不可用") {
        StatusCode::SERVICE_UNAVAILABLE
    } else if message.contains("无法获取 skill 列表") || message.contains("安装失败") {
        StatusCode::BAD_GATEWAY
    } else {
        StatusCode::INTERNAL_SERVER_ERROR
    };
    ApiError::new(status, message)
}

fn ensure_authenticated(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    if is_authenticated(state, headers) {
        Ok(())
    } else {
        Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "请先通过管理页 Token 登录。",
        ))
    }
}

fn is_authenticated(state: &AppState, headers: &HeaderMap) -> bool {
    extract_session_token(headers)
        .as_deref()
        .map(|session_token| state.is_authenticated(session_token))
        .unwrap_or(false)
}

fn extract_session_token(headers: &HeaderMap) -> Option<String> {
    let cookie_header = headers.get(axum::http::header::COOKIE)?.to_str().ok()?;

    cookie_header.split(';').find_map(|part| {
        let trimmed = part.trim();
        let (name, value) = trimmed.split_once('=')?;

        if name == SESSION_COOKIE_NAME {
            Some(value.to_string())
        } else {
            None
        }
    })
}

fn build_session_cookie(session_token: &str) -> String {
    format!("{SESSION_COOKIE_NAME}={session_token}; Path=/; HttpOnly; SameSite=Lax")
}

fn clear_session_cookie() -> String {
    format!("{SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")
}
