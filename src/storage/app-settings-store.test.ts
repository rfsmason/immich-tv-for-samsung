import { describe, expect, it } from "vitest";
import { defaultAppSettings } from "../domain/app-settings";
import { appSettingsSchemaVersion, createLocalAppSettingsStore } from "./app-settings-store";
import type { KeyValueStorage } from "./connection-settings-store";

function createMemoryStorage(initial: Record<string, string> = {}): KeyValueStorage & {
  values: Record<string, string>;
} {
  return {
    values: { ...initial },
    getItem(key) {
      return this.values[key] || null;
    },
    setItem(key, value) {
      this.values[key] = value;
    }
  };
}

const allRailsOn = {
  albums: true,
  favorites: true,
  memories: true,
  people: true,
  "recently-added": true,
  "recently-viewed": true,
  videos: true
};

describe("app settings store", () => {
  it("loads default settings when storage is empty", () => {
    const store = createLocalAppSettingsStore(createMemoryStorage());

    expect(store.load()).toEqual({
      autoplayVideos: false,
      homeRails: allRailsOn,
      showFaceTags: false,
      showViewerDate: true,
      showViewerExif: true,
      showViewerTime: true,
      slideshowIntervalSeconds: 8,
      sortOrders: {
        favorites: "newest-first",
        people: "newest-first",
        photos: "newest-first",
        search: "newest-first",
        videos: "newest-first"
      }
    });
  });

  it("loads default settings for malformed JSON", () => {
    const store = createLocalAppSettingsStore(
      createMemoryStorage({
        "immich-tv.app-settings": "{bad json"
      })
    );

    expect(store.load()).toEqual(defaultAppSettings);
  });

  it("saves and loads settings with the schema version", () => {
    const storage = createMemoryStorage();
    const store = createLocalAppSettingsStore(storage);
    const settings = {
      autoplayVideos: true,
      homeRails: { ...allRailsOn, people: false },
      showFaceTags: true,
      showViewerDate: false,
      showViewerExif: true,
      showViewerTime: false,
      slideshowIntervalSeconds: 12,
      sortOrders: { ...defaultAppSettings.sortOrders, photos: "oldest-first" as const }
    };

    expect(store.save(settings)).toEqual(settings);
    expect(store.load()).toEqual(settings);
    expect(JSON.parse(storage.values["immich-tv.app-settings"]!).schemaVersion).toBe(
      appSettingsSchemaVersion
    );
  });

  it("migrates unversioned settings, defaulting newer settings", () => {
    const store = createLocalAppSettingsStore(
      createMemoryStorage({
        "immich-tv.app-settings": JSON.stringify({
          autoplayVideos: true
        })
      })
    );

    expect(store.load()).toEqual({
      autoplayVideos: true,
      homeRails: allRailsOn,
      showFaceTags: false,
      showViewerDate: true,
      showViewerExif: true,
      showViewerTime: true,
      slideshowIntervalSeconds: 8,
      sortOrders: {
        favorites: "newest-first",
        people: "newest-first",
        photos: "newest-first",
        search: "newest-first",
        videos: "newest-first"
      }
    });
  });

  it("drops unknown Home rails and turns on rails missing from storage", () => {
    const store = createLocalAppSettingsStore(
      createMemoryStorage({
        "immich-tv.app-settings": JSON.stringify({
          homeRails: { albums: false, retired: false, videos: "no" },
          schemaVersion: 1
        })
      })
    );

    expect(store.load().homeRails).toEqual({ ...allRailsOn, albums: false });
  });

  it("keeps only a chosen oldest-first order and defaults the rest to newest first", () => {
    const store = createLocalAppSettingsStore(
      createMemoryStorage({
        "immich-tv.app-settings": JSON.stringify({
          sortOrders: { albums: "oldest-first", people: "oldest-first", photos: "sideways" }
        })
      })
    );

    expect(store.load().sortOrders).toEqual({
      ...defaultAppSettings.sortOrders,
      people: "oldest-first"
    });
  });

  it("normalizes unsupported slideshow intervals to the safe default", () => {
    const store = createLocalAppSettingsStore(
      createMemoryStorage({
        "immich-tv.app-settings": JSON.stringify({
          slideshowIntervalSeconds: 1
        })
      })
    );

    expect(store.load()).toEqual(defaultAppSettings);
  });
});
