import type { AlbumService } from "../app/album-service";
import { localMemoryDate, type Memory } from "../domain/home";
import { toUserMessage } from "../errors/app-error";
import { getNextGridIndex, type GridDirection } from "../navigation/grid-navigation";
import { getKeyCode, readArrowDirection, remoteKeys } from "../platform/tizen/keys";
import { formatMemoryContext, formatMemoryTitle } from "../presentation/memory-labels";
import {
  calculateRenderedAssetWindow,
  calculateThumbnailRetentionWindow,
  gridRenderRows,
  gridThumbnailRows
} from "./album-assets-window";
import {
  createAssetThumbnailState,
  reconcileAssetThumbnails,
  revokeAllAssetThumbnails
} from "./asset-thumbnail-window";
import { createPageWindow, type PageWindowDirection } from "./page-window";
import {
  beginAsyncGeneration,
  invalidateAsyncGeneration,
  isCurrentGeneration
} from "./async-generation";
import { createGridSpacer, focusWithoutPageScroll, scrollIntoContainer } from "./grid-presentation";

// Today's Memories as an Albums-style card grid under Home (ADR 0011). Pages
// load lazily near remote focus and at most five pages are retained.

// Six per row, matching every grid and Home's tile size.
const columnCount = 6;
// Three full rows of six; Immich's Memories request allows up to 18.
const pageSize = 18;
// Five pages (15 rows) always cover the rendered rows either side of focus.
const retainedPageCount = 5;
// Empty Memories are filtered after server paging, so a page can be empty
// without ending the list. Cap the requests made per remote movement.
const emptyPageScanLimit = 4;

type LoadDirection = PageWindowDirection;

type MemoriesScreenElements = {
  grid: HTMLElement;
  retry: HTMLElement;
  root: HTMLElement;
  status: HTMLElement;
};

type MemoriesScreenOptions = {
  documentRef?: Document;
  onBack(): void;
  onOpenMemory(memory: Memory): void;
  onReturnToShell?(): void;
  service: AlbumService;
};

type MemoriesScreenState = {
  date: string;
  destroyed: boolean;
  failedDirection: LoadDirection | null;
  focusedIndex: number;
  loadGeneration: number;
  loading: boolean;
  preferredColumn: number;
  total: number | null;
};

export type MemoriesScreenController = {
  destroy(): void;
  focusContent(): void;
  hide(): void;
  reset(): void;
  show(): void;
};

