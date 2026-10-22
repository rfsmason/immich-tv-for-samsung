import { describe, expect, it, vi } from "vitest";
import type { AlbumService } from "../../app/album-service";
import { TestDocument } from "../../test/document";
import { mountHomeScreen } from "../home-screen";
import {
  type HomeRailId,
  type HomeScreenState,
  createRailState,
  homeRailDataConcurrency,
  homeThumbnailPriority
} from "./home-model";

const flush = async () => {
  for (let tick = 0; tick < 5; tick += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const emptyPage = { assets: [], nextPageToken: null, total: 0 };

// Each rail's data request waits until the test releases it.
function railRequests() {
  const started: HomeRailId[] = [];
  const release: Partial<Record<HomeRailId, () => void>> = {};
  const request =
    <T>(rail: HomeRailId, value: T) =>
    () => {
      started.push(rail);
      return new Promise<T>((resolve) => {
        release[rail] = () => resolve(value);
      });
    };

  return { release, request, started };
}

describe("Home loading order", () => {
  it("loads rail data in screen order, two rails at a time, and reports when all are done", async () => {
    const { release, request, started } = railRequests();
    const documentRef = new TestDocument();
    const service = {
      loadAlbums: vi.fn(request("albums", [])),
      loadAssetThumbnailUrl: vi.fn(async () => null),
      loadFavoriteAssets: vi.fn(request("favorites", emptyPage)),
      loadMemories: vi.fn(request("memories", [])),
      loadMemoriesTotal: vi.fn(async () => 0),
      loadPeoplePage: vi.fn(request("people", { hasMore: false, page: 1, people: [], total: 0 })),
      loadPersonThumbnailUrl: vi.fn(async () => null),
      loadRecentlyAddedAssets: vi.fn(request("recently-added", emptyPage)),
      loadVideoAssets: vi.fn(request("videos", emptyPage)),
      revokeThumbnailUrl: vi.fn()
    };
    const controller = mountHomeScreen({
      documentRef: documentRef as unknown as Document,
      history: { loadAssets: vi.fn(request("recently-viewed", emptyPage)) },
      onBrowseAlbums: vi.fn(),
      onBrowseMemories: vi.fn(),
      onBrowsePeople: vi.fn(),
      onOpenAlbum: vi.fn(),
      onOpenAssetCollection: vi.fn(),
      onOpenMemory: vi.fn(),
      onOpenPerson: vi.fn(),
      onReturnToShell: vi.fn(),
      service: service as unknown as AlbumService
    });
    let loaded = false;

    controller.show();
    void controller.whenLoaded().then(() => {
      loaded = true;
    });
    await flush();
    expect(homeRailDataConcurrency).toBe(2);
    expect(started).toEqual(["recently-added", "favorites"]);

    release["recently-added"]!();
    await flush();
    expect(started).toEqual(["recently-added", "favorites", "videos"]);

    for (const rail of ["favorites", "videos", "people", "recently-viewed", "albums"] as const) {
      release[rail]!();
      await flush();
    }
    expect(started).toEqual([
      "recently-added",
      "favorites",
      "videos",
      "people",
      "recently-viewed",
      "albums",
      "memories"
    ]);
    expect(loaded).toBe(false);

    release.memories!();
    await flush();
    expect(loaded).toBe(true);
    controller.destroy();
  });

  it("waits for the latest load when Home reloads before the first one finishes", async () => {
    const pending: Array<() => void> = [];
    const hold =
      <T>(value: T) =>
      () =>
        new Promise<T>((resolve) => {
          pending.push(() => resolve(value));
        });
    const releaseAll = async () => {
      while (pending.length) {
        pending.shift()!();
        await flush();
      }
    };
    const documentRef = new TestDocument();
    const service = {
      loadAlbums: vi.fn(hold([])),
      loadAssetThumbnailUrl: vi.fn(async () => null),
      loadFavoriteAssets: vi.fn(hold(emptyPage)),
      loadMemories: vi.fn(hold([])),
      loadMemoriesTotal: vi.fn(async () => 0),
      loadPeoplePage: vi.fn(hold({ hasMore: false, page: 1, people: [], total: 0 })),
      loadPersonThumbnailUrl: vi.fn(async () => null),
      loadRecentlyAddedAssets: vi.fn(hold(emptyPage)),
      loadVideoAssets: vi.fn(hold(emptyPage)),
      revokeThumbnailUrl: vi.fn()
    };
    const controller = mountHomeScreen({
      documentRef: documentRef as unknown as Document,
      history: { loadAssets: vi.fn(hold(emptyPage)) },
      onBrowseAlbums: vi.fn(),
      onBrowseMemories: vi.fn(),
      onBrowsePeople: vi.fn(),
      onOpenAlbum: vi.fn(),
      onOpenAssetCollection: vi.fn(),
      onOpenMemory: vi.fn(),
      onOpenPerson: vi.fn(),
      onReturnToShell: vi.fn(),
      service: service as unknown as AlbumService
    });
    let loaded = false;

    controller.show();
    void controller.whenLoaded().then(() => {
      loaded = true;
    });
    await flush();

    // A reload starts while the first load is still running: its first two
    // rails (Recently Added, Favourites) are still waiting.
    expect(pending).toHaveLength(2);
    controller.refresh();
    await flush();
    expect(service.loadRecentlyAddedAssets).toHaveBeenCalledTimes(2);
    expect(pending).toHaveLength(4);

    // Finishing the first load's requests isn't enough: the newer load is
    // still running, so Home isn't ready yet.
    pending.shift()!();
    pending.shift()!();
    await flush();
    expect(loaded).toBe(false);

    await releaseAll();
    expect(service.loadMemories).toHaveBeenCalled();
    expect(loaded).toBe(true);
    controller.destroy();
  });

  it("ranks thumbnails by the focused rail, then distance, then nearness to the focused tile", () => {
    const state = {
      activeRail: "recently-added",
      albums: createRailState(),
      favorites: createRailState(),
      memories: createRailState(),
      people: createRailState(),
      recentlyAdded: createRailState(),
      recentlyViewed: createRailState(),
      videos: createRailState()
    } as unknown as HomeScreenState;
    const order = (entries: Array<[HomeRailId, number]>) =>
      entries
        .slice()
        .sort(
          (left, right) =>
            homeThumbnailPriority(state, left[0], left[1]) -
            homeThumbnailPriority(state, right[0], right[1])
        )
        .map(([rail, index]) => `${rail}:${index}`);

    expect(
      order([
        ["memories", 0],
        ["favorites", 0],
        ["recently-added", 5],
        ["recently-added", 0]
      ])
    ).toEqual(["recently-added:0", "recently-added:5", "favorites:0", "memories:0"]);

    // Focus on People: its tiles first, nearest the focused tile first, then
    // the rail above (Videos) before the rail below (Recently Viewed).
    state.activeRail = "people";
    state.people.focusedIndex = 4;
    expect(
      order([
        ["recently-viewed", 0],
        ["videos", 0],
        ["people", 0],
        ["people", 5]
      ])
    ).toEqual(["people:5", "people:0", "videos:0", "recently-viewed:0"]);
  });
});
