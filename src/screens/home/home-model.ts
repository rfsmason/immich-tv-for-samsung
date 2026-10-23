import type { AlbumService } from "../../app/album-service";
import type { ViewingHistoryService } from "../../app/viewing-history-service";
import type { Album, AlbumAsset } from "../../domain/album";
import { homeRailOrder, type HomeRailId, type Memory, type Person } from "../../domain/home";
import type { AssetThumbnailState } from "../asset-thumbnail-window";
import type { PriorityScheduler } from "../priority-scheduler";
import type { BackdropSource } from "../screen-backdrop";

// Home screen data: the seven rails, their bounded item lists and thumbnail
// state, and small lookups shared by the Home modules (ADR 0009).

// Each rail shows at most 18 items.
export const recentlyAddedAssetLimit = 18;
export const recentlyViewedAssetLimit = 18;
export const albumLimit = 18;
export const favoriteAssetLimit = 18;
export const videoAssetLimit = 18;
export const memoryLimit = 18;
export const personLimit = 18;

// Loading order (ADR 0016). Rail data loads in screen order, two rails at a
// time, and every rail's thumbnails share one queue of at most six requests,
// about as many connections as the TV keeps open to one server, so the rails
// on screen fill first and lower rails never wait out their timeouts behind
// the rest.
export const homeRailDataConcurrency = 2;
export const homeThumbnailRequestLimit = 6;

export { homeRailOrder, type HomeRailId };

export type HomeAssetRailId = Extract<
  HomeRailId,
  "recently-added" | "favorites" | "videos" | "recently-viewed"
>;

export type HomeScreenElements = {
  backdrop: HTMLImageElement;
  // Shown instead of the rails when every rail is turned off in Settings.
  empty: HTMLElement;
  openSettingsButton: HTMLButtonElement;
  albumsRail: HTMLElement;
  albumsStatus: HTMLElement;
  favoritesRail: HTMLElement;
  favoritesStatus: HTMLElement;
  memoriesRail: HTMLElement;
  memoriesStatus: HTMLElement;
  peopleRail: HTMLElement;
  peopleStatus: HTMLElement;
  recentlyAddedRail: HTMLElement;
  recentlyAddedStatus: HTMLElement;
  recentlyViewedRail: HTMLElement;
  recentlyViewedStatus: HTMLElement;
  root: HTMLElement;
  videosRail: HTMLElement;
  videosStatus: HTMLElement;
};

export type HomeScreenOptions = {
  // Pictures for the backdrop: random favourites.
  backdrop?: BackdropSource;
  documentRef?: Document;
  // The rails Settings turns on, in screen order. Read at each load.
  loadEnabledRails(): HomeRailId[];
  onOpenAlbum(album: Album): void;
  // Opens the rail's full collection, starting from its loaded items.
  onOpenAssetCollection(input: {
    assets: AlbumAsset[];
    // How the collection was entered: a rail item, or the rail's See more.
    entry: "item" | "see-more";
    index: number;
    rail: HomeAssetRailId;
    title: string;
  }): void;
  onOpenPerson(person: Person): void;
  onOpenMemory(memory: Memory): void;
  onBrowseMemories(): void;
  // See more on the People rail.
  onBrowsePeople(): void;
  // See more on the Albums rail.
  onBrowseAlbums(): void;
  onOpenSettings(): void;
  onReturnToShell(): void;
  service: AlbumService;
  history: Pick<ViewingHistoryService, "loadAssets">;
};

export type HomeRailState<T> = {
  error: string | null;
  focusedIndex: number;
  hasLoaded: boolean;
  items: T[];
  loading: boolean;
  // Whether more items of this kind exist than the rail shows, which is when
  // the rail ends with a See more tile (at index items.length).
  more: boolean;
};

// Restores focus to the See more tile across reloads.
export const seeMoreFocusId = "see-more";

export type AlbumThumbnailState = {
  retainedAlbumIds: Record<string, true>;
  thumbnailRequests: Record<string, number>;
  thumbnailUrls: Record<string, string>;
};

