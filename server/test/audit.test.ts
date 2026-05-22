import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authHeader, startTestApp } from "./helpers.js";
import type { AppContext } from "../src/app.js";

describe("AuditLog 写入", () => {
  let ctx: AppContext;

  beforeEach(async () => {
    ctx = await startTestApp();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("Runner 注册、机器删除、动作创建都会被审计", async () => {
    const login = await ctx.http.inject({
      method: "POST",
      url: "/api/runner/login",
      headers: authHeader(),
      payload: { hostname: "audit", platform: "linux", arch: "x64" },
    });
    const machineId = (login.json() as { machine: { id: string } }).machine.id;

    ctx.actions.setDispatcher({ dispatch: () => true });
    await ctx.http.inject({
      method: "POST",
      url: `/api/machines/${machineId}/actions`,
      headers: authHeader(),
      payload: { agentKind: "cursor", type: "detect" },
    });

    await ctx.http.inject({
      method: "DELETE",
      url: `/api/machines/${machineId}`,
      headers: authHeader(),
    });

    const list = await ctx.http.inject({
      method: "GET",
      url: "/api/audit-logs",
      headers: authHeader(),
    });
    const items = (list.json() as { items: Array<{ event: string }> }).items;
    const events = items.map((i) => i.event);
    expect(events).toContain("runner.registered");
    expect(events).toContain("action.created");
    expect(events).toContain("machine.deleted");
  });
});
