import { useEffect, useMemo, useState } from "react";
import { requestJson } from "../api";
import { CommandJobConflictError } from "../commandJobApi";
import { useCommandJob } from "../context/CommandJobContext";
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
  const { runJob, job } = useCommandJob();
  const [capability, setCapability] = useState<SkillsCliCapability | null>(null);
  const [source, setSource] = useState("");
  const [previewSkills, setPreviewSkills] = useState<SkillsCliPreviewSkill[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const jobBusy = job.active;

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

    setPreviewSkills([]);
    setSelectedSkills([]);

    try {
      await runJob(
        "/api/profile/skills/cli/preview",
        {
          method: "POST",
          body: JSON.stringify({ source: trimmed }),
        },
        {
          onDone: (success, result) => {
            if (!success || !result) {
              return;
            }
            const preview = result as SkillsCliPreviewResult;
            setPreviewSkills(preview.skills);
            setSelectedSkills(preview.skills.map((skill) => skill.name));
          },
        },
      );
    } catch (error) {
      if (!(error instanceof CommandJobConflictError)) {
        onError(error instanceof Error ? error.message : "预览失败");
      }
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

    try {
      await runJob(
        "/api/profile/skills/cli/install",
        {
          method: "POST",
          body: JSON.stringify({
            source: trimmed,
            skills: selectedSkills,
            agents: selectedAgents,
          }),
        },
        {
          onDone: (success, result) => {
            if (!success) {
              return;
            }
            const install = result as SkillsCliInstallResult | undefined;
            if (install?.message) {
              onNotify("success", install.message);
            }
            onInstalled();
            onClose();
          },
        },
      );
    } catch (error) {
      if (!(error instanceof CommandJobConflictError)) {
        onError(error instanceof Error ? error.message : "安装失败");
      }
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
            disabled={!cliReady || jobBusy}
            id="skills-install-source"
            onChange={(event) => setSource(event.target.value)}
            placeholder="例如 vercel-labs/agent-skills"
            type="text"
            value={source}
          />

          <div className="actions modal-actions">
            <button
              className="secondary"
              disabled={!cliReady || jobBusy || !source.trim()}
              onClick={() => void handlePreview()}
              type="button"
            >
              {jobBusy ? "预览中…" : "预览 skill 列表"}
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
                        disabled={jobBusy}
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
                        disabled={jobBusy}
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
          <button className="ghost" disabled={jobBusy} onClick={onClose} type="button">
            取消
          </button>
          <button
            className="primary"
            disabled={
              !cliReady || jobBusy || previewSkills.length === 0 || selectedSkills.length === 0
            }
            onClick={() => void handleInstall()}
            type="button"
          >
            {jobBusy ? "安装中…" : "安装"}
          </button>
        </div>
      </div>
    </div>
  );
}
