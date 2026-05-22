/**
 * Runner Channel 协议。
 *
 * Runner 主动通过 WebSocket 连接 Server，使用 JSON 文本帧。
 * 所有消息携带 `v` 版本字段方便后续兼容。
 */

import type {
  ActionStatus,
  ActionType,
  AgentInstallStatus,
  AgentKind,
  DoctorStatus,
} from "../domain/types.js";

export const RUNNER_PROTOCOL_VERSION = 1 as const;

export interface AgentDetectReport {
  agentKind: AgentKind;
  status: AgentInstallStatus;
  version: string | null;
  execPath: string | null;
  onPath: boolean;
  configSummary: string | null;
}

export interface DoctorReport {
  agentKind: AgentKind;
  status: DoctorStatus;
  summary: string | null;
  details?: Record<string, unknown>;
}

/* ---------- Runner -> Server ---------- */

export interface RunnerHelloMessage {
  v: typeof RUNNER_PROTOCOL_VERSION;
  type: "runner.hello";
  runnerId: string;
  machineId: string;
  runnerVersion: string | null;
  machineInfo?: {
    hostname?: string | null;
    platform?: string | null;
    arch?: string | null;
  };
}

export interface RunnerHeartbeatMessage {
  v: typeof RUNNER_PROTOCOL_VERSION;
  type: "runner.heartbeat";
  ts: number;
}

export interface RunnerDetectReportMessage {
  v: typeof RUNNER_PROTOCOL_VERSION;
  type: "runner.report.detect";
  reports: AgentDetectReport[];
  actionId?: string;
}

export interface RunnerDoctorReportMessage {
  v: typeof RUNNER_PROTOCOL_VERSION;
  type: "runner.report.doctor";
  report: DoctorReport;
  actionId?: string;
}

export interface RunnerActionResultMessage {
  v: typeof RUNNER_PROTOCOL_VERSION;
  type: "runner.report.action_result";
  actionId: string;
  status: Extract<ActionStatus, "succeeded" | "failed" | "cancelled">;
  summary: string | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  logs?: Array<{ level: "info" | "warn" | "error"; message: string }>;
  /**
   * detect/install/upgrade/uninstall 完成后 Runner 通常会附带最新的 detect 结果，
   * 避免再发起一轮 detect。
   */
  detect?: AgentDetectReport;
}

export type RunnerInboundMessage =
  | RunnerHelloMessage
  | RunnerHeartbeatMessage
  | RunnerDetectReportMessage
  | RunnerDoctorReportMessage
  | RunnerActionResultMessage;

/* ---------- Server -> Runner ---------- */

export interface ServerWelcomeMessage {
  v: typeof RUNNER_PROTOCOL_VERSION;
  type: "server.welcome";
  machineId: string;
  /** 服务端时间戳，方便 Runner 校时 / 计算偏移。 */
  serverTime: number;
}

export interface ServerActionCommand {
  v: typeof RUNNER_PROTOCOL_VERSION;
  type: "server.command.action";
  actionId: string;
  agentKind: AgentKind;
  actionType: ActionType;
  payload: Record<string, unknown> | null;
}

export interface ServerErrorMessage {
  v: typeof RUNNER_PROTOCOL_VERSION;
  type: "server.error";
  code:
    | "unauthorized"
    | "machine_deleted"
    | "machine_not_found"
    | "bad_message"
    | "internal";
  message: string;
}

export type ServerOutboundMessage =
  | ServerWelcomeMessage
  | ServerActionCommand
  | ServerErrorMessage;
