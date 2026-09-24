/**
 * Minimal async database interface. The same query code runs on `bun:sqlite`
 * (MCP server) and on the Tauri app's Rust-side rusqlite connection.
 *
 * Contract every adapter must honour:
 * - Each statement is a single SQL statement (migrations are stored as arrays).
 * - `select` may run any statement that returns rows, including `PRAGMA` and `... RETURNING`.
 * - `exec` runs statements that return no rows.
 * - Connections use WAL mode and a 5s busy timeout (set by the adapter on open).
 */

export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export interface ExecResult {
  changes: number;
  lastInsertId: number;
}

export interface DbReader {
  exec(sql: string, params?: SqlValue[]): Promise<ExecResult>;
  select<T extends object = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

export interface Db extends DbReader {
  /**
   * Runs `fn` inside `BEGIN IMMEDIATE ... COMMIT`, serialised against other
   * transactions on this connection. Use the `tx` argument for queries inside.
   */
  transaction<T>(fn: (tx: DbReader) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Shared transaction/serialisation logic; adapters implement exec/select/close. */
export abstract class BaseDb implements Db {
  private queue: Promise<unknown> = Promise.resolve();

  abstract exec(sql: string, params?: SqlValue[]): Promise<ExecResult>;
  abstract select<T extends object = Row>(sql: string, params?: SqlValue[]): Promise<T[]>;
  abstract close(): Promise<void>;

  transaction<T>(fn: (tx: DbReader) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      await this.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn(this);
        await this.exec("COMMIT");
        return result;
      } catch (err) {
        await this.exec("ROLLBACK").catch(() => undefined);
        throw err;
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

const BUSY_PATTERN = /SQLITE_BUSY|database is locked/i;

export function isBusyError(err: unknown): boolean {
  return err instanceof Error && BUSY_PATTERN.test(err.message);
}

/** Retries `fn` once if SQLite reported the database as locked past the busy timeout. */
export async function withBusyRetry<T>(fn: () => Promise<T>, delayMs = 250): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isBusyError(err)) throw err;
    await new Promise((r) => setTimeout(r, delayMs));
    return fn();
  }
}
