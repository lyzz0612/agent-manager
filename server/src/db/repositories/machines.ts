import type { DB } from "../index.js";
import type { MachineRow, MachineStatus } from "../../domain/types.js";

interface MachineInsert {
  id: string;
  displayName: string;
  hostname: string | null;
  platform: string | null;
  arch: string | null;
}

export class MachineRepository {
  constructor(private readonly db: DB) {}

  insert(input: MachineInsert): MachineRow {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO machines (
          id, display_name, hostname, platform, arch, status, last_seen_at, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, 'offline', NULL, ?, ?, NULL)`,
      )
      .run(
        input.id,
        input.displayName,
        input.hostname,
        input.platform,
        input.arch,
        now,
        now,
      );
    const row = this.getById(input.id);
    if (!row) throw new Error("insert 后未能读取到机器记录");
    return row;
  }

  getById(id: string): MachineRow | null {
    const row = this.db
      .prepare<unknown[], DBRow>(`SELECT * FROM machines WHERE id = ?`)
      .get(id);
    return row ? toRow(row) : null;
  }

  /** 获取“可见”机器（未删除）。 */
  getActiveById(id: string): MachineRow | null {
    const row = this.db
      .prepare<unknown[], DBRow>(
        `SELECT * FROM machines WHERE id = ? AND deleted_at IS NULL`,
      )
      .get(id);
    return row ? toRow(row) : null;
  }

  listActive(): MachineRow[] {
    const rows = this.db
      .prepare<unknown[], DBRow>(
        `SELECT * FROM machines WHERE deleted_at IS NULL
         ORDER BY CASE status WHEN 'online' THEN 0 ELSE 1 END, display_name ASC`,
      )
      .all();
    return rows.map(toRow);
  }

  /** 根据 fingerprint 查找未删除机器。用于 Runner 重新 login 时复用旧机器。 */
  findActiveByFingerprint(
    hostname: string | null,
    platform: string | null,
    arch: string | null,
  ): MachineRow | null {
    if (!hostname) return null;
    const row = this.db
      .prepare<unknown[], DBRow>(
        `SELECT * FROM machines
         WHERE deleted_at IS NULL
           AND COALESCE(hostname,'') = COALESCE(?, '')
           AND COALESCE(platform,'') = COALESCE(?, '')
           AND COALESCE(arch,'') = COALESCE(?, '')`,
      )
      .get(hostname, platform, arch);
    return row ? toRow(row) : null;
  }

  updateDisplayName(id: string, displayName: string): MachineRow | null {
    this.db
      .prepare(
        `UPDATE machines SET display_name = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(displayName, Date.now(), id);
    return this.getActiveById(id);
  }

  setStatus(
    id: string,
    status: MachineStatus,
    lastSeenAt: number | null,
  ): MachineRow | null {
    this.db
      .prepare(
        `UPDATE machines SET status = ?, last_seen_at = COALESCE(?, last_seen_at), updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(status, lastSeenAt, Date.now(), id);
    return this.getActiveById(id);
  }

  softDelete(id: string): boolean {
    const info = this.db
      .prepare(
        `UPDATE machines SET deleted_at = ?, status = 'offline', updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(Date.now(), Date.now(), id);
    return info.changes > 0;
  }
}

interface DBRow {
  id: string;
  display_name: string;
  hostname: string | null;
  platform: string | null;
  arch: string | null;
  status: MachineStatus;
  last_seen_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

function toRow(row: DBRow): MachineRow {
  return {
    id: row.id,
    displayName: row.display_name,
    hostname: row.hostname,
    platform: row.platform,
    arch: row.arch,
    status: row.status,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}
