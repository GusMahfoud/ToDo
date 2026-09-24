/** Display-side time helpers. Storage is UTC ms; everything here is local time. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Value for `<input type="datetime-local">` (local wall clock, minute precision). */
export function toDateTimeLocal(ms: number | null): string {
  if (ms === null) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function startOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfToday(now = Date.now()): number {
  return startOfToday(now) + 24 * 60 * 60 * 1000 - 1;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const fullFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Today 3:00 PM", "Tomorrow 9:00 AM", "Sep 30 10:00 AM", "Overdue · Sep 20". */
export function relativeDue(ms: number, now = Date.now()): { label: string; overdue: boolean } {
  const dayMs = 86_400_000;
  const dayIndex = Math.floor((ms - startOfToday(now)) / dayMs);
  const time = timeFmt.format(ms);
  if (ms < now) return { label: `Overdue · ${dateFmt.format(ms)} ${time}`, overdue: true };
  if (dayIndex === 0) return { label: `Today ${time}`, overdue: false };
  if (dayIndex === 1) return { label: `Tomorrow ${time}`, overdue: false };
  if (dayIndex < 7) {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(ms);
    return { label: `${weekday} ${time}`, overdue: false };
  }
  return { label: `${dateFmt.format(ms)} ${time}`, overdue: false };
}

export function formatFull(ms: number): string {
  return fullFmt.format(ms);
}

export const PRIORITY_LABELS = ["None", "Low", "Medium", "High"] as const;

/** Human label for the `source` column: 'ui' → You, 'mcp:cursor' → Cursor, 'cli' → CLI. */
export function sourceLabel(source: string): string | null {
  if (source === "ui") return null;
  if (source === "cli") return "CLI";
  if (source === "mcp") return "AI";
  if (source.startsWith("mcp:")) {
    const client = source.slice(4);
    return client.charAt(0).toUpperCase() + client.slice(1);
  }
  if (source.startsWith("webhook:")) return `Webhook · ${source.slice(8)}`;
  return source;
}

export function parseTagInput(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((t) => t.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);
}
