# Development

Technical reference for contributors. For using the app, see the [README](../README.md).

## Architecture

```
AI client ──stdio──► todo-mcp (Bun-compiled binary) ──► todos.db (SQLite, WAL) ◄── TodoMCP app (Tauri)
```

Two programs, one SQLite file. MCP clients launch `todo-mcp` themselves and kill it when the session ends, so
it can't be the long-lived process that owns the tray and fires reminders — the app does that. The database
is the only integration point; either side works without the other running.

## Repository layout

| Path | What |
|---|---|
| `packages/core` | Schema, migrations, `Store` queries, tool defaults, time helpers, DB adapters (`bun:sqlite`, Tauri) |
| `packages/mcp` | `todo-mcp` — the stdio MCP server + CLI (`add`, `list`, `now`, `connect`) |
| `packages/app` | Tauri 2 desktop app: React UI in `src/`, Rust shell in `src-tauri/` |
| `scripts/build-sidecar.ts` | Compiles `todo-mcp` per target triple into `packages/app/src-tauri/binaries/` |
| `packaging/aur/PKGBUILD` | Arch/Omarchy package |
| `.github/workflows` | `ci.yml` (tests, typecheck, lint, Rust check) · `release.yml` (tag → draft release) · `build-installers.yml` (manual → artifacts) |
| `docs/IMPLEMENTATION.md` | The original plan; § numbers are referenced from code comments |

## Setup

Prerequisites: [Bun](https://bun.sh) ≥ 1.2, [Rust](https://rustup.rs) stable, and the
[Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS.

```sh
bun install
bun test                     # core + mcp + app tests (real SQLite, in-memory MCP client, spawned stdio)
bun run typecheck            # every package
bun run lint                 # biome
bun run build:sidecar        # compile todo-mcp for this machine → src-tauri/binaries/
bun run app:dev              # Tauri dev window (Vite HMR)
bun run app:build            # sidecar + installers for this OS
```

Run the MCP server from source, without the app:

```sh
bun run mcp:inspect                          # MCP Inspector
bun run mcp:connect cursor --dry-run         # show what would be written to ~/.cursor/mcp.json
bun run mcp:connect cursor                   # write it (backup kept)
bun run mcp add "Call dentist" --due 2026-09-25T10:00:00-04:00
```

> **Windows + Smart App Control:** SAC blocks freshly built unsigned executables, which includes Cargo build
> scripts, so `cargo`/`tauri build` fail with `os error 4551`. Use **Actions → Build installers (manual)**
> for installers, or build on a machine without SAC. Bun and all TypeScript tooling are unaffected.

## How the pieces talk

| Concern | Mechanism |
|---|---|
| UI ↔ SQLite | Two Rust commands (`db_exec`, `db_select`) over one `rusqlite` connection; the TypeScript `Store` runs unchanged in UI and MCP |
| Live refresh | Triggers bump `meta.todos_seq` / `meta.config_seq`; UI polls every 1 s, MCP server every 2 s |
| Tool config | `tool_config` table → `RegisteredTool.update/enable/disable` → `notifications/tools/list_changed` |
| Reminders | Rust thread, 20 s tick, atomic `UPDATE … RETURNING` claim, grouped notifications, pause via `settings` |
| Concurrency | WAL + 5 s busy timeout; one retry on `SQLITE_BUSY` in tool handlers |
| Times | Unix ms UTC in storage; ISO 8601 with offset on the MCP wire; local in the UI |

## Client config written by Connect

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

Merged into the existing file; other servers untouched; timestamped `.bak` kept. `TODO_DB_PATH` is always
explicit so the app and server can't disagree.

## Data location

| OS | Path |
|---|---|
| Windows | `%APPDATA%\com.example.todomcp\todos.db` |
| macOS | `~/Library/Application Support/com.example.todomcp/todos.db` |
| Linux | `$XDG_DATA_HOME/com.example.todomcp/todos.db` (default `~/.local/share/…`) |

## Linux / Omarchy notes

- **Tray**: StatusNotifierItem via libayatana-appindicator → Waybar tray. Menu-only (left click opens the
  menu; double click opens the window).
- **Hyprland float rule**: `windowrule = float, class:^(todomcp)$`
- **Autostart**: the toggle writes an XDG autostart entry. If ignored, add `exec-once = todomcp --hidden`.
- **Blank window on NVIDIA + Wayland** (WebKitGTK): `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- **Global shortcut**: bind the CLI, e.g. `bind = SUPER, T, exec, todo-mcp add "$(wofi --dmenu -p 'Todo')"`.
- **AppImage**: the sidecar is copied to `~/.local/bin/todo-mcp` (refreshed on version change) because an
  AppImage mounts at a new path each launch.

## Troubleshooting

| Symptom | Check |
|---|---|
| Client shows no tools | `todo-mcp --version` in a terminal, then the client's MCP log. stdout must be JSON-RPC only; `TODO_MCP_DEBUG=1` for more on stderr |
| Claude Desktop (Windows) ignores config | MSIX installs read `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`; Connect prefers it when present |
| Reminder didn't fire | App running (tray icon)? Paused in Settings → Notifications? On Windows test from the installed build |
| Database locked | Both sides retry with a 5 s busy timeout; a long transaction elsewhere — retry |

## Releasing

1. Bump `version` in `packages/app/src-tauri/tauri.conf.json`, `packages/app/src-tauri/Cargo.toml`, `packages/mcp/src/server.ts`.
2. Tag `vX.Y.Z` and push. `release.yml` builds NSIS/MSI, DMG, AppImage/deb/rpm on native runners into a
   draft GitHub Release.
3. Publish the draft.

Signing is optional: set `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` as repo secrets to sign + notarize macOS builds.

## Phase 2 (designed, not scheduled)

Agents pulling todos as work items and webhook → todo intake. The schema already carries `assignee` and
`source`. See `IMPLEMENTATION.md` §11.
