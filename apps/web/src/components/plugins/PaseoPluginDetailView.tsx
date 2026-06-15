import { useMemo, useState } from "react";
import { Panel } from "../ui";
import type { PluginDetail, PluginSummary } from "../../types";
import { formatPaseoDaemonStatus, parsePaseoPairUrl } from "../../utils/paseo";

type PaseoPluginDetailViewProps = {
  plugin: PluginSummary;
  detail: PluginDetail;
  onBack: () => void;
  onAction: (
    pluginId: string,
    action: "install" | "upgrade" | "uninstall",
    pluginName?: string,
  ) => Promise<void>;
  onDaemonAction: (
    pluginId: string,
    action: "start" | "stop" | "restart",
  ) => Promise<void>;
  onRefresh: (pluginId: string) => Promise<void>;
};

export function PaseoPluginDetailView({
  plugin,
  detail,
  onBack,
  onAction,
  onDaemonAction,
  onRefresh,
}: PaseoPluginDetailViewProps) {
  const daemonStatus = useMemo(
    () => formatPaseoDaemonStatus(detail.daemon_status),
    [detail.daemon_status],
  );
  const pairUrl = useMemo(() => parsePaseoPairUrl(detail.daemon_pair_json), [detail.daemon_pair_json]);
  const [copied, setCopied] = useState(false);

  async function copyPairUrl() {
    if (!pairUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(pairUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="agent-detail">
      <div className="detail-header agent-detail-header">
        <button className="ghost" onClick={onBack} type="button">
          ← 返回列表
        </button>
        <h3>{plugin.name}</h3>
      </div>

      <div className="detail-tab-content">
        <Panel title="Daemon 状态">
          <div className="paseo-status-row">
            <span className="paseo-status-label">运行状态</span>
            <span className={`paseo-status-badge paseo-status-badge--${daemonStatus.state}`}>
              {daemonStatus.label}
            </span>
          </div>
          <div className="actions paseo-daemon-actions">
            <button
              className="primary"
              disabled={!plugin.installed}
              onClick={() => void onDaemonAction(plugin.id, "start")}
              type="button"
            >
              启动
            </button>
            <button
              className="secondary"
              disabled={!plugin.installed}
              onClick={() => void onDaemonAction(plugin.id, "restart")}
              type="button"
            >
              重启
            </button>
            <button
              className="danger"
              disabled={!plugin.installed}
              onClick={() => void onDaemonAction(plugin.id, "stop")}
              type="button"
            >
              停止
            </button>
            <button
              className="ghost"
              disabled={!plugin.installed}
              onClick={() => void onRefresh(plugin.id)}
              type="button"
            >
              刷新
            </button>
          </div>
        </Panel>

        <Panel title="配对链接">
          {pairUrl ? (
            <div className="paseo-pair-block">
              <a
                className="external-link paseo-pair-link"
                href={pairUrl}
                rel="noreferrer"
                target="_blank"
              >
                {pairUrl}
              </a>
              <button className="secondary paseo-copy-button" onClick={() => void copyPairUrl()} type="button">
                {copied ? "已复制" : "复制链接"}
              </button>
            </div>
          ) : (
            <p className="muted paseo-pair-empty">无法获取配对链接，请确认 Daemon 已启动后刷新。</p>
          )}
        </Panel>

        <div className="actions">
          <button
            className="secondary"
            disabled={!plugin.install_supported}
            onClick={() => void onAction(plugin.id, "upgrade", plugin.name)}
            type="button"
          >
            升级
          </button>
          <button
            className="danger"
            disabled={!plugin.install_supported}
            onClick={() => void onAction(plugin.id, "uninstall", plugin.name)}
            type="button"
          >
            卸载
          </button>
        </div>
      </div>
    </div>
  );
}
