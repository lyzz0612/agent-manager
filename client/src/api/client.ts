import { ApiError, statusToErrorKind } from './errors';
import type {
  AgentDetail,
  AgentSummary,
  AgentType,
  CreateActionRequest,
  Machine,
  ManagementAction,
  UpdateMachineRequest,
  WsEvent,
} from './types';

export interface ApiClientOptions {
  serverUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Minimal REST client. The endpoint paths match the contract documented in
 *   openspec/changes/v1-server-control-plane/specs/server-control-plane/spec.md
 * Adjust here if the Server team finalises a different shape.
 */
export class ApiClient {
  private readonly serverUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: ApiClientOptions) {
    this.serverUrl = normalizeServerUrl(opts.serverUrl);
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  /* Auth probe — used by the login screen to validate the token. */
  async verifyToken(): Promise<void> {
    await this.request<void>('GET', '/api/auth/check');
  }

  /* Machines */

  listMachines(): Promise<{ machines: Machine[] }> {
    return this.request<{ items?: unknown[]; machines?: unknown[] }>('GET', '/api/machines').then(
      (payload) => ({
        machines: (payload.machines ?? payload.items ?? []).map(normalizeMachine),
      }),
    );
  }

  getMachine(machineId: string): Promise<Machine> {
    return this.request<{ machine?: unknown }>(
      'GET',
      `/api/machines/${encodeURIComponent(machineId)}`,
    ).then((payload) => normalizeMachine(payload.machine ?? payload));
  }

  updateMachine(machineId: string, body: UpdateMachineRequest): Promise<Machine> {
    return this.request<{ machine?: unknown }>(
      'PATCH',
      `/api/machines/${encodeURIComponent(machineId)}`,
      body,
    ).then((payload) => normalizeMachine(payload.machine ?? payload));
  }

  deleteMachine(machineId: string): Promise<void> {
    return this.request('DELETE', `/api/machines/${encodeURIComponent(machineId)}`);
  }

  /* Agents */

  listAgents(machineId: string): Promise<{ agents: AgentSummary[] }> {
    return this.request<{ items?: unknown[]; agents?: unknown[] }>(
      'GET',
      `/api/machines/${encodeURIComponent(machineId)}/agents`,
    ).then((payload) => ({
      agents: (payload.agents ?? payload.items ?? []).map(normalizeAgent),
    }));
  }

  getAgent(machineId: string, agentType: string): Promise<AgentDetail> {
    return this.listAgents(machineId).then(({ agents }) => {
      const agent = agents.find((item) => item.type === agentType);
      if (!agent) {
        throw new ApiError('notFound', `Agent ${agentType} not found`, 404);
      }
      return normalizeAgentDetail(agent);
    });
  }

  /* Actions */

  createAction(machineId: string, body: CreateActionRequest): Promise<ManagementAction> {
    return this.request(
      'POST',
      `/api/machines/${encodeURIComponent(machineId)}/actions`,
      {
        agentKind: toServerAgentKind(body.agentType),
        type: body.kind,
      },
    ).then((payload) => normalizeAction((payload as { action?: unknown }).action ?? payload));
  }

  getAction(machineId: string, actionId: string): Promise<ManagementAction> {
    void machineId;
    return this.request(
      'GET',
      `/api/actions/${encodeURIComponent(actionId)}`,
    ).then((payload) => normalizeAction((payload as { action?: unknown }).action ?? payload));
  }

  /* Internal */

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.serverUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiError('network', msg);
    }
    clearTimeout(timer);

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    let payload: unknown = undefined;
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const kind = statusToErrorKind(response.status);
      const message =
        extractErrorMessage(payload) || `HTTP ${response.status}`;
      throw new ApiError(kind, message, response.status);
    }

    return payload as T;
  }
}

export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/\/+$/, '');
}

export function buildWebSocketUrl(serverUrl: string, token: string): string {
  const normalized = normalizeServerUrl(serverUrl);
  const wsBase = normalized
    .replace(/^http:/i, 'ws:')
    .replace(/^https:/i, 'wss:');
  const params = new URLSearchParams({ token });
  return `${wsBase}/ws/client?${params.toString()}`;
}

function extractErrorMessage(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return '';
  const direct = (payload as { message?: unknown }).message;
  if (typeof direct === 'string') return direct;
  const nested = (payload as { error?: { message?: unknown } }).error?.message;
  return typeof nested === 'string' ? nested : '';
}

function normalizeMachine(raw: unknown): Machine {
  const row = asRecord(raw);
  return {
    id: stringValue(row.id),
    displayName: stringValue(row.displayName, stringValue(row.hostname, 'Unknown machine')),
    hostname: stringValue(row.hostname, ''),
    os: normalizePlatform(stringValue(row.os, stringValue(row.platform, 'unknown'))),
    arch: stringValue(row.arch, 'unknown'),
    status: normalizeMachineStatus(row.status),
    lastSeenAt: nullableString(row.lastSeenAt),
    registeredAt: stringValue(row.registeredAt, stringValue(row.createdAt, new Date(0).toISOString())),
  };
}

