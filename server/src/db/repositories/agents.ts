import { randomUUID } from "node:crypto";

import type { DB } from "../index.js";
import type {
  AgentInstallStatus,
  AgentInstallationRow,
  AgentKind,
  DoctorCheckRow,
  DoctorStatus,
} from "../../domain/types.js";

interface AgentInstallationUpsert {
  machineId: string;
  agentKind: AgentKind;
  status: AgentInstallStatus;
  version: string | null;
  execPath: string | null;
  onPath: boolean | null;
  configSummary: string | null;
}

export class AgentInstallationRepository {
  constructor(private readonly db: DB) {}

  upsertDetection(input: AgentInstallationUpsert): AgentInstallationRow {
    const now = Date.now();
    const existing = this.getByMachineAndKind(input.machineId, input.agentKind);
    if (existing) {
      this.db
        .prepare(
          `UPDATE agent_installations
             SET status = ?, version = ?, exec_path = ?, on_path = ?, config_summary = ?,
                 last_detected_at = ?, updated_at = ?
             WHERE id = ?`,
        )
        .run(
          input.status,
          input.version,
          input.execPath,
          boolToInt(input.onPath),
          input.configSummary,
          now,
          now,
          existing.id,
        );
      const row = this.getById(existing.id);
      if (!row) throw new Error("update 后未能读取到 Agent 记录");
      return row;
    }
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO agent_installations (
            id, machine_id, agent_kind, status, version, exec_path, on_path, config_summary,
            last_detected_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.machineId,
        input.agentKind,
        input.status,
        input.version,
        input.execPath,
        boolToInt(input.onPath),
        input.configSummary,
        now,
        now,
      );
    const row = this.getById(id);
    if (!row) throw new Error("insert 后未能读取到 Agent 记录");
    return row;
  }

  getById(id: string): AgentInstallationRow | null {
    const row = this.db
      .prepare<unknown[], DBRow>(`SELECT * FROM agent_installations WHERE id = ?`)
      .get(id);
    return row ? toRow(row) : null;
  }

  getByMachineAndKind(
    machineId: string,
    agentKind: AgentKind,
  ): AgentInstallationRow | null {
    const row = this.db
      .prepare<unknown[], DBRow>(
        `SELECT * FROM agent_installations WHERE machine_id = ? AND agent_kind = ?`,
      )
      .get(machineId, agentKind);
    return row ? toRow(row) : null;
  }

  listByMachine(machineId: string): AgentInstallationRow[] {
    return this.db
      .prepare<unknown[], DBRow>(
        `SELECT * FROM agent_installations WHERE machine_id = ? ORDER BY agent_kind ASC`,
      )
      .all(machineId)
      .map(toRow);
  }
}

interface DoctorInsert {
  machineId: string;
  agentKind: AgentKind;
  status: DoctorStatus;
  summary: string | null;
  details: Record<string, unknown> | null;
}

export class DoctorCheckRepository {
  constructor(private readonly db: DB) {}

  insert(input: DoctorInsert): DoctorCheckRow {
    const id = randomUUID();
    const now = Date.now();
    const detailsJson = input.details ? JSON.stringify(input.details) : null;
    this.db
      .prepare(
        `INSERT INTO doctor_checks (id, machine_id, agent_kind, status, summary, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.machineId,
        input.agentKind,
        input.status,
        input.summary,
        detailsJson,
        now,
      );
    return {
      id,
      machineId: input.machineId,
      agentKind: input.agentKind,
      status: input.status,
      summary: input.summary,
      detailsJson,
      createdAt: now,
    };
  }

  getLatest(
    machineId: string,
    agentKind: AgentKind,
  ): DoctorCheckRow | null {
    const row = this.db
      .prepare<unknown[], DoctorDBRow>(
        `SELECT * FROM doctor_checks WHERE machine_id = ? AND agent_kind = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(machineId, agentKind);
    return row ? toDoctorRow(row) : null;
  }
}

interface DBRow {
  id: string;
  machine_id: string;
  agent_kind: AgentKind;
  status: AgentInstallStatus;
  version: string | null;
  exec_path: string | null;
  on_path: number | null;
  config_summary: string | null;
  last_detected_at: number | null;
  updated_at: number;
}

interface DoctorDBRow {
  id: string;
  machine_id: string;
  agent_kind: AgentKind;
  status: DoctorStatus;
  summary: string | null;
  details_json: string | null;
  created_at: number;
}

function toRow(row: DBRow): AgentInstallationRow {
  return {
    id: row.id,
    machineId: row.machine_id,
    agentKind: row.agent_kind,
    status: row.status,
    version: row.version,
    execPath: row.exec_path,
    onPath: row.on_path,
    configSummary: row.config_summary,
    lastDetectedAt: row.last_detected_at,
    updatedAt: row.updated_at,
  };
}

function toDoctorRow(row: DoctorDBRow): DoctorCheckRow {
  return {
    id: row.id,
    machineId: row.machine_id,
    agentKind: row.agent_kind,
    status: row.status,
    summary: row.summary,
    detailsJson: row.details_json,
    createdAt: row.created_at,
  };
}

function boolToInt(v: boolean | null): number | null {
  if (v === null) return null;
  return v ? 1 : 0;
}
