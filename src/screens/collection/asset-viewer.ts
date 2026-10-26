import type { AlbumService } from "../../app/album-service";
import type { AlbumAsset } from "../../domain/album";
import type { AppSettings } from "../../domain/app-settings";
import type { ViewingSource } from "../../domain/viewing-history";
import { getKeyCode, isMediaPlayPauseKey, remoteKeys } from "../../platform/tizen/keys";
import { noPassiveViewing, type PassiveViewing } from "../../platform/tizen/screensaver";
import type { AppSettingsStore } from "../../storage/app-settings-store";
import {
  createAssetViewerImageState,
  formatViewerMetadata,
  formatViewerPositionLabel,
  getViewerNavigationIndex,
  reconcileAssetViewerImages,
  revokeAllAssetViewerImages,
  shouldAutoplayViewerVideo
} from "../asset-viewer-window";
import { clearStill, showStill } from "../media-elements";
import { isLivePhotoAsset, isViewerPlayableAsset, readAssetTypeLabel } from "./asset-presentation";
import {
  createAssetViewerPlaybackState,
  handleLivePhotoPlaybackBoundary,
  handleViewerPlaybackEndedEvent,
  hideViewerPlayer,
  pauseViewerPlayback,
  playViewerVideoElement,
  renderViewerPlayControl,
  resetViewerPlayback,
  setViewerPlayControlState,
  setViewerPlayerStatus,
  showIdleVideoPlayer,
  showViewerLoading,
  showViewerMessage,
  showViewerPlayer,
  updateViewerPlayerProgress
} from "./viewer-playback";
import { createViewerFaces, type ViewerFaces } from "./viewer-faces";
import {
  handleViewerSlideshowMediaKey,
  pauseViewerSlideshow,
  renderViewerSlideshowControl,
  stopViewerSlideshow,
  toggleViewerSlideshow,
  type SlideshowContext
} from "./viewer-slideshow";
import type { ViewerCollection, ViewerElements } from "./viewer-types";

// The full-screen viewer over any ordered asset collection: bounded preview
// window (previous/current/next, ADR 0005), metadata, controls, slideshow
// (ADR 0006) and video/Live Photo playback. One instance serves every source.

export type ViewerService = Pick<
  AlbumService,
  "loadAssetFaces" | "loadAssetPlaybackUrl" | "loadAssetViewerStillUrl" | "revokeImageUrl"
>;

type AssetViewerOptions = {
  collection: ViewerCollection;
  elements: ViewerElements;
  onAssetViewed?(asset: AlbumAsset, source: ViewingSource): void;
  // Told while a slideshow runs or a video or Live Photo plays, so the TV's
  // own screensaver stays away during passive viewing (ADR 0019).
  passiveViewing?: PassiveViewing;
  service: ViewerService;
  settingsStore: AppSettingsStore;
};

export type AssetViewerController = {
  // Forget the last viewed asset when a different collection loads.
  clearSelection(): void;
  // Stops viewer activity and releases its media; the collection then shows
  // its grid.
  close(): void;
  destroy(): void;
  focusControls(): void;
  handleKeydown(event: KeyboardEvent, keyCode: number): void;
  handleKeyup(event: KeyboardEvent): void;
  open(index: number): void;
  // Re-render the current asset after the collection's assets changed.
  render(): void;
  // Revoke retained previews and reset the media surface.
  resetImages(): void;
  resetPlayback(): void;
  selectedAsset(): { asset: AlbumAsset; index: number } | null;
  stopSlideshow(): void;
  // Pause slideshow, video and Live Photo motion (app hidden). Nothing
  // resumes automatically.
  suspend(): void;
};

type ViewerContext = AssetViewerOptions &
  SlideshowContext & {
    faces: ViewerFaces;
    isOpen(): boolean;
    // Re-reads whether anything is passively playing and tells the TV.
    syncPassiveViewing(): void;
  };

