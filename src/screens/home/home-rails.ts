import type { Album, AlbumAsset } from "../../domain/album";
import type { Memory, Person } from "../../domain/home";
import { formatPersonName } from "../../presentation/person-labels";
import { createLivePhotoBadge, createVideoBadge } from "../grid-presentation";
import {
  getRailElement,
  getRailState,
  homeRailOrder,
  isRailEnabled,
  type HomeAssetRailId,
  type HomeRailId,
  type HomeRailState,
  type HomeScreenElements,
  type HomeScreenOptions,
  type HomeScreenState
} from "./home-model";
import {
  loadAlbumThumbnails,
  loadFavoritesThumbnails,
  loadVideoThumbnails,
  loadMemoryThumbnails,
  loadPersonThumbnails,
  loadRecentlyAddedThumbnails,
  loadRecentlyViewedThumbnails,
  restoreAlbumThumbnails,
  restoreAssetRailThumbnails,
  restoreMemoryThumbnails,
  restorePersonThumbnails
} from "./home-thumbnails";
import { formatMemoryTitle } from "../../presentation/memory-labels";

// Rendering of Home rails, their tiles and per-rail status.

export function renderHome(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number
): void {
  showEnabledRails(elements, state);
  renderRecentlyAddedRail(elements, state);
  renderFavoritesRail(elements, state);
  renderVideosRail(elements, state);
  renderPeopleRail(elements, state);
  renderRecentlyViewedRail(elements, state);
  renderAlbumsRail(elements, state);
  renderMemoriesRail(elements, state);
  loadRecentlyAddedThumbnails(elements, options, state, generation);
  loadFavoritesThumbnails(elements, options, state, generation);
  loadVideoThumbnails(elements, options, state, generation);
  loadPersonThumbnails(elements, options, state, generation);
  loadRecentlyViewedThumbnails(elements, options, state, generation);
  loadAlbumThumbnails(elements, options, state, generation);
  loadMemoryThumbnails(elements, options, state, generation);
  alignHomeRails(elements, state);
}

// Rails that are off in Settings are hidden; with none on, Home shows the
// way to Settings instead.
function showEnabledRails(elements: HomeScreenElements, state: HomeScreenState): void {
  for (const railId of homeRailOrder) {
    const section = getRailElement(elements, railId).closest<HTMLElement>(".home-rail-section");

    if (section) {
      section.hidden = !isRailEnabled(state, railId);
    }
  }

  elements.empty.hidden = state.enabledRails.length > 0;
}

// Fixed-focus rails: each rail is translated so its selected tile sits where
// its second tile sits, keeping the previous item visible (the first item
// stays at the start), and the rail stack is translated so the active rail
// sits where the first rail sits. Rails keep their element across renders,
// so the CSS transform transition animates each move. Offsets are layout
// positions, which transforms do not change; a hidden Home has none.
export function alignHomeRails(elements: HomeScreenElements, state: HomeScreenState): void {
  for (const railId of homeRailOrder) {
    const railElement = getRailElement(elements, railId);
    const anchor =
      railElement.querySelector<HTMLElement>('[data-home-index="1"]') ||
      railElement.querySelector<HTMLElement>('[data-home-index="0"]');
    const selected = railElement.querySelector<HTMLElement>(
      `[data-home-index="${getRailState(state, railId).focusedIndex}"]`
    );

    railElement.style.transform = translate("X", readOffset(anchor, selected, "offsetLeft"));
  }

  const stack = elements.root.querySelector<HTMLElement>(".home-rails");
  const firstRail = state.enabledRails[0] || homeRailOrder[0]!;
  const firstSection = getRailElement(elements, firstRail).closest<HTMLElement>(
    ".home-rail-section"
  );
  const activeSection = getRailElement(elements, state.activeRail).closest<HTMLElement>(
    ".home-rail-section"
  );

  if (stack) {
    stack.style.transform = translate("Y", readOffset(firstSection, activeSection, "offsetTop"));
  }
}

