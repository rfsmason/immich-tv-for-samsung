import type { Logger } from "../../logging/logger";
import type { AppSettingsStore } from "../../storage/app-settings-store";
import { getNextSlideshowIndex } from "../asset-viewer-window";
import { remoteKeys } from "../../platform/tizen/keys";
import { pauseViewerPlayback, resetViewerPlayback } from "./viewer-playback";
import type { ViewerFaces } from "./viewer-faces";
import type { ViewerCollection, ViewerElements, ViewerState } from "./viewer-types";

// The viewer's slideshow (ADR 0006): one timer advancing through the
// collection at the saved interval, its control and progress bar, and the
// media keys. It pauses on any manual move, at the end when nothing more
// loads, and when the app is hidden. While it runs, the viewer holds the
// TV's screensaver off (ADR 0019).
//
// With "Autoplay videos" on, a video plays in full through the viewer's own
// playback, with sound, and the slideshow moves on when it ends; photos and
// Live Photos (stills) keep the interval. A video that doesn't start or
// reports an error is skipped after the interval, and one that stops making
// progress for slideshowVideoStallMs is skipped at once (ADR 0006, ADR 0020).

// How long a slideshow video may go without progress before it is skipped.
export const slideshowVideoStallMs = 20000;

export type SlideshowContext = {
  collection: ViewerCollection;
  elements: ViewerElements;
  faces: Pick<ViewerFaces, "sync">;
  logger?: Pick<Logger, "info">;
  // Plays the current video without pausing the slideshow; true once it
  // plays.
  playSlideVideo(): Promise<boolean>;
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

  // A video the slideshow will play continues where it is; anything else
  // stops, as before.
  if (!playsInFull(context) || state.viewerPlayback.assetId !== state.selectedAsset?.asset.id) {
    resetViewerPlayback(elements, state);
  }
  state.viewerSlideshow.playing = true;
  context.renderCurrent();
  elements.assetViewerSlideshow.focus();
  renderViewerSlideshowControl(context);
  scheduleViewerSlideshow(context);
  context.syncPassiveViewing();
}

export function pauseViewerSlideshow(context: SlideshowContext): void {
  const { elements, state } = context;
  const asset = state.selectedAsset?.asset;

  // Its video pauses with it, and resumes with it.
  if (
    state.viewerSlideshow.playing &&
    asset &&
    state.viewerSlideshow.videoAssetId === asset.id &&
    state.viewerPlayback.assetId === asset.id &&
    !elements.assetViewerVideo.paused
  ) {
    pauseViewerPlayback(elements, state, asset);
  }

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

// Whether the current asset is a video the slideshow plays in full.
function playsInFull(context: SlideshowContext): boolean {
  return (
    context.state.selectedAsset?.asset.type === "video" &&
    context.settingsStore.load().autoplayVideos
  );
}

function scheduleViewerSlideshow(context: SlideshowContext): void {
  const { collection, state } = context;

  clearViewerSlideshowTimer(state);
  state.viewerSlideshow.videoAssetId = null;

  if (!state.viewerSlideshow.playing || !collection.isOpen() || collection.isHidden()) {
    return;
  }

  if (playsInFull(context)) {
    playSlideshowVideo(context);
    return;
  }

  scheduleSlideshowInterval(context);
}

function scheduleSlideshowInterval(context: SlideshowContext): void {
  const { elements, state } = context;
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

    // Wait an interval for more, without replaying a video that just ended.
    if (collection.isLoadingMore()) {
      state.viewerSlideshow.videoAssetId = null;
      scheduleSlideshowInterval(context);
      return;
    }

    pauseViewerSlideshow(context);
    return;
  }

  context.showSlide(nextIndex);
  scheduleViewerSlideshow(context);
}

function playSlideshowVideo(context: SlideshowContext): void {
  const { elements, state } = context;
  const assetId = state.selectedAsset!.asset.id;

  state.viewerSlideshow.videoAssetId = assetId;
  stopViewerSlideshowProgress(elements);
  armSlideshowVideoStall(context);
  void context.playSlideVideo().then((playing) => {
    const asset = state.selectedAsset?.asset;

    if (!playing) {
      if (isSlideshowVideo(context, assetId)) {
        skipSlideshowVideo(context, "did not start");
      }
    } else if (!state.viewerSlideshow.playing && asset?.id === assetId) {
      // Paused while it was starting: it stays paused with the slideshow.
      pauseViewerPlayback(elements, state, asset);
    }
  });
}

function isSlideshowVideo(context: SlideshowContext, assetId?: string): boolean {
  const { state } = context;
  const videoAssetId = state.viewerSlideshow.videoAssetId;

  return (
    state.viewerSlideshow.playing &&
    videoAssetId !== null &&
    videoAssetId === state.selectedAsset?.asset.id &&
    (assetId === undefined || assetId === videoAssetId)
  );
}

// A video the slideshow can't play shows its poster for the interval, then
// the slideshow moves on.
function skipSlideshowVideo(context: SlideshowContext, reason: string): void {
  context.logger?.info("Slideshow skipped a video.", {
    assetId: context.state.viewerSlideshow.videoAssetId,
    reason
  });
  clearViewerSlideshowTimer(context.state);
  scheduleSlideshowInterval(context);
}

function armSlideshowVideoStall(context: SlideshowContext): void {
  const { state } = context;

  clearSlideshowVideoStall(state);
  state.viewerSlideshow.stallTimerId = window.setTimeout(() => {
    state.viewerSlideshow.stallTimerId = null;

    if (isSlideshowVideo(context)) {
      context.logger?.info("Slideshow skipped a video.", {
        assetId: state.viewerSlideshow.videoAssetId,
        reason: "stalled"
      });
      advanceViewerSlideshow(context);
    }
  }, slideshowVideoStallMs);
}

// The slideshow's video made progress.
export function handleSlideshowVideoProgress(context: SlideshowContext): void {
  if (isSlideshowVideo(context) && context.state.viewerSlideshow.timerId === null) {
    armSlideshowVideoStall(context);
  }
}

// The slideshow's video ended: on to the next asset.
export function handleSlideshowVideoEnded(context: SlideshowContext): void {
  if (isSlideshowVideo(context)) {
    clearViewerSlideshowTimer(context.state);
    advanceViewerSlideshow(context);
  }
}

// The slideshow's video reported an error.
export function handleSlideshowVideoError(context: SlideshowContext): void {
  if (isSlideshowVideo(context) && context.state.viewerSlideshow.timerId === null) {
    skipSlideshowVideo(context, "error");
  }
}

function clearSlideshowVideoStall(state: ViewerState): void {
  if (state.viewerSlideshow.stallTimerId !== null) {
    window.clearTimeout(state.viewerSlideshow.stallTimerId);
    state.viewerSlideshow.stallTimerId = null;
  }
}

function clearViewerSlideshowTimer(state: ViewerState): void {
  clearSlideshowVideoStall(state);

  if (state.viewerSlideshow.timerId !== null) {
    window.clearTimeout(state.viewerSlideshow.timerId);
    state.viewerSlideshow.timerId = null;
  }
}
