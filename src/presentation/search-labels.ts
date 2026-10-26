import type {
  CalendarDate,
  SearchAlbum,
  SearchCriteria,
  SearchMediaType,
  SearchPlace
} from "../domain/search";
import { shortMonthNames } from "./date-labels";
import { formatPersonName } from "./person-labels";

// Household-facing Search wording: UK-order dates ("16 Oct 2026") and short
// summaries of what a search is for.

export const searchPeopleRule = "Photos with all of these people";
export const searchAlbumsRule = "Photos in any of these albums";

// Past this, the results header falls back to counts for people and albums.
const maxSummaryLength = 48;

export const searchMediaTypeLabels: Record<SearchMediaType, string> = {
  all: "All",
  "live-photos": "Live Photos",
  photos: "Photos",
  videos: "Videos"
};

export function formatCalendarDate(date: CalendarDate): string {
  return `${date.day} ${shortMonthNames[date.month - 1] || ""} ${date.year}`;
}

export function formatSearchDate(date: CalendarDate | null): string {
  return date ? formatCalendarDate(date) : "Any date";
}

// "Robin Example & Sam Example", or "3 people"; null with nobody chosen.
export function formatSearchPeopleSummary(people: SearchCriteria["people"]): string | null {
  if (people.length === 1) {
    return formatPersonName(people[0]!);
  }

  if (people.length === 2) {
    return `${formatPersonName(people[0]!)} & ${formatPersonName(people[1]!)}`;
  }

  return people.length > 2 ? `${people.length} people` : null;
}

// "1 Jan 2020 – 31 Dec 2020", "From 1 Jan 2020" or "Until 31 Dec 2020";
// null with neither date set.
export function formatSearchTakenSummary(
  takenFrom: CalendarDate | null,
  takenTo: CalendarDate | null
): string | null {
  if (takenFrom && takenTo) {
    return `${formatCalendarDate(takenFrom)} – ${formatCalendarDate(takenTo)}`;
  }

  if (takenFrom) {
    return `From ${formatCalendarDate(takenFrom)}`;
  }

  return takenTo ? `Until ${formatCalendarDate(takenTo)}` : null;
}

// "Exampleton, Example County, Exampleland": the place from most to least
// specific.
export function formatSearchPlace(place: SearchPlace): string {
  return [place.city, place.state, place.country].filter((part) => part).join(", ");
}

// The place's most specific part, for short summaries.
export function formatSearchPlaceShort(place: SearchPlace): string {
  return place.city || place.state || place.country;
}

// One album's name, or "3 albums"; null with none chosen.
export function formatSearchAlbumsSummary(albums: SearchAlbum[]): string | null {
  if (albums.length === 1) {
    return albums[0]!.name || "1 album";
  }

  return albums.length > 1 ? `${albums.length} albums` : null;
}

function formatCount(count: number, one: string, many: string): string | null {
  if (count === 0) {
    return null;
  }

  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

// The results header, criteria joined with " · ": for example "Sam Example ·
// Videos · Exampleton" or "2 albums · Live Photos". When that is
// long, people and albums become counts ("3 people · 2 albums · Videos").
export function formatSearchSummary(criteria: SearchCriteria): string {
  const rest = [
    criteria.mediaType === "all" ? null : searchMediaTypeLabels[criteria.mediaType],
    criteria.place ? formatSearchPlaceShort(criteria.place) : null,
    formatSearchTakenSummary(criteria.takenFrom, criteria.takenTo)
  ];
  const join = (parts: Array<string | null>) =>
    parts.filter((part): part is string => part !== null).join(" · ");
  const detailed = join(
    [formatSearchPeopleSummary(criteria.people), formatSearchAlbumsSummary(criteria.albums)].concat(
      rest
    )
  );

  if (detailed.length <= maxSummaryLength) {
    return detailed || "Search";
  }

  return join(
    [
      formatCount(criteria.people.length, "person", "people"),
      formatCount(criteria.albums.length, "album", "albums")
    ].concat(rest)
  );
}
