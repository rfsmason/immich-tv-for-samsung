import type { AlbumAsset } from "../domain/album";
import { shortMonthNames } from "../presentation/date-labels";

export type AssetViewerImageState = {
  activeImageRequests: number;
  imageQueue: AssetViewerImageRequest[];
  imageRequests: Record<string, number>;
  imageUrls: Record<string, string>;
  retainedAssetIds: Record<string, true>;
};

type AssetViewerImageRequest = {
  asset: AlbumAsset;
  generation: number;
  index: number;
};

export type ViewerRetentionWindow = {
  endIndex: number;
  startIndex: number;
};

export type RestoredViewerGridFocus = {
  focusedIndex: number;
  preferredColumn: number;
};

export type ViewerMetadata = {
  date: string;
  location: string;
  time: string;
};

export type ViewerVideoAutoplayOptions = {
  assetType: AlbumAsset["type"];
  autoplayVideos: boolean;
  playControlHidden: boolean;
  playbackAssetId: string | null;
  selectedAssetId: string;
  slideshowPlaying: boolean;
};

export function formatViewerPositionLabel(
  currentIndex: number,
  loadedCount: number,
  totalCount: number | null,
  absoluteIndex?: number
): string {
  const safeLoadedCount = Math.max(0, loadedCount);
  const count = totalCount !== null ? Math.max(0, totalCount) : safeLoadedCount;
  const positionIndex = absoluteIndex === undefined ? currentIndex : absoluteIndex;
  const safeCurrent = count > 0 ? clamp(positionIndex, 0, count - 1) + 1 : 0;

  return `${safeCurrent} of ${count}`;
}

export function formatViewerMetadata(asset: AlbumAsset): ViewerMetadata {
  const capturedAt = formatCapturedAt(asset.capturedAt);

  return {
    date: capturedAt.date,
    location: asset.location || "",
    time: capturedAt.time
  };
}

export function formatCapturedAt(value: string | null): { date: string; time: string } {
  if (!value) {
    return {
      date: "",
      time: ""
    };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);

  if (!match) {
    return {
      date: value,
      time: ""
    };
  }

  const year = match[1];
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4];
  const minute = match[5];
  const monthName = shortMonthNames[month - 1];

  if (!year || !monthName || !Number.isFinite(day)) {
    return {
      date: value,
      time: ""
    };
  }

  return {
    date: `${day} ${monthName} ${year}`,
    time: `${hour}:${minute}`
  };
}

export type ReconcileAssetViewerImagesOptions = {
  assets: AlbumAsset[];
  currentIndex: number;
  generation: number;
  isCurrentGeneration(generation: number): boolean;
  isHidden(): boolean;
  loadImageUrl(asset: AlbumAsset): Promise<string | null>;
  onImageLoadFailed(asset: AlbumAsset, index: number): void;
  onImageLoaded(asset: AlbumAsset, index: number, url: string): void;
  revokeImageUrl(url: string): void;
  state: AssetViewerImageState;
};

const maxActiveViewerImageRequests = 3;

export function createAssetViewerImageState(): AssetViewerImageState {
  return {
    activeImageRequests: 0,
    imageQueue: [],
    imageRequests: {},
    imageUrls: {},
    retainedAssetIds: {}
  };
}

export function calculateViewerRetentionWindow(
  currentIndex: number,
  itemCount: number
): ViewerRetentionWindow {
  if (itemCount <= 0) {
    return {
      endIndex: 0,
      startIndex: 0
    };
  }

  const boundedIndex = clamp(currentIndex, 0, itemCount - 1);

  return {
    endIndex: Math.min(itemCount, boundedIndex + 2),
    startIndex: Math.max(0, boundedIndex - 1)
  };
}

export function reconcileAssetViewerImages(options: ReconcileAssetViewerImagesOptions): void {
  const window = calculateViewerRetentionWindow(options.currentIndex, options.assets.length);
  const retainedAssetIds = readRetainedAssetIds(options.assets, window);

  options.state.retainedAssetIds = retainedAssetIds;
  revokeUrlsOutsideRetention(options.state, retainedAssetIds, options.revokeImageUrl);
  pruneQueuedImageRequests(options.state, retainedAssetIds);

  for (let index = window.startIndex; index < window.endIndex; index += 1) {
    const asset = options.assets[index];

    if (
      !asset ||
      (asset.type !== "image" && asset.type !== "video") ||
      options.state.imageUrls[asset.id] ||
      options.state.imageRequests[asset.id]
    ) {
      continue;
    }

    options.state.imageRequests[asset.id] = options.generation;
    options.state.imageQueue.push({
      asset,
      generation: options.generation,
      index
    });
  }

  prioritizeQueuedImageRequests(options.state, options.currentIndex);
  pumpImageQueue(options);
}

export function getViewerNavigationIndex(
  currentIndex: number,
  direction: "left" | "right",
  itemCount: number
): number {
  if (itemCount <= 0) {
    return 0;
  }

  if (direction === "left") {
    return Math.max(0, currentIndex - 1);
  }

  return Math.min(itemCount - 1, currentIndex + 1);
}

export function getNextSlideshowIndex(currentIndex: number, itemCount: number): number | null {
  if (itemCount <= 0 || currentIndex >= itemCount - 1) {
    return null;
  }

  return clamp(currentIndex + 1, 0, itemCount - 1);
}

