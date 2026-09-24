import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { call, type Harness, harness, toolNames } from "./helpers";

interface TodoOut {
  id: number;
  title: string;
  status: string;
  due_at: string | null;
  remind_at: string | null;
  tags: string[];
  source: string;
}

describe("todo tools", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await harness();
  });
  afterEach(() => h.close());

  test("advertises the enabled tools with schemas and annotations", async () => {
    expect(await toolNames(h.client)).toEqual([
      "todo_add",
      "todo_complete",
      "todo_current_time",
      "todo_list",
      "todo_update",
    ]);
    const { tools } = await h.client.listTools();
    const list = tools.find((t) => t.name === "todo_list");
    expect(list?.annotations?.readOnlyHint).toBe(true);
    expect(list?.outputSchema).toBeDefined();
    expect(list?.description).toContain("List the user's todos");
    const add = tools.find((t) => t.name === "todo_add");
    if (!add) throw new Error("todo_add missing");
    const props = (add.inputSchema as { properties: Record<string, { description?: string }> })
      .properties;
    expect(props.due_at?.description).toContain("UTC offset");
  });

  test("add → list → update → complete round trip with structured output", async () => {
    const added = await call<TodoOut>(h.client, "todo_add", {
      title: "Call dentist",
      due_at: "2026-09-25T10:00:00-04:00",
      remind_at: "2026-09-25T09:30:00-04:00",
      tags: ["Health"],
      priority: 2,
    });
    expect(added.isError).toBe(false);
    expect(added.text).toContain("Added #1: Call dentist");
    expect(added.structured).toMatchObject({
      id: 1,
      title: "Call dentist",
      status: "open",
      due_at: "2026-09-25T10:00:00-04:00",
      remind_at: "2026-09-25T09:30:00-04:00",
      tags: ["health"],
      source: "mcp:test",
    });

    const listed = await call<{
      todos: TodoOut[];
      count: number;
      current_time: string;
      timezone: string;
    }>(h.client, "todo_list");
    expect(listed.structured.count).toBe(1);
    expect(listed.structured.timezone).toBe("America/New_York");
    expect(listed.structured.current_time).toMatch(/[+-]\d{2}:\d{2}$/);
    expect(listed.text).toContain("#1 Call dentist (due 2026-09-25T10:00:00-04:00)");

    const updated = await call<TodoOut>(h.client, "todo_update", {
      id: 1,
      due_at: "2026-09-26T10:00:00Z",
      remind_at: null,
    });
    expect(updated.structured.due_at).toBe("2026-09-26T06:00:00-04:00");
    expect(updated.structured.remind_at).toBeNull();

    const completed = await call<TodoOut>(h.client, "todo_complete", { id: 1 });
    expect(completed.structured.status).toBe("done");
    expect((await call<{ count: number }>(h.client, "todo_list")).structured.count).toBe(0);
    expect(
      (await call<{ count: number }>(h.client, "todo_list", { status: "done" })).structured.count,
    ).toBe(1);
  });

  test("returns helpful tool errors instead of crashing", async () => {
    const noOffset = await call(h.client, "todo_add", {
      title: "x",
      due_at: "2026-09-25T10:00:00",
    });
    expect(noOffset.isError).toBe(true);
    expect(noOffset.text).toContain("UTC offset");

    const missing = await call(h.client, "todo_complete", { id: 42 });
    expect(missing.isError).toBe(true);
    expect(missing.text).toBe("No todo with id 42. Call todo_list to see current ids.");

    const badPriority = await call(h.client, "todo_add", { title: "x", priority: 9 });
    expect(badPriority.isError).toBe(true);
  });

  test("todo_current_time reports the configured zone", async () => {
    const res = await call<{
      timezone: string;
      local_time: string;
      utc_time: string;
      weekday: string;
    }>(h.client, "todo_current_time");
    expect(res.structured.timezone).toBe("America/New_York");
    expect(res.structured.utc_time).toEndWith("Z");
    expect(res.text).toContain(res.structured.weekday);
  });

  test("todo_delete is disabled by default and works once enabled", async () => {
    await call(h.client, "todo_add", { title: "temp" });
    const blocked = await h.client
      .callTool({ name: "todo_delete", arguments: { id: 1 } })
      .catch((e) => e);
    expect(blocked).toBeInstanceOf(Error);

    await h.store.config.setEnabled("todo_delete", true);
    h.todo.startWatching(10);
    await Bun.sleep(80);
    expect(await toolNames(h.client)).toContain("todo_delete");
    const deleted = await call<{ deleted: boolean }>(h.client, "todo_delete", { id: 1 });
    expect(deleted.structured.deleted).toBe(true);
    expect(
      (await call<{ count: number }>(h.client, "todo_list", { status: "all" })).structured.count,
    ).toBe(0);
  });
});
