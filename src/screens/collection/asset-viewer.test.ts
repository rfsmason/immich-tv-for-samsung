import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlbumAsset } from "../../domain/album";
import type { AssetFace } from "../../domain/face";
import { AppError } from "../../errors/app-error";
import { defaultAppSettings, type AppSettings } from "../../domain/app-settings";
import { remoteKeys } from "../../platform/tizen/keys";
import { createPassiveViewing } from "../../platform/tizen/screensaver";
import { TestDocument, type TestElement } from "../../test/document";
import { createAssetViewer, type AssetViewerController } from "./asset-viewer";
import { slideshowVideoStallMs } from "./viewer-slideshow";
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
  assetViewerFaceOverlay: "asset-viewer-face-overlay",
  assetViewerFaces: "asset-viewer-faces",
  assetViewerFacesStatus: "asset-viewer-faces-status",
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

function fixture(
  assets: AlbumAsset[],
  settings: Partial<AppSettings> = {},
  loadAssetFaces: (assetId: string) => Promise<AssetFace[]> = async () => [],
  logger?: { info(message: string, details?: unknown): void }
) {
  const documentRef = new TestDocument();
  let storedSettings: AppSettings = { ...defaultAppSettings, ...settings };
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
    loadAssetFaces: vi.fn(loadAssetFaces),
    loadAssetPlaybackUrl: vi.fn(() => "https://immich.example/playback"),
    loadAssetViewerStillUrl: vi.fn(async (item: AlbumAsset) => `blob:${item.id}`),
    revokeImageUrl: vi.fn()
  };
  const onAssetViewed = vi.fn();
  const onControlsHiddenChange = vi.fn();
  const setScreenSaver = vi.fn();

  viewer = createAssetViewer({
    collection,
    elements,
    logger,
    onAssetViewed,
    onControlsHiddenChange,
    passiveViewing: createPassiveViewing({
      logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
      windowRef: { webapis: { appcommon: { setScreenSaver } } }
    }),
    service,
    settingsStore: {
      load: () => storedSettings,
      save: vi.fn((next: AppSettings) => {
        storedSettings = next;
        return next;
      })
    }
  });

  const press = (keyCode: number) => {
    const event = new Event("keydown", { cancelable: true }) as KeyboardEvent;

    viewer!.handleKeydown(event, keyCode);
    return event;
  };

  // The browser finishing decoding the shown still, 1600 by 900 on a 1920 by
  // 1080 stage.
  const decodeImage = () => {
    Object.assign(elements.assetViewerImage, {
      clientHeight: 1080,
      clientWidth: 1920,
      complete: true,
      naturalHeight: 900,
      naturalWidth: 1600
    });
    elements.assetViewerImage.dispatchEvent(new Event("load"));
  };

  return {
    collection,
    decodeImage,
    documentRef,
    elements,
    onAssetViewed,
    onControlsHiddenChange,
    pause,
    play,
    press,
    // The TV screensaver states sent so far: 0 off, 1 on.
    screensaver: () => setScreenSaver.mock.calls.map(([state]) => state as number),
    service,
    settings: () => storedSettings
  };
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
    expect(f.documentRef.activeElement).toBe(f.elements.assetViewerFaces);
    f.press(remoteKeys.down);
    expect(f.documentRef.activeElement).toBe(f.elements.assetPlaceholderBack);
    f.press(remoteKeys.up);
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

