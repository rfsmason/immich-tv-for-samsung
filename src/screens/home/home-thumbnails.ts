import type { Album, AlbumAsset } from "../../domain/album";
import type { Memory, Person } from "../../domain/home";
import { calculateThumbnailRetentionWindow } from "../album-assets-window";
import {
  type AssetThumbnailState,
  reconcileAssetThumbnails,
  revokeAllAssetThumbnails
} from "../asset-thumbnail-window";
import { isCurrentGeneration } from "../async-generation";
import {
  type HomeRailId,
  type HomeScreenElements,
  type HomeScreenOptions,
  type HomeScreenState,
  createAlbumThumbnailState,
  createPersonThumbnailState,
  homeThumbnailPriority
} from "./home-model";

// Bounded thumbnail lifecycle for Home rails: load near focus, restore after
// re-render, and revoke outside retention or on hide.

export function loadRecentlyAddedThumbnails(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number
): void {
  loadAssetRailThumbnails({
    assets: state.recentlyAdded.items,
    focusedIndex: state.recentlyAdded.focusedIndex,
    generation,
    onThumbnailLoaded: (asset, index, url) =>
      renderAssetRailThumbnail(elements.recentlyAddedRail, asset, index, url),
    options,
    railId: "recently-added",
    state,
    thumbnailState: state.recentlyAddedThumbnails
  });
}

export function loadRecentlyViewedThumbnails(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number
): void {
  loadAssetRailThumbnails({
    assets: state.recentlyViewed.items,
    focusedIndex: state.recentlyViewed.focusedIndex,
    generation,
    onThumbnailLoaded: (asset, index, url) =>
      renderAssetRailThumbnail(elements.recentlyViewedRail, asset, index, url),
    options,
    railId: "recently-viewed",
    state,
    thumbnailState: state.recentlyViewedThumbnails
  });
}

export function loadFavoritesThumbnails(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number
): void {
  loadAssetRailThumbnails({
    assets: state.favorites.items,
    focusedIndex: state.favorites.focusedIndex,
    generation,
    onThumbnailLoaded: (asset, index, url) =>
      renderAssetRailThumbnail(elements.favoritesRail, asset, index, url),
    options,
    railId: "favorites",
    state,
    thumbnailState: state.favoriteThumbnails
  });
}

export function loadVideoThumbnails(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number
): void {
  loadAssetRailThumbnails({
    assets: state.videos.items,
    focusedIndex: state.videos.focusedIndex,
    generation,
    onThumbnailLoaded: (asset, index, url) =>
      renderAssetRailThumbnail(elements.videosRail, asset, index, url),
    options,
    railId: "videos",
    state,
    thumbnailState: state.videoThumbnails
  });
}

export function loadMemoryThumbnails(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number
): void {
  const covers: { memory: Memory; memoryIndex: number; asset: AlbumAsset }[] = [];
  state.memories.items.forEach((memory, memoryIndex) => {
    const asset = memory.assets[0];
    if (asset) covers.push({ memory, memoryIndex, asset });
  });

  loadAssetRailThumbnails({
    assets: covers.map((cover) => cover.asset),
    focusedIndex: Math.max(
      0,
      covers.findIndex((cover) => cover.memoryIndex === state.memories.focusedIndex)
    ),
    generation,
    onThumbnailLoaded(asset, _index, url) {
      // The scheduler deduplicates by asset ID. One cover can serve several
      // memories, and empty memories retain their original rail positions.
      for (const cover of covers) {
        if (cover.asset.id === asset.id) {
          renderMemoryThumbnail(elements, cover.memory, cover.memoryIndex, url);
        }
      }
    },
    options,
    railId: "memories",
    state,
    thumbnailState: state.memoryThumbnails
  });
}

export function loadAssetRailThumbnails(input: {
  assets: AlbumAsset[];
  focusedIndex: number;
  generation: number;
  onThumbnailLoaded(asset: AlbumAsset, index: number, url: string): void;
  options: HomeScreenOptions;
  railId: HomeRailId;
  state: HomeScreenState;
  thumbnailState: AssetThumbnailState;
}): void {
  if (input.assets.length === 0) {
    return;
  }

  const window = calculateThumbnailRetentionWindow({
    columnCount: Math.max(1, input.assets.length),
    focusedIndex: input.focusedIndex,
    itemCount: input.assets.length,
    rowsAfter: 0,
    rowsBefore: 0
  });

  reconcileAssetThumbnails({
    assets: input.assets,
    focusedIndex: input.focusedIndex,
    generation: input.generation,
    isCurrentGeneration: (thumbnailGeneration) =>
      isCurrentGeneration(input.state, thumbnailGeneration),
    isHidden: () => false,
    loadThumbnailUrl: (asset) => input.options.service.loadAssetThumbnailUrl(asset),
    onThumbnailLoaded: input.onThumbnailLoaded,
    revokeThumbnailUrl: input.options.service.revokeThumbnailUrl,
    schedule: (index, run) => scheduleHomeThumbnail(input.state, input.railId, index, run),
    state: input.thumbnailState,
    window
  });
}

