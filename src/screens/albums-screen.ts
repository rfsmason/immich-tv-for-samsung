import type { AlbumService } from "../app/album-service";
import type { Album } from "../domain/album";
import { toUserMessage } from "../errors/app-error";
import { getNextGridIndex, isGridRowEnd, type GridDirection } from "../navigation/grid-navigation";
import { getKeyCode, remoteKeys } from "../platform/tizen/keys";
import {
  calculateRenderedAssetWindow,
  calculateThumbnailRetentionWindow,
  type AssetIndexWindow,
  type RenderedAssetWindow,
  gridRenderRows,
  gridThumbnailRows
} from "./album-assets-window";
import { getAlbumStatus } from "./albums-state";
import { createGridSpacer, focusWithoutPageScroll, scrollIntoContainer } from "./grid-presentation";
import {
  beginAsyncGeneration,
  invalidateAsyncGeneration,
  isCurrentGeneration
} from "./async-generation";

// Six per row, matching every grid and Home's tile size.
const columnCount = 6;

type AlbumsScreenElements = {
  grid: HTMLElement;
  root: HTMLElement;
  status: HTMLElement;
};

type AlbumsScreenOptions = {
  documentRef?: Document;
  onOpenAlbum(album: Album): void;
  onReturnToShell?(): void;
  service: AlbumService;
};

type AlbumsScreenState = {
  // A refresh asked for while Albums was hidden; it runs on the next show.
  refreshPending: boolean;
  albums: Album[];
  contentFocusRequested: boolean;
  focusedIndex: number;
  hasLoaded: boolean;
  loadGeneration: number;
  loading: boolean;
  preferredColumn: number;
  retainedThumbnailAlbumIds: Record<string, true>;
  thumbnailRequests: Record<string, number>;
  thumbnailUrls: Record<string, string>;
};

export type AlbumsScreenController = {
  destroy(): void;
  focusContent(): void;
  hide(): void;
  refresh(): void;
  show(): void;
};

export function mountAlbumsScreen(options: AlbumsScreenOptions): AlbumsScreenController {
  const documentRef = options.documentRef || document;
  const elements = readElements(documentRef);
  const state: AlbumsScreenState = {
    refreshPending: false,
    albums: [],
    contentFocusRequested: false,
    focusedIndex: 0,
    hasLoaded: false,
    loadGeneration: 0,
    loading: false,
    preferredColumn: 0,
    retainedThumbnailAlbumIds: {},
    thumbnailRequests: {},
    thumbnailUrls: {}
  };

  const handleDocumentKeydown = (event: KeyboardEvent) => {
    if (elements.root.hidden) {
      return;
    }

    handleKeydown(event, documentRef, elements, options, state);
  };
  const handleGridClick = (event: MouseEvent) => {
    if (elements.root.hidden) {
      return;
    }

    handleAlbumClick(event, elements, options, state);
  };
  const handleGridKeydown = (event: KeyboardEvent) => {
    if (elements.root.hidden) {
      return;
    }

    handleAlbumGridKeydown(event, elements, options, state);
  };

  documentRef.addEventListener("keydown", handleDocumentKeydown);
  elements.grid.addEventListener("click", handleGridClick);
  elements.grid.addEventListener("keydown", handleGridKeydown);

  return {
    destroy() {
      documentRef.removeEventListener("keydown", handleDocumentKeydown);
      elements.grid.removeEventListener("click", handleGridClick);
      elements.grid.removeEventListener("keydown", handleGridKeydown);
      invalidateAsyncGeneration(state);
      state.loading = false;
      revokeThumbnails(options, state);
    },
    focusContent() {
      state.contentFocusRequested = true;

      if (state.albums.length > 0) {
        renderAlbumWindow(elements, state);
        focusCurrentAlbum(elements, state);
        loadThumbnailsNearFocus(elements, options, state, state.loadGeneration);
        return;
      }

      // Still loading: hold focus on the screen until the first album can
      // take it. Loaded but empty: focus stays with the left rail.
      if (state.loading) {
        elements.root.focus();
      } else {
        options.onReturnToShell?.();
      }
    },
    hide() {
      invalidateAsyncGeneration(state);
      state.loading = false;
      elements.root.hidden = true;
      state.contentFocusRequested = false;
      revokeThumbnails(options, state);
    },
    // Reloads the albums without moving focus (the rail's Refresh).
    refresh() {
      if (elements.root.hidden) {
        state.refreshPending = true;
        return;
      }

      loadAlbums(elements, options, state, false);
    },
    show() {
      elements.root.hidden = false;

      if (state.refreshPending) {
        state.refreshPending = false;
        loadAlbums(elements, options, state, false);
        return;
      }

      if (state.albums.length > 0) {
        renderAlbums(elements, options, state, state.loadGeneration, state.contentFocusRequested);
        return;
      }

      if (!state.hasLoaded && !state.loading) {
        loadAlbums(elements, options, state, false);
        return;
      }

      if (state.hasLoaded) {
        renderAlbums(elements, options, state, state.loadGeneration, state.contentFocusRequested);
        return;
      }

      focusCurrentAlbum(elements, state);
    }
  };
}

