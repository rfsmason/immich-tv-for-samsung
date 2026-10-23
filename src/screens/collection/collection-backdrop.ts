import type { AlbumService } from "../../app/album-service";
import type { AlbumAsset } from "../../domain/album";

// The collection screen's decorative backdrop: a random photo from the loaded
// assets, shown faintly behind the grid. It never blocks browsing.

export type CollectionBackdrop = {
  // Shows a random loaded asset, unless the load is no longer wanted by the
  // time its thumbnail arrives.
  load(assets: AlbumAsset[], isWanted: () => boolean): void;
  revoke(): void;
};

export function createCollectionBackdrop(options: {
  image: HTMLImageElement;
  service: Pick<AlbumService, "loadAssetThumbnailUrl" | "revokeThumbnailUrl">;
}): CollectionBackdrop {
  const { image, service } = options;
  let url: string | null = null;

  function revoke(): void {
    image.removeAttribute("src");
    image.className = "screen-backdrop";

    if (url) {
      service.revokeThumbnailUrl(url);
      url = null;
    }
  }

  return {
    load(assets, isWanted) {
      const asset = chooseRandomBackdropAsset(assets);

      if (!asset) {
        return;
      }

      service
        .loadAssetThumbnailUrl(asset)
        .then((loadedUrl) => {
          if (!loadedUrl) {
            return;
          }

          if (!isWanted()) {
            service.revokeThumbnailUrl(loadedUrl);
            return;
          }

          revoke();
          url = loadedUrl;
          image.src = loadedUrl;
          image.className = "screen-backdrop is-loaded";
        })
        .catch(() => {
          // A decorative backdrop should never block album asset browsing.
        });
    },
    revoke
  };
}

function chooseRandomBackdropAsset(assets: AlbumAsset[]): AlbumAsset | null {
  const imageAssets = assets.filter((asset) => asset.type === "image");
  const candidates = imageAssets.length > 0 ? imageAssets : assets;

  if (candidates.length === 0) {
    return null;
  }

  return candidates[Math.floor(Math.random() * candidates.length)] || null;
}
