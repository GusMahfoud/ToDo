# TodoMCP

**A todo list your AI can use.**

TodoMCP is a small desktop app for Windows, macOS and Linux. It keeps your todos in one place, reminds you
when things are due — and it plugs into AI tools like **Cursor, Claude Code and Claude Desktop**, so you can
just say *"remind me to call the dentist tomorrow at 10"* and it lands on your list.

Everything stays on your computer. No account, no cloud, no sync service.

## Get started in 3 steps

**1. Install**

Download the installer for your system from the [latest release](../../releases/latest):

| System | File |
|---|---|
| Windows | `TodoMCP_x.y.z_x64-setup.exe` |
| macOS (Apple Silicon / Intel) | `TodoMCP_x.y.z_aarch64.dmg` / `TodoMCP_x.y.z_x64.dmg` |
| Linux | `.AppImage`, `.deb` or `.rpm` |

Builds aren't code-signed yet, so Windows SmartScreen or macOS Gatekeeper may warn you the first time
(Windows: *More info → Run anyway*; macOS: right-click → *Open*).

**2. Connect your AI**

Open TodoMCP → **Settings → Connect**, pick your AI app, click **Connect**. You'll see exactly what will be
written before anything changes (a backup is kept). Restart the AI app once.

| AI app | How |
|---|---|
| Cursor | One click |
| Claude Desktop | One click |
| Claude Code | Copy one command into your terminal |
| Anything else that speaks MCP | Copy the JSON snippet |

**3. Talk to it**

> "Add *buy milk* to my list"
> "What's on my list this week?"
> "Remind me to send the invoice Friday at 9"
> "Mark the dentist one done"

New items show up in the app within a second, with a small badge showing which AI added them.

## What it does

| | |
|---|---|
| **Today · Upcoming · All · Done** | Simple views. Quick-add bar at the top: type, press Enter. `#tag` and `!1`–`!3` set tags and priority inline. |
| **Reminders** | Set a time, get a normal system notification — even when the window is closed to the tray. Pause them for an hour from the tray icon. |
| **Runs in the tray** | Closing the window hides it. Optional *launch at login* so reminders keep working after a reboot. |
| **You control the AI** | **Settings → AI tools**: switch each ability on or off and edit the plain-English description the AI reads. Deleting is *off* by default. |
| **Works offline, works alone** | The AI side works even if the app isn't open. The app works even if you never connect an AI. |
| **Keyboard** | `Ctrl+N` new todo · `Ctrl+F` search · `Ctrl+,` settings · `Esc` close |

## Where is my data?

One file on your computer:

| System | Location |
|---|---|
| Windows | `%APPDATA%\com.example.todomcp\todos.db` |
| macOS | `~/Library/Application Support/com.example.todomcp/todos.db` |
| Linux | `~/.local/share/com.example.todomcp/todos.db` |

Copy that file to back up everything. Delete it to start fresh.

## Questions

**Do I need an account or API key?** No. Your AI app talks to TodoMCP directly on your machine.

**Which AI apps work?** Anything that supports MCP servers over stdio: Cursor, Claude Code, Claude Desktop,
and many others. If yours isn't listed on the Connect screen, use the generic JSON option.

**I turned a tool off but the AI still sees it.** Some AI apps don't refresh their tool list live. Start a new
chat or restart the MCP server in that app.

**A reminder didn't fire.** Make sure TodoMCP is running (look for the tray icon) and reminders aren't paused
(**Settings → Notifications**). On Windows, notifications work from the installed app, not a dev build.

**Linux tiling / Hyprland / Omarchy?** Works. Float rule: `windowrule = float, class:^(todomcp)$`. More in
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#linux--omarchy-notes).

## For developers

Architecture, repo layout, build commands, CI and release process: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).
Security policy: [SECURITY.md](SECURITY.md). Code style for humans and agents: [CLAUDE.md](CLAUDE.md).

## License

TodoMCP is free to use, at home or at work, and the source is open to read and modify. What you can't
do is sell it, or ship it (or something built on it) as your own product. Details: [LICENSE](LICENSE)
(PolyForm Shield 1.0.0) and the [Terms of Use](TERMS.txt) the installer asks you to accept.
