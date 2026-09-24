import type { Db, DbReader, SqlValue } from "./db";
import { normalizeTags, rowToTodo } from "./rows";
import type { NewTodo, Todo, TodoFilter, TodoPatch } from "./types";

export class NotFoundError extends Error {
  constructor(readonly id: number) {
    super(`No todo with id ${id}. Call todo_list to see current ids.`);
  }
}

export const DEFAULT_LIST_LIMIT = 25;
export const MAX_LIST_LIMIT = 200;

const COLUMNS =
  "id, title, notes, status, priority, tags, due_at, remind_at, reminded_at, source, assignee, created_at, updated_at, completed_at";

function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class TodoRepo {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  async add(input: NewTodo): Promise<Todo> {
    const ts = this.now();
    const res = await this.db.exec(
      `INSERT INTO todos (title, notes, priority, tags, due_at, remind_at, source, assignee, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.title.trim(),
        input.notes ?? null,
        input.priority ?? 0,
        JSON.stringify(normalizeTags(input.tags)),
        input.due_at ?? null,
        input.remind_at ?? null,
        input.source ?? "ui",
        input.assignee ?? "me",
        ts,
        ts,
      ],
    );
    return this.getOrThrow(res.lastInsertId);
  }

  async get(id: number, reader: DbReader = this.db): Promise<Todo | null> {
    const rows = await reader.select(`SELECT ${COLUMNS} FROM todos WHERE id = ?`, [id]);
    const row = rows[0];
    return row ? rowToTodo(row) : null;
  }

  async getOrThrow(id: number, reader: DbReader = this.db): Promise<Todo> {
    const todo = await this.get(id, reader);
    if (!todo) throw new NotFoundError(id);
    return todo;
  }

  async list(filter: TodoFilter = {}): Promise<Todo[]> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    const status = filter.status ?? "open";
    if (status !== "all") {
      where.push("status = ?");
      params.push(status);
    }
    if (filter.tag) {
      where.push("EXISTS (SELECT 1 FROM json_each(todos.tags) WHERE json_each.value = ?)");
      params.push(filter.tag.trim().toLowerCase());
    }
    if (filter.due_before !== undefined) {
      where.push("due_at IS NOT NULL AND due_at <= ?");
      params.push(filter.due_before);
    }
    if (filter.due_after !== undefined) {
      where.push("due_at IS NOT NULL AND due_at >= ?");
      params.push(filter.due_after);
    }
    if (filter.search?.trim()) {
      const pattern = likePattern(filter.search.trim());
      where.push("(title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')");
      params.push(pattern, pattern);
    }
    const order =
      status === "done"
        ? "completed_at DESC, updated_at DESC, id DESC"
        : "CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, priority DESC, created_at ASC, id ASC";
    const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIST_LIMIT, 1), MAX_LIST_LIMIT);
    params.push(limit);
    const sql = `SELECT ${COLUMNS} FROM todos ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${order} LIMIT ?`;
    const rows = await this.db.select(sql, params);
    return rows.map(rowToTodo);
  }

  /** Applies a patch. Changing `remind_at` re-arms the reminder; status changes maintain `completed_at`. */
  async update(id: number, patch: TodoPatch): Promise<Todo> {
    return this.db.transaction(async (tx) => {
      const current = await this.getOrThrow(id, tx);
      const sets: string[] = [];
      const params: SqlValue[] = [];
      const set = (col: string, value: SqlValue) => {
        sets.push(`${col} = ?`);
        params.push(value);
      };
      if (patch.title !== undefined) set("title", patch.title.trim());
      if (patch.notes !== undefined) set("notes", patch.notes);
      if (patch.priority !== undefined) set("priority", patch.priority);
      if (patch.tags !== undefined) set("tags", JSON.stringify(normalizeTags(patch.tags)));
      if (patch.due_at !== undefined) set("due_at", patch.due_at);
      if (patch.assignee !== undefined) set("assignee", patch.assignee);
      if (patch.remind_at !== undefined && patch.remind_at !== current.remind_at) {
        set("remind_at", patch.remind_at);
        set("reminded_at", null);
      }
      if (patch.status !== undefined && patch.status !== current.status) {
        set("status", patch.status);
        set("completed_at", patch.status === "done" ? this.now() : null);
      }
      if (sets.length === 0) return current;
      set("updated_at", this.now());
      params.push(id);
      await tx.exec(`UPDATE todos SET ${sets.join(", ")} WHERE id = ?`, params);
      return this.getOrThrow(id, tx);
    });
  }

  complete(id: number): Promise<Todo> {
    return this.update(id, { status: "done" });
  }

  async delete(id: number): Promise<boolean> {
    const res = await this.db.exec("DELETE FROM todos WHERE id = ?", [id]);
    return res.changes > 0;
  }

  /** Change counter bumped by triggers on every write; cheap to poll. */
  async seq(): Promise<number> {
    const rows = await this.db.select<{ value: number }>(
      "SELECT value FROM meta WHERE key = 'todos_seq'",
    );
    return rows[0]?.value ?? 0;
  }

  /**
   * Atomically claims reminders that are due so no process fires one twice.
   * Mirrors the query in the Rust reminder loop; kept here for tests and tooling.
   */
  async claimDueReminders(now = this.now()): Promise<Todo[]> {
    const rows = await this.db.select(
      `UPDATE todos SET reminded_at = ?
       WHERE status = 'open' AND remind_at IS NOT NULL AND remind_at <= ? AND reminded_at IS NULL
       RETURNING ${COLUMNS}`,
      [now, now],
    );
    return rows.map(rowToTodo);
  }
}