export function createAssetViewer(options: AssetViewerOptions): AssetViewerController {
  const { collection, elements } = options;
  const passiveHold = (options.passiveViewing || noPassiveViewing).createHold();
  const context: ViewerContext = {
    ...options,
    faces: createViewerFaces({
      currentAsset: () => (collection.isOpen() ? state.selectedAsset?.asset || null : null),
      elements: {
        facesButton: elements.assetViewerFaces,
        facesOverlay: elements.assetViewerFaceOverlay,
        facesStatus: elements.assetViewerFacesStatus,
        image: elements.assetViewerImage,
        video: elements.assetViewerVideo
      },
      isSlideshowPlaying: () => state.viewerSlideshow.playing,
      loadFaces: (assetId) => options.service.loadAssetFaces(assetId),
      // Slideshow is always shown; a pending Play focus still moves on to
      // Play once a video's control appears.
      onFocusedButtonHidden: () => elements.assetViewerSlideshow.focus(),
      settingsStore: options.settingsStore
    }),
    isOpen: () => collection.isOpen(),
    renderCurrent: () => renderAssetViewer(context, collection.index()),
    showSlide(index) {
      collection.select(index);
      resetViewerPlayback(elements, state);
      renderAssetViewer(context, index);
      loadViewerImagesNearFocus(context);
      collection.loadMore();
      focusViewerDefaultControl(context);
    },
    state: {
      recordedAssetId: null,
      selectedAsset: null,
      suppressViewerBackClickUntil: 0,
      viewerBackPointerArmed: false,
      viewerImages: createAssetViewerImageState(),
      viewerPlayFocusPending: false,
      viewerPlayback: createAssetViewerPlaybackState(),
      viewerSlideshow: { playing: false, timerId: null }
    },
    syncPassiveViewing() {
      const video = elements.assetViewerVideo;

      passiveHold.set(
        collection.isOpen() &&
          (state.viewerSlideshow.playing || (!video.hidden && !video.paused && !video.ended))
      );
    }
  };
  const { state } = context;

  const handleViewerBackClick = (event: MouseEvent) => {
    if (!isEventInsideElement(event, elements.assetPlaceholderBack)) {
      return;
    }

    event.preventDefault();
    stopEvent(event);

    if (!state.viewerBackPointerArmed) {
      return;
    }

    state.viewerBackPointerArmed = false;

    if (Date.now() < state.suppressViewerBackClickUntil) {
      state.suppressViewerBackClickUntil = 0;
      return;
    }

    collection.exit();
  };
  const handleViewerPlayClick = (event: MouseEvent) => {
    event.preventDefault();
    stopEvent(event);
    void toggleViewerPlayback(context);
  };
  const handleViewerSlideshowClick = (event: MouseEvent) => {
    event.preventDefault();
    stopEvent(event);
    toggleViewerSlideshow(context);
  };
  const handleViewerFacesClick = (event: MouseEvent) => {
    event.preventDefault();
    stopEvent(event);
    context.faces.toggle();
  };
  // Face tags wait for the photo to decode, and hide while Live Photo motion
  // plays over it.
  const syncViewerFaces = () => {
    context.faces.sync();
  };
  const armViewerBackPointer = (event: Event) => {
    if (collection.isOpen() && isEventInsideElement(event, elements.assetPlaceholderBack)) {
      state.viewerBackPointerArmed = true;
    }
  };
  const disarmViewerBackPointer = () => {
    state.viewerBackPointerArmed = false;
  };
  const handleViewerPlaybackEnded = () => {
    handleViewerPlaybackEndedEvent(context);
    context.faces.sync();
    context.syncPassiveViewing();
  };
  const handleViewerPlaybackProgress = () => {
    updateViewerPlayerProgress(elements);
    handleLivePhotoPlaybackBoundary(context);
  };
  const handleViewerPlaybackStateChange = () => {
    handleLivePhotoPlaybackBoundary(context);

    if (!elements.assetViewerPlayer.hidden) {
      setViewerPlayerStatus(elements, elements.assetViewerVideo.paused ? "Paused" : "Playing");
    }

    updateViewerPlayerProgress(elements);
    context.faces.sync();
    context.syncPassiveViewing();
  };
  const handlePassiveViewingChange = () => {
    context.syncPassiveViewing();
  };
  const handleViewerPlaybackWaiting = () => {
    setViewerPlayerStatus(elements, "Buffering");
    updateViewerPlayerProgress(elements);
  };
  const stopViewerPlayPointer = (event: Event) => {
    stopEvent(event);
  };
  const listeners: Array<[EventTarget, string, EventListener, boolean?]> = [
    [elements.assetPlaceholderBack, "click", handleViewerBackClick as EventListener],
    [elements.assetPlaceholderBack, "mousedown", armViewerBackPointer],
    [elements.assetPlaceholderBack, "pointerdown", armViewerBackPointer],
    [elements.assetPlaceholderBack, "pointerleave", disarmViewerBackPointer],
    [elements.assetViewerPlay, "click", handleViewerPlayClick as EventListener, true],
    [elements.assetViewerPlay, "mousedown", stopViewerPlayPointer],
    [elements.assetViewerPlay, "pointerdown", stopViewerPlayPointer],
    [elements.assetViewerSlideshow, "click", handleViewerSlideshowClick as EventListener, true],
    [elements.assetViewerSlideshow, "mousedown", stopViewerPlayPointer],
    [elements.assetViewerSlideshow, "pointerdown", stopViewerPlayPointer],
    [elements.assetViewerFaces, "click", handleViewerFacesClick as EventListener, true],
    [elements.assetViewerFaces, "mousedown", stopViewerPlayPointer],
    [elements.assetViewerFaces, "pointerdown", stopViewerPlayPointer],
    [elements.assetViewerImage, "load", syncViewerFaces],
    [elements.assetViewerVideo, "durationchange", handleViewerPlaybackProgress],
    [elements.assetViewerVideo, "emptied", handlePassiveViewingChange],
    [elements.assetViewerVideo, "ended", handleViewerPlaybackEnded],
    [elements.assetViewerVideo, "loadedmetadata", handleViewerPlaybackProgress],
    [elements.assetViewerVideo, "pause", handleViewerPlaybackStateChange],
    [elements.assetViewerVideo, "playing", handleViewerPlaybackStateChange],
    [elements.assetViewerVideo, "progress", handleViewerPlaybackProgress],
    [elements.assetViewerVideo, "timeupdate", handleViewerPlaybackProgress],
    [elements.assetViewerVideo, "waiting", handleViewerPlaybackWaiting]
  ];

  listeners.forEach(([target, type, listener, capture]) =>
    target.addEventListener(type, listener, capture)
  );

  return {
    clearSelection() {
      state.selectedAsset = null;
    },
    close() {
      state.viewerBackPointerArmed = false;
      state.viewerPlayFocusPending = false;
      state.suppressViewerBackClickUntil = 0;
      stopViewerSlideshow(context);
      elements.assetPlaceholder.hidden = true;
      resetViewerPlayback(elements, state);
      resetViewerImages(context);
      passiveHold.set(false);
    },
    destroy() {
      passiveHold.set(false);
      listeners.forEach(([target, type, listener, capture]) =>
        target.removeEventListener(type, listener, capture)
      );
    },
    focusControls() {
      const control = getVisibleViewerControls(elements)[0];

      if (control) {
        control.focus();
      }
    },
    handleKeydown(event, keyCode) {
      handleAssetViewerKeydown(event, keyCode, context);
    },
    handleKeyup(event) {
      if (!collection.isOpen() || getKeyCode(event) !== remoteKeys.enter) {
        return;
      }

      if (state.selectedAsset && isViewerPlayableAsset(state.selectedAsset.asset)) {
        event.preventDefault();
        stopEvent(event);
      }
    },
    open(index) {
      showAssetViewer(context, index);
    },
    render() {
      renderAssetViewer(context, collection.index());
      loadViewerImagesNearFocus(context);
    },
    resetImages() {
      resetViewerImages(context);
    },
    resetPlayback() {
      resetViewerPlayback(elements, state);
    },
    selectedAsset() {
      return state.selectedAsset;
    },
    stopSlideshow() {
      stopViewerSlideshow(context);
    },
    suspend() {
      suspendViewerPlayback(context);
      context.syncPassiveViewing();
    }
  };
}

