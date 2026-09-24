/** Typed wrappers around the Rust commands in src-tauri/src/commands.rs. */
import { invoke } from "@tauri-apps/api/core";

export type ClientId = "cursor" | "claude-desktop";

export interface ServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface ConfigPreview {
  client: ClientId;
  path: string;
  exists: boolean;
  before: string;
  after: string;
  already_configured: boolean;
  candidates: string[];
}

export interface WriteResult {
  path: string;
  backup_path: string | null;
}

export interface AppInfo {
  name: string;
  version: string;
  os: string;
  arch: string;
  appimage: boolean;
}

export const tauri = {
  dbPath: () => invoke<string>("db_path"),
  mcpBinaryPath: () => invoke<string>("mcp_binary_path"),
  mcpServerEntry: () => invoke<ServerEntry>("mcp_server_entry"),
  clientConfigPreview: (client: ClientId) =>
    invoke<ConfigPreview>("client_config_preview", { client }),
  clientConfigWrite: (client: ClientId) => invoke<WriteResult>("client_config_write", { client }),
  showNotification: (title: string, body: string) =>
    invoke<void>("show_notification", { title, body }),
  pauseReminders: (minutes: number) => invoke<number>("pause_reminders", { minutes }),
  revealPath: (path: string) => invoke<void>("reveal_path", { path }),
  appInfo: () => invoke<AppInfo>("app_info"),
};

export const isTauri = (): boolean => "__TAURI_INTERNALS__" in window;
