import type { AlbumAsset } from "../../domain/album";
import type { ViewingSource } from "../../domain/viewing-history";
import type { AssetViewerImageState } from "../asset-viewer-window";

export type ViewerElements = {
  assetPlaceholder: HTMLElement;
  assetPlaceholderBack: HTMLButtonElement;
  assetPlaceholderSummary: HTMLElement;
  assetViewerExif: HTMLElement;
  assetViewerFaceOverlay: HTMLElement;
  assetViewerFaces: HTMLButtonElement;
  assetViewerFacesStatus: HTMLElement;
  assetViewerImage: HTMLImageElement;
  assetViewerPlaceholder: HTMLElement;
  assetViewerPlaceholderMessage: HTMLElement;
  assetViewerPlay: HTMLButtonElement;
  assetViewerPlayer: HTMLElement;
  assetViewerPlayerBuffered: HTMLElement;
  assetViewerPlayerDuration: HTMLElement;
  assetViewerPlayerElapsed: HTMLElement;
  assetViewerPlayerProgress: HTMLElement;
  // The progress bar, a focusable slider while a video shows (viewer-seek.ts).
  assetViewerPlayerSeek: HTMLElement;
  assetViewerPlayerStatus: HTMLElement;
  assetViewerPlayerStatusText: HTMLElement;
  assetViewerSlideshow: HTMLButtonElement;
  assetViewerSlideshowStatus: HTMLElement;
  assetViewerSpinner: HTMLElement;
  assetViewerTitle: HTMLElement;
  assetViewerVideo: HTMLVideoElement;
};

export type ViewerState = {
  // The asset last written to viewing history, so re-rendering the same asset
  // (paging, retries) does not record another visit.
  recordedAssetId: string | null;
  selectedAsset: { asset: AlbumAsset; index: number } | null;
  suppressViewerBackClickUntil: number;
  viewerBackPointerArmed: boolean;
  viewerImages: AssetViewerImageState;
  viewerPlayFocusPending: boolean;
  viewerPlayback: {
    assetId: string | null;
    livePhotoRestarting: boolean;
    mediaKind: "live-photo" | "video" | null;
    requestId: number;
    url: string | null;
  };
  viewerSlideshow: {
    playing: boolean;
    // A slideshow stall check while it plays a video in full (ADR 0006).
    stallTimerId: number | null;
    timerId: number | null;
    // The video the slideshow is playing in full, kept while paused so
    // resuming continues it.
    videoAssetId: string | null;
  };
};

// Everything the viewer needs from the collection it shows. Any ordered asset
// list can provide this, so People, Search and Favorites reuse one viewer,
// slideshow and playback path (ADR 0008, ADR 0012).
export type ViewerCollection = {
  absoluteIndex(index: number): number | undefined;
  assets(): AlbumAsset[];
  // Back from the viewer: the collection decides whether that is its grid or
  // the screen that opened it.
  exit(): void;
  generation(): number;
  index(): number;
  isCurrentGeneration(generation: number): boolean;
  isHidden(): boolean;
  isLoadingMore(): boolean;
  isOpen(): boolean;
  // Load the next page when the current index nears the loaded end.
  loadMore(): void;
  // Load newer assets before the first loaded one. "move" selects the asset
  // immediately before the current one once loaded; "prefetch" keeps it.
  loadPrevious(mode: "move" | "prefetch"): void;
  select(index: number): void;
  total(): number | null;
  viewingSource(): ViewingSource | null;
};
