#!/usr/bin/env bun
/**
 * Compiles packages/mcp into a standalone `todo-mcp` binary and drops it where
 * Tauri expects sidecars: packages/app/src-tauri/binaries/todo-mcp-<target-triple>[.exe]
 *
 *   bun run scripts/build-sidecar.ts                     # host triple (from rustc, else guessed)
 *   bun run scripts/build-sidecar.ts x86_64-pc-windows-msvc aarch64-apple-darwin
 *   bun run scripts/build-sidecar.ts --all
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTRY = join(ROOT, "packages/mcp/src/index.ts");
const OUT_DIR = join(ROOT, "packages/app/src-tauri/binaries");

/** Rust target triple → Bun compile target. */
const TARGETS = {
  "x86_64-pc-windows-msvc": "bun-windows-x64",
  "aarch64-pc-windows-msvc": "bun-windows-arm64",
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
} as const;
type Triple = keyof typeof TARGETS;

function hostTriple(): Triple {
  const viaRustc = Bun.spawnSync(["rustc", "--print", "host-tuple"], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const printed = viaRustc.success ? viaRustc.stdout.toString().trim() : "";
  if (printed in TARGETS) return printed as Triple;
  const os = process.platform;
  const arch = process.arch;
  if (os === "win32")
    return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  if (os === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu";
}

async function build(triple: Triple): Promise<string> {
  const ext = triple.includes("windows") ? ".exe" : "";
  const outfile = join(OUT_DIR, `todo-mcp-${triple}${ext}`);
  const args = [
    "bun",
    "build",
    ENTRY,
    "--compile",
    `--target=${TARGETS[triple]}`,
    "--minify",
    "--sourcemap",
    `--outfile=${outfile}`,
  ];
  console.log(`→ ${triple}`);
  const proc = Bun.spawn(args, { cwd: ROOT, stdout: "inherit", stderr: "inherit" });
  if ((await proc.exited) !== 0) throw new Error(`bun build failed for ${triple}`);
  return outfile;
}

const argv = process.argv.slice(2);
const triples: Triple[] = argv.includes("--all")
  ? (Object.keys(TARGETS) as Triple[])
  : argv.length
    ? argv.map((t) => {
        if (!(t in TARGETS))
          throw new Error(`Unknown target triple ${t}. Known: ${Object.keys(TARGETS).join(", ")}`);
        return t as Triple;
      })
    : [hostTriple()];

mkdirSync(OUT_DIR, { recursive: true });
for (const triple of triples) console.log(`built ${await build(triple)}`);
