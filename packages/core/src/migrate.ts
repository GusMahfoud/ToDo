import type { Db } from "./db";
import { MIGRATIONS } from "./schema";

/**
 * Applies missing migrations. Safe to run from several processes: the
 * `BEGIN IMMEDIATE` write lock makes "read user_version, apply, bump" atomic,
 * so whichever process wins does the work and the others see nothing to do.
 */
export async function migrate(db: Db): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx.select<{ user_version: number }>("PRAGMA user_version");
    let version = rows[0]?.user_version ?? 0;
    while (version < MIGRATIONS.length) {
      const steps = MIGRATIONS[version];
      if (!steps) break;
      for (const sql of steps) await tx.exec(sql);
      version += 1;
      await tx.exec(`PRAGMA user_version = ${version}`);
    }
    return version;
  });
}
