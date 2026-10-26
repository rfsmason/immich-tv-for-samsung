import type { TimelineBucket } from "../domain/album";
import type { HoldStep } from "../navigation/hold-accelerator";
import { formatTimelineBucketYear } from "../presentation/date-labels";

export function calculateTimelineRailMarkerIndices(input: {
  buckets: TimelineBucket[];
  focusedIndex: number;
  selectedIndex: number;
  windowRadius?: number;
}): number[] {
  const bucketCount = input.buckets.length;

  if (bucketCount <= 0) {
    return [];
  }

  const windowRadius = input.windowRadius === undefined ? 8 : Math.max(0, input.windowRadius);
  const focusedIndex = clamp(input.focusedIndex, 0, bucketCount - 1);
  const selectedIndex = clamp(input.selectedIndex, 0, bucketCount - 1);
  const indices: Record<string, true> = {};

  addIndex(indices, 0, bucketCount);
  addIndex(indices, bucketCount - 1, bucketCount);
  addIndex(indices, focusedIndex, bucketCount);
  addIndex(indices, selectedIndex, bucketCount);

  for (let offset = -windowRadius; offset <= windowRadius; offset += 1) {
    addIndex(indices, selectedIndex + offset, bucketCount);
  }

  for (let index = 0; index < bucketCount; index += 1) {
    if (isTimelineYearBoundary(input.buckets, index)) {
      addIndex(indices, index, bucketCount);
    }
  }

  return Object.keys(indices)
    .map((index) => Number(index))
    .sort((left, right) => left - right);
}

export function isTimelineYearBoundary(buckets: TimelineBucket[], index: number): boolean {
  const bucket = buckets[index];
  const previous = index > 0 ? buckets[index - 1] : null;

  const year = bucket ? formatTimelineBucketYear(bucket) : "";

  return Boolean(year && year !== (previous ? formatTimelineBucketYear(previous) : ""));
}

// Moves the rail selection in display order: -1 is up the rail, 1 is down. A
// single step moves one bucket; a boundary step moves to the next year
// boundary in that direction, and a skip-boundary step to the one after.
// Stops at the ends of the rail.
export function stepTimelineRailSelection(
  buckets: TimelineBucket[],
  index: number,
  direction: -1 | 1,
  step: HoldStep
): number {
  if (buckets.length === 0) {
    return 0;
  }

  const lastIndex = buckets.length - 1;
  const start = clamp(index, 0, lastIndex);

  if (step === "single") {
    return clamp(start + direction, 0, lastIndex);
  }

  let boundariesLeft = step === "boundary" ? 1 : 2;

  for (let next = start + direction; next >= 0 && next <= lastIndex; next += direction) {
    if (isTimelineYearBoundary(buckets, next)) {
      boundariesLeft -= 1;

      if (boundariesLeft === 0) {
        return next;
      }
    }
  }

  return direction < 0 ? 0 : lastIndex;
}

function addIndex(indices: Record<string, true>, index: number, bucketCount: number): void {
  if (index >= 0 && index < bucketCount) {
    indices[String(index)] = true;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
