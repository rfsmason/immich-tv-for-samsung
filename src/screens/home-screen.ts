import { getKeyCode, remoteKeys } from "../platform/tizen/keys";
import { createAssetThumbnailState } from "./asset-thumbnail-window";
import { invalidateAsyncGeneration } from "./async-generation";
import { createPriorityScheduler } from "./priority-scheduler";
import { loadHome, loadRecentlyViewedRail } from "./home/home-loaders";
import {
  type HomeScreenElements,
  type HomeScreenOptions,
  type HomeScreenState,
  createAlbumThumbnailState,
  createPersonThumbnailState,
  createRailState,
  getAssetRailState,
  hasLoadedAnyHomeRail,
  isRailEnabled,
  homeThumbnailRequestLimit,
  isHomeLoading,
  readRailFocusId,
  resetHomeRails
} from "./home/home-model";
import {
  activateFocusedTile,
  focusActiveRailItem,
  handleTileActivation,
  isHomeRailNavigationActive,
  moveHomeFocus
} from "./home/home-navigation";
import { alignHomeRails, renderHome } from "./home/home-rails";
import { cleanupHomeThumbnails } from "./home/home-thumbnails";

// Home: six independently loading, bounded rails that open the shared
// collection screen and viewer (ADR 0009). Rail data, thumbnails, rendering,
// navigation and loading live in src/screens/home/.

export type HomeScreenController = {
  destroy(): void;
  focusContent(lastViewedAssetId?: string): void;
  hide(): void;
  refresh(): void;
  // Re-aligns the rails, for example once Home first becomes visible: a
  // hidden Home has no layout to align against.
  relayout(): void;
  // Forgets the rails and their focus, as at launch; Home loads afresh when
  // next shown.
  reset(): void;
  show(): void;
  // Resolves once every rail of the latest load has loaded or failed.
  whenLoaded(): Promise<void>;
};

export function mountHomeScreen(options: HomeScreenOptions): HomeScreenController {
  const documentRef = options.documentRef || document;
  const elements = readElements(documentRef);
  const state: HomeScreenState = {
    activeRail: "recently-added",
    enabledRails: options.loadEnabledRails(),
    refreshPending: false,
    albumThumbnails: createAlbumThumbnailState(),
    albums: createRailState(),
    contentFocusRequested: false,
    favorites: createRailState(),
    favoriteThumbnails: createAssetThumbnailState(),
    loadGeneration: 0,
    memories: createRailState(),
    memoryThumbnails: createAssetThumbnailState(),
    people: createRailState(),
    personThumbnails: createPersonThumbnailState(),
    recentlyAdded: createRailState(),
    recentlyAddedThumbnails: createAssetThumbnailState(),
    recentlyViewed: createRailState(),
    recentlyViewedThumbnails: createAssetThumbnailState(),
    videos: createRailState(),
    videoThumbnails: createAssetThumbnailState(),
    homeLoad: null,
    thumbnailScheduler: createPriorityScheduler(homeThumbnailRequestLimit)
  };

  const handleDocumentKeydown = (event: KeyboardEvent) => {
    if (elements.root.hidden) {
      return;
    }

    handleKeydown(event, documentRef, elements, options, state);

    // Opening a child screen makes its document listener active immediately.
    // Keep the same remote press from activating that screen's focused control.
    if (event.defaultPrevented) {
      event.stopImmediatePropagation();
    }
  };
  const handleOpenSettingsClick = (event: MouseEvent) => {
    event.preventDefault();
    options.onOpenSettings();
  };
  const handleRailClick = (event: MouseEvent) => {
    if (elements.root.hidden) {
      return;
    }

    handleTileActivation(event, elements, options, state);
  };

  documentRef.addEventListener("keydown", handleDocumentKeydown);
  elements.openSettingsButton.addEventListener("click", handleOpenSettingsClick);
  elements.recentlyAddedRail.addEventListener("click", handleRailClick);
  elements.albumsRail.addEventListener("click", handleRailClick);
  elements.favoritesRail.addEventListener("click", handleRailClick);
  elements.videosRail.addEventListener("click", handleRailClick);
  elements.peopleRail.addEventListener("click", handleRailClick);
  elements.recentlyViewedRail.addEventListener("click", handleRailClick);
  elements.memoriesRail.addEventListener("click", handleRailClick);

  // Waits for the latest load: if Home reloads meanwhile (a refresh, or a
  // resume), it waits for that one too.
  function whenLoaded(): Promise<void> {
    const current = state.homeLoad;

    if (!current) {
      return Promise.resolve();
    }

    return current.then(() => (state.homeLoad === current ? undefined : whenLoaded()));
  }

  return {
    destroy() {
      documentRef.removeEventListener("keydown", handleDocumentKeydown);
      elements.openSettingsButton.removeEventListener("click", handleOpenSettingsClick);
      elements.recentlyAddedRail.removeEventListener("click", handleRailClick);
      elements.albumsRail.removeEventListener("click", handleRailClick);
      elements.favoritesRail.removeEventListener("click", handleRailClick);
      elements.videosRail.removeEventListener("click", handleRailClick);
      elements.peopleRail.removeEventListener("click", handleRailClick);
      elements.recentlyViewedRail.removeEventListener("click", handleRailClick);
      elements.memoriesRail.removeEventListener("click", handleRailClick);
      invalidateAsyncGeneration(state);
      cleanupHomeThumbnails(options, state);
    },
    focusContent(lastViewedAssetId) {
      if (
        lastViewedAssetId &&
        (state.activeRail === "recently-added" ||
          state.activeRail === "recently-viewed" ||
          state.activeRail === "favorites" ||
          state.activeRail === "videos")
      ) {
        const rail = getAssetRailState(state, state.activeRail);
        const index = rail.items.findIndex((asset) => asset.id === lastViewedAssetId);

        if (index >= 0) {
          rail.focusedIndex = index;
        }
      }

      state.contentFocusRequested = true;
      focusActiveRailItem(elements, options, state);
    },
    hide() {
      invalidateAsyncGeneration(state);
      elements.root.hidden = true;
      state.contentFocusRequested = false;
      state.recentlyAdded.loading = false;
      state.albums.loading = false;
      state.favorites.loading = false;
      state.videos.loading = false;
      state.people.loading = false;
      state.recentlyViewed.loading = false;
      state.memories.loading = false;
      cleanupHomeThumbnails(options, state);
    },
    // Reloads every rail without moving focus (the rail's Refresh, or a
    // connection change).
    refresh() {
      if (elements.root.hidden) {
        state.refreshPending = true;
        return;
      }

      state.homeLoad = loadHome(elements, options, state, false);
    },
    relayout() {
      alignHomeRails(elements, state);
    },
    reset() {
      invalidateAsyncGeneration(state);
      cleanupHomeThumbnails(options, state);
      resetHomeRails(state);
      state.refreshPending = true;
    },
    whenLoaded,
    show() {
      elements.root.hidden = false;

      // Rails turned on or off in Settings apply now, with a fresh load.
      if (options.loadEnabledRails().join() !== state.enabledRails.join()) {
        state.refreshPending = true;
      }

      if (state.refreshPending || (!hasLoadedAnyHomeRail(state) && !isHomeLoading(state))) {
        state.refreshPending = false;
        state.homeLoad = loadHome(elements, options, state, false);
        return;
      }

      renderHome(elements, options, state, state.loadGeneration);
      if (isRailEnabled(state, "recently-viewed")) {
        state.recentlyViewed.loading = true;
        void loadRecentlyViewedRail(
          elements,
          options,
          state,
          state.loadGeneration,
          readRailFocusId(state.recentlyViewed),
          false
        );
      }
      if (state.contentFocusRequested) {
        focusActiveRailItem(elements, options, state);
      }
    }
  };
}

