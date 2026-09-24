import { BaseDb, type ExecResult, type Row, type SqlValue } from "./db";

/** Shape of `invoke` from `@tauri-apps/api/core`; injected so core stays dependency-free. */
export type Invoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

/**
 * Db adapter for the desktop app. Queries run on the Rust side (`db_exec` /
 * `db_select` commands over a single rusqlite connection), which sidesteps
 * `tauri-plugin-sql`'s fixed base directory and keeps one SQLite engine in the app.
 */
export class TauriDb extends BaseDb {
  constructor(private readonly invoke: Invoke) {
    super();
  }

  exec(sql: string, params: SqlValue[] = []): Promise<ExecResult> {
    return this.invoke<ExecResult>("db_exec", { sql, params });
  }

  select<T extends object = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.invoke<T[]>("db_select", { sql, params });
  }

  async close(): Promise<void> {
    // The connection belongs to the Rust process; nothing to do here.
  }
}
