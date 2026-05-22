import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

import { runMigrations } from "./migrations.js";

export type DB = Database.Database;

/** 打开 SQLite 数据库并执行迁移。`:memory:` 用于测试。 */
export function openDatabase(filePath: string): DB {
  if (filePath !== ":memory:") {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");

  runMigrations(db);
  return db;
}
