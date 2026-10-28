import type { AlbumService } from "../app/album-service";
import type {
  Album,
  AlbumAsset,
  AlbumAssetPage,
  AlbumAssetPageToken,
  SortOrder
} from "../domain/album";
import type { Memory, Person } from "../domain/home";
import type { SearchCriteria } from "../domain/search";
import type { ViewingSource } from "../domain/viewing-history";
import { toUserMessage } from "../errors/app-error";
import { getKeyCode } from "../platform/tizen/keys";
import { formatMemoryContext, formatMemoryTitle } from "../presentation/memory-labels";
import type { AppSettingsStore } from "../storage/app-settings-store";
import { canApplyAlbumDetail } from "./album-assets-window";
import { getRestoredViewerGridFocus } from "./asset-viewer-window";
import {
  beginAsyncGeneration,
  invalidateAsyncGeneration,
  isCurrentGeneration
} from "./async-generation";
import type { PassiveViewing } from "../platform/tizen/screensaver";
import { createAssetViewer } from "./collection/asset-viewer";
import {
  createCollectionGrid,
  createPlainGridLayout,
  type GridLayout
} from "./collection/collection-grid";
import {
  clampIndex,
  collectionColumnCount as columnCount,
  createCollectionModel,
  createCollectionPaging,
  finishLoading,
  isViewerOpen,
  leaveTimelineRail,
  readAbsoluteIndex,
  readViewingSource,
  updateTotalFromPage,
  firstFeedPage,
  type CollectionFeed,
  type CollectionSource,
  type RemoteCollection,
  type StaticCollectionInput
} from "./collection/collection-model";
import {
  createCollectionSortControl,
  readCollectionSort,
  readSavedSortOrder,
  reverseSortOrder,
  saveSortOrder
} from "./collection/collection-sort";
import { readCollectionElements } from "./collection/collection-elements";
import { createPhotosTimeline, type ScheduleFrame } from "./collection/photos-timeline";
import {
  readRemoteCollectionInput,
  readRemoteCollectionLoadingMessage,
  readRemoteFeed
} from "./collection/remote-collections";

// The shared collection screen (ADR 0008, ADR 0012): composes the collection
// grid, the Photos timeline extension and the full-screen viewer over one
// collection model, and loads albums, Photos, People, Memories and Home
// collections into it.

type AlbumDetailScreenOptions = {
  documentRef?: Document;
  onBack(lastViewedAssetId?: string): void;
  onReturnToShell?(): void;
  onViewerClosed?(): void;
  onViewerOpened?(): void;
  // The viewer's buttons hid during passive viewing, or showed again.
  onViewerControlsHiddenChange?(hidden: boolean): void;
  onAssetViewed?(asset: AlbumAsset, source: ViewingSource): void;
  // Loads one page of a paged Home collection.
  loadFeedPage(feed: CollectionFeed, page: AlbumAssetPageToken): Promise<AlbumAssetPage>;
  // The date rail's clock and frame scheduling; tests replace them.
  now?: () => number;
  // The TV screensaver control the viewer holds during passive viewing.
  passiveViewing?: PassiveViewing;
  scheduleFrame?: ScheduleFrame;
  service: AlbumService;
  settingsStore: AppSettingsStore;
};

export type { CollectionFeed, StaticCollectionInput };

export type FeedCollectionInput = {
  assets: AlbumAsset[];
  feed: CollectionFeed;
  focusedIndex: number;
  id: string;
  title: string;
};

