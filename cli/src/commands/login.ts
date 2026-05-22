import { hostname as osHostname } from 'node:os';
import { join } from 'node:path';
import {
  ensurePaths,
  resolvePaths,
  type PathsContext,
} from '../state/paths.ts';
import {
  loadOrCreateMachineId,
} from '../state/machine-id.ts';
import {
  saveCredentials,
  type RunnerCredentials,
} from '../state/credentials.ts';
import { login as loginRpc, LoginError } from '../protocol/client.ts';
import { RUNNER_VERSION } from '../version.ts';
import { logger } from '../utils/logger.ts';

export interface LoginCommandOptions {
  serverUrl: string;
  loginToken: string;
  displayName?: string;
  paths?: PathsContext;
  fetchImpl?: typeof fetch;
}

export interface LoginCommandResult {
  paths: PathsContext;
  credentials: RunnerCredentials;
}

export async function runLogin(
  options: LoginCommandOptions,
): Promise<LoginCommandResult> {
  const paths = options.paths ?? resolvePaths();
  ensurePaths(paths);
  const machineId = loadOrCreateMachineId(join(paths.root, 'machine-id'));
  const hostname = safeHostname();
  logger.info(
    `Logging in to ${options.serverUrl} as machine ${machineId} (${hostname})`,
  );

  let response;
  try {
    response = await loginRpc({
      serverUrl: options.serverUrl,
      loginToken: options.loginToken,
      machineId,
      hostname,
      platform: process.platform,
      arch: process.arch,
      runnerVersion: RUNNER_VERSION,
      ...(options.displayName !== undefined
        ? { displayName: options.displayName }
        : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  } catch (err) {
    if (err instanceof LoginError) {
      const hint =
        err.code === 'invalid_token'
          ? '\nThe Server rejected the provided token. Double-check AGENTOPS_TOKEN in the deployment.'
          : err.code === 'machine_deleted'
            ? '\nThe Server reports this machineId as deleted. Remove the local credentials file and login again.'
            : err.code === 'protocol_version_mismatch'
              ? '\nServer protocol version is incompatible with this runner. Upgrade either side.'
              : '';
      throw new Error(`Login failed: ${err.message}${hint}`);
    }
    throw err;
  }

  const credentials: RunnerCredentials = {
    serverUrl: options.serverUrl,
    runnerToken: response.runnerToken,
    machineId: response.machineId,
    loginToken: options.loginToken,
    registeredAt: new Date().toISOString(),
    ...(response.displayName !== undefined
      ? { displayName: response.displayName }
      : options.displayName !== undefined
        ? { displayName: options.displayName }
        : {}),
  };
  saveCredentials(paths.credentialsFile, credentials);
  logger.info(
    `Login successful. Credentials saved to ${paths.credentialsFile}.`,
  );
  return { paths, credentials };
}

function safeHostname(): string {
  try {
    return osHostname() || 'unknown-host';
  } catch {
    return 'unknown-host';
  }
}
