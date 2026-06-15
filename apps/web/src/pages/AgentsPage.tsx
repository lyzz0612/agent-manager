import { useEffect, useMemo, useState } from "react";
import { isAbortError, requestJson } from "../api";
import { CommandJobConflictError } from "../commandJobApi";
import { AgentDetailView } from "../components/AgentDetailView";
import { PageLoading, Panel } from "../components/ui";
import { useCommandJob } from "../context/CommandJobContext";
import { AppRoute, buildAgentPath } from "../routing";
import type { AgentSummary, RuntimeActionResult } from "../types";
import { resolveInstallCommand } from "../utils";

type AgentsPageProps = {
  route: Extract<AppRoute, { page: "agents" }>;
  refreshKey: number;
  navigate: (path: string) => void;
  onNotify: (kind: "info" | "success" | "error", text: string) => void;
  onError: (message: string) => void;
};

export function AgentsPage({ route, refreshKey, navigate, onNotify, onError }: AgentsPageProps) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { runJob, job } = useCommandJob();

  const agentId = route.agentId;
  const tab = route.tab ?? "overview";

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      setLoading(true);
      setAgents([]);

      try {
        const nextAgents = await requestJson<AgentSummary[]>("/api/agents", { signal });
        if (!signal.aborted) {
          setAgents(nextAgents);
        }
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          return;
        }
        onError(error instanceof Error ? error.message : "加载 Agents 失败");
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [refreshKey, onError]);

  const selectedAgent = useMemo(
    () => (agentId ? agents.find((agent) => agent.id === agentId) ?? null : null),
    [agentId, agents],
  );

  async function handleAgentAction(
    targetAgentId: string,
    action: "install" | "upgrade" | "uninstall",
    agentName?: string,
  ) {
    if (
      action === "uninstall" &&
      !window.confirm(`确认卸载 ${agentName ?? targetAgentId} 吗？将移除 CLI，但保留用户目录数据。`)
    ) {
      return;
    }

    try {
      await runJob(`/api/agents/${encodeURIComponent(targetAgentId)}/${action}`, {
        method: "POST",
      }, {
        onDone: (success, result) => {
          if (!success || !result) {
            return;
          }
          const runtime = result as RuntimeActionResult;
          if (action === "uninstall" && !runtime.installed) {
            navigate("/agents");
            return;
          }
          if (action === "install" && runtime.installed) {
            navigate(buildAgentPath(targetAgentId));
          }
          setAgents((current) =>
            current.map((agent) =>
              agent.id === targetAgentId
                ? {
                    ...agent,
                    installed: runtime.installed,
                    version: runtime.version,
                    install_dir: runtime.install_dir,
                    data_dir: runtime.data_dir,
                  }
                : agent,
            ),
          );
        },
      });
    } catch (error) {
      if (!(error instanceof CommandJobConflictError)) {
        onError(error instanceof Error ? error.message : "操作失败");
      }
    }
  }

  const actionBusy = job.active;

  if (loading) {
    return <PageLoading label="正在加载 Agents..." />;
  }

  if (agentId) {
    if (!selectedAgent?.installed) {
      return <PageLoading label="Agent 不存在或未安装" />;
    }

    return (
      <AgentDetailView
        agent={selectedAgent}
        refreshKey={refreshKey}
        tab={tab}
        navigate={navigate}
        onAction={handleAgentAction}
        onError={onError}
        onNotify={onNotify}
      />
    );
  }

  return (
    <Panel title="支持的 Agents">
      <div className="agent-grid">
        {agents.map((agent) => (
          <article
            key={agent.id}
            className={agent.installed ? "agent-card agent-card--clickable" : "agent-card"}
            onClick={agent.installed ? () => navigate(buildAgentPath(agent.id)) : undefined}
            onKeyDown={
              agent.installed
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(buildAgentPath(agent.id));
                    }
                  }
                : undefined
            }
            role={agent.installed ? "button" : undefined}
            tabIndex={agent.installed ? 0 : undefined}
          >
            <div className="agent-card__header">
              <h3 className="agent-card__name">{agent.name}</h3>
              <span
                className={
                  agent.installed
                    ? "agent-card__badge agent-card__badge--installed"
                    : "agent-card__badge"
                }
              >
                {agent.installed ? "已安装" : "未安装"}
              </span>
            </div>
            {agent.installed ? (
              <dl className="agent-card__meta">
                <div>
                  <dt>安装目录</dt>
                  <dd className="agent-card__path">{agent.install_dir}</dd>
                </div>
                <div>
                  <dt>CLI 版本</dt>
                  <dd>{agent.version ?? "-"}</dd>
                </div>
              </dl>
            ) : (
              <div className="agent-card__install-cmd">
                <p className="agent-card__install-label">安装命令</p>
                <code>{resolveInstallCommand(agent)}</code>
              </div>
            )}
            <div className="actions agent-card__actions">
              {agent.installed ? (
                <>
                  <button
                    className="secondary"
                    disabled={!agent.install_supported || actionBusy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleAgentAction(agent.id, "upgrade", agent.name);
                    }}
                    type="button"
                  >
                    升级
                  </button>
                  <button
                    className="danger"
                    disabled={!agent.install_supported || actionBusy}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleAgentAction(agent.id, "uninstall", agent.name);
                    }}
                    type="button"
                  >
                    卸载
                  </button>
                </>
              ) : (
                <button
                  className="primary"
                  disabled={!agent.install_supported || actionBusy}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleAgentAction(agent.id, "install", agent.name);
                  }}
                  type="button"
                >
                  安装
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}
