import { useEffect, useState } from "react";
import { isAbortError, requestJson } from "../api";
import { InfoRow, PageLoading, Panel } from "../components/ui";
import type { OverviewData } from "../types";

type OverviewPageProps = {
  refreshKey: number;
  onError: (message: string) => void;
};

export function OverviewPage({ refreshKey, onError }: OverviewPageProps) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setData(null);

      try {
        const next = await requestJson<OverviewData>("/api/overview", {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setData(next);
        }
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        onError(error instanceof Error ? error.message : "加载概览失败");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [refreshKey, onError]);

  if (loading || !data) {
    return <PageLoading label="正在加载概览..." />;
  }

  return (
    <>
      <Panel title="应用状态">
        <InfoRow label="应用名" value={data.app_name} />
        <InfoRow label="版本" value={data.version} />
        <InfoRow label="模式" value={data.mode} />
      </Panel>
      <Panel title="Agents 摘要">
        {data.agents.map((agent) => (
          <InfoRow
            key={agent.id}
            label={agent.name}
            value={agent.installed ? `已安装 · ${agent.version ?? "版本未知"}` : "未安装"}
          />
        ))}
      </Panel>
      <Panel title="Plugins 摘要">
        {data.plugins.map((plugin) => (
          <InfoRow
            key={plugin.id}
            label={plugin.name}
            value={plugin.installed ? "已安装" : "未安装"}
          />
        ))}
      </Panel>
    </>
  );
}