describe("slideshow videos in full", () => {
  const video = (id: string) => asset(id, { durationMs: 30000, type: "video" });
  const state = (f: ReturnType<typeof fixture>) =>
    f.elements.assetViewerSlideshow.getAttribute("data-slideshow-state");

  // The video element starts and stops as a browser's would.
  function playable(f: ReturnType<typeof fixture>) {
    const element = f.elements.assetViewerVideo;

    f.play.mockImplementation(async () => {
      Object.assign(element, { ended: false, paused: false });
    });
    f.pause.mockImplementation(() => {
      Object.assign(element, { paused: true });
    });

    return {
      element,
      end() {
        Object.assign(element, { ended: true, paused: true });
        element.dispatchEvent(new Event("ended"));
      },
      tick() {
        element.dispatchEvent(new Event("timeupdate"));
      }
    };
  }

  async function slideshow(assets: AlbumAsset[], settings: Partial<AppSettings> = {}) {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const logger = { info: vi.fn() };
    const f = fixture(
      assets,
      { autoplayVideos: true, slideshowIntervalSeconds: 5, ...settings },
      undefined,
      logger
    );
    const media = playable(f);

    viewer!.open(0);
    f.press(remoteKeys.mediaPlay);
    await vi.advanceTimersByTimeAsync(0);

    return { f, logger, media };
  }

  it("plays a video to its end with sound, then moves on; photos keep the interval", async () => {
    const { f, media } = await slideshow([asset("a"), video("v"), asset("b")]);

    await vi.advanceTimersByTimeAsync(5000);
    expect(f.collection.select).toHaveBeenLastCalledWith(1);
    expect(f.play).toHaveBeenCalledTimes(1);
    expect(media.element.muted).not.toBe(true);

    // Longer than the interval: still on the video while it plays.
    for (let second = 0; second < 15; second += 1) {
      await vi.advanceTimersByTimeAsync(1000);
      media.tick();
    }
    expect(f.collection.select).toHaveBeenLastCalledWith(1);

    media.end();
    expect(f.collection.select).toHaveBeenLastCalledWith(2);
    expect(state(f)).toBe("playing");
  });

  it("keeps Live Photos as stills on the interval", async () => {
    const { f } = await slideshow([
      asset("a"),
      asset("live", { livePhotoVideoId: "m" }),
      asset("b")
    ]);

    await vi.advanceTimersByTimeAsync(10000);
    expect(f.collection.select).toHaveBeenLastCalledWith(2);
    expect(f.play).not.toHaveBeenCalled();
  });

  it("pauses and resumes the video with the slideshow, continuing where it was", async () => {
    const { f, media } = await slideshow([video("v"), asset("b")]);

    expect(f.play).toHaveBeenCalledTimes(1);
    const source = media.element.src;

    f.press(remoteKeys.mediaPause);
    expect(state(f)).toBe("paused");
    expect(f.pause).toHaveBeenCalled();
    expect(media.element.paused).toBe(true);

    f.press(remoteKeys.mediaPlay);
    await vi.advanceTimersByTimeAsync(0);
    expect(state(f)).toBe("playing");
    expect(f.play).toHaveBeenCalledTimes(2);
    expect(media.element.src).toBe(source);
    expect(media.element.paused).toBe(false);
  });

  it("pauses the slideshow with Play on the video, and then Left moves as usual", async () => {
    // The buttons stay, so the first OK acts.
    const { f } = await slideshow([asset("a"), video("v"), asset("b")], {
      playbackButtonsHide: "never"
    });

    await vi.advanceTimersByTimeAsync(5000);
    f.elements.assetViewerPlay.focus();
    f.press(remoteKeys.enter);
    expect(state(f)).toBe("paused");
    expect(f.elements.assetViewerVideo.paused).toBe(true);

    f.press(remoteKeys.left);
    expect(f.collection.select).toHaveBeenLastCalledWith(0);
  });

  it("skips a video that doesn't start after the interval, logging once", async () => {
    const { f, logger } = await slideshow([asset("a"), video("v"), asset("b")]);

    f.play.mockRejectedValueOnce(new Error("not supported"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.collection.select).toHaveBeenLastCalledWith(1);
    await vi.advanceTimersByTimeAsync(4999);
    expect(f.collection.select).toHaveBeenLastCalledWith(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.collection.select).toHaveBeenLastCalledWith(2);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Slideshow skipped a video.", {
      assetId: "v",
      reason: "did not start"
    });
  });

  it("skips a video that reports an error after the interval", async () => {
    const { f, logger, media } = await slideshow([video("v"), asset("b")]);

    media.element.dispatchEvent(new Event("error"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.collection.select).toHaveBeenLastCalledWith(1);
    expect(logger.info).toHaveBeenCalledWith("Slideshow skipped a video.", {
      assetId: "v",
      reason: "error"
    });
  });

  it("skips a video that stops making progress for the stall limit", async () => {
    const { f, logger, media } = await slideshow([video("v"), asset("b")]);

    await vi.advanceTimersByTimeAsync(10000);
    media.tick();
    await vi.advanceTimersByTimeAsync(slideshowVideoStallMs - 1);
    expect(f.collection.select).not.toHaveBeenCalledWith(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.collection.select).toHaveBeenLastCalledWith(1);
    expect(logger.info).toHaveBeenCalledWith("Slideshow skipped a video.", {
      assetId: "v",
      reason: "stalled"
    });
  });

  it("with autoplay off, shows a video's poster for the interval as before", async () => {
    const { f } = await slideshow([asset("a"), video("v"), asset("b")], { autoplayVideos: false });

    await vi.advanceTimersByTimeAsync(10000);
    expect(f.collection.select).toHaveBeenLastCalledWith(2);
    expect(f.play).not.toHaveBeenCalled();
  });

  it("holds the TV screensaver off without a gap, and pauses at the end of the collection", async () => {
    const { f, media } = await slideshow([asset("a"), video("v")]);

    await vi.advanceTimersByTimeAsync(5000);
    media.tick();
    media.end();
    expect(f.screensaver()).toEqual([0, 1]);
    expect(state(f)).toBe("paused");
    expect(f.collection.loadMore).toHaveBeenCalled();
  });

  it("keeps preloading to the viewer's window while a video plays", async () => {
    const assets = [asset("a"), video("v"), asset("b"), asset("c"), asset("d"), asset("e")];
    const { f } = await slideshow(assets);

    await vi.advanceTimersByTimeAsync(5000);
    const loaded = f.service.loadAssetViewerStillUrl.mock.calls.map(([item]) => item.id);
    expect(new Set(loaded)).toEqual(new Set(["a", "v", "b"]));
  });
});

