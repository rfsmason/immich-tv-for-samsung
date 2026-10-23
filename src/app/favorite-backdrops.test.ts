import { describe, expect, it, vi } from "vitest";
import type { AlbumAsset } from "../domain/album";
import { createFavoriteBackdrops } from "./favorite-backdrops";

const photo = (id: string): AlbumAsset => ({
  capturedAt: null,
  durationMs: null,
  id,
  livePhotoVideoId: null,
  location: null,
  name: id,
  type: "image"
});

describe("favourite backdrops", () => {
  it("fetches favourites once and returns a random one's thumbnail", async () => {
    const service = {
      loadAssetThumbnailUrl: vi.fn(async (asset: AlbumAsset) => `blob:${asset.id}`),
      loadFavoriteAssets: vi.fn(async () => ({
        assets: [photo("a"), photo("b")],
        nextPageToken: null,
        total: null
      }))
    };
    const backdrops = createFavoriteBackdrops(service);

    expect(["blob:a", "blob:b"]).toContain(await backdrops.loadUrl());
    await backdrops.loadUrl();
    expect(service.loadFavoriteAssets).toHaveBeenCalledTimes(1);
    expect(service.loadFavoriteAssets).toHaveBeenCalledWith(18);

    backdrops.reset();
    await backdrops.loadUrl();
    expect(service.loadFavoriteAssets).toHaveBeenCalledTimes(2);
  });

  it("gives no picture without favourites, and retries after a failure", async () => {
    const loadFavoriteAssets = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ assets: [], nextPageToken: null, total: null });
    const backdrops = createFavoriteBackdrops({
      loadAssetThumbnailUrl: vi.fn(),
      loadFavoriteAssets
    });

    await expect(backdrops.loadUrl()).resolves.toBeNull();
    await expect(backdrops.loadUrl()).resolves.toBeNull();
    expect(loadFavoriteAssets).toHaveBeenCalledTimes(2);
  });
});
