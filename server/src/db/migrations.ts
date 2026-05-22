import type { DB } from "./index.js";

interface Migration {
  id: number;
  name: string;
  up: (db: DB) => void;
}

const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "init",
    up(db) {
      db.exec(`
        CREATE TABLE machines (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          hostname TEXT,
          platform TEXT,
          arch TEXT,
          status TEXT NOT NULL DEFAULT 'offline',
          last_seen_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          deleted_at INTEGER
        );

        -- 同一物理 fingerprint（hostname+platform+arch）只允许有一台未删除机器。
        -- 软删后允许同 fingerprint 重新注册。fingerprint 可能为空，因此 COALESCE 兜底。
        CREATE UNIQUE INDEX idx_machines_fingerprint_alive ON machines (
          COALESCE(hostname, ''),
          COALESCE(platform, ''),
          COALESCE(arch, '')
        ) WHERE deleted_at IS NULL AND hostname IS NOT NULL;

        CREATE INDEX idx_machines_status ON machines (status) WHERE deleted_at IS NULL;

        CREATE TABLE runners (
          id TEXT PRIMARY KEY,
          machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL,
          version TEXT,
          created_at INTEGER NOT NULL,
          last_connected_at INTEGER,
          revoked_at INTEGER
        );

        CREATE UNIQUE INDEX idx_runners_token_hash ON runners (token_hash);
        CREATE INDEX idx_runners_machine ON runners (machine_id);

        CREATE TABLE agent_installations (
          id TEXT PRIMARY KEY,
          machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
          agent_kind TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'unknown',
          version TEXT,
          exec_path TEXT,
          on_path INTEGER,
          config_summary TEXT,
          last_detected_at INTEGER,
          updated_at INTEGER NOT NULL
        );

        CREATE UNIQUE INDEX idx_agent_inst_machine_kind
          ON agent_installations (machine_id, agent_kind);

        CREATE TABLE doctor_checks (
          id TEXT PRIMARY KEY,
          machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
          agent_kind TEXT NOT NULL,
          status TEXT NOT NULL,
          summary TEXT,
          details_json TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX idx_doctor_checks_machine_kind
          ON doctor_checks (machine_id, agent_kind, created_at DESC);

        CREATE TABLE management_actions (
          id TEXT PRIMARY KEY,
          machine_id TEXT NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
          agent_kind TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL,
          payload_json TEXT,
          result_summary TEXT,
          result_json TEXT,
          error_message TEXT,
          created_by TEXT,
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          finished_at INTEGER
        );

        CREATE INDEX idx_actions_machine_agent_status
          ON management_actions (machine_id, agent_kind, status);
        CREATE INDEX idx_actions_status ON management_actions (status);
        CREATE INDEX idx_actions_created_at ON management_actions (created_at DESC);

        CREATE TABLE action_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action_id TEXT NOT NULL REFERENCES management_actions(id) ON DELETE CASCADE,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX idx_action_logs_action ON action_logs (action_id, id);

        CREATE TABLE audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor TEXT NOT NULL,
          event TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          details_json TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX idx_audit_event ON audit_logs (event, created_at DESC);
        CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id, created_at DESC);
      `);
    },
  },
];

export function runMigrations(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set<number>(
    db
      .prepare<unknown[], { id: number }>("SELECT id FROM schema_migrations")
      .all()
      .map((row) => row.id),
  );

  const insert = db.prepare(
    "INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)",
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      migration.up(db);
      insert.run(migration.id, migration.name, Date.now());
    })();
  }
}
