// Tiny cross-platform `which` implementation. Used by detect to determine
// whether an executable is on PATH and where it resolves to.

import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export interface WhichOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

export function which(
  command: string,
  options: WhichOptions = {},
): string | undefined {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const pathEnv = env.PATH ?? env.Path ?? env.path ?? '';
  if (!pathEnv) return undefined;
  const isWin = platform === 'win32';
  const pathExt = isWin
    ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
    : [''];
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    for (const ext of pathExt) {
      const candidate = join(dir, `${command}${ext}`);
      try {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // ignore inaccessible directories
      }
    }
  }
  return undefined;
}