function isEventInsideElement(event: Event, element: HTMLElement): boolean {
  const target = event.target as Node | null;

  return Boolean(target && element.contains(target));
}

function stopEvent(event: Event): void {
  event.stopPropagation();

  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
  }
}

function activeElementOf(elements: ViewerElements): Element | null {
  return elements.assetPlaceholder.ownerDocument.activeElement;
}

function handleAssetViewerKeydown(
  event: KeyboardEvent,
  keyCode: number,
  context: ViewerContext
): void {
  const { collection, elements, state } = context;

  if (keyCode === remoteKeys.back) {
    event.preventDefault();
    collection.exit();
    return;
  }

  if (isMediaPlayPauseKey(keyCode)) {
    event.preventDefault();
    handleViewerSlideshowMediaKey(keyCode, context);
    return;
  }

  if (keyCode === remoteKeys.left || keyCode === remoteKeys.right) {
    event.preventDefault();
    pauseViewerSlideshow(context);
    moveViewerFocus(keyCode, context);
    return;
  }

  if (keyCode === remoteKeys.up || keyCode === remoteKeys.down) {
    event.preventDefault();
    state.viewerPlayFocusPending = false;
    moveViewerControlFocus(keyCode, elements);
    return;
  }

  if (keyCode === remoteKeys.enter) {
    event.preventDefault();
    stopEvent(event);

    if (activeElementOf(elements) === elements.assetViewerSlideshow) {
      toggleViewerSlideshow(context);
      return;
    }

    if (activeElementOf(elements) === elements.assetViewerFaces) {
      context.faces.toggle();
      return;
    }

    if (activeElementOf(elements) === elements.assetPlaceholderBack) {
      collection.exit();
      return;
    }

    if (
      activeElementOf(elements) === elements.assetViewerPlay &&
      state.selectedAsset &&
      isViewerPlayableAsset(state.selectedAsset.asset) &&
      !elements.assetViewerPlay.hidden
    ) {
      state.viewerPlayFocusPending = false;
      state.suppressViewerBackClickUntil = Date.now() + 5000;
      elements.assetViewerPlay.focus();
      void toggleViewerPlayback(context);
      return;
    }

    if (elements.assetViewerPlay.hidden) {
      toggleViewerSlideshow(context);
      return;
    }

    state.viewerPlayFocusPending = false;
  }
}