function readElements(documentRef: Document): AlbumsScreenElements {
  return {
    grid: requireElement(documentRef, "albums-grid"),
    root: requireElement(documentRef, "albums-screen"),
    status: requireElement(documentRef, "albums-status")
  };
}

function requireElement<T extends HTMLElement>(documentRef: Document, id: string): T {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element as T;
}

async function loadAlbums(
  elements: AlbumsScreenElements,
  options: AlbumsScreenOptions,
  state: AlbumsScreenState,
  shouldFocus = true
): Promise<void> {
  const generation = beginAsyncGeneration(state);

  state.loading = true;
  state.focusedIndex = 0;
  state.preferredColumn = 0;
  setStatus(elements, "Loading albums...", "pending");
  elements.grid.textContent = "";
  revokeThumbnails(options, state);

  try {
    const albums = await options.service.loadAlbums();

    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.hasLoaded = true;
    state.albums = albums;
    // Content focus requested while loading (for example from Home's See more)
    // moves to the first album, unless the user has since left the screen.
    const focusRequested =
      state.contentFocusRequested &&
      elements.root.contains(elements.root.ownerDocument.activeElement);
    renderAlbums(elements, options, state, generation, shouldFocus || focusRequested);
  } catch (error) {
    if (!isCurrentGeneration(state, generation) || elements.root.hidden) {
      return;
    }

    state.hasLoaded = true;
    state.albums = [];
    elements.grid.textContent = "";
    setStatus(elements, toUserMessage(error), "error");
    returnFocusToRailIfOwned(elements, options);
  } finally {
    if (isCurrentGeneration(state, generation)) {
      state.loading = false;
    }
  }
}

function renderAlbums(
  elements: AlbumsScreenElements,
  options: AlbumsScreenOptions,
  state: AlbumsScreenState,
  generation: number,
  shouldFocus = true
): void {
  if (state.albums.length === 0) {
    elements.grid.textContent = "";
    const status = getAlbumStatus(state.albums);

    setStatus(elements, status.message, status.state);
    returnFocusToRailIfOwned(elements, options);
    return;
  }

  const status = getAlbumStatus(state.albums);

  setStatus(elements, status.message, status.state);
  renderAlbumWindow(elements, state);
  if (shouldFocus) {
    focusCurrentAlbum(elements, state);
  }
  loadThumbnailsNearFocus(elements, options, state, generation);
}

function renderAlbumWindow(elements: AlbumsScreenElements, state: AlbumsScreenState): void {
  const window = calculateRenderedAssetWindow({
    columnCount,
    focusedIndex: state.focusedIndex,
    itemCount: state.albums.length,
    rowsAfter: gridRenderRows.after,
    rowsBefore: gridRenderRows.before
  });

  elements.grid.textContent = "";

  if (window.topSpacerRows > 0) {
    elements.grid.appendChild(
      createGridSpacer(
        elements.root.ownerDocument,
        "album-grid-spacer",
        "--album-spacer-rows",
        window.topSpacerRows
      )
    );
  }

  for (let index = window.startIndex; index < window.endIndex; index += 1) {
    const album = state.albums[index];

    if (!album) {
      continue;
    }

    elements.grid.appendChild(createAlbumTile(elements.root.ownerDocument, album, index));
  }

  if (window.bottomSpacerRows > 0) {
    elements.grid.appendChild(
      createGridSpacer(
        elements.root.ownerDocument,
        "album-grid-spacer",
        "--album-spacer-rows",
        window.bottomSpacerRows
      )
    );
  }

  restoreRenderedThumbnails(elements, state, window);
}

