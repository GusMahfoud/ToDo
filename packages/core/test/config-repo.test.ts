import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SETTING_KEYS } from "../src/schema";
import { TOOL_DEFAULTS, TOOL_NAMES } from "../src/tools";
import { openTempStore } from "./helpers";

describe("ConfigRepo", () => {
  let ctx: Awaited<ReturnType<typeof openTempStore>>;
  beforeEach(async () => {
    ctx = await openTempStore();
  });
  afterEach(() => ctx.cleanup());

  test("seeds one row per tool with the shipped defaults", async () => {
    const list = await ctx.store.config.list();
    expect(list.map((c) => c.name)).toEqual([...TOOL_NAMES]);
    for (const cfg of list) {
      expect(cfg.enabled).toBe(TOOL_DEFAULTS[cfg.name].enabledByDefault);
      expect(cfg.isDefaultDescription).toBe(true);
      expect(cfg.description).toBe(TOOL_DEFAULTS[cfg.name].description);
    }
    expect((await ctx.store.config.get("todo_delete")).enabled).toBe(false);
    expect(await ctx.store.config.seq()).toBe(TOOL_NAMES.length);
  });

  test("toggling and overriding bumps config_seq and is independent", async () => {
    const c = ctx.store.config;
    const before = await c.seq();
    const off = await c.setEnabled("todo_update", false);
    expect(off.enabled).toBe(false);
    expect(await c.seq()).toBe(before + 1);

    const custom = await c.setDescription("todo_update", "  Only touch tags.  ");
    expect(custom.description).toBe("Only touch tags.");
    expect(custom.isDefaultDescription).toBe(false);
    expect(custom.enabled).toBe(false);

    const reset = await c.setDescription("todo_update", "   ");
    expect(reset.isDefaultDescription).toBe(true);
    expect(reset.description).toBe(TOOL_DEFAULTS.todo_update.description);
    expect(reset.enabled).toBe(false);
  });

  test("settings round-trip", async () => {
    const s = ctx.store.settings;
    expect(await s.get(SETTING_KEYS.theme)).toBeNull();
    await s.set(SETTING_KEYS.theme, "dark");
    await s.set(SETTING_KEYS.remindersPausedUntil, 12345);
    expect(await s.get(SETTING_KEYS.theme)).toBe("dark");
    expect(await s.getNumber(SETTING_KEYS.remindersPausedUntil)).toBe(12345);
    await s.delete(SETTING_KEYS.theme);
    expect(await s.all()).toEqual({ [SETTING_KEYS.remindersPausedUntil]: "12345" });
  });
});
