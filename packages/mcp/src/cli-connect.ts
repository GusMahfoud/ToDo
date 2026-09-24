/**
 * `todo-mcp connect <client>` — register this binary in an AI client's config
 * without the desktop app. Mirrors src-tauri/src/connect.rs (keep in sync).
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CLIENTS = ["cursor", "claude-desktop", "claude-code", "json"] as const;
export type ConnectClient = (typeof CLIENTS)[number];

export interface ServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface ConnectEnv {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  home?: string;
}

/** How a client must launch us: the compiled binary directly, or `bun run <entry>` from source. */
export function selfCommand(
  execPath = process.execPath,
  main = Bun.main,
): Pick<ServerEntry, "command" | "args"> {
  // Split on either separator so Windows paths behave the same when tested on Linux.
  const exe = execPath.split(/[\\/]/).pop() ?? "";
  if (!/^bun(\.exe)?$/i.test(exe)) return { command: execPath, args: [] };
  const entry = main.startsWith("file:") ? fileURLToPath(main) : main;
  const sep = entry.includes("\\") ? "\\" : "/";
  const dir = entry.slice(0, entry.lastIndexOf(sep));
  return { command: execPath, args: ["run", `${dir}${sep}index.ts`] };
}

export function serverEntry(dbPath: string, self = selfCommand()): ServerEntry {
  return { ...self, env: { TODO_DB_PATH: dbPath } };
}

export function configCandidates(client: ConnectClient, opts: ConnectEnv = {}): string[] {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir();
  if (client === "cursor") return [join(home, ".cursor", "mcp.json")];
  if (client !== "claude-desktop") return [];
  const file = "claude_desktop_config.json";
  if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    const roaming = env.APPDATA ?? join(home, "AppData", "Roaming");
    const msix = join(local, "Packages", "Claude_pzs8sxrjxfjjc");
    const out = [join(roaming, "Claude", file)];
    if (existsSync(msix)) out.unshift(join(msix, "LocalCache", "Roaming", "Claude", file));
    return out;
  }
  if (platform === "darwin") return [join(home, "Library", "Application Support", "Claude", file)];
  return [join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "Claude", file)];
}

export function pickConfigPath(candidates: string[]): string {
  const found = candidates.find((p) => existsSync(p)) ?? candidates[0];
  if (!found) throw new Error("No config location known for this client");
  return found;
}

export function mergeEntry(
  existing: Record<string, unknown>,
  entry: ServerEntry,
): Record<string, unknown> {
  const servers = existing.mcpServers;
  const merged = typeof servers === "object" && servers !== null ? { ...(servers as object) } : {};
  return { ...existing, mcpServers: { ...merged, todo: entry } };
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .trim();
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${path} is not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

const q = (s: string) => (/^[\w./:\\-]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`);

export function claudeCodeCommand(entry: ServerEntry): string {
  const env = Object.entries(entry.env)
    .map(([k, v]) => `-e ${k}=${q(v)}`)
    .join(" ");
  const cmd = [entry.command, ...entry.args].map(q).join(" ");
  return `claude mcp add --scope user ${env} todo -- ${cmd}`;
}

export interface ConnectOptions {
  dryRun?: boolean;
  now?: () => number;
  /** Platform/home overrides (tests). */
  location?: ConnectEnv;
}

/** Returns the text to print. Writes the config unless `dryRun` or the client is copy-paste only. */
export function runConnect(client: string, dbPath: string, opts: ConnectOptions = {}): string {
  if (!(CLIENTS as readonly string[]).includes(client)) {
    throw new Error(`Unknown client "${client}". One of: ${CLIENTS.join(", ")}`);
  }
  const entry = serverEntry(dbPath);
  if (client === "claude-code") return claudeCodeCommand(entry);
  if (client === "json") return JSON.stringify({ mcpServers: { todo: entry } }, null, 2);

  const path = pickConfigPath(configCandidates(client as ConnectClient, opts.location ?? {}));
  const before = readJson(path);
  const after = JSON.stringify(mergeEntry(before, entry), null, 2);
  if (opts.dryRun) return `# would write ${path}\n${after}`;

  let backup = "";
  if (existsSync(path)) {
    backup = `${path}.${Math.floor((opts.now ?? Date.now)() / 1000)}.bak`;
    copyFileSync(path, backup);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${after}\n`, "utf8");
  return `Wrote ${path}${backup ? `\nBackup ${backup}` : ""}\nRestart ${client} to load the todo server.`;
}
