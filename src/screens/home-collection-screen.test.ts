import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlbumService } from "../app/album-service";
import type { Memory } from "../domain/home";
import type { AlbumAsset, AlbumAssetPageToken } from "../domain/album";
import type { CollectionFeed } from "./collection/collection-model";
import { TestDocument } from "../test/document";
import { mountAlbumDetailScreen } from "./album-detail-screen";
import { AppError } from "../errors/app-error";

function fixture() {
  const documentRef = new TestDocument();
  const onBack = vi.fn();
  const onViewerOpened = vi.fn();
  const onAssetViewed = vi.fn();
  const loadPersonAssets = vi.fn();
  const loadMemory = vi.fn();
  const loadAssetViewerStillUrl = vi.fn().mockResolvedValue(null);
  const loadAssetPlaybackUrl = vi.fn(() => "https://immich.example/playback");
  const controller = mountAlbumDetailScreen({
    documentRef: documentRef as unknown as Document,
    loadFeedPage: vi.fn((feed: CollectionFeed, page: AlbumAssetPageToken) =>
      loadPersonAssets(feed.kind === "person" ? feed.personId : feed.kind, page)
    ),
    onBack,
    onViewerOpened,
    onAssetViewed,
    service: {
      loadAlbumDetail: vi.fn(async (id: string) => ({
        id,
        name: "Album",
        assetCount: 0,
        thumbnailAssetId: null,
        order: "desc"
      })),
      loadAlbumAssetsPage: vi.fn().mockResolvedValue({ assets: [], nextPageToken: null, total: 0 }),
      loadPersonAssets,
      loadMemory,
      loadAssetPlaybackUrl,
      loadAssetThumbnailUrl: vi.fn().mockResolvedValue(null),
      loadAssetViewerStillUrl,
      revokeThumbnailUrl: vi.fn(),
      revokeImageUrl: vi.fn()
    } as unknown as AlbumService,
    settingsStore: {
      load: () => ({
        autoplayVideos: false,
        showViewerDate: false,
        showViewerExif: false,
        showViewerTime: false,
        slideshowIntervalSeconds: 8
      }),
      save: vi.fn()
    }
  });
  const assets: AlbumAsset[] = ["first", "last"].map((id) => ({
    id,
    name: id,
    type: "image",
    capturedAt: null,
    durationMs: null,
    livePhotoVideoId: null,
    location: null
  }));
  const press = (keyCode: number) => {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "keyCode", { value: keyCode });
    documentRef.dispatchEvent(event);
  };
  loadMemory.mockResolvedValue({
    id: "memory",
    kind: "on-this-day" as const,
    memoryAt: "2020-10-15T00:00:00.000Z",
    personName: null,
    year: 2020,
    assets,
    assetCount: assets.length
  });
  return {
    loadAssetViewerStillUrl,
    loadMemory,
    loadAssetPlaybackUrl,
    documentRef,
    controller,
    onBack,
    onViewerOpened,
    onAssetViewed,
    loadPersonAssets,
    assets,
    press
  };
}

