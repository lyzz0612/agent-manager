import { useEffect, useMemo, useState } from "react";
import { requestJson } from "../api";
import type {
  AgentSummary,
  SkillsCliCapability,
  SkillsCliInstallResult,
  SkillsCliPreviewResult,
  SkillsCliPreviewSkill,
} from "../types";

type SkillsInstallDialogProps = {
  open: boolean;
  agents: AgentSummary[];
  onClose: () => void;
  onError: (message: string) => void;
  onInstalled: () => void;
  onNotify: (kind: "info" | "success" | "error", text: string) => void;
};

type AgentOption = {
  id: string;
  label: string;
};

export function SkillsInstallDialog(props: SkillsInstallDialogProps) {
  const { open, agents, onClose, onError, onInstalled, onNotify } = props;
  const [capability, setCapability] = useState<SkillsCliCapability | null>(null);
  const [source, setSource] = useState("");
  const [previewSkills, setPreviewSkills] = useState<SkillsCliPreviewSkill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [installing, setInstalling] = useState(false);

  const agentOptions = useMemo<AgentOption[]>(
    () => [
      { id: "common", label: "通用" },
      ...agents.map((agent) => ({ id: agent.id, label: agent.name })),
    ],
    [agents],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setSource("");
    setPreviewSkills([]);
    setSelectedSkills([]);
    setSelectedAgents(agentOptions.map((option) => option.id));

    void requestJson<SkillsCliCapability>("/api/profile/skills/cli/status")
      .then(setCapability)
      .catch((error) => {
        onError(error instanceof Error ? error.message : "无法检测 Skills CLI 状态");
      });
  }, [agentOptions, onError, open]);

  if (!open) {
    return null;
  }

  async function handlePreview() {
    const trimmed = source.trim();
    if (!trimmed) {
      onError("请输入仓库或链接地址");
      return;
    }

    setPreviewing(true);
    setPreviewSkills([]);
    setSelectedSkills([]);

    try {
      const result = await requestJson<SkillsCliPreviewResult>(
        "/api/profile/skills/cli/preview",
        {
          method: "POST",
          body: JSON.stringify({ source: trimmed }),
        },
      );
      setPreviewSkills(result.skills);
      setSelectedSkills(result.skills.map((skill) => skill.name));
    } catch (error) {
      onError(error instanceof Error ? error.message : "预览失败");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleInstall() {
    const trimmed = source.trim();
    if (!trimmed) {
      onError("请输入仓库或链接地址");
      return;
    }
    if (selectedSkills.length === 0) {
      onError("请至少选择一个 skill");
      return;
    }
    if (selectedAgents.length === 0) {
      onError("请至少选择一个 agent");
      return;
    }

    setInstalling(true);
    try {
      const result = await requestJson<SkillsCliInstallResult>(
        "/api/profile/skills/cli/install",
        {
          method: "POST",
          body: JSON.stringify({
            source: trimmed,
            skills: selectedSkills,
            agents: selectedAgents,
          }),
        },
      );
      onNotify("success", result.message);
      onInstalled();
      onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : "安装失败");
    } finally {
      setInstalling(false);
    }
  }

  function toggleSkill(name: string) {
    setSelectedSkills((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );
  }

  function toggleAgent(id: string) {
    setSelectedAgents((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  const cliReady = capability?.ready ?? false;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        aria-labelledby="skills-install-title"
        aria-modal="true"
        className="modal-panel"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-header">
          <h3 id="skills-install-title">安装 Skill</h3>
          <button aria-label="关闭" className="ghost modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="modal-body">
          {capability && !cliReady ? (
            <p className="modal-hint modal-hint--warning">{capability.message}</p>
          ) : null}

          {capability?.ready ? (
            <p className="modal-hint muted">
              Node {capability.node_version} · Skills CLI {capability.skills_cli_version}
            </p>
          ) : null}

          <label className="field-label" htmlFor="skills-install-source">
            仓库或链接
          </label>
          <input
            className="text-input"
            disabled={!cliReady || previewing || installing}
            id="skills-install-source"
            onChange={(event) => setSource(event.target.value)}
            placeholder="例如 vercel-labs/agent-skills"
            type="text"
            value={source}
          />

          <div className="actions modal-actions">
            <button
              className="secondary"
              disabled={!cliReady || previewing || installing || !source.trim()}
              onClick={() => void handlePreview()}
              type="button"
            >
              {previewing ? "预览中…" : "预览 skill 列表"}
            </button>
          </div>

          {previewSkills.length > 0 ? (
            <section className="install-section">
              <h4>选择要安装的 skill</h4>
              <ul className="install-checklist">
                {previewSkills.map((skill) => (
                  <li key={skill.name}>
                    <label className="install-check">
                      <input
                        checked={selectedSkills.includes(skill.name)}
                        disabled={installing}
                        onChange={() => toggleSkill(skill.name)}
                        type="checkbox"
                      />
                      <span className="install-check__label">
                        <strong>{skill.name}</strong>
                        {skill.description ? (
                          <span className="install-check__desc">{skill.description}</span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {previewSkills.length > 0 ? (
            <section className="install-section">
              <h4>安装到 agent</h4>
              <ul className="install-checklist install-checklist--inline">
                {agentOptions.map((option) => (
                  <li key={option.id}>
                    <label className="install-check install-check--compact">
                      <input
                        checked={selectedAgents.includes(option.id)}
                        disabled={installing}
                        onChange={() => toggleAgent(option.id)}
                        type="checkbox"
                      />
                      <span>{option.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="modal-footer actions">
          <button className="ghost" disabled={installing} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="primary"
            disabled={
              !cliReady || installing || previewSkills.length === 0 || selectedSkills.length === 0
            }
            onClick={() => void handleInstall()}
            type="button"
          >
            {installing ? "安装中…" : "安装"}
          </button>
        </div>
      </div>
    </div>
  );
}
