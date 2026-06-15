use host_model::{
    AgentSummary, CursorAccountStatus, CursorRuntimeStatus, GhAccountStatus, OverviewData,
    PluginDetail, PluginSummary,
};
use std::collections::HashMap;
use std::time::Instant;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefreshScope {
    All,
    Overview,
    Agents,
    Plugins,
    Plugin(String),
    CursorRuntime,
    CursorAccount,
    GhAccount,
}

impl RefreshScope {
    pub fn parse(scope: &str, plugin_id: Option<&str>) -> Result<Self, String> {
        match scope {
            "all" => Ok(Self::All),
            "overview" => Ok(Self::Overview),
            "agents" => Ok(Self::Agents),
            "plugins" => Ok(Self::Plugins),
            "plugin" => plugin_id
                .filter(|id| !id.trim().is_empty())
                .map(|id| Self::Plugin(id.to_string()))
                .ok_or_else(|| "plugin scope 需要 plugin_id".to_string()),
            "cursor_runtime" => Ok(Self::CursorRuntime),
            "cursor_account" => Ok(Self::CursorAccount),
            "gh_account" => Ok(Self::GhAccount),
            other => Err(format!("未知 cache scope: {other}")),
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Overview => "overview",
            Self::Agents => "agents",
            Self::Plugins => "plugins",
            Self::Plugin(_) => "plugin",
            Self::CursorRuntime => "cursor_runtime",
            Self::CursorAccount => "cursor_account",
            Self::GhAccount => "gh_account",
        }
    }
}

#[derive(Debug, Default)]
pub struct RuntimeCache {
    agents: Option<Vec<AgentSummary>>,
    plugins: Option<Vec<PluginSummary>>,
    overview: Option<OverviewData>,
    plugin_details: HashMap<String, PluginDetail>,
    cursor_runtime: Option<CursorRuntimeStatus>,
    cursor_account: Option<CursorAccountStatus>,
    gh_account: Option<GhAccountStatus>,
}

impl RuntimeCache {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn agents(&self) -> Option<&Vec<AgentSummary>> {
        self.agents.as_ref()
    }

    pub fn set_agents(&mut self, value: Vec<AgentSummary>) {
        self.agents = Some(value);
    }

    pub fn plugins(&self) -> Option<&Vec<PluginSummary>> {
        self.plugins.as_ref()
    }

    pub fn set_plugins(&mut self, value: Vec<PluginSummary>) {
        self.plugins = Some(value);
    }

    pub fn overview(&self) -> Option<&OverviewData> {
        self.overview.as_ref()
    }

    pub fn set_overview(&mut self, value: OverviewData) {
        self.overview = Some(value);
    }

    pub fn plugin_detail(&self, plugin_id: &str) -> Option<&PluginDetail> {
        self.plugin_details.get(plugin_id)
    }

    pub fn set_plugin_detail(&mut self, plugin_id: impl Into<String>, value: PluginDetail) {
        self.plugin_details.insert(plugin_id.into(), value);
    }

    pub fn cursor_runtime(&self) -> Option<&CursorRuntimeStatus> {
        self.cursor_runtime.as_ref()
    }

    pub fn set_cursor_runtime(&mut self, value: CursorRuntimeStatus) {
        self.cursor_runtime = Some(value);
    }

    pub fn cursor_account(&self) -> Option<&CursorAccountStatus> {
        self.cursor_account.as_ref()
    }

    pub fn set_cursor_account(&mut self, value: CursorAccountStatus) {
        self.cursor_account = Some(value);
    }

    pub fn gh_account(&self) -> Option<&GhAccountStatus> {
        self.gh_account.as_ref()
    }

    pub fn set_gh_account(&mut self, value: GhAccountStatus) {
        self.gh_account = Some(value);
    }
}

pub struct RefreshTiming {
    pub scope: RefreshScope,
    pub started: Instant,
}

impl RefreshTiming {
    pub fn new(scope: RefreshScope) -> Self {
        Self {
            scope,
            started: Instant::now(),
        }
    }

    pub fn elapsed_ms(&self) -> u128 {
        self.started.elapsed().as_millis()
    }
}
