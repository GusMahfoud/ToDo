import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const ENTRY = fileURLToPath(new URL("../src/index.ts", import.meta.url));

/** Real process, real stdio framing — what an AI client does. */
describe("stdio", () => {
  test("spawned server lists tools, adds and reads a todo, exits on EOF", async () => {
    const dir = mkdtempSync(join(tmpdir(), "todomcp-stdio-"));
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    env.TODO_DB_PATH = join(dir, "todos.db");

    const transport = new StdioClientTransport({
      command: "bun",
      args: ["run", ENTRY],
      env,
      stderr: "pipe",
    });
    const client = new Client({ name: "stdio-test", version: "0.0.0" });
    try {
      await client.connect(transport);
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).toContain("todo_add");
      expect(names).not.toContain("todo_delete");

      const added = await client.callTool({ name: "todo_add", arguments: { title: "via stdio" } });
      expect((added.structuredContent as { source: string }).source).toBe("mcp:stdio-test");

      const listed = await client.callTool({ name: "todo_list", arguments: {} });
      expect((listed.structuredContent as { count: number }).count).toBe(1);
    } finally {
      await client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20_000);
});
