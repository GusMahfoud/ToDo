# Security

Report vulnerabilities privately via **Security → Report a vulnerability** on GitHub, not in public issues.

## Scope notes

| Area | Model |
|---|---|
| Data | One local SQLite file, no network, no accounts. `todo-mcp` only reads `TODO_DB_PATH`. |
| MCP | stdio only; the AI client launches the process. No HTTP listener in Phase 1. |
| Client configs | The Connect feature edits `mcp.json` / `claude_desktop_config.json` after showing a diff and keeping a `.bak`. |
| Todo content | Treated as untrusted text. Phase 2 agent prompts must quote it as data (see `docs/IMPLEMENTATION.md` §11.2). |
| Installers | Unsigned until a signing certificate is set up; expect SmartScreen / Gatekeeper prompts. |
