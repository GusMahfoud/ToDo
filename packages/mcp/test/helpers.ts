import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { BunDb, Store } from "@todomcp/core/node";
import { type CreateServerOptions, createTodoServer } from "../src/server";

export const TZ = "America/New_York";

export interface Harness {
  client: Client;
  store: Store;
  handles: Awaited<ReturnType<typeof createTodoServer>>["handles"];
  todo: Awaited<ReturnType<typeof createTodoServer>>;
  dbPath: string;
  close(): Promise<void>;
}

/** Real Client ↔ McpServer over an in-memory transport pair, on a temp database. */
export async function harness(
  opts: CreateServerOptions = { timeZone: TZ, source: "mcp:test" },
): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "todomcp-mcp-"));
  const dbPath = join(dir, "todos.db");
  const store = await Store.open(BunDb.open(dbPath));
  const todo = await createTodoServer(store, opts);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-harness", version: "1.0.0" });
  await Promise.all([todo.server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    store,
    handles: todo.handles,
    todo,
    dbPath,
    async close() {
      todo.stop();
      await client.close();
      await todo.server.close();
      await store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function call<T = Record<string, unknown>>(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ text: string; structured: T; isError: boolean }> {
  const res = await client.callTool({ name, arguments: args });
  const first = (res.content as { type: string; text?: string }[])[0];
  return {
    text: first?.text ?? "",
    structured: res.structuredContent as T,
    isError: res.isError === true,
  };
}

export async function toolNames(client: Client): Promise<string[]> {
  return (await client.listTools()).tools.map((t) => t.name).sort();
}
