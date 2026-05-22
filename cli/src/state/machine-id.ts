// Generate or load a persistent machineId. The id is generated locally and is
// not derived from hardware so the same physical machine can be re-bound after
// soft delete by simply removing the credentials file.

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hostname as osHostname } from 'node:os';

export interface MachineIdentity {
  machineId: string;
  hostname: string;
  platform: NodeJS.Platform;
  arch: string;
}

export function loadOrCreateMachineId(idFilePath: string): string {
  if (existsSync(idFilePath)) {
    try {
      const text = readFileSync(idFilePath, 'utf8').trim();
      if (text.length > 0) return text;
    } catch {
      // fall through and regenerate
    }
  }
  const id = `m_${randomUUID().replace(/-/g, '')}`;
  mkdirSync(dirname(idFilePath), { recursive: true });
  writeFileSync(idFilePath, id, { mode: 0o600 });
  return id;
}

export function getMachineIdentity(machineId: string): MachineIdentity {
  let host = 'unknown-host';
  try {
    host = osHostname() || host;
  } catch {
    // keep default
  }
  return {
    machineId,
    hostname: host,
    platform: process.platform,
    arch: process.arch,
  };
}
