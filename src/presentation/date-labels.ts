import type { TimelineBucket } from "../domain/album";

// Household-facing date labels. The Immich client maps responses to domain
// values (ISO dates and numbers); screens format them here.

export const shortMonthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];
export const shortWeekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "Thu 1 Oct 2026" for a bucket starting 2026-10-01; the raw value if it is
// not a recognisable date.
export function formatTimelineBucketLabel(bucket: Pick<TimelineBucket, "timeBucket">): string {
  const value = bucket.timeBucket;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

  if (!match) {
    return value;
  }

  const year = match[1];
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthName = shortMonthNames[month - 1];

  if (!year || !monthName || !Number.isFinite(day)) {
    return value;
  }

  return `${formatShortWeekday(value)} ${day} ${monthName} ${year}`;
}

// The four-digit year a bucket starts in, or "" when unknown.
export function formatTimelineBucketYear(bucket: Pick<TimelineBucket, "timeBucket">): string {
  const match = /^(\d{4})/.exec(bucket.timeBucket);

  return match?.[1] || "";
}

export function formatShortWeekday(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return shortWeekdayNames[date.getUTCDay()] || "";
}
