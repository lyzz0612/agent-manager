import { Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react";

type AppStatus = {
  app_name: string;
  version: string;
  mode: string;
};

type SessionStatus = {
  authenticated: boolean;
};

type RuntimeActionResult = {
  installed: boolean;
  version: string | null;
  install_dir: string;
  data_dir: string;
  message: string;
};

type CursorAccountStatus = {
  logged_in: boolean;
  email: string | null;
  display_name: string | null;
  note: string;
};

type AuthStep = {
  title: string;
  detail: string;
};

type CursorAuthFlowStatus = {
  summary: string;
  steps: AuthStep[];
};

type CursorLoginStartResult = {
  started: boolean;
  already_logged_in: boolean;
  auth_url: string | null;
  message: string;
};

type CursorLoginSessionStatus = {
  active: boolean;
  auth_url: string | null;
  message: string;
  error: string | null;
};

type KnownConfig = {
  disable_telemetry: boolean;
  auto_update: boolean;
  release_track: string;
};

type RawConfigDocument = {
  path: string;
  content: string;
};

type RawConfigPreview = {
  path: string;
  current_content: string;
  next_content: string;
};

type AgentSummary = {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
  install_dir: string;
  data_dir: string;
  install_supported: boolean;
  install_command: string | null;
};

type PluginSummary = {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
  install_dir: string;
  data_dir: string;
  install_supported: boolean;
  install_command: string | null;
  official_url: string;
  default_workspace: string;
};

type PluginDetail = {
  id: string;
  name: string;
  installed: boolean;
  daemon_status: string;
  providers_listing: string;
  agents_listing: string;
  daemon_pair_json: string;
};

type SkillSummary = {
  id: string;
  name: string;
  agent: string;
  path: string;
};

type SkillFileSummary = {
  id: string;
  name: string;
  agent: string;
  folder: string;
  path: string;
};

type SkillDocument = {
  id: string;
  name: string;
  agent: string;
  path: string;
  content: string;
};

type MessageKind = "info" | "success" | "error";

type AppSettings = {
  app_name: string;
  version: string;
  mode: string;
  repo_root: string;
  update_supported: boolean;
  git_remote: string | null;
  git_branch: string | null;
  git_commit: string | null;
  git_upstream_commit: string | null;
  update_available: boolean;
  behind_commits: number;
};

type AppUpdateResult = {
  success: boolean;
  message: string;
  output: string;
  version: string;
  git_commit: string | null;
  restart_required: boolean;
  started?: boolean;
};

type AppUpdateStatus = {
  active: boolean;
  phase: string;
  message: string;
  output: string;
  version: string;
  git_commit: string | null;
};

type PageId = "overview" | "agents" | "plugins" | "skills" | "settings";

type SkillScope = "common" | string;

const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "agents", label: "Agents" },
  { id: "plugins", label: "Plugins" },
  { id: "skills", label: "Skills" },
  { id: "settings", label: "设置" },
];

const PAGE_TITLES: Record<PageId, string> = {
  overview: "概览",
  agents: "Agents",
  plugins: "Plugins",
  skills: "Skills",
  settings: "设置",
};

const defaultKnownConfig: KnownConfig = {
  disable_telemetry: false,
  auto_update: true,
  release_track: "stable",
};

const CURSOR_CLI_INSTALL_COMMAND_WINDOWS =
  "irm 'https://cursor.com/install?win32=true' | iex";
const CURSOR_CLI_INSTALL_COMMAND_UNIX = "curl https://cursor.com/install -fsS | bash";

