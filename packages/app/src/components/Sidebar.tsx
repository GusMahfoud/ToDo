export type View = "today" | "upcoming" | "all" | "done" | "settings";

const NAV: { id: View; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "all", label: "All" },
  { id: "done", label: "Done" },
];

export function Sidebar({
  view,
  onSelect,
  counts,
}: {
  view: View;
  onSelect: (v: View) => void;
  counts: Partial<Record<View, number>>;
}) {
  return (
    <nav className="sidebar" aria-label="Views">
      <div className="brand">TodoMCP</div>
      <ul className="nav">
        {NAV.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`nav-item ${view === item.id ? "is-active" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <span>{item.label}</span>
              {counts[item.id] !== undefined && counts[item.id] !== 0 && (
                <span className="nav-count">{counts[item.id]}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <div className="sidebar-footer">
        <button
          type="button"
          className={`nav-item ${view === "settings" ? "is-active" : ""}`}
          onClick={() => onSelect("settings")}
        >
          Settings
        </button>
      </div>
    </nav>
  );
}
