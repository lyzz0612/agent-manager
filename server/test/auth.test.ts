import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startTestApp, TEST_TOKEN, authHeader } from "./helpers.js";
import type { AppContext } from "../src/app.js";

describe("Client API 鉴权", () => {
  let ctx: AppContext;

  beforeEach(async () => {
    ctx = await startTestApp();
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("缺少 Token 时返回 401", async () => {
    const res = await ctx.http.inject({
      method: "GET",
      url: "/api/machines",
    });
    expect(res.statusCode).toBe(401);
  });

  it("错误 Token 时返回 401", async () => {
    const res = await ctx.http.inject({
      method: "GET",
      url: "/api/machines",
      headers: { authorization: "Bearer wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("正确 Token 时返回机器列表（初始为空）", async () => {
    const res = await ctx.http.inject({
      method: "GET",
      url: "/api/machines",
      headers: authHeader(TEST_TOKEN),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [] });
  });
});
