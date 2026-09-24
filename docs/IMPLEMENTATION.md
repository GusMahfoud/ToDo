# TodoMCP — Implementation Plan

> Working name. Rename freely; the bundle identifier used below is `com.example.todomcp`.

A cross-platform desktop todo app (Windows, macOS, Linux incl. Omarchy/Hyprland) that doubles as an MCP server, so AI clients like Cursor, Claude Code, and Claude Desktop can read and write your todos. Users control which tools the AI sees, and what each tool's description (its "prompt") says, from the app's UI.

Phase 1 is the product. Phase 2 (agents working todos, alert intake) is designed here so Phase 1 doesn't paint us into a corner, but nothing in Phase 2 blocks shipping Phase 1.

---

## 1. Goals and non-goals

**Phase 1 goals**

- Installable native app (.exe/.msi, .dmg, AppImage/.deb/.rpm) with its own window, tray icon, native notifications, and launch at login. No browser tab.
- A local stdio MCP server that works in any MCP client and works even when the app isn't open.
- User-curated tools: enable/disable each tool and edit its description from the UI.
- Reminders that fire as OS notifications.
- One-click (or one-copy) setup for the common AI clients.

**Non-goals for Phase 1**

- Cloud sync, accounts, multi-device, sharing.
- Built-in calendar sync. Users can pair this MCP with a calendar MCP in their AI client; `.ics` export is a later nice-to-have.
- Remote/HTTP MCP transport. Local stdio only.

---

## 2. Architecture

Two programs, one SQLite file.

```
Me ──► AI client (Cursor / Claude Code / Claude Desktop / others)
          │ launches as a child process, talks over stdio
          ▼
      todo-mcp  (Bun-compiled TypeScript binary)
          │ reads/writes
          ▼
      todos.db  (SQLite, WAL mode)
      tasks + tool config + settings
          ▲
          │ reads/writes
      TodoMCP desktop app  (Tauri: TS/React UI + thin Rust shell)
      window · tray · reminders · autostart · settings
```

**Why this shape**

- MCP clients launch stdio servers themselves and kill them when the session ends, so the MCP server can't also be the long-running app that owns the tray and fires reminders.
- The database is the only integration point. The app never needs to know which AI client is in use, and the MCP server never needs the app running.
- SQLite in WAL mode with a busy timeout handles two or three processes reading and writing the same file safely.

**Key decisions**

| Decision | Choice | Reason |
|---|---|---|
| Desktop shell | Tauri 2 | Native installers on all 3 OSes, small binaries, official tray/notification/autostart/SQL/updater plugins, UI in TS |
| UI | React + Vite + TypeScript | Most common, easy to hire/help for. Svelte is a fine swap |
| MCP server | TypeScript, official MCP SDK v2 (`@modelcontextprotocol/server`) | Most mature SDK; shares code with UI |
| MCP runtime/packaging | Bun, `bun build --compile` | Standalone binary, no Node install required, cross-compiles per target |
| Storage | SQLite (`bun:sqlite` in MCP, `tauri-plugin-sql` in UI, `rusqlite` in the reminder loop) | Local, zero-config, multi-process safe in WAL mode |
| Timestamps | INTEGER unix milliseconds, UTC | No string-format mismatches between JS, Rust, and SQL |
| Rust footprint | Tray, window lifecycle, reminder loop, a few commands | The one place that must run reliably while the window is hidden |

---

## 3. Repo layout

Bun workspaces monorepo.

