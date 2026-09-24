import { ConfigRepo } from "./config-repo";
import type { Db } from "./db";
import { migrate } from "./migrate";
import { SettingsRepo } from "./settings-repo";
import { TodoRepo } from "./todo-repo";

/**
 * Facade over one database connection. Both processes create one of these on
 * startup; `Store.open` migrates and seeds so callers never see a half-built DB.
 */
export class Store {
  readonly todos: TodoRepo;
  readonly config: ConfigRepo;
  readonly settings: SettingsRepo;

  constructor(
    readonly db: Db,
    now: () => number = Date.now,
  ) {
    this.todos = new TodoRepo(db, now);
    this.config = new ConfigRepo(db, now);
    this.settings = new SettingsRepo(db);
  }

  static async open(db: Db, now: () => number = Date.now): Promise<Store> {
    await migrate(db);
    const store = new Store(db, now);
    await store.config.seedDefaults();
    return store;
  }

  close(): Promise<void> {
    return this.db.close();
  }
}
