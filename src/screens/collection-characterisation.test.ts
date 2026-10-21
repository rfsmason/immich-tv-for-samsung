import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlbumService } from "../app/album-service";
import type { AlbumAsset, AlbumAssetPageToken, TimelineBucket } from "../domain/album";
import { TestDocument } from "../test/document";
import { mountAlbumDetailScreen } from "./album-detail-screen";

// Characterisation tests for the shared collection screen's album grid,
// Photos timeline and viewer navigation. They pin current remote behaviour
// before the screen is decomposed (Milestone 11.5, D1).

const keys = { back: 10009, down: 40, enter: 13, left: 37, right: 39, up: 38 };

function asset(id: string, capturedAt: string | null = null): AlbumAsset {
  return {
    capturedAt,
    durationMs: null,
    id,
    livePhotoVideoId: null,
    location: null,
    name: id,
    type: "image"
  };
}

function bucket(index: number): TimelineBucket {
  const month = String(10 - index).padStart(2, "0");

  return { assetCount: 8, timeBucket: `2026-${month}-01T00:00:00.000Z` };
}

function bucketAssets(index: number): AlbumAsset[] {
  const month = String(10 - index).padStart(2, "0");

  return Array.from({ length: 8 }, (_, item) =>
    asset(`b${index}-${item}`, `2026-${month}-15T10:00:00.000Z`)
  );
}

