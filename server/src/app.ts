import type { FastifyInstance } from "fastify";

import { loadConfig, type AppConfig } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import { openDatabase, type DB } from "./db/index.js";
import { MachineRepository } from "./db/repositories/machines.js";
import { RunnerRepository } from "./db/repositories/runners.js";
import {
  AgentInstallationRepository,
  DoctorCheckRepository,
} from "./db/repositories/agents.js";
import {
  ActionLogRepository,
  ManagementActionRepository,
} from "./db/repositories/actions.js";
import { AuditLogRepository } from "./db/repositories/audit.js";
import { RealtimeEventBus } from "./realtime/events.js";
import { AuditService } from "./services/audit.js";
import { MachineService } from "./services/machines.js";
import { AgentStateService } from "./services/agents.js";
import { ActionService } from "./services/actions.js";
import { ClientWebSocketHub } from "./ws/client.js";
import { RunnerChannelHub } from "./ws/runner.js";
import { buildApp } from "./http/app.js";

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  db: DB;
  events: RealtimeEventBus;
  audit: AuditService;
  machines: MachineService;
  agents: AgentStateService;
  actions: ActionService;
  clientHub: ClientWebSocketHub;
  runnerHub: RunnerChannelHub;
  http: FastifyInstance;
  close(): Promise<void>;
}

/**
 * 装配所有依赖。把这一步与 `start()` 拆开，便于测试在内存中启动整套服务。
 */
export async function createApp(options: {
  config?: AppConfig;
  dbPath?: string;
  requireToken?: boolean;
} = {}): Promise<AppContext> {
  const config =
    options.config ??
    loadConfig(process.env, { requireToken: options.requireToken ?? true });
  const effectiveDbPath = options.dbPath ?? config.dbPath;
  const logger = createLogger(config.logLevel, { component: "server" });

  const db = openDatabase(effectiveDbPath);

  const machineRepo = new MachineRepository(db);
  const runnerRepo = new RunnerRepository(db);
  const agentRepo = new AgentInstallationRepository(db);
  const doctorRepo = new DoctorCheckRepository(db);
  const actionRepo = new ManagementActionRepository(db);
  const logRepo = new ActionLogRepository(db);
  const auditRepo = new AuditLogRepository(db);

  const events = new RealtimeEventBus();
  const audit = new AuditService(auditRepo);
  const machines = new MachineService(machineRepo, runnerRepo, audit, events);
  const agents = new AgentStateService(agentRepo, doctorRepo, events);
  const actions = new ActionService(
    machineRepo,
    actionRepo,
    logRepo,
    audit,
    events,
    logger.child({ subsystem: "actions" }),
  );

  const clientHub = new ClientWebSocketHub(events, logger.child({ subsystem: "client-ws" }));
  clientHub.start();
  const runnerHub = new RunnerChannelHub(
    machines,
    agents,
    actions,
    logger.child({ subsystem: "runner-ws" }),
  );
  actions.setDispatcher(runnerHub.asDispatcher());

  const http = await buildApp({
    config,
    logger,
    machines,
    agents,
    actions,
    audit,
    clientHub,
    runnerHub,
  });

  return {
    config,
    logger,
    db,
    events,
    audit,
    machines,
    agents,
    actions,
    clientHub,
    runnerHub,
    http,
    async close() {
      clientHub.stop();
      await http.close();
      db.close();
    },
  };
}
