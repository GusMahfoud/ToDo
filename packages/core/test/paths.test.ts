import { describe, expect, test } from "bun:test";
import { APP_ID, appDataDir, resolveDbPath } from "../src/paths";

describe("paths", () => {
  test("matches Tauri's app_data_dir per platform, regardless of host OS", () => {
    expect(
      appDataDir({ platform: "win32", env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" } }),
    ).toBe(`C:\\Users\\me\\AppData\\Roaming\\${APP_ID}`);
    expect(appDataDir({ platform: "darwin", home: "/Users/me", env: {} })).toBe(
      `/Users/me/Library/Application Support/${APP_ID}`,
    );
    expect(appDataDir({ platform: "linux", home: "/home/me", env: {} })).toBe(
      `/home/me/.local/share/${APP_ID}`,
    );
    expect(
      appDataDir({ platform: "linux", home: "/home/me", env: { XDG_DATA_HOME: "/data" } }),
    ).toBe(`/data/${APP_ID}`);
  });

  test("TODO_DB_PATH overrides everything", () => {
    expect(resolveDbPath({ env: { TODO_DB_PATH: "/tmp/x.db" }, platform: "linux" })).toBe(
      "/tmp/x.db",
    );
    expect(resolveDbPath({ env: { TODO_DB_PATH: "   " }, platform: "linux", home: "/h" })).toBe(
      `/h/.local/share/${APP_ID}/todos.db`,
    );
  });
});
