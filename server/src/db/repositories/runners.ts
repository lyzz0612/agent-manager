import type { DB } from "../index.js";
import type { RunnerRow } from "../../domain/types.js";

interface RunnerInsert {
  id: string;
  machineId: string;
  tokenHash: string;
  version: string | null;
}

export class RunnerRepository {
  constructor(private readonly db: DB) {}

  insert(input: RunnerInsert): RunnerRow {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO runners (id, machine_id, token_hash, version, created_at, last_connected_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .run(input.id, input.machineId, input.tokenHash, input.version, now);
    const row = this.getById(input.id);
    if (!row) throw new Error("insert 后未能读取到 Runner 记录");
    return row;
  }

  getById(id: string): RunnerRow | null {
    const row = this.db
      .prepare<unknown[], DBRow>(`SELECT * FROM runners WHERE id = ?`)
      .get(id);
    return row ? toRow(row) : null;
  }

  findByTokenHash(tokenHash: string): RunnerRow | null {
    const row = this.db
      .prepare<unknown[], DBRow>(`SELECT * FROM runners WHERE token_hash = ?`)
      .get(tokenHash);
    return row ? toRow(row) : null;
  }

  markConnected(id: string, ts: number = Date.now()): void {
    this.db
      .prepare(`UPDATE runners SET last_connected_at = ? WHERE id = ?`)
      .run(ts, id);
  }

  revokeByMachine(machineId: string, ts: number = Date.now()): void {
    this.db
      .prepare(
        `UPDATE runners SET revoked_at = ? WHERE machine_id = ? AND revoked_at IS NULL`,
      )
      .run(ts, machineId);
  }
}

interface DBRow {
  id: string;
  machine_id: string;
  token_hash: string;
  version: string | null;
  created_at: number;
  last_connected_at: number | null;
  revoked_at: number | null;
}

function toRow(row: DBRow): RunnerRow {
  return {
    id: row.id,
    machineId: row.machine_id,
    tokenHash: row.token_hash,
    version: row.version,
    createdAt: row.created_at,
    lastConnectedAt: row.last_connected_at,
    revokedAt: row.revoked_at,
  };
}
