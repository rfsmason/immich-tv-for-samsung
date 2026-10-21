import { describe, expect, it } from "vitest";
import { createLocalAppSettingsStore } from "./app-settings-store";
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

describe("app settings store", () => {
  it("loads default settings when storage is empty", () => {
    const store = createLocalAppSettingsStore(createMemoryStorage());

    expect(store.load()).toEqual({
      autoplayVideos: false,
      showViewerDate: true,
      showViewerExif: true,
      showViewerTime: true,
      slideshowIntervalSeconds: 8
    });
  });

  it("loads default settings for malformed JSON", () => {
    const store = createLocalAppSettingsStore(
      createMemoryStorage({
        "immich-tv.app-settings": "{bad json"
      })
    );

    expect(store.load()).toEqual({
      autoplayVideos: false,
      showViewerDate: true,
      showViewerExif: true,
      showViewerTime: true,
      slideshowIntervalSeconds: 8
    });
  });

  it("saves and loads viewer settings", () => {
    const storage = createMemoryStorage();
    const store = createLocalAppSettingsStore(storage);

    expect(
      store.save({
        autoplayVideos: true,
        showViewerDate: false,
        showViewerExif: true,
        showViewerTime: false,
        slideshowIntervalSeconds: 12
      })
    ).toEqual({
      autoplayVideos: true,
      showViewerDate: false,
      showViewerExif: true,
      showViewerTime: false,
      slideshowIntervalSeconds: 12
    });
    expect(store.load()).toEqual({
      autoplayVideos: true,
      showViewerDate: false,
      showViewerExif: true,
      showViewerTime: false,
      slideshowIntervalSeconds: 12
    });
  });

  it("defaults new viewer metadata settings on for older stored settings", () => {
    const store = createLocalAppSettingsStore(
      createMemoryStorage({
        "immich-tv.app-settings": JSON.stringify({
          autoplayVideos: true
        })
      })
    );

    expect(store.load()).toEqual({
      autoplayVideos: true,
      showViewerDate: true,
      showViewerExif: true,
      showViewerTime: true,
      slideshowIntervalSeconds: 8
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

    expect(store.load()).toEqual({
      autoplayVideos: false,
      showViewerDate: true,
      showViewerExif: true,
      showViewerTime: true,
      slideshowIntervalSeconds: 8
    });
  });
});
