// `status` command: prints what the runner knows about itself, without
// revealing secrets. Useful for debugging local development.

import {
  ensurePaths,
  resolvePaths,
  type PathsContext,
} from '../state/paths.ts';
import { loadCredentials } from '../state/credentials.ts';
import { createDefaultRegistry } from '../adapters/registry.ts';

export interface StatusReport {
  paths: PathsContext;
  hasCredentials: boolean;
  serverUrl?: string;
  machineId?: string;
  displayName?: string;
  registeredAt?: string;
  adapters: { agentType: string; displayName: string }[];
}

export function buildStatus(paths?: PathsContext): StatusReport {
  const resolved = paths ?? resolvePaths();
  ensurePaths(resolved);
  const credentials = loadCredentials(resolved.credentialsFile);
  const registry = createDefaultRegistry();
  return {
    paths: resolved,
    hasCredentials: Boolean(credentials),
    ...(credentials?.serverUrl ? { serverUrl: credentials.serverUrl } : {}),
    ...(credentials?.machineId ? { machineId: credentials.machineId } : {}),
    ...(credentials?.displayName ? { displayName: credentials.displayName } : {}),
    ...(credentials?.registeredAt
      ? { registeredAt: credentials.registeredAt }
      : {}),
    adapters: registry
      .list()
      .map((a) => ({ agentType: a.agentType, displayName: a.displayName })),
  };
}

export function formatStatus(report: StatusReport): string {
  const lines: string[] = [];
  lines.push(`State root:   ${report.paths.root} (${report.paths.source})`);
  lines.push(`Credentials:  ${report.paths.credentialsFile}`);
  lines.push(`Logs dir:     ${report.paths.logsDir}`);
  lines.push(`Logged in:    ${report.hasCredentials ? 'yes' : 'no'}`);
  if (report.serverUrl) lines.push(`Server URL:   ${report.serverUrl}`);
  if (report.machineId) lines.push(`Machine ID:   ${report.machineId}`);
  if (report.displayName) lines.push(`Display name: ${report.displayName}`);
  if (report.registeredAt)
    lines.push(`Registered:   ${report.registeredAt}`);
  lines.push('Adapters:');
  for (const adapter of report.adapters) {
    lines.push(`  - ${adapter.agentType} (${adapter.displayName})`);
  }
  return lines.join('\n');
}
