# CLAUDE.md — working in this repo

## Voice: brief, human, connectable

Applies to explanations, comments, commit messages, PR descriptions, code reviews, docs.

| Do | Don't |
|---|---|
| Lead with the point; one sentence when one will do | Preamble, restating the question, "In this section we will…" |
| Say *why*, link to *where* (`file.rs:42`, §, URL) | Narrate *what* the code obviously does |
| Tables for anything with ≥3 parallel items | Paragraphs of bullet-shaped prose |
| Concrete: names, paths, numbers, commands | "some", "various", "properly", "robust" |
| Short comments above non-obvious lines | Comment every line; comments that repeat the identifier |
| Plain words | Hedging, filler, marketing adjectives |

Commit messages: `area: what changed` (≤ 60 chars), optional body = why + link. Reviews: finding → impact → fix, one line each.

## Map

| Path | Owns |
|---|---|
| `packages/core` | Schema, migrations, `Store`, tool defaults, time, `Db` adapters — no I/O beyond SQL |
| `packages/mcp` | `todo-mcp` binary: stdio server, tool handlers, config hot-reload, CLI |
| `packages/app/src` | React UI (talks to Rust only through `lib/tauri.ts` and `TauriDb`) |
| `packages/app/src-tauri` | Tray, reminders, DB bridge, client-config merge, sidecar lookup |
| `scripts/` | `build-sidecar.ts` |
| `docs/IMPLEMENTATION.md` | The plan; §numbers referenced in code comments |

## Rules

- Files: ≤ 300 lines preferred, 1000 hard. Split by responsibility, not by size.
- Times are unix ms UTC in storage; ISO 8601 *with offset* on the MCP wire; local only in the UI.
- Migrations are append-only arrays of single statements (`core/src/schema.ts`). Never edit a shipped one.
- Anything both processes read (settings keys, tool names) lives in `core` and is imported, not re-typed.
- MCP server: stdout is protocol. Log via `log.ts` (stderr).
- New tool → add to `TOOL_NAMES` + `TOOL_DEFAULTS`, register in `tools/register.ts`, test in `test/tools.test.ts`.
- Rust changes: verify against crate sources in `~/.cargo/registry/src` if you can't compile locally (see README → Smart App Control).

## Commands

| Task | Command |
|---|---|
| Install | `bun install` |
| Test / typecheck / lint | `bun test` · `bun run typecheck` · `bun run lint` |
| Format | `bun run format` |
| Run MCP from source | `bun run mcp` · `bun run mcp:inspect` |
| Sidecar binary | `bun run build:sidecar` |
| App | `bun run app:dev` · `bun run app:build` |
