import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authHeader, startTestApp } from "./helpers.js";
import type { AppContext } from "../src/app.js";

describe("Agent 状态与 Doctor 上报", () => {
  let ctx: AppContext;

  beforeEach(async () => {
    ctx = await startTestApp();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("未上报时所有内置 Agent 显示 unknown 占位", async () => {
    const login = await ctx.http.inject({
      method: "POST",
      url: "/api/runner/login",
      headers: authHeader(),
      payload: { hostname: "host", platform: "linux", arch: "x64" },
    });
    const machineId = (login.json() as { machine: { id: string } }).machine.id;

    const res = await ctx.http.inject({
      method: "GET",
      url: `/api/machines/${machineId}/agents`,
      headers: authHeader(),
    });
    const body = res.json() as { items: Array<{ agentKind: string; status: string }> };
    expect(body.items.map((a) => a.agentKind).sort()).toEqual([
      "claude-code",
      "codex",
      "cursor",
    ]);
    for (const item of body.items) {
      expect(item.status).toBe("unknown");
    }
  });

  it("Runner 上报 detect 后状态更新并广播事件", async () => {
    const login = await ctx.http.inject({
      method: "POST",
      url: "/api/runner/login",
      headers: authHeader(),
      payload: { hostname: "host", platform: "linux", arch: "x64" },
    });
    const machineId = (login.json() as { machine: { id: string } }).machine.id;

    const received: unknown[] = [];
    ctx.events.on((evt) => received.push(evt));

    ctx.agents.applyDetect(machineId, {
      agentKind: "cursor",
      status: "installed",
      version: "1.2.3",
      execPath: "/usr/local/bin/cursor",
      onPath: true,
      configSummary: null,
    });

    const res = await ctx.http.inject({
      method: "GET",
      url: `/api/machines/${machineId}/agents`,
      headers: authHeader(),
    });
    const items = (res.json() as { items: Array<{ agentKind: string; status: string; version: string | null }> }).items;
    const cursor = items.find((a) => a.agentKind === "cursor")!;
    expect(cursor.status).toBe("installed");
    expect(cursor.version).toBe("1.2.3");

    expect(received.some((e) => (e as { type: string }).type === "agent.status")).toBe(true);
  });

  it("Doctor 上报会被串到 Agent 摘要里", async () => {
    const login = await ctx.http.inject({
      method: "POST",
      url: "/api/runner/login",
      headers: authHeader(),
      payload: { hostname: "host-d", platform: "linux", arch: "x64" },
    });
    const machineId = (login.json() as { machine: { id: string } }).machine.id;

    ctx.agents.applyDoctor(machineId, {
      agentKind: "codex",
      status: "warning",
      summary: "PATH 中没有 codex",
    });

    const res = await ctx.http.inject({
      method: "GET",
      url: `/api/machines/${machineId}/agents`,
      headers: authHeader(),
    });
    const codex = (res.json() as { items: Array<{ agentKind: string; doctor: { status: string; summary: string } | null }> }).items.find(
      (a) => a.agentKind === "codex",
    )!;
    expect(codex.doctor?.status).toBe("warning");
    expect(codex.doctor?.summary).toBe("PATH 中没有 codex");
  });
});
