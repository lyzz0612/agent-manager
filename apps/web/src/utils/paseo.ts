export type PaseoDaemonRunningState = "running" | "stopped" | "unknown";

const DAEMON_STATE_LABELS: Record<PaseoDaemonRunningState, string> = {
  running: "运行中",
  stopped: "已停止",
  unknown: "未知",
};

export function parsePaseoDaemonStatus(raw: string): PaseoDaemonRunningState {
  const localDaemonLine = raw
    .split("\n")
    .find((line) => /^\s*local daemon\b/i.test(line));

  if (localDaemonLine) {
    const value = localDaemonLine.replace(/^\s*local daemon\s+/i, "").trim().toLowerCase();
    if (value.includes("running")) {
      return "running";
    }
    if (value.includes("stopped")) {
      return "stopped";
    }
  }

  const lower = raw.toLowerCase();
  if (/\brunning\b/.test(lower)) {
    return "running";
  }
  if (/\bstopped\b/.test(lower)) {
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
