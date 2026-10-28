import type { AppSettings } from "../domain/app-settings";
import { defaultAppSettings, normalizeAppSettings } from "../domain/app-settings";
import type { KeyValueStorage } from "./connection-settings-store";

export type AppSettingsStore = {
  load(): AppSettings;
  save(settings: AppSettings): AppSettings;
};

const storageKey = "immich-tv.app-settings";

// The stored shape's version. Settings saved before versioning (version 0)
// differ only by missing settings, which normalising fills with defaults. A
// change that cannot be read that way bumps the version and adds a step to
// migrateStoredAppSettings.
export const appSettingsSchemaVersion = 2;

type StoredAppSettings = Partial<AppSettings> & { schemaVersion?: number };

export function createLocalAppSettingsStore(storage: KeyValueStorage): AppSettingsStore {
  return {
    load() {
      const raw = storage.getItem(storageKey);

      if (!raw) {
        return defaultAppSettings;
      }

      try {
        return normalizeAppSettings(migrateStoredAppSettings(JSON.parse(raw) as StoredAppSettings));
      } catch {
        return defaultAppSettings;
      }
    },
    save(settings) {
      const normalized = normalizeAppSettings(settings);
      const stored: StoredAppSettings = { ...normalized, schemaVersion: appSettingsSchemaVersion };

      storage.setItem(storageKey, JSON.stringify(stored));

      return normalized;
    }
  };
}

function migrateStoredAppSettings(stored: StoredAppSettings): Partial<AppSettings> {
  const settings: StoredAppSettings = { ...stored };

  // Version 0 to 1 added settings only; nothing to convert.
  // Version 1 to 2 added ambient mode's settings (ADR 0019); a stored file
  // without them takes the defaults, so there is nothing to convert either.
  delete settings.schemaVersion;

  return settings;
}
