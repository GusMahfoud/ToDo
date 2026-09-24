import type { CallToolResult } from "@modelcontextprotocol/server";
import { isBusyError, NotFoundError, TimeError, type Todo, withBusyRetry } from "@todomcp/core";
import { log } from "../log";
import type { TodoOut } from "./schemas";

export function ok(text: string, structuredContent: unknown): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: structuredContent as never };
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

const PRIORITY_LABEL = ["", " !low", " !med", " !HIGH"] as const;

/** One-line summary a model can read at a glance: `#12 Call dentist (due 2026-09-25T10:00:00-04:00) [health]`. */
export function todoLine(todo: TodoOut): string {
  const parts = [`#${todo.id} ${todo.title}`];
  if (todo.status !== "open") parts.push(`(${todo.status})`);
  if (todo.due_at) parts.push(`(due ${todo.due_at})`);
  if (todo.remind_at) parts.push(`(remind ${todo.remind_at})`);
  if (todo.priority > 0) parts.push(PRIORITY_LABEL[todo.priority] ?? "");
  if (todo.tags.length) parts.push(`[${todo.tags.join(", ")}]`);
  return parts.join(" ");
}

export function describeChange(verb: string, todo: Todo): string {
  return `${verb} #${todo.id}: ${todo.title}`;
}

/**
 * Runs a tool body, mapping known failures to helpful tool errors instead of
 * crashing the server. Locked-database errors get one retry first.
 */
export async function guarded(
  name: string,
  body: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await withBusyRetry(body);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof TimeError) return toolError(err.message);
    if (isBusyError(err)) {
      return toolError("The todo database is busy right now. Try again in a moment.");
    }
    log.error(`${name} failed`, err);
    const message = err instanceof Error ? err.message : String(err);
    return toolError(`${name} failed: ${message}`);
  }
}
