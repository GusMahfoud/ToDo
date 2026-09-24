import { SETTING_KEYS, type Store } from "@todomcp/core";
import { useCallback, useEffect, useState } from "react";
import { useTauriEvent } from "./useTauriEvent";

export type Theme = "system" | "light" | "dark";

export interface Settings {
  theme: Theme;
  defaultReminderLeadMinutes: number;
  remindersPausedUntil: number;
}

const DEFAULTS: Settings = {
  theme: "system",
  defaultReminderLeadMinutes: 30,
  remindersPausedUntil: 0,
};

function parse(all: Record<string, string>): Settings {
  const theme = all[SETTING_KEYS.theme];
  return {
    theme: theme === "light" || theme === "dark" ? theme : "system",
    defaultReminderLeadMinutes: Number(
      all[SETTING_KEYS.defaultReminderLeadMinutes] ?? DEFAULTS.defaultReminderLeadMinutes,
    ),
    remindersPausedUntil: Number(all[SETTING_KEYS.remindersPausedUntil] ?? 0),
  };
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/** Settings live in the shared DB so the Rust side (reminder pause) and UI agree. */
export function useSettings(store: Store | null) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  const reload = useCallback(async () => {
    if (!store) return;
    const parsed = parse(await store.settings.all());
    setSettings(parsed);
    applyTheme(parsed.theme);
  }, [store]);

  useEffect(() => {
    void reload();
  }, [reload]);
  useTauriEvent("settings-changed", () => void reload());

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      if (!store) return;
      if (patch.theme !== undefined) await store.settings.set(SETTING_KEYS.theme, patch.theme);
      if (patch.defaultReminderLeadMinutes !== undefined) {
        await store.settings.set(
          SETTING_KEYS.defaultReminderLeadMinutes,
          patch.defaultReminderLeadMinutes,
        );
      }
      if (patch.remindersPausedUntil !== undefined) {
        await store.settings.set(SETTING_KEYS.remindersPausedUntil, patch.remindersPausedUntil);
      }
      await reload();
    },
    [store, reload],
  );

  return { settings, update, reload };
}
