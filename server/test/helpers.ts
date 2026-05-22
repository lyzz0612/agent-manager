import { createApp, type AppContext } from "../src/app.js";

export const TEST_TOKEN = "test-token-12345";

export async function startTestApp(): Promise<AppContext> {
  const ctx = await createApp({
    config: {
      token: TEST_TOKEN,
      host: "127.0.0.1",
      port: 0,
      dbPath: ":memory:",
      logLevel: "error",
    },
    dbPath: ":memory:",
    requireToken: false,
  });
  await ctx.http.ready();
  return ctx;
}

export function authHeader(token = TEST_TOKEN) {
  return { authorization: `Bearer ${token}` };
}