function createAlbumTile(documentRef: Document, album: Album, index: number): HTMLButtonElement {
  const tile = documentRef.createElement("button");
  tile.className = "focusable album-tile";
  tile.type = "button";
  tile.setAttribute("data-album-index", String(index));
  tile.setAttribute("data-action", "open-album");
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

  const count = documentRef.createElement("span");
  count.className = "album-count";
  count.textContent = formatAssetCount(album.assetCount);
  meta.appendChild(count);

  tile.appendChild(meta);

  return tile;
}

function handleAlbumClick(
  event: MouseEvent,
  elements: AlbumsScreenElements,
  options: AlbumsScreenOptions,
  state: AlbumsScreenState
): void {
  openAlbumFromTarget(event, elements, options, state);
}

function handleAlbumGridKeydown(
  event: KeyboardEvent,
  elements: AlbumsScreenElements,
  options: AlbumsScreenOptions,
  state: AlbumsScreenState
): void {
  const keyCode = getKeyCode(event);

  if (keyCode !== remoteKeys.enter && event.key !== " " && event.key !== "Spacebar") {
    return;
  }

  if (openAlbumFromTarget(event, elements, options, state)) {
    event.stopPropagation();
  }
}

function openAlbumFromTarget(
  event: Event,
  elements: AlbumsScreenElements,
  options: AlbumsScreenOptions,
  state: AlbumsScreenState
): boolean {
  const target = event.target as HTMLElement | null;
  const tile = target?.closest<HTMLElement>("[data-album-index]");

  if (!tile || !elements.grid.contains(tile)) {
    return false;
  }

  const index = Number(tile.getAttribute("data-album-index"));
  const album = Number.isFinite(index) ? state.albums[index] : null;

  if (!album) {
    return false;
  }

  event.preventDefault();
  state.focusedIndex = index;
  state.preferredColumn = index % columnCount;
  tile.focus();
  options.onOpenAlbum(album);
  return true;
}

function handleKeydown(
  event: KeyboardEvent,
  documentRef: Document,
  elements: AlbumsScreenElements,
  options: AlbumsScreenOptions,
  state: AlbumsScreenState
): void {
  const keyCode = getKeyCode(event);

  if (keyCode === remoteKeys.back) {
    event.preventDefault();
    if (options.onReturnToShell) {
      options.onReturnToShell();
      return;
    }

    setStatus(elements, "Albums is the first screen.");
    elements.root.focus();
    return;
  }

  if (keyCode === remoteKeys.enter) {
    const focusedAlbum = getFocusedAlbum(documentRef, elements, state);

    if (focusedAlbum) {
      event.preventDefault();
      options.onOpenAlbum(focusedAlbum);
    }

    return;
  }

  if (state.albums.length === 0) {
    return;
  }

  if (!isAlbumsScreenNavigationActive(documentRef, elements)) {
    return;
  }

  if (
    keyCode === remoteKeys.left ||
    keyCode === remoteKeys.right ||
    keyCode === remoteKeys.up ||
    keyCode === remoteKeys.down
  ) {
    event.preventDefault();
    moveFocus(keyCode, elements, options, state);
  }
}

function isAlbumsScreenNavigationActive(
  documentRef: Document,
  elements: AlbumsScreenElements
): boolean {
  const activeElement = documentRef.activeElement;

  return Boolean(activeElement && elements.grid.contains(activeElement));
}

