import { useEffect, useState } from "react";
import { requestJson } from "../../api";
import { InfoRow, Panel } from "../ui";
import type {
  GhAccountStatus,
  GhLoginSessionStatus,
  GhLoginStartResult,
  PluginDetail,
  PluginSummary,
} from "../../types";

type GhPluginDetailViewProps = {
  plugin: PluginSummary;
  detail: PluginDetail;
  onBack: () => void;
  onAction: (
    pluginId: string,
    action: "install" | "upgrade" | "uninstall",
    pluginName?: string,
  ) => Promise<void>;
};

export function GhPluginDetailView({
  plugin,
  detail,
  onBack,
  onAction,
}: GhPluginDetailViewProps) {
  const [accountStatus, setAccountStatus] = useState<GhAccountStatus | null>(null);
  const [loginSession, setLoginSession] = useState<GhLoginSessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingLogin, setStartingLogin] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function reloadAccount() {
    const account = await requestJson<GhAccountStatus>("/api/gh/account");
    setAccountStatus(account);
    return account;
  }

  async function reloadLoginSession() {
    const session = await requestJson<GhLoginSessionStatus>("/api/gh/login/status");
    setLoginSession(session);
    return session;
  }

  async function startGhLogin() {
    const result = await requestJson<GhLoginStartResult>("/api/gh/login/start", {
      method: "POST",
    });
    await reloadLoginSession();
    if (result.auth_url || result.device_code) {
      setLoginSession((current) => ({
        active: true,
        auth_url: result.auth_url ?? current?.auth_url ?? null,
        device_code: result.device_code ?? current?.device_code ?? null,
        message: result.message,
        error: current?.error ?? null,
      }));
    }
  }

  async function logoutGh() {
    setLoggingOut(true);
    try {
      await requestJson<{ message: string }>("/api/gh/logout", { method: "POST" });
      await reloadAccount();
      setLoginSession(null);
    } finally {
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      setLoading(true);
      try {
        const [account, session] = await Promise.all([
          requestJson<GhAccountStatus>("/api/gh/account", { signal }),
          requestJson<GhLoginSessionStatus>("/api/gh/login/status", { signal }),
        ]);
        if (!signal.aborted) {
          setAccountStatus(account);
          setLoginSession(session);
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [detail.installed]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const shouldPoll =
      loginSession?.active || loginSession?.auth_url || loginSession?.device_code || startingLogin;
    if (!shouldPoll || accountStatus?.logged_in) {
      return;
    }

    const timer = window.setInterval(() => {
      void reloadLoginSession().then((session) => {
        if (!session.active && !session.error) {
          void reloadAccount();
        }
      });
    }, 2000);

    return () => window.clearInterval(timer);
  }, [
    accountStatus?.logged_in,
    loading,
    loginSession?.active,
    loginSession?.auth_url,
    loginSession?.device_code,
    startingLogin,
  ]);

  if (loading) {
    return <p className="muted">正在加载 GitHub 授权状态…</p>;
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
        <Panel title="GitHub 授权">
          <InfoRow
            label="登录状态"
            value={accountStatus?.logged_in ? "已登录" : "未登录"}
          />
          <InfoRow label="用户名" value={accountStatus?.username ?? "-"} />
          <InfoRow label="实例" value={accountStatus?.hostname ?? "github.com"} />
          <div className="actions">
            {!accountStatus?.logged_in ? (
              <button
                className="primary"
                disabled={startingLogin || loginSession?.active}
                onClick={() => {
                  setStartingLogin(true);
                  void startGhLogin().finally(() => {
                    setStartingLogin(false);
                  });
                }}
                type="button"
              >
                {startingLogin || loginSession?.active ? "登录中…" : "登录"}
              </button>
            ) : (
              <button
                className="secondary"
                disabled={loggingOut}
                onClick={() => void logoutGh()}
                type="button"
              >
                {loggingOut ? "注销中…" : "注销"}
              </button>
            )}
          </div>
          {loginSession?.error ? (
            <p className="status-banner error">{loginSession.error}</p>
          ) : null}
          {!accountStatus?.logged_in &&
          (loginSession?.active || startingLogin) &&
          loginSession?.message &&
          !loginSession.device_code ? (
            <p className="muted gh-login-hint">{loginSession.message}</p>
          ) : null}
          {!accountStatus?.logged_in && loginSession?.device_code ? (
            <div className="gh-device-code-block">
              <p className="gh-device-code-label">一次性验证码</p>
              <p className="gh-device-code">{loginSession.device_code}</p>
              <p className="muted gh-device-code-hint">
                复制上方验证码，在下方链接页面中粘贴并授权。
              </p>
            </div>
          ) : null}
          {!accountStatus?.logged_in && loginSession?.auth_url ? (
            <a
              className="external-link account-auth-link"
              href={loginSession.auth_url}
              rel="noreferrer"
              target="_blank"
            >
              打开 GitHub 授权页面
            </a>
          ) : null}
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
