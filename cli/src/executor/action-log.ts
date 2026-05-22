// Lightweight collector for action log lines. v1 surfaces a short summary plus
// the tail of captured lines to the server; full log files can be written
// locally for debugging.

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface ActionLogOptions {
  /** Soft cap on stored lines kept in memory. */
  maxLines?: number;
  /** Soft cap on stored chars per line. */
  maxLineLength?: number;
  /** If set, also append lines to a file under this path. */
  filePath?: string;
}

export class ActionLog {
  private readonly lines: string[] = [];
  private readonly maxLines: number;
  private readonly maxLineLength: number;
  private readonly filePath: string | undefined;
  private fileReady = false;

  constructor(options: ActionLogOptions = {}) {
    this.maxLines = options.maxLines ?? 200;
    this.maxLineLength = options.maxLineLength ?? 1_000;
    this.filePath = options.filePath;
  }

  add(line: string): void {
    const trimmed = line.length > this.maxLineLength
      ? `${line.slice(0, this.maxLineLength)}…`
      : line;
    this.lines.push(trimmed);
    if (this.lines.length > this.maxLines) {
      this.lines.shift();
    }
    if (this.filePath) this.appendFile(trimmed);
  }

  /** Returns the last `count` lines, defaulting to a small action excerpt. */
  excerpt(count = 20): string[] {
    return this.lines.slice(-count);
  }

  all(): string[] {
    return [...this.lines];
  }

  private appendFile(line: string): void {
    if (!this.filePath) return;
    try {
      if (!this.fileReady) {
        mkdirSync(dirname(this.filePath), { recursive: true });
        this.fileReady = true;
      }
      appendFileSync(this.filePath, line + '\n');
    } catch {
      // logging is best-effort
    }
  }
}

export function actionLogFilePath(
  logsDir: string,
  actionId: string,
): string {
  const safeId = actionId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(logsDir, `${safeId}.log`);
}
