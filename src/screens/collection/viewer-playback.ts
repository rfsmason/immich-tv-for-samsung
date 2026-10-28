import type { AlbumService } from "../../app/album-service";
import type { AlbumAsset } from "../../domain/album";
import { clearStill, releaseVideo } from "../media-elements";
import { isLivePhotoAsset, isViewerPlayableAsset } from "./asset-presentation";
import type { ViewerCollection, ViewerElements, ViewerState } from "./viewer-types";

// Video and Live Photo playback for the shared viewer: the single <video>
// element, the play control and the player bar. Videos stream from Immich's
// playback endpoint; Live Photos play once over their still (ADR 0005).

type PlaybackContext = {
  elements: ViewerElements;
  isOpen(): boolean;
  state: ViewerState;
};

// What the Play button and suspension need beyond playback itself; the
// slideshow is reached through pauseSlideshow, so the two modules stay apart.
export type ViewerMediaContext = PlaybackContext & {
  collection: Pick<ViewerCollection, "isHidden" | "isOpen">;
  pauseSlideshow(): void;
  service: Pick<AlbumService, "loadAssetPlaybackUrl">;
};

export function createAssetViewerPlaybackState(): ViewerState["viewerPlayback"] {
  return {
    assetId: null,
    livePhotoRestarting: false,
    mediaKind: null,
    requestId: 0,
    url: null
  };
}

export function resetViewerPlayback(elements: ViewerElements, state: ViewerState): void {
  state.viewerPlayback.requestId += 1;
  state.viewerPlayback.livePhotoRestarting = false;
  releaseVideo(elements.assetViewerVideo);
  hideViewerPlayer(elements);

  state.viewerPlayback.assetId = null;
  state.viewerPlayback.mediaKind = null;
  state.viewerPlayback.url = null;
}

export function renderViewerPlayControl(
  elements: ViewerElements,
  asset: AlbumAsset,
  previewReady: boolean
): void {
  if (!isViewerPlayableAsset(asset) || (asset.type === "image" && !previewReady)) {
    elements.assetViewerPlay.hidden = true;
    elements.assetViewerPlay.removeAttribute("data-media-kind");
    elements.assetViewerPlay.removeAttribute("data-play-state");
    elements.assetViewerPlay.setAttribute("aria-label", "Play media");
    elements.assetViewerPlay.title = "Play media";
    return;
  }

  const mediaKind = asset.type === "video" ? "video" : "live-photo";
  const label = asset.type === "video" ? "Play video" : "Play live photo";

  elements.assetViewerPlay.hidden = false;
  elements.assetViewerPlay.setAttribute("data-media-kind", mediaKind);
  elements.assetViewerPlay.setAttribute("data-play-state", "idle");
  elements.assetViewerPlay.setAttribute("aria-label", label);
  elements.assetViewerPlay.title = label;
}

export function setViewerPlayControlState(
  elements: ViewerElements,
  asset: AlbumAsset,
  playState: "idle" | "loading" | "playing"
): void {
  const mediaLabel = asset.type === "video" ? "video" : "live photo";
  const actionLabel =
    playState === "playing" ? "Pause" : playState === "loading" ? "Loading" : "Play";
  const label = `${actionLabel} ${mediaLabel}`;

  elements.assetViewerPlay.setAttribute("data-play-state", playState);
  elements.assetViewerPlay.setAttribute("aria-label", label);
  elements.assetViewerPlay.title = label;
}

export function showViewerPlayer(elements: ViewerElements, status: string): void {
  elements.assetViewerPlayer.hidden = false;
  setViewerPlayerStatus(elements, status);
  updateViewerPlayerProgress(elements);
}

export function hideViewerPlayer(elements: ViewerElements): void {
  elements.assetViewerPlayer.hidden = true;
  elements.assetViewerPlayerElapsed.textContent = "0:00";
  elements.assetViewerPlayerDuration.textContent = "0:00";
  elements.assetViewerPlayerStatusText.textContent = "";
  elements.assetViewerPlayerStatus.setAttribute("data-player-state", "idle");
  setViewerProgressWidth(elements.assetViewerPlayerBuffered, 0);
  setViewerProgressWidth(elements.assetViewerPlayerProgress, 0);
}

