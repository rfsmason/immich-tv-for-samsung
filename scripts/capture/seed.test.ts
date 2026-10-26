import { describe, expect, it } from "vitest";
import { defaultAppSettings } from "../../src/domain/app-settings";
import { createLocalAppSettingsStore } from "../../src/storage/app-settings-store";
import { createLocalConnectionSettingsStore } from "../../src/storage/connection-settings-store";
import { createSeed } from "./seed";

describe("capture settings seed", () => {
  it("round-trips both serialized settings through the app's readers", () => {
    const entries = createSeed(
      { serverUrl: " https://demo.example.invalid/api/ ", apiKey: " demo-key " },
      12
    );
    const storage = {
      getItem: (key: string) => entries[key] ?? null,
      setItem: (key: string, value: string) => {
        entries[key] = value;
      }
    };
    expect(createLocalConnectionSettingsStore(storage).load()).toEqual({
      serverUrl: "https://demo.example.invalid",
      apiKey: "demo-key"
    });
    expect(createLocalAppSettingsStore(storage).load()).toEqual({
      ...defaultAppSettings,
      slideshowIntervalSeconds: 12
    });
    // A clean context receives only the two explicit settings stores.
    expect(Object.keys(entries)).toHaveLength(2);
  });
});
