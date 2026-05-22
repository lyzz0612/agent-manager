import Fastify, { type FastifyInstance } from "fastify";
import websocketPlugin from "@fastify/websocket";
import { z } from "zod";

import type { AppConfig } from "../config.js";
import { ApiError } from "../errors.js";
import { AGENT_KINDS } from "../domain/types.js";
import type { Logger } from "../logger.js";
import type { MachineService } from "../services/machines.js";
import type { AgentStateService } from "../services/agents.js";
import type { ActionService } from "../services/actions.js";
import type { AuditService } from "../services/audit.js";
import type { ClientWebSocketHub } from "../ws/client.js";
import type { RunnerChannelHub } from "../ws/runner.js";
import { extractToken, safeEqualToken, makeAuthPreHandler } from "./auth.js";
import { actionRowToDTO } from "../dto.js";

export interface AppDeps {
  config: AppConfig;
  logger: Logger;
  machines: MachineService;
  agents: AgentStateService;
  actions: ActionService;
  audit: AuditService;
  clientHub: ClientWebSocketHub;
  runnerHub: RunnerChannelHub;
}

/**
 * 构造 Fastify 应用。
 *
 * 路由分三组：
 * 1. Client HTTP API（`/api/...`）：需要 Bearer Token。
 * 2. Client WebSocket（`/ws/client`）：握手时校验 Token。
 * 3. Runner Channel（`/ws/runner`）：握手时校验 Runner 凭据。
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, logger, machines, agents, actions, audit, clientHub, runnerHub } = deps;

  const app = Fastify({
    logger: false,
    bodyLimit: 1 * 1024 * 1024,
  });

  await app.register(websocketPlugin);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.status).send({
        error: { code: error.code, message: error.message, details: error.details ?? null },
      });
      return;
    }
    logger.error("unhandled error", {
      url: request.url,
      method: request.method,
      message: error.message,
      stack: error.stack,
    });
    reply.status(500).send({
      error: { code: "internal", message: "服务器内部错误" },
    });
  });

  app.get("/healthz", async () => ({ ok: true }));

  /* ---------- Client HTTP API ---------- */

  const authPre = makeAuthPreHandler(config);

  app.get("/api/auth/check", { preHandler: authPre }, async () => ({
    ok: true,
    supportedAgents: AGENT_KINDS,
  }));

  app.get("/api/machines", { preHandler: authPre }, async () => {
    const rows = machines.listVisible();
    return { items: rows.map(machines.toDTO) };
  });

  app.get<{ Params: { machineId: string } }>(
    "/api/machines/:machineId",
    { preHandler: authPre },
    async (req) => {
      const machine = machines.getVisible(req.params.machineId);
      const agentsList = agents.listForMachine(machine.id);
      return { machine: machines.toDTO(machine), agents: agentsList };
    },
  );

  const renameSchema = z.object({ displayName: z.string().min(1).max(80) });
  app.patch<{ Params: { machineId: string } }>(
    "/api/machines/:machineId",
    { preHandler: authPre },
    async (req) => {
      const body = renameSchema.parse(req.body);
      const updated = machines.rename(req.params.machineId, body.displayName, "client");
      return { machine: machines.toDTO(updated) };
    },
  );

  app.delete<{ Params: { machineId: string } }>(
    "/api/machines/:machineId",
    { preHandler: authPre },
    async (req, reply) => {
      machines.softDelete(req.params.machineId, "client");
      reply.status(204).send();
    },
  );

  app.get<{ Params: { machineId: string } }>(
    "/api/machines/:machineId/agents",
    { preHandler: authPre },
    async (req) => {
      machines.getVisible(req.params.machineId); // ensure exists
      return { items: agents.listForMachine(req.params.machineId) };
    },
  );

  const actionTypeSchema = z.enum(["detect", "install", "upgrade", "doctor", "uninstall"]);
  const agentKindSchema = z.enum(AGENT_KINDS as unknown as [string, ...string[]]);
  const createActionSchema = z.object({
    agentKind: agentKindSchema,
    type: actionTypeSchema,
    payload: z.record(z.unknown()).optional(),
  });

  app.post<{ Params: { machineId: string } }>(
    "/api/machines/:machineId/actions",
    { preHandler: authPre },
    async (req, reply) => {
      const body = createActionSchema.parse(req.body);
      const row = actions.create({
        machineId: req.params.machineId,
        agentKind: body.agentKind as (typeof AGENT_KINDS)[number],
        type: body.type,
        payload: body.payload ?? null,
        actor: "client",
      });
      reply.status(201);
      return { action: actionRowToDTO(row) };
    },
  );

  app.get<{ Params: { machineId: string } }>(
    "/api/machines/:machineId/actions",
    { preHandler: authPre },
    async (req) => {
      machines.getVisible(req.params.machineId);
      const list = actions.listForMachine(req.params.machineId);
      return { items: list.map(actionRowToDTO) };
    },
  );

  app.get<{ Params: { actionId: string } }>(
    "/api/actions/:actionId",
    { preHandler: authPre },
    async (req) => {
      const action = actions.getById(req.params.actionId);
      if (!action) {
        const err = new ApiError("not_found", 404, "动作不存在");
        throw err;
      }
      const logs = actions.listLogs(action.id, 200);
      return { action: actionRowToDTO(action), logs };
    },
  );

  app.get("/api/audit-logs", { preHandler: authPre }, async (req) => {
    const limitRaw = (req.query as Record<string, string>).limit;
    const limit = limitRaw ? Math.min(500, Math.max(1, Number.parseInt(limitRaw, 10) || 100)) : 100;
    return { items: audit.list(limit) };
  });

  /* ---------- Runner login ---------- */

  const loginSchema = z.object({
    hostname: z.string().nullable().optional(),
    platform: z.string().nullable().optional(),
    arch: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
    runnerVersion: z.string().nullable().optional(),
  });

  app.post("/api/runner/login", { preHandler: authPre }, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const result = machines.registerRunner({
      hostname: body.hostname ?? null,
      platform: body.platform ?? null,
      arch: body.arch ?? null,
      displayName: body.displayName ?? null,
      runnerVersion: body.runnerVersion ?? null,
    });
    reply.status(201);
    return {
      machine: machines.toDTO(result.machine),
      runner: { id: result.runner.id },
      runnerToken: result.runnerToken,
    };
  });

  /* ---------- Client WebSocket ---------- */

  app.get("/ws/client", { websocket: true }, (socket, request) => {
    const token = extractToken(
      request.headers as Record<string, string | string[] | undefined>,
      (request.query as Record<string, unknown>) ?? {},
    );
    if (!token || !safeEqualToken(token, config.token)) {
      socket.send(
        JSON.stringify({ type: "error", code: "unauthorized", message: "鉴权失败" }),
      );
      socket.close(4401, "unauthorized");
      return;
    }
    clientHub.attach(socket);
  });

  /* ---------- Runner Channel ---------- */

  app.get("/ws/runner", { websocket: true }, (socket, request) => {
    const headers = request.headers as Record<string, string | string[] | undefined>;
    const query = (request.query as Record<string, unknown>) ?? {};
    const runnerToken =
      typeof headers["x-runner-token"] === "string"
        ? (headers["x-runner-token"] as string)
        : typeof query["runnerToken"] === "string"
          ? (query["runnerToken"] as string)
          : null;
    if (!runnerToken) {
      socket.send(
        JSON.stringify({
          v: 1,
          type: "server.error",
          code: "unauthorized",
          message: "缺少 Runner 凭据",
        }),
      );
      socket.close(4401, "unauthorized");
      return;
    }
    runnerHub.attach(socket, runnerToken);
  });

  return app;
}
