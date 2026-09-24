import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  claudeCodeCommand,
  configCandidates,
  mergeEntry,
  pickConfigPath,
  runConnect,
  selfCommand,
} from "../src/cli-connect";

const entry = { command: "/opt/todo-mcp", args: [], env: { TODO_DB_PATH: "/data/todos.db" } };

describe("connect", () => {
  test("selfCommand distinguishes compiled binary from bun-run source", () => {
    expect(selfCommand("/usr/bin/todo-mcp", "/x/index.ts")).toEqual({
      command: "/usr/bin/todo-mcp",
      args: [],
    });
    const viaBun = selfCommand("C:\\bun\\bun.exe", "C:\\repo\\packages\\mcp\\src\\index.ts");
    expect(viaBun.command).toBe("C:\\bun\\bun.exe");
    expect(viaBun.args[0]).toBe("run");
    expect(viaBun.args[1]).toEndWith("index.ts");
  });

  test("merge keeps other servers and unrelated keys", () => {
    const merged = mergeEntry(
      { theme: "dark", mcpServers: { other: { command: "x" } } },
      entry,
    ) as { theme: string; mcpServers: Record<string, unknown> };
    expect(merged.theme).toBe("dark");
    expect(Object.keys(merged.mcpServers)).toEqual(["other", "todo"]);
    expect(merged.mcpServers.todo).toEqual(entry);
  });

  test("candidates per platform", () => {
    expect(configCandidates("cursor", { home: "/h", platform: "linux" })[0]).toEndWith("mcp.json");
    expect(configCandidates("claude-desktop", { home: "/h", platform: "darwin" })[0]).toContain(
      "Application Support",
    );
    expect(
      configCandidates("claude-desktop", { home: "/h", platform: "linux", env: {} })[0],
    ).toContain(".config");
    expect(() => pickConfigPath([])).toThrow();
  });

  test("claude code command quotes paths with spaces", () => {
    const cmd = claudeCodeCommand({
      ...entry,
      command: "C:\\Program Files\\TodoMCP\\todo-mcp.exe",
    });
    expect(cmd).toStartWith("claude mcp add --scope user -e TODO_DB_PATH=/data/todos.db todo -- ");
    expect(cmd).toContain('"C:\\Program Files\\TodoMCP\\todo-mcp.exe"');
  });

  test("writes cursor config with backup; dry-run leaves disk alone", () => {
    const home = mkdtempSync(join(tmpdir(), "todomcp-connect-"));
    const location = { home, platform: "linux" as const };
    const path = join(home, ".cursor", "mcp.json");
    try {
      expect(runConnect("cursor", "/data/todos.db", { dryRun: true, location })).toContain(
        "would write",
      );
      expect(existsSync(path)).toBe(false);

      const first = runConnect("cursor", "/data/todos.db", { now: () => 1_000_000, location });
      expect(first).toContain(`Wrote ${path}`);
      const json = JSON.parse(readFileSync(path, "utf8")) as {
        mcpServers: { todo: { env: { TODO_DB_PATH: string } } };
      };
      expect(json.mcpServers.todo.env.TODO_DB_PATH).toBe("/data/todos.db");

      writeFileSync(path, JSON.stringify({ mcpServers: { other: { command: "x" } }, todo: 1 }));
      const second = runConnect("cursor", "/data/other.db", { now: () => 2_000_000, location });
      expect(second).toContain(`Backup ${path}.2000.bak`);
      expect(existsSync(`${path}.2000.bak`)).toBe(true);
      const merged = JSON.parse(readFileSync(path, "utf8")) as {
        mcpServers: Record<string, unknown>;
      };
      expect(Object.keys(merged.mcpServers)).toEqual(["other", "todo"]);

      expect(() => runConnect("nope", "/x")).toThrow(/Unknown client/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
