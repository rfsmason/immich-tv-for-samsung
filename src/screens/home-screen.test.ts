import { describe, expect, it, vi } from "vitest";
import { homeRailOrder } from "../domain/home";
import type { AlbumService } from "../app/album-service";
import type { AlbumAsset, AlbumAssetPage } from "../domain/album";
import type { Memory, PeoplePage, Person } from "../domain/home";
import { mountHomeScreen } from "./home-screen";
import { homeThumbnailRequestLimit } from "./home/home-model";

import { TestDocument } from "../test/document";

const asset: AlbumAsset = {
  id: "photo",
  name: "photo.jpg",
  type: "image",
  capturedAt: null,
  durationMs: null,
  livePhotoVideoId: null,
  location: null
};

function press(documentRef: TestDocument, keyCode: number): Event {
  const event = new Event("keydown", { cancelable: true });
  Object.defineProperty(event, "keyCode", { value: keyCode });
  documentRef.dispatchEvent(event);
  return event;
}

async function fixture(
  options: {
    memories?: Memory[];
    // Today's Memory count; more than the rail shows means View all.
    memoriesTotal?: number;
    onlyMemories?: boolean;
    people?: PeoplePage;
    videos?: AlbumAssetPage;
    thumbnail?: (asset: AlbumAsset) => Promise<string | null>;
  } = {}
) {
  const documentRef = new TestDocument();
  const page = {
    assets: options.onlyMemories ? [] : [asset, { ...asset, id: "photo-2" }],
    nextPageToken: null,
    total: 2
  };
  const service = {
    loadRecentlyAddedAssets: vi.fn().mockResolvedValue(page),
    loadFavoriteAssets: vi.fn().mockResolvedValue(page),
    loadVideoAssets: vi
      .fn()
      .mockResolvedValue(options.videos || { assets: [], nextPageToken: null, total: null }),
    loadPeoplePage: vi
      .fn()
      .mockResolvedValue(options.people || { hasMore: false, page: 1, people: [], total: 0 }),
    loadPersonThumbnailUrl: vi.fn().mockResolvedValue(null),
    loadAlbums: vi
      .fn()
      .mockResolvedValue(
        options.onlyMemories
          ? []
          : [{ id: "album", name: "Album", assetCount: 1, thumbnailAssetId: null }]
      ),
    loadMemoriesTotal: vi.fn().mockResolvedValue(options.memoriesTotal ?? 5),
    loadMemories: vi.fn().mockResolvedValue(
      options.memories || [
        {
          id: "memory",
          kind: "on-this-day" as const,
          memoryAt: "2020-10-15T00:00:00.000Z",
          personName: null,
          year: 2020,
          assets: [asset],
          assetCount: 1
        }
      ]
    ),
    loadAssetThumbnailUrl: vi.fn(options.thumbnail || (async () => null)),
    revokeThumbnailUrl: vi.fn()
  };
  const onOpenAssetCollection = vi.fn();
  const onOpenAlbum = vi.fn();
  const onOpenMemory = vi.fn();
  const onBrowseMemories = vi.fn();
  const onBrowsePeople = vi.fn();
  const history = { loadAssets: vi.fn().mockResolvedValue(page) };
  const controller = mountHomeScreen({
    documentRef: documentRef as unknown as Document,
    service: service as unknown as AlbumService,
    history,
    onOpenAssetCollection,
    onOpenAlbum,
    onOpenMemory,
    loadEnabledRails: () => homeRailOrder.slice(),
    onBrowseAlbums: vi.fn(),
    onBrowseMemories,
    onBrowsePeople,
    onOpenPerson: vi.fn(),
    onOpenSettings: vi.fn(),
    onReturnToShell: vi.fn()
  });
  controller.show();
  const memoryCount = options.memories?.length ?? 1;
  const showsViewAll = (options.memoriesTotal ?? 5) > memoryCount;
  await vi.waitFor(() =>
    expect(documentRef.getElementById("home-memories-rail").children).toHaveLength(
      memoryCount + (showsViewAll ? 1 : 0)
    )
  );
  return {
    documentRef,
    controller,
    onOpenAssetCollection,
    onOpenAlbum,
    onOpenMemory,
    onBrowseMemories,
    onBrowsePeople,
    history,
    service
  };
}

