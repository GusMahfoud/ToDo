import type { Todo } from "@todomcp/core";
import { TodoRow } from "./TodoRow";
import { EmptyState } from "./ui";

export function TodoList({
  todos,
  selectedId,
  onSelect,
  onToggle,
  emptyTitle,
  emptyHint,
}: {
  todos: Todo[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onToggle: (todo: Todo) => void;
  emptyTitle: string;
  emptyHint?: string | undefined;
}) {
  if (todos.length === 0) return <EmptyState title={emptyTitle} hint={emptyHint} />;
  return (
    <ul className="todo-list">
      {todos.map((todo) => (
        <TodoRow
          key={todo.id}
          todo={todo}
          selected={todo.id === selectedId}
          onSelect={() => onSelect(todo.id)}
          onToggle={() => onToggle(todo)}
        />
      ))}
    </ul>
  );
}
