import type { RuntimeActionResult, SkillsCliInstallResult, SkillsCliPreviewResult } from "./types";

export type CommandJobStartResponse = {
  job_id: string;
  kind: string;
  label: string;
};

export type CommandJobBusyResponse = {
  error: string;
  active_job_id: string;
  kind: string;
  label: string;
};

export type CommandJobPhaseEvent = {
  phase: string;
  message: string;
};

export type CommandJobLineEvent = {
  stream: "stdout" | "stderr";
  text: string;
};

export type CommandJobDoneEvent = {
  success: boolean;
  message: string;
  result?: RuntimeActionResult | SkillsCliInstallResult | SkillsCliPreviewResult | { message: string };
};

export type CommandJobState = {
  jobId: string | null;
  label: string;
  phase: string;
  message: string;
  lines: string[];
  active: boolean;
};

export const initialCommandJobState: CommandJobState = {
  jobId: null,
  label: "",
  phase: "idle",
  message: "",
  lines: [],
  active: false,
};