```
todomcp/
├─ packages/
│  ├─ core/            # schema, migrations, queries, tool defaults, path resolution
│  │  ├─ src/schema.ts         # migration SQL strings
│  │  ├─ src/store.ts          # Store class over a Db interface
│  │  ├─ src/db-bun.ts         # Db adapter for bun:sqlite (used by MCP)
│  │  ├─ src/db-tauri.ts       # Db adapter for tauri-plugin-sql (used by UI)
│  │  ├─ src/tools.ts          # default tool names + descriptions
│  │  └─ src/paths.ts          # resolveDbPath()
│  ├─ mcp/             # the todo-mcp binary
│  │  └─ src/index.ts
│  └─ app/             # Tauri app
│     ├─ src/                  # React UI
│     └─ src-tauri/
│        ├─ src/main.rs
│        ├─ src/reminders.rs
│        ├─ src/commands.rs
│        ├─ binaries/          # compiled todo-mcp sidecars land here (gitignored)
│        └─ tauri.conf.json
├─ scripts/
│  └─ build-sidecar.ts         # bun build --compile for the current/target triple
├─ packaging/aur/PKGBUILD
└─ .github/workflows/release.yml
```

`core` exposes one async `Db` interface (`exec`, `select`, `transaction`) so the same `Store` query code runs on both `bun:sqlite` (sync, wrapped in promises) and `tauri-plugin-sql` (async).

---

## 4. Data model

All times are INTEGER unix ms (UTC). The UI converts to local time for display; the MCP server converts ISO 8601 input to ms.

```sql
-- Migration 1
CREATE TABLE todos (
  id           INTEGER PRIMARY KEY,          -- short ids are easy for an AI to reference
  title        TEXT    NOT NULL,
  notes        TEXT,
  status       TEXT    NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','done','archived')),
  priority     INTEGER NOT NULL DEFAULT 0,   -- 0 none, 1 low, 2 med, 3 high
  tags         TEXT    NOT NULL DEFAULT '[]',-- JSON array of strings
  due_at       INTEGER,
  remind_at    INTEGER,
  reminded_at  INTEGER,                      -- set when the notification fires
  source       TEXT    NOT NULL DEFAULT 'ui',-- 'ui' | 'mcp' | 'mcp:<client>' | later 'webhook:<name>'
  assignee     TEXT    NOT NULL DEFAULT 'me',-- Phase 2: 'agent:<runner>'
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX todos_status_due   ON todos(status, due_at);
CREATE INDEX todos_remind       ON todos(remind_at) WHERE reminded_at IS NULL;

CREATE TABLE tool_config (
  name        TEXT PRIMARY KEY,               -- e.g. 'todo_add'
  enabled     INTEGER NOT NULL,               -- 0/1
  description TEXT,                           -- NULL = use built-in default
  updated_at  INTEGER NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Change counters so other processes can cheaply detect writes
CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT INTO meta VALUES ('todos_seq', 0), ('config_seq', 0);

CREATE TRIGGER todos_ai AFTER INSERT ON todos BEGIN UPDATE meta SET value = value + 1 WHERE key = 'todos_seq'; END;
CREATE TRIGGER todos_au AFTER UPDATE ON todos BEGIN UPDATE meta SET value = value + 1 WHERE key = 'todos_seq'; END;
CREATE TRIGGER todos_ad AFTER DELETE ON todos BEGIN UPDATE meta SET value = value + 1 WHERE key = 'todos_seq'; END;
CREATE TRIGGER cfg_ai   AFTER INSERT ON tool_config BEGIN UPDATE meta SET value = value + 1 WHERE key = 'config_seq'; END;
CREATE TRIGGER cfg_au   AFTER UPDATE ON tool_config BEGIN UPDATE meta SET value = value + 1 WHERE key = 'config_seq'; END;
```

**Rules**

- Every connection sets `PRAGMA journal_mode = WAL`, `PRAGMA busy_timeout = 5000`.
- Migrations live in `core` and are applied by whichever process opens the DB first: `BEGIN IMMEDIATE`, read `PRAGMA user_version`, apply missing migrations, bump `user_version`, `COMMIT`. Both the app and the MCP server run this; the lock makes it safe.
- When `remind_at` changes, reset `reminded_at` to NULL (in `Store.updateTodo`).
- Seed `tool_config` with defaults on first run (see §5).

