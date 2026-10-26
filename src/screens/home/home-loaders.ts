import { localMemoryDate } from "../../domain/home";
import { toUserMessage } from "../../errors/app-error";
import { beginAsyncGeneration, isCurrentGeneration } from "../async-generation";
import {
  type HomeRailId,
  type HomeScreenElements,
  type HomeScreenOptions,
  type HomeScreenState,
  albumLimit,
  clearRail,
  favoriteAssetLimit,
  findNearestEnabledRail,
  getRailState,
  isRailEnabled,
  homeRailDataConcurrency,
  homeRailOrder,
  videoAssetLimit,
  memoryLimit,
  personLimit,
  recentlyAddedAssetLimit,
  readRailFocusId,
  recentlyViewedAssetLimit,
  restoreRailFocus
} from "./home-model";
import { focusActiveRailItem } from "./home-navigation";
import { renderHome } from "./home-rails";
import { cleanupHomeThumbnails } from "./home-thumbnails";

// Loading of each Home rail with focus restoration by item id. Rails load in
// screen order, a few at a time, so the rails on screen fill first (ADR 0016).

// Resolves once every rail of this load has loaded or failed.
export function loadHome(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  shouldFocus: boolean
): Promise<void> {
  const generation = beginAsyncGeneration(state);
  const previousRecentlyAddedAssetId = readRailFocusId(state.recentlyAdded);
  const previousRecentlyViewedAssetId = readRailFocusId(state.recentlyViewed);
  const previousAlbumId = readRailFocusId(state.albums);
  const previousFavoriteAssetId = readRailFocusId(state.favorites);
  const previousVideoAssetId = readRailFocusId(state.videos);
  const previousPersonId = readRailFocusId(state.people);
  const previousMemoryId = readRailFocusId(state.memories);

  state.enabledRails = options.loadEnabledRails();
  state.activeRail =
    findNearestEnabledRail(state.enabledRails, state.activeRail) || "recently-added";
  homeRailOrder.forEach((railId) => {
    if (!isRailEnabled(state, railId)) {
      // A rail that is off keeps nothing, so it has no thumbnails or focus.
      clearRail(state, railId);
      return;
    }

    const rail = getRailState(state, railId);

    rail.loading = true;
    rail.error = null;
  });
  state.recentlyViewed.items = [];
  cleanupHomeThumbnails(options, state);
  renderHome(elements, options, state, generation);

  const railLoaders: Record<HomeRailId, () => Promise<void>> = {
    albums: () =>
      loadAlbumsRail(elements, options, state, generation, previousAlbumId, shouldFocus),
    favorites: () =>
      loadFavoritesRail(elements, options, state, generation, previousFavoriteAssetId, shouldFocus),
    memories: () =>
      loadMemoriesRail(elements, options, state, generation, previousMemoryId, shouldFocus),
    people: () =>
      loadPeopleRail(elements, options, state, generation, previousPersonId, shouldFocus),
    "recently-added": () =>
      loadRecentlyAddedRail(
        elements,
        options,
        state,
        generation,
        previousRecentlyAddedAssetId,
        shouldFocus
      ),
    "recently-viewed": () =>
      loadRecentlyViewedRail(
        elements,
        options,
        state,
        generation,
        previousRecentlyViewedAssetId,
        shouldFocus
      ),
    videos: () =>
      loadVideosRail(elements, options, state, generation, previousVideoAssetId, shouldFocus)
  };

  return runInOrder(
    state.enabledRails.map((railId) => railLoaders[railId]),
    homeRailDataConcurrency,
    () => isCurrentGeneration(state, generation)
  );
}

// Starts tasks in order, at most `limit` at a time. Once `shouldContinue`
// turns false (a newer load began), no further task starts. Resolves when the
// started tasks have finished.
function runInOrder(
  tasks: Array<() => Promise<void>>,
  limit: number,
  shouldContinue: () => boolean
): Promise<void> {
  return new Promise((resolve) => {
    let next = 0;
    let active = 0;

    const startMore = () => {
      while (shouldContinue() && active < limit && next < tasks.length) {
        const task = tasks[next]!;

        next += 1;
        active += 1;
        task()
          .catch(() => undefined)
          .then(() => {
            active -= 1;
            startMore();
          });
      }

      if (active === 0 && (next >= tasks.length || !shouldContinue())) {
        resolve();
      }
    };

    startMore();
  });
}

