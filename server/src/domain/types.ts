/**
 * 控制面共享领域类型。
 *
 * 这些类型描述 Server 内部模型，Client / Runner 协议在 protocol/ 下另外定义。
 */

export type AgentKind = "cursor" | "codex" | "claude-code";

/** v1 支持的全部 Agent 种类。新增 Agent 必须在此扩展并提供 Adapter。 */
export const AGENT_KINDS: readonly AgentKind[] = [
  "cursor",
  "codex",
  "claude-code",
];

export type MachineStatus = "online" | "offline" | "unknown" | "error";

export type AgentInstallStatus =
  | "installed"
  | "not_installed"
  | "misconfigured"
  | "unknown"
  | "unsupported";

export type DoctorStatus = "ok" | "warning" | "error" | "unknown";

export type ActionType =
  | "detect"
  | "install"
  | "upgrade"
  | "doctor"
  | "uninstall";

export type ActionStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type ActionLogLevel = "info" | "warn" | "error";

export interface MachineRow {
  id: string;
  displayName: string;
  hostname: string | null;
  platform: string | null;
  arch: string | null;
  status: MachineStatus;
  lastSeenAt: number | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface RunnerRow {
  id: string;
  machineId: string;
  tokenHash: string;
  version: string | null;
  createdAt: number;
  lastConnectedAt: number | null;
  revokedAt: number | null;
}

export interface AgentInstallationRow {
  id: string;
  machineId: string;
  agentKind: AgentKind;
  status: AgentInstallStatus;
  version: string | null;
  execPath: string | null;
  onPath: number | null;
  configSummary: string | null;
  lastDetectedAt: number | null;
  updatedAt: number;
}

export interface DoctorCheckRow {
  id: string;
  machineId: string;
  agentKind: AgentKind;
  status: DoctorStatus;
  summary: string | null;
  detailsJson: string | null;
  createdAt: number;
}

export interface ManagementActionRow {
  id: string;
  machineId: string;
  agentKind: AgentKind;
  type: ActionType;
  status: ActionStatus;
  payloadJson: string | null;
  resultSummary: string | null;
  resultJson: string | null;
  errorMessage: string | null;
  createdBy: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface ActionLogRow {
  id: number;
  actionId: string;
  level: ActionLogLevel;
  message: string;
  createdAt: number;
}

export interface AuditLogRow {
  id: number;
  actor: string;
  event: string;
  targetType: string | null;
  targetId: string | null;
  detailsJson: string | null;
  createdAt: number;
}