// Every Home thumbnail goes through the one Home-wide queue (ADR 0016).
function scheduleHomeThumbnail(
  state: HomeScreenState,
  railId: HomeRailId,
  index: number,
  run: () => Promise<unknown>
): void {
  state.thumbnailScheduler.schedule(() => homeThumbnailPriority(state, railId, index), run);
}

export function loadAlbumThumbnails(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number
): void {
  const retainedAlbumIds = readRetainedAlbumIds(state.albums.items);

  state.albumThumbnails.retainedAlbumIds = retainedAlbumIds;
  revokeAlbumThumbnailsOutsideRetention(options, state);

  for (let index = 0; index < state.albums.items.length; index += 1) {
    const album = state.albums.items[index];

    if (
      !album ||
      !album.thumbnailAssetId ||
      state.albumThumbnails.thumbnailUrls[album.id] ||
      state.albumThumbnails.thumbnailRequests[album.id]
    ) {
      continue;
    }

    state.albumThumbnails.thumbnailRequests[album.id] = generation;
    scheduleHomeThumbnail(state, "albums", index, () => {
      // Still wanted? The request may have waited in the queue.
      if (
        state.albumThumbnails.thumbnailRequests[album.id] !== generation ||
        !state.albumThumbnails.retainedAlbumIds[album.id]
      ) {
        if (state.albumThumbnails.thumbnailRequests[album.id] === generation) {
          delete state.albumThumbnails.thumbnailRequests[album.id];
        }

        return Promise.resolve();
      }

      return options.service
        .loadThumbnailUrl(album)
        .then((url) => {
          if (!url) {
            if (state.albumThumbnails.thumbnailRequests[album.id] === generation) {
              delete state.albumThumbnails.thumbnailRequests[album.id];
            }
            return;
          }

          if (
            !isCurrentGeneration(state, generation) ||
            elements.root.hidden ||
            state.albumThumbnails.thumbnailRequests[album.id] !== generation ||
            !state.albumThumbnails.retainedAlbumIds[album.id]
          ) {
            options.service.revokeThumbnailUrl(url);
            if (state.albumThumbnails.thumbnailRequests[album.id] === generation) {
              delete state.albumThumbnails.thumbnailRequests[album.id];
            }
            return;
          }

          delete state.albumThumbnails.thumbnailRequests[album.id];
          state.albumThumbnails.thumbnailUrls[album.id] = url;
          renderAlbumThumbnail(elements, album, index, url);
        })
        .catch(() => {
          if (state.albumThumbnails.thumbnailRequests[album.id] === generation) {
            delete state.albumThumbnails.thumbnailRequests[album.id];
          }
        });
    });
  }
}

export function loadPersonThumbnails(
  elements: HomeScreenElements,
  options: HomeScreenOptions,
  state: HomeScreenState,
  generation: number
): void {
  const retainedPersonIds = readRetainedPersonIds(state.people.items);

  state.personThumbnails.retainedPersonIds = retainedPersonIds;
  revokePersonThumbnailsOutsideRetention(options, state);

  for (let index = 0; index < state.people.items.length; index += 1) {
    const person = state.people.items[index];

    if (
      !person ||
      state.personThumbnails.thumbnailUrls[person.id] ||
      state.personThumbnails.thumbnailRequests[person.id]
    ) {
      continue;
    }

    state.personThumbnails.thumbnailRequests[person.id] = generation;
    scheduleHomeThumbnail(state, "people", index, () => {
      // Still wanted? The request may have waited in the queue.
      if (
        state.personThumbnails.thumbnailRequests[person.id] !== generation ||
        !state.personThumbnails.retainedPersonIds[person.id]
      ) {
        if (state.personThumbnails.thumbnailRequests[person.id] === generation) {
          delete state.personThumbnails.thumbnailRequests[person.id];
        }

        return Promise.resolve();
      }

      return options.service
        .loadPersonThumbnailUrl(person)
        .then((url) => {
          if (!url) {
            if (state.personThumbnails.thumbnailRequests[person.id] === generation) {
              delete state.personThumbnails.thumbnailRequests[person.id];
            }
            return;
          }

          if (
            !isCurrentGeneration(state, generation) ||
            elements.root.hidden ||
            state.personThumbnails.thumbnailRequests[person.id] !== generation ||
            !state.personThumbnails.retainedPersonIds[person.id]
          ) {
            options.service.revokeThumbnailUrl(url);
            if (state.personThumbnails.thumbnailRequests[person.id] === generation) {
              delete state.personThumbnails.thumbnailRequests[person.id];
            }
            return;
          }

          delete state.personThumbnails.thumbnailRequests[person.id];
          state.personThumbnails.thumbnailUrls[person.id] = url;
          renderPersonThumbnail(elements, person, index, url);
        })
        .catch(() => {
          if (state.personThumbnails.thumbnailRequests[person.id] === generation) {
            delete state.personThumbnails.thumbnailRequests[person.id];
          }
        });
    });
  }
}

