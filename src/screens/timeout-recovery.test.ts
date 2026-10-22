// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultRequestTimeouts } from "../api/immich/http";
import { createAlbumService } from "../app/album-service";
import { defaultAppSettings } from "../domain/app-settings";
import { silentLogger } from "../logging/logger";
import { remoteKeys } from "../platform/tizen/keys";
import { byId, loadAppMarkup, pressKey } from "../test/app-markup";
import { mountAlbumDetailScreen } from "./album-detail-screen";
import { mountAlbumsScreen } from "./albums-screen";
import { mountHomeScreen } from "./home-screen";
import { mountMemoriesScreen } from "./memories-screen";
import { mountPeopleScreen } from "./people-screen";
import { mountPeoplePicker } from "./search/people-picker-screen";

// A stalled Immich server: fetch never settles. Every screen that shows a
// loading state must reach a readable, remote-operable error with Retry and a
// working Back once the bounded request timeout expires.
const stalledFetch = vi.fn(() => new Promise<Response>(() => undefined));
const destroyers: Array<() => void> = [];

function createStalledService() {
  return createAlbumService({
    fetchImpl: stalledFetch,
    logger: silentLogger,
    store: {
      load: () => ({ apiKey: "test-key", serverUrl: "https://immich.example" }),
      save() {}
    }
  });
}

async function expireRequests(): Promise<void> {
  await vi.advanceTimersByTimeAsync(defaultRequestTimeouts.jsonMs);
}

const timeoutMessage = "Immich is taking too long to respond.";

beforeEach(() => {
  vi.useFakeTimers();
  loadAppMarkup();
  stalledFetch.mockClear();
});

afterEach(() => {
  destroyers.splice(0).forEach((destroy) => destroy());
  vi.useRealTimers();
});

