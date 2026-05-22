import { randomUUID } from "node:crypto";

import type { DB } from "../index.js";
import type {
  ActionLogLevel,
  ActionLogRow,
  ActionStatus,
  ActionType,
  AgentKind,
  ManagementActionRow,
} from "../../domain/types.js";

interface ActionInsert {
  machineId: string;
  agentKind: AgentKind;
  type: ActionType;
  payload: Record<string, unknown> | null;
  createdBy: string | null;
  /** 默认 queued。 */
  status?: ActionStatus;
}

export class ManagementActionRepository {
  constructor(private readonly db: DB) {}

  insert(input: ActionInsert): ManagementActionRow {
    const id = randomUUID();
    const now = Date.now();
    const status: ActionStatus = input.status ?? "queued";
    const payloadJson = input.payload ? JSON.stringify(input.payload) : null;
    this.db
      .prepare(
        `INSERT INTO management_actions (
            id, machine_id, agent_kind, type, status, payload_json,
            result_summary, result_json, error_message,
            created_by, created_at, started_at, finished_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, NULL, NULL)`,
      )
      .run(
        id,
        input.machineId,
        input.agentKind,
        input.type,
        status,
        payloadJson,
        input.createdBy,
        now,
      );
    const row = this.getById(id);
    if (!row) throw new Error("insert 后未能读取到 ManagementAction 记录");
    return row;
  }

  getById(id: string): ManagementActionRow | null {
    const row = this.db
      .prepare<unknown[], DBRow>(
        `SELECT * FROM management_actions WHERE id = ?`,
      )
      .get(id);
    return row ? toRow(row) : null;
  }

  /** 同机器同 Agent 是否存在“占用调度”的动作（queued 或 running）。 */
  hasInflightForAgent(machineId: string, agentKind: AgentKind): boolean {
    const row = this.db
      .prepare<unknown[], { c: number }>(
        `SELECT COUNT(*) AS c FROM management_actions
           WHERE machine_id = ? AND agent_kind = ? AND status IN ('queued','running')`,
      )
      .get(machineId, agentKind);
    return (row?.c ?? 0) > 0;
  }

  /** 查找指定机器+Agent 下最早的 queued 动作。 */
  findNextQueuedForAgent(
    machineId: string,
    agentKind: AgentKind,
  ): ManagementActionRow | null {
    const row = this.db
      .prepare<unknown[], DBRow>(
        `SELECT * FROM management_actions
           WHERE machine_id = ? AND agent_kind = ? AND status = 'queued'
           ORDER BY created_at ASC, id ASC LIMIT 1`,
      )
      .get(machineId, agentKind);
    return row ? toRow(row) : null;
  }

  listForMachine(machineId: string, limit = 50): ManagementActionRow[] {
    return this.db
      .prepare<unknown[], DBRow>(
        `SELECT * FROM management_actions WHERE machine_id = ?
           ORDER BY created_at DESC LIMIT ?`,
      )
      .all(machineId, limit)
      .map(toRow);
  }

  /** 找出指定机器下所有未完成动作（断线时一并标记失败）。 */
  listInflightForMachine(machineId: string): ManagementActionRow[] {
    return this.db
      .prepare<unknown[], DBRow>(
        `SELECT * FROM management_actions
           WHERE machine_id = ? AND status IN ('queued','running')`,
      )
      .all(machineId)
      .map(toRow);
  }

  markRunning(id: string): ManagementActionRow | null {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE management_actions
            SET status = 'running', started_at = COALESCE(started_at, ?)
            WHERE id = ? AND status = 'queued'`,
      )
      .run(now, id);
    return this.getById(id);
  }

  markTerminal(
    id: string,
    status: Extract<ActionStatus, "succeeded" | "failed" | "cancelled">,
    summary: string | null,
    result: Record<string, unknown> | null | undefined,
    errorMessage: string | null,
  ): ManagementActionRow | null {
    const now = Date.now();
    this.db
      .prepare(
        `UPDATE management_actions
            SET status = ?,
                result_summary = ?,
                result_json = ?,
                error_message = ?,
                started_at = COALESCE(started_at, ?),
                finished_at = ?
            WHERE id = ? AND status IN ('queued','running')`,
      )
      .run(
        status,
        summary,
        result ? JSON.stringify(result) : null,
        errorMessage,
        now,
        now,
        id,
      );
    return this.getById(id);
  }
}

interface DBRow {
  id: string;
  machine_id: string;
  agent_kind: AgentKind;
  type: ActionType;
  status: ActionStatus;
  payload_json: string | null;
  result_summary: string | null;
  result_json: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

function toRow(row: DBRow): ManagementActionRow {
  return {
    id: row.id,
    machineId: row.machine_id,
    agentKind: row.agent_kind,
    type: row.type,
    status: row.status,
    payloadJson: row.payload_json,
    resultSummary: row.result_summary,
    resultJson: row.result_json,
    errorMessage: row.error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export class ActionLogRepository {
  constructor(private readonly db: DB) {}

  append(actionId: string, level: ActionLogLevel, message: string): ActionLogRow {
    const now = Date.now();
    const info = this.db
      .prepare(
        `INSERT INTO action_logs (action_id, level, message, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(actionId, level, message, now);
    return {
      id: Number(info.lastInsertRowid),
      actionId,
      level,
      message,
      createdAt: now,
    };
  }

  list(actionId: string, limit = 200): ActionLogRow[] {
    return this.db
      .prepare<unknown[], { id: number; action_id: string; level: ActionLogLevel; message: string; created_at: number }>(
        `SELECT id, action_id, level, message, created_at
           FROM action_logs WHERE action_id = ? ORDER BY id ASC LIMIT ?`,
      )
      .all(actionId, limit)
      .map((row) => ({
        id: row.id,
        actionId: row.action_id,
        level: row.level,
        message: row.message,
        createdAt: row.created_at,
      }));
  }
}
