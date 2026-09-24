import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { BaseDb, type ExecResult, type Row, type SqlValue } from "./db";

/** Db adapter over `bun:sqlite`, used by the MCP server and by tests. */
export class BunDb extends BaseDb {
  constructor(private readonly db: Database) {
    super();
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA foreign_keys = ON");
  }

  static open(path: string): BunDb {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    return new BunDb(new Database(path, { create: true, strict: true }));
  }

  async exec(sql: string, params: SqlValue[] = []): Promise<ExecResult> {
    const res = this.db.run(sql, params);
    return { changes: Number(res.changes), lastInsertId: Number(res.lastInsertRowid) };
  }

  async select<T extends object = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const stmt = this.db.query<T, SqlValue[]>(sql);
    try {
      return stmt.all(...params);
    } finally {
      stmt.finalize();
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