function fixture(
  options: { albumAssets?: number; buckets?: number; pageTotal?: number | null } = {}
) {
  const documentRef = new TestDocument();
  const buckets = Array.from({ length: options.buckets ?? 3 }, (_, index) => bucket(index));
  const albumAssets = Array.from({ length: options.albumAssets ?? 14 }, (_, index) =>
    asset(`a${index}`)
  );
  const loadTimelineAssetsPage = vi.fn(async (token: AlbumAssetPageToken | null) => {
    const index = token?.kind === "bucket" ? token.bucketIndex : 0;
    return {
      assets: bucketAssets(index),
      nextPageToken:
        index + 1 < buckets.length ? { bucketIndex: index + 1, kind: "bucket" as const } : null,
      total: options.pageTotal === undefined ? buckets.length * 8 : options.pageTotal
    };
  });
  const onBack = vi.fn();
  const onReturnToShell = vi.fn();
  const onViewerOpened = vi.fn();
  const onViewerClosed = vi.fn();
  const onAssetViewed = vi.fn();
  const controller = mountAlbumDetailScreen({
    documentRef: documentRef as unknown as Document,
    loadFeedPage: vi.fn(),
    onAssetViewed,
    onBack,
    onReturnToShell,
    onViewerClosed,
    onViewerOpened,
    service: {
      loadAlbumAssetsPage: vi.fn().mockResolvedValue({
        assets: albumAssets,
        nextPageToken: null,
        total: options.pageTotal === undefined ? albumAssets.length : options.pageTotal
      }),
      loadAlbumDetail: vi.fn(async (id: string) => ({
        assetCount: albumAssets.length,
        id,
        name: "Holiday",
        order: "desc",
        thumbnailAssetId: null
      })),
      loadAssetThumbnailUrl: vi.fn().mockResolvedValue(null),
      loadAssetViewerStillUrl: vi.fn().mockResolvedValue(null),
      loadTimelineAssetsPage,
      loadTimelineBuckets: vi.fn().mockResolvedValue(buckets),
      revokeImageUrl: vi.fn(),
      revokeThumbnailUrl: vi.fn()
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
  const focused = () => documentRef.activeElement?.getAttribute("data-asset-index") ?? null;
  const focusedMarker = () => documentRef.activeElement?.getAttribute("data-bucket-index") ?? null;
  const byId = (id: string) => documentRef.getElementById(id);
  // Loaded and total asset counts, which the grid keeps as unseen attributes.
  const counts = () => [
    byId("album-detail-summary").getAttribute("data-loaded-count"),
    byId("album-detail-summary").getAttribute("data-total")
  ];
  const settled = () =>
    vi.waitFor(() =>
      expect(byId("album-detail-summary").getAttribute("data-state")).toBe("success")
    );

  return {
    byId,
    controller,
    counts,
    documentRef,
    focused,
    focusedMarker,
    loadTimelineAssetsPage,
    onAssetViewed,
    onBack,
    onReturnToShell,
    onViewerClosed,
    onViewerOpened,
    press,
    settled
  };
}

let active: ReturnType<typeof fixture> | null = null;

afterEach(() => {
  active?.controller.destroy();
  active = null;
});

describe("album grid remote navigation", () => {
  async function openAlbum() {
    const f = (active = fixture());
    f.controller.show(
      { assetCount: 14, id: "album", name: "Holiday", thumbnailAssetId: null },
      "albums"
    );
    await f.settled();
    return f;
  }

  it("moves across six columns, clamps at edges, and hands off to the shell", async () => {
    const f = await openAlbum();

    expect(f.byId("album-detail-title").textContent).toBe("Holiday");
    expect(f.counts()).toEqual(["14", "14"]);
    expect(f.focused()).toBe("0");
    f.press(keys.right);
    expect(f.focused()).toBe("1");
    f.press(keys.down);
    expect(f.focused()).toBe("7");
    f.press(keys.down);
    expect(f.focused()).toBe("13");
    f.press(keys.up);
    f.press(keys.up);
    expect(f.focused()).toBe("1");

    f.press(keys.up);
    expect(f.focused()).toBe("1");

    f.press(keys.left);
    f.press(keys.left);
    expect(f.onReturnToShell).toHaveBeenCalledTimes(1);

    for (let step = 0; step < 5; step += 1) f.press(keys.right);
    expect(f.focused()).toBe("5");
    f.press(keys.right);
    expect(f.focused()).toBe("5");
  });

  it("opens the viewer, steps through assets, and restores grid focus on Back", async () => {
    const f = await openAlbum();

    f.press(keys.down);
    f.press(keys.enter);
    expect(f.byId("asset-placeholder").hidden).toBe(false);
    expect(f.byId("album-assets-grid").hidden).toBe(true);
    expect(f.onViewerOpened).toHaveBeenCalledTimes(1);
    expect(f.byId("asset-placeholder-summary").textContent).toContain("7");

    f.press(keys.right);
    f.press(keys.right);
    f.press(keys.left);
    expect(f.onAssetViewed.mock.calls.map(([viewed]) => viewed.id)).toEqual([
      "a6",
      "a7",
      "a8",
      "a7"
    ]);
    expect(f.onAssetViewed).toHaveBeenLastCalledWith(expect.objectContaining({ id: "a7" }), {
      id: "album",
      kind: "album",
      title: "Holiday"
    });

    f.press(keys.up);
    expect(f.documentRef.activeElement).toBe(f.byId("asset-viewer-slideshow"));
    f.press(keys.down);
    expect(f.documentRef.activeElement).toBe(f.byId("asset-placeholder-back"));

    f.press(keys.back);
    expect(f.byId("asset-placeholder").hidden).toBe(true);
    expect(f.byId("album-assets-grid").hidden).toBe(false);
    expect(f.onViewerClosed).toHaveBeenCalledTimes(1);
    expect(f.focused()).toBe("7");

    f.press(keys.back);
    expect(f.onBack).toHaveBeenCalledTimes(1);
  });

  it("counts an album from its asset count, not a page-reported total", async () => {
    const f = (active = fixture({ pageTotal: 3 }));
    f.controller.show(
      { assetCount: 14, id: "album-1", name: "Holiday", thumbnailAssetId: null },
      "albums"
    );
    await f.settled();

    expect(f.counts()).toEqual(["14", "14"]);
  });

  it("clamps viewer navigation at the first loaded asset", async () => {
    const f = await openAlbum();

    f.press(keys.enter);
    f.press(keys.left);
    expect(f.onAssetViewed).toHaveBeenCalledTimes(1);
    f.press(keys.back);
    expect(f.focused()).toBe("0");
  });
});

describe("Photos timeline remote navigation", () => {
  async function openPhotos(buckets = 3) {
    const f = (active = fixture({ buckets }));
    f.controller.showPhotos();
    await f.settled();
    f.controller.focusContent();
    return f;
  }

  it("fills the first screen from buckets, renders date sections and rail markers", async () => {
    const f = await openPhotos();

    expect(f.byId("album-detail-title").textContent).toBe("Timeline");
    expect(f.loadTimelineAssetsPage.mock.calls.map(([token]) => token)).toEqual([
      { bucketIndex: 0, kind: "bucket" },
      { bucketIndex: 1, kind: "bucket" },
      { bucketIndex: 2, kind: "bucket" }
    ]);
    expect(f.counts()).toEqual(["24", "24"]);
    expect(f.byId("album-assets-grid").querySelectorAll("h2").length).toBeGreaterThan(0);
    expect(f.byId("photos-timeline-rail").hidden).toBe(false);
    expect(f.byId("photos-timeline-rail").querySelectorAll("button")).toHaveLength(3);
    expect(f.focused()).toBe("0");
  });

  it("navigates rows within date sections", async () => {
    const f = await openPhotos();

    f.press(keys.down);
    expect(f.focused()).toBe("6");
    f.press(keys.down);
    expect(f.focused()).toBe("8");
    f.press(keys.up);
    expect(f.focused()).toBe("6");
    f.press(keys.right);
    expect(f.focused()).toBe("7");
  });

  it("moves to the timeline rail at a section row end and jumps to a loaded bucket", async () => {
    const f = await openPhotos();

    for (let step = 0; step < 5; step += 1) f.press(keys.right);
    expect(f.focused()).toBe("5");
    f.press(keys.right);
    expect(f.focusedMarker()).toBe("0");

    f.press(keys.down);
    expect(f.focusedMarker()).toBe("1");
    f.press(keys.enter);
    expect(f.focused()).toBe("8");

    f.press(keys.right);
    f.press(keys.right);
    f.press(keys.right);
    f.press(keys.right);
    f.press(keys.right);
    f.press(keys.right);
    expect(f.focusedMarker()).toBe("1");
    f.press(keys.left);
    expect(f.focused()).toBe("13");
  });

  it("returns to the shell with Left at a row start and with Back", async () => {
    const f = await openPhotos();

    f.press(keys.left);
    expect(f.onReturnToShell).toHaveBeenCalledTimes(1);
    f.press(keys.back);
    expect(f.onReturnToShell).toHaveBeenCalledTimes(2);
    expect(f.onBack).not.toHaveBeenCalled();
  });

  it("opens the viewer with absolute positions and hides the rail while viewing", async () => {
    const f = await openPhotos();

    f.press(keys.down);
    f.press(keys.down);
    f.press(keys.enter);
    expect(f.byId("photos-timeline-rail").hidden).toBe(true);
    expect(f.byId("asset-placeholder-summary").textContent).toContain("9");
    expect(f.onAssetViewed).toHaveBeenLastCalledWith(expect.objectContaining({ id: "b1-0" }), {
      id: "photos",
      kind: "photos",
      title: "Timeline"
    });

    f.press(keys.back);
    expect(f.byId("photos-timeline-rail").hidden).toBe(false);
    expect(f.focused()).toBe("8");
  });

  it("jumps to an unloaded bucket with earlier context, then loads newer assets upward", async () => {
    const f = await openPhotos(6);

    for (let step = 0; step < 5; step += 1) f.press(keys.right);
    f.press(keys.right);
    for (let step = 0; step < 5; step += 1) f.press(keys.down);
    expect(f.focusedMarker()).toBe("5");
    // Moving focus near the loaded end has already paged in bucket 3.
    const bucketsRequested = () =>
      f.loadTimelineAssetsPage.mock.calls.map(
        ([token]) => (token as { bucketIndex: number }).bucketIndex
      );
    expect(bucketsRequested()).toEqual([0, 1, 2, 3]);
    f.press(keys.enter);
    await vi.waitFor(() =>
      expect(f.documentRef.activeElement?.getAttribute("data-asset-id")).toBe("b5-0")
    );

    expect(bucketsRequested().slice(4)).toEqual([4, 3, 5]);
    expect(f.documentRef.activeElement?.getAttribute("data-asset-id")).toBe("b5-0");

    f.press(keys.up);
    f.press(keys.up);
    f.press(keys.up);
    f.press(keys.up);
    f.press(keys.up);
    await vi.waitFor(() => expect(f.counts()).toEqual(["40", "48"]));

    expect(bucketsRequested().slice(7)).toEqual([2, 1]);
    // Reaching the first loaded row prefetches newer buckets and keeps focus.
    expect(f.documentRef.activeElement?.getAttribute("data-asset-id")).toBe("b3-0");
    expect(f.counts()).toEqual(["40", "48"]);
    f.press(keys.up);
    expect(f.documentRef.activeElement?.getAttribute("data-asset-id")).toBe("b2-6");
  });

  it("pages older buckets downward near the loaded end and stops after the last", async () => {
    const f = await openPhotos(6);
    const bucketsRequested = () =>
      f.loadTimelineAssetsPage.mock.calls.map(
        ([token]) => (token as { bucketIndex: number }).bucketIndex
      );

    // Three buckets fill the first screen; focusing it prefetches the next.
    expect(bucketsRequested()).toEqual([0, 1, 2, 3]);
    for (let step = 0; step < 24; step += 1) {
      f.press(keys.down);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    expect(f.counts()).toEqual(["48", "48"]);
    expect(bucketsRequested()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(f.documentRef.activeElement?.getAttribute("data-asset-id")).toBe("b5-6");
  });

  it("totals Photos from the timeline bucket counts, not a page-reported total", async () => {
    const f = (active = fixture({ pageTotal: 5 }));
    f.controller.showPhotos();
    await f.settled();

    expect(f.counts()).toEqual(["24", "24"]);
    f.controller.focusContent();
    f.press(keys.enter);
    expect(f.byId("asset-placeholder-summary").textContent).toBe("1 of 24");
  });

  it("restores a retained timeline when shown again, and reloads it on refresh", async () => {
    const f = await openPhotos();

    f.press(keys.down);
    f.controller.hide();
    f.controller.showPhotos();
    f.controller.focusContent();
    expect(f.focused()).toBe("6");
    expect(f.loadTimelineAssetsPage).toHaveBeenCalledTimes(3);

    f.controller.refreshPhotos();
    await vi.waitFor(() => expect(f.loadTimelineAssetsPage).toHaveBeenCalledTimes(6));
    await vi.waitFor(() => expect(f.counts()).toEqual(["24", "24"]));
  });
});
