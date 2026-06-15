export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    let message = `请求失败: ${response.status}`;

    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // ignore json parse failure
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function getErrorMessage(error: unknown) {
  if (isAbortError(error)) {
    return "请求已取消";
  }

  return error instanceof Error ? error.message : "发生了未知错误";
}
