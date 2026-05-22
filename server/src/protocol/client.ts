/**
 * Client HTTP API + WebSocket 事件协议（DTO）。
 *
 * 与 Server 内部 Row 类型解耦：Row 字段使用 snake/数字时间戳，
 * 这里统一暴露 camelCase + ISO 字符串，方便前端直接使用。
 */

import type {
  ActionStatus,
  ActionType,
  AgentInstallStatus,
  AgentKind,
  DoctorStatus,
  MachineStatus,
} from "../domain/types.js";

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
  doctor: DoctorSummaryDTO | null;
}

export interface DoctorSummaryDTO {
  status: DoctorStatus;
  summary: string | null;
  createdAt: string;
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

/* ---------- Client WebSocket Events ---------- */

export interface ClientEventMachineStatus {
  type: "machine.status";
  machineId: string;
  status: MachineStatus;
  lastSeenAt: string | null;
}

export interface ClientEventAgentStatus {
  type: "agent.status";
  machineId: string;
  agentKind: AgentKind;
  agent: AgentInstallationDTO;
}

export interface ClientEventActionStatus {
  type: "action.status";
  action: ManagementActionDTO;
}

export type ClientEvent =
  | ClientEventMachineStatus
  | ClientEventAgentStatus
  | ClientEventActionStatus;
