/**
 * Schema migrations. `MIGRATIONS[n - 1]` brings the database to `user_version = n`.
 * Each migration is a list of single statements so both adapters can run them
 * without needing multi-statement support. Never edit a shipped migration; append.
 */
export const MIGRATIONS: readonly (readonly string[])[] = [
  // ---- v1: todos, tool_config, settings, meta + change counters ----
  [
    `CREATE TABLE todos (
      id           INTEGER PRIMARY KEY,
      title        TEXT    NOT NULL,
      notes        TEXT,
      status       TEXT    NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','done','archived')),
      priority     INTEGER NOT NULL DEFAULT 0,
      tags         TEXT    NOT NULL DEFAULT '[]',
      due_at       INTEGER,
      remind_at    INTEGER,
      reminded_at  INTEGER,
      source       TEXT    NOT NULL DEFAULT 'ui',
      assignee     TEXT    NOT NULL DEFAULT 'me',
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      completed_at INTEGER
    )`,
    "CREATE INDEX todos_status_due ON todos(status, due_at)",
    "CREATE INDEX todos_remind ON todos(remind_at) WHERE reminded_at IS NULL",
    `CREATE TABLE tool_config (
      name        TEXT PRIMARY KEY,
      enabled     INTEGER NOT NULL,
      description TEXT,
      updated_at  INTEGER NOT NULL
    )`,
    "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    "CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)",
    "INSERT INTO meta VALUES ('todos_seq', 0), ('config_seq', 0)",
    "CREATE TRIGGER todos_ai AFTER INSERT ON todos BEGIN UPDATE meta SET value = value + 1 WHERE key = 'todos_seq'; END",
    "CREATE TRIGGER todos_au AFTER UPDATE ON todos BEGIN UPDATE meta SET value = value + 1 WHERE key = 'todos_seq'; END",
    "CREATE TRIGGER todos_ad AFTER DELETE ON todos BEGIN UPDATE meta SET value = value + 1 WHERE key = 'todos_seq'; END",
    "CREATE TRIGGER cfg_ai AFTER INSERT ON tool_config BEGIN UPDATE meta SET value = value + 1 WHERE key = 'config_seq'; END",
    "CREATE TRIGGER cfg_au AFTER UPDATE ON tool_config BEGIN UPDATE meta SET value = value + 1 WHERE key = 'config_seq'; END",
  ],
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** Setting keys shared between the UI, the MCP server and the Rust reminder loop. */
export const SETTING_KEYS = {
  /** unix ms; reminders are suppressed while now < value */
  remindersPausedUntil: "reminders_paused_until",
  /** minutes before due_at used when the UI auto-fills remind_at */
  defaultReminderLeadMinutes: "default_reminder_lead_minutes",
  /** "system" | "light" | "dark" */
  theme: "theme",
} as const;
