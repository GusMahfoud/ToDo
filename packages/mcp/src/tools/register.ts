import type { McpServer, RegisteredTool } from "@modelcontextprotocol/server";
import {
  currentTimeInfo,
  localTimeZone,
  msOrNull,
  parseIsoWithOffset,
  type Store,
  TOOL_DEFAULTS,
  type ToolName,
} from "@todomcp/core";
import { describeChange, guarded, ok, todoLine } from "./results";
import {
  AddInput,
  DeleteOut,
  IdInput,
  ListInput,
  ListOut,
  TimeOut,
  TodoOut,
  toOutput,
  UpdateInput,
} from "./schemas";

export type ToolHandles = Record<ToolName, RegisteredTool>;

export interface RegisterOptions {
  /** Where todos created through this connection are attributed to, e.g. "mcp:cursor". */
  source: () => string;
  timeZone?: string;
}

/** Registers the six tools with their built-in defaults; `applyToolConfig` overrides afterwards. */
export function registerTools(server: McpServer, store: Store, opts: RegisterOptions): ToolHandles {
  const tz = opts.timeZone ?? localTimeZone();
  const meta = (name: ToolName) => ({
    title: TOOL_DEFAULTS[name].title,
    description: TOOL_DEFAULTS[name].description,
    annotations: TOOL_DEFAULTS[name].annotations,
  });

  const todo_add = server.registerTool(
    "todo_add",
    { ...meta("todo_add"), inputSchema: AddInput, outputSchema: TodoOut },
    (input) =>
      guarded("todo_add", async () => {
        const todo = await store.todos.add({
          title: input.title,
          notes: input.notes ?? null,
          priority: input.priority ?? 0,
          tags: input.tags ?? [],
          due_at: input.due_at ? parseIsoWithOffset(input.due_at) : null,
          remind_at: input.remind_at ? parseIsoWithOffset(input.remind_at) : null,
          source: opts.source(),
        });
        const out = toOutput(todo, tz);
        return ok(`${describeChange("Added", todo)}\n${todoLine(out)}`, out);
      }),
  );

  const todo_list = server.registerTool(
    "todo_list",
    { ...meta("todo_list"), inputSchema: ListInput, outputSchema: ListOut },
    (input) =>
      guarded("todo_list", async () => {
        const todos = await store.todos.list({
          status: input.status ?? "open",
          ...(input.tag ? { tag: input.tag } : {}),
          ...(input.due_before ? { due_before: parseIsoWithOffset(input.due_before) } : {}),
          ...(input.search ? { search: input.search } : {}),
          ...(input.limit ? { limit: input.limit } : {}),
        });
        const now = currentTimeInfo(Date.now(), tz);
        const outs = todos.map((t) => toOutput(t, tz));
        const header = `${outs.length} todo(s) (status: ${input.status ?? "open"}). Now: ${now.local_time}`;
        const body = outs.length ? outs.map(todoLine).join("\n") : "(none)";
        return ok(`${header}\n${body}`, {
          todos: outs,
          count: outs.length,
          current_time: now.local_time,
          timezone: now.timezone,
        });
      }),
  );

  const todo_update = server.registerTool(
    "todo_update",
    { ...meta("todo_update"), inputSchema: UpdateInput, outputSchema: TodoOut },
    ({ id, ...patch }) =>
      guarded("todo_update", async () => {
        const todo = await store.todos.update(id, {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
          ...(patch.status !== undefined
            ? { status: patch.status as "open" | "done" | "archived" }
            : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          ...(patch.due_at !== undefined ? { due_at: msOrNull(patch.due_at) ?? null } : {}),
          ...(patch.remind_at !== undefined
            ? { remind_at: msOrNull(patch.remind_at) ?? null }
            : {}),
        });
        const out = toOutput(todo, tz);
        return ok(`${describeChange("Updated", todo)}\n${todoLine(out)}`, out);
      }),
  );

  const todo_complete = server.registerTool(
    "todo_complete",
    { ...meta("todo_complete"), inputSchema: IdInput, outputSchema: TodoOut },
    ({ id }) =>
      guarded("todo_complete", async () => {
        const todo = await store.todos.complete(id);
        return ok(describeChange("Completed", todo), toOutput(todo, tz));
      }),
  );

  const todo_delete = server.registerTool(
    "todo_delete",
    { ...meta("todo_delete"), inputSchema: IdInput, outputSchema: DeleteOut },
    ({ id }) =>
      guarded("todo_delete", async () => {
        const todo = await store.todos.getOrThrow(id);
        await store.todos.delete(id);
        return ok(describeChange("Deleted", todo), { deleted: true, id });
      }),
  );

  const todo_current_time = server.registerTool(
    "todo_current_time",
    { ...meta("todo_current_time"), outputSchema: TimeOut },
    () =>
      guarded("todo_current_time", async () => {
        const info = currentTimeInfo(Date.now(), tz);
        return ok(
          `Local: ${info.local_time} (${info.weekday}, ${info.timezone}) · UTC: ${info.utc_time}`,
          info,
        );
      }),
  );

  return { todo_add, todo_list, todo_update, todo_complete, todo_delete, todo_current_time };
}
