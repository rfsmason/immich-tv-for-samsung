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

// "Robin Example & Sam Example · 1 Jan 2020 – 31 Dec 2020", or "3 people · From 1 Jan 2020".
export function formatSearchSummary(criteria: SearchCriteria): string {
  const parts: string[] = [];
  const people = criteria.people;

  if (people.length === 1) {
    parts.push(formatPersonName(people[0]!));
  } else if (people.length === 2) {
    parts.push(`${formatPersonName(people[0]!)} & ${formatPersonName(people[1]!)}`);
  } else if (people.length > 2) {
    parts.push(`${people.length} people`);
  }

  const { takenFrom, takenTo } = criteria;

  if (takenFrom && takenTo) {
    parts.push(`${formatCalendarDate(takenFrom)} – ${formatCalendarDate(takenTo)}`);
  } else if (takenFrom) {
    parts.push(`From ${formatCalendarDate(takenFrom)}`);
  } else if (takenTo) {
    parts.push(`Until ${formatCalendarDate(takenTo)}`);
  }

  return parts.join(" · ") || "Search";
}
