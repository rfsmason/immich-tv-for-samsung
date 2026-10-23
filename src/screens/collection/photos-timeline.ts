import type { AlbumService } from "../../app/album-service";
import type {
  AlbumAsset,
  AlbumAssetPage,
  AlbumAssetPageToken,
  SortOrder,
  TimelineBucket
} from "../../domain/album";
import { toUserMessage } from "../../errors/app-error";
import { createHoldAccelerator } from "../../navigation/hold-accelerator";
import { readChannelDirection, remoteKeys } from "../../platform/tizen/keys";
import {
  formatTimelineBucketLabel,
  formatTimelineBucketYear
} from "../../presentation/date-labels";
import {
  calculateRenderedDateSectionAssetWindow,
  canApplyAlbumDetail,
  gridRenderRows
} from "../album-assets-window";
import {
  findBucketIndexForAsset,
  findFirstAssetIndexForBucket,
  getAssetDateContext,
  getAssetSectionColumn,
  getNextAssetSectionIndex,
  isAssetSectionRowEnd
} from "../asset-date-groups";
import { beginAsyncGeneration } from "../async-generation";
import { focusWithoutPageScroll } from "../grid-presentation";
import {
  calculateTimelineRailMarkerIndices,
  isTimelineYearBoundary,
  stepTimelineRailSelection
} from "../timeline-rail-window";
import type { CollectionGridController, GridLayout, GridRail } from "./collection-grid";
import {
  collectionColumnCount as columnCount,
  createCollectionPaging,
  finishLoading,
  formatAssetPageKey,
  isLoading,
  isTimelineRailFocused,
  isViewerOpen,
  leaveTimelineRail,
  updateTotalFromPage,
  type CollectionModel
} from "./collection-model";

// The Photos extension of the collection grid: Immich timeline buckets, the
// date-section layout, the compressed timeline rail and bucket jumps
// (ADR 0008). The grid stays unaware of buckets.

// Date headings count as rows in the Photos window, and up to two can share
// the screen with the asset rows, so it keeps one row more each side than a
// plain grid.
const renderRowsBefore = gridRenderRows.before + 1;
const renderRowsAfter = gridRenderRows.after + 1;
const initialFillAssetTarget = columnCount * 4;
const jumpPreviousAssetTarget = columnCount * 2;

type PhotosTimelineOptions = {
  elements: {
    root: HTMLElement;
    timeline: HTMLElement;
  };
  // Focuses the screen's own controls when no asset can take focus.
  focusControls(): void;
  grid: CollectionGridController;
  model: CollectionModel;
  // The clock the date-rail hold acceleration reads. Defaults to Date.now.
  now?: () => number;
  // Runs a callback before the next frame. Defaults to requestAnimationFrame.
  scheduleFrame?: ScheduleFrame;
  // Release viewer previews when a jump replaces the loaded assets.
  resetViewerImages(): void;
  service: Pick<AlbumService, "loadTimelineAssetsPage">;
};

// Schedules a callback for the next animation frame and returns its cancel.
export type ScheduleFrame = (callback: () => void) => () => void;

const scheduleAnimationFrame: ScheduleFrame = (callback) => {
  const id = window.requestAnimationFrame(callback);

  return () => window.cancelAnimationFrame(id);
};

export type PhotosTimelineController = GridRail & {
  buckets(): TimelineBucket[];
  destroy(): void;
  handleKeyup(keyCode: number): void;
  hide(): void;
  layout: GridLayout;
  // Loads the first screen of assets, starting from the first bucket in the
  // timeline's order.
  loadInitialAssets(): Promise<AlbumAssetPage>;
  reset(): void;
  setBuckets(buckets: TimelineBucket[]): void;
  // Ends any held-key acceleration, for example when the app is hidden.
  suspend(): void;
  totalAssets(): number | null;
};

