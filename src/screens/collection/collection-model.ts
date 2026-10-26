import type { Album, AlbumAsset, AlbumAssetPageToken, SortOrder } from "../../domain/album";
import type { Memory, Person } from "../../domain/home";
import { isLibraryView } from "../../domain/library";
import type { SearchCriteria } from "../../domain/search";
import type { ViewingSource } from "../../domain/viewing-history";

// The shared data of one visible asset collection (ADR 0008, ADR 0012). The
// grid, the Photos timeline extension and the viewer all read this object;
// state unions make contradictory combinations unrepresentable.

export const collectionColumnCount = 6;

export type AlbumParent = "albums" | "home";
export type CollectionParent = "home" | "memories" | "people" | "search";

// Paged collections: Home's collections, whose first items come from the Home
// rail, and People and Search results. Further pages load as the remote nears
// the loaded end. Feeds with an order can be reversed (ADR 0017).
export type CollectionFeed =
  | { kind: "favorites"; order: SortOrder }
  | { kind: "videos"; order: SortOrder }
  | { kind: "person"; personId: string; order: SortOrder }
  | { kind: "search"; criteria: SearchCriteria; order: SortOrder }
  | { kind: "recently-added" }
  | { kind: "recently-viewed" };

export type CollectionSource =
  | { kind: "album"; id: string; order: SortOrder; parent: AlbumParent; title: string }
  | { kind: "photos"; id: "photos"; order: SortOrder; title: string }
  | { kind: "feed"; feed: CollectionFeed; id: string; parent: CollectionParent; title: string }
  | {
      kind: "static";
      id: string;
      context?: string;
      parent: CollectionParent;
      // A viewer-only collection (a Home rail) returns to its parent from the
      // viewer; a grid collection returns to its grid first.
      presentation: "grid" | "viewer";
      title: string;
      viewingKind?: "memory";
    };

// Collections loaded from their start. A library view loads this way when it
// opens oldest first or is reversed; otherwise it starts from its Home rail.
export type RemoteCollection =
  | { kind: "person"; person: Person; order: SortOrder; parent: "home" | "people" }
  | { kind: "memory"; memory: Memory; parent: CollectionParent }
  | { kind: "search"; criteria: SearchCriteria; order: SortOrder; parent: "search" }
  | { kind: "library"; view: "favorites" | "videos"; order: SortOrder; parent: "home" };

// What a collection load is for, kept so a failed load can be retried.
export type CollectionRequest =
  { kind: "album"; album: Album; parent: AlbumParent } | { kind: "photos" } | RemoteCollection;

export type CollectionLoad =
  | { status: "idle" }
  | { status: "loading"; request: CollectionRequest }
  | { status: "failed"; request: CollectionRequest };

// What is on screen. A grid's remote focus is either on its assets or on the
// Photos timeline rail; the viewer replaces the grid entirely.
export type CollectionView = { kind: "grid"; focus: "assets" | "timeline" } | { kind: "viewer" };

export type CollectionPaging = {
  loadingNext: boolean;
  loadingPrevious: boolean;
  next: AlbumAssetPageToken | null;
  previous: AlbumAssetPageToken | null;
  // Pages requested for the current collection, so none is loaded twice.
  requested: Record<string, true>;
};

export type StaticCollectionInput = {
  assets: AlbumAsset[];
  context?: string;
  // Shown instead of the generic message when the collection is empty.
  emptyMessage?: string;
  // Present for a paged Home collection; its next page loads near the end.
  feed?: { feed: CollectionFeed; nextPage: AlbumAssetPageToken | null };
  focusedIndex: number;
  id: string;
  initialView?: "grid" | "viewer";
  parent?: CollectionParent;
  title: string;
  viewingKind?: "memory";
};

export type CollectionModel = {
  // Absolute position of assets[0] within the whole collection (Photos).
  assetOffset: number;
  assets: AlbumAsset[];
  contentFocusRequested: boolean;
  focusedIndex: number;
  load: CollectionLoad;
  loadGeneration: number;
  paging: CollectionPaging;
  preferredColumn: number;
  source: CollectionSource | null;
  total: number | null;
  view: CollectionView;
};

export function createCollectionModel(): CollectionModel {
  return {
    assetOffset: 0,
    assets: [],
    contentFocusRequested: false,
    focusedIndex: 0,
    load: { status: "idle" },
    loadGeneration: 0,
    paging: createCollectionPaging(),
    preferredColumn: 0,
    source: null,
    total: null,
    view: { kind: "grid", focus: "assets" }
  };
}

export function createCollectionPaging(): CollectionPaging {
  return { loadingNext: false, loadingPrevious: false, next: null, previous: null, requested: {} };
}

export function isViewerOpen(model: CollectionModel): boolean {
  return model.view.kind === "viewer";
}

export function isTimelineRailFocused(model: CollectionModel): boolean {
  return model.view.kind === "grid" && model.view.focus === "timeline";
}

export function leaveTimelineRail(model: CollectionModel): void {
  if (model.view.kind === "grid") {
    model.view = { kind: "grid", focus: "assets" };
  }
}

export function isLoading(model: CollectionModel): boolean {
  return model.load.status === "loading";
}

export function finishLoading(model: CollectionModel): void {
  if (model.load.status === "loading") {
    model.load = { status: "idle" };
  }
}

export function updateTotalFromPage(model: CollectionModel, pageTotal: number | null): void {
  if (model.total !== null || pageTotal === null || pageTotal < model.assets.length) {
    return;
  }

  model.total = pageTotal;
}

// Photos shows a position within the whole library; other collections show
// their loaded position.
export function readAbsoluteIndex(model: CollectionModel, index: number): number | undefined {
  return model.source?.kind === "photos" ? model.assetOffset + index : undefined;
}

export function readViewingSource(model: CollectionModel): ViewingSource | null {
  const source = model.source;

  if (!source) {
    return null;
  }

  return {
    id: source.id,
    kind:
      source.kind === "static"
        ? source.viewingKind || "collection"
        : source.kind === "feed"
          ? readFeedViewingKind(source.feed)
          : source.kind,
    title: source.title
  };
}

function readFeedViewingKind(feed: CollectionFeed): ViewingSource["kind"] {
  if (feed.kind === "person" || feed.kind === "search") {
    return feed.kind;
  }

  return isLibraryView(feed.kind) ? "library" : "collection";
}

export function formatAssetPageKey(page: AlbumAssetPageToken): string {
  if (page.kind === "page") {
    return `page:${page.page}`;
  }

  if (page.kind === "bucket") {
    return `bucket:${page.bucketIndex}`;
  }

  if (page.kind === "time-bucket") {
    return `time-bucket:${page.timeBucket}`;
  }

  return `cursor:${page.cursor}`;
}

export function clampIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(itemCount - 1, index));
}

// Timeline buckets are paged in display order, so the assets above the
// loaded ones live in the previous bucket. Other page kinds have no previous
// page.
export function readPreviousPageToken(page: AlbumAssetPageToken): AlbumAssetPageToken | null {
  if (page.kind !== "bucket" || page.bucketIndex <= 0) {
    return null;
  }

  return {
    bucketIndex: page.bucketIndex - 1,
    kind: "bucket"
  };
}

// The first page of a feed. Later tokens come from each page: a search
// cursor, or Recently Added's next upload month.
export function firstFeedPage(): AlbumAssetPageToken {
  return { kind: "page", page: 1 };
}
