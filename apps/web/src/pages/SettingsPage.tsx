import { useEffect, useState } from "react";
import { isAbortError, requestJson } from "../api";
import { InfoRow, PageLoading, Panel } from "../components/ui";
import type { AppSettings, AppStatus, AppUpdateResult, AppUpdateStatus } from "../types";

type SettingsPageProps = {
  refreshKey: number;
  appStatus: AppStatus | null;
  onAppStatusChange: (next: AppStatus) => void;
  onNotify: (kind: "info" | "success" | "error", text: string) => void;
  onError: (message: string) => void;
  onRefresh: () => void;
};

export function SettingsPage({
  refreshKey,
  appStatus,
  onAppStatusChange,
  onNotify,
  onError,
  onRefresh,
}: SettingsPageProps) {
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [updateOutput, setUpdateOutput] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [pullingUpdate, setPullingUpdate] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      setLoading(true);
      setAppSettings(null);
      setUpdateOutput("");

      try {
        const settings = await requestJson<AppSettings>("/api/app/settings", { signal });
        if (!signal.aborted) {
          setAppSettings(settings);
          onAppStatusChange({
            app_name: settings.app_name,
            version: settings.version,
            mode: settings.mode,
          });
        }
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          return;
        }
        onError(error instanceof Error ? error.message : "加载设置失败");
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
  }, [refreshKey, onAppStatusChange, onError]);

  async function checkForUpdates() {
    setCheckingUpdate(true);
    try {
      const settings = await requestJson<AppSettings>("/api/app/update/check", {
        method: "POST",
      });
      setAppSettings(settings);
      if (settings.update_available) {
        onNotify(
          "info",
          `发现 ${settings.behind_commits} 个新提交（${settings.git_upstream_commit ?? "远程"}）。`,
        );
      } else {
        onNotify("success", "当前已是最新版本。");
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "检查更新失败");
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function pollUpdateJob() {
    const maxAttempts = 300;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));

      try {
        const status = await requestJson<AppUpdateStatus>("/api/app/update/status");
        setUpdateOutput(status.output);

        if (status.active) {
          if (status.phase === "restarting") {
            onNotify("info", status.message);
          }
          continue;
        }

        if (status.phase === "success") {
          onNotify("success", status.message);
          window.setTimeout(() => {
            onRefresh();
          }, 1500);
        } else if (status.phase === "failed") {
          onError(status.message);
        }

        setPullingUpdate(false);
        return;
      } catch {
        // 服务重启期间请求可能短暂失败，继续轮询。
      }
    }

    setPullingUpdate(false);
    onError("更新状态查询超时，请手动检查服务是否已恢复。");
  }

  async function pullUpdates() {
    if (
      !window.confirm(
        "将从 GitHub 拉取最新代码并在后台重新构建，完成后服务会自动重启。继续吗？",
      )
    ) {
      return;
    }

    setPullingUpdate(true);
    setUpdateOutput("");
    try {
      const result = await requestJson<AppUpdateResult>("/api/app/update/pull", {
        method: "POST",
      });

      if (result.started) {
        onNotify("info", result.message);
        void pollUpdateJob();
        return;
      }

      setUpdateOutput(result.output);
      setAppSettings((current) =>
        current
          ? {
              ...current,
              version: result.version,
              git_commit: result.git_commit,
              update_available: false,
              behind_commits: 0,
              git_upstream_commit: result.git_commit,
            }
          : current,
      );
      onAppStatusChange({
        app_name: appStatus?.app_name ?? appSettings?.app_name ?? "agent-manager",
        version: result.version,
        mode: appStatus?.mode ?? appSettings?.mode ?? "-",
      });
      onNotify(result.success ? "success" : "error", result.message);
      setPullingUpdate(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : "拉取更新失败");
      setPullingUpdate(false);
    }
  }

  if (loading || !appSettings) {
    return <PageLoading label="正在加载设置..." />;
  }

  return (
    <>
      <Panel title="应用信息">
        <InfoRow label="应用名" value={appSettings.app_name ?? appStatus?.app_name ?? "-"} />
        <InfoRow label="版本" value={appSettings.version ?? appStatus?.version ?? "-"} />
        <InfoRow label="模式" value={appSettings.mode ?? appStatus?.mode ?? "-"} />
        <InfoRow label="仓库目录" value={appSettings.repo_root ?? "-"} />
      </Panel>

      <Panel title="GitHub 更新">
        {appSettings.update_supported ? (
          <>
            <InfoRow label="远程仓库" value={appSettings.git_remote ?? "-"} />
            <InfoRow label="当前分支" value={appSettings.git_branch ?? "-"} />
            <InfoRow label="本地提交" value={appSettings.git_commit ?? "-"} />
            <InfoRow label="远程提交" value={appSettings.git_upstream_commit ?? "尚未检查"} />
            <InfoRow
              label="更新状态"
              value={
                appSettings.update_available
                  ? `有 ${appSettings.behind_commits} 个新提交可拉取`
                  : "已是最新（基于上次检查）"
              }
            />
            <div className="actions">
              <button
                className="secondary"
                disabled={checkingUpdate || pullingUpdate}
                onClick={() => void checkForUpdates()}
                type="button"
              >
                {checkingUpdate ? "检查中…" : "检查更新"}
              </button>
              <button
                className="primary"
                disabled={checkingUpdate || pullingUpdate}
                onClick={() => void pullUpdates()}
                type="button"
              >
                {pullingUpdate ? "更新中…" : "拉取并构建"}
              </button>
            </div>
            {updateOutput ? (
              <div className="update-log">
                <p className="update-log__title">命令输出</p>
                <pre>{updateOutput}</pre>
              </div>
            ) : null}
          </>
        ) : (
          <p className="muted">
            当前运行目录不是 Git 仓库，无法从 GitHub 拉取更新。请在克隆的仓库目录中启动服务，或通过
            REPO_ROOT 指定仓库路径。
          </p>
        )}
      </Panel>
    </>
  );
}