function moveFocus(
  keyCode: number,
  elements: AlbumsScreenElements,
  options: AlbumsScreenOptions,
  state: AlbumsScreenState
): void {
  if (
    keyCode === remoteKeys.left &&
    state.focusedIndex % columnCount === 0 &&
    options.onReturnToShell
  ) {
    options.onReturnToShell();
    return;
  }

  if (keyCode === remoteKeys.up && state.focusedIndex < columnCount) {
    return;
  }

  if (
    keyCode === remoteKeys.right &&
    isGridRowEnd({
      columnCount,
      currentIndex: state.focusedIndex,
      itemCount: state.albums.length
    })
  ) {
    return;
  }

  const result = getNextGridIndex({
    columnCount,
    currentIndex: state.focusedIndex,
    direction: readDirection(keyCode),
    itemCount: state.albums.length,
    preferredColumn: state.preferredColumn
  });

  state.focusedIndex = result.index;
  state.preferredColumn = result.preferredColumn;
  renderAlbumWindow(elements, state);
  focusCurrentAlbum(elements, state);
  loadThumbnailsNearFocus(elements, options, state, state.loadGeneration);
}

// With nothing left to focus on the screen (empty or failed), focus returns
// to the left rail rather than being lost.
function returnFocusToRailIfOwned(
  elements: AlbumsScreenElements,
  options: AlbumsScreenOptions
): void {
  if (elements.root.contains(elements.root.ownerDocument.activeElement)) {
    options.onReturnToShell?.();
  }
}

function readDirection(keyCode: number): GridDirection {
  if (keyCode === remoteKeys.left) {
    return "left";
  }

  if (keyCode === remoteKeys.right) {
    return "right";
  }

  if (keyCode === remoteKeys.up) {
    return "up";
  }

  return "down";
}

function focusCurrentAlbum(elements: AlbumsScreenElements, state: AlbumsScreenState): void {
  const tile = elements.grid.querySelector<HTMLElement>(
    `[data-album-index="${state.focusedIndex}"]`
  );

  if (tile) {
    focusWithoutPageScroll(tile);
    scrollIntoContainer(elements.grid, tile, 12);
  }
}

function getFocusedAlbum(
  documentRef: Document,
  elements: AlbumsScreenElements,
  state: AlbumsScreenState
): Album | null {
  const activeElement = documentRef.activeElement as HTMLElement | null;

  if (!activeElement || !elements.grid.contains(activeElement)) {
    return null;
  }

  const index = Number(activeElement.getAttribute("data-album-index"));

  if (!Number.isFinite(index)) {
    return null;
  }

  state.focusedIndex = index;
  state.preferredColumn = index % columnCount;

  return state.albums[index] || null;
}

function loadThumbnailsNearFocus(
  elements: AlbumsScreenElements,
  options: AlbumsScreenOptions,
  state: AlbumsScreenState,
  generation: number
): void {
  const window = calculateThumbnailRetentionWindow({
    columnCount,
    focusedIndex: state.focusedIndex,
    itemCount: state.albums.length,
    rowsAfter: gridThumbnailRows.after,
    rowsBefore: gridThumbnailRows.before
  });

  state.retainedThumbnailAlbumIds = readRetainedAlbumIds(state.albums, window);
  revokeThumbnailsOutsideRetention(options, state);

  for (let index = window.startIndex; index < window.endIndex; index += 1) {
    const album = state.albums[index];

    if (
      !album ||
      !album.thumbnailAssetId ||
      state.thumbnailUrls[album.id] ||
      state.thumbnailRequests[album.id]
    ) {
      continue;
    }

    state.thumbnailRequests[album.id] = generation;

    options.service
      .loadThumbnailUrl(album)
      .then((url) => {
        if (!url) {
          if (state.thumbnailRequests[album.id] === generation) {
            delete state.thumbnailRequests[album.id];
          }
          return;
        }

        if (
          !isCurrentGeneration(state, generation) ||
          elements.root.hidden ||
          state.thumbnailRequests[album.id] !== generation ||
          !state.retainedThumbnailAlbumIds[album.id]
        ) {
          if (url) {
            options.service.revokeThumbnailUrl(url);
          }

          if (state.thumbnailRequests[album.id] === generation) {
            delete state.thumbnailRequests[album.id];
          }

          return;
        }

        delete state.thumbnailRequests[album.id];

        if (state.albums[index]?.id !== album.id) {
          options.service.revokeThumbnailUrl(url);
          return;
        }

        state.thumbnailUrls[album.id] = url;
        renderThumbnail(elements, index, album, url);
      })
      .catch(() => {
        if (state.thumbnailRequests[album.id] === generation) {
          delete state.thumbnailRequests[album.id];
        }
        // A missing cover should not make the album grid unusable.
      });
  }
}

