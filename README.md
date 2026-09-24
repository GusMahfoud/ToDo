# TodoMCP

A cross-platform desktop todo app (Windows, macOS, Linux incl. Omarchy/Hyprland) that doubles as a local
**MCP server**, so AI clients like Cursor, Claude Code and Claude Desktop can read and write your todos.
You control which tools the AI sees and what each tool's description ("prompt") says, from the app.

```
AI client ──stdio──► todo-mcp (Bun-compiled binary) ──► todos.db (SQLite, WAL) ◄── TodoMCP app (Tauri)
```

Two programs, one SQLite file. The MCP server works even when the app isn't running; the app handles the
window, tray, reminders and autostart.

## Repository layout

| Path | What |
|---|---|
| `packages/core` | Schema, migrations, `Store` queries, tool defaults, time helpers, DB adapters (`bun:sqlite`, Tauri) |
| `packages/mcp` | `todo-mcp` — the stdio MCP server (+ small CLI: `add`, `list`, `now`) |
| `packages/app` | Tauri 2 desktop app: React UI in `src/`, Rust shell in `src-tauri/` |
| `scripts/build-sidecar.ts` | Compiles `todo-mcp` per target triple into `packages/app/src-tauri/binaries/` |
| `packaging/aur/PKGBUILD` | Arch/Omarchy package |
| `.github/workflows` | `ci.yml` (tests, typecheck, lint, Rust check) · `release.yml` (tag → draft release) · `build-installers.yml` (manual → artifacts) |

## Development

Prerequisites: [Bun](https://bun.sh) ≥ 1.2, [Rust](https://rustup.rs) stable, and the
[Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
bun install
bun test                     # core + mcp tests (real SQLite, in-memory MCP client)
bun run typecheck            # every package
bun run lint                 # biome
bun run build:sidecar        # compile todo-mcp for this machine → src-tauri/binaries/
bun run app:dev              # Tauri dev window (Vite HMR)
bun run app:build            # sidecar + installers for this OS
```

Try the MCP server without the app:

```sh
bun run mcp:inspect                          # MCP Inspector against the TS source
bun run mcp:connect cursor --dry-run         # show what would be written to ~/.cursor/mcp.json
bun run mcp:connect cursor                   # write it (backup kept) — Cursor can use todos today
bun run mcp add "Call dentist" --due 2026-09-25T10:00:00-04:00
```

`todo-mcp connect <cursor|claude-desktop|claude-code|json>` does the same from the compiled binary.

> **Windows + Smart App Control:** Smart App Control blocks unsigned freshly-built executables, which
> includes Cargo build scripts, so `cargo`/`tauri build` fail with `os error 4551`. Use
> **Actions → Build installers (manual)** to get installers as artifacts, or build on a machine without
> it. The Bun sidecar and all TypeScript tooling are unaffected.

## Connecting an AI client

Open **Settings → Connect** in the app. It shows the absolute path of the bundled `todo-mcp` binary and
the database, and offers:

- **Cursor** / **Claude Desktop** — a *Connect* button that merges a `todo` entry into the client's JSON
  config (shows a before/after diff, keeps a timestamped `.bak`, never touches other servers).
- **Claude Code** — a `claude mcp add …` command to copy.
- **Anything else** — generic JSON.

The entry always sets `TODO_DB_PATH` explicitly so the app and server can never disagree:

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

Restart the client after connecting. Tool on/off and description changes in **Settings → AI tools** apply
live (`notifications/tools/list_changed`); if a client doesn't refresh, restart its MCP server.

### Tools

| Tool | Default | Notes |
|---|---|---|
| `todo_add` | on | Times are ISO 8601 **with offset** |
| `todo_list` | on | read-only; returns current time + timezone |
| `todo_update` | on | idempotent; `null` clears dates |
| `todo_complete` | on | idempotent |
| `todo_delete` | **off** | destructive; enable in Settings |
| `todo_current_time` | on | so the model can resolve "tomorrow at 9" |

## Data

One SQLite file (WAL mode, 5 s busy timeout). Timestamps are unix ms UTC.

| OS | Path |
|---|---|
| Windows | `%APPDATA%\com.example.todomcp\todos.db` |
| macOS | `~/Library/Application Support/com.example.todomcp/todos.db` |
| Linux | `$XDG_DATA_HOME/com.example.todomcp/todos.db` (default `~/.local/share/…`) |

`TODO_DB_PATH` overrides the location for `todo-mcp`.

## Linux / Omarchy notes

- **Tray**: StatusNotifierItem via libayatana-appindicator → shows in Waybar's tray. Menu-only interaction
  (left click opens the menu; double click opens the window).
- **Float rule** for Hyprland (`~/.config/hypr/hyprland.conf`):
  `windowrule = float, class:^(todomcp)$`
- **Autostart**: the toggle writes an XDG autostart entry. If your setup ignores those, add
  `exec-once = todomcp --hidden` to your Hyprland config instead.
- **Blank window on NVIDIA + Wayland** (WebKitGTK): run with `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- **Global shortcut**: Wayland apps can't grab hotkeys; bind the CLI instead, e.g.
  `bind = SUPER, T, exec, todo-mcp add "$(wofi --dmenu -p 'Todo')"`.
- **AppImage**: the sidecar is copied to `~/.local/bin/todo-mcp` (refreshed on version change) because an
  AppImage mounts at a new path on every launch. `.deb`/`.rpm`/AUR installs have stable paths.

## Troubleshooting

- *Client shows no tools*: run the binary from a terminal — `todo-mcp --version` — then check the client's
  MCP log; stdout must only carry JSON-RPC, everything else goes to stderr (`TODO_MCP_DEBUG=1` for more).
- *Claude Desktop on Windows ignores the config*: MSIX installs read
  `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`; the
  Connect screen detects and prefers that path when the package folder exists.
- *Reminder didn't fire*: reminders are checked every 20 s by the app process; make sure the app is running
  (tray icon) and not paused (Settings → Notifications). On Windows, test from the installed build.
- *Database locked*: both processes retry with a 5 s busy timeout; if a client reports it, another writer was
  holding a long transaction — try again.

## Releasing

Bump `version` in `packages/app/src-tauri/tauri.conf.json`, `packages/app/src-tauri/Cargo.toml` and
`packages/mcp/src/server.ts`, tag `vX.Y.Z`, push. `release.yml` builds NSIS/MSI, DMG, AppImage/deb/rpm on
native runners and attaches them to a draft GitHub Release. Signing/notarization secrets are optional.

## Phase 2 (designed, not scheduled)

The schema already carries `assignee` and `source` so agent-run todos and webhook intake can land later
without migrations to existing columns. See `IMPLEMENTATION.md` §11 for the design.

## License

MIT
