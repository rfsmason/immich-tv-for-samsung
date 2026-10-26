import { describe, expect, it } from "vitest";
import type { TimelineBucket } from "../domain/album";
import {
  calculateTimelineRailMarkerIndices,
  stepTimelineRailSelection
} from "./timeline-rail-window";

function bucket(year: number, month: number): TimelineBucket {
  const monthText = String(month).padStart(2, "0");

  return {
    assetCount: 1,
    timeBucket: `${year}-${monthText}-01T00:00:00.000Z`
  };
}

describe("timeline rail window", () => {
  it("keeps a very old monthly timeline bounded while preserving year anchors", () => {
    const buckets: TimelineBucket[] = [];

    for (let year = 2026; year >= 2007; year -= 1) {
      for (let month = 12; month >= 1; month -= 1) {
        buckets.push(bucket(year, month));
      }
    }

    const indices = calculateTimelineRailMarkerIndices({
      buckets,
      focusedIndex: 120,
      selectedIndex: 120,
      windowRadius: 8
    });

    expect(indices.length).toBeLessThan(60);
    expect(indices).toContain(0);
    expect(indices).toContain(120);
    expect(indices).toContain(buckets.length - 1);
    expect(
      indices.filter((index) => buckets[index]?.timeBucket.endsWith("-12-01T00:00:00.000Z")).length
    ).toBe(20);
  });

  describe("stepping the selection", () => {
    // Newest first: 2026-03..2026-01 (0-2), 2025-12..2025-01 (3-14),
    // 2024-12 (15), 2023-06 (16).
    const newestFirst: TimelineBucket[] = [
      bucket(2026, 3),
      bucket(2026, 2),
      bucket(2026, 1),
      ...[12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((month) => bucket(2025, month)),
      bucket(2024, 12),
      bucket(2023, 6)
    ];
    const oldestFirst = newestFirst.slice().reverse();

    it("moves one bucket for a single step and stops at the ends", () => {
      expect(stepTimelineRailSelection(newestFirst, 4, 1, "single")).toBe(5);
      expect(stepTimelineRailSelection(newestFirst, 4, -1, "single")).toBe(3);
      expect(stepTimelineRailSelection(newestFirst, 0, -1, "single")).toBe(0);
      expect(stepTimelineRailSelection(newestFirst, 16, 1, "single")).toBe(16);
    });

    it("moves to the next year boundary in the direction of travel", () => {
      expect(stepTimelineRailSelection(newestFirst, 1, 1, "boundary")).toBe(3);
      expect(stepTimelineRailSelection(newestFirst, 3, 1, "boundary")).toBe(15);
      // Up from mid-year reaches the start of that year as displayed.
      expect(stepTimelineRailSelection(newestFirst, 8, -1, "boundary")).toBe(3);
      expect(stepTimelineRailSelection(newestFirst, 3, -1, "boundary")).toBe(0);
    });

    it("skips one boundary for a skip-boundary step", () => {
      expect(stepTimelineRailSelection(newestFirst, 1, 1, "skip-boundary")).toBe(15);
      expect(stepTimelineRailSelection(newestFirst, 15, -1, "skip-boundary")).toBe(0);
    });

    it("clamps at the ends when no boundary is left", () => {
      expect(stepTimelineRailSelection(newestFirst, 15, 1, "skip-boundary")).toBe(16);
      expect(stepTimelineRailSelection(newestFirst, 16, 1, "boundary")).toBe(16);
      expect(stepTimelineRailSelection(newestFirst, 2, -1, "skip-boundary")).toBe(0);
      expect(stepTimelineRailSelection([], 3, 1, "boundary")).toBe(0);
    });

    it("follows the rail as displayed when it runs oldest first", () => {
      // Oldest first: 2023-06 (0), 2024-12 (1), 2025-01..12 (2-13), 2026-01..03 (14-16).
      expect(stepTimelineRailSelection(oldestFirst, 0, 1, "boundary")).toBe(1);
      expect(stepTimelineRailSelection(oldestFirst, 5, 1, "boundary")).toBe(14);
      expect(stepTimelineRailSelection(oldestFirst, 5, -1, "boundary")).toBe(2);
      expect(stepTimelineRailSelection(oldestFirst, 16, -1, "skip-boundary")).toBe(2);
    });
  });
});
