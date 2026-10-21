// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AlbumService } from "../app/album-service";
import type { Album } from "../domain/album";
import { AppError } from "../errors/app-error";
import { remoteKeys } from "../platform/tizen/keys";
import { byId, loadAppMarkup, pressKey } from "../test/app-markup";
import { mountAlbumsScreen, type AlbumsScreenController } from "./albums-screen";

function album(index: number, thumbnailAssetId: string | null = null): Album {
  return { assetCount: index + 1, id: `album-${index}`, name: `Album ${index}`, thumbnailAssetId };
}

let screen: AlbumsScreenController | null = null;

function mount(loadAlbums: AlbumService["loadAlbums"]) {
  const onOpenAlbum = vi.fn();
  const onReturnToShell = vi.fn();
  const service = {
    loadAlbums: vi.fn(loadAlbums),
    loadThumbnailUrl: vi.fn(async (item: Album) =>
      item.thumbnailAssetId ? `blob:${item.id}` : null
    ),
    revokeThumbnailUrl: vi.fn()
  };

  screen = mountAlbumsScreen({
    onOpenAlbum,
    onReturnToShell,
    service: service as unknown as AlbumService
  });

  return { onOpenAlbum, onReturnToShell, service };
}

const tiles = () => byId("albums-grid").querySelectorAll("[data-album-index]");
const focusedIndex = () => document.activeElement?.getAttribute("data-album-index") ?? null;

beforeEach(() => {
  loadAppMarkup();
});

afterEach(() => {
  screen?.destroy();
  screen = null;
});

describe("Albums screen", () => {
  it("loads albums once when first shown, then renders a five-column grid", async () => {
    const albums = Array.from({ length: 12 }, (_, index) => album(index));
    const { service } = mount(async () => albums);

    screen!.show();
    expect(byId("albums-status").textContent).toBe("Loading albums...");
    await vi.waitFor(() => expect(tiles()).toHaveLength(12));

    expect(byId("albums-status").getAttribute("data-state")).toBe("success");
    expect(tiles()[0]?.getAttribute("aria-label")).toBe("Album 0, 1 asset");
    screen!.hide();
    screen!.show();
    expect(service.loadAlbums).toHaveBeenCalledTimes(1);
  });

  it("navigates the grid by remote and hands off to the shell", async () => {
    const albums = Array.from({ length: 18 }, (_, index) => album(index));
    const { onReturnToShell } = mount(async () => albums);

    screen!.show();
    await vi.waitFor(() => expect(tiles()).toHaveLength(18));
    screen!.focusContent();
    expect(focusedIndex()).toBe("0");

    // Six albums to a row, like every grid.
    pressKey(remoteKeys.right);
    pressKey(remoteKeys.down);
    expect(focusedIndex()).toBe("7");
    pressKey(remoteKeys.down);
    expect(focusedIndex()).toBe("13");
    pressKey(remoteKeys.up);
    pressKey(remoteKeys.up);
    expect(focusedIndex()).toBe("1");

    // Up from the top row stays put; Refresh lives on the left rail.
    pressKey(remoteKeys.up);
    expect(focusedIndex()).toBe("1");

    pressKey(remoteKeys.left);
    pressKey(remoteKeys.left);
    expect(onReturnToShell).toHaveBeenCalledTimes(1);

    for (let step = 0; step < 5; step += 1) pressKey(remoteKeys.right);
    expect(focusedIndex()).toBe("5");
    pressKey(remoteKeys.right);
    expect(focusedIndex()).toBe("5");

    pressKey(remoteKeys.back);
    expect(onReturnToShell).toHaveBeenCalledTimes(2);
  });

  it("opens the focused album and restores that tile when shown again", async () => {
    const albums = Array.from({ length: 8 }, (_, index) => album(index));
    const { onOpenAlbum } = mount(async () => albums);

    screen!.show();
    await vi.waitFor(() => expect(tiles()).toHaveLength(8));
    screen!.focusContent();
    pressKey(remoteKeys.down);
    pressKey(remoteKeys.right);
    pressKey(remoteKeys.enter);

    expect(onOpenAlbum).toHaveBeenCalledWith(albums[7]);
    screen!.hide();
    screen!.show();
    screen!.focusContent();
    expect(focusedIndex()).toBe("7");
  });

  it("shows an empty library and leaves focus with the rail", async () => {
    const { onReturnToShell } = mount(async () => []);

    screen!.show();
    screen!.focusContent();
    await vi.waitFor(() =>
      expect(byId("albums-status").getAttribute("data-state")).not.toBe("pending")
    );

    expect(tiles()).toHaveLength(0);
    expect(byId("albums-status").textContent).toContain("No albums");
    screen!.focusContent();
    expect(onReturnToShell).toHaveBeenCalled();
  });

  it("reports an error, leaves focus with the rail, and recovers on refresh", async () => {
    let attempt = 0;
    const albums = [album(0), album(1)];
    const { onReturnToShell, service } = mount(async () => {
      attempt += 1;
      if (attempt === 1)
        throw new AppError("permission", "Refused.", { feature: "Albums", status: 403 });
      return albums;
    });

    screen!.show();
    await vi.waitFor(() => expect(byId("albums-status").getAttribute("data-state")).toBe("error"));
    expect(byId("albums-status").textContent).toContain("not allowed to show Albums");

    screen!.focusContent();
    expect(onReturnToShell).toHaveBeenCalled();
    screen!.refresh();
    await vi.waitFor(() => expect(tiles()).toHaveLength(2));
    expect(service.loadAlbums).toHaveBeenCalledTimes(2);
    screen!.focusContent();
    expect(focusedIndex()).toBe("0");
  });

  it("loads covers near focus and revokes them when hidden", async () => {
    const albums = [album(0, "cover-0"), album(1)];
    const { service } = mount(async () => albums);

    screen!.show();
    await vi.waitFor(() =>
      expect(byId("albums-grid").querySelector("img.album-cover")).not.toBeNull()
    );

    screen!.hide();
    expect(service.revokeThumbnailUrl).toHaveBeenCalledWith("blob:album-0");
  });

  it("ignores a late response after it is hidden", async () => {
    let resolve!: (albums: Album[]) => void;
    mount(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );

    screen!.show();
    screen!.hide();
    resolve([album(0)]);
    await Promise.resolve();
    await Promise.resolve();

    expect(tiles()).toHaveLength(0);
  });
});