function resolveInstallCommand(item: { id: string; install_command: string | null }): string {
  if (item.install_command) {
    return item.install_command;
  }

  if (item.id !== "cursor") {
    return "";
  }

  const isWindows =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

  return isWindows ? CURSOR_CLI_INSTALL_COMMAND_WINDOWS : CURSOR_CLI_INSTALL_COMMAND_UNIX;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `请求失败: ${response.status}`;

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // ignore json parse failure
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loginToken, setLoginToken] = useState("");
  const [message, setMessage] = useState<{ kind: MessageKind; text: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState<PageId>("overview");

  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [pluginDetail, setPluginDetail] = useState<PluginDetail | null>(null);
  const [accountStatus, setAccountStatus] = useState<CursorAccountStatus | null>(null);
  const [authFlow, setAuthFlow] = useState<CursorAuthFlowStatus | null>(null);
  const [cursorLoginSession, setCursorLoginSession] = useState<CursorLoginSessionStatus | null>(
    null,
  );
  const [knownConfig, setKnownConfig] = useState<KnownConfig>(defaultKnownConfig);
  const [rawConfig, setRawConfig] = useState<RawConfigDocument | null>(null);
  const [rawDraft, setRawDraft] = useState("");
  const [rawPreview, setRawPreview] = useState<RawConfigPreview | null>(null);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [skillScope, setSkillScope] = useState<SkillScope>("common");
  const [selectedSkillFolderId, setSelectedSkillFolderId] = useState<string | null>(null);
  const [skillFiles, setSkillFiles] = useState<SkillFileSummary[]>([]);
  const [selectedSkillFileId, setSelectedSkillFileId] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillDocument | null>(null);
  const [skillDraft, setSkillDraft] = useState("");
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [updateOutput, setUpdateOutput] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [pullingUpdate, setPullingUpdate] = useState(false);

  const skillScopeTabs = useMemo(
    () => [
      { id: "common" as const, label: "通用" },
      ...agents.map((agent) => ({ id: agent.id, label: agent.name })),
    ],
    [agents],
  );

  const scopedSkills = useMemo(
    () => skills.filter((skill) => skill.agent === skillScope),
    [skills, skillScope],
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const selectedPlugin = useMemo(
    () => plugins.find((plugin) => plugin.id === selectedPluginId) ?? null,
    [plugins, selectedPluginId],
  );

  const mainTitle = useMemo(() => {
    if (activePage === "agents" && selectedAgent) {
      return selectedAgent.name;
    }
    if (activePage === "plugins" && selectedPlugin) {
      return selectedPlugin.name;
    }
    return PAGE_TITLES[activePage];
  }, [activePage, selectedAgent, selectedPlugin]);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (activePage !== "agents") {
      setSelectedAgentId(null);
    }
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "plugins") {
      setSelectedPluginId(null);
      setPluginDetail(null);
    }
  }, [activePage]);

  useEffect(() => {
    if (!authenticated || !selectedPluginId) {
      setPluginDetail(null);
      return;
    }

    void loadPluginDetail(selectedPluginId);
  }, [authenticated, selectedPluginId]);

  useEffect(() => {
    if (!authenticated || !selectedSkillFolderId) {
      setSkillFiles([]);
      return;
    }

    void loadSkillFiles(selectedSkillFolderId);
  }, [authenticated, selectedSkillFolderId]);

  useEffect(() => {
    if (!authenticated || !selectedSkillFileId) {
      return;
    }

    void loadSkill(selectedSkillFileId);
  }, [authenticated, selectedSkillFileId]);

  useEffect(() => {
    if (!authenticated || activePage !== "settings") {
      return;
    }

    void loadAppSettings();
  }, [authenticated, activePage]);

  async function bootstrap() {
    setLoading(true);
    try {
      const [app, session] = await Promise.all([
        requestJson<AppStatus>("/api/app/status"),
        requestJson<SessionStatus>("/api/auth/session"),
      ]);

      setAppStatus(app);
      setAuthenticated(session.authenticated);

      if (session.authenticated) {
        await loadDashboard();
      }
    } catch (error) {
      notify("error", getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadDashboard() {
    const [nextAgents, nextPlugins, account, flow, loginSession, nextKnownConfig, nextRawConfig, nextSkills] =
      await Promise.all([
        requestJson<AgentSummary[]>("/api/agents"),
        requestJson<PluginSummary[]>("/api/plugins"),
        requestJson<CursorAccountStatus>("/api/cursor/account"),
        requestJson<CursorAuthFlowStatus>("/api/cursor/auth-flow"),
        requestJson<CursorLoginSessionStatus>("/api/cursor/login/status"),
        requestJson<KnownConfig>("/api/profile/known-config"),
        requestJson<RawConfigDocument>("/api/profile/raw-config"),
        requestJson<SkillSummary[]>("/api/profile/skills"),
      ]);

    setAgents(nextAgents);
    setPlugins(nextPlugins);
    setAccountStatus(account);
    setAuthFlow(flow);
    setCursorLoginSession(loginSession);
    setKnownConfig(nextKnownConfig);
    setRawConfig(nextRawConfig);
    setRawDraft(nextRawConfig.content);
    setRawPreview(null);
    setSkills(nextSkills);

    setSelectedAgentId((current) => {
      if (current && nextAgents.some((agent) => agent.id === current && agent.installed)) {
        return current;
      }
      return null;
    });

    setSelectedPluginId((current) => {
      if (current && nextPlugins.some((plugin) => plugin.id === current && plugin.installed)) {
        return current;
      }
      return null;
    });

    setSelectedSkillFolderId((current) => {
      if (current && nextSkills.some((item) => item.id === current)) {
        return current;
      }
      setSkillFiles([]);
      setSelectedSkillFileId(null);
      setSelectedSkill(null);
      setSkillDraft("");
      return null;
    });
  }

  async function loadAppSettings() {
    try {
      const settings = await requestJson<AppSettings>("/api/app/settings");
      setAppSettings(settings);
      setAppStatus((current) =>
        current
          ? { ...current, version: settings.version, mode: settings.mode }
          : {
              app_name: settings.app_name,
              version: settings.version,
              mode: settings.mode,
            },
      );
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  async function checkForUpdates() {
    setCheckingUpdate(true);
    try {
      const settings = await requestJson<AppSettings>("/api/app/update/check", {
        method: "POST",
      });
      setAppSettings(settings);
      if (settings.update_available) {
        notify(
          "info",
          `发现 ${settings.behind_commits} 个新提交（${settings.git_upstream_commit ?? "远程"}）。`,
        );
      } else {
        notify("success", "当前已是最新版本。");
      }
    } catch (error) {
      notify("error", getErrorMessage(error));
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
            notify("info", status.message);
          }
          continue;
        }

        if (status.phase === "success") {
          notify("success", status.message);
          window.setTimeout(() => {
            void loadDashboard();
          }, 1500);
        } else if (status.phase === "failed") {
          notify("error", status.message);
        }

        setPullingUpdate(false);
        return;
      } catch {
        // 服务重启期间请求可能短暂失败，继续轮询。
      }
    }

    setPullingUpdate(false);
    notify("error", "更新状态查询超时，请手动检查服务是否已恢复。");
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
        notify("info", result.message);
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
      setAppStatus((current) =>
        current ? { ...current, version: result.version } : current,
      );
      notify(result.success ? "success" : "error", result.message);
      setPullingUpdate(false);
    } catch (error) {
      notify("error", getErrorMessage(error));
      setPullingUpdate(false);
    }
  }

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
      notify("success", result.message);
      return;
    }

    if (!result.started) {
      notify("error", result.message);
      return;
    }

    await refreshCursorLoginSession();
    notify("info", result.message);
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
      await loadDashboard();
      notify("success", "管理页 Token 校验通过。");
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  async function handleAgentAction(
    agentId: string,
    action: "install" | "upgrade" | "uninstall",
    agentName?: string,
  ) {
    if (
      action === "uninstall" &&
      !window.confirm(`确认卸载 ${agentName ?? agentId} 吗？将移除 CLI，但保留用户目录数据。`)
    ) {
      return;
    }

    try {
      const result = await requestJson<RuntimeActionResult>(
        `/api/agents/${encodeURIComponent(agentId)}/${action}`,
        { method: "POST" },
      );
      setAgents((current) =>
        current.map((agent) =>
          agent.id === agentId
            ? {
                ...agent,
                installed: result.installed,
                version: result.version,
                install_dir: result.install_dir,
                data_dir: result.data_dir,
              }
            : agent,
        ),
      );
      if (action === "uninstall" && !result.installed) {
        setSelectedAgentId(null);
      }
      if (action === "install" && result.installed) {
        setSelectedAgentId(agentId);
      }
      if (agentId === "cursor") {
        await refreshCursorAccountStatus();
      }
      notify("success", result.message);
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  function openAgentDetail(agentId: string) {
    const agent = agents.find((item) => item.id === agentId);
    if (agent?.installed) {
      setSelectedAgentId(agentId);
    }
  }

  function backToAgentList() {
    setSelectedAgentId(null);
  }

  async function handlePluginAction(
    pluginId: string,
    action: "install" | "upgrade" | "uninstall",
    pluginName?: string,
  ) {
    if (
      action === "uninstall" &&
      !window.confirm(`确认卸载 ${pluginName ?? pluginId} 吗？将移除 CLI，但保留用户目录数据。`)
    ) {
      return;
    }

    try {
      const result = await requestJson<RuntimeActionResult>(
        `/api/plugins/${encodeURIComponent(pluginId)}/${action}`,
        { method: "POST" },
      );
      setPlugins((current) =>
        current.map((plugin) =>
          plugin.id === pluginId
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
      if (action === "uninstall" && !result.installed) {
        setSelectedPluginId(null);
      }
      if (action === "install" && result.installed) {
        setSelectedPluginId(pluginId);
      }
      if (selectedPluginId === pluginId) {
        void loadPluginDetail(pluginId);
      }
      notify("success", result.message);
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  function openPluginDetail(pluginId: string) {
    const plugin = plugins.find((item) => item.id === pluginId);
    if (plugin?.installed) {
      setSelectedPluginId(pluginId);
    }
  }

  function backToPluginList() {
    setSelectedPluginId(null);
    setPluginDetail(null);
  }

  async function loadPluginDetail(pluginId: string) {
    try {
      const detail = await requestJson<PluginDetail>(
        `/api/plugins/${encodeURIComponent(pluginId)}`,
      );
      setPluginDetail(detail);
    } catch (error) {
      setPluginDetail(null);
      notify("error", getErrorMessage(error));
    }
  }

  async function handlePaseoDaemonAction(
    pluginId: string,
    action: "start" | "stop" | "restart",
  ) {
    try {
      const result = await requestJson<{ message: string }>(
        `/api/plugins/${encodeURIComponent(pluginId)}/daemon/${action}`,
        { method: "POST" },
      );
      await loadPluginDetail(pluginId);
      notify("success", result.message);
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  function switchSkillScope(nextScope: SkillScope) {
    setSkillScope(nextScope);
    setSelectedSkillFolderId(null);
    setSkillFiles([]);
    setSelectedSkillFileId(null);
    setSelectedSkill(null);
    setSkillDraft("");
  }

  function backToSkillFolders() {
    setSelectedSkillFolderId(null);
    setSkillFiles([]);
    setSelectedSkillFileId(null);
    setSelectedSkill(null);
    setSkillDraft("");
  }

  function backToSkillFiles() {
    setSelectedSkillFileId(null);
    setSelectedSkill(null);
    setSkillDraft("");
  }

  async function saveKnownConfig() {
    try {
      const result = await requestJson<KnownConfig>("/api/profile/known-config", {
        method: "PUT",
        body: JSON.stringify(knownConfig),
      });
      setKnownConfig(result);
      await refreshRawConfig();
      notify("success", "已保存已知配置项。");
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  async function refreshRawConfig() {
    const result = await requestJson<RawConfigDocument>("/api/profile/raw-config");
    setRawConfig(result);
    setRawDraft(result.content);
    setRawPreview(null);
  }

  async function previewRawConfig() {
    try {
      const preview = await requestJson<RawConfigPreview>("/api/profile/raw-config/preview", {
        method: "POST",
        body: JSON.stringify({ content: rawDraft }),
      });
      setRawPreview(preview);
      notify("info", "已生成保存预览，请确认后再提交。");
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  async function confirmRawConfig() {
    try {
      const result = await requestJson<RawConfigDocument>("/api/profile/raw-config/confirm", {
        method: "POST",
        body: JSON.stringify({ content: rawDraft }),
      });
      setRawConfig(result);
      setRawDraft(result.content);
      setRawPreview(null);
      notify("success", "原始配置已写入。");
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  async function loadSkillFiles(folderId: string) {
    try {
      const result = await requestJson<SkillFileSummary[]>(
        `/api/profile/skills/${encodeURIComponent(folderId)}/files`,
      );
      setSkillFiles(result);
      setSelectedSkillFileId((current) => {
        if (current && result.some((item) => item.id === current)) {
          return current;
        }
        setSelectedSkill(null);
        setSkillDraft("");
        return null;
      });
    } catch (error) {
      setSkillFiles([]);
      setSelectedSkillFileId(null);
      setSelectedSkill(null);
      setSkillDraft("");
      notify("error", getErrorMessage(error));
    }
  }

  async function loadSkill(id: string) {
    try {
      const result = await requestJson<SkillDocument>(
        `/api/profile/skills/${encodeURIComponent(id)}`,
      );
      setSelectedSkill(result);
      setSkillDraft(result.content);
    } catch (error) {
      setSelectedSkill(null);
      setSkillDraft("");
      notify("error", getErrorMessage(error));
    }
  }

  async function saveSkill() {
    if (!selectedSkill) {
      return;
    }

    try {
      const result = await requestJson<SkillDocument>(
        `/api/profile/skills/${encodeURIComponent(selectedSkill.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({ content: skillDraft }),
        },
      );
      setSelectedSkill(result);
      setSkillDraft(result.content);
      notify("success", `已更新 skill: ${result.name}`);
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  function notify(kind: MessageKind, text: string) {
    setMessage({ kind, text });
  }

  if (loading) {
    return <div className="screen-message">正在加载管理页...</div>;
  }

  if (!authenticated) {
    return (
      <main className="login-page">
        <section className="panel hero">
          <p className="eyebrow">Cursor VPS Manager</p>
          <h1>使用固定访问 Token 进入管理页</h1>
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
              onClick={() => setActivePage(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar__footer">
          <button className="nav-item" onClick={() => void loadDashboard()} type="button">
            刷新数据
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="main-header">
          <h2>{mainTitle}</h2>
        </header>

        {message ? (
          <StatusBanner {...message} onDismiss={() => setMessage(null)} />
        ) : null}

        <main className="main-body">
        {activePage === "overview" ? (
          <>
            <Panel title="应用状态">
              <InfoRow label="应用名" value={appStatus?.app_name ?? "-"} />
              <InfoRow label="版本" value={appStatus?.version ?? "-"} />
              <InfoRow label="模式" value={appStatus?.mode ?? "-"} />
            </Panel>
            <Panel title="Agents 摘要">
              {agents.map((agent) => (
                  <InfoRow
                    key={agent.id}
                    label={agent.name}
                    value={
                      agent.installed
                        ? `已安装 · ${agent.version ?? "版本未知"}`
                        : "未安装"
                    }
                  />
                ))}
            </Panel>
            <Panel title="Plugins 摘要">
              {plugins.map((plugin) => (
                <InfoRow
                  key={plugin.id}
                  label={plugin.name}
                  value={
                    plugin.installed
                      ? "已安装"
                      : "未安装"
                  }
                />
              ))}
            </Panel>
          </>
        ) : null}

        {activePage === "agents" ? (
          selectedAgent ? (
            <AgentDetailView
              agent={selectedAgent}
              accountStatus={accountStatus}
              authFlow={authFlow}
              cursorLoginSession={cursorLoginSession}
              knownConfig={knownConfig}
              rawConfig={rawConfig}
              rawDraft={rawDraft}
              rawPreview={rawPreview}
              onBack={backToAgentList}
              onAction={handleAgentAction}
              onStartCursorLogin={() => startCursorLogin()}
              onRefreshCursorAccount={() => refreshCursorAccountStatus()}
              onRefreshCursorLoginSession={() => refreshCursorLoginSession()}
              onKnownConfigChange={setKnownConfig}
              onRawDraftChange={setRawDraft}
              onSaveKnownConfig={() => void saveKnownConfig()}
              onRefreshRawConfig={() => void refreshRawConfig()}
              onPreviewRawConfig={() => void previewRawConfig()}
              onConfirmRawConfig={() => void confirmRawConfig()}
            />
          ) : (
            <Panel title="支持的 Agents">
              <div className="agent-grid">
                {agents.map((agent) => (
                  <article
                    key={agent.id}
                    className={
                      agent.installed ? "agent-card agent-card--clickable" : "agent-card"
                    }
                    onClick={agent.installed ? () => openAgentDetail(agent.id) : undefined}
                    onKeyDown={
                      agent.installed
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openAgentDetail(agent.id);
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
                            disabled={!agent.install_supported}
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
                            disabled={!agent.install_supported}
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
                          disabled={!agent.install_supported}
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
                    {agent.installed ? (
                      <p className="agent-card__hint muted">点击卡片进入详情</p>
                    ) : null}
                  </article>
                ))}
              </div>
            </Panel>
          )
        ) : null}

        {activePage === "plugins" ? (
          selectedPlugin && pluginDetail ? (
            <PluginDetailView
              detail={pluginDetail}
              plugin={selectedPlugin}
              onBack={backToPluginList}
              onAction={handlePluginAction}
              onDaemonAction={handlePaseoDaemonAction}
              onRefresh={loadPluginDetail}
            />
          ) : selectedPlugin ? (
            <div className="screen-message">正在加载插件详情...</div>
          ) : (
            <Panel title="支持的 Plugins">
              <div className="agent-grid">
                {plugins.map((plugin) => (
                  <article
                    key={plugin.id}
                    className={
                      plugin.installed ? "agent-card agent-card--clickable" : "agent-card"
                    }
                    onClick={plugin.installed ? () => openPluginDetail(plugin.id) : undefined}
                    onKeyDown={
                      plugin.installed
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              openPluginDetail(plugin.id);
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
                    {plugin.installed ? (
                      <p className="agent-card__hint muted">点击卡片进入详情</p>
                    ) : null}
                  </article>
                ))}
              </div>
            </Panel>
          )
        ) : null}

        {activePage === "skills" ? (
          <Panel title="Skills">
            <div className="skills-layout">
              <nav className="scope-tabs" role="tablist">
                {skillScopeTabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={skillScope === tab.id ? "scope-tab active" : "scope-tab"}
                    onClick={() => switchSkillScope(tab.id)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>

              <div className="skills-content">
                {selectedSkillFileId && selectedSkill ? (
                  <>
                    <div className="detail-header">
                      <button className="ghost" onClick={backToSkillFiles} type="button">
                        ← 返回文件列表
                      </button>
                      <h3>{selectedSkill.name}</h3>
                    </div>
                    <div className="code-meta">
                      <span>{selectedSkill.path}</span>
                    </div>
                    <textarea
                      className="editor"
                      value={skillDraft}
                      onChange={(event) => setSkillDraft(event.target.value)}
                    />
                    <div className="actions">
                      <button className="primary" onClick={() => void saveSkill()}>
                        保存
                      </button>
                    </div>
                  </>
                ) : selectedSkillFolderId ? (
                  <>
                    <div className="detail-header">
                      <button className="ghost" onClick={backToSkillFolders} type="button">
                        ← 返回文件夹列表
                      </button>
                      <h3>
                        {scopedSkills.find((skill) => skill.id === selectedSkillFolderId)?.name ??
                          selectedSkillFolderId}
                      </h3>
                    </div>
                    <div className="skill-list-items">
                      {skillFiles.length === 0 ? (
                        <p className="empty-hint">该 skill 文件夹内暂无文件。</p>
                      ) : (
                        skillFiles.map((file) => (
                          <button
                            key={file.id}
                            className="skill-list-item"
                            onClick={() => setSelectedSkillFileId(file.id)}
                            type="button"
                          >
                            <span>{file.name}</span>
                            <span className="skill-list-item__path">{file.path}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div className="skill-list-items">
                    {scopedSkills.length === 0 ? (
                      <p className="empty-hint">当前分类下暂无 skill 文件夹。</p>
                    ) : (
                      scopedSkills.map((skill) => (
                        <button
                          key={skill.id}
                          className="skill-list-item skill-list-item--folder"
                          onClick={() => setSelectedSkillFolderId(skill.id)}
                          type="button"
                        >
                          <span>{skill.name}</span>
                          <span className="skill-list-item__path">{skill.path}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        ) : null}

        {activePage === "settings" ? (
          <>
            <Panel title="应用信息">
              <InfoRow label="应用名" value={appSettings?.app_name ?? appStatus?.app_name ?? "-"} />
              <InfoRow label="版本" value={appSettings?.version ?? appStatus?.version ?? "-"} />
              <InfoRow label="模式" value={appSettings?.mode ?? appStatus?.mode ?? "-"} />
              <InfoRow label="仓库目录" value={appSettings?.repo_root ?? "-"} />
            </Panel>

            <Panel title="GitHub 更新">
              {appSettings?.update_supported ? (
                <>
                  <InfoRow label="远程仓库" value={appSettings.git_remote ?? "-"} />
                  <InfoRow label="当前分支" value={appSettings.git_branch ?? "-"} />
                  <InfoRow label="本地提交" value={appSettings.git_commit ?? "-"} />
                  <InfoRow
                    label="远程提交"
                    value={appSettings.git_upstream_commit ?? "尚未检查"}
                  />
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
                  <p className="muted">
                    拉取前会丢弃本地改动（含 Cargo.lock 等），然后在独立后台进程执行 git pull、npm
                    run build:web 和 cargo build --release --locked。构建失败会自动回滚；构建成功后会自动重启服务，无需手动操作。
                  </p>
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
        ) : null}
        </main>
      </div>
    </div>
  );
}

type AgentDetailTabId = "overview" | "account" | "config";

const AGENT_DETAIL_TABS: { id: AgentDetailTabId; label: string; cursorOnly?: boolean }[] = [
  { id: "overview", label: "概览" },
  { id: "account", label: "账号", cursorOnly: true },
  { id: "config", label: "配置", cursorOnly: true },
];

function AgentDetailView(props: {
  agent: AgentSummary;
  accountStatus: CursorAccountStatus | null;
  authFlow: CursorAuthFlowStatus | null;
  cursorLoginSession: CursorLoginSessionStatus | null;
  knownConfig: KnownConfig;
  rawConfig: RawConfigDocument | null;
  rawDraft: string;
  rawPreview: RawConfigPreview | null;
  onBack: () => void;
  onAction: (
    agentId: string,
    action: "install" | "upgrade" | "uninstall",
    agentName?: string,
  ) => Promise<void>;
  onStartCursorLogin: () => Promise<void>;
  onRefreshCursorAccount: () => Promise<CursorAccountStatus>;
  onRefreshCursorLoginSession: () => Promise<CursorLoginSessionStatus>;
  onKnownConfigChange: Dispatch<SetStateAction<KnownConfig>>;
  onRawDraftChange: (value: string) => void;
  onSaveKnownConfig: () => void;
  onRefreshRawConfig: () => void;
  onPreviewRawConfig: () => void;
  onConfirmRawConfig: () => void;
}) {
  const {
    agent,
    accountStatus,
    authFlow,
    cursorLoginSession,
    knownConfig,
    rawConfig,
    rawDraft,
    rawPreview,
    onBack,
    onAction,
    onStartCursorLogin,
    onRefreshCursorAccount,
    onRefreshCursorLoginSession,
    onKnownConfigChange,
    onRawDraftChange,
    onSaveKnownConfig,
    onRefreshRawConfig,
    onPreviewRawConfig,
    onConfirmRawConfig,
  } = props;

  const detailTabs = useMemo(
    () =>
      AGENT_DETAIL_TABS.filter((tab) => !tab.cursorOnly || agent.id === "cursor"),
    [agent.id],
  );

  const [activeTab, setActiveTab] = useState<AgentDetailTabId>("overview");
  const [startingLogin, setStartingLogin] = useState(false);

  useEffect(() => {
    setActiveTab("overview");
  }, [agent.id]);

  useEffect(() => {
    if (!detailTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, detailTabs]);

  useEffect(() => {
    if (agent.id !== "cursor" || activeTab !== "account") {
      return;
    }

    void onRefreshCursorAccount();
  }, [activeTab, agent.id, onRefreshCursorAccount]);

  useEffect(() => {
    if (agent.id !== "cursor" || activeTab !== "account") {
      return;
    }

    if (accountStatus?.logged_in) {
      return;
    }

    const shouldPoll =
      cursorLoginSession?.active ||
      cursorLoginSession?.auth_url ||
      startingLogin;

    if (!shouldPoll) {
      return;
    }

    const poll = async () => {
      try {
        const [account, session] = await Promise.all([
          onRefreshCursorAccount(),
          onRefreshCursorLoginSession(),
        ]);

        if (account.logged_in) {
          setStartingLogin(false);
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
    activeTab,
    agent.id,
    cursorLoginSession?.active,
    cursorLoginSession?.auth_url,
    onRefreshCursorAccount,
    onRefreshCursorLoginSession,
    startingLogin,
  ]);

  return (
    <div className="agent-detail">
      <div className="detail-header agent-detail-header">
        <button className="ghost" onClick={onBack} type="button">
          ← 返回列表
        </button>
        <h3>{agent.name}</h3>
      </div>

      <div className="agent-detail-layout">
        {detailTabs.length > 1 ? (
          <nav className="scope-tabs" role="tablist" aria-label={`${agent.name} 详情`}>
            {detailTabs.map((tab) => (
              <button
                key={tab.id}
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? "scope-tab active" : "scope-tab"}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
        ) : null}

        <div className="detail-tab-content" role="tabpanel">
        {activeTab === "overview" ? (
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

        {activeTab === "account" && agent.id === "cursor" ? (
          <>
            <Panel title="Cursor CLI 账号状态">
              <InfoRow label="登录状态" value={accountStatus?.logged_in ? "已登录" : "未登录"} />
              <InfoRow label="邮箱" value={accountStatus?.email ?? "暂不可得"} />
              <InfoRow label="显示名" value={accountStatus?.display_name ?? "暂不可得"} />
              <p className="muted">{accountStatus?.note}</p>
              {!accountStatus?.logged_in ? (
                <div className="actions">
                  <button
                    disabled={startingLogin || cursorLoginSession?.active}
                    onClick={() => {
                      setStartingLogin(true);
                      void onStartCursorLogin().finally(() => {
                        setStartingLogin(false);
                      });
                    }}
                    type="button"
                  >
                    {startingLogin || cursorLoginSession?.active ? "正在启动登录..." : "开始登录"}
                  </button>
                </div>
              ) : null}
            </Panel>
            <Panel title="网页登录引导">
              <p className="muted">{authFlow?.summary}</p>
              {cursorLoginSession?.message ? (
                <p className="muted">{cursorLoginSession.message}</p>
              ) : null}
              {cursorLoginSession?.error ? (
                <p className="status-banner error">{cursorLoginSession.error}</p>
              ) : null}
              {cursorLoginSession?.auth_url ? (
                <div className="stack">
                  <p className="muted">授权链接（可在新标签页打开）：</p>
                  <a
                    className="external-link"
                    href={cursorLoginSession.auth_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {cursorLoginSession.auth_url}
                  </a>
                  <div className="actions">
                    <a
                      className="secondary"
                      href={cursorLoginSession.auth_url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      在新标签页打开
                    </a>
                  </div>
                </div>
              ) : null}
              {!accountStatus?.logged_in &&
              (cursorLoginSession?.active || cursorLoginSession?.auth_url || startingLogin) ? (
                <p className="muted">正在监听授权状态，完成浏览器登录后会自动更新。</p>
              ) : null}
              <ol className="steps">
                {authFlow?.steps.map((step) => (
                  <li key={step.title}>
                    <strong>{step.title}</strong>
                    <span>{step.detail}</span>
                  </li>
                ))}
              </ol>
            </Panel>
          </>
        ) : null}

        {activeTab === "config" && agent.id === "cursor" ? (
          <>
            <Panel title="Cursor CLI 配置">
              <div className="stack">
                <label className="checkbox">
                  <input
                    checked={knownConfig.disable_telemetry}
                    onChange={(event) =>
                      onKnownConfigChange((current) => ({
                        ...current,
                        disable_telemetry: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>关闭遥测</span>
                </label>

                <label className="checkbox">
                  <input
                    checked={knownConfig.auto_update}
                    onChange={(event) =>
                      onKnownConfigChange((current) => ({
                        ...current,
                        auto_update: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>允许自动更新</span>
                </label>

                <label className="field">
                  <span>发布通道</span>
                  <select
                    value={knownConfig.release_track}
                    onChange={(event) =>
                      onKnownConfigChange((current) => ({
                        ...current,
                        release_track: event.target.value,
                      }))
                    }
                  >
                    <option value="stable">stable</option>
                    <option value="latest">latest</option>
                  </select>
                </label>

                <button className="primary" onClick={onSaveKnownConfig} type="button">
                  保存已知配置
                </button>
              </div>
            </Panel>
            <Panel title="原始配置文件">
              <p className="muted">未知字段不进表单，统一在原始 JSON 中预览后保存。</p>
              <div className="code-meta">
                <span>{rawConfig?.path ?? "-"}</span>
                <button className="ghost" onClick={onRefreshRawConfig} type="button">
                  重新加载
                </button>
              </div>
              <textarea
                className="editor"
                value={rawDraft}
                onChange={(event) => onRawDraftChange(event.target.value)}
              />
              <div className="actions">
                <button className="secondary" onClick={onPreviewRawConfig} type="button">
                  预览保存
                </button>
                <button
                  className="primary"
                  disabled={!rawPreview}
                  onClick={onConfirmRawConfig}
                  type="button"
                >
                  确认写入
                </button>
              </div>
              {rawPreview ? (
                <div className="preview-box">
                  <p className="preview-title">预览内容</p>
                  <pre>{rawPreview.next_content}</pre>
                </div>
              ) : null}
            </Panel>
          </>
        ) : null}
        </div>
      </div>
    </div>
  );
}

function PluginDetailView(props: {
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
}) {
  const { plugin, detail, onBack, onAction, onDaemonAction, onRefresh } = props;

  return (
    <div className="agent-detail">
      <div className="detail-header agent-detail-header">
        <button className="ghost" onClick={onBack} type="button">
          ← 返回列表
        </button>
        <h3>{plugin.name}</h3>
      </div>

      <div className="detail-tab-content">
        <Panel title="Daemon">
          <p className="code-meta">
            <code>paseo daemon status</code>
          </p>
          <pre className="cli-output">{detail.daemon_status || "（无输出）"}</pre>
          <div className="actions">
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
        <Panel title="Providers">
          <p className="code-meta">
            <code>paseo provider ls</code>
          </p>
          <pre className="cli-output">{detail.providers_listing || "（无输出）"}</pre>
        </Panel>
        <Panel title="Listing agents">
          <p className="code-meta">
            <code>paseo ls</code>
          </p>
          <pre className="cli-output">{detail.agents_listing || "（无输出）"}</pre>
        </Panel>
        <Panel title="Pairing">
          <p className="code-meta">
            <code>paseo daemon pair --json</code>
          </p>
          <pre className="cli-output">{detail.daemon_pair_json || "（无输出）"}</pre>
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

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

const STATUS_BANNER_AUTO_DISMISS_MS: Record<MessageKind, number> = {
  success: 4000,
  info: 4000,
  error: 8000,
};

function StatusBanner(props: { kind: MessageKind; text: string; onDismiss: () => void }) {
  const { kind, text, onDismiss } = props;

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, STATUS_BANNER_AUTO_DISMISS_MS[kind]);
    return () => window.clearTimeout(timer);
  }, [kind, text, onDismiss]);

  return (
    <div className={`status-banner ${kind}`} role="status">
      <span className="status-banner__text">{text}</span>
      <button
        aria-label="关闭"
        className="status-banner__close"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "发生了未知错误";
}
