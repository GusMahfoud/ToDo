import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";
import { Field, Notice, Toggle } from "../../components/ui";
import type { Settings, Theme } from "../../hooks/useSettings";
import { type AppInfo, isTauri, tauri } from "../../lib/tauri";

export function GeneralSettings({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [dbPath, setDbPath] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    isEnabled().then(setAutostart, (e) => setError(String(e)));
    tauri.appInfo().then(setInfo, () => undefined);
    tauri.dbPath().then(setDbPath, () => undefined);
  }, []);

  const toggleAutostart = async (next: boolean) => {
    try {
      if (next) await enable();
      else await disable();
      setAutostart(await isEnabled());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <section className="settings-section">
      <h2>General</h2>
      {error && <Notice tone="error">{error}</Notice>}

      <Field
        label="Launch at login"
        hint="Starts hidden in the tray so reminders work after a reboot. On Hyprland/Omarchy, XDG autostart may be ignored — see the README for an exec-once line."
      >
        <Toggle
          checked={autostart === true}
          disabled={autostart === null}
          onChange={toggleAutostart}
          label={autostart === null ? "Checking…" : autostart ? "Enabled" : "Disabled"}
        />
      </Field>

      <Field label="Theme">
        <div className="row">
          {(["system", "light", "dark"] as Theme[]).map((t) => (
            <label key={t} className="radio">
              <input
                type="radio"
                name="theme"
                checked={settings.theme === t}
                onChange={() => update({ theme: t })}
              />
              {t === "system" ? "Follow system" : t === "light" ? "Light" : "Dark"}
            </label>
          ))}
        </div>
      </Field>

      <Field label="Data">
        <p className="path">
          <code>{dbPath || "…"}</code>
        </p>
        <p className="muted">
          One SQLite file holds todos, tool settings and preferences. Back it up by copying the file
          (and its
          <code>-wal</code> sibling) while the app is closed.
        </p>
      </Field>

      {info && (
        <p className="muted small">
          {info.name} {info.version} · {info.os}/{info.arch}
          {info.appimage ? " · AppImage" : ""}
        </p>
      )}
    </section>
  );
}
