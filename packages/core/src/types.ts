/** Domain types shared by the MCP server and the desktop UI. All times are unix ms (UTC). */

export type TodoStatus = "open" | "done" | "archived";

export const TODO_STATUSES: readonly TodoStatus[] = ["open", "done", "archived"];

/** 0 none, 1 low, 2 medium, 3 high */
export type Priority = 0 | 1 | 2 | 3;

export interface Todo {
  id: number;
  title: string;
  notes: string | null;
  status: TodoStatus;
  priority: number;
  tags: string[];
  due_at: number | null;
  remind_at: number | null;
  reminded_at: number | null;
  /** 'ui' | 'mcp' | 'mcp:<client>' | later 'webhook:<name>' */
  source: string;
  /** 'me' or, in Phase 2, 'agent:<runner>' */
  assignee: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
}

export interface NewTodo {
  title: string;
  notes?: string | null;
  priority?: number;
  tags?: string[];
  due_at?: number | null;
  remind_at?: number | null;
  source?: string;
  assignee?: string;
}

/** Fields a caller may change. `undefined` means "leave as is"; `null` clears. */
export interface TodoPatch {
  title?: string;
  notes?: string | null;
  status?: TodoStatus;
  priority?: number;
  tags?: string[];
  due_at?: number | null;
  remind_at?: number | null;
  assignee?: string;
}

export interface TodoFilter {
  /** Defaults to "open". "all" returns every status. */
  status?: TodoStatus | "all";
  tag?: string;
  due_before?: number;
  due_after?: number;
  /** Case-insensitive substring match on title and notes. */
  search?: string;
  limit?: number;
}

export interface ToolConfigRow {
  name: string;
  enabled: number;
  description: string | null;
  updated_at: number;
}
