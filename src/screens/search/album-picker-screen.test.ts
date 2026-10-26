// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Album } from "../../domain/album";
import { AppError } from "../../errors/app-error";
import { remoteKeys } from "../../platform/tizen/keys";
import { byId, loadAppMarkup, pressKey } from "../../test/app-markup";
import { mountAlbumPicker, type AlbumPickerController } from "./album-picker-screen";

const album = (index: number): Album => ({
  assetCount: index + 1,
  id: `album-${index}`,
  name: `Album ${index}`,
  thumbnailAssetId: `cover-${index}`
});
const choice = (index: number) => ({ id: `album-${index}`, name: `Album ${index}` });
let controller: AlbumPickerController | null = null;

function setup(albums: Album[] | Error = Array.from({ length: 80 }, (_, index) => album(index))) {
  const loadAlbums = vi.fn(async () => {
    if (albums instanceof Error) throw albums;
    return albums;
  });
  const service = {
    loadAlbums,
    loadThumbnailUrl: vi.fn(async (item: Album) => `blob:${item.id}`),
    revokeThumbnailUrl: vi.fn()
  };
  const onDone = vi.fn();

  controller = mountAlbumPicker({ onDone, service });

  const status = () => byId("search-albums-status");
  const settled = () =>
    vi.waitFor(() => expect(status().getAttribute("data-state")).not.toBe("pending"));
  const focusedId = () => document.activeElement?.getAttribute("data-album-id") ?? null;
  const tile = (id: string) =>
    byId("search-albums-grid").querySelector<HTMLElement>(`[data-album-id="${id}"]`);
  const press = async (keyCode: number, times = 1) => {
    for (let step = 0; step < times; step += 1) {
      pressKey(keyCode);
      await Promise.resolve();
    }
    await settled();
  };

  return { focusedId, loadAlbums, onDone, press, service, settled, status, tile };
}

beforeEach(() => {
  loadAppMarkup();
});

afterEach(() => {
  controller?.destroy();
  controller = null;
});

describe("Search album picker", () => {
  it("lists albums as tiles, marks those already chosen, and focuses the first", async () => {
    const f = setup();
    controller!.open([choice(1)]);
    await f.settled();

    expect(f.focusedId()).toBe("album-0");
    expect(f.tile("album-1")?.getAttribute("data-selected")).toBe("true");
    expect(f.tile("album-1")?.getAttribute("aria-pressed")).toBe("true");
    expect(f.tile("album-1")?.getAttribute("aria-label")).toBe("Album 1, 2 assets, selected");
    expect(f.tile("album-1")?.querySelector(".picker-check")?.textContent).toBe("✓");
    expect(f.tile("album-0")?.getAttribute("aria-pressed")).toBe("false");
    expect(byId("search-albums-done").textContent).toBe("Done (1 selected)");
    expect(byId("search-albums-screen").querySelector(".key-hints")?.textContent).toContain(
      "OK Select"
    );
  });

  it("toggles albums with OK, reaches Done with Up, and returns them in choice order", async () => {
    const f = setup();
    controller!.open([]);
    await f.settled();

    await f.press(remoteKeys.right, 2);
    await f.press(remoteKeys.enter);
    await f.press(remoteKeys.left, 2);
    await f.press(remoteKeys.enter);
    expect(f.focusedId()).toBe("album-0");
    expect(byId("search-albums-done").textContent).toBe("Done (2 selected)");

    await f.press(remoteKeys.up);
    expect(document.activeElement).toBe(byId("search-albums-done"));
    await f.press(remoteKeys.enter);
    expect(f.onDone).toHaveBeenCalledWith([choice(2), choice(0)]);
  });

  it("keeps the selection when leaving with Back, and explains an eleventh pick", async () => {
    const f = setup();
    controller!.open(Array.from({ length: 10 }, (_, index) => choice(index)));
    await f.settled();

    await f.press(remoteKeys.down, 2);
    await f.press(remoteKeys.enter);
    expect(byId("search-albums-message").hidden).toBe(false);
    expect(byId("search-albums-message").textContent).toBe(
      "You can choose up to 10 albums. Remove one to add Album 12."
    );
    expect(f.tile("album-12")?.hasAttribute("data-selected")).toBe(false);

    await f.press(remoteKeys.back);
    expect(f.onDone).toHaveBeenCalledWith(Array.from({ length: 10 }, (_, index) => choice(index)));
  });

  it("loads the album list once, pages through it, and keeps only tiles near focus", async () => {
    const f = setup();
    controller!.open([]);
    await f.settled();

    for (let row = 0; row < 12; row += 1) await f.press(remoteKeys.down);
    expect(f.focusedId()).toBe("album-72");
    expect(f.loadAlbums).toHaveBeenCalledTimes(1);
    // Four rows either side of focus, six tiles to a row.
    expect(byId("search-albums-grid").querySelectorAll(".album-tile").length).toBeLessThanOrEqual(
      9 * 6
    );
    expect(f.tile("album-0")).toBeNull();
  });

  it("loads covers through the shared queue and releases them on hide", async () => {
    const f = setup();
    controller!.open([]);
    await f.settled();
    await vi.waitFor(() =>
      expect(f.tile("album-0")?.querySelector(".album-cover")?.getAttribute("src")).toBe(
        "blob:album-0"
      )
    );

    controller!.hide();
    expect(f.service.revokeThumbnailUrl).toHaveBeenCalledWith("blob:album-0");
    expect(byId("search-albums-grid").children).toHaveLength(0);
  });

  it("explains an empty list", async () => {
    const f = setup([]);
    controller!.open([]);
    await f.settled();

    expect(f.status().textContent).toContain("No albums yet.");
    await f.press(remoteKeys.back);
    expect(f.onDone).toHaveBeenCalledWith([]);
  });

  it("names Albums when the key may not read them, and retries", async () => {
    const f = setup(new AppError("permission", "Refused.", { feature: "Albums" }));
    controller!.open([]);
    await f.settled();

    expect(f.status().textContent).toContain("not allowed to show Albums");
    expect(document.activeElement).toBe(byId("search-albums-retry"));
    await f.press(remoteKeys.enter);
    expect(f.loadAlbums).toHaveBeenCalledTimes(2);
  });

  it("chooses one album at once in single mode, and Back leaves the choice as it was", async () => {
    const f = setup();
    controller!.open([choice(3)], "single");
    await f.settled();

    expect(byId("search-albums-title").textContent).toBe("Choose an album");
    expect(byId("search-albums-done").hidden).toBe(true);
    expect(byId("search-albums-screen").querySelector(".key-hints")?.textContent).toContain(
      "OK Choose"
    );
    expect(f.tile("album-3")?.getAttribute("data-selected")).toBe("true");

    await f.press(remoteKeys.back);
    expect(f.onDone).toHaveBeenLastCalledWith([choice(3)]);

    controller!.open([choice(3)], "single");
    await f.settled();
    await f.press(remoteKeys.right);
    await f.press(remoteKeys.enter);
    expect(f.onDone).toHaveBeenLastCalledWith([choice(1)]);

    controller!.open([], "multi");
    expect(byId("search-albums-done").hidden).toBe(false);
    expect(byId("search-albums-title").textContent).toBe("Choose albums");
  });

  it("forgets the album list and the selection on reset", async () => {
    const f = setup();
    controller!.open([choice(0)]);
    await f.settled();

    controller!.reset();
    controller!.open([]);
    await f.settled();

    expect(f.loadAlbums).toHaveBeenCalledTimes(2);
    expect(byId("search-albums-done").textContent).toBe("Done");
  });
});
