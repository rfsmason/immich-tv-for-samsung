import type { CalendarDate, SearchCriteria } from "../../domain/search";
import { nextCalendarDate } from "../../domain/search";

// Maps search criteria to Immich's structured search filter (ADR 0014).
// Fields in one filter combine as AND. `takenAt` filters the asset's
// fileCreatedAt instant, so a local calendar day becomes the instants from
// this TV's local midnight to the next local midnight.
export function buildSearchCriteriaFilter(criteria: SearchCriteria): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    trashedAt: { eq: null },
    visibility: { eq: "timeline" }
  };

  if (criteria.people.length > 0) {
    filter.personIds = { all: criteria.people.map((person) => person.id) };
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
