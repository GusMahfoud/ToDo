import type { Store } from "@todomcp/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { getStore } from "../lib/store";

/** Resolves the shared Store once; `error` is set if the DB could not be opened. */
export function useStore(): { store: Store | null; error: string | null } {
  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getStore().then(
      (s) => alive && setStore(s),
      (e) => alive && setError(String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);
  return { store, error };
}

type SeqKind = "todos" | "config";

/**
 * Polls a change counter (`meta.todos_seq` / `meta.config_seq`) while the
 * window is visible and returns it. Any query keyed on the value re-runs when
 * another process (the MCP server) writes to the database.
 */
export function useSeq(store: Store | null, kind: SeqKind, intervalMs = 1000): number {
  const [seq, setSeq] = useState(0);
  useEffect(() => {
    if (!store) return;
    let alive = true;
    const read = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = kind === "todos" ? await store.todos.seq() : await store.config.seq();
        if (alive) setSeq(next);
      } catch {
        // transient; next tick retries
      }
    };
    void read();
    const timer = setInterval(read, intervalMs);
    document.addEventListener("visibilitychange", read);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", read);
    };
  }, [store, kind, intervalMs]);
  return seq;
}

export interface LiveResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Runs `query` (memoise it with useCallback) whenever it, `deps`, or a manual
 * refresh changes. Include a seq from `useSeq` in `deps` for live refresh.
 */
export function useLiveQuery<T>(
  query: (() => Promise<T>) | null,
  deps: readonly unknown[],
): LiveResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const latest = useRef(0);
  const depsKey = JSON.stringify(deps);

  // biome-ignore lint/correctness/useExhaustiveDependencies: depsKey and tick exist only to re-run the effect
  useEffect(() => {
    if (!query) return;
    const id = ++latest.current;
    setLoading(true);
    query().then(
      (result) => {
        if (id !== latest.current) return;
        setData(result);
        setError(null);
        setLoading(false);
      },
      (e) => {
        if (id !== latest.current) return;
        setError(String(e));
        setLoading(false);
      },
    );
  }, [query, depsKey, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}