export async function loadRecentlyAddedRail(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number,
  previousAssetId: string | null,
  shouldFocus: boolean
): Promise<void> {
  try {
    const page = await options.service.loadRecentlyAddedAssets(recentlyAddedAssetLimit);

    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.recentlyAdded.items = page.assets.slice(0, recentlyAddedAssetLimit);
    state.recentlyAdded.more =
      state.recentlyAdded.items.length > 0 &&
      page.total !== null &&
      page.total > state.recentlyAdded.items.length;
    state.recentlyAdded.focusedIndex = restoreRailFocus(state.recentlyAdded, previousAssetId);
    state.recentlyAdded.hasLoaded = true;
    state.recentlyAdded.error = null;
  } catch (error) {
    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.recentlyAdded.items = [];
    state.recentlyAdded.more = false;
    state.recentlyAdded.focusedIndex = 0;
    state.recentlyAdded.hasLoaded = true;
    state.recentlyAdded.error = toUserMessage(error);
  } finally {
    if (isCurrentGeneration(state, generation)) {
      state.recentlyAdded.loading = false;
      renderHome(elements, options, state, generation);
      maybeFocusAfterRailLoad(elements, options, state, shouldFocus);
    }
  }
}

export async function loadRecentlyViewedRail(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number,
  previousAssetId: string | null,
  shouldFocus: boolean
): Promise<void> {
  try {
    const page = await options.history.loadAssets(recentlyViewedAssetLimit);

    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    const focusedAssetId = readRailFocusId(state.recentlyViewed) || previousAssetId;
    state.recentlyViewed.items = page.assets.slice(0, recentlyViewedAssetLimit);
    state.recentlyViewed.more =
      state.recentlyViewed.items.length > 0 &&
      page.total !== null &&
      page.total > state.recentlyViewed.items.length;
    state.recentlyViewed.focusedIndex = restoreRailFocus(state.recentlyViewed, focusedAssetId);
    state.recentlyViewed.hasLoaded = true;
    state.recentlyViewed.error = null;
  } catch (error) {
    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.recentlyViewed.items = [];
    state.recentlyViewed.more = false;
    state.recentlyViewed.focusedIndex = 0;
    state.recentlyViewed.hasLoaded = true;
    state.recentlyViewed.error = toUserMessage(error);
  } finally {
    if (isCurrentGeneration(state, generation)) {
      state.recentlyViewed.loading = false;
      renderHome(elements, options, state, generation);
      maybeFocusAfterRailLoad(elements, options, state, shouldFocus);
    }
  }
}

export async function loadAlbumsRail(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number,
  previousAlbumId: string | null,
  shouldFocus: boolean
): Promise<void> {
  try {
    const albums = await options.service.loadAlbums();

    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.albums.items = albums.slice(0, albumLimit);
    // The Albums screen holds every album, so See more opens it.
    state.albums.more = state.albums.items.length > 0 && albums.length > state.albums.items.length;
    state.albums.focusedIndex = restoreRailFocus(state.albums, previousAlbumId);
    state.albums.hasLoaded = true;
    state.albums.error = null;
  } catch (error) {
    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.albums.items = [];
    state.albums.more = false;
    state.albums.focusedIndex = 0;
    state.albums.hasLoaded = true;
    state.albums.error = toUserMessage(error);
  } finally {
    if (isCurrentGeneration(state, generation)) {
      state.albums.loading = false;
      renderHome(elements, options, state, generation);
      maybeFocusAfterRailLoad(elements, options, state, shouldFocus);
    }
  }
}

