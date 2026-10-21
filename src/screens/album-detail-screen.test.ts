import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlbumService } from "../app/album-service";
import type { AlbumAsset } from "../domain/album";
import type { AppSettings } from "../domain/app-settings";
import { TestDocument } from "../test/document";
import { mountAlbumDetailScreen } from "./album-detail-screen";

function asset(id: string, type: AlbumAsset["type"] = "image"): AlbumAsset {
  return {
    capturedAt: null,
    durationMs: type === "video" ? 10000 : null,
    id,
    livePhotoVideoId: null,
    location: null,
    name: `${id}.jpg`,
    type
  };
}

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    autoplayVideos: false,
    showViewerDate: false,
    showViewerExif: false,
    showViewerTime: false,
    slideshowIntervalSeconds: 8,
    ...overrides
  };
}

describe("album detail viewer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not restart video autoplay when slideshow starts over a cached video poster", async () => {
    const documentRef = new TestDocument();
    const loadAssetPlaybackUrl = vi.fn(() => "blob:video");
    const video = documentRef.getElementById("asset-viewer-video");
    const play = vi.fn().mockResolvedValue(undefined);

    Object.assign(video, {
      buffered: { length: 0 },
      currentTime: 0,
      duration: 0,
      ended: false,
      paused: true,
      play,
      readyState: 2
    });

    const controller = mountAlbumDetailScreen({
      documentRef: documentRef as unknown as Document,
      loadFeedPage: vi.fn(),
      onBack: vi.fn(),
      service: {
        loadAssetPlaybackUrl,
        loadAssetThumbnailUrl: vi.fn().mockResolvedValue(null),
        loadAssetViewerStillUrl: vi.fn().mockResolvedValue("blob:poster"),
        revokeImageUrl: vi.fn(),
        revokeThumbnailUrl: vi.fn()
      } as unknown as AlbumService,
      settingsStore: { load: () => settings({ autoplayVideos: true }), save: vi.fn() }
    });

    // Autoplay starts the video once its poster arrives.
    controller.showStaticAssetCollection({
      assets: [asset("video-1", "video"), asset("image-1")],
      focusedIndex: 0,
      id: "recent",
      title: "Recent"
    });
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(loadAssetPlaybackUrl).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "keyCode", { value: 10252 });
    documentRef.dispatchEvent(event);

    expect(
      documentRef.getElementById("asset-viewer-slideshow").getAttribute("data-slideshow-state")
    ).toBe("playing");
    expect(loadAssetPlaybackUrl).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    controller.destroy();
  });
});