describe("viewer and the TV screensaver", () => {
  it("keeps the TV screensaver off while a slideshow runs", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const f = fixture([asset("a"), asset("b"), asset("c")], { slideshowIntervalSeconds: 5 });

    viewer!.open(0);
    expect(f.screensaver()).toEqual([]);
    f.press(remoteKeys.mediaPlay);
    expect(f.screensaver()).toEqual([0]);
    vi.advanceTimersByTime(5000);
    expect(f.screensaver()).toEqual([0]);
    f.press(remoteKeys.mediaPause);
    expect(f.screensaver()).toEqual([0, 1]);

    f.press(remoteKeys.mediaPlay);
    viewer!.close();
    expect(f.screensaver()).toEqual([0, 1, 0, 1]);
  });

  it("lets the screensaver back when a slideshow reaches the end or the app is hidden", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const f = fixture([asset("a"), asset("b")], { slideshowIntervalSeconds: 5 });

    viewer!.open(0);
    f.press(remoteKeys.mediaPlay);
    vi.advanceTimersByTime(10000);
    expect(f.screensaver()).toEqual([0, 1]);

    f.press(remoteKeys.left);
    f.press(remoteKeys.mediaPlay);
    viewer!.suspend();
    expect(f.screensaver()).toEqual([0, 1, 0, 1]);
  });

  it("keeps it off while a video plays, and lets it back on pause and when the viewer closes", async () => {
    const video = asset("v", { durationMs: 3000, type: "video" });
    const f = fixture([video, asset("b")]);
    const element = f.elements.assetViewerVideo;
    f.play.mockImplementation(async () => {
      Object.assign(element, { paused: false });
      element.dispatchEvent(new Event("playing"));
    });
    f.pause.mockImplementation(() => {
      if (!element.paused) {
        Object.assign(element, { paused: true });
        element.dispatchEvent(new Event("pause"));
      }
    });

    viewer!.open(0);
    f.press(remoteKeys.enter);
    await vi.waitFor(() => expect(f.screensaver()).toEqual([0]));
    f.press(remoteKeys.enter);
    expect(f.screensaver()).toEqual([0, 1]);

    f.press(remoteKeys.enter);
    await vi.waitFor(() => expect(f.screensaver()).toEqual([0, 1, 0]));
    viewer!.suspend();
    expect(f.screensaver()).toEqual([0, 1, 0, 1]);

    f.press(remoteKeys.enter);
    await vi.waitFor(() => expect(f.screensaver()).toEqual([0, 1, 0, 1, 0]));
    viewer!.close();
    expect(f.screensaver()).toEqual([0, 1, 0, 1, 0, 1]);
  });

  it("keeps it off while Live Photo motion plays, and back on when it ends", async () => {
    const live = asset("live", { livePhotoVideoId: "motion" });
    const f = fixture([live, asset("b")]);
    const element = f.elements.assetViewerVideo;
    f.play.mockImplementation(async () => {
      Object.assign(element, { paused: false });
      element.dispatchEvent(new Event("playing"));
    });

    viewer!.open(0);
    await vi.waitFor(() => expect(f.elements.assetViewerPlay.hidden).toBe(false));
    f.elements.assetViewerPlay.focus();
    f.press(remoteKeys.enter);
    await vi.waitFor(() => expect(f.screensaver()).toEqual([0]));

    Object.assign(element, { ended: true });
    element.dispatchEvent(new Event("ended"));
    expect(f.screensaver()).toEqual([0, 1]);
  });
});

