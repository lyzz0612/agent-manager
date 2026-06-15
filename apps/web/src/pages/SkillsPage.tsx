import { useEffect, useMemo, useState } from "react";
import { isAbortError, requestJson } from "../api";
import { SkillsInstallDialog } from "../components/SkillsInstallDialog";
import { PageLoading, Panel } from "../components/ui";
import { AppRoute, buildSkillsPath } from "../routing";
import type {
  AgentSummary,
  SkillDocument,
  SkillFileSummary,
  SkillSummary,
  SkillsCliCapability,
} from "../types";

type SkillsPageProps = {
  route: Extract<AppRoute, { page: "skills" }>;
  refreshKey: number;
  navigate: (path: string) => void;
  onNotify: (kind: "info" | "success" | "error", text: string) => void;
  onError: (message: string) => void;
  onRefresh: () => void;
};

export function SkillsPage({
  route,
  refreshKey,
  navigate,
  onNotify,
  onError,
  onRefresh,
}: SkillsPageProps) {
  const { scope, folderId, fileId } = route;
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [skillFiles, setSkillFiles] = useState<SkillFileSummary[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillDocument | null>(null);
  const [skillDraft, setSkillDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [installOpen, setInstallOpen] = useState(false);
  const [cliCapability, setCliCapability] = useState<SkillsCliCapability | null>(null);

  const scopeTabs = useMemo(
    () => [
      { id: "common", label: "通用" },
      ...agents.map((agent) => ({ id: agent.id, label: agent.name })),
    ],
    [agents],
  );

  const scopedSkills = useMemo(
    () => skills.filter((skill) => skill.agent === scope),
    [scope, skills],
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      setLoading(true);
      setAgents([]);
      setSkills([]);
      setSkillFiles([]);
      setSelectedSkill(null);
      setSkillDraft("");

      try {
        const [nextAgents, nextSkills] = await Promise.all([
          requestJson<AgentSummary[]>("/api/agents", { signal }),
          requestJson<SkillSummary[]>("/api/profile/skills", { signal }),
        ]);

        if (signal.aborted) {
          return;
        }

        setAgents(nextAgents);
        setSkills(nextSkills);

        if (folderId) {
          const nextFiles = await requestJson<SkillFileSummary[]>(
            `/api/profile/skills/${encodeURIComponent(folderId)}/files`,
            { signal },
          );
          if (!signal.aborted) {
            setSkillFiles(nextFiles);
          }
        }

        if (fileId) {
          const document = await requestJson<SkillDocument>(
            `/api/profile/skills/${encodeURIComponent(fileId)}`,
            { signal },
          );
          if (!signal.aborted) {
            setSelectedSkill(document);
            setSkillDraft(document.content);
          }
        }
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          return;
        }
        onError(error instanceof Error ? error.message : "加载 Skills 失败");
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
  }, [fileId, folderId, refreshKey, onError]);

  useEffect(() => {
    if (folderId || fileId) {
      return;
    }

    void requestJson<SkillsCliCapability>("/api/profile/skills/cli/status")
      .then(setCliCapability)
      .catch(() => setCliCapability(null));
  }, [fileId, folderId, refreshKey]);

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
      onNotify("success", `已更新 skill: ${result.name}`);
    } catch (error) {
      onError(error instanceof Error ? error.message : "保存 skill 失败");
    }
  }

  if (loading) {
    return <PageLoading label="正在加载 Skills..." />;
  }

  return (
    <Panel title="Skills">
      {!folderId && !fileId ? (
        <div className="skills-toolbar">
          <button
            className="primary"
            disabled={cliCapability !== null && !cliCapability.ready}
            onClick={() => setInstallOpen(true)}
            title={cliCapability && !cliCapability.ready ? cliCapability.message : undefined}
            type="button"
          >
            安装 Skill
          </button>
          {cliCapability && !cliCapability.ready ? (
            <p className="skills-toolbar__hint">{cliCapability.message}</p>
          ) : null}
        </div>
      ) : null}

      <SkillsInstallDialog
        agents={agents}
        open={installOpen}
        onClose={() => setInstallOpen(false)}
        onError={onError}
        onInstalled={onRefresh}
        onNotify={onNotify}
      />

      <div className="skills-layout">
        <nav className="scope-tabs" role="tablist">
          {scopeTabs.map((tab) => (
            <button
              key={tab.id}
              className={scope === tab.id ? "scope-tab active" : "scope-tab"}
              onClick={() => navigate(buildSkillsPath(tab.id))}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="skills-content">
          {fileId && selectedSkill ? (
            <>
              <div className="detail-header">
                <button
                  className="ghost"
                  onClick={() => navigate(buildSkillsPath(scope, folderId))}
                  type="button"
                >
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
                <button className="primary" onClick={() => void saveSkill()} type="button">
                  保存
                </button>
              </div>
            </>
          ) : folderId ? (
            <>
              <div className="detail-header">
                <button
                  className="ghost"
                  onClick={() => navigate(buildSkillsPath(scope))}
                  type="button"
                >
                  ← 返回文件夹列表
                </button>
                <h3>
                  {scopedSkills.find((skill) => skill.id === folderId)?.name ?? folderId}
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
                      onClick={() => navigate(buildSkillsPath(scope, folderId, file.id))}
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
                    onClick={() => navigate(buildSkillsPath(scope, skill.id))}
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
  );
}
