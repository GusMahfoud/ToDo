import type { Row, SqlValue } from "./db";
import type { Todo, TodoStatus } from "./types";

function num(v: SqlValue | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}

function numOrNull(v: SqlValue | undefined): number | null {
  return v === null || v === undefined ? null : num(v);
}

function str(v: SqlValue | undefined, fallback = ""): string {
  return typeof v === "string" ? v : v === null || v === undefined ? fallback : String(v);
}

export function parseTags(raw: SqlValue | undefined): string[] {
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function normalizeTags(tags: readonly string[] | undefined): string[] {
  if (!tags) return [];
  const seen = new Set<string>();
  for (const t of tags) {
    const clean = t.trim().toLowerCase();
    if (clean) seen.add(clean);
  }
  return [...seen];
}

export function rowToTodo(row: Row): Todo {
  return {
    id: num(row.id),
    title: str(row.title),
    notes: row.notes === null || row.notes === undefined ? null : str(row.notes),
    status: str(row.status, "open") as TodoStatus,
    priority: num(row.priority),
    tags: parseTags(row.tags),
    due_at: numOrNull(row.due_at),
    remind_at: numOrNull(row.remind_at),
    reminded_at: numOrNull(row.reminded_at),
    source: str(row.source, "ui"),
    assignee: str(row.assignee, "me"),
    created_at: num(row.created_at),
    updated_at: num(row.updated_at),
    completed_at: numOrNull(row.completed_at),
  };
}
