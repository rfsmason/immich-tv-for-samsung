import { describe, expect, it, vi } from "vitest";
import type { AlbumService } from "../../app/album-service";
import type { AlbumAsset } from "../../domain/album";
import { homeRailOrder, type HomeRailId } from "../../domain/home";
import { TestDocument } from "../../test/document";
import { mountHomeScreen } from "../home-screen";

const keys = { down: 40, enter: 13, left: 37, up: 38 };

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

function fixture(initialRails: HomeRailId[]) {
  const documentRef = new TestDocument();
  let enabledRails = initialRails;
  const page = { assets: [asset("one"), asset("two")], nextPageToken: null, total: 2 };
  const service = {
    loadAlbums: vi
      .fn()
      .mockResolvedValue([{ assetCount: 1, id: "album", name: "Album", thumbnailAssetId: null }]),
    loadAssetThumbnailUrl: vi.fn().mockResolvedValue(null),
    loadFavoriteAssets: vi.fn().mockResolvedValue(page),
    loadMemories: vi.fn().mockResolvedValue([]),
    loadMemoriesTotal: vi.fn().mockResolvedValue(0),
    loadPeoplePage: vi.fn().mockResolvedValue({ hasMore: false, page: 1, people: [], total: 0 }),
    loadPersonThumbnailUrl: vi.fn().mockResolvedValue(null),
    loadRecentlyAddedAssets: vi.fn().mockResolvedValue(page),
    loadVideoAssets: vi.fn().mockResolvedValue(page),
    revokeThumbnailUrl: vi.fn()
  };
  const history = { loadAssets: vi.fn().mockResolvedValue(page) };
  const onOpenSettings = vi.fn();
  const onReturnToShell = vi.fn();
  const controller = mountHomeScreen({
    documentRef: documentRef as unknown as Document,
    history,
    loadEnabledRails: () => enabledRails.slice(),
    onBrowseAlbums: vi.fn(),
    onBrowseMemories: vi.fn(),
    onBrowsePeople: vi.fn(),
    onOpenAlbum: vi.fn(),
    onOpenAssetCollection: vi.fn(),
    onOpenMemory: vi.fn(),
    onOpenPerson: vi.fn(),
    onOpenSettings,
    onReturnToShell,
    service: service as unknown as AlbumService
  });
  const press = (keyCode: number) => {
    const event = new Event("keydown", { cancelable: true });
    Object.defineProperty(event, "keyCode", { value: keyCode });
    documentRef.dispatchEvent(event);
  };
  const byId = (id: string) => documentRef.getElementById(id);
  // The rail whose tile has focus.
  const focusedRail = () => documentRef.activeElement?.getAttribute("data-home-rail") ?? null;

  return {
    byId,
    controller,
    focusedRail,
    history,
    onOpenSettings,
    onReturnToShell,
    press,
    service,
    setEnabledRails(rails: HomeRailId[]) {
      enabledRails = rails;
    }
  };
}

describe("Home rail visibility", () => {
  it("does not fetch, show or reach rails that are off", async () => {
    const f = fixture(["recently-added", "people", "albums"]);

    f.controller.show();
    await f.controller.whenLoaded();

    expect(f.service.loadFavoriteAssets).not.toHaveBeenCalled();
    expect(f.service.loadVideoAssets).not.toHaveBeenCalled();
    expect(f.service.loadMemories).not.toHaveBeenCalled();
    expect(f.history.loadAssets).not.toHaveBeenCalled();
    expect(f.service.loadAlbums).toHaveBeenCalled();
    expect(f.byId("home-favorites-rail").hidden).toBe(true);
    expect(f.byId("home-recently-viewed-rail").hidden).toBe(true);
    expect(f.byId("home-albums-rail").hidden).toBe(false);
    expect(f.byId("home-empty").hidden).toBe(true);

    // People is empty, so Down goes from Recently Added straight to Albums.
    f.controller.focusContent();
    expect(f.focusedRail()).toBe("recently-added");
    f.press(keys.down);
    expect(f.focusedRail()).toBe("albums");
    f.press(keys.up);
    expect(f.focusedRail()).toBe("recently-added");
  });

  it("keeps recording history but does not load it while Recently Viewed is off", async () => {
    const f = fixture(homeRailOrder.filter((railId) => railId !== "recently-viewed"));

    f.controller.show();
    await f.controller.whenLoaded();
    f.controller.hide();
    f.controller.show();

    expect(f.history.loadAssets).not.toHaveBeenCalled();
  });

  it("applies a change the next time Home is shown, keeping focus near the old rail", async () => {
    const f = fixture(homeRailOrder.slice());

    f.controller.show();
    await f.controller.whenLoaded();
    f.controller.focusContent();
    f.press(keys.down);
    expect(f.focusedRail()).toBe("favorites");

    f.controller.hide();
    f.setEnabledRails(homeRailOrder.filter((railId) => railId !== "favorites"));
    expect(f.service.loadRecentlyAddedAssets).toHaveBeenCalledTimes(1);
    f.controller.show();
    await f.controller.whenLoaded();

    expect(f.service.loadRecentlyAddedAssets).toHaveBeenCalledTimes(2);
    expect(f.byId("home-favorites-rail").hidden).toBe(true);
    f.controller.focusContent();
    // Favourites was between Recently Added and Videos; the rail above wins.
    expect(f.focusedRail()).toBe("recently-added");
  });

  it("offers Settings when every rail is off", async () => {
    const f = fixture([]);

    f.controller.show();
    await f.controller.whenLoaded();

    expect(f.byId("home-empty").hidden).toBe(false);
    homeRailOrder.forEach((railId) => {
      expect(f.byId(`home-${railId}-rail`).hidden).toBe(true);
    });
    expect(f.service.loadRecentlyAddedAssets).not.toHaveBeenCalled();
    expect(f.service.loadAlbums).not.toHaveBeenCalled();

    f.controller.focusContent();
    expect(f.byId("home-open-settings")).toBe(
      (f.byId("home-open-settings").ownerDocument as TestDocument).activeElement
    );
    f.press(keys.enter);
    expect(f.onOpenSettings).toHaveBeenCalledTimes(1);
    f.press(keys.left);
    expect(f.onReturnToShell).toHaveBeenCalledTimes(1);
  });
});