function readElements(documentRef: Document): HomeScreenElements {
  return {
    empty: requireElement(documentRef, "home-empty"),
    openSettingsButton: requireElement<HTMLButtonElement>(documentRef, "home-open-settings"),
    albumsRail: requireElement(documentRef, "home-albums-rail"),
    albumsStatus: requireElement(documentRef, "home-albums-status"),
    favoritesRail: requireElement(documentRef, "home-favorites-rail"),
    favoritesStatus: requireElement(documentRef, "home-favorites-status"),
    videosRail: requireElement(documentRef, "home-videos-rail"),
    videosStatus: requireElement(documentRef, "home-videos-status"),
    memoriesRail: requireElement(documentRef, "home-memories-rail"),
    memoriesStatus: requireElement(documentRef, "home-memories-status"),
    peopleRail: requireElement(documentRef, "home-people-rail"),
    peopleStatus: requireElement(documentRef, "home-people-status"),
    recentlyAddedRail: requireElement(documentRef, "home-recently-added-rail"),
    recentlyAddedStatus: requireElement(documentRef, "home-recently-added-status"),
    recentlyViewedRail: requireElement(documentRef, "home-recently-viewed-rail"),
    recentlyViewedStatus: requireElement(documentRef, "home-recently-viewed-status"),
    root: requireElement(documentRef, "home-screen")
  };
}

function requireElement<T extends HTMLElement>(documentRef: Document, id: string): T {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as T;
}

function handleKeydown(
  event: KeyboardEvent,
  documentRef: Document,
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState
): void {
  const keyCode = getKeyCode(event);

  if (keyCode === remoteKeys.back) {
    event.preventDefault();
    options.onReturnToShell();
    return;
  }

  if (documentRef.activeElement === elements.openSettingsButton) {
    if (keyCode === remoteKeys.enter) {
      event.preventDefault();
      options.onOpenSettings();
    } else if (keyCode === remoteKeys.left) {
      event.preventDefault();
      options.onReturnToShell();
    }
    return;
  }

  if (keyCode === remoteKeys.enter) {
    if (activateFocusedTile(documentRef, options, state)) {
      event.preventDefault();
      return;
    }
  }

  if (!isHomeRailNavigationActive(documentRef, elements)) {
    return;
  }

  if (
    keyCode === remoteKeys.left ||
    keyCode === remoteKeys.right ||
    keyCode === remoteKeys.up ||
    keyCode === remoteKeys.down
  ) {
    event.preventDefault();
    moveHomeFocus(keyCode, elements, options, state);
  }
}
