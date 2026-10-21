import type { ConnectionSettings } from "../../src/domain/connection";
import { defaultAppSettings } from "../../src/domain/app-settings";
import { createLocalAppSettingsStore } from "../../src/storage/app-settings-store";
import { createLocalConnectionSettingsStore } from "../../src/storage/connection-settings-store";

// Run the real writers against an in-memory adapter. Only their serialized
// output crosses into addInitScript; no storage keys or schemas are copied.
export function createSeed(settings: ConnectionSettings, interval: number): Record<string, string> {
  const entries: Record<string, string> = {};
  const storage = {
    getItem: (key: string) => entries[key] ?? null,
    setItem: (key: string, value: string) => {
      entries[key] = value;
    }
  };
  createLocalConnectionSettingsStore(storage).save(settings);
  createLocalAppSettingsStore(storage).save({
    ...defaultAppSettings,
    slideshowIntervalSeconds: interval
  });
  return entries;
}
