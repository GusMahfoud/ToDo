import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunDb } from "../src/db-bun";
import { Store } from "../src/store";

export interface TempDb {
  path: string;
  cleanup(): void;
}

export function tempDbPath(): TempDb {
  const dir = mkdtempSync(join(tmpdir(), "todomcp-test-"));
  return {
    path: join(dir, "todos.db"),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

export async function openTempStore(now?: () => number) {
  const tmp = tempDbPath();
  const db = BunDb.open(tmp.path);
  const store = await Store.open(db, now);
  return {
    store,
    path: tmp.path,
    async cleanup() {
      await store.close();
      tmp.cleanup();
    },
  };
}

/** A controllable clock for deterministic timestamps. */
export function fakeClock(start = 1_700_000_000_000) {
  let t = start;
  const now = () => t;
  return { now, advance: (ms: number) => (t += ms), set: (ms: number) => (t = ms) };
}
