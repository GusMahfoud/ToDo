import { invoke } from "@tauri-apps/api/core";
import { Store, TauriDb } from "@todomcp/core";

let opening: Promise<Store> | null = null;

/** One Store for the whole UI, backed by the Rust-side connection. Migrates on first use. */
export function getStore(): Promise<Store> {
  if (!opening) {
    opening = Store.open(new TauriDb((cmd, args) => invoke(cmd, args))).catch((err) => {
      opening = null;
      throw err;
    });
  }
  return opening;
}
