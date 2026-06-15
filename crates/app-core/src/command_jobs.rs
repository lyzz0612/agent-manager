use crate::AppState;
use anyhow::Result;
use host_jobs::{JobContext, JobOutcome};
use host_model::{
    CommandJobBusyResponse, CommandJobStartResponse, RuntimeActionResult,
    SkillsCliInstallRequest,
};
use serde_json::{json, Value};
use std::sync::Arc;

pub struct JobStarters;

impl AppState {
    pub fn start_skills_cli_preview_job(
        self: &Arc<Self>,
        source: String,
    ) -> Result<CommandJobStartResponse, CommandJobBusyResponse> {
        let state = Arc::clone(self);
        self.jobs.try_start("skills_cli_preview", "预览 Skill 列表", move |ctx| {
            run_skills_preview(&state, &ctx, &source)
        })
    }

    pub fn start_skills_cli_install_job(
        self: &Arc<Self>,
        request: SkillsCliInstallRequest,
    ) -> Result<CommandJobStartResponse, CommandJobBusyResponse> {
        let state = Arc::clone(self);
        self.jobs.try_start("skills_cli_install", "安装 Skill", move |ctx| {
            run_skills_install(&state, &ctx, &request)
        })
    }

    pub fn start_agent_install_job(
        self: &Arc<Self>,
        agent_id: String,
    ) -> Result<CommandJobStartResponse, CommandJobBusyResponse> {
        let label = format!("安装 {agent_id}");
        let state = Arc::clone(self);
        self.jobs.try_start("agent_install", label, move |ctx| {
            run_agent_action(&state, &ctx, &agent_id, AgentAction::Install)
        })
    }

    pub fn start_agent_upgrade_job(
        self: &Arc<Self>,
        agent_id: String,
    ) -> Result<CommandJobStartResponse, CommandJobBusyResponse> {
        let label = format!("升级 {agent_id}");
        let state = Arc::clone(self);
        self.jobs.try_start("agent_upgrade", label, move |ctx| {
            run_agent_action(&state, &ctx, &agent_id, AgentAction::Upgrade)
        })
    }

    pub fn start_agent_uninstall_job(
        self: &Arc<Self>,
        agent_id: String,
    ) -> Result<CommandJobStartResponse, CommandJobBusyResponse> {
        let label = format!("卸载 {agent_id}");
        let state = Arc::clone(self);
        self.jobs.try_start("agent_uninstall", label, move |ctx| {
            run_agent_action(&state, &ctx, &agent_id, AgentAction::Uninstall)
        })
    }

    pub fn start_plugin_install_job(
        self: &Arc<Self>,
        plugin_id: String,
    ) -> Result<CommandJobStartResponse, CommandJobBusyResponse> {
        let label = format!("安装 {plugin_id}");
        let state = Arc::clone(self);
        self.jobs.try_start("plugin_install", label, move |ctx| {
            run_plugin_action(&state, &ctx, &plugin_id, PluginAction::Install)
        })
    }

    pub fn start_plugin_upgrade_job(
        self: &Arc<Self>,
        plugin_id: String,
    ) -> Result<CommandJobStartResponse, CommandJobBusyResponse> {
        let label = format!("升级 {plugin_id}");
        let state = Arc::clone(self);
        self.jobs.try_start("plugin_upgrade", label, move |ctx| {
            run_plugin_action(&state, &ctx, &plugin_id, PluginAction::Upgrade)
        })
    }

    pub fn start_plugin_uninstall_job(
        self: &Arc<Self>,
        plugin_id: String,
    ) -> Result<CommandJobStartResponse, CommandJobBusyResponse> {
        let label = format!("卸载 {plugin_id}");
        let state = Arc::clone(self);
        self.jobs.try_start("plugin_uninstall", label, move |ctx| {
            run_plugin_action(&state, &ctx, &plugin_id, PluginAction::Uninstall)
        })
    }

    pub fn start_plugin_daemon_job(
        self: &Arc<Self>,
        plugin_id: String,
        action: String,
    ) -> Result<CommandJobStartResponse, CommandJobBusyResponse> {
        let label = format!("Paseo daemon {action}");
        let state = Arc::clone(self);
        self.jobs.try_start("plugin_daemon", label, move |ctx| {
            run_plugin_daemon(&state, &ctx, &plugin_id, &action)
        })
    }
}

pub fn start_jobs(state: &Arc<AppState>) -> JobStarters {
    let _ = state;
    JobStarters
}

enum AgentAction {
    Install,
    Upgrade,
    Uninstall,
}

enum PluginAction {
    Install,
    Upgrade,
    Uninstall,
}

fn run_skills_preview(state: &AppState, ctx: &JobContext, source: &str) -> Result<JobOutcome> {
    let result = state.provider().skills_cli_preview_with_sink(source, ctx)?;
    Ok(success_outcome(
        format!("已解析 {} 个 skill", result.skills.len()),
        json!(result),
    ))
}

fn run_skills_install(
    state: &AppState,
    ctx: &JobContext,
    request: &SkillsCliInstallRequest,
) -> Result<JobOutcome> {
    let result = state.provider().skills_cli_install_with_sink(request, ctx)?;
    Ok(success_outcome(result.message.clone(), json!(result)))
}

fn run_agent_action(
    state: &AppState,
    ctx: &JobContext,
    agent_id: &str,
    action: AgentAction,
) -> Result<JobOutcome> {
    let result = match action {
        AgentAction::Install => state.provider().install_agent_with_sink(agent_id, ctx)?,
        AgentAction::Upgrade => state.provider().upgrade_agent_with_sink(agent_id, ctx)?,
        AgentAction::Uninstall => state.provider().uninstall_agent_with_sink(agent_id, ctx)?,
    };
    state.after_agent_mutation();
    Ok(runtime_outcome(result))
}

fn run_plugin_action(
    state: &AppState,
    ctx: &JobContext,
    plugin_id: &str,
    action: PluginAction,
) -> Result<JobOutcome> {
    let provider = state.plugin_provider(plugin_id)?;
    let result = match action {
        PluginAction::Install => provider.install_plugin_with_sink(plugin_id, ctx)?,
        PluginAction::Upgrade => provider.upgrade_plugin_with_sink(plugin_id, ctx)?,
        PluginAction::Uninstall => provider.uninstall_plugin_with_sink(plugin_id, ctx)?,
    };
    state.after_plugin_mutation(plugin_id);
    Ok(runtime_outcome(result))
}

fn run_plugin_daemon(
    state: &AppState,
    ctx: &JobContext,
    plugin_id: &str,
    action: &str,
) -> Result<JobOutcome> {
    let result = state
        .paseo_provider()
        .daemon_action_with_sink(plugin_id, action, ctx)?;
    state.after_daemon_mutation(plugin_id);
    Ok(success_outcome(result.message.clone(), json!(result)))
}

fn runtime_outcome(result: RuntimeActionResult) -> JobOutcome {
    JobOutcome {
        success: true,
        message: result.message.clone(),
        result: Some(json!(result)),
    }
}

fn success_outcome(message: String, result: Value) -> JobOutcome {
    JobOutcome {
        success: true,
        message,
        result: Some(result),
    }
}
