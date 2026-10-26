import type {
  CalendarDate,
  SearchCriteria,
  SearchMediaType,
  SearchPlaceLevel,
  SearchPlaceParent
} from "../../domain/search";
import { nextCalendarDate } from "../../domain/search";

// Maps search criteria to Immich's structured search filter (ADR 0014,
// ADR 0018). Fields in one filter combine as AND. People must all appear
// (`personIds.all`); albums match any (`albumIds.any`), which also confines
// the search to those albums' contents. `takenAt` filters the asset's
// fileCreatedAt instant, so a local calendar day becomes the instants from
// this TV's local midnight to the next local midnight.

// `isMotion` matches assets with a Live Photo video (`livePhotoVideoId`).
const mediaTypeFilters: Record<SearchMediaType, Record<string, unknown>> = {
  all: {},
  "live-photos": { isMotion: { eq: true }, type: { eq: "IMAGE" } },
  photos: { type: { eq: "IMAGE" } },
  videos: { type: { eq: "VIDEO" } }
};
export function buildSearchCriteriaFilter(criteria: SearchCriteria): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    trashedAt: { eq: null },
    visibility: { eq: "timeline" }
  };

  if (criteria.people.length > 0) {
    filter.personIds = { all: criteria.people.map((person) => person.id) };
  }

  Object.assign(filter, mediaTypeFilters[criteria.mediaType]);

  if (criteria.place) {
    filter.country = { eq: criteria.place.country };
    if (criteria.place.state) filter.state = { eq: criteria.place.state };
    if (criteria.place.city) filter.city = { eq: criteria.place.city };
  }

  if (criteria.albums.length > 0) {
    filter.albumIds = { any: criteria.albums.map((album) => album.id) };
  }

  if (criteria.takenFrom || criteria.takenTo) {
    const takenAt: Record<string, string> = {};

    if (criteria.takenFrom) {
      takenAt.gte = localDayStartIso(criteria.takenFrom);
    }

    if (criteria.takenTo) {
      takenAt.lt = localDayStartIso(nextCalendarDate(criteria.takenTo));
    }

    filter.takenAt = takenAt;
  }

  return filter;
}

// The UTC instant at which a local calendar day starts on this TV. Date
// resolves a midnight skipped by a clock change to the first valid time.
export function localDayStartIso(date: CalendarDate): string {
  const start = new Date(date.year, date.month - 1, date.day);

  // Years 0-99 would otherwise map to 1900-1999.
  start.setFullYear(date.year);

  return start.toISOString();
}

// The query for `GET /search/suggestions` at one place level. Regions are
// listed within a country; cities within a country and, when chosen, a
// region. Null names are not asked for (`includeNull` stays off).
export function buildPlaceSuggestionQuery(
  level: SearchPlaceLevel,
  parent: SearchPlaceParent
): string {
  const parts = [`type=${level}`];

  if (level !== "country" && parent.country) {
    parts.push(`country=${encodeURIComponent(parent.country)}`);
  }

  if (level === "city" && parent.state) {
    parts.push(`state=${encodeURIComponent(parent.state)}`);
  }

  return parts.join("&");
}