function readOffset(
  anchor: HTMLElement | null,
  target: HTMLElement | null,
  property: "offsetLeft" | "offsetTop"
): number {
  const offset = anchor && target ? target[property] - anchor[property] : 0;

  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

function translate(axis: "X" | "Y", offset: number): string {
  return offset > 0 ? `translate${axis}(-${offset}px)` : "";
}

export function renderRecentlyAddedRail(
  elements: HomeScreenElements,
  state: HomeScreenState
): void {
  elements.recentlyAddedRail.textContent = "";
  setRailStatus(
    elements.recentlyAddedStatus,
    readRailStatus(state.recentlyAdded, "No recently added items yet.")
  );

  for (let index = 0; index < state.recentlyAdded.items.length; index += 1) {
    elements.recentlyAddedRail.appendChild(
      createAssetTile(
        elements.root.ownerDocument,
        state.recentlyAdded.items[index]!,
        index,
        "recently-added"
      )
    );
  }

  appendSeeMoreTile(elements, "recently-added", state.recentlyAdded);
  restoreAssetRailThumbnails(
    elements.recentlyAddedRail,
    state.recentlyAdded.items,
    state.recentlyAddedThumbnails
  );
}

export function renderRecentlyViewedRail(
  elements: HomeScreenElements,
  state: HomeScreenState
): void {
  elements.recentlyViewedRail.textContent = "";
  setRailStatus(
    elements.recentlyViewedStatus,
    readRailStatus(state.recentlyViewed, "No recently viewed items yet.")
  );

  for (let index = 0; index < state.recentlyViewed.items.length; index += 1) {
    elements.recentlyViewedRail.appendChild(
      createAssetTile(
        elements.root.ownerDocument,
        state.recentlyViewed.items[index]!,
        index,
        "recently-viewed"
      )
    );
  }

  appendSeeMoreTile(elements, "recently-viewed", state.recentlyViewed);
  restoreAssetRailThumbnails(
    elements.recentlyViewedRail,
    state.recentlyViewed.items,
    state.recentlyViewedThumbnails
  );
}

export function renderAlbumsRail(elements: HomeScreenElements, state: HomeScreenState): void {
  elements.albumsRail.textContent = "";
  setRailStatus(elements.albumsStatus, readRailStatus(state.albums, "No albums yet."));

  for (let index = 0; index < state.albums.items.length; index += 1) {
    elements.albumsRail.appendChild(
      createAlbumTile(elements.root.ownerDocument, state.albums.items[index]!, index)
    );
  }

  appendSeeMoreTile(elements, "albums", state.albums);
  restoreAlbumThumbnails(elements, state);
}

export function renderFavoritesRail(elements: HomeScreenElements, state: HomeScreenState): void {
  elements.favoritesRail.textContent = "";
  setRailStatus(elements.favoritesStatus, readRailStatus(state.favorites, "No favorites yet."));

  for (let index = 0; index < state.favorites.items.length; index += 1) {
    elements.favoritesRail.appendChild(
      createAssetTile(
        elements.root.ownerDocument,
        state.favorites.items[index]!,
        index,
        "favorites"
      )
    );
  }

  appendSeeMoreTile(elements, "favorites", state.favorites);
  restoreAssetRailThumbnails(
    elements.favoritesRail,
    state.favorites.items,
    state.favoriteThumbnails
  );
}

export function renderVideosRail(elements: HomeScreenElements, state: HomeScreenState): void {
  elements.videosRail.textContent = "";
  setRailStatus(elements.videosStatus, readRailStatus(state.videos, "No videos yet."));

  for (let index = 0; index < state.videos.items.length; index += 1) {
    elements.videosRail.appendChild(
      createAssetTile(elements.root.ownerDocument, state.videos.items[index]!, index, "videos")
    );
  }

  appendSeeMoreTile(elements, "videos", state.videos);
  restoreAssetRailThumbnails(elements.videosRail, state.videos.items, state.videoThumbnails);
}

export function renderPeopleRail(elements: HomeScreenElements, state: HomeScreenState): void {
  elements.peopleRail.textContent = "";
  setRailStatus(elements.peopleStatus, readRailStatus(state.people, "No people yet."));

  for (let index = 0; index < state.people.items.length; index += 1) {
    elements.peopleRail.appendChild(
      createPersonTile(elements.root.ownerDocument, state.people.items[index]!, index)
    );
  }

  restorePersonThumbnails(elements, state);
  appendSeeMoreTile(elements, "people", state.people);
}

export function renderMemoriesRail(elements: HomeScreenElements, state: HomeScreenState): void {
  elements.memoriesRail.textContent = "";
  setRailStatus(elements.memoriesStatus, readRailStatus(state.memories, "No memories yet."));

  for (let index = 0; index < state.memories.items.length; index += 1) {
    elements.memoriesRail.appendChild(
      createMemoryTile(elements.root.ownerDocument, state.memories.items[index]!, index)
    );
  }

  appendSeeMoreTile(elements, "memories", state.memories);
  restoreMemoryThumbnails(elements, state);
}

const seeMoreTitles: Record<HomeRailId, string> = {
  albums: "Albums",
  favorites: "Favourites",
  memories: "Memories",
  people: "People",
  "recently-added": "Recently Added",
  "recently-viewed": "Recently Viewed",
  videos: "Videos"
};

// Ends a rail that holds fewer items than exist with a See more tile at index
// items.length, the index navigation and activation use for it.
function appendSeeMoreTile(
  elements: HomeScreenElements,
  railId: HomeRailId,
  rail: HomeRailState<unknown>
): void {
  if (!rail.more) {
    return;
  }

  const documentRef = elements.root.ownerDocument;
  const tile = documentRef.createElement("button");
  tile.type = "button";
  tile.className = "focusable home-tile home-album-tile home-more-tile";
  tile.setAttribute("data-home-rail", railId);
  tile.setAttribute("data-home-index", String(rail.items.length));
  tile.setAttribute("aria-label", `See more ${seeMoreTitles[railId]}`);

  const icon = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("class", "home-more-icon");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const arrow = documentRef.createElementNS("http://www.w3.org/2000/svg", "path");
  arrow.setAttribute("d", "M5 11h10.17l-4.58-4.59L12 5l7 7-7 7-1.41-1.41L15.17 13H5z");
  icon.appendChild(arrow);
  tile.appendChild(icon);

  const label = documentRef.createElement("span");
  label.className = "home-more-label";
  label.textContent = "See more";
  tile.appendChild(label);

  getRailElement(elements, railId).appendChild(tile);
}

export function readRailStatus<T>(
  rail: HomeRailState<T>,
  emptyMessage: string
): { message: string; state: string } {
  if (rail.loading && rail.items.length === 0) {
    return {
      message: "Loading...",
      state: "pending"
    };
  }

  if (rail.error) {
    return {
      message: rail.error,
      state: "error"
    };
  }

  if (rail.hasLoaded && rail.items.length === 0) {
    return {
      message: emptyMessage,
      state: "idle"
    };
  }

  return {
    message: "",
    state: "idle"
  };
}

export function setRailStatus(
  element: HTMLElement,
  status: { message: string; state: string }
): void {
  element.textContent = status.message;
  element.setAttribute("data-state", status.state);
  element.hidden = status.message.length === 0;
}

export function createAssetTile(
  documentRef: Document,
  asset: AlbumAsset,
  index: number,
  railId: HomeAssetRailId
): HTMLButtonElement {
  const tile = documentRef.createElement("button");
  tile.className = "focusable home-tile home-asset-tile";
  tile.type = "button";
  tile.setAttribute("data-home-rail", railId);
  tile.setAttribute("data-home-index", String(index));
  tile.setAttribute("aria-label", `${asset.name}, ${readAssetTypeLabel(asset)}`);

  const placeholder = documentRef.createElement("span");
  placeholder.className = "asset-thumbnail-placeholder";
  placeholder.textContent = String(index + 1);
  tile.appendChild(placeholder);

  if (asset.type === "video") {
    tile.appendChild(createVideoBadge(documentRef, asset));
  } else if (asset.livePhotoVideoId) {
    tile.appendChild(createLivePhotoBadge(documentRef));
  }

  return tile;
}

export function createAlbumTile(
  documentRef: Document,
  album: Album,
  index: number
): HTMLButtonElement {
  const tile = documentRef.createElement("button");
  tile.className = "focusable home-tile home-album-tile";
  tile.type = "button";
  tile.setAttribute("data-home-rail", "albums");
  tile.setAttribute("data-home-index", String(index));
  tile.setAttribute("aria-label", `${album.name}, ${formatAssetCount(album.assetCount)}`);

  const placeholder = documentRef.createElement("span");
  placeholder.className = "album-cover-placeholder";
  placeholder.textContent = readAlbumInitial(album.name);
  tile.appendChild(placeholder);

  const meta = documentRef.createElement("span");
  meta.className = "album-meta";

  const name = documentRef.createElement("span");
  name.className = "album-name";
  name.textContent = album.name;
  meta.appendChild(name);

  tile.appendChild(meta);

  return tile;
}

export function createPersonTile(
  documentRef: Document,
  person: Person,
  index: number
): HTMLButtonElement {
  const tile = documentRef.createElement("button");
  tile.className = "focusable home-tile home-person-tile";
  tile.type = "button";
  tile.setAttribute("data-home-rail", "people");
  tile.setAttribute("data-home-index", String(index));
  const label = formatPersonName(person);

  tile.setAttribute("aria-label", label);

  const placeholder = documentRef.createElement("span");
  placeholder.className = "album-cover-placeholder";
  placeholder.textContent = readAlbumInitial(label);
  tile.appendChild(placeholder);

  const meta = documentRef.createElement("span");
  meta.className = "album-meta";

  const name = documentRef.createElement("span");
  name.className = "album-name";
  name.textContent = label;
  meta.appendChild(name);

  tile.appendChild(meta);

  return tile;
}

export function createMemoryTile(
  documentRef: Document,
  memory: Memory,
  index: number
): HTMLButtonElement {
  const tile = documentRef.createElement("button");
  tile.className = "focusable home-tile home-album-tile";
  tile.type = "button";
  tile.setAttribute("data-home-rail", "memories");
  tile.setAttribute("data-home-index", String(index));
  const title = formatMemoryTitle(memory);

  tile.setAttribute("aria-label", `${title}, ${formatAssetCount(memory.assetCount)}`);

  const placeholder = documentRef.createElement("span");
  placeholder.className = "album-cover-placeholder";
  placeholder.textContent = readAlbumInitial(title);
  tile.appendChild(placeholder);

  const meta = documentRef.createElement("span");
  meta.className = "album-meta";

  const name = documentRef.createElement("span");
  name.className = "album-name";
  name.textContent = title;
  meta.appendChild(name);

  tile.appendChild(meta);

  return tile;
}

export function readAssetTypeLabel(asset: AlbumAsset): string {
  if (asset.type === "image" && asset.livePhotoVideoId) {
    return "Live Photo";
  }

  if (asset.type === "video") {
    return "video";
  }

  if (asset.type === "image") {
    return "photo";
  }

  return asset.type;
}

export function formatAssetCount(count: number): string {
  if (count === 1) {
    return "1 asset";
  }

  return `${count} assets`;
}

export function readAlbumInitial(name: string): string {
  const trimmedName = name.trim();

  return (trimmedName[0] || "A").toUpperCase();
}