describe("Home collection summary", () => {
  const album = { id: "album", name: "Album", assetCount: 0, thumbnailAssetId: null };

  it.each(["albums", "home"] as const)(
    "has no Back control, and the Back key returns to its %s parent",
    async (parent) => {
      const { controller, documentRef, onBack, press } = fixture();
      const destination = vi.fn();
      // main.ts retains responsibility for routing; the screen only reports Back.
      onBack.mockImplementation(() => destination(parent));
      controller.show(album, parent);
      expect(documentRef.activeElement).toBe(documentRef.getElementById("album-detail-screen"));
      await vi.waitFor(() =>
        expect(documentRef.getElementById("album-detail-summary").getAttribute("data-state")).toBe(
          "idle"
        )
      );
      press(10009);
      expect(destination).toHaveBeenLastCalledWith(parent);
      controller.destroy();
    }
  );

  const person = { id: "person-1", isFavorite: false, name: "Person One" };

  it("shows a loading state immediately and focuses the first result when it arrives", async () => {
    const { controller, documentRef, loadPersonAssets, assets } = fixture();
    let resolve!: (page: { assets: AlbumAsset[] }) => void;
    loadPersonAssets.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );

    controller.showPerson(person, "home");

    expect(documentRef.getElementById("album-detail-title").textContent).toBe(person.name);
    expect(documentRef.getElementById("album-detail-summary").getAttribute("data-state")).toBe(
      "pending"
    );
    expect(documentRef.activeElement).toBe(documentRef.getElementById("album-detail-screen"));
    expect(documentRef.getElementById("collection-retry").hidden).toBe(true);
    resolve({ assets });
    await vi.waitFor(() =>
      expect(documentRef.activeElement?.getAttribute("data-asset-index")).toBe("0")
    );
    expect(loadPersonAssets).toHaveBeenCalledWith(person.id, { kind: "page", page: 1 });
    controller.destroy();
  });

  it("offers remote Retry and Back after a failure, then recovers without duplicate requests", async () => {
    const { controller, documentRef, loadPersonAssets, assets, press } = fixture();
    loadPersonAssets.mockRejectedValueOnce(new AppError("network", "Network failed"));
    controller.showPerson(person, "home");
    const retry = documentRef.getElementById("collection-retry");
    await vi.waitFor(() => expect(documentRef.activeElement).toBe(retry));
    expect(documentRef.getElementById("album-detail-summary").getAttribute("data-state")).toBe(
      "error"
    );
    press(38);
    expect(documentRef.activeElement).toBe(retry);

    let resolve!: (page: { assets: AlbumAsset[] }) => void;
    loadPersonAssets.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    press(13);
    retry.dispatchEvent(new Event("click"));
    expect(loadPersonAssets).toHaveBeenCalledTimes(2);
    expect(retry.hidden).toBe(true);
    resolve({ assets });
    await vi.waitFor(() =>
      expect(documentRef.activeElement?.getAttribute("data-asset-index")).toBe("0")
    );
    controller.destroy();
  });

  it.each(["resolve", "reject"])(
    "ignores a late %s after Back leaves a loading person",
    async (outcome) => {
      const { controller, documentRef, loadPersonAssets, onBack, assets, press } = fixture();
      let resolve!: (page: { assets: AlbumAsset[] }) => void;
      let reject!: (error: Error) => void;
      loadPersonAssets.mockImplementation(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          })
      );
      onBack.mockImplementation(() => controller.hide());
      controller.showPerson(person, "home");
      press(10009);
      expect(onBack).toHaveBeenCalledTimes(1);
      const homeTile = documentRef.getElementById("home-person");
      homeTile.focus();
      if (outcome === "resolve") resolve({ assets });
      else reject(new AppError("network", "Offline"));
      await Promise.resolve();
      await Promise.resolve();
      expect(documentRef.getElementById("album-detail-screen").hidden).toBe(true);
      expect(documentRef.getElementById("album-assets-grid").children).toHaveLength(0);
      expect(documentRef.activeElement).toBe(homeTile);
      expect(documentRef.getElementById("collection-retry").hidden).toBe(true);
      controller.destroy();
    }
  );

  it("does not replace a newer person with an older person's response", async () => {
    const { controller, documentRef, loadPersonAssets, assets } = fixture();
    let resolveOld!: (page: { assets: AlbumAsset[] }) => void;
    loadPersonAssets
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolveOld = done;
          })
      )
      .mockResolvedValueOnce({ assets: [assets[1]] });
    controller.showPerson(person, "home");
    controller.showPerson({ ...person, id: "person-2", name: "Person Two" }, "home");
    await vi.waitFor(() =>
      expect(documentRef.getElementById("album-assets-grid").children).toHaveLength(1)
    );
    resolveOld({ assets });
    await Promise.resolve();
    expect(documentRef.getElementById("album-detail-title").textContent).toBe("Person Two");
    expect(documentRef.getElementById("album-assets-grid").children).toHaveLength(1);
    controller.destroy();
  });

  it("keeps an empty person result navigable with Back", async () => {
    const { controller, documentRef, loadPersonAssets, onBack, press } = fixture();
    loadPersonAssets.mockResolvedValue({ assets: [] });
    controller.showPerson(person, "home");
    await vi.waitFor(() =>
      expect(documentRef.getElementById("album-detail-summary").textContent).toBe(
        "There are no photos or videos to show."
      )
    );
    expect(documentRef.activeElement).toBe(documentRef.getElementById("album-detail-screen"));
    expect(documentRef.getElementById("collection-retry").hidden).toBe(true);
    press(10009);
    expect(onBack).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it.each(["resolve", "reject"])(
    "keeps sidebar focus when a pending person request completes with %s",
    async (outcome) => {
      const { controller, documentRef, loadPersonAssets, assets } = fixture();
      let resolve!: (page: { assets: AlbumAsset[] }) => void;
      let reject!: (error: Error) => void;
      loadPersonAssets.mockImplementation(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          })
      );
      controller.showPerson(person, "home");
      const sidebar = documentRef.getElementById("shell-home");
      sidebar.focus();
      if (outcome === "resolve") resolve({ assets });
      else reject(new AppError("network", "Offline"));
      await Promise.resolve();
      await Promise.resolve();
      expect(documentRef.activeElement).toBe(sidebar);
      controller.destroy();
    }
  );

  it.each(["Person", "Memory"])(
    "opens %s in the shared summary and returns through it from the viewer",
    (title) => {
      const { documentRef, controller, onBack, onViewerOpened, onAssetViewed, assets, press } =
        fixture();
      controller.showStaticAssetCollection({
        assets,
        focusedIndex: 0,
        id: title,
        title,
        initialView: "grid"
      });

      const grid = documentRef.getElementById("album-assets-grid");
      const viewer = documentRef.getElementById("asset-placeholder");
      expect(grid.hidden).toBe(false);
      expect(viewer.hidden).toBe(true);
      expect(documentRef.activeElement?.getAttribute("data-asset-index")).toBe("0");
      expect(onViewerOpened).not.toHaveBeenCalled();
      expect(onAssetViewed).not.toHaveBeenCalled();

      press(13);
      expect(viewer.hidden).toBe(false);
      expect(onViewerOpened).toHaveBeenCalledTimes(1);
      press(39);
      expect(onAssetViewed.mock.calls.map(([asset]) => asset.id)).toEqual(["first", "last"]);
      expect(onAssetViewed).toHaveBeenLastCalledWith(assets[1], {
        kind: "collection",
        id: title,
        title
      });
      press(10009);

      expect(viewer.hidden).toBe(true);
      expect(grid.hidden).toBe(false);
      expect(documentRef.activeElement?.getAttribute("data-asset-index")).toBe("1");
      expect(onBack).not.toHaveBeenCalled();

      press(10009);
      expect(onBack).toHaveBeenCalledTimes(1);
      controller.destroy();
    }
  );

  it("keeps direct asset rails opening the viewer and returns their last asset to Home", () => {
    const { controller, documentRef, onBack, assets, press } = fixture();
    controller.showStaticAssetCollection({
      assets,
      focusedIndex: 0,
      id: "recent",
      title: "Recent"
    });
    expect(documentRef.getElementById("asset-placeholder").hidden).toBe(false);
    press(39);
    press(10009);
    expect(onBack).toHaveBeenCalledWith("last");
    controller.destroy();
  });

  it("keeps an empty summary navigable with Back", () => {
    const { controller, documentRef, onBack, press } = fixture();
    controller.showStaticAssetCollection({
      assets: [],
      focusedIndex: 0,
      id: "empty",
      title: "Empty",
      initialView: "grid"
    });
    expect(documentRef.activeElement).toBe(documentRef.getElementById("album-detail-screen"));
    press(10009);
    expect(onBack).toHaveBeenCalledTimes(1);
    controller.destroy();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Memory shared collection", () => {
  const memory: Memory = {
    id: "memory",
    kind: "on-this-day",
    memoryAt: "2020-10-15T00:00:00.000Z",
    personName: null,
    year: 2020,
    assets: [],
    assetCount: 2
  };

  it.each(["home", "memories"] as const)(
    "loads by stable ID from its %s parent, and records viewer visits as Memory sources",
    async (parent) => {
      const f = fixture();
      f.controller.showMemory(memory, parent);
      expect(f.documentRef.getElementById("album-detail-summary").getAttribute("data-state")).toBe(
        "pending"
      );
      await vi.waitFor(() =>
        expect(f.documentRef.activeElement?.getAttribute("data-asset-index")).toBe("0")
      );
      expect(f.loadMemory).toHaveBeenCalledWith("memory");
      expect(f.documentRef.getElementById("album-detail-summary").textContent).toContain(
        "On this day · 2020-10-15"
      );
      f.press(13);
      f.press(39);
      f.press(10009);
      expect(f.documentRef.activeElement?.getAttribute("data-asset-index")).toBe("1");
      expect(f.onAssetViewed).toHaveBeenLastCalledWith(f.assets[1], {
        kind: "memory",
        id: "memory",
        title: "Memory from 2020"
      });
      expect(f.onBack).not.toHaveBeenCalled();
      f.press(10009);
      expect(f.onBack).toHaveBeenCalledTimes(1);
      f.controller.destroy();
    }
  );

  it("recovers from Memory load failure using remote Retry, and keeps empty results navigable", async () => {
    const f = fixture();
    f.loadMemory.mockRejectedValueOnce(new AppError("network", "Offline"));
    f.controller.showMemory(memory, "home");
    await vi.waitFor(() =>
      expect(f.documentRef.activeElement).toBe(f.documentRef.getElementById("collection-retry"))
    );
    f.loadMemory.mockResolvedValue({ ...memory, assets: [] });
    f.press(13);
    await vi.waitFor(() =>
      expect(f.documentRef.getElementById("album-detail-summary").textContent).toBe(
        "There are no photos or videos to show."
      )
    );
    expect(f.documentRef.activeElement).toBe(f.documentRef.getElementById("album-detail-screen"));
    f.press(10009);
    expect(f.onBack).toHaveBeenCalledTimes(1);
    f.controller.destroy();
  });

  it.each(["resolve", "reject"])(
    "keeps Back usable during a Memory load and ignores its late %s",
    async (outcome) => {
      const f = fixture();
      let resolve!: (memory: Memory) => void;
      let reject!: (error: Error) => void;
      f.loadMemory.mockImplementationOnce(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          })
      );
      f.onBack.mockImplementation(() => f.controller.hide());
      f.controller.showMemory(memory, "home");
      f.press(10009);
      const home = f.documentRef.getElementById("home-memory-tile");
      home.focus();
      if (outcome === "resolve") resolve({ ...memory, assets: f.assets });
      else reject(new AppError("network", "Offline"));
      await Promise.resolve();
      await Promise.resolve();
      expect(f.documentRef.getElementById("album-detail-screen").hidden).toBe(true);
      expect(f.documentRef.activeElement).toBe(home);
      expect(f.documentRef.getElementById("album-assets-grid").children).toHaveLength(0);
      f.controller.destroy();
    }
  );

  it.each(["resolve", "reject"])(
    "ignores stale Memory detail %s after leaving and opening a newer Memory",
    async (outcome) => {
      const f = fixture();
      let resolve!: (memory: Memory) => void;
      let reject!: (error: Error) => void;
      f.loadMemory.mockImplementationOnce(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          })
      );
      f.controller.showMemory(memory, "home");
      f.controller.hide();
      f.loadMemory.mockResolvedValue({
        ...memory,
        personName: "Alex",
        year: 2021,
        assets: [f.assets[1]]
      });
      f.controller.showMemory({ ...memory, id: "new" }, "memories");
      await vi.waitFor(() =>
        expect(f.documentRef.getElementById("album-assets-grid").children).toHaveLength(1)
      );
      if (outcome === "resolve") resolve({ ...memory, assets: f.assets });
      else reject(new Error("old"));
      await Promise.resolve();
      expect(f.documentRef.getElementById("album-detail-title").textContent).toBe("Alex, 2021");
      expect(f.documentRef.getElementById("album-assets-grid").children).toHaveLength(1);
      f.controller.destroy();
    }
  );

  it.each(["resolve", "reject"])("preserves shell focus on Memory detail %s", async (outcome) => {
    const f = fixture();
    let resolve!: (memory: Memory) => void;
    let reject!: (error: Error) => void;
    f.loadMemory.mockImplementationOnce(
      () =>
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        })
    );
    f.controller.showMemory(memory, "home");
    const shell = f.documentRef.getElementById("shell-home");
    shell.focus();
    if (outcome === "resolve") resolve({ ...memory, assets: f.assets });
    else reject(new AppError("network", "Offline"));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.documentRef.activeElement).toBe(shell);
    f.controller.destroy();
  });

  it.each(["video", "live-photo"])(
    "routes Memory %s through the shared playback control",
    async (kind) => {
      const f = fixture();
      const playable = {
        ...f.assets[0]!,
        type: kind === "video" ? ("video" as const) : ("image" as const),
        livePhotoVideoId: kind === "live-photo" ? "motion" : null
      };
      f.loadMemory.mockResolvedValue({ ...memory, assets: [playable] });
      f.loadAssetViewerStillUrl.mockResolvedValue("blob:still");
      const video = f.documentRef.getElementById("asset-viewer-video");
      const play = vi.fn().mockResolvedValue(undefined);
      Object.assign(video, {
        play,
        readyState: 2,
        currentTime: 0,
        duration: 2,
        buffered: { length: 0 }
      });
      f.controller.showMemory(memory, "home");
      await vi.waitFor(() =>
        expect(f.documentRef.activeElement?.getAttribute("data-asset-index")).toBe("0")
      );
      f.press(13);
      const control = f.documentRef.getElementById("asset-viewer-play");
      await vi.waitFor(() => expect(control.getAttribute("data-media-kind")).toBe(kind));
      expect(control.hidden).toBe(false);
      control.focus();
      f.press(13);
      await vi.waitFor(() => expect(f.loadAssetPlaybackUrl).toHaveBeenCalledWith(playable));
      expect(play).toHaveBeenCalledTimes(1);
      f.controller.destroy();
    }
  );

  it("runs and pauses the existing slideshow timer over Memory assets, then cleans up on Back", async () => {
    const f = fixture();
    f.controller.showMemory(memory, "home");
    await vi.waitFor(() =>
      expect(f.documentRef.activeElement?.getAttribute("data-asset-index")).toBe("0")
    );
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    f.press(13);
    f.press(10252);
    expect(
      f.documentRef.getElementById("asset-viewer-slideshow").getAttribute("data-slideshow-state")
    ).toBe("playing");
    vi.advanceTimersByTime(8000);
    expect(f.onAssetViewed).toHaveBeenLastCalledWith(
      f.assets[1],
      expect.objectContaining({ kind: "memory" })
    );
    f.press(10252);
    expect(
      f.documentRef.getElementById("asset-viewer-slideshow").getAttribute("data-slideshow-state")
    ).toBe("paused");
    f.press(10252);
    f.press(10009);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.documentRef.activeElement?.getAttribute("data-asset-index")).toBe("1");
    f.controller.destroy();
  });
});

