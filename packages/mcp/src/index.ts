#!/usr/bin/env bun
/**
 * todo-mcp entry point. With no arguments it serves MCP over stdio; a few
 * subcommands make the same binary useful from shells and keybindings.
 * NEVER write to stdout while serving — the transport owns it.
 */
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { openBunStore, resolveDbPath } from "@todomcp/core/node";
import { parseArgs, runCli } from "./cli";
import { runConnect } from "./cli-connect";
import { log } from "./log";
import { createTodoServer } from "./server";

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help" || args.command === "version") {
    process.stdout.write(`${await runCli(args, null as never)}\n`);
    return;
  }

  const dbPath = resolveDbPath();
  if (args.command === "connect") {
    const client = args.positional[0] ?? "";
    process.stdout.write(
      `${runConnect(client, dbPath, { dryRun: Boolean(args.flags["dry-run"]) })}\n`,
    );
    return;
  }
  const store = await openBunStore(dbPath);

  if (args.command !== "serve") {
    try {
      process.stdout.write(`${await runCli(args, store)}\n`);
    } finally {
      await store.close();
    }
    return;
  }

  log.info(`serving over stdio · db=${dbPath}`);
  const handle = serveStdio(
    async () => {
      const todo = await createTodoServer(store);
      // The SDK connects the instance right after the factory returns; start
      // polling on the next tick so the first reload goes through the handles.
      setTimeout(() => todo.startWatching(), 0);
      return todo.server;
    },
    { onerror: (err) => log.error("transport error", err) },
  );

  const shutdown = async () => {
    await handle.close().catch(() => undefined);
    await store.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  log.error("fatal", err);
  process.exit(1);
});
