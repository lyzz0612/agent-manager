import { ApiClient, buildWebSocketUrl, normalizeServerUrl } from '../src/api/client';
import { ApiError } from '../src/api/errors';

describe('normalizeServerUrl', () => {
  it('trims whitespace and trailing slashes', () => {
    expect(normalizeServerUrl('  https://example.com/  ')).toBe('https://example.com');
    expect(normalizeServerUrl('https://example.com////')).toBe('https://example.com');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeServerUrl('   ')).toBe('');
  });
});

describe('buildWebSocketUrl', () => {
  it('converts http(s) to ws(s) and appends the token', () => {
    expect(buildWebSocketUrl('http://example.com/', 'tok')).toBe(
      'ws://example.com/api/ws?token=tok',
    );
    expect(buildWebSocketUrl('https://example.com', 'tok2')).toBe(
      'wss://example.com/api/ws?token=tok2',
    );
  });
});

describe('ApiClient', () => {
  it('throws ApiError(unauthorized) on 401', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(JSON.stringify({ message: 'no token' }), { status: 401 }),
    ) as unknown as typeof fetch;
    const api = new ApiClient({ serverUrl: 'https://x', token: 't', fetchImpl });
    await expect(api.listMachines()).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
    });
  });

  it('sets Authorization header and JSON body for POSTs', async () => {
    let captured: { url: string; init?: RequestInit } | null = null;
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      captured = { url, init };
      return new Response(
        JSON.stringify({
          id: 'a1',
          machineId: 'm1',
          agentType: 'claude-code',
          kind: 'detect',
          status: 'queued',
          summary: null,
          createdAt: new Date(0).toISOString(),
          startedAt: null,
          finishedAt: null,
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const api = new ApiClient({ serverUrl: 'https://x', token: 'tok', fetchImpl });
    const result = await api.createAction('m1', { agentType: 'claude-code', kind: 'detect' });
    expect(result.id).toBe('a1');
    expect(captured!.url).toBe('https://x/api/machines/m1/actions');
    const headers = captured!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['Content-Type']).toBe('application/json');
    expect(captured!.init!.body).toBe(
      JSON.stringify({ agentType: 'claude-code', kind: 'detect' }),
    );
  });

  it('treats 204 as an empty success', async () => {
    const fetchImpl = jest.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const api = new ApiClient({ serverUrl: 'https://x', token: 't', fetchImpl });
    await expect(api.deleteMachine('m1')).resolves.toBeUndefined();
  });

  it('wraps fetch failures as network errors', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;
    const api = new ApiClient({ serverUrl: 'https://x', token: 't', fetchImpl });
    await expect(api.listMachines()).rejects.toBeInstanceOf(ApiError);
    await expect(api.listMachines()).rejects.toMatchObject({ kind: 'network' });
  });
});
