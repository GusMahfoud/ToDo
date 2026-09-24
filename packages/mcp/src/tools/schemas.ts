import { isoOrNull, OFFSET_HINT, TODO_STATUSES, type Todo } from "@todomcp/core";
import * as z from "zod/v4";

/** ISO 8601 with a mandatory offset (or Z). Error text doubles as guidance for the model. */
export const IsoTime = z.iso.datetime({ offset: true, error: OFFSET_HINT }).describe(OFFSET_HINT);

export const TodoId = z.number().int().positive().describe("Todo id, as returned by todo_list");

export const Priority = z.number().int().min(0).max(3).describe("0 none, 1 low, 2 medium, 3 high");

export const Tags = z
  .array(z.string().min(1).max(40))
  .max(10)
  .describe('Short lowercase labels, e.g. ["work", "calls"]');

export const Status = z.enum(TODO_STATUSES as [string, ...string[]]);

export const AddInput = z.object({
  title: z.string().min(1).max(200).describe("Short summary, under ~80 characters"),
  notes: z.string().max(5000).optional().describe("Details, links, context"),
  due_at: IsoTime.optional(),
  remind_at: IsoTime.optional().describe(`When to fire an OS notification. ${OFFSET_HINT}`),
  priority: Priority.optional(),
  tags: Tags.optional(),
});

export const ListInput = z.object({
  status: z.enum(["open", "done", "archived", "all"]).optional().describe("Defaults to open"),
  tag: z.string().max(40).optional(),
  due_before: IsoTime.optional().describe("Only items due at or before this time"),
  search: z.string().max(200).optional().describe("Case-insensitive match on title and notes"),
  limit: z.number().int().min(1).max(200).optional().describe("Default 25"),
});

export const UpdateInput = z.object({
  id: TodoId,
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(5000).nullable().optional().describe("null clears"),
  status: Status.optional(),
  priority: Priority.optional(),
  tags: Tags.optional(),
  due_at: IsoTime.nullable().optional().describe("null clears"),
  remind_at: IsoTime.nullable()
    .optional()
    .describe("null clears; changing it re-arms the reminder"),
});

export const IdInput = z.object({ id: TodoId });

export const TodoOut = z.object({
  id: z.number(),
  title: z.string(),
  notes: z.string().nullable(),
  status: z.string(),
  priority: z.number(),
  tags: z.array(z.string()),
  due_at: z.string().nullable(),
  remind_at: z.string().nullable(),
  source: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
});
export type TodoOut = z.infer<typeof TodoOut>;

export const ListOut = z.object({
  todos: z.array(TodoOut),
  count: z.number(),
  current_time: z.string(),
  timezone: z.string(),
});

export const DeleteOut = z.object({ deleted: z.boolean(), id: z.number() });

export const TimeOut = z.object({
  local_time: z.string(),
  utc_time: z.string(),
  timezone: z.string(),
  weekday: z.string(),
  unix_ms: z.number(),
});

/** Converts stored ms timestamps to ISO strings in the server's local zone. */
export function toOutput(todo: Todo, timeZone?: string): TodoOut {
  return {
    id: todo.id,
    title: todo.title,
    notes: todo.notes,
    status: todo.status,
    priority: todo.priority,
    tags: todo.tags,
    due_at: isoOrNull(todo.due_at, timeZone),
    remind_at: isoOrNull(todo.remind_at, timeZone),
    source: todo.source,
    created_at: isoOrNull(todo.created_at, timeZone) ?? "",
    updated_at: isoOrNull(todo.updated_at, timeZone) ?? "",
    completed_at: isoOrNull(todo.completed_at, timeZone),
  };
}