describe("viewer buttons during passive viewing", () => {
  // The default Hide playback buttons choice.
  const viewerControlsHideMs = 5000;

  const hidden = (f: ReturnType<typeof fixture>) =>
    f.elements.assetPlaceholder.getAttribute("data-controls") === "hidden";

  it("hides the buttons a few seconds into a slideshow, and a key only shows them", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const f = fixture([asset("a"), asset("b"), asset("c")], { slideshowIntervalSeconds: 60 });

    viewer!.open(0);
    f.collection.select.mockClear();
    f.press(remoteKeys.enter); // Slideshow is focused: OK starts it.
    vi.advanceTimersByTime(viewerControlsHideMs - 1);
    expect(hidden(f)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(hidden(f)).toBe(true);
    expect(f.onControlsHiddenChange).toHaveBeenLastCalledWith(true);

    // The press that shows them doesn't move to the next photo.
    const wake = f.press(remoteKeys.right);
    expect(wake.defaultPrevented).toBe(true);
    expect(hidden(f)).toBe(false);
    expect(f.onControlsHiddenChange).toHaveBeenLastCalledWith(false);
    expect(f.collection.select).not.toHaveBeenCalled();

    // Each key restarts the countdown; once shown, keys act as usual.
    vi.advanceTimersByTime(viewerControlsHideMs - 1);
    f.press(remoteKeys.up);
    vi.advanceTimersByTime(viewerControlsHideMs - 1);
    expect(hidden(f)).toBe(false);
    f.press(remoteKeys.right);
    expect(f.collection.select).toHaveBeenCalledWith(1);
  });

  it("lets Back and the media keys act while the buttons are hidden", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const f = fixture([asset("a"), asset("b")], { slideshowIntervalSeconds: 60 });

    viewer!.open(0);
    f.press(remoteKeys.mediaPlay);
    vi.advanceTimersByTime(viewerControlsHideMs);
    f.press(remoteKeys.mediaPause);
    expect(f.screensaver()).toEqual([0, 1]);
    expect(hidden(f)).toBe(false);

    f.press(remoteKeys.mediaPlay);
    vi.advanceTimersByTime(viewerControlsHideMs);
    expect(hidden(f)).toBe(true);
    f.press(remoteKeys.back);
    expect(f.collection.exit).toHaveBeenCalled();
  });

  it("follows Hide playback buttons, and with Never keeps them so every key acts", () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const f = fixture([asset("a"), asset("b"), asset("c")], {
      playbackButtonsHide: 10,
      slideshowIntervalSeconds: 60
    });

    viewer!.open(0);
    f.press(remoteKeys.mediaPlay);
    vi.advanceTimersByTime(9999);
    expect(hidden(f)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(hidden(f)).toBe(true);
    f.press(remoteKeys.mediaPause);

    f.settings().playbackButtonsHide = "never";
    f.press(remoteKeys.mediaPlay);
    vi.advanceTimersByTime(60000 - 1);
    expect(hidden(f)).toBe(false);
    f.collection.select.mockClear();
    f.press(remoteKeys.right);
    expect(f.collection.select).toHaveBeenCalledWith(1);
  });

  it("keeps the buttons while nothing plays, and shows them when playing stops or the viewer closes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    const video = asset("v", { durationMs: 3000, type: "video" });
    const f = fixture([video, asset("b")]);
    const element = f.elements.assetViewerVideo;

    viewer!.open(0);
    vi.advanceTimersByTime(viewerControlsHideMs * 2);
    expect(hidden(f)).toBe(false);

    Object.assign(element, { hidden: false, paused: false });
    element.dispatchEvent(new Event("playing"));
    vi.advanceTimersByTime(viewerControlsHideMs);
    expect(hidden(f)).toBe(true);

    Object.assign(element, { paused: true });
    element.dispatchEvent(new Event("pause"));
    expect(hidden(f)).toBe(false);

    Object.assign(element, { paused: false });
    element.dispatchEvent(new Event("playing"));
    vi.advanceTimersByTime(viewerControlsHideMs);
    viewer!.close();
    expect(hidden(f)).toBe(false);
    expect(f.onControlsHiddenChange).toHaveBeenLastCalledWith(false);
  });
});

