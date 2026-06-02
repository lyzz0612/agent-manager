use app_core::{AppConfig, AppState};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use host_model::{
    ActionMessage, AppStatus, AuthLoginRequest, AuthLoginResponse, CursorAccountStatus,
    CursorAuthFlowStatus, CursorRuntimeStatus, KnownConfig, RawConfigDocument, RawConfigPreview,
    RawConfigUpdateRequest, RuntimeActionResult, SessionStatus, SkillDocument, SkillSummary,
    SkillUpdateRequest,
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
    tracing_subscriber::fmt()
        .with_env_filter("agent_manager_server=info,tower_http=info")
        .init();

    let repo_root = std::env::current_dir()?;
    let config = AppConfig::load(&repo_root)?;
    let port = config.port;
    let web_dist_dir = config.web_dist_dir.clone();
    let state = Arc::new(AppState::new(config)?);

    let api = Router::new()
        .route("/health", get(health))
        .route("/app/status", get(app_status))
        .route("/auth/login", post(login))
        .route("/auth/session", get(session_status))
        .route("/auth/logout", post(logout))
        .route("/cursor/runtime", get(runtime_status))
        .route("/cursor/runtime/install", post(install_runtime))
        .route("/cursor/runtime/upgrade", post(upgrade_runtime))
        .route("/cursor/account", get(account_status))
        .route("/cursor/auth-flow", get(auth_flow_status))
        .route(
            "/profile/known-config",
            get(get_known_config).put(update_known_config),
        )
        .route("/profile/raw-config", get(get_raw_config))
        .route("/profile/raw-config/preview", post(preview_raw_config))
        .route("/profile/raw-config/confirm", post(confirm_raw_config))
        .route("/profile/skills", get(list_skills))
        .route(
            "/profile/skills/:name",
            get(get_skill).put(update_skill).delete(delete_skill),
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
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health() -> Json<ActionMessage> {
    Json(ActionMessage {
        message: "ok".to_string(),
    })
}

async fn app_status(State(state): State<Arc<AppState>>) -> Json<AppStatus> {
    Json(state.status())
}

async fn login(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<AuthLoginRequest>,
) -> Result<(CookieJar, Json<AuthLoginResponse>), ApiError> {
    let Some(session_token) = state.login(&payload.token) else {
        return Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "访问令牌无效，请重试。",
        ));
    };

    let cookie = Cookie::build((SESSION_COOKIE_NAME, session_token.clone()))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .build();

    Ok((
        jar.add(cookie),
        Json(AuthLoginResponse { session_token }),
    ))
}

async fn session_status(State(state): State<Arc<AppState>>, jar: CookieJar) -> Json<SessionStatus> {
    Json(SessionStatus {
        authenticated: is_authenticated(&state, &jar),
    })
}

async fn logout(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<(CookieJar, StatusCode), ApiError> {
    if let Some(cookie) = jar.get(SESSION_COOKIE_NAME) {
        state.logout(cookie.value());
    }

    let removed = Cookie::build((SESSION_COOKIE_NAME, ""))
        .path("/")
        .http_only(true)
        .build();

    Ok((jar.remove(removed), StatusCode::NO_CONTENT))
}

async fn runtime_status(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<Json<CursorRuntimeStatus>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.cursor_runtime_status()))
}

async fn install_runtime(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<Json<RuntimeActionResult>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.install_cursor_runtime()?))
}

async fn upgrade_runtime(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<Json<RuntimeActionResult>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.upgrade_cursor_runtime()?))
}

async fn account_status(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<Json<CursorAccountStatus>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.cursor_account_status()))
}

async fn auth_flow_status(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<Json<CursorAuthFlowStatus>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.cursor_auth_flow_status()))
}

async fn get_known_config(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<Json<KnownConfig>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.known_config()?))
}

async fn update_known_config(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<KnownConfig>,
) -> Result<Json<KnownConfig>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.update_known_config(payload)?))
}

async fn get_raw_config(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<Json<RawConfigDocument>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.raw_config()?))
}

async fn preview_raw_config(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<RawConfigUpdateRequest>,
) -> Result<Json<RawConfigPreview>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.preview_raw_config(payload.content)?))
}

async fn confirm_raw_config(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Json(payload): Json<RawConfigUpdateRequest>,
) -> Result<Json<RawConfigDocument>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.save_raw_config(payload.content)?))
}

async fn list_skills(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
) -> Result<Json<Vec<SkillSummary>>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.list_skills()?))
}

async fn get_skill(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Path(name): Path<String>,
) -> Result<Json<SkillDocument>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.read_skill(&name)?))
}

async fn update_skill(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Path(name): Path<String>,
    Json(payload): Json<SkillUpdateRequest>,
) -> Result<Json<SkillDocument>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.update_skill(&name, &payload.content)?))
}

async fn delete_skill(
    State(state): State<Arc<AppState>>,
    jar: CookieJar,
    Path(name): Path<String>,
) -> Result<Json<ActionMessage>, ApiError> {
    ensure_authenticated(&state, &jar)?;
    Ok(Json(state.delete_skill(&name)?))
}

fn ensure_authenticated(state: &AppState, jar: &CookieJar) -> Result<(), ApiError> {
    if is_authenticated(state, jar) {
        Ok(())
    } else {
        Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "请先通过管理页 Token 登录。",
        ))
    }
}

fn is_authenticated(state: &AppState, jar: &CookieJar) -> bool {
    let Some(cookie) = jar.get(SESSION_COOKIE_NAME) else {
        return false;
    };

    state.is_authenticated(cookie.value())
}
