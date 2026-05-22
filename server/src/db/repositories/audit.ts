import type { DB } from "../index.js";
import type { AuditLogRow } from "../../domain/types.js";

interface AuditWrite {
  actor: string;
  event: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
}

export class AuditLogRepository {
  constructor(private readonly db: DB) {}

  write(input: AuditWrite): AuditLogRow {
    const now = Date.now();
    const detailsJson = input.details ? JSON.stringify(input.details) : null;
    const info = this.db
      .prepare(
        `INSERT INTO audit_logs (actor, event, target_type, target_id, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.actor,
        input.event,
        input.targetType ?? null,
        input.targetId ?? null,
        detailsJson,
        now,
      );
    return {
      id: Number(info.lastInsertRowid),
      actor: input.actor,
      event: input.event,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      detailsJson,
      createdAt: now,
    };
  }

  list(limit = 100): AuditLogRow[] {
    return this.db
      .prepare<unknown[], {
        id: number;
        actor: string;
        event: string;
        target_type: string | null;
        target_id: string | null;
        details_json: string | null;
        created_at: number;
      }>(
        `SELECT id, actor, event, target_type, target_id, details_json, created_at
           FROM audit_logs ORDER BY id DESC LIMIT ?`,
      )
      .all(limit)
      .map((row) => ({
        id: row.id,
        actor: row.actor,
        event: row.event,
        targetType: row.target_type,
        targetId: row.target_id,
        detailsJson: row.details_json,
        createdAt: row.created_at,
      }));
  }
}
