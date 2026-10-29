import type { ViewerElements } from "./viewer-types";

// The shared collection screen's elements: its grid and header, the Photos
// date rail, and the full-screen viewer.

export type AlbumDetailElements = ViewerElements & {
  grid: HTMLElement;
  retryButton: HTMLButtonElement;
  root: HTMLElement;
  sortButton: HTMLButtonElement;
  summary: HTMLElement;
  timeline: HTMLElement;
  title: HTMLElement;
};

export function readCollectionElements(documentRef: Document): AlbumDetailElements {
  return {
    assetPlaceholder: requireElement(documentRef, "asset-placeholder"),
    assetPlaceholderBack: requireElement<HTMLButtonElement>(documentRef, "asset-placeholder-back"),
    assetPlaceholderSummary: requireElement(documentRef, "asset-placeholder-summary"),
    assetViewerExif: requireElement(documentRef, "asset-viewer-exif"),
    assetViewerImage: requireElement<HTMLImageElement>(documentRef, "asset-viewer-image"),
    assetViewerPlaceholder: requireElement(documentRef, "asset-viewer-placeholder"),
    assetViewerPlaceholderMessage: requireElement(documentRef, "asset-viewer-placeholder-message"),
    assetViewerPlayer: requireElement(documentRef, "asset-viewer-player"),
    assetViewerPlayerBuffered: requireElement(documentRef, "asset-viewer-buffered"),
    assetViewerPlayerDuration: requireElement(documentRef, "asset-viewer-duration"),
    assetViewerPlayerElapsed: requireElement(documentRef, "asset-viewer-elapsed"),
    assetViewerPlayerProgress: requireElement(documentRef, "asset-viewer-progress-fill"),
    assetViewerPlayerSeek: requireElement(documentRef, "asset-viewer-seek"),
    assetViewerPlayerStatus: requireElement(documentRef, "asset-viewer-status"),
    assetViewerPlayerStatusText: requireElement(documentRef, "asset-viewer-status-text"),
    assetViewerPlay: requireElement<HTMLButtonElement>(documentRef, "asset-viewer-play"),
    assetViewerSlideshow: requireElement<HTMLButtonElement>(documentRef, "asset-viewer-slideshow"),
    assetViewerSlideshowStatus: requireElement(documentRef, "asset-viewer-slideshow-status"),
    assetViewerFaceOverlay: requireElement(documentRef, "asset-viewer-face-overlay"),
    assetViewerFaces: requireElement<HTMLButtonElement>(documentRef, "asset-viewer-faces"),
    assetViewerFacesStatus: requireElement(documentRef, "asset-viewer-faces-status"),
    assetViewerSpinner: requireElement(documentRef, "asset-viewer-spinner"),
    assetViewerTitle: requireElement(documentRef, "asset-viewer-title"),
    assetViewerVideo: requireElement<HTMLVideoElement>(documentRef, "asset-viewer-video"),
    grid: requireElement(documentRef, "album-assets-grid"),
    retryButton: requireElement<HTMLButtonElement>(documentRef, "collection-retry"),
    sortButton: requireElement<HTMLButtonElement>(documentRef, "collection-sort-order"),
    root: requireElement(documentRef, "album-detail-screen"),
    summary: requireElement(documentRef, "album-detail-summary"),
    timeline: requireElement(documentRef, "photos-timeline-rail"),
    title: requireElement(documentRef, "album-detail-title")
  };
}

function requireElement<T extends HTMLElement>(documentRef: Document, id: string): T {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as T;
}
