import { useState } from "react";
import { Button, Field, Notice } from "../../components/ui";
import type { Settings } from "../../hooks/useSettings";
import { formatFull } from "../../lib/format";
import { tauri } from "../../lib/tauri";

export function NotificationsSettings({
  settings,
  update,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const paused = settings.remindersPausedUntil > Date.now();

  const pause = async (minutes: number) => {
    const until = await tauri.pauseReminders(minutes);
    await update({ remindersPausedUntil: until });
  };

  return (
    <section className="settings-section">
      <h2>Notifications</h2>
      <p className="muted">
        Reminders fire as OS notifications from the app itself, even while the window is hidden in
        the tray. Several reminders due at once are grouped into a single notification.
      </p>

      <Field
        label="Default reminder lead time"
        hint="Used by the “−Xm” button next to a todo's reminder field."
      >
        <select
          value={settings.defaultReminderLeadMinutes}
          onChange={(e) => update({ defaultReminderLeadMinutes: Number(e.target.value) })}
        >
          {[0, 5, 10, 15, 30, 60, 120, 1440].map((m) => (
            <option key={m} value={m}>
              {m === 0
                ? "At due time"
                : m < 60
                  ? `${m} minutes before`
                  : m === 60
                    ? "1 hour before"
                    : m === 120
                      ? "2 hours before"
                      : "1 day before"}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Pause reminders">
        {paused ? (
          <Notice tone="warn">
            Paused until {formatFull(settings.remindersPausedUntil)}.{" "}
            <Button size="sm" onClick={() => pause(0)}>
              Resume now
            </Button>
          </Notice>
        ) : (
          <div className="row">
            <Button size="sm" onClick={() => pause(60)}>
              1 hour
            </Button>
            <Button size="sm" onClick={() => pause(240)}>
              4 hours
            </Button>
            <Button size="sm" onClick={() => pause(24 * 60)}>
              Until tomorrow
            </Button>
          </div>
        )}
      </Field>

      <Field
        label="Test"
        hint="On Windows, notifications are tied to the installed app's identity; test from the installed build."
      >
        <div className="row">
          <Button
            size="sm"
            onClick={async () => {
              try {
                await tauri.showNotification("TodoMCP", "Notifications are working.");
                setStatus(
                  "Sent. If nothing appeared, check the OS notification settings for TodoMCP.",
                );
              } catch (e) {
                setStatus(String(e));
              }
            }}
          >
            Send test notification
          </Button>
          {status && <span className="muted">{status}</span>}
        </div>
      </Field>
    </section>
  );
}