export function createPhotosTimeline(options: PhotosTimelineOptions): PhotosTimelineController {
  const { elements, grid, model } = options;
  let buckets: TimelineBucket[] = [];
  let selectedBucketIndex = 0;
  // Held Up/Down on the rail move further the longer they are held. Keys only
  // move the selection; the rail redraws at most once per animation frame,
  // and nothing loads until OK.
  const holdAccelerator = createHoldAccelerator(options.now || (() => Date.now()));
  const scheduleFrame = options.scheduleFrame || scheduleAnimationFrame;
  let cancelPendingFrame: (() => void) | null = null;

  const layout: GridLayout = {
    calculateWindow() {
      return calculateRenderedDateSectionAssetWindow({
        columnCount,
        focusedIndex: model.focusedIndex,
        getSectionKey: (index) => getAssetDateContext(model.assets, index).dayKey || "unknown",
        itemCount: model.assets.length,
        rowsAfter: renderRowsAfter,
        rowsBefore: renderRowsBefore
      });
    },
    columnOf(index) {
      return getAssetSectionColumn(model.assets, index, columnCount);
    },
    isFirstRow(index, preferredColumn) {
      return (
        getNextAssetSectionIndex({
          assets: model.assets,
          columnCount,
          currentIndex: index,
          direction: "up",
          preferredColumn
        }).index === index
      );
    },
    isRowEnd(index) {
      return isAssetSectionRowEnd(model.assets, index, columnCount);
    },
    isRowStart(index) {
      return getAssetSectionColumn(model.assets, index, columnCount) === 0;
    },
    next(index, direction, preferredColumn) {
      return getNextAssetSectionIndex({
        assets: model.assets,
        columnCount,
        currentIndex: index,
        direction,
        preferredColumn
      });
    },
    sectionLabel(index) {
      return getAssetDateContext(model.assets, index).label;
    }
  };

  function readPhotosOrder(): SortOrder {
    return model.source?.kind === "photos" ? model.source.order : "newest-first";
  }

  function readFocusedBucketIndex(): number {
    const asset = model.assets[model.focusedIndex];
    const assetBucketIndex = findBucketIndexForAsset(buckets, asset);

    if (assetBucketIndex !== null) {
      return assetBucketIndex;
    }

    return clampBucketIndex(selectedBucketIndex);
  }

  function clampBucketIndex(index: number): number {
    if (buckets.length === 0) {
      return 0;
    }

    return Math.max(0, Math.min(buckets.length - 1, index));
  }

  function scheduleRailFrame(): void {
    if (cancelPendingFrame) {
      return;
    }

    cancelPendingFrame = scheduleFrame(() => {
      cancelPendingFrame = null;

      if (isTimelineRailFocused(model) && !elements.root.hidden) {
        render();
        focusMarker();
      }
    });
  }

  function suspend(): void {
    holdAccelerator.reset();

    if (cancelPendingFrame) {
      cancelPendingFrame();
      cancelPendingFrame = null;
    }
  }

  function hide(): void {
    suspend();
    elements.timeline.hidden = true;
    elements.timeline.textContent = "";
    elements.root.removeAttribute("data-timeline");
  }

  function render(): void {
    const documentRef = elements.root.ownerDocument;
    const timelineHadFocus = elements.timeline.contains(documentRef.activeElement);

    elements.timeline.textContent = "";

    if (isViewerOpen(model) || model.source?.kind !== "photos" || buckets.length === 0) {
      elements.timeline.hidden = true;
      elements.root.removeAttribute("data-timeline");
      return;
    }

    elements.timeline.hidden = false;
    elements.root.setAttribute("data-timeline", "visible");
    const focusedBucketIndex = readFocusedBucketIndex();
    const focusedBucket = buckets[focusedBucketIndex];
    const activeYear = focusedBucket ? formatTimelineBucketYear(focusedBucket) : "";
    const markerIndices = calculateTimelineRailMarkerIndices({
      buckets,
      focusedIndex: focusedBucketIndex,
      selectedIndex: selectedBucketIndex
    });

    for (const index of markerIndices) {
      const bucket = buckets[index];

      if (!bucket) {
        continue;
      }

      const label = formatTimelineBucketLabel(bucket);
      const year = formatTimelineBucketYear(bucket);
      const marker = documentRef.createElement("button");
      marker.className = "focusable timeline-marker";
      marker.type = "button";
      marker.setAttribute("data-bucket-index", String(index));
      marker.setAttribute("aria-label", `${label}, ${bucket.assetCount} assets`);
      marker.title = label;
      marker.setAttribute("data-active", index === focusedBucketIndex ? "true" : "false");
      marker.setAttribute("data-selected", index === selectedBucketIndex ? "true" : "false");

      if (year && year !== activeYear) {
        marker.setAttribute("data-year-boundary", "true");
      }

      const tick = documentRef.createElement("span");
      tick.className = "timeline-marker-tick";
      marker.appendChild(tick);

      if (isTimelineYearBoundary(buckets, index)) {
        const yearLabel = documentRef.createElement("span");
        yearLabel.className = "timeline-marker-label";
        yearLabel.textContent = year;
        marker.appendChild(yearLabel);
      }

      elements.timeline.appendChild(marker);
    }

    if (!isTimelineRailFocused(model) && timelineHadFocus) {
      grid.focusCurrentAsset();
    }
  }

  function focusMarker(): void {
    const marker = elements.timeline.querySelector<HTMLElement>(
      `[data-bucket-index="${selectedBucketIndex}"]`
    );

    if (marker) {
      focusWithoutPageScroll(marker);
    }
  }

  function enter(): boolean {
    if (model.source?.kind !== "photos" || buckets.length === 0) {
      return false;
    }

    suspend();
    model.view = { kind: "grid", focus: "timeline" };
    selectedBucketIndex = readFocusedBucketIndex();
    render();
    focusMarker();
    return true;
  }

  // CH ▲/▼ from the Photos grid: enter the rail at the focused asset's month,
  // then move a year from there.
  function enterByChannel(direction: -1 | 1): boolean {
    if (model.source?.kind !== "photos" || buckets.length === 0) {
      return false;
    }

    suspend();
    model.view = { kind: "grid", focus: "timeline" };
    selectedBucketIndex = stepTimelineRailSelection(
      buckets,
      readFocusedBucketIndex(),
      direction,
      "boundary"
    );
    render();
    focusMarker();
    return true;
  }

  function leaveRail(): void {
    suspend();
    leaveTimelineRail(model);
  }

  function handleKeydown(event: KeyboardEvent, keyCode: number): void {
    if (keyCode === remoteKeys.left || keyCode === remoteKeys.back) {
      event.preventDefault();
      leaveRail();
      render();
      grid.focusCurrentAsset();
      return;
    }

    if (keyCode === remoteKeys.up || keyCode === remoteKeys.down) {
      event.preventDefault();
      const direction = keyCode === remoteKeys.up ? -1 : 1;
      const step = holdAccelerator.press(String(keyCode), event.repeat);

      selectedBucketIndex = stepTimelineRailSelection(
        buckets,
        selectedBucketIndex,
        direction,
        step
      );
      scheduleRailFrame();
      return;
    }

    // Any other key ends a hold.
    holdAccelerator.reset();
    const channelDirection = readChannelDirection(keyCode);

    if (channelDirection !== null) {
      // A year per press; a held channel key repeats without accelerating.
      event.preventDefault();
      selectedBucketIndex = stepTimelineRailSelection(
        buckets,
        selectedBucketIndex,
        channelDirection,
        "boundary"
      );
      scheduleRailFrame();
      return;
    }

    if (keyCode === remoteKeys.enter) {
      event.preventDefault();
      suspend();
      jumpToBucket(selectedBucketIndex);
    }
  }

  function handleKeyup(keyCode: number): void {
    if (keyCode === remoteKeys.up || keyCode === remoteKeys.down) {
      holdAccelerator.reset();
    }
  }

  function jumpToBucket(bucketIndex: number): void {
    const safeBucketIndex = clampBucketIndex(bucketIndex);
    const bucket = buckets[safeBucketIndex];

    if (!bucket || isLoading(model)) {
      return;
    }

    const loadedIndex = findFirstAssetIndexForBucket(model.assets, bucket);

    if (loadedIndex !== null) {
      leaveRail();
      model.focusedIndex = loadedIndex;
      model.preferredColumn = getAssetSectionColumn(model.assets, loadedIndex, columnCount);
      grid.refreshAroundFocus();
      return;
    }

    void loadFromBucket(safeBucketIndex);
  }

  async function loadFromBucket(bucketIndex: number): Promise<void> {
    if (model.source?.kind !== "photos") {
      return;
    }

    const generation = beginAsyncGeneration(model);
    const bucket = buckets[bucketIndex];

    model.paging = createCollectionPaging();
    model.assetOffset = 0;
    model.total = readTimelineBucketTotal(buckets);
    model.assets = [];
    model.focusedIndex = 0;
    model.load = { status: "loading", request: { kind: "photos" } };
    model.preferredColumn = 0;
    leaveRail();
    selectedBucketIndex = bucketIndex;
    grid.resetThumbnails();
    options.resetViewerImages();
    grid.clear();
    grid.setStatus(
      `Loading ${bucket ? formatTimelineBucketLabel(bucket) : "photos"}...`,
      "pending"
    );

    try {
      const page = await loadAssetsAroundBucket(bucketIndex);

      if (!canApplyAlbumDetail(model.loadGeneration, generation, elements.root.hidden)) {
        return;
      }

      model.assets = page.assets;
      model.assetOffset = page.assetOffset;
      model.focusedIndex = page.focusedIndex;
      model.preferredColumn = getAssetSectionColumn(model.assets, page.focusedIndex, columnCount);
      model.paging.next = page.nextPageToken;
      model.paging.previous = page.previousPageToken;
      updateTotalFromPage(model, page.total);
      grid.render(true);
      render();
    } catch (error) {
      if (!canApplyAlbumDetail(model.loadGeneration, generation, elements.root.hidden)) {
        return;
      }

      grid.clear();
      grid.setStatus(toUserMessage(error), "error");
      options.focusControls();
    } finally {
      if (model.loadGeneration === generation) {
        finishLoading(model);
      }
    }
  }

  async function loadAssetsAroundBucket(bucketIndex: number): Promise<{
    assetOffset: number;
    assets: AlbumAsset[];
    focusedIndex: number;
    nextPageToken: AlbumAssetPageToken | null;
    previousPageToken: AlbumAssetPageToken | null;
    total: number | null;
  }> {
    const previousPages: AlbumAsset[][] = [];
    let previousAssetCount = 0;
    let previousBucketIndex = bucketIndex - 1;
    let total = readTimelineBucketTotal(buckets);

    while (previousBucketIndex >= 0 && previousAssetCount < jumpPreviousAssetTarget) {
      const pageToken: AlbumAssetPageToken = {
        bucketIndex: previousBucketIndex,
        kind: "bucket"
      };

      model.paging.requested[formatAssetPageKey(pageToken)] = true;

      const page = await options.service.loadTimelineAssetsPage(readPhotosOrder(), pageToken);

      if (page.total !== null) {
        total = page.total;
      }

      if (page.assets.length > 0) {
        previousPages.unshift(page.assets);
        previousAssetCount += page.assets.length;
      }

      previousBucketIndex -= 1;
    }

    const selectedPage = await loadAssetsUntilFilled(bucketIndex);
    const previousAssets: AlbumAsset[] = [];

    previousPages.forEach((page) => previousAssets.push(...page));

    return {
      assetOffset: readTimelineAssetOffset(buckets, previousBucketIndex + 1),
      assets: previousAssets.concat(selectedPage.assets),
      focusedIndex: previousAssets.length,
      nextPageToken: selectedPage.nextPageToken,
      previousPageToken:
        previousBucketIndex >= 0
          ? {
              bucketIndex: previousBucketIndex,
              kind: "bucket"
            }
          : null,
      total: selectedPage.total !== null ? selectedPage.total : total
    };
  }

  async function loadAssetsUntilFilled(bucketIndex: number): Promise<AlbumAssetPage> {
    const assets: AlbumAsset[] = [];
    let nextPageToken: AlbumAssetPageToken | null = {
      bucketIndex,
      kind: "bucket"
    };
    let total = readTimelineBucketTotal(buckets);

    while (nextPageToken && assets.length < initialFillAssetTarget) {
      model.paging.requested[formatAssetPageKey(nextPageToken)] = true;

      const page = await options.service.loadTimelineAssetsPage(readPhotosOrder(), nextPageToken);

      assets.push(...page.assets);
      nextPageToken = page.nextPageToken;

      if (page.total !== null) {
        total = page.total;
      }

      if (page.assets.length === 0 && nextPageToken === null) {
        break;
      }
    }

    return {
      assets,
      nextPageToken,
      total
    };
  }

  return {
    buckets: () => buckets,
    destroy: suspend,
    enter,
    enterByChannel,
    focusMarker,
    handleKeydown,
    handleKeyup,
    hide,
    layout,
    loadInitialAssets() {
      return loadAssetsUntilFilled(0);
    },
    render,
    reset() {
      suspend();
      buckets = [];
      selectedBucketIndex = 0;
    },
    setBuckets(nextBuckets) {
      buckets = nextBuckets;
    },
    suspend,
    totalAssets() {
      return readTimelineBucketTotal(buckets);
    }
  };
}

function readTimelineBucketTotal(buckets: TimelineBucket[]): number | null {
  if (buckets.length === 0) {
    return null;
  }

  return buckets.reduce((total, bucket) => total + bucket.assetCount, 0);
}

function readTimelineAssetOffset(buckets: TimelineBucket[], bucketIndex: number): number {
  let offset = 0;
  const safeBucketIndex = Math.max(0, Math.min(bucketIndex, buckets.length));

  for (let index = 0; index < safeBucketIndex; index += 1) {
    offset += buckets[index]?.assetCount || 0;
  }

  return offset;
}
