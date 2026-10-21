import { describe, expect, it } from "vitest";
import { getNextGridIndex, isGridRowEnd } from "./grid-navigation";

describe("grid navigation", () => {
  it("moves left and right within a row", () => {
    expect(
      getNextGridIndex({ columnCount: 5, currentIndex: 1, direction: "left", itemCount: 12 })
    ).toEqual({ index: 0, preferredColumn: 0 });
    expect(
      getNextGridIndex({ columnCount: 5, currentIndex: 1, direction: "right", itemCount: 12 })
    ).toEqual({ index: 2, preferredColumn: 2 });
  });

  it("clamps left and right at row boundaries", () => {
    expect(
      getNextGridIndex({ columnCount: 5, currentIndex: 5, direction: "left", itemCount: 12 })
    ).toEqual({ index: 5, preferredColumn: 0 });
    expect(
      getNextGridIndex({ columnCount: 5, currentIndex: 9, direction: "right", itemCount: 12 })
    ).toEqual({ index: 9, preferredColumn: 4 });
  });

  it("moves up and down while preserving the preferred column", () => {
    expect(
      getNextGridIndex({ columnCount: 5, currentIndex: 2, direction: "down", itemCount: 12 })
    ).toEqual({ index: 7, preferredColumn: 2 });
    expect(
      getNextGridIndex({
        columnCount: 5,
        currentIndex: 7,
        direction: "up",
        itemCount: 12,
        preferredColumn: 2
      })
    ).toEqual({ index: 2, preferredColumn: 2 });
  });

  it("uses the nearest available item on a short final row", () => {
    expect(
      getNextGridIndex({
        columnCount: 5,
        currentIndex: 8,
        direction: "down",
        itemCount: 12,
        preferredColumn: 3
      })
    ).toEqual({ index: 11, preferredColumn: 3 });
  });

  it("keeps focus stable when movement is impossible", () => {
    expect(
      getNextGridIndex({ columnCount: 5, currentIndex: 2, direction: "up", itemCount: 12 })
    ).toEqual({ index: 2, preferredColumn: 2 });
  });

  it("detects the right edge of a full row", () => {
    expect(isGridRowEnd({ columnCount: 5, currentIndex: 9, itemCount: 12 })).toBe(true);
    expect(isGridRowEnd({ columnCount: 5, currentIndex: 8, itemCount: 12 })).toBe(false);
  });

  it("detects the right edge of a partial final row", () => {
    expect(isGridRowEnd({ columnCount: 5, currentIndex: 11, itemCount: 12 })).toBe(true);
  });
});
