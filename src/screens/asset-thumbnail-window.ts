import type { AlbumAsset } from "../domain/album";
import type { AssetIndexWindow } from "./album-assets-window";

// The shared, bounded thumbnail queue for grids and rails. Items are assets by
// default; any item with an id (a Person's face, a Memory's cover) works.
type ThumbnailItem = { id: string };

export type AssetThumbnailState<T extends ThumbnailItem = AlbumAsset> = {
  activeThumbnailRequests: number;
  retainedAssetIds: Record<string, true>;
  thumbnailQueue: Array<AssetThumbnailRequest<T>>;
  thumbnailRequests: Record<string, number>;
  thumbnailUrls: Record<string, string>;
};

type AssetThumbnailRequest<T extends ThumbnailItem> = {
  asset: T;
  generation: number;
  index: number;
};

export type ReconcileAssetThumbnailOptions<T extends ThumbnailItem = AlbumAsset> = {
  assets: T[];
  focusedIndex: number;
  generation: number;
  isCurrentGeneration(generation: number): boolean;
  isHidden(): boolean;
  loadThumbnailUrl(asset: T): Promise<string | null>;
  onThumbnailLoaded(asset: T, index: number, url: string): void;
  revokeThumbnailUrl(url: string): void;
  state: AssetThumbnailState<T>;
  window: AssetIndexWindow;
};

const maxActiveThumbnailRequests = 8;

export function createAssetThumbnailState<
  T extends ThumbnailItem = AlbumAsset
>(): AssetThumbnailState<T> {
  return {
    activeThumbnailRequests: 0,
    retainedAssetIds: {},
    thumbnailQueue: [],
    thumbnailRequests: {},
    thumbnailUrls: {}
  };
}

export function reconcileAssetThumbnails<T extends ThumbnailItem>(
  options: ReconcileAssetThumbnailOptions<T>
): void {
  const retainedAssetIds = readRetainedAssetIds(options.assets, options.window);

  options.state.retainedAssetIds = retainedAssetIds;
  pruneQueuedThumbnailRequests(options.state, retainedAssetIds);
  revokeUrlsOutsideRetention(options.state, retainedAssetIds, options.revokeThumbnailUrl);

  for (let index = options.window.startIndex; index < options.window.endIndex; index += 1) {
    const asset = options.assets[index];

    if (
      !asset ||
      options.state.thumbnailUrls[asset.id] ||
      options.state.thumbnailRequests[asset.id]
    ) {
      continue;
    }

    options.state.thumbnailRequests[asset.id] = options.generation;
    options.state.thumbnailQueue.push({
      asset,
      generation: options.generation,
      index
    });
  }

  prioritizeQueuedThumbnailRequests(options.state, options.focusedIndex);
  pumpThumbnailQueue(options);
}

function pumpThumbnailQueue<T extends ThumbnailItem>(
  options: ReconcileAssetThumbnailOptions<T>
): void {
  while (
    options.state.activeThumbnailRequests < maxActiveThumbnailRequests &&
    options.state.thumbnailQueue.length > 0
  ) {
    const request = options.state.thumbnailQueue.shift();

    if (!request) {
      return;
    }

    if (
      options.state.thumbnailRequests[request.asset.id] !== request.generation ||
      !options.state.retainedAssetIds[request.asset.id]
    ) {
      if (options.state.thumbnailRequests[request.asset.id] === request.generation) {
        delete options.state.thumbnailRequests[request.asset.id];
      }
      continue;
    }

    options.state.activeThumbnailRequests += 1;

    options
      .loadThumbnailUrl(request.asset)
      .then(
        (url) => {
          handleThumbnailLoaded(options, request.asset, request.index, url);
        },
        () => {
          if (options.state.thumbnailRequests[request.asset.id] === request.generation) {
            delete options.state.thumbnailRequests[request.asset.id];
          }
          // Missing thumbnails should not prevent remote-control browsing.
        }
      )
      .then(
        () => {
          completeThumbnailRequest(options);
        },
        () => {
          completeThumbnailRequest(options);
        }
      );
  }
}

