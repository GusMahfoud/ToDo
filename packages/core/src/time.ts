/**
 * Time helpers. Storage is always unix ms (UTC). The MCP server accepts and
 * returns ISO 8601 strings *with an offset* so the model never has to guess a zone.
 */

export class TimeError extends Error {}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})$/;

export const OFFSET_HINT =
  "Times must be ISO 8601 with a UTC offset, e.g. 2026-09-24T09:00:00-04:00";

/** Parses an ISO 8601 timestamp that carries an explicit offset (or Z). */
export function parseIsoWithOffset(value: string): number {
  const trimmed = value.trim();
  if (!ISO_WITH_OFFSET.test(trimmed)) {
    throw new TimeError(`Invalid time "${value}". ${OFFSET_HINT}`);
  }
  const ms = Date.parse(trimmed);
  if (Number.isNaN(ms)) throw new TimeError(`Unparseable time "${value}". ${OFFSET_HINT}`);
  return ms;
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
}

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = partFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
    });
    partFormatters.set(timeZone, f);
  }
  return f;
}

function wallClockParts(ms: number, timeZone: string): Parts {
  const out: Record<string, string> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: out.weekday ?? "",
  };
}

/** Offset of `timeZone` from UTC at instant `ms`, in minutes (east positive). */
export function offsetMinutes(ms: number, timeZone: string): number {
  const p = wallClockParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const wholeSeconds = ms - (((ms % 1000) + 1000) % 1000);
  return Math.round((asUtc - wholeSeconds) / 60_000);
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  return `${sign}${pad(Math.trunc(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
}

/** `2026-09-24T09:00:00-04:00` in the given zone (defaults to the local zone). */
export function toIsoWithOffset(ms: number, timeZone: string = localTimeZone()): string {
  const p = wallClockParts(ms, timeZone);
  const off = formatOffset(offsetMinutes(ms, timeZone));
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${off}`;
}

export function toIsoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface CurrentTimeInfo {
  local_time: string;
  utc_time: string;
  timezone: string;
  weekday: string;
  unix_ms: number;
}

export function currentTimeInfo(now = Date.now(), timeZone = localTimeZone()): CurrentTimeInfo {
  return {
    local_time: toIsoWithOffset(now, timeZone),
    utc_time: toIsoUtc(now),
    timezone: timeZone,
    weekday: wallClockParts(now, timeZone).weekday,
    unix_ms: now,
  };
}

export const msOrNull = (iso: string | null | undefined): number | null | undefined =>
  iso === undefined ? undefined : iso === null ? null : parseIsoWithOffset(iso);

export const isoOrNull = (ms: number | null, timeZone?: string): string | null =>
  ms === null ? null : toIsoWithOffset(ms, timeZone);
