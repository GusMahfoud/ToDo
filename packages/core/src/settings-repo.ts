import type { Db } from "./db";

/** Simple key/value settings shared by every process. Values are strings. */
export class SettingsRepo {
  constructor(private readonly db: Db) {}

  async get(key: string): Promise<string | null> {
    const rows = await this.db.select<{ value: string }>(
      "SELECT value FROM settings WHERE key = ?",
      [key],
    );
    return rows[0]?.value ?? null;
  }

  async getNumber(key: string): Promise<number | null> {
    const raw = await this.get(key);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  async set(key: string, value: string | number): Promise<void> {
    await this.db.exec(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, String(value)],
    );
  }

  async delete(key: string): Promise<void> {
    await this.db.exec("DELETE FROM settings WHERE key = ?", [key]);
  }

  async all(): Promise<Record<string, string>> {
    const rows = await this.db.select<{ key: string; value: string }>(
      "SELECT key, value FROM settings",
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}