export function setViewerPlayerStatus(elements: ViewerElements, status: string): void {
  if (!elements.assetViewerPlayer.hidden) {
    const videoMetadata = readSelectedVideoPlayerMetadata(elements);

    elements.assetViewerPlayerStatusText.textContent = videoMetadata || status;
    elements.assetViewerPlayerStatus.setAttribute(
      "data-player-state",
      readViewerPlayerState(status)
    );
  }
}

export function showIdleVideoPlayer(elements: ViewerElements): void {
  const videoMetadata = readSelectedVideoPlayerMetadata(elements);

  elements.assetViewerPlayer.hidden = false;
  elements.assetViewerPlayerElapsed.textContent = "0:00";
  elements.assetViewerPlayerDuration.textContent = "0:00";
  elements.assetViewerPlayerStatusText.textContent = videoMetadata;
  elements.assetViewerPlayerStatus.setAttribute("data-player-state", "paused");
  setViewerProgressWidth(elements.assetViewerPlayerBuffered, 0);
  setViewerProgressWidth(elements.assetViewerPlayerProgress, 0);
}

function readSelectedVideoPlayerMetadata(elements: ViewerElements): string {
  const mediaKind = elements.assetViewerPlay.getAttribute("data-media-kind");

  if (mediaKind !== "video") {
    return "";
  }

  const text = elements.assetViewerPlayerStatus.getAttribute("data-player-metadata");

  return text ? text.trim() : "";
}

export function updateViewerPlayerProgress(elements: ViewerElements): void {
  if (elements.assetViewerPlayer.hidden) {
    return;
  }

  const video = elements.assetViewerVideo;
  const duration = readFiniteMediaTime(video.duration);
  const currentTime = readFiniteMediaTime(video.currentTime);

  elements.assetViewerPlayerElapsed.textContent = formatMediaTime(currentTime);
  elements.assetViewerPlayerDuration.textContent =
    duration > 0 ? formatMediaTime(duration) : "0:00";
  setViewerProgressWidth(
    elements.assetViewerPlayerProgress,
    duration > 0 ? currentTime / duration : 0
  );
  setViewerProgressWidth(elements.assetViewerPlayerBuffered, readBufferedRatio(video, duration));

  if (
    !video.paused &&
    !video.ended &&
    elements.assetViewerPlayerStatus.getAttribute("data-player-state") !== "loading"
  ) {
    setViewerPlayerStatus(elements, "Playing");
  }
}

function readViewerPlayerState(status: string): string {
  const normalizedStatus = status.toLowerCase();

  if (normalizedStatus === "playing" || normalizedStatus === "paused") {
    return normalizedStatus;
  }

  if (normalizedStatus === "buffering" || normalizedStatus === "loading") {
    return "loading";
  }

  if (normalizedStatus === "ended") {
    return "ended";
  }

  return "metadata";
}

function readBufferedRatio(video: HTMLVideoElement, duration: number): number {
  if (duration <= 0 || video.buffered.length === 0) {
    return 0;
  }

  const currentTime = readFiniteMediaTime(video.currentTime);

  for (let index = 0; index < video.buffered.length; index += 1) {
    if (currentTime >= video.buffered.start(index) && currentTime <= video.buffered.end(index)) {
      return video.buffered.end(index) / duration;
    }
  }

  return video.buffered.end(video.buffered.length - 1) / duration;
}

function setViewerProgressWidth(element: HTMLElement, ratio: number): void {
  const clampedRatio = Math.max(0, Math.min(1, ratio));

  element.style.width = `${Math.round(clampedRatio * 1000) / 10}%`;
}

function readFiniteMediaTime(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatMediaTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
}

export function showViewerLoading(elements: ViewerElements): void {
  elements.assetViewerPlaceholder.hidden = false;
  elements.assetViewerSpinner.hidden = false;
  elements.assetViewerPlaceholderMessage.hidden = true;
  elements.assetViewerPlaceholderMessage.textContent = "";
}

export function showViewerMessage(elements: ViewerElements, message: string): void {
  elements.assetViewerPlaceholder.hidden = false;
  elements.assetViewerSpinner.hidden = true;
  elements.assetViewerPlaceholderMessage.hidden = false;
  elements.assetViewerPlaceholderMessage.textContent = message;
}

