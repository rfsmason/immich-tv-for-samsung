import type { ConnectionSettings } from "../domain/connection";
import { normalizeConnectionSettings } from "../utils/url";

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type ConnectionSettingsStore = {
  load(): ConnectionSettings | null;
  save(settings: ConnectionSettings): void;
};

const storageKey = "immich-tv.connection";

export function createLocalConnectionSettingsStore(
  storage: KeyValueStorage
): ConnectionSettingsStore {
  return {
    load() {
      const raw = storage.getItem(storageKey);

      if (!raw) {
        return null;
      }

      try {
        const parsed = JSON.parse(raw) as Partial<ConnectionSettings>;

        if (typeof parsed.serverUrl !== "string" || typeof parsed.apiKey !== "string") {
          return null;
        }

        return normalizeConnectionSettings({
          apiKey: parsed.apiKey,
          serverUrl: parsed.serverUrl
        });
      } catch {
        return null;
      }
    },
    save(settings) {
      storage.setItem(storageKey, JSON.stringify(normalizeConnectionSettings(settings)));
    }
  };
}
