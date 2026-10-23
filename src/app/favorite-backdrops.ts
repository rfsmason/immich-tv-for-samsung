import type { AlbumAsset } from "../domain/album";
import { chooseBackdropAsset } from "../screens/screen-backdrop";
import type { AlbumService } from "./album-service";

// Backdrops for general screens (Home, Search, Settings): a random favourite.
// The favourites are fetched once, as one bounded page, and forgotten when the
// connection changes or the library is refreshed. With no favourites, or none
// reachable, general screens show no backdrop.

const favoriteBackdropLimit = 18;

export type FavoriteBackdrops = {
  // A thumbnail URL for a random favourite, or null when there is none.
  loadUrl(): Promise<string | null>;
  reset(): void;
};

export function createFavoriteBackdrops(
  service: Pick<AlbumService, "loadAssetThumbnailUrl" | "loadFavoriteAssets">
): FavoriteBackdrops {
  let favorites: Promise<AlbumAsset[]> | null = null;

  function loadFavorites(): Promise<AlbumAsset[]> {
    if (!favorites) {
      const request = service
        .loadFavoriteAssets(favoriteBackdropLimit)
        .then((page) => page.assets)
        .catch(() => {
          // Try again next time rather than remembering the failure.
          if (favorites === request) {
            favorites = null;
          }
          return [];
        });

      favorites = request;
    }

    return favorites;
  }

  return {
    async loadUrl() {
      const asset = chooseBackdropAsset(await loadFavorites());

      return asset ? service.loadAssetThumbnailUrl(asset) : null;
    },
    reset() {
      favorites = null;
    }
  };
}
