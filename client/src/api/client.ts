import { ApiError, statusToErrorKind } from './errors';
import type {
  AgentDetail,
  AgentSummary,
  CreateActionRequest,
  Machine,
  ManagementAction,
  UpdateMachineRequest,
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
    await this.request<void>('GET', '/api/me');
  }

  /* Machines */

  listMachines(): Promise<{ machines: Machine[] }> {
    return this.request('GET', '/api/machines');
  }

  getMachine(machineId: string): Promise<Machine> {
    return this.request('GET', `/api/machines/${encodeURIComponent(machineId)}`);
  }

  updateMachine(machineId: string, body: UpdateMachineRequest): Promise<Machine> {
    return this.request('PATCH', `/api/machines/${encodeURIComponent(machineId)}`, body);
  }

  deleteMachine(machineId: string): Promise<void> {
    return this.request('DELETE', `/api/machines/${encodeURIComponent(machineId)}`);
  }

  /* Agents */

  listAgents(machineId: string): Promise<{ agents: AgentSummary[] }> {
    return this.request('GET', `/api/machines/${encodeURIComponent(machineId)}/agents`);
  }

  getAgent(machineId: string, agentType: string): Promise<AgentDetail> {
    return this.request(
      'GET',
      `/api/machines/${encodeURIComponent(machineId)}/agents/${encodeURIComponent(agentType)}`,
    );
  }

  /* Actions */

  createAction(machineId: string, body: CreateActionRequest): Promise<ManagementAction> {
    return this.request(
      'POST',
      `/api/machines/${encodeURIComponent(machineId)}/actions`,
      body,
    );
  }

  getAction(machineId: string, actionId: string): Promise<ManagementAction> {
    return this.request(
      'GET',
      `/api/machines/${encodeURIComponent(machineId)}/actions/${encodeURIComponent(actionId)}`,
    );
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
        (typeof payload === 'object' && payload !== null && 'message' in payload
          ? String((payload as { message?: unknown }).message ?? '')
          : '') || `HTTP ${response.status}`;
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
  return `${wsBase}/api/ws?${params.toString()}`;
}