export function restoreAssetRailThumbnails(
  rail: HTMLElement,
  assets: AlbumAsset[],
  thumbnails: AssetThumbnailState
): void {
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const url = asset ? thumbnails.thumbnailUrls[asset.id] : null;

    if (asset && url) {
      renderAssetRailThumbnail(rail, asset, index, url);
    }
  }
}

export function restoreAlbumThumbnails(elements: HomeScreenElements, state: HomeScreenState): void {
  for (let index = 0; index < state.albums.items.length; index += 1) {
    const album = state.albums.items[index];
    const url = album ? state.albumThumbnails.thumbnailUrls[album.id] : null;

    if (album && url) {
      renderAlbumThumbnail(elements, album, index, url);
    }
  }
}

export function restorePersonThumbnails(
  elements: HomeScreenElements,
  state: HomeScreenState
): void {
  for (let index = 0; index < state.people.items.length; index += 1) {
    const person = state.people.items[index];
    const url = person ? state.personThumbnails.thumbnailUrls[person.id] : null;

    if (person && url) {
      renderPersonThumbnail(elements, person, index, url);
    }
  }
}

export function restoreMemoryThumbnails(
  elements: HomeScreenElements,
  state: HomeScreenState
): void {
  for (let index = 0; index < state.memories.items.length; index += 1) {
    const memory = state.memories.items[index];
    const firstAsset = memory?.assets[0];
    const url = firstAsset ? state.memoryThumbnails.thumbnailUrls[firstAsset.id] : null;

    if (memory && url) {
      renderMemoryThumbnail(elements, memory, index, url);
    }
  }
}

export function renderAssetRailThumbnail(
  rail: HTMLElement,
  asset: AlbumAsset,
  index: number,
  url: string
): void {
  const tile = rail.querySelector<HTMLElement>(`[data-home-index="${index}"]`);

  if (!tile) {
    return;
  }

  replaceTilePlaceholder(rail.ownerDocument, tile, "asset-thumbnail", url);
  tile.setAttribute("data-asset-id", asset.id);
}

export function renderAlbumThumbnail(
  elements: HomeScreenElements,
  album: Album,
  index: number,
  url: string
): void {
  const tile = elements.albumsRail.querySelector<HTMLElement>(`[data-home-index="${index}"]`);

  if (!tile) {
    return;
  }

  replaceAlbumCover(elements.root.ownerDocument, tile, url);
  tile.setAttribute("data-album-id", album.id);
}

export function renderPersonThumbnail(
  elements: HomeScreenElements,
  person: Person,
  index: number,
  url: string
): void {
  const tile = elements.peopleRail.querySelector<HTMLElement>(`[data-home-index="${index}"]`);

  if (!tile) {
    return;
  }

  // A face is shown as a sharp circle only, without the blurred backdrop
  // album covers use to fill their square.
  replaceAlbumCover(elements.root.ownerDocument, tile, url, { backdrop: false });
  tile.setAttribute("data-person-id", person.id);
}

export function renderMemoryThumbnail(
  elements: HomeScreenElements,
  memory: Memory,
  index: number,
  url: string
): void {
  const tile = elements.memoriesRail.querySelector<HTMLElement>(`[data-home-index="${index}"]`);

  if (!tile) {
    return;
  }

  replaceAlbumCover(elements.root.ownerDocument, tile, url);
  tile.setAttribute("data-memory-id", memory.id);
}

export function replaceTilePlaceholder(
  documentRef: Document,
  tile: HTMLElement,
  className: string,
  url: string
): void {
  const existingThumbnail = tile.querySelector<HTMLImageElement>(`.${className}`);

  if (existingThumbnail) {
    existingThumbnail.src = url;
    return;
  }

  const image = documentRef.createElement("img");
  image.alt = "";
  image.className = className;
  image.decoding = "async";
  image.src = url;
  image.setAttribute("aria-hidden", "true");

  const placeholder = tile.querySelector(".asset-thumbnail-placeholder");

  if (placeholder) {
    tile.replaceChild(image, placeholder);
  } else {
    tile.insertBefore(image, tile.firstChild);
  }
}

