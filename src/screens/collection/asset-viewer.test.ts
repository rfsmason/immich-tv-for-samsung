import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlbumAsset } from "../../domain/album";
import { defaultAppSettings, type AppSettings } from "../../domain/app-settings";
import { remoteKeys } from "../../platform/tizen/keys";
import { TestDocument } from "../../test/document";
import { createAssetViewer, type AssetViewerController } from "./asset-viewer";
import type { ViewerCollection, ViewerElements } from "./viewer-types";

// The viewer driven by a fake ordered collection, as People, Search or
// Favorites would provide it.

function asset(id: string, overrides: Partial<AlbumAsset> = {}): AlbumAsset {
  return {
    capturedAt: "2026-10-15T09:30:00.000Z",
    durationMs: null,
    id,
    livePhotoVideoId: null,
    location: null,
    name: `${id}.jpg`,
    type: "image",
    ...overrides
  };
}

const elementIds: Record<keyof ViewerElements, string> = {
  assetPlaceholder: "asset-placeholder",
  assetPlaceholderBack: "asset-placeholder-back",
  assetPlaceholderSummary: "asset-placeholder-summary",
  assetViewerExif: "asset-viewer-exif",
  assetViewerImage: "asset-viewer-image",
  assetViewerPlaceholder: "asset-viewer-placeholder",
  assetViewerPlaceholderMessage: "asset-viewer-placeholder-message",
  assetViewerPlay: "asset-viewer-play",
  assetViewerPlayer: "asset-viewer-player",
  assetViewerPlayerBuffered: "asset-viewer-buffered",
  assetViewerPlayerDuration: "asset-viewer-duration",
  assetViewerPlayerElapsed: "asset-viewer-elapsed",
  assetViewerPlayerProgress: "asset-viewer-progress-fill",
  assetViewerPlayerStatus: "asset-viewer-status",
  assetViewerPlayerStatusText: "asset-viewer-status-text",
  assetViewerSlideshow: "asset-viewer-slideshow",
  assetViewerSlideshowStatus: "asset-viewer-slideshow-status",
  assetViewerSpinner: "asset-viewer-spinner",
  assetViewerTitle: "asset-viewer-title",
  assetViewerVideo: "asset-viewer-video"
};

let viewer: AssetViewerController | null = null;

function fixture(assets: AlbumAsset[], settings: Partial<AppSettings> = {}) {
  const documentRef = new TestDocument();
  const elements = Object.fromEntries(
    Object.entries(elementIds).map(([key, id]) => [key, documentRef.getElementById(id)])
  ) as unknown as ViewerElements;
  const play = vi.fn().mockResolvedValue(undefined);
  const pause = vi.fn();

  Object.assign(elements.assetViewerVideo, {
    buffered: { length: 0 },
    currentTime: 0,
    duration: 3,
    ended: false,
    pause,
    paused: true,
    play,
    readyState: 2
  });

  let index = 0;
  let open = true;
  const collection = {
    absoluteIndex: () => undefined,
    assets: () => assets,
    exit: vi.fn(() => {
      open = false;
    }),
    generation: () => 1,
    index: () => index,
    isCurrentGeneration: () => true,
    isHidden: () => false,
    isLoadingMore: vi.fn(() => false),
    isOpen: () => open,
    loadMore: vi.fn(),
    loadPrevious: vi.fn(),
    select: vi.fn((next: number) => {
      index = next;
    }),
    total: () => assets.length,
    viewingSource: () => ({ id: "search", kind: "collection" as const, title: "Search results" })
  } satisfies ViewerCollection;
  const service = {
    loadAssetPlaybackUrl: vi.fn(() => "https://immich.example/playback"),
    loadAssetViewerStillUrl: vi.fn(async (item: AlbumAsset) => `blob:${item.id}`),
    revokeImageUrl: vi.fn()
  };
  const onAssetViewed = vi.fn();

  viewer = createAssetViewer({
    collection,
    elements,
    onAssetViewed,
    service,
    settingsStore: { load: () => ({ ...defaultAppSettings, ...settings }), save: vi.fn() }
  });

  const press = (keyCode: number) => {
    const event = new Event("keydown", { cancelable: true }) as KeyboardEvent;

    viewer!.handleKeydown(event, keyCode);
    return event;
  };

  return { collection, documentRef, elements, onAssetViewed, pause, play, press, service };
}

