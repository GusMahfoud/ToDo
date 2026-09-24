import type { Todo, TodoPatch } from "@todomcp/core";
import { useEffect, useState } from "react";
import {
  formatFull,
  fromDateTimeLocal,
  PRIORITY_LABELS,
  parseTagInput,
  sourceLabel,
  toDateTimeLocal,
} from "../lib/format";
import { Button, Field } from "./ui";

export function TodoDetail({
  todo,
  reminderLeadMinutes,
  onSave,
  onDelete,
  onClose,
}: {
  todo: Todo;
  reminderLeadMinutes: number;
  onSave: (patch: TodoPatch) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? "");
  const [priority, setPriority] = useState(todo.priority);
  const [tags, setTags] = useState(todo.tags.join(", "));
  const [due, setDue] = useState(toDateTimeLocal(todo.due_at));
  const [remind, setRemind] = useState(toDateTimeLocal(todo.remind_at));
  const [saving, setSaving] = useState(false);

  // Re-sync when another process edits the selected item.
  useEffect(() => {
    setTitle(todo.title);
    setNotes(todo.notes ?? "");
    setPriority(todo.priority);
    setTags(todo.tags.join(", "));
    setDue(toDateTimeLocal(todo.due_at));
    setRemind(toDateTimeLocal(todo.remind_at));
  }, [todo]);

  const dirty =
    title.trim() !== todo.title ||
    notes !== (todo.notes ?? "") ||
    priority !== todo.priority ||
    parseTagInput(tags).join(",") !== todo.tags.join(",") ||
    fromDateTimeLocal(due) !== todo.due_at ||
    fromDateTimeLocal(remind) !== todo.remind_at;

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        notes: notes.trim() ? notes : null,
        priority,
        tags: parseTagInput(tags),
        due_at: fromDateTimeLocal(due),
        remind_at: fromDateTimeLocal(remind),
      });
    } finally {
      setSaving(false);
    }
  };

  const suggestReminder = () => {
    const dueMs = fromDateTimeLocal(due);
    if (dueMs !== null) setRemind(toDateTimeLocal(dueMs - reminderLeadMinutes * 60_000));
  };

  const source = sourceLabel(todo.source);

  return (
    <aside className="detail" aria-label="Todo details">
      <header className="detail-header">
        <span className="detail-id">#{todo.id}</span>
        <Button size="sm" onClick={onClose} aria-label="Close details">
          ✕
        </Button>
      </header>

      <Field label="Title">
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Notes">
        <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="detail-grid">
        <Field label="Due">
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Field label="Remind">
          <div className="row">
            <input
              type="datetime-local"
              value={remind}
              onChange={(e) => setRemind(e.target.value)}
            />
            {due && (
              <Button
                size="sm"
                onClick={suggestReminder}
                title={`${reminderLeadMinutes} min before due`}
              >
                −{reminderLeadMinutes}m
              </Button>
            )}
          </div>
        </Field>
        <Field label="Priority">
          <select value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {PRIORITY_LABELS.map((label, i) => (
              <option key={label} value={i}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tags" hint="Comma or space separated">
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="work, calls" />
        </Field>
      </div>

      <dl className="detail-facts">
        <dt>Created</dt>
        <dd>
          {formatFull(todo.created_at)}
          {source ? ` · by ${source}` : ""}
        </dd>
        {todo.completed_at !== null && (
          <>
            <dt>Completed</dt>
            <dd>{formatFull(todo.completed_at)}</dd>
          </>
        )}
        {todo.reminded_at !== null && (
          <>
            <dt>Reminded</dt>
            <dd>{formatFull(todo.reminded_at)}</dd>
          </>
        )}
      </dl>

      <footer className="detail-actions">
        <Button variant="danger" size="sm" onClick={onDelete}>
          Delete
        </Button>
        <span className="spacer" />
        <Button variant="primary" onClick={save} disabled={!dirty || !title.trim() || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </footer>
    </aside>
  );
}