export type HomeScreenState = {
  activeRail: HomeRailId;
  // The rails shown, in screen order, as Settings had them at the last load.
  // Rails that are off are not loaded, rendered or reachable.
  enabledRails: HomeRailId[];
  // Settles once every rail of the latest load has loaded or failed.
  homeLoad: Promise<void> | null;
  // One queue for every rail's thumbnails; see homeThumbnailPriority.
  thumbnailScheduler: PriorityScheduler;
  // A refresh asked for while Home was hidden; it runs on the next show.
  refreshPending: boolean;
  albumThumbnails: AlbumThumbnailState;
  albums: HomeRailState<Album>;
  contentFocusRequested: boolean;
  favorites: HomeRailState<AlbumAsset>;
  favoriteThumbnails: AssetThumbnailState;
  loadGeneration: number;
  memories: HomeRailState<Memory>;
  memoryThumbnails: AssetThumbnailState;
  people: HomeRailState<Person>;
  personThumbnails: PersonThumbnailState;
  recentlyAdded: HomeRailState<AlbumAsset>;
  recentlyAddedThumbnails: AssetThumbnailState;
  recentlyViewed: HomeRailState<AlbumAsset>;
  recentlyViewedThumbnails: AssetThumbnailState;
  videos: HomeRailState<AlbumAsset>;
  videoThumbnails: AssetThumbnailState;
};

export type PersonThumbnailState = {
  retainedPersonIds: Record<string, true>;
  thumbnailRequests: Record<string, number>;
  thumbnailUrls: Record<string, string>;
};

export function createRailState<T>(): HomeRailState<T> {
  return {
    error: null,
    focusedIndex: 0,
    hasLoaded: false,
    items: [],
    loading: false,
    more: false
  };
}

// Home as it is at launch: nothing loaded, the first rail active and every
// rail at its start.
export function resetHomeRails(state: HomeScreenState): void {
  state.activeRail = "recently-added";
  state.contentFocusRequested = false;
  state.albums = createRailState();
  state.favorites = createRailState();
  state.memories = createRailState();
  state.people = createRailState();
  state.recentlyAdded = createRailState();
  state.recentlyViewed = createRailState();
  state.videos = createRailState();
}

// Empties one rail, as at launch.
export function clearRail(state: HomeScreenState, railId: HomeRailId): void {
  Object.assign(getRailState(state, railId), createRailState());
}

export function createAlbumThumbnailState(): AlbumThumbnailState {
  return {
    retainedAlbumIds: {},
    thumbnailRequests: {},
    thumbnailUrls: {}
  };
}

export function createPersonThumbnailState(): PersonThumbnailState {
  return {
    retainedPersonIds: {},
    thumbnailRequests: {},
    thumbnailUrls: {}
  };
}

export function isHomeLoading(state: HomeScreenState): boolean {
  return (
    state.recentlyAdded.loading ||
    state.albums.loading ||
    state.favorites.loading ||
    state.videos.loading ||
    state.people.loading ||
    state.recentlyViewed.loading ||
    state.memories.loading
  );
}

export function hasLoadedAnyHomeRail(state: HomeScreenState): boolean {
  return (
    state.recentlyAdded.hasLoaded ||
    state.albums.hasLoaded ||
    state.favorites.hasLoaded ||
    state.videos.hasLoaded ||
    state.people.hasLoaded ||
    state.recentlyViewed.hasLoaded ||
    state.memories.hasLoaded
  );
}

export function isRailEnabled(state: HomeScreenState, railId: HomeRailId): boolean {
  return state.enabledRails.indexOf(railId) >= 0;
}

// The enabled rail closest to `railId` in screen order, preferring the one
// above on a tie; `railId` itself when it is enabled.
export function findNearestEnabledRail(
  enabledRails: HomeRailId[],
  railId: HomeRailId
): HomeRailId | null {
  const position = homeRailOrder.indexOf(railId);
  let nearest: HomeRailId | null = null;
  let nearestDistance = Infinity;

  enabledRails.forEach((candidate) => {
    const distance = Math.abs(homeRailOrder.indexOf(candidate) - position);

    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  });

  return nearest;
}

