/** Node/Bun-only additions: filesystem paths and the bun:sqlite adapter. */
import { BunDb } from "./db-bun";
import { resolveDbPath } from "./paths";
import { Store } from "./store";

export { BunDb } from "./db-bun";
export * from "./index";
export { APP_ID, appDataDir, DB_FILE, DB_PATH_ENV, type PathEnv, resolveDbPath } from "./paths";

/** Opens (creating and migrating if needed) the store at `path` or the default location. */
export function openBunStore(path: string = resolveDbPath()): Promise<Store> {
  return Store.open(BunDb.open(path));
}
