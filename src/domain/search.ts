// Search criteria as small, explicit filters (ADR 0014). Each criterion is its
// own field; a later criterion (location, media type) adds a field and its
// helpers rather than a generic expression tree. Every operation is pure and
// returns new criteria.

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

export type SearchCriteria = {
  // Every selected person must appear in a result ("all of these people").
  people: SearchPerson[];
  // Inclusive from the start of this local day.
  takenFrom: CalendarDate | null;
  // Inclusive to the end of this local day.
  takenTo: CalendarDate | null;
};

export const maxSearchPeople = 10;

export function emptySearchCriteria(): SearchCriteria {
  return { people: [], takenFrom: null, takenTo: null };
}

export function isEmptyCriteria(criteria: SearchCriteria): boolean {
  return criteria.people.length === 0 && !criteria.takenFrom && !criteria.takenTo;
}

// How many separate criteria are set: people (as one), From and To.
export function countSetCriteria(criteria: SearchCriteria): number {
  return (
    (criteria.people.length > 0 ? 1 : 0) + (criteria.takenFrom ? 1 : 0) + (criteria.takenTo ? 1 : 0)
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
