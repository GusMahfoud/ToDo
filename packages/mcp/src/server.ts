import { McpServer } from "@modelcontextprotocol/server";
import type { Store } from "@todomcp/core";
import { applyToolConfig, watchToolConfig } from "./config-watch";
import { log } from "./log";
import { registerTools, type ToolHandles } from "./tools/register";

export const SERVER_NAME = "todomcp";
export const SERVER_VERSION = "0.1.0";

export interface TodoServer {
  server: McpServer;
  handles: ToolHandles;
  /** Call once the transport is connected to start hot-reloading tool config. */
  startWatching(intervalMs?: number): void;
  stop(): void;
}

export interface CreateServerOptions {
  timeZone?: string;
  /** Overrides the client-name detection (tests). */
  source?: string;
}

/**
 * Builds a fully configured McpServer for one connection: registers the tools,
 * applies the user's saved configuration, and wires the config watcher to the
 * connection's lifetime so the process can exit when the client hangs up.
 */
export async function createTodoServer(
  store: Store,
  opts: CreateServerOptions = {},
): Promise<TodoServer> {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION, title: "TodoMCP" });

  const source = () => {
    if (opts.source) return opts.source;
    const client = server.server.getClientVersion()?.name?.trim().toLowerCase();
    return client ? `mcp:${client.replace(/[^a-z0-9._-]+/g, "-").slice(0, 40)}` : "mcp";
  };

  const handles = registerTools(server, store, {
    source,
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  });
  // Read the counter first so a write that lands mid-apply is caught by the first poll.
  const baseline = await store.config.seq();
  await applyToolConfig(store, handles, false);

  let watcher: { stop(): void } | null = null;
  const stop = () => {
    watcher?.stop();
    watcher = null;
  };
  const previousOnClose = server.server.onclose;
  server.server.onclose = () => {
    stop();
    previousOnClose?.();
    log.info("connection closed");
  };

  return {
    server,
    handles,
    startWatching: (intervalMs) => {
      if (!watcher) watcher = watchToolConfig(store, handles, baseline, intervalMs);
    },
    stop,
  };
}
