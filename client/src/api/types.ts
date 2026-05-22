/**
 * Shared API and domain types for the Client.
 *
 * NOTE: These types mirror the contract described in
 *   openspec/changes/v1-server-control-plane/specs/server-control-plane/spec.md
 * and are intentionally kept self-contained inside the client package so the
 * client can be built independently while server / shared packages are still
 * in design. Once a shared package exists at the workspace root the client
 * should switch to importing those types.
 */

export type MachineStatus = 'online' | 'offline' | 'unknown' | 'error';

export type PlatformOs = 'linux' | 'darwin' | 'windows' | 'unknown';

export interface Machine {
  id: string;
  displayName: string;
  hostname: string;
  os: PlatformOs;
  arch: string;
  status: MachineStatus;
  lastSeenAt: string | null;
  registeredAt: string;
}

export type AgentInstallStatus =
  | 'installed'
  | 'not_installed'
  | 'unknown'
  | 'misconfigured'
  | 'unsupported'
  | 'broken';

export type AgentType =
  | 'cursor'
  | 'codex'
  | 'claude-code'
  | 'codex-cli'
  | 'cursor-cli'
  | 'gemini-cli'
  | string;

export interface AgentSummary {
  type: AgentType;
  displayName: string;
  status: AgentInstallStatus;
  version: string | null;
  lastDetectedAt: string | null;
}

export interface DoctorCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail' | 'unknown';
  message?: string;
}

export interface AgentDetail extends AgentSummary {
  binaryPath: string | null;
  pathStatus: 'on_path' | 'off_path' | 'unknown';
  configExists: boolean;
  configSummary: string | null;
  authState: 'authenticated' | 'unauthenticated' | 'unknown';
  doctor: DoctorCheck[];
  doctorRanAt: string | null;
}

export type ActionKind =
  | 'detect'
  | 'install'
  | 'upgrade'
  | 'doctor'
  | 'uninstall';

export type ActionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface ManagementAction {
  id: string;
  machineId: string;
  agentType: AgentType;
  kind: ActionKind;
  status: ActionStatus;
  summary: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface CreateActionRequest {
  agentType: AgentType;
  kind: ActionKind;
}

export interface UpdateMachineRequest {
  displayName?: string;
}

/* WebSocket event envelope */

export type WsEvent =
  | { type: 'machine.status'; machineId: string; status: MachineStatus; at: string }
  | { type: 'machine.updated'; machine: Machine }
  | { type: 'machine.deleted'; machineId: string }
  | { type: 'agent.updated'; machineId: string; agent: AgentSummary | AgentDetail }
  | { type: 'action.updated'; action: ManagementAction };

/* Errors returned from the REST layer. */

export type ApiErrorKind =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'server'
  | 'unknown';

export interface ApiErrorShape {
  kind: ApiErrorKind;
  status?: number;
  message: string;
}
