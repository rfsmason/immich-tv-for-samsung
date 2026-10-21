import { describe, expect, it, vi } from "vitest";
import type { AlbumAsset } from "../domain/album";
import {
  calculateViewerRetentionWindow,
  createAssetViewerImageState,
  formatViewerPositionLabel,
  formatViewerMetadata,
  getNextSlideshowIndex,
  getRestoredViewerGridFocus,
  getViewerNavigationIndex,
  reconcileAssetViewerImages,
  revokeAllAssetViewerImages,
  shouldAutoplayViewerVideo
} from "./asset-viewer-window";

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

function deferred<T>(): {
  promise: Promise<T>;
  reject(error: unknown): void;
  resolve(value: T): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject,
    resolve
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("asset viewer image window", () => {
  it("retains only previous, current, and next asset resources", () => {
    expect(calculateViewerRetentionWindow(4, 10)).toEqual({
      endIndex: 6,
      startIndex: 3
    });
    expect(calculateViewerRetentionWindow(0, 10)).toEqual({
      endIndex: 2,
      startIndex: 0
    });
    expect(calculateViewerRetentionWindow(9, 10)).toEqual({
      endIndex: 10,
      startIndex: 8
    });
  });

  it("loads image previews only inside the bounded viewer window", () => {
    const state = createAssetViewerImageState();
    const assets = [asset("a"), asset("b"), asset("c"), asset("d"), asset("e")];
    const loadImageUrl = vi.fn().mockReturnValue(new Promise<string>(() => undefined));

    reconcileAssetViewerImages({
      assets,
      currentIndex: 2,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadImageUrl,
      onImageLoadFailed: vi.fn(),
      onImageLoaded: vi.fn(),
      revokeImageUrl: vi.fn(),
      state
    });

    expect(loadImageUrl.mock.calls.map((call) => call[0].id)).toEqual(["c", "d", "b"]);
  });

  it("requests viewer stills for photos and videos inside the bounded viewer window", () => {
    const state = createAssetViewerImageState();
    const assets = [asset("a"), asset("b", "video"), asset("c")];
    const loadImageUrl = vi.fn().mockReturnValue(new Promise<string>(() => undefined));

    reconcileAssetViewerImages({
      assets,
      currentIndex: 1,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadImageUrl,
      onImageLoadFailed: vi.fn(),
      onImageLoaded: vi.fn(),
      revokeImageUrl: vi.fn(),
      state
    });

    expect(loadImageUrl.mock.calls.map((call) => call[0].id)).toEqual(["b", "c", "a"]);
  });

  it("limits active viewer preview requests during rapid navigation", async () => {
    const state = createAssetViewerImageState();
    const assets = [asset("a"), asset("b"), asset("c"), asset("d"), asset("e"), asset("f")];
    const pending = [
      deferred<string | null>(),
      deferred<string | null>(),
      deferred<string | null>()
    ];
    const loadImageUrl = vi
      .fn()
      .mockReturnValueOnce(pending[0]!.promise)
      .mockReturnValueOnce(pending[1]!.promise)
      .mockReturnValueOnce(pending[2]!.promise)
      .mockResolvedValue("blob:later");

    reconcileAssetViewerImages({
      assets,
      currentIndex: 2,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadImageUrl,
      onImageLoadFailed: vi.fn(),
      onImageLoaded: vi.fn(),
      revokeImageUrl: vi.fn(),
      state
    });

    reconcileAssetViewerImages({
      assets,
      currentIndex: 4,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadImageUrl,
      onImageLoadFailed: vi.fn(),
      onImageLoaded: vi.fn(),
      revokeImageUrl: vi.fn(),
      state
    });

    expect(loadImageUrl.mock.calls.map((call) => call[0].id)).toEqual(["c", "d", "b"]);
    expect(state.activeImageRequests).toBe(3);
    expect(state.imageQueue.map((request) => request.asset.id)).toEqual(["e", "f"]);

    pending[0]!.resolve("blob:c");
    await flushPromises();

    expect(loadImageUrl.mock.calls.map((call) => call[0].id)).toEqual(["c", "d", "b", "e"]);
  });

  it("revokes URLs when they leave the viewer window", () => {
    const state = createAssetViewerImageState();
    const revokeImageUrl = vi.fn();

    state.imageUrls.a = "blob:a";
    state.imageUrls.b = "blob:b";
    state.imageUrls.c = "blob:c";
    state.imageUrls.d = "blob:d";

    reconcileAssetViewerImages({
      assets: [asset("a"), asset("b"), asset("c"), asset("d")],
      currentIndex: 2,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadImageUrl: vi.fn(),
      onImageLoadFailed: vi.fn(),
      onImageLoaded: vi.fn(),
      revokeImageUrl,
      state
    });

    expect(revokeImageUrl).toHaveBeenCalledWith("blob:a");
    expect(state.imageUrls).toEqual({
      b: "blob:b",
      c: "blob:c",
      d: "blob:d"
    });
  });

  it("revokes stale image completions without replacing current viewer state", async () => {
    const state = createAssetViewerImageState();
    const pending = deferred<string | null>();
    const revokeImageUrl = vi.fn();
    const onImageLoaded = vi.fn();

    reconcileAssetViewerImages({
      assets: [asset("a")],
      currentIndex: 0,
      generation: 1,
      isCurrentGeneration: (generation) => generation === 2,
      isHidden: () => false,
      loadImageUrl: vi.fn().mockReturnValue(pending.promise),
      onImageLoadFailed: vi.fn(),
      onImageLoaded,
      revokeImageUrl,
      state
    });

    pending.resolve("blob:stale");
    await flushPromises();

    expect(revokeImageUrl).toHaveBeenCalledWith("blob:stale");
    expect(onImageLoaded).not.toHaveBeenCalled();
    expect(state.imageUrls).toEqual({});
  });

  it("revokes every retained viewer image during lifecycle cleanup", () => {
    const state = createAssetViewerImageState();
    const revokeImageUrl = vi.fn();

    state.imageRequests.a = 1;
    state.imageUrls.a = "blob:a";
    state.imageUrls.b = "blob:b";
    state.retainedAssetIds.a = true;

    revokeAllAssetViewerImages(state, revokeImageUrl);

    expect(revokeImageUrl).toHaveBeenCalledWith("blob:a");
    expect(revokeImageUrl).toHaveBeenCalledWith("blob:b");
    expect(state).toEqual(createAssetViewerImageState());
  });

  it("isolates obsolete request completions after the caller replaces viewer image state", async () => {
    const generationOneState = createAssetViewerImageState();
    const generationTwoState = createAssetViewerImageState();
    const generationOneAssets = [asset("old-0"), asset("old-1"), asset("old-2")];
    const generationTwoAssets = [asset("new-0"), asset("new-1"), asset("new-2")];
    const oldRequest = deferred<string | null>();
    const newRequest = deferred<string | null>();
    const generationOneLoad = vi
      .fn()
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValue(new Promise<string>(() => undefined));
    const generationTwoLoad = vi
      .fn()
      .mockReturnValueOnce(newRequest.promise)
      .mockReturnValue(new Promise<string>(() => undefined));
    const generationTwoImageLoaded = vi.fn();
    const revokeImageUrl = vi.fn();

    reconcileAssetViewerImages({
      assets: generationOneAssets,
      currentIndex: 1,
      generation: 1,
      isCurrentGeneration: (generation) => generation === 1,
      isHidden: () => false,
      loadImageUrl: generationOneLoad,
      onImageLoadFailed: vi.fn(),
      onImageLoaded: vi.fn(),
      revokeImageUrl,
      state: generationOneState
    });
    revokeAllAssetViewerImages(generationOneState, revokeImageUrl);

    reconcileAssetViewerImages({
      assets: generationTwoAssets,
      currentIndex: 1,
      generation: 2,
      isCurrentGeneration: (generation) => generation === 2,
      isHidden: () => false,
      loadImageUrl: generationTwoLoad,
      onImageLoadFailed: vi.fn(),
      onImageLoaded: generationTwoImageLoaded,
      revokeImageUrl,
      state: generationTwoState
    });

    expect(generationTwoState.activeImageRequests).toBe(3);
    expect(generationTwoState.imageQueue).toHaveLength(0);
    expect(generationTwoState.imageUrls).toEqual({});

    oldRequest.resolve("blob:old-1");
    await flushPromises();

    expect(generationTwoState.activeImageRequests).toBe(3);
    expect(generationTwoState.imageQueue).toHaveLength(0);
    expect(generationTwoState.imageUrls).toEqual({});

    newRequest.resolve("blob:new-1");
    await flushPromises();

    expect(generationTwoState.imageUrls["new-1"]).toBe("blob:new-1");
    expect(generationTwoImageLoaded).toHaveBeenCalledWith(generationTwoAssets[1], 1, "blob:new-1");
  });

  it("clamps left and right viewer navigation to loaded logical assets", () => {
    expect(getViewerNavigationIndex(0, "left", 3)).toBe(0);
    expect(getViewerNavigationIndex(0, "right", 3)).toBe(1);
    expect(getViewerNavigationIndex(2, "right", 3)).toBe(2);
  });

  it("advances slideshow until the loaded logical asset edge", () => {
    expect(getNextSlideshowIndex(0, 3)).toBe(1);
    expect(getNextSlideshowIndex(1, 3)).toBe(2);
    expect(getNextSlideshowIndex(2, 3)).toBeNull();
    expect(getNextSlideshowIndex(0, 0)).toBeNull();
  });

  it("suppresses video autoplay while slideshow is playing", () => {
    expect(
      shouldAutoplayViewerVideo({
        assetType: "video",
        autoplayVideos: true,
        playControlHidden: false,
        playbackAssetId: null,
        selectedAssetId: "video-1",
        slideshowPlaying: false
      })
    ).toBe(true);

    expect(
      shouldAutoplayViewerVideo({
        assetType: "video",
        autoplayVideos: true,
        playControlHidden: false,
        playbackAssetId: null,
        selectedAssetId: "video-1",
        slideshowPlaying: true
      })
    ).toBe(false);
  });

  it("restores grid focus to the viewed asset index when leaving the viewer", () => {
    expect(getRestoredViewerGridFocus(14, 6, 30)).toEqual({
      focusedIndex: 14,
      preferredColumn: 2
    });
    expect(getRestoredViewerGridFocus(32, 6, 30)).toEqual({
      focusedIndex: 29,
      preferredColumn: 5
    });
    expect(getRestoredViewerGridFocus(0, 0, 30)).toBeNull();
  });

  it("formats viewer positions with the full album total when known", () => {
    expect(formatViewerPositionLabel(1, 12, 48)).toBe("2 of 48");
    expect(formatViewerPositionLabel(1, 12, null)).toBe("2 of 12");
    expect(formatViewerPositionLabel(14, 12, 10)).toBe("10 of 10");
    expect(formatViewerPositionLabel(1, 12, 48, 31)).toBe("32 of 48");
  });

  it("formats viewer metadata from capture datetime and optional location", () => {
    expect(
      formatViewerMetadata({
        ...asset("a"),
        capturedAt: "2026-10-06T18:42:11.000Z",
        location: "London, United Kingdom"
      })
    ).toEqual({
      date: "6 Oct 2026",
      location: "London, United Kingdom",
      time: "18:42"
    });
    expect(
      formatViewerMetadata({ ...asset("b"), capturedAt: null, location: "Paris, France" })
    ).toEqual({
      date: "",
      location: "Paris, France",
      time: ""
    });
    expect(formatViewerMetadata(asset("c"))).toEqual({
      date: "",
      location: "",
      time: ""
    });
  });
});
