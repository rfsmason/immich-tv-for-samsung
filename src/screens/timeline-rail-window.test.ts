import { describe, expect, it } from "vitest";
import type { TimelineBucket } from "../domain/album";
import { calculateTimelineRailMarkerIndices } from "./timeline-rail-window";

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
});
