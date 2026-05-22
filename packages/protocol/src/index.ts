export const PROTOCOL_VERSION = 1 as const;

export type AgentKind = "cursor" | "codex" | "claude-code";
export const AGENT_KINDS = ["cursor", "codex", "claude-code"] as const;

export type AgentInstallStatus =
  | "installed"
  | "not_installed"
  | "misconfigured"
  | "unknown"
  | "unsupported";

export type ActionType = "detect" | "install" | "upgrade" | "doctor" | "uninstall";
export type ActionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type MachineStatus = "online" | "offline" | "unknown" | "error";

export interface MachineDTO {
  id: string;
  displayName: string;
  hostname: string | null;
  platform: string | null;
  arch: string | null;
  status: MachineStatus;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentInstallationDTO {
  agentKind: AgentKind;
  status: AgentInstallStatus;
  version: string | null;
  execPath: string | null;
  onPath: boolean | null;
  configSummary: string | null;
  lastDetectedAt: string | null;
  doctor: {
    status: "ok" | "warning" | "error" | "unknown";
    summary: string | null;
    createdAt: string;
  } | null;
}

export interface ManagementActionDTO {
  id: string;
  machineId: string;
  agentKind: AgentKind;
  type: ActionType;
  status: ActionStatus;
  resultSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export type ClientEvent =
  | {
      type: "machine.status";
      machineId: string;
      status: MachineStatus;
      lastSeenAt: string | null;
    }
  | {
      type: "agent.status";
      machineId: string;
      agentKind: AgentKind;
      agent: AgentInstallationDTO;
    }
  | {
      type: "action.status";
      action: ManagementActionDTO;
    };

export interface RunnerLoginRequest {
  protocolVersion?: typeof PROTOCOL_VERSION;
  machineId?: string;
  hostname?: string | null;
  platform?: string | null;
  arch?: string | null;
  displayName?: string | null;
  runnerVersion?: string | null;
}

export interface RunnerLoginResponse {
  ok: true;
  runnerToken: string;
  machineId: string;
  displayName?: string;
  runner?: { id: string };
  machine?: MachineDTO;
  serverTime?: string;
}
