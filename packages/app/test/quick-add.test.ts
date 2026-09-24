import { describe, expect, test } from "bun:test";
import { parseQuickAdd } from "../src/lib/quick-add";

describe("parseQuickAdd", () => {
  test("extracts tags and priority, keeps the rest as title", () => {
    expect(parseQuickAdd("Call dentist #health #Calls !3")).toEqual({
      title: "Call dentist",
      tags: ["health", "calls"],
      priority: 3,
    });
  });

  test("plain text passes through; odd tokens stay in the title", () => {
    expect(parseQuickAdd("  buy milk  ")).toEqual({ title: "buy milk", tags: [], priority: 0 });
    expect(parseQuickAdd("fix issue #12 !9 !")).toEqual({
      title: "fix issue !9 !",
      tags: ["12"],
      priority: 0,
    });
  });

  test("dedupes tags", () => {
    expect(parseQuickAdd("#a #a #b x").tags).toEqual(["a", "b"]);
  });
});