function readRetainedAlbumIds(albums: Album[], window: AssetIndexWindow): Record<string, true> {
  const retained: Record<string, true> = {};

  for (let index = window.startIndex; index < window.endIndex; index += 1) {
    const album = albums[index];

    if (album) {
      retained[album.id] = true;
    }
  }

  return retained;
}

function restoreRenderedThumbnails(
  elements: AlbumsScreenElements,
  state: AlbumsScreenState,
  window: RenderedAssetWindow
): void {
  for (let index = window.startIndex; index < window.endIndex; index += 1) {
    const album = state.albums[index];
    const url = album ? state.thumbnailUrls[album.id] : null;

    if (album && url) {
      renderThumbnail(elements, index, album, url);
    }
  }
}

function renderThumbnail(
  elements: AlbumsScreenElements,
  index: number,
  album: Album,
  url: string
): void {
  const tile = elements.grid.querySelector<HTMLElement>(`[data-album-index="${index}"]`);

  if (!tile) {
    return;
  }

  const existingCover = tile.querySelector(".album-cover");

  if (existingCover) {
    existingCover.setAttribute("src", url);
    return;
  }

  const stage = elements.root.ownerDocument.createElement("span");
  stage.className = "album-cover-stage";

  const backdrop = elements.root.ownerDocument.createElement("img");
  backdrop.alt = "";
  backdrop.className = "album-cover-backdrop";
  backdrop.decoding = "async";
  backdrop.src = url;
  backdrop.setAttribute("aria-hidden", "true");
  stage.appendChild(backdrop);

  const image = elements.root.ownerDocument.createElement("img");
  image.alt = "";
  image.className = "album-cover";
  image.decoding = "async";
  image.src = url;
  image.setAttribute("aria-hidden", "true");
  stage.appendChild(image);

  const placeholder = tile.querySelector(".album-cover-placeholder");

  if (placeholder) {
    tile.replaceChild(stage, placeholder);
  }

  tile.setAttribute("aria-label", `${album.name}, ${formatAssetCount(album.assetCount)}`);
}

function revokeThumbnails(options: AlbumsScreenOptions, state: AlbumsScreenState): void {
  for (const url of Object.keys(state.thumbnailUrls).map(
    (albumId) => state.thumbnailUrls[albumId]
  )) {
    if (url) {
      options.service.revokeThumbnailUrl(url);
    }
  }

  state.retainedThumbnailAlbumIds = {};
  state.thumbnailRequests = {};
  state.thumbnailUrls = {};
}

function revokeThumbnailsOutsideRetention(
  options: AlbumsScreenOptions,
  state: AlbumsScreenState
): void {
  for (const albumId of Object.keys(state.thumbnailUrls)) {
    if (state.retainedThumbnailAlbumIds[albumId]) {
      continue;
    }

    const url = state.thumbnailUrls[albumId];

    if (url) {
      options.service.revokeThumbnailUrl(url);
    }

    delete state.thumbnailUrls[albumId];
  }
}

function setStatus(elements: AlbumsScreenElements, message: string, state = "idle"): void {
  elements.status.textContent = message;
  // An empty status line is hidden so it never takes space above the grid.
  elements.status.hidden = !message;
  elements.status.setAttribute("data-state", state);
}

function formatAssetCount(count: number): string {
  return count === 1 ? "1 asset" : `${count} assets`;
}

function readAlbumInitial(name: string): string {
  const trimmed = name.trim();

  return trimmed ? trimmed.charAt(0).toUpperCase() : "A";
}
