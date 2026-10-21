import type { AlbumAsset } from "../../domain/album";
import { formatDurationLabel } from "../../presentation/duration-labels";

export function isLivePhotoAsset(asset: AlbumAsset): boolean {
  return asset.type === "image" && asset.livePhotoVideoId !== null;
}

export function isViewerPlayableAsset(asset: AlbumAsset): boolean {
  return asset.type === "video" || isLivePhotoAsset(asset);
}

export function readAssetTypeLabel(asset: AlbumAsset): string {
  if (isLivePhotoAsset(asset)) {
    return "live photo";
  }

  if (asset.type === "video") {
    return asset.durationMs !== null ? `video, ${formatDurationLabel(asset.durationMs)}` : "video";
  }

  if (asset.type === "audio") {
    return "audio";
  }

  if (asset.type === "image") {
    return "image";
  }

  return "asset";
}

export function formatAssetCount(count: number): string {
  return count === 1 ? "1 asset" : `${count} assets`;
}
