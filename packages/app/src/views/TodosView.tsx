import type { Store, Todo, TodoFilter, TodoPatch } from "@todomcp/core";
import { useCallback, useMemo, useState } from "react";
import { QuickAdd } from "../components/QuickAdd";
import type { View } from "../components/Sidebar";
import { TodoDetail } from "../components/TodoDetail";
import { TodoList } from "../components/TodoList";
import { Notice } from "../components/ui";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { endOfToday } from "../lib/format";

type ListView = Exclude<View, "settings">;

const TITLES: Record<ListView, string> = {
  today: "Today",
  upcoming: "Upcoming",
  all: "All open",
  done: "Done",
};

const EMPTY: Record<ListView, [string, string]> = {
  today: ["Nothing due today", "Items due today or overdue show up here."],
  upcoming: ["Nothing scheduled", "Todos with a future due date appear here."],
  all: ["Your list is empty", "Add something above, or ask your AI client to add a todo."],
  done: ["Nothing completed yet", "Completed todos are kept here."],
};

export function filterFor(view: ListView, now = Date.now()): TodoFilter {
  switch (view) {
    case "today":
      return { status: "open", due_before: endOfToday(now), limit: 200 };
    case "upcoming":
      return { status: "open", due_after: endOfToday(now) + 1, limit: 200 };
    case "all":
      return { status: "open", limit: 200 };
    case "done":
      return { status: "done", limit: 200 };
  }
}

export function TodosView({
  store,
  view,
  seq,
  reminderLeadMinutes,
}: {
  store: Store;
  view: ListView;
  seq: number;
  reminderLeadMinutes: number;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useCallback(() => store.todos.list(filterFor(view)), [store, view]);
  const { data: todos, refresh } = useLiveQuery(query, [view, seq]);

  const selected = useMemo(
    () => todos?.find((t) => t.id === selectedId) ?? null,
    [todos, selectedId],
  );

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError(null);
      refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const add = (title: string) => run(() => store.todos.add({ title, source: "ui" }));
  const toggle = (todo: Todo) =>
    run(() => store.todos.update(todo.id, { status: todo.status === "done" ? "open" : "done" }));
  const save = (patch: TodoPatch) => selected && run(() => store.todos.update(selected.id, patch));
  const remove = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.title}"? This cannot be undone.`)) return;
    await run(() => store.todos.delete(selected.id));
    setSelectedId(null);
  };

  const [emptyTitle, emptyHint] = EMPTY[view];

  return (
    <div className={`todos ${selected ? "has-detail" : ""}`}>
      <section className="todos-main">
        <header className="view-header">
          <h1>{TITLES[view]}</h1>
          {todos && <span className="view-count">{todos.length}</span>}
        </header>
        {view !== "done" && <QuickAdd onAdd={add} autoFocus />}
        {error && <Notice tone="error">{error}</Notice>}
        {todos && (
          <TodoList
            todos={todos}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id === selectedId ? null : id)}
            onToggle={toggle}
            emptyTitle={emptyTitle}
            emptyHint={emptyHint}
          />
        )}
      </section>
      {selected && (
        <TodoDetail
          key={selected.id}
          todo={selected}
          reminderLeadMinutes={reminderLeadMinutes}
          onSave={async (patch) => {
            await save(patch);
          }}
          onDelete={remove}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
