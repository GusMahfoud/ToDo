import type { Store } from "@todomcp/core";
import { useState } from "react";
import type { Settings } from "../../hooks/useSettings";
import { AiToolsSettings } from "./AiToolsSettings";
import { ConnectSettings } from "./ConnectSettings";
import { GeneralSettings } from "./GeneralSettings";
import { NotificationsSettings } from "./NotificationsSettings";

type Tab = "tools" | "connect" | "notifications" | "general";

const TABS: { id: Tab; label: string }[] = [
  { id: "tools", label: "AI tools" },
  { id: "connect", label: "Connect" },
  { id: "notifications", label: "Notifications" },
  { id: "general", label: "General" },
];

export function SettingsView({
  store,
  settings,
  update,
}: {
  store: Store;
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("tools");
  return (
    <div className="settings">
      <header className="view-header">
        <h1>Settings</h1>
      </header>
      <nav className="tabs" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? "is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="settings-body">
        {tab === "tools" && <AiToolsSettings store={store} />}
        {tab === "connect" && <ConnectSettings />}
        {tab === "notifications" && <NotificationsSettings settings={settings} update={update} />}
        {tab === "general" && <GeneralSettings settings={settings} update={update} />}
      </div>
    </div>
  );
}
