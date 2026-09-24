import { homedir } from "node:os";
import { join } from "node:path";

/** Bundle identifier; must match `identifier` in tauri.conf.json. */
export const APP_ID = "com.example.todomcp";
export const DB_FILE = "todos.db";
export const DB_PATH_ENV = "TODO_DB_PATH";

export interface PathEnv {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  home?: string;
}

/**
 * Directory Tauri's `app_data_dir()` resolves to for this identifier.
 * Windows: %APPDATA%\<id> · macOS: ~/Library/Application Support/<id> · Linux: $XDG_DATA_HOME/<id>
 */
export function appDataDir(opts: PathEnv = {}): string {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  switch (platform) {
    case "win32":
      return join(env.APPDATA ?? join(home, "AppData", "Roaming"), APP_ID);
    case "darwin":
      return join(home, "Library", "Application Support", APP_ID);
    default:
      return join(env.XDG_DATA_HOME ?? join(home, ".local", "share"), APP_ID);
  }
}

/** `TODO_DB_PATH` wins; otherwise the platform data dir. */
export function resolveDbPath(opts: PathEnv = {}): string {
  const env = opts.env ?? process.env;
  const override = env[DB_PATH_ENV]?.trim();
  if (override) return override;
  return join(appDataDir(opts), DB_FILE);
}