function completeThumbnailRequest<T extends ThumbnailItem>(
  options: ReconcileAssetThumbnailOptions<T>
): void {
  options.state.activeThumbnailRequests = Math.max(0, options.state.activeThumbnailRequests - 1);
  pumpThumbnailQueue(options);
}

function pruneQueuedThumbnailRequests<T extends ThumbnailItem>(
  state: AssetThumbnailState<T>,
  retainedAssetIds: Record<string, true>
): void {
  state.thumbnailQueue = state.thumbnailQueue.filter((request) => {
    const shouldKeep =
      state.thumbnailRequests[request.asset.id] === request.generation &&
      retainedAssetIds[request.asset.id];

    if (!shouldKeep && state.thumbnailRequests[request.asset.id] === request.generation) {
      delete state.thumbnailRequests[request.asset.id];
    }

    return shouldKeep;
  });
}

function prioritizeQueuedThumbnailRequests<T extends ThumbnailItem>(
  state: AssetThumbnailState<T>,
  focusedIndex: number
): void {
  state.thumbnailQueue.sort((left, right) => {
    const leftDistance = Math.abs(left.index - focusedIndex);
    const rightDistance = Math.abs(right.index - focusedIndex);

    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return left.index - right.index;
  });
}

function handleThumbnailLoaded<T extends ThumbnailItem>(
  options: ReconcileAssetThumbnailOptions<T>,
  asset: T,
  index: number,
  url: string | null
): void {
  const requestGeneration = options.state.thumbnailRequests[asset.id];

  if (!url) {
    if (requestGeneration === options.generation) {
      delete options.state.thumbnailRequests[asset.id];
    }
    return;
  }

  if (
    !options.isCurrentGeneration(options.generation) ||
    options.isHidden() ||
    requestGeneration !== options.generation ||
    !options.state.retainedAssetIds[asset.id]
  ) {
    options.revokeThumbnailUrl(url);

    if (requestGeneration === options.generation) {
      delete options.state.thumbnailRequests[asset.id];
    }

    return;
  }

  delete options.state.thumbnailRequests[asset.id];
  options.state.thumbnailUrls[asset.id] = url;
  options.onThumbnailLoaded(asset, index, url);
}

export function revokeAllAssetThumbnails<T extends ThumbnailItem>(
  state: AssetThumbnailState<T>,
  revokeThumbnailUrl: (url: string) => void
): void {
  for (const url of Object.keys(state.thumbnailUrls).map(
    (assetId) => state.thumbnailUrls[assetId]
  )) {
    if (url) {
      revokeThumbnailUrl(url);
    }
  }

  state.activeThumbnailRequests = 0;
  state.retainedAssetIds = {};
  state.thumbnailQueue = [];
  state.thumbnailRequests = {};
  state.thumbnailUrls = {};
}

function readRetainedAssetIds(
  assets: ThumbnailItem[],
  window: AssetIndexWindow
): Record<string, true> {
  const retained: Record<string, true> = {};

  for (let index = window.startIndex; index < window.endIndex; index += 1) {
    const asset = assets[index];

    if (asset) {
      retained[asset.id] = true;
    }
  }

  return retained;
}

function revokeUrlsOutsideRetention<T extends ThumbnailItem>(
  state: AssetThumbnailState<T>,
  retainedAssetIds: Record<string, true>,
  revokeThumbnailUrl: (url: string) => void
): void {
  for (const assetId of Object.keys(state.thumbnailUrls)) {
    if (!retainedAssetIds[assetId]) {
      const url = state.thumbnailUrls[assetId];

      if (url) {
        revokeThumbnailUrl(url);
      }

      delete state.thumbnailUrls[assetId];
    }
  }
}
