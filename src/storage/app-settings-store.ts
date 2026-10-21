import type { AppSettings } from "../domain/app-settings";
import { defaultAppSettings, normalizeAppSettings } from "../domain/app-settings";
import type { KeyValueStorage } from "./connection-settings-store";

export type AppSettingsStore = {
  load(): AppSettings;
  save(settings: AppSettings): AppSettings;
};

const storageKey = "immich-tv.app-settings";

export function createLocalAppSettingsStore(storage: KeyValueStorage): AppSettingsStore {
  return {
    load() {
      const raw = storage.getItem(storageKey);

      if (!raw) {
        return defaultAppSettings;
      }

      try {
        return normalizeAppSettings(JSON.parse(raw) as Partial<AppSettings>);
      } catch {
        return defaultAppSettings;
      }
    },
    save(settings) {
      const normalized = normalizeAppSettings(settings);

      storage.setItem(storageKey, JSON.stringify(normalized));

      return normalized;
    }
  };
}
