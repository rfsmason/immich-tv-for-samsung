import type { CalendarDate, SearchCriteria } from "../domain/search";
import { shortMonthNames } from "./date-labels";
import { formatPersonName } from "./person-labels";

// Household-facing Search wording: UK-order dates ("16 Oct 2026") and short
// summaries of what a search is for.

export const searchPeopleRule = "Photos with all of these people";

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

// "Robin Example & Sam Example · 1 Jan 2020 – 31 Dec 2020", or
// "3 people · From 1 Jan 2020".
export function formatSearchSummary(criteria: SearchCriteria): string {
  const parts = [
    formatSearchPeopleSummary(criteria.people),
    formatSearchTakenSummary(criteria.takenFrom, criteria.takenTo)
  ].filter((part): part is string => part !== null);

  return parts.join(" · ") || "Search";
}
