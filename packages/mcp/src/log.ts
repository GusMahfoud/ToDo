/**
 * stdout is the JSON-RPC channel, so every log line goes to stderr.
 * Set TODO_MCP_DEBUG=1 for verbose output.
 */
const DEBUG = process.env.TODO_MCP_DEBUG === "1";

function write(level: string, args: unknown[]): void {
  const line = args
    .map((a) =>
      a instanceof Error ? (a.stack ?? a.message) : typeof a === "string" ? a : JSON.stringify(a),
    )
    .join(" ");
  process.stderr.write(`[todo-mcp] ${level} ${line}\n`);
}

export const log = {
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
  debug: (...args: unknown[]) => {
    if (DEBUG) write("debug", args);
  },
};
