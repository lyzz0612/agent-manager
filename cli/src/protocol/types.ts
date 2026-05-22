// Runner <-> Server protocol DTOs for v1.
//
// NOTE: These types are currently colocated with the Runner. If the Server is
// implemented in this monorepo a follow-up change should lift them into a
// shared `@lyzz0612/agentops-protocol` package so both sides import the same
// definitions. Tracked in the parent change summary.

export const PROTOCOL_VERSION = 1 as const;

export type AgentType = 'cursor' | 'codex' | 'claude-code';

export const BUILTIN_AGENT_TYPES: readonly AgentType[] = [
  'cursor',
  'codex',
  'claude-code',
] as const;

/** Stable status describing an Agent installation, mirroring decisions doc. */
export type AgentInstallStatus =
  | 'installed'
  | 'not_installed'
  | 'misconfigured'
  | 'unknown'
  | 'unsupported';

export type ManagementActionType =
  | 'detect'
  | 'install'
  | 'upgrade'
  | 'doctor'
  | 'uninstall';

export type ActionState =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

/** HTTP: POST /api/runner/login */
export interface LoginRequest {
  protocolVersion: typeof PROTOCOL_VERSION;
  serverUrl: string;
  loginToken: string;
  machineId: string;
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
  runnerVersion: string;
  displayName?: string;
}

export interface LoginResponse {
  ok: true;
  runnerToken: string;
  machineId: string;
  displayName?: string;
  serverTime?: string;
}

export interface ProtocolErrorResponse {
  ok: false;
  error: ProtocolErrorCode;
  message: string;
}

export type ProtocolErrorCode =
  | 'invalid_token'
  | 'machine_deleted'
  | 'protocol_version_mismatch'
  | 'rate_limited'
  | 'internal_error';

// -------- WebSocket message envelope --------

interface BaseMessage<TType extends string> {
  type: TType;
  /** Monotonic message id chosen by the sender; used to correlate replies. */
  id?: string;
}

/** Runner -> Server: initial greeting after WS open. */
export interface RunnerHello extends BaseMessage<'runner.hello'> {
  protocolVersion: typeof PROTOCOL_VERSION;
  machineId: string;
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
  runnerVersion: string;
}

/** Runner -> Server: periodic heartbeat. */
export interface RunnerHeartbeat extends BaseMessage<'runner.heartbeat'> {
  machineId: string;
  sentAt: string;
}

/** Runner -> Server: report of a detect/doctor pass or completed action. */
export interface RunnerAgentReport extends BaseMessage<'runner.agent_report'> {
  machineId: string;
  agentType: AgentType;
  report: AgentDetectReport;
  source: 'auto_detect' | 'action';
}

export interface RunnerActionResult
  extends BaseMessage<'runner.action_result'> {
  machineId: string;
  actionId: string;
  agentType: AgentType;
  actionType: ManagementActionType;
  state: Extract<ActionState, 'succeeded' | 'failed'>;
  summary: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Truncated log lines for input into the server side ActionLog. */
  logExcerpt: string[];
}

export interface RunnerLog extends BaseMessage<'runner.log'> {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
}

/** Server -> Runner: enqueue a management action. */
export interface ServerActionRequest extends BaseMessage<'server.action'> {
  actionId: string;
  agentType: AgentType;
  actionType: ManagementActionType;
  /** Hard deadline in ms; runner enforces locally as well. */
  timeoutMs?: number;
  args?: Record<string, unknown>;
}

/** Server -> Runner: ack message (optional informational). */
export interface ServerAck extends BaseMessage<'server.ack'> {
  refId: string;
}

/** Server -> Runner: instructs the runner to stop because of stale creds. */
export interface ServerAuthFailure extends BaseMessage<'server.auth_failure'> {
  reason:
    | 'invalid_token'
    | 'machine_deleted'
    | 'protocol_version_mismatch'
    | 'unknown';
  message: string;
}

export type RunnerOutbound =
  | RunnerHello
  | RunnerHeartbeat
  | RunnerAgentReport
  | RunnerActionResult
  | RunnerLog;

export type ServerInbound = ServerActionRequest | ServerAck | ServerAuthFailure;

// -------- Detect / Doctor payloads --------

export interface AgentDetectReport {
  agentType: AgentType;
  status: AgentInstallStatus;
  version?: string;
  executablePath?: string;
  onPath: boolean;
  configFiles: AgentConfigFile[];
  auth: AgentAuthState;
  doctor?: DoctorResult;
  notes?: string[];
}

export interface AgentConfigFile {
  path: string;
  exists: boolean;
  /** Redacted summary; do not include secret values. */
  summary?: string;
}

export type AgentAuthState =
  | { kind: 'unknown' }
  | { kind: 'present'; redactedHint?: string }
  | { kind: 'missing' };

export type DoctorOutcome = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  name: string;
  outcome: DoctorOutcome;
  message: string;
}

export interface DoctorResult {
  overall: DoctorOutcome;
  checks: DoctorCheck[];
}
