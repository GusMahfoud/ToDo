import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useCallback, useEffect, useState } from "react";
import { Button, Notice } from "../../components/ui";
import { type ClientId, type ConfigPreview, type ServerEntry, tauri } from "../../lib/tauri";

function shellQuote(s: string): string {
  return /^[\w./:\\-]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`;
}

export function claudeCodeCommand(entry: ServerEntry): string {
  const env = Object.entries(entry.env)
    .map(([k, v]) => `-e ${k}=${shellQuote(v)}`)
    .join(" ");
  return `claude mcp add --scope user ${env} todo -- ${shellQuote(entry.command)}`;
}

export function genericJson(entry: ServerEntry): string {
  return JSON.stringify({ mcpServers: { todo: entry } }, null, 2);
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        await writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

function JsonClientCard({
  client,
  title,
  note,
}: {
  client: ClientId;
  title: string;
  note: string;
}) {
  const [preview, setPreview] = useState<ConfigPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const load = useCallback(
    () =>
      tauri.clientConfigPreview(client).then(
        (p) => {
          setPreview(p);
          setError(null);
        },
        (e) => setError(String(e)),
      ),
    [client],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const write = async () => {
    try {
      const r = await tauri.clientConfigWrite(client);
      setResult(
        `Written to ${r.path}${r.backup_path ? ` (backup: ${r.backup_path})` : ""}. Restart ${title} to pick it up.`,
      );
      setShowDiff(false);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <article className="card">
      <header className="card-header">
        <h3>{title}</h3>
        {preview?.already_configured && <span className="badge badge-accent">connected</span>}
      </header>
      <p className="muted">{note}</p>
      {preview && (
        <p className="path">
          <code>{preview.path}</code> {preview.exists ? "" : "(will be created)"}
          {preview.exists && (
            <Button size="sm" onClick={() => tauri.revealPath(preview.path)}>
              Show file
            </Button>
          )}
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {result && <Notice tone="ok">{result}</Notice>}
      <div className="row">
        <Button
          variant="primary"
          size="sm"
          disabled={!preview}
          onClick={() => setShowDiff((s) => !s)}
        >
          {preview?.already_configured ? "Re-apply…" : "Connect…"}
        </Button>
        {preview && <CopyButton text={preview.after} label="Copy merged JSON" />}
      </div>
      {showDiff && preview && (
        <div className="diff">
          <p className="muted">
            This will merge a <code>todo</code> entry into <code>mcpServers</code> and leave
            everything else untouched. A timestamped <code>.bak</code> copy is kept.
          </p>
          <div className="diff-cols">
            <div>
              <span className="field-label">Before</span>
              <pre>{preview.before || "(no file)"}</pre>
            </div>
            <div>
              <span className="field-label">After</span>
              <pre>{preview.after}</pre>
            </div>
          </div>
          <div className="row">
            <Button variant="primary" size="sm" onClick={write}>
              Write file
            </Button>
            <Button size="sm" onClick={() => setShowDiff(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

export function ConnectSettings() {
  const [entry, setEntry] = useState<ServerEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tauri.mcpServerEntry().then(setEntry, (e) => setError(String(e)));
  }, []);

  return (
    <section className="settings-section">
      <h2>Connect an AI client</h2>
      <p className="muted">
        Each client launches <code>todo-mcp</code> itself and talks to it over stdio. The database
        path is written explicitly so the app and the server always use the same file.
      </p>
      {error && (
        <Notice tone="error">
          {error}
          <br />
          The MCP binary ships inside the installed app. In development run{" "}
          <code>bun run build:sidecar</code>.
        </Notice>
      )}
      {entry && (
        <p className="path">
          <span className="field-label">Server binary</span> <code>{entry.command}</code>
          <br />
          <span className="field-label">Database</span> <code>{entry.env.TODO_DB_PATH}</code>
        </p>
      )}

      <JsonClientCard
        client="cursor"
        title="Cursor"
        note="Edits ~/.cursor/mcp.json (global MCP servers)."
      />
      <JsonClientCard
        client="claude-desktop"
        title="Claude Desktop"
        note="Edits claude_desktop_config.json. On Windows the Store/MSIX build reads a different copy; the detected location is shown below."
      />

      <article className="card">
        <h3>Claude Code</h3>
        <p className="muted">Run this once in a terminal:</p>
        {entry && (
          <>
            <pre>{claudeCodeCommand(entry)}</pre>
            <CopyButton text={claudeCodeCommand(entry)} label="Copy command" />
          </>
        )}
      </article>

      <article className="card">
        <h3>Any other MCP client</h3>
        <p className="muted">
          Most clients accept this JSON shape (or the equivalent command/args/env fields).
        </p>
        {entry && (
          <>
            <pre>{genericJson(entry)}</pre>
            <CopyButton text={genericJson(entry)} label="Copy JSON" />
          </>
        )}
      </article>
    </section>
  );
}