export type AlbumDetailScreenController = {
  destroy(): void;
  focusContent(): void;
  // Forgets album order reversals, which last until the connection changes.
  forgetSessionSortOrders(): void;
  hide(): void;
  // Whether the full-screen viewer is showing an asset.
  isViewerOpen(): boolean;
  refreshPhotos(): void;
  show(album: Album, parent: "albums" | "home"): void;
  showPerson(person: Person, parent: "home" | "people"): void;
  showMemory(memory: Memory, parent: "home" | "memories"): void;
  // Opens search results in the summary grid; a new search replaces any
  // results still loading.
  showSearchResults(criteria: SearchCriteria): void;
  // Opens a paged Home collection in its summary grid, focused on the chosen
  // asset, with the Home rail's items shown at once. A library view opening
  // oldest first loads from its start instead.
  showFeedCollection(input: FeedCollectionInput): void;
  showStaticAssetCollection(input: StaticCollectionInput): void;
  showPhotos(): void;
  // Pauses slideshow, video and Live Photo motion when the app is hidden, and
  // ends any held date-rail key. Playback stays paused on return; the viewer
  // keeps its focused control.
  suspendPlayback(): void;
};

export function mountAlbumDetailScreen(
  options: AlbumDetailScreenOptions
): AlbumDetailScreenController {
  const documentRef = options.documentRef || document;
  const elements = readCollectionElements(documentRef);
  const model = createCollectionModel();
  const plainLayout = createPlainGridLayout(model);
  // The album being shown, and album order reversals for this session, by id.
  let currentAlbum: Album | null = null;
  let sessionAlbumOrders: Record<string, SortOrder> = {};
  // The last People or Search collection, reloaded when its order reverses.
  let lastRemoteCollection: RemoteCollection | null = null;
  const sortControl = createCollectionSortControl({
    button: elements.sortButton,
    onDown: () => focusFirstAsset(),
    onLeft() {
      if (!elements.retryButton.hidden) {
        elements.retryButton.focus();
      } else {
        options.onReturnToShell?.();
      }
    },
    onToggle: () => toggleSortOrder()
  });

  const grid = createCollectionGrid({
    elements,
    loadPage: (page) => loadCollectionAssetPage(page),
    model,
    onBack() {
      if (model.source?.kind === "photos" && options.onReturnToShell) {
        options.onReturnToShell();
        return;
      }

      options.onBack();
    },
    focusControls: () => focusScreenControls(),
    header: {
      focus: () => sortControl.focus(),
      handleKeydown: (event, keyCode) => sortControl.handleKeydown(event, keyCode),
      hasFocus: () => sortControl.isFocused()
    },
    onOpenAsset: (index) => openViewer(index),
    onRetry: () => retryFailedLoad(),
    onReturnToShell: options.onReturnToShell,
    onViewerAssetsChanged: () => viewer.render(),
    service: options.service
  });
  const timeline = createPhotosTimeline({
    elements,
    focusControls: () => focusScreenControls(),
    grid,
    model,
    now: options.now,
    resetViewerImages: () => viewer.resetImages(),
    scheduleFrame: options.scheduleFrame,
    service: options.service
  });
  // Photos arranges assets in date sections; every other source uses rows.
  const activeLayout = (): GridLayout =>
    model.source?.kind === "photos" ? timeline.layout : plainLayout;
  const layout: GridLayout = {
    calculateWindow: () => activeLayout().calculateWindow(),
    columnOf: (index) => activeLayout().columnOf(index),
    isFirstRow: (index, preferredColumn) => activeLayout().isFirstRow(index, preferredColumn),
    isRowEnd: (index) => activeLayout().isRowEnd(index),
    isRowStart: (index) => activeLayout().isRowStart(index),
    next: (index, direction, preferredColumn) =>
      activeLayout().next(index, direction, preferredColumn),
    sectionLabel: (index) => activeLayout().sectionLabel(index)
  };
  const viewer = createAssetViewer({
    collection: {
      absoluteIndex: (index) => readAbsoluteIndex(model, index),
      assets: () => model.assets,
      exit: () => exitViewer(),
      generation: () => model.loadGeneration,
      index: () => model.focusedIndex,
      isCurrentGeneration: (generation) => isCurrentGeneration(model, generation),
      isHidden: () => elements.root.hidden,
      isLoadingMore: () => model.paging.loadingNext,
      isOpen: () => isViewerOpen(model),
      loadMore: () => grid.loadMore(),
      loadPrevious: (mode) => grid.loadPrevious(mode === "move" ? "previous-asset" : "preserve"),
      select(index) {
        model.focusedIndex = index;
        model.preferredColumn = layout.columnOf(index);
      },
      total: () => model.total,
      viewingSource: () => readViewingSource(model)
    },
    elements,
    onAssetViewed: options.onAssetViewed,
    onControlsHiddenChange: options.onViewerControlsHiddenChange,
    passiveViewing: options.passiveViewing,
    service: options.service,
    settingsStore: options.settingsStore
  });

  grid.setLayout(layout, timeline);

  function openViewer(index: number): void {
    if (!model.assets[index]) {
      return;
    }

    model.view = { kind: "viewer" };
    elements.grid.hidden = true;
    elements.timeline.hidden = true;
    elements.root.removeAttribute("data-timeline");
    options.onViewerOpened?.();
    viewer.open(index);
  }

  function exitViewer(): void {
    const source = model.source;
    const selected = viewer.selectedAsset();

    if (source?.kind === "static" && source.presentation === "viewer") {
      options.onBack(selected?.asset.id);
      return;
    }

    model.view = { kind: "grid", focus: "assets" };
    elements.grid.hidden = false;
    viewer.close();
    options.onViewerClosed?.();

    if (selected) {
      const restoredFocus = getRestoredViewerGridFocus(
        selected.index,
        columnCount,
        model.assets.length
      );

      if (restoredFocus) {
        model.focusedIndex = restoredFocus.focusedIndex;
        model.preferredColumn =
          source?.kind === "photos"
            ? layout.columnOf(restoredFocus.focusedIndex)
            : restoredFocus.preferredColumn;
      }
    }

    if (source && model.assets.length > 0) {
      grid.updateStatus();
      grid.renderWindow();
      timeline.render();
      grid.focusCurrentAsset();
      grid.loadThumbnails();
      grid.loadMore();
      return;
    }

    focusScreenControls();
  }

  function retryFailedLoad(): void {
    if (model.load.status !== "failed") {
      return;
    }

    const request = model.load.request;

    if (request.kind === "album") {
      void loadAlbumDetail(request.album, request.parent);
    } else if (
      request.kind === "person" ||
      request.kind === "memory" ||
      request.kind === "search"
    ) {
      void loadRemoteCollection(request);
    }
  }

  function loadCollectionAssetPage(page: AlbumAssetPageToken): Promise<AlbumAssetPage> {
    const source = model.source;

    if (source?.kind === "photos") {
      return options.service.loadTimelineAssetsPage(source.order, page);
    }

    if (source?.kind === "album") {
      return options.service.loadAlbumAssetsPage(source.id, source.order, page);
    }

    if (source?.kind === "feed") {
      return options.loadFeedPage(source.feed, page);
    }

    // Static collections are fully loaded and never request pages.
    return Promise.resolve({ assets: [], nextPageToken: null, total: null });
  }

  // Common reset when a different collection starts loading or is shown.
  function beginCollection(source: CollectionSource | null): void {
    model.source = source;
    // A reload from the sort button keeps the button on screen and focused.
    if (source || !sortControl.isFocused()) {
      sortControl.render(readCollectionSort(source)?.order || null);
    }
    timeline.reset();
    leaveTimelineRail(model);
    model.paging = createCollectionPaging();
    model.assetOffset = 0;
    model.total = null;
    model.assets = [];
    model.focusedIndex = 0;
    model.preferredColumn = 0;
    viewer.clearSelection();
    viewer.stopSlideshow();
  }

  // Where focus goes when no asset can take it (loading, empty, failed).
  // Other collections hold it on the screen, so Back still returns to their
  // parent; Photos hands it to the left rail, but only when focus is on this
  // screen, so it never pulls focus off the rail (such as from Refresh).
  function focusScreenControls(): void {
    if (sortControl.isFocused()) {
      return;
    }

    if (model.source?.kind !== "photos") {
      elements.root.focus();
    } else if (elements.root.contains(documentRef.activeElement)) {
      options.onReturnToShell?.();
    }
  }

  async function loadAlbumDetail(album: Album, parent: "albums" | "home"): Promise<void> {
    const generation = beginAsyncGeneration(model);

    elements.retryButton.hidden = true;
    model.contentFocusRequested = false;
    beginCollection(null);
    model.load = { status: "loading", request: { kind: "album", album, parent } };
    model.view = { kind: "grid", focus: "assets" };
    elements.assetPlaceholder.hidden = true;
    viewer.resetImages();
    elements.grid.hidden = false;
    timeline.hide();
    grid.clear();
    elements.title.textContent = album.name;
    grid.setStatus("Loading album assets...", "pending");
    focusScreenControls();
    grid.resetThumbnails();

    try {
      const detail = await options.service.loadAlbumDetail(album.id);

      if (!canApplyAlbumDetail(model.loadGeneration, generation, elements.root.hidden)) {
        return;
      }

      model.source = {
        id: detail.id,
        kind: "album",
        order: sessionAlbumOrders[detail.id] || detail.order,
        parent,
        title: detail.name
      };
      sortControl.render(model.source.order);
      elements.title.textContent = detail.name;
      model.total = detail.assetCount > 0 ? detail.assetCount : null;

      const firstAssetPage = await options.service.loadAlbumAssetsPage(
        detail.id,
        model.source.order,
        null
      );

      if (!canApplyAlbumDetail(model.loadGeneration, generation, elements.root.hidden)) {
        return;
      }

      model.assets = firstAssetPage.assets;
      model.assetOffset = 0;
      model.paging.next = firstAssetPage.nextPageToken;
      model.paging.previous = null;
      updateTotalFromPage(model, firstAssetPage.total);
      grid.render(true);
    } catch (error) {
      if (!canApplyAlbumDetail(model.loadGeneration, generation, elements.root.hidden)) {
        return;
      }

      model.source = null;
      model.paging = createCollectionPaging();
      model.assetOffset = 0;
      model.total = null;
      model.assets = [];
      grid.clear();
      model.load = { status: "failed", request: { kind: "album", album, parent } };
      elements.retryButton.hidden = false;
      grid.setStatus(`${toUserMessage(error)} Select Retry or go Back.`, "error");
      elements.retryButton.focus();
    } finally {
      if (isCurrentGeneration(model, generation)) {
        finishLoading(model);
      }
    }
  }

  async function loadPhotosTimeline(
    order = readSavedSortOrder(options.settingsStore, "photos")
  ): Promise<void> {
    const generation = beginAsyncGeneration(model);

    beginCollection({ id: "photos", kind: "photos", order, title: "Timeline" });
    model.load = { status: "loading", request: { kind: "photos" } };
    model.view = { kind: "grid", focus: "assets" };
    elements.assetPlaceholder.hidden = true;
    viewer.resetImages();
    elements.grid.hidden = false;
    elements.timeline.hidden = false;
    grid.clear();
    elements.timeline.textContent = "";
    elements.title.textContent = "Timeline";
    grid.setStatus("Loading photos...", "pending");
    focusScreenControls();
    grid.resetThumbnails();

    try {
      const buckets = await options.service.loadTimelineBuckets(order);

      if (!canApplyAlbumDetail(model.loadGeneration, generation, elements.root.hidden)) {
        return;
      }

      timeline.setBuckets(buckets);
      model.total = timeline.totalAssets();
      timeline.render();

      if (buckets.length === 0) {
        grid.render(false);
        return;
      }

      const firstAssetPage = await timeline.loadInitialAssets();

      if (!canApplyAlbumDetail(model.loadGeneration, generation, elements.root.hidden)) {
        return;
      }

      model.assets = firstAssetPage.assets;
      model.assetOffset = 0;
      model.paging.next = firstAssetPage.nextPageToken;
      updateTotalFromPage(model, firstAssetPage.total);
      grid.render(model.contentFocusRequested);
    } catch (error) {
      if (!canApplyAlbumDetail(model.loadGeneration, generation, elements.root.hidden)) {
        return;
      }

      model.paging = createCollectionPaging();
      model.assetOffset = 0;
      model.total = null;
      model.assets = [];
      grid.clear();
      grid.setStatus(toUserMessage(error), "error");
      focusScreenControls();
    } finally {
      if (isCurrentGeneration(model, generation)) {
        finishLoading(model);
      }
    }
  }

  async function loadRemoteCollection(collection: RemoteCollection): Promise<void> {
    const feed = readRemoteFeed(collection);
    if (collection.kind === "person" || collection.kind === "search") {
      lastRemoteCollection = collection;
    }
    const input = readRemoteCollectionInput(collection, feed);
    loadStaticAssetCollection(input);
    const generation = model.loadGeneration;
    model.load = { status: "loading", request: collection };
    elements.retryButton.hidden = true;
    grid.setStatus(readRemoteCollectionLoadingMessage(collection), "pending");
    focusScreenControls();

    try {
      const result =
        collection.kind === "memory"
          ? await options.service.loadMemory(collection.memory.id)
          : await options.loadFeedPage(feed!, firstFeedPage());
      if (!isCurrentGeneration(model, generation) || elements.root.hidden) return;
      model.load = { status: "idle" };
      const shouldFocus = elements.root.contains(documentRef.activeElement);
      const memory = "memoryAt" in result ? result : null;
      loadStaticAssetCollection(
        {
          ...input,
          assets: result.assets,
          title: memory ? formatMemoryTitle(memory) : input.title,
          context: memory ? formatMemoryContext(memory) : input.context,
          feed:
            input.feed && "nextPageToken" in result
              ? { feed: input.feed.feed, nextPage: result.nextPageToken }
              : input.feed
        },
        shouldFocus
      );
    } catch (error) {
      if (!isCurrentGeneration(model, generation) || elements.root.hidden) return;
      model.load = { status: "failed", request: collection };
      grid.setStatus(`${toUserMessage(error)} Select Retry or go Back.`, "error");
      elements.retryButton.hidden = false;
      if (elements.root.contains(documentRef.activeElement)) {
        elements.retryButton.focus();
      }
    }
  }

  function loadStaticAssetCollection(input: StaticCollectionInput, shouldFocus = true): void {
    beginAsyncGeneration(model);
    const focusedIndex = clampIndex(input.focusedIndex, input.assets.length);

    beginCollection(
      input.feed
        ? {
            feed: input.feed.feed,
            id: input.id,
            kind: "feed",
            parent: input.parent || "home",
            title: input.title
          }
        : {
            context: input.context,
            id: input.id,
            kind: "static",
            parent: input.parent || "home",
            presentation: input.initialView === "grid" ? "grid" : "viewer",
            title: input.title,
            viewingKind: input.viewingKind
          }
    );
    // A feed's total is unknown until its last page has loaded.
    model.total = input.feed ? null : input.assets.length;
    model.paging.next = input.feed ? input.feed.nextPage : null;
    model.assets = input.assets.slice();
    model.focusedIndex = focusedIndex;
    model.load = { status: "idle" };
    model.preferredColumn = focusedIndex % columnCount;
    model.view =
      input.initialView === "grid" ? { kind: "grid", focus: "assets" } : { kind: "viewer" };
    elements.title.textContent = input.title;
    elements.grid.hidden = input.initialView !== "grid";
    elements.assetPlaceholder.hidden = true;
    timeline.hide();
    grid.clear();
    grid.setStatus(input.context || "", "idle");
    grid.resetThumbnails();
    viewer.resetImages();

    if (model.assets.length === 0) {
      elements.assetPlaceholder.hidden = true;
      elements.grid.hidden = false;
      grid.setStatus(input.emptyMessage || "There are no photos or videos to show.", "idle");
      if (shouldFocus) focusScreenControls();
      return;
    }

    if (input.initialView === "grid") {
      grid.render(shouldFocus);
    } else {
      openViewer(focusedIndex);
    }
  }

  function focusFirstAsset(): void {
    if (model.assets.length === 0) {
      return;
    }

    leaveTimelineRail(model);
    model.focusedIndex = 0;
    model.preferredColumn = 0;
    grid.refreshAroundFocus();
  }

  // Reverses the collection's order and reloads it from its start. Photos,
  // Favourites, Videos, People and Search remember the order; an album's
  // reversal lasts the session.
  function toggleSortOrder(): void {
    const source = model.source;
    const sort = readCollectionSort(source);

    if (!source || !sort) {
      return;
    }

    const order = reverseSortOrder(sort.order);

    sortControl.render(order);

    if (sort.kind === "album") {
      sessionAlbumOrders[source.id] = order;
      if (currentAlbum && source.kind === "album") {
        void loadAlbumDetail(currentAlbum, source.parent);
      }
      return;
    }

    saveSortOrder(options.settingsStore, sort.kind, order);

    if (source.kind === "photos") {
      void loadPhotosTimeline(order);
      return;
    }

    if (source.kind !== "feed") {
      return;
    }

    const feed = source.feed;

    if (feed.kind === "favorites" || feed.kind === "videos") {
      void loadRemoteCollection({ kind: "library", order, parent: "home", view: feed.kind });
    } else if (lastRemoteCollection?.kind === "person") {
      void loadRemoteCollection({ ...lastRemoteCollection, order });
    } else if (lastRemoteCollection?.kind === "search") {
      void loadRemoteCollection({ ...lastRemoteCollection, order });
    }
  }

  function restorePhotos(): void {
    elements.title.textContent = "Timeline";
    elements.assetPlaceholder.hidden = true;
    elements.grid.hidden = false;
    elements.timeline.hidden = false;
    model.view = { kind: "grid", focus: "assets" };
    timeline.render();
    grid.render(model.contentFocusRequested);
  }

  // Reloads Photos when it is on screen; otherwise forgets the retained
  // timeline so the next visit loads afresh.
  function refreshPhotos(): void {
    if (model.source?.kind !== "photos") {
      return;
    }

    if (elements.root.hidden) {
      beginCollection(null);
      return;
    }

    void loadPhotosTimeline();
  }

  function releaseResources(): void {
    invalidateAsyncGeneration(model);
    model.load = { status: "idle" };
    model.paging.loadingNext = false;
    model.paging.loadingPrevious = false;
  }

  const handleDocumentKeydown = (event: KeyboardEvent) => {
    if (elements.root.hidden) {
      return;
    }

    if (isViewerOpen(model)) {
      viewer.handleKeydown(event, getKeyCode(event));
      return;
    }

    grid.handleKeydown(event, getKeyCode(event));
  };
  const handleDocumentKeyup = (event: KeyboardEvent) => {
    if (!elements.root.hidden) {
      timeline.handleKeyup(getKeyCode(event));
      viewer.handleKeyup(event);
    }
  };
  const handleGridClick = (event: MouseEvent) => {
    if (elements.root.hidden || isViewerOpen(model)) {
      return;
    }

    const target = event.target as HTMLElement | null;
    const tile = target?.closest<HTMLElement>("[data-asset-index]");

    if (!tile || !elements.grid.contains(tile)) {
      return;
    }

    const index = Number(tile.getAttribute("data-asset-index"));

    if (!Number.isFinite(index) || !model.assets[index]) {
      return;
    }

    event.preventDefault();
    model.focusedIndex = index;
    model.preferredColumn = index % columnCount;
    tile.focus();
    openViewer(index);
  };
  const handleRetryClick = () => {
    if (!elements.root.hidden) {
      retryFailedLoad();
    }
  };

  documentRef.addEventListener("keydown", handleDocumentKeydown);
  documentRef.addEventListener("keyup", handleDocumentKeyup);
  elements.grid.addEventListener("click", handleGridClick);
  elements.retryButton.addEventListener("click", handleRetryClick);

  return {
    destroy() {
      documentRef.removeEventListener("keydown", handleDocumentKeydown);
      documentRef.removeEventListener("keyup", handleDocumentKeyup);
      elements.grid.removeEventListener("click", handleGridClick);
      elements.retryButton.removeEventListener("click", handleRetryClick);
      viewer.destroy();
      timeline.destroy();
      releaseResources();
      viewer.stopSlideshow();
      viewer.resetPlayback();
      grid.resetThumbnails();
      viewer.resetImages();
    },
    isViewerOpen: () => !elements.root.hidden && isViewerOpen(model),
    forgetSessionSortOrders() {
      sessionAlbumOrders = {};
    },
    focusContent() {
      model.contentFocusRequested = true;

      if (isViewerOpen(model)) {
        viewer.focusControls();
        return;
      }

      grid.focusContent();
    },
    hide() {
      releaseResources();
      elements.root.hidden = true;
      model.contentFocusRequested = false;
      leaveTimelineRail(model);
      timeline.suspend();
      viewer.stopSlideshow();
      viewer.resetPlayback();
      grid.resetThumbnails();
      viewer.resetImages();
    },
    show(album, parent) {
      elements.retryButton.hidden = true;
      elements.root.hidden = false;
      model.view = { kind: "grid", focus: "assets" };
      viewer.clearSelection();
      model.contentFocusRequested = false;
      currentAlbum = album;
      void loadAlbumDetail(album, parent);
    },
    showFeedCollection(input) {
      elements.retryButton.hidden = true;
      elements.root.hidden = false;
      model.view = { kind: "grid", focus: "assets" };
      model.contentFocusRequested = false;
      // The rail's items are newest first, so they cannot start an
      // oldest-first view.
      if (
        (input.feed.kind === "favorites" || input.feed.kind === "videos") &&
        input.feed.order === "oldest-first"
      ) {
        void loadRemoteCollection({
          kind: "library",
          order: input.feed.order,
          parent: "home",
          view: input.feed.kind
        });
        return;
      }
      loadStaticAssetCollection({
        assets: input.assets,
        feed: { feed: input.feed, nextPage: firstFeedPage() },
        focusedIndex: input.focusedIndex,
        id: input.id,
        initialView: "grid",
        title: input.title
      });
    },
    showStaticAssetCollection(input) {
      elements.retryButton.hidden = true;
      elements.root.hidden = false;
      model.view = { kind: "viewer" };
      model.contentFocusRequested = false;
      loadStaticAssetCollection(input);
    },
    showPerson(person, parent) {
      elements.root.hidden = false;
      model.contentFocusRequested = false;
      void loadRemoteCollection({
        kind: "person",
        order: readSavedSortOrder(options.settingsStore, "people"),
        parent,
        person
      });
    },
    showSearchResults(criteria) {
      elements.root.hidden = false;
      model.contentFocusRequested = false;
      void loadRemoteCollection({
        criteria,
        kind: "search",
        order: readSavedSortOrder(options.settingsStore, "search"),
        parent: "search"
      });
    },
    showMemory(memory, parent) {
      elements.root.hidden = false;
      model.contentFocusRequested = false;
      void loadRemoteCollection({ kind: "memory", memory, parent });
    },
    refreshPhotos,
    suspendPlayback() {
      timeline.suspend();
      viewer.suspend();
    },
    showPhotos() {
      if (model.load.status === "failed") {
        model.load = { status: "idle" };
      }
      elements.retryButton.hidden = true;
      elements.root.hidden = false;
      model.view = { kind: "grid", focus: "assets" };
      viewer.clearSelection();
      if (
        model.source?.kind === "photos" &&
        model.assets.length > 0 &&
        model.load.status !== "loading"
      ) {
        restorePhotos();
        return;
      }

      void loadPhotosTimeline();
    }
  };
}
