import type { AlbumService } from "../../app/album-service";
import type { AlbumAsset, AlbumAssetPage, AlbumAssetPageToken } from "../../domain/album";
import { toUserMessage } from "../../errors/app-error";
import {
  getNextGridIndex,
  isGridRowEnd,
  type GridDirection,
  type GridNavigationResult
} from "../../navigation/grid-navigation";
import { readChannelDirection, remoteKeys } from "../../platform/tizen/keys";
import {
  calculateRenderedAssetWindow,
  calculateThumbnailRetentionWindow,
  type RenderedAssetWindow,
  gridRenderRows,
  gridThumbnailRows
} from "../album-assets-window";
import {
  createAssetThumbnailState,
  reconcileAssetThumbnails,
  revokeAllAssetThumbnails,
  type AssetThumbnailState
} from "../asset-thumbnail-window";
import { isCurrentGeneration } from "../async-generation";
import {
  createGridSpacer,
  createLivePhotoBadge,
  createVideoBadge,
  focusWithoutPageScroll,
  scrollIntoContainer
} from "../grid-presentation";
import { isLivePhotoAsset, readAssetTypeLabel } from "./asset-presentation";
import {
  collectionColumnCount as columnCount,
  formatAssetPageKey,
  isLoading,
  isTimelineRailFocused,
  isViewerOpen,
  readPreviousPageToken,
  updateTotalFromPage,
  type CollectionModel
} from "./collection-model";

// The collection grid: windowed tiles, the bounded thumbnail lifecycle, remote
// focus and navigation, paging in both directions, and status, empty and error
// states with the Back/Refresh and Retry controls.

const assetPageLoadThreshold = columnCount * 4;
const previousPageAssetTarget = columnCount * 2;

export type GridElements = {
  grid: HTMLElement;
  retryButton: HTMLButtonElement;
  root: HTMLElement;
  summary: HTMLElement;
};

// How tiles are arranged. Plain collections use fixed rows; Photos supplies a
// date-section layout where each day starts a new row.
export type GridLayout = {
  calculateWindow(): RenderedAssetWindow;
  columnOf(index: number): number;
  isFirstRow(index: number, preferredColumn: number): boolean;
  isRowEnd(index: number): boolean;
  isRowStart(index: number): boolean;
  next(index: number, direction: GridDirection, preferredColumn: number): GridNavigationResult;
  sectionLabel(index: number): string | null;
};

// Optional Photos timeline rail attached beside the grid.
export type GridRail = {
  // Moves remote focus to the rail; false when there is no rail to enter.
  enter(): boolean;
  // CH ▲/▼ from the grid: enter the rail and move a year. False when there is
  // no rail to enter.
  enterByChannel(direction: -1 | 1): boolean;
  focusMarker(): void;
  handleKeydown(event: KeyboardEvent, keyCode: number): void;
  render(): void;
};

export type GridHeader = {
  // Focuses the header; false when it has nothing to focus.
  focus(): boolean;
  // Handles a key while the header has focus; false otherwise.
  handleKeydown(event: KeyboardEvent, keyCode: number): boolean;
  // While the header has focus, loading keeps focus there.
  hasFocus(): boolean;
};

// How newer assets are prepended: select the asset immediately before the
// viewer's current one, move up a row in the grid, or keep the current focus.
export type PreviousPageFocus = "previous-asset" | "previous-row" | "preserve";

type CollectionGridOptions = {
  elements: GridElements;
  // Focuses the screen's own controls when no asset can take focus.
  focusControls(): void;
  // Header controls above the grid, reached with Up from its first row.
  header?: GridHeader;
  // The Back key.
  onBack(): void;
  onOpenAsset(index: number): void;
  onRetry(): void;
  onReturnToShell?(): void;
  // Re-render the open viewer after its assets changed.
  onViewerAssetsChanged(): void;
  loadPage(page: AlbumAssetPageToken): Promise<AlbumAssetPage>;
  model: CollectionModel;
  service: Pick<AlbumService, "loadAssetThumbnailUrl" | "revokeThumbnailUrl">;
};