describe("Album paging recovery", () => {
  it("requests a failed page again on the next remote movement instead of stopping paging", async () => {
    const f = fixture();
    f.controller.destroy();
    const pageAssets = (prefix: string): AlbumAsset[] =>
      Array.from({ length: 6 }, (_, index) => ({
        ...f.assets[0]!,
        id: `${prefix}-${index}`,
        name: `${prefix}-${index}`
      }));
    const loadAlbumAssetsPage = vi
      .fn()
      .mockResolvedValueOnce({
        assets: pageAssets("first"),
        nextPageToken: { kind: "page", page: 2 },
        total: 12
      })
      .mockRejectedValueOnce(new AppError("timeout", "Immich did not respond in time."))
      .mockResolvedValueOnce({ assets: pageAssets("second"), nextPageToken: null, total: 12 });
    const documentRef = new TestDocument();
    const controller = mountAlbumDetailScreen({
      documentRef: documentRef as unknown as Document,
      loadFeedPage: vi.fn(),
      onBack: vi.fn(),
      service: {
        loadAlbumDetail: vi.fn(async (id: string) => ({
          id,
          name: "Album",
          assetCount: 12,
          thumbnailAssetId: null,
          order: "desc"
        })),
        loadAlbumAssetsPage,
        loadAssetThumbnailUrl: vi.fn().mockResolvedValue(null),
        revokeThumbnailUrl: vi.fn(),
        revokeImageUrl: vi.fn()
      } as unknown as AlbumService,
      settingsStore: {
        load: () => ({
          autoplayVideos: false,
          showViewerDate: false,
          showViewerExif: false,
          showViewerTime: false,
          slideshowIntervalSeconds: 8
        }),
        save: vi.fn()
      }
    });
    const press = (keyCode: number) => {
      const event = new Event("keydown", { cancelable: true });
      Object.defineProperty(event, "keyCode", { value: keyCode });
      documentRef.dispatchEvent(event);
    };

    controller.show(
      { id: "album", name: "Album", assetCount: 12, thumbnailAssetId: null },
      "albums"
    );
    await vi.waitFor(() =>
      expect(documentRef.activeElement?.getAttribute("data-asset-index")).toBe("0")
    );

    press(39);
    await vi.waitFor(() =>
      expect(documentRef.getElementById("album-detail-summary").getAttribute("data-state")).toBe(
        "error"
      )
    );
    expect(documentRef.getElementById("album-detail-summary").textContent).toContain(
      "Could not load more assets."
    );
    expect(loadAlbumAssetsPage).toHaveBeenCalledTimes(2);

    press(39);
    await vi.waitFor(() => expect(loadAlbumAssetsPage).toHaveBeenCalledTimes(3));
    expect(loadAlbumAssetsPage.mock.calls[2]?.[2]).toEqual({ kind: "page", page: 2 });
    await vi.waitFor(() =>
      expect([
        documentRef.getElementById("album-detail-summary").getAttribute("data-loaded-count"),
        documentRef.getElementById("album-detail-summary").getAttribute("data-total")
      ]).toEqual(["12", "12"])
    );
    controller.destroy();
  });
});

