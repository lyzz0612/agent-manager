import path from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  token: string;
  host: string;
  port: number;
  dbPath: string;
  logLevel: LogLevel;
}

const DEFAULT_PORT = 4000;

function isLogLevel(value: string): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

/**
 * 从进程环境读取配置。
 *
 * Token 是部署侧必须显式配置的值；为了支持本地测试，传入 `requireToken=false`
 * 可以在 Token 缺失时回退到随机字符串。生产环境调用方应保持默认行为。
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: { requireToken?: boolean } = {},
): AppConfig {
  const requireToken = options.requireToken ?? true;

  const token = env.AGENTOPS_TOKEN?.trim();
  if (!token) {
    if (requireToken) {
      throw new Error(
        "AGENTOPS_TOKEN 未设置：请通过环境变量配置部署 Token。",
      );
    }
  }

  const portRaw = env.AGENTOPS_PORT?.trim();
  let port = DEFAULT_PORT;
  if (portRaw) {
    const parsed = Number.parseInt(portRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
      port = parsed;
    } else {
      throw new Error(`AGENTOPS_PORT 取值非法: ${portRaw}`);
    }
  }

  const logLevelRaw = (env.AGENTOPS_LOG_LEVEL ?? "info").trim().toLowerCase();
  if (!isLogLevel(logLevelRaw)) {
    throw new Error(`AGENTOPS_LOG_LEVEL 取值非法: ${logLevelRaw}`);
  }

  const dbPathRaw = env.AGENTOPS_DB_PATH?.trim() || "./data/agentops.db";
  const dbPath = dbPathRaw === ":memory:" ? ":memory:" : path.resolve(dbPathRaw);

  return {
    token: token ?? "dev-token-not-for-production",
    host: env.AGENTOPS_HOST?.trim() || "0.0.0.0",
    port,
    dbPath,
    logLevel: logLevelRaw,
  };
}
