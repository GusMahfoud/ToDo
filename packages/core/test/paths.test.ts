import { describe, expect, test } from "bun:test";
import { APP_ID, appDataDir, resolveDbPath } from "../src/paths";

describe("paths", () => {
  test("matches Tauri's app_data_dir per platform", () => {
    expect(
      appDataDir({ platform: "win32", env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" } }),
    ).toBe(
      `C:\\Users\\me\\AppData\\Roaming\\${APP_ID}`.replaceAll(
        "\\",
        process.platform === "win32" ? "\\" : "/",
      ),
    );
    expect(appDataDir({ platform: "darwin", home: "/Users/me", env: {} })).toContain(
      `Library${process.platform === "win32" ? "\\" : "/"}Application Support`,
    );
    const linux = appDataDir({ platform: "linux", home: "/home/me", env: {} });
    expect(linux).toContain(".local");
    expect(
      appDataDir({ platform: "linux", home: "/home/me", env: { XDG_DATA_HOME: "/data" } }),
    ).toContain("data");
  });

  test("TODO_DB_PATH overrides everything", () => {
    expect(resolveDbPath({ env: { TODO_DB_PATH: "/tmp/x.db" }, platform: "linux" })).toBe(
      "/tmp/x.db",
    );
    expect(
      resolveDbPath({ env: { TODO_DB_PATH: "   " }, platform: "linux", home: "/h" }),
    ).toEndWith("todos.db");
  });
});
