/**
 * The MCP tool catalogue: names, default "prompts" (descriptions) and annotations.
 * Users override `enabled` and `description` per tool from the app; these are the fallbacks.
 */

export const TOOL_NAMES = [
  "todo_add",
  "todo_list",
  "todo_update",
  "todo_complete",
  "todo_delete",
  "todo_current_time",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefault {
  title: string;
  description: string;
  enabledByDefault: boolean;
  annotations: ToolAnnotations;
}

const TIME_RULES =
  "Times must be ISO 8601 with a UTC offset (e.g. 2026-09-24T09:00:00-04:00). " +
  "If you don't know the current date/time, call todo_current_time first.";

export const TOOL_DEFAULTS: Record<ToolName, ToolDefault> = {
  todo_add: {
    title: "Add todo",
    enabledByDefault: true,
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    description:
      "Add an item to the user's personal todo list. Use this whenever the user asks you to " +
      'remember, track, or be reminded of something, or says "add to my todo list". ' +
      "Keep the title short (under ~80 chars); put details in notes. " +
      `${TIME_RULES} ` +
      "Only set remind_at if the user asked to be reminded or gave a specific time. " +
      "Priority: 0 none, 1 low, 2 medium, 3 high.",
  },
  todo_list: {
    title: "List todos",
    enabledByDefault: true,
    annotations: { readOnlyHint: true, openWorldHint: false },
    description:
      "List the user's todos. Defaults to open items, soonest due first. Use it to answer " +
      "\"what's on my list\", to find an item's id before updating or completing it, and to " +
      "check for duplicates before adding. Filter by status, tag, due_before, or a search string. " +
      "The result includes the current time so you can tell what is overdue.",
  },
  todo_update: {
    title: "Update todo",
    enabledByDefault: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Change fields on an existing todo: title, notes, priority, tags, due_at, remind_at, or " +
      "status (open, done, archived). Only send the fields that should change; pass null to clear " +
      `a date. Look up the id with todo_list if you don't have it. ${TIME_RULES}`,
  },
  todo_complete: {
    title: "Complete todo",
    enabledByDefault: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Mark a todo as done. Use when the user says they finished, did, or completed something. " +
      "If several open items could match, list them and ask which one instead of guessing.",
  },
  todo_delete: {
    title: "Delete todo",
    enabledByDefault: false,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    description:
      "Permanently delete a todo. Only use when the user explicitly asks to delete or remove an " +
      "item; prefer todo_complete for finished work. Confirm the exact item first if ambiguous.",
  },
  todo_current_time: {
    title: "Current time",
    enabledByDefault: true,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    description:
      "Get the user's current local date and time, UTC time, and IANA timezone. Call this before " +
      'turning relative phrases like "tomorrow at 9" or "next Friday" into timestamps.',
  },
};

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}
