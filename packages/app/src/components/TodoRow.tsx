import type { Todo } from "@todomcp/core";
import { relativeDue, sourceLabel } from "../lib/format";
import { Badge } from "./ui";

export function TodoRow({
  todo,
  selected,
  onSelect,
  onToggle,
}: {
  todo: Todo;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const due = todo.due_at !== null ? relativeDue(todo.due_at) : null;
  const source = sourceLabel(todo.source);
  const done = todo.status === "done";

  return (
    <li className={`todo-row ${selected ? "is-selected" : ""} ${done ? "is-done" : ""}`}>
      <input
        type="checkbox"
        className="todo-check"
        checked={done}
        onChange={onToggle}
        aria-label={done ? `Reopen ${todo.title}` : `Complete ${todo.title}`}
      />
      <button type="button" className="todo-main" onClick={onSelect}>
        <span className="todo-title">
          {todo.priority > 0 && (
            <span
              className={`prio prio-${todo.priority}`}
              role="img"
              aria-label={`priority ${todo.priority}`}
            />
          )}
          {todo.title}
        </span>
        <span className="todo-meta">
          {due && (
            <span className={`due ${due.overdue && !done ? "is-overdue" : ""}`}>{due.label}</span>
          )}
          {todo.remind_at !== null && !done && (
            <span className="meta-icon" title="Reminder set">
              ⏰
            </span>
          )}
          {todo.tags.map((t) => (
            <span key={t} className="tag">
              #{t}
            </span>
          ))}
          {source && <Badge tone="accent">{source}</Badge>}
        </span>
      </button>
    </li>
  );
}
