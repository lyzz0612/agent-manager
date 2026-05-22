import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authHeader, startTestApp } from "./helpers.js";
import type { AppContext } from "../src/app.js";

describe("机器注册与软删除", () => {
  let ctx: AppContext;

  beforeEach(async () => {
    ctx = await startTestApp();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("Runner login 后机器出现在列表中", async () => {
    const login = await ctx.http.inject({
      method: "POST",
      url: "/api/runner/login",
      headers: authHeader(),
      payload: {
        hostname: "host-a",
        platform: "linux",
        arch: "x64",
        runnerVersion: "0.1.0",
      },
    });
    expect(login.statusCode).toBe(201);
    const body = login.json() as {
      machine: { id: string; displayName: string };
      runner: { id: string };
      runnerToken: string;
    };
    expect(body.machine.id).toBeTruthy();
    expect(body.runnerToken).toMatch(/^[a-f0-9]{64}$/);
    expect(body.machine.displayName).toBe("host-a");

    const list = await ctx.http.inject({
      method: "GET",
      url: "/api/machines",
      headers: authHeader(),
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { items: unknown[] }).items.length).toBe(1);
  });

  it("同 fingerprint 再次 login 复用机器", async () => {
    const first = await ctx.http.inject({
      method: "POST",
      url: "/api/runner/login",
      headers: authHeader(),
      payload: { hostname: "h", platform: "linux", arch: "x64" },
    });
    const firstBody = first.json() as { machine: { id: string }; runnerToken: string };

    const second = await ctx.http.inject({
      method: "POST",
      url: "/api/runner/login",
      headers: authHeader(),
      payload: { hostname: "h", platform: "linux", arch: "x64" },
    });
    const secondBody = second.json() as { machine: { id: string }; runnerToken: string };

    expect(secondBody.machine.id).toBe(firstBody.machine.id);
    // 旧凭据应被撤销
    expect(firstBody.runnerToken).not.toBe(secondBody.runnerToken);
  });

  it("软删除机器后旧凭据被拒绝，且重新 login 创建新机器", async () => {
    const first = await ctx.http.inject({
      method: "POST",
      url: "/api/runner/login",
      headers: authHeader(),
      payload: { hostname: "delete-me", platform: "linux", arch: "x64" },
    });
    const firstBody = first.json() as { machine: { id: string }; runnerToken: string };

    const del = await ctx.http.inject({
      method: "DELETE",
      url: `/api/machines/${firstBody.machine.id}`,
      headers: authHeader(),
    });
    expect(del.statusCode).toBe(204);

    // 列表里不再可见
    const list = await ctx.http.inject({
      method: "GET",
      url: "/api/machines",
      headers: authHeader(),
    });
    expect((list.json() as { items: unknown[] }).items).toEqual([]);

    // 旧凭据再连接：模拟 runner.resolveRunnerCredentials 调用
    expect(() => ctx.machines.resolveRunnerCredentials(firstBody.runnerToken)).toThrowError(
      /已被删除|无效/,
    );

    // 重新 login 创建新机器，id 不同
    const second = await ctx.http.inject({
      method: "POST",
      url: "/api/runner/login",
      headers: authHeader(),
      payload: { hostname: "delete-me", platform: "linux", arch: "x64" },
    });
    const secondBody = second.json() as { machine: { id: string } };
    expect(secondBody.machine.id).not.toBe(firstBody.machine.id);
  });

  it("更新显示名", async () => {
    const login = await ctx.http.inject({
      method: "POST",
      url: "/api/runner/login",
      headers: authHeader(),
      payload: { hostname: "host-rename", platform: "linux", arch: "x64" },
    });
    const machineId = (login.json() as { machine: { id: string } }).machine.id;

    const rename = await ctx.http.inject({
      method: "PATCH",
      url: `/api/machines/${machineId}`,
      headers: authHeader(),
      payload: { displayName: "工位 1" },
    });
    expect(rename.statusCode).toBe(200);
    expect((rename.json() as { machine: { displayName: string } }).machine.displayName).toBe(
      "工位 1",
    );
  });
});