**DB location** (`core/paths.ts`, must match Tauri's `appDataDir()`):

| OS | Path |
|---|---|
| Windows | `%APPDATA%\com.example.todomcp\todos.db` |
| macOS | `~/Library/Application Support/com.example.todomcp/todos.db` |
| Linux | `$XDG_DATA_HOME/com.example.todomcp/todos.db` (default `~/.local/share/...`) |

`TODO_DB_PATH` env var overrides this. The "Connect" feature (§6.5) always writes `TODO_DB_PATH` into the client config explicitly, so the two processes can never disagree.

---

## 5. MCP server (`packages/mcp` → `todo-mcp` binary)

### 5.1 Tools

Prefix every tool with `todo_` so it's unambiguous next to other MCP servers.

| Tool | Default | Annotations | Input | Returns |
|---|---|---|---|---|
| `todo_add` | on | — | `title`, `notes?`, `due_at?`, `remind_at?` (ISO 8601 with offset), `priority?`, `tags?` | created todo |
| `todo_list` | on | readOnly | `status?` (default open), `tag?`, `due_before?`, `search?`, `limit?` (default 25) | todos + current time |
| `todo_update` | on | idempotent | `id` + any editable field | updated todo |
| `todo_complete` | on | idempotent | `id` | updated todo |
| `todo_delete` | **off** | destructive | `id` | `{ deleted: true }` |
| `todo_current_time` | on | readOnly | none | local time, UTC time, IANA timezone |

Every result returns both a short human-readable `content` text and a `structuredContent` object matching an `outputSchema`.

`todo_current_time` exists because not every client tells the model today's date, and the model needs it to turn "tomorrow at 9" into a timestamp.

### 5.2 Default descriptions (the "tool prompt")

The description is what the model reads to decide when and how to call a tool. Users can override it per tool in the app; the default lives in `core/tools.ts`. Example for `todo_add`:

```
Add an item to the user's personal todo list. Use this whenever the user asks you
to remember, track, or be reminded of something, or says "add to my todo list".
Keep the title short (under ~80 chars); put details in notes.
Times must be ISO 8601 with a UTC offset (e.g. 2026-09-24T09:00:00-04:00).
If you don't know the current date/time, call todo_current_time first.
Only set remind_at if the user asked to be reminded or gave a specific time.
```

### 5.3 Live tool config

- On startup: read `tool_config`, register all tools with the configured description, disable the ones marked off.
- Every ~2s: read `meta.config_seq`. If it changed, re-read `tool_config` and apply it through the tool handles (`update`, `enable`, `disable`). In SDK v2 each handle mutation sends `notifications/tools/list_changed` automatically.
- Not every client re-fetches tools on that notification. The UI should say "If the change doesn't show up, restart the MCP server in your AI client."

### 5.4 Sketch

```ts
// packages/mcp/src/index.ts  — sketch; check current SDK v2 docs for exact APIs
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { openBunStore, resolveDbPath, TOOL_NAMES } from "@todomcp/core";

// NEVER write to stdout except via the transport. Log to stderr or a file.
const log = (...a: unknown[]) => console.error("[todo-mcp]", ...a);

const store = await openBunStore(process.env.TODO_DB_PATH ?? resolveDbPath());
const server = new McpServer({ name: "todomcp", version: "0.1.0" });

const TodoOut = z.object({
  id: z.number(), title: z.string(), status: z.string(),
  due_at: z.string().nullable(), remind_at: z.string().nullable(), tags: z.array(z.string()),
});

const handles = {
  todo_add: server.registerTool(
    "todo_add",
    {
      title: "Add todo",
      description: await store.toolDescription("todo_add"),
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        notes: z.string().max(5000).optional(),
        due_at: z.iso.datetime({ offset: true }).optional(),
        remind_at: z.iso.datetime({ offset: true }).optional(),
        priority: z.number().int().min(0).max(3).optional(),
        tags: z.array(z.string().max(40)).max(10).optional(),
      }),
      outputSchema: TodoOut,
    },
    async (input) => {
      const todo = await store.addTodo({ ...input, source: "mcp" });
      return {
        content: [{ type: "text", text: `Added #${todo.id}: ${todo.title}` }],
        structuredContent: store.toOutput(todo),
      };
    },
  ),
  // todo_list, todo_update, todo_complete, todo_delete, todo_current_time ...
};

