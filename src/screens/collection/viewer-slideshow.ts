import type { AppSettingsStore } from "../../storage/app-settings-store";
import { getNextSlideshowIndex } from "../asset-viewer-window";
import { remoteKeys } from "../../platform/tizen/keys";
import { resetViewerPlayback } from "./viewer-playback";
import type { ViewerFaces } from "./viewer-faces";
import type { ViewerCollection, ViewerElements, ViewerState } from "./viewer-types";

// The viewer's slideshow (ADR 0006): one timer advancing through the
// collection at the saved interval, its control and progress bar, and the
// media keys. It pauses on any manual move, at the end when nothing more
// loads, and when the app is hidden. While it runs, the viewer holds the
// TV's screensaver off (ADR 0019).

export type SlideshowContext = {
  collection: ViewerCollection;
  elements: ViewerElements;
  faces: Pick<ViewerFaces, "sync">;
  settingsStore: AppSettingsStore;
  state: ViewerState;
  // Re-renders the current asset, which shows the slideshow's state.
  renderCurrent(): void;
  // Moves the viewer to the asset at `index` as the next slide.
  showSlide(index: number): void;
  syncPassiveViewing(): void;
};

export function renderViewerSlideshowControl(context: SlideshowContext): void {
  const { elements, state } = context;
  const stateLabel = state.viewerSlideshow.playing ? "Pause slideshow" : "Start slideshow";
  const status = state.viewerSlideshow.playing ? "Slideshow playing" : "Slideshow paused";

  elements.assetViewerSlideshow.setAttribute(
    "data-slideshow-state",
    state.viewerSlideshow.playing ? "playing" : "paused"
  );
  elements.assetViewerSlideshow.setAttribute("aria-label", stateLabel);
  elements.assetViewerSlideshow.title = stateLabel;
  elements.assetViewerSlideshowStatus.textContent = status;
  elements.assetViewerSlideshowStatus.hidden = true;
}

function startViewerSlideshowProgress(elements: ViewerElements, intervalSeconds: number): void {
  elements.assetViewerSlideshow.style.setProperty(
    "--asset-viewer-slideshow-duration",
    `${intervalSeconds * 1000}ms`
  );
  elements.assetViewerSlideshow.removeAttribute("data-slideshow-progress");
  void elements.assetViewerSlideshow.offsetWidth;
  elements.assetViewerSlideshow.setAttribute("data-slideshow-progress", "running");
}

function stopViewerSlideshowProgress(elements: ViewerElements): void {
  elements.assetViewerSlideshow.removeAttribute("data-slideshow-progress");
  elements.assetViewerSlideshow.style.removeProperty("--asset-viewer-slideshow-duration");
}

export function toggleViewerSlideshow(context: SlideshowContext): void {
  if (context.state.viewerSlideshow.playing) {
    pauseViewerSlideshow(context);
    return;
  }

  startViewerSlideshow(context);
}

export function handleViewerSlideshowMediaKey(keyCode: number, context: SlideshowContext): void {
  if (keyCode === remoteKeys.mediaPause) {
    pauseViewerSlideshow(context);
    return;
  }

  if (keyCode === remoteKeys.mediaPlay) {
    startViewerSlideshow(context);
    return;
  }

  toggleViewerSlideshow(context);
}

function startViewerSlideshow(context: SlideshowContext): void {
  const { collection, elements, state } = context;

  if (!collection.isOpen() || collection.assets().length <= 1) {
    return;
  }

  resetViewerPlayback(elements, state);
  state.viewerSlideshow.playing = true;
  context.renderCurrent();
  elements.assetViewerSlideshow.focus();
  renderViewerSlideshowControl(context);
  scheduleViewerSlideshow(context);
  context.syncPassiveViewing();
}

export function pauseViewerSlideshow(context: SlideshowContext): void {
  const { elements, state } = context;

  state.viewerSlideshow.playing = false;
  clearViewerSlideshowTimer(state);
  elements.assetViewerSlideshow.setAttribute("data-slideshow-state", "paused");
  elements.assetViewerSlideshow.setAttribute("aria-label", "Start slideshow");
  elements.assetViewerSlideshow.title = "Start slideshow";
  elements.assetViewerSlideshowStatus.textContent = "Slideshow paused";
  stopViewerSlideshowProgress(elements);
  context.faces.sync();
  context.syncPassiveViewing();
}

export function stopViewerSlideshow(context: SlideshowContext): void {
  pauseViewerSlideshow(context);
  context.elements.assetViewerSlideshowStatus.hidden = true;
}

function scheduleViewerSlideshow(context: SlideshowContext): void {
  const { collection, elements, state } = context;

  clearViewerSlideshowTimer(state);

  if (!state.viewerSlideshow.playing || !collection.isOpen() || collection.isHidden()) {
    return;
  }

  const interval = context.settingsStore.load().slideshowIntervalSeconds;
  startViewerSlideshowProgress(elements, interval);

  state.viewerSlideshow.timerId = window.setTimeout(() => {
    advanceViewerSlideshow(context);
  }, interval * 1000);
}

function advanceViewerSlideshow(context: SlideshowContext): void {
  const { collection, state } = context;

  state.viewerSlideshow.timerId = null;

  if (!state.viewerSlideshow.playing || !collection.isOpen() || collection.isHidden()) {
    return;
  }

  const nextIndex = getNextSlideshowIndex(collection.index(), collection.assets().length);

  if (nextIndex === null) {
    collection.loadMore();

    if (collection.isLoadingMore()) {
      scheduleViewerSlideshow(context);
      return;
    }

    pauseViewerSlideshow(context);
    return;
  }

  context.showSlide(nextIndex);
  scheduleViewerSlideshow(context);
}

function clearViewerSlideshowTimer(state: ViewerState): void {
  if (state.viewerSlideshow.timerId !== null) {
    window.clearTimeout(state.viewerSlideshow.timerId);
    state.viewerSlideshow.timerId = null;
  }
}
