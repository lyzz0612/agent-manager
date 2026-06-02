import { FormEvent, useEffect, useMemo, useState } from "react";

type AppStatus = {
  app_name: string;
  version: string;
  mode: string;
};

type SessionStatus = {
  authenticated: boolean;
};

type CursorRuntimeStatus = {
  installed: boolean;
  version: string | null;
  managed_root: string;
};

type RuntimeActionResult = {
  installed: boolean;
  version: string | null;
  managed_root: string;
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

type SkillSummary = {
  name: string;
  path: string;
};

type SkillDocument = {
  name: string;
  path: string;
  content: string;
};

type MessageKind = "info" | "success" | "error";

const defaultKnownConfig: KnownConfig = {
  disable_telemetry: false,
  auto_update: true,
  release_track: "stable",
};

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

  const [appStatus, setAppStatus] = useState<AppStatus | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<CursorRuntimeStatus | null>(null);
  const [accountStatus, setAccountStatus] = useState<CursorAccountStatus | null>(null);
  const [authFlow, setAuthFlow] = useState<CursorAuthFlowStatus | null>(null);
  const [knownConfig, setKnownConfig] = useState<KnownConfig>(defaultKnownConfig);
  const [rawConfig, setRawConfig] = useState<RawConfigDocument | null>(null);
  const [rawDraft, setRawDraft] = useState("");
  const [rawPreview, setRawPreview] = useState<RawConfigPreview | null>(null);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [selectedSkillName, setSelectedSkillName] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillDocument | null>(null);
  const [skillDraft, setSkillDraft] = useState("");

  const selectedSkillSummary = useMemo(
    () => skills.find((item) => item.name === selectedSkillName) ?? null,
    [skills, selectedSkillName],
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!authenticated || !selectedSkillName) {
      return;
    }

    void loadSkill(selectedSkillName);
  }, [authenticated, selectedSkillName]);

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
    const [
      runtime,
      account,
      flow,
      nextKnownConfig,
      nextRawConfig,
      nextSkills,
    ] = await Promise.all([
      requestJson<CursorRuntimeStatus>("/api/cursor/runtime"),
      requestJson<CursorAccountStatus>("/api/cursor/account"),
      requestJson<CursorAuthFlowStatus>("/api/cursor/auth-flow"),
      requestJson<KnownConfig>("/api/profile/known-config"),
      requestJson<RawConfigDocument>("/api/profile/raw-config"),
      requestJson<SkillSummary[]>("/api/profile/skills"),
    ]);

    setRuntimeStatus(runtime);
    setAccountStatus(account);
    setAuthFlow(flow);
    setKnownConfig(nextKnownConfig);
    setRawConfig(nextRawConfig);
    setRawDraft(nextRawConfig.content);
    setRawPreview(null);
    setSkills(nextSkills);

    const nextSelected = nextSkills[0]?.name ?? "";
    setSelectedSkillName((current) =>
      current && nextSkills.some((item) => item.name === current) ? current : nextSelected,
    );

    if (!nextSelected) {
      setSelectedSkill(null);
      setSkillDraft("");
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
      await loadDashboard();
      notify("success", "管理页 Token 校验通过。");
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
  }

  async function handleRuntimeAction(path: string) {
    try {
      const result = await requestJson<RuntimeActionResult>(path, {
        method: "POST",
      });
      setRuntimeStatus({
        installed: result.installed,
        version: result.version,
        managed_root: result.managed_root,
      });
      notify("success", result.message);
    } catch (error) {
      notify("error", getErrorMessage(error));
    }
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

  async function loadSkill(name: string) {
    try {
      const result = await requestJson<SkillDocument>(
        `/api/profile/skills/${encodeURIComponent(name)}`,
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
        `/api/profile/skills/${encodeURIComponent(selectedSkill.name)}`,
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

  async function removeSkill() {
    if (!selectedSkill || !window.confirm(`确认删除 skill "${selectedSkill.name}" 吗？`)) {
      return;
    }

    try {
      const result = await requestJson<{ message: string }>(
        `/api/profile/skills/${encodeURIComponent(selectedSkill.name)}`,
        { method: "DELETE" },
      );
      notify("success", result.message);
      await loadDashboard();
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
      <main className="page login-page">
        <section className="panel hero">
          <p className="eyebrow">Cursor VPS Manager</p>
          <h1>使用固定访问 Token 进入管理页</h1>
          <p className="muted">
            生产环境需要显式设置 <code>ADMIN_TOKEN</code>，开发态默认使用
            <code>dev-agent-manager-token</code>。
          </p>
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
          {message ? <StatusBanner {...message} /> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">agent-manager</p>
          <h1>Cursor Runtime 管理控制台</h1>
          <p className="muted">
            面向单用户 VPS 的最小管理器，统一管理登录、运行时、配置与已有 skill。
          </p>
        </div>
        <button className="secondary" onClick={() => void loadDashboard()}>
          刷新状态
        </button>
      </header>

      {message ? <StatusBanner {...message} /> : null}

      <section className="grid two-columns">
        <Panel title="应用状态">
          <InfoRow label="应用名" value={appStatus?.app_name ?? "-"} />
          <InfoRow label="版本" value={appStatus?.version ?? "-"} />
          <InfoRow label="模式" value={appStatus?.mode ?? "-"} />
        </Panel>

        <Panel title="运行时状态">
          <InfoRow label="安装状态" value={runtimeStatus?.installed ? "已安装" : "未安装"} />
          <InfoRow label="当前版本" value={runtimeStatus?.version ?? "未检测到"} />
          <InfoRow label="受管目录" value={runtimeStatus?.managed_root ?? "-"} />
          <div className="actions">
            <button
              className="primary"
              onClick={() => void handleRuntimeAction("/api/cursor/runtime/install")}
            >
              安装最新版
            </button>
            <button
              className="secondary"
              onClick={() => void handleRuntimeAction("/api/cursor/runtime/upgrade")}
            >
              手动升级
            </button>
          </div>
        </Panel>
      </section>

      <section className="grid two-columns">
        <Panel title="Cursor 账号状态">
          <InfoRow label="登录状态" value={accountStatus?.logged_in ? "已登录" : "未登录"} />
          <InfoRow label="邮箱" value={accountStatus?.email ?? "暂不可得"} />
          <InfoRow label="显示名" value={accountStatus?.display_name ?? "暂不可得"} />
          <p className="muted">{accountStatus?.note}</p>
        </Panel>

        <Panel title="网页登录引导">
          <p className="muted">{authFlow?.summary}</p>
          <ol className="steps">
            {authFlow?.steps.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </section>

      <section className="grid two-columns">
        <Panel title="已知配置项表单">
          <div className="stack">
            <label className="checkbox">
              <input
                checked={knownConfig.disable_telemetry}
                onChange={(event) =>
                  setKnownConfig((current) => ({
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
                  setKnownConfig((current) => ({
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
                  setKnownConfig((current) => ({
                    ...current,
                    release_track: event.target.value,
                  }))
                }
              >
                <option value="stable">stable</option>
                <option value="latest">latest</option>
              </select>
            </label>

            <button className="primary" onClick={() => void saveKnownConfig()}>
              保存已知配置
            </button>
          </div>
        </Panel>

        <Panel title="原始配置文件">
          <p className="muted">未知字段不进表单，统一在原始 JSON 中预览后保存。</p>
          <div className="code-meta">
            <span>{rawConfig?.path ?? "-"}</span>
            <button className="ghost" onClick={() => void refreshRawConfig()}>
              重新加载
            </button>
          </div>
          <textarea
            className="editor"
            value={rawDraft}
            onChange={(event) => setRawDraft(event.target.value)}
          />
          <div className="actions">
            <button className="secondary" onClick={() => void previewRawConfig()}>
              预览保存
            </button>
            <button
              className="primary"
              disabled={!rawPreview}
              onClick={() => void confirmRawConfig()}
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
      </section>

      <section className="grid two-columns">
        <Panel title="已有 user 级 skill">
          <div className="stack">
            <label className="field">
              <span>选择 skill</span>
              <select
                value={selectedSkillName}
                onChange={(event) => setSelectedSkillName(event.target.value)}
              >
                {skills.length === 0 ? <option value="">暂无 skill</option> : null}
                {skills.map((skill) => (
                  <option key={skill.name} value={skill.name}>
                    {skill.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="skill-list">
              {skills.map((skill) => (
                <button
                  key={skill.name}
                  className={
                    skill.name === selectedSkillSummary?.name ? "skill-chip active" : "skill-chip"
                  }
                  onClick={() => setSelectedSkillName(skill.name)}
                  type="button"
                >
                  {skill.name}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="查看 / 编辑 skill">
          <div className="code-meta">
            <span>{selectedSkill?.path ?? "未选择 skill"}</span>
          </div>
          <textarea
            className="editor"
            disabled={!selectedSkill}
            value={skillDraft}
            onChange={(event) => setSkillDraft(event.target.value)}
          />
          <div className="actions">
            <button className="primary" disabled={!selectedSkill} onClick={() => void saveSkill()}>
              保存 skill
            </button>
            <button
              className="secondary"
              disabled={!selectedSkill}
              onClick={() => void removeSkill()}
            >
              删除 skill
            </button>
          </div>
        </Panel>
      </section>
    </main>
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

function StatusBanner(props: { kind: MessageKind; text: string }) {
  return <div className={`status-banner ${props.kind}`}>{props.text}</div>;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "发生了未知错误";
}
