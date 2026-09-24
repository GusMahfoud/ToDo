import type { Store, ToolConfig, ToolName } from "@todomcp/core";
import { useCallback, useState } from "react";
import { Button, Notice, Toggle } from "../../components/ui";
import { useLiveQuery, useSeq } from "../../hooks/useLiveQuery";

function ToolRow({
  cfg,
  onToggle,
  onSaveDescription,
  onReset,
}: {
  cfg: ToolConfig;
  onToggle: (enabled: boolean) => Promise<void>;
  onSaveDescription: (text: string) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? cfg.description;
  const dirty = draft !== null && draft.trim() !== cfg.description;

  return (
    <article className={`tool ${cfg.enabled ? "" : "is-off"}`}>
      <header className="tool-header">
        <div>
          <code className="tool-name">{cfg.name}</code>
          <span className="tool-title">{cfg.title}</span>
          {!cfg.isDefaultDescription && <span className="badge badge-accent">custom prompt</span>}
        </div>
        <Toggle checked={cfg.enabled} onChange={onToggle} label={cfg.enabled ? "On" : "Off"} />
      </header>
      <label className="tool-desc">
        <span className="field-label">
          Description (what the AI reads to decide when to call this tool)
        </span>
        <textarea rows={4} value={text} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <footer className="tool-actions">
        {!cfg.isDefaultDescription && (
          <Button size="sm" onClick={onReset}>
            Reset to default
          </Button>
        )}
        <span className="spacer" />
        {dirty && (
          <Button size="sm" onClick={() => setDraft(null)}>
            Discard
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty}
          onClick={async () => {
            await onSaveDescription(text);
            setDraft(null);
          }}
        >
          Save
        </Button>
      </footer>
      <details className="tool-preview">
        <summary>Preview exactly what the AI sees</summary>
        <pre>{`${cfg.name}${cfg.enabled ? "" : "  (disabled — not advertised)"}\n${cfg.description}`}</pre>
      </details>
    </article>
  );
}

export function AiToolsSettings({ store }: { store: Store }) {
  const seq = useSeq(store, "config", 1500);
  const query = useCallback(() => store.config.list(), [store]);
  const { data: tools, error, refresh } = useLiveQuery(query, [seq]);

  const wrap = (fn: (name: ToolName) => Promise<unknown>) => async (name: ToolName) => {
    await fn(name);
    refresh();
  };
  const toggle = (name: ToolName, enabled: boolean) =>
    wrap((n) => store.config.setEnabled(n, enabled))(name);
  const saveDesc = (name: ToolName, text: string) =>
    wrap((n) => store.config.setDescription(n, text))(name);
  const reset = (name: ToolName) => wrap((n) => store.config.setDescription(n, null))(name);

  return (
    <section className="settings-section">
      <h2>AI tools</h2>
      <p className="muted">
        Choose which tools AI clients can see and edit each tool's description — the "prompt" the
        model uses to decide when and how to call it. Changes apply live to running MCP servers. If
        a client doesn't pick up a change, restart the MCP server in that client (or start a new
        chat).
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {tools?.map((cfg) => (
        <ToolRow
          key={cfg.name}
          cfg={cfg}
          onToggle={(enabled) => toggle(cfg.name, enabled)}
          onSaveDescription={(text) => saveDesc(cfg.name, text)}
          onReset={() => reset(cfg.name)}
        />
      ))}
    </section>
  );
}
