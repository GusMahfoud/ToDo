/** Test fixture: a separate process that writes todos to a shared database. */
import { BunDb } from "../../src/db-bun";
import { Store } from "../../src/store";

const [dbPath, prefix = "child", countArg = "10"] = process.argv.slice(2);
if (!dbPath) throw new Error("usage: writer.ts <db> <prefix> <count>");

const store = await Store.open(BunDb.open(dbPath));
const count = Number(countArg);
let last = 0;
for (let i = 0; i < count; i++) {
  const todo = await store.todos.add({ title: `${prefix} ${i}`, source: "mcp" });
  last = todo.id;
  if (i % 7 === 0) await store.todos.update(todo.id, { priority: 2, tags: ["child"] });
}
await store.todos.complete(last);
await store.close();
