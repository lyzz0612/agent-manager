import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage, requestJson } from "./api";
import { PageLoading, StatusBanner } from "./components/ui";
import { AgentsPage } from "./pages/AgentsPage";
import { OverviewPage } from "./pages/OverviewPage";
import { PluginsPage } from "./pages/PluginsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SkillsPage } from "./pages/SkillsPage";
import {
  defaultAuthenticatedPath,
  NAV_ITEMS,
  PAGE_TITLES,
  routePage,
  useRouter,
} from "./routing";
import type { AppStatus, MessageKind, SessionStatus } from "./types";
import { cacheRefreshPayload } from "./utils/cacheRefresh";

export default function App() {
  const { route, refreshKey, navigate, refresh } = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [loginToken, setLoginToken] = useState("");
  const [message, setMessage] = useState<{ kind: MessageKind; text: string } | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);

  const notify = useCallback((kind: MessageKind, text: string) => {
    setMessage({ kind, text });
  }, []);

  const reportError = useCallback(
    (text: string) => {
      notify("error", text);
    },
    [notify],
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!authenticated || bootLoading) {
      return;
    }

    if (route.page === "unknown") {
      navigate(defaultAuthenticatedPath());
    }
  }, [authenticated, bootLoading, navigate, route.page]);

  async function bootstrap() {
    setBootLoading(true);
    try {
      const [app, session] = await Promise.all([
        requestJson<AppStatus>("/api/app/status"),
        requestJson<SessionStatus>("/api/auth/session"),
      ]);

      setAppStatus(app);
      setAuthenticated(session.authenticated);
    } catch (error) {
      notify("error", getErrorMessage(error));
    } finally {
      setBootLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await requestJson<{ session_token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ token: loginToken }),
      });
      setAuthenticated(true);
      setLoginToken("");
      navigate(defaultAuthenticatedPath());
      notify("success", "管理页 Token 校验通过。");
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  const mainTitle = useMemo(() => {
    if (route.page === "agents" && route.agentId) {
      return "Agent 详情";
    }
    if (route.page === "plugins" && route.pluginId) {
      return "Plugin 详情";
    }
    const page = routePage(route);
    return page ? PAGE_TITLES[page] : "未知页面";
  }, [route]);

  const activePage = routePage(route);
  const [headerRefreshing, setHeaderRefreshing] = useState(false);

  const handleHeaderRefresh = useCallback(async () => {
    setHeaderRefreshing(true);
    try {
      const payload = cacheRefreshPayload(route);
      if (payload) {
        await requestJson<{ message: string }>("/api/cache/refresh", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      refresh();
    } catch (error) {
      reportError(getErrorMessage(error));
    } finally {
      setHeaderRefreshing(false);
    }
  }, [refresh, reportError, route]);

  if (bootLoading) {
    return <PageLoading label="正在加载管理页..." />;
  }

  if (!authenticated) {
    return (
      <main className="login-page">
        <section className="panel hero">
          <p className="eyebrow">Cursor VPS Manager</p>
          <h1>进入管理页</h1>
        </section>

        <section className="panel">
          <form className="stack" onSubmit={handleLogin}>
            <label className="field">
              <span>管理页访问 Token</span>
              <input
                value={loginToken}
                onChange={(event) => setLoginToken(event.target.value)}
                placeholder="请输入访问 Token"
                type="password"
              />
            </label>
            <button className="primary" type="submit">
              登录
            </button>
          </form>
          {message ? (
            <StatusBanner {...message} onDismiss={() => setMessage(null)} />
          ) : null}
        </section>
      </main>
    );
  }

  function renderPage() {
    switch (route.page) {
      case "overview":
        return <OverviewPage refreshKey={refreshKey} onError={reportError} />;
      case "agents":
        return (
          <AgentsPage
            route={route}
            refreshKey={refreshKey}
            navigate={navigate}
            onError={reportError}
            onNotify={notify}
          />
        );
      case "plugins":
        return (
          <PluginsPage
            route={route}
            refreshKey={refreshKey}
            navigate={navigate}
            onError={reportError}
            onNotify={notify}
          />
        );
      case "skills":
        return (
          <SkillsPage
            route={route}
            refreshKey={refreshKey}
            navigate={navigate}
            onError={reportError}
            onNotify={notify}
            onRefresh={refresh}
          />
        );
      case "settings":
        return (
          <SettingsPage
            refreshKey={refreshKey}
            appStatus={appStatus}
            onAppStatusChange={setAppStatus}
            onError={reportError}
            onNotify={notify}
            onRefresh={refresh}
          />
        );
      default:
        return <PageLoading label="页面不存在" />;
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <h1>agent-manager</h1>
          <p>
            v{appStatus?.version} · {appStatus?.mode}
          </p>
        </div>

        <nav className="sidebar__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={activePage === item.id ? "nav-item active" : "nav-item"}
              onClick={() => navigate(item.path)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar__footer">
          <button className="nav-item" onClick={refresh} type="button">
            刷新当前页
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="main-header">
          <h2>{mainTitle}</h2>
          <button
            className="ghost header-refresh"
            disabled={headerRefreshing}
            onClick={() => void handleHeaderRefresh()}
            type="button"
          >
            {headerRefreshing ? "刷新中..." : "刷新"}
          </button>
        </header>

        {message ? (
          <StatusBanner {...message} onDismiss={() => setMessage(null)} />
        ) : null}

        <main className="main-body">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
