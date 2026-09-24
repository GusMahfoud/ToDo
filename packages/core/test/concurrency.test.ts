import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { BunDb } from "../src/db-bun";
import { Store } from "../src/store";
import { tempDbPath } from "./helpers";

const WRITER = fileURLToPath(new URL("./fixtures/writer.ts", import.meta.url));

/** Spawns a real second process that opens the same DB and writes `count` todos. */
async function runWriter(dbPath: string, prefix: string, count: number): Promise<void> {
  const proc = Bun.spawn(["bun", "run", WRITER, dbPath, prefix, String(count)], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`writer failed: ${await new Response(proc.stderr).text()}`);
}

describe("two processes sharing one WAL database", () => {
  test("concurrent writers from separate processes lose nothing", async () => {
    const tmp = tempDbPath();
    const app = await Store.open(BunDb.open(tmp.path));
    try {
      const child = runWriter(tmp.path, "ai", 60);
      for (let i = 0; i < 60; i++) {
        await app.todos.add({ title: `ui ${i}`, source: "ui" });
        if (i % 10 === 0) await app.config.setEnabled("todo_delete", i % 20 === 0);
      }
      await child;

      const all = await app.todos.list({ status: "all", limit: 200 });
      expect(all).toHaveLength(120);
      expect(all.filter((t) => t.source === "mcp")).toHaveLength(60);
      // 120 inserts + 9 child updates (i % 7 === 0) + 1 completion.
      expect(await app.todos.seq()).toBe(130);
      // The child completed its last item; the parent sees it without reconnecting.
      const done = await app.todos.list({ status: "done" });
      expect(done.map((t) => t.title)).toEqual(["ai 59"]);
    } finally {
      await app.close();
      tmp.cleanup();
    }
  }, 30_000);

  test("transactions on one connection serialise instead of nesting", async () => {
    const tmp = tempDbPath();
    const db = BunDb.open(tmp.path);
    try {
      await db.exec("CREATE TABLE t (n INTEGER)");
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          db.transaction(async (tx) => {
            await tx.exec("INSERT INTO t VALUES (?)", [i]);
            await new Promise((r) => setTimeout(r, 1));
            await tx.exec("INSERT INTO t VALUES (?)", [i + 100]);
          }),
        ),
      );
      const count = (await db.select<{ c: number }>("SELECT count(*) AS c FROM t"))[0]?.c;
      expect(count).toBe(20);
    } finally {
      await db.close();
      tmp.cleanup();
    }
  });
});
