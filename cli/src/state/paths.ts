// Resolve the Runner local state directory.
//
// Resolution order:
//   1. Explicit override via `AGENTOPS_HOME`.
//   2. Development mode (`AGENTOPS_DEV=1` or running from a git checkout that
//      contains an `openspec/` folder): `<repo>/.agentops-dev`.
//   3. Fallback: `<os.homedir>/.agentops`.
//
// In dev mode we keep all state inside the repository so contributors do not
// accidentally pollute the home directory while iterating.

import { homedir } from 'node:os';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface PathsContext {
  /** Root of the runner state directory. */
  root: string;
  /** Where credentials and persistent identity are stored. */
  credentialsFile: string;
  /** Where per-action logs are accumulated locally. */
  logsDir: string;
  /** Cache scratch space for adapters. */
  cacheDir: string;
  /** Resolved source of the root (debug aid). */
  source: 'AGENTOPS_HOME' | 'dev-default' | 'home-default';
}

function findRepoRoot(startDir: string): string | undefined {
  let cursor = startDir;
  // Walk up at most a few levels to avoid pathological lookups.
  for (let i = 0; i < 8; i += 1) {
    if (
      existsSync(join(cursor, 'openspec')) ||
      existsSync(join(cursor, '.git'))
    ) {
      return cursor;
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return undefined;
}

function isDirSafe(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function resolvePaths(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): PathsContext {
  let root: string;
  let source: PathsContext['source'];

  const explicit = env.AGENTOPS_HOME?.trim();
  if (explicit && explicit.length > 0) {
    root = resolve(explicit);
    source = 'AGENTOPS_HOME';
  } else {
    const devForced = env.AGENTOPS_DEV === '1';
    let scriptDir: string | undefined;
    try {
      scriptDir = dirname(fileURLToPath(import.meta.url));
    } catch {
      scriptDir = undefined;
    }
    const repoRoot =
      findRepoRoot(cwd) ?? (scriptDir ? findRepoRoot(scriptDir) : undefined);
    if (devForced && repoRoot) {
      root = join(repoRoot, '.agentops-dev');
      source = 'dev-default';
    } else if (!devForced && repoRoot && isDirSafe(join(repoRoot, 'openspec'))) {
      root = join(repoRoot, '.agentops-dev');
      source = 'dev-default';
    } else {
      root = join(homedir(), '.agentops');
      source = 'home-default';
    }
  }

  return {
    root,
    credentialsFile: join(root, 'credentials.json'),
    logsDir: join(root, 'logs'),
    cacheDir: join(root, 'cache'),
    source,
  };
}

export function ensurePaths(paths: PathsContext): void {
  mkdirSync(paths.root, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(paths.cacheDir, { recursive: true });
}