export async function playViewerVideoElement(
  context: PlaybackContext,
  asset: AlbumAsset,
  url: string
): Promise<void> {
  const { elements, state } = context;
  const video = elements.assetViewerVideo;
  const isLivePhoto = isLivePhotoAsset(asset);

  if (isLivePhoto) {
    state.viewerPlayback.livePhotoRestarting = false;
  }

  video.loop = false;

  if (isLivePhoto) {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.src = url;
  } else if (video.src !== url) {
    video.src = url;
  }

  video.hidden = false;
  video.style.opacity = isLivePhoto ? "0" : "1";
  elements.assetViewerPlaceholder.hidden = true;

  if (asset.type === "video") {
    showViewerPlayer(elements, "Loading");
    clearStill(elements.assetViewerImage);
  } else {
    hideViewerPlayer(elements);
  }

  await video.play();

  const livePhotoFrameReady = isLivePhoto ? await waitForLivePhotoFrame(video) : true;

  if (!context.isOpen() || state.selectedAsset?.asset.id !== asset.id) {
    return;
  }

  if (isLivePhoto) {
    if (!livePhotoFrameReady) {
      finishLivePhotoPlayback(context, asset);
      return;
    }

    video.style.opacity = "1";
  }

  setViewerPlayControlState(elements, asset, "playing");
  setViewerPlayerStatus(elements, "Playing");
  updateViewerPlayerProgress(elements);
}

function waitForLivePhotoFrame(video: HTMLVideoElement): Promise<boolean> {
  if (video.readyState >= 2) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    const initialTime = readFiniteMediaTime(video.currentTime);
    const finish = (ready: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      video.removeEventListener("loadeddata", handleReady);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      window.clearTimeout(timeoutId);
      resolve(ready);
    };
    const handleReady = () => {
      finish(true);
    };
    const handleTimeUpdate = () => {
      if (
        readFiniteMediaTime(video.currentTime) > initialTime ||
        readFiniteMediaTime(video.currentTime) > 0
      ) {
        finish(true);
      }
    };
    const timeoutId = window.setTimeout(() => finish(false), 900);

    video.addEventListener("loadeddata", handleReady);
    video.addEventListener("timeupdate", handleTimeUpdate);
  });
}

export function pauseViewerPlayback(
  elements: ViewerElements,
  state: ViewerState,
  asset: AlbumAsset
): void {
  setViewerPlayControlState(elements, asset, "idle");
  elements.assetViewerVideo.pause();

  if (isLivePhotoAsset(asset)) {
    state.viewerPlayback.livePhotoRestarting = false;
    elements.assetViewerVideo.style.opacity = "0";
    elements.assetViewerVideo.hidden = true;
    hideViewerPlayer(elements);
  } else {
    setViewerPlayerStatus(elements, "Paused");
    updateViewerPlayerProgress(elements);
  }

  state.viewerPlayback.mediaKind = isLivePhotoAsset(asset) ? "live-photo" : "video";
}

export function handleViewerPlaybackEndedEvent(context: PlaybackContext): void {
  const { elements, state } = context;
  const asset = state.selectedAsset?.asset;

  if (!asset || state.viewerPlayback.assetId !== asset.id) {
    return;
  }

  if (isLivePhotoAsset(asset)) {
    finishLivePhotoPlayback(context, asset);
    return;
  }

  setViewerPlayControlState(elements, asset, "idle");
  setViewerPlayerStatus(elements, "Ended");
  updateViewerPlayerProgress(elements);
}

export function handleLivePhotoPlaybackBoundary(context: PlaybackContext): void {
  const { elements, state } = context;
  const asset = state.selectedAsset?.asset;

  if (
    !asset ||
    !isLivePhotoAsset(asset) ||
    state.viewerPlayback.assetId !== asset.id ||
    state.viewerPlayback.livePhotoRestarting ||
    elements.assetViewerPlay.getAttribute("data-play-state") !== "playing"
  ) {
    return;
  }

  const video = elements.assetViewerVideo;
  const duration = readFiniteMediaTime(video.duration);
  const currentTime = readFiniteMediaTime(video.currentTime);

  if (video.ended || (duration > 0 && currentTime >= duration - 0.12)) {
    finishLivePhotoPlayback(context, asset);
  }
}

