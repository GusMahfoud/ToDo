import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BunDb, Store, TOOL_DEFAULTS } from "@todomcp/core/node";
import { createTodoServer } from "../src/server";
import { type Harness, harness, toolNames } from "./helpers";

describe("live tool configuration", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });
  afterEach(() => h.close());

  test("saved config is applied before the client connects", async () => {
    // Simulate the app having disabled a tool and customised a description earlier.
    await h.store.config.setEnabled("todo_update", false);
    await h.store.config.setDescription("todo_add", "Custom add prompt");
    // A new connection (new AI client session) on the same DB sees the saved config immediately.
    const again = await createTodoServer(h.store, { timeZone: "UTC", source: "t" });
    expect(again.handles.todo_update.enabled).toBe(false);
    expect(again.handles.todo_add.description).toBe("Custom add prompt");
    expect(again.handles.todo_list.description).toBe(TOOL_DEFAULTS.todo_list.description);
    again.stop();
    expect(await toolNames(h.client)).toContain("todo_update"); // not yet reloaded on this connection
  });

  test("changes from another process are picked up and notified", async () => {
    let notifications = 0;
    h.client.setNotificationHandler("notifications/tools/list_changed", async () => {
      notifications++;
    });
    h.todo.startWatching(10);
    await Bun.sleep(30);

    // "Another process" = a second connection to the same file, like the desktop app.
    const app = await Store.open(BunDb.open(h.dbPath));
    try {
      await app.config.setDescription("todo_list", "Show me my stuff");
      await app.config.setEnabled("todo_complete", false);
      await Bun.sleep(120);

      const { tools } = await h.client.listTools();
      expect(tools.find((t) => t.name === "todo_list")?.description).toBe("Show me my stuff");
      expect(tools.map((t) => t.name)).not.toContain("todo_complete");
      expect(notifications).toBeGreaterThan(0);

      await app.config.setDescription("todo_list", null);
      await Bun.sleep(120);
      expect(
        (await h.client.listTools()).tools.find((t) => t.name === "todo_list")?.description,
      ).toBe(TOOL_DEFAULTS.todo_list.description);
    } finally {
      await app.close();
    }
  });
});