function normalizeAgent(raw: unknown): AgentSummary {
  const row = asRecord(raw);
  const type = normalizeAgentType(row.type ?? row.agentType ?? row.agentKind);
  return {
    type,
    displayName: stringValue(row.displayName, displayNameForAgent(type)),
    status: normalizeAgentStatus(row.status),
    version: nullableString(row.version),
    lastDetectedAt: nullableString(row.lastDetectedAt),
  };
}

function normalizeAgentDetail(raw: unknown): AgentDetail {
  const row = asRecord(raw);
  const summary = normalizeAgent(row);
  const doctor = asRecord(row.doctor);
  return {
    ...summary,
    binaryPath: nullableString(row.binaryPath ?? row.execPath),
    pathStatus:
      row.pathStatus === 'on_path' || row.onPath === true
        ? 'on_path'
        : row.pathStatus === 'off_path' || row.onPath === false
          ? 'off_path'
          : 'unknown',
    configExists: Boolean(row.configExists ?? row.configSummary),
    configSummary: nullableString(row.configSummary),
    authState:
      row.authState === 'authenticated' || row.authState === 'unauthenticated'
        ? row.authState
        : 'unknown',
    doctor:
      row.doctor && typeof row.doctor === 'object'
        ? [
            {
              id: 'latest',
              label: 'Latest doctor',
              status: normalizeDoctorStatus(doctor.status),
              message: nullableString(doctor.summary) ?? undefined,
            },
          ]
        : [],
    doctorRanAt: nullableString(doctor.createdAt),
  };
}

export function normalizeAction(raw: unknown): ManagementAction {
  const row = asRecord(raw);
  const agentType = normalizeAgentType(row.agentType ?? row.agentKind);
  return {
    id: stringValue(row.id),
    machineId: stringValue(row.machineId),
    agentType,
    kind: normalizeActionKind(row.kind ?? row.type),
    status: normalizeActionStatus(row.status),
    summary: nullableString(row.summary ?? row.resultSummary ?? row.errorMessage),
    createdAt: stringValue(row.createdAt, new Date(0).toISOString()),
    startedAt: nullableString(row.startedAt),
    finishedAt: nullableString(row.finishedAt),
  };
}

export function normalizeServerEvent(raw: unknown): WsEvent | null {
  const row = asRecord(raw);
  if (row.type === 'machine.status') {
    return {
      type: 'machine.status',
      machineId: stringValue(row.machineId),
      status: normalizeMachineStatus(row.status),
      at: stringValue(row.at, stringValue(row.lastSeenAt, new Date().toISOString())),
    };
  }
  if (row.type === 'agent.status') {
    return {
      type: 'agent.updated',
      machineId: stringValue(row.machineId),
      agent: normalizeAgentDetail(row.agent),
    };
  }
  if (row.type === 'action.status') {
    return {
      type: 'action.updated',
      action: normalizeAction(row.action),
    };
  }
  if (
    row.type === 'machine.updated' ||
    row.type === 'machine.deleted' ||
    row.type === 'agent.updated' ||
    row.type === 'action.updated'
  ) {
    return raw as WsEvent;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizePlatform(value: string): Machine['os'] {
  if (value === 'linux' || value === 'darwin' || value === 'windows') return value;
  if (value === 'win32') return 'windows';
  return 'unknown';
}

function normalizeMachineStatus(value: unknown): Machine['status'] {
  return value === 'online' || value === 'offline' || value === 'error' ? value : 'unknown';
}

function normalizeAgentStatus(value: unknown): AgentSummary['status'] {
  if (
    value === 'installed' ||
    value === 'not_installed' ||
    value === 'misconfigured' ||
    value === 'unsupported' ||
    value === 'broken'
  ) {
    return value;
  }
  return 'unknown';
}

function normalizeDoctorStatus(value: unknown): 'ok' | 'warn' | 'fail' | 'unknown' {
  if (value === 'ok') return 'ok';
  if (value === 'warning') return 'warn';
  if (value === 'error') return 'fail';
  return 'unknown';
}

function normalizeActionStatus(value: unknown): ManagementAction['status'] {
  if (
    value === 'queued' ||
    value === 'running' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'cancelled'
  ) {
    return value;
  }
  return 'failed';
}

function normalizeActionKind(value: unknown): ManagementAction['kind'] {
  if (
    value === 'detect' ||
    value === 'install' ||
    value === 'upgrade' ||
    value === 'doctor' ||
    value === 'uninstall'
  ) {
    return value;
  }
  return 'detect';
}

function normalizeAgentType(value: unknown): AgentType {
  if (value === 'cursor-cli') return 'cursor';
  if (value === 'codex-cli') return 'codex';
  return stringValue(value, 'cursor') as AgentType;
}

function toServerAgentKind(value: AgentType): string {
  if (value === 'cursor-cli') return 'cursor';
  if (value === 'codex-cli') return 'codex';
  return value;
}

function displayNameForAgent(type: AgentType): string {
  if (type === 'cursor' || type === 'cursor-cli') return 'Cursor';
  if (type === 'codex' || type === 'codex-cli') return 'Codex';
  if (type === 'claude-code') return 'Claude Code';
  return String(type);
}
