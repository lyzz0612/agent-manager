export type PaseoDaemonRunningState = "running" | "stopped" | "unknown";

const DAEMON_STATE_LABELS: Record<PaseoDaemonRunningState, string> = {
  running: "已启动",
  stopped: "未启动",
  unknown: "无法检测",
};

function normalizeLocalDaemonState(raw: string): PaseoDaemonRunningState | null {
  const value = raw.trim().toLowerCase();
  if (value === "running") {
    return "running";
  }
  if (value === "stopped" || value === "stale_pid") {
    return "stopped";
  }
  if (value === "unresponsive") {
    return "unknown";
  }
  return null;
}

function parseLocalDaemonFromJson(raw: string): PaseoDaemonRunningState | null {
  try {
    const json = JSON.parse(raw) as
      | { localDaemon?: unknown }
      | Array<{ key?: unknown; value?: unknown }>;

    if (!Array.isArray(json) && typeof json.localDaemon === "string") {
      return normalizeLocalDaemonState(json.localDaemon);
    }

    if (Array.isArray(json)) {
      for (const row of json) {
        if (typeof row.key === "string" && row.key.toLowerCase() === "local daemon") {
          if (typeof row.value === "string") {
            return normalizeLocalDaemonState(row.value);
          }
        }
      }
    }
  } catch {
    // fall through
  }

  return null;
}

export function parsePaseoDaemonStatus(raw: string): PaseoDaemonRunningState {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "unknown";
  }

  const fromJson = parseLocalDaemonFromJson(trimmed);
  if (fromJson) {
    return fromJson;
  }

  for (const line of trimmed.split("\n")) {
    const normalized = line.trim();
    if (/^local daemon\b/i.test(normalized)) {
      const value = normalized
        .replace(/^local daemon\s*/i, "")
        .replace(/^[|:]\s*/, "")
        .trim();
      const state = normalizeLocalDaemonState(value);
      if (state) {
        return state;
      }
    }
  }

  const lower = trimmed.toLowerCase();
  if (/\bcannot connect\b|\bnot reachable\b|\bstart the daemon\b/.test(lower)) {
    return "stopped";
  }
  if (/\blocal daemon\b.*\brunning\b/.test(lower)) {
    return "running";
  }
  if (/\blocal daemon\b.*\b(stopped|stale_pid)\b/.test(lower)) {
    return "stopped";
  }

  return "unknown";
}

export function formatPaseoDaemonStatus(raw: string) {
  const state = parsePaseoDaemonStatus(raw);
  return {
    state,
    label: DAEMON_STATE_LABELS[state],
  };
}

export function parsePaseoPairUrl(raw: string): string | null {
  try {
    const json = JSON.parse(raw) as { url?: unknown };
    if (typeof json.url === "string" && json.url.trim()) {
      return json.url.trim();
    }
  } catch {
    // fall through
  }

  return null;
}
