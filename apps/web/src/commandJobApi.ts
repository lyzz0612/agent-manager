import type { CommandJobBusyResponse, CommandJobStartResponse } from "./commandJobTypes";

export class CommandJobConflictError extends Error {
  busy: CommandJobBusyResponse;

  constructor(busy: CommandJobBusyResponse) {
    super(busy.error);
    this.name = "CommandJobConflictError";
    this.busy = busy;
  }
}

export async function startCommandJob(
  path: string,
  init?: RequestInit,
): Promise<CommandJobStartResponse> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (response.status === 409) {
    const busy = (await response.json()) as CommandJobBusyResponse;
    throw new CommandJobConflictError(busy);
  }

  if (!response.ok) {
    let message = `请求失败: ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await response.json()) as CommandJobStartResponse;
}

export function openCommandJobStream(
  jobId: string,
  handlers: {
    onPhase: (phase: string, message: string) => void;
    onLine: (text: string) => void;
    onDone: (success: boolean, message: string, result?: unknown) => void;
    onError: (message: string) => void;
  },
): () => void {
  const source = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/stream`, {
    withCredentials: true,
  });

  source.addEventListener("phase", (event) => {
    try {
      const payload = JSON.parse(event.data) as { phase: string; message: string };
      handlers.onPhase(payload.phase, payload.message);
    } catch {
      // ignore malformed event
    }
  });

  source.addEventListener("line", (event) => {
    try {
      const payload = JSON.parse(event.data) as { text: string };
      handlers.onLine(payload.text);
    } catch {
      // ignore malformed event
    }
  });

  source.addEventListener("error", (event) => {
    if (event instanceof MessageEvent) {
      try {
        const payload = JSON.parse(event.data) as { message: string };
        handlers.onError(payload.message);
      } catch {
        // ignore malformed event
      }
    }
  });

  source.addEventListener("done", (event) => {
    try {
      const payload = JSON.parse(event.data) as {
        success: boolean;
        message: string;
        result?: unknown;
      };
      handlers.onDone(payload.success, payload.message, payload.result);
    } catch {
      handlers.onDone(false, "任务结束，但无法解析结果");
    } finally {
      source.close();
    }
  });

  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED) {
      return;
    }
  };

  return () => {
    source.close();
  };
}
