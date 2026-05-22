import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  buildLoginUrl,
  buildWebSocketUrl,
  login,
  LoginError,
} from '../src/protocol/client.ts';

describe('protocol client URL helpers', () => {
  it('builds the login URL with no double slash', () => {
    assert.equal(
      buildLoginUrl('https://server.test/'),
      'https://server.test/api/v1/runner/login',
    );
    assert.equal(
      buildLoginUrl('https://server.test'),
      'https://server.test/api/v1/runner/login',
    );
  });

  it('builds a wss URL for https servers and embeds the token', () => {
    const url = buildWebSocketUrl('https://server.test', 'abc');
    assert.match(url, /^wss:\/\/server\.test\/api\/v1\/runner\/ws\?token=abc$/);
  });

  it('builds a ws URL for http servers', () => {
    const url = buildWebSocketUrl('http://localhost:3000/base', 'tok');
    assert.match(
      url,
      /^ws:\/\/localhost:3000\/base\/api\/v1\/runner\/ws\?token=tok$/,
    );
  });
});

describe('login()', () => {
  it('returns the parsed response on success', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          ok: true,
          runnerToken: 'token',
          machineId: 'm_xx',
          displayName: 'box',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const response = await login({
      serverUrl: 'https://server.test',
      loginToken: 'top',
      machineId: 'm_xx',
      hostname: 'host',
      platform: 'linux',
      arch: 'x64',
      runnerVersion: '0.0.0',
      fetchImpl: fakeFetch,
    });
    assert.equal(response.runnerToken, 'token');
    assert.equal(response.machineId, 'm_xx');
  });

  it('throws LoginError when the server returns an error payload', async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: 'invalid_token',
          message: 'bad token',
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      );
    await assert.rejects(
      () =>
        login({
          serverUrl: 'https://server.test',
          loginToken: 'wrong',
          machineId: 'm_xx',
          hostname: 'host',
          platform: 'linux',
          arch: 'x64',
          runnerVersion: '0.0.0',
          fetchImpl: fakeFetch,
        }),
      (err: unknown) =>
        err instanceof LoginError && err.code === 'invalid_token',
    );
  });

  it('wraps fetch network errors', async () => {
    const fakeFetch: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    await assert.rejects(
      () =>
        login({
          serverUrl: 'https://server.test',
          loginToken: 'top',
          machineId: 'm_xx',
          hostname: 'host',
          platform: 'linux',
          arch: 'x64',
          runnerVersion: '0.0.0',
          fetchImpl: fakeFetch,
        }),
      (err: unknown) =>
        err instanceof LoginError && err.code === 'network_error',
    );
  });
});