beforeEach(() => {
  vi.stubGlobal("window", { clearTimeout, setTimeout });
});

afterEach(() => {
  viewer?.destroy();
  viewer = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("asset viewer over any ordered collection", () => {
  it("opens an asset, shows its position and metadata, and records the visit", async () => {
    const assets = [asset("a"), asset("b", { location: "Bath, UK" })];
    const f = fixture(assets);

    viewer!.open(1);

    expect(f.collection.select).toHaveBeenCalledWith(1);
    expect(f.elements.assetPlaceholder.hidden).toBe(false);
    expect(f.elements.assetPlaceholderSummary.textContent).toContain("2");
    expect(f.onAssetViewed).toHaveBeenCalledWith(assets[1], {
      id: "search",
      kind: "collection",
      title: "Search results"
    });
    expect(f.elements.assetViewerExif.textContent).toBe("Bath, UK");
    expect(f.collection.loadMore).toHaveBeenCalled();
    await vi.waitFor(() => expect(f.elements.assetViewerImage.src).toBe("blob:b"));
    expect(f.elements.assetViewerImage.hidden).toBe(false);
  });

  it("steps with Left and Right, and asks the collection for more at its edges", () => {
    const assets = [asset("a"), asset("b"), asset("c")];
    const f = fixture(assets);

    viewer!.open(0);
    f.press(remoteKeys.left);
    expect(f.collection.loadPrevious).toHaveBeenCalledWith("move");
    expect(f.collection.select).toHaveBeenLastCalledWith(0);

    f.press(remoteKeys.right);
    f.press(remoteKeys.right);
    expect(f.collection.select).toHaveBeenLastCalledWith(2);
    expect(f.collection.loadPrevious).toHaveBeenCalledWith("prefetch");
    expect(f.onAssetViewed.mock.calls.map(([viewed]) => viewed.id)).toEqual(["a", "b", "c"]);

    f.collection.loadMore.mockClear();
    f.press(remoteKeys.right);
    expect(f.collection.loadMore).toHaveBeenCalledTimes(1);
    expect(f.onAssetViewed).toHaveBeenCalledTimes(3);
  });

  it("records a visit only when the selection changes, not when paging re-renders it", () => {
    const assets = [asset("a"), asset("b")];
    const f = fixture(assets);
    const viewedIds = () => f.onAssetViewed.mock.calls.map(([viewed]) => viewed.id);

    viewer!.open(1);
    expect(viewedIds()).toEqual(["b"]);

    // A newer page arrives before the current asset, shifting its index.
    assets.unshift(asset("newer"));
    f.collection.select(2);
    viewer!.render();
    viewer!.render();
    expect(viewedIds()).toEqual(["b"]);

    f.press(remoteKeys.left);
    f.press(remoteKeys.right);
    expect(viewedIds()).toEqual(["b", "a", "b"]);

    viewer!.close();
    viewer!.open(2);
    expect(viewedIds()).toEqual(["b", "a", "b", "b"]);
  });

  it("moves between visible controls with Up and Down and leaves through Back", () => {
    const f = fixture([asset("a"), asset("b")]);

    viewer!.open(0);
    expect(f.documentRef.activeElement).toBe(f.elements.assetViewerSlideshow);
    f.press(remoteKeys.down);
    expect(f.documentRef.activeElement).toBe(f.elements.assetPlaceholderBack);
    f.press(remoteKeys.up);
    expect(f.documentRef.activeElement).toBe(f.elements.assetViewerSlideshow);

    f.elements.assetPlaceholderBack.focus();
    f.press(remoteKeys.enter);
    expect(f.collection.exit).toHaveBeenCalledTimes(1);
    viewer!.open(0);
    f.press(remoteKeys.back);
    expect(f.collection.exit).toHaveBeenCalledTimes(2);
  });

  it("starts, advances and pauses a slideshow, and pauses at the end when nothing more loads", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const f = fixture([asset("a"), asset("b"), asset("c")], { slideshowIntervalSeconds: 5 });
    const state = () => f.elements.assetViewerSlideshow.getAttribute("data-slideshow-state");

    viewer!.open(0);
    f.press(remoteKeys.enter);
    expect(state()).toBe("playing");

    vi.advanceTimersByTime(5000);
    expect(f.collection.select).toHaveBeenLastCalledWith(1);
    f.press(remoteKeys.mediaPause);
    expect(state()).toBe("paused");
    vi.advanceTimersByTime(20000);
    expect(f.collection.select).toHaveBeenLastCalledWith(1);

    f.press(remoteKeys.mediaPlay);
    vi.advanceTimersByTime(5000);
    expect(f.collection.select).toHaveBeenLastCalledWith(2);
    vi.advanceTimersByTime(5000);
    expect(f.collection.loadMore).toHaveBeenCalled();
    expect(state()).toBe("paused");
    expect(vi.getTimerCount()).toBe(0);

    f.press(remoteKeys.mediaPlayPause);
    expect(state()).toBe("playing");
    f.press(remoteKeys.left);
    expect(state()).toBe("paused");
  });

  it("keeps a slideshow waiting while the collection loads more", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const f = fixture([asset("a"), asset("b")], { slideshowIntervalSeconds: 5 });

    viewer!.open(1);
    f.press(remoteKeys.mediaPlay);
    f.collection.isLoadingMore.mockReturnValue(true);
    vi.advanceTimersByTime(5000);

    expect(f.elements.assetViewerSlideshow.getAttribute("data-slideshow-state")).toBe("playing");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("plays and pauses a video, and suspension leaves it paused", async () => {
    const video = asset("v", { durationMs: 3000, type: "video" });
    const f = fixture([video, asset("b")]);
    const play = f.elements.assetViewerPlay;

    viewer!.open(0);
    expect(play.hidden).toBe(false);
    expect(play.getAttribute("data-media-kind")).toBe("video");
    expect(f.documentRef.activeElement).toBe(play);

    f.press(remoteKeys.enter);
    expect(f.service.loadAssetPlaybackUrl).toHaveBeenCalledWith(video);
    await vi.waitFor(() => expect(play.getAttribute("data-play-state")).toBe("playing"));
    expect(f.elements.assetViewerPlayer.hidden).toBe(false);

    f.press(remoteKeys.enter);
    expect(play.getAttribute("data-play-state")).toBe("idle");
    expect(f.elements.assetViewerPlayerStatusText.textContent).toBe("Paused");

    f.press(remoteKeys.enter);
    await vi.waitFor(() => expect(play.getAttribute("data-play-state")).toBe("playing"));
    viewer!.suspend();
    expect(play.getAttribute("data-play-state")).toBe("idle");
    expect(f.play).toHaveBeenCalledTimes(2);
  });

  it("plays a Live Photo once over its still and returns to the still when it ends", async () => {
    const live = asset("live", { livePhotoVideoId: "motion" });
    const f = fixture([live, asset("b")]);
    const play = f.elements.assetViewerPlay;

    viewer!.open(0);
    await vi.waitFor(() => expect(play.hidden).toBe(false));
    expect(play.getAttribute("data-media-kind")).toBe("live-photo");
    play.focus();
    f.press(remoteKeys.enter);
    await vi.waitFor(() => expect(play.getAttribute("data-play-state")).toBe("playing"));

    f.elements.assetViewerVideo.dispatchEvent(new Event("ended"));
    expect(play.getAttribute("data-play-state")).toBe("idle");
    expect(f.elements.assetViewerVideo.hidden).toBe(true);
    expect(f.elements.assetViewerImage.hidden).toBe(false);
  });

  it("explains a preview that fails to load", async () => {
    const f = fixture([asset("a"), asset("b")]);
    f.service.loadAssetViewerStillUrl.mockRejectedValue(new Error("offline"));

    viewer!.open(0);

    await vi.waitFor(() =>
      expect(f.elements.assetViewerPlaceholderMessage.textContent).toBe(
        "Could not load this photo preview."
      )
    );
  });

  it("releases previews and stops activity when closed", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const f = fixture([asset("a"), asset("b")]);

    viewer!.open(0);
    await vi.waitFor(() => expect(f.elements.assetViewerImage.src).toBe("blob:a"));
    f.press(remoteKeys.mediaPlay);
    viewer!.close();

    expect(f.elements.assetPlaceholder.hidden).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.service.revokeImageUrl).toHaveBeenCalledWith("blob:a");
  });
});
