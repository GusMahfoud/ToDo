import { type Store, TOOL_NAMES } from "@todomcp/core";
import { log } from "./log";
import type { ToolHandles } from "./tools/register";

/**
 * Pushes the user's tool configuration (enabled + description) into the live
 * tool handles. Before the connection is up we write the fields directly; once
 * connected we go through `update`/`enable`/`disable` so the SDK emits
 * `notifications/tools/list_changed` for us.
 */
export async function applyToolConfig(
  store: Store,
  handles: ToolHandles,
  connected: boolean,
): Promise<void> {
  const configs = await store.config.list();
  for (const cfg of configs) {
    const handle = handles[cfg.name];
    const descriptionChanged = handle.description !== cfg.description;
    const enabledChanged = handle.enabled !== cfg.enabled;
    if (!descriptionChanged && !enabledChanged) continue;
    if (!connected) {
      handle.description = cfg.description;
      handle.enabled = cfg.enabled;
      continue;
    }
    if (descriptionChanged) handle.update({ description: cfg.description });
    if (enabledChanged) (cfg.enabled ? handle.enable : handle.disable).call(handle);
    log.info(
      `tool ${cfg.name}: ${cfg.enabled ? "enabled" : "disabled"}${descriptionChanged ? ", description updated" : ""}`,
    );
  }
  // Names are the source of truth; guard against a handle map that drifted from TOOL_NAMES.
  for (const name of TOOL_NAMES) if (!handles[name]) log.warn(`no handle registered for ${name}`);
}

export interface ConfigWatcher {
  stop(): void;
}

/**
 * Polls `meta.config_seq`; on change, re-applies the config. Cheap enough to run every ~2s.
 * `baseline` is the seq observed when the config was last applied, so nothing slips
 * through between "apply" and "first poll".
 */
export function watchToolConfig(
  store: Store,
  handles: ToolHandles,
  baseline: number,
  intervalMs = 2000,
): ConfigWatcher {
  let last = baseline;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const seq = await store.config.seq();
      if (seq !== last) {
        await applyToolConfig(store, handles, true);
        log.info("tool config reloaded");
      }
      last = seq;
    } catch (err) {
      log.warn("config poll failed", err);
    } finally {
      busy = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  return { stop: () => clearInterval(timer) };
}
