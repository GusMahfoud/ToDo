import { describe, expect, test } from "bun:test";
import {
  currentTimeInfo,
  offsetMinutes,
  parseIsoWithOffset,
  TimeError,
  toIsoUtc,
  toIsoWithOffset,
} from "../src/time";

const NY = "America/New_York";

describe("time", () => {
  test("parses ISO with offset or Z", () => {
    expect(parseIsoWithOffset("2026-09-24T09:00:00-04:00")).toBe(Date.UTC(2026, 8, 24, 13));
    expect(parseIsoWithOffset("2026-09-24T13:00Z")).toBe(Date.UTC(2026, 8, 24, 13));
    expect(parseIsoWithOffset("2026-09-24T09:00:00.500+0100")).toBe(
      Date.UTC(2026, 8, 24, 8, 0, 0, 500),
    );
  });

  test("rejects times without an offset, with a hint", () => {
    expect(() => parseIsoWithOffset("2026-09-24T09:00:00")).toThrow(TimeError);
    expect(() => parseIsoWithOffset("tomorrow")).toThrow(/UTC offset/);
    expect(() => parseIsoWithOffset("2026-13-40T09:00:00Z")).toThrow(TimeError);
  });

  test("formats with the zone's offset across the DST boundary", () => {
    // US DST 2026 starts 2026-03-08 at 02:00 local (07:00Z) and ends 2026-11-01.
    const beforeSpring = Date.UTC(2026, 2, 8, 6, 30); // 01:30 EST
    const afterSpring = Date.UTC(2026, 2, 8, 7, 30); // 03:30 EDT
    expect(offsetMinutes(beforeSpring, NY)).toBe(-300);
    expect(offsetMinutes(afterSpring, NY)).toBe(-240);
    expect(toIsoWithOffset(beforeSpring, NY)).toBe("2026-03-08T01:30:00-05:00");
    expect(toIsoWithOffset(afterSpring, NY)).toBe("2026-03-08T03:30:00-04:00");

    const beforeFall = Date.UTC(2026, 10, 1, 5, 30); // 01:30 EDT (first pass)
    const afterFall = Date.UTC(2026, 10, 1, 6, 30); // 01:30 EST (second pass)
    expect(toIsoWithOffset(beforeFall, NY)).toBe("2026-11-01T01:30:00-04:00");
    expect(toIsoWithOffset(afterFall, NY)).toBe("2026-11-01T01:30:00-05:00");
  });

  test("round-trips through parse and format in several zones", () => {
    const ms = Date.UTC(2026, 8, 24, 13, 0, 0);
    for (const tz of [NY, "Europe/Berlin", "Asia/Kolkata", "Pacific/Auckland", "UTC"]) {
      expect(parseIsoWithOffset(toIsoWithOffset(ms, tz))).toBe(ms);
    }
    expect(toIsoWithOffset(ms, "Asia/Kolkata")).toBe("2026-09-24T18:30:00+05:30");
    expect(toIsoUtc(ms)).toBe("2026-09-24T13:00:00Z");
  });

  test("currentTimeInfo reports zone, weekday and both clocks", () => {
    const info = currentTimeInfo(Date.UTC(2026, 8, 24, 13), NY);
    expect(info).toEqual({
      local_time: "2026-09-24T09:00:00-04:00",
      utc_time: "2026-09-24T13:00:00Z",
      timezone: NY,
      weekday: "Thursday",
      unix_ms: Date.UTC(2026, 8, 24, 13),
    });
  });
});