// The focus id of a rail's current selection, including its See more tile.
export function readRailFocusId<T extends { id: string }>(rail: HomeRailState<T>): string | null {
  if (rail.hasLoaded && rail.more && rail.focusedIndex === rail.items.length) {
    return seeMoreFocusId;
  }

  return rail.items[rail.focusedIndex]?.id || null;
}

// Restores a rail's selection after a reload by id, or to its See more tile.
export function restoreRailFocus<T extends { id: string }>(
  rail: HomeRailState<T>,
  previousId: string | null
): number {
  return previousId === seeMoreFocusId && rail.more
    ? rail.items.length
    : restoreIndexById(rail.items, previousId);
}

export function restoreIndexById<T extends { id: string }>(items: T[], id: string | null): number {
  if (!id) {
    return 0;
  }

  const index = items.findIndex((item) => item.id === id);

  return index >= 0 ? index : 0;
}

export function isHomeRailId(value: string | null): value is HomeRailId {
  return (
    value === "recently-added" ||
    value === "favorites" ||
    value === "videos" ||
    value === "people" ||
    value === "recently-viewed" ||
    value === "albums" ||
    value === "memories"
  );
}

export function getAssetRailState(
  state: HomeScreenState,
  railId: HomeAssetRailId
): HomeRailState<AlbumAsset> {
  if (railId === "recently-added") {
    return state.recentlyAdded;
  }

  if (railId === "favorites") {
    return state.favorites;
  }

  if (railId === "videos") {
    return state.videos;
  }

  return state.recentlyViewed;
}

export function readAssetRailTitle(railId: HomeAssetRailId): string {
  if (railId === "recently-added") {
    return "Recently Added";
  }

  if (railId === "favorites") {
    return "Favourites";
  }

  if (railId === "videos") {
    return "Videos";
  }

  return "Recently Viewed";
}

// Thumbnail order across Home: the rail with focus first, then rails by
// distance from it (the one above before the one below), and within a rail,
// tiles nearest its focused tile first.
export function homeThumbnailPriority(
  state: HomeScreenState,
  railId: HomeRailId,
  index: number
): number {
  const rail = homeRailOrder.indexOf(railId);
  const active = homeRailOrder.indexOf(state.activeRail);
  const railRank = Math.abs(rail - active) * 2 + (rail > active ? 1 : 0);
  const tileDistance = Math.abs(index - getRailState(state, railId).focusedIndex);

  return railRank * 1000 + tileDistance;
}

export function getRailState(
  state: HomeScreenState,
  railId: HomeRailId
): HomeRailState<Album | AlbumAsset | Memory | Person> {
  if (railId === "recently-added") {
    return state.recentlyAdded;
  }

  if (railId === "favorites") {
    return state.favorites;
  }

  if (railId === "videos") {
    return state.videos;
  }

  if (railId === "people") {
    return state.people;
  }

  if (railId === "recently-viewed") {
    return state.recentlyViewed;
  }

  if (railId === "albums") {
    return state.albums;
  }

  return state.memories;
}

export function getRailElement(elements: HomeScreenElements, railId: HomeRailId): HTMLElement {
  if (railId === "recently-added") {
    return elements.recentlyAddedRail;
  }

  if (railId === "favorites") {
    return elements.favoritesRail;
  }

  if (railId === "videos") {
    return elements.videosRail;
  }

  if (railId === "people") {
    return elements.peopleRail;
  }

  if (railId === "recently-viewed") {
    return elements.recentlyViewedRail;
  }

  if (railId === "albums") {
    return elements.albumsRail;
  }

  return elements.memoriesRail;
}

export function readRailItemCount(state: HomeScreenState, railId: HomeRailId): number {
  return getRailState(state, railId).items.length + (getRailState(state, railId).more ? 1 : 0);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