export async function loadFavoritesRail(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number,
  previousAssetId: string | null,
  shouldFocus: boolean
): Promise<void> {
  try {
    const page = await options.service.loadFavoriteAssets(favoriteAssetLimit);

    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.favorites.items = page.assets.slice(0, favoriteAssetLimit);
    // The page's total counts every favourite (timeline buckets).
    state.favorites.more =
      state.favorites.items.length > 0 &&
      page.total !== null &&
      page.total > state.favorites.items.length;
    state.favorites.focusedIndex = restoreRailFocus(state.favorites, previousAssetId);
    state.favorites.hasLoaded = true;
    state.favorites.error = null;
  } catch (error) {
    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.favorites.items = [];
    state.favorites.more = false;
    state.favorites.focusedIndex = 0;
    state.favorites.hasLoaded = true;
    state.favorites.error = toUserMessage(error);
  } finally {
    if (isCurrentGeneration(state, generation)) {
      state.favorites.loading = false;
      renderHome(elements, options, state, generation);
      maybeFocusAfterRailLoad(elements, options, state, shouldFocus);
    }
  }
}

export async function loadVideosRail(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number,
  previousAssetId: string | null,
  shouldFocus: boolean
): Promise<void> {
  try {
    const page = await options.service.loadVideoAssets(videoAssetLimit);

    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.videos.items = page.assets.slice(0, videoAssetLimit);
    // A search page reports its own size, so a next page is the signal.
    state.videos.more = state.videos.items.length > 0 && page.nextPageToken !== null;
    state.videos.focusedIndex = restoreRailFocus(state.videos, previousAssetId);
    state.videos.hasLoaded = true;
    state.videos.error = null;
  } catch (error) {
    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.videos.items = [];
    state.videos.more = false;
    state.videos.focusedIndex = 0;
    state.videos.hasLoaded = true;
    state.videos.error = toUserMessage(error);
  } finally {
    if (isCurrentGeneration(state, generation)) {
      state.videos.loading = false;
      renderHome(elements, options, state, generation);
      maybeFocusAfterRailLoad(elements, options, state, shouldFocus);
    }
  }
}

export async function loadPeopleRail(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number,
  previousPersonId: string | null,
  shouldFocus: boolean
): Promise<void> {
  try {
    const page = await options.service.loadPeoplePage(1, personLimit);

    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.people.items = page.people.slice(0, personLimit);
    // See more opens the People browser when Immich has more people.
    state.people.more = state.people.items.length > 0 && page.hasMore;
    state.people.focusedIndex = restoreRailFocus(state.people, previousPersonId);
    state.people.hasLoaded = true;
    state.people.error = null;
  } catch (error) {
    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.people.items = [];
    state.people.more = false;
    state.people.focusedIndex = 0;
    state.people.hasLoaded = true;
    state.people.error = toUserMessage(error);
  } finally {
    if (isCurrentGeneration(state, generation)) {
      state.people.loading = false;
      renderHome(elements, options, state, generation);
      maybeFocusAfterRailLoad(elements, options, state, shouldFocus);
    }
  }
}

export async function loadMemoriesRail(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number,
  previousMemoryId: string | null,
  shouldFocus: boolean
): Promise<void> {
  try {
    // Today's Memory count bounds View all. It needs the statistics
    // permission, so without it the rail offers View all only when full.
    const [memories, total] = await Promise.all([
      options.service.loadMemories(memoryLimit),
      options.service.loadMemoriesTotal(localMemoryDate()).catch(() => null)
    ]);

    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.memories.items = memories.slice(0, memoryLimit);
    state.memories.more =
      state.memories.items.length > 0 &&
      (total === null
        ? state.memories.items.length >= memoryLimit
        : total > state.memories.items.length);
    state.memories.focusedIndex = restoreRailFocus(state.memories, previousMemoryId);
    state.memories.hasLoaded = true;
    state.memories.error = null;
  } catch (error) {
    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.memories.items = [];
    state.memories.more = false;
    state.memories.focusedIndex = 0;
    state.memories.hasLoaded = true;
    state.memories.error = toUserMessage(error);
  } finally {
    if (isCurrentGeneration(state, generation)) {
      state.memories.loading = false;
      renderHome(elements, options, state, generation);
      maybeFocusAfterRailLoad(elements, options, state, shouldFocus);
    }
  }
}

export function maybeFocusAfterRailLoad(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  shouldFocus: boolean
): void {
  if (!shouldFocus && state.contentFocusRequested) {
    focusActiveRailItem(elements, options, state);
  }
}
