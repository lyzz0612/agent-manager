import { useEffect, useMemo, useState } from "react";
import { isAbortError, requestJson } from "../api";
import { PageLoading, Panel } from "../components/ui";
import { GhPluginDetailView } from "../components/plugins/GhPluginDetailView";
import { PaseoPluginDetailView } from "../components/plugins/PaseoPluginDetailView";
import { AppRoute, buildPluginPath } from "../routing";
import type { PluginDetail, PluginSummary, RuntimeActionResult } from "../types";
import { resolveInstallCommand } from "../utils";

type PluginsPageProps = {
  route: Extract<AppRoute, { page: "plugins" }>;
  refreshKey: number;
  navigate: (path: string) => void;
  onNotify: (kind: "info" | "success" | "error", text: string) => void;
  onError: (message: string) => void;
};

export function PluginsPage({ route, refreshKey, navigate, onNotify, onError }: PluginsPageProps) {
  const pluginId = route.pluginId;
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [pluginDetail, setPluginDetail] = useState<PluginDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      setLoading(true);
      setPlugins([]);
      setPluginDetail(null);

      try {
        const nextPlugins = await requestJson<PluginSummary[]>("/api/plugins", { signal });
        if (signal.aborted) {
          return;
        }

        setPlugins(nextPlugins);

        if (pluginId) {
          const detail = await requestJson<PluginDetail>(
            `/api/plugins/${encodeURIComponent(pluginId)}`,
            { signal },
          );
          if (!signal.aborted) {
            setPluginDetail(detail);
          }
        }
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          return;
        }
        onError(error instanceof Error ? error.message : "加载 Plugins 失败");
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
  }, [pluginId, refreshKey, onError]);

  const selectedPlugin = useMemo(
    () => (pluginId ? plugins.find((plugin) => plugin.id === pluginId) ?? null : null),
    [pluginId, plugins],
  );

  async function handlePluginAction(
    targetPluginId: string,
    action: "install" | "upgrade" | "uninstall",
    pluginName?: string,
  ) {
    if (
      action === "uninstall" &&
      !window.confirm(`确认卸载 ${pluginName ?? targetPluginId} 吗？将移除 CLI，但保留用户目录数据。`)
    ) {
      return;
    }

    try {
      const result = await requestJson<RuntimeActionResult>(
        `/api/plugins/${encodeURIComponent(targetPluginId)}/${action}`,
        { method: "POST" },
      );

      if (action === "uninstall" && !result.installed) {
        navigate("/plugins");
        onNotify("success", result.message);
        return;
      }

      if (action === "install" && result.installed) {
        navigate(buildPluginPath(targetPluginId));
      }

      setPlugins((current) =>
        current.map((plugin) =>
          plugin.id === targetPluginId
            ? {
                ...plugin,
                installed: result.installed,
                version: result.version,
                install_dir: result.install_dir,
                data_dir: result.data_dir,
              }
            : plugin,
        ),
      );
      onNotify("success", result.message);
    } catch (error) {
      onError(error instanceof Error ? error.message : "操作失败");
    }
  }

  async function reloadPluginDetail(targetPluginId: string) {
    const detail = await requestJson<PluginDetail>(
      `/api/plugins/${encodeURIComponent(targetPluginId)}`,
    );
    setPluginDetail(detail);
  }

  async function handlePaseoDaemonAction(
    targetPluginId: string,
    action: "start" | "stop" | "restart",
  ) {
    try {
      const result = await requestJson<{ message: string }>(
        `/api/plugins/${encodeURIComponent(targetPluginId)}/daemon/${action}`,
        { method: "POST" },
      );
      await reloadPluginDetail(targetPluginId);
      onNotify("success", result.message);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Daemon 操作失败");
    }
  }

  if (loading) {
    return <PageLoading label={pluginId ? "正在加载插件详情..." : "正在加载 Plugins..."} />;
  }

  if (pluginId) {
    if (!selectedPlugin?.installed || !pluginDetail) {
      return <PageLoading label="插件不存在或未安装" />;
    }

    return (
      <>
        {pluginId === "gh" ? (
          <GhPluginDetailView
            detail={pluginDetail}
            onAction={handlePluginAction}
            onBack={() => navigate("/plugins")}
            plugin={selectedPlugin}
          />
        ) : (
          <PaseoPluginDetailView
            detail={pluginDetail}
            onAction={handlePluginAction}
            onBack={() => navigate("/plugins")}
            onDaemonAction={handlePaseoDaemonAction}
            onRefresh={reloadPluginDetail}
            plugin={selectedPlugin}
          />
        )}
      </>
    );
  }

  return (
    <Panel title="支持的 Plugins">
      <div className="agent-grid">
        {plugins.map((plugin) => (
          <article
            key={plugin.id}
            className={plugin.installed ? "agent-card agent-card--clickable" : "agent-card"}
            onClick={plugin.installed ? () => navigate(buildPluginPath(plugin.id)) : undefined}
            onKeyDown={
              plugin.installed
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(buildPluginPath(plugin.id));
                    }
                  }
                : undefined
            }
            role={plugin.installed ? "button" : undefined}
            tabIndex={plugin.installed ? 0 : undefined}
          >
            <div className="agent-card__header">
              <h3 className="agent-card__name">{plugin.name}</h3>
              <span
                className={
                  plugin.installed
                    ? "agent-card__badge agent-card__badge--installed"
                    : "agent-card__badge"
                }
              >
                {plugin.installed ? "已安装" : "未安装"}
              </span>
            </div>
            {plugin.description ? (
              <p className="agent-card__description">{plugin.description}</p>
            ) : null}
            {plugin.installed ? (
              <dl className="agent-card__meta">
                <div>
                  <dt>数据目录</dt>
                  <dd className="agent-card__path">{plugin.data_dir}</dd>
                </div>
              </dl>
            ) : (
              <div className="agent-card__install-cmd">
                <p className="agent-card__install-label">安装命令</p>
                <code>{resolveInstallCommand(plugin)}</code>
              </div>
            )}
            <div className="actions agent-card__actions">
              {plugin.installed ? (
                <>
                  <button
                    className="secondary"
                    disabled={!plugin.install_supported}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handlePluginAction(plugin.id, "upgrade", plugin.name);
                    }}
                    type="button"
                  >
                    升级
                  </button>
                  <button
                    className="danger"
                    disabled={!plugin.install_supported}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handlePluginAction(plugin.id, "uninstall", plugin.name);
                    }}
                    type="button"
                  >
                    卸载
                  </button>
                </>
              ) : (
                <button
                  className="primary"
                  disabled={!plugin.install_supported}
                  onClick={(event) => {
                    event.stopPropagation();
                    void handlePluginAction(plugin.id, "install", plugin.name);
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