function moveViewerControlFocus(keyCode: number, elements: ViewerElements): void {
  const activeElement = activeElementOf(elements);
  const controls = getVisibleViewerControls(elements);
  const activeIndex = controls.indexOf(activeElement as HTMLButtonElement);

  if (controls.length === 0) {
    return;
  }

  if (activeIndex < 0) {
    const firstControl = controls[0];
    if (firstControl) {
      firstControl.focus();
    }

    return;
  }

  const offset = keyCode === remoteKeys.up ? -1 : 1;
  const nextIndex = Math.max(0, Math.min(controls.length - 1, activeIndex + offset));
  const nextControl = controls[nextIndex];

  if (nextControl) {
    nextControl.focus();
  }
}

function getVisibleViewerControls(elements: ViewerElements): HTMLButtonElement[] {
  return [
    elements.assetViewerPlay,
    elements.assetViewerSlideshow,
    elements.assetViewerFaces,
    elements.assetPlaceholderBack
  ].filter((button) => !button.hidden);
}

function showAssetViewer(context: ViewerContext, index: number): void {
  const { collection, elements, state } = context;
  const asset = collection.assets()[index];

  if (!asset) {
    return;
  }

  state.selectedAsset = { asset, index };
  // Opening the viewer is always a visit, even on the asset last shown.
  state.recordedAssetId = null;
  collection.select(index);
  elements.assetPlaceholder.hidden = false;
  resetViewerPlayback(elements, state);
  renderAssetViewer(context, index);
  loadViewerImagesNearFocus(context);
  collection.loadMore();
  focusViewerDefaultControl(context);
}

