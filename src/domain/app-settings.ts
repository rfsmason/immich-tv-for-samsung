import type { SortOrder } from "./album";
import { homeRailOrder, type HomeRailVisibility } from "./home";

// Collections whose sort order is remembered between visits. An album's
// order comes from Immich instead, and reversing it lasts the session.
export type SavedSortOrderKind = "favorites" | "people" | "photos" | "search" | "videos";

export type SavedSortOrders = Record<SavedSortOrderKind, SortOrder>;

const savedSortOrderKinds: SavedSortOrderKind[] = [
  "favorites",
  "people",
  "photos",
  "search",
  "videos"
];

export type AppSettings = {
  autoplayVideos: boolean;
  homeRails: HomeRailVisibility;
  // Face tags over photos in the viewer (the viewer's Faces button).
  showFaceTags: boolean;
  showViewerDate: boolean;
  showViewerExif: boolean;
  showViewerTime: boolean;
  slideshowIntervalSeconds: number;
  sortOrders: SavedSortOrders;
};

export const defaultSlideshowIntervalSeconds = 8;

export const defaultAppSettings: AppSettings = {
  autoplayVideos: false,
  homeRails: normalizeHomeRailVisibility(null),
  showFaceTags: false,
  showViewerDate: true,
  showViewerExif: true,
  showViewerTime: true,
  slideshowIntervalSeconds: defaultSlideshowIntervalSeconds,
  sortOrders: normalizeSavedSortOrders(null)
};

export function normalizeAppSettings(settings: Partial<AppSettings> | null): AppSettings {
  return {
    autoplayVideos: settings?.autoplayVideos === true,
    homeRails: normalizeHomeRailVisibility(settings?.homeRails),
    showFaceTags: settings?.showFaceTags === true,
    showViewerDate: settings?.showViewerDate !== false,
    showViewerExif: settings?.showViewerExif !== false,
    showViewerTime: settings?.showViewerTime !== false,
    slideshowIntervalSeconds: normalizeSlideshowIntervalSeconds(settings?.slideshowIntervalSeconds),
    sortOrders: normalizeSavedSortOrders(settings?.sortOrders)
  };
}

export function normalizeSlideshowIntervalSeconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultSlideshowIntervalSeconds;
  }

  const roundedValue = Math.round(value);

  if (roundedValue < 3 || roundedValue > 60) {
    return defaultSlideshowIntervalSeconds;
  }

  return roundedValue;
}

// Keeps only known rails; a rail missing from stored settings, for example
// one added in a later release, is on.
export function normalizeHomeRailVisibility(value: unknown): HomeRailVisibility {
  const stored = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const visibility = {} as HomeRailVisibility;

  homeRailOrder.forEach((railId) => {
    visibility[railId] = stored[railId] !== false;
  });

  return visibility;
}

export function readEnabledHomeRails(settings: AppSettings): typeof homeRailOrder {
  return homeRailOrder.filter((railId) => settings.homeRails[railId]);
}

// Newest first unless oldest first was chosen.
export function normalizeSavedSortOrders(value: unknown): SavedSortOrders {
  const stored = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const orders = {} as SavedSortOrders;

  savedSortOrderKinds.forEach((kind) => {
    orders[kind] = stored[kind] === "oldest-first" ? "oldest-first" : "newest-first";
  });

  return orders;
}
