import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTauriEvent } from "../hooks/useTauriEvent";

export function QuickAdd({
  onAdd,
  autoFocus,
}: {
  onAdd: (title: string) => Promise<void>;
  autoFocus?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Tray → "Quick add…" shows the window and asks us to focus the input.
  useTauriEvent("quick-add", () => input.current?.focus());
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const clean = title.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await onAdd(clean);
      setTitle("");
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  return (
    <form className="quick-add" onSubmit={submit}>
      <input
        ref={input}
        className="quick-add-input"
        placeholder="Add a todo and press Enter…"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="New todo title"
      />
      <button type="submit" className="btn btn-primary btn-md" disabled={!title.trim() || busy}>
        Add
      </button>
    </form>
  );
}