describe("Viewer suspension when the app is hidden", () => {
  const memory: Memory = {
    id: "memory",
    kind: "on-this-day",
    memoryAt: "2020-10-15T00:00:00.000Z",
    personName: null,
    year: 2020,
    assets: [],
    assetCount: 2
  };

  async function openPlayable(kind: "video" | "live-photo", playImpl?: () => Promise<void>) {
    const f = fixture();
    const playable = {
      ...f.assets[0]!,
      type: kind === "video" ? ("video" as const) : ("image" as const),
      livePhotoVideoId: kind === "live-photo" ? "motion" : null
    };
    f.loadMemory.mockResolvedValue({ ...memory, assets: [playable, f.assets[1]!] });
    f.loadAssetViewerStillUrl.mockResolvedValue("blob:still");
    const video = f.documentRef.getElementById("asset-viewer-video");
    const pause = vi.fn();
    const play = vi.fn(playImpl || (() => Promise.resolve()));
    Object.assign(video, {
      play,
      pause,
      readyState: 2,
      currentTime: 0,
      duration: 2,
      buffered: { length: 0 },
      paused: false,
      ended: false
    });
    f.controller.showMemory(memory, "home");
    await vi.waitFor(() =>
      expect(f.documentRef.activeElement?.getAttribute("data-asset-index")).toBe("0")
    );
    f.press(13);
    const control = f.documentRef.getElementById("asset-viewer-play");
    await vi.waitFor(() => expect(control.hidden).toBe(false));
    control.focus();
    f.press(13);
    return { ...f, control, pause, play };
  }

  it.each(["video", "live-photo"] as const)(
    "pauses %s playback and leaves it paused and focusable",
    async (kind) => {
      const f = await openPlayable(kind);
      await vi.waitFor(() => expect(f.control.getAttribute("data-play-state")).toBe("playing"));
      f.pause.mockClear();

      f.controller.suspendPlayback();

      expect(f.pause).toHaveBeenCalled();
      expect(f.control.getAttribute("data-play-state")).toBe("idle");
      expect(f.documentRef.activeElement).toBe(f.control);
      expect(f.play).toHaveBeenCalledTimes(1);
      f.controller.destroy();
    }
  );

  it("cancels a pending playback start so it cannot begin while hidden", async () => {
    const f = await openPlayable("video", () => new Promise<void>(() => undefined));
    await vi.waitFor(() => expect(f.control.getAttribute("data-play-state")).toBe("loading"));

    f.controller.suspendPlayback();

    expect(f.control.getAttribute("data-play-state")).toBe("idle");
    expect(f.documentRef.getElementById("asset-viewer-image").hidden).toBe(false);
    f.controller.destroy();
  });

  it("pauses a running slideshow without resuming it", async () => {
    const f = fixture();
    f.controller.showMemory(memory, "home");
    await vi.waitFor(() =>
      expect(f.documentRef.activeElement?.getAttribute("data-asset-index")).toBe("0")
    );
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    f.press(13);
    f.press(10252);
    const slideshow = f.documentRef.getElementById("asset-viewer-slideshow");
    expect(slideshow.getAttribute("data-slideshow-state")).toBe("playing");

    f.controller.suspendPlayback();

    expect(slideshow.getAttribute("data-slideshow-state")).toBe("paused");
    expect(vi.getTimerCount()).toBe(0);
    const viewsBeforeHidden = f.onAssetViewed.mock.calls.length;
    vi.advanceTimersByTime(30000);
    expect(f.onAssetViewed).toHaveBeenCalledTimes(viewsBeforeHidden);
    expect(f.documentRef.activeElement).toBe(slideshow);
    f.controller.destroy();
  });

  it("is a no-op outside the viewer", () => {
    const f = fixture();
    f.controller.showStaticAssetCollection({
      assets: f.assets,
      focusedIndex: 0,
      id: "grid",
      title: "Grid",
      initialView: "grid"
    });

    expect(() => f.controller.suspendPlayback()).not.toThrow();
    expect(f.documentRef.activeElement?.getAttribute("data-asset-index")).toBe("0");
    f.controller.destroy();
  });
});