describe("stalled Immich server", () => {
  it("Albums reaches a retryable error and leaves focus with the rail", async () => {
    const onReturnToShell = vi.fn();
    const screen = mountAlbumsScreen({
      onOpenAlbum: vi.fn(),
      onReturnToShell,
      service: createStalledService()
    });
    destroyers.push(screen.destroy);

    screen.show();
    expect(byId("albums-status").getAttribute("data-state")).toBe("pending");
    await expireRequests();

    expect(byId("albums-status").getAttribute("data-state")).toBe("error");
    expect(byId("albums-status").textContent).toContain(timeoutMessage);

    // Nothing to focus: focus stays with the rail, whose Refresh retries.
    screen.focusContent();
    expect(onReturnToShell).toHaveBeenCalledTimes(1);
    screen.refresh();
    expect(stalledFetch).toHaveBeenCalledTimes(2);
    expect(byId("albums-status").getAttribute("data-state")).toBe("pending");
  });

  it("an album reaches Retry and Back after its detail request times out", async () => {
    const onBack = vi.fn();
    const service = createStalledService();
    const screen = mountAlbumDetailScreen({
      loadFeedPage: (feed, page) =>
        service.loadPersonAssetsPage(feed.kind === "person" ? feed.personId : "", page),
      onBack,
      service,
      settingsStore: { load: () => defaultAppSettings, save: (settings) => settings }
    });
    destroyers.push(screen.destroy);

    screen.show({ assetCount: 3, id: "album", name: "Holiday", thumbnailAssetId: null }, "albums");
    await expireRequests();

    const retry = byId("collection-retry");
    expect(byId("album-detail-summary").getAttribute("data-state")).toBe("error");
    expect(byId("album-detail-summary").textContent).toContain(timeoutMessage);
    expect(retry.hidden).toBe(false);
    expect(document.activeElement).toBe(retry);

    pressKey(remoteKeys.enter);
    expect(stalledFetch).toHaveBeenCalledTimes(2);
    expect(retry.hidden).toBe(true);
    expect(byId("album-detail-summary").getAttribute("data-state")).toBe("pending");

    pressKey(remoteKeys.back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("a person collection reaches Retry and Back after its request times out", async () => {
    const onBack = vi.fn();
    const service = createStalledService();
    const screen = mountAlbumDetailScreen({
      loadFeedPage: (feed, page) =>
        service.loadPersonAssetsPage(feed.kind === "person" ? feed.personId : "", page),
      onBack,
      service,
      settingsStore: { load: () => defaultAppSettings, save: (settings) => settings }
    });
    destroyers.push(screen.destroy);

    screen.showPerson({ id: "person", isFavorite: false, name: "Alex" }, "home");
    await expireRequests();

    expect(document.activeElement).toBe(byId("collection-retry"));
    expect(byId("album-detail-summary").textContent).toContain(timeoutMessage);
    pressKey(remoteKeys.enter);
    expect(stalledFetch).toHaveBeenCalledTimes(2);
    pressKey(remoteKeys.back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("Photos reaches an error, hands focus to the rail, and the rail's Refresh retries", async () => {
    const onReturnToShell = vi.fn();
    const screen = mountAlbumDetailScreen({
      loadFeedPage: vi.fn(),
      onBack: vi.fn(),
      onReturnToShell,
      service: createStalledService(),
      settingsStore: { load: () => defaultAppSettings, save: (settings) => settings }
    });
    destroyers.push(screen.destroy);

    screen.showPhotos();
    await expireRequests();

    expect(byId("album-detail-summary").getAttribute("data-state")).toBe("error");
    expect(document.getElementById("album-detail-back")).toBeNull();
    screen.refreshPhotos();
    expect(stalledFetch).toHaveBeenCalledTimes(2);
  });

  it("the Memories browser reaches Retry and Back after its request times out", async () => {
    const onBack = vi.fn();
    const screen = mountMemoriesScreen({
      onBack,
      onOpenMemory: vi.fn(),
      service: createStalledService()
    });
    destroyers.push(screen.destroy);

    screen.show();
    await expireRequests();

    const retry = byId("memories-retry");
    expect(byId("memories-status").getAttribute("data-state")).toBe("error");
    expect(byId("memories-status").textContent).toContain(timeoutMessage);
    expect(retry.hidden).toBe(false);
    expect(document.activeElement).toBe(retry);

    pressKey(remoteKeys.enter);
    expect(stalledFetch).toHaveBeenCalledTimes(2);
    pressKey(remoteKeys.back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("the People browser reaches Retry and Back after its request times out", async () => {
    const onBack = vi.fn();
    const screen = mountPeopleScreen({
      onBack,
      onOpenPerson: vi.fn(),
      service: createStalledService()
    });
    destroyers.push(screen.destroy);

    screen.show();
    await expireRequests();

    const retry = byId("people-retry");
    expect(byId("people-status").getAttribute("data-state")).toBe("error");
    expect(byId("people-status").textContent).toContain(timeoutMessage);
    expect(retry.hidden).toBe(false);
    expect(document.activeElement).toBe(retry);

    pressKey(remoteKeys.enter);
    expect(stalledFetch).toHaveBeenCalledTimes(2);
    pressKey(remoteKeys.back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("the Search people picker reaches Retry, Done and Back after its request times out", async () => {
    const onDone = vi.fn();
    const screen = mountPeoplePicker({ onDone, service: createStalledService() });
    destroyers.push(screen.destroy);

    screen.open([{ id: "person-1", name: "Alex" }]);
    await expireRequests();

    const retry = byId("search-people-retry");
    expect(byId("search-people-status").textContent).toContain(timeoutMessage);
    expect(document.activeElement).toBe(retry);

    pressKey(remoteKeys.enter);
    expect(stalledFetch).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(byId("search-people-status"));
    pressKey(remoteKeys.up);
    expect(document.activeElement).toBe(byId("search-people-done"));
    pressKey(remoteKeys.back);
    expect(onDone).toHaveBeenCalledWith([{ id: "person-1", name: "Alex" }]);
  });

  it("Home rails each reach an error, and a refresh retries them all", async () => {
    const onReturnToShell = vi.fn();
    const screen = mountHomeScreen({
      history: { loadAssets: vi.fn(() => new Promise<never>(() => undefined)) },
      onBrowseAlbums: vi.fn(),
      onBrowseMemories: vi.fn(),
      onBrowsePeople: vi.fn(),
      onOpenAlbum: vi.fn(),
      onOpenAssetCollection: vi.fn(),
      onOpenMemory: vi.fn(),
      onOpenPerson: vi.fn(),
      onReturnToShell,
      service: createStalledService()
    });
    destroyers.push(screen.destroy);

    screen.show();
    // Rails load two at a time in screen order, so stalled requests time out
    // in successive rounds rather than all at once.
    await vi.advanceTimersByTimeAsync(defaultRequestTimeouts.jsonMs * 8);

    for (const rail of ["recently-added", "favorites", "people", "albums", "memories"]) {
      expect(byId(`home-${rail}-status`).getAttribute("data-state")).toBe("error");
      expect(byId(`home-${rail}-status`).textContent).toContain(timeoutMessage);
    }

    const requestsBeforeRefresh = stalledFetch.mock.calls.length;
    // With every rail failed there is nothing to focus: focus stays with the
    // left rail, whose Refresh retries them all.
    screen.focusContent();
    expect(onReturnToShell).toHaveBeenCalledTimes(1);
    screen.refresh();
    expect(stalledFetch.mock.calls.length).toBeGreaterThan(requestsBeforeRefresh);
  });
});