export function mountMemoriesScreen(options: MemoriesScreenOptions): MemoriesScreenController {
  const documentRef = options.documentRef || document;
  const elements = readElements(documentRef);
  const thumbnails = createAssetThumbnailState();
  const pages = createPageWindow<Memory>({
    idOf: (memory) => memory.id,
    retainedPageCount
  });
  const state: MemoriesScreenState = {
    date: localMemoryDate(),
    destroyed: false,
    failedDirection: null,
    focusedIndex: 0,
    loadGeneration: 0,
    loading: false,
    preferredColumn: 0,
    total: null
  };

  function memories(): Memory[] {
    return pages.items();
  }

  function ownsFocus(): boolean {
    return elements.root.contains(documentRef.activeElement);
  }

  function focusCard(): void {
    const tile = elements.grid.querySelector<HTMLElement>(
      `[data-memory-index="${state.focusedIndex}"]`
    );

    if (!tile) {
      (elements.retry.hidden ? elements.status : elements.retry).focus();
      return;
    }

    focusWithoutPageScroll(tile);
    scrollIntoContainer(elements.grid, tile, 12);
  }

  function clearImages(): void {
    elements.grid.querySelectorAll("img").forEach((image) => image.removeAttribute("src"));
    revokeAllAssetThumbnails(thumbnails, options.service.revokeThumbnailUrl);
  }

  function appendCover(assetId: string, url: string): void {
    memories().forEach((memory, index) => {
      if (memory.assets[0]?.id !== assetId) {
        return;
      }

      const tile = elements.grid.querySelector<HTMLElement>(`[data-memory-index="${index}"]`);

      if (!tile || tile.querySelector("img")) {
        return;
      }

      const image = documentRef.createElement("img");
      image.className = "album-cover";
      image.alt = "";
      image.src = url;
      tile.insertBefore(image, tile.querySelector(".album-meta"));
    });
  }

  function appendSpacer(rowCount: number): void {
    if (rowCount) {
      elements.grid.appendChild(
        createGridSpacer(documentRef, "album-grid-spacer", "--album-spacer-rows", rowCount)
      );
    }
  }

  function render(): void {
    const items = memories();

    // Match Albums' square cards and grid sizing at every viewport.

    const rendered = calculateRenderedAssetWindow({
      columnCount,
      focusedIndex: state.focusedIndex,
      itemCount: items.length,
      rowsAfter: gridRenderRows.after,
      rowsBefore: gridRenderRows.before
    });

    elements.grid.textContent = "";
    appendSpacer(rendered.topSpacerRows);

    for (let index = rendered.startIndex; index < rendered.endIndex; index += 1) {
      elements.grid.appendChild(createMemoryCard(documentRef, items[index]!, index));
    }

    appendSpacer(rendered.bottomSpacerRows);
    loadCoversNearFocus(items);
  }

  function loadCoversNearFocus(items: Memory[]): void {
    const retention = calculateThumbnailRetentionWindow({
      columnCount,
      focusedIndex: state.focusedIndex,
      itemCount: items.length,
      rowsAfter: gridThumbnailRows.after,
      rowsBefore: gridThumbnailRows.before
    });
    const covers = items
      .map((memory, index) => ({ asset: memory.assets[0], index }))
      .filter(
        (cover) =>
          cover.asset && cover.index >= retention.startIndex && cover.index < retention.endIndex
      );
    const assets = covers.map((cover) => cover.asset!);

    for (const asset of assets) {
      const url = thumbnails.thumbnailUrls[asset.id];

      if (url) {
        appendCover(asset.id, url);
      }
    }

    reconcileAssetThumbnails({
      assets,
      focusedIndex: Math.max(
        0,
        covers.findIndex((cover) => cover.index === state.focusedIndex)
      ),
      generation: state.loadGeneration,
      isCurrentGeneration: (generation) =>
        !state.destroyed && isCurrentGeneration(state, generation),
      isHidden: () => elements.root.hidden,
      loadThumbnailUrl: options.service.loadAssetThumbnailUrl,
      onThumbnailLoaded: (asset, _index, url) => appendCover(asset.id, url),
      revokeThumbnailUrl: options.service.revokeThumbnailUrl,
      state: thumbnails,
      window: { endIndex: assets.length, startIndex: 0 }
    });
  }

  function canLoad(direction: LoadDirection): boolean {
    if (direction === "before") {
      return pages.nextPage("before") >= 1;
    }

    return state.total === null || (pages.nextPage("after") - 1) * pageSize < state.total;
  }

  function setStatus(message: string, statusState: string): void {
    elements.status.textContent = message;
    elements.status.setAttribute("data-state", statusState);
  }

  async function load(direction: LoadDirection, fillScreen = false): Promise<void> {
    if (state.loading || state.destroyed || elements.root.hidden || !canLoad(direction)) {
      return;
    }

    const generation = state.loadGeneration;
    const isStale = () =>
      state.destroyed || elements.root.hidden || !isCurrentGeneration(state, generation);

    state.loading = true;
    state.failedDirection = null;
    elements.retry.hidden = true;
    setStatus(memories().length ? "Loading more Memories..." : "Loading Memories...", "pending");

    try {
      if (state.total === null) {
        const count = await options.service.loadMemoriesTotal(state.date);

        if (isStale()) {
          return;
        }

        state.total = count;
      }

      // The server count bounds scanning across pages emptied by filtering.
      for (let scanned = 0; scanned < emptyPageScanLimit && canLoad(direction); scanned += 1) {
        const page = pages.nextPage(direction);
        const result = await options.service.loadMemories(pageSize, page, state.date);

        if (isStale()) {
          return;
        }

        const focusedId = memories()[state.focusedIndex]?.id;

        if (pages.accept(direction, page, result.slice(0, pageSize), focusedId)) {
          state.focusedIndex = Math.max(0, pages.indexOf(focusedId));

          if (!fillScreen || memories().length >= pageSize) {
            break;
          }
        }
      }

      const shouldFocus = ownsFocus();

      render();

      if (memories().length) {
        setStatus("", "idle");
      } else if (canLoad("after")) {
        setStatus("No visible Memories here. Press Down to continue.", "idle");
      } else {
        setStatus("No Memories today.", "idle");
      }

      if (shouldFocus) {
        focusCard();
      }
    } catch (error) {
      if (isStale()) {
        return;
      }

      state.failedDirection = direction;
      setStatus(`${toUserMessage(error)} Select Retry or press Back.`, "error");
      elements.retry.hidden = false;

      if (ownsFocus()) {
        elements.retry.focus();
      }
    } finally {
      if (isCurrentGeneration(state, generation)) {
        state.loading = false;
      }
    }
  }

  function loadNearFocus(direction: GridDirection): void {
    if (state.failedDirection) {
      return;
    }

    const count = memories().length;

    // Load before the rendered rows run out, so every row on screen exists.
    if (
      (direction === "down" || direction === "right") &&
      state.focusedIndex >= count - columnCount * (gridRenderRows.after + 1) &&
      canLoad("after")
    ) {
      void load("after");
    } else if (
      direction === "up" &&
      state.focusedIndex < columnCount * (gridRenderRows.before + 1) &&
      canLoad("before")
    ) {
      void load("before");
    }
  }

  function open(target: HTMLElement): void {
    const value = target.getAttribute("data-memory-index");

    if (value === null) {
      return;
    }

    const item = memories()[Number(value)];

    if (!item) {
      return;
    }

    state.focusedIndex = Number(value);
    state.preferredColumn = state.focusedIndex % columnCount;
    options.onOpenMemory(item);
  }

  function retryLoad(): void {
    if (state.failedDirection) {
      void load(state.failedDirection, memories().length === 0);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (elements.root.hidden) {
      return;
    }

    const keyCode = getKeyCode(event);

    if (keyCode === remoteKeys.back) {
      event.preventDefault();
      options.onBack();
      return;
    }

    const activeElement = documentRef.activeElement as HTMLElement | null;

    if (!activeElement || !elements.root.contains(activeElement)) {
      return;
    }

    if (keyCode === remoteKeys.enter) {
      event.preventDefault();

      if (activeElement === elements.retry) {
        retryLoad();
      } else {
        open(activeElement);
      }

      return;
    }

    const direction = readArrowDirection(keyCode);

    if (!direction) {
      return;
    }

    event.preventDefault();

    if (activeElement === elements.retry || activeElement === elements.status) {
      if (direction === "down" && memories().length) {
        focusCard();
      } else if (direction === "down" && !state.failedDirection) {
        void load("after", true);
      }

      return;
    }

    if (direction === "up" && state.focusedIndex < columnCount && !elements.retry.hidden) {
      elements.retry.focus();
      return;
    }

    if (direction === "left" && state.focusedIndex % columnCount === 0 && options.onReturnToShell) {
      options.onReturnToShell();
      return;
    }

    const result = getNextGridIndex({
      columnCount,
      currentIndex: state.focusedIndex,
      direction,
      itemCount: memories().length,
      preferredColumn: state.preferredColumn
    });

    state.focusedIndex = result.index;
    state.preferredColumn = result.preferredColumn;
    render();
    focusCard();
    loadNearFocus(direction);
  }

  const handleDocumentKeydown = (event: KeyboardEvent) => {
    handleKeydown(event);

    // Opening a Memory makes the collection screen's listener active at once;
    // keep this press from also activating its focused control.
    if (event.defaultPrevented) {
      event.stopImmediatePropagation();
    }
  };
  const handleClick = (event: MouseEvent) => {
    if (elements.root.hidden) {
      return;
    }

    const target = (event.target as HTMLElement).closest<HTMLElement>("button");

    if (!target || !elements.root.contains(target)) {
      return;
    }

    if (target === elements.retry) {
      retryLoad();
    } else {
      open(target);
    }
  };

  documentRef.addEventListener("keydown", handleDocumentKeydown);
  elements.root.addEventListener("click", handleClick);

  function hide(): void {
    invalidateAsyncGeneration(state);
    state.loading = false;
    elements.root.hidden = true;
    clearImages();
    elements.grid.textContent = "";
  }

  function reset(): void {
    hide();
    pages.reset();
    state.total = null;
    state.focusedIndex = 0;
    state.preferredColumn = 0;
    state.date = localMemoryDate();
    state.failedDirection = null;
  }

  return {
    destroy() {
      reset();
      state.destroyed = true;
      documentRef.removeEventListener("keydown", handleDocumentKeydown);
      elements.root.removeEventListener("click", handleClick);
    },
    focusContent() {
      focusCard();
    },
    hide,
    reset,
    show() {
      if (state.date !== localMemoryDate()) {
        reset();
      }

      elements.root.hidden = false;

      if (memories().length) {
        render();
        focusCard();

        if (!state.failedDirection) {
          setStatus("", "idle");
        }
      } else {
        beginAsyncGeneration(state);
        void load("after", true);
        // Loading writes the status first: an empty status line is hidden
        // and could not take focus.
        elements.status.focus();
      }
    }
  };
}

function readElements(documentRef: Document): MemoriesScreenElements {
  return {
    grid: requireElement(documentRef, "memories-grid"),
    retry: requireElement(documentRef, "memories-retry"),
    root: requireElement(documentRef, "memories-screen"),
    status: requireElement(documentRef, "memories-status")
  };
}

function requireElement(documentRef: Document, id: string): HTMLElement {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element;
}

function createMemoryCard(documentRef: Document, memory: Memory, index: number): HTMLButtonElement {
  const tile = documentRef.createElement("button");
  tile.className = "focusable album-tile";
  tile.setAttribute("type", "button");
  tile.setAttribute("data-memory-index", String(index));
  const title = formatMemoryTitle(memory);
  const context = formatMemoryContext(memory);

  tile.setAttribute("aria-label", `${title}, ${context}, ${memory.assetCount} assets`);

  const placeholder = documentRef.createElement("span");
  placeholder.className = "album-cover-placeholder";
  placeholder.textContent = title.charAt(0);
  placeholder.setAttribute("aria-hidden", "true");
  tile.appendChild(placeholder);

  const meta = documentRef.createElement("span");
  meta.className = "album-meta";

  const name = documentRef.createElement("span");
  name.className = "album-name";
  name.textContent = title;
  meta.appendChild(name);

  const contextLine = documentRef.createElement("span");
  contextLine.className = "album-count";
  contextLine.textContent = context;
  meta.appendChild(contextLine);

  tile.appendChild(meta);

  return tile;
}
