import { describe, expect, it } from "vitest";
import { getNextGridIndex } from "../navigation/grid-navigation";
import {
  calculateRenderedDateSectionAssetWindow,
  calculateRenderedAssetWindow,
  calculateThumbnailRetentionWindow,
  canApplyAlbumDetail,
  gridRenderRows,
  gridThumbnailRows
} from "./album-assets-window";

describe("album asset windowing", () => {
  it("keeps every row on a 1080p screen rendered with focus on the top or bottom row", () => {
    // 950px of grid area over 258px rows (236px tiles and a 22px gap).
    const rowsOnScreen = Math.ceil(950 / 258);
    const window = calculateRenderedAssetWindow({
      columnCount: 6,
      focusedIndex: 60,
      itemCount: 600,
      rowsAfter: gridRenderRows.after,
      rowsBefore: gridRenderRows.before
    });

    expect(10 - window.startRow).toBeGreaterThanOrEqual(rowsOnScreen);
    expect(window.endRow - 10).toBeGreaterThanOrEqual(rowsOnScreen);
    expect(gridThumbnailRows.before).toBeGreaterThan(gridRenderRows.before);
    expect(gridThumbnailRows.after).toBeGreaterThan(gridRenderRows.after);
  });

  it("renders a bounded row window around the focused logical asset", () => {
    expect(
      calculateRenderedAssetWindow({
        columnCount: 6,
        focusedIndex: 67,
        itemCount: 240,
        rowsAfter: 4,
        rowsBefore: 2
      })
    ).toEqual({
      bottomSpacerRows: 24,
      endIndex: 96,
      endRow: 16,
      startIndex: 54,
      startRow: 9,
      topSpacerRows: 9,
      totalRows: 40
    });
  });

  it("keeps the rendered window bounded for a very large album", () => {
    const window = calculateRenderedAssetWindow({
      columnCount: 6,
      focusedIndex: 50_000,
      itemCount: 100_000,
      rowsAfter: 4,
      rowsBefore: 2
    });

    expect(window.endIndex - window.startIndex).toBeLessThanOrEqual(42);
    expect(window.topSpacerRows).toBeGreaterThan(0);
    expect(window.bottomSpacerRows).toBeGreaterThan(0);
  });

  it("accounts for date headings and section-local asset rows in Photos windows", () => {
    const sectionKeys = [
      "2026-10-14",
      "2026-10-01",
      "2026-10-01",
      "2026-10-01",
      "2026-10-01",
      "2026-10-01",
      "2026-10-01",
      "2026-09-30"
    ];

    expect(
      calculateRenderedDateSectionAssetWindow({
        columnCount: 6,
        focusedIndex: 7,
        getSectionKey: (index) => sectionKeys[index] || "",
        itemCount: sectionKeys.length,
        rowsAfter: 1,
        rowsBefore: 2
      })
    ).toMatchObject({
      bottomSpacerHeadingRows: 0,
      bottomSpacerRows: 0,
      endIndex: 8,
      startIndex: 1,
      topSpacerHeadingRows: 1,
      topSpacerRows: 1,
      totalRows: 6
    });
  });

  it("does not end a Photos render window on an orphan date heading", () => {
    const sectionKeys = [
      "2026-10-14",
      "2026-10-14",
      "2026-10-14",
      "2026-10-14",
      "2026-10-14",
      "2026-10-14",
      "2026-10-01"
    ];

    expect(
      calculateRenderedDateSectionAssetWindow({
        columnCount: 6,
        focusedIndex: 5,
        getSectionKey: (index) => sectionKeys[index] || "",
        itemCount: sectionKeys.length,
        rowsAfter: 1,
        rowsBefore: 0
      })
    ).toMatchObject({
      bottomSpacerHeadingRows: 0,
      bottomSpacerRows: 0,
      endIndex: 7,
      startIndex: 0,
      totalRows: 4
    });
  });

  it("calculates a bounded thumbnail retention window independently from total album size", () => {
    const window = calculateThumbnailRetentionWindow({
      columnCount: 6,
      focusedIndex: 72_000,
      itemCount: 250_000,
      rowsAfter: 5,
      rowsBefore: 3
    });

    expect(window.endIndex - window.startIndex).toBeLessThanOrEqual(54);
  });

  it("handles empty albums without rendering assets", () => {
    expect(
      calculateRenderedAssetWindow({
        columnCount: 6,
        focusedIndex: 0,
        itemCount: 0,
        rowsAfter: 4,
        rowsBefore: 2
      })
    ).toMatchObject({
      endIndex: 0,
      startIndex: 0,
      totalRows: 0
    });
  });

  it("keeps logical navigation correct across virtualized row windows", () => {
    const next = getNextGridIndex({
      columnCount: 6,
      currentIndex: 35,
      direction: "down",
      itemCount: 2_000,
      preferredColumn: 5
    });

    expect(next).toEqual({
      index: 41,
      preferredColumn: 5
    });

    const window = calculateRenderedAssetWindow({
      columnCount: 6,
      focusedIndex: next.index,
      itemCount: 2_000,
      rowsAfter: 4,
      rowsBefore: 2
    });

    expect(window.startIndex).toBeLessThanOrEqual(next.index);
    expect(window.endIndex).toBeGreaterThan(next.index);
  });

  it("preserves the preferred column when moving from a partial final row back upward", () => {
    const down = getNextGridIndex({
      columnCount: 6,
      currentIndex: 10,
      direction: "down",
      itemCount: 16,
      preferredColumn: 4
    });
    const up = getNextGridIndex({
      columnCount: 6,
      currentIndex: down.index,
      direction: "up",
      itemCount: 16,
      preferredColumn: down.preferredColumn
    });

    expect(down).toEqual({
      index: 15,
      preferredColumn: 4
    });
    expect(up).toEqual({
      index: 10,
      preferredColumn: 4
    });
  });

  it("rejects stale album detail results", () => {
    expect(canApplyAlbumDetail(2, 1, false)).toBe(false);
    expect(canApplyAlbumDetail(1, 1, true)).toBe(false);
    expect(canApplyAlbumDetail(1, 1, false)).toBe(true);
  });
});
