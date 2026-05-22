import { createApp } from "./app.js";

async function main(): Promise<void> {
  const ctx = await createApp();
  const address = await ctx.http.listen({
    host: ctx.config.host,
    port: ctx.config.port,
  });
  ctx.logger.info("agentops server started", {
    address,
    dbPath: ctx.config.dbPath,
  });

  const shutdown = async (signal: string) => {
    ctx.logger.info("shutting down", { signal });
    try {
      await ctx.close();
    } catch (err) {
      ctx.logger.error("shutdown failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("启动失败:", err);
  process.exit(1);
});
