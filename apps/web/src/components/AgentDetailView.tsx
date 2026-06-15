import { useEffect, useMemo, useState } from "react";
import { isAbortError, requestJson } from "../api";
import { InfoRow, PageLoading, Panel } from "./ui";
import { AgentDetailTab, buildAgentPath } from "../routing";
import type {
  AgentSummary,
  CursorAccountStatus,
  CursorLoginSessionStatus,
  CursorLoginStartResult,
} from "../types";

const AGENT_DETAIL_TABS: { id: AgentDetailTab; label: string; cursorOnly?: boolean }[] = [
  { id: "overview", label: "概览" },
  { id: "account", label: "账号", cursorOnly: true },
];

type AgentDetailViewProps = {
  agent: AgentSummary;
  tab: AgentDetailTab;
  refreshKey: number;
  navigate: (path: string) => void;
  onAction: (
    agentId: string,
    action: "install" | "upgrade" | "uninstall",
    agentName?: string,
  ) => Promise<void>;
  onNotify: (kind: "info" | "success" | "error", text: string) => void;
  onError: (message: string) => void;
};

export function AgentDetailView({
  agent,
  tab,
  refreshKey,
  navigate,
  onAction,
  onNotify,
  onError,
}: AgentDetailViewProps) {
  const detailTabs = useMemo(
    () => AGENT_DETAIL_TABS.filter((item) => !item.cursorOnly || agent.id === "cursor"),
    [agent.id],
  );

  const [loading, setLoading] = useState(true);
  const [accountStatus, setAccountStatus] = useState<CursorAccountStatus | null>(null);
  const [cursorLoginSession, setCursorLoginSession] =
    useState<CursorLoginSessionStatus | null>(null);
  const [startingLogin, setStartingLogin] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!detailTabs.some((item) => item.id === tab)) {
      navigate(buildAgentPath(agent.id));
    }
  }, [agent.id, detailTabs, navigate, tab]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function loadTabData() {
      setLoading(true);
      setAccountStatus(null);
      setCursorLoginSession(null);

      try {
        if (agent.id === "cursor" && tab === "account") {
          const [account, loginSession] = await Promise.all([
            requestJson<CursorAccountStatus>("/api/cursor/account", { signal }),
            requestJson<CursorLoginSessionStatus>("/api/cursor/login/status", { signal }),
          ]);

          if (!signal.aborted) {
            setAccountStatus(account);
            setCursorLoginSession(loginSession);
          }
        }
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          return;
        }
        onError(error instanceof Error ? error.message : "加载 Agent 详情失败");
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadTabData();

    return () => {
      controller.abort();
    };
  }, [agent.id, refreshKey, tab, onError]);

  async function refreshCursorAccountStatus() {
    const account = await requestJson<CursorAccountStatus>("/api/cursor/account");
    setAccountStatus(account);
    return account;
  }

  async function refreshCursorLoginSession() {
    const session = await requestJson<CursorLoginSessionStatus>("/api/cursor/login/status");
    setCursorLoginSession(session);
    return session;
  }

  async function startCursorLogin() {
    const result = await requestJson<CursorLoginStartResult>("/api/cursor/login/start", {
      method: "POST",
    });

    if (result.already_logged_in) {
      await refreshCursorAccountStatus();
      return;
    }

    if (!result.started) {
      onError(result.message);
      return;
    }

    await refreshCursorLoginSession();
  }

  async function logoutCursor() {
    setLoggingOut(true);
    try {
      const result = await requestJson<{ message: string }>("/api/cursor/logout", {
        method: "POST",
      });
      await Promise.all([refreshCursorAccountStatus(), refreshCursorLoginSession()]);
      onNotify("success", result.message);
    } catch (error) {
      onError(error instanceof Error ? error.message : "注销失败");
    } finally {
      setLoggingOut(false);
    }
  }

  useEffect(() => {
    if (agent.id !== "cursor" || tab !== "account" || loading) {
      return;
    }

    if (accountStatus?.logged_in) {
      return;
    }

    const shouldPoll =
      cursorLoginSession?.active || cursorLoginSession?.auth_url || startingLogin;

    if (!shouldPoll) {
      return;
    }

    const poll = async () => {
      try {
        const [account, session] = await Promise.all([
          refreshCursorAccountStatus(),
          refreshCursorLoginSession(),
        ]);

        if (account.logged_in) {
          setStartingLogin(false);
          setCursorLoginSession((current) =>
            current ? { ...current, auth_url: null, active: false } : current,
          );
        } else if (!session.active && !session.auth_url) {
          setStartingLogin(false);
        }
      } catch {
        // 登录流程进行中，忽略短暂请求失败。
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [
    accountStatus?.logged_in,
    agent.id,
    cursorLoginSession?.active,
    cursorLoginSession?.auth_url,
    loading,
    startingLogin,
    tab,
  ]);

  if (loading && tab !== "overview") {
    return <PageLoading label="正在加载 Agent 详情..." />;
  }

  return (
    <div className="agent-detail">
      <div className="detail-header agent-detail-header">
        <button className="ghost" onClick={() => navigate("/agents")} type="button">
          ← 返回列表
        </button>
        <h3>{agent.name}</h3>
      </div>

      <div className="agent-detail-layout">
        {detailTabs.length > 1 ? (
          <nav className="scope-tabs" role="tablist" aria-label={`${agent.name} 详情`}>
            {detailTabs.map((item) => (
              <button
                key={item.id}
                aria-selected={tab === item.id}
                className={tab === item.id ? "scope-tab active" : "scope-tab"}
                onClick={() => navigate(buildAgentPath(agent.id, item.id))}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : null}

        <div className="detail-tab-content" role="tabpanel">
          {tab === "overview" ? (
            <>
              <Panel title="CLI 运行信息">
                <InfoRow label="CLI 版本" value={agent.version ?? "-"} />
                <InfoRow label="安装目录" value={agent.install_dir} />
                <InfoRow label="数据目录" value={agent.data_dir} />
              </Panel>
              <div className="actions">
                <button
                  className="secondary"
                  disabled={!agent.install_supported}
                  onClick={() => void onAction(agent.id, "upgrade", agent.name)}
                  type="button"
                >
                  升级
                </button>
                <button
                  className="danger"
                  disabled={!agent.install_supported}
                  onClick={() => void onAction(agent.id, "uninstall", agent.name)}
                  type="button"
                >
                  卸载
                </button>
              </div>
            </>
          ) : null}

          {tab === "account" && agent.id === "cursor" ? (
            <Panel title="账号">
              <InfoRow
                label="登录状态"
                value={accountStatus?.logged_in ? "已登录" : "未登录"}
              />
              <InfoRow label="邮箱" value={accountStatus?.email ?? "-"} />
              <div className="actions">
                {!accountStatus?.logged_in ? (
                  <button
                    className="primary"
                    disabled={startingLogin || cursorLoginSession?.active}
                    onClick={() => {
                      setStartingLogin(true);
                      void startCursorLogin().finally(() => {
                        setStartingLogin(false);
                      });
                    }}
                    type="button"
                  >
                    {startingLogin || cursorLoginSession?.active ? "登录中…" : "登录"}
                  </button>
                ) : (
                  <button
                    className="secondary"
                    disabled={loggingOut}
                    onClick={() => void logoutCursor()}
                    type="button"
                  >
                    {loggingOut ? "注销中…" : "注销"}
                  </button>
                )}
              </div>
              {cursorLoginSession?.error ? (
                <p className="status-banner error">{cursorLoginSession.error}</p>
              ) : null}
              {!accountStatus?.logged_in && cursorLoginSession?.auth_url ? (
                <a
                  className="external-link account-auth-link"
                  href={cursorLoginSession.auth_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {cursorLoginSession.auth_url}
                </a>
              ) : null}
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