async function applyToolConfig() {
  for (const name of TOOL_NAMES) {
    const cfg = await store.getToolConfig(name);       // { enabled, description }
    handles[name].update({ description: cfg.description });
    cfg.enabled ? handles[name].enable() : handles[name].disable();
  }
}

await applyToolConfig();   // verify ordering vs connect() against SDK v2 behavior
await server.connect(new StdioServerTransport());

let lastSeq = await store.configSeq();
setInterval(async () => {
  const seq = await store.configSeq();
  if (seq !== lastSeq) { lastSeq = seq; await applyToolConfig(); log("tool config reloaded"); }
}, 2000);
```

### 5.5 Error handling

- Validation errors come back as tool errors with a hint: `"due_at must include an offset, e.g. 2026-09-24T09:00:00-04:00"`.
- Unknown id: `"No todo with id 42. Call todo_list to see current ids."`
- DB locked past the busy timeout: retry once, then return a tool error rather than crashing.

### 5.6 Protocol compatibility

SDK v2 targets the 2026-07-28 MCP spec. Some clients were still speaking an older protocol version over stdio as of mid-2026. First task in M1: confirm the v2 server connects cleanly to Cursor, Claude Code, and Claude Desktop. If any can't, build against SDK v1.x (still maintained) until they catch up. The `core` package doesn't care which.

---

## 6. Desktop app (`packages/app`)

### 6.1 Window and tray

- Closing the window hides it (intercept `CloseRequested`, call `prevent_close()` + `hide()`). Quit is only in the tray menu.
- Tray menu: **Open**, **Quick add…**, **Pause reminders (1h)**, **Quit**. Keep it menu-driven: on Linux, tray icons generally only open their menu and don't deliver plain click events.
- `tauri-plugin-single-instance`: launching the app again focuses the existing window.
- Launched with `--hidden` (autostart does this): start in tray, don't show the window.

### 6.2 Screens

- **Today / Upcoming / All / Done** lists, quick-add bar at the top, detail pane for notes/due/remind/tags/priority.
- Items added by an AI show a small badge (from `source`) so users can see what the agent did.
- **Settings → AI tools:** one row per tool with an on/off toggle, the description in an editable textarea, "Reset to default", and a read-only preview of exactly what the AI will see.
- **Settings → Connect:** see §6.5.
- **Settings → Notifications:** default reminder lead time, pause, test notification button.
- **Settings → General:** launch at login, theme (follow system / light / dark).

### 6.3 Live refresh

Poll `SELECT value FROM meta WHERE key='todos_seq'` every ~1s while the window is visible. When it changes, re-query the current view. Cheap, and immune to connection-pool quirks that make `PRAGMA data_version` unreliable through a pool.

### 6.4 Reminders (Rust)

Runs in the Tauri process on a plain thread so it keeps working while the window is hidden (hidden webviews can throttle JS timers).

```rust
// src-tauri/src/reminders.rs — sketch
use std::{path::PathBuf, thread, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub fn start(app: AppHandle, db_path: PathBuf) {
    thread::spawn(move || loop {
        if let Err(e) = tick(&app, &db_path) { eprintln!("reminder tick failed: {e}"); }
        thread::sleep(Duration::from_secs(30));
    });
}

fn tick(app: &AppHandle, db_path: &PathBuf) -> rusqlite::Result<()> {
    let conn = rusqlite::Connection::open(db_path)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    // Atomically claim due reminders so nothing fires twice.
    let mut stmt = conn.prepare(
        "UPDATE todos SET reminded_at = ?1
         WHERE status = 'open' AND remind_at IS NOT NULL
           AND remind_at <= ?1 AND reminded_at IS NULL
         RETURNING title",
    )?;
    let titles: Vec<String> = stmt.query_map([now], |r| r.get(0))?.filter_map(Result::ok).collect();
    match titles.len() {
        0 => {}
        1..=3 => for t in &titles {
            let _ = app.notification().builder().title("Reminder").body(t).show();
        },
        n => { let _ = app.notification().builder()
                 .title("Reminders").body(format!("{n} todos are due")).show(); }
    }
    Ok(())
}
```

Grouping handles the "laptop was asleep for a day" case without a notification flood. Respect the "pause reminders" setting by reading it in `tick`.

### 6.5 Connect to AI clients

The app exposes a Tauri command `mcp_binary_path()` that resolves the bundled sidecar next to the running executable (`current_exe().parent().join("todo-mcp[.exe]")`). The Connect screen then offers, per client:

| Client | How | Location |
|---|---|---|
| Cursor | "Connect" button edits JSON (back up first, ask first) | `~/.cursor/mcp.json` |
| Claude Desktop (macOS/Windows) | "Connect" button edits JSON (back up first, ask first) | macOS: `~/Library/Application Support/Claude/claude_desktop_config.json` · Windows: `%APPDATA%\Claude\claude_desktop_config.json` (verify; can differ by install type) |
| Claude Code | Show a command to copy | `claude mcp add --scope user -e TODO_DB_PATH="<db>" todo -- "<path>"` |
| Anything else | Show generic JSON with a copy button | — |

Entry written to JSON configs:

```json
{
  "mcpServers": {
    "todo": {
      "command": "C:\\Program Files\\TodoMCP\\todo-mcp.exe",
      "args": [],
      "env": { "TODO_DB_PATH": "C:\\Users\\me\\AppData\\Roaming\\com.example.todomcp\\todos.db" }
    }
  }
}
```

Always merge into existing JSON (never overwrite other servers), keep a timestamped `.bak`, and show a diff before writing. Tell the user to restart the client afterward.

### 6.6 Rust entry point

```rust
// src-tauri/src/main.rs — sketch
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") { let _ = w.show(); let _ = w.set_focus(); }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .setup(|app| {
            tray::build(app)?;
            let db = app.path().app_data_dir()?.join("todos.db");
            reminders::start(app.handle().clone(), db);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![commands::mcp_binary_path, commands::db_path])
        .run(tauri::generate_context!())
        .expect("error while running TodoMCP");
}
```

The UI opens the DB via `tauri-plugin-sql` using the absolute path from `db_path()`. Confirm how the plugin resolves `sqlite:` paths during M2; if it forces a relative base directory, route UI queries through Rust commands instead.

---

## 7. Packaging and distribution

### 7.1 The sidecar

`todo-mcp` ships inside the app as a Tauri sidecar. Tauri expects one binary per target, suffixed with the Rust target triple; it strips the suffix when bundling.

```ts
// scripts/build-sidecar.ts — sketch
const map = {
  "x86_64-pc-windows-msvc":    "bun-windows-x64",
  "aarch64-apple-darwin":      "bun-darwin-arm64",
  "x86_64-apple-darwin":       "bun-darwin-x64",
  "x86_64-unknown-linux-gnu":  "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
} as const;
// triple from arg or `rustc -vV` (host: line)
// bun build packages/mcp/src/index.ts --compile --target=<bunTarget>
//   --outfile packages/app/src-tauri/binaries/todo-mcp-<triple>[.exe]
```

```json
// tauri.conf.json (relevant parts)
{
  "identifier": "com.example.todomcp",
  "bundle": {
    "externalBin": ["binaries/todo-mcp"],
    "targets": ["nsis", "msi", "dmg", "app", "appimage", "deb", "rpm"]
  }
}
```

### 7.2 AppImage gotcha

An AppImage mounts to a new temporary path on every launch, so a client config pointing at the sidecar inside it breaks next time. When the app detects it's running as an AppImage (`APPIMAGE` env var is set), it copies `todo-mcp` to `~/.local/bin/todo-mcp` (re-copying when the app version changes) and the Connect screen points there. `.deb`/`.rpm`/AUR installs have stable paths and don't need this.

### 7.3 CI releases

`.github/workflows/release.yml` using `tauri-apps/tauri-action`, triggered on version tags. Tauri doesn't cross-compile reliably, so build on native runners:

| Runner | Targets | Extra setup |
|---|---|---|
| `windows-latest` | x86_64-pc-windows-msvc | — |
| `macos-latest` | aarch64-apple-darwin, x86_64-apple-darwin | — |
| `ubuntu-22.04` | x86_64-unknown-linux-gnu | `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev` (older Ubuntu = wider glibc compatibility) |

Each job: install Bun + Rust → build sidecar for its triple(s) → `tauri-action` builds installers → attach to the GitHub Release draft.

### 7.4 Per-OS notes

- **Windows:** unsigned installers trigger a SmartScreen warning. Fine for early testers; get a code-signing certificate before a wide release. Test notifications from the *installed* build, since Windows ties them to the installed app's identity and dev mode can behave differently.
- **macOS:** Gatekeeper blocks unsigned, unnotarized apps downloaded from the internet. Needs an Apple Developer account for signing + notarization; `tauri-action` supports both via secrets. The sidecar must be signed too.
- **Linux:** ship AppImage (universal but bulky, bundles WebKit), `.deb`, `.rpm`, and an AUR package (§8).
- **Updates:** `tauri-plugin-updater` against GitHub Releases, in M6.

---

## 8. Linux and Omarchy notes

Omarchy = Arch + Hyprland (tiling Wayland), Waybar, Mako. Things to design and test for:

- **Notifications** go through the freedesktop D-Bus spec; Mako displays them. Should work unchanged.
- **Tray** uses StatusNotifierItem via libayatana-appindicator; appears in Waybar's tray. Menu-only interaction (§6.1).
- **Tiling:** the window gets tiled into a split, not floated. Make layouts work from ~360px wide to full screen. Set a stable window class/app id so users can write a Hyprland "float" rule; document one in the README.
- **Autostart:** Tauri writes an XDG autostart `.desktop` file. Hyprland setups often start apps from their own autostart config instead; test whether Omarchy honors XDG entries, and document the fallback line (`exec-once = todomcp --hidden` or Omarchy's equivalent).
- **Blank window on NVIDIA + Wayland:** known WebKitGTK issue. Document `WEBKIT_DISABLE_DMABUF_RENDERER=1` as the workaround; consider setting it automatically on Linux if a blank render is detected.
- **Global shortcuts:** apps generally can't grab global hotkeys on Wayland. Instead, offer a CLI (`todo-mcp add "…"`, M6) users can bind in Hyprland.
- **Rendering engine:** WebKitGTK usually lags Chromium/Safari. Check support before using newer CSS/JS features, and test the Linux build every milestone.
- **AUR `PKGBUILD`:** depends on `webkit2gtk-4.1` and `libayatana-appindicator`; installs the app binary, `todo-mcp`, `.desktop` file, and icons.

---

## 9. Testing

- **core:** `bun test` against a temp DB. Cover migrations from every prior version, time conversions across DST boundaries, tag filtering, the reminder claim query, and two processes writing concurrently.
- **MCP:** MCP Inspector (`npx @modelcontextprotocol/inspector`) for every tool; scripted tests with the SDK client package that call each tool and assert `structuredContent`.
- **Model-facing checks:** a short list of prompts run by hand in each client, e.g. "remind me to call the dentist tomorrow at 10", "what's on my list this week?", "mark the dentist one done". Re-run whenever default descriptions change.
- **App:** manual matrix per milestone on Windows, macOS, and Omarchy: add/edit from UI, add from AI while app is open (refresh within ~2s), reminder while window hidden, reboot → autostart into tray.

---

## 10. Phase 1 milestones

Each milestone ends in something usable.

**M0 — Scaffold**
- [ ] Bun workspaces monorepo, TypeScript strict, lint/format, `bun test` in CI
- [ ] Tauri 2 app skeleton builds on all three OSes in CI

**M1 — Core + MCP (no UI)**
- [ ] Schema, migrations, `Store`, path resolution, `bun:sqlite` adapter
- [ ] Six tools with default descriptions, annotations, output schemas
- [ ] Compiled standalone binary via `bun build --compile`
- [ ] Verify SDK v2 connects to Cursor, Claude Code, Claude Desktop (fall back to v1.x if needed)
- **Done when:** "remind me to call the dentist tomorrow at 10" in Cursor and Claude Code creates a correct todo, and list/update/complete work.

**M2 — Desktop shell**
- [ ] Tauri window with Today / Upcoming / All / Done, quick add, detail pane
- [ ] `tauri-plugin-sql` adapter for `core`; live refresh via `todos_seq`
- **Done when:** a todo added from an AI client appears in the open app within ~2s.

**M3 — Tool config**
- [ ] Settings → AI tools: toggle, edit description, reset, preview
- [ ] MCP server hot-reloads config via `config_seq` and handle mutations
- **Done when:** disabling `todo_update` removes it from the client's tool list (or after a client-side MCP restart where `list_changed` isn't supported).

**M4 — Background app**
- [ ] Hide-to-tray, tray menu, single instance, `--hidden` start
- [ ] Rust reminder loop with grouping and pause
- [ ] Launch at login toggle
- **Done when:** a reminder fires with the window closed, and after a reboot the app is in the tray.

**M5 — Connect + package**
- [ ] Sidecar bundling, `mcp_binary_path()`, AppImage copy behavior
- [ ] Connect screen: Cursor + Claude Desktop JSON merge with backup/diff; Claude Code command; generic JSON
- [ ] Release workflow producing installers for all targets
- [ ] README: install, connect, Omarchy notes, troubleshooting
- **Done when:** on a fresh machine, a user can download, install, connect an AI client, and use it without opening a terminal.

**M6 — Polish (pick and choose)**
- [ ] Auto-updater
- [ ] Windows signing, macOS notarization
- [ ] AUR package
- [ ] `.ics` export of todos with due dates
- [ ] `todo-mcp add "…"` CLI subcommand for keybindings/scripts

---

## 11. Phase 2 design (not scheduled)

Principle: **the todo list is the work queue.** Humans and agents both pull from it. Monitoring tools feed it; we don't build monitoring.

### 11.1 Agent-assigned todos

New tables (Migration N):

```sql
CREATE TABLE runners (
  name     TEXT PRIMARY KEY,           -- 'claude-code', 'cursor', 'codex', user-defined
  argv     TEXT NOT NULL,              -- JSON array, e.g. ["claude","-p","{prompt}"]
  enabled  INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE repos (name TEXT PRIMARY KEY, path TEXT NOT NULL);
CREATE TABLE agent_runs (
  id          INTEGER PRIMARY KEY,
  todo_id     INTEGER NOT NULL REFERENCES todos(id),
  runner      TEXT NOT NULL,
  repo        TEXT NOT NULL,
  branch      TEXT NOT NULL,
  worktree    TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  log_path    TEXT,
  diff_stat   TEXT,
  started_at  INTEGER, finished_at INTEGER
);
```

Default runner templates (users can edit or add their own, which covers "other AI library/service"):

| Runner | argv |
|---|---|
| Claude Code | `["claude", "-p", "{prompt}"]` |
| Cursor CLI | `["agent", "-p", "--force", "{prompt}"]` (without `--force` it only proposes changes) |
| Codex | `["codex", "exec", "{prompt}"]` |

Flow, implemented as a new subcommand of the same binary (`todo-mcp run-agent <todo-id>`) so it stays TypeScript; the app launches it as a sidecar:

1. User clicks **Send to agent** on a todo and picks runner + repo. (Manual first. Auto-dispatch is a later opt-in.)
2. Create an isolated worktree: `git worktree add <appdata>/worktrees/todo-<id> -b agent/todo-<id>`.
3. Build the prompt from the todo title + notes + a fixed preamble ("work only in this directory, commit your changes, summarize what you did").
4. Spawn the runner with `cwd` = worktree, argv substituted element-by-element. **Never** build a shell string.
5. Stream stdout/stderr to a log file; enforce a timeout and a Cancel button; one run at a time by default.
6. On exit: record status and `git diff --stat`, notify the user, show Review → "Open in editor" / "Push branch" / "Discard" (`git worktree remove`).

Guardrails: agents never touch the user's main checkout, never merge, never push without a click.

### 11.2 Alert intake (webhooks → todos)

- `todo-mcp serve-webhooks` runs as a long-lived sidecar started by the app, listening on `127.0.0.1` with a per-source secret token.
- Per-source mapping turns a payload (Sentry, Datadog, Honeycomb, generic JSON) into a todo: title template, notes = key fields + link, tags, optional default runner.
- Remote servers can't reach localhost. Options, in order of effort: user runs their own tunnel (e.g. Tailscale/Cloudflare) → small hosted relay (a serverless function that queues webhooks; the app polls or holds a WebSocket).
- **Treat alert content as untrusted input.** Log lines and error messages flow into an agent prompt, so anyone who can trigger an error can attempt prompt injection. Webhook-created todos never auto-dispatch to an agent unless the user opts in per source, and the prompt preamble tells the agent to treat quoted alert text as data.

### 11.3 Grok Bot

Grok Bot (SpaceXAI + Cursor, beta Aug 2026) runs cloud agents you message like a teammate. As of this writing there's no documented API for an app to spin one up, and a cloud agent can't reach a local stdio MCP server. Not integrated; revisit if they publish an API or remote MCP support.

---

## 12. Risks and open questions

| Risk / question | Plan |
|---|---|
| MCP SDK v2 vs. clients on older protocol versions | Verify in M1; v1.x fallback |
| Clients that ignore `tools/list_changed` | UI hint to restart MCP in the client |
| `tauri-plugin-sql` path handling | Verify in M2; fall back to Rust commands for queries |
| Claude Desktop config path varies by install type on Windows | Detect candidates; if not found, show copy-paste JSON |
| XDG autostart on Hyprland/Omarchy | Test in M4; document `exec-once` fallback |
| Signing/notarization cost and setup | Ship unsigned to testers; sign before wide release |
| Timezones and DST | Store UTC ms; `todo_current_time` returns IANA zone; DST tests in core |
| Model writes vague or wrong times | Strict ISO+offset schema, helpful validation errors, description guidance |
| Prompt injection via todo content (Phase 2) | Untrusted-input handling in §11.2 |

---

## 13. References

- MCP specification: https://modelcontextprotocol.io
- TypeScript SDK (v2 on `main`, v1.x branch maintained): https://github.com/modelcontextprotocol/typescript-sdk · docs: https://ts.sdk.modelcontextprotocol.io/v2/
- MCP Inspector: `npx @modelcontextprotocol/inspector`
- Tauri 2 docs (plugins, sidecars, distribution): https://v2.tauri.app
- tauri-action: https://github.com/tauri-apps/tauri-action
- Bun single-file executables: https://bun.sh/docs/bundler/executables
- Cursor headless CLI: https://cursor.com/docs/cli/headless
- Omarchy: https://github.com/basecamp/omarchy