export type CollectionGridController = {
  clear(): void;
  focusContent(): void;
  focusCurrentAsset(): void;
  handleKeydown(event: KeyboardEvent, keyCode: number): void;
  loadMore(): void;
  loadPrevious(focus: PreviousPageFocus): void;
  loadThumbnails(): void;
  // Render the window around focus, refresh the rail, focus the current asset
  // and load nearby thumbnails and pages.
  refreshAroundFocus(): void;
  render(shouldFocus?: boolean): void;
  renderWindow(): void;
  resetThumbnails(): void;
  setLayout(layout: GridLayout, rail: GridRail | null): void;
  setStatus(message: string, state?: string): void;
  updateStatus(): void;
};

export function createPlainGridLayout(model: CollectionModel): GridLayout {
  return {
    calculateWindow() {
      return calculateRenderedAssetWindow({
        columnCount,
        focusedIndex: model.focusedIndex,
        itemCount: model.assets.length,
        rowsAfter: gridRenderRows.after,
        rowsBefore: gridRenderRows.before
      });
    },
    columnOf(index) {
      return index % columnCount;
    },
    isFirstRow(index) {
      return index < columnCount;
    },
    isRowEnd(index) {
      return isGridRowEnd({ columnCount, currentIndex: index, itemCount: model.assets.length });
    },
    isRowStart(index) {
      return index % columnCount === 0;
    },
    next(index, direction, preferredColumn) {
      return getNextGridIndex({
        columnCount,
        currentIndex: index,
        direction,
        itemCount: model.assets.length,
        preferredColumn
      });
    },
    sectionLabel() {
      return null;
    }
  };
}