describe("viewer face tags", () => {
  const named: AssetFace = {
    box: { bottom: 0.5, left: 0.25, right: 0.5, top: 0.25 },
    id: "face-named",
    personName: "Sam Example"
  };
  const unnamed: AssetFace = {
    box: { bottom: 0.9, left: 0.6, right: 0.7, top: 0.7 },
    id: "face-unnamed",
    personName: null
  };
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function openOn(f: ReturnType<typeof fixture>, index = 0) {
    viewer!.open(index);
    await flush();
  }

  it("offers Faces for photos only, off by default, without requesting faces", async () => {
    const f = fixture([asset("photo"), asset("clip", { type: "video" })]);
    await openOn(f);
    f.decodeImage();

    expect(f.elements.assetViewerFaces.hidden).toBe(false);
    expect(f.elements.assetViewerFaces.getAttribute("aria-pressed")).toBe("false");
    expect(f.service.loadAssetFaces).not.toHaveBeenCalled();

    f.press(remoteKeys.right);
    expect(f.elements.assetViewerFaces.hidden).toBe(true);
  });

  it("draws named faces with labels and unnamed faces as outlines once the photo decodes", async () => {
    const f = fixture([asset("photo")], {}, async () => [named, unnamed]);
    await openOn(f);
    f.elements.assetViewerFaces.focus();
    f.press(remoteKeys.enter);

    expect(f.settings().showFaceTags).toBe(true);
    expect(f.elements.assetViewerFaces.getAttribute("aria-pressed")).toBe("true");
    // Nothing is requested until the photo has decoded.
    expect(f.service.loadAssetFaces).not.toHaveBeenCalled();

    f.decodeImage();
    await flush();

    expect(f.service.loadAssetFaces).toHaveBeenCalledWith("photo");
    const overlay = f.elements.assetViewerFaceOverlay as unknown as TestElement;
    expect(overlay.hidden).toBe(false);
    const boxes = overlay.children.filter((child) => child.className === "asset-viewer-face-box");
    const labels = overlay.children.filter(
      (child) => child.className === "asset-viewer-face-label"
    );
    expect(boxes).toHaveLength(2);
    expect(labels.map((label) => label.textContent)).toEqual(["Sam Example"]);
    // 1600 by 900 fills the 1920 by 1080 stage exactly: 1.2 times.
    expect(boxes[0]!.style).toMatchObject({
      height: "270px",
      left: "480px",
      top: "270px",
      width: "480px"
    });
    expect(f.elements.assetViewerFacesStatus.hidden).toBe(true);
  });

  it("says when a photo has no tagged faces", async () => {
    const f = fixture([asset("photo")], { showFaceTags: true });
    await openOn(f);
    f.decodeImage();
    await flush();

    expect(f.elements.assetViewerFacesStatus.hidden).toBe(false);
    expect(f.elements.assetViewerFacesStatus.textContent).toBe("No faces tagged");
  });

  it("drops a late response for a photo no longer shown and caches recent photos", async () => {
    const resolvers: Array<(faces: AssetFace[]) => void> = [];
    const f = fixture(
      [asset("a"), asset("b"), asset("c"), asset("d"), asset("e")],
      { showFaceTags: true },
      () => new Promise<AssetFace[]>((resolve) => resolvers.push(resolve))
    );
    await openOn(f);
    f.decodeImage();
    f.press(remoteKeys.right);
    await flush();
    resolvers[0]!([named]);
    await flush();
    const overlay = f.elements.assetViewerFaceOverlay as unknown as TestElement;
    expect(overlay.children).toHaveLength(0);

    f.decodeImage();
    await flush();
    resolvers[1]!([named]);
    await flush();
    expect(overlay.children).toHaveLength(2);

    // Away from b and back again: b is cached, so it is drawn without a new
    // request.
    f.press(remoteKeys.left);
    await flush();
    expect(overlay.children).toHaveLength(0);
    f.press(remoteKeys.right);
    await flush();
    f.decodeImage();
    await flush();
    expect(overlay.children).toHaveLength(2);
    // a's late answer was dropped, so a was asked for again; b was not.
    expect(f.service.loadAssetFaces.mock.calls.map(([id]) => id)).toEqual(["a", "b", "a"]);
  });

  it("hides face tags during a slideshow", async () => {
    const f = fixture([asset("a"), asset("b")], { showFaceTags: true }, async () => [named]);
    await openOn(f);
    f.decodeImage();
    await flush();
    expect(f.elements.assetViewerFaceOverlay.hidden).toBe(false);

    f.elements.assetViewerSlideshow.focus();
    f.press(remoteKeys.enter);
    expect(f.elements.assetViewerFaceOverlay.hidden).toBe(true);
    expect(f.elements.assetViewerFaces.hidden).toBe(true);
  });

  it("explains a missing face.read permission and turns Faces off, keeping the button and its focus", async () => {
    const f = fixture([asset("a"), asset("b")], {}, async () => {
      throw new AppError("permission", "Refused", { feature: "Face tags", status: 403 });
    });
    const message = "Face tags need the face.read permission on your Immich API key.";
    await openOn(f);
    f.decodeImage();
    // The usual case: Faces is pressed, and the refusal arrives while it has focus.
    f.elements.assetViewerFaces.focus();
    f.press(remoteKeys.enter);
    await flush();

    expect(f.elements.assetViewerFacesStatus.textContent).toBe(message);
    expect(f.elements.assetViewerFaces.hidden).toBe(false);
    expect(f.elements.assetViewerFaces.getAttribute("aria-pressed")).toBe("false");
    expect(f.documentRef.activeElement).toBe(f.elements.assetViewerFaces);

    // Off for the session: the next photo asks nothing and shows no message.
    f.press(remoteKeys.right);
    await flush();
    f.decodeImage();
    await flush();
    expect(f.service.loadAssetFaces).toHaveBeenCalledTimes(1);
    expect(f.elements.assetViewerFacesStatus.hidden).toBe(true);

    // Pressing Faces again explains why, without asking Immich again.
    f.elements.assetViewerFaces.focus();
    f.press(remoteKeys.enter);
    expect(f.elements.assetViewerFacesStatus.textContent).toBe(message);
    expect(f.elements.assetViewerFacesStatus.hidden).toBe(false);
    expect(f.service.loadAssetFaces).toHaveBeenCalledTimes(1);
  });

  it("moves focus off Faces when it hides for a video or a slideshow", async () => {
    const f = fixture([asset("photo"), asset("clip", { type: "video" }), asset("next")]);
    await openOn(f);

    f.elements.assetViewerFaces.focus();
    f.press(remoteKeys.right);
    expect(f.elements.assetViewerFaces.hidden).toBe(true);
    expect(f.documentRef.activeElement).not.toBe(f.elements.assetViewerFaces);
    expect([f.elements.assetViewerSlideshow, f.elements.assetViewerPlay]).toContain(
      f.documentRef.activeElement
    );

    f.press(remoteKeys.right);
    await flush();
    expect(f.elements.assetViewerFaces.hidden).toBe(false);
    f.elements.assetViewerFaces.focus();
    f.elements.assetViewerSlideshow.dispatchEvent(new Event("click"));
    expect(f.elements.assetViewerFaces.hidden).toBe(true);
    expect(f.documentRef.activeElement).toBe(f.elements.assetViewerSlideshow);
  });
});
