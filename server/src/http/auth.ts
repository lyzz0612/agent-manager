import type { FastifyReply, FastifyRequest } from "fastify";

import type { AppConfig } from "../config.js";
import { unauthorized } from "../errors.js";

/**
 * 从请求中提取 Token：
 * 1. `Authorization: Bearer <token>`
 * 2. `?token=<token>` 查询参数（用于 WebSocket 子协议无法附带 header 的场景）
 */
export function extractToken(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, unknown> = {},
): string | null {
  const auth = headers["authorization"];
  if (typeof auth === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  if (typeof query["token"] === "string" && query["token"]) {
    return query["token"];
  }
  return null;
}

/** 常量时间比较，避免 Token 比较产生侧信道。 */
export function safeEqualToken(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Fastify preHandler：校验 Client Token。 */
export function makeAuthPreHandler(config: AppConfig) {
  return async function authPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const token = extractToken(
      request.headers as Record<string, string | string[] | undefined>,
      (request.query as Record<string, unknown>) ?? {},
    );
    if (!token || !safeEqualToken(token, config.token)) {
      throw unauthorized();
    }
  };
}
