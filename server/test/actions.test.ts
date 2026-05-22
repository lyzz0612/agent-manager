import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authHeader, startTestApp } from "./helpers.js";
import type { AppContext } from "../src/app.js";
import type { ManagementActionRow } from "../src/domain/types.js";

/**
 * 用一个 stub dispatcher 接管派发，避免依赖 WebSocket 连接。
 * 测试关心的是 ActionService 调度逻辑，不是 Runner 真实连接。
 */
function installStubDispatcher(ctx: AppContext) {
  const dispatched: ManagementActionRow[] = [];
  ctx.actions.setDispatcher({
    dispatch(action) {
      dispatched.push(action);
      return true;
    },
  });
  return dispatched;
}

async function login(ctx: AppContext, hostname: string) {
  const res = await ctx.http.inject({
    method: "POST",
    url: "/api/runner/login",
    headers: authHeader(),
    payload: { hostname, platform: "linux", arch: "x64" },
  });
  return res.json() as { machine: { id: string }; runnerToken: string };
}

describe("管理动作调度", () => {
  let ctx: AppContext;

  beforeEach(async () => {
    ctx = await startTestApp();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("同一机器同一 Agent 串行：第二个动作进入 queued", async () => {
    const dispatched = installStubDispatcher(ctx);
    const { machine } = await login(ctx, "h1");

    const first = await ctx.http.inject({
      method: "POST",
      url: `/api/machines/${machine.id}/actions`,
      headers: authHeader(),
      payload: { agentKind: "cursor", type: "detect" },
    });
    expect(first.statusCode).toBe(201);
    const firstAction = (first.json() as { action: { id: string; status: string } }).action;
    expect(firstAction.status).toBe("running");

    const second = await ctx.http.inject({
      method: "POST",
      url: `/api/machines/${machine.id}/actions`,
      headers: authHeader(),
      payload: { agentKind: "cursor", type: "doctor" },
    });
    const secondAction = (second.json() as { action: { id: string; status: string } }).action;
    expect(secondAction.status).toBe("queued");

    expect(dispatched.map((a) => a.id)).toEqual([firstAction.id]);
  });

  it("同一机器不同 Agent 并行", async () => {
    const dispatched = installStubDispatcher(ctx);
    const { machine } = await login(ctx, "h2");

    const a = await ctx.http.inject({
      method: "POST",
      url: `/api/machines/${machine.id}/actions`,
      headers: authHeader(),
      payload: { agentKind: "cursor", type: "detect" },
    });
    const b = await ctx.http.inject({
      method: "POST",
      url: `/api/machines/${machine.id}/actions`,
      headers: authHeader(),
      payload: { agentKind: "codex", type: "detect" },
    });
    expect((a.json() as { action: { status: string } }).action.status).toBe("running");
    expect((b.json() as { action: { status: string } }).action.status).toBe("running");
    expect(dispatched.length).toBe(2);
  });

  it("动作完成后 queued 中的下一个自动 running", async () => {
    const dispatched = installStubDispatcher(ctx);
    const { machine } = await login(ctx, "h3");

    const first = await ctx.http.inject({
      method: "POST",
      url: `/api/machines/${machine.id}/actions`,
      headers: authHeader(),
      payload: { agentKind: "cursor", type: "detect" },
    });
    const second = await ctx.http.inject({
      method: "POST",
      url: `/api/machines/${machine.id}/actions`,
      headers: authHeader(),
      payload: { agentKind: "cursor", type: "doctor" },
    });
    const firstId = (first.json() as { action: { id: string } }).action.id;
    const secondId = (second.json() as { action: { id: string } }).action.id;

    ctx.actions.complete(firstId, { status: "succeeded", summary: "ok" });

    const updated = ctx.actions.getById(secondId);
    expect(updated?.status).toBe("running");
    expect(dispatched.map((a) => a.id)).toEqual([firstId, secondId]);
  });

  it("没有 Runner 在线时动作立即失败", async () => {
    // 不安装 stub dispatcher：使用真实 runnerHub，但没有 WS 连接 = 不在线
    const { machine } = await login(ctx, "h-offline");
    const res = await ctx.http.inject({
      method: "POST",
      url: `/api/machines/${machine.id}/actions`,
      headers: authHeader(),
      payload: { agentKind: "cursor", type: "detect" },
    });
    const id = (res.json() as { action: { id: string } }).action.id;
    const row = ctx.actions.getById(id);
    expect(row?.status).toBe("failed");
    expect(row?.errorMessage).toBe("machine_not_online");
  });
});
