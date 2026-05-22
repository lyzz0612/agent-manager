// Minimal logger so the runner avoids pulling in third-party deps for v1.
// Output is plain text on stderr so stdout stays clean for future structured
// command output.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function envLevel(): LogLevel {
  const raw = (process.env.AGENTOPS_LOG_LEVEL ?? 'info').toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

let currentLevel: LogLevel = envLevel();

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function emit(level: LogLevel, parts: unknown[]): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel]) return;
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  // eslint-disable-next-line no-console
  console.error(prefix, ...parts);
}

export const logger = {
  debug: (...p: unknown[]) => emit('debug', p),
  info: (...p: unknown[]) => emit('info', p),
  warn: (...p: unknown[]) => emit('warn', p),
  error: (...p: unknown[]) => emit('error', p),
};
