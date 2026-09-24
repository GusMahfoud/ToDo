import { describe, expect, test } from "bun:test";
import { BunDb } from "../src/db-bun";
import { migrate } from "../src/migrate";
import { SCHEMA_VERSION } from "../src/schema";
import { tempDbPath } from "./helpers";

const userVersion = async (db: BunDb) =>
  (await db.select<{ user_version: number }>("PRAGMA user_version"))[0]?.user_version;

describe("migrate", () => {
  test("brings a fresh database to the current schema version", async () => {
    const tmp = tempDbPath();
    const db = BunDb.open(tmp.path);
    try {
      expect(await migrate(db)).toBe(SCHEMA_VERSION);
      expect(await userVersion(db)).toBe(SCHEMA_VERSION);
      const tables = await db.select<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      );
      expect(tables.map((t) => t.name)).toEqual(["meta", "settings", "todos", "tool_config"]);
      const meta = await db.select<{ key: string; value: number }>(
        "SELECT * FROM meta ORDER BY key",
      );
      expect(meta).toEqual([
        { key: "config_seq", value: 0 },
        { key: "todos_seq", value: 0 },
      ]);
    } finally {
      await db.close();
      tmp.cleanup();
    }
  });

  test("is idempotent across connections and uses WAL", async () => {
    const tmp = tempDbPath();
    const a = BunDb.open(tmp.path);
    const b = BunDb.open(tmp.path);
    try {
      expect(await migrate(a)).toBe(SCHEMA_VERSION);
      expect(await migrate(b)).toBe(SCHEMA_VERSION);
      expect(await migrate(a)).toBe(SCHEMA_VERSION);
      const mode = (await a.select<{ journal_mode: string }>("PRAGMA journal_mode"))[0]
        ?.journal_mode;
      expect(mode).toBe("wal");
    } finally {
      await a.close();
      await b.close();
      tmp.cleanup();
    }
  });

  test("rolls back if a migration step fails", async () => {
    const tmp = tempDbPath();
    const db = BunDb.open(tmp.path);
    try {
      await db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)");
      await expect(migrate(db)).rejects.toThrow();
      expect(await userVersion(db)).toBe(0);
      const todos = await db.select("SELECT name FROM sqlite_master WHERE name = 'todos'");
      expect(todos).toHaveLength(0);
    } finally {
      await db.close();
      tmp.cleanup();
    }
  });
});
