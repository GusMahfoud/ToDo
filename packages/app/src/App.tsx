import { useCallback, useState } from "react";
import { Sidebar, type View } from "./components/Sidebar";
import { Notice } from "./components/ui";
import { useLiveQuery, useSeq, useStore } from "./hooks/useLiveQuery";
import { useSettings } from "./hooks/useSettings";
import { SettingsView } from "./views/settings/SettingsView";
import { filterFor, TodosView } from "./views/TodosView";

export default function App() {
  const { store, error } = useStore();
  const [view, setView] = useState<View>("today");
  const seq = useSeq(store, "todos");
  const { settings, update } = useSettings(store);

  // Sidebar counts: cheap, and they refresh with the same change counter.
  const countQuery = useCallback(async () => {
    if (!store) return {};
    const [today, upcoming, all] = await Promise.all([
      store.todos.list(filterFor("today")),
      store.todos.list(filterFor("upcoming")),
      store.todos.list(filterFor("all")),
    ]);
    return { today: today.length, upcoming: upcoming.length, all: all.length };
  }, [store]);
  const { data: counts } = useLiveQuery(store ? countQuery : null, [seq]);

  if (error) {
    return (
      <main className="boot">
        <Notice tone="error">
          Could not open the todo database.
          <br />
          <code>{error}</code>
        </Notice>
      </main>
    );
  }
  if (!store) return <main className="boot muted">Loading…</main>;

  return (
    <div className="app">
      <Sidebar view={view} onSelect={setView} counts={counts ?? {}} />
      <main className="content">
        {view === "settings" ? (
          <SettingsView store={store} settings={settings} update={update} />
        ) : (
          <TodosView
            store={store}
            view={view}
            seq={seq}
            reminderLeadMinutes={settings.defaultReminderLeadMinutes}
          />
        )}
      </main>
    </div>
  );
}
