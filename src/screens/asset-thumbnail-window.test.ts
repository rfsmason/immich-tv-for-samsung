import { describe, expect, it, vi } from "vitest";
import type { AlbumAsset } from "../domain/album";
import {
  createAssetThumbnailState,
  reconcileAssetThumbnails,
  revokeAllAssetThumbnails
} from "./asset-thumbnail-window";

function asset(id: string): AlbumAsset {
  return {
    capturedAt: null,
    durationMs: null,
    id,
    livePhotoVideoId: null,
    location: null,
    name: `${id}.jpg`,
    type: "image"
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

describe("asset thumbnail window", () => {
  it("does not start duplicate requests for loaded or in-flight thumbnails", () => {
    const state = createAssetThumbnailState();
    const assets = [asset("a"), asset("b")];
    const loadThumbnailUrl = vi.fn().mockReturnValue(new Promise<string>(() => undefined));

    state.thumbnailUrls.a = "blob:a";

    reconcileAssetThumbnails({
      assets,
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl,
      onThumbnailLoaded: vi.fn(),
      revokeThumbnailUrl: vi.fn(),
      state,
      window: {
        endIndex: 2,
        startIndex: 0
      }
    });
    reconcileAssetThumbnails({
      assets,
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl,
      onThumbnailLoaded: vi.fn(),
      revokeThumbnailUrl: vi.fn(),
      state,
      window: {
        endIndex: 2,
        startIndex: 0
      }
    });

    expect(loadThumbnailUrl).toHaveBeenCalledTimes(1);
    expect(loadThumbnailUrl).toHaveBeenCalledWith(assets[1]);
  });

  it("limits active thumbnail requests while retaining queued thumbnails", () => {
    const state = createAssetThumbnailState();
    const assets = Array.from({ length: 20 }, (_, index) => asset(`asset-${index}`));
    const loadThumbnailUrl = vi.fn().mockReturnValue(new Promise<string>(() => undefined));

    reconcileAssetThumbnails({
      assets,
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl,
      onThumbnailLoaded: vi.fn(),
      revokeThumbnailUrl: vi.fn(),
      state,
      window: {
        endIndex: assets.length,
        startIndex: 0
      }
    });

    expect(loadThumbnailUrl).toHaveBeenCalledTimes(8);
    expect(state.activeThumbnailRequests).toBe(8);
    expect(state.thumbnailQueue).toHaveLength(12);
  });

  it("starts queued thumbnails as active requests complete", async () => {
    const state = createAssetThumbnailState();
    const assets = Array.from({ length: 10 }, (_, index) => asset(`asset-${index}`));
    const firstRequest = deferred<string | null>();
    const loadThumbnailUrl = vi
      .fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValue(new Promise<string>(() => undefined));

    reconcileAssetThumbnails({
      assets,
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl,
      onThumbnailLoaded: vi.fn(),
      revokeThumbnailUrl: vi.fn(),
      state,
      window: {
        endIndex: assets.length,
        startIndex: 0
      }
    });

    expect(loadThumbnailUrl).toHaveBeenCalledTimes(8);

    firstRequest.resolve("blob:asset-0");
    await flushPromises();

    expect(loadThumbnailUrl).toHaveBeenCalledTimes(9);
    expect(state.activeThumbnailRequests).toBe(8);
    expect(state.thumbnailQueue).toHaveLength(1);
  });

  it("prioritizes queued thumbnail requests nearest the focused asset", () => {
    const state = createAssetThumbnailState();
    const assets = Array.from({ length: 12 }, (_, index) => asset(`asset-${index}`));
    const loadThumbnailUrl = vi.fn().mockReturnValue(new Promise<string>(() => undefined));

    reconcileAssetThumbnails({
      assets,
      focusedIndex: 9,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl,
      onThumbnailLoaded: vi.fn(),
      revokeThumbnailUrl: vi.fn(),
      state,
      window: {
        endIndex: assets.length,
        startIndex: 0
      }
    });

    expect(loadThumbnailUrl.mock.calls.map((call) => call[0].id)).toEqual([
      "asset-9",
      "asset-8",
      "asset-10",
      "asset-7",
      "asset-11",
      "asset-6",
      "asset-5",
      "asset-4"
    ]);
  });

  it("revokes loaded URLs when they leave the retained window", () => {
    const state = createAssetThumbnailState();
    const revokeThumbnailUrl = vi.fn();
    const assets = [asset("a"), asset("b")];

    state.thumbnailUrls.a = "blob:a";
    state.thumbnailUrls.b = "blob:b";

    reconcileAssetThumbnails({
      assets,
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl: vi.fn(),
      onThumbnailLoaded: vi.fn(),
      revokeThumbnailUrl,
      state,
      window: {
        endIndex: 2,
        startIndex: 1
      }
    });

    expect(revokeThumbnailUrl).toHaveBeenCalledWith("blob:a");
    expect(state.thumbnailUrls).toEqual({
      b: "blob:b"
    });
  });

  it("revokes stale thumbnail completions from old generations", async () => {
    const state = createAssetThumbnailState();
    const image = asset("a");
    const pending = deferred<string | null>();
    const revokeThumbnailUrl = vi.fn();
    const onThumbnailLoaded = vi.fn();

    reconcileAssetThumbnails({
      assets: [image],
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: (generation) => generation === 2,
      isHidden: () => false,
      loadThumbnailUrl: vi.fn().mockReturnValue(pending.promise),
      onThumbnailLoaded,
      revokeThumbnailUrl,
      state,
      window: {
        endIndex: 1,
        startIndex: 0
      }
    });

    pending.resolve("blob:stale");
    await flushPromises();

    expect(revokeThumbnailUrl).toHaveBeenCalledWith("blob:stale");
    expect(onThumbnailLoaded).not.toHaveBeenCalled();
    expect(state.thumbnailUrls).toEqual({});
  });

  it("revokes completed URLs for requests that left the retained window", async () => {
    const state = createAssetThumbnailState();
    const image = asset("a");
    const pending = deferred<string | null>();
    const revokeThumbnailUrl = vi.fn();

    reconcileAssetThumbnails({
      assets: [image],
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl: vi.fn().mockReturnValue(pending.promise),
      onThumbnailLoaded: vi.fn(),
      revokeThumbnailUrl,
      state,
      window: {
        endIndex: 1,
        startIndex: 0
      }
    });
    reconcileAssetThumbnails({
      assets: [image],
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl: vi.fn(),
      onThumbnailLoaded: vi.fn(),
      revokeThumbnailUrl,
      state,
      window: {
        endIndex: 0,
        startIndex: 0
      }
    });

    pending.resolve("blob:left-window");
    await flushPromises();

    expect(revokeThumbnailUrl).toHaveBeenCalledWith("blob:left-window");
    expect(state.thumbnailUrls).toEqual({});
  });

  it("retains an in-flight request that leaves and re-enters the window without duplication", async () => {
    const state = createAssetThumbnailState();
    const image = asset("a");
    const pending = deferred<string | null>();
    const loadThumbnailUrl = vi.fn().mockReturnValue(pending.promise);
    const onThumbnailLoaded = vi.fn();

    reconcileAssetThumbnails({
      assets: [image],
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl,
      onThumbnailLoaded,
      revokeThumbnailUrl: vi.fn(),
      state,
      window: {
        endIndex: 1,
        startIndex: 0
      }
    });
    reconcileAssetThumbnails({
      assets: [image],
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl,
      onThumbnailLoaded,
      revokeThumbnailUrl: vi.fn(),
      state,
      window: {
        endIndex: 0,
        startIndex: 0
      }
    });
    reconcileAssetThumbnails({
      assets: [image],
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl,
      onThumbnailLoaded,
      revokeThumbnailUrl: vi.fn(),
      state,
      window: {
        endIndex: 1,
        startIndex: 0
      }
    });

    pending.resolve("blob:a");
    await flushPromises();

    expect(loadThumbnailUrl).toHaveBeenCalledTimes(1);
    expect(state.thumbnailUrls).toEqual({
      a: "blob:a"
    });
    expect(onThumbnailLoaded).toHaveBeenCalledWith(image, 0, "blob:a");
  });

  it("revokes stale object URLs after the screen is destroyed", async () => {
    const state = createAssetThumbnailState();
    const image = asset("a");
    const pending = deferred<string | null>();
    const revokeThumbnailUrl = vi.fn();

    reconcileAssetThumbnails({
      assets: [image],
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: () => true,
      isHidden: () => false,
      loadThumbnailUrl: vi.fn().mockReturnValue(pending.promise),
      onThumbnailLoaded: vi.fn(),
      revokeThumbnailUrl,
      state,
      window: {
        endIndex: 1,
        startIndex: 0
      }
    });
    revokeAllAssetThumbnails(state, revokeThumbnailUrl);

    pending.resolve("blob:after-destroy");
    await flushPromises();

    expect(revokeThumbnailUrl).toHaveBeenCalledWith("blob:after-destroy");
    expect(state.thumbnailUrls).toEqual({});
  });

  it("isolates obsolete request completions after the caller replaces thumbnail state", async () => {
    const generationOneState = createAssetThumbnailState();
    const generationTwoState = createAssetThumbnailState();
    const generationOneAssets = Array.from({ length: 10 }, (_, index) => asset(`old-${index}`));
    const generationTwoAssets = Array.from({ length: 10 }, (_, index) => asset(`new-${index}`));
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
    const generationTwoThumbnailLoaded = vi.fn();
    const revokeThumbnailUrl = vi.fn();

    reconcileAssetThumbnails({
      assets: generationOneAssets,
      focusedIndex: 0,
      generation: 1,
      isCurrentGeneration: (generation) => generation === 1,
      isHidden: () => false,
      loadThumbnailUrl: generationOneLoad,
      onThumbnailLoaded: vi.fn(),
      revokeThumbnailUrl,
      state: generationOneState,
      window: {
        endIndex: generationOneAssets.length,
        startIndex: 0
      }
    });
    revokeAllAssetThumbnails(generationOneState, revokeThumbnailUrl);

    reconcileAssetThumbnails({
      assets: generationTwoAssets,
      focusedIndex: 0,
      generation: 2,
      isCurrentGeneration: (generation) => generation === 2,
      isHidden: () => false,
      loadThumbnailUrl: generationTwoLoad,
      onThumbnailLoaded: generationTwoThumbnailLoaded,
      revokeThumbnailUrl,
      state: generationTwoState,
      window: {
        endIndex: generationTwoAssets.length,
        startIndex: 0
      }
    });

    expect(generationTwoState.activeThumbnailRequests).toBe(8);
    expect(generationTwoState.thumbnailQueue).toHaveLength(2);

    oldRequest.resolve("blob:old-0");
    await flushPromises();

    expect(generationTwoState.activeThumbnailRequests).toBe(8);
    expect(generationTwoState.thumbnailQueue).toHaveLength(2);

    newRequest.resolve("blob:new-0");
    await flushPromises();

    expect(generationTwoState.thumbnailUrls["new-0"]).toBe("blob:new-0");
    expect(generationTwoThumbnailLoaded).toHaveBeenCalledWith(
      generationTwoAssets[0],
      0,
      "blob:new-0"
    );
  });

  it("revokes all retained URLs during cleanup", () => {
    const state = createAssetThumbnailState();
    const revokeThumbnailUrl = vi.fn();

    state.thumbnailUrls.a = "blob:a";
    state.thumbnailUrls.b = "blob:b";
    state.thumbnailRequests.c = 1;
    state.retainedAssetIds.a = true;

    revokeAllAssetThumbnails(state, revokeThumbnailUrl);

    expect(revokeThumbnailUrl).toHaveBeenCalledWith("blob:a");
    expect(revokeThumbnailUrl).toHaveBeenCalledWith("blob:b");
    expect(state).toEqual(createAssetThumbnailState());
  });
});