export function createCollectionGrid(options: CollectionGridOptions): CollectionGridController {
  const { elements, model } = options;

  let layout = createPlainGridLayout(model);
  let rail: GridRail | null = null;
  let thumbnails: AssetThumbnailState = createAssetThumbnailState();

  // An empty status line is hidden so it never takes space above the grid.
  function setStatus(message: string, state = "idle"): void {
    elements.summary.textContent = message;
    elements.summary.hidden = !message;
    elements.summary.setAttribute("data-state", state);
  }

  // A loaded grid shows no count; the viewer shows the position. The status
  // line keeps only a Memory's context: a "Loading more..." line would push
  // the grid down and back on every page.
  function updateStatus(): void {
    // Unseen counts, so tests and captures can observe paging and totals.
    elements.summary.setAttribute("data-loaded-count", String(model.assets.length));
    elements.summary.setAttribute("data-total", model.total === null ? "" : String(model.total));

    const context = model.source?.kind === "static" ? model.source.context : undefined;

    setStatus(context || "", "success");
  }

  function renderWindow(): void {
    const window = layout.calculateWindow();
    const documentRef = elements.root.ownerDocument;

    elements.grid.textContent = "";

    if (window.topSpacerRows > 0 || window.topSpacerHeadingRows) {
      elements.grid.appendChild(
        createAssetSpacer(documentRef, window.topSpacerRows, window.topSpacerHeadingRows || 0)
      );
    }

    for (let index = window.startIndex; index < window.endIndex; index += 1) {
      const asset = model.assets[index];

      if (asset) {
        const dateLabel = layout.sectionLabel(index);

        if (dateLabel) {
          elements.grid.appendChild(createDateSectionHeading(documentRef, dateLabel));
        }

        elements.grid.appendChild(createAssetTile(documentRef, asset, index));
      }
    }

    if (window.bottomSpacerRows > 0 || window.bottomSpacerHeadingRows) {
      elements.grid.appendChild(
        createAssetSpacer(documentRef, window.bottomSpacerRows, window.bottomSpacerHeadingRows || 0)
      );
    }

    restoreRenderedThumbnails(window);
  }

  function focusCurrentAsset(): void {
    const tile = elements.grid.querySelector<HTMLElement>(
      `[data-asset-index="${model.focusedIndex}"]`
    );

    if (tile) {
      focusWithoutPageScroll(tile);
      scrollIntoContainer(elements.grid, tile, 12);
      return;
    }

    options.focusControls();
  }

  function loadThumbnails(generation = model.loadGeneration): void {
    const window = calculateThumbnailRetentionWindow({
      columnCount,
      focusedIndex: model.focusedIndex,
      itemCount: model.assets.length,
      rowsAfter: gridThumbnailRows.after,
      rowsBefore: gridThumbnailRows.before
    });

    reconcileAssetThumbnails({
      assets: model.assets,
      focusedIndex: model.focusedIndex,
      generation,
      isCurrentGeneration: (thumbnailGeneration) => isCurrentGeneration(model, thumbnailGeneration),
      isHidden: () => elements.root.hidden,
      loadThumbnailUrl: (asset) => options.service.loadAssetThumbnailUrl(asset),
      onThumbnailLoaded: (asset, index, url) => renderThumbnail(asset, index, url),
      revokeThumbnailUrl: options.service.revokeThumbnailUrl,
      state: thumbnails,
      window
    });
  }

  function restoreRenderedThumbnails(window: RenderedAssetWindow): void {
    for (let index = window.startIndex; index < window.endIndex; index += 1) {
      const asset = model.assets[index];
      const url = asset ? thumbnails.thumbnailUrls[asset.id] : null;

      if (asset && url) {
        renderThumbnail(asset, index, url);
      }
    }
  }

  function renderThumbnail(asset: AlbumAsset, index: number, url: string): void {
    const tile = elements.grid.querySelector<HTMLElement>(`[data-asset-index="${index}"]`);

    if (!tile || tile.getAttribute("data-asset-id") !== asset.id) {
      return;
    }

    const existingThumbnail = tile.querySelector<HTMLImageElement>(".asset-thumbnail");

    if (existingThumbnail) {
      existingThumbnail.src = url;
      return;
    }

    const image = elements.root.ownerDocument.createElement("img");
    image.alt = "";
    image.className = "asset-thumbnail";
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

  function resetThumbnails(): void {
    revokeAllAssetThumbnails(thumbnails, options.service.revokeThumbnailUrl);
    thumbnails = createAssetThumbnailState();
  }

  function render(shouldFocusGrid = true, generation = model.loadGeneration): void {
    if (!model.source || model.assets.length === 0) {
      elements.grid.textContent = "";
      setStatus(
        model.source?.kind === "photos" ? "There are no photos to show." : "This album is empty.",
        "idle"
      );
      options.focusControls();
      return;
    }

    updateStatus();
    renderWindow();
    if (shouldFocusGrid && !options.header?.hasFocus()) {
      focusCurrentAsset();
    }
    loadThumbnails(generation);
    maybeLoadMore(generation);
  }

  function refreshAroundFocus(): void {
    renderWindow();
    rail?.render();
    focusCurrentAsset();
    loadThumbnails();
    maybeLoadPrevious(model.loadGeneration, "preserve");
    maybeLoadMore(model.loadGeneration);
  }

  function maybeLoadMore(generation = model.loadGeneration): void {
    if (
      !model.source ||
      !model.paging.next ||
      isLoading(model) ||
      model.paging.loadingNext ||
      !isCurrentGeneration(model, generation) ||
      elements.root.hidden
    ) {
      return;
    }

    if (model.assets.length - model.focusedIndex > assetPageLoadThreshold) {
      return;
    }

    void loadNextPage(generation);
  }

  function maybeLoadPrevious(generation: number, focus: PreviousPageFocus): void {
    if (
      !model.paging.previous ||
      isLoading(model) ||
      model.paging.loadingNext ||
      model.paging.loadingPrevious ||
      !isCurrentGeneration(model, generation) ||
      elements.root.hidden
    ) {
      return;
    }

    if (model.focusedIndex >= columnCount) {
      return;
    }

    void loadPreviousPages(generation, focus);
  }

  async function loadPreviousPages(generation: number, focus: PreviousPageFocus): Promise<void> {
    const source = model.source;

    if (
      !source ||
      !model.paging.previous ||
      model.paging.loadingNext ||
      model.paging.loadingPrevious
    ) {
      return;
    }

    let page: AlbumAssetPageToken | null = model.paging.previous;
    const previousPages: AlbumAsset[][] = [];
    const requestedPageKeys: string[] = [];
    let loadedAssetCount = 0;
    let total = model.total;

    model.paging.loadingPrevious = true;
    if (!isViewerOpen(model)) {
      updateStatus();
    }

    try {
      while (page && loadedAssetCount < previousPageAssetTarget) {
        const pageKey = formatAssetPageKey(page);

        if (model.paging.requested[pageKey]) {
          page = readPreviousPageToken(page);
          continue;
        }

        model.paging.requested[pageKey] = true;
        requestedPageKeys.push(pageKey);
        const result = await options.loadPage(page);

        if (
          !isCurrentGeneration(model, generation) ||
          elements.root.hidden ||
          model.source?.id !== source.id
        ) {
          return;
        }

        if (result.total !== null) {
          total = result.total;
        }

        if (result.assets.length > 0) {
          previousPages.unshift(result.assets);
          loadedAssetCount += result.assets.length;
        }

        page = readPreviousPageToken(page);
      }

      const previousAssets = flattenAssetPages(previousPages);

      model.paging.previous = page;

      if (previousAssets.length === 0) {
        if (!isViewerOpen(model)) {
          updateStatus();
        }
        return;
      }

      const shiftedFocusedIndex = model.focusedIndex + previousAssets.length;

      model.assets = previousAssets.concat(model.assets);
      model.assetOffset = Math.max(0, model.assetOffset - previousAssets.length);
      model.focusedIndex = readPrependedFocusIndex(
        focus,
        previousAssets.length,
        shiftedFocusedIndex
      );
      model.preferredColumn = layout.columnOf(model.focusedIndex);

      if (total !== null) {
        updateTotalFromPage(model, total);
      }

      if (isViewerOpen(model)) {
        options.onViewerAssetsChanged();
      } else {
        renderWindow();
        rail?.render();
        focusCurrentAsset();
        loadThumbnails(generation);
        updateStatus();
      }
    } catch (error) {
      if (
        !isCurrentGeneration(model, generation) ||
        elements.root.hidden ||
        model.source?.id !== source.id
      ) {
        return;
      }

      // Nothing from this batch was applied, so allow every page in it to be
      // requested again on the next remote movement.
      requestedPageKeys.forEach((key) => {
        delete model.paging.requested[key];
      });

      if (!isViewerOpen(model)) {
        setStatus(`Could not load newer assets. ${toUserMessage(error)}`, "error");
      }
    } finally {
      if (isCurrentGeneration(model, generation) && model.source?.id === source.id) {
        model.paging.loadingPrevious = false;

        if (!isViewerOpen(model)) {
          updateStatus();
        }
      }
    }
  }

  function readPrependedFocusIndex(
    focus: PreviousPageFocus,
    previousAssetCount: number,
    shiftedFocusedIndex: number
  ): number {
    if (focus === "previous-asset") {
      return Math.max(0, previousAssetCount - 1);
    }

    if (focus === "previous-row") {
      return layout.next(shiftedFocusedIndex, "up", model.preferredColumn).index;
    }

    return shiftedFocusedIndex;
  }

  async function loadNextPage(generation: number): Promise<void> {
    const source = model.source;
    const page = model.paging.next;

    if (!source || !page || model.paging.loadingNext) {
      return;
    }

    const pageKey = formatAssetPageKey(page);

    if (model.paging.requested[pageKey]) {
      model.paging.next = null;
      if (!isViewerOpen(model)) {
        updateStatus();
      }
      return;
    }

    model.paging.requested[pageKey] = true;
    model.paging.loadingNext = true;
    if (!isViewerOpen(model)) {
      updateStatus();
    }
    let failed = false;

    try {
      const result = await options.loadPage(page);

      if (
        !isCurrentGeneration(model, generation) ||
        elements.root.hidden ||
        model.source?.id !== source.id
      ) {
        return;
      }

      model.assets = model.assets.concat(
        model.source?.kind === "feed"
          ? withoutLoadedAssets(model.assets, result.assets)
          : result.assets
      );
      model.paging.next = result.nextPageToken;
      updateTotalFromPage(model, result.total);

      if (isViewerOpen(model)) {
        options.onViewerAssetsChanged();
      } else {
        renderWindow();
        rail?.render();
        if (isTimelineRailFocused(model)) {
          rail?.focusMarker();
        } else {
          focusCurrentAsset();
        }
        loadThumbnails(generation);
        updateStatus();
      }
    } catch (error) {
      if (
        !isCurrentGeneration(model, generation) ||
        elements.root.hidden ||
        model.source?.id !== source.id
      ) {
        return;
      }

      failed = true;
      // Allow the next remote movement to request this page again.
      delete model.paging.requested[pageKey];
      if (!isViewerOpen(model)) {
        setStatus(`Could not load more assets. ${toUserMessage(error)}`, "error");
      }
    } finally {
      if (isCurrentGeneration(model, generation) && model.source?.id === source.id) {
        model.paging.loadingNext = false;

        if (!failed && !isViewerOpen(model)) {
          updateStatus();
        }
      }
    }
  }

  function moveAssetFocus(keyCode: number): void {
    if (
      keyCode === remoteKeys.left &&
      layout.isRowStart(model.focusedIndex) &&
      options.onReturnToShell
    ) {
      options.onReturnToShell();
      return;
    }

    if (keyCode === remoteKeys.up && layout.isFirstRow(model.focusedIndex, model.preferredColumn)) {
      if (model.paging.previous) {
        maybeLoadPrevious(model.loadGeneration, "previous-row");
      } else {
        options.header?.focus();
      }

      return;
    }

    if (keyCode === remoteKeys.right && layout.isRowEnd(model.focusedIndex)) {
      rail?.enter();
      return;
    }

    const result = layout.next(model.focusedIndex, readDirection(keyCode), model.preferredColumn);

    model.focusedIndex = result.index;
    model.preferredColumn = result.preferredColumn;
    refreshAroundFocus();
  }

  function getFocusedAssetIndex(): number | null {
    const activeElement = elements.root.ownerDocument.activeElement as HTMLElement | null;

    if (!activeElement || !elements.grid.contains(activeElement)) {
      return null;
    }

    const index = Number(activeElement.getAttribute("data-asset-index"));

    if (!Number.isFinite(index) || !model.assets[index]) {
      return null;
    }

    model.focusedIndex = index;
    model.preferredColumn = index % columnCount;

    return index;
  }

  function handleKeydown(event: KeyboardEvent, keyCode: number): void {
    const activeElement = elements.root.ownerDocument.activeElement;

    if (isTimelineRailFocused(model) && rail) {
      rail.handleKeydown(event, keyCode);
      return;
    }

    if (options.header?.handleKeydown(event, keyCode)) {
      return;
    }

    if (keyCode === remoteKeys.back) {
      event.preventDefault();
      options.onBack();
      return;
    }

    if (keyCode === remoteKeys.enter) {
      if (activeElement === elements.retryButton && !elements.retryButton.hidden) {
        event.preventDefault();
        stopEvent(event);
        options.onRetry();
        return;
      }

      const index = getFocusedAssetIndex();

      if (index !== null) {
        event.preventDefault();
        options.onOpenAsset(index);
      }

      return;
    }

    if (activeElement === elements.retryButton && !elements.retryButton.hidden) {
      if (keyCode === remoteKeys.left && options.onReturnToShell) {
        event.preventDefault();
        options.onReturnToShell();
      } else if (keyCode === remoteKeys.right && options.header?.focus()) {
        event.preventDefault();
      }
      return;
    }

    if (model.assets.length === 0) {
      return;
    }

    if (!activeElement || !elements.grid.contains(activeElement)) {
      return;
    }

    const channelDirection = readChannelDirection(keyCode);

    if (channelDirection !== null) {
      if (rail?.enterByChannel(channelDirection)) {
        event.preventDefault();
      }
      return;
    }

    if (
      keyCode === remoteKeys.left ||
      keyCode === remoteKeys.right ||
      keyCode === remoteKeys.up ||
      keyCode === remoteKeys.down
    ) {
      event.preventDefault();
      moveAssetFocus(keyCode);
    }
  }

  return {
    clear() {
      elements.grid.textContent = "";
    },
    focusContent() {
      if (model.assets.length > 0) {
        renderWindow();
        focusCurrentAsset();
        loadThumbnails();
        maybeLoadMore();
        return;
      }

      options.focusControls();
    },
    focusCurrentAsset,
    handleKeydown,
    loadMore() {
      maybeLoadMore();
    },
    loadPrevious(focus) {
      maybeLoadPrevious(model.loadGeneration, focus);
    },
    loadThumbnails() {
      loadThumbnails();
    },
    refreshAroundFocus,
    render(shouldFocus) {
      render(shouldFocus);
    },
    renderWindow,
    resetThumbnails,
    setLayout(nextLayout, nextRail) {
      layout = nextLayout;
      rail = nextRail;
    },
    setStatus,
    updateStatus
  };
}

function stopEvent(event: Event): void {
  event.stopPropagation();

  if (typeof event.stopImmediatePropagation === "function") {
    event.stopImmediatePropagation();
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

// A feed starts with its Home rail items, which its first page repeats.
function withoutLoadedAssets(loaded: AlbumAsset[], page: AlbumAsset[]): AlbumAsset[] {
  const loadedIds = new Set(loaded.map((asset) => asset.id));

  return page.filter((asset) => !loadedIds.has(asset.id));
}

function flattenAssetPages(pages: AlbumAsset[][]): AlbumAsset[] {
  const assets: AlbumAsset[] = [];

  for (const page of pages) {
    assets.push(...page);
  }

  return assets;
}

function createAssetSpacer(
  documentRef: Document,
  rowCount: number,
  headingRowCount: number
): HTMLElement {
  const spacer = createGridSpacer(
    documentRef,
    "asset-grid-spacer",
    "--asset-spacer-rows",
    rowCount
  );

  spacer.style.setProperty("--asset-spacer-heading-rows", String(headingRowCount));

  return spacer;
}

function createAssetTile(
  documentRef: Document,
  asset: AlbumAsset,
  index: number
): HTMLButtonElement {
  const tile = documentRef.createElement("button");
  tile.className = "focusable asset-tile";
  tile.type = "button";
  tile.setAttribute("data-action", "open-asset-viewer");
  tile.setAttribute("data-asset-id", asset.id);
  tile.setAttribute("data-asset-index", String(index));
  tile.setAttribute("aria-label", `${asset.name}, ${readAssetTypeLabel(asset)}`);

  const placeholder = documentRef.createElement("span");
  placeholder.className = "asset-thumbnail-placeholder";
  placeholder.textContent = String(index + 1);
  tile.appendChild(placeholder);

  if (asset.type === "video") {
    tile.appendChild(createVideoBadge(documentRef, asset));
  } else if (isLivePhotoAsset(asset)) {
    tile.appendChild(createLivePhotoBadge(documentRef));
  }

  return tile;
}

function createDateSectionHeading(documentRef: Document, label: string): HTMLElement {
  const heading = documentRef.createElement("h2");
  heading.className = "asset-date-section-heading";
  heading.textContent = label;
  heading.setAttribute("aria-hidden", "true");

  return heading;
}
