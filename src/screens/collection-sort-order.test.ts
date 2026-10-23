import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlbumService } from "../app/album-service";
import type { AlbumAsset, AlbumAssetPage, SortOrder, TimelineBucket } from "../domain/album";
import { defaultAppSettings, type AppSettings } from "../domain/app-settings";
import { TestDocument } from "../test/document";
import { mountAlbumDetailScreen } from "./album-detail-screen";
import type { CollectionFeed } from "./collection/collection-model";

// The collection header's sort order button (Milestone 15, ADR 0017).

const keys = { back: 10009, down: 40, enter: 13, left: 37, right: 39, up: 38 };

function asset(id: string, capturedAt = "2026-10-15T10:00:00.000Z"): AlbumAsset {
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

function assets(prefix: string, count: number): AlbumAsset[] {
  return Array.from({ length: count }, (_, index) => asset(`${prefix}${index}`));
}

const page = (items: AlbumAsset[]): AlbumAssetPage => ({
  assets: items,
  nextPageToken: null,
  total: null
});

function fixture(initialSettings: Partial<AppSettings> = {}) {
  const documentRef = new TestDocument();
  let settings: AppSettings = { ...defaultAppSettings, ...initialSettings };
  const settingsStore = {
    load: () => settings,
    save: vi.fn((next: AppSettings) => {
      settings = next;
      return next;
    })
  };
  const buckets: Record<SortOrder, TimelineBucket[]> = {
    "newest-first": [{ assetCount: 2, timeBucket: "2026-10-01T00:00:00.000Z" }],
    "oldest-first": [{ assetCount: 2, timeBucket: "2026-10-01T00:00:00.000Z" }]
  };
  const service = {
    loadAlbumAssetsPage: vi.fn(async (_id: string, order: SortOrder) =>
      page(assets(order === "newest-first" ? "new" : "old", 8))
    ),
    loadAlbumDetail: vi.fn(async (id: string) => ({
      assetCount: 8,
      id,
      name: "Holiday",
      order: "newest-first" as SortOrder,
      thumbnailAssetId: null
    })),
    loadAssetThumbnailUrl: vi.fn().mockResolvedValue(null),
    loadAssetViewerStillUrl: vi.fn().mockResolvedValue(null),
    loadMemory: vi.fn(),
    loadTimelineAssetsPage: vi.fn(async (order: SortOrder) =>
      page(assets(order === "newest-first" ? "new" : "old", 2))
    ),
    loadTimelineBuckets: vi.fn(async (order: SortOrder) => buckets[order]),
    revokeImageUrl: vi.fn(),
    revokeThumbnailUrl: vi.fn()
  };
  const loadFeedPage = vi.fn(async (feed: CollectionFeed) =>
    page(assets("order" in feed && feed.order === "oldest-first" ? "old" : "new", 8))
  );
  const controller = mountAlbumDetailScreen({
    documentRef: documentRef as unknown as Document,
    loadFeedPage,
    onBack: vi.fn(),
    onReturnToShell: vi.fn(),
    service: service as unknown as AlbumService,
    settingsStore
  });
  const press = (keyCode: number) => {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "keyCode", { value: keyCode });
    documentRef.dispatchEvent(event);
  };
  const byId = (id: string) => documentRef.getElementById(id);
  const sortButton = () => byId("collection-sort-order");
  const focusedAssetId = () => documentRef.activeElement?.getAttribute("data-asset-id") ?? null;
  const settled = () =>
    vi.waitFor(() =>
      expect(byId("album-detail-summary").getAttribute("data-state")).toBe("success")
    );

  return {
    byId,
    controller,
    documentRef,
    focusedAssetId,
    loadFeedPage,
    press,
    service,
    settings: () => settings,
    settingsStore,
    settled,
    sortButton
  };
}

let active: ReturnType<typeof fixture> | null = null;

afterEach(() => {
  active?.controller.destroy();
  active = null;
});