function renderAssetViewer(context: ViewerContext, index: number): void {
  const { collection, elements, state } = context;
  const asset = collection.assets()[index];

  if (!asset) {
    return;
  }

  if (state.viewerPlayback.assetId && state.viewerPlayback.assetId !== asset.id) {
    resetViewerPlayback(elements, state);
  }
  state.selectedAsset = { asset, index };
  const source = collection.viewingSource();

  if (source && state.recordedAssetId !== asset.id) {
    state.recordedAssetId = asset.id;
    context.onAssetViewed?.(asset, source);
  }
  renderViewerMetadata(elements, asset, context.settingsStore.load());
  renderViewerPlayControl(elements, asset, asset.type === "video");
  elements.assetPlaceholderSummary.textContent = formatViewerPositionLabel(
    index,
    collection.assets().length,
    collection.total(),
    collection.absoluteIndex(index)
  );
  renderViewerSlideshowControl(context);
  context.faces.sync();

  if (asset.type !== "image") {
    clearStill(elements.assetViewerImage);
    if (asset.type === "video") {
      const videoPosterUrl = state.viewerImages.imageUrls[asset.id];

      if (videoPosterUrl) {
        renderViewerImage(context, asset, index, videoPosterUrl);
        return;
      }

      hideViewerPlayer(elements);
      showIdleVideoPlayer(elements);
      elements.assetViewerVideo.hidden = true;
      elements.assetViewerVideo.removeAttribute("src");
      showViewerLoading(elements);
      return;
    }

    hideViewerPlayer(elements);
    showViewerMessage(
      elements,
      `${readAssetTypeLabel(asset)} viewing is planned for a later milestone.`
    );
    return;
  }

  const url = state.viewerImages.imageUrls[asset.id];

  if (url) {
    renderViewerImage(context, asset, index, url);
    return;
  }

  clearStill(elements.assetViewerImage);
  elements.assetViewerVideo.hidden = true;
  elements.assetViewerVideo.removeAttribute("src");
  hideViewerPlayer(elements);
  showViewerLoading(elements);
}

function autoplayViewerVideoIfEnabled(context: ViewerContext, asset: AlbumAsset): void {
  const { elements, state } = context;

  if (
    !shouldAutoplayViewerVideo({
      assetType: asset.type,
      autoplayVideos: context.settingsStore.load().autoplayVideos,
      playControlHidden: elements.assetViewerPlay.hidden,
      playbackAssetId: state.viewerPlayback.assetId,
      selectedAssetId: asset.id,
      slideshowPlaying: state.viewerSlideshow.playing
    })
  ) {
    return;
  }

  void toggleViewerPlayback(context);
}

function renderViewerMetadata(
  elements: ViewerElements,
  asset: AlbumAsset,
  settings: AppSettings
): void {
  const metadata = formatViewerMetadata(asset);

  elements.assetViewerTitle.textContent = "";
  elements.assetViewerExif.textContent = "";
  elements.assetViewerExif.hidden = true;
  elements.assetViewerPlayerStatus.removeAttribute("data-player-metadata");

  if (settings.showViewerDate) {
    appendMetadataLine(elements.assetViewerTitle, "asset-viewer-date", metadata.date);
  }

  if (settings.showViewerTime) {
    appendMetadataLine(elements.assetViewerTitle, "asset-viewer-time", metadata.time);
  }

  if (settings.showViewerExif && metadata.location) {
    if (asset.type === "video") {
      elements.assetViewerPlayerStatus.setAttribute("data-player-metadata", metadata.location);
      elements.assetViewerPlayerStatusText.textContent = metadata.location;
      elements.assetViewerPlayerStatus.setAttribute("data-player-state", "metadata");
    } else {
      elements.assetViewerExif.textContent = metadata.location;
      elements.assetViewerExif.hidden = false;
    }
  }
}

function appendMetadataLine(container: HTMLElement, className: string, value: string): void {
  if (!value) {
    return;
  }

  const line = container.ownerDocument.createElement("span");
  line.className = className;
  line.textContent = value;
  container.appendChild(line);
}

function moveViewerFocus(keyCode: number, context: ViewerContext): void {
  const { collection } = context;
  const direction = keyCode === remoteKeys.left ? "left" : "right";
  const currentIndex = collection.index();
  const nextIndex = getViewerNavigationIndex(currentIndex, direction, collection.assets().length);

  if (nextIndex === currentIndex) {
    if (direction === "left") {
      collection.loadPrevious("move");
    } else {
      collection.loadMore();
    }
    return;
  }

  collection.select(nextIndex);
  renderAssetViewer(context, nextIndex);
  loadViewerImagesNearFocus(context);
  collection.loadPrevious("prefetch");
  collection.loadMore();
  focusViewerDefaultControl(context);
}

function focusViewerDefaultControl(context: ViewerContext): void {
  const { collection, elements, state } = context;
  const asset = collection.assets()[collection.index()];

  if (!state.viewerSlideshow.playing && asset && isViewerPlayableAsset(asset)) {
    if (!elements.assetViewerPlay.hidden) {
      state.viewerPlayFocusPending = false;
      elements.assetViewerPlay.focus();
      return;
    }

    state.viewerPlayFocusPending = true;
    return;
  }

  state.viewerPlayFocusPending = false;
  elements.assetViewerSlideshow.focus();
}

