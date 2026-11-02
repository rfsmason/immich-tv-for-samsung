import type { ConnectionSettings } from "../domain/connection";
import type { Logger } from "../logging/logger";
import type {
  ConnectionSettingsStore,
  KeyValueStorage
} from "../storage/connection-settings-store";
import { validateConnectionSettings } from "../utils/url";

// Connection details an installer wrote into the package (ADR 0022):
// scripts/install-preset.js, which Apps2Samsung fills in from its catalogue
// form. A preset is applied once. The next start with the same details leaves
// the saved connection alone, so a change made in Settings on the TV stands
// until the app is installed again with different details.

const appliedPresetKey = "immich-tv.install-preset";

export type InstallPresetResult = "none" | "invalid" | "already-applied" | "applied";

// Reads the preset object from the package. Both fields empty, or no preset
// at all, means the package was installed without one.
export function readInstallPreset(value: unknown): ConnectionSettings | "invalid" | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const preset = value as { apiKey?: unknown; serverUrl?: unknown };

  if (typeof preset.serverUrl !== "string" || typeof preset.apiKey !== "string") {
    return "invalid";
  }

  if (!preset.serverUrl.trim() && !preset.apiKey.trim()) {
    return null;
  }

  try {
    return validateConnectionSettings({ apiKey: preset.apiKey, serverUrl: preset.serverUrl });
  } catch {
    return "invalid";
  }
}

export function applyInstallPreset(options: {
  connections: ConnectionSettingsStore;
  logger: Logger;
  preset: unknown;
  storage: KeyValueStorage;
}): InstallPresetResult {
  const { connections, logger, storage } = options;
  const preset = readInstallPreset(options.preset);

  if (preset === null) {
    return "none";
  }

  // The details themselves are never logged: the server address can be
  // private and the key is a credential.
  if (preset === "invalid") {
    logger.warn("Ignoring the installer's connection details: they are incomplete or invalid.");
    return "invalid";
  }

  const fingerprint = fingerprintPreset(preset);

  if (storage.getItem(appliedPresetKey) === fingerprint) {
    return "already-applied";
  }

  connections.save(preset);
  storage.setItem(appliedPresetKey, fingerprint);
  logger.info("Saved the connection details the installer provided.");

  return "applied";
}

// A 32-bit FNV-1a hash, enough to tell whether the installer's details have
// changed without storing a second copy of the key.
function fingerprintPreset(settings: ConnectionSettings): string {
  const text = `${settings.serverUrl}\n${settings.apiKey}`;
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16);
}