describe("Home remote activation", () => {
  it("refreshes viewing history on return and retains asset focus after its order changes", async () => {
    const { documentRef, controller, history } = await fixture();
    const rail = documentRef.getElementById("home-recently-viewed-rail");
    rail.children[0]!.focus();
    press(documentRef, 13);
    controller.hide();
    history.loadAssets.mockResolvedValue({
      assets: [{ ...asset, id: "photo-2" }, asset],
      nextPageToken: null,
      total: 2
    });

    controller.show();
    controller.focusContent("photo-2");

    await vi.waitFor(() =>
      expect(documentRef.activeElement?.getAttribute("data-home-index")).toBe("0")
    );
    expect(documentRef.activeElement?.getAttribute("data-home-rail")).toBe("recently-viewed");
    expect(history.loadAssets).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it("opens the end-of-rail View all tile and restores it on return", async () => {
    const { documentRef, controller, onBrowseMemories } = await fixture();
    const rail = documentRef.getElementById("home-memories-rail");
    rail.children[0]!.focus();
    press(documentRef, 13);
    controller.hide();
    controller.show();
    controller.focusContent();
    press(documentRef, 39);
    expect(documentRef.activeElement?.getAttribute("aria-label")).toBe("See more Memories");
    press(documentRef, 13);
    expect(onBrowseMemories).toHaveBeenCalledTimes(1);
    controller.hide();
    controller.show();
    controller.focusContent();
    expect(documentRef.activeElement?.getAttribute("aria-label")).toBe("See more Memories");
    controller.destroy();
  });

  it.each([
    ["Immich reports more people", true, 2, true],
    ["Immich reports no more people", false, 2, false],
    ["the rail is empty", true, 0, false]
  ])("offers People See more only when %s", async (_name, hasMore, count, offered) => {
    const people: Person[] = Array.from({ length: count }, (_, index) => ({
      id: `person-${index}`,
      isFavorite: false,
      name: `Person ${index}`
    }));
    const { documentRef, controller, service } = await fixture({
      people: { hasMore, page: 1, people, total: count + (hasMore ? 30 : 0) }
    });
    const rail = documentRef.getElementById("home-people-rail");

    await vi.waitFor(() => expect(rail.children).toHaveLength(count + (offered ? 1 : 0)));
    expect(service.loadPeoplePage).toHaveBeenCalledWith(1, 18);
    const last = rail.children[rail.children.length - 1];
    expect(last?.getAttribute("aria-label") === "See more People").toBe(offered);
    controller.destroy();
  });

  describe("Videos rail", () => {
    const video = (index: number): AlbumAsset => ({
      ...asset,
      durationMs: 64000,
      id: `video-${index}`,
      name: `video-${index}.mp4`,
      type: "video"
    });
    const videos = (count: number, more: boolean): AlbumAssetPage => ({
      assets: Array.from({ length: count }, (_, index) => video(index)),
      nextPageToken: more ? { cursor: "next", kind: "cursor" } : null,
      total: null
    });

    it("sits after Favourites, is bounded to the rail size and offers See more only when more exist", async () => {
      const f = await fixture({ videos: videos(25, true) });
      const rail = f.documentRef.getElementById("home-videos-rail");

      expect(f.service.loadVideoAssets).toHaveBeenCalledWith(18);
      await vi.waitFor(() => expect(rail.children).toHaveLength(19));
      expect(rail.children[18]?.getAttribute("aria-label")).toBe("See more Videos");
      expect(rail.children[0]?.querySelector(".asset-video-duration")?.textContent).toBe("1:04");
      f.controller.destroy();
    });

    it("has no See more when every video is on the rail, and explains an empty rail", async () => {
      const full = await fixture({ videos: videos(3, false) });
      await vi.waitFor(() =>
        expect(full.documentRef.getElementById("home-videos-rail").children).toHaveLength(3)
      );
      full.controller.destroy();

      const empty = await fixture({ videos: videos(0, false) });
      await vi.waitFor(() =>
        expect(empty.documentRef.getElementById("home-videos-status").textContent).toBe(
          "No videos yet."
        )
      );
      empty.controller.destroy();
    });

    it("keeps its thumbnails within the shared queue cap and the rail size", async () => {
      const pending: Array<() => void> = [];
      const f = await fixture({
        thumbnail: (item) =>
          item.id.startsWith("video-")
            ? new Promise((resolve) => pending.push(() => resolve(null)))
            : Promise.resolve(null),
        videos: videos(18, true)
      });
      const videoRequests = () =>
        f.service.loadAssetThumbnailUrl.mock.calls.filter(([item]) => item.id.startsWith("video-"))
          .length;

      // Every Home rail shares one queue, capped at homeThumbnailRequestLimit.
      await vi.waitFor(() => expect(videoRequests()).toBe(homeThumbnailRequestLimit));
      while (pending.length) {
        pending.shift()!();
        await Promise.resolve();
        await Promise.resolve();
      }
      await vi.waitFor(() => expect(videoRequests()).toBe(18));
      f.controller.destroy();
    });

    it("opens a video in its library view from the rail and from See more", async () => {
      const f = await fixture({ videos: videos(2, true) });
      const rail = f.documentRef.getElementById("home-videos-rail");
      await vi.waitFor(() => expect(rail.children).toHaveLength(3));

      rail.children[1]!.focus();
      press(f.documentRef, 13);
      expect(f.onOpenAssetCollection).toHaveBeenLastCalledWith(
        expect.objectContaining({ entry: "item", index: 1, rail: "videos" })
      );

      rail.children[2]!.focus();
      press(f.documentRef, 13);
      expect(f.onOpenAssetCollection).toHaveBeenLastCalledWith(
        expect.objectContaining({ entry: "see-more", index: 0, rail: "videos" })
      );
      f.controller.destroy();
    });
  });

  it("opens the People browser from See more and restores the See more tile", async () => {
    const people = [{ id: "person-0", isFavorite: false, name: "Rory" }];
    const { documentRef, controller, onBrowsePeople } = await fixture({
      people: { hasMore: true, page: 1, people, total: 40 }
    });
    const rail = documentRef.getElementById("home-people-rail");

    await vi.waitFor(() => expect(rail.children).toHaveLength(2));
    rail.children[1]!.focus();
    press(documentRef, 13);
    expect(onBrowsePeople).toHaveBeenCalledTimes(1);

    controller.hide();
    controller.show();
    controller.focusContent();
    expect(documentRef.activeElement?.getAttribute("aria-label")).toBe("See more People");
    controller.destroy();
  });

  it("starts on the first Memory rather than the end tile when Memories is the only populated rail", async () => {
    const { documentRef, controller } = await fixture({ onlyMemories: true });
    controller.focusContent();
    expect(documentRef.activeElement?.getAttribute("data-home-rail")).toBe("memories");
    expect(documentRef.activeElement?.getAttribute("data-home-index")).toBe("0");
    controller.destroy();
  });

  it.each([
    ["there are no Memories today", [], 0],
    ["the rail already shows every Memory", undefined, 1]
  ] as const)("hides View all when %s", async (_case, memories, memoriesTotal) => {
    const { documentRef, controller } = await fixture({
      memories: memories ? [...memories] : undefined,
      memoriesTotal
    });
    const tiles = documentRef.getElementById("home-memories-rail").children;

    expect(tiles.some((tile) => tile.getAttribute("aria-label") === "See more Memories")).toBe(
      false
    );
    expect(tiles).toHaveLength(memories ? 0 : 1);
    controller.destroy();
  });

  it("offers View all only when the rail is full if the Memory count is unavailable", async () => {
    const { documentRef, controller, service } = await fixture();
    service.loadMemoriesTotal.mockRejectedValue(new Error("missing statistics permission"));
    controller.refresh();
    await vi.waitFor(() =>
      expect(documentRef.getElementById("home-memories-rail").children).toHaveLength(1)
    );
    controller.destroy();
  });

  it("shows an empty history instead of substituting library assets", async () => {
    const { documentRef, controller, history, service } = await fixture();
    history.loadAssets.mockResolvedValue({ assets: [], nextPageToken: null, total: 0 });
    controller.hide();
    controller.show();
    await vi.waitFor(() =>
      expect(documentRef.getElementById("home-recently-viewed-rail").children).toHaveLength(0)
    );
    expect(documentRef.getElementById("home-recently-viewed-status").textContent).toBe(
      "No recently viewed items yet."
    );
    expect(service.loadRecentlyAddedAssets).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it("requests the shared grid summary when a memory is selected", async () => {
    const { documentRef, controller, onOpenMemory } = await fixture();
    documentRef.getElementById("home-memories-rail").children[0]!.focus();

    press(documentRef, 13);

    expect(onOpenMemory).toHaveBeenCalledWith(
      expect.objectContaining({ id: "memory", year: 2020 })
    );
    controller.destroy();
  });

  it.each(["recently-added", "recently-viewed", "favorites"])(
    "restores the last viewed asset in %s rather than the asset originally opened",
    async (rail) => {
      const { documentRef, controller } = await fixture();
      const railElement = documentRef.getElementById(`home-${rail}-rail`);
      railElement.children[0]!.focus();
      press(documentRef, 13);
      controller.hide();

      controller.show();
      controller.focusContent("photo-2");

      expect(documentRef.activeElement).toBe(railElement.children[1]);
      expect(documentRef.activeElement?.getAttribute("data-home-rail")).toBe(rail);
      controller.destroy();
    }
  );

  it("keeps the originating tile if the last viewed asset is no longer in the rail", async () => {
    const { documentRef, controller } = await fixture();
    const rail = documentRef.getElementById("home-favorites-rail");
    rail.children[1]!.focus();
    press(documentRef, 13);
    controller.hide();

    controller.show();
    controller.focusContent("missing-asset");

    expect(documentRef.activeElement).toBe(rail.children[1]);
    controller.destroy();
  });

  it("returns to the memory tile even when its last viewed asset also appears in other rails", async () => {
    const { documentRef, controller } = await fixture();
    const rail = documentRef.getElementById("home-memories-rail");
    rail.children[0]!.focus();
    press(documentRef, 13);
    controller.hide();

    controller.show();
    controller.focusContent("photo-2");

    expect(documentRef.activeElement).toBe(rail.children[0]);
    controller.destroy();
  });

  it.each(["recently-added", "recently-viewed", "favorites", "memories", "albums"])(
    "restores the originating %s tile when returning from a child screen",
    async (rail) => {
      const {
        documentRef,
        controller,
        onOpenAssetCollection,
        onOpenAlbum,
        onOpenMemory,
        onBrowseMemories
      } = await fixture();
      const railElement = documentRef.getElementById(`home-${rail}-rail`);
      const index = railElement.children.length - 1;
      railElement.children[index]!.focus();
      press(documentRef, 13);
      expect(
        onOpenAssetCollection.mock.calls.length +
          onOpenAlbum.mock.calls.length +
          onOpenMemory.mock.calls.length +
          onBrowseMemories.mock.calls.length
      ).toBe(1);
      controller.hide();
      documentRef.getElementById("shell-home").focus();

      controller.show();
      controller.focusContent();

      expect(documentRef.activeElement).toBe(railElement.children[index]);
      expect(documentRef.activeElement?.getAttribute("data-home-rail")).toBe(rail);
      expect(documentRef.activeElement?.getAttribute("data-home-index")).toBe(String(index));
      controller.destroy();
    }
  );

  it.each(["recently-added", "recently-viewed", "favorites", "memories"])(
    "consumes the OK that opens %s before the new viewer can start a slideshow",
    async (rail) => {
      const { documentRef, controller, onOpenAssetCollection, onOpenMemory } = await fixture();
      const childKeydown = vi.fn();
      documentRef.addEventListener("keydown", childKeydown);
      documentRef.getElementById(`home-${rail}-rail`).children[0]!.focus();

      const event = press(documentRef, 13);

      expect(onOpenAssetCollection.mock.calls.length + onOpenMemory.mock.calls.length).toBe(1);
      expect(event.defaultPrevented).toBe(true);
      expect(childKeydown).not.toHaveBeenCalled();
      // A subsequent intentional press still reaches the now-visible child.
      controller.hide();
      press(documentRef, 13);
      expect(childKeydown).toHaveBeenCalledTimes(1);
      controller.destroy();
    }
  );

  it("does not let the album-opening OK activate the newly focused Back button", async () => {
    const { documentRef, controller, onOpenAlbum } = await fixture();
    const childKeydown = vi.fn();
    onOpenAlbum.mockImplementation(() => documentRef.getElementById("album-back").focus());
    documentRef.addEventListener("keydown", childKeydown);
    documentRef.getElementById("home-albums-rail").children[0]!.focus();

    press(documentRef, 13);

    expect(onOpenAlbum).toHaveBeenCalledTimes(1);
    expect(documentRef.activeElement).toBe(documentRef.getElementById("album-back"));
    expect(childKeydown).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("passes unrelated keys through to other document listeners", async () => {
    const { documentRef, controller } = await fixture();
    const otherKeydown = vi.fn();
    documentRef.addEventListener("keydown", otherKeydown);

    press(documentRef, 65);

    expect(otherKeydown).toHaveBeenCalledTimes(1);
    controller.destroy();
  });
});

describe("Home memory cover association", () => {
  const cover = (id: string): AlbumAsset => ({ ...asset, id, name: id });
  const memory = (id: string, coverId?: string): Memory => ({
    id,
    kind: "on-this-day" as const,
    memoryAt: "2020-10-15T00:00:00.000Z",
    personName: null,
    year: 2020,
    assets: coverId ? [cover(coverId)] : [],
    assetCount: coverId ? 1 : 0
  });

  it.each([
    [memory("empty"), memory("second", "cover-b")],
    [
      memory("empty"),
      memory("second", "cover-b"),
      memory("empty-middle"),
      memory("fourth", "cover-c"),
      memory("empty-last")
    ],
    [
      memory("empty"),
      memory("second", "shared-cover"),
      memory("empty-middle"),
      memory("fourth", "shared-cover")
    ]
  ])(
    "preserves empty memory tiles and applies each cover only to its own memories: %j",
    async (...memories) => {
      const { documentRef, controller, service, onOpenMemory } = await fixture({
        memories,
        thumbnail: async (asset) =>
          asset.id === "photo" || asset.id === "photo-2" ? null : `blob:${asset.id}`
      });
      const rail = documentRef.getElementById("home-memories-rail");
      await vi.waitFor(() => {
        memories.forEach((memory, index) => {
          const tile = rail.children[index]!;
          const firstAsset = memory.assets[0];
          expect(tile.querySelector(".album-cover")?.src ?? null).toBe(
            firstAsset ? `blob:${firstAsset.id}` : null
          );
          if (!firstAsset) expect(tile.querySelector(".album-cover-placeholder")).not.toBeNull();
        });
      });
      const uniqueIds = new Set(
        memories.map((memory) => memory.assets[0]?.id).filter((id): id is string => Boolean(id))
      );
      uniqueIds.forEach((id) =>
        expect(
          service.loadAssetThumbnailUrl.mock.calls.filter(([asset]) => asset.id === id)
        ).toHaveLength(1)
      );
      // Empty memories remain actionable summaries, and return restores their tile.
      rail.children[0]!.focus();
      press(documentRef, 13);
      expect(onOpenMemory).toHaveBeenCalledWith(
        expect.objectContaining({ id: "empty", assets: [] })
      );
      controller.hide();
      controller.show();
      controller.focusContent();
      expect(documentRef.activeElement).toBe(rail.children[0]);
      controller.destroy();
      uniqueIds.forEach((id) =>
        expect(service.revokeThumbnailUrl).toHaveBeenCalledWith(`blob:${id}`)
      );
    }
  );

  it.each(["hide", "destroy", "refresh"] as const)(
    "revokes loaded memory covers on %s",
    async (action) => {
      const { documentRef, controller, service } = await fixture({
        memories: [memory("empty"), memory("second", "cover")],
        thumbnail: async (asset) => (asset.id === "cover" ? "blob:cover" : null)
      });
      await vi.waitFor(() =>
        expect(
          documentRef
            .getElementById("home-memories-rail")
            .children[1]?.querySelector(".album-cover")?.src
        ).toBe("blob:cover")
      );
      controller[action]();
      expect(service.revokeThumbnailUrl).toHaveBeenCalledWith("blob:cover");
      if (action !== "destroy") controller.destroy();
    }
  );

  it("revokes stale covers after refresh without replacing the new generation's thumbnail", async () => {
    const requests: ((url: string) => void)[] = [];
    const { documentRef, controller, service } = await fixture({
      memories: [memory("empty"), memory("second", "cover")],
      thumbnail: (asset) =>
        asset.id === "cover"
          ? new Promise((resolve) => {
              requests.push(resolve);
            })
          : Promise.resolve(null)
    });
    expect(requests).toHaveLength(1);
    controller.refresh();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1]!("blob:new");
    const rail = documentRef.getElementById("home-memories-rail");
    await vi.waitFor(() =>
      expect(rail.children[1]?.querySelector(".album-cover")?.src).toBe("blob:new")
    );
    requests[0]!("blob:old");
    await vi.waitFor(() => expect(service.revokeThumbnailUrl).toHaveBeenCalledWith("blob:old"));
    expect(rail.children[0]?.querySelector(".album-cover")).toBeNull();
    expect(rail.children[1]?.querySelector(".album-cover")?.src).toBe("blob:new");
    controller.destroy();
    expect(service.revokeThumbnailUrl).toHaveBeenCalledWith("blob:new");
  });
});
