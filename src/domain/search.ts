// Search criteria as small, explicit filters (ADR 0014, ADR 0018). Each
// criterion is its own field with its own helpers rather than a generic
// expression tree, and every criterion set must match (AND). Every operation
// is pure and returns new criteria.

// A local calendar date as the household reads it, not an instant. The Immich
// integration layer turns it into the time range Immich expects.
export type CalendarDate = {
  day: number;
  month: number;
  year: number;
};

// The part of a Person a search needs to show its choice.
export type SearchPerson = {
  id: string;
  name: string | null;
};

// "photos" is every still image, Live Photos included; "live-photos" only
// those with motion.
export type SearchMediaType = "all" | "photos" | "live-photos" | "videos";

// One place, from a country down to an optional region and city. A city can
// be chosen within a country directly when the country has no regions.
export type SearchPlace = {
  city: string | null;
  country: string;
  state: string | null;
};

// The levels a place is chosen at, from widest to narrowest.
export type SearchPlaceLevel = "country" | "state" | "city";

// The place chosen so far when listing the next level: a country for its
// regions; a country and, when it has regions, a region for its cities.
export type SearchPlaceParent = {
  country: string | null;
  state: string | null;
};

// The part of an Album a search needs to show its choice.
export type SearchAlbum = {
  id: string;
  name: string;
};

export type SearchCriteria = {
  // A result is in any of these albums ("any of these albums").
  albums: SearchAlbum[];
  mediaType: SearchMediaType;
  // Every selected person must appear in a result ("all of these people").
  people: SearchPerson[];
  place: SearchPlace | null;
  // Inclusive from the start of this local day.
  takenFrom: CalendarDate | null;
  // Inclusive to the end of this local day.
  takenTo: CalendarDate | null;
};

export const maxSearchPeople = 10;
export const maxSearchAlbums = 10;

export function emptySearchCriteria(): SearchCriteria {
  return {
    albums: [],
    mediaType: "all",
    people: [],
    place: null,
    takenFrom: null,
    takenTo: null
  };
}

export function isEmptyCriteria(criteria: SearchCriteria): boolean {
  return countSetCriteria(criteria) === 0;
}

// How many separate criteria are set: people and albums (each as one),
// From, To, media type and place.
export function countSetCriteria(criteria: SearchCriteria): number {
  return (
    (criteria.people.length > 0 ? 1 : 0) +
    (criteria.takenFrom ? 1 : 0) +
    (criteria.takenTo ? 1 : 0) +
    (criteria.mediaType !== "all" ? 1 : 0) +
    (criteria.place ? 1 : 0) +
    (criteria.albums.length > 0 ? 1 : 0)
  );
}

// A range is invalid only when both ends are set and From is after To.
export function hasValidDateRange(criteria: SearchCriteria): boolean {
  return (
    !criteria.takenFrom ||
    !criteria.takenTo ||
    compareCalendarDates(criteria.takenFrom, criteria.takenTo) <= 0
  );
}

export function canSearch(criteria: SearchCriteria): boolean {
  return !isEmptyCriteria(criteria) && hasValidDateRange(criteria);
}

export function hasSearchPerson(criteria: SearchCriteria, id: string): boolean {
  return criteria.people.some((person) => person.id === id);
}

// Adds a person once, keeping selection order, and never past the cap.
export function addSearchPerson(criteria: SearchCriteria, person: SearchPerson): SearchCriteria {
  if (hasSearchPerson(criteria, person.id) || criteria.people.length >= maxSearchPeople) {
    return criteria;
  }

  return { ...criteria, people: criteria.people.concat({ id: person.id, name: person.name }) };
}

export function removeSearchPerson(criteria: SearchCriteria, id: string): SearchCriteria {
  return { ...criteria, people: criteria.people.filter((person) => person.id !== id) };
}

export function setSearchPeople(criteria: SearchCriteria, people: SearchPerson[]): SearchCriteria {
  return people.reduce(addSearchPerson, { ...criteria, people: [] });
}

// "all" clears the criterion.
export function setSearchMediaType(
  criteria: SearchCriteria,
  mediaType: SearchMediaType
): SearchCriteria {
  return { ...criteria, mediaType };
}

export function setSearchPlace(
  criteria: SearchCriteria,
  place: SearchPlace | null
): SearchCriteria {
  return {
    ...criteria,
    place: place ? { city: place.city, country: place.country, state: place.state } : null
  };
}

export function hasSearchAlbum(criteria: SearchCriteria, id: string): boolean {
  return criteria.albums.some((album) => album.id === id);
}

// Adds an album once, keeping selection order, and never past the cap.
export function addSearchAlbum(criteria: SearchCriteria, album: SearchAlbum): SearchCriteria {
  if (hasSearchAlbum(criteria, album.id) || criteria.albums.length >= maxSearchAlbums) {
    return criteria;
  }

  return { ...criteria, albums: criteria.albums.concat({ id: album.id, name: album.name }) };
}

export function removeSearchAlbum(criteria: SearchCriteria, id: string): SearchCriteria {
  return { ...criteria, albums: criteria.albums.filter((album) => album.id !== id) };
}

export function setSearchAlbums(criteria: SearchCriteria, albums: SearchAlbum[]): SearchCriteria {
  return albums.reduce(addSearchAlbum, { ...criteria, albums: [] });
}

export function setTakenFrom(criteria: SearchCriteria, date: CalendarDate | null): SearchCriteria {
  return { ...criteria, takenFrom: date ? { ...date } : null };
}

export function setTakenTo(criteria: SearchCriteria, date: CalendarDate | null): SearchCriteria {
  return { ...criteria, takenTo: date ? { ...date } : null };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

export function isValidCalendarDate(date: CalendarDate): boolean {
  return (
    Number.isInteger(date.year) &&
    Number.isInteger(date.month) &&
    Number.isInteger(date.day) &&
    date.month >= 1 &&
    date.month <= 12 &&
    date.day >= 1 &&
    date.day <= daysInMonth(date.year, date.month)
  );
}

export function compareCalendarDates(left: CalendarDate, right: CalendarDate): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}

// The calendar day after `date`, across month and year ends.
export function nextCalendarDate(date: CalendarDate): CalendarDate {
  if (date.day < daysInMonth(date.year, date.month)) {
    return { ...date, day: date.day + 1 };
  }

  return date.month < 12
    ? { day: 1, month: date.month + 1, year: date.year }
    : { day: 1, month: 1, year: date.year + 1 };
}

// Keeps a day valid when its month or year changes (31 Jan → Feb gives 28/29).
export function clampCalendarDay(date: CalendarDate): CalendarDate {
  return { ...date, day: Math.min(Math.max(1, date.day), daysInMonth(date.year, date.month)) };
}

export function calendarDateFromLocal(date: Date): CalendarDate {
  return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear() };
}