export function shouldAutoplayViewerVideo(options: ViewerVideoAutoplayOptions): boolean {
  return (
    options.assetType === "video" &&
    options.playbackAssetId !== options.selectedAssetId &&
    !options.slideshowPlaying &&
    options.autoplayVideos &&
    !options.playControlHidden
  );
}

export function getRestoredViewerGridFocus(
  selectedIndex: number,
  columnCount: number,
  itemCount: number
): RestoredViewerGridFocus | null {
  if (columnCount <= 0 || itemCount <= 0) {
    return null;
  }

  const focusedIndex = clamp(selectedIndex, 0, itemCount - 1);

  return {
    focusedIndex,
    preferredColumn: focusedIndex % columnCount
  };
}

export function revokeAllAssetViewerImages(
  state: AssetViewerImageState,
  revokeImageUrl: (url: string) => void
): void {
  for (const url of Object.keys(state.imageUrls).map((assetId) => state.imageUrls[assetId])) {
    if (url) {
      revokeImageUrl(url);
    }
  }

  state.activeImageRequests = 0;
  state.imageQueue = [];
  state.imageRequests = {};
  state.imageUrls = {};
  state.retainedAssetIds = {};
}

function pumpImageQueue(options: ReconcileAssetViewerImagesOptions): void {
  while (
    options.state.activeImageRequests < maxActiveViewerImageRequests &&
    options.state.imageQueue.length > 0
  ) {
    const request = options.state.imageQueue.shift();

    if (!request) {
      return;
    }

    if (
      options.state.imageRequests[request.asset.id] !== request.generation ||
      !options.state.retainedAssetIds[request.asset.id]
    ) {
      if (options.state.imageRequests[request.asset.id] === request.generation) {
        delete options.state.imageRequests[request.asset.id];
      }
      continue;
    }

    options.state.activeImageRequests += 1;

    options
      .loadImageUrl(request.asset)
      .then(
        (url) => {
          handleImageLoaded(options, request.asset, request.index, url);
        },
        () => {
          handleImageFailed(options, request.asset, request.index);
        }
      )
      .then(
        () => {
          completeImageRequest(options);
        },
        () => {
          completeImageRequest(options);
        }
      );
  }
}

function completeImageRequest(options: ReconcileAssetViewerImagesOptions): void {
  options.state.activeImageRequests = Math.max(0, options.state.activeImageRequests - 1);
  pumpImageQueue(options);
}

function pruneQueuedImageRequests(
  state: AssetViewerImageState,
  retainedAssetIds: Record<string, true>
): void {
  state.imageQueue = state.imageQueue.filter((request) => {
    const shouldKeep =
      state.imageRequests[request.asset.id] === request.generation &&
      retainedAssetIds[request.asset.id];

    if (!shouldKeep && state.imageRequests[request.asset.id] === request.generation) {
      delete state.imageRequests[request.asset.id];
    }

    return shouldKeep;
  });
}

function prioritizeQueuedImageRequests(state: AssetViewerImageState, currentIndex: number): void {
  state.imageQueue.sort((left, right) => {
    const leftPriority = readViewerImageRequestPriority(left.index, currentIndex);
    const rightPriority = readViewerImageRequestPriority(right.index, currentIndex);

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.index - right.index;
  });
}

function readViewerImageRequestPriority(index: number, currentIndex: number): number {
  if (index === currentIndex) {
    return 0;
  }

  if (index > currentIndex) {
    return 1 + (index - currentIndex - 1) * 2;
  }

  return 2 + (currentIndex - index - 1) * 2;
}

function handleImageLoaded(
  options: ReconcileAssetViewerImagesOptions,
  asset: AlbumAsset,
  index: number,
  url: string | null
): void {
  const requestGeneration = options.state.imageRequests[asset.id];

  if (!url) {
    if (requestGeneration === options.generation) {
      delete options.state.imageRequests[asset.id];
      options.onImageLoadFailed(asset, index);
    }

    return;
  }

  if (
    !options.isCurrentGeneration(options.generation) ||
    options.isHidden() ||
    requestGeneration !== options.generation ||
    !options.state.retainedAssetIds[asset.id]
  ) {
    options.revokeImageUrl(url);

    if (requestGeneration === options.generation) {
      delete options.state.imageRequests[asset.id];
    }

    return;
  }

  delete options.state.imageRequests[asset.id];
  options.state.imageUrls[asset.id] = url;
  options.onImageLoaded(asset, index, url);
}

function handleImageFailed(
  options: ReconcileAssetViewerImagesOptions,
  asset: AlbumAsset,
  index: number
): void {
  if (options.state.imageRequests[asset.id] === options.generation) {
    delete options.state.imageRequests[asset.id];

    if (
      options.isCurrentGeneration(options.generation) &&
      !options.isHidden() &&
      options.state.retainedAssetIds[asset.id]
    ) {
      options.onImageLoadFailed(asset, index);
    }
  }
}

function readRetainedAssetIds(
  assets: AlbumAsset[],
  window: ViewerRetentionWindow
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

function revokeUrlsOutsideRetention(
  state: AssetViewerImageState,
  retainedAssetIds: Record<string, true>,
  revokeImageUrl: (url: string) => void
): void {
  for (const assetId of Object.keys(state.imageUrls)) {
    if (!retainedAssetIds[assetId]) {
      const url = state.imageUrls[assetId];

      if (url) {
        revokeImageUrl(url);
      }

      delete state.imageUrls[assetId];
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
