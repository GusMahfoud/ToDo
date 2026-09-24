import type { Db } from "./db";
import { isToolName, TOOL_DEFAULTS, TOOL_NAMES, type ToolName } from "./tools";
import type { ToolConfigRow } from "./types";

/** Effective configuration for one tool, defaults already applied. */
export interface ToolConfig {
  name: ToolName;
  title: string;
  enabled: boolean;
  /** The description the AI will see. */
  description: string;
  /** True when `description` is the built-in default (no user override). */
  isDefaultDescription: boolean;
  defaultDescription: string;
  updated_at: number;
}

function merge(name: ToolName, row: ToolConfigRow | undefined): ToolConfig {
  const def = TOOL_DEFAULTS[name];
  const override = row?.description?.trim() ? row.description : null;
  return {
    name,
    title: def.title,
    enabled: row ? row.enabled !== 0 : def.enabledByDefault,
    description: override ?? def.description,
    isDefaultDescription: override === null,
    defaultDescription: def.description,
    updated_at: row?.updated_at ?? 0,
  };
}

export class ConfigRepo {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  /** Inserts a row per known tool if missing (first run, or after a new tool ships). */
  async seedDefaults(): Promise<void> {
    const existing = new Set((await this.rows()).map((r) => r.name));
    const missing = TOOL_NAMES.filter((n) => !existing.has(n));
    if (missing.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const name of missing) {
        await tx.exec(
          "INSERT OR IGNORE INTO tool_config (name, enabled, description, updated_at) VALUES (?, ?, NULL, ?)",
          [name, TOOL_DEFAULTS[name].enabledByDefault ? 1 : 0, this.now()],
        );
      }
    });
  }

  private rows(): Promise<ToolConfigRow[]> {
    return this.db.select<ToolConfigRow>(
      "SELECT name, enabled, description, updated_at FROM tool_config",
    );
  }

  async list(): Promise<ToolConfig[]> {
    const byName = new Map((await this.rows()).map((r) => [r.name, r]));
    return TOOL_NAMES.map((name) => merge(name, byName.get(name)));
  }

  async get(name: ToolName): Promise<ToolConfig> {
    const rows = await this.db.select<ToolConfigRow>(
      "SELECT name, enabled, description, updated_at FROM tool_config WHERE name = ?",
      [name],
    );
    return merge(name, rows[0]);
  }

  async setEnabled(name: ToolName, enabled: boolean): Promise<ToolConfig> {
    await this.upsert(name, { enabled });
    return this.get(name);
  }

  /** `null` (or blank) restores the built-in default description. */
  async setDescription(name: ToolName, description: string | null): Promise<ToolConfig> {
    const clean = description?.trim() ? description.trim() : null;
    await this.upsert(name, { description: clean });
    return this.get(name);
  }

  private async upsert(
    name: ToolName,
    patch: { enabled?: boolean; description?: string | null },
  ): Promise<void> {
    if (!isToolName(name)) throw new Error(`Unknown tool ${name}`);
    await this.db.transaction(async (tx) => {
      const current = merge(
        name,
        (await this.rows()).find((r) => r.name === name),
      );
      const enabled = patch.enabled ?? current.enabled;
      const description =
        patch.description !== undefined
          ? patch.description
          : current.isDefaultDescription
            ? null
            : current.description;
      await tx.exec(
        `INSERT INTO tool_config (name, enabled, description, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET enabled = excluded.enabled,
           description = excluded.description, updated_at = excluded.updated_at`,
        [name, enabled ? 1 : 0, description, this.now()],
      );
    });
  }

  async seq(): Promise<number> {
    const rows = await this.db.select<{ value: number }>(
      "SELECT value FROM meta WHERE key = 'config_seq'",
    );
    return rows[0]?.value ?? 0;
  }
}
