// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlbumService } from "../app/album-service";
import type { ConnectionService } from "../app/connection-service";
import { defaultAppSettings } from "../domain/app-settings";
import { homeRailOrder } from "../domain/home";
import { byId, loadAppMarkup } from "../test/app-markup";
import { mountConnectionScreen } from "./connection-screen";
import { mountHomeScreen } from "./home-screen";
import { mountSearchScreen } from "./search/search-screen";

// Home, Search and Settings show a random favourite behind them (the source
// the application passes in), new on each visit and released on leaving.

let destroy: (() => void) | null = null;

function source() {
  let count = 0;

  return {
    loadUrl: vi.fn(async () => `blob:favourite-${(count += 1)}`),
    revokeUrl: vi.fn()
  };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  loadAppMarkup();
  byId("app-shell").hidden = false;
});

afterEach(() => {
  destroy?.();
  destroy = null;
});

describe("general screen backdrops", () => {
  it("Home shows a new favourite each visit and releases it when hidden", async () => {
    const backdrop = source();
    const emptyPage = { assets: [], nextPageToken: null, total: 0 };
    const screen = mountHomeScreen({
      backdrop,
      history: { loadAssets: vi.fn(async () => emptyPage) },
      loadEnabledRails: () => homeRailOrder.slice(0, 0),
      onBrowseAlbums: vi.fn(),
      onBrowseMemories: vi.fn(),
      onBrowsePeople: vi.fn(),
      onOpenAlbum: vi.fn(),
      onOpenAssetCollection: vi.fn(),
      onOpenMemory: vi.fn(),
      onOpenPerson: vi.fn(),
      onOpenSettings: vi.fn(),
      onReturnToShell: vi.fn(),
      service: {} as AlbumService
    });
    destroy = screen.destroy;
    const image = byId<HTMLImageElement>("home-backdrop");

    screen.show();
    await settled();
    expect(image.getAttribute("src")).toBe("blob:favourite-1");
    expect(image.className).toBe("screen-backdrop is-loaded");

    screen.hide();
    expect(image.hasAttribute("src")).toBe(false);
    expect(backdrop.revokeUrl).toHaveBeenCalledWith("blob:favourite-1");

    screen.show();
    await settled();
    expect(image.getAttribute("src")).toBe("blob:favourite-2");
  });

  it("Search and Settings show a favourite while visible", async () => {
    const backdrop = source();
    const search = mountSearchScreen({
      backdrop,
      onAddPeople: vi.fn(),
      onReturnToShell: vi.fn(),
      onShowPhotos: vi.fn(),
      service: {
        loadPersonThumbnailUrl: vi.fn(),
        loadTimelineBuckets: vi.fn(async () => []),
        revokeThumbnailUrl: vi.fn()
      }
    });
    const settings = mountConnectionScreen({
      backdrop,
      service: { load: () => null } as unknown as ConnectionService,
      settingsStore: { load: () => defaultAppSettings, save: (value) => value }
    });
    destroy = () => {
      search.destroy();
      settings.destroy();
    };

    search.show();
    settings.show();
    await settled();
    expect(byId("search-backdrop").getAttribute("src")).toMatch(/^blob:favourite-/);
    expect(byId("settings-backdrop").getAttribute("src")).toMatch(/^blob:favourite-/);

    search.hide();
    settings.hide();
    expect(byId("search-backdrop").hasAttribute("src")).toBe(false);
    expect(byId("settings-backdrop").hasAttribute("src")).toBe(false);
    expect(backdrop.revokeUrl).toHaveBeenCalledTimes(2);
  });
});
