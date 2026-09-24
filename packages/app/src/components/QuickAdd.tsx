import { type FormEvent, type RefObject, useEffect, useRef, useState } from "react";
import { useTauriEvent } from "../hooks/useTauriEvent";
import { parseQuickAdd, type QuickAddParse } from "../lib/quick-add";

export function QuickAdd({
  onAdd,
  autoFocus,
  inputRef,
}: {
  onAdd: (parsed: QuickAddParse) => Promise<void>;
  autoFocus?: boolean;
  /** Lets the parent focus the input (Ctrl+N, tray "Quick add…"). */
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const local = useRef<HTMLInputElement>(null);
  const input = inputRef ?? local;

  useTauriEvent("quick-add", () => input.current?.focus());
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus, input]);

  const parsed = parseQuickAdd(text);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.title || busy) return;
    setBusy(true);
    try {
      await onAdd(parsed);
      setText("");
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
        placeholder="Add a todo…  (#tag  !1-3 priority)"
        value={text}
        maxLength={260}
        onChange={(e) => setText(e.target.value)}
        aria-label="New todo"
        data-shortcut-target="quick-add"
      />
      <button type="submit" className="btn btn-primary btn-md" disabled={!parsed.title || busy}>
        Add
      </button>
    </form>
  );
}