async function toggleViewerPlayback(context: ViewerContext): Promise<void> {
  const { collection, elements, state } = context;
  const asset = state.selectedAsset?.asset;

  if (!asset || !isViewerPlayableAsset(asset)) {
    return;
  }

  pauseViewerSlideshow(context);

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

function suspendViewerPlayback(context: ViewerContext): void {
  const { collection, elements, state } = context;

  if (state.viewerSlideshow.playing) {
    pauseViewerSlideshow(context);
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

function loadViewerImagesNearFocus(context: ViewerContext): void {
  const { collection, state } = context;

  reconcileAssetViewerImages({
    assets: collection.assets(),
    currentIndex: collection.index(),
    generation: collection.generation(),
    isCurrentGeneration: (viewerGeneration) => collection.isCurrentGeneration(viewerGeneration),
    isHidden: () => collection.isHidden() || !collection.isOpen(),
    loadImageUrl: (asset) => context.service.loadAssetViewerStillUrl(asset),
    onImageLoadFailed: (asset, index) => renderViewerImageFailure(context, asset, index),
    onImageLoaded: (asset, index, url) => renderViewerImage(context, asset, index, url),
    revokeImageUrl: context.service.revokeImageUrl,
    state: state.viewerImages
  });
}

function renderViewerImage(
  context: ViewerContext,
  asset: AlbumAsset,
  index: number,
  url: string
): void {
  const { collection, elements, state } = context;

  if (
    !collection.isOpen() ||
    collection.index() !== index ||
    collection.assets()[index]?.id !== asset.id
  ) {
    return;
  }

  if (
    asset.type === "video" &&
    state.viewerPlayback.assetId === asset.id &&
    !elements.assetViewerVideo.hidden
  ) {
    return;
  }

  elements.assetViewerVideo.hidden = true;
  elements.assetViewerVideo.style.opacity = "";
  elements.assetViewerVideo.removeAttribute("src");
  hideViewerPlayer(elements);
  if (asset.type === "video") {
    showIdleVideoPlayer(elements);
  }
  showStill(elements.assetViewerImage, asset, url);
  elements.assetViewerPlaceholder.hidden = true;
  renderViewerPlayControl(elements, asset, true);
  autoplayViewerVideoIfEnabled(context, asset);
  context.faces.sync();

  if (
    state.viewerPlayFocusPending &&
    isViewerPlayableAsset(asset) &&
    !elements.assetViewerPlay.hidden
  ) {
    state.viewerPlayFocusPending = false;
    elements.assetViewerPlay.focus();
  }
}

function renderViewerImageFailure(context: ViewerContext, asset: AlbumAsset, index: number): void {
  const { collection, elements } = context;

  if (
    !collection.isOpen() ||
    collection.index() !== index ||
    collection.assets()[index]?.id !== asset.id
  ) {
    return;
  }

  clearStill(elements.assetViewerImage);
  renderViewerPlayControl(elements, asset, false);
  showViewerMessage(
    elements,
    asset.type === "video"
      ? "Could not load this video thumbnail."
      : "Could not load this photo preview."
  );
}

function resetViewerImages(context: ViewerContext): void {
  const { elements, state } = context;
  const previousImages = state.viewerImages;

  revokeAllAssetViewerImages(previousImages, context.service.revokeImageUrl);
  state.viewerImages = createAssetViewerImageState();
  state.viewerPlayFocusPending = false;
  context.faces.reset();
  clearStill(elements.assetViewerImage);
  elements.assetViewerImage.removeAttribute("data-asset-id");
  resetViewerPlayback(elements, state);
  elements.assetViewerPlaceholder.hidden = false;
  elements.assetViewerSpinner.hidden = true;
  elements.assetViewerPlaceholderMessage.hidden = false;
  elements.assetViewerPlaceholderMessage.textContent = "";
  elements.assetViewerPlay.hidden = true;
  elements.assetViewerPlay.removeAttribute("data-media-kind");
  elements.assetViewerPlay.removeAttribute("data-play-state");
}
