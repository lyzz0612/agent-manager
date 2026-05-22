// Minimal HTTP client used by `agentops-runner login`. Uses Node's built-in
// `fetch` (Node 18+) so we don't pull in extra deps for v1.

import type {
  LoginRequest,
  LoginResponse,
  ProtocolErrorResponse,
} from './types.ts';
import { PROTOCOL_VERSION } from './types.ts';

export interface LoginOptions {
  serverUrl: string;
  loginToken: string;
  machineId: string;
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
  runnerVersion: string;
  displayName?: string;
  /** Override fetch for tests. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export class LoginError extends Error {
  readonly code: ProtocolErrorResponse['error'] | 'network_error';
  readonly status: number | undefined;
  constructor(
    message: string,
    code: ProtocolErrorResponse['error'] | 'network_error',
    status?: number,
  ) {
    super(message);
    this.name = 'LoginError';
    this.code = code;
    this.status = status;
  }
}

export function buildLoginUrl(serverUrl: string): string {
  const trimmed = serverUrl.replace(/\/+$/, '');
  return `${trimmed}/api/v1/runner/login`;
}

export async function login(options: LoginOptions): Promise<LoginResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const body: LoginRequest = {
    protocolVersion: PROTOCOL_VERSION,
    serverUrl: options.serverUrl,
    loginToken: options.loginToken,
    machineId: options.machineId,
    hostname: options.hostname,
    platform: options.platform,
    arch: options.arch,
    runnerVersion: options.runnerVersion,
    ...(options.displayName !== undefined
      ? { displayName: options.displayName }
      : {}),
  };

  let response: Response;
  try {
    response = await fetchImpl(buildLoginUrl(options.serverUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new LoginError(`Failed to reach server: ${message}`, 'network_error');
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new LoginError(
      `Server returned non-JSON response (status ${response.status})`,
      'internal_error',
      response.status,
    );
  }

  if (!response.ok) {
    const err = parsed as Partial<ProtocolErrorResponse> | null;
    throw new LoginError(
      err?.message ?? `Server returned ${response.status}`,
      err?.error ?? 'internal_error',
      response.status,
    );
  }

  const ok = parsed as Partial<LoginResponse> | null;
  if (!ok || ok.ok !== true || !ok.runnerToken || !ok.machineId) {
    throw new LoginError(
      'Server response is missing runner token or machine id',
      'internal_error',
      response.status,
    );
  }
  return ok as LoginResponse;
}

export function buildWebSocketUrl(
  serverUrl: string,
  runnerToken: string,
): string {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  // Drop any trailing slash, then append path.
  url.pathname = url.pathname.replace(/\/+$/, '') + '/api/v1/runner/ws';
  url.searchParams.set('token', runnerToken);
  return url.toString();
}
