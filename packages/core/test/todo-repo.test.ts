import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { NotFoundError } from "../src/todo-repo";
import { fakeClock, openTempStore } from "./helpers";

describe("TodoRepo", () => {
  const clock = fakeClock();
  let ctx: Awaited<ReturnType<typeof openTempStore>>;

  beforeEach(async () => {
    clock.set(1_700_000_000_000);
    ctx = await openTempStore(clock.now);
  });
  afterEach(() => ctx.cleanup());

  test("add normalises input and returns the row", async () => {
    const todo = await ctx.store.todos.add({
      title: "  Call dentist ",
      tags: ["Health", "health", " calls "],
      source: "mcp",
    });
    expect(todo.id).toBe(1);
    expect(todo.title).toBe("Call dentist");
    expect(todo.tags).toEqual(["health", "calls"]);
    expect(todo.status).toBe("open");
    expect(todo.source).toBe("mcp");
    expect(todo.created_at).toBe(clock.now());
    expect(await ctx.store.todos.seq()).toBe(1);
  });

  test("list orders by due date, filters by status, tag and search", async () => {
    const t = ctx.store.todos;
    await t.add({ title: "no due", tags: ["home"] });
    await t.add({ title: "later", due_at: 5_000, priority: 1 });
    await t.add({ title: "soon", due_at: 1_000, priority: 3, notes: "urgent thing" });
    const done = await t.add({ title: "finished", tags: ["home"] });
    await t.complete(done.id);

    expect((await t.list()).map((x) => x.title)).toEqual(["soon", "later", "no due"]);
    expect((await t.list({ status: "done" })).map((x) => x.title)).toEqual(["finished"]);
    expect((await t.list({ status: "all" })).length).toBe(4);
    expect((await t.list({ tag: "Home", status: "all" })).map((x) => x.title)).toEqual([
      "no due",
      "finished",
    ]);
    expect((await t.list({ search: "URGENT" })).map((x) => x.title)).toEqual(["soon"]);
    expect((await t.list({ search: "100%" })).length).toBe(0);
    expect((await t.list({ due_before: 2_000 })).map((x) => x.title)).toEqual(["soon"]);
    expect((await t.list({ limit: 1 })).length).toBe(1);
  });

  test("update re-arms reminders and tracks completion", async () => {
    const t = ctx.store.todos;
    const todo = await t.add({ title: "x", remind_at: 10 });
    const claimed = await t.claimDueReminders(20);
    expect(claimed.map((c) => c.id)).toEqual([todo.id]);
    expect((await t.getOrThrow(todo.id)).reminded_at).toBe(20);

    const same = await t.update(todo.id, { remind_at: 10 });
    expect(same.reminded_at).toBe(20);

    const moved = await t.update(todo.id, { remind_at: 30 });
    expect(moved.reminded_at).toBeNull();
    expect(moved.remind_at).toBe(30);

    clock.advance(1_000);
    const done = await t.update(todo.id, { status: "done" });
    expect(done.completed_at).toBe(clock.now());
    expect(done.updated_at).toBe(clock.now());

    const reopened = await t.update(todo.id, { status: "open" });
    expect(reopened.completed_at).toBeNull();

    const cleared = await t.update(todo.id, { due_at: null, notes: null });
    expect(cleared.due_at).toBeNull();
  });

  test("claimDueReminders only fires once and skips done items", async () => {
    const t = ctx.store.todos;
    await t.add({ title: "a", remind_at: 100 });
    await t.add({ title: "b", remind_at: 100 });
    const c = await t.add({ title: "c", remind_at: 100 });
    await t.complete(c.id);
    await t.add({ title: "future", remind_at: 10_000 });

    expect((await t.claimDueReminders(500)).map((x) => x.title).sort()).toEqual(["a", "b"]);
    expect(await t.claimDueReminders(600)).toEqual([]);
  });

  test("delete and not-found behaviour", async () => {
    const t = ctx.store.todos;
    const todo = await t.add({ title: "bye" });
    expect(await t.delete(todo.id)).toBe(true);
    expect(await t.delete(todo.id)).toBe(false);
    await expect(t.getOrThrow(todo.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(t.update(999, { title: "?" })).rejects.toThrow("No todo with id 999");
  });
});
