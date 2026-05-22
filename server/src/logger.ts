import type { LogLevel } from "./config.js";

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

/** 轻量结构化日志器：以 JSON 形式写入 stdout / stderr，避免引入第三方依赖。 */
export function createLogger(level: LogLevel, baseFields: Record<string, unknown> = {}): Logger {
  const threshold = LEVELS[level];

  function write(target: LogLevel, message: string, fields?: Record<string, unknown>): void {
    if (LEVELS[target] < threshold) return;
    const entry = {
      ts: new Date().toISOString(),
      level: target,
      msg: message,
      ...baseFields,
      ...fields,
    };
    const line = JSON.stringify(entry);
    if (target === "error" || target === "warn") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }

  return {
    debug: (m, f) => write("debug", m, f),
    info: (m, f) => write("info", m, f),
    warn: (m, f) => write("warn", m, f),
    error: (m, f) => write("error", m, f),
    child: (fields) => createLogger(level, { ...baseFields, ...fields }),
  };
}
