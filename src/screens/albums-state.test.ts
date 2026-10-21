import { describe, expect, it } from "vitest";
import {
  calculateRenderedAssetWindow,
  calculateThumbnailRetentionWindow
} from "./album-assets-window";
import { getAlbumStatus } from "./albums-state";

describe("album screen state", () => {
  it("reports an empty album library", () => {
    expect(getAlbumStatus([])).toEqual({
      message: "No albums found in this Immich account.",
      state: "idle"
    });
  });

  it("shows no count once albums have loaded", () => {
    expect(
      getAlbumStatus([
        {
          assetCount: 1,
          id: "album-id",
          name: "Holiday",
          thumbnailAssetId: null
        }
      ])
    ).toEqual({
      message: "",
      state: "success"
    });
  });

  it("keeps album rendering bounded for large album collections", () => {
    const window = calculateRenderedAssetWindow({
      columnCount: 5,
      focusedIndex: 320,
      itemCount: 1_000,
      rowsAfter: 4,
      rowsBefore: 2
    });

    expect(window.endIndex - window.startIndex).toBeLessThanOrEqual(35);
    expect(window.topSpacerRows).toBeGreaterThan(0);
    expect(window.bottomSpacerRows).toBeGreaterThan(0);
  });

  it("keeps album thumbnail retention bounded independently from album count", () => {
    const window = calculateThumbnailRetentionWindow({
      columnCount: 5,
      focusedIndex: 750,
      itemCount: 2_500,
      rowsAfter: 5,
      rowsBefore: 3
    });

    expect(window.endIndex - window.startIndex).toBeLessThanOrEqual(45);
  });
});
