import { useEffect } from "react";

export interface Shortcuts {
  /** Ctrl/Cmd+N */
  newTodo?: () => void;
  /** Ctrl/Cmd+F */
  search?: () => void;
  /** Ctrl/Cmd+, */
  settings?: () => void;
  /** Escape */
  escape?: () => void;
}

const isEditable = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** App-wide keyboard shortcuts. Escape also fires from inputs (to close the detail pane). */
export function useShortcuts(s: Shortcuts): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        s.escape?.();
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      const key = e.key.toLowerCase();
      const action =
        key === "n" ? s.newTodo : key === "f" ? s.search : key === "," ? s.settings : undefined;
      if (!action) return;
      if (key === "f" && isEditable(e.target) && !(e.target as HTMLElement).dataset.shortcutTarget)
        return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);
}