describe("collection sort order", () => {
  it("reverses Photos from the header, keeping focus there, and remembers it", async () => {
    const f = (active = fixture());
    f.controller.showPhotos();
    await f.settled();
    f.controller.focusContent();
    expect(f.focusedAssetId()).toBe("new0");

    f.press(keys.up);
    expect(f.documentRef.activeElement).toBe(f.sortButton());
    expect(f.sortButton().textContent).toBe("Newest first");

    f.press(keys.enter);
    expect(f.sortButton().textContent).toBe("Oldest first");
    await vi.waitFor(() =>
      expect(
        f
          .byId("album-assets-grid")
          .children.some((tile) => tile.getAttribute("data-asset-id") === "old0")
      ).toBe(true)
    );
    expect(f.service.loadTimelineBuckets).toHaveBeenLastCalledWith("oldest-first");
    expect(f.service.loadTimelineAssetsPage).toHaveBeenLastCalledWith("oldest-first", {
      bucketIndex: 0,
      kind: "bucket"
    });
    expect(f.documentRef.activeElement).toBe(f.sortButton());
    expect(f.settings().sortOrders.photos).toBe("oldest-first");

    f.press(keys.down);
    expect(f.focusedAssetId()).toBe("old0");
  });

  it("reverses an album for the session only, starting from Immich's order", async () => {
    const f = (active = fixture());
    const album = { assetCount: 8, id: "album", name: "Holiday", thumbnailAssetId: null };
    f.controller.show(album, "albums");
    await f.settled();
    f.controller.focusContent();

    f.press(keys.up);
    f.press(keys.enter);
    await vi.waitFor(() =>
      expect(f.service.loadAlbumAssetsPage).toHaveBeenLastCalledWith("album", "oldest-first", null)
    );
    await f.settled();
    expect(f.documentRef.activeElement).toBe(f.sortButton());
    expect(f.sortButton().textContent).toBe("Oldest first");
    expect(f.settingsStore.save).not.toHaveBeenCalled();

    // The reversal lasts while the connection does.
    f.controller.show(album, "albums");
    await f.settled();
    expect(f.service.loadAlbumAssetsPage).toHaveBeenLastCalledWith("album", "oldest-first", null);

    f.controller.forgetSessionSortOrders();
    f.controller.show(album, "albums");
    await f.settled();
    expect(f.service.loadAlbumAssetsPage).toHaveBeenLastCalledWith("album", "newest-first", null);
  });

  it("opens a Home rail item newest first, and See more in the saved order", async () => {
    const f = (active = fixture({
      sortOrders: { ...defaultAppSettings.sortOrders, favorites: "oldest-first" }
    }));

    f.controller.showFeedCollection({
      assets: assets("new", 2),
      feed: { kind: "favorites", order: "newest-first" },
      focusedIndex: 1,
      id: "favorites",
      title: "Favourites"
    });
    expect(f.sortButton().hidden).toBe(false);
    expect(f.sortButton().textContent).toBe("Newest first");
    expect(f.settings().sortOrders.favorites).toBe("oldest-first");

    // Oldest first cannot start from the rail's newest items.
    f.controller.showFeedCollection({
      assets: assets("new", 2),
      feed: { kind: "favorites", order: "oldest-first" },
      focusedIndex: 0,
      id: "favorites",
      title: "Favourites"
    });
    await f.settled();
    expect(f.loadFeedPage).toHaveBeenLastCalledWith(
      { kind: "favorites", order: "oldest-first" },
      { kind: "page", page: 1 }
    );
    expect(f.sortButton().textContent).toBe("Oldest first");
    expect(f.byId("album-assets-grid").children[0]?.getAttribute("data-asset-id")).toBe("old0");
  });

  it("opens People and Search results in their saved orders and reverses them", async () => {
    const f = (active = fixture({
      sortOrders: { ...defaultAppSettings.sortOrders, people: "oldest-first" }
    }));
    const person = { id: "person-1", isFavorite: false, name: "Alex" };

    f.controller.showPerson(person, "people");
    await f.settled();
    expect(f.loadFeedPage).toHaveBeenLastCalledWith(
      { kind: "person", order: "oldest-first", personId: "person-1" },
      { kind: "page", page: 1 }
    );

    f.controller.focusContent();
    f.press(keys.up);
    f.press(keys.enter);
    await f.settled();
    expect(f.loadFeedPage).toHaveBeenLastCalledWith(
      { kind: "person", order: "newest-first", personId: "person-1" },
      { kind: "page", page: 1 }
    );
    expect(f.settings().sortOrders.people).toBe("newest-first");
    expect(f.documentRef.activeElement).toBe(f.sortButton());

    const criteria = { people: [], takenFrom: null, takenTo: null };
    f.controller.showSearchResults(criteria);
    await f.settled();
    expect(f.loadFeedPage).toHaveBeenLastCalledWith(
      { criteria, kind: "search", order: "newest-first" },
      { kind: "page", page: 1 }
    );
  });

  it("drops a reversed load's stale first page", async () => {
    const f = (active = fixture());
    let resolveFirst: ((value: AlbumAssetPage) => void) | null = null;
    f.controller.showPhotos();
    await f.settled();
    f.controller.focusContent();
    f.press(keys.up);

    f.service.loadTimelineAssetsPage.mockImplementationOnce(
      () => new Promise<AlbumAssetPage>((resolve) => (resolveFirst = resolve))
    );
    f.press(keys.enter);
    await vi.waitFor(() => expect(resolveFirst).not.toBeNull());
    f.press(keys.enter);
    await f.settled();
    resolveFirst!(page([asset("stale")]));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(f.sortButton().textContent).toBe("Newest first");
    const ids = f
      .byId("album-assets-grid")
      .children.map((tile) => tile.getAttribute("data-asset-id"));
    expect(ids).not.toContain("stale");
  });

  it("shows no sort button for Memories, Recently Added or Recently Viewed", () => {
    const f = (active = fixture());

    f.controller.showFeedCollection({
      assets: assets("new", 2),
      feed: { kind: "recently-added" },
      focusedIndex: 0,
      id: "recently-added",
      title: "Recently Added"
    });
    expect(f.sortButton().hidden).toBe(true);

    f.controller.showStaticAssetCollection({
      assets: assets("memory", 2),
      focusedIndex: 0,
      id: "memory",
      initialView: "grid",
      title: "On this day"
    });
    expect(f.sortButton().hidden).toBe(true);
  });
});