export function replaceAlbumCover(
  documentRef: Document,
  tile: HTMLElement,
  url: string,
  options: { backdrop: boolean } = { backdrop: true }
): void {
  const existingStage = tile.querySelector<HTMLElement>(".album-cover-stage");

  if (existingStage) {
    const existingImages = existingStage.querySelectorAll<HTMLImageElement>("img");

    for (let index = 0; index < existingImages.length; index += 1) {
      existingImages[index]!.src = url;
    }

    return;
  }

  const stage = documentRef.createElement("span");
  stage.className = "album-cover-stage";

  if (options.backdrop) {
    const backdrop = documentRef.createElement("img");
    backdrop.alt = "";
    backdrop.className = "album-cover-backdrop";
    backdrop.decoding = "async";
    backdrop.src = url;
    backdrop.setAttribute("aria-hidden", "true");
    stage.appendChild(backdrop);
  }

  const cover = documentRef.createElement("img");
  cover.alt = "";
  cover.className = "album-cover";
  cover.decoding = "async";
  cover.src = url;
  cover.setAttribute("aria-hidden", "true");
  stage.appendChild(cover);

  const placeholder = tile.querySelector(".album-cover-placeholder");

  if (placeholder) {
    tile.replaceChild(stage, placeholder);
  } else {
    tile.insertBefore(stage, tile.firstChild);
  }
}

export function readRetainedAlbumIds(albums: Album[]): Record<string, true> {
  const retained: Record<string, true> = {};

  for (const album of albums) {
    retained[album.id] = true;
  }

  return retained;
}

export function readRetainedPersonIds(people: Person[]): Record<string, true> {
  const retained: Record<string, true> = {};

  for (const person of people) {
    retained[person.id] = true;
  }

  return retained;
}

export function cleanupHomeThumbnails(options: HomeScreenOptions, state: HomeScreenState): void {
  revokeAllAssetThumbnails(state.recentlyAddedThumbnails, options.service.revokeThumbnailUrl);
  revokeAllAssetThumbnails(state.recentlyViewedThumbnails, options.service.revokeThumbnailUrl);
  revokeAllAssetThumbnails(state.favoriteThumbnails, options.service.revokeThumbnailUrl);
  revokeAllAssetThumbnails(state.videoThumbnails, options.service.revokeThumbnailUrl);
  revokeAllAssetThumbnails(state.memoryThumbnails, options.service.revokeThumbnailUrl);
  revokeAllAlbumThumbnails(options, state);
  revokeAllPersonThumbnails(options, state);
}

export function revokeAllAlbumThumbnails(options: HomeScreenOptions, state: HomeScreenState): void {
  for (const albumId of Object.keys(state.albumThumbnails.thumbnailUrls)) {
    const url = state.albumThumbnails.thumbnailUrls[albumId];

    if (url) {
      options.service.revokeThumbnailUrl(url);
    }
  }

  state.albumThumbnails = createAlbumThumbnailState();
}

export function revokeAllPersonThumbnails(
  options: HomeScreenOptions,
  state: HomeScreenState
): void {
  for (const personId of Object.keys(state.personThumbnails.thumbnailUrls)) {
    const url = state.personThumbnails.thumbnailUrls[personId];

    if (url) {
      options.service.revokeThumbnailUrl(url);
    }
  }

  state.personThumbnails = createPersonThumbnailState();
}

export function revokeAlbumThumbnailsOutsideRetention(
  options: HomeScreenOptions,
  state: HomeScreenState
): void {
  for (const albumId of Object.keys(state.albumThumbnails.thumbnailUrls)) {
    if (!state.albumThumbnails.retainedAlbumIds[albumId]) {
      const url = state.albumThumbnails.thumbnailUrls[albumId];

      if (url) {
        options.service.revokeThumbnailUrl(url);
      }

      delete state.albumThumbnails.thumbnailUrls[albumId];
    }
  }
}

export function revokePersonThumbnailsOutsideRetention(
  options: HomeScreenOptions,
  state: HomeScreenState
): void {
  for (const personId of Object.keys(state.personThumbnails.thumbnailUrls)) {
    if (!state.personThumbnails.retainedPersonIds[personId]) {
      const url = state.personThumbnails.thumbnailUrls[personId];

      if (url) {
        options.service.revokeThumbnailUrl(url);
      }

      delete state.personThumbnails.thumbnailUrls[personId];
    }
  }
}