function finishLivePhotoPlayback(context: PlaybackContext, asset: AlbumAsset): void {
  const { elements, state } = context;

  if (state.selectedAsset?.asset.id !== asset.id || state.viewerPlayback.assetId !== asset.id) {
    return;
  }

  state.viewerPlayback.livePhotoRestarting = false;
  showLivePhotoStill(elements);
  setViewerPlayControlState(elements, asset, "idle");
  elements.assetViewerVideo.pause();
  elements.assetViewerVideo.removeAttribute("src");
  elements.assetViewerVideo.load();
}

function showLivePhotoStill(elements: ViewerElements): void {
  elements.assetViewerVideo.style.opacity = "0";
  elements.assetViewerVideo.hidden = true;

  if (elements.assetViewerImage.src) {
    elements.assetViewerImage.hidden = false;
  }
}

// Play or pause the selected video or Live Photo (the Play button). Playing
// pauses any slideshow first.
export async function toggleViewerPlayback(context: ViewerMediaContext): Promise<void> {
  const { collection, elements, state } = context;
  const asset = state.selectedAsset?.asset;

  if (!asset || !isViewerPlayableAsset(asset)) {
    return;
  }

  context.pauseSlideshow();

  if (
    state.viewerPlayback.assetId === asset.id &&
    elements.assetViewerPlay.getAttribute("data-play-state") === "playing"
  ) {
    pauseViewerPlayback(elements, state, asset);
    return;
  }

  if (state.viewerPlayback.assetId === asset.id && state.viewerPlayback.url) {
    await playViewerVideoElement(context, asset, state.viewerPlayback.url);
    return;
  }

  resetViewerPlayback(elements, state);
  state.viewerPlayback.assetId = asset.id;
  state.viewerPlayback.mediaKind = isLivePhotoAsset(asset) ? "live-photo" : "video";
  state.viewerPlayback.requestId += 1;
  const requestId = state.viewerPlayback.requestId;

  setViewerPlayControlState(elements, asset, "loading");

  if (asset.type === "video") {
    showViewerPlayer(elements, "Loading");
    showViewerLoading(elements);
  }

  try {
    const url = context.service.loadAssetPlaybackUrl(asset);

    if (!url) {
      setViewerPlayControlState(elements, asset, "idle");
      return;
    }

    if (
      !collection.isOpen() ||
      state.selectedAsset?.asset.id !== asset.id ||
      state.viewerPlayback.requestId !== requestId ||
      collection.isHidden()
    ) {
      return;
    }

    state.viewerPlayback.url = url;
    await playViewerVideoElement(context, asset, url);
  } catch {
    if (
      state.viewerPlayback.requestId !== requestId ||
      state.selectedAsset?.asset.id !== asset.id
    ) {
      return;
    }

    resetViewerPlayback(elements, state);
    renderViewerPlayControl(
      elements,
      asset,
      asset.type === "video" || Boolean(state.viewerImages.imageUrls[asset.id])
    );
    showViewerMessage(
      elements,
      asset.type === "video" ? "Could not play this video." : "Could not play this live photo."
    );
  }
}

// The app was hidden: pause the slideshow and playback, and drop a start
// still in progress. Nothing resumes by itself.
export function suspendViewerPlayback(context: ViewerMediaContext): void {
  const { collection, elements, state } = context;

  if (state.viewerSlideshow.playing) {
    context.pauseSlideshow();
  }

  const asset = state.selectedAsset?.asset;

  if (!collection.isOpen() || !asset || state.viewerPlayback.assetId !== asset.id) {
    return;
  }

  const playState = elements.assetViewerPlay.getAttribute("data-play-state");

  if (playState === "playing") {
    pauseViewerPlayback(elements, state, asset);
    return;
  }

  if (playState === "loading") {
    // A pending start would otherwise begin playing after the app returns.
    const stillUrl = state.viewerImages.imageUrls[asset.id];

    resetViewerPlayback(elements, state);
    renderViewerPlayControl(elements, asset, asset.type === "video" || Boolean(stillUrl));

    // Restore the still directly: re-rendering it would re-run video autoplay.
    if (stillUrl) {
      elements.assetViewerImage.src = stillUrl;
      elements.assetViewerImage.hidden = false;
      elements.assetViewerPlaceholder.hidden = true;
      if (asset.type === "video") {
        showIdleVideoPlayer(elements);
      }
    }
  }
}
