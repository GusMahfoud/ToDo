import { currentTimeInfo, parseIsoWithOffset, type Store, toIsoWithOffset } from "@todomcp/core";
import { SERVER_VERSION } from "./server";

export const USAGE = `todo-mcp ${SERVER_VERSION} — TodoMCP local MCP server

Usage:
  todo-mcp                      Serve MCP over stdio (what AI clients run)
  todo-mcp serve                Same as above
  todo-mcp add "title" [opts]   Add a todo from the shell (for keybindings/scripts)
      --notes "text"  --due <ISO+offset>  --remind <ISO+offset>  --priority 0-3  --tag t (repeatable)
  todo-mcp list [--all|--done]  Print todos
  todo-mcp now                  Print current local/UTC time and timezone
  todo-mcp connect <client>     Register this server: cursor | claude-desktop | claude-code | json
      --dry-run                 Print the merged config instead of writing it
  todo-mcp --version | --help

Environment:
  TODO_DB_PATH     SQLite file to use (default: the app's data directory)
  TODO_MCP_DEBUG=1 Verbose logging on stderr
`;

export interface ParsedArgs {
  command: "serve" | "add" | "list" | "now" | "connect" | "help" | "version";
  positional: string[];
  flags: Record<string, string[]>;
}

const BOOLEAN_FLAGS = new Set(["help", "version", "all", "done", "dry-run"]);

function pushFlag(flags: Record<string, string[]>, key: string, value: string): void {
  const list = flags[key] ?? [];
  list.push(value);
  flags[key] = list;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string[]> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        pushFlag(flags, key, "true");
        continue;
      }
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`--${key} needs a value`);
      pushFlag(flags, key, value);
      i++;
    } else positional.push(arg);
  }
  if (flags.help) return { command: "help", positional, flags };
  if (flags.version) return { command: "version", positional, flags };
  const [first, ...rest] = positional;
  switch (first) {
    case undefined:
    case "serve":
      return { command: "serve", positional: rest, flags };
    case "add":
    case "list":
    case "now":
    case "connect":
      return { command: first, positional: rest, flags };
    default:
      throw new Error(`Unknown command "${first}". ${USAGE}`);
  }
}

const one = (flags: Record<string, string[]>, key: string) => flags[key]?.[0];

/** Runs a non-serve subcommand and returns the text to print on stdout. */
export async function runCli(args: ParsedArgs, store: Store): Promise<string> {
  switch (args.command) {
    case "add": {
      const title = args.positional.join(" ").trim();
      if (!title) throw new Error('add needs a title, e.g. todo-mcp add "Call dentist"');
      const due = one(args.flags, "due");
      const remind = one(args.flags, "remind");
      const todo = await store.todos.add({
        title,
        notes: one(args.flags, "notes") ?? null,
        priority: Number(one(args.flags, "priority") ?? 0),
        tags: args.flags.tag ?? [],
        due_at: due ? parseIsoWithOffset(due) : null,
        remind_at: remind ? parseIsoWithOffset(remind) : null,
        source: "cli",
      });
      return `Added #${todo.id}: ${todo.title}`;
    }
    case "list": {
      const status = args.flags.all ? "all" : args.flags.done ? "done" : "open";
      const todos = await store.todos.list({ status, limit: 200 });
      if (!todos.length) return "(no todos)";
      return todos
        .map(
          (t) =>
            `#${t.id}\t${t.status.padEnd(8)}\t${t.due_at ? toIsoWithOffset(t.due_at) : "-"}\t${t.title}`,
        )
        .join("\n");
    }
    case "now": {
      const info = currentTimeInfo();
      return `${info.local_time}  ${info.weekday}  ${info.timezone}\nUTC ${info.utc_time}`;
    }
    case "version":
      return SERVER_VERSION;
    default:
      return USAGE;
  }
}
