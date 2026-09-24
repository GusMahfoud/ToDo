import { describe, expect, test } from "bun:test";
import { BunDb, Store } from "@todomcp/core/node";
import { parseArgs, runCli } from "../src/cli";

describe("cli", () => {
  test("parses commands and flags", () => {
    expect(parseArgs([]).command).toBe("serve");
    expect(parseArgs(["serve"]).command).toBe("serve");
    expect(parseArgs(["--version"]).command).toBe("version");
    const add = parseArgs([
      "add",
      "Buy",
      "milk",
      "--tag",
      "home",
      "--tag",
      "food",
      "--priority",
      "2",
    ]);
    expect(add.command).toBe("add");
    expect(add.positional).toEqual(["Buy", "milk"]);
    expect(add.flags.tag).toEqual(["home", "food"]);
    expect(() => parseArgs(["bogus"])).toThrow(/Unknown command/);
    expect(() => parseArgs(["add", "x", "--due"])).toThrow(/needs a value/);
  });

  test("add and list against an in-memory store", async () => {
    const store = await Store.open(BunDb.open(":memory:"));
    const out = await runCli(
      parseArgs(["add", "Buy milk", "--tag", "home", "--due", "2026-09-25T10:00:00Z"]),
      store,
    );
    expect(out).toBe("Added #1: Buy milk");
    const list = await runCli(parseArgs(["list"]), store);
    expect(list).toContain("#1");
    expect(list).toContain("Buy milk");
    await expect(runCli(parseArgs(["add"]), store)).rejects.toThrow(/needs a title/);
    await store.close();
  });
});
